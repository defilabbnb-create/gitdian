import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Repository, RepositoryAnalysis, RepositoryContent, Favorite } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdaptiveSchedulerService } from '../scheduler/adaptive-scheduler.service';
import { AnalysisOrchestratorService } from './analysis-orchestrator.service';
import { ClaudeReviewService } from './claude-review.service';
import { RepositoryDecisionService } from './repository-decision.service';
import { RepositoryInsightService } from './repository-insight.service';
import { TrainingKnowledgeExportService } from './training-knowledge-export.service';
import {
  assessHistoricalRecoveryBatch,
  buildHistoricalRecoveryMetrics,
  HistoricalRecoveryAssessment,
  HistoricalRecoveryMetrics,
  HistoricalRecoveryPriority,
  HistoricalRecoverySignal,
  HistoricalRecoveryStage,
} from './helpers/historical-data-recovery.helper';

export type { HistoricalRecoveryPriority } from './helpers/historical-data-recovery.helper';

const AUDIT_CONFIG_KEY = 'analysis.historical_recovery.audit.latest';
const RUN_CONFIG_KEY = 'analysis.historical_recovery.run.latest';

type RepositoryRecoveryTarget = Repository & {
  analysis: RepositoryAnalysis | null;
  content: RepositoryContent | null;
  favorite: Favorite | null;
};

type RecoverySummarySample = {
  repoId: string;
  fullName: string;
  htmlUrl: string;
  priority: HistoricalRecoveryPriority;
  stages: HistoricalRecoveryStage[];
  issues: string[];
  oneLinerZh: string;
  source: string | null;
};

export type HistoricalRecoveryScanOptions = {
  limit?: number;
  priority?: HistoricalRecoveryPriority | null;
  onlyConflicts?: boolean;
  onlyFeatured?: boolean;
  onlyFallback?: boolean;
  onlyIncomplete?: boolean;
};

export type HistoricalRecoveryRunOptions = HistoricalRecoveryScanOptions & {
  dryRun?: boolean;
  exportTrainingSamples?: boolean;
  outputDir?: string;
  mode?:
    | 'run_recovery'
    | 'repair_display_only'
    | 'rerun_light_analysis'
    | 'rerun_full_deep'
    | 'queue_claude_review';
};

export type HistoricalRecoveryAuditResult = {
  scannedAt: string;
  scannedCount: number;
  metrics: HistoricalRecoveryMetrics;
  priorityCounts: Record<HistoricalRecoveryPriority, number>;
  topSamples: {
    badOneLiners: RecoverySummarySample[];
    conflicts: RecoverySummarySample[];
    fallback: RecoverySummarySample[];
    incomplete: RecoverySummarySample[];
    claudeConflicts: RecoverySummarySample[];
  };
  items: HistoricalRecoveryAssessment[];
};

export type HistoricalRecoveryRunResult = {
  scannedAt: string;
  dryRun: boolean;
  selectedCount: number;
  metrics: HistoricalRecoveryMetrics;
  stageCounts: Record<HistoricalRecoveryStage, number>;
  selected: RecoverySummarySample[];
  execution: {
    rerunLightAnalysis: number;
    rerunDeepAnalysis: number;
    claudeQueued: number;
  };
  trainingExport: Awaited<
    ReturnType<TrainingKnowledgeExportService['exportKnowledgeAssets']>
  > | null;
};

@Injectable()
export class HistoricalDataRecoveryService {
  private readonly logger = new Logger(HistoricalDataRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repositoryDecisionService: RepositoryDecisionService,
    private readonly repositoryInsightService: RepositoryInsightService,
    private readonly analysisOrchestratorService: AnalysisOrchestratorService,
    private readonly claudeReviewService: ClaudeReviewService,
    private readonly trainingKnowledgeExportService: TrainingKnowledgeExportService,
    private readonly adaptiveSchedulerService: AdaptiveSchedulerService,
  ) {}

  async scanOldBadRecords(
    options?: HistoricalRecoveryScanOptions,
  ): Promise<HistoricalRecoveryAuditResult> {
    const scannedAt = new Date().toISOString();
    const exposureSets = await this.loadExposureSets();
    const repositories = await this.loadRepositories();
    const auditSnapshot =
      await this.repositoryDecisionService.getLatestAuditSnapshot();
    const derived =
      this.repositoryDecisionService.attachDerivedAssetsWithAudit(
        repositories as unknown as Record<string, unknown>[],
        auditSnapshot,
      ) as Array<Record<string, unknown>>;
    const assessments = assessHistoricalRecoveryBatch(
      derived.map((repository) => this.toRecoverySignal(repository, exposureSets)),
    );
    const filtered = await this.filterAssessments(assessments, options);
    const selected =
      options?.limit && options.limit > 0
        ? filtered.slice(0, options.limit)
        : filtered;
    const metrics = buildHistoricalRecoveryMetrics(filtered);

    const result: HistoricalRecoveryAuditResult = {
      scannedAt,
      scannedCount: filtered.length,
      metrics,
      priorityCounts: metrics.priorityCounts,
      topSamples: {
        badOneLiners: this.pickSamples(
          filtered.filter((item) => item.metrics.badOneliner),
        ),
        conflicts: this.pickSamples(
          filtered.filter(
            (item) =>
              item.metrics.headlineUserConflict ||
              item.metrics.headlineCategoryConflict ||
              item.metrics.monetizationOverclaim,
          ),
        ),
        fallback: this.pickSamples(
          filtered.filter((item) => item.metrics.fallbackVisible),
        ),
        incomplete: this.pickSamples(
          filtered.filter((item) => item.metrics.incompleteAnalysisVisible),
        ),
        claudeConflicts: this.pickSamples(
          filtered.filter((item) => item.metrics.claudeConflict),
        ),
      },
      items: selected,
    };

    await this.saveSystemConfig(AUDIT_CONFIG_KEY, {
      scannedAt,
      scannedCount: result.scannedCount,
      metrics: result.metrics,
      priorityCounts: result.priorityCounts,
      topSamples: result.topSamples,
    });
    this.logger.log(
      `historical_data_recovery scan completed scanned=${result.scannedCount} p0=${result.priorityCounts.P0} p1=${result.priorityCounts.P1} p2=${result.priorityCounts.P2}`,
    );

    return result;
  }

  async rerunLightAnalysis(repositoryIds: string[]) {
    let count = 0;
    for (const repositoryId of repositoryIds) {
      await this.repositoryInsightService.refreshInsight(repositoryId);
      count += 1;
    }
    return count;
  }

  async rerunDeepAnalysis(repositoryIds: string[]) {
    let count = 0;
    for (const repositoryId of repositoryIds) {
      const repository = await this.prisma.repository.findUnique({
        where: { id: repositoryId },
        include: {
          analysis: true,
        },
      });

      if (!repository) {
        continue;
      }

      await this.analysisOrchestratorService.runRepositoryAnalysisDirect(
        repositoryId,
        {
          runFastFilter: false,
          runCompleteness: !repository.analysis?.completenessJson,
          runIdeaFit: !repository.analysis?.ideaFitJson,
          runIdeaExtract: !repository.analysis?.extractedIdeaJson,
          forceRerun: false,
        },
      );
      count += 1;
    }

    return count;
  }

  async queueClaudeReview(repositoryIds: string[]) {
    if (!repositoryIds.length) {
      return 0;
    }

    const result = await this.claudeReviewService.reviewRepositoryIds(
      repositoryIds,
      {
        forceRefresh: true,
        source: 'replay',
        maxPerRun: repositoryIds.length,
      },
    );

    return result.results.filter((item) => item.status === 'reviewed').length;
  }

  async exportTrainingSamples(options?: {
    sampleSize?: number;
    outputDir?: string;
    includeFullNames?: string[];
  }) {
    return this.trainingKnowledgeExportService.exportKnowledgeAssets({
      sampleSize: options?.sampleSize,
      outputDir: options?.outputDir,
      includeFullNames: options?.includeFullNames,
    });
  }

  async runRecovery(
    options?: HistoricalRecoveryRunOptions,
  ): Promise<HistoricalRecoveryRunResult> {
    const audit = await this.scanOldBadRecords(options);
    const selected = audit.items.slice(
      0,
      Math.max(1, Math.min(options?.limit ?? audit.items.length, audit.items.length)),
    );
    const stageCounts: Record<HistoricalRecoveryStage, number> = {
      L0: selected.filter((item) => item.stages.includes('L0')).length,
      L1: selected.filter((item) => item.stages.includes('L1')).length,
      L2: selected.filter((item) => item.stages.includes('L2')).length,
      L3: selected.filter((item) => item.stages.includes('L3')).length,
    };

    if (options?.dryRun !== false) {
      const dryRunResult: HistoricalRecoveryRunResult = {
        scannedAt: audit.scannedAt,
        dryRun: true,
        selectedCount: selected.length,
        metrics: audit.metrics,
        stageCounts,
        selected: this.pickSamples(selected, selected.length),
        execution: {
          rerunLightAnalysis: 0,
          rerunDeepAnalysis: 0,
          claudeQueued: 0,
        },
        trainingExport: null,
      };

      await this.saveSystemConfig(RUN_CONFIG_KEY, dryRunResult);
      return dryRunResult;
    }

    const mode = options?.mode ?? 'run_recovery';
    const lightIds = this.selectRepositoryIdsByMode(selected, mode, 'L1');
    const deepIds = this.selectRepositoryIdsByMode(selected, mode, 'L2');
    const claudeIds = this.selectRepositoryIdsByMode(selected, mode, 'L3');

    const rerunLightAnalysis = await this.rerunLightAnalysis(lightIds);
    const rerunDeepAnalysis = await this.rerunDeepAnalysis(deepIds);
    const claudeQueued = await this.queueClaudeReview(claudeIds);
    const trainingExport = options?.exportTrainingSamples
      ? await this.exportTrainingSamples({
          sampleSize: Math.max(40, Math.min(selected.length * 3, 240)),
          outputDir: options.outputDir,
          includeFullNames: selected.map((item) => item.fullName),
        })
      : null;

    const result: HistoricalRecoveryRunResult = {
      scannedAt: audit.scannedAt,
      dryRun: false,
      selectedCount: selected.length,
      metrics: audit.metrics,
      stageCounts,
      selected: this.pickSamples(selected, selected.length),
      execution: {
        rerunLightAnalysis,
        rerunDeepAnalysis,
        claudeQueued,
      },
      trainingExport,
    };

    await this.saveSystemConfig(RUN_CONFIG_KEY, result);
    this.logger.log(
      `historical_data_recovery run completed selected=${selected.length} l1=${rerunLightAnalysis} l2=${rerunDeepAnalysis} l3=${claudeQueued}`,
    );

    return result;
  }

  private async loadRepositories() {
    const batchSize = 200;
    const repositories: RepositoryRecoveryTarget[] = [];
    let cursorId: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const batch: RepositoryRecoveryTarget[] = await this.prisma.repository.findMany({
        ...(cursorId
          ? {
              cursor: { id: cursorId },
              skip: 1,
            }
          : {}),
        orderBy: {
          id: 'asc',
        },
        take: batchSize,
        include: {
          analysis: true,
          content: true,
          favorite: true,
        },
      });

      if (!batch.length) {
        break;
      }

      repositories.push(...batch);

      cursorId = batch[batch.length - 1]?.id ?? null;
      if (!cursorId) {
        hasMore = false;
      }
    }

    return repositories;
  }

  private async loadExposureSets() {
    const summaries = await this.prisma.dailyRadarSummary.findMany({
      orderBy: {
        date: 'desc',
      },
      take: 14,
      select: {
        topRepositoryIds: true,
        topGoodRepositoryIds: true,
        topCloneRepositoryIds: true,
        topIgnoredRepositoryIds: true,
        telegramSendStatus: true,
      },
    });

    const homepageIds = new Set<string>();
    const dailySummaryIds = new Set<string>();
    const telegramIds = new Set<string>();

    for (const summary of summaries) {
      const topIds = this.readStringArray(summary.topRepositoryIds);
      const goodIds = this.readStringArray(summary.topGoodRepositoryIds);
      const cloneIds = this.readStringArray(summary.topCloneRepositoryIds);
      const ignoredIds = this.readStringArray(summary.topIgnoredRepositoryIds);
      const allIds = [...topIds, ...goodIds, ...cloneIds, ...ignoredIds];

      for (const repositoryId of allIds) {
        dailySummaryIds.add(repositoryId);
      }
      for (const repositoryId of [...topIds, ...goodIds, ...cloneIds]) {
        homepageIds.add(repositoryId);
      }
      if (summary.telegramSendStatus === 'SENT') {
        for (const repositoryId of allIds) {
          telegramIds.add(repositoryId);
        }
      }
    }

    return {
      homepageIds,
      dailySummaryIds,
      telegramIds,
    };
  }

  private toRecoverySignal(
    repository: Record<string, unknown>,
    exposureSets: {
      homepageIds: Set<string>;
      dailySummaryIds: Set<string>;
      telegramIds: Set<string>;
    },
  ): HistoricalRecoverySignal {
    const analysis = this.readObject(repository.analysis);
    const finalDecision = this.readObject(repository.finalDecision);
    const moneyDecision = this.readObject(finalDecision?.moneyDecision);
    const trainingAsset = this.readObject(repository.trainingAsset);
    const snapshot = this.readObject(analysis?.ideaSnapshotJson);
    const insight = this.readObject(analysis?.insightJson);
    const categoryDisplay = this.readObject(insight?.categoryDisplay);
    const repositoryId = this.readString(repository.id);

    return {
      repoId: repositoryId,
      fullName: this.readString(repository.fullName),
      htmlUrl: this.readString(repository.htmlUrl),
      oneLinerZh:
        this.readString(finalDecision?.oneLinerZh) ||
        this.readString(insight?.oneLinerZh) ||
        this.readString(snapshot?.oneLinerZh) ||
        this.readString(repository.description) ||
        this.readString(repository.fullName),
      description: this.readOptionalString(repository.description),
      repoName: this.readOptionalString(repository.name),
      updatedAt:
        this.readOptionalString(repository.updatedAtGithub) ||
        this.readOptionalString(repository.updatedAt) ||
        null,
      projectType:
        this.normalizeProjectType(finalDecision?.projectType) ??
        this.normalizeProjectType(this.readObject(insight?.projectReality)?.type) ??
        null,
      category:
        this.readOptionalString(finalDecision?.categoryLabelZh) ||
        this.readOptionalString(finalDecision?.category) ||
        this.readOptionalString(categoryDisplay?.label) ||
        null,
      hasRealUser: this.readOptionalBoolean(
        this.readObject(insight?.projectReality)?.hasRealUser,
      ),
      hasClearUseCase: this.readOptionalBoolean(
        this.readObject(insight?.projectReality)?.hasClearUseCase,
      ),
      isDirectlyMonetizable: this.readOptionalBoolean(
        this.readObject(insight?.projectReality)?.isDirectlyMonetizable,
      ),
      verdict: this.normalizeVerdict(finalDecision?.verdict),
      action:
        this.normalizeAction(finalDecision?.action) ??
        this.normalizeAction(snapshot?.nextAction) ??
        null,
      priority: this.normalizePriority(finalDecision?.moneyPriority),
      source: this.normalizeSource(finalDecision?.source),
      strength: this.normalizeStrength(finalDecision?.oneLinerStrength),
      targetUsersLabel: this.readOptionalString(moneyDecision?.targetUsersZh),
      monetizationLabel: this.readOptionalString(moneyDecision?.monetizationSummaryZh),
      whyLabel:
        this.readOptionalString(finalDecision?.reasonZh) ||
        this.readOptionalString(moneyDecision?.reasonZh) ||
        this.readOptionalString(snapshot?.reason) ||
        null,
      snapshotPromising: this.readOptionalBoolean(snapshot?.isPromising),
      snapshotNextAction: this.readOptionalString(snapshot?.nextAction),
      fallbackUsed: this.readOptionalBoolean(analysis?.fallbackUsed) === true,
      hasSnapshot: Boolean(snapshot),
      hasInsight: Boolean(insight),
      hasFinalDecision: Boolean(finalDecision),
      hasIdeaFit: Boolean(analysis?.ideaFitJson),
      hasIdeaExtract: Boolean(analysis?.extractedIdeaJson),
      hasCompleteness: Boolean(analysis?.completenessJson),
      hasClaudeReview: Boolean(analysis?.claudeReviewJson),
      hasConflict: this.readOptionalBoolean(finalDecision?.hasConflict) === true,
      needsRecheck: this.readOptionalBoolean(finalDecision?.needsRecheck) === true,
      isFavorited: this.readOptionalBoolean(repository.isFavorited) === true,
      favoritePriority: this.normalizeFavoritePriority(
        this.readObject(repository.favorite)?.priority,
      ),
      appearedOnHomepage: exposureSets.homepageIds.has(repositoryId),
      appearedInDailySummary: exposureSets.dailySummaryIds.has(repositoryId),
      appearedInTelegram: exposureSets.telegramIds.has(repositoryId),
      claudeDiffTypes: this.readStringArray(trainingAsset?.diffTypes),
      claudeMistakeTypes: this.readStringArray(trainingAsset?.mistakeTypes),
    };
  }

  private async filterAssessments(
    items: HistoricalRecoveryAssessment[],
    options?: HistoricalRecoveryScanOptions,
  ) {
    const filtered = items
      .filter((item) =>
        options?.priority ? item.priority === options.priority : true,
      )
      .filter((item) =>
        options?.onlyConflicts ? item.metrics.claudeConflict : true,
      )
      .filter((item) =>
        options?.onlyFeatured ? item.metrics.homepageBadCard : true,
      )
      .filter((item) =>
        options?.onlyFallback ? item.metrics.fallbackVisible : true,
      )
      .filter((item) =>
        options?.onlyIncomplete ? item.metrics.incompleteAnalysisVisible : true,
      )
      .sort((left, right) => this.rankAssessment(left) - this.rankAssessment(right));

    return this.adaptiveSchedulerService.prioritizeRecoveryAssessments(filtered);
  }

  private rankAssessment(item: HistoricalRecoveryAssessment) {
    const priorityRank = item.priority === 'P0' ? 0 : item.priority === 'P1' ? 1 : 2;
    const severityRank = item.severe ? 0 : 1;
    return priorityRank * 10 + severityRank;
  }

  private selectRepositoryIdsByMode(
    items: HistoricalRecoveryAssessment[],
    mode:
      | 'run_recovery'
      | 'repair_display_only'
      | 'rerun_light_analysis'
      | 'rerun_full_deep'
      | 'queue_claude_review',
    stage: HistoricalRecoveryStage,
  ) {
    if (mode === 'repair_display_only') {
      return stage === 'L0' || stage === 'L1'
        ? items
            .filter((item) => item.stages.includes('L1'))
            .map((item) => item.repoId)
        : [];
    }

    if (mode === 'rerun_light_analysis') {
      return stage === 'L1'
        ? items
            .filter((item) => item.stages.includes('L1'))
            .map((item) => item.repoId)
        : [];
    }

    if (mode === 'rerun_full_deep') {
      return stage === 'L2'
        ? items
            .filter((item) => item.stages.includes('L2'))
            .map((item) => item.repoId)
        : [];
    }

    if (mode === 'queue_claude_review') {
      return stage === 'L3'
        ? items
            .filter((item) => item.stages.includes('L3'))
            .map((item) => item.repoId)
        : [];
    }

    return items
      .filter((item) => item.stages.includes(stage))
      .map((item) => item.repoId);
  }

  private pickSamples(items: HistoricalRecoveryAssessment[], limit = 6) {
    return items.slice(0, limit).map((item) => ({
      repoId: item.repoId,
      fullName: item.fullName,
      htmlUrl: item.htmlUrl,
      priority: item.priority,
      stages: item.stages,
      issues: item.issues.map((issue) => issue.type),
      oneLinerZh: item.validator.sanitized,
      source: item.validator.riskFlags.includes('fallback_overclaim') ? 'fallback' : null,
    }));
  }

  private async saveSystemConfig(configKey: string, value: unknown) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey,
      },
      update: {
        configValue: value as Prisma.InputJsonValue,
      },
      create: {
        configKey,
        configValue: value as Prisma.InputJsonValue,
      },
    });
  }

  private readObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readString(value: unknown) {
    return String(value ?? '').trim();
  }

  private readOptionalString(value: unknown) {
    const normalized = this.readString(value);
    return normalized || null;
  }

  private readOptionalBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return null;
  }

  private readStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.readString(item))
      .filter(Boolean);
  }

  private normalizeProjectType(value: unknown) {
    const normalized = this.readString(value).toLowerCase();
    if (
      normalized === 'product' ||
      normalized === 'tool' ||
      normalized === 'model' ||
      normalized === 'infra' ||
      normalized === 'demo'
    ) {
      return normalized as HistoricalRecoverySignal['projectType'];
    }

    return null;
  }

  private normalizeVerdict(value: unknown) {
    const normalized = this.readString(value).toUpperCase();
    if (normalized === 'GOOD' || normalized === 'OK' || normalized === 'BAD') {
      return normalized as HistoricalRecoverySignal['verdict'];
    }

    return null;
  }

  private normalizeAction(value: unknown) {
    const normalized = this.readString(value).toUpperCase();
    if (
      normalized === 'BUILD' ||
      normalized === 'CLONE' ||
      normalized === 'IGNORE' ||
      normalized === 'SKIP'
    ) {
      return normalized as HistoricalRecoverySignal['action'];
    }

    return null;
  }

  private normalizePriority(value: unknown) {
    const normalized = this.readString(value).toUpperCase();
    if (normalized === 'P0' || normalized === 'P1' || normalized === 'P2' || normalized === 'P3') {
      return normalized as HistoricalRecoverySignal['priority'];
    }

    return null;
  }

  private normalizeSource(value: unknown) {
    const normalized = this.readString(value).toLowerCase();
    if (
      normalized === 'manual' ||
      normalized === 'claude' ||
      normalized === 'local' ||
      normalized === 'fallback'
    ) {
      return normalized as HistoricalRecoverySignal['source'];
    }

    return null;
  }

  private normalizeStrength(value: unknown) {
    const normalized = this.readString(value).toUpperCase();
    if (normalized === 'STRONG' || normalized === 'MEDIUM' || normalized === 'WEAK') {
      return normalized as HistoricalRecoverySignal['strength'];
    }

    return null;
  }

  private normalizeFavoritePriority(value: unknown) {
    const normalized = this.readString(value).toUpperCase();
    if (normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'HIGH') {
      return normalized as HistoricalRecoverySignal['favoritePriority'];
    }

    return null;
  }
}
