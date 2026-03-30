import {
  type ModelTaskCapabilityTier,
  type ModelTaskCapabilityTierName,
  type ModelTaskIntent,
  type ModelTaskRouterNormalizationInput,
  type ModelTaskRouterObservedSource,
  type ModelTaskRouterTaskDefinition,
  type NormalizedModelTaskType,
} from './model-task-router.types';

export const MODEL_TASK_ROUTER_SCHEMA_VERSION = 'model_task_router_v1';

export const MODEL_TASK_INTENTS: ModelTaskIntent[] = [
  'extract',
  'classify',
  'score',
  'synthesize',
  'repair',
  'recalc',
  'review',
  'downgrade',
  'cleanup',
];

export const MODEL_TASK_CAPABILITY_TIERS: Record<
  ModelTaskCapabilityTierName,
  ModelTaskCapabilityTier
> = {
  LIGHT: {
    tierName: 'LIGHT',
    costLevel: 'LOW',
    latencyLevel: 'LOW',
    allowedTaskTypes: [
      'snapshot',
      'fast_filter',
      'idea_extract',
      'evidence_repair',
      'refresh_only',
    ],
    maxBudgetWeight: 20,
  },
  STANDARD: {
    tierName: 'STANDARD',
    costLevel: 'MEDIUM',
    latencyLevel: 'MEDIUM',
    allowedTaskTypes: [
      'snapshot',
      'idea_extract',
      'idea_fit',
      'completeness',
      'evidence_repair',
      'refresh_only',
    ],
    maxBudgetWeight: 45,
  },
  HEAVY: {
    tierName: 'HEAVY',
    costLevel: 'HIGH',
    latencyLevel: 'HIGH',
    allowedTaskTypes: [
      'idea_extract',
      'idea_fit',
      'completeness',
      'deep_repair',
    ],
    maxBudgetWeight: 80,
  },
  REVIEW: {
    tierName: 'REVIEW',
    costLevel: 'HIGH',
    latencyLevel: 'HIGH',
    allowedTaskTypes: [
      'claude_review',
      'decision_recalc',
      'deep_repair',
    ],
    maxBudgetWeight: 100,
  },
  DETERMINISTIC_ONLY: {
    tierName: 'DETERMINISTIC_ONLY',
    costLevel: 'LOW',
    latencyLevel: 'LOW',
    allowedTaskTypes: [
      'fast_filter',
      'insight',
      'downgrade_only',
      'cleanup_related',
    ],
    maxBudgetWeight: 5,
  },
};

const TASK_DEFINITIONS: ModelTaskRouterTaskDefinition[] = [
  defineTask({
    normalizedTaskType: 'snapshot',
    taskIntent: 'extract',
    taskComplexity: 'MEDIUM',
    taskCriticality: 'HIGH',
    taskCostClass: 'MEDIUM',
    taskLatencyClass: 'MEDIUM',
    taskFallbackPolicy: 'PROVIDER_FALLBACK',
    taskDeterminismNeed: 'PREFERRED',
    taskEvidenceDependency: 'SUPPORTING',
    taskUserVisibility: 'USER_VISIBLE',
    routerDecisionBasis: 'EXISTING_ANALYSIS',
    routerCostSensitivity: 'MEDIUM',
    routerVisibilityLevel: 'VISIBLE',
    preferredCapabilityTier: 'STANDARD',
    failureEscalation: 'FALLBACK_ONLY',
    currentEntry: [
      'IdeaSnapshotService.analyzeRepositoryRecord',
      'QueueService.enqueueIdeaSnapshot',
      'GitHubService.processIdeaSnapshotQueueJob',
      'HistoricalDataRecoveryService.enqueueHistoricalRefresh',
      'HistoricalDataRecoveryService.enqueueHistoricalEvidenceRepair',
    ],
    currentConsumer: [
      'IdeaSnapshotService',
      'GitHubService',
      'RepositoryInsightService.refreshInsight',
      'HistoricalDataRecoveryService',
    ],
    currentPrioritySource: [
      'GitHub backfill ordering',
      'historicalRepairPriorityScore -> Queue priority',
      'queue default attempts/backoff',
    ],
    currentFallback: [
      'AiRouterService provider fallback',
      'nextAction KEEP/SKIP/DEEP_ANALYZE 作为后续分流',
    ],
    currentModelDependency: [
      'AiTaskType.idea_snapshot via AiRouterService',
      'OMLX/OpenAI provider routing',
    ],
    aliases: {
      aiTaskTypes: ['idea_snapshot'],
      queueJobTypes: ['analysis.idea_snapshot'],
      directTaskTypes: ['snapshot'],
    },
    notes: '当前是最早进入 analysis pipeline 的结构化抽取任务。',
  }),
  defineTask({
    normalizedTaskType: 'fast_filter',
    taskIntent: 'classify',
    taskComplexity: 'LOW',
    taskCriticality: 'LOW',
    taskCostClass: 'LOW',
    taskLatencyClass: 'LOW',
    taskFallbackPolicy: 'DETERMINISTIC_ONLY',
    taskDeterminismNeed: 'REQUIRED',
    taskEvidenceDependency: 'NONE',
    taskUserVisibility: 'INTERNAL',
    routerDecisionBasis: 'HEURISTIC_RULES',
    routerCostSensitivity: 'EXTREME',
    routerVisibilityLevel: 'BACKGROUND',
    preferredCapabilityTier: 'DETERMINISTIC_ONLY',
    failureEscalation: 'NONE',
    currentEntry: [
      'FastFilterService.evaluateRepository',
      'FastFilterService.evaluateBatchDirect',
      'QueueService.enqueueFastFilterBatch',
    ],
    currentConsumer: [
      'FastFilterService.evaluateByRules',
      'QueueWorkerService.handleFastFilterBatch',
    ],
    currentPrioritySource: ['caller-selected batch limit/order'],
    currentFallback: ['规则引擎本身就是 deterministic fallback'],
    currentModelDependency: [
      'none active',
      'AiRouter rough_filter path exists but is reserved extension only',
    ],
    aliases: {
      aiTaskTypes: ['rough_filter'],
      queueJobTypes: ['fast_filter.batch'],
      jobNames: ['fast_filter.batch'],
      directTaskTypes: ['fast_filter'],
    },
    notes: '当前真实执行路径是规则过滤，不应抢高成本模型能力。',
  }),
  defineTask({
    normalizedTaskType: 'insight',
    taskIntent: 'synthesize',
    taskComplexity: 'MEDIUM',
    taskCriticality: 'HIGH',
    taskCostClass: 'LOW',
    taskLatencyClass: 'LOW',
    taskFallbackPolicy: 'DETERMINISTIC_ONLY',
    taskDeterminismNeed: 'REQUIRED',
    taskEvidenceDependency: 'REQUIRED',
    taskUserVisibility: 'TRUST_CRITICAL',
    routerDecisionBasis: 'EXISTING_ANALYSIS',
    routerCostSensitivity: 'HIGH',
    routerVisibilityLevel: 'TRUST_CRITICAL',
    preferredCapabilityTier: 'DETERMINISTIC_ONLY',
    failureEscalation: 'NONE',
    currentEntry: [
      'RepositoryInsightService.refreshInsight',
      'AnalysisOrchestratorService.executeRepositoryAnalysis',
      'IdeaSnapshot/Completeness/IdeaFit/IdeaExtract completion hooks',
      'HistoricalDataRecoveryService.rerunLightAnalysis',
      'HistoricalDataRecoveryService.enqueueHistoricalDecisionRecalc',
    ],
    currentConsumer: [
      'RepositoryInsightService',
      'RepositoryDecisionService',
      'RepositoryCachedRankingService',
    ],
    currentPrioritySource: [
      'upstream analysis completion',
      'historicalRepairPriorityScore when recalc triggered',
    ],
    currentFallback: ['deterministic synthesis from existing analysis/evidence'],
    currentModelDependency: ['none direct'],
    aliases: {
      directTaskTypes: ['insight'],
      serviceModes: ['rerun_light_analysis'],
    },
    notes: '当前是 deterministic synthesis，但对 trusted / decision 影响很高。',
  }),
  defineTask({
    normalizedTaskType: 'idea_extract',
    taskIntent: 'extract',
    taskComplexity: 'HIGH',
    taskCriticality: 'HIGH',
    taskCostClass: 'MEDIUM',
    taskLatencyClass: 'HIGH',
    taskFallbackPolicy: 'LIGHT_DERIVATION',
    taskDeterminismNeed: 'OPTIONAL',
    taskEvidenceDependency: 'REQUIRED',
    taskUserVisibility: 'TRUST_CRITICAL',
    routerDecisionBasis: 'EVIDENCE_GAPS',
    routerCostSensitivity: 'MEDIUM',
    routerVisibilityLevel: 'TRUST_CRITICAL',
    preferredCapabilityTier: 'STANDARD',
    failureEscalation: 'FALLBACK_ONLY',
    currentEntry: [
      'IdeaExtractService.analyzeRepositoryRecord',
      'AnalysisOrchestratorService.executeRepositoryAnalysis',
      'analysis.run_single with runIdeaExtract=true',
    ],
    currentConsumer: [
      'IdeaExtractService',
      'RepositoryInsightService.refreshInsight',
      'EvidenceMapService',
    ],
    currentPrioritySource: [
      'AnalysisOrchestrator deep entry',
      'idea extract limiter / queue order',
      'historicalRepairPriorityScore through deep_repair',
    ],
    currentFallback: [
      'light extract from existing insight',
      'AiRouterService provider fallback',
    ],
    currentModelDependency: [
      'AiTaskType.idea_extract via AiRouterService',
      'light mode can run with derived provider',
    ],
    aliases: {
      aiTaskTypes: ['idea_extract'],
      directTaskTypes: ['idea_extract'],
    },
    notes: '当前已经有 light/full 两档执行模式，天然适合 router tier 化。',
  }),
  defineTask({
    normalizedTaskType: 'idea_fit',
    taskIntent: 'score',
    taskComplexity: 'MEDIUM',
    taskCriticality: 'HIGH',
    taskCostClass: 'MEDIUM',
    taskLatencyClass: 'MEDIUM',
    taskFallbackPolicy: 'PROVIDER_FALLBACK',
    taskDeterminismNeed: 'PREFERRED',
    taskEvidenceDependency: 'REQUIRED',
    taskUserVisibility: 'TRUST_CRITICAL',
    routerDecisionBasis: 'QUALITY_AND_EVIDENCE',
    routerCostSensitivity: 'MEDIUM',
    routerVisibilityLevel: 'TRUST_CRITICAL',
    preferredCapabilityTier: 'STANDARD',
    failureEscalation: 'FALLBACK_ONLY',
    currentEntry: [
      'IdeaFitService.analyzeRepositoryRecord',
      'AnalysisOrchestratorService.executeRepositoryAnalysis',
      'analysis.run_single with runIdeaFit=true',
    ],
    currentConsumer: [
      'IdeaFitService',
      'RepositoryInsightService.refreshInsight',
      'EvidenceMapService',
    ],
    currentPrioritySource: [
      'AnalysisOrchestrator deep entry',
      'historicalRepairPriorityScore through deep_repair',
    ],
    currentFallback: ['AiRouterService provider fallback'],
    currentModelDependency: ['AiTaskType.idea_fit via AiRouterService'],
    aliases: {
      aiTaskTypes: ['idea_fit'],
      directTaskTypes: ['idea_fit'],
    },
  }),
  defineTask({
    normalizedTaskType: 'completeness',
    taskIntent: 'score',
    taskComplexity: 'MEDIUM',
    taskCriticality: 'HIGH',
    taskCostClass: 'MEDIUM',
    taskLatencyClass: 'MEDIUM',
    taskFallbackPolicy: 'PROVIDER_FALLBACK',
    taskDeterminismNeed: 'PREFERRED',
    taskEvidenceDependency: 'REQUIRED',
    taskUserVisibility: 'TRUST_CRITICAL',
    routerDecisionBasis: 'QUALITY_AND_EVIDENCE',
    routerCostSensitivity: 'MEDIUM',
    routerVisibilityLevel: 'TRUST_CRITICAL',
    preferredCapabilityTier: 'STANDARD',
    failureEscalation: 'FALLBACK_ONLY',
    currentEntry: [
      'CompletenessService.analyzeRepositoryRecord',
      'AnalysisOrchestratorService.executeRepositoryAnalysis',
      'analysis.run_single with runCompleteness=true',
    ],
    currentConsumer: [
      'CompletenessService',
      'RepositoryInsightService.refreshInsight',
      'EvidenceMapService',
    ],
    currentPrioritySource: [
      'AnalysisOrchestrator deep entry',
      'historicalRepairPriorityScore through deep_repair',
    ],
    currentFallback: ['AiRouterService provider fallback'],
    currentModelDependency: ['AiTaskType.completeness via AiRouterService'],
    aliases: {
      aiTaskTypes: ['completeness'],
      directTaskTypes: ['completeness'],
    },
  }),
  defineTask({
    normalizedTaskType: 'evidence_repair',
    taskIntent: 'repair',
    taskComplexity: 'MEDIUM',
    taskCriticality: 'HIGH',
    taskCostClass: 'MEDIUM',
    taskLatencyClass: 'MEDIUM',
    taskFallbackPolicy: 'RETRY_THEN_DOWNGRADE',
    taskDeterminismNeed: 'PREFERRED',
    taskEvidenceDependency: 'CRITICAL',
    taskUserVisibility: 'TRUST_CRITICAL',
    routerDecisionBasis: 'REPAIR_BUCKET',
    routerCostSensitivity: 'MEDIUM',
    routerVisibilityLevel: 'TRUST_CRITICAL',
    preferredCapabilityTier: 'STANDARD',
    failureEscalation: 'DOWNGRADE_ONLY',
    currentEntry: [
      'HistoricalRepairPriorityService.runPriorityReport',
      'HistoricalDataRecoveryService.enqueueHistoricalEvidenceRepair',
      'AdaptiveSchedulerService.triggerRecoveryFromHealth',
    ],
    currentConsumer: [
      'HistoricalDataRecoveryService',
      'QueueService.enqueueIdeaSnapshot',
      'EvidenceMapService (post-refresh consumer)',
    ],
    currentPrioritySource: [
      'historicalRepairPriorityScore',
      'historicalRepairBucket',
      'key evidence weak/missing gaps',
    ],
    currentFallback: [
      'refresh_only',
      'downgrade_only when ROI stays low',
    ],
    currentModelDependency: [
      'indirect snapshot model via idea_snapshot',
      'may stay deterministic if refresh yields no new evidence',
    ],
    aliases: {
      repairActions: ['evidence_repair'],
      directTaskTypes: ['evidence_repair'],
    },
  }),
  defineTask({
    normalizedTaskType: 'deep_repair',
    taskIntent: 'repair',
    taskComplexity: 'HIGH',
    taskCriticality: 'CRITICAL',
    taskCostClass: 'HIGH',
    taskLatencyClass: 'HIGH',
    taskFallbackPolicy: 'RETRY_THEN_REVIEW',
    taskDeterminismNeed: 'PREFERRED',
    taskEvidenceDependency: 'CRITICAL',
    taskUserVisibility: 'TRUST_CRITICAL',
    routerDecisionBasis: 'REPAIR_BUCKET',
    routerCostSensitivity: 'LOW',
    routerVisibilityLevel: 'TRUST_CRITICAL',
    preferredCapabilityTier: 'HEAVY',
    failureEscalation: 'REVIEW_REQUIRED',
    currentEntry: [
      'HistoricalRepairPriorityService.runPriorityReport',
      'HistoricalDataRecoveryService.enqueueHistoricalDeepRepair',
      'AnalysisOrchestratorService.ensureMissingDeepAnalysisQueued',
      'AdaptiveSchedulerService.triggerRecoveryFromHealth',
    ],
    currentConsumer: [
      'HistoricalDataRecoveryService',
      'QueueService.enqueueSingleAnalysis',
      'AnalysisOrchestratorService',
    ],
    currentPrioritySource: [
      'historicalRepairPriorityScore',
      'hasFinalDecision && !hasDeep',
      'key missing evidence taxonomy',
    ],
    currentFallback: [
      'queue_claude_review',
      'downgrade_only when cleanupState blocks repair',
    ],
    currentModelDependency: [
      'analysis.run_single -> completeness/idea_fit/idea_extract stack',
      'may escalate to Claude review in separate flow',
    ],
    aliases: {
      repairActions: ['deep_repair'],
      directTaskTypes: ['deep_repair'],
      serviceModes: ['rerun_full_deep'],
    },
  }),
  defineTask({
    normalizedTaskType: 'decision_recalc',
    taskIntent: 'recalc',
    taskComplexity: 'HIGH',
    taskCriticality: 'CRITICAL',
    taskCostClass: 'HIGH',
    taskLatencyClass: 'MEDIUM',
    taskFallbackPolicy: 'RETRY_THEN_REVIEW',
    taskDeterminismNeed: 'REQUIRED',
    taskEvidenceDependency: 'CRITICAL',
    taskUserVisibility: 'TRUST_CRITICAL',
    routerDecisionBasis: 'QUALITY_AND_EVIDENCE',
    routerCostSensitivity: 'LOW',
    routerVisibilityLevel: 'TRUST_CRITICAL',
    preferredCapabilityTier: 'REVIEW',
    failureEscalation: 'REVIEW_REQUIRED',
    currentEntry: [
      'HistoricalRepairPriorityService.runPriorityReport',
      'HistoricalDataRecoveryService.enqueueHistoricalDecisionRecalc',
      'HistoricalDataRecoveryService.rerunLightAnalysis',
    ],
    currentConsumer: [
      'HistoricalDataRecoveryService',
      'QueueService.enqueueSingleAnalysis',
      'RepositoryInsightService.refreshInsight',
      'RepositoryDecisionService',
    ],
    currentPrioritySource: [
      'evidence conflict taxonomy',
      'historicalRepairPriorityScore',
      'fallback/conflict/incomplete flags',
    ],
    currentFallback: [
      'queue_claude_review',
      'downgrade_only when visible unsafe but low ROI',
    ],
    currentModelDependency: [
      'none direct in current implementation',
      'may enter claude_review for manual reconciliation',
    ],
    aliases: {
      repairActions: ['decision_recalc'],
      directTaskTypes: ['decision_recalc'],
      serviceModes: ['rerun_light_analysis'],
    },
    notes: '当前执行主要是 deterministic recalc，但语义上属于高敏感 review/recalc 类任务。',
  }),
  defineTask({
    normalizedTaskType: 'claude_review',
    taskIntent: 'review',
    taskComplexity: 'HIGH',
    taskCriticality: 'CRITICAL',
    taskCostClass: 'HIGH',
    taskLatencyClass: 'HIGH',
    taskFallbackPolicy: 'PROVIDER_FALLBACK',
    taskDeterminismNeed: 'OPTIONAL',
    taskEvidenceDependency: 'CRITICAL',
    taskUserVisibility: 'TRUST_CRITICAL',
    routerDecisionBasis: 'REVIEW_DIFF',
    routerCostSensitivity: 'LOW',
    routerVisibilityLevel: 'TRUST_CRITICAL',
    preferredCapabilityTier: 'REVIEW',
    failureEscalation: 'REVIEW_REQUIRED',
    currentEntry: [
      'ClaudeReviewService.reviewRepositoryIds',
      'HistoricalDataRecoveryService.queueClaudeReview',
      'ClaudeReviewSchedulerService',
      'RadarDailyReportService',
      'GitHubController.manual claude review',
    ],
    currentConsumer: [
      'ClaudeReviewService',
      'RepositoryDecisionService',
      'ClaudeConcurrencyService',
    ],
    currentPrioritySource: [
      'resolveClaudeReviewPriority',
      'ClaudeConcurrencyService',
      'homepage/daily summary/manual triggers',
    ],
    currentFallback: [
      'Anthropic primary -> OMLX basic_analysis fallback',
      'manual replay if both fail',
    ],
    currentModelDependency: [
      'AnthropicProvider primary',
      'OMLX basic_analysis local fallback',
    ],
    aliases: {
      aiTaskTypes: ['basic_analysis'],
      directTaskTypes: ['claude_review'],
      serviceModes: ['queue_claude_review'],
    },
  }),
  defineTask({
    normalizedTaskType: 'refresh_only',
    taskIntent: 'repair',
    taskComplexity: 'LOW',
    taskCriticality: 'MEDIUM',
    taskCostClass: 'LOW',
    taskLatencyClass: 'LOW',
    taskFallbackPolicy: 'DETERMINISTIC_ONLY',
    taskDeterminismNeed: 'REQUIRED',
    taskEvidenceDependency: 'SUPPORTING',
    taskUserVisibility: 'DERIVED_INTERNAL',
    routerDecisionBasis: 'REPAIR_BUCKET',
    routerCostSensitivity: 'HIGH',
    routerVisibilityLevel: 'INTERNAL',
    preferredCapabilityTier: 'LIGHT',
    failureEscalation: 'NONE',
    currentEntry: [
      'HistoricalRepairPriorityService.runPriorityReport',
      'HistoricalDataRecoveryService.enqueueHistoricalRefresh',
    ],
    currentConsumer: [
      'HistoricalDataRecoveryService',
      'QueueService.enqueueIdeaSnapshot',
    ],
    currentPrioritySource: [
      'historicalRepairPriorityScore',
      'stale_watch / freshness pressure',
    ],
    currentFallback: ['skip refresh when cleanupState slows collection'],
    currentModelDependency: ['indirect snapshot refresh path'],
    aliases: {
      repairActions: ['refresh_only'],
      directTaskTypes: ['refresh_only'],
    },
  }),
  defineTask({
    normalizedTaskType: 'downgrade_only',
    taskIntent: 'downgrade',
    taskComplexity: 'LOW',
    taskCriticality: 'HIGH',
    taskCostClass: 'LOW',
    taskLatencyClass: 'LOW',
    taskFallbackPolicy: 'DOWNGRADE_ONLY',
    taskDeterminismNeed: 'REQUIRED',
    taskEvidenceDependency: 'CRITICAL',
    taskUserVisibility: 'TRUST_CRITICAL',
    routerDecisionBasis: 'CLEANUP_POLICY',
    routerCostSensitivity: 'EXTREME',
    routerVisibilityLevel: 'TRUST_CRITICAL',
    preferredCapabilityTier: 'DETERMINISTIC_ONLY',
    failureEscalation: 'NONE',
    currentEntry: [
      'HistoricalRepairPriorityService.runPriorityReport',
      'HistoricalDataRecoveryService.runHistoricalRepairLoop',
      'RadarDailySummaryService currentAction=downgrade_only',
    ],
    currentConsumer: [
      'RepositoryAnalysisStatusHelper',
      'frontend guard snapshot persistence',
      'HistoricalDataRecoveryService',
    ],
    currentPrioritySource: [
      'visible unsafe + low ROI',
      'cleanupState and frontend guard policy',
    ],
    currentFallback: ['already final state, no further automatic fallback'],
    currentModelDependency: ['none direct'],
    aliases: {
      repairActions: ['downgrade_only'],
      directTaskTypes: ['downgrade_only'],
    },
  }),
  defineTask({
    normalizedTaskType: 'cleanup_related',
    taskIntent: 'cleanup',
    taskComplexity: 'LOW',
    taskCriticality: 'MEDIUM',
    taskCostClass: 'LOW',
    taskLatencyClass: 'LOW',
    taskFallbackPolicy: 'DETERMINISTIC_ONLY',
    taskDeterminismNeed: 'REQUIRED',
    taskEvidenceDependency: 'SUPPORTING',
    taskUserVisibility: 'DERIVED_INTERNAL',
    routerDecisionBasis: 'CLEANUP_POLICY',
    routerCostSensitivity: 'EXTREME',
    routerVisibilityLevel: 'BACKGROUND',
    preferredCapabilityTier: 'DETERMINISTIC_ONLY',
    failureEscalation: 'NONE',
    currentEntry: [
      'HistoricalCleanupPolicyHelper.evaluateCleanupPolicy',
      'RepositoryCleanupReport',
      'HistoricalRepairPriorityHelper.applyCleanupStateToRepairAction',
    ],
    currentConsumer: [
      'HistoricalRepairPriorityService',
      'AdaptiveSchedulerService lane suppression',
      'HistoricalDataRecoveryService active-only filter',
    ],
    currentPrioritySource: [
      'cleanupState',
      'cleanupReason taxonomy',
      'collection policy slowdown',
    ],
    currentFallback: ['freeze -> archive -> purge_ready progression'],
    currentModelDependency: ['none direct'],
    aliases: {
      directTaskTypes: ['cleanup_related'],
    },
  }),
];

const OBSERVED_SOURCES: ModelTaskRouterObservedSource[] = [
  observe('aiTaskType', 'rough_filter', 'fast_filter', 'UNIFIED', 'AI task alias exists but active path is still rule-based fast filter.'),
  observe('aiTaskType', 'idea_snapshot', 'snapshot', 'UNIFIED', 'Primary snapshot extraction model task.'),
  observe('aiTaskType', 'idea_extract', 'idea_extract', 'UNIFIED', 'Full extract path plus light fallback share one normalized task.'),
  observe('aiTaskType', 'idea_fit', 'idea_fit', 'UNIFIED', 'Idea fit scoring maps directly.'),
  observe('aiTaskType', 'completeness', 'completeness', 'UNIFIED', 'Completeness scoring maps directly.'),
  observe('aiTaskType', 'basic_analysis', 'claude_review', 'UNIFIED', 'Used as local fallback in Claude review flow.'),
  observe('queueJobType', 'analysis.idea_snapshot', 'snapshot', 'UNIFIED', 'Snapshot queue job maps directly.'),
  observe('queueJobType', 'fast_filter.batch', 'fast_filter', 'UNIFIED', 'Batch wrapper still lands on normalized fast_filter.'),
  observe('repairAction', 'evidence_repair', 'evidence_repair', 'UNIFIED', 'Historical repair action already normalized.'),
  observe('repairAction', 'deep_repair', 'deep_repair', 'UNIFIED', 'Historical repair action already normalized.'),
  observe('repairAction', 'decision_recalc', 'decision_recalc', 'UNIFIED', 'Historical repair action already normalized.'),
  observe('repairAction', 'refresh_only', 'refresh_only', 'UNIFIED', 'Historical repair action already normalized.'),
  observe('repairAction', 'downgrade_only', 'downgrade_only', 'UNIFIED', 'Historical repair action already normalized.'),
  observe('serviceMode', 'queue_claude_review', 'claude_review', 'UNIFIED', 'Historical recovery mode maps into Claude review.'),
  observe('queueJobType', 'analysis.run_single', null, 'ORCHESTRATION_ONLY', 'Queue wrapper carries multiple semantic tasks and needs extra context before normalization.'),
  observe('queueJobType', 'analysis.run_batch', null, 'ORCHESTRATION_ONLY', 'Batch orchestration wrapper; not a single semantic model task.'),
  observe('queueJobType', 'github.fetch_repositories', null, 'OUT_OF_SCOPE', 'Collection task, not a model-router task in this phase.'),
  observe('queueJobType', 'github.backfill_created_repositories', null, 'OUT_OF_SCOPE', 'Collection/backfill task, not a model-router task in this phase.'),
];

export type ModelTaskRouterInventoryReport = {
  schemaVersion: string;
  generatedAt: string;
  summary: {
    normalizedTaskTypeCount: number;
    observedRawTaskSourceCount: number;
    unifiedObservedSourceCount: number;
    orchestrationOnlySourceCount: number;
    outOfScopeSourceCount: number;
    capabilityTierBreakdown: Record<ModelTaskCapabilityTierName, number>;
    tasksRequiringHeavyCapability: NormalizedModelTaskType[];
    tasksRequiringReviewCapability: NormalizedModelTaskType[];
    lightCapableTasks: NormalizedModelTaskType[];
    deterministicOnlyTasks: NormalizedModelTaskType[];
    failureReviewTasks: NormalizedModelTaskType[];
    fallbackOnlyTasks: NormalizedModelTaskType[];
    stillNotUnified: ModelTaskRouterObservedSource[];
  };
  capabilityTiers: ModelTaskCapabilityTier[];
  tasks: ModelTaskRouterTaskDefinition[];
  observedSources: ModelTaskRouterObservedSource[];
};

export function listModelTaskRouterDefinitions() {
  return TASK_DEFINITIONS.slice();
}

export function listModelTaskCapabilityTiers() {
  return Object.values(MODEL_TASK_CAPABILITY_TIERS);
}

export function listObservedModelTaskSources() {
  return OBSERVED_SOURCES.slice();
}

export function getModelTaskRouterDefinition(
  normalizedTaskType: NormalizedModelTaskType,
) {
  return TASK_DEFINITIONS.find(
    (definition) => definition.normalizedTaskType === normalizedTaskType,
  ) ?? null;
}

export function normalizeModelTaskType(
  input: ModelTaskRouterNormalizationInput,
): NormalizedModelTaskType | null {
  const candidates = [
    normalizeToken(input.directTaskType),
    normalizeToken(input.repairAction),
    normalizeToken(input.aiTaskType),
    normalizeToken(input.serviceMode),
    normalizeToken(input.queueJobType),
    normalizeToken(input.jobName),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    for (const definition of TASK_DEFINITIONS) {
      if (matchesAlias(definition, candidate)) {
        return definition.normalizedTaskType;
      }
    }
  }

  return null;
}

export function buildModelTaskRouterInventoryReport(): ModelTaskRouterInventoryReport {
  const tasks = listModelTaskRouterDefinitions();
  const observedSources = listObservedModelTaskSources();
  const unifiedObservedSourceCount = observedSources.filter(
    (item) => item.coverage === 'UNIFIED',
  ).length;
  const orchestrationOnlySourceCount = observedSources.filter(
    (item) => item.coverage === 'ORCHESTRATION_ONLY',
  ).length;
  const outOfScopeSourceCount = observedSources.filter(
    (item) => item.coverage === 'OUT_OF_SCOPE',
  ).length;

  return {
    schemaVersion: MODEL_TASK_ROUTER_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    summary: {
      normalizedTaskTypeCount: tasks.length,
      observedRawTaskSourceCount: observedSources.length,
      unifiedObservedSourceCount,
      orchestrationOnlySourceCount,
      outOfScopeSourceCount,
      capabilityTierBreakdown: buildCapabilityTierBreakdown(tasks),
      tasksRequiringHeavyCapability: tasks
        .filter((task) => task.preferredCapabilityTier === 'HEAVY')
        .map((task) => task.normalizedTaskType),
      tasksRequiringReviewCapability: tasks
        .filter((task) => task.preferredCapabilityTier === 'REVIEW')
        .map((task) => task.normalizedTaskType),
      lightCapableTasks: tasks
        .filter(
          (task) =>
            task.preferredCapabilityTier === 'LIGHT' ||
            task.taskFallbackPolicy === 'LIGHT_DERIVATION',
        )
        .map((task) => task.normalizedTaskType),
      deterministicOnlyTasks: tasks
        .filter(
          (task) =>
            task.preferredCapabilityTier === 'DETERMINISTIC_ONLY' ||
            task.taskFallbackPolicy === 'DETERMINISTIC_ONLY',
        )
        .map((task) => task.normalizedTaskType),
      failureReviewTasks: tasks
        .filter((task) => task.failureEscalation === 'REVIEW_REQUIRED')
        .map((task) => task.normalizedTaskType),
      fallbackOnlyTasks: tasks
        .filter((task) => task.failureEscalation === 'FALLBACK_ONLY')
        .map((task) => task.normalizedTaskType),
      stillNotUnified: observedSources.filter(
        (item) => item.coverage !== 'UNIFIED',
      ),
    },
    capabilityTiers: listModelTaskCapabilityTiers(),
    tasks,
    observedSources,
  };
}

export function renderModelTaskRouterInventoryMarkdown(
  report: ModelTaskRouterInventoryReport,
) {
  const lines = [
    '# GitDian Model Task Router Inventory',
    '',
    `- schemaVersion: ${report.schemaVersion}`,
    `- generatedAt: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- normalizedTaskTypeCount: ${report.summary.normalizedTaskTypeCount}`,
    `- observedRawTaskSourceCount: ${report.summary.observedRawTaskSourceCount}`,
    `- unifiedObservedSourceCount: ${report.summary.unifiedObservedSourceCount}`,
    `- orchestrationOnlySourceCount: ${report.summary.orchestrationOnlySourceCount}`,
    `- outOfScopeSourceCount: ${report.summary.outOfScopeSourceCount}`,
    '',
    '## Capability Tier Breakdown',
    '',
    ...Object.entries(report.summary.capabilityTierBreakdown).map(
      ([tier, count]) => `- ${tier}: ${count}`,
    ),
    '',
    `- tasksRequiringHeavyCapability: ${renderList(report.summary.tasksRequiringHeavyCapability)}`,
    `- tasksRequiringReviewCapability: ${renderList(report.summary.tasksRequiringReviewCapability)}`,
    `- lightCapableTasks: ${renderList(report.summary.lightCapableTasks)}`,
    `- deterministicOnlyTasks: ${renderList(report.summary.deterministicOnlyTasks)}`,
    `- failureReviewTasks: ${renderList(report.summary.failureReviewTasks)}`,
    `- fallbackOnlyTasks: ${renderList(report.summary.fallbackOnlyTasks)}`,
    '',
    '## Still Not Unified',
    '',
    ...renderUnresolvedSources(report.summary.stillNotUnified),
    '',
    '## Capability Tiers',
    '',
    ...report.capabilityTiers.flatMap((tier) => [
      `### ${tier.tierName}`,
      `- costLevel: ${tier.costLevel}`,
      `- latencyLevel: ${tier.latencyLevel}`,
      `- maxBudgetWeight: ${tier.maxBudgetWeight}`,
      `- allowedTaskTypes: ${renderList(tier.allowedTaskTypes)}`,
      '',
    ]),
    '## Task Inventory',
    '',
    ...report.tasks.flatMap((task) => [
      `### ${task.normalizedTaskType}`,
      `- taskIntent: ${task.taskIntent}`,
      `- preferredCapabilityTier: ${task.preferredCapabilityTier}`,
      `- taskComplexity: ${task.taskComplexity}`,
      `- taskCriticality: ${task.taskCriticality}`,
      `- taskCostClass: ${task.taskCostClass}`,
      `- taskLatencyClass: ${task.taskLatencyClass}`,
      `- taskFallbackPolicy: ${task.taskFallbackPolicy}`,
      `- taskDeterminismNeed: ${task.taskDeterminismNeed}`,
      `- taskEvidenceDependency: ${task.taskEvidenceDependency}`,
      `- taskUserVisibility: ${task.taskUserVisibility}`,
      `- routerDecisionBasis: ${task.routerDecisionBasis}`,
      `- routerCostSensitivity: ${task.routerCostSensitivity}`,
      `- routerVisibilityLevel: ${task.routerVisibilityLevel}`,
      `- failureEscalation: ${task.failureEscalation}`,
      `- currentEntry: ${renderList(task.currentEntry)}`,
      `- currentConsumer: ${renderList(task.currentConsumer)}`,
      `- currentPrioritySource: ${renderList(task.currentPrioritySource)}`,
      `- currentFallback: ${renderList(task.currentFallback)}`,
      `- currentModelDependency: ${renderList(task.currentModelDependency)}`,
      task.notes ? `- notes: ${task.notes}` : null,
      '',
    ]).filter(Boolean) as string[],
  ];

  return lines.join('\n');
}

function defineTask(
  definition: ModelTaskRouterTaskDefinition,
): ModelTaskRouterTaskDefinition {
  return definition;
}

function observe(
  sourceKind: ModelTaskRouterObservedSource['sourceKind'],
  sourceValue: string,
  normalizedTaskType: NormalizedModelTaskType | null,
  coverage: ModelTaskRouterObservedSource['coverage'],
  note: string,
): ModelTaskRouterObservedSource {
  return {
    sourceKind,
    sourceValue,
    normalizedTaskType,
    coverage,
    note,
  };
}

function normalizeToken(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function matchesAlias(
  definition: ModelTaskRouterTaskDefinition,
  candidate: string,
) {
  const aliases = definition.aliases;
  return [
    ...(aliases.aiTaskTypes ?? []),
    ...(aliases.queueJobTypes ?? []),
    ...(aliases.jobNames ?? []),
    ...(aliases.repairActions ?? []),
    ...(aliases.serviceModes ?? []),
    ...(aliases.directTaskTypes ?? []),
    definition.normalizedTaskType,
  ].includes(candidate);
}

function buildCapabilityTierBreakdown(tasks: ModelTaskRouterTaskDefinition[]) {
  return tasks.reduce<Record<ModelTaskCapabilityTierName, number>>(
    (accumulator, task) => {
      accumulator[task.preferredCapabilityTier] += 1;
      return accumulator;
    },
    {
      LIGHT: 0,
      STANDARD: 0,
      HEAVY: 0,
      REVIEW: 0,
      DETERMINISTIC_ONLY: 0,
    },
  );
}

function renderList(values: string[]) {
  return values.length ? values.join(' | ') : 'none';
}

function renderUnresolvedSources(items: ModelTaskRouterObservedSource[]) {
  if (!items.length) {
    return ['- none'];
  }

  return items.map((item) => {
    const mapped = item.normalizedTaskType ?? 'unmapped';
    return `- ${item.sourceKind}:${item.sourceValue} -> ${mapped} (${item.coverage}) | ${item.note}`;
  });
}
