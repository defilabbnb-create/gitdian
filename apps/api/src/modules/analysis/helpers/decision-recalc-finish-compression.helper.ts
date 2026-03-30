import {
  type FrozenAnalysisCompletionReason,
  type FrozenAnalysisCompletionOverride,
  type FrozenAnalysisPoolMember,
} from './frozen-analysis-pool.types';
import type {
  DecisionRecalcCompressionClass,
  DecisionRecalcCompressionConflictType,
  DecisionRecalcCompressionItem,
  DecisionRecalcCompressionQueueStatus,
  DecisionRecalcCompressionReason,
  DecisionRecalcCompressionWaitingDurationBucket,
  DecisionRecalcFinishCompressionResult,
} from './decision-recalc-finish-compression.types';
import type { DecisionRecalcGateDecision } from './decision-recalc-gate.types';

export const DECISION_RECALC_COMPRESSION_CONFLICT_TYPES: DecisionRecalcCompressionConflictType[] =
  [
    'user_conflict',
    'monetization_conflict',
    'execution_conflict',
    'market_conflict',
    'problem_conflict',
  ];

type CompressionClassificationArgs = {
  member: FrozenAnalysisPoolMember;
  gateDecision: DecisionRecalcGateDecision | 'missing_gate_snapshot';
  gateReason: string | null;
  queueStatus: DecisionRecalcCompressionQueueStatus;
  waitingDurationHours: number | null;
  waitingDurationBucket: DecisionRecalcCompressionWaitingDurationBucket;
  redundantPendingJobCount?: number;
  stalePendingJobCount?: number;
};

export function buildDecisionRecalcCompressionItem(
  args: CompressionClassificationArgs,
): DecisionRecalcCompressionItem {
  const conflictTypes = deriveDecisionRecalcConflictTypes(args.member);
  const lowValue = isLowValueMember(args.member);
  const lowVisibility = isLowVisibilityMember(args.member);
  const lowQuality = isLowQualityMember(args.member);
  const archiveBucket =
    args.member.historicalRepairBucket === 'archive_or_noise';
  const inactiveCleanup = args.member.cleanupState !== 'active';
  const highPriorityConflict = conflictTypes.some((type) =>
    type === 'user_conflict' ||
    type === 'monetization_conflict' ||
    type === 'execution_conflict',
  );
  const highReach =
    args.member.strictVisibilityLevel === 'HOME' ||
    args.member.strictVisibilityLevel === 'FAVORITES' ||
    args.member.strictVisibilityLevel === 'DAILY_SUMMARY';
  const highValue =
    args.member.repositoryValueTier === 'HIGH' ||
    args.member.repositoryValueTier === 'MEDIUM' ||
    args.member.moneyPriority === 'P0' ||
    args.member.moneyPriority === 'P1' ||
    args.member.moneyPriority === 'P2';
  const lowRoi = Boolean(
    archiveBucket ||
      (lowValue && (lowVisibility || lowQuality)) ||
      (lowValue &&
        !highReach &&
        !highPriorityConflict &&
        args.member.trustedBlockingGaps.length > 0),
  );
  const worthRunning = Boolean(
    args.queueStatus === 'in_flight' ||
      (!inactiveCleanup &&
        !archiveBucket &&
        (args.gateDecision === 'allow_recalc' ||
          (args.gateDecision === 'allow_recalc_but_expect_no_change' &&
            (highValue || highReach || highPriorityConflict))) &&
        (highValue ||
          highReach ||
          highPriorityConflict ||
          args.member.trustedBlockingGaps.length > 0)),
  );
  const redundantPendingJobCount = Math.max(
    0,
    args.redundantPendingJobCount ?? 0,
  );
  const stalePendingJobCount = Math.max(0, args.stalePendingJobCount ?? 0);
  const canDeleteNow = Boolean(
    args.member.deleteCandidate && args.member.runningJobs === 0,
  );
  const archivable = Boolean(
    inactiveCleanup ||
      archiveBucket ||
      lowRoi ||
      (args.gateDecision === 'suppress_replay' &&
        (lowValue || lowVisibility || lowQuality)),
  );

  const reasons: DecisionRecalcCompressionReason[] = [];
  let compressionClass: DecisionRecalcCompressionClass = 'keep_running';

  if (args.queueStatus === 'in_flight') {
    compressionClass = 'keep_running';
    reasons.push('queue_in_flight_keep_running');
  } else if (
    canDeleteNow &&
    (inactiveCleanup ||
      args.gateDecision === 'suppress_cleanup' ||
      args.gateDecision === 'suppress_replay' ||
      lowRoi)
  ) {
    compressionClass = 'promote_deleted';
    reasons.push('delete_candidate_ready');
  } else if (inactiveCleanup || args.gateDecision === 'suppress_cleanup') {
    compressionClass = 'promote_archived';
    reasons.push('recalc_cleanup_suppressed');
  } else if (
    redundantPendingJobCount > 0 &&
    args.queueStatus === 'pending' &&
    !worthRunning
  ) {
    compressionClass = 'suppress_from_remaining';
    reasons.push('recalc_duplicate_pending_suppressed');
  } else if (
    stalePendingJobCount > 0 &&
    args.queueStatus === 'pending' &&
    !worthRunning
  ) {
    compressionClass = archivable
      ? 'promote_archived'
      : 'suppress_from_remaining';
    reasons.push('recalc_stale_pending_suppressed');
  } else if (args.gateDecision === 'suppress_replay') {
    compressionClass = archivable
      ? 'promote_archived'
      : 'suppress_from_remaining';
    reasons.push('recalc_replay_suppressed');
  } else if (
    args.gateDecision === 'allow_recalc_but_expect_no_change' &&
    archivable
  ) {
    compressionClass = 'promote_archived';
    reasons.push('recalc_gate_allow_but_low_roi_archived');
  } else if (!worthRunning) {
    compressionClass = archivable
      ? 'promote_archived'
      : 'suppress_from_remaining';
    reasons.push(
      archivable ? 'low_roi_terminal_archived' : 'active_roi_too_low_suppressed',
    );
  } else if (args.gateDecision === 'allow_recalc_but_expect_no_change') {
    compressionClass = 'keep_running';
    reasons.push('recalc_gate_allow_but_expect_no_change_keep_running');
  } else {
    compressionClass = 'keep_running';
    reasons.push('recalc_gate_allow_keep_running');
  }

  if (compressionClass === 'promote_archived' && !reasons.includes('low_roi_terminal_archived')) {
    if (archivable || lowRoi) {
      reasons.push('low_roi_terminal_archived');
    }
  }

  return {
    repositoryId: args.member.repositoryId,
    fullName: args.member.fullName,
    historicalRepairBucket: args.member.historicalRepairBucket,
    historicalRepairAction: args.member.historicalRepairAction,
    repositoryValueTier: args.member.repositoryValueTier,
    moneyPriority: args.member.moneyPriority,
    strictVisibilityLevel: args.member.strictVisibilityLevel,
    cleanupState: args.member.cleanupState,
    analysisQualityState: args.member.analysisQualityState,
    analysisQualityScore: args.member.analysisQualityScore,
    trustedBlockingGapCount: args.member.trustedBlockingGaps.length,
    hasTrustedBlockingGaps: args.member.trustedBlockingGaps.length > 0,
    gateDecision: args.gateDecision,
    gateReason: args.gateReason,
    queueStatus: args.queueStatus,
    queueState: {
      pendingJobs: args.member.pendingJobs,
      runningJobs: args.member.runningJobs,
      pendingJobIds: [],
      runningJobIds: [],
    },
    waitingDurationHours: args.waitingDurationHours,
    waitingDurationBucket: args.waitingDurationBucket,
    hasPendingJobs: args.member.pendingJobs > 0,
    hasRunningJobs: args.member.runningJobs > 0,
    redundantPendingJobCount,
    stalePendingJobCount,
    deleteCandidate: args.member.deleteCandidate,
    deleteReason: args.member.deleteReason,
    conflictTypes,
    compressionClass,
    compressionReasons: uniqueReasons(reasons),
    worthRunning,
    archivable,
    suppressible: compressionClass !== 'keep_running',
    canDeleteNow,
  };
}

export function buildDecisionRecalcCompletionOverride(args: {
  member: Pick<
    FrozenAnalysisPoolMember,
    'historicalRepairBucket' | 'analysisQualityState'
  >;
  compressionClass: DecisionRecalcCompressionClass;
  batchId: string;
  generatedAt: string;
}): FrozenAnalysisCompletionOverride | null {
  if (args.compressionClass === 'promote_archived') {
    const reasons = uniqueCompletionReasons([
      'archive_policy_no_keep_value',
      args.member.historicalRepairBucket === 'archive_or_noise'
        ? 'archive_terminal_ready'
        : null,
      isLowQualityMember(args.member)
        ? 'quality_below_completion_threshold'
        : null,
    ]);
    return {
      analysisCompletionState: 'completed_not_useful_archived',
      analysisCompletionReason: reasons,
      analysisCompletionPrimaryReason: reasons[0],
      analysisCompletedAt: args.generatedAt,
      analysisCompletedByModel: 'system_policy',
      completedFromFrozenPoolBatchId: args.batchId,
    };
  }

  if (args.compressionClass === 'suppress_from_remaining') {
    return {
      analysisCompletionState: 'suppressed_from_remaining',
      analysisCompletionReason: ['decision_recalc_suppressed_from_remaining'],
      analysisCompletionPrimaryReason: 'decision_recalc_suppressed_from_remaining',
      analysisCompletedAt: args.generatedAt,
      analysisCompletedByModel: 'system_policy',
      completedFromFrozenPoolBatchId: args.batchId,
    };
  }

  return null;
}

export function deriveDecisionRecalcConflictTypes(
  member: Pick<FrozenAnalysisPoolMember, 'keyEvidenceGaps'>,
) {
  return DECISION_RECALC_COMPRESSION_CONFLICT_TYPES.filter((conflictType) =>
    member.keyEvidenceGaps.includes(conflictType),
  );
}

export function resolveDecisionRecalcQueueStatus(
  member: Pick<FrozenAnalysisPoolMember, 'pendingJobs' | 'runningJobs'>,
): DecisionRecalcCompressionQueueStatus {
  if (member.runningJobs > 0) {
    return 'in_flight';
  }
  if (member.pendingJobs > 0) {
    return 'pending';
  }
  return 'no_queue';
}

export function resolveDecisionRecalcWaitingDurationBucket(
  waitingDurationHours: number | null,
): DecisionRecalcCompressionWaitingDurationBucket {
  if (waitingDurationHours === null || !Number.isFinite(waitingDurationHours)) {
    return 'no_queue';
  }
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

export function renderDecisionRecalcFinishCompressionMarkdown(
  result: DecisionRecalcFinishCompressionResult,
) {
  const lines = [
    '# Decision Recalc Finish Compression',
    '',
    `- generatedAt: ${result.generatedAt}`,
    `- analysisPoolFrozen: ${result.freezeState.analysisPoolFrozen}`,
    `- analysisPoolFreezeReason: ${result.freezeState.analysisPoolFreezeReason}`,
    `- frozenAnalysisPoolBatchId: ${result.frozenAnalysisPoolBatchId}`,
    '',
    '## Before / After',
    '',
    `- decision_recalc remaining before: ${result.decisionRecalcRemainingBefore}`,
    `- decision_recalc remaining after: ${result.decisionRecalcRemainingAfter}`,
    `- frozen pool remaining before: ${result.frozenPoolRemainingBefore}`,
    `- frozen pool remaining after: ${result.frozenPoolRemainingAfter}`,
    `- decision_recalc remaining share after: ${result.decisionRecalcRemainingShareAfter}`,
    '',
    '## Compression Outcome',
    '',
    `- decisionRecalcCompressedCount: ${result.decisionRecalcCompressedCount}`,
    `- decisionRecalcKeptRunningCount: ${result.decisionRecalcKeptRunningCount}`,
    `- decisionRecalcPromotedArchivedCount: ${result.decisionRecalcPromotedArchivedCount}`,
    `- decisionRecalcPromotedDeletedCount: ${result.decisionRecalcPromotedDeletedCount}`,
    `- decisionRecalcSuppressedFromRemainingCount: ${result.decisionRecalcSuppressedFromRemainingCount}`,
    `- decisionRecalcRemovedFromPendingCount: ${result.decisionRecalcRemovedFromPendingCount}`,
    `- decisionRecalcRemovedFromRepairRemainingCount: ${result.decisionRecalcRemovedFromRepairRemainingCount}`,
    `- queueCancelledJobCount: ${result.queueCancelledJobCount}`,
    '',
    '## Inventory',
    '',
    `- decisionRecalcRemainingCount: ${result.decisionRecalcRemainingCount}`,
    `- decisionRecalcSuppressibleCount: ${result.decisionRecalcSuppressibleCount}`,
    `- decisionRecalcArchivableCount: ${result.decisionRecalcArchivableCount}`,
    `- decisionRecalcStillWorthRunningCount: ${result.decisionRecalcStillWorthRunningCount}`,
    '',
    '## Conflict Guidance',
    '',
    ...result.mostWorthContinuingConflictTypes.map(
      (item) => `- keep_running.${item.conflictType}: ${item.count}`,
    ),
    ...result.mostCompressibleConflictTypes.map(
      (item) => `- compressible.${item.conflictType}: ${item.count}`,
    ),
    '',
    '## Remaining After',
    '',
    `- hardestActionAfter: ${result.hardestActionAfter ? `${result.hardestActionAfter.action} (${result.hardestActionAfter.count})` : 'none'}`,
    ...result.topRemainingPrimaryReasonsAfter.map(
      (entry) => `- primaryReason.${entry.reason}: ${entry.count}`,
    ),
    ...result.topRemainingActionsAfter.map(
      (entry) => `- remainingAction.${entry.action}: ${entry.count}`,
    ),
    '',
    '## Keep Running Samples',
    '',
    ...result.keptRunningSamples.slice(0, 20).map(
      (item) =>
        `- ${item.fullName} | gate=${item.gateDecision} | queue=${item.queueStatus} | conflicts=${item.conflictTypes.join(', ') || 'none'}`,
    ),
    '',
    '## Promote Archived Samples',
    '',
    ...result.promotedArchivedSamples.slice(0, 20).map(
      (item) =>
        `- ${item.fullName} | gate=${item.gateDecision} | queue=${item.queueStatus} | reasons=${item.compressionReasons.join(', ')}`,
    ),
    '',
    '## Promote Deleted Samples',
    '',
    ...result.promotedDeletedSamples.slice(0, 20).map(
      (item) =>
        `- ${item.fullName} | queue=${item.queueStatus} | deleteReason=${item.deleteReason.join(', ') || 'none'}`,
    ),
    '',
    '## Suppressed From Remaining Samples',
    '',
    ...result.suppressedFromRemainingSamples.slice(0, 20).map(
      (item) =>
        `- ${item.fullName} | gate=${item.gateDecision} | queue=${item.queueStatus} | reasons=${item.compressionReasons.join(', ')}`,
    ),
    '',
    '## Command',
    '',
    '- command: pnpm --filter api run:decision-recalc-finish-compression',
  ];

  return lines.join('\n');
}

function isLowValueMember(
  member: Pick<FrozenAnalysisPoolMember, 'repositoryValueTier' | 'moneyPriority'>,
) {
  return Boolean(
    member.repositoryValueTier === 'LOW' &&
      (member.moneyPriority === null || member.moneyPriority === 'P3'),
  );
}

function isLowVisibilityMember(
  member: Pick<FrozenAnalysisPoolMember, 'strictVisibilityLevel'>,
) {
  return Boolean(
    member.strictVisibilityLevel === 'DETAIL_ONLY' ||
      member.strictVisibilityLevel === 'BACKGROUND',
  );
}

function isLowQualityMember(
  member: Pick<FrozenAnalysisPoolMember, 'analysisQualityState'>,
) {
  return Boolean(
    member.analysisQualityState === 'LOW' ||
      member.analysisQualityState === 'CRITICAL',
  );
}

function uniqueReasons(
  reasons: DecisionRecalcCompressionReason[],
): DecisionRecalcCompressionReason[] {
  return [...new Set(reasons)];
}

function uniqueCompletionReasons(
  reasons: Array<
    FrozenAnalysisCompletionOverride['analysisCompletionReason'][number] | null
  >,
) : FrozenAnalysisCompletionReason[] {
  const normalized = [
    ...new Set(reasons.filter(Boolean)),
  ] as FrozenAnalysisCompletionReason[];
  return normalized.length ? normalized : ['archive_policy_no_keep_value'];
}
