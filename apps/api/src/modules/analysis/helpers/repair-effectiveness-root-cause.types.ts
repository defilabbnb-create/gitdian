import type {
  AnalysisOutcomeActionKey,
  AnalysisOutcomeLog,
  AnalysisOutcomeStatus,
  AnalysisRepairValueClass,
} from './analysis-outcome.types';
import type { CalibrationSeedGroup } from './calibration-seed-batch.helper';
import type { KeyEvidenceGapTaxonomy } from './evidence-gap-taxonomy.helper';
import type { HistoricalInventoryQualityState } from './historical-data-inventory.helper';
import type { ModelTaskCapabilityTierName } from './model-task-router.types';

export type RepairEffectivenessRootCause =
  | 'no_new_evidence'
  | 'same_inputs_replayed'
  | 'insufficient_evidence_sources'
  | 'stale_inputs_only'
  | 'writeback_missing'
  | 'writeback_partial'
  | 'evidence_written_but_gaps_unchanged'
  | 'evidence_gap_not_reduced'
  | 'blocking_gaps_unchanged'
  | 'quality_unchanged_after_repair'
  | 'quality_improved_but_below_state_threshold'
  | 'decision_unchanged_after_recalc'
  | 'conflict_reconfirmed_without_resolution'
  | 'recalc_without_new_signal'
  | 'wrong_action_for_gap_profile'
  | 'deep_repair_not_needed'
  | 'decision_recalc_not_needed'
  | 'evidence_repair_too_weak'
  | 'routed_tier_too_low'
  | 'routed_review_without_structural_change'
  | 'fallback_without_structural_change';

export type RepairEffectivenessRecommendationScope =
  | 'repair'
  | 'router'
  | 'writeback'
  | 'decision'
  | 'quality';

export type RepairEffectivenessRecommendationPriority = 'P0' | 'P1' | 'P2';

export type RepairEffectivenessRootCauseExplanation = {
  rootCause: RepairEffectivenessRootCause;
  layer:
    | 'inputs'
    | 'writeback'
    | 'gap_quality'
    | 'decision_recalc'
    | 'action_selection'
    | 'routing_execution';
  description: string;
};

export type RepairEffectivenessClassification = {
  repositoryId: string;
  fullName: string | null;
  seedGroup: CalibrationSeedGroup | null;
  normalizedTaskType: string;
  historicalRepairAction: AnalysisOutcomeActionKey | null;
  capabilityTier: ModelTaskCapabilityTierName | 'NONE';
  qualityStateBefore: HistoricalInventoryQualityState | 'UNKNOWN';
  outcomeStatus: AnalysisOutcomeStatus;
  repairValueClass: AnalysisRepairValueClass;
  qualityDelta: number;
  gapCountDelta: number;
  blockingGapDelta: number;
  trustedChanged: boolean;
  decisionChanged: boolean;
  executionUsedFallback: boolean;
  executionUsedReview: boolean;
  outcomeReason: string;
  beforeGaps: KeyEvidenceGapTaxonomy[];
  afterGaps: KeyEvidenceGapTaxonomy[];
  beforeBlockingGaps: KeyEvidenceGapTaxonomy[];
  afterBlockingGaps: KeyEvidenceGapTaxonomy[];
  primaryRootCause: RepairEffectivenessRootCause;
  rootCauses: RepairEffectivenessRootCause[];
  rootCauseSummary: string;
  rootCauseConfidence: number;
};

export type RepairEffectivenessRootCauseCount = {
  rootCause: RepairEffectivenessRootCause;
  count: number;
  ratio: number;
};

export type RepairEffectivenessActionRootCauseSummary = {
  action: AnalysisOutcomeActionKey;
  totalCount: number;
  outcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
  averageQualityDelta: number;
  noChangeCount: number;
  partialCount: number;
  decisionChangedCount: number;
  trustedChangedCount: number;
  topPrimaryRootCauses: RepairEffectivenessRootCauseCount[];
  topRootCauses: RepairEffectivenessRootCauseCount[];
  topGaps: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>;
};

export type RepairEffectivenessTierRootCauseSummary = {
  capabilityTier: ModelTaskCapabilityTierName | 'NONE';
  count: number;
  noChangeCount: number;
  partialCount: number;
  averageQualityDelta: number;
  topPrimaryRootCauses: RepairEffectivenessRootCauseCount[];
};

export type RepairEffectivenessGapProfileSummary = {
  profile: string;
  totalCount: number;
  noChangeCount: number;
  partialCount: number;
  decisionChangedCount: number;
  gapReductionCount: number;
  topPrimaryRootCauses: RepairEffectivenessRootCauseCount[];
};

export type RepairEffectivenessRecommendation = {
  recommendationId: string;
  recommendationScope: RepairEffectivenessRecommendationScope;
  recommendationPriority: RepairEffectivenessRecommendationPriority;
  recommendationReason: string;
  targetRootCauses: RepairEffectivenessRootCause[];
  expectedEffect: string;
};

export type RepairEffectivenessRootCauseReport = {
  generatedAt: string;
  source: {
    seedGeneratedAt: string | null;
    totalSeeded: number;
    analyzedCount: number;
    actionableCount: number;
    nonCleanupDominated: boolean;
    outcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
  };
  taxonomy: {
    rootCauses: RepairEffectivenessRootCauseExplanation[];
    focusedOutcomeStatuses: AnalysisOutcomeStatus[];
  };
  overallRootCauseSummary: {
    primaryRootCauseTop: RepairEffectivenessRootCauseCount[];
    rootCauseDistribution: RepairEffectivenessRootCauseCount[];
  };
  actionRootCauseSummary: {
    decisionRecalc: RepairEffectivenessActionRootCauseSummary;
    deepRepair: RepairEffectivenessActionRootCauseSummary;
    evidenceRepair: RepairEffectivenessActionRootCauseSummary;
  };
  tierRootCauseSummary: RepairEffectivenessTierRootCauseSummary[];
  gapProfileSummary: {
    decisionConflict: RepairEffectivenessGapProfileSummary;
    deepMissing: RepairEffectivenessGapProfileSummary;
    weakOnlyEvidence: RepairEffectivenessGapProfileSummary;
  };
  surgeryRecommendations: RepairEffectivenessRecommendation[];
  conclusions: {
    strongFindings: string[];
    earlyTrends: string[];
    unansweredQuestions: string[];
  };
  samples: {
    decisionRecalcNoChange: RepairEffectivenessClassification[];
    deepRepairNoChange: RepairEffectivenessClassification[];
    evidenceRepairWeak: RepairEffectivenessClassification[];
    partialImprovements: RepairEffectivenessClassification[];
  };
  audit: {
    commands: string[];
    focusFields: string[];
    sampleChecks: string[];
  };
};

export type RepairRootCauseSeedSource = {
  generatedAt?: string | null;
  selection?: {
    totalSeeded?: number;
    items?: Array<{
      repositoryId: string;
      fullName: string;
      seedGroup: CalibrationSeedGroup;
      historicalRepairAction: string;
    }>;
  } | null;
  snapshot?: {
    items?: AnalysisOutcomeLog[];
    summary?: {
      outcomeStatusBreakdown?: Record<AnalysisOutcomeStatus, number>;
    };
  } | null;
};
