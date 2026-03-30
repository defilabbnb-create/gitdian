export type NormalizedModelTaskType =
  | 'snapshot'
  | 'fast_filter'
  | 'insight'
  | 'idea_extract'
  | 'idea_fit'
  | 'completeness'
  | 'evidence_repair'
  | 'deep_repair'
  | 'decision_recalc'
  | 'claude_review'
  | 'refresh_only'
  | 'downgrade_only'
  | 'cleanup_related';

export type ModelTaskIntent =
  | 'extract'
  | 'classify'
  | 'score'
  | 'synthesize'
  | 'repair'
  | 'recalc'
  | 'review'
  | 'downgrade'
  | 'cleanup';

export type ModelTaskComplexity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ModelTaskCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ModelTaskCostClass = 'LOW' | 'MEDIUM' | 'HIGH';
export type ModelTaskLatencyClass = 'LOW' | 'MEDIUM' | 'HIGH';
export type ModelTaskFallbackPolicy =
  | 'NONE'
  | 'PROVIDER_FALLBACK'
  | 'DETERMINISTIC_ONLY'
  | 'LIGHT_DERIVATION'
  | 'RETRY_THEN_REVIEW'
  | 'RETRY_THEN_DOWNGRADE'
  | 'DOWNGRADE_ONLY';
export type ModelTaskDeterminismNeed = 'OPTIONAL' | 'PREFERRED' | 'REQUIRED';
export type ModelTaskEvidenceDependency = 'NONE' | 'SUPPORTING' | 'REQUIRED' | 'CRITICAL';
export type ModelTaskUserVisibility =
  | 'INTERNAL'
  | 'DERIVED_INTERNAL'
  | 'DETAIL'
  | 'USER_VISIBLE'
  | 'TRUST_CRITICAL';
export type ModelRouterDecisionBasis =
  | 'HEURISTIC_RULES'
  | 'EXISTING_ANALYSIS'
  | 'EVIDENCE_GAPS'
  | 'QUALITY_AND_EVIDENCE'
  | 'REPAIR_BUCKET'
  | 'REVIEW_DIFF'
  | 'CLEANUP_POLICY';
export type ModelRouterCostSensitivity = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
export type ModelRouterVisibilityLevel =
  | 'BACKGROUND'
  | 'INTERNAL'
  | 'VISIBLE'
  | 'TRUST_CRITICAL';
export type ModelTaskCapabilityTierName =
  | 'LIGHT'
  | 'STANDARD'
  | 'HEAVY'
  | 'REVIEW'
  | 'DETERMINISTIC_ONLY';
export type ModelTaskFailureEscalation =
  | 'NONE'
  | 'FALLBACK_ONLY'
  | 'REVIEW_REQUIRED'
  | 'DOWNGRADE_ONLY';
export type ModelTaskRouterPriorityClass = 'P0' | 'P1' | 'P2' | 'P3';
export type ModelTaskRouterRetryClass =
  | 'NONE'
  | 'RETRY_ONCE'
  | 'RETRY_ONCE_THEN_REVIEW'
  | 'RETRY_ONCE_THEN_DOWNGRADE';

export type ModelTaskCapabilityTier = {
  tierName: ModelTaskCapabilityTierName;
  costLevel: ModelTaskCostClass;
  latencyLevel: ModelTaskLatencyClass;
  allowedTaskTypes: NormalizedModelTaskType[];
  maxBudgetWeight: number;
};

export type ModelTaskRouterTaskDefinition = {
  normalizedTaskType: NormalizedModelTaskType;
  taskIntent: ModelTaskIntent;
  taskComplexity: ModelTaskComplexity;
  taskCriticality: ModelTaskCriticality;
  taskCostClass: ModelTaskCostClass;
  taskLatencyClass: ModelTaskLatencyClass;
  taskFallbackPolicy: ModelTaskFallbackPolicy;
  taskDeterminismNeed: ModelTaskDeterminismNeed;
  taskEvidenceDependency: ModelTaskEvidenceDependency;
  taskUserVisibility: ModelTaskUserVisibility;
  routerDecisionBasis: ModelRouterDecisionBasis;
  routerCostSensitivity: ModelRouterCostSensitivity;
  routerVisibilityLevel: ModelRouterVisibilityLevel;
  preferredCapabilityTier: ModelTaskCapabilityTierName;
  failureEscalation: ModelTaskFailureEscalation;
  currentEntry: string[];
  currentConsumer: string[];
  currentPrioritySource: string[];
  currentFallback: string[];
  currentModelDependency: string[];
  aliases: {
    aiTaskTypes?: string[];
    queueJobTypes?: string[];
    jobNames?: string[];
    repairActions?: string[];
    serviceModes?: string[];
    directTaskTypes?: string[];
  };
  notes?: string;
};

export type ModelTaskRouterNormalizationInput = {
  aiTaskType?: string | null;
  queueJobType?: string | null;
  jobName?: string | null;
  repairAction?: string | null;
  serviceMode?: string | null;
  directTaskType?: string | null;
};

export type ModelTaskRouterObservedSourceKind =
  | 'aiTaskType'
  | 'queueJobType'
  | 'jobName'
  | 'repairAction'
  | 'serviceMode';

export type ModelTaskRouterObservedSource = {
  sourceKind: ModelTaskRouterObservedSourceKind;
  sourceValue: string;
  normalizedTaskType: NormalizedModelTaskType | null;
  coverage: 'UNIFIED' | 'ORCHESTRATION_ONLY' | 'OUT_OF_SCOPE';
  note: string;
};

export type ModelTaskRouterDecisionInput = {
  normalizedTaskType: NormalizedModelTaskType;
  taskIntent?: ModelTaskIntent | null;
  historicalRepairBucket?: string | null;
  historicalRepairAction?: string | null;
  cleanupState?: string | null;
  analysisQualityState?: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL' | null;
  keyEvidenceGaps?: string[] | null;
  decisionRecalcGaps?: string[] | null;
  deepRepairGaps?: string[] | null;
  evidenceRepairGaps?: string[] | null;
  trustedBlockingGaps?: string[] | null;
  evidenceConflictCount?: number | null;
  evidenceCoverageRate?: number | null;
  hasDeep?: boolean | null;
  fallbackFlag?: boolean | null;
  conflictFlag?: boolean | null;
  incompleteFlag?: boolean | null;
  strictVisibilityLevel?: string | null;
  repositoryValueTier?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  moneyPriority?: 'P0' | 'P1' | 'P2' | 'P3' | null;
};

export type ModelTaskRouterDecisionOutput = {
  normalizedTaskType: NormalizedModelTaskType;
  capabilityTier: ModelTaskCapabilityTierName;
  routerPriorityClass: ModelTaskRouterPriorityClass;
  fallbackPolicy: ModelTaskFallbackPolicy;
  requiresReview: boolean;
  allowsFallback: boolean;
  allowsDeterministicFallback: boolean;
  retryClass: ModelTaskRouterRetryClass;
  costSensitivity: ModelRouterCostSensitivity;
  latencySensitivity: ModelTaskLatencyClass;
  routerReasonSummary: string;
};

export type ModelTaskRouterExecutionMetadata = {
  routerNormalizedTaskType: NormalizedModelTaskType;
  routerTaskIntent: ModelTaskIntent;
  routerCapabilityTier: ModelTaskCapabilityTierName;
  routerPriorityClass: ModelTaskRouterPriorityClass;
  routerFallbackPolicy: ModelTaskFallbackPolicy;
  routerRequiresReview: boolean;
  routerRetryClass: ModelTaskRouterRetryClass;
  routerCostSensitivity: ModelRouterCostSensitivity;
  routerLatencySensitivity: ModelTaskLatencyClass;
  routerReasonSummary: string;
  recalcGateDecision?: string | null;
  recalcGateReason?: string | null;
  recalcSignalChanged?: boolean;
  recalcSignalDiffSummary?: string | null;
  recalcGateConfidence?: string | null;
  recalcFingerprintHash?: string | null;
};

export type ModelTaskRouterCapabilityBreakdown = Record<
  ModelTaskCapabilityTierName,
  number
>;

export type ModelTaskRouterFallbackBreakdown = Record<
  ModelTaskFallbackPolicy,
  number
>;
