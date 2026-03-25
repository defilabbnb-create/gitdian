import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const MONEY_LEARNING_CONFIG_KEY = 'analysis.money_learning';

export type MoneyMistakeType =
  | 'false_positive_good'
  | 'false_negative_clone'
  | 'infra_misclassified'
  | 'template_missed'
  | 'monetization_missed'
  | 'user_clarity_missed';

export type MoneyMistakeReason =
  | 'no_real_user'
  | 'no_payment_path'
  | 'infra_misclassified'
  | 'template_missed'
  | 'weak_pain_point'
  | 'small_team_unfriendly'
  | 'workflow_underestimated';

type CountedValue = {
  value: string;
  count: number;
};

type MoneyLearningReviewRecord = {
  repositoryId: string;
  fullName: string;
  reviewedAt: string | null;
  localVerdict: 'GOOD' | 'OK' | 'BAD';
  localAction: 'BUILD' | 'CLONE' | 'IGNORE';
  claudeVerdict: 'GOOD' | 'OK' | 'BAD';
  claudeAction: 'BUILD' | 'CLONE' | 'IGNORE';
  moneyDecision: 'MUST_BUILD' | 'BUILDABLE' | 'CLONE_ONLY' | 'NOT_WORTH';
  mistakeTypes: MoneyMistakeType[];
  reasons: MoneyMistakeReason[];
};

export type MoneyLearningKnowledge = {
  generatedAt: string;
  reason: string | null;
  sampleSize: number;
  reviewedCount: number;
  topMistakeTypes: Array<{
    type: MoneyMistakeType;
    count: number;
    rate: number;
  }>;
  topReasons: CountedValue[];
  promptReinforcements: string[];
  heuristicAdjustments: {
    clearUserBoost: number;
    clearUseCaseBoost: number;
    painPointBoost: number;
    monetizationBoost: number;
    repeatUsageBoost: number;
    smallTeamBuildableBoost: number;
    infraPenaltyBoost: number;
    templatePenaltyBoost: number;
    falsePositiveGoodPenalty: number;
    cloneableReliefBoost: number;
  };
  confidenceAdjustments: {
    globalDiscount: number;
    projectTypeDiscounts: {
      product: number;
      tool: number;
      model: number;
      infra: number;
      demo: number;
    };
    decisionDiscounts: {
      mustBuild: number;
      highValue: number;
      cloneable: number;
    };
  };
  repositoriesNeedingReview: Array<{
    repositoryId: string;
    fullName: string;
    mistakeTypes: MoneyMistakeType[];
    reasons: MoneyMistakeReason[];
    reviewedAt: string | null;
  }>;
};

type MoneySignalAdjustments = MoneyLearningKnowledge['heuristicAdjustments'];

type MoneyLearningBrief = {
  generatedAt: string;
  reviewedCount: number;
  topMistakes: Array<{
    type: MoneyMistakeType;
    count: number;
    rate: number;
  }>;
  promptReinforcements: string[];
};

@Injectable()
export class MoneyLearningService implements OnModuleInit {
  private readonly logger = new Logger(MoneyLearningService.name);
  private refreshInFlight: Promise<MoneyLearningKnowledge> | null = null;
  private lastRefreshStartedAt = 0;
  private cachedLearning: MoneyLearningKnowledge | null = null;
  private cacheLoadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (!this.isEnabled()) {
      return;
    }

    try {
      await this.getLatestLearning();
    } catch (error) {
      this.logger.warn(
        `money_learning warmup failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  isEnabled() {
    return this.readBoolean('ANALYSIS_MONEY_LEARNING_ENABLED', true);
  }

  getCachedAdjustments(): MoneySignalAdjustments {
    return (
      this.cachedLearning?.heuristicAdjustments ?? {
        clearUserBoost: 0,
        clearUseCaseBoost: 0,
        painPointBoost: 0,
        monetizationBoost: 0,
        repeatUsageBoost: 0,
        smallTeamBuildableBoost: 0,
        infraPenaltyBoost: 0,
        templatePenaltyBoost: 0,
        falsePositiveGoodPenalty: 0,
        cloneableReliefBoost: 0,
      }
    );
  }

  getCachedConfidenceAdjustments() {
    return (
      this.cachedLearning?.confidenceAdjustments ?? {
        globalDiscount: 0,
        projectTypeDiscounts: {
          product: 0,
          tool: 0,
          model: 0,
          infra: 0,
          demo: 0,
        },
        decisionDiscounts: {
          mustBuild: 0,
          highValue: 0,
          cloneable: 0,
        },
      }
    );
  }

  async getLatestLearning(options?: {
    forceRefresh?: boolean;
  }): Promise<MoneyLearningKnowledge | null> {
    if (!this.isEnabled()) {
      return null;
    }

    if (
      !options?.forceRefresh &&
      this.cachedLearning &&
      Date.now() - this.cacheLoadedAt < 60_000
    ) {
      return this.cachedLearning;
    }

    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: MONEY_LEARNING_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object' || Array.isArray(row.configValue)) {
      return null;
    }

    const learning = this.normalizeStoredLearning(row.configValue);
    this.cachedLearning = learning;
    this.cacheLoadedAt = Date.now();
    return learning;
  }

  async getLatestLearningBrief(): Promise<MoneyLearningBrief | null> {
    const learning = await this.getLatestLearning();
    if (!learning) {
      return null;
    }

    return {
      generatedAt: learning.generatedAt,
      reviewedCount: learning.reviewedCount,
      topMistakes: learning.topMistakeTypes.slice(0, 4),
      promptReinforcements: learning.promptReinforcements.slice(0, 4),
    };
  }

  scheduleRefresh(reason = 'claude_review_saved') {
    if (!this.isEnabled()) {
      return;
    }

    const minIntervalMs = this.readInt(
      'ANALYSIS_MONEY_LEARNING_MIN_REFRESH_INTERVAL_MS',
      5 * 60 * 1_000,
    );

    if (
      this.refreshInFlight ||
      Date.now() - this.lastRefreshStartedAt < minIntervalMs
    ) {
      return;
    }

    void this.refreshLatestLearning({
      reason,
    }).catch((error) => {
      this.logger.warn(
        `money_learning refresh skipped reason=${reason} error=${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    });
  }

  async refreshLatestLearning(options?: {
    sampleSize?: number;
    reason?: string;
    force?: boolean;
  }): Promise<MoneyLearningKnowledge> {
    if (this.refreshInFlight && !options?.force) {
      return this.refreshInFlight;
    }

    this.lastRefreshStartedAt = Date.now();

    const task = this.buildLearning(options)
      .then(async (learning) => {
        await this.prisma.systemConfig.upsert({
          where: {
            configKey: MONEY_LEARNING_CONFIG_KEY,
          },
          update: {
            configValue: learning as unknown as Prisma.InputJsonValue,
          },
          create: {
            configKey: MONEY_LEARNING_CONFIG_KEY,
            configValue: learning as unknown as Prisma.InputJsonValue,
          },
        });

        this.cachedLearning = learning;
        this.cacheLoadedAt = Date.now();
        return learning;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    this.refreshInFlight = task;
    return task;
  }

  private async buildLearning(options?: {
    sampleSize?: number;
    reason?: string;
  }): Promise<MoneyLearningKnowledge> {
    const sampleSize = Math.max(
      24,
      Math.min(
        options?.sampleSize ??
          this.readInt('ANALYSIS_MONEY_LEARNING_SAMPLE_SIZE', 140),
        280,
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
        insightJson: true,
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
      .map((analysis) => this.toLearningRecord(analysis))
      .filter((item): item is MoneyLearningReviewRecord => item !== null)
      .slice(0, sampleSize);

    const mistakeCounts = this.countStrings(
      records.flatMap((item) => item.mistakeTypes),
    )
      .map((item) => ({
        type: item.value as MoneyMistakeType,
        count: item.count,
        rate: records.length ? Number((item.count / records.length).toFixed(3)) : 0,
      }))
      .filter((item): item is MoneyLearningKnowledge['topMistakeTypes'][number] =>
        this.isMoneyMistakeType(item.type),
      );
    const reasonCounts = this.countStrings(records.flatMap((item) => item.reasons));

    return {
      generatedAt: new Date().toISOString(),
      reason: this.cleanNullableText(options?.reason, 80),
      sampleSize,
      reviewedCount: records.length,
      topMistakeTypes: mistakeCounts.slice(0, 8),
      topReasons: reasonCounts.slice(0, 8),
      promptReinforcements: this.buildPromptReinforcements(
        mistakeCounts,
        reasonCounts,
      ),
      heuristicAdjustments: this.buildHeuristicAdjustments(
        records.length,
        mistakeCounts,
        reasonCounts,
      ),
      confidenceAdjustments: this.buildConfidenceAdjustments(
        records.length,
        mistakeCounts,
      ),
      repositoriesNeedingReview: records
        .filter((item) => item.mistakeTypes.length > 0)
        .slice(0, 16)
        .map((item) => ({
          repositoryId: item.repositoryId,
          fullName: item.fullName,
          mistakeTypes: item.mistakeTypes,
          reasons: item.reasons,
          reviewedAt: item.reviewedAt,
        })),
    };
  }

  private toLearningRecord(analysis: {
    repositoryId: string;
    claudeReviewReviewedAt: Date | null;
    claudeReviewJson: Prisma.JsonValue | null;
    insightJson: Prisma.JsonValue | null;
    repository: {
      fullName: string;
    };
  }): MoneyLearningReviewRecord | null {
    const claude = this.readObject(analysis.claudeReviewJson);
    if (!claude) {
      return null;
    }

    const insight = this.readObject(analysis.insightJson);
    const localVerdict = this.normalizeVerdict(insight?.verdict) ?? 'BAD';
    const localAction = this.normalizeAction(insight?.action) ?? 'IGNORE';
    const claudeVerdict = this.normalizeVerdict(claude.verdict) ?? 'BAD';
    const claudeAction = this.normalizeAction(claude.action) ?? 'IGNORE';
    const moneyDecision = this.normalizeMoneyDecision(
      claude.moneyDecision ??
        this.readObject(claude.businessJudgement)?.moneyPriorityHint,
    );
    const projectType = this.cleanText(claude.projectType, 20).toLowerCase();
    const hasRealUser = this.toBoolean(claude.hasRealUser) ?? false;
    const hasClearUseCase = this.toBoolean(claude.hasClearUseCase) ?? false;
    const businessJudgement = this.readObject(claude.businessJudgement);
    const businessSignals = this.readObject(claude.businessSignals);
    const hasMonetizationPath =
      this.toBoolean(businessJudgement?.hasNearTermMonetizationPath) ??
      (this.cleanText(businessSignals?.willingnessToPay, 20).toLowerCase() !==
        'low' &&
        Boolean(this.cleanText(businessSignals?.monetizationModel, 120)));
    const buildDifficulty = this.cleanText(
      businessSignals?.buildDifficulty,
      20,
    ).toLowerCase();
    const reasonText = [
      this.cleanText(claude.reason, 220),
      this.cleanText(claude.whyNotProduct, 180),
      ...this.normalizeStringArray(claude.reviewNotes).slice(0, 4),
    ]
      .join('\n')
      .toLowerCase();

    const reasons: MoneyMistakeReason[] = [];
    const mistakeTypes: MoneyMistakeType[] = [];

    if (!hasRealUser) {
      reasons.push('no_real_user');
    }

    if (!hasClearUseCase || reasonText.includes('场景不清')) {
      reasons.push('weak_pain_point');
    }

    if (!hasMonetizationPath) {
      reasons.push('no_payment_path');
    }

    if (
      projectType === 'model' ||
      projectType === 'infra' ||
      reasonText.includes('能力层') ||
      reasonText.includes('基础设施')
    ) {
      reasons.push('infra_misclassified');
    }

    if (
      projectType === 'demo' ||
      reasonText.includes('模板') ||
      reasonText.includes('脚手架') ||
      reasonText.includes('演示')
    ) {
      reasons.push('template_missed');
    }

    if (
      buildDifficulty === 'high' ||
      this.toBoolean(businessSignals?.founderFit) === false
    ) {
      reasons.push('small_team_unfriendly');
    }

    if (
      moneyDecision === 'MUST_BUILD' ||
      moneyDecision === 'BUILDABLE'
    ) {
      if (!(localVerdict === 'GOOD' && localAction === 'BUILD')) {
        mistakeTypes.push('false_negative_clone');
      }

      if (
        localAction === 'CLONE' ||
        localAction === 'IGNORE' ||
        localVerdict !== 'GOOD'
      ) {
        reasons.push('workflow_underestimated');
      }
    }

    if (
      localVerdict === 'GOOD' &&
      localAction === 'BUILD' &&
      (moneyDecision === 'CLONE_ONLY' || moneyDecision === 'NOT_WORTH')
    ) {
      mistakeTypes.push('false_positive_good');
    }

    if (
      projectType === 'infra' ||
      projectType === 'model'
    ) {
      mistakeTypes.push('infra_misclassified');
    }

    if (projectType === 'demo') {
      mistakeTypes.push('template_missed');
    }

    if (!hasMonetizationPath) {
      mistakeTypes.push('monetization_missed');
    }

    if (!hasRealUser || !hasClearUseCase) {
      mistakeTypes.push('user_clarity_missed');
    }

    return {
      repositoryId: analysis.repositoryId,
      fullName: analysis.repository.fullName,
      reviewedAt: analysis.claudeReviewReviewedAt?.toISOString() ?? null,
      localVerdict,
      localAction,
      claudeVerdict,
      claudeAction,
      moneyDecision,
      mistakeTypes: this.uniqueArray(mistakeTypes),
      reasons: this.uniqueArray(reasons),
    };
  }

  private buildPromptReinforcements(
    mistakeCounts: MoneyLearningKnowledge['topMistakeTypes'],
    reasonCounts: CountedValue[],
  ) {
    const hasReason = (reason: MoneyMistakeReason) =>
      reasonCounts.some((item) => item.value === reason && item.count >= 2);
    const hasMistake = (type: MoneyMistakeType) =>
      mistakeCounts.some((item) => item.type === type && item.count >= 2);
    const lines: string[] = [];

    if (hasReason('no_real_user') || hasMistake('user_clarity_missed')) {
      lines.push('先确认用户是谁、在哪个具体场景里高频使用，再谈创业价值。');
    }

    if (hasReason('no_payment_path') || hasMistake('monetization_missed')) {
      lines.push('没有现实收费路径时，不要轻易给“必做”；至少要看到订阅、团队版、服务化或 B2B 切口。');
    }

    if (hasReason('infra_misclassified') || hasMistake('infra_misclassified')) {
      lines.push('model / infra / router / provider / framework 默认不是优先创业项目，只能在极少数场景下作为借鉴素材。');
    }

    if (hasReason('template_missed') || hasMistake('template_missed')) {
      lines.push('template / starter / scaffold / demo 默认降级，不要把它们排进高优先机会池。');
    }

    if (hasReason('workflow_underestimated') || hasMistake('false_negative_clone')) {
      lines.push('明确服务开发团队工作流、边界清楚且可打包收费的 devtool，不要因为它还早期就自动压成“可抄”。');
    }

    return lines.slice(0, 5);
  }

  private buildHeuristicAdjustments(
    reviewedCount: number,
    mistakeCounts: MoneyLearningKnowledge['topMistakeTypes'],
    reasonCounts: CountedValue[],
  ) {
    const mistakeCount = (type: MoneyMistakeType) =>
      mistakeCounts.find((item) => item.type === type)?.count ?? 0;
    const reasonCount = (reason: MoneyMistakeReason) =>
      reasonCounts.find((item) => item.value === reason)?.count ?? 0;
    const scale = (count: number, multiplier = 1) =>
      this.clamp01((count / Math.max(reviewedCount, 12)) * multiplier);

    return {
      clearUserBoost: scale(
        reasonCount('no_real_user') + mistakeCount('user_clarity_missed'),
        1.4,
      ),
      clearUseCaseBoost: scale(reasonCount('weak_pain_point'), 1.3),
      painPointBoost: scale(
        reasonCount('weak_pain_point') + mistakeCount('false_positive_good'),
        1.35,
      ),
      monetizationBoost: scale(
        reasonCount('no_payment_path') + mistakeCount('monetization_missed'),
        1.5,
      ),
      repeatUsageBoost: scale(reasonCount('workflow_underestimated'), 1.15),
      smallTeamBuildableBoost: scale(
        reasonCount('workflow_underestimated') +
          mistakeCount('false_negative_clone'),
        1.2,
      ),
      infraPenaltyBoost: scale(
        reasonCount('infra_misclassified') + mistakeCount('infra_misclassified'),
        1.6,
      ),
      templatePenaltyBoost: scale(
        reasonCount('template_missed') + mistakeCount('template_missed'),
        1.6,
      ),
      falsePositiveGoodPenalty: scale(mistakeCount('false_positive_good'), 1.4),
      cloneableReliefBoost: scale(mistakeCount('false_negative_clone'), 1.3),
    };
  }

  private buildConfidenceAdjustments(
    reviewedCount: number,
    mistakeCounts: MoneyLearningKnowledge['topMistakeTypes'],
  ) {
    const mistakeCount = (type: MoneyMistakeType) =>
      mistakeCounts.find((item) => item.type === type)?.count ?? 0;
    const scale = (count: number, multiplier = 1) =>
      this.clamp01((count / Math.max(reviewedCount, 12)) * multiplier);

    return {
      globalDiscount: scale(mistakeCount('false_positive_good'), 0.8),
      projectTypeDiscounts: {
        product: scale(mistakeCount('user_clarity_missed'), 0.2),
        tool: scale(mistakeCount('false_negative_clone'), 0.1),
        model: scale(mistakeCount('infra_misclassified'), 1.1),
        infra: scale(mistakeCount('infra_misclassified'), 1.1),
        demo: scale(mistakeCount('template_missed'), 1.0),
      },
      decisionDiscounts: {
        mustBuild: scale(mistakeCount('false_positive_good'), 0.9),
        highValue: scale(mistakeCount('monetization_missed'), 0.5),
        cloneable: scale(mistakeCount('false_negative_clone'), 0.25),
      },
    };
  }

  private normalizeStoredLearning(value: Prisma.JsonValue) {
    const current =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return {
      generatedAt: this.cleanText(current.generatedAt, 40) || new Date().toISOString(),
      reason: this.cleanNullableText(current.reason, 80),
      sampleSize: this.toInt(current.sampleSize, 0),
      reviewedCount: this.toInt(current.reviewedCount, 0),
      topMistakeTypes: Array.isArray(current.topMistakeTypes)
        ? (current.topMistakeTypes as Array<Record<string, unknown>>)
            .map((item) => ({
              type: this.cleanText(item.type, 40) as MoneyMistakeType,
              count: this.toInt(item.count, 0),
              rate: this.toNumber(item.rate, 0),
            }))
            .filter((item) => this.isMoneyMistakeType(item.type))
        : [],
      topReasons: this.normalizeCountedValues(current.topReasons),
      promptReinforcements: this.normalizeStringArray(current.promptReinforcements),
      heuristicAdjustments: {
        clearUserBoost: this.toNumber(
          this.readObject(current.heuristicAdjustments)?.clearUserBoost,
          0,
        ),
        clearUseCaseBoost: this.toNumber(
          this.readObject(current.heuristicAdjustments)?.clearUseCaseBoost,
          0,
        ),
        painPointBoost: this.toNumber(
          this.readObject(current.heuristicAdjustments)?.painPointBoost,
          0,
        ),
        monetizationBoost: this.toNumber(
          this.readObject(current.heuristicAdjustments)?.monetizationBoost,
          0,
        ),
        repeatUsageBoost: this.toNumber(
          this.readObject(current.heuristicAdjustments)?.repeatUsageBoost,
          0,
        ),
        smallTeamBuildableBoost: this.toNumber(
          this.readObject(current.heuristicAdjustments)?.smallTeamBuildableBoost,
          0,
        ),
        infraPenaltyBoost: this.toNumber(
          this.readObject(current.heuristicAdjustments)?.infraPenaltyBoost,
          0,
        ),
        templatePenaltyBoost: this.toNumber(
          this.readObject(current.heuristicAdjustments)?.templatePenaltyBoost,
          0,
        ),
        falsePositiveGoodPenalty: this.toNumber(
          this.readObject(current.heuristicAdjustments)?.falsePositiveGoodPenalty,
          0,
        ),
        cloneableReliefBoost: this.toNumber(
          this.readObject(current.heuristicAdjustments)?.cloneableReliefBoost,
          0,
        ),
      },
      confidenceAdjustments: {
        globalDiscount: this.toNumber(
          this.readObject(current.confidenceAdjustments)?.globalDiscount,
          0,
        ),
        projectTypeDiscounts: {
          product: this.toNumber(
            this.readObject(
              this.readObject(current.confidenceAdjustments)?.projectTypeDiscounts,
            )?.product,
            0,
          ),
          tool: this.toNumber(
            this.readObject(
              this.readObject(current.confidenceAdjustments)?.projectTypeDiscounts,
            )?.tool,
            0,
          ),
          model: this.toNumber(
            this.readObject(
              this.readObject(current.confidenceAdjustments)?.projectTypeDiscounts,
            )?.model,
            0,
          ),
          infra: this.toNumber(
            this.readObject(
              this.readObject(current.confidenceAdjustments)?.projectTypeDiscounts,
            )?.infra,
            0,
          ),
          demo: this.toNumber(
            this.readObject(
              this.readObject(current.confidenceAdjustments)?.projectTypeDiscounts,
            )?.demo,
            0,
          ),
        },
        decisionDiscounts: {
          mustBuild: this.toNumber(
            this.readObject(
              this.readObject(current.confidenceAdjustments)?.decisionDiscounts,
            )?.mustBuild,
            0,
          ),
          highValue: this.toNumber(
            this.readObject(
              this.readObject(current.confidenceAdjustments)?.decisionDiscounts,
            )?.highValue,
            0,
          ),
          cloneable: this.toNumber(
            this.readObject(
              this.readObject(current.confidenceAdjustments)?.decisionDiscounts,
            )?.cloneable,
            0,
          ),
        },
      },
      repositoriesNeedingReview: Array.isArray(current.repositoriesNeedingReview)
        ? (current.repositoriesNeedingReview as Array<Record<string, unknown>>).map(
            (item) => ({
              repositoryId: this.cleanText(item.repositoryId, 80),
              fullName: this.cleanText(item.fullName, 200),
              mistakeTypes: this.normalizeStringArray(item.mistakeTypes).filter(
                (value): value is MoneyMistakeType =>
                  this.isMoneyMistakeType(value as MoneyMistakeType),
              ),
              reasons: this.normalizeStringArray(item.reasons).filter(
                (value): value is MoneyMistakeReason =>
                  this.isMoneyMistakeReason(value as MoneyMistakeReason),
              ),
              reviewedAt: this.cleanNullableText(item.reviewedAt, 40),
            }),
          )
        : [],
    } satisfies MoneyLearningKnowledge;
  }

  private normalizeCountedValues(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as CountedValue[];
    }

    return value
      .map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? {
              value: this.cleanText((item as Record<string, unknown>).value, 220),
              count: this.toInt((item as Record<string, unknown>).count, 0),
            }
          : null,
      )
      .filter((item): item is CountedValue => Boolean(item?.value));
  }

  private countStrings(values: string[]) {
    const counts = new Map<string, number>();
    values.forEach((value) => {
      const normalized = this.cleanText(value, 220);
      if (!normalized) {
        return;
      }

      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
      }))
      .sort((left, right) => right.count - left.count);
  }

  private normalizeMoneyDecision(value: unknown) {
    const normalized = String(value ?? '').trim().toUpperCase();

    switch (normalized) {
      case 'MUST_BUILD':
      case 'BUILDABLE':
      case 'CLONE_ONLY':
      case 'NOT_WORTH':
        return normalized;
      case 'MUST_LOOK':
        return 'MUST_BUILD';
      case 'WORTH_BUILDING':
      case 'HIGH_VALUE':
        return 'BUILDABLE';
      case 'WORTH_CLONING':
      case 'CLONEABLE':
        return 'CLONE_ONLY';
      case 'LOW_PRIORITY':
      case 'LOW_VALUE':
      case 'IGNORE':
      default:
        return 'NOT_WORTH';
    }
  }

  private normalizeVerdict(value: unknown) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'GOOD' || normalized === 'OK' || normalized === 'BAD') {
      return normalized;
    }

    return null;
  }

  private normalizeAction(value: unknown) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (
      normalized === 'BUILD' ||
      normalized === 'CLONE' ||
      normalized === 'IGNORE'
    ) {
      return normalized;
    }

    return null;
  }

  private readObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .map((item) => this.cleanText(item, 220))
      .filter((item) => Boolean(item));
  }

  private uniqueArray<T>(values: T[]) {
    return Array.from(new Set(values));
  }

  private isMoneyMistakeType(value: MoneyMistakeType | string): value is MoneyMistakeType {
    return [
      'false_positive_good',
      'false_negative_clone',
      'infra_misclassified',
      'template_missed',
      'monetization_missed',
      'user_clarity_missed',
    ].includes(value);
  }

  private isMoneyMistakeReason(
    value: MoneyMistakeReason | string,
  ): value is MoneyMistakeReason {
    return [
      'no_real_user',
      'no_payment_path',
      'infra_misclassified',
      'template_missed',
      'weak_pain_point',
      'small_team_unfriendly',
      'workflow_underestimated',
    ].includes(value);
  }

  private readBoolean(key: string, defaultValue: boolean) {
    const value = process.env[key];
    if (value == null || value.trim() === '') {
      return defaultValue;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }

    return defaultValue;
  }

  private readInt(key: string, defaultValue: number) {
    const value = process.env[key];
    if (!value || !value.trim()) {
      return defaultValue;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  private toBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return undefined;
  }

  private toNumber(value: unknown, defaultValue: number) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : defaultValue;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    }

    return defaultValue;
  }

  private toInt(value: unknown, defaultValue: number) {
    const parsed = this.toNumber(value, Number.NaN);
    return Number.isFinite(parsed) ? Math.round(parsed) : defaultValue;
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }

    return normalized.length <= maxLength
      ? normalized
      : normalized.slice(0, maxLength);
  }

  private cleanNullableText(value: unknown, maxLength: number) {
    const normalized = this.cleanText(value, maxLength);
    return normalized || null;
  }

  private clamp01(value: number) {
    return Number(Math.max(0, Math.min(1, value)).toFixed(3));
  }
}
