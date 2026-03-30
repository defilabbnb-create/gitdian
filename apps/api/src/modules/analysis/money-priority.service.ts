import { Injectable } from '@nestjs/common';
import { MoneyLearningService } from './money-learning.service';

type InsightVerdict = 'GOOD' | 'OK' | 'BAD';
type InsightAction = 'BUILD' | 'CLONE' | 'IGNORE';
type ProjectRealityType = 'product' | 'tool' | 'model' | 'infra' | 'demo';

export type MoneyPriorityTier =
  | 'MUST_LOOK'
  | 'WORTH_BUILDING'
  | 'WORTH_CLONING'
  | 'LOW_PRIORITY'
  | 'IGNORE';

export type MoneyDecision =
  | 'MUST_BUILD'
  | 'HIGH_VALUE'
  | 'CLONEABLE'
  | 'LOW_VALUE'
  | 'IGNORE';

export type MoneyPrioritySource =
  | 'manual_override'
  | 'claude_review'
  | 'local_insight'
  | 'fallback';

export type ClaudeBusinessJudgement = {
  isFounderFit: boolean;
  isSmallTeamFriendly: boolean;
  hasNearTermMonetizationPath: boolean;
  moneyPriorityHint: MoneyPriorityTier | null;
  moneyReasonZh: string;
};

export type ClaudeBusinessSignals = {
  targetUser: string;
  willingnessToPay: 'high' | 'medium' | 'low';
  monetizationModel: string;
  urgency: 'high' | 'medium' | 'low';
  founderFit: boolean;
  buildDifficulty: 'low' | 'medium' | 'high';
};

export type MoneyPriorityResult = {
  score: number;
  moneyScore: number;
  tier: MoneyPriorityTier;
  moneyDecision: MoneyDecision;
  moneyDecisionLabelZh: string;
  labelZh: string;
  reasonZh: string;
  recommendedMoveZh: string;
  projectTypeLabelZh: string;
  targetUsersZh: string;
  monetizationSummaryZh: string;
  source: MoneyPrioritySource;
  businessSignals: ClaudeBusinessSignals;
  moneySignals: {
    hasClearUser: boolean;
    hasClearUseCase: boolean;
    hasPainPoint: boolean;
    hasMonetizationPath: boolean;
    isRepeatUsage: boolean;
    isSmallTeamBuildable: boolean;
    isInfraOrModel: boolean;
    isTemplateOrDemo: boolean;
  };
  signals: {
    projectType: ProjectRealityType;
    hasRealUser: boolean;
    hasClearUseCase: boolean;
    hasProductizationPath: boolean;
    isDirectlyMonetizable: boolean;
    isFounderFit: boolean;
    isSmallTeamFriendly: boolean;
    hasNearTermMonetizationPath: boolean;
    isDeveloperWorkflowTool: boolean;
    isSaasLike: boolean;
    looksTemplateOrDemo: boolean;
    looksInfraLayer: boolean;
    isSmallTeamExecutable: boolean;
  };
};

export type MoneyPriorityInput = {
  repository: {
    fullName?: string | null;
    description?: string | null;
    homepage?: string | null;
    language?: string | null;
    topics?: string[] | null;
    stars?: number | null;
    ideaFitScore?: number | null;
    finalScore?: number | null;
    toolLikeScore?: number | null;
    roughPass?: boolean | null;
    categoryL1?: string | null;
    categoryL2?: string | null;
  };
  manualOverride?: {
    verdict?: string | null;
    action?: string | null;
    note?: string | null;
  } | null;
  claudeReview?: Record<string, unknown> | null;
  insight?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  extractedIdea?: Record<string, unknown> | null;
};

const MONEY_DECISION_LABELS: Record<MoneyDecision, string> = {
  MUST_BUILD: '必做',
  HIGH_VALUE: '值得做',
  CLONEABLE: '可抄',
  LOW_VALUE: '低优先',
  IGNORE: '忽略',
};

const PROJECT_TYPE_LABELS: Record<ProjectRealityType, string> = {
  product: '产品机会',
  tool: '工具机会',
  model: '模型能力',
  infra: '基础设施',
  demo: '模板 / 演示',
};

@Injectable()
export class MoneyPriorityService {
  constructor(private readonly moneyLearningService: MoneyLearningService) {}

  calculate(input: MoneyPriorityInput): MoneyPriorityResult {
    const source = this.resolveSource(input);
    const manualVerdict = this.normalizeVerdict(input.manualOverride?.verdict);
    const manualAction = this.normalizeAction(input.manualOverride?.action);
    const claudeVerdict = this.normalizeVerdict(input.claudeReview?.verdict);
    const claudeAction = this.normalizeAction(input.claudeReview?.action);
    const insightVerdict = this.normalizeVerdict(input.insight?.verdict);
    const insightAction = this.normalizeAction(input.insight?.action);
    const snapshotPromising = Boolean(input.snapshot?.isPromising);
    const verdict =
      manualVerdict ??
      claudeVerdict ??
      insightVerdict ??
      (snapshotPromising ? 'OK' : 'BAD');
    const action =
      manualAction ??
      claudeAction ??
      insightAction ??
      (verdict === 'GOOD'
        ? 'BUILD'
        : verdict === 'OK'
          ? 'CLONE'
          : 'IGNORE');
    const projectReality = this.readObject(input.insight?.projectReality);
    const snapshotReality = this.readObject(input.snapshot?.projectReality);
    const projectType = this.normalizeProjectType(
      input.claudeReview?.projectType ??
        projectReality?.type ??
        projectReality?.projectType ??
        snapshotReality?.type ??
        snapshotReality?.projectType,
    );
    const hasRealUser = Boolean(
      input.claudeReview?.hasRealUser ??
        projectReality?.hasRealUser ??
        snapshotReality?.hasRealUser ??
        this.extractTargetUsers(input).length,
    );
    const hasClearUseCase = Boolean(
      input.claudeReview?.hasClearUseCase ??
        projectReality?.hasClearUseCase ??
        snapshotReality?.hasClearUseCase ??
        this.cleanText(input.snapshot?.reason, 220),
    );
    const hasProductizationPath = Boolean(
      input.claudeReview?.hasProductizationPath ??
        projectReality?.hasProductizationPath ??
        snapshotReality?.hasProductizationPath ??
        this.hasProductizationPath(input),
    );
    const isDirectlyMonetizable = Boolean(
      input.claudeReview?.isDirectlyMonetizable ??
        projectReality?.isDirectlyMonetizable ??
        snapshotReality?.isDirectlyMonetizable ??
        this.hasMonetizationClues(input),
    );
    const moneyAdjustments = this.moneyLearningService.getCachedAdjustments();
    const confidenceAdjustments =
      this.moneyLearningService.getCachedConfidenceAdjustments();
    const businessJudgement = this.normalizeBusinessJudgement(
      input.claudeReview?.businessJudgement,
      {
        isFounderFit:
          (action === 'BUILD' && verdict !== 'BAD') ||
          (projectType !== 'model' &&
            projectType !== 'infra' &&
            projectType !== 'demo' &&
            hasRealUser &&
            hasClearUseCase &&
            hasProductizationPath),
        isSmallTeamFriendly:
          this.isSmallTeamFriendly(input, projectType) ||
          this.isDeveloperWorkflowTool(input),
        hasNearTermMonetizationPath:
          hasRealUser &&
          hasClearUseCase &&
          (isDirectlyMonetizable || this.hasMonetizationClues(input)),
      },
    );
    const businessSignals = this.normalizeBusinessSignals(
      input.claudeReview?.businessSignals,
      {
        targetUser: this.extractTargetUsers(input).join('、') || '',
        willingnessToPay:
          businessJudgement.hasNearTermMonetizationPath &&
          isDirectlyMonetizable
            ? 'high'
            : businessJudgement.hasNearTermMonetizationPath
              ? 'medium'
              : 'low',
        monetizationModel: this.deriveMonetizationModel(input),
        urgency: this.hasPainPoint(input)
          ? this.isRepeatUsage(input)
            ? 'high'
            : 'medium'
          : 'low',
        founderFit: businessJudgement.isFounderFit,
        buildDifficulty: this.isSmallTeamFriendly(input, projectType)
          ? 'low'
          : projectType === 'model' || projectType === 'infra'
            ? 'high'
            : 'medium',
      },
    );
    const isDeveloperWorkflowTool = this.isDeveloperWorkflowTool(input);
    const isSaasLike = this.isSaasLike(input);
    const looksTemplateOrDemo = this.looksTemplateOrDemo(input);
    const looksInfraLayer =
      projectType === 'model' ||
      projectType === 'infra' ||
      projectType === 'demo' ||
      this.looksInfraLayer(input);
    const isSmallTeamExecutable =
      businessJudgement.isSmallTeamFriendly ||
      this.isSmallTeamFriendly(input, projectType);
    const moneySignals = {
      hasClearUser: hasRealUser,
      hasClearUseCase,
      hasPainPoint: this.hasPainPoint(input),
      hasMonetizationPath:
        businessJudgement.hasNearTermMonetizationPath ||
        isDirectlyMonetizable ||
        businessSignals.willingnessToPay !== 'low',
      isRepeatUsage: this.isRepeatUsage(input),
      isSmallTeamBuildable: isSmallTeamExecutable,
      isInfraOrModel: projectType === 'model' || projectType === 'infra',
      isTemplateOrDemo: looksTemplateOrDemo || projectType === 'demo',
    };
    const stars = Math.max(0, this.toNumber(input.repository.stars) ?? 0);

    let score = this.baseScoreFromDecision(verdict, action);
    score += this.projectTypeScore(projectType);
    score += moneySignals.hasClearUser
      ? 10 + Math.round(moneyAdjustments.clearUserBoost * 4)
      : -12 - Math.round(moneyAdjustments.clearUserBoost * 6);
    score += moneySignals.hasClearUseCase
      ? 10 + Math.round(moneyAdjustments.clearUseCaseBoost * 4)
      : -10 - Math.round(moneyAdjustments.clearUseCaseBoost * 5);
    score += moneySignals.hasPainPoint
      ? 11 + Math.round(moneyAdjustments.painPointBoost * 5)
      : -8 - Math.round(moneyAdjustments.painPointBoost * 4);
    score += hasProductizationPath ? 8 : -6;
    score += moneySignals.hasMonetizationPath
      ? 11 + Math.round(moneyAdjustments.monetizationBoost * 5)
      : -12 - Math.round(moneyAdjustments.monetizationBoost * 6);
    score += isDirectlyMonetizable ? 4 : 0;
    score += businessJudgement.isFounderFit ? 6 : 0;
    score += moneySignals.isSmallTeamBuildable
      ? 7 + Math.round(moneyAdjustments.smallTeamBuildableBoost * 4)
      : -5;
    score += moneySignals.isRepeatUsage
      ? 6 + Math.round(moneyAdjustments.repeatUsageBoost * 4)
      : -3;
    score += isDeveloperWorkflowTool
      ? 8 + Math.round(moneyAdjustments.cloneableReliefBoost * 4)
      : 0;
    score += isSaasLike ? 5 : 0;
    score += this.ideaFitBonus(input.repository.ideaFitScore);
    score += this.starBonus(stars);
    score += input.repository.roughPass ? 2 : 0;
    score += this.hintBonus(businessJudgement.moneyPriorityHint);
    score -= looksTemplateOrDemo
      ? 18 + Math.round(moneyAdjustments.templatePenaltyBoost * 10)
      : 0;
    score -= looksInfraLayer
      ? 15 + Math.round(moneyAdjustments.infraPenaltyBoost * 10)
      : 0;
    score -=
      (confidenceAdjustments.globalDiscount > 0 &&
      verdict === 'GOOD' &&
      action === 'BUILD'
        ? Math.round(confidenceAdjustments.globalDiscount * 6)
        : 0) +
      (verdict === 'GOOD' && action === 'BUILD'
        ? Math.round(moneyAdjustments.falsePositiveGoodPenalty * 8)
        : 0);
    score -= Math.round(
      (confidenceAdjustments.projectTypeDiscounts[projectType] ?? 0) * 6,
    );

    if (
      action === 'CLONE' &&
      verdict !== 'BAD' &&
      isDeveloperWorkflowTool &&
      !looksInfraLayer &&
      !looksTemplateOrDemo
    ) {
      score += 4;
    }

    score = this.clamp(score, 0, 100);
    let tier = this.scoreToTier(score);
    let moneyDecision = this.scoreToMoneyDecision(score);

    if (verdict === 'BAD' || action === 'IGNORE') {
      tier = 'IGNORE';
      score = Math.min(score, 24);
      moneyDecision = 'IGNORE';
    } else if (looksTemplateOrDemo) {
      tier = score >= 45 ? 'WORTH_CLONING' : 'LOW_PRIORITY';
      score = Math.min(score, tier === 'WORTH_CLONING' ? 56 : 44);
      moneyDecision = tier === 'WORTH_CLONING' ? 'CLONEABLE' : 'LOW_VALUE';
    } else if (looksInfraLayer) {
      tier = score >= 50 ? 'WORTH_CLONING' : 'LOW_PRIORITY';
      score = Math.min(score, tier === 'WORTH_CLONING' ? 58 : 46);
      moneyDecision = tier === 'WORTH_CLONING' ? 'CLONEABLE' : 'LOW_VALUE';
    }

    if (!businessJudgement.hasNearTermMonetizationPath) {
      tier = this.applyTierCap(tier, 'WORTH_BUILDING');
      score = this.alignScoreToTier(score, tier);
      moneyDecision = this.tierToMoneyDecision(tier);
    }

    if (source !== 'manual_override' && source !== 'claude_review' && tier === 'MUST_LOOK') {
      tier = 'WORTH_BUILDING';
      score = this.alignScoreToTier(score, tier);
      moneyDecision = this.tierToMoneyDecision(tier);
    }

    if (source === 'claude_review' && businessJudgement.moneyPriorityHint) {
      tier = this.applyTierCap(tier, businessJudgement.moneyPriorityHint);
      score = this.alignScoreToTier(score, tier);
      moneyDecision = this.tierToMoneyDecision(tier);
    }

    if (
      tier === 'WORTH_BUILDING' &&
      verdict === 'GOOD' &&
      action === 'BUILD' &&
      hasRealUser &&
      hasClearUseCase &&
      hasProductizationPath &&
      businessJudgement.hasNearTermMonetizationPath &&
      isSmallTeamExecutable &&
      (isDirectlyMonetizable || source === 'manual_override')
    ) {
      tier = 'MUST_LOOK';
      score = Math.max(score, 86);
      moneyDecision = 'MUST_BUILD';
    }

    const targetUsers = this.extractTargetUsers(input);
    const extractedTargetUsersZh = targetUsers
      .map((item) => this.localizeChineseBusinessText(item, 80))
      .filter((item) => item.length > 0);
    const fallbackTargetUsersZh =
      extractedTargetUsersZh.length > 0
        ? extractedTargetUsersZh.join('、')
        : isDeveloperWorkflowTool
          ? hasRealUser
            ? '开发者 / 工程团队'
            : '主要面向开发者，但具体用户场景还不明确。'
          : hasRealUser
            ? '有明确用户，但还需要你再确认细分人群'
            : '目标用户仍不清晰，需要进一步确认。';
    const targetUsersZh =
      this.localizeChineseBusinessText(businessSignals.targetUser, 160) ||
      fallbackTargetUsersZh;
    const monetizationSummaryZh = this.buildMonetizationSummaryZh(
      businessSignals,
      businessJudgement.hasNearTermMonetizationPath,
      isDirectlyMonetizable,
      hasRealUser,
      hasClearUseCase,
      projectType,
    );
    const reasonZh = this.buildReasonZh({
      source,
      verdict,
      action,
      tier,
      moneyDecision,
      projectType,
      hasRealUser,
      hasClearUseCase,
      hasProductizationPath,
      moneySignals,
      businessJudgement,
      isDeveloperWorkflowTool,
      looksTemplateOrDemo,
      looksInfraLayer,
      manualNote: this.cleanText(input.manualOverride?.note, 240),
    });

    return {
      score,
      moneyScore: score,
      tier,
      moneyDecision,
      moneyDecisionLabelZh: MONEY_DECISION_LABELS[moneyDecision],
      labelZh: MONEY_DECISION_LABELS[moneyDecision],
      reasonZh,
      recommendedMoveZh: this.recommendedMoveZh(moneyDecision, action),
      projectTypeLabelZh: PROJECT_TYPE_LABELS[projectType],
      targetUsersZh,
      monetizationSummaryZh,
      source,
      businessSignals,
      moneySignals,
      signals: {
        projectType,
        hasRealUser,
        hasClearUseCase,
        hasProductizationPath,
        isDirectlyMonetizable,
        isFounderFit: businessJudgement.isFounderFit,
        isSmallTeamFriendly: businessJudgement.isSmallTeamFriendly,
        hasNearTermMonetizationPath:
          businessJudgement.hasNearTermMonetizationPath,
        isDeveloperWorkflowTool,
        isSaasLike,
        looksTemplateOrDemo,
        looksInfraLayer,
        isSmallTeamExecutable,
      },
    };
  }

  compare(
    left: MoneyPriorityResult,
    right: MoneyPriorityResult,
    tieBreaker?: {
      leftIdeaFitScore?: number | null;
      rightIdeaFitScore?: number | null;
      leftStars?: number | null;
      rightStars?: number | null;
      leftTimestamp?: number | null;
      rightTimestamp?: number | null;
    },
  ) {
    const sourceDelta =
      this.sourceWeight(right.source) - this.sourceWeight(left.source);
    if (sourceDelta !== 0) {
      return sourceDelta;
    }

    if (right.moneyScore !== left.moneyScore) {
      return right.moneyScore - left.moneyScore;
    }

    const decisionDelta =
      this.moneyDecisionWeight(right.moneyDecision) -
      this.moneyDecisionWeight(left.moneyDecision);
    if (decisionDelta !== 0) {
      return decisionDelta;
    }

    const tierDelta = this.tierWeight(right.tier) - this.tierWeight(left.tier);
    if (tierDelta !== 0) {
      return tierDelta;
    }

    const ideaFitDelta =
      (tieBreaker?.rightIdeaFitScore ?? -1) - (tieBreaker?.leftIdeaFitScore ?? -1);
    if (ideaFitDelta !== 0) {
      return ideaFitDelta;
    }

    const starsDelta =
      (tieBreaker?.rightStars ?? -1) - (tieBreaker?.leftStars ?? -1);
    if (starsDelta !== 0) {
      return starsDelta;
    }

    return (tieBreaker?.rightTimestamp ?? 0) - (tieBreaker?.leftTimestamp ?? 0);
  }

  normalizeBusinessJudgement(
    value: unknown,
    defaults: Partial<Omit<ClaudeBusinessJudgement, 'moneyPriorityHint' | 'moneyReasonZh'>> & {
      moneyPriorityHint?: MoneyPriorityTier | null;
      moneyReasonZh?: string | null;
    } = {},
  ): ClaudeBusinessJudgement {
    const current =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return {
      isFounderFit:
        this.toBoolean(current.isFounderFit) ?? defaults.isFounderFit ?? false,
      isSmallTeamFriendly:
        this.toBoolean(current.isSmallTeamFriendly) ??
        defaults.isSmallTeamFriendly ??
        false,
      hasNearTermMonetizationPath:
        this.toBoolean(current.hasNearTermMonetizationPath) ??
        defaults.hasNearTermMonetizationPath ??
        false,
      moneyPriorityHint:
        this.normalizeTier(current.moneyPriorityHint) ??
        defaults.moneyPriorityHint ??
        null,
      moneyReasonZh:
        this.cleanText(current.moneyReasonZh, 220) ||
        this.cleanText(defaults.moneyReasonZh, 220),
    };
  }

  normalizeBusinessSignals(
    value: unknown,
    defaults: Partial<ClaudeBusinessSignals> = {},
  ): ClaudeBusinessSignals {
    const current =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return {
      targetUser:
        this.cleanText(current.targetUser, 160) ||
        this.cleanText(defaults.targetUser, 160),
      willingnessToPay:
        this.normalizeLevel(current.willingnessToPay) ??
        this.normalizeLevel(defaults.willingnessToPay) ??
        'low',
      monetizationModel:
        this.cleanText(current.monetizationModel, 180) ||
        this.cleanText(defaults.monetizationModel, 180),
      urgency:
        this.normalizeLevel(current.urgency) ??
        this.normalizeLevel(defaults.urgency) ??
        'low',
      founderFit:
        this.toBoolean(current.founderFit) ??
        this.toBoolean(defaults.founderFit) ??
        false,
      buildDifficulty:
        this.normalizeDifficulty(current.buildDifficulty) ??
        this.normalizeDifficulty(defaults.buildDifficulty) ??
        'medium',
    };
  }

  private resolveSource(input: MoneyPriorityInput): MoneyPrioritySource {
    if (
      input.manualOverride?.verdict ||
      input.manualOverride?.action ||
      input.manualOverride?.note
    ) {
      return 'manual_override';
    }

    if (input.claudeReview) {
      return 'claude_review';
    }

    if (input.insight) {
      return 'local_insight';
    }

    return 'fallback';
  }

  private baseScoreFromDecision(verdict: InsightVerdict, action: InsightAction) {
    if (verdict === 'GOOD' && action === 'BUILD') {
      return 58;
    }

    if (verdict === 'GOOD' && action === 'CLONE') {
      return 48;
    }

    if (verdict === 'OK' && action === 'BUILD') {
      return 52;
    }

    if (verdict === 'OK' && action === 'CLONE') {
      return 42;
    }

    if (verdict === 'BAD' || action === 'IGNORE') {
      return 10;
    }

    return 28;
  }

  private sourceBonus(source: MoneyPrioritySource) {
    switch (source) {
      case 'manual_override':
        return 10;
      case 'claude_review':
        return 6;
      case 'local_insight':
        return 2;
      case 'fallback':
      default:
        return 0;
    }
  }

  private sourceWeight(source: MoneyPrioritySource) {
    switch (source) {
      case 'manual_override':
        return 4;
      case 'claude_review':
        return 3;
      case 'local_insight':
        return 2;
      case 'fallback':
      default:
        return 1;
    }
  }

  private projectTypeScore(projectType: ProjectRealityType) {
    switch (projectType) {
      case 'product':
        return 16;
      case 'tool':
        return 14;
      case 'model':
        return -24;
      case 'infra':
        return -18;
      case 'demo':
      default:
        return -20;
    }
  }

  private ideaFitBonus(value: unknown) {
    const ideaFitScore = this.toNumber(value);
    if (ideaFitScore == null) {
      return 0;
    }

    if (ideaFitScore >= 80) {
      return 4;
    }

    if (ideaFitScore >= 68) {
      return 2;
    }

    return 0;
  }

  private starBonus(stars: number) {
    if (stars <= 0) {
      return 0;
    }

    return Math.min(4, Math.round(Math.log10(stars + 1) * 1.4));
  }

  private hintBonus(hint: MoneyPriorityTier | null) {
    switch (hint) {
      case 'MUST_LOOK':
        return 8;
      case 'WORTH_BUILDING':
        return 5;
      case 'WORTH_CLONING':
        return 2;
      case 'LOW_PRIORITY':
        return -6;
      case 'IGNORE':
        return -12;
      default:
        return 0;
    }
  }

  private moneyDecisionWeight(value: MoneyDecision) {
    switch (value) {
      case 'MUST_BUILD':
        return 5;
      case 'HIGH_VALUE':
        return 4;
      case 'CLONEABLE':
        return 3;
      case 'LOW_VALUE':
        return 2;
      case 'IGNORE':
      default:
        return 1;
    }
  }

  private scoreToMoneyDecision(score: number): MoneyDecision {
    if (score >= 85) {
      return 'MUST_BUILD';
    }

    if (score >= 68) {
      return 'HIGH_VALUE';
    }

    if (score >= 50) {
      return 'CLONEABLE';
    }

    if (score >= 28) {
      return 'LOW_VALUE';
    }

    return 'IGNORE';
  }

  private tierToMoneyDecision(tier: MoneyPriorityTier): MoneyDecision {
    switch (tier) {
      case 'MUST_LOOK':
        return 'MUST_BUILD';
      case 'WORTH_BUILDING':
        return 'HIGH_VALUE';
      case 'WORTH_CLONING':
        return 'CLONEABLE';
      case 'LOW_PRIORITY':
        return 'LOW_VALUE';
      case 'IGNORE':
      default:
        return 'IGNORE';
    }
  }

  private scoreToTier(score: number): MoneyPriorityTier {
    if (score >= 85) {
      return 'MUST_LOOK';
    }

    if (score >= 68) {
      return 'WORTH_BUILDING';
    }

    if (score >= 50) {
      return 'WORTH_CLONING';
    }

    if (score >= 28) {
      return 'LOW_PRIORITY';
    }

    return 'IGNORE';
  }

  private tierWeight(tier: MoneyPriorityTier) {
    switch (tier) {
      case 'MUST_LOOK':
        return 5;
      case 'WORTH_BUILDING':
        return 4;
      case 'WORTH_CLONING':
        return 3;
      case 'LOW_PRIORITY':
        return 2;
      case 'IGNORE':
      default:
        return 1;
    }
  }

  private applyTierCap(
    currentTier: MoneyPriorityTier,
    maxTier: MoneyPriorityTier,
  ) {
    return this.tierWeight(currentTier) > this.tierWeight(maxTier)
      ? maxTier
      : currentTier;
  }

  private alignScoreToTier(score: number, tier: MoneyPriorityTier) {
    if (tier === 'MUST_LOOK') {
      return this.clamp(score, 85, 100);
    }

    if (tier === 'WORTH_BUILDING') {
      return this.clamp(score, 68, 84);
    }

    if (tier === 'WORTH_CLONING') {
      return this.clamp(score, 50, 67);
    }

    if (tier === 'LOW_PRIORITY') {
      return this.clamp(score, 28, 49);
    }

    return this.clamp(score, 0, 24);
  }

  private recommendedMoveZh(
    moneyDecision: MoneyDecision,
    action: InsightAction,
  ) {
    if (moneyDecision === 'MUST_BUILD') {
      return '更适合你亲自做成产品';
    }

    if (moneyDecision === 'HIGH_VALUE') {
      return '优先放进你的创业候选池，尽快验证';
    }

    if (moneyDecision === 'CLONEABLE' || action === 'CLONE') {
      return '更适合借鉴思路后重做';
    }

    if (moneyDecision === 'LOW_VALUE') {
      return '先放进观察池，不要现在投入主精力';
    }

    return '现在直接跳过';
  }

  private buildReasonZh(input: {
    source: MoneyPrioritySource;
    verdict: InsightVerdict;
    action: InsightAction;
    tier: MoneyPriorityTier;
    moneyDecision: MoneyDecision;
    projectType: ProjectRealityType;
    hasRealUser: boolean;
    hasClearUseCase: boolean;
    hasProductizationPath: boolean;
    moneySignals: MoneyPriorityResult['moneySignals'];
    businessJudgement: ClaudeBusinessJudgement;
    isDeveloperWorkflowTool: boolean;
    looksTemplateOrDemo: boolean;
    looksInfraLayer: boolean;
    manualNote: string;
  }) {
    if (input.manualNote) {
      return input.manualNote;
    }

    if (input.source === 'claude_review' && input.businessJudgement.moneyReasonZh) {
      return input.businessJudgement.moneyReasonZh;
    }

    if (input.looksTemplateOrDemo) {
      return '它更像模板、脚手架或演示样例，适合借鉴结构和做法，但不值得你直接投入成一个创业产品。';
    }

    if (input.looksInfraLayer) {
      return '它更像模型能力层、基础设施封装或底层路由能力，技术上可参考，但离可直接卖的产品还有明显距离。';
    }

    if (
      input.moneyDecision === 'MUST_BUILD' &&
      input.isDeveloperWorkflowTool
    ) {
      return '这是面向明确开发者 / 团队工作流的真工具，用户、场景和产品边界都比较清楚，而且小团队有现实机会把它快速包装成可收费产品。';
    }

    if (input.moneyDecision === 'MUST_BUILD' || input.moneyDecision === 'HIGH_VALUE') {
      return '它更像真实产品机会而不是技术展示：用户清楚、场景清楚、边界清楚，而且存在现实的产品化路径与近期收费可能性。';
    }

    if (input.moneyDecision === 'CLONEABLE') {
      return '它有明确可借鉴的切口，但当前更适合作为方向参考或重做素材，还不够像值得你立刻原样投入的产品机会。';
    }

    if (input.moneyDecision === 'LOW_VALUE') {
      return '它暂时还缺少足够清楚的用户、使用场景或收费路径，先观察比立刻投入更划算。';
    }

    if (input.verdict === 'BAD' || input.action === 'IGNORE') {
      return '它当前没有形成值得投入的产品机会，更适合跳过，把注意力留给边界更清楚、收费路径更现实的项目。';
    }

    return '它更适合先观察，不要现在就按创业产品投入。';
  }

  private buildMonetizationSummaryZh(
    businessSignals: ClaudeBusinessSignals,
    hasNearTermMonetizationPath: boolean,
    isDirectlyMonetizable: boolean,
    hasRealUser: boolean,
    hasClearUseCase: boolean,
    projectType: ProjectRealityType,
  ) {
    const monetizationModelZh = this.localizeChineseBusinessText(
      businessSignals.monetizationModel,
      180,
    );

    if (!hasRealUser || !hasClearUseCase) {
      return '收费路径还不够清楚，建议先确认真实用户和场景。';
    }

    if (
      projectType === 'model' ||
      projectType === 'demo' ||
      projectType === 'infra'
    ) {
      return '更适合先验证价值，再判断是否具备收费空间。';
    }

    if (!hasNearTermMonetizationPath && businessSignals.willingnessToPay === 'low') {
      return '更适合先验证价值，再判断是否具备收费空间。';
    }

    if (isDirectlyMonetizable || businessSignals.willingnessToPay === 'high') {
      return (
        monetizationModelZh ||
        '可以先从团队版、托管版或服务化交付验证是否有人付费。'
      );
    }

    return (
      monetizationModelZh ||
      '更适合先验证价值，再判断是否具备收费空间。'
    );
  }

  private deriveMonetizationModel(input: MoneyPriorityInput) {
    const extractedIdea = this.readObject(input.extractedIdea);
    const monetization = this.cleanText(extractedIdea?.monetization, 180);
    if (monetization) {
      return monetization;
    }

    const insight = this.readObject(input.insight);
    const snapshotReality = this.readObject(input.snapshot?.projectReality);
    const projectReality = this.readObject(insight?.projectReality);
    const hasRealUser = Boolean(
      input.claudeReview?.hasRealUser ??
        projectReality?.hasRealUser ??
        snapshotReality?.hasRealUser,
    );
    const hasClearUseCase = Boolean(
      input.claudeReview?.hasClearUseCase ??
        projectReality?.hasClearUseCase ??
        snapshotReality?.hasClearUseCase,
    );
    const projectType = this.normalizeProjectType(
      input.claudeReview?.projectType ??
        projectReality?.type ??
        snapshotReality?.type,
    );

    if (
      hasRealUser &&
      hasClearUseCase &&
      projectType !== 'model' &&
      projectType !== 'infra' &&
      projectType !== 'demo' &&
      (this.isDeveloperWorkflowTool(input) || this.isSaasLike(input))
    ) {
      return '可以从团队版、托管版或服务化交付验证是否有人付费。';
    }

    return '';
  }

  private hasPainPoint(input: MoneyPriorityInput) {
    const haystack = this.buildHaystack(input);
    const keywords = [
      'review',
      'approval',
      'audit',
      'monitor',
      'error',
      'compliance',
      'cost',
      'save time',
      'speed up',
      'workflow',
      '重复',
      '高频',
      '审查',
      '审批',
      '监控',
      '告警',
      '成本',
      '风险',
      '效率',
      '工作流',
    ];

    return keywords.some((keyword) => haystack.includes(keyword));
  }

  private isRepeatUsage(input: MoneyPriorityInput) {
    const haystack = this.buildHaystack(input);
    const keywords = [
      'daily',
      'everyday',
      'monitor',
      'dashboard',
      'workflow',
      'review',
      'approval',
      'api',
      'automation',
      'cli',
      'console',
      '持续',
      '日常',
      '监控',
      '工作流',
      '接口',
      '自动化',
      '终端',
    ];

    return keywords.some((keyword) => haystack.includes(keyword));
  }

  private isDeveloperWorkflowTool(input: MoneyPriorityInput) {
    const categorySub = this.cleanText(
      this.readCategorySub(input.insight, input.snapshot) ?? input.repository.categoryL2,
      60,
    ).toLowerCase();

    if (
      [
        'devtools',
        'workflow',
        'cli',
        'ops-tools',
        'api-platform',
        'developer-platform',
        'automation',
        'security',
      ].includes(categorySub)
    ) {
      return true;
    }

    const haystack = this.buildHaystack(input);
    const userKeywords = [
      'developer',
      'developers',
      'engineering team',
      'engineer',
      'platform team',
      'devops',
      '开发者',
      '工程师',
      '工程团队',
      '研发团队',
    ];
    const workflowKeywords = [
      'review',
      'approval',
      'workflow',
      'audit',
      'monitor',
      'console',
      'dashboard',
      'automation',
      'api',
      'cli',
      'terminal',
      'pull request',
      'pr ',
      'guardrail',
      'orchestration',
      '工作流',
      '审查',
      '审批',
      '自动化',
      '监控',
      '终端',
      '接口',
    ];

    return (
      userKeywords.some((keyword) => haystack.includes(keyword)) &&
      workflowKeywords.some((keyword) => haystack.includes(keyword))
    );
  }

  private isSaasLike(input: MoneyPriorityInput) {
    const haystack = this.buildHaystack(input);
    const keywords = [
      'saas',
      'subscription',
      'workspace',
      'dashboard',
      'console',
      'hosted',
      'cloud',
      'team plan',
      'enterprise',
      'seat',
      'per user',
      'workspace',
      '团队版',
      '企业版',
      '订阅',
      '控制台',
      '工作台',
      '多人协作',
    ];

    return keywords.some((keyword) => haystack.includes(keyword));
  }

  private isSmallTeamFriendly(
    input: MoneyPriorityInput,
    projectType: ProjectRealityType,
  ) {
    if (projectType === 'model' || projectType === 'infra' || projectType === 'demo') {
      return false;
    }

    const haystack = this.buildHaystack(input);
    const keywords = [
      'cli',
      'terminal',
      'review',
      'approval',
      'dashboard',
      'console',
      'automation',
      'workflow',
      'browser extension',
      'api',
      'subscription',
      'developer tool',
      '开发工具',
      '工作流',
      '自动化',
      '控制台',
      '终端',
    ];

    return keywords.some((keyword) => haystack.includes(keyword));
  }

  private hasProductizationPath(input: MoneyPriorityInput) {
    const extractedIdea = this.readObject(input.extractedIdea);
    const monetization = this.cleanText(extractedIdea?.monetization, 220).toLowerCase();
    const productForm = this.cleanText(extractedIdea?.productForm, 40).toLowerCase();
    const haystack = this.buildHaystack(input);
    const keywords = [
      'saas',
      'workspace',
      'dashboard',
      'console',
      'hosted',
      'cloud',
      'browser extension',
      'subscription',
      'audit',
      'review history',
      'team',
      'enterprise',
      'collaboration',
      '团队',
      '工作台',
      '订阅',
    ];

    return (
      Boolean(monetization) ||
      ['saas', 'api', 'plugin', 'tool_site'].includes(productForm) ||
      keywords.some((keyword) => haystack.includes(keyword))
    );
  }

  private hasMonetizationClues(input: MoneyPriorityInput) {
    const extractedIdea = this.readObject(input.extractedIdea);
    const monetization = this.cleanText(extractedIdea?.monetization, 220).toLowerCase();
    const haystack = [monetization, this.buildHaystack(input)].join('\n');
    const keywords = [
      'pricing',
      'subscription',
      'paid',
      'enterprise',
      'license',
      'freemium',
      'seat',
      'per user',
      'consulting',
      '订阅',
      '收费',
      '付费',
      '企业版',
      '授权',
      '服务化',
    ];

    return keywords.some((keyword) => haystack.includes(keyword));
  }

  private looksTemplateOrDemo(input: MoneyPriorityInput) {
    const haystack = this.buildIdentityHaystack(input);
    const keywords = [
      'template',
      'starter',
      'boilerplate',
      'scaffold',
      'starter kit',
      'reference implementation',
      'tutorial',
      'demo',
      'course',
      'example',
      '模板',
      '脚手架',
      '示例',
      '教程',
      '演示',
    ];

    return keywords.some((keyword) => haystack.includes(keyword));
  }

  private looksInfraLayer(input: MoneyPriorityInput) {
    const haystack = this.buildIdentityHaystack(input);
    const keywords = [
      'framework',
      'sdk',
      'library',
      'router',
      'proxy',
      'gateway',
      'provider',
      'fallback',
      'orchestration',
      'agent framework',
      'mcp server framework',
      'daemon',
      'framework',
      'sdk',
      '库',
      '框架',
      '网关',
      '代理层',
      '路由层',
      '能力层',
      '编排',
    ];

    return keywords.some((keyword) => haystack.includes(keyword));
  }

  private extractTargetUsers(input: MoneyPriorityInput) {
    const extractedIdea = this.readObject(input.extractedIdea);
    const rawUsers = this.normalizeStringArray(extractedIdea?.targetUsers).slice(0, 3);

    if (rawUsers.length > 0) {
      return rawUsers;
    }

    if (this.isDeveloperWorkflowTool(input)) {
      return ['开发者', '工程团队'];
    }

    return [];
  }

  private buildHaystack(input: MoneyPriorityInput) {
    return [
      input.repository.fullName,
      input.repository.description,
      input.repository.language,
      ...(input.repository.topics ?? []),
      input.manualOverride?.note,
      input.claudeReview?.oneLinerZh,
      input.claudeReview?.reason,
      input.insight?.oneLinerZh,
      input.insight?.verdictReason,
      input.snapshot?.oneLinerZh,
      input.snapshot?.reason,
      input.extractedIdea?.ideaSummary,
      input.extractedIdea?.problem,
      input.extractedIdea?.solution,
      input.extractedIdea?.monetization,
      ...(this.normalizeStringArray(input.extractedIdea?.targetUsers) ?? []),
    ]
      .map((item) => String(item ?? '').toLowerCase())
      .join('\n');
  }

  private buildIdentityHaystack(input: MoneyPriorityInput) {
    return [
      input.repository.fullName,
      input.repository.description,
      ...(input.repository.topics ?? []),
      input.snapshot?.reason,
      input.snapshot?.oneLinerZh,
      input.extractedIdea?.ideaSummary,
    ]
      .map((item) => String(item ?? '').toLowerCase())
      .join('\n');
  }

  private readCategorySub(
    insight: Record<string, unknown> | null | undefined,
    snapshot: Record<string, unknown> | null | undefined,
  ) {
    const insightCategory = this.readObject(insight?.category);
    const snapshotCategory = this.readObject(snapshot?.category);

    return (
      this.cleanText(insightCategory?.sub, 60) ||
      this.cleanText(snapshotCategory?.sub, 60)
    );
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
    if (
      normalized === 'BUILD' ||
      normalized === 'CLONE' ||
      normalized === 'IGNORE'
    ) {
      return normalized;
    }

    return null;
  }

  private normalizeProjectType(value: unknown): ProjectRealityType {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (
      normalized === 'product' ||
      normalized === 'tool' ||
      normalized === 'model' ||
      normalized === 'infra' ||
      normalized === 'demo'
    ) {
      return normalized;
    }

    return 'tool';
  }

  private normalizeTier(value: unknown): MoneyPriorityTier | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'MUST_BUILD') {
      return 'MUST_LOOK';
    }

    if (normalized === 'HIGH_VALUE' || normalized === 'BUILDABLE') {
      return 'WORTH_BUILDING';
    }

    if (normalized === 'CLONEABLE' || normalized === 'CLONE_ONLY') {
      return 'WORTH_CLONING';
    }

    if (normalized === 'LOW_VALUE' || normalized === 'NOT_WORTH') {
      return 'LOW_PRIORITY';
    }

    if (
      normalized === 'MUST_LOOK' ||
      normalized === 'WORTH_BUILDING' ||
      normalized === 'WORTH_CLONING' ||
      normalized === 'LOW_PRIORITY' ||
      normalized === 'IGNORE'
    ) {
      return normalized;
    }

    return null;
  }

  private normalizeLevel(value: unknown): 'high' | 'medium' | 'low' | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
      return normalized;
    }

    return null;
  }

  private normalizeDifficulty(
    value: unknown,
  ): 'low' | 'medium' | 'high' | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
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
      .map((item) => this.cleanText(item, 80))
      .filter((item) => Boolean(item));
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
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

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }

    return normalized.length <= maxLength
      ? normalized
      : normalized.slice(0, maxLength);
  }

  private localizeChineseBusinessText(value: unknown, maxLength: number) {
    const normalized = this.cleanText(value, maxLength);
    if (!normalized) {
      return '';
    }

    return this.looksEnglishHeavyText(normalized) ? '' : normalized;
  }

  private looksEnglishHeavyText(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      return false;
    }

    const asciiLetters = (normalized.match(/[A-Za-z]/g) ?? []).length;
    const cjkChars = (normalized.match(/[\u4e00-\u9fff]/g) ?? []).length;
    const englishTokens =
      normalized.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [];

    return (
      asciiLetters >= 8 &&
      (cjkChars === 0 ||
        asciiLetters > cjkChars * 2 ||
        englishTokens.length >= 2)
    );
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }
}
