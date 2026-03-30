import type {
  HistoricalRepairBucket,
  HistoricalRepairRecommendedAction,
} from './historical-repair-bucketing.helper';
import type { HistoricalCleanupState } from './historical-cleanup-policy.helper';
import type { HistoricalInventoryQualityState } from './historical-data-inventory.helper';
import type {
  ModelRouterCostSensitivity,
  ModelTaskCostClass,
  ModelTaskFallbackPolicy,
  ModelTaskIntent,
  ModelTaskLatencyClass,
  ModelTaskRouterPriorityClass,
  ModelTaskRouterRetryClass,
  NormalizedModelTaskType,
} from './model-task-router.types';

export type AnalysisOutcomeDecisionState =
  | 'trusted'
  | 'provisional'
  | 'degraded'
  | null;

export type AnalysisOutcomeStatus =
  | 'success'
  | 'partial'
  | 'no_change'
  | 'failed'
  | 'downgraded'
  | 'skipped';

export type AnalysisRepairValueClass = 'high' | 'medium' | 'low' | 'negative';
export type AnalysisOutcomeActionKey =
  | HistoricalRepairRecommendedAction
  | 'skipped';

export type AnalysisOutcomeBeforeContext = {
  repositoryId: string;
  normalizedTaskType: NormalizedModelTaskType;
  taskIntent: ModelTaskIntent;
  historicalRepairBucket: HistoricalRepairBucket | null;
  historicalRepairAction: HistoricalRepairRecommendedAction | null;
  cleanupState: HistoricalCleanupState | null;
  analysisQualityScoreBefore: number;
  analysisQualityStateBefore: HistoricalInventoryQualityState | null;
  decisionStateBefore: AnalysisOutcomeDecisionState;
  trustedEligibilityBefore: boolean;
  keyEvidenceGapsBefore: string[];
  trustedBlockingGapsBefore: string[];
  evidenceCoverageRateBefore: number;
};

export type AnalysisOutcomeRouterContext = {
  routerCapabilityTier: string | null;
  routerPriorityClass: ModelTaskRouterPriorityClass | null;
  routerFallbackPolicy: ModelTaskFallbackPolicy | null;
  routerRequiresReview: boolean;
  routerRetryClass: ModelTaskRouterRetryClass | null;
  routerReasonSummary: string;
  routerCostSensitivity: ModelRouterCostSensitivity | null;
  routerLatencySensitivity: ModelTaskLatencyClass | null;
};

export type AnalysisOutcomeExecutionContext = {
  outcomeStatus: AnalysisOutcomeStatus;
  outcomeReason: string;
  executionDurationMs: number;
  executionCostClass: ModelTaskCostClass | null;
  executionUsedFallback: boolean;
  executionUsedReview: boolean;
};

export type AnalysisOutcomeAfterContext = {
  analysisQualityScoreAfter: number;
  analysisQualityStateAfter: HistoricalInventoryQualityState | null;
  decisionStateAfter: AnalysisOutcomeDecisionState;
  trustedEligibilityAfter: boolean;
  keyEvidenceGapsAfter: string[];
  trustedBlockingGapsAfter: string[];
  evidenceCoverageRateAfter: number;
};

export type AnalysisOutcomeDelta = {
  qualityDelta: number;
  trustedChanged: boolean;
  decisionChanged: boolean;
  gapCountDelta: number;
  blockingGapDelta: number;
  repairValueClass: AnalysisRepairValueClass;
};

export type AnalysisOutcomeLog = {
  schemaVersion: string;
  loggedAt: string;
  before: AnalysisOutcomeBeforeContext;
  router: AnalysisOutcomeRouterContext;
  execution: AnalysisOutcomeExecutionContext;
  after: AnalysisOutcomeAfterContext;
  delta: AnalysisOutcomeDelta;
};

export type AnalysisOutcomeSummary = {
  totalCount: number;
  coveredActions: AnalysisOutcomeActionKey[];
  outcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
  repairValueClassBreakdown: Record<AnalysisRepairValueClass, number>;
  executionCostClassBreakdown: Record<ModelTaskCostClass | 'NONE', number>;
  routerCapabilityBreakdown: Record<string, number>;
  actionBreakdown: Record<AnalysisOutcomeActionKey, number>;
  actionOutcomeStatusBreakdown: Record<
    AnalysisOutcomeActionKey,
    Record<AnalysisOutcomeStatus, number>
  >;
  actionRepairValueClassBreakdown: Record<
    AnalysisOutcomeActionKey,
    Record<AnalysisRepairValueClass, number>
  >;
  actionQualityDeltaSummary: Record<
    AnalysisOutcomeActionKey,
    {
      totalDelta: number;
      averageDelta: number;
      positiveCount: number;
      negativeCount: number;
      zeroCount: number;
    }
  >;
  qualityDeltaSummary: {
    totalDelta: number;
    averageDelta: number;
    positiveCount: number;
    negativeCount: number;
    zeroCount: number;
    minDelta: number;
    maxDelta: number;
  };
  trustedChangedCount: number;
  decisionChangedCount: number;
  fallbackUsedCount: number;
  reviewUsedCount: number;
  skippedByCleanupCount: number;
};

export type AnalysisOutcomeSnapshot = {
  schemaVersion: string;
  generatedAt: string;
  source: string;
  totalCount: number;
  truncated: boolean;
  summary: AnalysisOutcomeSummary;
  items: AnalysisOutcomeLog[];
};
