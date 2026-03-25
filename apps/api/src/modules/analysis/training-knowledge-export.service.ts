import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AnalysisTrainingKnowledge,
  AnalysisTrainingKnowledgeService,
} from './analysis-training-knowledge.service';
import { ClaudeAuditService } from './claude-audit.service';
import { ClaudeTrainingHintsAggregate, ClaudeTrainingHintsService } from './claude-training-hints.service';
import {
  MoneyLearningKnowledge,
  MoneyLearningService,
} from './money-learning.service';
import {
  MoneyPriorityResult,
  MoneyPriorityService,
} from './money-priority.service';

const DEFAULT_OUTPUT_DIR = 'docs/training-knowledge';
const EXPORT_VERSION = 'training-knowledge-export-v1';

type JsonObject = Record<string, unknown>;

type TrainingKnowledgeSourceStage =
  | 'claude_review'
  | 'claude_audit'
  | 'fallback_replay'
  | 'local_vs_claude_diff';

type InsightVerdict = 'GOOD' | 'OK' | 'BAD';
type InsightAction = 'BUILD' | 'CLONE' | 'IGNORE';
type ProjectType = 'product' | 'tool' | 'model' | 'infra' | 'demo';

type TrainingKnowledgeHumanFields = {
  human_verified: boolean;
  human_label: string | null;
  human_note: string | null;
  is_training_worthy: boolean;
  is_hard_case: boolean;
};

export type TrainingKnowledgeRecord = {
  exportVersion: string;
  exportedAt: string;
  repository: {
    id: string;
    fullName: string;
    htmlUrl: string;
    description: string | null;
    language: string | null;
    stars: number;
    topics: string[];
    createdAtGithub: string | null;
    pushedAtGithub: string | null;
  };
  sourceStages: TrainingKnowledgeSourceStage[];
  sourceContext: {
    generatedBy: string | null;
    reviewPriority: string | null;
    reviewPromptVersion: string | null;
    finalDecisionSource:
      | 'manual_override'
      | 'claude_review'
      | 'local_fallback'
      | 'insight'
      | 'snapshot_fallback';
  };
  timeline: {
    analyzedAt: string | null;
    reviewedAt: string | null;
    fallbackAt: string | null;
    exportedAt: string;
  };
  contentSummary: {
    readmeSummary: string | null;
    readmeLength: number;
  };
  repoBasicInfo: {
    ownerLogin: string;
    name: string;
    homepage: string | null;
    license: string | null;
  };
  localModelInitialJudgement: {
    oneLinerZh: string;
    verdict: InsightVerdict | null;
    action: InsightAction | null;
    reason: string | null;
    projectType: ProjectType | null;
    confidence: number | null;
    anchorMatch: string | null;
    hasRealUser: boolean | null;
    hasClearUseCase: boolean | null;
    hasProductizationPath: boolean | null;
    isDirectlyMonetizable: boolean | null;
  };
  claudeReview: {
    oneLinerZh: string;
    verdict: InsightVerdict | null;
    action: InsightAction | null;
    reason: string | null;
    projectType: ProjectType | null;
    confidence: number | null;
    generatedBy: string | null;
    provider: string | null;
    model: string | null;
    promptVersion: string | null;
    moneyDecision: string | null;
    businessJudgement: JsonObject | null;
    businessSignals: JsonObject | null;
    whyNotProduct: string | null;
    reviewNotes: string[];
  } | null;
  finalFusion: {
    verdict: InsightVerdict | null;
    action: InsightAction | null;
    oneLinerZh: string;
    reason: string | null;
    projectType: ProjectType | null;
    source:
      | 'manual_override'
      | 'claude_review'
      | 'local_fallback'
      | 'insight'
      | 'snapshot_fallback';
  };
  diff: {
    diffTypes: string[];
    fallbackReplayChanged: boolean;
    fallbackReplayReasons: string[];
    conflictScore: number;
  };
  trainingHints: {
    localModelMistakes: string[];
    ruleSuggestions: string[];
    promptSuggestions: string[];
    anchorSuggestions: string[];
    shouldUpdateLocalHeuristics: boolean;
  } | null;
  auditContext: {
    latestAuditAt: string | null;
    overallBias: string | null;
    headline: string | null;
    summary: string | null;
    repositoriesNeedingReview: boolean;
    needsRecompute: boolean;
    problemTypes: string[];
    problemReasons: string[];
    suggestions: string[];
    recommendedActions: Array<{
      priority: string;
      action: string;
      reason: string;
    }>;
  };
  moneyPriority: {
    score: number;
    tier: string;
    moneyDecision: string;
    labelZh: string;
    moneyDecisionLabelZh: string;
    reasonZh: string;
    recommendedMoveZh: string;
    projectTypeLabelZh: string;
    targetUsersZh: string;
    monetizationSummaryZh: string;
    source: string;
    moneySignals: JsonObject;
    businessSignals: JsonObject;
  };
  aggregateSignals: {
    topTrainingMistakes: string[];
    topMoneyMistakes: string[];
    topDiffTypes: string[];
    auditHighPriorityHeadline: string | null;
  };
  tags: {
    isHighConflict: boolean;
    isHighValuePositive: boolean;
    isHardNegative: boolean;
  };
  humanFields: TrainingKnowledgeHumanFields;
};

type TrainingKnowledgeAuditReport = {
  auditedAt?: string;
  highPriorityHeadline?: string | null;
  summary?: string;
  overallBias?: {
    direction?: string;
  };
  suggestions?: unknown;
  repositoriesNeedingReview?: unknown;
  needsRecompute?: unknown;
  recommendedActions?: unknown;
  problemTypes?: unknown;
};

type TrainingKnowledgeExportResult = {
  exportedAt: string;
  outputDir: string;
  recordCount: number;
  jsonlFiles: string[];
  markdownFiles: string[];
  highlightedRepositories: string[];
  validation: {
    janusLike: string[];
    template: string[];
    realTool: string[];
    highConflict: string[];
    auditHotspots: string[];
  };
};

type AuditProblemMatch = {
  type: string;
  reasons: string[];
};

type TrainingKnowledgeExportOptions = {
  sampleSize?: number;
  outputDir?: string;
  includeFullNames?: string[];
};

type ExportRepositoryTarget = Prisma.RepositoryGetPayload<{
  include: {
    analysis: true;
    content: true;
  };
}>;

type MistakePatternDefinition = {
  title: string;
  definition: string;
  teachingAdvice: string[];
  match: (record: TrainingKnowledgeRecord) => boolean;
};

@Injectable()
export class TrainingKnowledgeExportService {
  private readonly logger = new Logger(TrainingKnowledgeExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claudeAuditService: ClaudeAuditService,
    private readonly claudeTrainingHintsService: ClaudeTrainingHintsService,
    private readonly analysisTrainingKnowledgeService: AnalysisTrainingKnowledgeService,
    private readonly moneyLearningService: MoneyLearningService,
    private readonly moneyPriorityService: MoneyPriorityService,
  ) {}

  async exportKnowledgeAssets(
    options?: TrainingKnowledgeExportOptions,
  ): Promise<TrainingKnowledgeExportResult> {
    const exportedAt = new Date().toISOString();
    const defaultOutputDir = process.cwd().endsWith('/apps/api')
      ? resolve(process.cwd(), '..', '..', DEFAULT_OUTPUT_DIR)
      : resolve(process.cwd(), DEFAULT_OUTPUT_DIR);
    const outputDir = options?.outputDir
      ? resolve(process.cwd(), options.outputDir)
      : defaultOutputDir;
    const sampleSize = Math.max(20, Math.min(options?.sampleSize ?? 120, 300));
    const includeFullNames = this.normalizeStringArray(options?.includeFullNames).slice(0, 24);

    const [latestAudit, latestHints, latestKnowledge, moneyLearning] = await Promise.all([
      this.claudeAuditService.getLatestAudit(),
      this.claudeTrainingHintsService.getLatestAggregate(),
      this.analysisTrainingKnowledgeService.getLatestKnowledge(),
      this.moneyLearningService.getLatestLearning(),
    ]);

    const repositories = await this.collectRepositories({
      sampleSize,
      includeFullNames,
      latestAudit,
      latestHints,
      latestKnowledge,
      moneyLearning,
    });
    const records = repositories.map((repository) =>
      this.buildTrainingRecord({
        repository,
        exportedAt,
        latestAudit,
        latestHints,
        latestKnowledge,
        moneyLearning,
      }),
    );

    await this.ensureDirectoryStructure(outputDir);

    const jsonlFiles = await this.writeJsonlOutputs(outputDir, records, latestAudit);
    const markdownFiles = await this.writeMarkdownOutputs(outputDir, records, {
      exportedAt,
      latestAudit,
      latestHints,
      latestKnowledge,
      moneyLearning,
      includeFullNames,
    });

    const validation = this.buildValidationSummary(records);

    const result: TrainingKnowledgeExportResult = {
      exportedAt,
      outputDir,
      recordCount: records.length,
      jsonlFiles,
      markdownFiles,
      highlightedRepositories: this.takeUnique(
        [
          ...validation.highConflict,
          ...validation.realTool,
          ...validation.template,
          ...validation.auditHotspots,
        ],
        12,
      ),
      validation,
    };

    this.logger.log(
      `training_knowledge_export completed count=${records.length} outputDir=${outputDir}`,
    );

    return result;
  }

  private async collectRepositories(input: {
    sampleSize: number;
    includeFullNames: string[];
    latestAudit: TrainingKnowledgeAuditReport | null;
    latestHints: ClaudeTrainingHintsAggregate | null;
    latestKnowledge: AnalysisTrainingKnowledge | null;
    moneyLearning: MoneyLearningKnowledge | null;
  }) {
    const explicitMatches = input.includeFullNames.length
      ? await this.prisma.repository.findMany({
          where: {
            fullName: {
              in: input.includeFullNames,
            },
          },
          select: {
            id: true,
            fullName: true,
          },
        })
      : [];

    const recentClaudeReviewed = await this.prisma.repositoryAnalysis.findMany({
      where: {
        claudeReviewReviewedAt: {
          not: null,
        },
      },
      select: {
        repositoryId: true,
      },
      orderBy: {
        claudeReviewReviewedAt: 'desc',
      },
      take: Math.min(input.sampleSize * 3, 420),
    });

    const recentAnalyzed = await this.prisma.repositoryAnalysis.findMany({
      where: {
        analyzedAt: {
          not: null,
        },
      },
      select: {
        repositoryId: true,
      },
      orderBy: {
        analyzedAt: 'desc',
      },
      take: Math.min(input.sampleSize * 2, 300),
    });

    const targetIds = this.takeUnique(
      [
        ...explicitMatches.map((item) => item.id),
        ...recentClaudeReviewed.map((item) => item.repositoryId),
        ...recentAnalyzed.map((item) => item.repositoryId),
        ...this.normalizeStringArray(input.latestAudit?.repositoriesNeedingReview),
        ...this.normalizeStringArray(input.latestAudit?.needsRecompute),
        ...(input.latestHints?.repositoriesToInspect ?? []).map((item) => item.repositoryId),
        ...(input.latestKnowledge?.fallbackLearning.topGapRepositories ?? []).map(
          (item) => item.repositoryId,
        ),
        ...(input.moneyLearning?.repositoriesNeedingReview ?? []).map(
          (item) => item.repositoryId,
        ),
      ],
      Math.min(input.sampleSize * 3, 500),
    );

    const repositories = await this.prisma.repository.findMany({
      where: {
        id: {
          in: targetIds,
        },
      },
      include: {
        analysis: true,
        content: true,
      },
    });

    const explicitOrder = new Map(
      input.includeFullNames.map((fullName, index) => [fullName, index] as const),
    );

    return repositories
      .sort((left, right) => {
        const leftExplicit = explicitOrder.get(left.fullName);
        const rightExplicit = explicitOrder.get(right.fullName);
        if (leftExplicit !== undefined || rightExplicit !== undefined) {
          return (leftExplicit ?? Number.MAX_SAFE_INTEGER) - (rightExplicit ?? Number.MAX_SAFE_INTEGER);
        }

        const rightTimestamp = this.toTimestamp(
          right.analysis?.claudeReviewReviewedAt ?? right.analysis?.analyzedAt,
        );
        const leftTimestamp = this.toTimestamp(
          left.analysis?.claudeReviewReviewedAt ?? left.analysis?.analyzedAt,
        );
        return rightTimestamp - leftTimestamp;
      })
      .slice(0, input.sampleSize);
  }

  private buildTrainingRecord(input: {
    repository: ExportRepositoryTarget;
    exportedAt: string;
    latestAudit: TrainingKnowledgeAuditReport | null;
    latestHints: ClaudeTrainingHintsAggregate | null;
    latestKnowledge: AnalysisTrainingKnowledge | null;
    moneyLearning: MoneyLearningKnowledge | null;
  }): TrainingKnowledgeRecord {
    const analysis = input.repository.analysis;
    const snapshot = this.readObject(analysis?.ideaSnapshotJson);
    const insight = this.readObject(analysis?.insightJson);
    const claudeReview = this.readObject(analysis?.claudeReviewJson);
    const extractedIdea = this.readObject(analysis?.extractedIdeaJson);
    const projectReality =
      this.readObject(insight?.projectReality) ?? this.readObject(snapshot?.projectReality);
    const localVerdict = this.normalizeVerdict(
      insight?.verdict ?? (snapshot?.isPromising ? 'OK' : null),
    );
    const localAction =
      this.normalizeAction(insight?.action) ??
      (localVerdict === 'GOOD'
        ? 'BUILD'
        : localVerdict === 'BAD'
          ? 'IGNORE'
          : localVerdict === 'OK'
            ? 'CLONE'
            : null);
    const localProjectType = this.normalizeProjectType(
      projectReality?.type ?? projectReality?.projectType,
    );
    const reviewVerdict = this.normalizeVerdict(claudeReview?.verdict);
    const reviewAction = this.normalizeAction(claudeReview?.action);
    const reviewProjectType = this.normalizeProjectType(claudeReview?.projectType);
    const finalSource = this.resolveFinalSource(analysis, claudeReview, insight, snapshot);
    const finalVerdict =
      this.normalizeVerdict(analysis?.manualVerdict) ?? reviewVerdict ?? localVerdict;
    const finalAction =
      this.normalizeAction(analysis?.manualAction) ?? reviewAction ?? localAction;
    const finalOneLiner =
      this.cleanText(claudeReview?.oneLinerZh, 180) ||
      this.cleanText(insight?.oneLinerZh, 180) ||
      this.cleanText(snapshot?.oneLinerZh, 180) ||
      this.cleanText(input.repository.description, 180) ||
      input.repository.fullName;
    const finalReason =
      this.cleanText(analysis?.manualNote, 260) ||
      this.cleanText(claudeReview?.reason, 260) ||
      this.cleanText(insight?.verdictReason, 260) ||
      this.cleanText(snapshot?.reason, 260);
    const finalProjectType = reviewProjectType ?? localProjectType;
    const trainingHints = this.normalizeTrainingHints(claudeReview?.trainingHints);
    const reviewDiff = this.readObject(claudeReview?.reviewDiff);
    const fallbackDiff = this.readObject(claudeReview?.fallbackDiff);
    const diffTypes = this.normalizeStringArray(reviewDiff?.diffTypes);
    const fallbackReplayReasons = this.normalizeStringArray(fallbackDiff?.reasons);
    const auditContext = this.buildAuditContext(
      input.repository,
      input.latestAudit,
    );
    const sourceStages = this.resolveSourceStages({
      claudeReview,
      diffTypes,
      fallbackReplayReasons,
      auditContext,
    });
    const moneyPriority = this.moneyPriorityService.calculate({
      repository: {
        fullName: input.repository.fullName,
        description: input.repository.description,
        homepage: input.repository.homepage,
        language: input.repository.language,
        topics: input.repository.topics,
        stars: input.repository.stars,
        ideaFitScore: this.toNumber(input.repository.ideaFitScore),
        finalScore: this.toNumber(input.repository.finalScore),
        toolLikeScore: this.toNumber(input.repository.toolLikeScore),
        roughPass: input.repository.roughPass,
        categoryL1: input.repository.categoryL1,
        categoryL2: input.repository.categoryL2,
      },
      manualOverride:
        analysis?.manualVerdict || analysis?.manualAction || analysis?.manualNote
          ? {
              verdict: analysis.manualVerdict,
              action: analysis.manualAction,
              note: analysis.manualNote,
            }
          : null,
      claudeReview,
      insight,
      snapshot,
      extractedIdea,
    });
    const isHighConflict = this.isHighConflict(diffTypes, trainingHints, fallbackReplayReasons);
    const isHighValuePositive = this.isHighValuePositive(moneyPriority, finalVerdict, finalAction);
    const isHardNegative = this.isHardNegative(moneyPriority, finalVerdict, finalAction);

    return {
      exportVersion: EXPORT_VERSION,
      exportedAt: input.exportedAt,
      repository: {
        id: input.repository.id,
        fullName: input.repository.fullName,
        htmlUrl: input.repository.htmlUrl,
        description: this.cleanNullableText(input.repository.description, 300),
        language: this.cleanNullableText(input.repository.language, 40),
        stars: input.repository.stars,
        topics: (input.repository.topics ?? []).slice(0, 12),
        createdAtGithub: input.repository.createdAtGithub?.toISOString() ?? null,
        pushedAtGithub: input.repository.pushedAtGithub?.toISOString() ?? null,
      },
      sourceStages,
      sourceContext: {
        generatedBy: this.cleanNullableText(claudeReview?.generatedBy, 40),
        reviewPriority: this.cleanNullableText(claudeReview?.priority, 10),
        reviewPromptVersion: this.cleanNullableText(claudeReview?.promptVersion, 80),
        finalDecisionSource: finalSource,
      },
      timeline: {
        analyzedAt: analysis?.analyzedAt?.toISOString() ?? null,
        reviewedAt: analysis?.claudeReviewReviewedAt?.toISOString() ?? null,
        fallbackAt: this.cleanNullableText(claudeReview?.fallbackAt, 40),
        exportedAt: input.exportedAt,
      },
      contentSummary: {
        readmeSummary: this.buildReadmeSummary(input.repository.content?.readmeText),
        readmeLength: this.cleanText(input.repository.content?.readmeText, 20_000).length,
      },
      repoBasicInfo: {
        ownerLogin: input.repository.ownerLogin,
        name: input.repository.name,
        homepage: this.cleanNullableText(input.repository.homepage, 200),
        license: this.cleanNullableText(input.repository.license, 80),
      },
      localModelInitialJudgement: {
        oneLinerZh:
          this.cleanText(insight?.oneLinerZh, 180) ||
          this.cleanText(snapshot?.oneLinerZh, 180) ||
          this.cleanText(input.repository.description, 180) ||
          input.repository.fullName,
        verdict: localVerdict,
        action: localAction,
        reason:
          this.cleanNullableText(insight?.verdictReason, 260) ||
          this.cleanNullableText(snapshot?.reason, 260),
        projectType: localProjectType,
        confidence: this.normalizeConfidence(insight?.confidence),
        anchorMatch: this.cleanNullableText(insight?.anchorMatch, 30),
        hasRealUser: this.readBooleanMaybe(projectReality?.hasRealUser),
        hasClearUseCase: this.readBooleanMaybe(projectReality?.hasClearUseCase),
        hasProductizationPath: this.readBooleanMaybe(projectReality?.hasProductizationPath),
        isDirectlyMonetizable: this.readBooleanMaybe(projectReality?.isDirectlyMonetizable),
      },
      claudeReview: claudeReview
        ? {
            oneLinerZh:
              this.cleanText(claudeReview.oneLinerZh, 180) ||
              this.cleanText(input.repository.description, 180) ||
              input.repository.fullName,
            verdict: reviewVerdict,
            action: reviewAction,
            reason: this.cleanNullableText(claudeReview.reason, 260),
            projectType: reviewProjectType,
            confidence: this.normalizeConfidence(claudeReview.confidence),
            generatedBy: this.cleanNullableText(claudeReview.generatedBy, 40),
            provider: this.cleanNullableText(claudeReview.provider, 40),
            model: this.cleanNullableText(claudeReview.model, 80),
            promptVersion: this.cleanNullableText(claudeReview.promptVersion, 80),
            moneyDecision: this.cleanNullableText(claudeReview.moneyDecision, 40),
            businessJudgement: this.readObject(claudeReview.businessJudgement),
            businessSignals: this.readObject(claudeReview.businessSignals),
            whyNotProduct: this.cleanNullableText(claudeReview.whyNotProduct, 220),
            reviewNotes: this.normalizeStringArray(claudeReview.reviewNotes).slice(0, 8),
          }
        : null,
      finalFusion: {
        verdict: finalVerdict,
        action: finalAction,
        oneLinerZh: finalOneLiner,
        reason: finalReason,
        projectType: finalProjectType,
        source: finalSource,
      },
      diff: {
        diffTypes,
        fallbackReplayChanged: Boolean(fallbackDiff?.changed),
        fallbackReplayReasons,
        conflictScore:
          diffTypes.length +
          fallbackReplayReasons.length +
          (trainingHints?.shouldUpdateLocalHeuristics ? 1 : 0),
      },
      trainingHints,
      auditContext,
      moneyPriority: this.serializeMoneyPriority(moneyPriority),
      aggregateSignals: {
        topTrainingMistakes:
          input.latestKnowledge?.topMistakeTypes.map((item) => item.type).slice(0, 4) ?? [],
        topMoneyMistakes:
          input.moneyLearning?.topMistakeTypes.map((item) => item.type).slice(0, 4) ?? [],
        topDiffTypes:
          input.latestHints?.diffSummary?.topDiffTypes.map((item) => item.type).slice(0, 4) ?? [],
        auditHighPriorityHeadline: this.cleanNullableText(
          input.latestAudit?.highPriorityHeadline,
          200,
        ),
      },
      tags: {
        isHighConflict,
        isHighValuePositive,
        isHardNegative,
      },
      humanFields: {
        human_verified: false,
        human_label: null,
        human_note: null,
        is_training_worthy:
          isHighConflict ||
          isHighValuePositive ||
          isHardNegative ||
          auditContext.repositoriesNeedingReview,
        is_hard_case: isHighConflict || auditContext.problemTypes.length > 0,
      },
    };
  }

  private serializeMoneyPriority(value: MoneyPriorityResult) {
    return {
      score: value.score,
      tier: value.tier,
      moneyDecision: value.moneyDecision,
      labelZh: value.labelZh,
      moneyDecisionLabelZh: value.moneyDecisionLabelZh,
      reasonZh: value.reasonZh,
      recommendedMoveZh: value.recommendedMoveZh,
      projectTypeLabelZh: value.projectTypeLabelZh,
      targetUsersZh: value.targetUsersZh,
      monetizationSummaryZh: value.monetizationSummaryZh,
      source: value.source,
      moneySignals: value.moneySignals as unknown as JsonObject,
      businessSignals: value.businessSignals as unknown as JsonObject,
    };
  }

  private buildAuditContext(
    repository: ExportRepositoryTarget,
    latestAudit: TrainingKnowledgeAuditReport | null,
  ) {
    const repositoriesNeedingReview = new Set(
      this.normalizeStringArray(latestAudit?.repositoriesNeedingReview),
    );
    const needsRecompute = new Set(this.normalizeStringArray(latestAudit?.needsRecompute));
    const problemTypes = this.normalizeProblemTypes(latestAudit?.problemTypes);
    const matchedProblems = problemTypes
      .map((problem) => this.matchAuditProblem(repository, problem))
      .filter((item): item is AuditProblemMatch => item !== null);

    return {
      latestAuditAt: this.cleanNullableText(latestAudit?.auditedAt, 40),
      overallBias: this.cleanNullableText(latestAudit?.overallBias?.direction, 40),
      headline: this.cleanNullableText(latestAudit?.highPriorityHeadline, 220),
      summary: this.cleanNullableText(latestAudit?.summary, 320),
      repositoriesNeedingReview: repositoriesNeedingReview.has(repository.id),
      needsRecompute: needsRecompute.has(repository.id),
      problemTypes: matchedProblems.map((item) => item.type),
      problemReasons: matchedProblems.flatMap((item) => item.reasons).slice(0, 10),
      suggestions: this.normalizeStringArray(latestAudit?.suggestions).slice(0, 6),
      recommendedActions: this.normalizeRecommendedActions(
        latestAudit?.recommendedActions,
      ).slice(0, 5),
    };
  }

  private resolveSourceStages(input: {
    claudeReview: JsonObject | null;
    diffTypes: string[];
    fallbackReplayReasons: string[];
    auditContext: TrainingKnowledgeRecord['auditContext'];
  }): TrainingKnowledgeSourceStage[] {
    const stages: TrainingKnowledgeSourceStage[] = [];
    if (input.claudeReview) {
      stages.push('claude_review');
    }

    if (
      this.cleanText(input.claudeReview?.generatedBy, 40) === 'local_fallback' ||
      input.fallbackReplayReasons.length > 0 ||
      this.cleanText(input.claudeReview?.fallbackAt, 40)
    ) {
      stages.push('fallback_replay');
    }

    if (input.diffTypes.length > 0) {
      stages.push('local_vs_claude_diff');
    }

    if (
      input.auditContext.repositoriesNeedingReview ||
      input.auditContext.needsRecompute ||
      input.auditContext.problemTypes.length > 0
    ) {
      stages.push('claude_audit');
    }

    return this.takeUnique(stages, 4);
  }

  private async writeJsonlOutputs(
    outputDir: string,
    records: TrainingKnowledgeRecord[],
    latestAudit: TrainingKnowledgeAuditReport | null,
  ) {
    const datasetsDir = join(outputDir, 'datasets');
    const claudeReviewLog = records.filter((record) => record.claudeReview !== null);
    const trainingHintsLog = records
      .filter((record) => record.trainingHints !== null)
      .map((record) => ({
        repository: record.repository,
        sourceStages: record.sourceStages,
        timeline: record.timeline,
        localModelInitialJudgement: record.localModelInitialJudgement,
        diff: record.diff,
        trainingHints: record.trainingHints,
        auditContext: record.auditContext,
        humanFields: record.humanFields,
      }));
    const highConflictCases = records.filter((record) => record.tags.isHighConflict);
    const highValuePositiveCases = records.filter((record) => record.tags.isHighValuePositive);
    const hardNegativeCases = records.filter((record) => record.tags.isHardNegative);
    const teacherPositiveSamples = highValuePositiveCases.map((record) =>
      this.buildTeacherSampleRow(record, 'positive'),
    );
    const teacherNegativeSamples = hardNegativeCases.map((record) =>
      this.buildTeacherSampleRow(record, 'negative'),
    );
    const teacherBoundarySamples = highConflictCases.map((record) =>
      this.buildTeacherSampleRow(record, 'boundary'),
    );

    const auditReports = [
      {
        exportVersion: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        latestAudit,
      },
    ];

    const files = [
      await this.writeJsonl(join(datasetsDir, 'claude_review_log.jsonl'), claudeReviewLog),
      await this.writeJsonl(join(datasetsDir, 'training_hints_log.jsonl'), trainingHintsLog),
      await this.writeJsonl(join(datasetsDir, 'audit_reports.jsonl'), auditReports),
      await this.writeJsonl(join(datasetsDir, 'high_conflict_cases.jsonl'), highConflictCases),
      await this.writeJsonl(
        join(datasetsDir, 'high_value_positive_cases.jsonl'),
        highValuePositiveCases,
      ),
      await this.writeJsonl(join(datasetsDir, 'hard_negative_cases.jsonl'), hardNegativeCases),
      await this.writeJsonl(
        join(datasetsDir, 'teacher_positive_samples.jsonl'),
        teacherPositiveSamples,
      ),
      await this.writeJsonl(
        join(datasetsDir, 'teacher_negative_samples.jsonl'),
        teacherNegativeSamples,
      ),
      await this.writeJsonl(
        join(datasetsDir, 'teacher_boundary_samples.jsonl'),
        teacherBoundarySamples,
      ),
      await this.writeJsonl(
        join(datasetsDir, 'one_liner_repair_pairs.jsonl'),
        this.buildStudentTaskRows(records, 'one_liner'),
      ),
      await this.writeJsonl(
        join(datasetsDir, 'category_repair_pairs.jsonl'),
        this.buildStudentTaskRows(records, 'category'),
      ),
      await this.writeJsonl(
        join(datasetsDir, 'user_repair_pairs.jsonl'),
        this.buildStudentTaskRows(records, 'user'),
      ),
      await this.writeJsonl(
        join(datasetsDir, 'monetization_repair_pairs.jsonl'),
        this.buildStudentTaskRows(records, 'monetization'),
      ),
      await this.writeJsonl(
        join(datasetsDir, 'action_verdict_repair_pairs.jsonl'),
        this.buildStudentTaskRows(records, 'action_verdict'),
      ),
    ];

    return files;
  }

  private async writeMarkdownOutputs(
    outputDir: string,
    records: TrainingKnowledgeRecord[],
    context: {
      exportedAt: string;
      latestAudit: TrainingKnowledgeAuditReport | null;
      latestHints: ClaudeTrainingHintsAggregate | null;
      latestKnowledge: AnalysisTrainingKnowledge | null;
      moneyLearning: MoneyLearningKnowledge | null;
      includeFullNames: string[];
    },
  ) {
    const files: string[] = [];
    files.push(
      await this.writeText(
        join(outputDir, 'README.md'),
        this.buildRootReadme(records, context),
      ),
    );
    files.push(
      await this.writeText(
        join(outputDir, 'claude_teaching_rules.md'),
        this.buildClaudeTeachingRules(records, context),
      ),
    );
    files.push(
      await this.writeText(
        join(outputDir, 'datasets', 'training-dataset-design.md'),
        this.buildTrainingDatasetDesign(records, context),
      ),
    );

    const weekFile = join(
      outputDir,
      'weekly-audits',
      `${this.toIsoWeekLabel(context.exportedAt)}.md`,
    );
    files.push(
      await this.writeText(
        weekFile,
        this.buildWeeklyAuditMarkdown(records, context),
      ),
    );

    const mistakeDefinitions = this.getMistakePatternDefinitions();
    for (const [slug, definition] of Object.entries(mistakeDefinitions)) {
      files.push(
        await this.writeText(
          join(outputDir, 'mistake-patterns', `${slug}.md`),
          this.buildMistakePatternMarkdown(slug, definition, records, context),
        ),
      );
    }

    const notableCases = this.pickNotableCases(records, context.includeFullNames);
    for (const record of notableCases) {
      files.push(
        await this.writeText(
          join(outputDir, 'repo-cases', `${this.slugify(record.repository.fullName)}.md`),
          this.buildRepoCaseMarkdown(record),
        ),
      );
    }

    return files;
  }

  private buildRootReadme(
    records: TrainingKnowledgeRecord[],
    context: {
      exportedAt: string;
      latestAudit: TrainingKnowledgeAuditReport | null;
      latestHints: ClaudeTrainingHintsAggregate | null;
      latestKnowledge: AnalysisTrainingKnowledge | null;
      moneyLearning: MoneyLearningKnowledge | null;
    },
  ) {
    const highConflict = records.filter((record) => record.tags.isHighConflict).length;
    const highValue = records.filter((record) => record.tags.isHighValuePositive).length;
    const hardNegative = records.filter((record) => record.tags.isHardNegative).length;

    return [
      '# Claude 教本地模型的知识沉淀层',
      '',
      `- 导出时间：${context.exportedAt}`,
      `- 导出版本：${EXPORT_VERSION}`,
      `- 样本总数：${records.length}`,
      `- 高冲突案例：${highConflict}`,
      `- 高价值正样本：${highValue}`,
      `- 困难负样本：${hardNegative}`,
      '',
      '## 目录说明',
      '',
      '- `weekly-audits/`：每次导出时生成一份周报式 audit 摘要，记录系统偏差和高优先修正建议。',
      '- `mistake-patterns/`：把高频误判沉淀成单独文档，包含定义、案例、Claude 纠偏方式和本地模型教学建议。',
      '- `repo-cases/`：挑选高冲突、高价值和典型负样本，生成可人工阅读的仓库案例卡。',
      '- `datasets/`：面向后续训练集构造的 JSONL 资产和训练任务设计文档。',
      '',
      '## 数据来源',
      '',
      '- Claude review overlay',
      '- Claude audit',
      '- fallback replay diff',
      '- local vs Claude diff',
      '- trainingHints / analysis.training_knowledge / analysis.money_learning',
      '',
      '## 导出内容',
      '',
      '- `claude_review_log.jsonl`：统一训练 record 主日志。',
      '- `training_hints_log.jsonl`：只保留 trainingHints 相关字段，方便后续做规则和 prompt 学习。',
      '- `audit_reports.jsonl`：最新 audit 报告导出。',
      '- `high_conflict_cases.jsonl`：本地与 Claude 差异最大的样本。',
      '- `high_value_positive_cases.jsonl`：更值得做成产品的正样本。',
      '- `hard_negative_cases.jsonl`：容易误判但应该压下去的负样本。',
      '- `teacher_positive_samples.jsonl / teacher_negative_samples.jsonl / teacher_boundary_samples.jsonl`：可直接拿来做教师样本池与人工校准。',
      '- `*_repair_pairs.jsonl`：按 one-liner / category / user / monetization / action-verdict 拆开的 122B 校正样本。',
      '',
      '## 当前聚合信号',
      '',
      `- 最新 audit 偏差：${this.cleanText(context.latestAudit?.overallBias?.direction, 40) || 'unknown'}`,
      `- 最新 audit headline：${this.cleanText(context.latestAudit?.highPriorityHeadline, 160) || '无'}`,
      `- 高频 training mistake：${(context.latestKnowledge?.topMistakeTypes ?? [])
        .slice(0, 4)
        .map((item) => `${item.type}(${item.count})`)
        .join(' / ') || '无'}`,
      `- 高频 money mistake：${(context.moneyLearning?.topMistakeTypes ?? [])
        .slice(0, 4)
        .map((item) => `${item.type}(${item.count})`)
        .join(' / ') || '无'}`,
      `- 高频 diff type：${(context.latestHints?.diffSummary?.topDiffTypes ?? [])
        .slice(0, 4)
        .map((item) => `${item.type}(${item.count})`)
        .join(' / ') || '无'}`,
      '',
      '## 人工标注预留字段',
      '',
      '- `human_verified`',
      '- `human_label`',
      '- `human_note`',
      '- `is_training_worthy`',
      '- `is_hard_case`',
      '',
    ].join('\n');
  }

  private buildTrainingDatasetDesign(
    records: TrainingKnowledgeRecord[],
    context: {
      latestKnowledge: AnalysisTrainingKnowledge | null;
      moneyLearning: MoneyLearningKnowledge | null;
    },
  ) {
    const positives = records.filter((record) => record.tags.isHighValuePositive).length;
    const negatives = records.filter((record) => record.tags.isHardNegative).length;
    const conflicts = records.filter((record) => record.tags.isHighConflict).length;

    return [
      '# 后续训练集设计建议',
      '',
      '## 1. 分类判断集',
      '',
      '- 目标：让本地模型更稳定地区分 `值得做 / 值得抄 / 应忽略`。',
      '- 可直接使用：`high_value_positive_cases.jsonl` 作为正样本，`hard_negative_cases.jsonl` 作为负样本，`high_conflict_cases.jsonl` 作为边界样本。',
      `- 当前可用样本规模：正样本 ${positives} / 负样本 ${negatives} / 边界样本 ${conflicts}。`,
      '',
      '推荐 label：',
      '',
      '- `GOOD+BUILD`：真实产品或真实工具机会',
      '- `OK+CLONE`：值得借鉴但不该直接照做',
      '- `BAD+IGNORE`：模板、模型能力层、infra、demo、垃圾项目',
      '',
      '## 2. 纠偏解释集',
      '',
      '- 目标：让本地模型学会解释“为什么错了、怎么改”。',
      '- 输入：本地模型初判 + Claude 复核 + diff + trainingHints。',
      '- 输出：纠偏说明、规则建议、one-liner 修正、是否需要降级或升级。',
      '',
      '最适合重点抽样的错误类型：',
      '',
      ...(context.latestKnowledge?.topMistakeTypes ?? [])
        .slice(0, 6)
        .map((item) => `- ${item.type}：${item.count}`),
      '',
      '## 3. 中文表达集',
      '',
      '- 目标：把 one-liner 和 reason 训练得更像创业判断，而不是技术摘要。',
      '- 输入：仓库基础信息 + 本地 one-liner + Claude 修正 one-liner。',
      '- 输出：中文一句话（谁 + 做什么）和创业判断式 reason。',
      '',
      '## 4. few-shot / anchor 增量集',
      '',
      '- 从 `training_hints_log.jsonl` 抽取高频 `anchorSuggestions`，按 devtool、workflow、API tool、template、model、infra 六大类沉淀 few-shot。',
      '',
      '## 5. 人工校准建议',
      '',
      '- 优先标记 `human_verified=true` 的高冲突案例。',
      '- `is_training_worthy=true` 但 `human_label` 为空的条目，优先进入人工复核池。',
      '- `is_hard_case=true` 的条目适合作为边界样本集，避免模型只学到容易题。',
      '',
      '## 6. 下一步最值钱的构造方向',
      '',
      '- 先做 verdict/action 分类集。',
      '- 再做纠偏解释集。',
      '- 最后做中文表达集，把 one-liner 和创业理由单独拉出来微调。',
      '',
    ].join('\n');
  }

  private buildClaudeTeachingRules(
    records: TrainingKnowledgeRecord[],
    context: {
      latestKnowledge: AnalysisTrainingKnowledge | null;
      moneyLearning: MoneyLearningKnowledge | null;
    },
  ) {
    const highConflict = records.filter((record) => record.tags.isHighConflict).length;
    const unclearUserCases = records.filter(
      (record) =>
        record.diff.diffTypes.includes('one_liner_drift') ||
        record.trainingHints?.localModelMistakes.includes('one_liner_drift') === true,
    ).length;
    const modelInfraCases = records.filter(
      (record) =>
        record.diff.diffTypes.includes('product_vs_model_mismatch') ||
        record.trainingHints?.localModelMistakes.includes('model_or_infra_leakage') === true,
    ).length;

    return [
      '# Claude 教师规则集',
      '',
      '目标不是让 122B 更会讲故事，而是让它在证据不足时更保守、更少误导用户。',
      '',
      '## 1. 什么时候不能写“帮谁做什么”',
      '',
      '- README / description 没有明确用户和 use-case 时，不要写产品句。',
      '- user unclear / use-case unclear / README 很薄时，直接退回技术实现或能力示例表达。',
      '- 目标用户仍不清楚时，必须明确说“不清楚”，不能脑补 ICP。',
      '',
      '## 2. monetization 什么时候必须保守',
      '',
      '- 只有真实用户 + 明确场景都成立，才允许写可收费。',
      '- model / infra / demo / template 默认保守化，不先写订阅、企业版、托管版。',
      '- monetization 与 why/use-case 打架时，优先降级 monetization。',
      '',
      '## 3. infra / model / demo 的边界',
      '',
      '- infra / framework / router / provider / SDK 默认是能力层，不是产品。',
      '- model / inference / runtime 默认是模型能力，不是工具机会。',
      '- demo / template / scaffold / starter / boilerplate / example 默认是示例，不是产品。',
      '',
      '## 4. 冲突时怎么降级',
      '',
      '- headline 强，但 user unclear -> 降级。',
      '- headline 强，但 category 指向 infra/model/demo -> 降级。',
      '- snapshot 已判 non-promising 或 nextAction=SKIP，但 headline 仍像机会 -> 降级。',
      '- fallback 来源一律低信任，不继续保留强 headline。',
      '',
      '## 5. 首页 headline 安全句式',
      '',
      '- 这个项目的中文摘要还在校正，先看最终结论与详情。',
      '- 这个项目暂时更适合放在低优先观察池里。',
      '- 这个项目当前更像技术实现或能力示例，具体用户和使用场景还不够清晰。',
      '',
      '## 6. 当前样本聚合',
      '',
      `- 高冲突样本：${highConflict}`,
      `- one-liner drift 相关样本：${unclearUserCases}`,
      `- product_vs_model/infra 相关样本：${modelInfraCases}`,
      `- 高频训练错误：${(context.latestKnowledge?.topMistakeTypes ?? [])
        .slice(0, 6)
        .map((item) => `${item.type}(${item.count})`)
        .join(' / ') || '无'}`,
      `- 高频 money 错误：${(context.moneyLearning?.topMistakeTypes ?? [])
        .slice(0, 6)
        .map((item) => `${item.type}(${item.count})`)
        .join(' / ') || '无'}`,
      '',
    ].join('\n');
  }

  private buildTeacherSampleRow(
    record: TrainingKnowledgeRecord,
    label: 'positive' | 'negative' | 'boundary',
  ) {
    return {
      repository: record.repository,
      repo_context: {
        description: record.repository.description,
        topics: record.repository.topics,
        readme_summary: record.contentSummary.readmeSummary,
      },
      bad_local_output: record.localModelInitialJudgement,
      corrected_output: {
        claude_review: record.claudeReview,
        final_fusion: record.finalFusion,
      },
      error_tags: this.takeUnique(
        [
          ...record.diff.diffTypes,
          ...(record.trainingHints?.localModelMistakes ?? []),
          ...record.auditContext.problemTypes,
        ],
        12,
      ),
      teaching_notes: this.takeUnique(
        [
          ...(record.trainingHints?.ruleSuggestions ?? []),
          ...(record.trainingHints?.promptSuggestions ?? []),
          ...(record.trainingHints?.anchorSuggestions ?? []),
          ...record.auditContext.problemReasons,
        ],
        12,
      ),
      sample_label: label,
    };
  }

  private buildStudentTaskRows(
    records: TrainingKnowledgeRecord[],
    task:
      | 'one_liner'
      | 'category'
      | 'user'
      | 'monetization'
      | 'action_verdict',
  ) {
    return records
      .map((record) => this.buildStudentTaskRow(record, task))
      .filter(Boolean);
  }

  private buildStudentTaskRow(
    record: TrainingKnowledgeRecord,
    task:
      | 'one_liner'
      | 'category'
      | 'user'
      | 'monetization'
      | 'action_verdict',
  ) {
    const errorTags = this.takeUnique(
      [
        ...record.diff.diffTypes,
        ...(record.trainingHints?.localModelMistakes ?? []),
        ...record.auditContext.problemTypes,
      ],
      12,
    );

    if (task === 'one_liner') {
      const corrected = record.claudeReview?.oneLinerZh || record.finalFusion.oneLinerZh;
      if (!corrected || corrected === record.localModelInitialJudgement.oneLinerZh) {
        return null;
      }
      return {
        task,
        repo_context: {
          full_name: record.repository.fullName,
          description: record.repository.description,
          readme_summary: record.contentSummary.readmeSummary,
          topics: record.repository.topics,
        },
        bad_local_output: {
          one_liner: record.localModelInitialJudgement.oneLinerZh,
        },
        corrected_output: {
          one_liner: corrected,
        },
        error_tags: errorTags,
        teaching_notes: this.takeUnique(
          [
            ...(record.trainingHints?.ruleSuggestions ?? []),
            ...(record.trainingHints?.anchorSuggestions ?? []),
          ],
          10,
        ),
      };
    }

    if (task === 'category') {
      const corrected = record.claudeReview?.projectType || record.finalFusion.projectType;
      if (!corrected || corrected === record.localModelInitialJudgement.projectType) {
        return null;
      }
      return {
        task,
        repo_context: {
          full_name: record.repository.fullName,
          description: record.repository.description,
          readme_summary: record.contentSummary.readmeSummary,
        },
        bad_local_output: {
          project_type: record.localModelInitialJudgement.projectType,
        },
        corrected_output: {
          project_type: corrected,
        },
        error_tags: errorTags,
        teaching_notes: this.takeUnique(
          [
            ...(record.trainingHints?.ruleSuggestions ?? []),
            ...record.auditContext.problemReasons,
          ],
          10,
        ),
      };
    }

    if (task === 'user') {
      if (record.localModelInitialJudgement.hasRealUser === true) {
        return null;
      }
      return {
        task,
        repo_context: {
          full_name: record.repository.fullName,
          description: record.repository.description,
          readme_summary: record.contentSummary.readmeSummary,
        },
        bad_local_output: {
          has_real_user: record.localModelInitialJudgement.hasRealUser,
          one_liner: record.localModelInitialJudgement.oneLinerZh,
        },
        corrected_output: {
          target_users: record.moneyPriority.targetUsersZh,
        },
        error_tags: errorTags,
        teaching_notes: this.takeUnique(
          [
            ...(record.trainingHints?.ruleSuggestions ?? []),
            ...(record.trainingHints?.promptSuggestions ?? []),
          ],
          10,
        ),
      };
    }

    if (task === 'monetization') {
      if (!errorTags.some((tag) => tag.includes('monetization'))) {
        return null;
      }
      return {
        task,
        repo_context: {
          full_name: record.repository.fullName,
          description: record.repository.description,
          readme_summary: record.contentSummary.readmeSummary,
          target_users: record.moneyPriority.targetUsersZh,
        },
        bad_local_output: {
          has_direct_monetization: record.localModelInitialJudgement.isDirectlyMonetizable,
          one_liner: record.localModelInitialJudgement.oneLinerZh,
        },
        corrected_output: {
          monetization_summary: record.moneyPriority.monetizationSummaryZh,
        },
        error_tags: errorTags,
        teaching_notes: this.takeUnique(
          [
            ...(record.trainingHints?.ruleSuggestions ?? []),
            ...record.auditContext.problemReasons,
          ],
          10,
        ),
      };
    }

    if (
      record.finalFusion.verdict === record.localModelInitialJudgement.verdict &&
      record.finalFusion.action === record.localModelInitialJudgement.action
    ) {
      return null;
    }

    return {
      task,
      repo_context: {
        full_name: record.repository.fullName,
        description: record.repository.description,
        readme_summary: record.contentSummary.readmeSummary,
        local_reason: record.localModelInitialJudgement.reason,
      },
      bad_local_output: {
        verdict: record.localModelInitialJudgement.verdict,
        action: record.localModelInitialJudgement.action,
      },
      corrected_output: {
        verdict: record.finalFusion.verdict,
        action: record.finalFusion.action,
        reason: record.finalFusion.reason,
      },
      error_tags: errorTags,
      teaching_notes: this.takeUnique(
        [
          ...(record.trainingHints?.ruleSuggestions ?? []),
          ...(record.trainingHints?.promptSuggestions ?? []),
        ],
        10,
      ),
    };
  }

  private buildWeeklyAuditMarkdown(
    records: TrainingKnowledgeRecord[],
    context: {
      latestAudit: TrainingKnowledgeAuditReport | null;
      latestHints: ClaudeTrainingHintsAggregate | null;
      latestKnowledge: AnalysisTrainingKnowledge | null;
      moneyLearning: MoneyLearningKnowledge | null;
      exportedAt: string;
    },
  ) {
    const validation = this.buildValidationSummary(records);
    const audit = context.latestAudit;

    return [
      `# 周度 Audit 摘要 - ${this.toIsoWeekLabel(context.exportedAt)}`,
      '',
      `- 生成时间：${context.exportedAt}`,
      `- 总样本数：${records.length}`,
      `- 系统偏差：${this.cleanText(audit?.overallBias?.direction, 40) || 'unknown'}`,
      `- 高优先 headline：${this.cleanText(audit?.highPriorityHeadline, 180) || '无'}`,
      '',
      '## Claude audit 总结',
      '',
      this.cleanText(audit?.summary, 500) || '暂无 audit 摘要。',
      '',
      '## 高频误判',
      '',
      ...(context.latestKnowledge?.topMistakeTypes ?? [])
        .slice(0, 6)
        .map((item) => `- ${item.type}：${item.count}`),
      '',
      '## 高频 money 错误',
      '',
      ...(context.moneyLearning?.topMistakeTypes ?? [])
        .slice(0, 6)
        .map((item) => `- ${item.type}：${item.count}`),
      '',
      '## 高频 diff',
      '',
      ...(context.latestHints?.diffSummary?.topDiffTypes ?? [])
        .slice(0, 6)
        .map((item) => `- ${item.type}：${item.count}（${item.exampleFullNames.join(' / ')}）`),
      '',
      '## 建议优先复看的仓库',
      '',
      ...validation.highConflict.slice(0, 8).map((fullName) => `- ${fullName}`),
      '',
      '## 最新建议动作',
      '',
      ...this.normalizeRecommendedActions(audit?.recommendedActions)
        .slice(0, 6)
        .map((item) => `- [${item.priority}] ${item.action}：${item.reason}`),
      '',
    ].join('\n');
  }

  private buildMistakePatternMarkdown(
    slug: string,
    definition: MistakePatternDefinition,
    records: TrainingKnowledgeRecord[],
    context: {
      latestKnowledge: AnalysisTrainingKnowledge | null;
      moneyLearning: MoneyLearningKnowledge | null;
    },
  ) {
    const matched = records.filter(definition.match);
    const examples = matched.slice(0, 8);
    const ruleSuggestions = this.countStrings(
      matched.flatMap((record) => record.trainingHints?.ruleSuggestions ?? []),
    ).slice(0, 5);
    const promptSuggestions = this.countStrings(
      matched.flatMap((record) => record.trainingHints?.promptSuggestions ?? []),
    ).slice(0, 5);
    const anchorSuggestions = this.countStrings(
      matched.flatMap((record) => record.trainingHints?.anchorSuggestions ?? []),
    ).slice(0, 5);

    return [
      `# ${definition.title}`,
      '',
      '## 定义',
      '',
      definition.definition,
      '',
      `## 当前导出中命中的案例数`,
      '',
      `- ${matched.length}`,
      '',
      '## 典型案例',
      '',
      ...(examples.length
        ? examples.map(
            (record) =>
              `- ${record.repository.fullName}：本地=${record.localModelInitialJudgement.verdict ?? 'UNKNOWN'} ${record.localModelInitialJudgement.action ?? ''} / Claude=${record.claudeReview?.verdict ?? 'N/A'} ${record.claudeReview?.action ?? ''} / 最终=${record.finalFusion.verdict ?? 'UNKNOWN'} ${record.finalFusion.action ?? ''}`,
          )
        : ['- 当前样本中暂无明确案例。']),
      '',
      '## Claude 如何纠正',
      '',
      ...(ruleSuggestions.length
        ? ruleSuggestions.map((item) => `- 规则建议：${item.value}（${item.count}）`)
        : ['- 这批样本里还没有足够多的规则建议。']),
      ...(promptSuggestions.length
        ? promptSuggestions.map((item) => `- Prompt 建议：${item.value}（${item.count}）`)
        : []),
      '',
      '## 建议如何教本地模型',
      '',
      ...definition.teachingAdvice.map((item) => `- ${item}`),
      ...(anchorSuggestions.length
        ? anchorSuggestions.map((item) => `- Few-shot anchor：${item.value}（${item.count}）`)
        : []),
      '',
      '## 可参考的全局聚合',
      '',
      `- analysis.training_knowledge 高频错误：${(context.latestKnowledge?.topMistakeTypes ?? [])
        .map((item) => `${item.type}(${item.count})`)
        .join(' / ') || '无'}`,
      `- analysis.money_learning 高频错误：${(context.moneyLearning?.topMistakeTypes ?? [])
        .map((item) => `${item.type}(${item.count})`)
        .join(' / ') || '无'}`,
      '',
      `> mistake slug: ${slug}`,
      '',
    ].join('\n');
  }

  private buildRepoCaseMarkdown(record: TrainingKnowledgeRecord) {
    return [
      `# ${record.repository.fullName}`,
      '',
      `- 仓库链接：${record.repository.htmlUrl}`,
      `- 导出时间：${record.exportedAt}`,
      `- 来源阶段：${record.sourceStages.join(' / ') || 'none'}`,
      `- 挣钱优先级：${record.moneyPriority.moneyDecisionLabelZh} / ${record.moneyPriority.score}`,
      '',
      '## Repo 基础信息',
      '',
      `- 描述：${record.repository.description || '无'}`,
      `- README 摘要：${record.contentSummary.readmeSummary || '无'}`,
      `- 语言：${record.repository.language || '未知'}`,
      `- Stars：${record.repository.stars}`,
      `- Topics：${record.repository.topics.join(' / ') || '无'}`,
      '',
      '## 本地模型初判',
      '',
      `- 一句话：${record.localModelInitialJudgement.oneLinerZh}`,
      `- 判断：${record.localModelInitialJudgement.verdict || 'UNKNOWN'} / ${
        record.localModelInitialJudgement.action || 'UNKNOWN'
      }`,
      `- 类型：${record.localModelInitialJudgement.projectType || 'unknown'}`,
      `- 原因：${record.localModelInitialJudgement.reason || '无'}`,
      '',
      '## Claude 复核',
      '',
      `- 一句话：${record.claudeReview?.oneLinerZh || '无 Claude 复核'}`,
      `- 判断：${record.claudeReview?.verdict || 'N/A'} / ${record.claudeReview?.action || 'N/A'}`,
      `- 类型：${record.claudeReview?.projectType || 'N/A'}`,
      `- 原因：${record.claudeReview?.reason || '无'}`,
      '',
      '## 最终融合结果',
      '',
      `- 一句话：${record.finalFusion.oneLinerZh}`,
      `- 判断：${record.finalFusion.verdict || 'UNKNOWN'} / ${record.finalFusion.action || 'UNKNOWN'}`,
      `- 类型：${record.finalFusion.projectType || 'unknown'}`,
      `- 来源：${record.finalFusion.source}`,
      `- 原因：${record.finalFusion.reason || '无'}`,
      '',
      '## 差异与学习点',
      '',
      `- diffTypes：${record.diff.diffTypes.join(' / ') || '无'}`,
      `- fallback replay diff：${record.diff.fallbackReplayReasons.join(' / ') || '无'}`,
      `- conflict score：${record.diff.conflictScore}`,
      `- training mistakes：${record.trainingHints?.localModelMistakes.join(' / ') || '无'}`,
      '',
      '## Audit 视角',
      '',
      `- 最新 audit headline：${record.auditContext.headline || '无'}`,
      `- 是否需要复看：${record.auditContext.repositoriesNeedingReview ? '是' : '否'}`,
      `- 问题类型：${record.auditContext.problemTypes.join(' / ') || '无'}`,
      `- 问题原因：${record.auditContext.problemReasons.join(' / ') || '无'}`,
      '',
      '## 人工标注预留',
      '',
      `- human_verified: ${String(record.humanFields.human_verified)}`,
      `- human_label: ${record.humanFields.human_label ?? 'null'}`,
      `- human_note: ${record.humanFields.human_note ?? 'null'}`,
      `- is_training_worthy: ${String(record.humanFields.is_training_worthy)}`,
      `- is_hard_case: ${String(record.humanFields.is_hard_case)}`,
      '',
    ].join('\n');
  }

  private pickNotableCases(records: TrainingKnowledgeRecord[], includeFullNames: string[]) {
    const explicit = includeFullNames
      .map((fullName) => records.find((record) => record.repository.fullName === fullName))
      .filter((record): record is TrainingKnowledgeRecord => Boolean(record));
    const highConflict = [...records]
      .filter((record) => record.tags.isHighConflict)
      .sort((left, right) => right.diff.conflictScore - left.diff.conflictScore)
      .slice(0, 6);
    const positives = [...records]
      .filter((record) => record.tags.isHighValuePositive)
      .sort((left, right) => right.moneyPriority.score - left.moneyPriority.score)
      .slice(0, 5);
    const negatives = [...records]
      .filter((record) => record.tags.isHardNegative)
      .sort((left, right) => right.moneyPriority.score - left.moneyPriority.score)
      .slice(0, 5);

    return this.takeUnique(
      [...explicit, ...highConflict, ...positives, ...negatives],
      18,
      (record) => record.repository.id,
    );
  }

  private buildValidationSummary(records: TrainingKnowledgeRecord[]) {
    const janusLike = this.takeUnique(
      records
        .filter((record) =>
          /(janus|modelweaver|multimodal|diffusion|llm|model)/i.test(
            `${record.repository.fullName} ${record.repository.description ?? ''} ${
              record.finalFusion.projectType ?? ''
            }`,
          ),
        )
        .map((record) => record.repository.fullName),
      6,
    );
    const template = this.takeUnique(
      records
        .filter((record) =>
          /(template|starter|scaffold|boilerplate|demo)/i.test(
            `${record.repository.fullName} ${record.repository.description ?? ''} ${record.repository.topics.join(
              ' ',
            )}`,
          ),
        )
        .map((record) => record.repository.fullName),
      6,
    );
    const realTool = this.takeUnique(
      records
        .filter(
          (record) =>
            record.finalFusion.projectType === 'tool' &&
            ['MUST_LOOK', 'WORTH_BUILDING', 'WORTH_CLONING'].includes(
              record.moneyPriority.tier,
            ),
        )
        .map((record) => record.repository.fullName),
      6,
    );
    const highConflict = this.takeUnique(
      records
        .filter((record) => record.tags.isHighConflict)
        .sort((left, right) => right.diff.conflictScore - left.diff.conflictScore)
        .map((record) => record.repository.fullName),
      6,
    );
    const auditHotspots = this.takeUnique(
      records
        .filter(
          (record) =>
            record.auditContext.repositoriesNeedingReview ||
            record.auditContext.problemTypes.length > 0,
        )
        .map((record) => record.repository.fullName),
      6,
    );

    return {
      janusLike,
      template,
      realTool,
      highConflict,
      auditHotspots,
    };
  }

  private getMistakePatternDefinitions(): Record<string, MistakePatternDefinition> {
    return {
      capability_as_product: {
        title: 'capability_as_product',
        definition:
          '本地模型把模型能力层、infra 能力层、路由层或框架能力，当成了可直接卖的产品机会。',
        teachingAdvice: [
          '把“能力层”和“产品层”分开判断，先问是否有明确用户和清晰使用边界。',
          '遇到 router / provider / proxy / framework / SDK / gateway 这类词时，先默认是能力层，再看是否有真实产品包装。',
        ],
        match: (record) =>
          record.diff.diffTypes.includes('product_vs_model_mismatch') ||
          record.trainingHints?.localModelMistakes.includes('model_or_infra_leakage') === true ||
          record.auditContext.problemTypes.includes('capability_as_product'),
      },
      template_detection_missed: {
        title: 'template_detection_missed',
        definition:
          '本地模型没有识别出 starter / template / scaffold / boilerplate，导致把脚手架看成产品机会。',
        teachingAdvice: [
          '在 prompt 里强化 template/starter/scaffold/boilerplate 词汇的负向判断。',
          '在启发式层里把 README、topics、仓库名中的模板信号拉高权重。',
        ],
        match: (record) =>
          record.trainingHints?.localModelMistakes.includes('template_detection_missed') === true ||
          record.auditContext.problemTypes.includes('template_detection_missed') ||
          /(template|starter|scaffold|boilerplate)/i.test(record.repository.fullName),
      },
      one_liner_drift: {
        title: 'one_liner_drift',
        definition:
          '本地模型的一句话总结跑偏，写成了泛泛而谈的技术摘要，缺少“谁在用、在做什么”。',
        teachingAdvice: [
          '强制 one-liner 模板遵守“谁 + 做什么 + 在什么场景”的结构。',
          '把“帮助提升效率”“一个工具”这类空话加入反例 anchor。',
        ],
        match: (record) =>
          record.diff.diffTypes.includes('one_liner_drift') ||
          record.trainingHints?.localModelMistakes.includes('one_liner_drift') === true,
      },
      tool_as_clone: {
        title: 'tool_as_clone',
        definition:
          '本地模型把真实工具机会压成了只值得借鉴，通常发生在 developer tool / workflow tool / API tool 上。',
        teachingAdvice: [
          '只要用户明确、工作流痛点明确、边界清楚，就不要因为未验证收费而自动压成 CLONE。',
          '给 devtool / workflow / API tool 增加正向 few-shot anchors。',
        ],
        match: (record) =>
          record.trainingHints?.localModelMistakes.includes('tool_as_clone') === true ||
          record.auditContext.problemTypes.includes('tool_as_clone') ||
          (record.localModelInitialJudgement.action === 'CLONE' &&
            record.claudeReview?.action === 'BUILD'),
      },
      too_strict_on_early_monetization: {
        title: 'too_strict_on_early_monetization',
        definition:
          '本地模型对早期工具过于严格，要求已经验证商业闭环，导致把还不错的产品苗子压低。',
        teachingAdvice: [
          '早期工具不要求已经验证付费闭环，但必须有人、场景、边界和合理收费可能性。',
          '把“合理的付费路径”与“已验证收入”分开建模。',
        ],
        match: (record) =>
          record.trainingHints?.localModelMistakes.includes('monetization_overstrict') === true ||
          record.auditContext.problemTypes.includes('too_strict_on_early_monetization') ||
          record.aggregateSignals.topMoneyMistakes.includes('monetization_missed'),
      },
      model_or_infra_leakage: {
        title: 'model_or_infra_leakage',
        definition:
          '本地模型放跑了 model / infra / framework / router / provider 这类项目，让它们进入了本不该进入的高优先区。',
        teachingAdvice: [
          '把 model / infra / framework / router / provider / fallback layer 继续作为默认降权对象。',
          '只在出现明确产品边界、明确目标用户和收费路径时，才允许从能力层翻盘。',
        ],
        match: (record) =>
          record.trainingHints?.localModelMistakes.includes('model_or_infra_leakage') === true ||
          record.auditContext.problemTypes.includes('model_or_infra_leakage') ||
          record.diff.diffTypes.includes('product_vs_model_mismatch'),
      },
    };
  }

  private isHighConflict(
    diffTypes: string[],
    trainingHints: TrainingKnowledgeRecord['trainingHints'],
    fallbackReplayReasons: string[],
  ) {
    return (
      diffTypes.length >= 2 ||
      fallbackReplayReasons.length > 0 ||
      Boolean(trainingHints?.shouldUpdateLocalHeuristics)
    );
  }

  private isHighValuePositive(
    moneyPriority: MoneyPriorityResult,
    finalVerdict: InsightVerdict | null,
    finalAction: InsightAction | null,
  ) {
    return (
      ['MUST_LOOK', 'WORTH_BUILDING'].includes(moneyPriority.tier) &&
      ['MUST_BUILD', 'HIGH_VALUE'].includes(moneyPriority.moneyDecision) &&
      finalVerdict !== 'BAD' &&
      finalAction === 'BUILD'
    );
  }

  private isHardNegative(
    moneyPriority: MoneyPriorityResult,
    finalVerdict: InsightVerdict | null,
    finalAction: InsightAction | null,
  ) {
    return (
      ['LOW_PRIORITY', 'IGNORE'].includes(moneyPriority.tier) ||
      ['LOW_VALUE', 'IGNORE'].includes(moneyPriority.moneyDecision) ||
      finalVerdict === 'BAD' ||
      finalAction === 'IGNORE'
    );
  }

  private resolveFinalSource(
    analysis: ExportRepositoryTarget['analysis'],
    claudeReview: JsonObject | null,
    insight: JsonObject | null,
    snapshot: JsonObject | null,
  ) {
    if (analysis?.manualVerdict || analysis?.manualAction) {
      return 'manual_override' as const;
    }

    if (claudeReview) {
      return this.cleanText(claudeReview.generatedBy, 40) === 'local_fallback'
        ? ('local_fallback' as const)
        : ('claude_review' as const);
    }

    if (insight) {
      return 'insight' as const;
    }

    return snapshot ? ('snapshot_fallback' as const) : ('insight' as const);
  }

  private normalizeTrainingHints(value: unknown) {
    const object = this.readObject(value);
    if (!object) {
      return null;
    }

    return {
      localModelMistakes: this.normalizeStringArray(object.localModelMistakes).slice(0, 12),
      ruleSuggestions: this.normalizeStringArray(object.ruleSuggestions).slice(0, 12),
      promptSuggestions: this.normalizeStringArray(object.promptSuggestions).slice(0, 12),
      anchorSuggestions: this.normalizeStringArray(object.anchorSuggestions).slice(0, 12),
      shouldUpdateLocalHeuristics: Boolean(object.shouldUpdateLocalHeuristics),
    };
  }

  private normalizeProblemTypes(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.readObject(item))
      .filter((item): item is JsonObject => item !== null)
      .map((item) => ({
        type: this.cleanText(item.type, 80),
        examples: Array.isArray(item.examples)
          ? item.examples
              .map((example) => this.readObject(example))
              .filter((example): example is JsonObject => example !== null)
          : [],
      }))
      .filter((item) => Boolean(item.type));
  }

  private matchAuditProblem(
    repository: ExportRepositoryTarget,
    problem: {
      type: string;
      examples: JsonObject[];
    },
  ) {
    const matches = problem.examples.filter((example) => {
      const repositoryId = this.cleanText(example.repositoryId, 80);
      const fullName = this.cleanText(example.fullName, 160);
      return repositoryId === repository.id || fullName === repository.fullName;
    });
    if (!matches.length) {
      return null;
    }

    return {
      type: problem.type,
      reasons: this.takeUnique(
        matches.map((item) => this.cleanText(item.reason, 260)).filter(Boolean),
        6,
      ),
    };
  }

  private normalizeRecommendedActions(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.readObject(item))
      .filter((item): item is JsonObject => item !== null)
      .map((item) => ({
        priority: this.cleanText(item.priority, 20),
        action: this.cleanText(item.action, 140),
        reason: this.cleanText(item.reason, 220),
      }))
      .filter((item) => Boolean(item.action));
  }

  private async ensureDirectoryStructure(outputDir: string) {
    await Promise.all([
      fs.mkdir(outputDir, { recursive: true }),
      fs.mkdir(join(outputDir, 'weekly-audits'), { recursive: true }),
      fs.mkdir(join(outputDir, 'mistake-patterns'), { recursive: true }),
      fs.mkdir(join(outputDir, 'repo-cases'), { recursive: true }),
      fs.mkdir(join(outputDir, 'datasets'), { recursive: true }),
    ]);
  }

  private buildReadmeSummary(value: unknown) {
    const text = this.cleanText(value, 1600);
    if (!text) {
      return null;
    }

    return text
      .replace(/[#>*`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);
  }

  private async writeJsonl(pathname: string, rows: unknown[]) {
    const content = rows.map((row) => JSON.stringify(row)).join('\n');
    await fs.writeFile(pathname, content ? `${content}\n` : '', 'utf8');
    return pathname;
  }

  private async writeText(pathname: string, content: string) {
    await fs.writeFile(pathname, `${content.trimEnd()}\n`, 'utf8');
    return pathname;
  }

  private normalizeVerdict(value: unknown): InsightVerdict | null {
    const text = this.cleanText(value, 20).toUpperCase();
    if (text === 'GOOD' || text === 'OK' || text === 'BAD') {
      return text;
    }

    return null;
  }

  private normalizeAction(value: unknown): InsightAction | null {
    const text = this.cleanText(value, 20).toUpperCase();
    if (text === 'BUILD' || text === 'CLONE' || text === 'IGNORE') {
      return text;
    }

    return null;
  }

  private normalizeProjectType(value: unknown): ProjectType | null {
    const text = this.cleanText(value, 20).toLowerCase();
    if (
      text === 'product' ||
      text === 'tool' ||
      text === 'model' ||
      text === 'infra' ||
      text === 'demo'
    ) {
      return text;
    }

    return null;
  }

  private normalizeConfidence(value: unknown) {
    const numberValue = this.toNumber(value);
    if (numberValue === null) {
      return null;
    }

    return Number(Math.max(0, Math.min(1, numberValue)).toFixed(3));
  }

  private readObject(value: unknown): JsonObject | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as JsonObject;
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.cleanText(item, 260))
      .filter(Boolean);
  }

  private cleanText(value: unknown, maxLength: number) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value).trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  private cleanNullableText(value: unknown, maxLength: number) {
    const text = this.cleanText(value, maxLength);
    return text || null;
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
      try {
        const result = (value as { toNumber: () => number }).toNumber();
        return Number.isFinite(result) ? result : null;
      } catch {
        return null;
      }
    }

    return null;
  }

  private readBooleanMaybe(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    return null;
  }

  private countStrings(values: string[]) {
    const counts = new Map<string, number>();
    for (const value of values) {
      const key = this.cleanText(value, 220);
      if (!key) {
        continue;
      }

      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([value, count]) => ({
        value,
        count,
      }));
  }

  private takeUnique<T>(
    values: T[],
    limit: number,
    keySelector?: (value: T) => string,
  ) {
    const result: T[] = [];
    const seen = new Set<string>();

    for (const value of values) {
      const key =
        keySelector?.(value) ??
        (typeof value === 'string' ? value : JSON.stringify(value));
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(value);
      if (result.length >= limit) {
        break;
      }
    }

    return result;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }

  private toIsoWeekLabel(value: string) {
    const date = new Date(value);
    const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = normalized.getUTCDay() || 7;
    normalized.setUTCDate(normalized.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((normalized.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${normalized.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  private toTimestamp(value: Date | string | null | undefined) {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === 'string' && value.trim()) {
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) ? timestamp : 0;
    }

    return 0;
  }
}
