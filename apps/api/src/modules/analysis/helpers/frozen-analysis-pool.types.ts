import type {
  HistoricalCleanupState,
  HistoricalCleanupReason,
} from './historical-cleanup-policy.helper';
import type {
  HistoricalFrontendDecisionState,
  HistoricalRepairPriorityItem,
} from './historical-repair-priority.helper';

export const ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY =
  'analysis.pool.freeze.state';
export const FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY =
  'analysis.pool.frozen_batch.latest';
export const FROZEN_ANALYSIS_POOL_DRAIN_CONFIG_KEY =
  'analysis.pool.drain.latest';
export const FROZEN_ANALYSIS_POOL_COMPLETION_CONFIG_KEY =
  'analysis.pool.completion.latest';
export const FROZEN_ANALYSIS_POOL_DRAIN_FINISH_CONFIG_KEY =
  'analysis.pool.drain_finish.latest';
export const FROZEN_ANALYSIS_POOL_DECISION_RECALC_COMPRESSION_CONFIG_KEY =
  'analysis.pool.decision_recalc_finish_compression.latest';

export type AnalysisPoolFreezeScope = '365_only' | 'all_new_entries';

export type AnalysisPoolIntakeSource =
  | 'github_fetch'
  | 'github_created_backfill'
  | 'repository_create'
  | 'analysis_single'
  | 'analysis_snapshot'
  | 'analysis_batch'
  | 'fast_filter_batch';

export type AnalysisPoolIntakeGateDecision =
  | 'allow_unfrozen'
  | 'allow_existing_member'
  | 'suppress_new_entry'
  | 'suppress_unscoped_batch';

export type FrozenAnalysisPoolModelLane = 'modelA' | 'modelB' | 'none';
export type FrozenAnalysisPoolDrainPriorityClass = 'P0' | 'P1' | 'P2';
export type FrozenAnalysisPoolPendingAgeBucket =
  | 'lt_1h'
  | 'h1_6'
  | 'h6_24'
  | 'd1_3'
  | 'gt_3d';
export type FrozenAnalysisPoolPendingDrainPath =
  | 'executed_and_still_incomplete'
  | 'executed_and_completed_useful'
  | 'executed_and_completed_not_useful_archived'
  | 'executed_and_completed_not_useful_deleted'
  | 'suppressed_from_pending'
  | 'cancelled_as_redundant';

export type FrozenAnalysisCompletionState =
  | 'completed_useful'
  | 'completed_not_useful_deleted'
  | 'completed_not_useful_archived'
  | 'suppressed_from_remaining'
  | 'still_incomplete';

export type FrozenAnalysisCompletionReason =
  | 'useful_analysis_closed'
  | 'useful_retained_value'
  | 'archive_policy_no_keep_value'
  | 'archive_delete_candidate_ready'
  | 'deleted_by_policy'
  | 'decision_recalc_suppressed_from_remaining'
  | 'missing_structured_analysis'
  | 'repair_action_remaining'
  | 'pending_queue_jobs'
  | 'running_queue_jobs'
  | 'quality_below_completion_threshold'
  | 'trusted_gaps_remaining'
  | 'archive_terminal_ready'
  | 'delete_policy_not_met'
  | 'terminal_condition_blocked_by_strict_legacy_gate';

export type FrozenAnalysisDeleteReason =
  | 'low_value'
  | 'low_visibility'
  | 'low_quality'
  | 'long_tail_noise'
  | 'archive_bucket'
  | 'trusted_ineligible'
  | 'no_repair_roi'
  | 'no_user_reach'
  | 'analysis_complete_no_keep_value';

export type AnalysisPoolFreezeState = {
  analysisPoolFrozen: boolean;
  analysisPoolFreezeReason: string;
  analysisPoolFrozenAt: string | null;
  analysisPoolFrozenScope: AnalysisPoolFreezeScope;
  frozenAnalysisPoolBatchId: string | null;
  frozenAnalysisPoolSnapshotAt: string | null;
};

export type FrozenAnalysisPoolQueueState = {
  pendingJobs: number;
  runningJobs: number;
  pendingJobIds: string[];
  runningJobIds: string[];
};

export type FrozenAnalysisDeleteAssessment = {
  deleteCandidate: boolean;
  deleteReason: FrozenAnalysisDeleteReason[];
  deleteApprovedByPolicy: boolean;
};

export type FrozenAnalysisCompletionOverride = {
  analysisCompletionState: FrozenAnalysisCompletionState;
  analysisCompletionReason: FrozenAnalysisCompletionReason[];
  analysisCompletionPrimaryReason: FrozenAnalysisCompletionReason;
  analysisCompletedAt: string | null;
  analysisCompletedByModel: string | null;
  completedFromFrozenPoolBatchId: string | null;
};

export type FrozenAnalysisPoolMember = {
  repositoryId: string;
  fullName: string;
  frozenAnalysisPoolBatchId: string;
  frozenAnalysisPoolMember: true;
  frozenAnalysisPoolSnapshotAt: string;
  historicalRepairBucket: HistoricalRepairPriorityItem['historicalRepairBucket'];
  historicalRepairPriorityScore: number;
  historicalRepairAction: HistoricalRepairPriorityItem['historicalRepairAction'];
  cleanupState: HistoricalCleanupState;
  cleanupReason: HistoricalCleanupReason[];
  frontendDecisionState: HistoricalFrontendDecisionState;
  strictVisibilityLevel: HistoricalRepairPriorityItem['strictVisibilityLevel'];
  repositoryValueTier: HistoricalRepairPriorityItem['repositoryValueTier'];
  moneyPriority: HistoricalRepairPriorityItem['moneyPriority'];
  analysisQualityScore: number;
  analysisQualityState: HistoricalRepairPriorityItem['analysisQualityState'];
  hasSnapshot: boolean;
  hasInsight: boolean;
  hasFinalDecision: boolean;
  hasDeep: boolean;
  pendingJobs: number;
  runningJobs: number;
  analysisCompletionState: FrozenAnalysisCompletionState;
  analysisCompletionReason: FrozenAnalysisCompletionReason[];
  analysisCompletionPrimaryReason: FrozenAnalysisCompletionReason;
  analysisCompletedAt: string | null;
  analysisCompletedByModel: string | null;
  completedFromFrozenPoolBatchId: string | null;
  deleteCandidate: boolean;
  deleteReason: FrozenAnalysisDeleteReason[];
  deleteApprovedByPolicy: boolean;
  deletedAt: string | null;
  deletedByPolicy: boolean;
  deletedFromFrozenPoolBatchId: string | null;
  assignedModelLane: FrozenAnalysisPoolModelLane;
  assignedModelName: string | null;
  keyEvidenceGaps: string[];
  trustedBlockingGaps: string[];
  seedReasonSummary: string;
};

export type FrozenAnalysisPoolSummary = {
  totalPoolSize: number;
  byBucket: Record<string, number>;
  byQualityState: Record<string, number>;
  byRepairAction: Record<string, number>;
  byCleanupState: Record<HistoricalCleanupState, number>;
  byVisibilityLevel: Record<string, number>;
  byValueTier: Record<string, number>;
  byMoneyPriority: Record<'P0' | 'P1' | 'P2' | 'P3' | 'NONE', number>;
  byHasDeep: {
    hasDeep: number;
    noDeep: number;
  };
  byCompletionState: Record<FrozenAnalysisCompletionState, number>;
  byQueueState: {
    pending: number;
    running: number;
    completed: number;
    remaining: number;
  };
  deleteCandidateCount: number;
  deleteReasonBreakdown: Record<FrozenAnalysisDeleteReason, number>;
  remainingReasonBreakdown: Record<FrozenAnalysisCompletionReason, number>;
  remainingPrimaryReasonBreakdown: Record<FrozenAnalysisCompletionReason, number>;
  remainingActionBreakdown: Record<string, number>;
};

export type FrozenAnalysisPoolBatchSnapshot = {
  generatedAt: string;
  frozenAnalysisPoolBatchId: string;
  frozenAnalysisPoolSnapshotAt: string;
  analysisPoolFrozenScope: AnalysisPoolFreezeScope;
  analysisPoolFreezeReason: string;
  repositoryIds: string[];
  drainCandidates: {
    modelARepositoryIds: string[];
    modelBRepositoryIds: string[];
    deleteCandidateRepositoryIds: string[];
  };
  summary: FrozenAnalysisPoolSummary;
  topMembers: FrozenAnalysisPoolMember[];
};

export type AnalysisPoolIntakeGateResult = {
  analysisPoolFrozen: boolean;
  decision: AnalysisPoolIntakeGateDecision;
  reason: string;
  blockedRepositoryIds: string[];
};

export type FrozenAnalysisPoolReport = {
  generatedAt: string;
  freezeState: AnalysisPoolFreezeState;
  modelAssignment: {
    modelA: {
      model: string | null;
      responsibilities: string[];
    };
    modelB: {
      model: string | null;
      responsibilities: string[];
    };
  };
  snapshot: FrozenAnalysisPoolBatchSnapshot;
  topMembers: FrozenAnalysisPoolMember[];
};

export type FrozenAnalysisPoolDrainResult = {
  generatedAt: string;
  freezeState: AnalysisPoolFreezeState;
  frozenAnalysisPoolBatchId: string;
  modelAssignment: FrozenAnalysisPoolReport['modelAssignment'];
  intakeQueueSuppressedCount: number;
  removedFromActivePoolCount: number;
  deletedFromRepositoryStoreCount: number;
  deleteSuppressedQueueCount: number;
  totalExecuted: number;
  modelAExecutedCount: number;
  modelBExecutedCount: number;
  frozenPoolRemainingCount: number;
  frozenPoolCompletedCount: number;
  frozenPoolNoUseDeletedCount: number;
  frozenPoolStillPendingCount: number;
  frozenPoolSnapshot: FrozenAnalysisPoolBatchSnapshot;
  queueSummary: {
    totalQueued: number;
    actionCounts: Record<string, number>;
  };
  executionSummary: {
    completed: number;
    remaining: number;
    deleted: number;
    pending: number;
  };
  deletedItems: Array<{
    repositoryId: string;
    fullName: string;
    deleteReason: FrozenAnalysisDeleteReason[];
  }>;
  pendingPreview: FrozenAnalysisPoolMember[];
  remainingPreview: FrozenAnalysisPoolMember[];
};

export type FrozenAnalysisPoolDeletedItem = {
  repositoryId: string;
  fullName: string;
  analysisCompletionState: 'completed_not_useful_deleted';
  analysisCompletionReason: FrozenAnalysisCompletionReason[];
  analysisCompletedAt: string;
  analysisCompletedByModel: string;
  completedFromFrozenPoolBatchId: string;
  deleteReason: FrozenAnalysisDeleteReason[];
  deleteApprovedByPolicy: true;
  deletedAt: string;
  deletedByPolicy: true;
  deletedFromFrozenPoolBatchId: string;
};

export type FrozenAnalysisPoolRetainedDeleteCandidate = {
  repositoryId: string;
  fullName: string;
  deleteReason: FrozenAnalysisDeleteReason[];
  pendingJobs: number;
  runningJobs: number;
  retainedReason: 'running_jobs_present' | 'pending_jobs_present';
};

export type FrozenAnalysisPoolCompletionPassResult = {
  generatedAt: string;
  freezeState: AnalysisPoolFreezeState;
  frozenAnalysisPoolBatchId: string;
  frozenAnalysisPoolSnapshotAt: string | null;
  startingBatchPoolSize: number;
  currentFrozenPoolSize: number;
  frozenPoolReducedCount: number;
  frozenPoolCompletedUsefulCount: number;
  frozenPoolCompletedDeletedCount: number;
  frozenPoolCompletedArchivedCount: number;
  frozenPoolStillIncompleteCount: number;
  frozenPoolRemainingCount: number;
  frozenPoolPendingCount: number;
  frozenPoolInFlightCount: number;
  deleteCandidateCount: number;
  deletedCount: number;
  removedFromActivePoolCount: number;
  removedFromFrozenRemainingCount: number;
  deleteSuppressedQueueCount: number;
  deleteReasonBreakdown: Record<FrozenAnalysisDeleteReason, number>;
  remainingReasonBreakdown: Record<FrozenAnalysisCompletionReason, number>;
  remainingPrimaryReasonBreakdown: Record<FrozenAnalysisCompletionReason, number>;
  remainingActionBreakdown: Record<string, number>;
  completionPromotionSummary: {
    promotedUsefulCount: number;
    promotedArchivedCount: number;
    promotedOutOfIncompleteCount: number;
    legacyStructuredGateBlockedCount: number;
    legacyTrustedGapGateBlockedCount: number;
    legacyQualityGateBlockedCount: number;
  };
  drainExecution: {
    generatedAt: string | null;
    totalExecuted: number;
    modelAExecutedCount: number;
    modelBExecutedCount: number;
    actionBreakdown: Record<string, number>;
  };
  deletedItems: FrozenAnalysisPoolDeletedItem[];
  retainedDeleteCandidates: FrozenAnalysisPoolRetainedDeleteCandidate[];
  topCompletedUseful: FrozenAnalysisPoolMember[];
  topArchived: FrozenAnalysisPoolMember[];
  topRemaining: FrozenAnalysisPoolMember[];
};

export type FrozenAnalysisPoolPendingAuditSample = {
  jobId: string;
  queueName: string | null;
  repositoryId: string;
  fullName: string;
  historicalRepairAction: HistoricalRepairPriorityItem['historicalRepairAction'];
  routerCapabilityTier: string | null;
  cleanupState: HistoricalCleanupState;
  historicalRepairBucket: HistoricalRepairPriorityItem['historicalRepairBucket'];
  repositoryValueTier: HistoricalRepairPriorityItem['repositoryValueTier'];
  moneyPriority: HistoricalRepairPriorityItem['moneyPriority'];
  frozenAnalysisPoolBatchId: string;
  modelLane: FrozenAnalysisPoolModelLane;
  waitingDurationHours: number;
  waitingDurationBucket: FrozenAnalysisPoolPendingAgeBucket;
  drainPriorityClass: FrozenAnalysisPoolDrainPriorityClass;
  replayRisk: boolean;
  suppressible: boolean;
  redundant: boolean;
  suppressionReason: string | null;
};

export type FrozenAnalysisPoolPendingQueueBreakdown = {
  totalPendingJobs: number;
  byHistoricalRepairAction: Record<string, number>;
  byRouterCapabilityTier: Record<string, number>;
  byCleanupState: Record<HistoricalCleanupState, number>;
  byHistoricalRepairBucket: Record<string, number>;
  byRepositoryValueTier: Record<string, number>;
  byMoneyPriority: Record<'P0' | 'P1' | 'P2' | 'P3' | 'NONE', number>;
  byFrozenAnalysisPoolBatchId: Record<string, number>;
  byAgeBucket: Record<FrozenAnalysisPoolPendingAgeBucket, number>;
  byModelLane: Record<FrozenAnalysisPoolModelLane, number>;
};

export type FrozenAnalysisPoolPendingQueueStatus =
  | 'pending'
  | 'in_flight'
  | 'no_queue';

export type FrozenAnalysisPoolPendingValueClass =
  | 'high_value'
  | 'medium_value'
  | 'low_value';

export type FrozenAnalysisPoolPendingVisibilityClass =
  | 'high_visibility'
  | 'low_visibility';

export type FrozenAnalysisPoolPendingWaitingBucket =
  | FrozenAnalysisPoolPendingAgeBucket
  | 'no_queue'
  | 'in_flight';

export type FrozenAnalysisPoolPendingInventorySample = {
  repositoryId: string;
  fullName: string;
  historicalRepairAction: HistoricalRepairPriorityItem['historicalRepairAction'];
  queueStatus: FrozenAnalysisPoolPendingQueueStatus;
  drainPriorityClass: FrozenAnalysisPoolDrainPriorityClass;
  repositoryValueTier: HistoricalRepairPriorityItem['repositoryValueTier'];
  valueClass: FrozenAnalysisPoolPendingValueClass;
  strictVisibilityLevel: HistoricalRepairPriorityItem['strictVisibilityLevel'];
  visibilityClass: FrozenAnalysisPoolPendingVisibilityClass;
  cleanupState: HistoricalCleanupState;
  historicalRepairBucket: HistoricalRepairPriorityItem['historicalRepairBucket'];
  analysisQualityState: HistoricalRepairPriorityItem['analysisQualityState'];
  moneyPriority: HistoricalRepairPriorityItem['moneyPriority'];
  waitingDurationHours: number | null;
  waitingDurationBucket: FrozenAnalysisPoolPendingWaitingBucket;
  conflictTypes: string[];
  hasTrustedBlockingGaps: boolean;
  worthRunning: boolean;
  archivable: boolean;
  suppressible: boolean;
  replayOrRedundant: boolean;
  priorityDrainCandidate: boolean;
};

export type FrozenAnalysisPoolPendingInventory = {
  totalCurrentRemainingCount: number;
  byAction: Record<string, number>;
  worthRunningByAction: Record<string, number>;
  compressibleByAction: Record<string, number>;
  byQueueStatus: Record<FrozenAnalysisPoolPendingQueueStatus, number>;
  byValueClass: Record<FrozenAnalysisPoolPendingValueClass, number>;
  byVisibilityClass: Record<FrozenAnalysisPoolPendingVisibilityClass, number>;
  byCleanupState: Record<HistoricalCleanupState, number>;
  byConflictType: Record<string, number>;
  byWaitingDuration: Record<FrozenAnalysisPoolPendingWaitingBucket, number>;
  worthRunningCount: number;
  lowRoiArchivableCount: number;
  replayOrRedundantCount: number;
  priorityDrainCount: number;
  worthRunningSamples: FrozenAnalysisPoolPendingInventorySample[];
  archiveCandidateSamples: FrozenAnalysisPoolPendingInventorySample[];
  replayOrRedundantSamples: FrozenAnalysisPoolPendingInventorySample[];
  priorityDrainSamples: FrozenAnalysisPoolPendingInventorySample[];
  longestWaitingSamples: FrozenAnalysisPoolPendingInventorySample[];
};

export type FrozenAnalysisPoolActionFinishSummary = {
  selectedCount: number;
  queuedCount: number;
  noChangeCount: number;
  suppressedCount: number;
  replayGateEnforced: boolean;
  hardenedAfterStateEnabled: boolean;
};

export type FrozenAnalysisPoolDrainFinishResult = {
  generatedAt: string;
  freezeState: AnalysisPoolFreezeState;
  frozenAnalysisPoolBatchId: string;
  pendingQueueBreakdown: FrozenAnalysisPoolPendingQueueBreakdown;
  pendingInventory: FrozenAnalysisPoolPendingInventory;
  pendingQueueHighPriorityCount: number;
  pendingQueueLowROIStaleCount: number;
  pendingQueueSuppressibleCount: number;
  pendingQueueReplayRiskCount: number;
  pendingQueueRedundantCount: number;
  pendingDrainedCount: number;
  pendingExecutedCount: number;
  pendingSuppressedCount: number;
  pendingCancelledRedundantCount: number;
  pendingPromotedToCompletedCount: number;
  pendingPromotedToArchivedCount: number;
  pendingPromotedToDeletedCount: number;
  pendingStillRemainingCount: number;
  decisionRecalcRemainingBefore: number;
  decisionRecalcRemainingAfter: number;
  decisionRecalcCompressedCount: number;
  decisionRecalcKeptRunningCount: number;
  decisionRecalcPromotedArchivedCount: number;
  decisionRecalcPromotedDeletedCount: number;
  decisionRecalcSuppressedFromRemainingCount: number;
  decisionRecalcRemovedFromPendingCount: number;
  decisionRecalcRemovedFromRepairRemainingCount: number;
  decisionRecalcStillWorthRunningCount: number;
  repairFinishBreakdown: Record<string, number>;
  decisionRecalcFinishSummary: FrozenAnalysisPoolActionFinishSummary;
  deepRepairFinishSummary: FrozenAnalysisPoolActionFinishSummary;
  evidenceRepairFinishSummary: FrozenAnalysisPoolActionFinishSummary;
  repairActionRemainingReducedCount: number;
  completedUsefulAddedCount: number;
  completedArchivedAddedCount: number;
  completedDeletedAddedCount: number;
  retainedDeleteCandidateCount: number;
  retainedDeleteReasonBreakdown: Record<string, number>;
  frozenPoolRemainingCount: number;
  frozenPoolCompletedUsefulCount: number;
  frozenPoolCompletedArchivedCount: number;
  frozenPoolCompletedDeletedCount: number;
  frozenPoolRemainingBefore: number;
  frozenPoolRemainingAfter: number;
  topRemainingPrimaryReasons: Array<{ reason: string; count: number }>;
  topRemainingActions: Array<{ action: string; count: number }>;
  hardestAction: { action: string; count: number } | null;
  mostNoChangeAction: { action: string; count: number } | null;
  mostWorthContinuingAction: { action: string; count: number } | null;
  mostCompressibleAction: { action: string; count: number } | null;
  mostWorthContinuingConflictTypes: Array<{ conflictType: string; count: number }>;
  mostCompressibleConflictTypes: Array<{ conflictType: string; count: number }>;
  pendingAuditSamples: FrozenAnalysisPoolPendingAuditSample[];
  completedUsefulSamples: FrozenAnalysisPoolMember[];
  completedArchivedSamples: FrozenAnalysisPoolMember[];
  completedDeletedSamples: FrozenAnalysisPoolDeletedItem[];
  remainingSamples: FrozenAnalysisPoolMember[];
  runSummary: {
    selectedCount: number;
    execution: {
      downgradeOnly: number;
      refreshOnly: number;
      evidenceRepair: number;
      deepRepair: number;
      decisionRecalc: number;
      archive: number;
    } | null;
    queueSummary: {
      totalQueued: number;
      actionCounts: Record<string, number>;
      routerCapabilityBreakdown: Record<string, number>;
      routerFallbackBreakdown: Record<string, number>;
      routerReviewRequiredCount: number;
      routerDeterministicOnlyCount: number;
      queuedWithRouterMetadataCount: number;
      queuedSamples: Array<{
        repoId: string | null;
        action: string | null;
        capabilityTier: string;
        fallbackPolicy: string;
        requiresReview: boolean;
        queueName: string | null;
      }>;
    } | null;
    analysisOutcomeSummary: {
      outcomeStatusBreakdown: Record<string, number>;
      repairValueClassBreakdown: Record<string, number>;
      actionOutcomeStatusBreakdown: Record<string, Record<string, number>>;
      actionRepairValueClassBreakdown: Record<string, Record<string, number>>;
      qualityDeltaSummary: {
        totalDelta: number;
        averageDelta: number;
        positiveCount: number;
        negativeCount: number;
        zeroCount: number;
      };
      trustedChangedCount: number;
      decisionChangedCount: number;
      fallbackUsedCount: number;
      reviewUsedCount: number;
      skippedByCleanupCount: number;
    } | null;
  };
};
