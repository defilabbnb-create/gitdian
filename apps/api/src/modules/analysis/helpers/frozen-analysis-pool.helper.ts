import type { HistoricalCleanupState } from './historical-cleanup-policy.helper';
import type { HistoricalRepairPriorityItem } from './historical-repair-priority.helper';
import type {
  AnalysisPoolFreezeScope,
  AnalysisPoolFreezeState,
  FrozenAnalysisCompletionOverride,
  FrozenAnalysisPoolCompletionPassResult,
  FrozenAnalysisPoolDrainFinishResult,
  FrozenAnalysisPoolDrainPriorityClass,
  FrozenAnalysisCompletionReason,
  AnalysisPoolIntakeGateResult,
  AnalysisPoolIntakeSource,
  FrozenAnalysisCompletionState,
  FrozenAnalysisPoolPendingAgeBucket,
  FrozenAnalysisPoolPendingAuditSample,
  FrozenAnalysisPoolPendingQueueBreakdown,
  FrozenAnalysisDeleteAssessment,
  FrozenAnalysisDeleteReason,
  FrozenAnalysisPoolBatchSnapshot,
  FrozenAnalysisPoolDeletedItem,
  FrozenAnalysisPoolDrainResult,
  FrozenAnalysisPoolMember,
  FrozenAnalysisPoolQueueState,
  FrozenAnalysisPoolReport,
  FrozenAnalysisPoolRetainedDeleteCandidate,
  FrozenAnalysisPoolSummary,
} from './frozen-analysis-pool.types';

const DEFAULT_ANALYSIS_POOL_FREEZE_REASON =
  'stop_365_expansion_and_drain_frozen_pool';

const EMPTY_QUEUE_STATE: FrozenAnalysisPoolQueueState = {
  pendingJobs: 0,
  runningJobs: 0,
  pendingJobIds: [],
  runningJobIds: [],
};

const DELETE_REASONS: FrozenAnalysisDeleteReason[] = [
  'low_value',
  'low_visibility',
  'low_quality',
  'long_tail_noise',
  'archive_bucket',
  'trusted_ineligible',
  'no_repair_roi',
  'no_user_reach',
  'analysis_complete_no_keep_value',
];

const COMPLETION_REASONS: FrozenAnalysisCompletionReason[] = [
  'useful_analysis_closed',
  'useful_retained_value',
  'archive_policy_no_keep_value',
  'archive_delete_candidate_ready',
  'deleted_by_policy',
  'decision_recalc_suppressed_from_remaining',
  'missing_structured_analysis',
  'repair_action_remaining',
  'pending_queue_jobs',
  'running_queue_jobs',
  'quality_below_completion_threshold',
  'trusted_gaps_remaining',
  'archive_terminal_ready',
  'delete_policy_not_met',
  'terminal_condition_blocked_by_strict_legacy_gate',
];

const DEFAULT_MODEL_A_DRAIN_LIMIT = 120;
const DEFAULT_MODEL_B_DRAIN_LIMIT = 120;
const DEFAULT_DELETE_DRAIN_LIMIT = 200;

export function buildAnalysisPoolFreezeState(args: {
  batchId: string;
  snapshotAt: string;
  frozenAt?: string | null;
  reason?: string | null;
  scope?: AnalysisPoolFreezeScope | null;
}): AnalysisPoolFreezeState {
  return {
    analysisPoolFrozen: true,
    analysisPoolFreezeReason:
      normalizeNullableString(args.reason) ?? DEFAULT_ANALYSIS_POOL_FREEZE_REASON,
    analysisPoolFrozenAt:
      normalizeNullableString(args.frozenAt) ?? normalizeNullableString(args.snapshotAt),
    analysisPoolFrozenScope: args.scope ?? 'all_new_entries',
    frozenAnalysisPoolBatchId: normalizeNullableString(args.batchId),
    frozenAnalysisPoolSnapshotAt: normalizeNullableString(args.snapshotAt),
  };
}

export function readAnalysisPoolFreezeState(
  value: unknown,
): AnalysisPoolFreezeState | null {
  const payload = readObject(value);
  if (!payload) {
    return null;
  }

  return {
    analysisPoolFrozen: payload.analysisPoolFrozen === true,
    analysisPoolFreezeReason:
      normalizeNullableString(payload.analysisPoolFreezeReason) ??
      DEFAULT_ANALYSIS_POOL_FREEZE_REASON,
    analysisPoolFrozenAt: normalizeNullableString(payload.analysisPoolFrozenAt),
    analysisPoolFrozenScope:
      normalizeNullableString(payload.analysisPoolFrozenScope) === '365_only'
        ? '365_only'
        : 'all_new_entries',
    frozenAnalysisPoolBatchId: normalizeNullableString(
      payload.frozenAnalysisPoolBatchId,
    ),
    frozenAnalysisPoolSnapshotAt: normalizeNullableString(
      payload.frozenAnalysisPoolSnapshotAt,
    ),
  };
}

export function buildFrozenAnalysisPoolBatchId(now = new Date()) {
  const compact = now
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replaceAll('.', '')
    .replace('T', '-')
    .replace('Z', '');
  return `frozen-analysis-pool-${compact}`;
}

export function assignFrozenAnalysisPoolModelLane(
  item: Pick<
    HistoricalRepairPriorityItem,
    'historicalRepairAction' | 'needsDeepRepair' | 'needsDecisionRecalc'
  >,
) {
  switch (item.historicalRepairAction) {
    case 'deep_repair':
    case 'decision_recalc':
      return 'modelB' as const;
    case 'evidence_repair':
    case 'refresh_only':
      return 'modelA' as const;
    case 'downgrade_only':
    case 'archive':
    default:
      return 'none' as const;
  }
}

export function evaluateFrozenAnalysisDeleteCandidate(args: {
  item: HistoricalRepairPriorityItem;
  queueState?: FrozenAnalysisPoolQueueState | null;
}): FrozenAnalysisDeleteAssessment {
  const item = args.item;
  const archiveStructuredReady = hasArchiveStructuredSignal(item);
  const deleteStructuredReady = hasDeleteStructuredSignal(item);
  const lowValue = Boolean(
    item.repositoryValueTier === 'LOW' &&
      (item.moneyPriority === null || item.moneyPriority === 'P3'),
  );
  const lowVisibility = Boolean(
    item.strictVisibilityLevel === 'DETAIL_ONLY' ||
      item.strictVisibilityLevel === 'BACKGROUND',
  );
  const lowQuality = Boolean(
    item.analysisQualityState === 'LOW' ||
      item.analysisQualityState === 'CRITICAL',
  );
  const archiveBucket = item.historicalRepairBucket === 'archive_or_noise';
  const longTailNoise = item.collectionTier === 'LONG_TAIL';
  const trustedIneligible = item.trustedBlockingGaps.length > 0;
  const noRepairRoi = Boolean(
    item.cleanupState !== 'active' &&
      !item.needsDeepRepair &&
      !item.needsDecisionRecalc &&
      !item.needsEvidenceRepair &&
      (item.historicalRepairAction === 'downgrade_only' ||
        item.historicalRepairAction === 'archive'),
  );
  const noUserReach = Boolean(
    !item.isUserReachable && !item.isStrictlyVisibleToUsers,
  );
  const deleteCandidate = Boolean(
    archiveStructuredReady &&
      deleteStructuredReady &&
      lowValue &&
      lowVisibility &&
      lowQuality &&
      archiveBucket &&
      (item.cleanupState === 'freeze' ||
        item.cleanupState === 'archive' ||
        item.cleanupState === 'purge_ready') &&
      noRepairRoi,
  );

  const deleteReason = uniqueDeleteReasons([
    lowValue ? 'low_value' : null,
    lowVisibility ? 'low_visibility' : null,
    lowQuality ? 'low_quality' : null,
    longTailNoise ? 'long_tail_noise' : null,
    archiveBucket ? 'archive_bucket' : null,
    trustedIneligible ? 'trusted_ineligible' : null,
    noRepairRoi ? 'no_repair_roi' : null,
    noUserReach ? 'no_user_reach' : null,
    deleteCandidate ? 'analysis_complete_no_keep_value' : null,
  ]);

  return {
    deleteCandidate,
    deleteReason,
    deleteApprovedByPolicy: deleteCandidate,
  };
}

export function evaluateFrozenAnalysisCompletion(args: {
  item: HistoricalRepairPriorityItem;
  queueState?: FrozenAnalysisPoolQueueState | null;
  deleteAssessment?: FrozenAnalysisDeleteAssessment | null;
  batchId: string;
  snapshotAt: string;
  assignedModelName?: string | null;
}): {
  analysisCompletionState: FrozenAnalysisCompletionState;
  analysisCompletionReason: FrozenAnalysisCompletionReason[];
  analysisCompletionPrimaryReason: FrozenAnalysisCompletionReason;
  analysisCompletedAt: string | null;
  analysisCompletedByModel: string | null;
  completedFromFrozenPoolBatchId: string | null;
} {
  const item = args.item;
  const queueState = args.queueState ?? EMPTY_QUEUE_STATE;
  const deleteAssessment =
    args.deleteAssessment ??
    evaluateFrozenAnalysisDeleteCandidate({
      item,
      queueState,
    });
  const usefulStructuredReady = hasUsefulStructuredSignal(item);
  const archiveStructuredReady = hasArchiveStructuredSignal(item);
  const rawRepairRemaining = Boolean(
    item.needsDeepRepair ||
      item.needsEvidenceRepair ||
      item.needsDecisionRecalc ||
      item.historicalRepairAction === 'deep_repair' ||
      item.historicalRepairAction === 'evidence_repair' ||
      item.historicalRepairAction === 'decision_recalc' ||
      item.historicalRepairAction === 'refresh_only',
  );
  const repairRemaining = Boolean(
    item.cleanupState === 'active'
      ? rawRepairRemaining
      : item.historicalRepairAction !== 'downgrade_only' &&
          item.historicalRepairAction !== 'archive' &&
          item.historicalRepairBucket !== 'archive_or_noise' &&
          rawRepairRemaining,
  );
  const lowQuality = Boolean(
    item.analysisQualityState === 'LOW' ||
      item.analysisQualityState === 'CRITICAL',
  );
  const terminalNoKeepValue = Boolean(
    item.historicalRepairBucket === 'archive_or_noise' &&
      item.cleanupState !== 'active' &&
      item.repositoryValueTier === 'LOW' &&
      (item.moneyPriority === null || item.moneyPriority === 'P3') &&
      (item.strictVisibilityLevel === 'DETAIL_ONLY' ||
        item.strictVisibilityLevel === 'BACKGROUND') &&
      (lowQuality || item.trustedBlockingGaps.length > 0) &&
      item.historicalRepairAction === 'downgrade_only',
  );
  const noQueueWork =
    queueState.pendingJobs === 0 && queueState.runningJobs === 0;
  const usefulCompleted = Boolean(
    usefulStructuredReady &&
      noQueueWork &&
      item.cleanupState === 'active' &&
      !repairRemaining &&
      !deleteAssessment.deleteCandidate &&
      item.historicalRepairBucket !== 'archive_or_noise' &&
      item.analysisQualityState !== 'CRITICAL',
  );
  const archiveCompleted = Boolean(
    archiveStructuredReady &&
      noQueueWork &&
      (deleteAssessment.deleteCandidate || terminalNoKeepValue),
  );

  if (usefulCompleted) {
    const analysisCompletionReason = uniqueCompletionReasons([
      'useful_analysis_closed',
      'useful_retained_value',
    ]);
    return {
      analysisCompletionState: 'completed_useful',
      analysisCompletionReason,
      analysisCompletionPrimaryReason: analysisCompletionReason[0],
      analysisCompletedAt: args.snapshotAt,
      analysisCompletedByModel: args.assignedModelName ?? 'system_policy',
      completedFromFrozenPoolBatchId: args.batchId,
    };
  }

  if (archiveCompleted) {
    const analysisCompletionReason = uniqueCompletionReasons([
      deleteAssessment.deleteCandidate
        ? 'archive_delete_candidate_ready'
        : 'archive_policy_no_keep_value',
      terminalNoKeepValue ? 'archive_terminal_ready' : null,
      lowQuality ? 'quality_below_completion_threshold' : null,
    ]);
    return {
      analysisCompletionState: 'completed_not_useful_archived',
      analysisCompletionReason,
      analysisCompletionPrimaryReason: analysisCompletionReason[0],
      analysisCompletedAt: args.snapshotAt,
      analysisCompletedByModel: 'system_policy',
      completedFromFrozenPoolBatchId: args.batchId,
    };
  }

  const legacyBlockedByMissingStructure = Boolean(
    !(
      item.hasSnapshot &&
      item.hasInsight &&
      item.hasFinalDecision
    ) &&
      (archiveStructuredReady || usefulStructuredReady),
  );
  const legacyBlockedByTrustedGaps = Boolean(
    item.cleanupState === 'active' &&
      noQueueWork &&
      !repairRemaining &&
      usefulStructuredReady &&
      item.trustedBlockingGaps.length > 0,
  );

  const analysisCompletionReason = uniqueCompletionReasons([
    queueState.pendingJobs > 0 ? 'pending_queue_jobs' : null,
    queueState.runningJobs > 0 ? 'running_queue_jobs' : null,
    !archiveStructuredReady ? 'missing_structured_analysis' : null,
    repairRemaining ? 'repair_action_remaining' : null,
    !repairRemaining && lowQuality ? 'quality_below_completion_threshold' : null,
    !repairRemaining && item.trustedBlockingGaps.length > 0
      ? 'trusted_gaps_remaining'
      : null,
    deleteAssessment.deleteApprovedByPolicy ? 'delete_policy_not_met' : null,
    legacyBlockedByMissingStructure || legacyBlockedByTrustedGaps
      ? 'terminal_condition_blocked_by_strict_legacy_gate'
      : null,
  ]);
  return {
    analysisCompletionState: 'still_incomplete',
    analysisCompletionReason,
    analysisCompletionPrimaryReason: analysisCompletionReason[0],
    analysisCompletedAt: null,
    analysisCompletedByModel: null,
    completedFromFrozenPoolBatchId: null,
  };
}

export function resolveFrozenAnalysisCompletionState(args: {
  item: HistoricalRepairPriorityItem;
  queueState?: FrozenAnalysisPoolQueueState | null;
  deleteAssessment?: FrozenAnalysisDeleteAssessment | null;
  batchId?: string;
  snapshotAt?: string;
  assignedModelName?: string | null;
}): FrozenAnalysisCompletionState {
  return evaluateFrozenAnalysisCompletion({
    item: args.item,
    queueState: args.queueState,
    deleteAssessment: args.deleteAssessment,
    batchId: args.batchId ?? 'unknown-batch',
    snapshotAt: args.snapshotAt ?? new Date(0).toISOString(),
    assignedModelName: args.assignedModelName ?? null,
  }).analysisCompletionState;
}

export function buildFrozenAnalysisPoolMember(args: {
  item: HistoricalRepairPriorityItem;
  queueState?: FrozenAnalysisPoolQueueState | null;
  batchId: string;
  snapshotAt: string;
  completionOverride?: FrozenAnalysisCompletionOverride | null;
  modelNames?: {
    modelA: string | null;
    modelB: string | null;
  };
}): FrozenAnalysisPoolMember {
  const queueState = args.queueState ?? EMPTY_QUEUE_STATE;
  const deleteAssessment = evaluateFrozenAnalysisDeleteCandidate({
    item: args.item,
    queueState,
  });
  const assignedModelLane = assignFrozenAnalysisPoolModelLane(args.item);
  const assignedModelName =
    assignedModelLane === 'modelA'
      ? args.modelNames?.modelA ?? null
      : assignedModelLane === 'modelB'
        ? args.modelNames?.modelB ?? null
        : null;
  const completion =
    args.completionOverride ??
    evaluateFrozenAnalysisCompletion({
      item: args.item,
      queueState,
      deleteAssessment,
      batchId: args.batchId,
      snapshotAt: args.snapshotAt,
      assignedModelName,
    });

  return {
    repositoryId: args.item.repoId,
    fullName: args.item.fullName,
    frozenAnalysisPoolBatchId: args.batchId,
    frozenAnalysisPoolMember: true,
    frozenAnalysisPoolSnapshotAt: args.snapshotAt,
    historicalRepairBucket: args.item.historicalRepairBucket,
    historicalRepairPriorityScore: args.item.historicalRepairPriorityScore,
    historicalRepairAction: args.item.historicalRepairAction,
    cleanupState: args.item.cleanupState,
    cleanupReason: args.item.cleanupReason,
    frontendDecisionState: args.item.frontendDecisionState,
    strictVisibilityLevel: args.item.strictVisibilityLevel,
    repositoryValueTier: args.item.repositoryValueTier,
    moneyPriority: args.item.moneyPriority,
    analysisQualityScore: args.item.analysisQualityScore,
    analysisQualityState: args.item.analysisQualityState,
    hasSnapshot: args.item.hasSnapshot,
    hasInsight: args.item.hasInsight,
    hasFinalDecision: args.item.hasFinalDecision,
    hasDeep: args.item.hasDeep,
    pendingJobs: queueState.pendingJobs,
    runningJobs: queueState.runningJobs,
    analysisCompletionState: completion.analysisCompletionState,
    analysisCompletionReason: completion.analysisCompletionReason,
    analysisCompletionPrimaryReason: completion.analysisCompletionPrimaryReason,
    analysisCompletedAt: completion.analysisCompletedAt,
    analysisCompletedByModel: completion.analysisCompletedByModel,
    completedFromFrozenPoolBatchId: completion.completedFromFrozenPoolBatchId,
    deleteCandidate: deleteAssessment.deleteCandidate,
    deleteReason: deleteAssessment.deleteReason,
    deleteApprovedByPolicy: deleteAssessment.deleteApprovedByPolicy,
    deletedAt: null,
    deletedByPolicy: false,
    deletedFromFrozenPoolBatchId: null,
    assignedModelLane,
    assignedModelName,
    keyEvidenceGaps: args.item.keyEvidenceGaps,
    trustedBlockingGaps: args.item.trustedBlockingGaps,
    seedReasonSummary: args.item.historicalRepairReason,
  };
}

export function shouldIncludeFrozenPoolMember(member: FrozenAnalysisPoolMember) {
  return (
    member.analysisCompletionState === 'still_incomplete' ||
    member.analysisCompletionState === 'suppressed_from_remaining' ||
    member.deleteCandidate ||
    member.pendingJobs > 0 ||
    member.runningJobs > 0
  );
}

export function buildFrozenAnalysisPoolSummary(
  members: FrozenAnalysisPoolMember[],
): FrozenAnalysisPoolSummary {
  const byBucket: Record<string, number> = {};
  const byQualityState: Record<string, number> = {};
  const byRepairAction: Record<string, number> = {};
  const byVisibilityLevel: Record<string, number> = {};
  const byValueTier: Record<string, number> = {};
  const byMoneyPriority: Record<'P0' | 'P1' | 'P2' | 'P3' | 'NONE', number> = {
    P0: 0,
    P1: 0,
    P2: 0,
    P3: 0,
    NONE: 0,
  };
  const byCleanupState: Record<HistoricalCleanupState, number> = {
    active: 0,
    freeze: 0,
    archive: 0,
    purge_ready: 0,
  };
  const byCompletionState: Record<FrozenAnalysisCompletionState, number> = {
    completed_useful: 0,
    completed_not_useful_deleted: 0,
    completed_not_useful_archived: 0,
    suppressed_from_remaining: 0,
    still_incomplete: 0,
  };
  const deleteReasonBreakdown = DELETE_REASONS.reduce<
    Record<FrozenAnalysisDeleteReason, number>
  >(
    (acc, reason) => {
      acc[reason] = 0;
      return acc;
    },
    {
      low_value: 0,
      low_visibility: 0,
      low_quality: 0,
      long_tail_noise: 0,
      archive_bucket: 0,
      trusted_ineligible: 0,
      no_repair_roi: 0,
      no_user_reach: 0,
      analysis_complete_no_keep_value: 0,
    },
  );
  const remainingReasonBreakdown = COMPLETION_REASONS.reduce<
    Record<FrozenAnalysisCompletionReason, number>
  >(
    (acc, reason) => {
      acc[reason] = 0;
      return acc;
    },
    createEmptyCompletionReasonBreakdown(),
  );
  const remainingPrimaryReasonBreakdown = COMPLETION_REASONS.reduce<
    Record<FrozenAnalysisCompletionReason, number>
  >(
    (acc, reason) => {
      acc[reason] = 0;
      return acc;
    },
    createEmptyCompletionReasonBreakdown(),
  );
  const remainingActionBreakdown: Record<string, number> = {};

  let hasDeep = 0;
  let noDeep = 0;
  let pending = 0;
  let running = 0;
  let completed = 0;
  let remaining = 0;
  let deleteCandidateCount = 0;

  for (const member of members) {
    byBucket[member.historicalRepairBucket] =
      (byBucket[member.historicalRepairBucket] ?? 0) + 1;
    byQualityState[member.analysisQualityState] =
      (byQualityState[member.analysisQualityState] ?? 0) + 1;
    byRepairAction[member.historicalRepairAction] =
      (byRepairAction[member.historicalRepairAction] ?? 0) + 1;
    byCleanupState[member.cleanupState] += 1;
    byVisibilityLevel[member.strictVisibilityLevel] =
      (byVisibilityLevel[member.strictVisibilityLevel] ?? 0) + 1;
    byValueTier[member.repositoryValueTier] =
      (byValueTier[member.repositoryValueTier] ?? 0) + 1;
    byMoneyPriority[member.moneyPriority ?? 'NONE'] += 1;
    byCompletionState[member.analysisCompletionState] += 1;
    if (member.hasDeep) {
      hasDeep += 1;
    } else {
      noDeep += 1;
    }
    if (member.pendingJobs > 0) {
      pending += 1;
    }
    if (member.runningJobs > 0) {
      running += 1;
    }
    if (member.analysisCompletionState === 'still_incomplete') {
      remaining += 1;
      remainingActionBreakdown[member.historicalRepairAction] =
        (remainingActionBreakdown[member.historicalRepairAction] ?? 0) + 1;
      remainingPrimaryReasonBreakdown[member.analysisCompletionPrimaryReason] += 1;
      for (const reason of member.analysisCompletionReason) {
        remainingReasonBreakdown[reason] += 1;
      }
    } else {
      completed += 1;
    }
    if (member.deleteCandidate) {
      deleteCandidateCount += 1;
      for (const reason of member.deleteReason) {
        deleteReasonBreakdown[reason] += 1;
      }
    }
  }

  return {
    totalPoolSize: members.length,
    byBucket,
    byQualityState,
    byRepairAction,
    byCleanupState,
    byVisibilityLevel,
    byValueTier,
    byMoneyPriority,
    byHasDeep: {
      hasDeep,
      noDeep,
    },
    byCompletionState,
    byQueueState: {
      pending,
      running,
      completed,
      remaining,
    },
    deleteCandidateCount,
    deleteReasonBreakdown,
    remainingReasonBreakdown,
    remainingPrimaryReasonBreakdown,
    remainingActionBreakdown,
  };
}

export function buildFrozenAnalysisPoolBatchSnapshot(args: {
  generatedAt: string;
  batchId: string;
  scope: AnalysisPoolFreezeScope;
  reason: string;
  members: FrozenAnalysisPoolMember[];
}): FrozenAnalysisPoolBatchSnapshot {
  return {
    generatedAt: args.generatedAt,
    frozenAnalysisPoolBatchId: args.batchId,
    frozenAnalysisPoolSnapshotAt: args.generatedAt,
    analysisPoolFrozenScope: args.scope,
    analysisPoolFreezeReason: args.reason,
    repositoryIds: args.members.map((member) => member.repositoryId),
    drainCandidates: buildFrozenAnalysisPoolDrainCandidates(args.members),
    summary: buildFrozenAnalysisPoolSummary(args.members),
    topMembers: args.members.slice(0, 40),
  };
}

export function readFrozenAnalysisPoolBatchSnapshot(
  value: unknown,
): FrozenAnalysisPoolBatchSnapshot | null {
  const payload = readObject(value);
  if (!payload) {
    return null;
  }

  const repositoryIds = Array.isArray(payload.repositoryIds)
    ? payload.repositoryIds.map((value) => normalizeString(value)).filter(Boolean)
    : [];
  const summary = readObject(payload.summary);

  return {
    generatedAt: normalizeString(payload.generatedAt),
    frozenAnalysisPoolBatchId: normalizeString(payload.frozenAnalysisPoolBatchId),
    frozenAnalysisPoolSnapshotAt: normalizeString(
      payload.frozenAnalysisPoolSnapshotAt,
    ),
    analysisPoolFrozenScope:
      normalizeString(payload.analysisPoolFrozenScope) === '365_only'
        ? '365_only'
        : 'all_new_entries',
    analysisPoolFreezeReason:
      normalizeNullableString(payload.analysisPoolFreezeReason) ??
      DEFAULT_ANALYSIS_POOL_FREEZE_REASON,
    repositoryIds,
    drainCandidates: readFrozenAnalysisPoolDrainCandidates(payload.drainCandidates),
    summary: (summary as FrozenAnalysisPoolSummary) ?? buildFrozenAnalysisPoolSummary([]),
    topMembers: Array.isArray(payload.topMembers)
      ? (payload.topMembers as FrozenAnalysisPoolMember[])
      : [],
  };
}

export function evaluateAnalysisPoolIntakeGate(args: {
  freezeState: AnalysisPoolFreezeState | null;
  snapshot: FrozenAnalysisPoolBatchSnapshot | null;
  source: AnalysisPoolIntakeSource;
  repositoryIds?: string[] | null;
}): AnalysisPoolIntakeGateResult {
  const freezeState = args.freezeState;
  if (!freezeState?.analysisPoolFrozen) {
    return {
      analysisPoolFrozen: false,
      decision: 'allow_unfrozen',
      reason: 'analysis_pool_unfrozen',
      blockedRepositoryIds: [],
    };
  }

  if (
    args.source === 'github_fetch' ||
    args.source === 'github_created_backfill' ||
    args.source === 'repository_create'
  ) {
    return {
      analysisPoolFrozen: true,
      decision: 'suppress_new_entry',
      reason: `analysis_pool_frozen:${args.source}`,
      blockedRepositoryIds: [],
    };
  }

  const repositoryIds = uniqueStrings(args.repositoryIds ?? []);
  if (repositoryIds.length === 0) {
    return {
      analysisPoolFrozen: true,
      decision: 'suppress_unscoped_batch',
      reason: `analysis_pool_frozen_unscoped:${args.source}`,
      blockedRepositoryIds: [],
    };
  }

  const memberSet = new Set(args.snapshot?.repositoryIds ?? []);
  const blockedRepositoryIds = repositoryIds.filter((repositoryId) => !memberSet.has(repositoryId));
  if (blockedRepositoryIds.length > 0) {
    return {
      analysisPoolFrozen: true,
      decision: 'suppress_new_entry',
      reason: `analysis_pool_frozen_non_member:${args.source}`,
      blockedRepositoryIds,
    };
  }

  return {
    analysisPoolFrozen: true,
    decision: 'allow_existing_member',
    reason: `analysis_pool_member_allowed:${args.source}`,
    blockedRepositoryIds: [],
  };
}

export function buildFrozenAnalysisPoolReport(args: {
  generatedAt: string;
  freezeState: AnalysisPoolFreezeState;
  modelAssignment: FrozenAnalysisPoolReport['modelAssignment'];
  snapshot: FrozenAnalysisPoolBatchSnapshot;
  members: FrozenAnalysisPoolMember[];
}): FrozenAnalysisPoolReport {
  return {
    generatedAt: args.generatedAt,
    freezeState: args.freezeState,
    modelAssignment: args.modelAssignment,
    snapshot: args.snapshot,
    topMembers: args.members.slice(0, 40),
  };
}

export function renderFrozenAnalysisPoolMarkdown(
  report: FrozenAnalysisPoolReport,
) {
  const summary = report.snapshot.summary;
  const lines = [
    '# Frozen Analysis Pool',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- analysisPoolFrozen: ${report.freezeState.analysisPoolFrozen}`,
    `- analysisPoolFreezeReason: ${report.freezeState.analysisPoolFreezeReason}`,
    `- analysisPoolFrozenAt: ${report.freezeState.analysisPoolFrozenAt ?? 'null'}`,
    `- analysisPoolFrozenScope: ${report.freezeState.analysisPoolFrozenScope}`,
    `- frozenAnalysisPoolBatchId: ${report.snapshot.frozenAnalysisPoolBatchId}`,
    `- totalPoolSize: ${summary.totalPoolSize}`,
    `- modelA_drain_candidates: ${report.snapshot.drainCandidates.modelARepositoryIds.length}`,
    `- modelB_drain_candidates: ${report.snapshot.drainCandidates.modelBRepositoryIds.length}`,
    `- delete_drain_candidates: ${report.snapshot.drainCandidates.deleteCandidateRepositoryIds.length}`,
    '',
    '## Model Split',
    '',
    `- modelA: ${report.modelAssignment.modelA.model ?? 'null'} | ${report.modelAssignment.modelA.responsibilities.join(', ')}`,
    `- modelB: ${report.modelAssignment.modelB.model ?? 'null'} | ${report.modelAssignment.modelB.responsibilities.join(', ')}`,
    '',
    '## Completion',
    '',
    `- completed_useful: ${summary.byCompletionState.completed_useful}`,
    `- completed_not_useful_archived: ${summary.byCompletionState.completed_not_useful_archived}`,
    `- suppressed_from_remaining: ${summary.byCompletionState.suppressed_from_remaining}`,
    `- still_incomplete: ${summary.byCompletionState.still_incomplete}`,
    `- pending: ${summary.byQueueState.pending}`,
    `- running: ${summary.byQueueState.running}`,
    '',
    '## Delete Candidates',
    '',
    `- deleteCandidateCount: ${summary.deleteCandidateCount}`,
    ...Object.entries(summary.deleteReasonBreakdown)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `- ${reason}: ${count}`),
    '',
    '## Top Members',
    '',
    ...report.topMembers.slice(0, 20).map(
      (member) =>
        `- ${member.fullName} | action=${member.historicalRepairAction} | quality=${member.analysisQualityState}/${member.analysisQualityScore} | completion=${member.analysisCompletionState} | delete=${member.deleteCandidate} | lane=${member.assignedModelLane}`,
    ),
    '',
    '## Command',
    '',
    '- command: pnpm --filter api report:frozen-analysis-pool',
  ];

  return lines.join('\n');
}

export function buildFrozenAnalysisPoolDrainResult(args: {
  generatedAt: string;
  freezeState: AnalysisPoolFreezeState;
  batchId: string;
  modelAssignment: FrozenAnalysisPoolReport['modelAssignment'];
  intakeQueueSuppressedCount: number;
  removedFromActivePoolCount: number;
  deletedFromRepositoryStoreCount: number;
  deleteSuppressedQueueCount: number;
  totalExecuted: number;
  modelAExecutedCount: number;
  modelBExecutedCount: number;
  snapshot: FrozenAnalysisPoolBatchSnapshot;
  members: FrozenAnalysisPoolMember[];
  queueSummary: {
    totalQueued: number;
    actionCounts: Record<string, number>;
  };
  deletedItems: FrozenAnalysisPoolDrainResult['deletedItems'];
}): FrozenAnalysisPoolDrainResult {
  const baseCompleted =
    args.snapshot.summary.byCompletionState.completed_useful +
    args.snapshot.summary.byCompletionState.completed_not_useful_archived +
    args.snapshot.summary.byCompletionState.suppressed_from_remaining +
    args.snapshot.summary.byCompletionState.completed_not_useful_deleted;
  const completed = baseCompleted + args.deletedItems.length;
  const remaining = Math.max(
    args.snapshot.summary.byCompletionState.still_incomplete - args.deletedItems.length,
    0,
  );
  const pending = Math.max(
    args.snapshot.summary.byQueueState.pending + args.snapshot.summary.byQueueState.running,
    args.queueSummary.totalQueued,
  );

  return {
    generatedAt: args.generatedAt,
    freezeState: args.freezeState,
    frozenAnalysisPoolBatchId: args.batchId,
    modelAssignment: args.modelAssignment,
    intakeQueueSuppressedCount: args.intakeQueueSuppressedCount,
    removedFromActivePoolCount: args.removedFromActivePoolCount,
    deletedFromRepositoryStoreCount: args.deletedFromRepositoryStoreCount,
    deleteSuppressedQueueCount: args.deleteSuppressedQueueCount,
    totalExecuted: args.totalExecuted,
    modelAExecutedCount: args.modelAExecutedCount,
    modelBExecutedCount: args.modelBExecutedCount,
    frozenPoolRemainingCount: remaining,
    frozenPoolCompletedCount: completed,
    frozenPoolNoUseDeletedCount: args.deletedItems.length,
    frozenPoolStillPendingCount: pending,
    frozenPoolSnapshot: args.snapshot,
    queueSummary: args.queueSummary,
    executionSummary: {
      completed,
      remaining,
      deleted: args.deletedItems.length,
      pending,
    },
    deletedItems: args.deletedItems,
    pendingPreview: args.members
      .filter((member) => member.pendingJobs > 0 || member.runningJobs > 0)
      .slice(0, 50),
    remainingPreview: args.members
      .filter((member) => member.analysisCompletionState === 'still_incomplete')
      .slice(0, 50),
  };
}

export function renderFrozenAnalysisPoolDrainMarkdown(
  result: FrozenAnalysisPoolDrainResult,
) {
  const lines = [
    '# Frozen Analysis Pool Drain',
    '',
    `- generatedAt: ${result.generatedAt}`,
    `- intakeFreeze: ${result.freezeState.analysisPoolFrozen}`,
    `- frozenAnalysisPoolBatchId: ${result.frozenAnalysisPoolBatchId}`,
    `- totalPoolSize: ${result.frozenPoolSnapshot.summary.totalPoolSize}`,
    `- completed: ${result.frozenPoolCompletedCount}`,
    `- remaining: ${result.frozenPoolRemainingCount}`,
    `- deleted: ${result.frozenPoolNoUseDeletedCount}`,
    `- pending: ${result.frozenPoolStillPendingCount}`,
    `- modelAExecutedCount: ${result.modelAExecutedCount}`,
    `- modelBExecutedCount: ${result.modelBExecutedCount}`,
    `- intakeQueueSuppressedCount: ${result.intakeQueueSuppressedCount}`,
    `- removedFromActivePoolCount: ${result.removedFromActivePoolCount}`,
    `- deletedFromRepositoryStoreCount: ${result.deletedFromRepositoryStoreCount}`,
    `- deleteSuppressedQueueCount: ${result.deleteSuppressedQueueCount}`,
    '',
    '## Queue Summary',
    '',
    `- totalQueued: ${result.queueSummary.totalQueued}`,
    ...Object.entries(result.queueSummary.actionCounts).map(
      ([action, count]) => `- ${action}: ${count}`,
    ),
    '',
    '## Deleted',
    '',
    ...result.deletedItems.slice(0, 20).map(
      (item) =>
        `- ${item.fullName} | reasons=${item.deleteReason.join(', ') || 'none'}`,
    ),
    '',
    '## Remaining',
    '',
    ...result.remainingPreview.slice(0, 20).map(
      (member) =>
        `- ${member.fullName} | action=${member.historicalRepairAction} | lane=${member.assignedModelLane} | quality=${member.analysisQualityState}/${member.analysisQualityScore} | gaps=${member.keyEvidenceGaps.join(', ') || 'none'}`,
    ),
    '',
    '## Command',
    '',
    '- command: pnpm --filter api run:frozen-pool-drain',
  ];

  return lines.join('\n');
}

export function buildFrozenAnalysisPoolDeletedItem(args: {
  member: FrozenAnalysisPoolMember;
  batchId: string;
  deletedAt: string;
}): FrozenAnalysisPoolDeletedItem {
  return {
    repositoryId: args.member.repositoryId,
    fullName: args.member.fullName,
    analysisCompletionState: 'completed_not_useful_deleted',
    analysisCompletionReason: uniqueCompletionReasons([
      'deleted_by_policy',
      'archive_delete_candidate_ready',
    ]),
    analysisCompletedAt: args.deletedAt,
    analysisCompletedByModel: 'system_policy',
    completedFromFrozenPoolBatchId: args.batchId,
    deleteReason: args.member.deleteReason,
    deleteApprovedByPolicy: true,
    deletedAt: args.deletedAt,
    deletedByPolicy: true,
    deletedFromFrozenPoolBatchId: args.batchId,
  };
}

export function buildFrozenAnalysisPoolRetainedDeleteCandidate(args: {
  member: FrozenAnalysisPoolMember;
}): FrozenAnalysisPoolRetainedDeleteCandidate {
  return {
    repositoryId: args.member.repositoryId,
    fullName: args.member.fullName,
    deleteReason: args.member.deleteReason,
    pendingJobs: args.member.pendingJobs,
    runningJobs: args.member.runningJobs,
    retainedReason:
      args.member.runningJobs > 0 ? 'running_jobs_present' : 'pending_jobs_present',
  };
}

export function buildFrozenAnalysisPoolCompletionPassResult(args: {
  generatedAt: string;
  freezeState: AnalysisPoolFreezeState;
  batchId: string;
  snapshotAt: string | null;
  startingBatchPoolSize: number;
  beforeMembers: FrozenAnalysisPoolMember[];
  currentSnapshot: FrozenAnalysisPoolBatchSnapshot;
  currentMembers: FrozenAnalysisPoolMember[];
  deletedItems: FrozenAnalysisPoolDeletedItem[];
  retainedDeleteCandidates: FrozenAnalysisPoolRetainedDeleteCandidate[];
  deleteSuppressedQueueCount: number;
  latestDrain?: {
    generatedAt: string | null;
    totalExecuted: number;
    modelAExecutedCount: number;
    modelBExecutedCount: number;
    actionBreakdown: Record<string, number>;
  } | null;
}): FrozenAnalysisPoolCompletionPassResult {
  const beforeRemainingIds = new Set(
    args.beforeMembers
      .filter((member) => member.analysisCompletionState === 'still_incomplete')
      .map((member) => member.repositoryId),
  );
  const afterRemainingIds = new Set(
    args.currentMembers
      .filter((member) => member.analysisCompletionState === 'still_incomplete')
      .map((member) => member.repositoryId),
  );
  const removedFromFrozenRemainingCount = [...beforeRemainingIds].filter(
    (repositoryId) => !afterRemainingIds.has(repositoryId),
  ).length;
  const deletedCount = args.deletedItems.length;
  const deleteReasonBreakdown = DELETE_REASONS.reduce<
    Record<FrozenAnalysisDeleteReason, number>
  >(
    (acc, reason) => {
      acc[reason] = 0;
      return acc;
    },
    {
      low_value: 0,
      low_visibility: 0,
      low_quality: 0,
      long_tail_noise: 0,
      archive_bucket: 0,
      trusted_ineligible: 0,
      no_repair_roi: 0,
      no_user_reach: 0,
      analysis_complete_no_keep_value: 0,
    },
  );
  const remainingReasonBreakdown = {
    ...args.currentSnapshot.summary.remainingReasonBreakdown,
  };
  const remainingPrimaryReasonBreakdown = {
    ...args.currentSnapshot.summary.remainingPrimaryReasonBreakdown,
  };
  const remainingActionBreakdown = {
    ...args.currentSnapshot.summary.remainingActionBreakdown,
  };
  const promotedUsefulCount = args.currentMembers.filter((member) => {
    const legacy = evaluateFrozenAnalysisCompletionLegacy({
      member,
    });
    return (
      member.analysisCompletionState === 'completed_useful' &&
      legacy.analysisCompletionState === 'still_incomplete'
    );
  }).length;
  const promotedArchivedCount = args.currentMembers.filter((member) => {
    const legacy = evaluateFrozenAnalysisCompletionLegacy({
      member,
    });
    return (
      member.analysisCompletionState === 'completed_not_useful_archived' &&
      legacy.analysisCompletionState === 'still_incomplete'
    );
  }).length;
  const legacyStructuredGateBlockedCount = args.currentMembers.filter((member) =>
    member.analysisCompletionReason.includes(
      'terminal_condition_blocked_by_strict_legacy_gate',
    ),
  ).length;
  const legacyTrustedGapGateBlockedCount = args.currentMembers.filter(
    (member) =>
      member.analysisCompletionState === 'still_incomplete' &&
      member.analysisCompletionReason.includes('trusted_gaps_remaining') &&
      member.analysisCompletionReason.includes(
        'terminal_condition_blocked_by_strict_legacy_gate',
      ),
  ).length;
  const legacyQualityGateBlockedCount = args.currentMembers.filter(
    (member) =>
      member.analysisCompletionState === 'still_incomplete' &&
      member.analysisCompletionReason.includes(
        'quality_below_completion_threshold',
      ),
  ).length;

  for (const item of args.deletedItems) {
    for (const reason of item.deleteReason) {
      deleteReasonBreakdown[reason] += 1;
    }
  }

  return {
    generatedAt: args.generatedAt,
    freezeState: args.freezeState,
    frozenAnalysisPoolBatchId: args.batchId,
    frozenAnalysisPoolSnapshotAt: args.snapshotAt,
    startingBatchPoolSize: args.startingBatchPoolSize,
    currentFrozenPoolSize: args.currentSnapshot.summary.totalPoolSize,
    frozenPoolReducedCount: Math.max(
      args.startingBatchPoolSize - args.currentSnapshot.summary.totalPoolSize,
      0,
    ),
    frozenPoolCompletedUsefulCount:
      args.currentSnapshot.summary.byCompletionState.completed_useful,
    frozenPoolCompletedDeletedCount: deletedCount,
    frozenPoolCompletedArchivedCount:
      args.currentSnapshot.summary.byCompletionState.completed_not_useful_archived,
    frozenPoolStillIncompleteCount:
      args.currentSnapshot.summary.byCompletionState.still_incomplete,
    frozenPoolRemainingCount:
      args.currentSnapshot.summary.byCompletionState.still_incomplete,
    frozenPoolPendingCount: args.currentSnapshot.summary.byQueueState.pending,
    frozenPoolInFlightCount: args.currentSnapshot.summary.byQueueState.running,
    deleteCandidateCount: args.currentSnapshot.summary.deleteCandidateCount,
    deletedCount,
    removedFromActivePoolCount: deletedCount,
    removedFromFrozenRemainingCount,
    deleteSuppressedQueueCount: args.deleteSuppressedQueueCount,
    deleteReasonBreakdown,
    remainingReasonBreakdown,
    remainingPrimaryReasonBreakdown,
    remainingActionBreakdown,
    completionPromotionSummary: {
      promotedUsefulCount,
      promotedArchivedCount,
      promotedOutOfIncompleteCount:
        promotedUsefulCount + promotedArchivedCount + deletedCount,
      legacyStructuredGateBlockedCount,
      legacyTrustedGapGateBlockedCount,
      legacyQualityGateBlockedCount,
    },
    drainExecution: {
      generatedAt: args.latestDrain?.generatedAt ?? null,
      totalExecuted: args.latestDrain?.totalExecuted ?? 0,
      modelAExecutedCount: args.latestDrain?.modelAExecutedCount ?? 0,
      modelBExecutedCount: args.latestDrain?.modelBExecutedCount ?? 0,
      actionBreakdown: args.latestDrain?.actionBreakdown ?? {},
    },
    deletedItems: args.deletedItems,
    retainedDeleteCandidates: args.retainedDeleteCandidates,
    topCompletedUseful: args.currentMembers
      .filter((member) => member.analysisCompletionState === 'completed_useful')
      .slice(0, 20),
    topArchived: args.currentMembers
      .filter(
        (member) =>
          member.analysisCompletionState === 'completed_not_useful_archived',
      )
      .slice(0, 20),
    topRemaining: args.currentMembers
      .filter((member) => member.analysisCompletionState === 'still_incomplete')
      .slice(0, 20),
  };
}

export function renderFrozenAnalysisPoolCompletionMarkdown(
  result: FrozenAnalysisPoolCompletionPassResult,
) {
  const lines = [
    '# Frozen Analysis Pool Completion',
    '',
    `- generatedAt: ${result.generatedAt}`,
    `- analysisPoolFrozen: ${result.freezeState.analysisPoolFrozen}`,
    `- analysisPoolFreezeReason: ${result.freezeState.analysisPoolFreezeReason}`,
    `- frozenAnalysisPoolBatchId: ${result.frozenAnalysisPoolBatchId}`,
    `- startingBatchPoolSize: ${result.startingBatchPoolSize}`,
    `- currentFrozenPoolSize: ${result.currentFrozenPoolSize}`,
    `- frozenPoolReducedCount: ${result.frozenPoolReducedCount}`,
    '',
    '## Completion',
    '',
    `- completed_useful: ${result.frozenPoolCompletedUsefulCount}`,
    `- completed_not_useful_deleted: ${result.frozenPoolCompletedDeletedCount}`,
    `- completed_not_useful_archived: ${result.frozenPoolCompletedArchivedCount}`,
    `- suppressed_from_remaining: ${Math.max(result.currentFrozenPoolSize - result.frozenPoolCompletedUsefulCount - result.frozenPoolCompletedDeletedCount - result.frozenPoolCompletedArchivedCount - result.frozenPoolStillIncompleteCount, 0)}`,
    `- still_incomplete: ${result.frozenPoolStillIncompleteCount}`,
    `- pending: ${result.frozenPoolPendingCount}`,
    `- in_flight: ${result.frozenPoolInFlightCount}`,
    '',
    '## Drain Execution',
    '',
    `- modelAExecutedCount: ${result.drainExecution.modelAExecutedCount}`,
    `- modelBExecutedCount: ${result.drainExecution.modelBExecutedCount}`,
    `- totalExecuted: ${result.drainExecution.totalExecuted}`,
    ...Object.entries(result.drainExecution.actionBreakdown).map(
      ([action, count]) => `- ${action}: ${count}`,
    ),
    '',
    '## Promotion Diagnostics',
    '',
    `- promotedUsefulCount: ${result.completionPromotionSummary.promotedUsefulCount}`,
    `- promotedArchivedCount: ${result.completionPromotionSummary.promotedArchivedCount}`,
    `- promotedOutOfIncompleteCount: ${result.completionPromotionSummary.promotedOutOfIncompleteCount}`,
    `- legacyStructuredGateBlockedCount: ${result.completionPromotionSummary.legacyStructuredGateBlockedCount}`,
    `- legacyTrustedGapGateBlockedCount: ${result.completionPromotionSummary.legacyTrustedGapGateBlockedCount}`,
    `- legacyQualityGateBlockedCount: ${result.completionPromotionSummary.legacyQualityGateBlockedCount}`,
    '',
    '## Deletion',
    '',
    `- deleteCandidateCount: ${result.deleteCandidateCount}`,
    `- deletedCount: ${result.deletedCount}`,
    `- removedFromActivePoolCount: ${result.removedFromActivePoolCount}`,
    `- removedFromFrozenRemainingCount: ${result.removedFromFrozenRemainingCount}`,
    `- deleteSuppressedQueueCount: ${result.deleteSuppressedQueueCount}`,
    ...Object.entries(result.deleteReasonBreakdown)
      .filter(([, count]) => Number(count) > 0)
      .map(([reason, count]) => `- ${reason}: ${String(count)}`),
    '',
    '## Remaining Root Causes',
    '',
    ...Object.entries(result.remainingPrimaryReasonBreakdown)
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, 12)
      .map(([reason, count]) => `- ${reason}: ${String(count)}`),
    '',
    '## Remaining Actions',
    '',
    ...Object.entries(result.remainingActionBreakdown)
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, 12)
      .map(([action, count]) => `- ${action}: ${String(count)}`),
    '',
    '## Deleted Repositories',
    '',
    ...result.deletedItems
      .slice(0, 20)
      .map(
        (item: FrozenAnalysisPoolDeletedItem) =>
          `- ${item.fullName} | reasons=${item.deleteReason.join(', ') || 'none'} | deletedAt=${item.deletedAt}`,
      ),
    '',
    '## Retained Delete Candidates',
    '',
    ...result.retainedDeleteCandidates
      .slice(0, 20)
      .map(
        (item: FrozenAnalysisPoolRetainedDeleteCandidate) =>
          `- ${item.fullName} | retainedReason=${item.retainedReason} | pending=${item.pendingJobs} | running=${item.runningJobs}`,
      ),
    '',
    '## Completed Useful',
    '',
    ...result.topCompletedUseful
      .slice(0, 20)
      .map(
        (member: FrozenAnalysisPoolMember) =>
          `- ${member.fullName} | quality=${member.analysisQualityState}/${member.analysisQualityScore} | completionReason=${member.analysisCompletionReason.join(', ') || 'none'}`,
      ),
    '',
    '## Archived',
    '',
    ...result.topArchived
      .slice(0, 20)
      .map(
        (member: FrozenAnalysisPoolMember) =>
          `- ${member.fullName} | deleteCandidate=${member.deleteCandidate} | completionReason=${member.analysisCompletionReason.join(', ') || 'none'}`,
      ),
    '',
    '## Remaining',
    '',
    ...result.topRemaining
      .slice(0, 20)
      .map(
        (member: FrozenAnalysisPoolMember) =>
          `- ${member.fullName} | action=${member.historicalRepairAction} | lane=${member.assignedModelLane} | primaryReason=${member.analysisCompletionPrimaryReason} | reason=${member.analysisCompletionReason.join(', ') || 'none'}`,
      ),
    '',
    '## Command',
    '',
    '- command: pnpm --filter api run:frozen-pool-completion-pass',
  ];

  return lines.join('\n');
}

export function classifyFrozenAnalysisPoolDrainPriority(
  member: Pick<
    FrozenAnalysisPoolMember,
    | 'historicalRepairBucket'
    | 'historicalRepairAction'
    | 'cleanupState'
    | 'repositoryValueTier'
    | 'moneyPriority'
    | 'hasFinalDecision'
    | 'hasDeep'
    | 'analysisCompletionState'
  >,
): FrozenAnalysisPoolDrainPriorityClass {
  if (
    member.cleanupState === 'active' &&
    member.analysisCompletionState === 'still_incomplete' &&
    (member.historicalRepairBucket === 'visible_broken' ||
      member.historicalRepairBucket === 'high_value_weak' ||
      (member.hasFinalDecision && !member.hasDeep) ||
      ((member.repositoryValueTier === 'HIGH' ||
        member.moneyPriority === 'P0' ||
        member.moneyPriority === 'P1') &&
        (member.historicalRepairAction === 'decision_recalc' ||
          member.historicalRepairAction === 'deep_repair' ||
          member.historicalRepairAction === 'evidence_repair')))
  ) {
    return 'P0';
  }

  if (
    member.cleanupState === 'active' &&
    member.analysisCompletionState === 'still_incomplete' &&
    member.repositoryValueTier === 'MEDIUM' &&
    (member.historicalRepairAction === 'deep_repair' ||
      member.historicalRepairAction === 'evidence_repair')
  ) {
    return 'P1';
  }

  return 'P2';
}

export function classifyFrozenPendingAgeBucket(
  waitingDurationHours: number,
): FrozenAnalysisPoolPendingAgeBucket {
  if (waitingDurationHours < 1) {
    return 'lt_1h';
  }
  if (waitingDurationHours < 6) {
    return 'h1_6';
  }
  if (waitingDurationHours < 24) {
    return 'h6_24';
  }
  if (waitingDurationHours < 72) {
    return 'd1_3';
  }
  return 'gt_3d';
}

export function evaluateFrozenPendingSuppression(args: {
  member: Pick<
    FrozenAnalysisPoolMember,
    | 'cleanupState'
    | 'historicalRepairBucket'
    | 'historicalRepairAction'
    | 'repositoryValueTier'
    | 'moneyPriority'
    | 'analysisQualityState'
    | 'analysisCompletionState'
  >;
  waitingDurationHours: number;
  replayRisk: boolean;
  redundant: boolean;
}) {
  if (args.redundant) {
    return {
      suppressible: true,
      lowRoiStale: true,
      suppressionReason: 'redundant_pending_job',
    };
  }

  if (args.replayRisk) {
    return {
      suppressible: true,
      lowRoiStale: false,
      suppressionReason: 'decision_recalc_replay_risk',
    };
  }

  if (args.member.cleanupState !== 'active') {
    return {
      suppressible: true,
      lowRoiStale: true,
      suppressionReason: `cleanup_state_${args.member.cleanupState}`,
    };
  }

  if (args.member.historicalRepairBucket === 'archive_or_noise') {
    return {
      suppressible: true,
      lowRoiStale: true,
      suppressionReason: 'archive_or_noise_tail',
    };
  }

  if (
    args.member.repositoryValueTier === 'LOW' &&
    (args.member.moneyPriority === null || args.member.moneyPriority === 'P3') &&
    (args.member.analysisQualityState === 'LOW' ||
      args.member.analysisQualityState === 'CRITICAL') &&
    args.waitingDurationHours >= 24
  ) {
    return {
      suppressible: true,
      lowRoiStale: true,
      suppressionReason: 'low_roi_stale_pending',
    };
  }

  if (
    args.member.historicalRepairAction === 'refresh_only' &&
    args.waitingDurationHours >= 72
  ) {
    return {
      suppressible: true,
      lowRoiStale: true,
      suppressionReason: 'stale_refresh_only_pending',
    };
  }

  return {
    suppressible: false,
    lowRoiStale: false,
    suppressionReason: null,
  };
}

export function buildEmptyFrozenPendingQueueBreakdown(): FrozenAnalysisPoolPendingQueueBreakdown {
  return {
    totalPendingJobs: 0,
    byHistoricalRepairAction: {},
    byRouterCapabilityTier: {},
    byCleanupState: {
      active: 0,
      freeze: 0,
      archive: 0,
      purge_ready: 0,
    },
    byHistoricalRepairBucket: {},
    byRepositoryValueTier: {},
    byMoneyPriority: {
      P0: 0,
      P1: 0,
      P2: 0,
      P3: 0,
      NONE: 0,
    },
    byFrozenAnalysisPoolBatchId: {},
    byAgeBucket: {
      lt_1h: 0,
      h1_6: 0,
      h6_24: 0,
      d1_3: 0,
      gt_3d: 0,
    },
    byModelLane: {
      modelA: 0,
      modelB: 0,
      none: 0,
    },
  };
}

export function accumulateFrozenPendingQueueBreakdown(args: {
  breakdown: FrozenAnalysisPoolPendingQueueBreakdown;
  sample: FrozenAnalysisPoolPendingAuditSample;
}) {
  const { breakdown, sample } = args;
  breakdown.totalPendingJobs += 1;
  breakdown.byHistoricalRepairAction[sample.historicalRepairAction] =
    (breakdown.byHistoricalRepairAction[sample.historicalRepairAction] ?? 0) + 1;
  breakdown.byRouterCapabilityTier[sample.routerCapabilityTier ?? 'NONE'] =
    (breakdown.byRouterCapabilityTier[sample.routerCapabilityTier ?? 'NONE'] ?? 0) + 1;
  breakdown.byCleanupState[sample.cleanupState] += 1;
  breakdown.byHistoricalRepairBucket[sample.historicalRepairBucket] =
    (breakdown.byHistoricalRepairBucket[sample.historicalRepairBucket] ?? 0) + 1;
  breakdown.byRepositoryValueTier[sample.repositoryValueTier] =
    (breakdown.byRepositoryValueTier[sample.repositoryValueTier] ?? 0) + 1;
  breakdown.byMoneyPriority[sample.moneyPriority ?? 'NONE'] += 1;
  breakdown.byFrozenAnalysisPoolBatchId[sample.frozenAnalysisPoolBatchId] =
    (breakdown.byFrozenAnalysisPoolBatchId[sample.frozenAnalysisPoolBatchId] ?? 0) + 1;
  breakdown.byAgeBucket[sample.waitingDurationBucket] += 1;
  breakdown.byModelLane[sample.modelLane] += 1;
}

export function renderFrozenAnalysisPoolDrainFinishMarkdown(
  result: FrozenAnalysisPoolDrainFinishResult,
) {
  const lines = [
    '# Frozen Analysis Pool Pending Drain & Repair Finish',
    '',
    `- generatedAt: ${result.generatedAt}`,
    `- analysisPoolFrozen: ${result.freezeState.analysisPoolFrozen}`,
    `- analysisPoolFreezeReason: ${result.freezeState.analysisPoolFreezeReason}`,
    `- frozenAnalysisPoolBatchId: ${result.frozenAnalysisPoolBatchId}`,
    '',
    '## Pending Queue Inventory',
    '',
    `- totalPendingJobs: ${result.pendingQueueBreakdown.totalPendingJobs}`,
    `- pendingQueueHighPriorityCount: ${result.pendingQueueHighPriorityCount}`,
    `- pendingQueueLowROIStaleCount: ${result.pendingQueueLowROIStaleCount}`,
    `- pendingQueueSuppressibleCount: ${result.pendingQueueSuppressibleCount}`,
    `- pendingQueueReplayRiskCount: ${result.pendingQueueReplayRiskCount}`,
    `- pendingQueueRedundantCount: ${result.pendingQueueRedundantCount}`,
    '',
    '## Pending Work Triage',
    '',
    `- totalCurrentRemainingCount: ${result.pendingInventory.totalCurrentRemainingCount}`,
    `- queueStatus.pending: ${result.pendingInventory.byQueueStatus.pending}`,
    `- queueStatus.in_flight: ${result.pendingInventory.byQueueStatus.in_flight}`,
    `- queueStatus.no_queue: ${result.pendingInventory.byQueueStatus.no_queue}`,
    `- valueClass.high_value: ${result.pendingInventory.byValueClass.high_value}`,
    `- valueClass.medium_value: ${result.pendingInventory.byValueClass.medium_value}`,
    `- valueClass.low_value: ${result.pendingInventory.byValueClass.low_value}`,
    `- visibilityClass.high_visibility: ${result.pendingInventory.byVisibilityClass.high_visibility}`,
    `- visibilityClass.low_visibility: ${result.pendingInventory.byVisibilityClass.low_visibility}`,
    `- worthRunningCount: ${result.pendingInventory.worthRunningCount}`,
    `- lowRoiArchivableCount: ${result.pendingInventory.lowRoiArchivableCount}`,
    `- replayOrRedundantCount: ${result.pendingInventory.replayOrRedundantCount}`,
    `- priorityDrainCount: ${result.pendingInventory.priorityDrainCount}`,
    '',
    '## Drain Result',
    '',
    `- pendingDrainedCount: ${result.pendingDrainedCount}`,
    `- pendingExecutedCount: ${result.pendingExecutedCount}`,
    `- pendingSuppressedCount: ${result.pendingSuppressedCount}`,
    `- pendingCancelledRedundantCount: ${result.pendingCancelledRedundantCount}`,
    `- pendingPromotedToCompletedCount: ${result.pendingPromotedToCompletedCount}`,
    `- pendingPromotedToArchivedCount: ${result.pendingPromotedToArchivedCount}`,
    `- pendingPromotedToDeletedCount: ${result.pendingPromotedToDeletedCount}`,
    `- pendingStillRemainingCount: ${result.pendingStillRemainingCount}`,
    '',
    '## Decision Recalc Compression',
    '',
    `- decisionRecalcRemainingBefore: ${result.decisionRecalcRemainingBefore}`,
    `- decisionRecalcRemainingAfter: ${result.decisionRecalcRemainingAfter}`,
    `- decisionRecalcCompressedCount: ${result.decisionRecalcCompressedCount}`,
    `- decisionRecalcKeptRunningCount: ${result.decisionRecalcKeptRunningCount}`,
    `- decisionRecalcPromotedArchivedCount: ${result.decisionRecalcPromotedArchivedCount}`,
    `- decisionRecalcPromotedDeletedCount: ${result.decisionRecalcPromotedDeletedCount}`,
    `- decisionRecalcSuppressedFromRemainingCount: ${result.decisionRecalcSuppressedFromRemainingCount}`,
    `- decisionRecalcRemovedFromPendingCount: ${result.decisionRecalcRemovedFromPendingCount}`,
    `- decisionRecalcRemovedFromRepairRemainingCount: ${result.decisionRecalcRemovedFromRepairRemainingCount}`,
    `- decisionRecalcStillWorthRunningCount: ${result.decisionRecalcStillWorthRunningCount}`,
    '',
    '## Repair Finish',
    '',
    `- repairActionRemainingReducedCount: ${result.repairActionRemainingReducedCount}`,
    `- decision_recalc.selectedCount: ${result.decisionRecalcFinishSummary.selectedCount}`,
    `- decision_recalc.queuedCount: ${result.decisionRecalcFinishSummary.queuedCount}`,
    `- decision_recalc.suppressedCount: ${result.decisionRecalcFinishSummary.suppressedCount}`,
    `- deep_repair.selectedCount: ${result.deepRepairFinishSummary.selectedCount}`,
    `- deep_repair.queuedCount: ${result.deepRepairFinishSummary.queuedCount}`,
    `- deep_repair.noChangeCount: ${result.deepRepairFinishSummary.noChangeCount}`,
    `- evidence_repair.selectedCount: ${result.evidenceRepairFinishSummary.selectedCount}`,
    `- evidence_repair.queuedCount: ${result.evidenceRepairFinishSummary.queuedCount}`,
    `- evidence_repair.noChangeCount: ${result.evidenceRepairFinishSummary.noChangeCount}`,
    '',
    '## Completion Promotion',
    '',
    `- completedUsefulAddedCount: ${result.completedUsefulAddedCount}`,
    `- completedArchivedAddedCount: ${result.completedArchivedAddedCount}`,
    `- completedDeletedAddedCount: ${result.completedDeletedAddedCount}`,
    `- frozenPoolCompletedUsefulCount: ${result.frozenPoolCompletedUsefulCount}`,
    `- frozenPoolCompletedArchivedCount: ${result.frozenPoolCompletedArchivedCount}`,
    `- frozenPoolCompletedDeletedCount: ${result.frozenPoolCompletedDeletedCount}`,
    `- frozenPoolRemainingBefore: ${result.frozenPoolRemainingBefore}`,
    `- frozenPoolRemainingAfter: ${result.frozenPoolRemainingAfter}`,
    `- frozenPoolRemainingCount: ${result.frozenPoolRemainingCount}`,
    '',
    '## Action Diagnostics',
    '',
    `- hardestAction: ${result.hardestAction ? `${result.hardestAction.action} (${result.hardestAction.count})` : 'none'}`,
    `- mostNoChangeAction: ${result.mostNoChangeAction ? `${result.mostNoChangeAction.action} (${result.mostNoChangeAction.count})` : 'none'}`,
    `- mostWorthContinuingAction: ${result.mostWorthContinuingAction ? `${result.mostWorthContinuingAction.action} (${result.mostWorthContinuingAction.count})` : 'none'}`,
    `- mostCompressibleAction: ${result.mostCompressibleAction ? `${result.mostCompressibleAction.action} (${result.mostCompressibleAction.count})` : 'none'}`,
    '',
    '## Top Remaining Primary Reasons',
    '',
    ...result.topRemainingPrimaryReasons.map(
      (entry) => `- ${entry.reason}: ${entry.count}`,
    ),
    '',
    '## Top Remaining Actions',
    '',
    ...result.topRemainingActions.map(
      (entry) => `- ${entry.action}: ${entry.count}`,
    ),
    '',
    '## Conflict Guidance',
    '',
    ...result.mostWorthContinuingConflictTypes.map(
      (entry) => `- keep_running.${entry.conflictType}: ${entry.count}`,
    ),
    ...result.mostCompressibleConflictTypes.map(
      (entry) => `- compressible.${entry.conflictType}: ${entry.count}`,
    ),
    '',
    '## Priority Drain Samples',
    '',
    ...result.pendingInventory.priorityDrainSamples.slice(0, 20).map(
      (sample) =>
        `- ${sample.fullName} | action=${sample.historicalRepairAction} | queue=${sample.queueStatus} | priority=${sample.drainPriorityClass} | waiting=${sample.waitingDurationBucket}`,
    ),
    '',
    '## Archive Candidate Samples',
    '',
    ...result.pendingInventory.archiveCandidateSamples.slice(0, 20).map(
      (sample) =>
        `- ${sample.fullName} | action=${sample.historicalRepairAction} | queue=${sample.queueStatus} | value=${sample.valueClass} | visibility=${sample.visibilityClass}`,
    ),
    '',
    '## Replay / Redundant Samples',
    '',
    ...result.pendingInventory.replayOrRedundantSamples.slice(0, 20).map(
      (sample) =>
        `- ${sample.fullName} | action=${sample.historicalRepairAction} | queue=${sample.queueStatus} | suppressible=${sample.suppressible} | replayOrRedundant=${sample.replayOrRedundant}`,
    ),
    '',
    '## Longest Waiting Samples',
    '',
    ...result.pendingInventory.longestWaitingSamples.slice(0, 20).map(
      (sample) =>
        `- ${sample.fullName} | action=${sample.historicalRepairAction} | queue=${sample.queueStatus} | waiting=${sample.waitingDurationHours ?? 'null'}h`,
    ),
    '',
    '## Pending Audit Samples',
    '',
    ...result.pendingAuditSamples.slice(0, 20).map(
      (sample) =>
        `- ${sample.fullName} | action=${sample.historicalRepairAction} | priority=${sample.drainPriorityClass} | suppressible=${sample.suppressible} | replayRisk=${sample.replayRisk} | redundant=${sample.redundant} | age=${sample.waitingDurationBucket}`,
    ),
    '',
    '## Completed Useful Samples',
    '',
    ...result.completedUsefulSamples.slice(0, 20).map(
      (member) =>
        `- ${member.fullName} | action=${member.historicalRepairAction} | completionReason=${member.analysisCompletionReason.join(', ') || 'none'}`,
    ),
    '',
    '## Completed Archived Samples',
    '',
    ...result.completedArchivedSamples.slice(0, 20).map(
      (member) =>
        `- ${member.fullName} | action=${member.historicalRepairAction} | completionReason=${member.analysisCompletionReason.join(', ') || 'none'}`,
    ),
    '',
    '## Completed Deleted Samples',
    '',
    ...result.completedDeletedSamples.slice(0, 20).map(
      (item) =>
        `- ${item.fullName} | deleteReason=${item.deleteReason.join(', ') || 'none'} | deletedAt=${item.deletedAt}`,
    ),
    '',
    '## Remaining Samples',
    '',
    ...result.remainingSamples.slice(0, 20).map(
      (member) =>
        `- ${member.fullName} | action=${member.historicalRepairAction} | primaryReason=${member.analysisCompletionPrimaryReason} | pending=${member.pendingJobs} | running=${member.runningJobs}`,
    ),
    '',
    '## Command',
    '',
    '- command: pnpm --filter api run:pending-queue-drain-finish-pass',
  ];

  return lines.join('\n');
}

function uniqueDeleteReasons(
  reasons: Array<FrozenAnalysisDeleteReason | null>,
): FrozenAnalysisDeleteReason[] {
  return [...new Set(reasons.filter(Boolean))] as FrozenAnalysisDeleteReason[];
}

function uniqueCompletionReasons(
  reasons: Array<FrozenAnalysisCompletionReason | null>,
): FrozenAnalysisCompletionReason[] {
  const filtered = [...new Set(reasons.filter(Boolean))] as FrozenAnalysisCompletionReason[];
  return filtered.length
    ? filtered
    : ['missing_structured_analysis'];
}

function createEmptyCompletionReasonBreakdown(): Record<
  FrozenAnalysisCompletionReason,
  number
> {
  return {
    useful_analysis_closed: 0,
    useful_retained_value: 0,
    archive_policy_no_keep_value: 0,
    archive_delete_candidate_ready: 0,
    deleted_by_policy: 0,
    decision_recalc_suppressed_from_remaining: 0,
    missing_structured_analysis: 0,
    repair_action_remaining: 0,
    pending_queue_jobs: 0,
    running_queue_jobs: 0,
    quality_below_completion_threshold: 0,
    trusted_gaps_remaining: 0,
    archive_terminal_ready: 0,
    delete_policy_not_met: 0,
    terminal_condition_blocked_by_strict_legacy_gate: 0,
  };
}

function hasUsefulStructuredSignal(item: HistoricalRepairPriorityItem) {
  return Boolean(
    item.hasSnapshot &&
      (item.hasInsight || item.hasFinalDecision || item.hasDeep),
  );
}

function hasArchiveStructuredSignal(item: HistoricalRepairPriorityItem) {
  return Boolean(
    item.hasSnapshot ||
      item.hasInsight ||
      item.hasFinalDecision ||
      item.hasDeep ||
      item.keyEvidenceGaps.length > 0 ||
      item.trustedBlockingGaps.length > 0 ||
      item.analysisQualityScore > 0,
  );
}

function hasDeleteStructuredSignal(item: HistoricalRepairPriorityItem) {
  return Boolean(
    item.hasDeep ||
      (item.hasSnapshot && item.hasInsight) ||
      (item.hasSnapshot && item.hasFinalDecision) ||
      (item.hasInsight && item.keyEvidenceGaps.length >= 4),
  );
}

function evaluateFrozenAnalysisCompletionLegacy(args: {
  member: FrozenAnalysisPoolMember;
}) {
  const member = args.member;
  const analyzedEnough = Boolean(
    member.hasSnapshot && member.hasInsight && member.hasFinalDecision,
  );
  const repairRemaining = Boolean(
    member.historicalRepairAction === 'deep_repair' ||
      member.historicalRepairAction === 'evidence_repair' ||
      member.historicalRepairAction === 'decision_recalc' ||
      member.historicalRepairAction === 'refresh_only',
  );
  const lowQuality = Boolean(
    member.analysisQualityState === 'LOW' ||
      member.analysisQualityState === 'CRITICAL',
  );
  const usefulCompleted = Boolean(
    analyzedEnough &&
      member.pendingJobs === 0 &&
      member.runningJobs === 0 &&
      member.cleanupState === 'active' &&
      !repairRemaining &&
      member.trustedBlockingGaps.length === 0 &&
      !lowQuality,
  );
  const archiveCompleted = Boolean(
    analyzedEnough &&
      member.pendingJobs === 0 &&
      member.runningJobs === 0 &&
      member.cleanupState !== 'active' &&
      !repairRemaining,
  );

  return {
    analysisCompletionState: usefulCompleted
      ? 'completed_useful'
      : archiveCompleted
        ? 'completed_not_useful_archived'
        : 'still_incomplete',
  };
}

function buildFrozenAnalysisPoolDrainCandidates(
  members: FrozenAnalysisPoolMember[],
) {
  const actionable = members.filter(
    (member) =>
      member.analysisCompletionState === 'still_incomplete' &&
      member.cleanupState === 'active' &&
      member.pendingJobs === 0 &&
      member.runningJobs === 0,
  );
  const sorted = [...actionable].sort(compareFrozenAnalysisPoolMemberPriority);

  return {
    modelARepositoryIds: sorted
      .filter((member) => member.assignedModelLane === 'modelA')
      .slice(0, DEFAULT_MODEL_A_DRAIN_LIMIT)
      .map((member) => member.repositoryId),
    modelBRepositoryIds: sorted
      .filter((member) => member.assignedModelLane === 'modelB')
      .slice(0, DEFAULT_MODEL_B_DRAIN_LIMIT)
      .map((member) => member.repositoryId),
    deleteCandidateRepositoryIds: members
      .filter((member) => member.deleteCandidate && member.runningJobs === 0)
      .slice(0, DEFAULT_DELETE_DRAIN_LIMIT)
      .map((member) => member.repositoryId),
  };
}

function readFrozenAnalysisPoolDrainCandidates(value: unknown) {
  const payload = readObject(value);
  if (!payload) {
    return {
      modelARepositoryIds: [],
      modelBRepositoryIds: [],
      deleteCandidateRepositoryIds: [],
    };
  }

  return {
    modelARepositoryIds: normalizeStringArray(payload.modelARepositoryIds),
    modelBRepositoryIds: normalizeStringArray(payload.modelBRepositoryIds),
    deleteCandidateRepositoryIds: normalizeStringArray(
      payload.deleteCandidateRepositoryIds,
    ),
  };
}

function compareFrozenAnalysisPoolMemberPriority(
  left: FrozenAnalysisPoolMember,
  right: FrozenAnalysisPoolMember,
) {
  return scoreFrozenAnalysisPoolMember(right) - scoreFrozenAnalysisPoolMember(left);
}

export function scoreFrozenAnalysisPoolMember(member: FrozenAnalysisPoolMember) {
  const bucketScore =
    member.historicalRepairBucket === 'visible_broken'
      ? 400
      : member.historicalRepairBucket === 'high_value_weak'
        ? 300
        : member.historicalRepairBucket === 'stale_watch'
          ? 200
          : 0;
  const valueScore =
    member.repositoryValueTier === 'HIGH'
      ? 120
      : member.repositoryValueTier === 'MEDIUM'
        ? 70
        : 10;
  const visibilityScore =
    member.strictVisibilityLevel === 'HOME'
      ? 100
      : member.strictVisibilityLevel === 'FAVORITES'
        ? 80
        : member.strictVisibilityLevel === 'DAILY_SUMMARY'
          ? 70
          : member.strictVisibilityLevel === 'DETAIL_ONLY'
            ? 20
            : 0;
  const moneyScore =
    member.moneyPriority === 'P0'
      ? 90
      : member.moneyPriority === 'P1'
        ? 70
        : member.moneyPriority === 'P2'
          ? 40
          : 0;
  const qualityScore =
    member.analysisQualityState === 'CRITICAL'
      ? 40
      : member.analysisQualityState === 'LOW'
        ? 20
        : 0;
  const noDeepBonus = member.hasDeep ? 0 : 30;

  return (
    bucketScore +
    valueScore +
    visibilityScore +
    moneyScore +
    qualityScore +
    noDeepBonus
  );
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))];
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];
}

function readObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || null;
}
