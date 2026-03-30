import type { HistoricalInventoryQualityState } from './historical-data-inventory.helper';
import type {
  HistoricalRepairBucket,
  HistoricalRepairVisibilityLevel,
} from './historical-repair-bucketing.helper';
import type {
  HistoricalCleanupState,
} from './historical-cleanup-policy.helper';
import type { HistoricalRepairPriorityItem } from './historical-repair-priority.helper';
import {
  getModelTaskRouterDefinition,
  listModelTaskRouterDefinitions,
} from './model-task-router.helper';
import {
  type ModelTaskIntent,
  type ModelTaskRouterExecutionMetadata,
  type ModelTaskRouterFallbackBreakdown,
  type ModelTaskRouterCapabilityBreakdown,
  type ModelRouterCostSensitivity,
  type ModelTaskCapabilityTierName,
  type ModelTaskFallbackPolicy,
  type ModelTaskLatencyClass,
  type ModelTaskRouterDecisionInput,
  type ModelTaskRouterDecisionOutput,
  type ModelTaskRouterPriorityClass,
  type ModelTaskRouterRetryClass,
  type NormalizedModelTaskType,
} from './model-task-router.types';

const HIGH_VISIBILITY_LEVELS: HistoricalRepairVisibilityLevel[] = [
  'HOME',
  'FAVORITES',
  'DAILY_SUMMARY',
  'TELEGRAM',
];

export type ModelTaskRouterDecisionReport = {
  generatedAt: string;
  source: {
    priorityGeneratedAt: string;
  };
  summary: {
    staticTaskCount: number;
    dynamicRepairItemCount: number;
    capabilityTierBreakdown: Record<ModelTaskCapabilityTierName, number>;
    deterministicOnlyCount: number;
    reviewRequiredCount: number;
    cleanupSuppressedCount: number;
    taskTypeTierDistribution: Array<{
      normalizedTaskType: NormalizedModelTaskType;
      capabilityTierBreakdown: Record<ModelTaskCapabilityTierName, number>;
    }>;
    deterministicOnlyTasks: NormalizedModelTaskType[];
    reviewRequiredTasks: NormalizedModelTaskType[];
    highCostWorthKeeping: NormalizedModelTaskType[];
  };
  baselineDecisions: ModelTaskRouterDecisionOutput[];
  dynamicDecisions: ModelTaskRouterDecisionOutput[];
  samples: {
    reviewRequired: Array<DecisionSample>;
    deterministicOnly: Array<DecisionSample>;
    cleanupSuppressed: Array<DecisionSample>;
  };
};

export const MODEL_TASK_ROUTER_FALLBACK_POLICIES: ModelTaskFallbackPolicy[] = [
  'NONE',
  'PROVIDER_FALLBACK',
  'DETERMINISTIC_ONLY',
  'LIGHT_DERIVATION',
  'RETRY_THEN_REVIEW',
  'RETRY_THEN_DOWNGRADE',
  'DOWNGRADE_ONLY',
];

type DecisionSample = {
  fullName: string;
  taskType: NormalizedModelTaskType;
  capabilityTier: ModelTaskCapabilityTierName;
  requiresReview: boolean;
  cleanupState: string | null;
  bucket: string | null;
  reason: string;
};

export function buildModelTaskRouterDecision(
  input: ModelTaskRouterDecisionInput,
): ModelTaskRouterDecisionOutput {
  const definition = getModelTaskRouterDefinition(input.normalizedTaskType);
  if (!definition) {
    throw new Error(`Unknown normalized task type: ${input.normalizedTaskType}`);
  }

  const decisionRecalcGaps = normalizeStringArray(input.decisionRecalcGaps);
  const deepRepairGaps = normalizeStringArray(input.deepRepairGaps);
  const evidenceRepairGaps = normalizeStringArray(input.evidenceRepairGaps);
  const trustedBlockingGaps = normalizeStringArray(input.trustedBlockingGaps);
  const keyEvidenceGaps = normalizeStringArray(input.keyEvidenceGaps);
  const cleanupState = normalizeCleanupState(input.cleanupState);
  const historicalRepairBucket = normalizeBucket(input.historicalRepairBucket);
  const analysisQualityState = normalizeQualityState(input.analysisQualityState);
  const visibility = normalizeVisibilityLevel(input.strictVisibilityLevel);
  const moneyPriority = normalizeMoneyPriority(input.moneyPriority);
  const repositoryValueTier = normalizeValueTier(input.repositoryValueTier);
  const hasConflictDrivenGaps =
    decisionRecalcGaps.length > 0 ||
    (input.evidenceConflictCount ?? 0) > 0 ||
    Boolean(input.conflictFlag);
  const hasDeepRepairGaps = deepRepairGaps.length > 0;
  const hasWeakRepairGaps = evidenceRepairGaps.length > 0;
  const hasMissingOrConflictGaps =
    hasConflictDrivenGaps || hasDeepRepairGaps;
  const weakOnlyRepair = hasWeakRepairGaps && !hasMissingOrConflictGaps;
  const isVisibleBroken = historicalRepairBucket === 'visible_broken';
  const isHighValueWeak = historicalRepairBucket === 'high_value_weak';
  const isArchiveOrNoise = historicalRepairBucket === 'archive_or_noise';
  const highValue = moneyPriority === 'P0' ||
    moneyPriority === 'P1' ||
    repositoryValueTier === 'HIGH';
  const highVisibility = visibility !== null &&
    HIGH_VISIBILITY_LEVELS.includes(visibility);
  const lowVisibility =
    visibility === 'BACKGROUND' || visibility === 'DETAIL_ONLY';
  const evidenceCoverageRate = clampRate(input.evidenceCoverageRate);
  const fallbackFlag = Boolean(input.fallbackFlag);
  const incompleteFlag = Boolean(input.incompleteFlag);
  const hasDeep = Boolean(input.hasDeep);

  let capabilityTier = definition.preferredCapabilityTier;
  let fallbackPolicy = definition.taskFallbackPolicy;
  let routerPriorityClass = criticalityToPriority(definition.taskCriticality);
  let retryClass = failureEscalationToRetry(definition.failureEscalation);
  let requiresReview =
    definition.preferredCapabilityTier === 'REVIEW' ||
    definition.failureEscalation === 'REVIEW_REQUIRED';
  let costSensitivity = definition.routerCostSensitivity;
  let latencySensitivity = definition.taskLatencyClass;
  const reasons: string[] = [];

  if (cleanupState === 'archive' || cleanupState === 'purge_ready') {
    capabilityTier = 'DETERMINISTIC_ONLY';
    fallbackPolicy = 'DOWNGRADE_ONLY';
    routerPriorityClass = 'P3';
    retryClass = 'NONE';
    requiresReview = false;
    costSensitivity = 'EXTREME';
    latencySensitivity = 'LOW';
    reasons.push(`cleanup=${cleanupState} suppresses high-cost routing`);

    return finalizeDecision({
      input,
      capabilityTier,
      fallbackPolicy,
      routerPriorityClass,
      retryClass,
      requiresReview,
      costSensitivity,
      latencySensitivity,
      reasons,
    });
  }

  if (cleanupState === 'freeze') {
    capabilityTier =
      input.normalizedTaskType === 'evidence_repair' && weakOnlyRepair
        ? 'LIGHT'
        : input.normalizedTaskType === 'refresh_only'
          ? 'LIGHT'
          : 'DETERMINISTIC_ONLY';
    fallbackPolicy = 'DOWNGRADE_ONLY';
    routerPriorityClass = 'P3';
    retryClass =
      capabilityTier === 'LIGHT' ? 'RETRY_ONCE_THEN_DOWNGRADE' : 'NONE';
    requiresReview = false;
    costSensitivity = 'EXTREME';
    latencySensitivity = 'LOW';
    reasons.push('cleanup=freeze caps capability and cost');

    return finalizeDecision({
      input,
      capabilityTier,
      fallbackPolicy,
      routerPriorityClass,
      retryClass,
      requiresReview,
      costSensitivity,
      latencySensitivity,
      reasons,
    });
  }

  switch (input.normalizedTaskType) {
    case 'fast_filter':
    case 'insight':
    case 'downgrade_only':
    case 'cleanup_related': {
      capabilityTier = 'DETERMINISTIC_ONLY';
      fallbackPolicy =
        input.normalizedTaskType === 'downgrade_only'
          ? 'DOWNGRADE_ONLY'
          : 'DETERMINISTIC_ONLY';
      routerPriorityClass =
        input.normalizedTaskType === 'downgrade_only' && highVisibility
          ? 'P1'
          : 'P3';
      retryClass = 'NONE';
      requiresReview = false;
      costSensitivity = 'EXTREME';
      latencySensitivity = 'LOW';
      reasons.push('deterministic or downgrade task should stay low-cost');
      break;
    }
    case 'refresh_only': {
      capabilityTier = lowVisibility ? 'LIGHT' : 'STANDARD';
      fallbackPolicy = 'DETERMINISTIC_ONLY';
      routerPriorityClass = highVisibility ? 'P1' : 'P2';
      retryClass = 'RETRY_ONCE_THEN_DOWNGRADE';
      requiresReview = false;
      costSensitivity = highValue ? 'MEDIUM' : 'HIGH';
      latencySensitivity = highVisibility ? 'MEDIUM' : 'LOW';
      reasons.push('refresh task favors low-cost refresh path');
      break;
    }
    case 'evidence_repair': {
      capabilityTier = weakOnlyRepair && !highValue && !highVisibility
        ? 'LIGHT'
        : 'STANDARD';
      fallbackPolicy = weakOnlyRepair
        ? 'LIGHT_DERIVATION'
        : 'RETRY_THEN_DOWNGRADE';
      routerPriorityClass = isVisibleBroken ? 'P1' : isHighValueWeak ? 'P1' : 'P2';
      retryClass = 'RETRY_ONCE_THEN_DOWNGRADE';
      requiresReview = false;
      costSensitivity =
        isHighValueWeak || highValue ? 'MEDIUM' : 'HIGH';
      latencySensitivity = highVisibility ? 'MEDIUM' : 'LOW';
      reasons.push(
        weakOnlyRepair
          ? 'weak-only evidence gaps can stay on LIGHT/STANDARD'
          : 'evidence repair avoids HEAVY unless escalated later',
      );
      break;
    }
    case 'deep_repair': {
      capabilityTier =
        isHighValueWeak || highValue || deepRepairGaps.length >= 2
          ? 'HEAVY'
          : 'REVIEW';
      fallbackPolicy = 'RETRY_THEN_REVIEW';
      routerPriorityClass = isVisibleBroken ? 'P0' : 'P1';
      retryClass = 'RETRY_ONCE_THEN_REVIEW';
      requiresReview = capabilityTier === 'REVIEW';
      costSensitivity = isHighValueWeak || highValue ? 'LOW' : 'MEDIUM';
      latencySensitivity = highVisibility ? 'HIGH' : 'MEDIUM';
      reasons.push(
        capabilityTier === 'HEAVY'
          ? 'key missing evidence in high-value repair path justifies HEAVY capability'
          : 'non-high-value deep repair is capped below HEAVY',
      );
      break;
    }
    case 'decision_recalc':
    case 'claude_review': {
      capabilityTier =
        hasConflictDrivenGaps || isVisibleBroken || highVisibility
          ? 'REVIEW'
          : 'STANDARD';
      fallbackPolicy = 'RETRY_THEN_REVIEW';
      routerPriorityClass =
        hasConflictDrivenGaps || isVisibleBroken ? 'P0' : 'P1';
      retryClass = 'RETRY_ONCE_THEN_REVIEW';
      requiresReview = capabilityTier === 'REVIEW';
      costSensitivity =
        cleanupState === 'active' && (highValue || isVisibleBroken)
          ? 'LOW'
          : 'MEDIUM';
      latencySensitivity = highVisibility ? 'HIGH' : 'MEDIUM';
      reasons.push(
        hasConflictDrivenGaps
          ? 'conflict-driven recalc/review requires REVIEW path'
          : 'non-conflict review can stay on STANDARD+',
      );
      break;
    }
    case 'snapshot': {
      capabilityTier = lowVisibility && !highValue ? 'LIGHT' : 'STANDARD';
      fallbackPolicy = 'PROVIDER_FALLBACK';
      routerPriorityClass = highVisibility ? 'P1' : 'P2';
      retryClass = 'RETRY_ONCE';
      requiresReview = false;
      costSensitivity = highValue ? 'MEDIUM' : 'HIGH';
      latencySensitivity = highVisibility ? 'MEDIUM' : 'LOW';
      reasons.push('snapshot can be reduced for low-visibility discovery paths');
      break;
    }
    case 'idea_extract': {
      capabilityTier =
        (isHighValueWeak && hasDeepRepairGaps) || highValue
          ? 'HEAVY'
          : weakOnlyRepair
            ? 'LIGHT'
            : 'STANDARD';
      fallbackPolicy = 'LIGHT_DERIVATION';
      routerPriorityClass = isHighValueWeak ? 'P1' : highVisibility ? 'P1' : 'P2';
      retryClass = 'RETRY_ONCE';
      requiresReview = false;
      costSensitivity = highValue ? 'MEDIUM' : 'HIGH';
      latencySensitivity = capabilityTier === 'HEAVY' ? 'HIGH' : 'MEDIUM';
      reasons.push(
        capabilityTier === 'HEAVY'
          ? 'high-value extraction can justify heavier capability'
          : 'idea extract supports light derivation fallback',
      );
      break;
    }
    case 'idea_fit':
    case 'completeness': {
      capabilityTier =
        isHighValueWeak && hasDeepRepairGaps ? 'HEAVY' : 'STANDARD';
      fallbackPolicy = 'PROVIDER_FALLBACK';
      routerPriorityClass = isHighValueWeak ? 'P1' : 'P2';
      retryClass = 'RETRY_ONCE';
      requiresReview = false;
      costSensitivity = highValue ? 'MEDIUM' : 'HIGH';
      latencySensitivity = capabilityTier === 'HEAVY' ? 'HIGH' : 'MEDIUM';
      reasons.push('scoring tasks stay STANDARD unless high-value deep gaps justify HEAVY');
      break;
    }
  }

  if (fallbackFlag || incompleteFlag || analysisQualityState === 'CRITICAL') {
    routerPriorityClass = bumpPriority(routerPriorityClass, 'P1');
    reasons.push('fallback/incomplete/critical quality increases urgency');
  }

  if (
    isArchiveOrNoise &&
    !highValue &&
    input.normalizedTaskType !== 'claude_review' &&
    input.normalizedTaskType !== 'decision_recalc'
  ) {
    capabilityTier = lowerCapability(capabilityTier, 'LIGHT');
    costSensitivity = 'EXTREME';
    reasons.push('archive_or_noise suppresses model spend');
  }

  if (
    keyEvidenceGaps.length === 0 &&
    trustedBlockingGaps.length === 0 &&
    evidenceCoverageRate >= 0.7 &&
    hasDeep &&
    input.normalizedTaskType === 'evidence_repair'
  ) {
    capabilityTier = 'LIGHT';
    reasons.push('evidence already solid, repair can stay minimal');
  }

  return finalizeDecision({
    input,
    capabilityTier,
    fallbackPolicy,
    routerPriorityClass,
    retryClass,
    requiresReview,
    costSensitivity,
    latencySensitivity,
    reasons,
  });
}

export function buildModelTaskRouterDecisionInputFromHistoricalItem(
  item: HistoricalRepairPriorityItem,
): ModelTaskRouterDecisionInput {
  return {
    normalizedTaskType: normalizeRepairActionTask(item.historicalRepairAction),
    taskIntent: null,
    historicalRepairBucket: item.historicalRepairBucket,
    historicalRepairAction: item.historicalRepairAction,
    cleanupState: item.cleanupState,
    analysisQualityState: item.analysisQualityState,
    keyEvidenceGaps: item.keyEvidenceGaps,
    decisionRecalcGaps: item.decisionRecalcGaps,
    deepRepairGaps: item.deepRepairGaps,
    evidenceRepairGaps: item.evidenceRepairGaps,
    trustedBlockingGaps: item.trustedBlockingGaps,
    evidenceConflictCount: item.evidenceConflictCount,
    evidenceCoverageRate: item.evidenceCoverageRate,
    hasDeep: item.hasDeep,
    fallbackFlag: item.fallbackFlag,
    conflictFlag: item.conflictFlag,
    incompleteFlag: item.incompleteFlag,
    strictVisibilityLevel: item.strictVisibilityLevel,
    repositoryValueTier: item.repositoryValueTier,
    moneyPriority: item.moneyPriority,
  };
}

export function buildModelTaskRouterDecisionFromHistoricalItem(
  item: HistoricalRepairPriorityItem,
): ModelTaskRouterDecisionOutput {
  return buildModelTaskRouterDecision(
    buildModelTaskRouterDecisionInputFromHistoricalItem(item),
  );
}

export function buildModelTaskRouterExecutionMetadata(args: {
  input: ModelTaskRouterDecisionInput;
  decision?: ModelTaskRouterDecisionOutput | null;
}): ModelTaskRouterExecutionMetadata {
  const definition = getModelTaskRouterDefinition(args.input.normalizedTaskType);
  if (!definition) {
    throw new Error(`Unknown normalized task type: ${args.input.normalizedTaskType}`);
  }

  const decision = args.decision ?? buildModelTaskRouterDecision(args.input);
  return {
    routerNormalizedTaskType: args.input.normalizedTaskType,
    routerTaskIntent:
      (args.input.taskIntent as ModelTaskIntent | null | undefined) ??
      definition.taskIntent,
    routerCapabilityTier: decision.capabilityTier,
    routerPriorityClass: decision.routerPriorityClass,
    routerFallbackPolicy: decision.fallbackPolicy,
    routerRequiresReview: decision.requiresReview,
    routerRetryClass: decision.retryClass,
    routerCostSensitivity: decision.costSensitivity,
    routerLatencySensitivity: decision.latencySensitivity,
    routerReasonSummary: decision.routerReasonSummary,
  };
}

export function emptyModelTaskRouterCapabilityBreakdown(): ModelTaskRouterCapabilityBreakdown {
  return {
    LIGHT: 0,
    STANDARD: 0,
    HEAVY: 0,
    REVIEW: 0,
    DETERMINISTIC_ONLY: 0,
  };
}

export function emptyModelTaskRouterFallbackBreakdown(): ModelTaskRouterFallbackBreakdown {
  return MODEL_TASK_ROUTER_FALLBACK_POLICIES.reduce<ModelTaskRouterFallbackBreakdown>(
    (accumulator, policy) => {
      accumulator[policy] = 0;
      return accumulator;
    },
    {
      NONE: 0,
      PROVIDER_FALLBACK: 0,
      DETERMINISTIC_ONLY: 0,
      LIGHT_DERIVATION: 0,
      RETRY_THEN_REVIEW: 0,
      RETRY_THEN_DOWNGRADE: 0,
      DOWNGRADE_ONLY: 0,
    },
  );
}

export function buildBaselineModelTaskRouterDecisionInputs() {
  return listModelTaskRouterDefinitions().map((definition) => ({
    normalizedTaskType: definition.normalizedTaskType,
    taskIntent: definition.taskIntent,
  })) as ModelTaskRouterDecisionInput[];
}

export function buildModelTaskRouterDecisionReport(args: {
  priorityGeneratedAt: string;
  repairItems: HistoricalRepairPriorityItem[];
}): ModelTaskRouterDecisionReport {
  const baselineDecisions = buildBaselineModelTaskRouterDecisionInputs().map((input) =>
    buildModelTaskRouterDecision(input),
  );
  const dynamicDecisions = args.repairItems.map((item) =>
    buildModelTaskRouterDecision(
      buildModelTaskRouterDecisionInputFromHistoricalItem(item),
    ),
  );

  return {
    generatedAt: new Date().toISOString(),
    source: {
      priorityGeneratedAt: args.priorityGeneratedAt,
    },
    summary: {
      staticTaskCount: baselineDecisions.length,
      dynamicRepairItemCount: dynamicDecisions.length,
      capabilityTierBreakdown: countCapabilityTiers([
        ...baselineDecisions,
        ...dynamicDecisions,
      ]),
      deterministicOnlyCount: dynamicDecisions.filter(
        (item) => item.capabilityTier === 'DETERMINISTIC_ONLY',
      ).length,
      reviewRequiredCount: dynamicDecisions.filter(
        (item) => item.requiresReview,
      ).length,
      cleanupSuppressedCount: args.repairItems.filter(
        (item) =>
          item.cleanupState === 'freeze' ||
          item.cleanupState === 'archive' ||
          item.cleanupState === 'purge_ready',
      ).length,
      taskTypeTierDistribution: buildTaskTypeTierDistribution([
        ...baselineDecisions,
        ...dynamicDecisions,
      ]),
      deterministicOnlyTasks: uniqueTaskTypes(
        dynamicDecisions
          .filter((item) => item.capabilityTier === 'DETERMINISTIC_ONLY')
          .map((item) => item.normalizedTaskType),
      ),
      reviewRequiredTasks: uniqueTaskTypes(
        dynamicDecisions
          .filter((item) => item.requiresReview)
          .map((item) => item.normalizedTaskType),
      ),
      highCostWorthKeeping: uniqueTaskTypes(
        dynamicDecisions
          .filter(
            (item, index) =>
              (item.capabilityTier === 'HEAVY' ||
                item.capabilityTier === 'REVIEW') &&
              args.repairItems[index] &&
              (args.repairItems[index].historicalRepairBucket === 'high_value_weak' ||
                args.repairItems[index].moneyPriority === 'P0' ||
                args.repairItems[index].moneyPriority === 'P1'),
          )
          .map((item) => item.normalizedTaskType),
      ),
    },
    baselineDecisions,
    dynamicDecisions,
    samples: {
      reviewRequired: buildSamples(args.repairItems, dynamicDecisions, (decision) =>
        decision.requiresReview,
      ),
      deterministicOnly: buildSamples(args.repairItems, dynamicDecisions, (decision) =>
        decision.capabilityTier === 'DETERMINISTIC_ONLY',
      ),
      cleanupSuppressed: buildSamples(
        args.repairItems,
        dynamicDecisions,
        (_decision, item) =>
          item.cleanupState === 'freeze' ||
          item.cleanupState === 'archive' ||
          item.cleanupState === 'purge_ready',
      ),
    },
  };
}

export function renderModelTaskRouterDecisionMarkdown(
  report: ModelTaskRouterDecisionReport,
) {
  const lines = [
    '# GitDian Model Task Router Decision Report',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- priorityGeneratedAt: ${report.source.priorityGeneratedAt}`,
    '',
    '## Summary',
    '',
    `- staticTaskCount: ${report.summary.staticTaskCount}`,
    `- dynamicRepairItemCount: ${report.summary.dynamicRepairItemCount}`,
    `- deterministicOnlyCount: ${report.summary.deterministicOnlyCount}`,
    `- reviewRequiredCount: ${report.summary.reviewRequiredCount}`,
    `- cleanupSuppressedCount: ${report.summary.cleanupSuppressedCount}`,
    '',
    '## Capability Tier Breakdown',
    '',
    ...Object.entries(report.summary.capabilityTierBreakdown).map(
      ([tier, count]) => `- ${tier}: ${count}`,
    ),
    '',
    `- deterministicOnlyTasks: ${renderList(report.summary.deterministicOnlyTasks)}`,
    `- reviewRequiredTasks: ${renderList(report.summary.reviewRequiredTasks)}`,
    `- highCostWorthKeeping: ${renderList(report.summary.highCostWorthKeeping)}`,
    '',
    '## Task Type Capability Distribution',
    '',
    ...report.summary.taskTypeTierDistribution.flatMap((row) => [
      `### ${row.normalizedTaskType}`,
      ...Object.entries(row.capabilityTierBreakdown).map(
        ([tier, count]) => `- ${tier}: ${count}`,
      ),
      '',
    ]),
    '## Baseline Decisions',
    '',
    ...report.baselineDecisions.map(
      (decision) =>
        `- ${decision.normalizedTaskType} | tier=${decision.capabilityTier} | priority=${decision.routerPriorityClass} | fallback=${decision.fallbackPolicy} | retry=${decision.retryClass} | review=${decision.requiresReview} | reason=${decision.routerReasonSummary}`,
    ),
    '',
    '## Samples',
    '',
    '### review_required',
    ...renderSamples(report.samples.reviewRequired),
    '',
    '### deterministic_only',
    ...renderSamples(report.samples.deterministicOnly),
    '',
    '### cleanup_suppressed',
    ...renderSamples(report.samples.cleanupSuppressed),
  ];

  return lines.join('\n');
}

function finalizeDecision(args: {
  input: ModelTaskRouterDecisionInput;
  capabilityTier: ModelTaskCapabilityTierName;
  fallbackPolicy: ModelTaskFallbackPolicy;
  routerPriorityClass: ModelTaskRouterPriorityClass;
  retryClass: ModelTaskRouterRetryClass;
  requiresReview: boolean;
  costSensitivity: ModelRouterCostSensitivity;
  latencySensitivity: ModelTaskLatencyClass;
  reasons: string[];
}): ModelTaskRouterDecisionOutput {
  return {
    normalizedTaskType: args.input.normalizedTaskType,
    capabilityTier: args.capabilityTier,
    routerPriorityClass: args.routerPriorityClass,
    fallbackPolicy: args.fallbackPolicy,
    requiresReview: args.requiresReview,
    allowsFallback:
      args.fallbackPolicy !== 'NONE' && args.fallbackPolicy !== 'DOWNGRADE_ONLY',
    allowsDeterministicFallback:
      args.fallbackPolicy === 'DETERMINISTIC_ONLY' ||
      args.fallbackPolicy === 'LIGHT_DERIVATION' ||
      args.capabilityTier === 'DETERMINISTIC_ONLY',
    retryClass: args.retryClass,
    costSensitivity: args.costSensitivity,
    latencySensitivity: args.latencySensitivity,
    routerReasonSummary: uniqueStrings(args.reasons).join('；'),
  };
}

function normalizeRepairActionTask(action: string): NormalizedModelTaskType {
  switch (action) {
    case 'evidence_repair':
    case 'deep_repair':
    case 'decision_recalc':
    case 'refresh_only':
    case 'downgrade_only':
      return action;
    case 'archive':
      return 'cleanup_related';
    default:
      return 'cleanup_related';
  }
}

function normalizeBucket(
  value: string | null | undefined,
): HistoricalRepairBucket | null {
  switch (value) {
    case 'visible_broken':
    case 'high_value_weak':
    case 'stale_watch':
    case 'archive_or_noise':
      return value;
    default:
      return null;
  }
}

function normalizeCleanupState(
  value: string | null | undefined,
): HistoricalCleanupState | null {
  switch (value) {
    case 'active':
    case 'freeze':
    case 'archive':
    case 'purge_ready':
      return value;
    default:
      return null;
  }
}

function normalizeQualityState(
  value: HistoricalInventoryQualityState | null | undefined,
) {
  switch (value) {
    case 'HIGH':
    case 'MEDIUM':
    case 'LOW':
    case 'CRITICAL':
      return value;
    default:
      return null;
  }
}

function normalizeVisibilityLevel(
  value: string | null | undefined,
): HistoricalRepairVisibilityLevel | null {
  switch (value) {
    case 'HOME':
    case 'FAVORITES':
    case 'DAILY_SUMMARY':
    case 'TELEGRAM':
    case 'DETAIL_ONLY':
    case 'BACKGROUND':
      return value;
    default:
      return null;
  }
}

function normalizeMoneyPriority(value: string | null | undefined) {
  switch (value) {
    case 'P0':
    case 'P1':
    case 'P2':
    case 'P3':
      return value;
    default:
      return null;
  }
}

function normalizeValueTier(value: string | null | undefined) {
  switch (value) {
    case 'HIGH':
    case 'MEDIUM':
    case 'LOW':
      return value;
    default:
      return null;
  }
}

function criticalityToPriority(
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
): ModelTaskRouterPriorityClass {
  switch (criticality) {
    case 'CRITICAL':
      return 'P0';
    case 'HIGH':
      return 'P1';
    case 'MEDIUM':
      return 'P2';
    case 'LOW':
    default:
      return 'P3';
  }
}

function failureEscalationToRetry(
  escalation: 'NONE' | 'FALLBACK_ONLY' | 'REVIEW_REQUIRED' | 'DOWNGRADE_ONLY',
): ModelTaskRouterRetryClass {
  switch (escalation) {
    case 'FALLBACK_ONLY':
      return 'RETRY_ONCE';
    case 'REVIEW_REQUIRED':
      return 'RETRY_ONCE_THEN_REVIEW';
    case 'DOWNGRADE_ONLY':
      return 'RETRY_ONCE_THEN_DOWNGRADE';
    case 'NONE':
    default:
      return 'NONE';
  }
}

function clampRate(value: number | null | undefined) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) {
    return 0;
  }
  return Math.max(0, Math.min(1, normalized));
}

function lowerCapability(
  current: ModelTaskCapabilityTierName,
  target: ModelTaskCapabilityTierName,
): ModelTaskCapabilityTierName {
  const rank: Record<ModelTaskCapabilityTierName, number> = {
    DETERMINISTIC_ONLY: 0,
    LIGHT: 1,
    STANDARD: 2,
    HEAVY: 3,
    REVIEW: 4,
  };
  return rank[current] <= rank[target] ? current : target;
}

function bumpPriority(
  current: ModelTaskRouterPriorityClass,
  floor: ModelTaskRouterPriorityClass,
): ModelTaskRouterPriorityClass {
  const rank: Record<ModelTaskRouterPriorityClass, number> = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3,
  };
  return rank[current] <= rank[floor] ? current : floor;
}

function normalizeStringArray(value: string[] | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(
    value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean),
  );
}

function countCapabilityTiers(
  decisions: ModelTaskRouterDecisionOutput[],
): Record<ModelTaskCapabilityTierName, number> {
  return decisions.reduce<Record<ModelTaskCapabilityTierName, number>>(
    (accumulator, decision) => {
      accumulator[decision.capabilityTier] += 1;
      return accumulator;
    },
    {
      LIGHT: 0,
      STANDARD: 0,
      HEAVY: 0,
      REVIEW: 0,
      DETERMINISTIC_ONLY: 0,
    },
  );
}

function buildTaskTypeTierDistribution(
  decisions: ModelTaskRouterDecisionOutput[],
) {
  const map = new Map<
    NormalizedModelTaskType,
    Record<ModelTaskCapabilityTierName, number>
  >();

  for (const decision of decisions) {
    const existing =
      map.get(decision.normalizedTaskType) ??
      {
        LIGHT: 0,
        STANDARD: 0,
        HEAVY: 0,
        REVIEW: 0,
        DETERMINISTIC_ONLY: 0,
      };
    existing[decision.capabilityTier] += 1;
    map.set(decision.normalizedTaskType, existing);
  }

  return [...map.entries()].map(([normalizedTaskType, capabilityTierBreakdown]) => ({
    normalizedTaskType,
    capabilityTierBreakdown,
  }));
}

function buildSamples(
  items: HistoricalRepairPriorityItem[],
  decisions: ModelTaskRouterDecisionOutput[],
  predicate: (
    decision: ModelTaskRouterDecisionOutput,
    item: HistoricalRepairPriorityItem,
  ) => boolean,
) {
  const samples: DecisionSample[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const decision = decisions[index];
    if (!item || !decision || !predicate(decision, item)) {
      continue;
    }
    samples.push({
      fullName: item.fullName,
      taskType: decision.normalizedTaskType,
      capabilityTier: decision.capabilityTier,
      requiresReview: decision.requiresReview,
      cleanupState: item.cleanupState,
      bucket: item.historicalRepairBucket,
      reason: decision.routerReasonSummary,
    });
    if (samples.length >= 8) {
      break;
    }
  }
  return samples;
}

function uniqueTaskTypes(values: NormalizedModelTaskType[]) {
  return [...new Set(values)];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function renderList(values: string[]) {
  return values.length ? values.join(' | ') : 'none';
}

function renderSamples(samples: DecisionSample[]) {
  if (!samples.length) {
    return ['- none'];
  }

  return samples.map(
    (sample) =>
      `- ${sample.fullName} | task=${sample.taskType} | tier=${sample.capabilityTier} | review=${sample.requiresReview} | cleanup=${sample.cleanupState ?? 'none'} | bucket=${sample.bucket ?? 'none'} | reason=${sample.reason}`,
  );
}
