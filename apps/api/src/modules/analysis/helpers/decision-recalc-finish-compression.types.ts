import type { DecisionRecalcGateDecision } from './decision-recalc-gate.types';
import type {
  AnalysisPoolFreezeState,
  FrozenAnalysisPoolMember,
  FrozenAnalysisPoolPendingAgeBucket,
  FrozenAnalysisPoolQueueState,
} from './frozen-analysis-pool.types';

export type DecisionRecalcCompressionClass =
  | 'keep_running'
  | 'promote_archived'
  | 'promote_deleted'
  | 'suppress_from_remaining';

export type DecisionRecalcCompressionConflictType =
  | 'user_conflict'
  | 'monetization_conflict'
  | 'execution_conflict'
  | 'market_conflict'
  | 'problem_conflict';

export type DecisionRecalcCompressionQueueStatus =
  | 'pending'
  | 'in_flight'
  | 'no_queue';

export type DecisionRecalcCompressionWaitingDurationBucket =
  | FrozenAnalysisPoolPendingAgeBucket
  | 'no_queue';

export type DecisionRecalcCompressionReason =
  | 'queue_in_flight_keep_running'
  | 'recalc_gate_allow_keep_running'
  | 'recalc_gate_allow_but_expect_no_change_keep_running'
  | 'recalc_gate_allow_but_low_roi_archived'
  | 'recalc_replay_suppressed'
  | 'recalc_cleanup_suppressed'
  | 'recalc_duplicate_pending_suppressed'
  | 'recalc_stale_pending_suppressed'
  | 'low_roi_terminal_archived'
  | 'delete_candidate_ready'
  | 'active_roi_too_low_suppressed';

export type DecisionRecalcCompressionItem = {
  repositoryId: string;
  fullName: string;
  historicalRepairBucket: FrozenAnalysisPoolMember['historicalRepairBucket'];
  historicalRepairAction: FrozenAnalysisPoolMember['historicalRepairAction'];
  repositoryValueTier: FrozenAnalysisPoolMember['repositoryValueTier'];
  moneyPriority: FrozenAnalysisPoolMember['moneyPriority'];
  strictVisibilityLevel: FrozenAnalysisPoolMember['strictVisibilityLevel'];
  cleanupState: FrozenAnalysisPoolMember['cleanupState'];
  analysisQualityState: FrozenAnalysisPoolMember['analysisQualityState'];
  analysisQualityScore: number;
  trustedBlockingGapCount: number;
  hasTrustedBlockingGaps: boolean;
  gateDecision: DecisionRecalcGateDecision | 'missing_gate_snapshot';
  gateReason: string | null;
  queueStatus: DecisionRecalcCompressionQueueStatus;
  queueState: FrozenAnalysisPoolQueueState;
  waitingDurationHours: number | null;
  waitingDurationBucket: DecisionRecalcCompressionWaitingDurationBucket;
  hasPendingJobs: boolean;
  hasRunningJobs: boolean;
  redundantPendingJobCount: number;
  stalePendingJobCount: number;
  deleteCandidate: boolean;
  deleteReason: FrozenAnalysisPoolMember['deleteReason'];
  conflictTypes: DecisionRecalcCompressionConflictType[];
  compressionClass: DecisionRecalcCompressionClass;
  compressionReasons: DecisionRecalcCompressionReason[];
  worthRunning: boolean;
  archivable: boolean;
  suppressible: boolean;
  canDeleteNow: boolean;
};

export type DecisionRecalcCompressionCounts = Record<string, number>;

export type DecisionRecalcFinishCompressionResult = {
  generatedAt: string;
  freezeState: AnalysisPoolFreezeState;
  frozenAnalysisPoolBatchId: string;
  decisionRecalcRemainingBefore: number;
  decisionRecalcRemainingAfter: number;
  frozenPoolRemainingBefore: number;
  frozenPoolRemainingAfter: number;
  decisionRecalcRemainingShareAfter: number;
  decisionRecalcRemainingCount: number;
  decisionRecalcByGateDecision: DecisionRecalcCompressionCounts;
  decisionRecalcByHistoricalRepairBucket: DecisionRecalcCompressionCounts;
  decisionRecalcByValueTier: DecisionRecalcCompressionCounts;
  decisionRecalcByMoneyPriority: DecisionRecalcCompressionCounts;
  decisionRecalcByVisibilityLevel: DecisionRecalcCompressionCounts;
  decisionRecalcByCleanupState: DecisionRecalcCompressionCounts;
  decisionRecalcByAnalysisQualityState: DecisionRecalcCompressionCounts;
  decisionRecalcByTrustedBlockingGapPresence: DecisionRecalcCompressionCounts;
  decisionRecalcByConflictType: DecisionRecalcCompressionCounts;
  decisionRecalcByQueueStatus: DecisionRecalcCompressionCounts;
  decisionRecalcByWaitingDuration: DecisionRecalcCompressionCounts;
  decisionRecalcSuppressibleCount: number;
  decisionRecalcArchivableCount: number;
  decisionRecalcStillWorthRunningCount: number;
  decisionRecalcCompressedCount: number;
  decisionRecalcKeptRunningCount: number;
  decisionRecalcPromotedArchivedCount: number;
  decisionRecalcPromotedDeletedCount: number;
  decisionRecalcSuppressedFromRemainingCount: number;
  decisionRecalcRemovedFromPendingCount: number;
  decisionRecalcRemovedFromRepairRemainingCount: number;
  queueCancelledJobCount: number;
  queueCancelledRepositoryCount: number;
  archivedRepositoryIds: string[];
  deletedRepositoryIds: string[];
  suppressedRepositoryIds: string[];
  keepRunningRepositoryIds: string[];
  topRemainingPrimaryReasonsAfter: Array<{ reason: string; count: number }>;
  topRemainingActionsAfter: Array<{ action: string; count: number }>;
  hardestActionAfter: { action: string; count: number } | null;
  mostWorthContinuingConflictTypes: Array<{ conflictType: string; count: number }>;
  mostCompressibleConflictTypes: Array<{ conflictType: string; count: number }>;
  items: DecisionRecalcCompressionItem[];
  persistedCompletionOverrideItems: DecisionRecalcCompressionItem[];
  keptRunningSamples: DecisionRecalcCompressionItem[];
  promotedArchivedSamples: DecisionRecalcCompressionItem[];
  promotedDeletedSamples: DecisionRecalcCompressionItem[];
  suppressedFromRemainingSamples: DecisionRecalcCompressionItem[];
};
