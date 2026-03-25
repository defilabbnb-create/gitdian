import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const ANALYSIS_TRAINING_KNOWLEDGE_CONFIG_KEY = 'analysis.training_knowledge';

export type LocalAnalysisTaskType =
  | 'idea_snapshot'
  | 'completeness'
  | 'idea_fit'
  | 'idea_extract';

export type LocalPromptEnvelope = {
  promptVersion: string;
  systemPrompt: string;
  prompt: string;
  schemaHint: string;
};

export type AnalysisTrainingMistakeType =
  | 'one_liner_drift'
  | 'template_detection_missed'
  | 'tool_as_clone'
  | 'early_project_as_good'
  | 'monetization_overstrict'
  | 'model_or_infra_leakage'
  | 'fallback_gap';

type CountedValue = {
  value: string;
  count: number;
};

type TrainingKnowledgeReviewRecord = {
  repositoryId: string;
  fullName: string;
  reviewedAt: string | null;
  generatedBy: string;
  localModelMistakes: AnalysisTrainingMistakeType[];
  ruleSuggestions: string[];
  promptSuggestions: string[];
  anchorSuggestions: string[];
  diffTypes: string[];
  fallbackDiff: {
    changed: boolean;
    reasons: string[];
  };
};

export type AnalysisTrainingKnowledge = {
  generatedAt: string;
  reason: string | null;
  sampleSize: number;
  reviewedCount: number;
  topMistakeTypes: Array<{
    type: AnalysisTrainingMistakeType;
    count: number;
    rate: number;
  }>;
  ruleSuggestions: CountedValue[];
  promptSuggestions: CountedValue[];
  anchorSuggestions: CountedValue[];
  promptEnhancements: {
    global: string[];
    byTask: Record<LocalAnalysisTaskType, string[]>;
  };
  fewShotAnchors: {
    global: string[];
    byTask: Record<LocalAnalysisTaskType, string[]>;
  };
  heuristicAdjustments: {
    templateDetectionBoost: number;
    modelInfraLeakageBoost: number;
    toolBoundaryBoost: number;
    monetizationRelief: number;
    earlyGoodGuard: number;
    genericOneLinerGuard: number;
    fallbackGapBoost: number;
  };
  confidenceCalibration: {
    globalPenalty: number;
    projectTypePenalties: Record<'product' | 'tool' | 'model' | 'infra' | 'demo', number>;
    signalPenalties: {
      templateLike: number;
      capabilityLeakage: number;
      genericOneLiner: number;
      fallbackGap: number;
    };
  };
  fallbackLearning: {
    reviewedCount: number;
    gapCount: number;
    topGapRepositories: Array<{
      repositoryId: string;
      fullName: string;
      reasons: string[];
      reviewedAt: string | null;
    }>;
  };
};

@Injectable()
export class AnalysisTrainingKnowledgeService {
  private readonly logger = new Logger(AnalysisTrainingKnowledgeService.name);
  private refreshInFlight: Promise<AnalysisTrainingKnowledge> | null = null;
  private lastRefreshStartedAt = 0;
  private cachedKnowledge: AnalysisTrainingKnowledge | null = null;
  private cacheLoadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  isEnabled() {
    return this.readBoolean('ANALYSIS_TRAINING_KNOWLEDGE_ENABLED', true);
  }

  async getLatestKnowledge(options?: {
    forceRefresh?: boolean;
  }): Promise<AnalysisTrainingKnowledge | null> {
    if (!this.isEnabled()) {
      return null;
    }

    if (!options?.forceRefresh && this.cachedKnowledge && Date.now() - this.cacheLoadedAt < 60_000) {
      return this.cachedKnowledge;
    }

    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: ANALYSIS_TRAINING_KNOWLEDGE_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object' || Array.isArray(row.configValue)) {
      return null;
    }

    const knowledge = this.normalizeStoredKnowledge(row.configValue);
    this.cachedKnowledge = knowledge;
    this.cacheLoadedAt = Date.now();
    return knowledge;
  }

  async getLatestKnowledgeBrief() {
    const knowledge = await this.getLatestKnowledge();
    if (!knowledge) {
      return null;
    }

    return {
      generatedAt: knowledge.generatedAt,
      reviewedCount: knowledge.reviewedCount,
      topMistakes: knowledge.topMistakeTypes.slice(0, 4),
      topPromptEnhancements: knowledge.promptEnhancements.global.slice(0, 3),
      topHeuristicAdjustments: knowledge.ruleSuggestions.slice(0, 3),
    };
  }

  scheduleRefresh(reason = 'review_updated') {
    if (!this.isEnabled()) {
      return;
    }

    const minIntervalMs = this.readInt(
      'ANALYSIS_TRAINING_KNOWLEDGE_MIN_REFRESH_INTERVAL_MS',
      5 * 60 * 1_000,
    );

    if (this.refreshInFlight || Date.now() - this.lastRefreshStartedAt < minIntervalMs) {
      return;
    }

    void this.refreshLatestKnowledge({
      reason,
    }).catch((error) => {
      this.logger.warn(
        `analysis_training_knowledge refresh skipped reason=${reason} error=${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    });
  }

  async refreshLatestKnowledge(options?: {
    sampleSize?: number;
    reason?: string;
    force?: boolean;
  }): Promise<AnalysisTrainingKnowledge> {
    if (this.refreshInFlight && !options?.force) {
      return this.refreshInFlight;
    }

    this.lastRefreshStartedAt = Date.now();

    const task = this.buildKnowledge(options)
      .then(async (knowledge) => {
        await this.prisma.systemConfig.upsert({
          where: {
            configKey: ANALYSIS_TRAINING_KNOWLEDGE_CONFIG_KEY,
          },
          update: {
            configValue: knowledge as unknown as Prisma.InputJsonValue,
          },
          create: {
            configKey: ANALYSIS_TRAINING_KNOWLEDGE_CONFIG_KEY,
            configValue: knowledge as unknown as Prisma.InputJsonValue,
          },
        });

        this.cachedKnowledge = knowledge;
        this.cacheLoadedAt = Date.now();
        return knowledge;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    this.refreshInFlight = task;
    return task;
  }

  async enhancePrompt<T extends LocalPromptEnvelope>(
    taskType: LocalAnalysisTaskType,
    prompt: T,
  ): Promise<T> {
    const knowledge = await this.getLatestKnowledge();
    if (!knowledge) {
      return prompt;
    }

    const taskLines = knowledge.promptEnhancements.byTask[taskType] ?? [];
    const anchorLines = knowledge.fewShotAnchors.byTask[taskType] ?? [];
    const globalPromptLines = knowledge.promptEnhancements.global.slice(0, 4);
    const globalAnchorLines = knowledge.fewShotAnchors.global.slice(0, 3);
    const overlayLines = [
      'Learning overlay from recent Claude corrections:',
      ...globalPromptLines.map((line) => `- ${line}`),
      ...taskLines.map((line) => `- ${line}`),
      'Anchor reminders:',
      ...globalAnchorLines.map((line) => `- ${line}`),
      ...anchorLines.map((line) => `- ${line}`),
    ];

    const effectivePromptVersion = `${prompt.promptVersion}+knowledge`;

    return {
      ...prompt,
      promptVersion: effectivePromptVersion,
      systemPrompt: `${prompt.systemPrompt}\n\nUse the latest learning overlay to stay aligned with recent Claude corrections.`,
      prompt: `${prompt.prompt}\n\n${overlayLines.join('\n')}`,
    };
  }

  async getHeuristicAdjustments() {
    const knowledge = await this.getLatestKnowledge();
    return (
      knowledge?.heuristicAdjustments ?? {
        templateDetectionBoost: 0,
        modelInfraLeakageBoost: 0,
        toolBoundaryBoost: 0,
        monetizationRelief: 0,
        earlyGoodGuard: 0,
        genericOneLinerGuard: 0,
        fallbackGapBoost: 0,
      }
    );
  }

  async getConfidenceCalibration() {
    const knowledge = await this.getLatestKnowledge();
    return (
      knowledge?.confidenceCalibration ?? {
        globalPenalty: 0,
        projectTypePenalties: {
          product: 0,
          tool: 0,
          model: 0,
          infra: 0,
          demo: 0,
        },
        signalPenalties: {
          templateLike: 0,
          capabilityLeakage: 0,
          genericOneLiner: 0,
          fallbackGap: 0,
        },
      }
    );
  }

  async buildSnapshotEnhancement<T extends {
    oneLinerZh: string;
    isPromising: boolean;
    reason: string;
    toolLike: boolean;
    nextAction: 'KEEP' | 'SKIP' | 'DEEP_ANALYZE';
  }>(options: {
    repository: {
      name: string;
      fullName: string;
      description: string | null;
      topics: string[];
      content?: {
        readmeText?: string | null;
      } | null;
    };
    output: T;
  }): Promise<T> {
    const knowledge = await this.getLatestKnowledge();
    if (!knowledge) {
      return options.output;
    }

    const haystack = this.buildRepositoryHaystack(options.repository);
    const output = { ...options.output };
    const genericOneLiner = this.isGenericOneLiner(output.oneLinerZh);
    const templateLike = this.looksTemplateLike(haystack);
    const capabilityLike = this.looksCapabilityLike(haystack);

    if (knowledge.heuristicAdjustments.templateDetectionBoost >= 0.18 && templateLike) {
      output.isPromising = false;
      output.toolLike = false;
      output.nextAction = 'SKIP';
      output.reason = this.cleanText(
        output.reason || '模板或脚手架信号明显，先不按产品机会继续推进。',
        220,
      );
    }

    if (
      knowledge.heuristicAdjustments.modelInfraLeakageBoost >= 0.18 &&
      capabilityLike &&
      output.nextAction === 'DEEP_ANALYZE'
    ) {
      output.nextAction = 'KEEP';
      output.reason = this.cleanText(
        `${output.reason || '能力层信号偏强'} 更像底层能力或框架，先保留观察，不直接拔高。`,
        220,
      );
    }

    if (knowledge.heuristicAdjustments.genericOneLinerGuard >= 0.18 && genericOneLiner) {
      output.oneLinerZh = this.buildSpecificOneLiner(options.repository);
    }

    return output;
  }

  async buildIdeaFitEnhancement(options: {
    repository: {
      name: string;
      fullName: string;
      description: string | null;
      topics: string[];
      content?: {
        readmeText?: string | null;
      } | null;
      analysis?: {
        extractedIdeaJson?: Prisma.JsonValue | null;
      } | null;
    };
    output: {
      ideaFitScore: number;
      opportunityLevel: 'S' | 'A' | 'B' | 'C';
      decision: string;
      coreJudgement: string;
      scores: {
        realDemand: number;
        toolProductization: number;
        monetization: number;
        competitiveBreakthrough: number;
        timingTailwind: number;
        executionFeasibility: number;
        founderFit: number;
      };
      negativeFlags: string[];
      opportunityTags: string[];
    };
  }) {
    const knowledge = await this.getLatestKnowledge();
    if (!knowledge) {
      return options.output;
    }

    const output = {
      ...options.output,
      scores: {
        ...options.output.scores,
      },
      negativeFlags: [...options.output.negativeFlags],
      opportunityTags: [...options.output.opportunityTags],
    };
    const haystack = this.buildRepositoryHaystack(options.repository);
    const templateLike = this.looksTemplateLike(haystack);
    const capabilityLike = this.looksCapabilityLike(haystack);
    const qualifiedDeveloperTool = this.looksQualifiedDeveloperTool(
      haystack,
      options.repository.analysis?.extractedIdeaJson,
    );

    if (knowledge.heuristicAdjustments.templateDetectionBoost >= 0.18 && templateLike) {
      output.ideaFitScore = Math.min(output.ideaFitScore, 35);
      output.opportunityLevel = 'C';
      output.decision = '更像模板或脚手架，不应作为优先创业机会';
      output.negativeFlags = this.pushUnique(
        output.negativeFlags,
        '模板/脚手架信号明显',
      ).slice(0, 5);
    }

    if (knowledge.heuristicAdjustments.modelInfraLeakageBoost >= 0.18 && capabilityLike) {
      output.ideaFitScore = Math.min(output.ideaFitScore, 52);
      output.opportunityLevel = output.opportunityLevel === 'S' || output.opportunityLevel === 'A'
        ? 'B'
        : output.opportunityLevel;
      output.decision = '更像能力层或基础设施，适合借鉴，不宜高估为直接产品机会';
      output.negativeFlags = this.pushUnique(
        output.negativeFlags,
        '能力层/框架属性偏强',
      ).slice(0, 5);
    }

    if (
      knowledge.heuristicAdjustments.monetizationRelief >= 0.18 &&
      qualifiedDeveloperTool
    ) {
      output.scores.monetization = Math.max(output.scores.monetization, 58);
      output.scores.toolProductization = Math.max(
        output.scores.toolProductization,
        64,
      );
      output.ideaFitScore = Math.min(
        100,
        output.ideaFitScore + 4,
      );
      output.opportunityTags = this.pushUnique(
        output.opportunityTags,
        'developer-workflow',
      ).slice(0, 6);
    }

    if (
      knowledge.heuristicAdjustments.earlyGoodGuard >= 0.18 &&
      !qualifiedDeveloperTool &&
      !templateLike &&
      !capabilityLike &&
      !this.hasExplicitUserAndUseCase(haystack)
    ) {
      output.ideaFitScore = Math.max(0, output.ideaFitScore - 8);
      output.negativeFlags = this.pushUnique(
        output.negativeFlags,
        '用户与使用场景仍偏模糊',
      ).slice(0, 5);
      if (output.opportunityLevel === 'S') {
        output.opportunityLevel = 'A';
      } else if (output.opportunityLevel === 'A') {
        output.opportunityLevel = 'B';
      }
    }

    return output;
  }

  async buildIdeaExtractEnhancement<T extends {
    ideaSummary: string;
    problem: string;
    solution: string;
    targetUsers: string[];
    monetization: string;
    confidence: number;
  }>(options: {
    repository: {
      name: string;
      fullName: string;
      description: string | null;
      topics: string[];
      content?: {
        readmeText?: string | null;
      } | null;
    };
    output: T;
  }): Promise<T> {
    const knowledge = await this.getLatestKnowledge();
    if (!knowledge) {
      return options.output;
    }

    const output = {
      ...options.output,
      targetUsers: [...options.output.targetUsers],
    };

    if (
      knowledge.heuristicAdjustments.genericOneLinerGuard >= 0.18 &&
      this.isGenericOneLiner(output.ideaSummary)
    ) {
      output.ideaSummary = this.buildSpecificIdeaSummary(
        options.repository,
        output.targetUsers,
      );
    }

    if (
      knowledge.heuristicAdjustments.monetizationRelief >= 0.18 &&
      !this.cleanText(output.monetization, 220) &&
      output.targetUsers.length > 0 &&
      this.looksQualifiedDeveloperTool(this.buildRepositoryHaystack(options.repository), null)
    ) {
      output.monetization =
        '可先从团队订阅、托管版、审计能力或高级工作流功能收费。';
    }

    return output;
  }

  private async buildKnowledge(options?: {
    sampleSize?: number;
    reason?: string;
  }): Promise<AnalysisTrainingKnowledge> {
    const sampleSize = Math.max(
      20,
      Math.min(
        options?.sampleSize ??
          this.readInt('ANALYSIS_TRAINING_KNOWLEDGE_SAMPLE_SIZE', 120),
        240,
      ),
    );
    const analyses = await this.prisma.repositoryAnalysis.findMany({
      where: {
        claudeReviewStatus: 'SUCCESS',
        claudeReviewReviewedAt: {
          not: null,
        },
      },
      select: {
        repositoryId: true,
        claudeReviewReviewedAt: true,
        claudeReviewJson: true,
        repository: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: {
        claudeReviewReviewedAt: 'desc',
      },
      take: Math.min(sampleSize * 3, 480),
    });

    const records = analyses
      .map((analysis) => this.toTrainingKnowledgeRecord(analysis))
      .filter((item): item is TrainingKnowledgeReviewRecord => item !== null)
      .slice(0, sampleSize);

    const mistakeCounts = this.countStrings(
      records.flatMap((item) => item.localModelMistakes),
    )
      .map((item) => ({
        type: item.value as AnalysisTrainingMistakeType,
        count: item.count,
        rate: records.length ? Number((item.count / records.length).toFixed(3)) : 0,
      }))
      .filter((item): item is AnalysisTrainingKnowledge['topMistakeTypes'][number] =>
        this.isKnownMistakeType(item.type),
      );
    const ruleSuggestions = this.countStrings(
      records.flatMap((item) => item.ruleSuggestions),
    );
    const promptSuggestions = this.countStrings(
      records.flatMap((item) => item.promptSuggestions),
    );
    const anchorSuggestions = this.countStrings(
      records.flatMap((item) => item.anchorSuggestions),
    );
    const topMistakeSet = new Set(mistakeCounts.map((item) => item.type));
    const fallbackGapRecords = records.filter((item) => item.fallbackDiff.changed);

    return {
      generatedAt: new Date().toISOString(),
      reason: this.cleanNullableText(options?.reason, 80),
      sampleSize,
      reviewedCount: records.length,
      topMistakeTypes: mistakeCounts.slice(0, 8),
      ruleSuggestions,
      promptSuggestions,
      anchorSuggestions,
      promptEnhancements: this.buildPromptEnhancements(
        topMistakeSet,
        promptSuggestions,
      ),
      fewShotAnchors: this.buildFewShotAnchors(
        topMistakeSet,
        anchorSuggestions,
      ),
      heuristicAdjustments: this.buildHeuristicAdjustments(mistakeCounts),
      confidenceCalibration: this.buildConfidenceCalibration(mistakeCounts),
      fallbackLearning: {
        reviewedCount: records.filter((item) => item.generatedBy === 'local_fallback').length,
        gapCount: fallbackGapRecords.length,
        topGapRepositories: fallbackGapRecords
          .sort((left, right) => right.fallbackDiff.reasons.length - left.fallbackDiff.reasons.length)
          .slice(0, 10)
          .map((item) => ({
            repositoryId: item.repositoryId,
            fullName: item.fullName,
            reasons: item.fallbackDiff.reasons.slice(0, 4),
            reviewedAt: item.reviewedAt,
          })),
      },
    };
  }

  private toTrainingKnowledgeRecord(analysis: {
    repositoryId: string;
    claudeReviewReviewedAt: Date | null;
    claudeReviewJson: Prisma.JsonValue | null;
    repository: {
      fullName: string;
    };
  }): TrainingKnowledgeReviewRecord | null {
    const review = this.readJsonObject(analysis.claudeReviewJson);
    if (!review) {
      return null;
    }

    const trainingHints = this.readJsonObject(review.trainingHints);
    const reviewDiff = this.readJsonObject(review.reviewDiff);
    const fallbackDiff = this.readJsonObject(review.fallbackDiff);
    const directMistakes = this.normalizeStringArray(trainingHints?.localModelMistakes)
      .map((item) => this.normalizeMistakeType(item))
      .filter((item): item is AnalysisTrainingMistakeType => item !== null);
    const diffMistakes = this.normalizeStringArray(reviewDiff?.diffTypes)
      .map((item) => this.mapDiffTypeToMistakeType(item))
      .filter((item): item is AnalysisTrainingMistakeType => item !== null);
    const fallbackGap = Boolean(fallbackDiff?.changed);
    const mistakes = Array.from(
      new Set([
        ...directMistakes,
        ...diffMistakes,
        ...(fallbackGap ? (['fallback_gap'] as AnalysisTrainingMistakeType[]) : []),
      ]),
    );

    return {
      repositoryId: analysis.repositoryId,
      fullName: analysis.repository.fullName,
      reviewedAt: analysis.claudeReviewReviewedAt?.toISOString() ?? null,
      generatedBy: this.cleanText(review.generatedBy, 40) || 'claude',
      localModelMistakes: mistakes,
      ruleSuggestions: this.normalizeStringArray(trainingHints?.ruleSuggestions).slice(0, 8),
      promptSuggestions: this.normalizeStringArray(trainingHints?.promptSuggestions).slice(0, 8),
      anchorSuggestions: this.normalizeStringArray(trainingHints?.anchorSuggestions).slice(0, 8),
      diffTypes: this.normalizeStringArray(reviewDiff?.diffTypes).slice(0, 8),
      fallbackDiff: {
        changed: fallbackGap,
        reasons: this.normalizeStringArray(fallbackDiff?.reasons).slice(0, 6),
      },
    };
  }

  private normalizeStoredKnowledge(value: unknown): AnalysisTrainingKnowledge | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const byTaskDefaults = this.emptyTaskStringMap();

    return {
      generatedAt: this.cleanText(record.generatedAt, 40) || new Date().toISOString(),
      reason: this.cleanNullableText(record.reason, 80),
      sampleSize: this.readIntLike(record.sampleSize, 0),
      reviewedCount: this.readIntLike(record.reviewedCount, 0),
      topMistakeTypes: this.readJsonArray(record.topMistakeTypes)
        .map((item) => this.readJsonObject(item))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map((item) => ({
          type: this.normalizeMistakeType(item.type) ?? 'one_liner_drift',
          count: this.readIntLike(item.count, 0),
          rate: this.readNumberLike(item.rate, 0),
        })),
      ruleSuggestions: this.normalizeCountedValues(record.ruleSuggestions),
      promptSuggestions: this.normalizeCountedValues(record.promptSuggestions),
      anchorSuggestions: this.normalizeCountedValues(record.anchorSuggestions),
      promptEnhancements: {
        global: this.normalizeStringArray(this.readJsonObject(record.promptEnhancements)?.global),
        byTask: {
          idea_snapshot:
            this.normalizeStringArray(
              this.readJsonObject(this.readJsonObject(record.promptEnhancements)?.byTask)?.idea_snapshot,
            ) || byTaskDefaults.idea_snapshot,
          completeness:
            this.normalizeStringArray(
              this.readJsonObject(this.readJsonObject(record.promptEnhancements)?.byTask)?.completeness,
            ) || byTaskDefaults.completeness,
          idea_fit:
            this.normalizeStringArray(
              this.readJsonObject(this.readJsonObject(record.promptEnhancements)?.byTask)?.idea_fit,
            ) || byTaskDefaults.idea_fit,
          idea_extract:
            this.normalizeStringArray(
              this.readJsonObject(this.readJsonObject(record.promptEnhancements)?.byTask)?.idea_extract,
            ) || byTaskDefaults.idea_extract,
        },
      },
      fewShotAnchors: {
        global: this.normalizeStringArray(this.readJsonObject(record.fewShotAnchors)?.global),
        byTask: {
          idea_snapshot:
            this.normalizeStringArray(
              this.readJsonObject(this.readJsonObject(record.fewShotAnchors)?.byTask)?.idea_snapshot,
            ) || byTaskDefaults.idea_snapshot,
          completeness:
            this.normalizeStringArray(
              this.readJsonObject(this.readJsonObject(record.fewShotAnchors)?.byTask)?.completeness,
            ) || byTaskDefaults.completeness,
          idea_fit:
            this.normalizeStringArray(
              this.readJsonObject(this.readJsonObject(record.fewShotAnchors)?.byTask)?.idea_fit,
            ) || byTaskDefaults.idea_fit,
          idea_extract:
            this.normalizeStringArray(
              this.readJsonObject(this.readJsonObject(record.fewShotAnchors)?.byTask)?.idea_extract,
            ) || byTaskDefaults.idea_extract,
        },
      },
      heuristicAdjustments: {
        templateDetectionBoost: this.readNumberLike(
          this.readJsonObject(record.heuristicAdjustments)?.templateDetectionBoost,
          0,
        ),
        modelInfraLeakageBoost: this.readNumberLike(
          this.readJsonObject(record.heuristicAdjustments)?.modelInfraLeakageBoost,
          0,
        ),
        toolBoundaryBoost: this.readNumberLike(
          this.readJsonObject(record.heuristicAdjustments)?.toolBoundaryBoost,
          0,
        ),
        monetizationRelief: this.readNumberLike(
          this.readJsonObject(record.heuristicAdjustments)?.monetizationRelief,
          0,
        ),
        earlyGoodGuard: this.readNumberLike(
          this.readJsonObject(record.heuristicAdjustments)?.earlyGoodGuard,
          0,
        ),
        genericOneLinerGuard: this.readNumberLike(
          this.readJsonObject(record.heuristicAdjustments)?.genericOneLinerGuard,
          0,
        ),
        fallbackGapBoost: this.readNumberLike(
          this.readJsonObject(record.heuristicAdjustments)?.fallbackGapBoost,
          0,
        ),
      },
      confidenceCalibration: {
        globalPenalty: this.readNumberLike(
          this.readJsonObject(record.confidenceCalibration)?.globalPenalty,
          0,
        ),
        projectTypePenalties: {
          product: this.readNumberLike(
            this.readJsonObject(this.readJsonObject(record.confidenceCalibration)?.projectTypePenalties)?.product,
            0,
          ),
          tool: this.readNumberLike(
            this.readJsonObject(this.readJsonObject(record.confidenceCalibration)?.projectTypePenalties)?.tool,
            0,
          ),
          model: this.readNumberLike(
            this.readJsonObject(this.readJsonObject(record.confidenceCalibration)?.projectTypePenalties)?.model,
            0,
          ),
          infra: this.readNumberLike(
            this.readJsonObject(this.readJsonObject(record.confidenceCalibration)?.projectTypePenalties)?.infra,
            0,
          ),
          demo: this.readNumberLike(
            this.readJsonObject(this.readJsonObject(record.confidenceCalibration)?.projectTypePenalties)?.demo,
            0,
          ),
        },
        signalPenalties: {
          templateLike: this.readNumberLike(
            this.readJsonObject(this.readJsonObject(record.confidenceCalibration)?.signalPenalties)?.templateLike,
            0,
          ),
          capabilityLeakage: this.readNumberLike(
            this.readJsonObject(this.readJsonObject(record.confidenceCalibration)?.signalPenalties)?.capabilityLeakage,
            0,
          ),
          genericOneLiner: this.readNumberLike(
            this.readJsonObject(this.readJsonObject(record.confidenceCalibration)?.signalPenalties)?.genericOneLiner,
            0,
          ),
          fallbackGap: this.readNumberLike(
            this.readJsonObject(this.readJsonObject(record.confidenceCalibration)?.signalPenalties)?.fallbackGap,
            0,
          ),
        },
      },
      fallbackLearning: {
        reviewedCount: this.readIntLike(
          this.readJsonObject(record.fallbackLearning)?.reviewedCount,
          0,
        ),
        gapCount: this.readIntLike(
          this.readJsonObject(record.fallbackLearning)?.gapCount,
          0,
        ),
        topGapRepositories: this.readJsonArray(
          this.readJsonObject(record.fallbackLearning)?.topGapRepositories,
        )
          .map((item) => this.readJsonObject(item))
          .filter((item): item is Record<string, unknown> => item !== null)
          .map((item) => ({
            repositoryId: this.cleanText(item.repositoryId, 64),
            fullName: this.cleanText(item.fullName, 160),
            reasons: this.normalizeStringArray(item.reasons).slice(0, 6),
            reviewedAt: this.cleanNullableText(item.reviewedAt, 40),
          })),
      },
    };
  }

  private buildPromptEnhancements(
    mistakes: Set<AnalysisTrainingMistakeType>,
    promptSuggestions: CountedValue[],
  ) {
    const global = new Set<string>();
    const byTask = this.emptyTaskStringMap();

    if (mistakes.has('one_liner_drift')) {
      global.add('中文一句话必须写出谁在用、在做什么、产物是什么，禁止“一个工具/提效工具”这种空话。');
      byTask.idea_snapshot.push('snapshot 的一句话必须先说目标用户，再说具体任务。');
      byTask.idea_extract.push('ideaSummary 要写成“谁 + 做什么 + 交付什么”的产品句子。');
    }

    if (mistakes.has('template_detection_missed')) {
      global.add('如果仓库明显是 template、starter、boilerplate、scaffold、demo、reference implementation，默认按非产品处理。');
      byTask.idea_snapshot.push('遇到模板或脚手架时，nextAction 默认不要给 DEEP_ANALYZE。');
      byTask.idea_fit.push('模板/脚手架/教程类仓库即使 stars 高，也不要给高创业评分。');
    }

    if (mistakes.has('tool_as_clone')) {
      global.add('developer tools、workflow tools、API tools 只要用户、场景、边界清晰，不要因为早期或未验证收费就自动压成 CLONE。');
      byTask.idea_fit.push('对 developer workflow 工具，先判断用户和工作流边界，再判断商业成熟度。');
      byTask.idea_extract.push('对明确工具切口，写出现实的产品化路径，而不是只写技术复刻。');
    }

    if (mistakes.has('early_project_as_good')) {
      global.add('不要因为技术亮点、stars 或完成度高就提前给高判断，必须先确认用户、场景和收费可能。');
      byTask.idea_fit.push('当用户、场景、收费路径仍模糊时，即使技术强也不要给 S/A。');
    }

    if (mistakes.has('monetization_overstrict')) {
      global.add('早期工具项目不要求已验证收费闭环，但必须存在现实的收费可能。');
      byTask.idea_fit.push('对于 devtool/workflow/API 工具，只要收费路径合理，就不要把 monetization 打得过低。');
    }

    if (mistakes.has('model_or_infra_leakage')) {
      global.add('model、infra framework、router/proxy/provider/fallback layer 默认不是直接产品机会。');
      byTask.idea_snapshot.push('若仓库更像模型能力层或框架能力层，优先按能力层而不是产品处理。');
      byTask.idea_fit.push('能力层项目可以有技术价值，但不应直接高估为可卖产品。');
    }

    for (const suggestion of promptSuggestions.slice(0, 4)) {
      global.add(this.cleanText(suggestion.value, 200));
    }

    return {
      global: Array.from(global).slice(0, 8),
      byTask: {
        idea_snapshot: byTask.idea_snapshot.slice(0, 6),
        completeness: byTask.completeness.slice(0, 4),
        idea_fit: byTask.idea_fit.slice(0, 6),
        idea_extract: byTask.idea_extract.slice(0, 6),
      },
    };
  }

  private buildFewShotAnchors(
    mistakes: Set<AnalysisTrainingMistakeType>,
    anchorSuggestions: CountedValue[],
  ) {
    const global = new Set<string>();
    const byTask = this.emptyTaskStringMap();

    if (mistakes.has('tool_as_clone') || mistakes.has('monetization_overstrict')) {
      const line =
        'GOOD anchor: 一个给研发团队做代码审查、审批、审计或部署协作的工作流工具，即使还早期，也可视为可产品化方向。';
      global.add(line);
      byTask.idea_fit.push(line);
      byTask.idea_extract.push(line);
    }

    if (mistakes.has('model_or_infra_leakage')) {
      const line =
        'CLONE anchor: 多模型路由、provider proxy、agent framework、MCP framework 这类能力层更适合借鉴，不宜直接当成产品机会。';
      global.add(line);
      byTask.idea_snapshot.push(line);
      byTask.idea_fit.push(line);
    }

    if (mistakes.has('template_detection_missed')) {
      const line =
        'CLONE anchor: starter、boilerplate、scaffold、reference implementation、demo 默认按模板/示例看待。';
      global.add(line);
      byTask.idea_snapshot.push(line);
    }

    if (mistakes.has('early_project_as_good')) {
      const line =
        'CLONE anchor: 技术亮眼但用户、场景、收费路径仍模糊的早期项目，不要直接拔高到最优先。';
      global.add(line);
      byTask.idea_fit.push(line);
    }

    for (const suggestion of anchorSuggestions.slice(0, 4)) {
      global.add(this.cleanText(suggestion.value, 180));
    }

    return {
      global: Array.from(global).slice(0, 8),
      byTask: {
        idea_snapshot: byTask.idea_snapshot.slice(0, 5),
        completeness: byTask.completeness.slice(0, 3),
        idea_fit: byTask.idea_fit.slice(0, 5),
        idea_extract: byTask.idea_extract.slice(0, 5),
      },
    };
  }

  private buildHeuristicAdjustments(
    mistakeCounts: Array<{
      type: AnalysisTrainingMistakeType;
      count: number;
      rate: number;
    }>,
  ) {
    const count = (type: AnalysisTrainingMistakeType) =>
      mistakeCounts.find((item) => item.type === type)?.count ?? 0;

    return {
      templateDetectionBoost: this.clampWeight(0.14 + count('template_detection_missed') * 0.08),
      modelInfraLeakageBoost: this.clampWeight(0.12 + count('model_or_infra_leakage') * 0.08),
      toolBoundaryBoost: this.clampWeight(
        0.1 + Math.max(count('tool_as_clone'), count('monetization_overstrict')) * 0.07,
      ),
      monetizationRelief: this.clampWeight(0.08 + count('monetization_overstrict') * 0.09),
      earlyGoodGuard: this.clampWeight(0.08 + count('early_project_as_good') * 0.08),
      genericOneLinerGuard: this.clampWeight(0.1 + count('one_liner_drift') * 0.08),
      fallbackGapBoost: this.clampWeight(0.06 + count('fallback_gap') * 0.08),
    };
  }

  private buildConfidenceCalibration(
    mistakeCounts: Array<{
      type: AnalysisTrainingMistakeType;
      count: number;
      rate: number;
    }>,
  ) {
    const adjustments = this.buildHeuristicAdjustments(mistakeCounts);

    return {
      globalPenalty: Number(
        Math.min(
          0.16,
          adjustments.earlyGoodGuard * 0.08 +
            adjustments.modelInfraLeakageBoost * 0.06,
        ).toFixed(3),
      ),
      projectTypePenalties: {
        product: Number((adjustments.earlyGoodGuard * 0.04).toFixed(3)),
        tool: Number((adjustments.toolBoundaryBoost * 0.03).toFixed(3)),
        model: Number((adjustments.modelInfraLeakageBoost * 0.1).toFixed(3)),
        infra: Number((adjustments.modelInfraLeakageBoost * 0.1).toFixed(3)),
        demo: Number((adjustments.templateDetectionBoost * 0.12).toFixed(3)),
      },
      signalPenalties: {
        templateLike: Number((0.04 + adjustments.templateDetectionBoost * 0.12).toFixed(3)),
        capabilityLeakage: Number((0.03 + adjustments.modelInfraLeakageBoost * 0.12).toFixed(3)),
        genericOneLiner: Number((0.03 + adjustments.genericOneLinerGuard * 0.1).toFixed(3)),
        fallbackGap: Number((0.02 + adjustments.fallbackGapBoost * 0.08).toFixed(3)),
      },
    };
  }

  private normalizeMistakeType(value: unknown): AnalysisTrainingMistakeType | null {
    const normalized = String(value ?? '').trim().toLowerCase();

    if (normalized === 'one_liner_drift') {
      return 'one_liner_drift';
    }

    if (normalized === 'template_detection_missed') {
      return 'template_detection_missed';
    }

    if (
      normalized === 'tool_as_framework' ||
      normalized === 'tool_as_clone'
    ) {
      return 'tool_as_clone';
    }

    if (
      normalized === 'too_strict_on_early_monetization' ||
      normalized === 'monetization_overstrict'
    ) {
      return 'monetization_overstrict';
    }

    if (
      normalized === 'capability_as_product' ||
      normalized === 'model_or_infra_leakage'
    ) {
      return 'model_or_infra_leakage';
    }

    if (normalized === 'early_project_as_good') {
      return 'early_project_as_good';
    }

    if (normalized === 'fallback_gap') {
      return 'fallback_gap';
    }

    return null;
  }

  private mapDiffTypeToMistakeType(value: unknown): AnalysisTrainingMistakeType | null {
    const normalized = String(value ?? '').trim();

    if (normalized === 'one_liner_drift') {
      return 'one_liner_drift';
    }

    if (normalized === 'local_good_claude_ok') {
      return 'early_project_as_good';
    }

    if (normalized === 'product_vs_model_mismatch') {
      return 'model_or_infra_leakage';
    }

    if (normalized === 'category_mismatch') {
      return 'tool_as_clone';
    }

    return null;
  }

  private isKnownMistakeType(value: string): value is AnalysisTrainingMistakeType {
    return (
      value === 'one_liner_drift' ||
      value === 'template_detection_missed' ||
      value === 'tool_as_clone' ||
      value === 'early_project_as_good' ||
      value === 'monetization_overstrict' ||
      value === 'model_or_infra_leakage' ||
      value === 'fallback_gap'
    );
  }

  private countStrings(values: string[]) {
    const counts = new Map<string, number>();

    for (const value of values.map((item) => item.trim()).filter((item) => Boolean(item))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value: this.cleanText(value, 220),
        count,
      }))
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
      .slice(0, 12);
  }

  private buildRepositoryHaystack(repository: {
    name: string;
    fullName: string;
    description: string | null;
    topics: string[];
    content?: {
      readmeText?: string | null;
    } | null;
  }) {
    return [
      repository.name,
      repository.fullName,
      repository.description,
      ...(repository.topics ?? []),
      repository.content?.readmeText,
    ]
      .map((item) => String(item ?? '').toLowerCase())
      .join('\n');
  }

  private looksTemplateLike(haystack: string) {
    return /(template|starter|boilerplate|scaffold|reference implementation|demo project|sample project|course project|tutorial)/i.test(
      haystack,
    );
  }

  private looksCapabilityLike(haystack: string) {
    return /(framework|sdk|library|proxy|gateway|router|provider|orchestration|model runtime|serving stack|routing layer|mcp server framework|agent framework|inference engine|fallback layer)/i.test(
      haystack,
    );
  }

  private looksQualifiedDeveloperTool(
    haystack: string,
    extractedIdeaJson: Prisma.JsonValue | null | undefined,
  ) {
    const extractedIdea = this.readJsonObject(extractedIdeaJson);
    const targetUsers = this.normalizeStringArray(extractedIdea?.targetUsers);
    const hasDeveloperUser =
      targetUsers.length > 0 ||
      /(developer|developers|engineer|engineering|platform team|devops|ops|reviewer|开发者|工程师|研发团队|平台团队)/i.test(
        haystack,
      );
    const hasWorkflowBoundary =
      /(workflow|approval|review|diff|monitor|dashboard|guardrail|automation|api|sdk|cli|terminal|pull request|code review|audit|协作|审批|审查|工作流|自动化)/i.test(
        haystack,
      );

    return hasDeveloperUser && hasWorkflowBoundary;
  }

  private hasExplicitUserAndUseCase(haystack: string) {
    const hasUser =
      /(developer|developers|team|teams|operator|operators|customer|customers|founder|marketer|designer|analyst|开发者|团队|企业|运营|商家|创作者)/i.test(
        haystack,
      );
    const hasUseCase =
      /(workflow|approval|review|deploy|monitor|debug|search|sync|integration|automation|scrape|etl|dashboard|auth|协作|审批|部署|监控|同步|集成|自动化)/i.test(
        haystack,
      );

    return hasUser && hasUseCase;
  }

  private buildSpecificOneLiner(repository: {
    name: string;
    fullName: string;
    description: string | null;
    topics: string[];
    content?: {
      readmeText?: string | null;
    } | null;
  }) {
    const haystack = this.buildRepositoryHaystack(repository);
    const target = /(developer|developers|engineer|engineering|开发者|工程师)/i.test(haystack)
      ? '开发者'
      : /(team|teams|团队|平台团队)/i.test(haystack)
        ? '团队'
        : '目标用户';
    const action = /(review|code review|diff|approval|审查|审批)/i.test(haystack)
      ? '处理代码审查与审批'
      : /(deploy|deployment|release|发布|部署)/i.test(haystack)
        ? '处理部署与发布流程'
        : /(monitor|observability|监控|告警)/i.test(haystack)
          ? '处理监控与排障'
          : /(search|retrieval|搜索|检索)/i.test(haystack)
            ? '完成检索与信息整理'
            : /(automation|workflow|自动化|工作流)/i.test(haystack)
              ? '串起自动化工作流'
              : '完成明确任务';

    return `一个帮${target}${action}的工具`;
  }

  private buildSpecificIdeaSummary(
    repository: {
      name: string;
      fullName: string;
      description: string | null;
      topics: string[];
      content?: {
        readmeText?: string | null;
      } | null;
    },
    targetUsers: string[],
  ) {
    const target = this.cleanText(targetUsers[0], 30) || '开发者团队';
    const oneLiner = this.buildSpecificOneLiner(repository);
    return oneLiner.replace('一个帮', `一个面向${target}、帮`).replace(/的工具$/, '的产品机会');
  }

  private isGenericOneLiner(value: string) {
    const normalized = String(value ?? '').trim().toLowerCase();
    const genericPhrases = [
      '一个工具',
      '一个项目',
      '工具项目',
      '开源工具',
      '提效工具',
      '效率工具',
      '帮助用户提效',
    ];

    return (
      normalized.length < 10 ||
      genericPhrases.some(
        (phrase) => normalized === phrase || normalized.includes(`${phrase} `),
      )
    );
  }

  private clampWeight(value: number) {
    return Number(Math.max(0, Math.min(0.95, value)).toFixed(3));
  }

  private emptyTaskStringMap() {
    return {
      idea_snapshot: [] as string[],
      completeness: [] as string[],
      idea_fit: [] as string[],
      idea_extract: [] as string[],
    };
  }

  private normalizeCountedValues(value: unknown) {
    return this.readJsonArray(value)
      .map((item) => this.readJsonObject(item))
      .filter((item): item is Record<string, unknown> => item !== null)
      .map((item) => ({
        value: this.cleanText(item.value, 220),
        count: this.readIntLike(item.count, 0),
      }))
      .filter((item) => Boolean(item.value));
  }

  private readJsonObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readJsonArray(value: unknown) {
    return Array.isArray(value) ? value : [];
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .map((item) => String(item ?? '').trim())
      .filter((item) => Boolean(item));
  }

  private pushUnique(values: string[], value: string) {
    if (!values.includes(value)) {
      values.push(value);
    }

    return values;
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

  private readNumberLike(value: unknown, fallback: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : fallback;
  }
}
