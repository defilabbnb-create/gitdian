import {
  ANALYSIS_OUTCOME_ACTIONS,
  ANALYSIS_OUTCOME_STATUSES,
  ANALYSIS_REPAIR_VALUE_CLASSES,
  buildAnalysisOutcomeSnapshot,
} from './analysis-outcome.helper';
import type {
  AnalysisOutcomeActionKey,
  AnalysisOutcomeLog,
  AnalysisOutcomeSnapshot,
  AnalysisOutcomeStatus,
  AnalysisRepairValueClass,
} from './analysis-outcome.types';
import type { KeyEvidenceGapTaxonomy } from './evidence-gap-taxonomy.helper';
import type { HistoricalInventoryQualityState } from './historical-data-inventory.helper';
import type {
  ModelTaskCapabilityTierName,
  ModelTaskFallbackPolicy,
  NormalizedModelTaskType,
} from './model-task-router.types';

type CapabilityTierKey = ModelTaskCapabilityTierName | 'NONE';
type QualityStateKey = HistoricalInventoryQualityState | 'UNKNOWN';
type TrendStrength = 'insufficient' | 'early' | 'usable';

type ActionEffectivenessItem = {
  action: AnalysisOutcomeActionKey;
  count: number;
  outcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
  repairValueClassBreakdown: Record<AnalysisRepairValueClass, number>;
  averageQualityDelta: number;
  averageGapCountDelta: number;
  averageBlockingGapDelta: number;
  qualityImprovementCount: number;
  gapReductionCount: number;
  trustedChangedCount: number;
  decisionChangedCount: number;
  fallbackUsedCount: number;
  reviewUsedCount: number;
  highOrMediumCount: number;
  lowOrNegativeCount: number;
  noChangeCount: number;
};

type CapabilityCalibrationItem = {
  capabilityTier: CapabilityTierKey;
  count: number;
  outcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
  repairValueClassBreakdown: Record<AnalysisRepairValueClass, number>;
  averageQualityDelta: number;
  highOrMediumCount: number;
  lowOrNegativeCount: number;
  noChangeCount: number;
  reviewUsedCount: number;
  fallbackUsedCount: number;
};

type TaskTypeCalibrationItem = {
  taskType: NormalizedModelTaskType;
  count: number;
  predominantCapabilityTier: CapabilityTierKey;
  capabilityTierBreakdown: Record<CapabilityTierKey, number>;
  averageQualityDelta: number;
  highOrMediumCount: number;
  lowOrNegativeCount: number;
  noChangeCount: number;
  requiresReviewCount: number;
  deterministicOnlyCount: number;
};

type QualityCalibrationItem = {
  qualityState: QualityStateKey;
  count: number;
  outcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
  repairValueClassBreakdown: Record<AnalysisRepairValueClass, number>;
  averageQualityDelta: number;
  averageGapCountDelta: number;
  highOrMediumCount: number;
  lowOrNegativeCount: number;
  trustedChangedCount: number;
  decisionChangedCount: number;
};

type GapCalibrationItem = {
  gap: KeyEvidenceGapTaxonomy;
  count: number;
  averageQualityDelta: number;
  averageGapCountDelta: number;
  highOrMediumCount: number;
  lowOrNegativeCount: number;
  noChangeCount: number;
  decisionChangedCount: number;
  trustedChangedCount: number;
  reviewUsedCount: number;
};

type CalibrationSample = {
  repositoryId: string;
  taskType: NormalizedModelTaskType;
  action: AnalysisOutcomeActionKey | null;
  capabilityTier: CapabilityTierKey;
  qualityStateBefore: QualityStateKey;
  outcomeStatus: AnalysisOutcomeStatus;
  repairValueClass: AnalysisRepairValueClass;
  qualityDelta: number;
  gapCountDelta: number;
  blockingGapDelta: number;
  reason: string;
};

export type AnalysisCalibrationReport = {
  generatedAt: string;
  source: {
    outcomeGeneratedAt: string | null;
    latestRunGeneratedAt: string | null;
    seededFromDryRun: boolean;
    totalLogged: number;
    actionableCount: number;
    cleanupDominated: boolean;
    cleanupDominatedRatio: number;
    trendStrength: TrendStrength;
  };
  calibrationInputs: {
    beforeFields: string[];
    routerFields: string[];
    afterFields: string[];
    deltaFields: string[];
  };
  repairEffectivenessSummary: {
    actionSummaries: ActionEffectivenessItem[];
    topValueActions: ActionEffectivenessItem[];
    topNoChangeActions: ActionEffectivenessItem[];
    topQualityImprovementActions: ActionEffectivenessItem[];
    topGapReductionActions: ActionEffectivenessItem[];
    topTrustedChangedActions: ActionEffectivenessItem[];
    topDecisionChangedActions: ActionEffectivenessItem[];
    lowRoiActions: ActionEffectivenessItem[];
  };
  routerCalibrationSummary: {
    capabilityTierBreakdown: Record<CapabilityTierKey, number>;
    fallbackPolicyBreakdown: Record<ModelTaskFallbackPolicy | 'NONE', number>;
    capabilitySummaries: CapabilityCalibrationItem[];
    taskTypeSummaries: TaskTypeCalibrationItem[];
    highCostWorthKeeping: TaskTypeCalibrationItem[];
    overRoutedTaskTypes: TaskTypeCalibrationItem[];
    underRoutedTaskTypes: TaskTypeCalibrationItem[];
    deterministicOnlyCandidates: TaskTypeCalibrationItem[];
  };
  qualityCalibrationSummary: {
    qualityStateSummaries: QualityCalibrationItem[];
    highButPoorOutcome: CalibrationSample[];
    lowOrCriticalButImproved: CalibrationSample[];
    trustedBlockingPrediction: {
      withBlockingGapsCount: number;
      withBlockingGapsTrustedChangedCount: number;
      withoutBlockingGapsCount: number;
      withoutBlockingGapsTrustedChangedCount: number;
    };
    thresholdAdjustmentSignals: Array<{
      qualityState: QualityStateKey;
      signal: string;
      reason: string;
    }>;
  };
  gapEffectivenessSummary: {
    topGapsByFrequency: GapCalibrationItem[];
    topGapsByPositiveRepair: GapCalibrationItem[];
    topGapsByNegativeOrNoChange: GapCalibrationItem[];
    topGapsByDecisionChange: GapCalibrationItem[];
    visibleBrokenTopGaps: GapCalibrationItem[];
    highValueWeakTopGaps: GapCalibrationItem[];
    prioritizedRepairGaps: GapCalibrationItem[];
  };
  reviewBurdenSummary: {
    requiresReviewCount: number;
    reviewUsedCount: number;
    fallbackUsedCount: number;
    skippedByCleanupCount: number;
    reviewOutcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
    reviewRepairValueClassBreakdown: Record<AnalysisRepairValueClass, number>;
    reviewNoChangeCount: number;
    reviewNegativeCount: number;
    reviewDecisionChangedCount: number;
    reviewTrustedChangedCount: number;
  };
  conclusions: {
    topValueActions: string[];
    likelySpinningActions: string[];
    capabilityLikelyTooHeavy: string[];
    qualityStateAdjustmentCandidates: string[];
    prioritizedGaps: string[];
  };
  notes: {
    cleanupDominated: string;
    actionInterpretation: string;
    routerInterpretation: string;
    qualityInterpretation: string;
    gapInterpretation: string;
  };
  samples: {
    highValue: CalibrationSample[];
    noChange: CalibrationSample[];
    reviewHeavy: CalibrationSample[];
    downgradedOrSkipped: CalibrationSample[];
  };
  audit: {
    commands: string[];
    focusFields: string[];
    sampleChecks: string[];
  };
};

export function buildAnalysisCalibrationReport(args: {
  snapshot: AnalysisOutcomeSnapshot | null;
  latestRun?: Record<string, unknown> | null;
  seededFromDryRun?: boolean;
}): AnalysisCalibrationReport {
  const snapshot = args.snapshot ?? buildEmptySnapshot();
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const totalLogged = items.length;
  const actionableItems = items.filter(
    (item) => item.execution.outcomeStatus !== 'skipped',
  );
  const cleanupDominatedCount = items.filter(
    (item) =>
      item.execution.outcomeStatus === 'skipped' ||
      item.execution.outcomeStatus === 'downgraded',
  ).length;
  const cleanupDominatedRatio = ratio(cleanupDominatedCount, totalLogged);
  const cleanupDominated = cleanupDominatedRatio >= 0.5;
  const trendStrength =
    actionableItems.length >= 30 && !cleanupDominated
      ? 'usable'
      : actionableItems.length >= 8
        ? 'early'
        : 'insufficient';

  const repairEffectivenessSummary = buildRepairEffectivenessSummary(items);
  const routerCalibrationSummary = buildRouterCalibrationSummary(items);
  const qualityCalibrationSummary = buildQualityCalibrationSummary(items);
  const gapEffectivenessSummary = buildGapEffectivenessSummary(items);
  const reviewBurdenSummary = buildReviewBurdenSummary(items);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      outcomeGeneratedAt: readString(snapshot.generatedAt),
      latestRunGeneratedAt: readString(args.latestRun?.generatedAt),
      seededFromDryRun: Boolean(args.seededFromDryRun),
      totalLogged,
      actionableCount: actionableItems.length,
      cleanupDominated,
      cleanupDominatedRatio: round(cleanupDominatedRatio),
      trendStrength,
    },
    calibrationInputs: {
      beforeFields: [
        'repositoryId',
        'normalizedTaskType',
        'taskIntent',
        'historicalRepairBucket',
        'historicalRepairAction',
        'cleanupState',
        'analysisQualityScoreBefore',
        'analysisQualityStateBefore',
        'decisionStateBefore',
        'trustedEligibilityBefore',
        'keyEvidenceGapsBefore',
        'trustedBlockingGapsBefore',
        'evidenceCoverageRateBefore',
      ],
      routerFields: [
        'routerCapabilityTier',
        'routerPriorityClass',
        'routerFallbackPolicy',
        'routerRequiresReview',
        'routerRetryClass',
        'routerReasonSummary',
      ],
      afterFields: [
        'analysisQualityScoreAfter',
        'analysisQualityStateAfter',
        'decisionStateAfter',
        'trustedEligibilityAfter',
        'keyEvidenceGapsAfter',
        'trustedBlockingGapsAfter',
        'evidenceCoverageRateAfter',
      ],
      deltaFields: [
        'qualityDelta',
        'trustedChanged',
        'decisionChanged',
        'gapCountDelta',
        'blockingGapDelta',
        'repairValueClass',
      ],
    },
    repairEffectivenessSummary,
    routerCalibrationSummary,
    qualityCalibrationSummary,
    gapEffectivenessSummary,
    reviewBurdenSummary,
    conclusions: {
      topValueActions: summarizeActionLabels(
        repairEffectivenessSummary.topValueActions,
      ),
      likelySpinningActions: summarizeActionLabels(
        repairEffectivenessSummary.lowRoiActions,
      ),
      capabilityLikelyTooHeavy: routerCalibrationSummary.overRoutedTaskTypes.map(
        (item) => `${item.taskType} (${item.predominantCapabilityTier})`,
      ),
      qualityStateAdjustmentCandidates:
        qualityCalibrationSummary.thresholdAdjustmentSignals.map(
          (item) => `${item.qualityState}: ${item.signal}`,
        ),
      prioritizedGaps: gapEffectivenessSummary.prioritizedRepairGaps.map(
        (item) => item.gap,
      ),
    },
    notes: {
      cleanupDominated: cleanupDominated
        ? `当前样本仍以 cleanup/skipped 为主（ratio=${round(cleanupDominatedRatio)}），强结论只能看作早期趋势。`
        : '当前样本里 cleanup/skipped 已不再主导，可以开始把 action/router/quality 的信号当成更可靠的趋势。',
      actionInterpretation:
        'high/medium repair value 代表质量、gap 或 trusted/decision 至少有明确正向变化；no_change 和 low/negative 则更接近空转或收益偏低。',
      routerInterpretation:
        'HEAVY/REVIEW 若长期只产出 low/negative/no_change，说明 route 可能过重；LIGHT/DETERMINISTIC_ONLY 若持续产出 medium/high，则说明可能被压得过轻。',
      qualityInterpretation:
        'HIGH 但 outcome 很差，说明 quality state 偏乐观；LOW/CRITICAL 但 repair 后明显改善，说明阈值可能保守或区分度不足。',
      gapInterpretation:
        'prioritizedRepairGaps 优先考虑“频次高 + 出现在可改善样本里 + 与 decision/trusted 变化相关”的 gap，而不是只看出现次数。',
    },
    samples: {
      highValue: buildCalibrationSamples(
        items.filter((item) => item.delta.repairValueClass === 'high'),
      ),
      noChange: buildCalibrationSamples(
        items.filter((item) => item.execution.outcomeStatus === 'no_change'),
      ),
      reviewHeavy: buildCalibrationSamples(
        items.filter(
          (item) =>
            item.router.routerRequiresReview ||
            item.execution.executionUsedReview,
        ),
      ),
      downgradedOrSkipped: buildCalibrationSamples(
        items.filter(
          (item) =>
            item.execution.outcomeStatus === 'downgraded' ||
            item.execution.outcomeStatus === 'skipped',
        ),
      ),
    },
    audit: {
      commands: [
        'pnpm --filter api report:analysis-calibration',
        'pnpm --filter api report:analysis-outcome',
        'pnpm --filter api report:model-task-router-execution',
        'pnpm --filter api health:daily -- --json --pretty',
      ],
      focusFields: [
        'source.cleanupDominated',
        'repairEffectivenessSummary.topValueActions',
        'routerCalibrationSummary.overRoutedTaskTypes',
        'qualityCalibrationSummary.thresholdAdjustmentSignals',
        'gapEffectivenessSummary.prioritizedRepairGaps',
        'reviewBurdenSummary.reviewOutcomeStatusBreakdown',
      ],
      sampleChecks: [
        'Inspect 3 decision_recalc outcomes and confirm conflict-heavy items are marked REVIEW and can change decisionStateAfter.',
        'Inspect 3 downgrade/skipped outcomes and confirm cleanup suppression or trusted downgrade is explicit in outcomeStatus/outcomeReason.',
        'Inspect 3 low/negative HEAVY or REVIEW outcomes to confirm they are real over-routing candidates rather than sample noise.',
      ],
    },
  };
}

export function renderAnalysisCalibrationMarkdown(
  report: AnalysisCalibrationReport,
) {
  const lines = [
    '# GitDian Analysis Calibration Report',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- outcomeGeneratedAt: ${report.source.outcomeGeneratedAt ?? 'none'}`,
    `- latestRunGeneratedAt: ${report.source.latestRunGeneratedAt ?? 'none'}`,
    `- seededFromDryRun: ${report.source.seededFromDryRun ? 'yes' : 'no'}`,
    `- totalLogged: ${report.source.totalLogged}`,
    `- actionableCount: ${report.source.actionableCount}`,
    `- cleanupDominated: ${report.source.cleanupDominated ? 'yes' : 'no'}`,
    `- cleanupDominatedRatio: ${report.source.cleanupDominatedRatio}`,
    `- trendStrength: ${report.source.trendStrength}`,
    '',
    '## Sample Caveat',
    '',
    `- ${report.notes.cleanupDominated}`,
    '',
    '## Calibration Inputs',
    '',
    `- beforeFields: ${report.calibrationInputs.beforeFields.join(', ')}`,
    `- routerFields: ${report.calibrationInputs.routerFields.join(', ')}`,
    `- afterFields: ${report.calibrationInputs.afterFields.join(', ')}`,
    `- deltaFields: ${report.calibrationInputs.deltaFields.join(', ')}`,
    '',
    '## Repair Effectiveness',
    '',
    '### top_value_actions',
    ...renderActionSummary(report.repairEffectivenessSummary.topValueActions),
    '',
    '### top_no_change_actions',
    ...renderActionSummary(report.repairEffectivenessSummary.topNoChangeActions),
    '',
    '### top_quality_improvement_actions',
    ...renderActionSummary(
      report.repairEffectivenessSummary.topQualityImprovementActions,
    ),
    '',
    '### top_gap_reduction_actions',
    ...renderActionSummary(
      report.repairEffectivenessSummary.topGapReductionActions,
    ),
    '',
    '### top_trusted_changed_actions',
    ...renderActionSummary(
      report.repairEffectivenessSummary.topTrustedChangedActions,
    ),
    '',
    '### top_decision_changed_actions',
    ...renderActionSummary(
      report.repairEffectivenessSummary.topDecisionChangedActions,
    ),
    '',
    '### low_roi_actions',
    ...renderActionSummary(report.repairEffectivenessSummary.lowRoiActions),
    '',
    '## Router Calibration',
    '',
    '### capability_tier_breakdown',
    ...renderCountRecord(report.routerCalibrationSummary.capabilityTierBreakdown),
    '',
    '### fallback_policy_breakdown',
    ...renderCountRecord(report.routerCalibrationSummary.fallbackPolicyBreakdown),
    '',
    '### over_routed_task_types',
    ...renderTaskTypeSummary(report.routerCalibrationSummary.overRoutedTaskTypes),
    '',
    '### under_routed_task_types',
    ...renderTaskTypeSummary(report.routerCalibrationSummary.underRoutedTaskTypes),
    '',
    '### high_cost_worth_keeping',
    ...renderTaskTypeSummary(report.routerCalibrationSummary.highCostWorthKeeping),
    '',
    '### deterministic_only_candidates',
    ...renderTaskTypeSummary(
      report.routerCalibrationSummary.deterministicOnlyCandidates,
    ),
    '',
    '## Quality Calibration',
    '',
    '### quality_state_summaries',
    ...renderQualitySummary(report.qualityCalibrationSummary.qualityStateSummaries),
    '',
    '### threshold_adjustment_signals',
    ...renderThresholdSignals(
      report.qualityCalibrationSummary.thresholdAdjustmentSignals,
    ),
    '',
    '### trusted_blocking_prediction',
    `- withBlockingGapsCount: ${report.qualityCalibrationSummary.trustedBlockingPrediction.withBlockingGapsCount}`,
    `- withBlockingGapsTrustedChangedCount: ${report.qualityCalibrationSummary.trustedBlockingPrediction.withBlockingGapsTrustedChangedCount}`,
    `- withoutBlockingGapsCount: ${report.qualityCalibrationSummary.trustedBlockingPrediction.withoutBlockingGapsCount}`,
    `- withoutBlockingGapsTrustedChangedCount: ${report.qualityCalibrationSummary.trustedBlockingPrediction.withoutBlockingGapsTrustedChangedCount}`,
    '',
    '## Gap Effectiveness',
    '',
    '### top_gaps_by_frequency',
    ...renderGapSummary(report.gapEffectivenessSummary.topGapsByFrequency),
    '',
    '### top_gaps_by_positive_repair',
    ...renderGapSummary(report.gapEffectivenessSummary.topGapsByPositiveRepair),
    '',
    '### top_gaps_by_negative_or_no_change',
    ...renderGapSummary(
      report.gapEffectivenessSummary.topGapsByNegativeOrNoChange,
    ),
    '',
    '### top_gaps_by_decision_change',
    ...renderGapSummary(report.gapEffectivenessSummary.topGapsByDecisionChange),
    '',
    '### visible_broken_top_gaps',
    ...renderGapSummary(report.gapEffectivenessSummary.visibleBrokenTopGaps),
    '',
    '### high_value_weak_top_gaps',
    ...renderGapSummary(report.gapEffectivenessSummary.highValueWeakTopGaps),
    '',
    '### prioritized_repair_gaps',
    ...renderGapSummary(report.gapEffectivenessSummary.prioritizedRepairGaps),
    '',
    '## Review Burden',
    '',
    `- requiresReviewCount: ${report.reviewBurdenSummary.requiresReviewCount}`,
    `- reviewUsedCount: ${report.reviewBurdenSummary.reviewUsedCount}`,
    `- fallbackUsedCount: ${report.reviewBurdenSummary.fallbackUsedCount}`,
    `- skippedByCleanupCount: ${report.reviewBurdenSummary.skippedByCleanupCount}`,
    '',
    '### review_outcome_status_breakdown',
    ...renderCountRecord(report.reviewBurdenSummary.reviewOutcomeStatusBreakdown),
    '',
    '### review_repair_value_class_breakdown',
    ...renderCountRecord(report.reviewBurdenSummary.reviewRepairValueClassBreakdown),
    '',
    `- reviewNoChangeCount: ${report.reviewBurdenSummary.reviewNoChangeCount}`,
    `- reviewNegativeCount: ${report.reviewBurdenSummary.reviewNegativeCount}`,
    `- reviewDecisionChangedCount: ${report.reviewBurdenSummary.reviewDecisionChangedCount}`,
    `- reviewTrustedChangedCount: ${report.reviewBurdenSummary.reviewTrustedChangedCount}`,
    '',
    '## Conclusions',
    '',
    `- topValueActions: ${report.conclusions.topValueActions.join(', ') || 'none'}`,
    `- likelySpinningActions: ${report.conclusions.likelySpinningActions.join(', ') || 'none'}`,
    `- capabilityLikelyTooHeavy: ${report.conclusions.capabilityLikelyTooHeavy.join(', ') || 'none'}`,
    `- qualityStateAdjustmentCandidates: ${report.conclusions.qualityStateAdjustmentCandidates.join(', ') || 'none'}`,
    `- prioritizedGaps: ${report.conclusions.prioritizedGaps.join(', ') || 'none'}`,
    '',
    '## Notes',
    '',
    `- ${report.notes.actionInterpretation}`,
    `- ${report.notes.routerInterpretation}`,
    `- ${report.notes.qualityInterpretation}`,
    `- ${report.notes.gapInterpretation}`,
    '',
    '## Samples',
    '',
    '### high_value',
    ...renderSamples(report.samples.highValue),
    '',
    '### no_change',
    ...renderSamples(report.samples.noChange),
    '',
    '### review_heavy',
    ...renderSamples(report.samples.reviewHeavy),
    '',
    '### downgraded_or_skipped',
    ...renderSamples(report.samples.downgradedOrSkipped),
    '',
    '## Manual Audit',
    '',
    ...report.audit.commands.map((command) => `- command: ${command}`),
    ...report.audit.focusFields.map((field) => `- focus: ${field}`),
    ...report.audit.sampleChecks.map((check) => `- check: ${check}`),
  ];

  return lines.join('\n');
}

function buildRepairEffectivenessSummary(items: AnalysisOutcomeLog[]) {
  const actionSummaries = ANALYSIS_OUTCOME_ACTIONS.map((action) =>
    buildActionEffectivenessItem(action, items.filter((item) => toAction(item) === action)),
  ).filter((item) => item.count > 0);

  return {
    actionSummaries,
    topValueActions: takeTop(
      actionSummaries.filter(
        (item) =>
          item.highOrMediumCount > 0 ||
          item.qualityImprovementCount > 0 ||
          item.gapReductionCount > 0 ||
          item.trustedChangedCount > 0 ||
          item.decisionChangedCount > 0,
      ),
      5,
      (item) =>
        item.highOrMediumCount * 1000 +
        item.qualityImprovementCount * 100 +
        item.gapReductionCount * 10 +
        Math.max(0, round(item.averageQualityDelta * 100)),
    ),
    topNoChangeActions: takeTop(
      actionSummaries,
      5,
      (item) => item.noChangeCount * 1000 + item.lowOrNegativeCount * 10,
    ),
    topQualityImprovementActions: takeTop(
      actionSummaries.filter(
        (item) => item.qualityImprovementCount > 0 || item.averageQualityDelta > 0,
      ),
      5,
      (item) =>
        Math.max(0, round(item.averageQualityDelta * 100)) +
        item.qualityImprovementCount * 10,
    ),
    topGapReductionActions: takeTop(
      actionSummaries.filter(
        (item) => item.gapReductionCount > 0 || item.averageGapCountDelta < 0,
      ),
      5,
      (item) =>
        item.gapReductionCount * 100 + Math.max(0, round(-item.averageGapCountDelta * 100)),
    ),
    topTrustedChangedActions: takeTop(
      actionSummaries.filter((item) => item.trustedChangedCount > 0),
      5,
      (item) => item.trustedChangedCount * 100 + item.decisionChangedCount,
    ),
    topDecisionChangedActions: takeTop(
      actionSummaries.filter((item) => item.decisionChangedCount > 0),
      5,
      (item) => item.decisionChangedCount * 100 + item.trustedChangedCount,
    ),
    lowRoiActions: takeTop(
      actionSummaries,
      5,
      (item) =>
        item.lowOrNegativeCount * 1000 +
        item.noChangeCount * 100 +
        Math.max(0, round(-item.averageQualityDelta * 100)),
    ),
  };
}

function buildRouterCalibrationSummary(items: AnalysisOutcomeLog[]) {
  const capabilityTierBreakdown = buildCountRecord<CapabilityTierKey>([
    'LIGHT',
    'STANDARD',
    'HEAVY',
    'REVIEW',
    'DETERMINISTIC_ONLY',
    'NONE',
  ]);
  const fallbackPolicyBreakdown = buildCountRecord<
    ModelTaskFallbackPolicy | 'NONE'
  >([
    'NONE',
    'PROVIDER_FALLBACK',
    'DETERMINISTIC_ONLY',
    'LIGHT_DERIVATION',
    'RETRY_THEN_REVIEW',
    'RETRY_THEN_DOWNGRADE',
    'DOWNGRADE_ONLY',
  ]);

  for (const item of items) {
    const tier = normalizeCapabilityTier(item.router.routerCapabilityTier);
    const fallback = normalizeFallbackPolicy(item.router.routerFallbackPolicy);
    capabilityTierBreakdown[tier] += 1;
    fallbackPolicyBreakdown[fallback] += 1;
  }

  const capabilitySummaries = (Object.keys(capabilityTierBreakdown) as CapabilityTierKey[])
    .map((tier) => buildCapabilityCalibrationItem(tier, items))
    .filter((item) => item.count > 0);
  const taskTypes = uniqueStrings(
    items.map((item) => item.before.normalizedTaskType),
  ) as NormalizedModelTaskType[];
  const taskTypeSummaries = taskTypes
    .map((taskType) =>
      buildTaskTypeCalibrationItem(
        taskType,
        items.filter((item) => item.before.normalizedTaskType === taskType),
      ),
    )
    .filter((item) => item.count > 0);

  return {
    capabilityTierBreakdown,
    fallbackPolicyBreakdown,
    capabilitySummaries,
    taskTypeSummaries,
    highCostWorthKeeping: takeTop(
      taskTypeSummaries.filter((item) =>
        (item.predominantCapabilityTier === 'HEAVY' ||
          item.predominantCapabilityTier === 'REVIEW') &&
        (item.highOrMediumCount > 0 || item.averageQualityDelta > 0),
      ),
      5,
      (item) =>
        item.highOrMediumCount * 1000 +
        Math.max(0, round(item.averageQualityDelta * 100)),
    ),
    overRoutedTaskTypes: takeTop(
      taskTypeSummaries.filter((item) =>
        (item.predominantCapabilityTier === 'HEAVY' ||
          item.predominantCapabilityTier === 'REVIEW') &&
        (item.lowOrNegativeCount > 0 || item.noChangeCount > 0),
      ),
      5,
      (item) =>
        item.lowOrNegativeCount * 1000 +
        item.noChangeCount * 100 +
        Math.max(0, round(-item.averageQualityDelta * 100)),
    ),
    underRoutedTaskTypes: takeTop(
      taskTypeSummaries.filter((item) =>
        (item.predominantCapabilityTier === 'LIGHT' ||
          item.predominantCapabilityTier === 'DETERMINISTIC_ONLY' ||
          item.predominantCapabilityTier === 'STANDARD') &&
        (item.highOrMediumCount > 0 || item.averageQualityDelta > 0),
      ),
      5,
      (item) =>
        item.highOrMediumCount * 1000 +
        Math.max(0, round(item.averageQualityDelta * 100)),
    ),
    deterministicOnlyCandidates: takeTop(
      taskTypeSummaries,
      5,
      (item) => item.deterministicOnlyCount * 1000 + item.lowOrNegativeCount,
    ),
  };
}

function buildQualityCalibrationSummary(items: AnalysisOutcomeLog[]) {
  const states: QualityStateKey[] = ['HIGH', 'MEDIUM', 'LOW', 'CRITICAL', 'UNKNOWN'];
  const qualityStateSummaries = states
    .map((qualityState) =>
      buildQualityCalibrationItem(
        qualityState,
        items.filter(
          (item) => normalizeQualityState(item.before.analysisQualityStateBefore) === qualityState,
        ),
      ),
    )
    .filter((item) => item.count > 0);
  const highButPoorOutcome = buildCalibrationSamples(
    items.filter((item) => {
      const qualityState = normalizeQualityState(
        item.before.analysisQualityStateBefore,
      );
      return (
        qualityState === 'HIGH' &&
        (item.delta.repairValueClass === 'low' ||
          item.delta.repairValueClass === 'negative' ||
          item.execution.outcomeStatus === 'no_change')
      );
    }),
  );
  const lowOrCriticalButImproved = buildCalibrationSamples(
    items.filter((item) => {
      const qualityState = normalizeQualityState(
        item.before.analysisQualityStateBefore,
      );
      return (
        (qualityState === 'LOW' || qualityState === 'CRITICAL') &&
        (item.delta.repairValueClass === 'medium' ||
          item.delta.repairValueClass === 'high')
      );
    }),
  );
  const withBlockingGaps = items.filter(
    (item) => item.before.trustedBlockingGapsBefore.length > 0,
  );
  const withoutBlockingGaps = items.filter(
    (item) => item.before.trustedBlockingGapsBefore.length === 0,
  );

  return {
    qualityStateSummaries,
    highButPoorOutcome,
    lowOrCriticalButImproved,
    trustedBlockingPrediction: {
      withBlockingGapsCount: withBlockingGaps.length,
      withBlockingGapsTrustedChangedCount: withBlockingGaps.filter(
        (item) => item.delta.trustedChanged,
      ).length,
      withoutBlockingGapsCount: withoutBlockingGaps.length,
      withoutBlockingGapsTrustedChangedCount: withoutBlockingGaps.filter(
        (item) => item.delta.trustedChanged,
      ).length,
    },
    thresholdAdjustmentSignals: buildThresholdAdjustmentSignals(
      qualityStateSummaries,
    ),
  };
}

function buildGapEffectivenessSummary(items: AnalysisOutcomeLog[]) {
  const gapSummaries = buildGapCalibrationItems(items);
  const visibleBrokenTopGaps = buildGapCalibrationItems(
    items.filter(
      (item) => item.before.historicalRepairBucket === 'visible_broken',
    ),
  );
  const highValueWeakTopGaps = buildGapCalibrationItems(
    items.filter(
      (item) => item.before.historicalRepairBucket === 'high_value_weak',
    ),
  );

  return {
    topGapsByFrequency: takeTop(gapSummaries, 8, (item) => item.count),
    topGapsByPositiveRepair: takeTop(
      gapSummaries.filter(
        (item) => item.highOrMediumCount > 0 || item.averageQualityDelta > 0,
      ),
      8,
      (item) =>
        item.highOrMediumCount * 1000 +
        Math.max(0, round(item.averageQualityDelta * 100)),
    ),
    topGapsByNegativeOrNoChange: takeTop(
      gapSummaries,
      8,
      (item) => item.lowOrNegativeCount * 1000 + item.noChangeCount * 100,
    ),
    topGapsByDecisionChange: takeTop(
      gapSummaries.filter((item) => item.decisionChangedCount > 0),
      8,
      (item) => item.decisionChangedCount * 1000 + item.trustedChangedCount,
    ),
    visibleBrokenTopGaps: takeTop(visibleBrokenTopGaps, 8, (item) => item.count),
    highValueWeakTopGaps: takeTop(highValueWeakTopGaps, 8, (item) => item.count),
    prioritizedRepairGaps: takeTop(
      gapSummaries,
      8,
      (item) =>
        item.count * 1000 +
        item.highOrMediumCount * 100 +
        item.decisionChangedCount * 10 -
        item.noChangeCount -
        item.lowOrNegativeCount,
    ),
  };
}

function buildReviewBurdenSummary(items: AnalysisOutcomeLog[]) {
  const reviewItems = items.filter(
    (item) => item.router.routerRequiresReview || item.execution.executionUsedReview,
  );
  const reviewOutcomeStatusBreakdown = buildCountRecord<AnalysisOutcomeStatus>(
    ANALYSIS_OUTCOME_STATUSES,
  );
  const reviewRepairValueClassBreakdown =
    buildCountRecord<AnalysisRepairValueClass>(ANALYSIS_REPAIR_VALUE_CLASSES);

  for (const item of reviewItems) {
    reviewOutcomeStatusBreakdown[item.execution.outcomeStatus] += 1;
    reviewRepairValueClassBreakdown[item.delta.repairValueClass] += 1;
  }

  return {
    requiresReviewCount: items.filter((item) => item.router.routerRequiresReview)
      .length,
    reviewUsedCount: reviewItems.length,
    fallbackUsedCount: items.filter((item) => item.execution.executionUsedFallback)
      .length,
    skippedByCleanupCount: items.filter(
      (item) =>
        item.execution.outcomeStatus === 'skipped' &&
        item.execution.outcomeReason.startsWith('cleanup_state_'),
    ).length,
    reviewOutcomeStatusBreakdown,
    reviewRepairValueClassBreakdown,
    reviewNoChangeCount: reviewItems.filter(
      (item) => item.execution.outcomeStatus === 'no_change',
    ).length,
    reviewNegativeCount: reviewItems.filter(
      (item) => item.delta.repairValueClass === 'negative',
    ).length,
    reviewDecisionChangedCount: reviewItems.filter(
      (item) => item.delta.decisionChanged,
    ).length,
    reviewTrustedChangedCount: reviewItems.filter(
      (item) => item.delta.trustedChanged,
    ).length,
  };
}

function buildActionEffectivenessItem(
  action: AnalysisOutcomeActionKey,
  items: AnalysisOutcomeLog[],
): ActionEffectivenessItem {
  const outcomeStatusBreakdown = buildCountRecord<AnalysisOutcomeStatus>(
    ANALYSIS_OUTCOME_STATUSES,
  );
  const repairValueClassBreakdown =
    buildCountRecord<AnalysisRepairValueClass>(ANALYSIS_REPAIR_VALUE_CLASSES);

  let qualityDeltaTotal = 0;
  let gapDeltaTotal = 0;
  let blockingDeltaTotal = 0;
  let qualityImprovementCount = 0;
  let gapReductionCount = 0;
  let trustedChangedCount = 0;
  let decisionChangedCount = 0;
  let fallbackUsedCount = 0;
  let reviewUsedCount = 0;
  let highOrMediumCount = 0;
  let lowOrNegativeCount = 0;
  let noChangeCount = 0;

  for (const item of items) {
    outcomeStatusBreakdown[item.execution.outcomeStatus] += 1;
    repairValueClassBreakdown[item.delta.repairValueClass] += 1;
    qualityDeltaTotal += item.delta.qualityDelta;
    gapDeltaTotal += item.delta.gapCountDelta;
    blockingDeltaTotal += item.delta.blockingGapDelta;

    if (item.delta.qualityDelta > 0) {
      qualityImprovementCount += 1;
    }
    if (item.delta.gapCountDelta < 0) {
      gapReductionCount += 1;
    }
    if (item.delta.trustedChanged) {
      trustedChangedCount += 1;
    }
    if (item.delta.decisionChanged) {
      decisionChangedCount += 1;
    }
    if (item.execution.executionUsedFallback) {
      fallbackUsedCount += 1;
    }
    if (item.execution.executionUsedReview) {
      reviewUsedCount += 1;
    }
    if (
      item.delta.repairValueClass === 'high' ||
      item.delta.repairValueClass === 'medium'
    ) {
      highOrMediumCount += 1;
    }
    if (
      item.delta.repairValueClass === 'low' ||
      item.delta.repairValueClass === 'negative'
    ) {
      lowOrNegativeCount += 1;
    }
    if (item.execution.outcomeStatus === 'no_change') {
      noChangeCount += 1;
    }
  }

  return {
    action,
    count: items.length,
    outcomeStatusBreakdown,
    repairValueClassBreakdown,
    averageQualityDelta: round(average(qualityDeltaTotal, items.length)),
    averageGapCountDelta: round(average(gapDeltaTotal, items.length)),
    averageBlockingGapDelta: round(average(blockingDeltaTotal, items.length)),
    qualityImprovementCount,
    gapReductionCount,
    trustedChangedCount,
    decisionChangedCount,
    fallbackUsedCount,
    reviewUsedCount,
    highOrMediumCount,
    lowOrNegativeCount,
    noChangeCount,
  };
}

function buildCapabilityCalibrationItem(
  capabilityTier: CapabilityTierKey,
  items: AnalysisOutcomeLog[],
): CapabilityCalibrationItem {
  const scopedItems = items.filter(
    (item) => normalizeCapabilityTier(item.router.routerCapabilityTier) === capabilityTier,
  );
  const outcomeStatusBreakdown = buildCountRecord<AnalysisOutcomeStatus>(
    ANALYSIS_OUTCOME_STATUSES,
  );
  const repairValueClassBreakdown =
    buildCountRecord<AnalysisRepairValueClass>(ANALYSIS_REPAIR_VALUE_CLASSES);
  let qualityDeltaTotal = 0;
  let highOrMediumCount = 0;
  let lowOrNegativeCount = 0;
  let noChangeCount = 0;
  let reviewUsedCount = 0;
  let fallbackUsedCount = 0;

  for (const item of scopedItems) {
    outcomeStatusBreakdown[item.execution.outcomeStatus] += 1;
    repairValueClassBreakdown[item.delta.repairValueClass] += 1;
    qualityDeltaTotal += item.delta.qualityDelta;
    if (
      item.delta.repairValueClass === 'high' ||
      item.delta.repairValueClass === 'medium'
    ) {
      highOrMediumCount += 1;
    }
    if (
      item.delta.repairValueClass === 'low' ||
      item.delta.repairValueClass === 'negative'
    ) {
      lowOrNegativeCount += 1;
    }
    if (item.execution.outcomeStatus === 'no_change') {
      noChangeCount += 1;
    }
    if (item.execution.executionUsedReview) {
      reviewUsedCount += 1;
    }
    if (item.execution.executionUsedFallback) {
      fallbackUsedCount += 1;
    }
  }

  return {
    capabilityTier,
    count: scopedItems.length,
    outcomeStatusBreakdown,
    repairValueClassBreakdown,
    averageQualityDelta: round(average(qualityDeltaTotal, scopedItems.length)),
    highOrMediumCount,
    lowOrNegativeCount,
    noChangeCount,
    reviewUsedCount,
    fallbackUsedCount,
  };
}

function buildTaskTypeCalibrationItem(
  taskType: NormalizedModelTaskType,
  items: AnalysisOutcomeLog[],
): TaskTypeCalibrationItem {
  const capabilityTierBreakdown = buildCountRecord<CapabilityTierKey>([
    'LIGHT',
    'STANDARD',
    'HEAVY',
    'REVIEW',
    'DETERMINISTIC_ONLY',
    'NONE',
  ]);
  let qualityDeltaTotal = 0;
  let highOrMediumCount = 0;
  let lowOrNegativeCount = 0;
  let noChangeCount = 0;
  let requiresReviewCount = 0;
  let deterministicOnlyCount = 0;

  for (const item of items) {
    const tier = normalizeCapabilityTier(item.router.routerCapabilityTier);
    capabilityTierBreakdown[tier] += 1;
    qualityDeltaTotal += item.delta.qualityDelta;
    if (
      item.delta.repairValueClass === 'high' ||
      item.delta.repairValueClass === 'medium'
    ) {
      highOrMediumCount += 1;
    }
    if (
      item.delta.repairValueClass === 'low' ||
      item.delta.repairValueClass === 'negative'
    ) {
      lowOrNegativeCount += 1;
    }
    if (item.execution.outcomeStatus === 'no_change') {
      noChangeCount += 1;
    }
    if (item.router.routerRequiresReview) {
      requiresReviewCount += 1;
    }
    if (tier === 'DETERMINISTIC_ONLY') {
      deterministicOnlyCount += 1;
    }
  }

  return {
    taskType,
    count: items.length,
    predominantCapabilityTier: determinePredominantTier(capabilityTierBreakdown),
    capabilityTierBreakdown,
    averageQualityDelta: round(average(qualityDeltaTotal, items.length)),
    highOrMediumCount,
    lowOrNegativeCount,
    noChangeCount,
    requiresReviewCount,
    deterministicOnlyCount,
  };
}

function buildQualityCalibrationItem(
  qualityState: QualityStateKey,
  items: AnalysisOutcomeLog[],
): QualityCalibrationItem {
  const outcomeStatusBreakdown = buildCountRecord<AnalysisOutcomeStatus>(
    ANALYSIS_OUTCOME_STATUSES,
  );
  const repairValueClassBreakdown =
    buildCountRecord<AnalysisRepairValueClass>(ANALYSIS_REPAIR_VALUE_CLASSES);
  let qualityDeltaTotal = 0;
  let gapDeltaTotal = 0;
  let highOrMediumCount = 0;
  let lowOrNegativeCount = 0;
  let trustedChangedCount = 0;
  let decisionChangedCount = 0;

  for (const item of items) {
    outcomeStatusBreakdown[item.execution.outcomeStatus] += 1;
    repairValueClassBreakdown[item.delta.repairValueClass] += 1;
    qualityDeltaTotal += item.delta.qualityDelta;
    gapDeltaTotal += item.delta.gapCountDelta;
    if (
      item.delta.repairValueClass === 'high' ||
      item.delta.repairValueClass === 'medium'
    ) {
      highOrMediumCount += 1;
    }
    if (
      item.delta.repairValueClass === 'low' ||
      item.delta.repairValueClass === 'negative'
    ) {
      lowOrNegativeCount += 1;
    }
    if (item.delta.trustedChanged) {
      trustedChangedCount += 1;
    }
    if (item.delta.decisionChanged) {
      decisionChangedCount += 1;
    }
  }

  return {
    qualityState,
    count: items.length,
    outcomeStatusBreakdown,
    repairValueClassBreakdown,
    averageQualityDelta: round(average(qualityDeltaTotal, items.length)),
    averageGapCountDelta: round(average(gapDeltaTotal, items.length)),
    highOrMediumCount,
    lowOrNegativeCount,
    trustedChangedCount,
    decisionChangedCount,
  };
}

function buildGapCalibrationItems(items: AnalysisOutcomeLog[]) {
  const grouped = new Map<KeyEvidenceGapTaxonomy, AnalysisOutcomeLog[]>();

  for (const item of items) {
    for (const gap of uniqueStrings(item.before.keyEvidenceGapsBefore) as KeyEvidenceGapTaxonomy[]) {
      if (!grouped.has(gap)) {
        grouped.set(gap, []);
      }
      grouped.get(gap)?.push(item);
    }
  }

  return [...grouped.entries()]
    .map(([gap, scopedItems]) => {
      let qualityDeltaTotal = 0;
      let gapDeltaTotal = 0;
      let highOrMediumCount = 0;
      let lowOrNegativeCount = 0;
      let noChangeCount = 0;
      let decisionChangedCount = 0;
      let trustedChangedCount = 0;
      let reviewUsedCount = 0;

      for (const item of scopedItems) {
        qualityDeltaTotal += item.delta.qualityDelta;
        gapDeltaTotal += item.delta.gapCountDelta;
        if (
          item.delta.repairValueClass === 'high' ||
          item.delta.repairValueClass === 'medium'
        ) {
          highOrMediumCount += 1;
        }
        if (
          item.delta.repairValueClass === 'low' ||
          item.delta.repairValueClass === 'negative'
        ) {
          lowOrNegativeCount += 1;
        }
        if (item.execution.outcomeStatus === 'no_change') {
          noChangeCount += 1;
        }
        if (item.delta.decisionChanged) {
          decisionChangedCount += 1;
        }
        if (item.delta.trustedChanged) {
          trustedChangedCount += 1;
        }
        if (item.execution.executionUsedReview) {
          reviewUsedCount += 1;
        }
      }

      return {
        gap,
        count: scopedItems.length,
        averageQualityDelta: round(average(qualityDeltaTotal, scopedItems.length)),
        averageGapCountDelta: round(average(gapDeltaTotal, scopedItems.length)),
        highOrMediumCount,
        lowOrNegativeCount,
        noChangeCount,
        decisionChangedCount,
        trustedChangedCount,
        reviewUsedCount,
      } satisfies GapCalibrationItem;
    })
    .sort((left, right) => {
      const scoreRight =
        right.count * 1000 +
        right.highOrMediumCount * 100 +
        right.decisionChangedCount * 10;
      const scoreLeft =
        left.count * 1000 +
        left.highOrMediumCount * 100 +
        left.decisionChangedCount * 10;
      return scoreRight - scoreLeft;
    });
}

function buildThresholdAdjustmentSignals(
  items: QualityCalibrationItem[],
): Array<{ qualityState: QualityStateKey; signal: string; reason: string }> {
  const signals: Array<{
    qualityState: QualityStateKey;
    signal: string;
    reason: string;
  }> = [];

  for (const item of items) {
    const poorRate = ratio(item.lowOrNegativeCount, item.count);
    const improvedRate = ratio(item.highOrMediumCount, item.count);

    if (item.qualityState === 'HIGH' && poorRate >= 0.5) {
      signals.push({
        qualityState: item.qualityState,
        signal: 'too_optimistic',
        reason:
          'HIGH 入口里 low/negative outcome 过多，quality state 可能偏乐观。',
      });
    }
    if (
      (item.qualityState === 'LOW' || item.qualityState === 'CRITICAL') &&
      improvedRate >= 0.3
    ) {
      signals.push({
        qualityState: item.qualityState,
        signal: 'may_be_too_conservative',
        reason:
          'LOW/CRITICAL 里仍出现明显改善，quality 阈值可能偏保守或对 repair 潜力区分不够。',
      });
    }
    if (item.qualityState === 'MEDIUM' && poorRate >= 0.7) {
      signals.push({
        qualityState: item.qualityState,
        signal: 'medium_not_predictive',
        reason: 'MEDIUM 里的 outcome 仍偏低，当前中间态区分度可能不足。',
      });
    }
  }

  return signals;
}

function buildCalibrationSamples(items: AnalysisOutcomeLog[]) {
  return items.slice(0, 8).map(
    (item) =>
      ({
        repositoryId: item.before.repositoryId,
        taskType: item.before.normalizedTaskType,
        action: item.before.historicalRepairAction,
        capabilityTier: normalizeCapabilityTier(item.router.routerCapabilityTier),
        qualityStateBefore: normalizeQualityState(
          item.before.analysisQualityStateBefore,
        ),
        outcomeStatus: item.execution.outcomeStatus,
        repairValueClass: item.delta.repairValueClass,
        qualityDelta: item.delta.qualityDelta,
        gapCountDelta: item.delta.gapCountDelta,
        blockingGapDelta: item.delta.blockingGapDelta,
        reason: item.execution.outcomeReason,
      }) satisfies CalibrationSample,
  );
}

function buildEmptySnapshot() {
  return buildAnalysisOutcomeSnapshot({
    source: 'analysis_outcome_empty',
    items: [],
  });
}

function normalizeCapabilityTier(value: unknown): CapabilityTierKey {
  switch (value) {
    case 'LIGHT':
    case 'STANDARD':
    case 'HEAVY':
    case 'REVIEW':
    case 'DETERMINISTIC_ONLY':
      return value;
    default:
      return 'NONE';
  }
}

function normalizeFallbackPolicy(
  value: unknown,
): ModelTaskFallbackPolicy | 'NONE' {
  switch (value) {
    case 'PROVIDER_FALLBACK':
    case 'DETERMINISTIC_ONLY':
    case 'LIGHT_DERIVATION':
    case 'RETRY_THEN_REVIEW':
    case 'RETRY_THEN_DOWNGRADE':
    case 'DOWNGRADE_ONLY':
      return value;
    case 'NONE':
    default:
      return 'NONE';
  }
}

function normalizeQualityState(value: unknown): QualityStateKey {
  switch (value) {
    case 'HIGH':
    case 'MEDIUM':
    case 'LOW':
    case 'CRITICAL':
      return value;
    default:
      return 'UNKNOWN';
  }
}

function determinePredominantTier(
  breakdown: Record<CapabilityTierKey, number>,
): CapabilityTierKey {
  const entries = Object.entries(breakdown) as Array<[CapabilityTierKey, number]>;
  return entries.sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'NONE';
}

function toAction(item: AnalysisOutcomeLog): AnalysisOutcomeActionKey {
  if (item.execution.outcomeStatus === 'skipped') {
    return 'skipped';
  }

  return (
    item.before.historicalRepairAction ??
    ('skipped' as AnalysisOutcomeActionKey)
  );
}

function buildCountRecord<T extends string>(keys: readonly T[]) {
  return keys.reduce<Record<T, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<T, number>);
}

function average(total: number, count: number) {
  if (!count) {
    return 0;
  }
  return total / count;
}

function ratio(part: number, total: number) {
  if (!total) {
    return 0;
  }
  return part / total;
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function uniqueStrings<T extends string>(values: T[]) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))];
}

function takeTop<T>(items: T[], limit: number, score: (item: T) => number) {
  return items
    .slice()
    .sort((left, right) => score(right) - score(left))
    .slice(0, limit);
}

function summarizeActionLabels(items: ActionEffectivenessItem[]) {
  return items.map((item) => item.action);
}

function renderCountRecord(record: Record<string, number>) {
  const entries = Object.entries(record).sort((left, right) => right[1] - left[1]);
  if (!entries.length) {
    return ['- none'];
  }
  return entries.map(([key, value]) => `- ${key}: ${value}`);
}

function renderActionSummary(items: ActionEffectivenessItem[]) {
  if (!items.length) {
    return ['- none'];
  }
  return items.map(
    (item) =>
      `- ${item.action}: count=${item.count}, highOrMedium=${item.highOrMediumCount}, lowOrNegative=${item.lowOrNegativeCount}, noChange=${item.noChangeCount}, avgQualityDelta=${item.averageQualityDelta}, avgGapDelta=${item.averageGapCountDelta}, trustedChanged=${item.trustedChangedCount}, decisionChanged=${item.decisionChangedCount}`,
  );
}

function renderTaskTypeSummary(items: TaskTypeCalibrationItem[]) {
  if (!items.length) {
    return ['- none'];
  }
  return items.map(
    (item) =>
      `- ${item.taskType}: tier=${item.predominantCapabilityTier}, count=${item.count}, highOrMedium=${item.highOrMediumCount}, lowOrNegative=${item.lowOrNegativeCount}, noChange=${item.noChangeCount}, avgQualityDelta=${item.averageQualityDelta}`,
  );
}

function renderQualitySummary(items: QualityCalibrationItem[]) {
  if (!items.length) {
    return ['- none'];
  }
  return items.map(
    (item) =>
      `- ${item.qualityState}: count=${item.count}, highOrMedium=${item.highOrMediumCount}, lowOrNegative=${item.lowOrNegativeCount}, avgQualityDelta=${item.averageQualityDelta}, avgGapDelta=${item.averageGapCountDelta}, trustedChanged=${item.trustedChangedCount}, decisionChanged=${item.decisionChangedCount}`,
  );
}

function renderThresholdSignals(
  items: Array<{ qualityState: QualityStateKey; signal: string; reason: string }>,
) {
  if (!items.length) {
    return ['- none'];
  }
  return items.map(
    (item) => `- ${item.qualityState}: ${item.signal} | ${item.reason}`,
  );
}

function renderGapSummary(items: GapCalibrationItem[]) {
  if (!items.length) {
    return ['- none'];
  }
  return items.map(
    (item) =>
      `- ${item.gap}: count=${item.count}, highOrMedium=${item.highOrMediumCount}, lowOrNegative=${item.lowOrNegativeCount}, noChange=${item.noChangeCount}, avgQualityDelta=${item.averageQualityDelta}, decisionChanged=${item.decisionChangedCount}`,
  );
}

function renderSamples(items: CalibrationSample[]) {
  if (!items.length) {
    return ['- none'];
  }
  return items.map(
    (item) =>
      `- ${item.repositoryId} | task=${item.taskType} | action=${item.action ?? 'none'} | tier=${item.capabilityTier} | quality=${item.qualityStateBefore} | status=${item.outcomeStatus} | value=${item.repairValueClass} | qDelta=${item.qualityDelta} | gapDelta=${item.gapCountDelta} | reason=${item.reason}`,
  );
}
