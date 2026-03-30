import type {
  AnalysisOutcomeAfterContext,
  AnalysisRepairValueClass,
} from './analysis-outcome.types';

export const DEEP_REPAIR_AFTER_STATE_SOURCES = [
  'live_after_item',
  'after_item_override',
  'persisted_updated_item',
  'before_fallback',
] as const;

export type DeepRepairAfterStateSource =
  (typeof DEEP_REPAIR_AFTER_STATE_SOURCES)[number];

export const DEEP_REPAIR_WRITEBACK_ROOT_CAUSES = [
  'no_new_output',
  'writeback_missing',
  'writeback_partial',
  'after_state_lookup_stale',
  'evidence_written_but_gaps_unchanged',
  'quality_unchanged_after_repair',
  'decision_unchanged_after_repair',
] as const;

export type DeepRepairWritebackRootCause =
  (typeof DEEP_REPAIR_WRITEBACK_ROOT_CAUSES)[number];

export const DEEP_REPAIR_OUTPUT_KINDS = [
  'evidence_node',
  'structured_gap_signal',
  'decision_signal',
  'coverage_signal',
  'narrative_only',
] as const;

export type DeepRepairOutputKind = (typeof DEEP_REPAIR_OUTPUT_KINDS)[number];

export type DeepRepairWritebackField = keyof AnalysisOutcomeAfterContext;

export type DeepRepairAnalysisSnapshot = {
  completenessHash: string | null;
  ideaFitHash: string | null;
  ideaExtractHash: string | null;
};

export type DeepRepairAfterStateResolution = {
  afterContext: AnalysisOutcomeAfterContext;
  afterStateRefreshed: boolean;
  afterStateRefreshSource: DeepRepairAfterStateSource;
  afterStateChangedFieldCount: number;
  afterStateFallbackUsed: boolean;
  deepWritebackChangedFields: DeepRepairWritebackField[];
};

export type DeepRepairWritebackTrace = {
  repositoryId: string;
  fullName: string;
  originalOutcomeStatus: string;
  originalOutcomeReason: string;
  historicalRepairAction: string | null;
  currentAction: string | null;
  deepWritebackProduced: boolean;
  deepWritebackApplied: boolean;
  deepWritebackMissedFields: DeepRepairWritebackField[];
  deepWritebackChangedFields: DeepRepairWritebackField[];
  deepWritebackReasonSummary: string;
  afterStateRefreshed: boolean;
  afterStateRefreshSource: DeepRepairAfterStateSource;
  afterStateChangedFieldCount: number;
  afterStateFallbackUsed: boolean;
  primaryRootCause: DeepRepairWritebackRootCause;
  rootCauses: DeepRepairWritebackRootCause[];
  producedOutputKinds: DeepRepairOutputKind[];
  analysisArtifactChanges: string[];
  beforeAfter: AnalysisOutcomeAfterContext;
  observedAfter: AnalysisOutcomeAfterContext;
  refreshedAfter: AnalysisOutcomeAfterContext;
  wasFakeNoChange: boolean;
  isRealNoChange: boolean;
  qualityDeltaAfterRefresh: number;
  gapCountDeltaAfterRefresh: number;
  blockingGapDeltaAfterRefresh: number;
  decisionChangedAfterRefresh: boolean;
  repairValueClassAfterRefresh: AnalysisRepairValueClass;
};

export type DeepWritebackTraceReport = {
  schemaVersion: string;
  generatedAt: string;
  source: {
    seedGeneratedAt: string | null;
    totalLoggedDeepRepairOutcomes: number;
    totalValidatedSamples: number;
    highValueSampleCount: number;
    generalValueSampleCount: number;
  };
  summary: {
    totalSampled: number;
    deepWritebackProducedCount: number;
    deepWritebackAppliedCount: number;
    fakeNoChangeCount: number;
    realNoChangeCount: number;
    resolvedFakeNoChangeCount: number;
    remainingRealNoChangeCount: number;
  };
  fieldLevel: {
    refreshedFieldBreakdown: Record<DeepRepairWritebackField, number>;
    missedFieldBreakdown: Record<DeepRepairWritebackField, number>;
    refreshSourceBreakdown: Record<DeepRepairAfterStateSource, number>;
  };
  rootCauseBreakdown: Record<DeepRepairWritebackRootCause, number>;
  samples: {
    resolvedFakeNoChange: DeepRepairWritebackTrace[];
    realNoChange: DeepRepairWritebackTrace[];
    all: DeepRepairWritebackTrace[];
  };
  notes: {
    afterStatePriority:
      'live_after_item > after_item_override > persisted_updated_item > before_fallback';
    strongestFinding: string;
    remainingRisk: string;
  };
};
