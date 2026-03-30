import type { HistoricalRepairPriorityItem } from './historical-repair-priority.helper';
import { getModelTaskRouterDefinition } from './model-task-router.helper';
import type {
  ModelTaskRouterDecisionOutput,
  ModelTaskRouterExecutionMetadata,
} from './model-task-router.types';
import type {
  AnalysisOutcomeActionKey,
  AnalysisOutcomeAfterContext,
  AnalysisOutcomeBeforeContext,
  AnalysisOutcomeDelta,
  AnalysisOutcomeExecutionContext,
  AnalysisOutcomeLog,
  AnalysisOutcomeRouterContext,
  AnalysisOutcomeSnapshot,
  AnalysisOutcomeStatus,
  AnalysisRepairValueClass,
} from './analysis-outcome.types';

export const ANALYSIS_OUTCOME_SCHEMA_VERSION = 'analysis_outcome_v1';
export const ANALYSIS_OUTCOME_STATUSES: AnalysisOutcomeStatus[] = [
  'success',
  'partial',
  'no_change',
  'failed',
  'downgraded',
  'skipped',
];
export const ANALYSIS_REPAIR_VALUE_CLASSES: AnalysisRepairValueClass[] = [
  'high',
  'medium',
  'low',
  'negative',
];
export const ANALYSIS_OUTCOME_ACTIONS: AnalysisOutcomeActionKey[] = [
  'downgrade_only',
  'refresh_only',
  'evidence_repair',
  'deep_repair',
  'decision_recalc',
  'archive',
  'skipped',
];

type BuildHistoricalOutcomeArgs = {
  item: HistoricalRepairPriorityItem;
  routerDecision: ModelTaskRouterDecisionOutput;
  routerMetadata: ModelTaskRouterExecutionMetadata;
  outcomeStatus: AnalysisOutcomeStatus;
  outcomeReason: string;
  executionDurationMs?: number;
  executionUsedFallback?: boolean;
  executionUsedReview?: boolean;
  after?: Partial<AnalysisOutcomeAfterContext>;
  loggedAt?: string;
};

export function buildAnalysisOutcomeLog(args: {
  before: AnalysisOutcomeBeforeContext;
  router: AnalysisOutcomeRouterContext;
  execution: AnalysisOutcomeExecutionContext;
  after: AnalysisOutcomeAfterContext;
  loggedAt?: string;
}): AnalysisOutcomeLog {
  const before = normalizeBeforeContext(args.before);
  const after = normalizeAfterContext(args.after, before);
  const execution = normalizeExecutionContext(args.execution);

  return {
    schemaVersion: ANALYSIS_OUTCOME_SCHEMA_VERSION,
    loggedAt: args.loggedAt ?? new Date().toISOString(),
    before,
    router: normalizeRouterContext(args.router),
    execution,
    after,
    delta: buildAnalysisOutcomeDelta({
      before,
      after,
      outcomeStatus: execution.outcomeStatus,
    }),
  };
}

export function buildAnalysisOutcomeDelta(args: {
  before: AnalysisOutcomeBeforeContext;
  after: AnalysisOutcomeAfterContext;
  outcomeStatus: AnalysisOutcomeStatus;
}): AnalysisOutcomeDelta {
  const qualityDelta =
    normalizeNumber(args.after.analysisQualityScoreAfter) -
    normalizeNumber(args.before.analysisQualityScoreBefore);
  const trustedChanged =
    Boolean(args.before.trustedEligibilityBefore) !==
    Boolean(args.after.trustedEligibilityAfter);
  const decisionChanged =
    normalizeDecisionState(args.before.decisionStateBefore) !==
    normalizeDecisionState(args.after.decisionStateAfter);
  const gapCountDelta =
    normalizeStringArray(args.after.keyEvidenceGapsAfter).length -
    normalizeStringArray(args.before.keyEvidenceGapsBefore).length;
  const blockingGapDelta =
    normalizeStringArray(args.after.trustedBlockingGapsAfter).length -
    normalizeStringArray(args.before.trustedBlockingGapsBefore).length;

  return {
    qualityDelta,
    trustedChanged,
    decisionChanged,
    gapCountDelta,
    blockingGapDelta,
    repairValueClass: classifyRepairValue({
      outcomeStatus: args.outcomeStatus,
      qualityDelta,
      gapCountDelta,
      blockingGapDelta,
      trustedChanged,
      decisionChanged,
    }),
  };
}

export function classifyRepairValue(args: {
  outcomeStatus: AnalysisOutcomeStatus;
  qualityDelta: number;
  gapCountDelta: number;
  blockingGapDelta: number;
  trustedChanged: boolean;
  decisionChanged: boolean;
}): AnalysisRepairValueClass {
  if (
    args.outcomeStatus === 'failed' ||
    args.outcomeStatus === 'downgraded' ||
    args.qualityDelta < 0 ||
    args.gapCountDelta > 0 ||
    args.blockingGapDelta > 0
  ) {
    return 'negative';
  }

  if (
    args.qualityDelta >= 10 &&
    (args.gapCountDelta <= -2 || args.blockingGapDelta <= -1)
  ) {
    return 'high';
  }

  if (
    args.qualityDelta > 0 ||
    args.gapCountDelta < 0 ||
    args.blockingGapDelta < 0 ||
    args.trustedChanged ||
    args.decisionChanged
  ) {
    return 'medium';
  }

  return 'low';
}

export function buildHistoricalRepairOutcomeLog(
  args: BuildHistoricalOutcomeArgs,
): AnalysisOutcomeLog {
  const before = buildOutcomeBeforeContext(args.item, args.routerMetadata);
  const after = buildOutcomeAfterContext({
    item: args.item,
    before,
    outcomeStatus: args.outcomeStatus,
    after: args.after,
  });
  const definition = getModelTaskRouterDefinition(
    args.routerDecision.normalizedTaskType,
  );

  return buildAnalysisOutcomeLog({
    loggedAt: args.loggedAt,
    before,
    router: {
      routerCapabilityTier: args.routerDecision.capabilityTier,
      routerPriorityClass: args.routerDecision.routerPriorityClass,
      routerFallbackPolicy: args.routerDecision.fallbackPolicy,
      routerRequiresReview: args.routerDecision.requiresReview,
      routerRetryClass: args.routerDecision.retryClass,
      routerReasonSummary: args.routerDecision.routerReasonSummary,
      routerCostSensitivity: args.routerDecision.costSensitivity,
      routerLatencySensitivity: args.routerDecision.latencySensitivity,
    },
    execution: {
      outcomeStatus: args.outcomeStatus,
      outcomeReason: args.outcomeReason,
      executionDurationMs: Math.max(0, Math.round(args.executionDurationMs ?? 0)),
      executionCostClass: definition?.taskCostClass ?? null,
      executionUsedFallback: Boolean(args.executionUsedFallback),
      executionUsedReview: Boolean(
        args.executionUsedReview ?? args.routerDecision.requiresReview,
      ),
    },
    after,
  });
}

export function buildAnalysisOutcomeSnapshot(args: {
  source: string;
  items: AnalysisOutcomeLog[];
  sampleLimit?: number;
  generatedAt?: string;
}): AnalysisOutcomeSnapshot {
  const sampleLimit = Math.max(1, args.sampleLimit ?? 200);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const items = args.items.slice();
  const statusBreakdown = ANALYSIS_OUTCOME_STATUSES.reduce<
    Record<AnalysisOutcomeStatus, number>
  >(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {
      success: 0,
      partial: 0,
      no_change: 0,
      failed: 0,
      downgraded: 0,
      skipped: 0,
    },
  );
  const repairValueClassBreakdown = ANALYSIS_REPAIR_VALUE_CLASSES.reduce<
    Record<AnalysisRepairValueClass, number>
  >(
    (acc, value) => {
      acc[value] = 0;
      return acc;
    },
    {
      high: 0,
      medium: 0,
      low: 0,
      negative: 0,
    },
  );
  const executionCostClassBreakdown: Record<'LOW' | 'MEDIUM' | 'HIGH' | 'NONE', number> =
    {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      NONE: 0,
    };
  const routerCapabilityBreakdown: Record<string, number> = {};
  const coveredActions = new Set<AnalysisOutcomeActionKey>();
  const actionBreakdown = buildEmptyActionCountRecord();
  const actionOutcomeStatusBreakdown = buildEmptyActionStatusBreakdown();
  const actionRepairValueClassBreakdown = buildEmptyActionValueBreakdown();
  const actionQualityDeltaAccumulator = buildEmptyActionDeltaAccumulator();
  let totalQualityDelta = 0;
  let trustedChangedCount = 0;
  let decisionChangedCount = 0;
  let fallbackUsedCount = 0;
  let reviewUsedCount = 0;
  let skippedByCleanupCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let minDelta = 0;
  let maxDelta = 0;

  for (const item of items) {
    const action = normalizeOutcomeAction(
      item.before.historicalRepairAction,
      item.execution.outcomeStatus,
    );
    statusBreakdown[item.execution.outcomeStatus] += 1;
    repairValueClassBreakdown[item.delta.repairValueClass] += 1;
    executionCostClassBreakdown[item.execution.executionCostClass ?? 'NONE'] += 1;
    routerCapabilityBreakdown[item.router.routerCapabilityTier ?? 'NONE'] =
      (routerCapabilityBreakdown[item.router.routerCapabilityTier ?? 'NONE'] ?? 0) + 1;
    coveredActions.add(action);
    actionBreakdown[action] += 1;
    actionOutcomeStatusBreakdown[action][item.execution.outcomeStatus] += 1;
    actionRepairValueClassBreakdown[action][item.delta.repairValueClass] += 1;
    actionQualityDeltaAccumulator[action].totalDelta += item.delta.qualityDelta;
    if (item.delta.qualityDelta > 0) {
      actionQualityDeltaAccumulator[action].positiveCount += 1;
      positiveCount += 1;
    } else if (item.delta.qualityDelta < 0) {
      actionQualityDeltaAccumulator[action].negativeCount += 1;
      negativeCount += 1;
    } else {
      actionQualityDeltaAccumulator[action].zeroCount += 1;
      zeroCount += 1;
    }
    totalQualityDelta += item.delta.qualityDelta;
    if (item.delta.trustedChanged) {
      trustedChangedCount += 1;
    }
    if (item.delta.decisionChanged) {
      decisionChangedCount += 1;
    }
    if (item.execution.executionUsedFallback) {
      fallbackUsedCount += 1;
    }
    if (item.execution.executionUsedReview) {
      reviewUsedCount += 1;
    }
    if (
      item.execution.outcomeStatus === 'skipped' &&
      (item.execution.outcomeReason.startsWith('cleanup_state_') ||
        item.execution.outcomeReason.startsWith('recalc_cleanup_suppressed'))
    ) {
      skippedByCleanupCount += 1;
    }
    minDelta = Math.min(minDelta, item.delta.qualityDelta);
    maxDelta = Math.max(maxDelta, item.delta.qualityDelta);
  }

  const actionQualityDeltaSummary = ANALYSIS_OUTCOME_ACTIONS.reduce<
    Record<
      AnalysisOutcomeActionKey,
      {
        totalDelta: number;
        averageDelta: number;
        positiveCount: number;
        negativeCount: number;
        zeroCount: number;
      }
    >
  >((acc, action) => {
    const count = actionBreakdown[action];
    const item = actionQualityDeltaAccumulator[action];
    acc[action] = {
      totalDelta: item.totalDelta,
      averageDelta: count > 0 ? roundTo(item.totalDelta / count, 4) : 0,
      positiveCount: item.positiveCount,
      negativeCount: item.negativeCount,
      zeroCount: item.zeroCount,
    };
    return acc;
  }, buildEmptyActionDeltaSummary());

  return {
    schemaVersion: ANALYSIS_OUTCOME_SCHEMA_VERSION,
    generatedAt,
    source: args.source,
    totalCount: items.length,
    truncated: items.length > sampleLimit,
    summary: {
      totalCount: items.length,
      coveredActions: [...coveredActions] as Array<
        HistoricalRepairPriorityItem['historicalRepairAction'] | 'skipped'
      >,
      outcomeStatusBreakdown: statusBreakdown,
      repairValueClassBreakdown,
      executionCostClassBreakdown,
      routerCapabilityBreakdown,
      actionBreakdown,
      actionOutcomeStatusBreakdown,
      actionRepairValueClassBreakdown,
      actionQualityDeltaSummary,
      qualityDeltaSummary: {
        totalDelta: totalQualityDelta,
        averageDelta: items.length > 0 ? roundTo(totalQualityDelta / items.length, 4) : 0,
        positiveCount,
        negativeCount,
        zeroCount,
        minDelta,
        maxDelta,
      },
      trustedChangedCount,
      decisionChangedCount,
      fallbackUsedCount,
      reviewUsedCount,
      skippedByCleanupCount,
    },
    items: items.slice(0, sampleLimit),
  };
}

function normalizeOutcomeAction(
  action: HistoricalRepairPriorityItem['historicalRepairAction'] | null,
  outcomeStatus: AnalysisOutcomeStatus,
): AnalysisOutcomeActionKey {
  if (action && ANALYSIS_OUTCOME_ACTIONS.includes(action)) {
    return action;
  }
  if (outcomeStatus === 'skipped') {
    return 'skipped';
  }
  return 'skipped';
}

function buildEmptyActionCountRecord(): Record<AnalysisOutcomeActionKey, number> {
  return ANALYSIS_OUTCOME_ACTIONS.reduce(
    (acc, action) => {
      acc[action] = 0;
      return acc;
    },
    {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
      archive: 0,
      skipped: 0,
    } as Record<AnalysisOutcomeActionKey, number>,
  );
}

function buildEmptyActionStatusBreakdown(): Record<
  AnalysisOutcomeActionKey,
  Record<AnalysisOutcomeStatus, number>
> {
  return ANALYSIS_OUTCOME_ACTIONS.reduce(
    (acc, action) => {
      acc[action] = ANALYSIS_OUTCOME_STATUSES.reduce(
        (statusAcc, status) => {
          statusAcc[status] = 0;
          return statusAcc;
        },
        {
          success: 0,
          partial: 0,
          no_change: 0,
          failed: 0,
          downgraded: 0,
          skipped: 0,
        } as Record<AnalysisOutcomeStatus, number>,
      );
      return acc;
    },
    {
      downgrade_only: {
        success: 0,
        partial: 0,
        no_change: 0,
        failed: 0,
        downgraded: 0,
        skipped: 0,
      },
      refresh_only: {
        success: 0,
        partial: 0,
        no_change: 0,
        failed: 0,
        downgraded: 0,
        skipped: 0,
      },
      evidence_repair: {
        success: 0,
        partial: 0,
        no_change: 0,
        failed: 0,
        downgraded: 0,
        skipped: 0,
      },
      deep_repair: {
        success: 0,
        partial: 0,
        no_change: 0,
        failed: 0,
        downgraded: 0,
        skipped: 0,
      },
      decision_recalc: {
        success: 0,
        partial: 0,
        no_change: 0,
        failed: 0,
        downgraded: 0,
        skipped: 0,
      },
      archive: {
        success: 0,
        partial: 0,
        no_change: 0,
        failed: 0,
        downgraded: 0,
        skipped: 0,
      },
      skipped: {
        success: 0,
        partial: 0,
        no_change: 0,
        failed: 0,
        downgraded: 0,
        skipped: 0,
      },
    } as Record<AnalysisOutcomeActionKey, Record<AnalysisOutcomeStatus, number>>,
  );
}

function buildEmptyActionValueBreakdown(): Record<
  AnalysisOutcomeActionKey,
  Record<AnalysisRepairValueClass, number>
> {
  return ANALYSIS_OUTCOME_ACTIONS.reduce(
    (acc, action) => {
      acc[action] = ANALYSIS_REPAIR_VALUE_CLASSES.reduce(
        (valueAcc, valueClass) => {
          valueAcc[valueClass] = 0;
          return valueAcc;
        },
        {
          high: 0,
          medium: 0,
          low: 0,
          negative: 0,
        } as Record<AnalysisRepairValueClass, number>,
      );
      return acc;
    },
    {
      downgrade_only: { high: 0, medium: 0, low: 0, negative: 0 },
      refresh_only: { high: 0, medium: 0, low: 0, negative: 0 },
      evidence_repair: { high: 0, medium: 0, low: 0, negative: 0 },
      deep_repair: { high: 0, medium: 0, low: 0, negative: 0 },
      decision_recalc: { high: 0, medium: 0, low: 0, negative: 0 },
      archive: { high: 0, medium: 0, low: 0, negative: 0 },
      skipped: { high: 0, medium: 0, low: 0, negative: 0 },
    } as Record<
      AnalysisOutcomeActionKey,
      Record<AnalysisRepairValueClass, number>
    >,
  );
}

function buildEmptyActionDeltaAccumulator(): Record<
  AnalysisOutcomeActionKey,
  {
    totalDelta: number;
    positiveCount: number;
    negativeCount: number;
    zeroCount: number;
  }
> {
  return ANALYSIS_OUTCOME_ACTIONS.reduce(
    (acc, action) => {
      acc[action] = {
        totalDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      };
      return acc;
    },
    {
      downgrade_only: {
        totalDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      refresh_only: {
        totalDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      evidence_repair: {
        totalDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      deep_repair: {
        totalDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      decision_recalc: {
        totalDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      archive: {
        totalDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      skipped: {
        totalDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
    } as Record<
      AnalysisOutcomeActionKey,
      {
        totalDelta: number;
        positiveCount: number;
        negativeCount: number;
        zeroCount: number;
      }
    >,
  );
}

function buildEmptyActionDeltaSummary(): Record<
  AnalysisOutcomeActionKey,
  {
    totalDelta: number;
    averageDelta: number;
    positiveCount: number;
    negativeCount: number;
    zeroCount: number;
  }
> {
  return ANALYSIS_OUTCOME_ACTIONS.reduce(
    (acc, action) => {
      acc[action] = {
        totalDelta: 0,
        averageDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      };
      return acc;
    },
    {
      downgrade_only: {
        totalDelta: 0,
        averageDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      refresh_only: {
        totalDelta: 0,
        averageDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      evidence_repair: {
        totalDelta: 0,
        averageDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      deep_repair: {
        totalDelta: 0,
        averageDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      decision_recalc: {
        totalDelta: 0,
        averageDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      archive: {
        totalDelta: 0,
        averageDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
      skipped: {
        totalDelta: 0,
        averageDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      },
    } as Record<
      AnalysisOutcomeActionKey,
      {
        totalDelta: number;
        averageDelta: number;
        positiveCount: number;
        negativeCount: number;
        zeroCount: number;
      }
    >,
  );
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildOutcomeBeforeContext(
  item: HistoricalRepairPriorityItem,
  routerMetadata: ModelTaskRouterExecutionMetadata,
): AnalysisOutcomeBeforeContext {
  return normalizeBeforeContext({
    repositoryId: item.repoId,
    normalizedTaskType: routerMetadata.routerNormalizedTaskType,
    taskIntent: routerMetadata.routerTaskIntent,
    historicalRepairBucket: item.historicalRepairBucket,
    historicalRepairAction: item.historicalRepairAction,
    cleanupState: item.cleanupState,
    analysisQualityScoreBefore: item.analysisQualityScore,
    analysisQualityStateBefore: item.analysisQualityState,
    decisionStateBefore: item.frontendDecisionState,
    trustedEligibilityBefore:
      item.frontendDecisionState === 'trusted' &&
      item.trustedFlowEligible &&
      !item.cleanupBlocksTrusted,
    keyEvidenceGapsBefore: item.keyEvidenceGaps,
    trustedBlockingGapsBefore: item.trustedBlockingGaps,
    evidenceCoverageRateBefore: item.evidenceCoverageRate,
  });
}

function buildOutcomeAfterContext(args: {
  item: HistoricalRepairPriorityItem;
  before: AnalysisOutcomeBeforeContext;
  outcomeStatus: AnalysisOutcomeStatus;
  after?: Partial<AnalysisOutcomeAfterContext>;
}): AnalysisOutcomeAfterContext {
  const item = args.item;
  const base: AnalysisOutcomeAfterContext = {
    analysisQualityScoreAfter: args.before.analysisQualityScoreBefore,
    analysisQualityStateAfter: args.before.analysisQualityStateBefore,
    decisionStateAfter: args.before.decisionStateBefore,
    trustedEligibilityAfter: args.before.trustedEligibilityBefore,
    keyEvidenceGapsAfter: args.before.keyEvidenceGapsBefore,
    trustedBlockingGapsAfter: args.before.trustedBlockingGapsBefore,
    evidenceCoverageRateAfter: args.before.evidenceCoverageRateBefore,
  };

  if (args.outcomeStatus === 'downgraded') {
    base.decisionStateAfter =
      item.frontendDecisionState === 'trusted' ? 'degraded' : item.frontendDecisionState;
    base.trustedEligibilityAfter = false;
  }

  if (args.outcomeStatus === 'skipped' && item.cleanupState !== 'active') {
    base.decisionStateAfter = item.frontendDecisionState;
    base.trustedEligibilityAfter = false;
  }

  return normalizeAfterContext(
    {
      ...base,
      ...(args.after ?? {}),
    },
    args.before,
  );
}

function normalizeBeforeContext(
  before: AnalysisOutcomeBeforeContext,
): AnalysisOutcomeBeforeContext {
  return {
    ...before,
    analysisQualityScoreBefore: normalizeNumber(before.analysisQualityScoreBefore),
    decisionStateBefore: normalizeDecisionState(before.decisionStateBefore),
    trustedEligibilityBefore: Boolean(before.trustedEligibilityBefore),
    keyEvidenceGapsBefore: normalizeStringArray(before.keyEvidenceGapsBefore),
    trustedBlockingGapsBefore: normalizeStringArray(
      before.trustedBlockingGapsBefore,
    ),
    evidenceCoverageRateBefore: clampRate(before.evidenceCoverageRateBefore),
  };
}

function normalizeRouterContext(
  router: AnalysisOutcomeRouterContext,
): AnalysisOutcomeRouterContext {
  return {
    ...router,
    routerCapabilityTier: normalizeNullableString(router.routerCapabilityTier),
    routerPriorityClass: (normalizeNullableString(
      router.routerPriorityClass,
    ) as AnalysisOutcomeRouterContext['routerPriorityClass']) ?? null,
    routerFallbackPolicy: (normalizeNullableString(
      router.routerFallbackPolicy,
    ) as AnalysisOutcomeRouterContext['routerFallbackPolicy']) ?? null,
    routerRequiresReview: Boolean(router.routerRequiresReview),
    routerRetryClass: (normalizeNullableString(
      router.routerRetryClass,
    ) as AnalysisOutcomeRouterContext['routerRetryClass']) ?? null,
    routerReasonSummary: normalizeNullableString(router.routerReasonSummary) ?? '',
    routerCostSensitivity: (normalizeNullableString(
      router.routerCostSensitivity,
    ) as AnalysisOutcomeRouterContext['routerCostSensitivity']) ?? null,
    routerLatencySensitivity: (normalizeNullableString(
      router.routerLatencySensitivity,
    ) as AnalysisOutcomeRouterContext['routerLatencySensitivity']) ?? null,
  };
}

function normalizeExecutionContext(
  execution: AnalysisOutcomeExecutionContext,
): AnalysisOutcomeExecutionContext {
  return {
    ...execution,
    executionDurationMs: Math.max(0, Math.round(execution.executionDurationMs)),
    executionCostClass: (normalizeNullableString(
      execution.executionCostClass,
    ) as AnalysisOutcomeExecutionContext['executionCostClass']) ?? null,
    executionUsedFallback: Boolean(execution.executionUsedFallback),
    executionUsedReview: Boolean(execution.executionUsedReview),
  };
}

function normalizeAfterContext(
  after: AnalysisOutcomeAfterContext,
  before: AnalysisOutcomeBeforeContext,
): AnalysisOutcomeAfterContext {
  return {
    analysisQualityScoreAfter: normalizeNumber(
      after.analysisQualityScoreAfter,
      before.analysisQualityScoreBefore,
    ),
    analysisQualityStateAfter:
      (normalizeNullableString(
        after.analysisQualityStateAfter,
      ) as AnalysisOutcomeAfterContext['analysisQualityStateAfter']) ??
      before.analysisQualityStateBefore,
    decisionStateAfter:
      normalizeDecisionState(after.decisionStateAfter) ??
      before.decisionStateBefore,
    trustedEligibilityAfter: Boolean(after.trustedEligibilityAfter),
    keyEvidenceGapsAfter: normalizeStringArray(after.keyEvidenceGapsAfter),
    trustedBlockingGapsAfter: normalizeStringArray(
      after.trustedBlockingGapsAfter,
    ),
    evidenceCoverageRateAfter: clampRate(
      after.evidenceCoverageRateAfter,
      before.evidenceCoverageRateBefore,
    ),
  };
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeNullableString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeNullableString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeDecisionState(value: unknown) {
  const normalized = normalizeNullableString(value);
  if (
    normalized === 'trusted' ||
    normalized === 'provisional' ||
    normalized === 'degraded'
  ) {
    return normalized;
  }

  return null;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function clampRate(value: unknown, fallback = 0) {
  const normalized = normalizeNumber(value, fallback);
  if (normalized <= 0) {
    return 0;
  }
  if (normalized >= 1) {
    return 1;
  }
  return normalized;
}
