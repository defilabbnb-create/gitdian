import type { HistoricalRepairPriorityItem } from './historical-repair-priority.helper';

export type DecisionRecalcGateDecision =
  | 'allow_recalc'
  | 'suppress_replay'
  | 'allow_recalc_but_expect_no_change'
  | 'suppress_cleanup';

export type DecisionRecalcGateConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type DecisionRecalcFingerprint = {
  repositoryId: string;
  keyEvidenceGaps: string[];
  decisionRecalcGaps: string[];
  trustedBlockingGaps: string[];
  relevantConflictSignals: string[];
  evidenceCoverageRate: number;
  freshnessDays: number | null;
  evidenceFreshnessDays: number | null;
  analysisQualityScore: number;
  analysisQualityState: string | null;
  frontendDecisionState: string | null;
  hasDeep: boolean;
  fallbackFlag: boolean;
  conflictFlag: boolean;
  incompleteFlag: boolean;
  recalcFingerprintHash: string;
};

export type DecisionRecalcSignalDiff = {
  recalcSignalChanged: boolean;
  recalcSignalDiffSummary: string;
  changedFields: string[];
  replayedConflictSignals: string[];
};

export type DecisionRecalcGateResult = {
  repositoryId: string;
  fullName: string;
  historicalRepairBucket: string | null;
  historicalRepairAction: string | null;
  cleanupState: string | null;
  strictVisibilityLevel: string | null;
  repositoryValueTier: string | null;
  moneyPriority: string | null;
  recalcFingerprint: DecisionRecalcFingerprint;
  recalcFingerprintHash: string;
  previousFingerprintHash: string | null;
  recalcGateDecision: DecisionRecalcGateDecision;
  recalcGateReason: string;
  recalcSignalChanged: boolean;
  recalcSignalDiffSummary: string;
  recalcGateConfidence: DecisionRecalcGateConfidence;
  changedFields: string[];
  replayedConflictSignals: string[];
};

export type DecisionRecalcGateSnapshot = {
  schemaVersion: string;
  generatedAt: string;
  totalCandidates: number;
  items: DecisionRecalcGateResult[];
};

export type DecisionRecalcGateSnapshotMap = Map<string, DecisionRecalcGateResult>;

export type DecisionRecalcGateReport = {
  schemaVersion: string;
  generatedAt: string;
  source: {
    priorityGeneratedAt: string | null;
    previousSnapshotGeneratedAt: string | null;
    hadPreviousSnapshot: boolean;
    totalCandidates: number;
  };
  summary: {
    gateDecisionBreakdown: Record<DecisionRecalcGateDecision, number>;
    recalcReplaySuppressedCount: number;
    recalcCleanupSuppressedCount: number;
    recalcAllowedCount: number;
    recalcAllowedButNoChangeExpectedCount: number;
    recalcSignalChangedCount: number;
    recalcSignalUnchangedCount: number;
    recalcDecisionChangedCount: number;
    reviewHighCostSuppressedCount: number;
    topReplayConflictTypes: Array<{ conflictType: string; count: number }>;
    topNewSignalFields: Array<{ field: string; count: number }>;
  };
  replaySummary: {
    topReplayRepos: Array<{
      repositoryId: string;
      fullName: string;
      replayedConflictSignals: string[];
      reason: string;
    }>;
    replayConflictBreakdown: Record<string, number>;
  };
  signalSummary: {
    changedFieldBreakdown: Record<string, number>;
    changedButStillExpectedNoChangeCount: number;
    changedAndAllowedCount: number;
    changedButDecisionStillLikelyStaticRepos: Array<{
      repositoryId: string;
      fullName: string;
      changedFields: string[];
      reason: string;
    }>;
  };
  executionImpact: {
    totalDecisionRecalcCandidates: number;
    totalPreviouslyRunnable: number;
    suppressedFromRealExecutionCount: number;
    allowedIntoRealExecutionCount: number;
    reducedReviewOrHighCostPathCount: number;
  };
  notes: {
    baseline: string;
    replayInterpretation: string;
    newSignalInterpretation: string;
  };
  samples: {
    suppressedReplay: DecisionRecalcGateResult[];
    allowed: DecisionRecalcGateResult[];
    allowedButExpectedNoChange: DecisionRecalcGateResult[];
    suppressedCleanup: DecisionRecalcGateResult[];
  };
  snapshot: DecisionRecalcGateSnapshot;
};

export type DecisionRecalcGateEvaluableItem = Pick<
  HistoricalRepairPriorityItem,
  | 'repoId'
  | 'keyEvidenceGaps'
  | 'decisionRecalcGaps'
  | 'trustedBlockingGaps'
  | 'conflictDrivenGaps'
  | 'evidenceConflictCount'
  | 'evidenceCoverageRate'
  | 'freshnessDays'
  | 'evidenceFreshnessDays'
  | 'analysisQualityScore'
  | 'analysisQualityState'
  | 'frontendDecisionState'
  | 'hasDeep'
  | 'fallbackFlag'
  | 'conflictFlag'
  | 'incompleteFlag'
> &
  Partial<
    Pick<
      HistoricalRepairPriorityItem,
      | 'fullName'
      | 'historicalRepairBucket'
      | 'historicalRepairAction'
      | 'cleanupState'
      | 'strictVisibilityLevel'
      | 'repositoryValueTier'
      | 'moneyPriority'
    >
  >;
