import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AnthropicProvider,
} from '../ai/providers/anthropic.provider';
import { ClaudeConcurrencyService } from './claude-concurrency.service';
import {
  ClaudeReviewDiffService,
  ClaudeReviewDiffSummary,
} from './claude-review-diff.service';
import { CLAUDE_ROLE_DEFINITION } from './claude-role-definition';
import {
  ClaudeTrainingHintsAggregate,
  ClaudeTrainingHintsService,
} from './claude-training-hints.service';
import {
  buildClaudeQualityAuditPrompt,
  CLAUDE_QUALITY_AUDIT_PROMPT_VERSION,
} from './prompts/claude-quality-audit.prompt';

type AuditSource = 'manual' | 'scheduler';
type AuditBiasDirection = 'too_optimistic' | 'too_conservative' | 'balanced';
type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
type AuditCollectionName =
  | 'recent_good'
  | 'recent_clone'
  | 'recent_top_candidates'
  | 'recent_local_fallback'
  | 'recent_daily_summary_top';
type AuditPriority = 'P0' | 'P1' | 'P2';
type InsightVerdict = 'GOOD' | 'OK' | 'BAD';
type InsightAction = 'BUILD' | 'CLONE' | 'IGNORE';

type AuditRepositorySnapshot = {
  collection: AuditCollectionName;
  repositoryId: string;
  fullName: string;
  htmlUrl: string;
  stars: number;
  oneLinerZh: string;
  currentVerdict: InsightVerdict | null;
  currentAction: InsightAction | null;
  decisionSource:
    | 'manual_override'
    | 'claude_review'
    | 'local_fallback'
    | 'insight'
    | 'snapshot_fallback';
  localVerdict: InsightVerdict | null;
  localAction: InsightAction | null;
  localConfidence: number | null;
  localProjectType: string | null;
  anchorMatch: string | null;
  claudeVerdict: InsightVerdict | null;
  claudeAction: InsightAction | null;
  claudeGeneratedBy: string | null;
  needsClaudeReview: boolean;
  trainingHintMistakes: string[];
  reviewDiffTypes: string[];
  enteredTopCandidate: boolean;
  enteredTelegramTop: boolean;
  hasManualOverride: boolean;
  looksTemplateOrDemo: boolean;
  looksCapabilityLike: boolean;
};

type AuditCollectionFinding = {
  collection: AuditCollectionName;
  bias: AuditBiasDirection;
  summary: string;
};

type AuditProblemExample = {
  repositoryId: string;
  fullName: string;
  currentVerdict: InsightVerdict | null;
  currentAction: InsightAction | null;
  suggestedVerdict: InsightVerdict | null;
  suggestedAction: InsightAction | null;
  reason: string;
};

type AuditProblemType = {
  type: string;
  count: number;
  examples: AuditProblemExample[];
};

type AuditRecommendedAction = {
  priority: AuditPriority;
  action: string;
  reason: string;
};

type ClaudeAuditReport = {
  auditedAt: string;
  source: AuditSource;
  promptVersion: string;
  severity: AuditSeverity;
  summary: string;
  highPriorityHeadline: string | null;
  overallBias: {
    direction: AuditBiasDirection;
    reason: string;
  };
  collectionFindings: AuditCollectionFinding[];
  problemTypes: AuditProblemType[];
  suggestions: string[];
  fallbackGapSummary: string | null;
  repositoriesNeedingReview: string[];
  needsRecompute: string[];
  needsPromptAdjustment: boolean;
  needsHeuristicAdjustment: boolean;
  recommendedActions: AuditRecommendedAction[];
  sampledCollections: Record<
    AuditCollectionName,
    {
      count: number;
      repositoryIds: string[];
    }
  >;
  reviewDiffSummary: ClaudeReviewDiffSummary | null;
  trainingHintsSummary: ClaudeTrainingHintsAggregate | null;
  roleDefinition: typeof CLAUDE_ROLE_DEFINITION;
};

type ClaudeAuditRuntimeState = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  runCount: number;
  lastSource: AuditSource | null;
};

type AuditInputPayload = {
  generatedAt: string;
  roleDefinition: typeof CLAUDE_ROLE_DEFINITION;
  collections: Record<
    AuditCollectionName,
    {
      count: number;
      repositories: AuditRepositorySnapshot[];
    }
  >;
  reviewDiffSummary: ClaudeReviewDiffSummary | null;
  trainingHintsSummary: ClaudeTrainingHintsAggregate | null;
};

type AuditRepositoryTarget = Prisma.RepositoryGetPayload<{
  include: {
    analysis: true;
  };
}>;

const CLAUDE_AUDIT_LATEST_CONFIG_KEY = 'claude.audit.latest';
const CLAUDE_AUDIT_RUNTIME_CONFIG_KEY = 'claude.audit.runtime_state';

@Injectable()
export class ClaudeAuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClaudeAuditService.name);
  private auditTimer: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly claudeConcurrencyService: ClaudeConcurrencyService,
    private readonly claudeReviewDiffService: ClaudeReviewDiffService,
    private readonly claudeTrainingHintsService: ClaudeTrainingHintsService,
  ) {}

  onModuleInit() {
    if (
      process.env.ENABLE_QUEUE_WORKERS !== 'true' ||
      !this.isEnabled() ||
      !this.isConfigured()
    ) {
      return;
    }

    this.auditTimer = setInterval(() => {
      void this.maybeRunScheduledAudit();
    }, this.readInt('CLAUDE_AUDIT_INTERVAL_MS', 6 * 60 * 60 * 1_000));

    void this.maybeRunScheduledAudit();
  }

  onModuleDestroy() {
    if (this.auditTimer) {
      clearInterval(this.auditTimer);
      this.auditTimer = null;
    }
  }

  isEnabled() {
    return (
      this.anthropicProvider.isEnabled() &&
      this.readBoolean('CLAUDE_AUDIT_ENABLED', true)
    );
  }

  isConfigured() {
    return this.anthropicProvider.isConfigured();
  }

  async runAudit(options?: {
    source?: AuditSource;
    force?: boolean;
  }): Promise<ClaudeAuditReport> {
    if (!this.isEnabled()) {
      throw new Error('Claude audit is not enabled.');
    }

    if (!this.isConfigured()) {
      throw new Error('Claude audit is not configured.');
    }

    const claudeRuntimeState = await this.claudeConcurrencyService.getRuntimeState();
    if (claudeRuntimeState.mode === 'FALLBACK') {
      throw new Error('Claude audit is unavailable while Claude is in FALLBACK mode.');
    }

    const payload = await this.collectAuditInput();
    const prompt = buildClaudeQualityAuditPrompt(payload);
    const execution = await this.claudeConcurrencyService.generateJson<ClaudeAuditReport>(
      {
        prompt: prompt.prompt,
        systemPrompt: prompt.systemPrompt,
        schemaHint: prompt.schemaHint,
      },
      {
        priority: 'P0',
        allowSkip: false,
      },
    );

    if (execution.status === 'skipped') {
      throw new Error(`Claude audit skipped: ${execution.reason}`);
    }

    const report = this.normalizeAuditReport(
      execution.result.data,
      options?.source ?? 'manual',
      payload,
    );

    await Promise.all([
      this.saveLatestAudit(report),
      this.saveRuntimeState({
        ...(await this.getRuntimeState()),
        lastRunAt: report.auditedAt,
        lastSuccessAt: report.auditedAt,
        lastError: null,
        runCount: (await this.getRuntimeState()).runCount + 1,
        lastSource: report.source,
      }),
    ]);

    this.logger.log(
      `claude_audit completed source=${report.source} severity=${report.severity} summary=${this.cleanText(report.summary, 140)}`,
    );

    return report;
  }

  async getLatestAudit() {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: CLAUDE_AUDIT_LATEST_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object' || Array.isArray(row.configValue)) {
      return null;
    }

    return row.configValue as unknown as ClaudeAuditReport;
  }

  async getLatestAuditBrief() {
    const latest = await this.getLatestAudit();
    if (!latest) {
      return null;
    }

    return {
      auditedAt: latest.auditedAt,
      severity: latest.severity,
      summary: latest.summary,
      headline: latest.highPriorityHeadline,
      overallBias: latest.overallBias.direction,
      repositoriesNeedingReviewCount: latest.repositoriesNeedingReview.length,
    };
  }

  private async maybeRunScheduledAudit() {
    if (this.tickInFlight || !this.isEnabled() || !this.isConfigured()) {
      return;
    }

    const runtimeState = await this.getRuntimeState();
    const intervalMs = this.readInt('CLAUDE_AUDIT_INTERVAL_MS', 6 * 60 * 60 * 1_000);
    const lastSuccessAt = this.toTimestamp(runtimeState.lastSuccessAt);
    if (Date.now() - lastSuccessAt < intervalMs) {
      return;
    }

    this.tickInFlight = true;

    try {
      await this.runAudit({
        source: 'scheduler',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Claude audit error.';

      await this.saveRuntimeState({
        ...runtimeState,
        lastRunAt: new Date().toISOString(),
        lastError: this.cleanText(message, 300),
        runCount: runtimeState.runCount + 1,
        lastSource: 'scheduler',
      });

      this.logger.warn(`claude_audit scheduler failed: ${message}`);
    } finally {
      this.tickInFlight = false;
    }
  }

  private async collectAuditInput(): Promise<AuditInputPayload> {
    const sampleSize = Math.max(10, Math.min(this.readInt('CLAUDE_AUDIT_SAMPLE_SIZE', 50), 50));
    const recentSummaries = await this.prisma.dailyRadarSummary.findMany({
      orderBy: {
        date: 'desc',
      },
      take: 10,
      select: {
        topRepositoryIds: true,
        topGoodRepositoryIds: true,
        topCloneRepositoryIds: true,
        telegramSendStatus: true,
      },
    });
    const topCandidateIds = this.takeUniqueIds(
      recentSummaries.flatMap((summary) => [
        ...this.readStringArray(summary.topRepositoryIds),
        ...this.readStringArray(summary.topGoodRepositoryIds),
        ...this.readStringArray(summary.topCloneRepositoryIds),
      ]),
      sampleSize,
    );
    const telegramTopIds = this.takeUniqueIds(
      recentSummaries
        .filter((summary) => summary.telegramSendStatus === 'SENT')
        .flatMap((summary) => [
          ...this.readStringArray(summary.topRepositoryIds),
          ...this.readStringArray(summary.topGoodRepositoryIds),
          ...this.readStringArray(summary.topCloneRepositoryIds),
        ]),
      sampleSize,
    );

    const recentRepositories = await this.prisma.repository.findMany({
      where: {
        analysis: {
          isNot: null,
        },
      },
      include: {
        analysis: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 400,
    });
    const repositoryMap = new Map(
      recentRepositories.map((repository) => [repository.id, repository] as const),
    );
    const topRepositories = await this.loadMissingRepositories(
      [...topCandidateIds, ...telegramTopIds],
      repositoryMap,
    );
    for (const repository of topRepositories) {
      repositoryMap.set(repository.id, repository);
    }

    const fallbackAnalyses = await this.prisma.repositoryAnalysis.findMany({
      where: {
        claudeReviewStatus: 'SUCCESS',
        claudeReviewReviewedAt: {
          not: null,
        },
      },
      select: {
        repositoryId: true,
        claudeReviewJson: true,
      },
      orderBy: {
        claudeReviewReviewedAt: 'desc',
      },
      take: 300,
    });
    const fallbackIds = this.takeUniqueIds(
      fallbackAnalyses
        .filter((analysis) => {
          const review = this.readJsonObject(analysis.claudeReviewJson);
          return (
            this.cleanText(review?.generatedBy, 40) === 'local_fallback' &&
            Boolean(review?.needsClaudeReview)
          );
        })
        .map((analysis) => analysis.repositoryId),
      sampleSize,
    );
    const fallbackRepositories = await this.loadMissingRepositories(
      fallbackIds,
      repositoryMap,
    );
    for (const repository of fallbackRepositories) {
      repositoryMap.set(repository.id, repository);
    }

    const recentGood = recentRepositories
      .map((repository) =>
        this.toAuditRepositorySnapshot(repository, 'recent_good', {
          topCandidateIds: new Set(topCandidateIds),
          telegramTopIds: new Set(telegramTopIds),
        }),
      )
      .filter((item) => item.currentVerdict === 'GOOD')
      .slice(0, sampleSize);
    const recentClone = recentRepositories
      .map((repository) =>
        this.toAuditRepositorySnapshot(repository, 'recent_clone', {
          topCandidateIds: new Set(topCandidateIds),
          telegramTopIds: new Set(telegramTopIds),
        }),
      )
      .filter((item) => item.currentAction === 'CLONE')
      .slice(0, sampleSize);
    const recentTopCandidates = topCandidateIds
      .map((repositoryId) => repositoryMap.get(repositoryId) ?? null)
      .filter((item): item is AuditRepositoryTarget => item !== null)
      .map((repository) =>
        this.toAuditRepositorySnapshot(repository, 'recent_top_candidates', {
          topCandidateIds: new Set(topCandidateIds),
          telegramTopIds: new Set(telegramTopIds),
        }),
      )
      .slice(0, sampleSize);
    const recentLocalFallback = fallbackIds
      .map((repositoryId) => repositoryMap.get(repositoryId) ?? null)
      .filter((item): item is AuditRepositoryTarget => item !== null)
      .map((repository) =>
        this.toAuditRepositorySnapshot(repository, 'recent_local_fallback', {
          topCandidateIds: new Set(topCandidateIds),
          telegramTopIds: new Set(telegramTopIds),
        }),
      )
      .slice(0, sampleSize);
    const recentDailySummaryTop = telegramTopIds
      .map((repositoryId) => repositoryMap.get(repositoryId) ?? null)
      .filter((item): item is AuditRepositoryTarget => item !== null)
      .map((repository) =>
        this.toAuditRepositorySnapshot(repository, 'recent_daily_summary_top', {
          topCandidateIds: new Set(topCandidateIds),
          telegramTopIds: new Set(telegramTopIds),
        }),
      )
      .slice(0, sampleSize);
    const reviewDiffSummary = await this.claudeReviewDiffService.summarizeRecentDiffs(
      Math.max(sampleSize, 60),
    );
    const trainingHintsSummary =
      (await this.claudeTrainingHintsService.getLatestAggregate()) ??
      (await this.claudeTrainingHintsService.refreshLatestAggregate({
        sampleSize: Math.max(sampleSize * 2, 80),
        reason: 'audit_refresh',
        force: true,
      }));

    return {
      generatedAt: new Date().toISOString(),
      roleDefinition: CLAUDE_ROLE_DEFINITION,
      reviewDiffSummary,
      trainingHintsSummary,
      collections: {
        recent_good: {
          count: recentGood.length,
          repositories: recentGood,
        },
        recent_clone: {
          count: recentClone.length,
          repositories: recentClone,
        },
        recent_top_candidates: {
          count: recentTopCandidates.length,
          repositories: recentTopCandidates,
        },
        recent_local_fallback: {
          count: recentLocalFallback.length,
          repositories: recentLocalFallback,
        },
        recent_daily_summary_top: {
          count: recentDailySummaryTop.length,
          repositories: recentDailySummaryTop,
        },
      },
    };
  }

  private async loadMissingRepositories(
    ids: string[],
    existing: Map<string, AuditRepositoryTarget>,
  ) {
    const missingIds = ids.filter((id) => !existing.has(id));
    if (!missingIds.length) {
      return [];
    }

    return this.prisma.repository.findMany({
      where: {
        id: {
          in: missingIds,
        },
      },
      include: {
        analysis: true,
      },
    });
  }

  private toAuditRepositorySnapshot(
    repository: AuditRepositoryTarget,
    collection: AuditCollectionName,
    context: {
      topCandidateIds: Set<string>;
      telegramTopIds: Set<string>;
    },
  ): AuditRepositorySnapshot {
    const analysis = repository.analysis;
    const insight = this.readInsight(analysis?.insightJson);
    const snapshot = this.readSnapshot(analysis?.ideaSnapshotJson);
    const claudeReview =
      analysis?.claudeReviewStatus === 'SUCCESS'
        ? this.readClaudeReview(analysis?.claudeReviewJson)
        : null;
    const manualVerdict = this.normalizeVerdict(analysis?.manualVerdict);
    const manualAction = this.normalizeAction(analysis?.manualAction);
    const currentVerdict =
      manualVerdict ??
      claudeReview?.verdict ??
      insight?.verdict ??
      (snapshot?.isPromising ? 'OK' : 'BAD');
    const currentAction =
      manualAction ??
      claudeReview?.action ??
      insight?.action ??
      (currentVerdict === 'GOOD'
        ? 'BUILD'
        : currentVerdict === 'OK'
          ? 'CLONE'
          : 'IGNORE');
    const decisionSource =
      manualVerdict || manualAction
        ? 'manual_override'
        : claudeReview?.generatedBy === 'local_fallback'
          ? 'local_fallback'
          : claudeReview
            ? 'claude_review'
            : insight
              ? 'insight'
              : 'snapshot_fallback';
    const oneLinerZh =
      claudeReview?.oneLinerZh ||
      insight?.oneLinerZh ||
      snapshot?.oneLinerZh ||
      repository.description ||
      repository.fullName;
    const haystack = [
      repository.fullName,
      repository.description,
      ...(repository.topics ?? []),
      oneLinerZh,
    ]
      .map((item) => String(item ?? '').toLowerCase())
      .join('\n');

    return {
      collection,
      repositoryId: repository.id,
      fullName: repository.fullName,
      htmlUrl: repository.htmlUrl,
      stars: repository.stars,
      oneLinerZh: this.cleanText(oneLinerZh, 160),
      currentVerdict,
      currentAction,
      decisionSource,
      localVerdict: insight?.verdict ?? null,
      localAction: insight?.action ?? null,
      localConfidence: insight?.confidence ?? null,
      localProjectType: insight?.projectType ?? null,
      anchorMatch: insight?.anchorMatch ?? null,
      claudeVerdict: claudeReview?.verdict ?? null,
      claudeAction: claudeReview?.action ?? null,
      claudeGeneratedBy: claudeReview?.generatedBy ?? null,
      needsClaudeReview: claudeReview?.needsClaudeReview ?? false,
      trainingHintMistakes: claudeReview?.trainingHintMistakes ?? [],
      reviewDiffTypes: claudeReview?.reviewDiffTypes ?? [],
      enteredTopCandidate: context.topCandidateIds.has(repository.id),
      enteredTelegramTop: context.telegramTopIds.has(repository.id),
      hasManualOverride: Boolean(manualVerdict || manualAction || analysis?.manualNote),
      looksTemplateOrDemo:
        /(template|starter|boilerplate|scaffold|demo|tutorial|course)/i.test(
          haystack,
        ),
      looksCapabilityLike:
        /(framework|sdk|library|router|gateway|proxy|model|infra|orchestration)/i.test(
          haystack,
        ),
    };
  }

  private normalizeAuditReport(
    value: unknown,
    source: AuditSource,
    payload: AuditInputPayload,
  ): ClaudeAuditReport {
    const record =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const knownIds = new Set(
      Object.values(payload.collections).flatMap((collection) =>
        collection.repositories.map((repository) => repository.repositoryId),
      ),
    );
    const problemTypes = Array.isArray(record.problemTypes)
      ? record.problemTypes
          .map((item) => this.normalizeProblemType(item, knownIds))
          .filter((item): item is AuditProblemType => item !== null)
          .slice(0, 12)
      : [];
    const recommendedActions = Array.isArray(record.recommendedActions)
      ? record.recommendedActions
          .map((item) => this.normalizeRecommendedAction(item))
          .filter((item): item is AuditRecommendedAction => item !== null)
          .slice(0, 12)
      : [];
    const collectionFindings = Array.isArray(record.collectionFindings)
      ? record.collectionFindings
          .map((item) => this.normalizeCollectionFinding(item))
          .filter((item): item is AuditCollectionFinding => item !== null)
          .slice(0, 8)
      : [];
    const severity = this.resolveSeverity(problemTypes, recommendedActions, record);

    return {
      auditedAt: new Date().toISOString(),
      source,
      promptVersion: CLAUDE_QUALITY_AUDIT_PROMPT_VERSION,
      severity,
      summary:
        this.cleanText(record.summary, 600) ||
        'Claude 未发现明确的系统性问题，但建议继续抽样观察。',
      highPriorityHeadline: this.cleanNullableText(record.highPriorityHeadline, 180),
      overallBias: {
        direction: this.normalizeBiasDirection(
          (record.overallBias as Record<string, unknown> | undefined)?.direction,
        ),
        reason:
          this.cleanText(
            (record.overallBias as Record<string, unknown> | undefined)?.reason,
            320,
          ) || '当前没有明显的整体偏差结论。',
      },
      collectionFindings,
      problemTypes,
      suggestions: this.normalizeStringArray(record.suggestions).slice(0, 16),
      fallbackGapSummary: this.cleanNullableText(record.fallbackGapSummary, 320),
      repositoriesNeedingReview: this.normalizeRepositoryIds(
        record.repositoriesNeedingReview,
        knownIds,
      ),
      needsRecompute: this.normalizeRepositoryIds(record.needsRecompute, knownIds),
      needsPromptAdjustment: Boolean(record.needsPromptAdjustment),
      needsHeuristicAdjustment: Boolean(record.needsHeuristicAdjustment),
      recommendedActions,
      sampledCollections: Object.fromEntries(
        Object.entries(payload.collections).map(([key, collection]) => [
          key,
          {
            count: collection.count,
            repositoryIds: collection.repositories.map((repository) => repository.repositoryId),
          },
        ]),
      ) as ClaudeAuditReport['sampledCollections'],
      reviewDiffSummary: payload.reviewDiffSummary,
      trainingHintsSummary: payload.trainingHintsSummary,
      roleDefinition: CLAUDE_ROLE_DEFINITION,
    };
  }

  private normalizeProblemType(
    value: unknown,
    knownIds: Set<string>,
  ): AuditProblemType | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    return {
      type: this.cleanText(record.type, 80) || 'unknown_issue',
      count: this.readIntLike(record.count, 0),
      examples: Array.isArray(record.examples)
        ? record.examples
            .map((item) => this.normalizeProblemExample(item, knownIds))
            .filter((item): item is AuditProblemExample => item !== null)
            .slice(0, 6)
        : [],
    };
  }

  private normalizeProblemExample(
    value: unknown,
    knownIds: Set<string>,
  ): AuditProblemExample | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const repositoryId = this.cleanText(record.repositoryId, 80);
    if (!repositoryId || !knownIds.has(repositoryId)) {
      return null;
    }

    return {
      repositoryId,
      fullName: this.cleanText(record.fullName, 120) || repositoryId,
      currentVerdict: this.normalizeVerdict(record.currentVerdict),
      currentAction: this.normalizeAction(record.currentAction),
      suggestedVerdict: this.normalizeVerdict(record.suggestedVerdict),
      suggestedAction: this.normalizeAction(record.suggestedAction),
      reason: this.cleanText(record.reason, 240) || 'Claude 建议复核该项目。',
    };
  }

  private normalizeRecommendedAction(value: unknown): AuditRecommendedAction | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const priority = this.normalizePriority(record.priority);
    const action = this.cleanText(record.action, 120);
    if (!action) {
      return null;
    }

    return {
      priority,
      action,
      reason: this.cleanText(record.reason, 220) || 'Claude 建议执行该动作。',
    };
  }

  private normalizeCollectionFinding(value: unknown): AuditCollectionFinding | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const collection = this.normalizeCollectionName(record.collection);
    if (!collection) {
      return null;
    }

    return {
      collection,
      bias: this.normalizeBiasDirection(record.bias),
      summary: this.cleanText(record.summary, 240) || '该集合暂无明确结论。',
    };
  }

  private resolveSeverity(
    problemTypes: AuditProblemType[],
    recommendedActions: AuditRecommendedAction[],
    record: Record<string, unknown>,
  ): AuditSeverity {
    if (
      recommendedActions.some((item) => item.priority === 'P0') ||
      Boolean(this.cleanNullableText(record.highPriorityHeadline, 180)) ||
      problemTypes.some((item) => item.count >= 10)
    ) {
      return 'HIGH';
    }

    if (
      recommendedActions.some((item) => item.priority === 'P1') ||
      problemTypes.some((item) => item.count >= 4)
    ) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private async saveLatestAudit(report: ClaudeAuditReport) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: CLAUDE_AUDIT_LATEST_CONFIG_KEY,
      },
      update: {
        configValue: report as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: CLAUDE_AUDIT_LATEST_CONFIG_KEY,
        configValue: report as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async getRuntimeState(): Promise<ClaudeAuditRuntimeState> {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: CLAUDE_AUDIT_RUNTIME_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object' || Array.isArray(row.configValue)) {
      return {
        lastRunAt: null,
        lastSuccessAt: null,
        lastError: null,
        runCount: 0,
        lastSource: null,
      };
    }

    const record = row.configValue as Record<string, unknown>;
    return {
      lastRunAt: this.cleanNullableText(record.lastRunAt, 40),
      lastSuccessAt: this.cleanNullableText(record.lastSuccessAt, 40),
      lastError: this.cleanNullableText(record.lastError, 300),
      runCount: this.readIntLike(record.runCount, 0),
      lastSource:
        record.lastSource === 'manual' || record.lastSource === 'scheduler'
          ? record.lastSource
          : null,
    };
  }

  private async saveRuntimeState(state: ClaudeAuditRuntimeState) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: CLAUDE_AUDIT_RUNTIME_CONFIG_KEY,
      },
      update: {
        configValue: state as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: CLAUDE_AUDIT_RUNTIME_CONFIG_KEY,
        configValue: state as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private readInsight(value: Prisma.JsonValue | null | undefined) {
    const record = this.readJsonObject(value);
    if (!record) {
      return null;
    }

    const projectReality = this.readJsonObject(record.projectReality);
    return {
      oneLinerZh: this.cleanText(record.oneLinerZh, 160),
      verdict: this.normalizeVerdict(record.verdict),
      action: this.normalizeAction(record.action),
      confidence: this.toNumber(record.confidence),
      anchorMatch: this.cleanNullableText(record.anchorMatch, 20),
      projectType: this.cleanNullableText(
        projectReality?.type ?? projectReality?.projectType,
        20,
      ),
    };
  }

  private readSnapshot(value: Prisma.JsonValue | null | undefined) {
    const record = this.readJsonObject(value);
    if (!record) {
      return null;
    }

    return {
      oneLinerZh: this.cleanText(record.oneLinerZh, 160),
      isPromising: Boolean(record.isPromising),
    };
  }

  private readClaudeReview(value: Prisma.JsonValue | null | undefined) {
    const record = this.readJsonObject(value);
    if (!record) {
      return null;
    }

    const trainingHints = this.readJsonObject(record.trainingHints);
    const reviewDiff = this.readJsonObject(record.reviewDiff);
    return {
      oneLinerZh: this.cleanText(record.oneLinerZh, 160),
      verdict: this.normalizeVerdict(record.verdict),
      action: this.normalizeAction(record.action),
      generatedBy: this.cleanNullableText(record.generatedBy, 40),
      needsClaudeReview: Boolean(record.needsClaudeReview),
      trainingHintMistakes: this.normalizeStringArray(
        trainingHints?.localModelMistakes,
      ).slice(0, 6),
      reviewDiffTypes: this.normalizeStringArray(reviewDiff?.diffTypes).slice(0, 6),
    };
  }

  private normalizePriority(value: unknown): AuditPriority {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'P0' || normalized === 'P1' || normalized === 'P2') {
      return normalized;
    }

    return 'P1';
  }

  private normalizeCollectionName(value: unknown): AuditCollectionName | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (
      normalized === 'recent_good' ||
      normalized === 'recent_clone' ||
      normalized === 'recent_top_candidates' ||
      normalized === 'recent_local_fallback' ||
      normalized === 'recent_daily_summary_top'
    ) {
      return normalized;
    }

    return null;
  }

  private normalizeBiasDirection(value: unknown): AuditBiasDirection {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'too_optimistic' || normalized === 'too_conservative') {
      return normalized;
    }

    return 'balanced';
  }

  private normalizeVerdict(value: unknown): InsightVerdict | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'GOOD' || normalized === 'OK' || normalized === 'BAD') {
      return normalized;
    }

    return null;
  }

  private normalizeAction(value: unknown): InsightAction | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'BUILD' || normalized === 'CLONE' || normalized === 'IGNORE') {
      return normalized;
    }

    return null;
  }

  private normalizeRepositoryIds(value: unknown, knownIds: Set<string>) {
    return this.normalizeStringArray(value)
      .filter((item) => knownIds.has(item))
      .slice(0, 80);
  }

  private readJsonObject(
    value: unknown,
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readStringArray(value: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => String(item ?? '').trim())
      .filter((item) => Boolean(item));
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return Array.from(
      new Set(
        value
          .map((item) => String(item ?? '').trim())
          .filter((item) => Boolean(item)),
      ),
    );
  }

  private takeUniqueIds(ids: string[], maxSize: number) {
    return Array.from(
      new Set(
        ids.map((item) => String(item ?? '').trim()).filter((item) => Boolean(item)),
      ),
    ).slice(0, maxSize);
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }

    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength - 1)}…`
      : normalized;
  }

  private cleanNullableText(value: unknown, maxLength: number) {
    const normalized = this.cleanText(value, maxLength);
    return normalized || null;
  }

  private readBoolean(envName: string, fallback: boolean) {
    const raw = process.env[envName]?.trim().toLowerCase();
    if (!raw) {
      return fallback;
    }

    if (['1', 'true', 'yes', 'on'].includes(raw)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(raw)) {
      return false;
    }

    return fallback;
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private readIntLike(value: unknown, fallback: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  }

  private toNumber(value: unknown) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : null;
  }

  private toTimestamp(value: string | null) {
    if (!value) {
      return 0;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
