import type { AnalysisOutcomeAfterContext, AnalysisOutcomeLog } from './analysis-outcome.types';
import type {
  DecisionRecalcFingerprint,
  DecisionRecalcSignalDiff,
} from './decision-recalc-gate.types';
import type { HistoricalRepairPriorityItem } from './historical-repair-priority.helper';

export type HistoricalAfterItemResolutionType =
  | 'exact_action'
  | 'repo_fallback'
  | 'missing';

export type HistoricalAfterItemResolution = {
  repoId: string;
  beforeAction: string | null;
  afterAction: string | null;
  resolutionType: HistoricalAfterItemResolutionType;
  actionChanged: boolean;
  afterItem: HistoricalRepairPriorityItem | null;
};

export type DecisionRecalcInputFingerprint = DecisionRecalcFingerprint;

export type DecisionRecalcFingerprintComparison = {
  beforeHash: string | null;
  afterHash: string;
  sameInputsReplayed: boolean;
  hasNewSignal: boolean;
  changedFields: DecisionRecalcSignalDiff['changedFields'];
  replayedConflictSignals: DecisionRecalcSignalDiff['replayedConflictSignals'];
  summary: string;
};

export type DeepWritebackTraceSample = {
  repositoryId: string;
  fullName: string;
  originalOutcomeStatus: string;
  originalOutcomeReason: string;
  originalAction: string | null;
  currentAction: string | null;
  afterResolutionType: HistoricalAfterItemResolutionType;
  refreshedFields: Array<keyof AnalysisOutcomeAfterContext>;
  writtenArtifacts: {
    hasSnapshot: boolean;
    hasInsight: boolean;
    hasCompleteness: boolean;
    hasIdeaFit: boolean;
    hasIdeaExtract: boolean;
  };
  wasFalseNoChange: boolean;
  primaryWritebackBreak: string;
  rootCauseShift: string;
  originalAfter: AnalysisOutcomeAfterContext;
  currentAfter: AnalysisOutcomeAfterContext | null;
};

export type DecisionRecalcTraceSample = {
  repositoryId: string;
  fullName: string;
  beforeFingerprint: DecisionRecalcInputFingerprint;
  afterFingerprint: DecisionRecalcInputFingerprint | null;
  comparison: DecisionRecalcFingerprintComparison | null;
  beforeDecisionState: string | null;
  afterDecisionState: string | null;
  beforeQualityScore: number;
  afterQualityScore: number | null;
  decisionChanged: boolean;
  qualityDelta: number;
  gapCountDelta: number;
  blockingGapDelta: number;
  primaryRecalcFinding:
    | 'same_inputs_replayed'
    | 'new_signal_no_decision_change'
    | 'new_signal_decision_changed'
    | 'recalc_failed';
};

export type EvidenceRepairControlSample = {
  repositoryId: string;
  fullName: string;
  originalOutcomeStatus: string;
  rerunOutcomeReason: string;
  refreshedFields: Array<keyof AnalysisOutcomeAfterContext>;
  wasStillNoChange: boolean;
};

export type RepairEffectivenessSurgeryRecommendation = {
  recommendationId: string;
  recommendationScope: 'repair' | 'router' | 'writeback' | 'decision' | 'quality';
  recommendationPriority: 'P0' | 'P1' | 'P2';
  recommendationReason: string;
  targetRootCauses: string[];
  expectedEffect: string;
};

export type RepairEffectivenessSurgeryReport = {
  schemaVersion: string;
  generatedAt: string;
  source: {
    seedGeneratedAt: string | null;
    totalLoggedOutcomes: number;
    sampledDecisionRecalcCount: number;
    sampledDeepRepairCount: number;
    sampledEvidenceRepairCount: number;
  };
  summary: {
    totalValidated: number;
    falseNoChangeResolvedCount: number;
    deepWritebackResolvedCount: number;
    decisionReplayCount: number;
    decisionNoNewSignalCount: number;
    decisionNewSignalCount: number;
    decisionChangedCount: number;
    evidenceControlStillNoChangeCount: number;
  };
  deepWritebackTrace: {
    totalSampled: number;
    falseNoChangeCount: number;
    actualBreakdown: Record<string, number>;
    refreshedFieldBreakdown: Record<keyof AnalysisOutcomeAfterContext, number>;
    samples: DeepWritebackTraceSample[];
  };
  recalcTrace: {
    totalSampled: number;
    fingerprintSameCount: number;
    noNewSignalCount: number;
    newSignalCount: number;
    decisionChangedCount: number;
    decisionUnchangedWithNewSignalCount: number;
    replayConflictBreakdown: Record<string, number>;
    samples: DecisionRecalcTraceSample[];
  };
  evidenceControls: {
    totalSampled: number;
    stillNoChangeCount: number;
    refreshedFieldBreakdown: Record<keyof AnalysisOutcomeAfterContext, number>;
    samples: EvidenceRepairControlSample[];
  };
  surgeryRecommendations: RepairEffectivenessSurgeryRecommendation[];
  notes: {
    deepWritebackFinding: string;
    decisionRecalcFinding: string;
    validationMode: string;
  };
};

export type RepairEffectivenessSeedSource = {
  generatedAt?: string;
  snapshot?: {
    items?: AnalysisOutcomeLog[];
  };
};
