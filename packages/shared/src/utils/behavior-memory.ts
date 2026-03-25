export const SUCCESS_REASON_CODES = [
  'REAL_USER_CONFIRMED',
  'CLEAR_USE_CASE',
  'FAST_TO_BUILD',
  'MONETIZATION_CONFIRMED',
  'DISTRIBUTION_CLEAR',
  'DIFFERENTIATED_ENOUGH',
] as const;

export const FAILURE_REASON_CODES = [
  'NO_REAL_USER',
  'WEAK_MONETIZATION',
  'TOO_INFRA_HEAVY',
  'TOO_COMPLEX',
  'NOT_DIFFERENT_ENOUGH',
  'WRONG_DIRECTION',
  'LOW_CONFIDENCE_ANALYSIS',
  'TOO_MUCH_MANUAL_WORK',
] as const;

export const BEHAVIOR_EVIDENCE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const IMPACT_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;

export type ActionOutcome =
  | 'SUCCESS'
  | 'FAILED'
  | 'DROPPED'
  | 'PAUSED'
  | 'IN_PROGRESS'
  | 'VALIDATING';

export type SuccessReasonCode = (typeof SUCCESS_REASON_CODES)[number];
export type FailureReasonCode = (typeof FAILURE_REASON_CODES)[number];
export type BehaviorOutcomeConfidence = 'low' | 'medium' | 'high';
export type BehaviorEvidenceLevel = (typeof BEHAVIOR_EVIDENCE_LEVELS)[number];
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];
export type BehaviorOutcomeSource =
  | 'manual_click'
  | 'repeated_progress'
  | 'validation_result'
  | 'system_inferred';

export type BehaviorMemoryEntry = {
  repoId: string;
  repositoryName?: string | null;
  repositoryFullName?: string | null;
  categoryLabel?: string | null;
  projectType?: string | null;
  targetUsersLabel?: string | null;
  useCaseLabel?: string | null;
  patternKeys: string[];
  actionStatus?: string | null;
  followUpStage?: string | null;
  actionStartedAt?: string | null;
  actionUpdatedAt: string;
  outcome: ActionOutcome;
  successReasons: SuccessReasonCode[];
  failureReasons: FailureReasonCode[];
  confidence: BehaviorOutcomeConfidence;
  source: BehaviorOutcomeSource;
  notes?: string | null;
  evidenceTags: string[];
  evidenceLevel?: BehaviorEvidenceLevel | null;
  impactLevel?: ImpactLevel | null;
  actionImpactScore?: number | null;
  actionScore?: number | null;
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
};

export type BehaviorCategorySignal = {
  category: string;
  weightedScore: number;
  successCount: number;
  failureCount: number;
  highEvidenceSuccessCount: number;
  highEvidenceFailureCount: number;
  recentSuccessRate: number;
  recentFailureRate: number;
  recoveryScore: number;
  categoryGlobalTrendScore: number;
  preferred: boolean;
  avoided: boolean;
};

export type BehaviorAggregateScore = {
  key: string;
  score: number;
  successCount: number;
  failureCount: number;
  successRate: number;
};

export type BehaviorWindowStats = {
  outcomeCount: number;
  successCount: number;
  failureCount: number;
  inProgressCount: number;
  validatingCount: number;
};

export type BehaviorMemoryProfile = {
  preferredCategories: string[];
  avoidedCategories: string[];
  preferredUserTypes: string[];
  avoidedUserTypes: string[];
  successPatterns: string[];
  failurePatterns: string[];
  successReasons: SuccessReasonCode[];
  failureReasons: FailureReasonCode[];
  recentActionOutcomes: BehaviorMemoryEntry[];
  recentValidatedWins: string[];
  recentDroppedReasons: FailureReasonCode[];
  successRateByCategory: Array<{
    category: string;
    successCount: number;
    failureCount: number;
    successRate: number;
  }>;
  categorySignals: BehaviorCategorySignal[];
  minEvidenceThreshold: number;
  failureWeightDecay: number;
  aggregateScores: {
    categories: BehaviorAggregateScore[];
    userTypes: BehaviorAggregateScore[];
    successReasons: BehaviorAggregateScore[];
    failureReasons: BehaviorAggregateScore[];
  };
  windows: {
    recent7d: BehaviorWindowStats;
    recent30d: BehaviorWindowStats;
    allTime: BehaviorWindowStats;
  };
  generatedAt: string;
};

export type BehaviorMemoryRuntimeStats = {
  memoryLookups: number;
  memoryHits: number;
  recommendationAdjustedByBehaviorCount: number;
  staleMemoryDecayCount: number;
  explainRenderedCount: number;
  explainVisibleCount: number;
  queuePriorityEvaluations: number;
  queuePriorityBoostedCount: number;
  syncedAt: string | null;
};

export type BehaviorMemoryMetrics = {
  successReasonCoverage: number;
  failureReasonCoverage: number;
  memoryHitRate: number;
  recommendationAdjustedByBehaviorCount: number;
  staleMemoryDecayCount: number;
  explainVisibleRate: number;
  behaviorConfidenceDistribution: Record<BehaviorEvidenceLevel, number>;
  memoryPollutionRate: number;
  explainAccuracyRate: number;
  recommendationDriftRate: number;
  recoveryTriggeredCount: number;
  behaviorInfluenceOnQueueRate: number;
};

export type BehaviorMemoryState = {
  version: number;
  updatedAt: string;
  recentActionOutcomes: BehaviorMemoryEntry[];
  profile: BehaviorMemoryProfile;
  runtimeStats: BehaviorMemoryRuntimeStats;
  metrics: BehaviorMemoryMetrics;
};

export type BehaviorRecommendationContext = {
  repoId?: string | null;
  categoryLabel?: string | null;
  projectType?: string | null;
  targetUsersLabel?: string | null;
  useCaseLabel?: string | null;
  patternKeys?: string[];
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
  currentActionStatus?: string | null;
  strengthWeightHint?: number | null;
  monetizationWeightHint?: number | null;
  freshnessWeightHint?: number | null;
};

export type BehaviorRecommendationExplainBreakdown = {
  behaviorWeight: number;
  monetizationWeight: number;
  strengthWeight: number;
  freshnessWeight: number;
};

export type BehaviorRecommendationScore = {
  score: number;
  blocked: boolean;
  explainBreakdown: BehaviorRecommendationExplainBreakdown;
  matchedPreferredCategories: string[];
  matchedAvoidedCategories: string[];
  matchedPreferredUserTypes: string[];
  matchedAvoidedUserTypes: string[];
  matchedSuccessPatterns: string[];
  matchedFailurePatterns: string[];
  matchedSuccessReasons: SuccessReasonCode[];
  matchedFailureReasons: FailureReasonCode[];
  recoveryTriggered: boolean;
};

export type BehaviorRecommendationExplanation = {
  influenced: boolean;
  summary: string;
  bullets: string[];
  raisedBy: string[];
  loweredBy: string[];
  explainBreakdown: BehaviorRecommendationExplainBreakdown;
};

export type ModelBehaviorMemoryInput = {
  userSuccessPatterns: string[];
  userFailurePatterns: string[];
  preferredCategories: string[];
  avoidedCategories: string[];
  recentValidatedWins: string[];
  recentDroppedReasons: FailureReasonCode[];
  userSuccessReasons: SuccessReasonCode[];
  userFailureReasons: FailureReasonCode[];
  minEvidenceThreshold: number;
  failureWeightDecay: number;
};

export type BehaviorReasonInferenceInput = {
  outcome: ActionOutcome;
  projectType?: string | null;
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
  targetUsersLabel?: string | null;
  useCaseLabel?: string | null;
  patternKeys?: string[];
  priorityBoosted?: boolean | null;
};

const MEMORY_VERSION = 2;
const MAX_MEMORY_ENTRIES = 240;
const DEFAULT_MIN_EVIDENCE_THRESHOLD = 3;
const DEFAULT_FAILURE_WEIGHT_DECAY = 0.7;

const GENERIC_LABEL_PATTERNS = [
  /目标用户还需要继续确认/,
  /先确认谁会持续使用它/,
  /收费路径还不够清楚/,
  /更适合先验证价值/,
  /先确认真实用户和场景/,
  /分析尚未完成/,
  /这个项目的中文摘要还在校正/,
  /这个项目暂时更适合放在低优先观察池里/,
];

const MANUAL_WORK_PATTERNS = [/手动/, /人工/, /运营/, /审核/, /整理/, /录入/];

export const SUCCESS_REASON_LABELS: Record<SuccessReasonCode, string> = {
  REAL_USER_CONFIRMED: '真实用户已确认',
  CLEAR_USE_CASE: '使用场景清晰',
  FAST_TO_BUILD: '可以快速落地',
  MONETIZATION_CONFIRMED: '收费路径明确',
  DISTRIBUTION_CLEAR: '分发路径较清楚',
  DIFFERENTIATED_ENOUGH: '差异化足够',
};

export const FAILURE_REASON_LABELS: Record<FailureReasonCode, string> = {
  NO_REAL_USER: '缺少真实用户',
  WEAK_MONETIZATION: '收费路径偏弱',
  TOO_INFRA_HEAVY: '太偏基础设施',
  TOO_COMPLEX: '实现复杂度过高',
  NOT_DIFFERENT_ENOUGH: '差异化不够',
  WRONG_DIRECTION: '方向不对',
  LOW_CONFIDENCE_ANALYSIS: '分析可信度偏低',
  TOO_MUCH_MANUAL_WORK: '需要太多人肉推进',
};

const EMPTY_RUNTIME_STATS: BehaviorMemoryRuntimeStats = {
  memoryLookups: 0,
  memoryHits: 0,
  recommendationAdjustedByBehaviorCount: 0,
  staleMemoryDecayCount: 0,
  explainRenderedCount: 0,
  explainVisibleCount: 0,
  queuePriorityEvaluations: 0,
  queuePriorityBoostedCount: 0,
  syncedAt: null,
};

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function mergeMonotonicCounter(left: unknown, right: unknown) {
  return Math.max(toNumber(left), toNumber(right));
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value: unknown) {
  const normalized = asString(value);
  return normalized || null;
}

function normalizeLabel(value: unknown) {
  const normalized = asString(value)
    .replace(/\s+/g, ' ')
    .replace(/^当前状态 ·\s*/, '')
    .replace(/^当前阶段 ·\s*/, '')
    .trim();

  if (
    !normalized ||
    normalized.length < 2 ||
    normalized.length > 120 ||
    GENERIC_LABEL_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return null;
  }

  return normalized;
}

function normalizeStringArray(values: unknown, max = 16) {
  if (!Array.isArray(values)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeLabel(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, max);
}

function normalizeReasonCodes<T extends string>(
  values: unknown,
  allowed: readonly T[],
) {
  if (!Array.isArray(values)) {
    return [] as T[];
  }

  return Array.from(
    new Set(values.filter((value): value is T => allowed.includes(value as T))),
  );
}

function normalizeConfidence(value: unknown): BehaviorOutcomeConfidence {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : 'medium';
}

function pickLatestTimestamp(...values: Array<string | null | undefined>) {
  const normalized = values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());

  return normalized[0] ?? null;
}

function normalizeEvidenceLevel(value: unknown): BehaviorEvidenceLevel {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW'
    ? value
    : 'LOW';
}

function normalizeImpactLevel(value: unknown): ImpactLevel {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW'
    ? value
    : 'LOW';
}

function normalizeSource(value: unknown): BehaviorOutcomeSource {
  return value === 'manual_click' ||
    value === 'repeated_progress' ||
    value === 'validation_result' ||
    value === 'system_inferred'
    ? value
    : 'system_inferred';
}

function normalizeOutcome(value: unknown): ActionOutcome {
  return value === 'SUCCESS' ||
    value === 'FAILED' ||
    value === 'DROPPED' ||
    value === 'PAUSED' ||
    value === 'IN_PROGRESS' ||
    value === 'VALIDATING'
    ? value
    : 'IN_PROGRESS';
}

function inferEvidenceLevel(
  outcome: ActionOutcome,
  source: BehaviorOutcomeSource,
  confidence: BehaviorOutcomeConfidence,
) {
  if (
    (outcome === 'SUCCESS' || outcome === 'FAILED' || outcome === 'DROPPED') &&
    source === 'validation_result' &&
    confidence === 'high'
  ) {
    return 'HIGH' as const;
  }

  if (
    outcome === 'VALIDATING' ||
    confidence === 'medium' ||
    source === 'repeated_progress'
  ) {
    return 'MEDIUM' as const;
  }

  return 'LOW' as const;
}

function computeActionImpactScore(input: {
  outcome: ActionOutcome;
  evidenceLevel: BehaviorEvidenceLevel;
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
  baseScore?: number | null;
}) {
  const baseScore =
    typeof input.baseScore === 'number' && Number.isFinite(input.baseScore)
      ? input.baseScore
      : input.outcome === 'SUCCESS'
        ? 5
        : input.outcome === 'VALIDATING'
          ? 2
          : input.outcome === 'IN_PROGRESS'
            ? 1
            : input.outcome === 'FAILED' || input.outcome === 'DROPPED'
              ? -5
              : -1;
  const monetizationScore = input.isDirectlyMonetizable ? 1.15 : 0.85;
  const validationConfidence =
    input.evidenceLevel === 'HIGH'
      ? 1
      : input.evidenceLevel === 'MEDIUM'
        ? 0.72
        : 0.38;
  const clarityBonus =
    input.hasRealUser && input.hasClearUseCase
      ? 1.08
      : input.hasRealUser || input.hasClearUseCase
        ? 0.96
        : 0.84;
  const actionImpactScore =
    baseScore * monetizationScore * validationConfidence * clarityBonus;
  const absoluteScore = Math.abs(actionImpactScore);
  const impactLevel =
    absoluteScore >= 4 ? 'HIGH' : absoluteScore >= 1.8 ? 'MEDIUM' : 'LOW';

  return {
    actionImpactScore,
    impactLevel: impactLevel as ImpactLevel,
  };
}

function emptyWindowStats(): BehaviorWindowStats {
  return {
    outcomeCount: 0,
    successCount: 0,
    failureCount: 0,
    inProgressCount: 0,
    validatingCount: 0,
  };
}

export function inferBehaviorOutcomeFromStatus(
  status: string | null | undefined,
): ActionOutcome {
  if (status === 'COMPLETED') {
    return 'SUCCESS';
  }

  if (status === 'DROPPED') {
    return 'DROPPED';
  }

  if (status === 'VALIDATING') {
    return 'VALIDATING';
  }

  if (status === 'NOT_STARTED') {
    return 'PAUSED';
  }

  return 'IN_PROGRESS';
}

export function inferBehaviorReasons(
  input: BehaviorReasonInferenceInput,
): Pick<
  BehaviorMemoryEntry,
  'successReasons' | 'failureReasons' | 'confidence' | 'evidenceTags'
> {
  const successReasons: SuccessReasonCode[] = [];
  const failureReasons: FailureReasonCode[] = [];
  const evidenceTags = normalizeStringArray(input.patternKeys ?? [], 12);
  const projectType = asNullableString(input.projectType);
  const targetUsersLabel = normalizeLabel(input.targetUsersLabel);
  const useCaseLabel = normalizeLabel(input.useCaseLabel);
  const hasRealUser = input.hasRealUser === true;
  const hasClearUseCase = input.hasClearUseCase === true;
  const isDirectlyMonetizable = input.isDirectlyMonetizable === true;
  const outcome = input.outcome;

  if (outcome === 'SUCCESS') {
    if (hasRealUser) {
      successReasons.push('REAL_USER_CONFIRMED');
    }
    if (hasClearUseCase) {
      successReasons.push('CLEAR_USE_CASE');
    }
    if (projectType === 'product' || projectType === 'tool') {
      successReasons.push('FAST_TO_BUILD');
    }
    if (isDirectlyMonetizable) {
      successReasons.push('MONETIZATION_CONFIRMED');
    }
    if (targetUsersLabel && useCaseLabel) {
      successReasons.push('DISTRIBUTION_CLEAR');
    }
    if (input.priorityBoosted) {
      successReasons.push('DIFFERENTIATED_ENOUGH');
    }
  }

  if (outcome === 'FAILED' || outcome === 'DROPPED') {
    if (!hasRealUser || !targetUsersLabel) {
      failureReasons.push('NO_REAL_USER');
    }
    if (!isDirectlyMonetizable) {
      failureReasons.push('WEAK_MONETIZATION');
    }
    if (
      projectType === 'infra' ||
      projectType === 'model' ||
      projectType === 'demo'
    ) {
      failureReasons.push('TOO_INFRA_HEAVY');
    }
    if (!hasClearUseCase || !useCaseLabel) {
      failureReasons.push('WRONG_DIRECTION');
    }
    if (
      projectType === 'infra' ||
      projectType === 'model' ||
      evidenceTags.some((tag) => tag.startsWith('type:infra'))
    ) {
      failureReasons.push('TOO_COMPLEX');
    }
    if (
      !hasRealUser &&
      !hasClearUseCase &&
      !isDirectlyMonetizable
    ) {
      failureReasons.push('LOW_CONFIDENCE_ANALYSIS');
    }
    if (
      useCaseLabel &&
      MANUAL_WORK_PATTERNS.some((pattern) => pattern.test(useCaseLabel))
    ) {
      failureReasons.push('TOO_MUCH_MANUAL_WORK');
    }
    if (input.priorityBoosted === false) {
      failureReasons.push('NOT_DIFFERENT_ENOUGH');
    }
  }

  const confidence: BehaviorOutcomeConfidence =
    successReasons.length >= 2 || failureReasons.length >= 2
      ? 'high'
      : successReasons.length === 1 || failureReasons.length === 1
        ? 'medium'
        : 'low';

  return {
    successReasons: Array.from(new Set(successReasons)),
    failureReasons: Array.from(new Set(failureReasons)),
    confidence,
    evidenceTags,
  };
}

export function normalizeBehaviorMemoryEntry(
  value: unknown,
): BehaviorMemoryEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const repoId = asString(entry.repoId);
  const actionUpdatedAt =
    asString(entry.actionUpdatedAt) || new Date().toISOString();

  if (!repoId) {
    return null;
  }

  const normalized: BehaviorMemoryEntry = {
    repoId,
    repositoryName: asNullableString(entry.repositoryName),
    repositoryFullName: asNullableString(entry.repositoryFullName),
    categoryLabel: normalizeLabel(entry.categoryLabel),
    projectType: asNullableString(entry.projectType),
    targetUsersLabel: normalizeLabel(entry.targetUsersLabel),
    useCaseLabel: normalizeLabel(entry.useCaseLabel),
    patternKeys: normalizeStringArray(entry.patternKeys, 12),
    actionStatus: asNullableString(entry.actionStatus),
    followUpStage: asNullableString(entry.followUpStage),
    actionStartedAt: asNullableString(entry.actionStartedAt),
    actionUpdatedAt,
    outcome: normalizeOutcome(entry.outcome),
    successReasons: normalizeReasonCodes(entry.successReasons, SUCCESS_REASON_CODES),
    failureReasons: normalizeReasonCodes(entry.failureReasons, FAILURE_REASON_CODES),
    confidence: normalizeConfidence(entry.confidence),
    source: normalizeSource(entry.source),
    notes: asNullableString(entry.notes),
    evidenceTags: normalizeStringArray(entry.evidenceTags, 12),
    evidenceLevel: normalizeEvidenceLevel(entry.evidenceLevel),
    impactLevel: normalizeImpactLevel(entry.impactLevel),
    actionImpactScore:
      typeof entry.actionImpactScore === 'number' ? entry.actionImpactScore : null,
    actionScore: typeof entry.actionScore === 'number' ? entry.actionScore : null,
    hasRealUser:
      typeof entry.hasRealUser === 'boolean' ? entry.hasRealUser : null,
    hasClearUseCase:
      typeof entry.hasClearUseCase === 'boolean' ? entry.hasClearUseCase : null,
    isDirectlyMonetizable:
      typeof entry.isDirectlyMonetizable === 'boolean'
        ? entry.isDirectlyMonetizable
        : null,
  };

  if (normalized.outcome === 'SUCCESS' && normalized.successReasons.length === 0) {
    const inferred = inferBehaviorReasons({
      outcome: normalized.outcome,
      projectType: normalized.projectType,
      hasRealUser: normalized.hasRealUser,
      hasClearUseCase: normalized.hasClearUseCase,
      isDirectlyMonetizable: normalized.isDirectlyMonetizable,
      targetUsersLabel: normalized.targetUsersLabel,
      useCaseLabel: normalized.useCaseLabel,
      patternKeys: normalized.patternKeys,
    });
    normalized.successReasons = inferred.successReasons;
    normalized.evidenceTags = inferred.evidenceTags;
    normalized.confidence = inferred.confidence;
  }

  if (
    (normalized.outcome === 'FAILED' || normalized.outcome === 'DROPPED') &&
    normalized.failureReasons.length === 0
  ) {
    const inferred = inferBehaviorReasons({
      outcome: normalized.outcome,
      projectType: normalized.projectType,
      hasRealUser: normalized.hasRealUser,
      hasClearUseCase: normalized.hasClearUseCase,
      isDirectlyMonetizable: normalized.isDirectlyMonetizable,
      targetUsersLabel: normalized.targetUsersLabel,
      useCaseLabel: normalized.useCaseLabel,
      patternKeys: normalized.patternKeys,
    });
    normalized.failureReasons = inferred.failureReasons;
    normalized.evidenceTags = inferred.evidenceTags;
    normalized.confidence = inferred.confidence;
  }

  if (!entry.evidenceLevel) {
    normalized.evidenceLevel = inferEvidenceLevel(
      normalized.outcome,
      normalized.source,
      normalized.confidence,
    );
  }

  if (!entry.actionImpactScore || !entry.impactLevel) {
    const impact = computeActionImpactScore({
      outcome: normalized.outcome,
      evidenceLevel: normalized.evidenceLevel ?? 'LOW',
      hasRealUser: normalized.hasRealUser,
      hasClearUseCase: normalized.hasClearUseCase,
      isDirectlyMonetizable: normalized.isDirectlyMonetizable,
      baseScore: normalized.actionScore,
    });
    normalized.actionImpactScore = impact.actionImpactScore;
    normalized.impactLevel = impact.impactLevel;
  }

  return normalized;
}

function makeEntryKey(entry: BehaviorMemoryEntry) {
  return `${entry.repoId}:${entry.actionUpdatedAt}:${entry.outcome}:${entry.source}`;
}

function getDecayWeight(ageDays: number) {
  if (ageDays <= 7) {
    return 1;
  }

  if (ageDays <= 30) {
    return 0.65;
  }

  if (ageDays <= 90) {
    return 0.35;
  }

  return 0.15;
}

function getEvidenceWeight(level: BehaviorEvidenceLevel | null | undefined) {
  if (level === 'HIGH') {
    return 1;
  }

  if (level === 'MEDIUM') {
    return 0.65;
  }

  return 0.28;
}

function getWeightedOutcomeValue(entry: BehaviorMemoryEntry, ageDays: number) {
  const baseScore =
    typeof entry.actionImpactScore === 'number' &&
    Number.isFinite(entry.actionImpactScore)
      ? entry.actionImpactScore
      : typeof entry.actionScore === 'number' && Number.isFinite(entry.actionScore)
        ? entry.actionScore
      : entry.outcome === 'SUCCESS'
        ? 5
        : entry.outcome === 'VALIDATING'
          ? 2
          : entry.outcome === 'IN_PROGRESS'
            ? 1
            : entry.outcome === 'FAILED' || entry.outcome === 'DROPPED'
              ? -5
              : -1;

  const decay = getDecayWeight(ageDays);
  const freshnessBonus = ageDays <= 7 ? 1.08 : ageDays <= 30 ? 1 : 0.92;
  const evidenceWeight = getEvidenceWeight(entry.evidenceLevel);
  const failureWeightDecay =
    (entry.outcome === 'FAILED' || entry.outcome === 'DROPPED') && ageDays <= 7
      ? DEFAULT_FAILURE_WEIGHT_DECAY
      : 1;
  return baseScore * decay * freshnessBonus * evidenceWeight * failureWeightDecay;
}

function accumulateScore(
  map: Map<string, { score: number; successCount: number; failureCount: number }>,
  key: string | null,
  weightedScore: number,
  entry: BehaviorMemoryEntry,
) {
  if (!key) {
    return;
  }

  const current = map.get(key) ?? { score: 0, successCount: 0, failureCount: 0 };
  current.score += weightedScore;

  if (entry.outcome === 'SUCCESS') {
    current.successCount += 1;
  }

  if (entry.outcome === 'FAILED' || entry.outcome === 'DROPPED') {
    current.failureCount += 1;
  }

  map.set(key, current);
}

function toAggregateScores(
  map: Map<string, { score: number; successCount: number; failureCount: number }>,
) {
  return Array.from(map.entries())
    .map(([key, value]) => {
      const total = value.successCount + value.failureCount;
      return {
        key,
        score: value.score,
        successCount: value.successCount,
        failureCount: value.failureCount,
        successRate: total > 0 ? value.successCount / total : 0,
      };
    })
    .sort((left, right) => Math.abs(right.score) - Math.abs(left.score));
}

function pushWindowStats(target: BehaviorWindowStats, entry: BehaviorMemoryEntry) {
  target.outcomeCount += 1;

  if (entry.outcome === 'SUCCESS') {
    target.successCount += 1;
  } else if (entry.outcome === 'FAILED' || entry.outcome === 'DROPPED') {
    target.failureCount += 1;
  } else if (entry.outcome === 'IN_PROGRESS') {
    target.inProgressCount += 1;
  } else if (entry.outcome === 'VALIDATING') {
    target.validatingCount += 1;
  }
}

function sortEntriesByTime(entries: BehaviorMemoryEntry[]) {
  return [...entries].sort(
    (left, right) =>
      new Date(right.actionUpdatedAt).getTime() -
      new Date(left.actionUpdatedAt).getTime(),
  );
}

export function buildBehaviorMemoryState(
  entriesInput: BehaviorMemoryEntry[],
  runtimeStatsInput: Partial<BehaviorMemoryRuntimeStats> = {},
  nowIso: string = new Date().toISOString(),
): BehaviorMemoryState {
  const entries = sortEntriesByTime(
    entriesInput
      .map((entry) => normalizeBehaviorMemoryEntry(entry))
      .filter((entry): entry is BehaviorMemoryEntry => entry !== null),
  ).slice(0, MAX_MEMORY_ENTRIES);
  const now = new Date(nowIso).getTime();
  const categoryScores = new Map<
    string,
    { score: number; successCount: number; failureCount: number }
  >();
  const categoryDetail = new Map<
    string,
    {
      successCount: number;
      failureCount: number;
      highEvidenceSuccessCount: number;
      highEvidenceFailureCount: number;
      recent7dSuccess: number;
      recent7dFailure: number;
      recent30dSuccess: number;
      recent30dFailure: number;
      allTimeSuccessWeight: number;
      allTimeFailureWeight: number;
    }
  >();
  const userScores = new Map<
    string,
    { score: number; successCount: number; failureCount: number }
  >();
  const successReasonScores = new Map<
    string,
    { score: number; successCount: number; failureCount: number }
  >();
  const failureReasonScores = new Map<
    string,
    { score: number; successCount: number; failureCount: number }
  >();
  const successPatternScores = new Map<
    string,
    { score: number; successCount: number; failureCount: number }
  >();
  const failurePatternScores = new Map<
    string,
    { score: number; successCount: number; failureCount: number }
  >();
  const recent7d = emptyWindowStats();
  const recent30d = emptyWindowStats();
  const allTime = emptyWindowStats();
  let successReasonCovered = 0;
  let failureReasonCovered = 0;
  let successCount = 0;
  let failureCount = 0;
  let staleMemoryDecayCount = 0;
  let recoveryTriggeredCount = 0;
  let lowEvidenceCount = 0;
  let mediumEvidenceCount = 0;
  let highEvidenceCount = 0;

  for (const entry of entries) {
    const ageDays = Math.max(
      0,
      (now - new Date(entry.actionUpdatedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const weightedScore = getWeightedOutcomeValue(entry, ageDays);
    const categoryKey = normalizeLabel(entry.categoryLabel);

    if (ageDays > 90) {
      staleMemoryDecayCount += 1;
    }

    if (entry.evidenceLevel === 'HIGH') {
      highEvidenceCount += 1;
    } else if (entry.evidenceLevel === 'MEDIUM') {
      mediumEvidenceCount += 1;
    } else {
      lowEvidenceCount += 1;
    }

    pushWindowStats(allTime, entry);
    if (ageDays <= 30) {
      pushWindowStats(recent30d, entry);
    }
    if (ageDays <= 7) {
      pushWindowStats(recent7d, entry);
    }

    if (entry.outcome === 'SUCCESS') {
      successCount += 1;
      if (entry.successReasons.length > 0) {
        successReasonCovered += 1;
      }
    }

    if (entry.outcome === 'FAILED' || entry.outcome === 'DROPPED') {
      failureCount += 1;
      if (entry.failureReasons.length > 0) {
        failureReasonCovered += 1;
      }
    }

    accumulateScore(categoryScores, categoryKey, weightedScore, entry);
    accumulateScore(userScores, normalizeLabel(entry.targetUsersLabel), weightedScore, entry);

    if (categoryKey) {
      const current =
        categoryDetail.get(categoryKey) ?? {
          successCount: 0,
          failureCount: 0,
          highEvidenceSuccessCount: 0,
          highEvidenceFailureCount: 0,
          recent7dSuccess: 0,
          recent7dFailure: 0,
          recent30dSuccess: 0,
          recent30dFailure: 0,
          allTimeSuccessWeight: 0,
          allTimeFailureWeight: 0,
        };

      if (entry.outcome === 'SUCCESS') {
        current.successCount += 1;
        current.allTimeSuccessWeight += Math.max(weightedScore, 0);
        if (entry.evidenceLevel === 'HIGH') {
          current.highEvidenceSuccessCount += 1;
        }
        if (ageDays <= 7) {
          current.recent7dSuccess += 1;
        }
        if (ageDays <= 30) {
          current.recent30dSuccess += 1;
        }
      }

      if (entry.outcome === 'FAILED' || entry.outcome === 'DROPPED') {
        current.failureCount += 1;
        current.allTimeFailureWeight += Math.abs(Math.min(weightedScore, 0));
        if (entry.evidenceLevel === 'HIGH') {
          current.highEvidenceFailureCount += 1;
        }
        if (ageDays <= 7) {
          current.recent7dFailure += 1;
        }
        if (ageDays <= 30) {
          current.recent30dFailure += 1;
        }
      }

      categoryDetail.set(categoryKey, current);
    }

    for (const pattern of entry.patternKeys) {
      if (entry.outcome === 'SUCCESS' && entry.evidenceLevel === 'HIGH') {
        accumulateScore(successPatternScores, pattern, Math.max(weightedScore, 1), entry);
      }
      if (
        (entry.outcome === 'FAILED' || entry.outcome === 'DROPPED') &&
        entry.evidenceLevel !== 'LOW'
      ) {
        accumulateScore(failurePatternScores, pattern, Math.min(weightedScore, -1), entry);
      }
    }

    for (const reason of entry.successReasons) {
      if (entry.evidenceLevel !== 'HIGH') {
        continue;
      }
      accumulateScore(
        successReasonScores,
        reason,
        Math.max(weightedScore, 1),
        entry,
      );
    }

    for (const reason of entry.failureReasons) {
      if (entry.evidenceLevel === 'LOW') {
        continue;
      }
      accumulateScore(
        failureReasonScores,
        reason,
        Math.min(weightedScore, -1),
        entry,
      );
    }
  }

  const categoryAggregates = toAggregateScores(categoryScores);
  const userAggregates = toAggregateScores(userScores);
  const successReasonAggregates = toAggregateScores(successReasonScores);
  const failureReasonAggregates = toAggregateScores(failureReasonScores);
  const successPatternAggregates = toAggregateScores(successPatternScores);
  const failurePatternAggregates = toAggregateScores(failurePatternScores);
  const categorySignalMap = new Map<string, BehaviorCategorySignal>();

  for (const item of categoryAggregates) {
    const detail = categoryDetail.get(item.key);
    if (!detail) {
      continue;
    }

    const recentSuccessTotal = detail.recent7dSuccess + detail.recent30dSuccess;
    const recentFailureTotal = detail.recent7dFailure + detail.recent30dFailure;
    const recentTotal = recentSuccessTotal + recentFailureTotal;
    const recentSuccessRate = recentTotal > 0 ? recentSuccessTotal / recentTotal : 0;
    const recentFailureRate = recentTotal > 0 ? recentFailureTotal / recentTotal : 0;
    const recoveryScore =
      detail.recent30dSuccess * 1.6 -
      detail.recent30dFailure * 1.2 +
      detail.highEvidenceSuccessCount -
      Math.max(0, detail.highEvidenceFailureCount - 1);
    const categoryGlobalTrendScore =
      recentSuccessRate * 2.2 -
      recentFailureRate * 1.3 +
      Math.min(1.5, detail.highEvidenceSuccessCount * 0.2);
    const preferred =
      detail.highEvidenceSuccessCount >= DEFAULT_MIN_EVIDENCE_THRESHOLD &&
      item.score > 1 &&
      recoveryScore >= -1;
    const avoided =
      detail.highEvidenceFailureCount >= DEFAULT_MIN_EVIDENCE_THRESHOLD &&
      item.score < -1 &&
      recoveryScore < 1 &&
      categoryGlobalTrendScore < 1.15;

    if (
      detail.highEvidenceFailureCount >= DEFAULT_MIN_EVIDENCE_THRESHOLD &&
      (recoveryScore >= 1 || categoryGlobalTrendScore >= 1.15)
    ) {
      recoveryTriggeredCount += 1;
    }

    categorySignalMap.set(item.key, {
      category: item.key,
      weightedScore: item.score,
      successCount: detail.successCount,
      failureCount: detail.failureCount,
      highEvidenceSuccessCount: detail.highEvidenceSuccessCount,
      highEvidenceFailureCount: detail.highEvidenceFailureCount,
      recentSuccessRate,
      recentFailureRate,
      recoveryScore,
      categoryGlobalTrendScore,
      preferred,
      avoided,
    });
  }

  const categorySignals = Array.from(categorySignalMap.values()).sort(
    (left, right) =>
      Math.abs(right.weightedScore + right.recoveryScore) -
      Math.abs(left.weightedScore + left.recoveryScore),
  );

  const profile: BehaviorMemoryProfile = {
    preferredCategories: categorySignals
      .filter((item) => item.preferred)
      .map((item) => item.category)
      .slice(0, 4),
    avoidedCategories: categorySignals
      .filter((item) => item.avoided)
      .map((item) => item.category)
      .slice(0, 4),
    preferredUserTypes: userAggregates
      .filter((item) => item.score > 0 && item.successCount >= 1)
      .map((item) => item.key)
      .slice(0, 4),
    avoidedUserTypes: userAggregates
      .filter((item) => item.score < 0 && item.failureCount >= DEFAULT_MIN_EVIDENCE_THRESHOLD)
      .map((item) => item.key)
      .slice(0, 4),
    successPatterns: successPatternAggregates.map((item) => item.key).slice(0, 12),
    failurePatterns: failurePatternAggregates.map((item) => item.key).slice(0, 12),
    successReasons: successReasonAggregates
      .map((item) => item.key as SuccessReasonCode)
      .slice(0, 6),
    failureReasons: failureReasonAggregates
      .map((item) => item.key as FailureReasonCode)
      .slice(0, 6),
    recentActionOutcomes: entries.slice(0, 12),
    recentValidatedWins: entries
      .filter((entry) => entry.outcome === 'SUCCESS')
      .slice(0, 5)
      .map(
        (entry) =>
          normalizeLabel(entry.useCaseLabel) ||
          normalizeLabel(entry.categoryLabel) ||
          entry.repositoryName ||
          entry.repoId,
      )
      .filter((value): value is string => Boolean(value)),
    recentDroppedReasons: entries
      .filter((entry) => entry.outcome === 'FAILED' || entry.outcome === 'DROPPED')
      .flatMap((entry) => entry.failureReasons)
      .filter(
        (reason, index, array) => array.indexOf(reason) === index,
      )
      .slice(0, 6),
    successRateByCategory: categoryAggregates
      .filter((item) => item.successCount > 0 || item.failureCount > 0)
      .map((item) => ({
        category: item.key,
        successCount: item.successCount,
        failureCount: item.failureCount,
        successRate: item.successRate,
      }))
      .slice(0, 8),
    categorySignals: categorySignals.slice(0, 10),
    minEvidenceThreshold: DEFAULT_MIN_EVIDENCE_THRESHOLD,
    failureWeightDecay: DEFAULT_FAILURE_WEIGHT_DECAY,
    aggregateScores: {
      categories: categoryAggregates.slice(0, 10),
      userTypes: userAggregates.slice(0, 10),
      successReasons: successReasonAggregates.slice(0, 6),
      failureReasons: failureReasonAggregates.slice(0, 6),
    },
    windows: {
      recent7d,
      recent30d,
      allTime,
    },
    generatedAt: nowIso,
  };

  const runtimeStats: BehaviorMemoryRuntimeStats = {
    ...EMPTY_RUNTIME_STATS,
    ...runtimeStatsInput,
    staleMemoryDecayCount:
      runtimeStatsInput.staleMemoryDecayCount ?? staleMemoryDecayCount,
    syncedAt:
      typeof runtimeStatsInput.syncedAt === 'string'
        ? runtimeStatsInput.syncedAt
        : null,
  };

  const metrics: BehaviorMemoryMetrics = {
    successReasonCoverage:
      successCount > 0 ? successReasonCovered / successCount : 1,
    failureReasonCoverage:
      failureCount > 0 ? failureReasonCovered / failureCount : 1,
    memoryHitRate:
      runtimeStats.memoryLookups > 0
        ? runtimeStats.memoryHits / runtimeStats.memoryLookups
        : 0,
    recommendationAdjustedByBehaviorCount:
      runtimeStats.recommendationAdjustedByBehaviorCount,
    staleMemoryDecayCount: runtimeStats.staleMemoryDecayCount,
    explainVisibleRate:
      runtimeStats.explainRenderedCount > 0
        ? runtimeStats.explainVisibleCount / runtimeStats.explainRenderedCount
        : 0,
    behaviorConfidenceDistribution: {
      LOW: lowEvidenceCount,
      MEDIUM: mediumEvidenceCount,
      HIGH: highEvidenceCount,
    },
    memoryPollutionRate:
      entries.length > 0 ? lowEvidenceCount / entries.length : 0,
    explainAccuracyRate:
      runtimeStats.recommendationAdjustedByBehaviorCount > 0
        ? Math.min(
            1,
            runtimeStats.explainVisibleCount /
              runtimeStats.recommendationAdjustedByBehaviorCount,
          )
        : 1,
    recommendationDriftRate:
      categorySignals.length > 0
        ? categorySignals.filter(
            (item) => item.recoveryScore >= 1 || item.categoryGlobalTrendScore >= 1.15,
          ).length / categorySignals.length
        : 0,
    recoveryTriggeredCount,
    behaviorInfluenceOnQueueRate:
      runtimeStats.queuePriorityEvaluations > 0
        ? runtimeStats.queuePriorityBoostedCount / runtimeStats.queuePriorityEvaluations
        : 0,
  };

  return {
    version: MEMORY_VERSION,
    updatedAt: nowIso,
    recentActionOutcomes: entries,
    profile,
    runtimeStats,
    metrics,
  };
}

export function createEmptyBehaviorMemoryState(nowIso = new Date().toISOString()) {
  return buildBehaviorMemoryState([], EMPTY_RUNTIME_STATS, nowIso);
}

export function mergeBehaviorMemoryStates(
  primary: BehaviorMemoryState | null | undefined,
  secondary: BehaviorMemoryState | null | undefined,
  nowIso = new Date().toISOString(),
) {
  const entries = [
    ...(primary?.recentActionOutcomes ?? []),
    ...(secondary?.recentActionOutcomes ?? []),
  ];
  const byKey = new Map<string, BehaviorMemoryEntry>();

  for (const entry of entries) {
    const normalized = normalizeBehaviorMemoryEntry(entry);
    if (!normalized) {
      continue;
    }

    byKey.set(makeEntryKey(normalized), normalized);
  }

  const runtimeStats: Partial<BehaviorMemoryRuntimeStats> = {
    memoryLookups: mergeMonotonicCounter(
      primary?.runtimeStats.memoryLookups,
      secondary?.runtimeStats.memoryLookups,
    ),
    memoryHits: mergeMonotonicCounter(
      primary?.runtimeStats.memoryHits,
      secondary?.runtimeStats.memoryHits,
    ),
    recommendationAdjustedByBehaviorCount: mergeMonotonicCounter(
      primary?.runtimeStats.recommendationAdjustedByBehaviorCount,
      secondary?.runtimeStats.recommendationAdjustedByBehaviorCount,
    ),
    staleMemoryDecayCount: mergeMonotonicCounter(
      primary?.runtimeStats.staleMemoryDecayCount,
      secondary?.runtimeStats.staleMemoryDecayCount,
    ),
    explainRenderedCount: mergeMonotonicCounter(
      primary?.runtimeStats.explainRenderedCount,
      secondary?.runtimeStats.explainRenderedCount,
    ),
    explainVisibleCount: mergeMonotonicCounter(
      primary?.runtimeStats.explainVisibleCount,
      secondary?.runtimeStats.explainVisibleCount,
    ),
    queuePriorityEvaluations: mergeMonotonicCounter(
      primary?.runtimeStats.queuePriorityEvaluations,
      secondary?.runtimeStats.queuePriorityEvaluations,
    ),
    queuePriorityBoostedCount: mergeMonotonicCounter(
      primary?.runtimeStats.queuePriorityBoostedCount,
      secondary?.runtimeStats.queuePriorityBoostedCount,
    ),
    syncedAt: pickLatestTimestamp(
      primary?.runtimeStats.syncedAt,
      secondary?.runtimeStats.syncedAt,
    ),
  };

  return buildBehaviorMemoryState(Array.from(byKey.values()), runtimeStats, nowIso);
}

export function appendBehaviorMemoryEntry(
  state: BehaviorMemoryState | null | undefined,
  entry: BehaviorMemoryEntry,
  nowIso = new Date().toISOString(),
) {
  const normalized = normalizeBehaviorMemoryEntry(entry);
  if (!normalized) {
    return state ?? createEmptyBehaviorMemoryState(nowIso);
  }

  const previousEntries = state?.recentActionOutcomes ?? [];
  const existingKey = makeEntryKey(normalized);
  const deduped = previousEntries.filter((item) => {
    const current = normalizeBehaviorMemoryEntry(item);
    return current ? makeEntryKey(current) !== existingKey : false;
  });

  return buildBehaviorMemoryState(
    [normalized, ...deduped].slice(0, MAX_MEMORY_ENTRIES),
    state?.runtimeStats,
    nowIso,
  );
}

export function clearBehaviorMemoryState(
  state: BehaviorMemoryState | null | undefined,
  scope:
    | { type: 'all' }
    | { type: 'category'; value: string }
    | { type: 'user'; value: string } = { type: 'all' },
  nowIso = new Date().toISOString(),
) {
  if (!state || scope.type === 'all') {
    return createEmptyBehaviorMemoryState(nowIso);
  }

  const filtered = state.recentActionOutcomes.filter((entry) => {
    if (scope.type === 'category') {
      return normalizeLabel(entry.categoryLabel) !== normalizeLabel(scope.value);
    }

    return normalizeLabel(entry.targetUsersLabel) !== normalizeLabel(scope.value);
  });

  return buildBehaviorMemoryState(filtered, state.runtimeStats, nowIso);
}

export function normalizeBehaviorMemoryState(
  value: unknown,
): BehaviorMemoryState {
  if (!value || typeof value !== 'object') {
    return createEmptyBehaviorMemoryState();
  }

  const raw = value as Record<string, unknown>;
  const entries = Array.isArray(raw.recentActionOutcomes)
    ? raw.recentActionOutcomes
    : Array.isArray(raw.entries)
      ? raw.entries
      : [];

  return buildBehaviorMemoryState(
    entries
      .map((entry) => normalizeBehaviorMemoryEntry(entry))
      .filter((entry): entry is BehaviorMemoryEntry => entry !== null),
    raw.runtimeStats && typeof raw.runtimeStats === 'object'
      ? (raw.runtimeStats as Partial<BehaviorMemoryRuntimeStats>)
      : EMPTY_RUNTIME_STATS,
    asString(raw.updatedAt) || new Date().toISOString(),
  );
}

export function buildModelBehaviorMemoryInput(
  profile: BehaviorMemoryProfile,
): ModelBehaviorMemoryInput {
  return {
    userSuccessPatterns: profile.successPatterns.slice(0, 8),
    userFailurePatterns: profile.failurePatterns.slice(0, 8),
    preferredCategories: profile.preferredCategories.slice(0, 4),
    avoidedCategories: profile.avoidedCategories.slice(0, 4),
    recentValidatedWins: profile.recentValidatedWins.slice(0, 5),
    recentDroppedReasons: profile.recentDroppedReasons.slice(0, 5),
    userSuccessReasons: profile.successReasons.slice(0, 6),
    userFailureReasons: profile.failureReasons.slice(0, 6),
    minEvidenceThreshold: profile.minEvidenceThreshold,
    failureWeightDecay: profile.failureWeightDecay,
  };
}

export function scoreBehaviorRecommendation(
  context: BehaviorRecommendationContext,
  profile: BehaviorMemoryProfile,
): BehaviorRecommendationScore {
  const patternKeys = normalizeStringArray(context.patternKeys ?? [], 12);
  const category = normalizeLabel(context.categoryLabel);
  const userType = normalizeLabel(context.targetUsersLabel);
  const projectType = asNullableString(context.projectType);
  const hasRealUser = context.hasRealUser === true;
  const hasClearUseCase = context.hasClearUseCase === true;
  const isDirectlyMonetizable = context.isDirectlyMonetizable === true;
  const categorySignal = category
    ? profile.categorySignals.find((item) => item.category === category) ?? null
    : null;
  const matchedPreferredCategories = category
    ? profile.preferredCategories.filter((item) => item === category)
    : [];
  const matchedAvoidedCategories = category
    ? profile.avoidedCategories.filter((item) => item === category)
    : [];
  const matchedPreferredUserTypes = userType
    ? profile.preferredUserTypes.filter((item) => item === userType)
    : [];
  const matchedAvoidedUserTypes = userType
    ? profile.avoidedUserTypes.filter((item) => item === userType)
    : [];
  const matchedSuccessPatterns = profile.successPatterns.filter((pattern) =>
    patternKeys.includes(pattern),
  );
  const matchedFailurePatterns = profile.failurePatterns.filter((pattern) =>
    patternKeys.includes(pattern),
  );

  const matchedSuccessReasons = profile.successReasons.filter((reason) => {
    if (reason === 'FAST_TO_BUILD') {
      return projectType === 'product' || projectType === 'tool';
    }
    if (reason === 'REAL_USER_CONFIRMED') {
      return hasRealUser;
    }
    if (reason === 'CLEAR_USE_CASE') {
      return hasClearUseCase;
    }
    if (reason === 'MONETIZATION_CONFIRMED') {
      return isDirectlyMonetizable;
    }
    return false;
  });
  const matchedFailureReasons = profile.failureReasons.filter((reason) => {
    if (reason === 'TOO_INFRA_HEAVY') {
      return projectType === 'infra' || projectType === 'model' || projectType === 'demo';
    }
    if (reason === 'NO_REAL_USER') {
      return !hasRealUser;
    }
    if (reason === 'WEAK_MONETIZATION') {
      return !isDirectlyMonetizable;
    }
    if (reason === 'WRONG_DIRECTION') {
      return !hasClearUseCase;
    }
    return false;
  });

  const recoveryTriggered = Boolean(
    categorySignal &&
      categorySignal.avoided &&
      (categorySignal.recoveryScore >= 1 ||
        categorySignal.categoryGlobalTrendScore >= 1.15),
  );

  let behaviorWeight = 0;
  behaviorWeight += matchedPreferredCategories.length * 3.6;
  behaviorWeight += matchedPreferredUserTypes.length * 1.6;
  behaviorWeight += matchedSuccessPatterns.length * 1.8;
  behaviorWeight += matchedSuccessReasons.length * 1.5;
  behaviorWeight -= matchedAvoidedCategories.length * 4.2;
  behaviorWeight -= matchedAvoidedUserTypes.length * 2.2;
  behaviorWeight -= matchedFailurePatterns.length * 2.8;
  behaviorWeight -= matchedFailureReasons.length * 2.2;

  if (categorySignal) {
    behaviorWeight += Math.max(-2.5, Math.min(3.5, categorySignal.weightedScore * 0.18));
    behaviorWeight += Math.max(-1, Math.min(2.5, categorySignal.recoveryScore * 0.55));
  }

  if (recoveryTriggered) {
    behaviorWeight += 2.4;
  }

  let monetizationWeight =
    typeof context.monetizationWeightHint === 'number'
      ? context.monetizationWeightHint
      : isDirectlyMonetizable
        ? 1.25
        : -1.1;
  if (matchedFailureReasons.includes('WEAK_MONETIZATION')) {
    monetizationWeight -= 1.6;
  }
  if (matchedSuccessReasons.includes('MONETIZATION_CONFIRMED')) {
    monetizationWeight += 1.2;
  }

  let strengthWeight =
    typeof context.strengthWeightHint === 'number'
      ? context.strengthWeightHint
      : hasRealUser && hasClearUseCase
        ? 1.35
        : hasRealUser || hasClearUseCase
          ? 0.45
          : -1.2;
  if (projectType === 'infra' || projectType === 'model' || projectType === 'demo') {
    strengthWeight -= 0.8;
  }

  const freshnessWeight =
    typeof context.freshnessWeightHint === 'number'
      ? context.freshnessWeightHint
      : context.currentActionStatus === 'VALIDATING'
        ? 1.2
        : context.currentActionStatus === 'IN_PROGRESS'
          ? 0.8
          : 0;

  const score =
    behaviorWeight + monetizationWeight + strengthWeight + freshnessWeight;

  const blocked =
    !recoveryTriggered &&
    (matchedAvoidedCategories.length > 0 ||
      matchedFailurePatterns.length >= profile.minEvidenceThreshold - 1 ||
      matchedFailureReasons.includes('TOO_INFRA_HEAVY'));

  return {
    score,
    explainBreakdown: {
      behaviorWeight,
      monetizationWeight,
      strengthWeight,
      freshnessWeight,
    },
    blocked:
      blocked &&
      matchedPreferredCategories.length === 0 &&
      matchedSuccessPatterns.length === 0 &&
      matchedSuccessReasons.length === 0,
    matchedPreferredCategories,
    matchedAvoidedCategories,
    matchedPreferredUserTypes,
    matchedAvoidedUserTypes,
    matchedSuccessPatterns,
    matchedFailurePatterns,
    matchedSuccessReasons,
    matchedFailureReasons,
    recoveryTriggered,
  };
}

export function explainBehaviorRecommendation(
  context: BehaviorRecommendationContext,
  profile: BehaviorMemoryProfile,
  score: BehaviorRecommendationScore,
): BehaviorRecommendationExplanation {
  const raisedBy: string[] = [];
  const loweredBy: string[] = [];

  if (score.matchedPreferredCategories.length > 0) {
    raisedBy.push(`你最近在 ${score.matchedPreferredCategories[0]} 方向上更容易推进出结果`);
  }

  if (score.matchedSuccessReasons.includes('CLEAR_USE_CASE')) {
    raisedBy.push('这个项目更符合你最近做成的“场景清晰”模式');
  }

  if (score.matchedSuccessReasons.includes('FAST_TO_BUILD')) {
    raisedBy.push('它更贴近你最近做成的“能快速落地”方向');
  }

  if (score.matchedSuccessReasons.includes('MONETIZATION_CONFIRMED')) {
    raisedBy.push('这类项目更接近你最近验证通过的收费路径');
  }

  if (score.recoveryTriggered) {
    raisedBy.push('你最近在这个方向重新做出了结果，所以系统把它拉回候选');
  }

  if (score.matchedFailureReasons.includes('TOO_INFRA_HEAVY')) {
    loweredBy.push('你最近放弃过偏 infra-heavy 的方向，这类项目已被降权');
  }

  if (score.matchedFailureReasons.includes('NO_REAL_USER')) {
    loweredBy.push('你最近放弃过缺少真实用户的方向，所以系统会更保守');
  }

  if (score.matchedFailureReasons.includes('WEAK_MONETIZATION')) {
    loweredBy.push('你最近放弃过收费路径偏弱的方向，这类项目会被延后');
  }

  if (score.matchedFailurePatterns.length > 0 && loweredBy.length === 0) {
    loweredBy.push('这类方向和你最近放弃过的项目更像，推荐权重已下调');
  }

  if (score.matchedSuccessPatterns.length > 0 && raisedBy.length === 0) {
    raisedBy.push('这个项目更贴近你最近做成过的方向');
  }

  const influenced = raisedBy.length > 0 || loweredBy.length > 0;
  const summary = loweredBy[0]
    ? loweredBy[0]
    : raisedBy[0]
      ? raisedBy[0]
      : '这个项目当前主要还是按仓库本身信号排序。';
  const behaviorHeadline =
    score.explainBreakdown.behaviorWeight >= 1.5
      ? '你的最近行为明显抬高了它的优先级'
      : score.explainBreakdown.behaviorWeight <= -1.5
        ? '你最近的失败方向正在压低它的优先级'
        : '它仍然主要按项目本身信号排序';
  const breakdownBullets = [
    `行为信号 ${formatWeight(score.explainBreakdown.behaviorWeight)}`,
    `收费信号 ${formatWeight(score.explainBreakdown.monetizationWeight)}`,
    `可落地信号 ${formatWeight(score.explainBreakdown.strengthWeight)}`,
    `时效性 ${formatWeight(score.explainBreakdown.freshnessWeight)}`,
  ];

  return {
    influenced,
    summary: influenced ? `${behaviorHeadline}：${summary}` : summary,
    bullets: [...breakdownBullets, ...raisedBy, ...loweredBy].slice(0, 4),
    raisedBy,
    loweredBy,
    explainBreakdown: score.explainBreakdown,
  };
}

function formatWeight(value: number) {
  const normalized = Math.round(value * 10) / 10;
  return normalized > 0 ? `+${normalized}` : `${normalized}`;
}
