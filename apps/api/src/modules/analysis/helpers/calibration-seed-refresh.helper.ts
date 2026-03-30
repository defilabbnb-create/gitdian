import {
  ANALYSIS_OUTCOME_STATUSES,
  ANALYSIS_REPAIR_VALUE_CLASSES,
  buildAnalysisOutcomeSnapshot,
} from './analysis-outcome.helper';
import type {
  AnalysisOutcomeLog,
  AnalysisOutcomeSnapshot,
  AnalysisOutcomeStatus,
  AnalysisRepairValueClass,
} from './analysis-outcome.types';
import type { CalibrationSeedBatchReport } from './calibration-seed-batch.helper';
import type {
  DecisionRecalcGateDecision,
  DecisionRecalcGateResult,
  DecisionRecalcGateSnapshot,
} from './decision-recalc-gate.types';
import type { KeyEvidenceGapTaxonomy } from './evidence-gap-taxonomy.helper';
import type { HistoricalInventoryQualityState } from './historical-data-inventory.helper';
import type { HistoricalRepairPriorityItem } from './historical-repair-priority.helper';
import { buildModelTaskRouterDecisionFromHistoricalItem } from './model-task-router-decision.helper';
import type { ModelTaskCapabilityTierName } from './model-task-router.types';

export type CalibrationSeedRefreshGroup =
  | 'decision_recalc_refresh'
  | 'deep_repair_refresh'
  | 'evidence_repair_refresh';

export type CalibrationSeedRefreshSlice =
  | 'allowed_recalc'
  | 'high_value'
  | 'general_value'
  | 'weak_only'
  | 'non_weak_only';

export type CalibrationSeedRefreshSelectionItem = {
  repositoryId: string;
  fullName: string;
  seedGroup: CalibrationSeedRefreshGroup;
  seedSlice: CalibrationSeedRefreshSlice;
  historicalRepairBucket: string;
  historicalRepairAction: string;
  routerCapabilityTier: ModelTaskCapabilityTierName;
  analysisQualityStateBefore: HistoricalInventoryQualityState;
  keyEvidenceGapsBefore: KeyEvidenceGapTaxonomy[];
  trustedBlockingGapsBefore: KeyEvidenceGapTaxonomy[];
  strictVisibilityLevel: string | null;
  repositoryValueTier: string | null;
  moneyPriority: string | null;
  seedReasonSummary: string;
  recalcGateDecision?: DecisionRecalcGateDecision | null;
  recalcGateReason?: string | null;
};

export type CalibrationSeedRefreshSelectionReport = {
  generatedAt: string;
  targets: {
    decisionRecalc: number;
    deepRepairHighValue: number;
    deepRepairGeneralValue: number;
    evidenceRepairWeakOnly: number;
    evidenceRepairNonWeakOnly: number;
  };
  totalSeeded: number;
  groupCounts: Record<CalibrationSeedRefreshGroup, number>;
  sliceCounts: Record<CalibrationSeedRefreshSlice, number>;
  insufficientGroups: CalibrationSeedRefreshGroup[];
  insufficientSlices: CalibrationSeedRefreshSlice[];
  decisionGateSummary: {
    totalCandidates: number;
    gateDecisionBreakdown: Record<DecisionRecalcGateDecision, number>;
    allowedCandidates: number;
    suppressedReplayCandidates: number;
    suppressedCleanupCandidates: number;
    allowedButLowExpectedValueCandidates: number;
  };
  items: CalibrationSeedRefreshSelectionItem[];
  samples: Record<CalibrationSeedRefreshGroup, CalibrationSeedRefreshSelectionItem[]>;
};

type CalibrationSeedRefreshSummary = {
  selectedCount: number;
  executedCount: number;
  positiveCount: number;
  positiveRate: number;
  outcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
  repairValueClassBreakdown: Record<AnalysisRepairValueClass, number>;
  qualityImprovementCount: number;
  gapReductionCount: number;
  noChangeCount: number;
  trustedChangedCount: number;
  decisionChangedCount: number;
  fallbackUsedCount: number;
  reviewUsedCount: number;
  avgQualityDelta: number;
  topGaps: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>;
  sliceBreakdown: Partial<
    Record<
      CalibrationSeedRefreshSlice,
      {
        selectedCount: number;
        executedCount: number;
        noChangeCount: number;
        positiveCount: number;
      }
    >
  >;
};

export type CalibrationSeedRefreshExecutionSample = {
  repositoryId: string;
  fullName: string;
  seedGroup: CalibrationSeedRefreshGroup;
  seedSlice: CalibrationSeedRefreshSlice;
  outcomeStatus: AnalysisOutcomeStatus;
  repairValueClass: AnalysisRepairValueClass;
  capabilityTier: string | null;
  qualityStateBefore: HistoricalInventoryQualityState | 'UNKNOWN';
  qualityDelta: number;
  gapCountDelta: number;
  blockingGapDelta: number;
  trustedChanged: boolean;
  decisionChanged: boolean;
  fallbackUsed: boolean;
  reviewUsed: boolean;
  reason: string;
};

export type CalibrationSeedRefreshComparison = {
  baselineGeneratedAt: string | null;
  baselineTotals: {
    totalSeeded: number;
    outcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
    repairValueClassBreakdown: Record<AnalysisRepairValueClass, number>;
  } | null;
  actionComparisons: Array<{
    action: 'decision_recalc' | 'deep_repair' | 'evidence_repair';
    baselineSelectedCount: number;
    refreshSelectedCount: number;
    baselinePositiveRate: number;
    refreshPositiveRate: number;
    baselineNoChangeRate: number;
    refreshNoChangeRate: number;
    summary: string;
  }>;
  overturnedConclusions: string[];
  reinforcedConclusions: string[];
  higherConfidenceJudgments: string[];
};

export type CalibrationSeedRefreshReport = {
  generatedAt: string;
  selection: CalibrationSeedRefreshSelectionReport;
  executionSummary: {
    totalSeeded: number;
    executedCount: number;
    skippedCount: number;
    outcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
    repairValueClassBreakdown: Record<AnalysisRepairValueClass, number>;
    qualityDeltaSummary: AnalysisOutcomeSnapshot['summary']['qualityDeltaSummary'];
    trustedChangedCount: number;
    decisionChangedCount: number;
    fallbackUsedCount: number;
    reviewUsedCount: number;
    skippedByCleanupCount: number;
  };
  groupResults: Record<CalibrationSeedRefreshGroup, CalibrationSeedRefreshSummary>;
  tierCalibration: {
    capabilityTierBreakdown: Record<string, number>;
    reviewWorthKeeping: string[];
    heavyWorthKeeping: string[];
    likelyOverweight: string[];
    likelyUnderweight: string[];
  };
  qualityCalibration: {
    stateBreakdown: Array<{
      qualityState: HistoricalInventoryQualityState | 'UNKNOWN';
      count: number;
      positiveCount: number;
      noChangeCount: number;
      negativeCount: number;
      averageQualityDelta: number;
    }>;
    statesWithSignal: Array<HistoricalInventoryQualityState | 'UNKNOWN'>;
    lowOrCriticalImprovedCount: number;
    highOrMediumStableCount: number;
    trustedBlockingGapEffectiveCount: number;
  };
  gapCalibration: {
    mostWorthContinuing: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>;
    mostPersistentNoChange: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>;
  };
  comparison: CalibrationSeedRefreshComparison;
  insights: {
    mostValuableAction: string | null;
    mostNoChangeAction: string | null;
    actionsWithSuccessOrPartial: string[];
    evidenceRepairImprovementRate: number;
    decisionRecalcRealNoChangeCount: number;
    deepRepairRealNoChangeCount: number;
  };
  notes: {
    sampleInterpretation: string;
    comparisonInterpretation: string;
    qualityInterpretation: string;
  };
  samples: {
    improved: Array<CalibrationSeedRefreshExecutionSample>;
    noChange: Array<CalibrationSeedRefreshExecutionSample>;
    reviewHeavy: Array<CalibrationSeedRefreshExecutionSample>;
  };
  snapshot: AnalysisOutcomeSnapshot;
};

const PRIORITIZED_DECISION_GAPS: KeyEvidenceGapTaxonomy[] = [
  'user_conflict',
  'monetization_conflict',
  'execution_conflict',
];
const PRIORITIZED_DEEP_GAPS: KeyEvidenceGapTaxonomy[] = [
  'technical_maturity_missing',
  'execution_missing',
  'market_missing',
  'distribution_missing',
];

export function buildCalibrationSeedRefreshSelectionReport(args: {
  generatedAt?: string;
  items: HistoricalRepairPriorityItem[];
  decisionGateSnapshot: DecisionRecalcGateSnapshot | null;
  decisionRecalcTarget?: number;
  deepRepairHighValueTarget?: number;
  deepRepairGeneralValueTarget?: number;
  evidenceRepairWeakOnlyTarget?: number;
  evidenceRepairNonWeakOnlyTarget?: number;
}): CalibrationSeedRefreshSelectionReport {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const targets = {
    decisionRecalc: Math.max(0, Math.round(args.decisionRecalcTarget ?? 20)),
    deepRepairHighValue: Math.max(
      0,
      Math.round(args.deepRepairHighValueTarget ?? 10),
    ),
    deepRepairGeneralValue: Math.max(
      0,
      Math.round(args.deepRepairGeneralValueTarget ?? 10),
    ),
    evidenceRepairWeakOnly: Math.max(
      0,
      Math.round(args.evidenceRepairWeakOnlyTarget ?? 10),
    ),
    evidenceRepairNonWeakOnly: Math.max(
      0,
      Math.round(args.evidenceRepairNonWeakOnlyTarget ?? 10),
    ),
  };
  const usedRepositoryIds = new Set<string>();
  const decisionGateMap = new Map(
    (args.decisionGateSnapshot?.items ?? []).map((item) => [item.repositoryId, item]),
  );
  const decisionGateSummary = buildDecisionGateSummary(
    args.items.filter((item) => item.historicalRepairAction === 'decision_recalc'),
    decisionGateMap,
  );
  const decisionSeeds = pickDecisionRecalcRefreshSeeds({
    items: args.items,
    target: targets.decisionRecalc,
    gateMap: decisionGateMap,
    usedRepositoryIds,
  });
  const deepHighSeeds = pickDeepRepairRefreshSeeds({
    items: args.items,
    target: targets.deepRepairHighValue,
    usedRepositoryIds,
    highValueOnly: true,
  });
  const deepGeneralSeeds = pickDeepRepairRefreshSeeds({
    items: args.items,
    target: targets.deepRepairGeneralValue,
    usedRepositoryIds,
    highValueOnly: false,
  });
  const evidenceWeakSeeds = pickEvidenceRepairRefreshSeeds({
    items: args.items,
    target: targets.evidenceRepairWeakOnly,
    usedRepositoryIds,
    weakOnly: true,
  });
  const evidenceNonWeakSeeds = pickEvidenceRepairRefreshSeeds({
    items: args.items,
    target: targets.evidenceRepairNonWeakOnly,
    usedRepositoryIds,
    weakOnly: false,
  });
  const items = [
    ...decisionSeeds,
    ...deepHighSeeds,
    ...deepGeneralSeeds,
    ...evidenceWeakSeeds,
    ...evidenceNonWeakSeeds,
  ];
  const groupCounts = {
    decision_recalc_refresh: decisionSeeds.length,
    deep_repair_refresh: deepHighSeeds.length + deepGeneralSeeds.length,
    evidence_repair_refresh:
      evidenceWeakSeeds.length + evidenceNonWeakSeeds.length,
  } satisfies Record<CalibrationSeedRefreshGroup, number>;
  const sliceCounts = {
    allowed_recalc: decisionSeeds.length,
    high_value: deepHighSeeds.length,
    general_value: deepGeneralSeeds.length,
    weak_only: evidenceWeakSeeds.length,
    non_weak_only: evidenceNonWeakSeeds.length,
  } satisfies Record<CalibrationSeedRefreshSlice, number>;

  return {
    generatedAt,
    targets,
    totalSeeded: items.length,
    groupCounts,
    sliceCounts,
    insufficientGroups: (Object.entries(groupCounts) as Array<
      [CalibrationSeedRefreshGroup, number]
    >)
      .filter(([group, count]) => count < minGroupTarget(group, targets))
      .map(([group]) => group),
    insufficientSlices: (
      Object.entries(sliceCounts) as Array<[CalibrationSeedRefreshSlice, number]>
    )
      .filter(([slice, count]) => count < minSliceTarget(slice, targets))
      .map(([slice]) => slice),
    decisionGateSummary,
    items,
    samples: {
      decision_recalc_refresh: items
        .filter((item) => item.seedGroup === 'decision_recalc_refresh')
        .slice(0, 8),
      deep_repair_refresh: items
        .filter((item) => item.seedGroup === 'deep_repair_refresh')
        .slice(0, 8),
      evidence_repair_refresh: items
        .filter((item) => item.seedGroup === 'evidence_repair_refresh')
        .slice(0, 8),
    },
  };
}

export function buildCalibrationSeedRefreshReport(args: {
  generatedAt?: string;
  selection: CalibrationSeedRefreshSelectionReport;
  logs: AnalysisOutcomeLog[];
  baseline: CalibrationSeedBatchReport | null;
}): CalibrationSeedRefreshReport {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const snapshot = buildAnalysisOutcomeSnapshot({
    source: 'calibration_seed_batch_refresh',
    generatedAt,
    items: args.logs,
  });
  const selectionMap = new Map(
    args.selection.items.map((item) => [buildSelectionKey(item), item]),
  );
  const executionSamples = snapshot.items
    .map((item) => {
      const selection = selectionMap.get(buildOutcomeSelectionKey(item));
      if (!selection) {
        return null;
      }

      return {
        repositoryId: item.before.repositoryId,
        fullName: selection.fullName,
        seedGroup: selection.seedGroup,
        seedSlice: selection.seedSlice,
        outcomeStatus: item.execution.outcomeStatus,
        repairValueClass: item.delta.repairValueClass,
        capabilityTier: item.router.routerCapabilityTier,
        qualityStateBefore: item.before.analysisQualityStateBefore ?? 'UNKNOWN',
        qualityDelta: item.delta.qualityDelta,
        gapCountDelta: item.delta.gapCountDelta,
        blockingGapDelta: item.delta.blockingGapDelta,
        trustedChanged: item.delta.trustedChanged,
        decisionChanged: item.delta.decisionChanged,
        fallbackUsed: item.execution.executionUsedFallback,
        reviewUsed: item.execution.executionUsedReview,
        reason: item.execution.outcomeReason,
      } satisfies CalibrationSeedRefreshExecutionSample;
    })
    .filter((item): item is CalibrationSeedRefreshExecutionSample => Boolean(item));

  const groupResults = {
    decision_recalc_refresh: summarizeRefreshGroup({
      selection: args.selection.items.filter(
        (item) => item.seedGroup === 'decision_recalc_refresh',
      ),
      logs: findLogsForGroup(snapshot.items, args.selection.items, 'decision_recalc_refresh'),
    }),
    deep_repair_refresh: summarizeRefreshGroup({
      selection: args.selection.items.filter(
        (item) => item.seedGroup === 'deep_repair_refresh',
      ),
      logs: findLogsForGroup(snapshot.items, args.selection.items, 'deep_repair_refresh'),
    }),
    evidence_repair_refresh: summarizeRefreshGroup({
      selection: args.selection.items.filter(
        (item) => item.seedGroup === 'evidence_repair_refresh',
      ),
      logs: findLogsForGroup(
        snapshot.items,
        args.selection.items,
        'evidence_repair_refresh',
      ),
    }),
  } satisfies Record<CalibrationSeedRefreshGroup, CalibrationSeedRefreshSummary>;
  const stateBreakdown = summarizeQualityStates(snapshot.items);
  const improvedSamples = executionSamples
    .filter(
      (item) =>
        item.repairValueClass === 'high' || item.repairValueClass === 'medium',
    )
    .slice(0, 8);
  const noChangeSamples = executionSamples
    .filter((item) => item.outcomeStatus === 'no_change')
    .slice(0, 8);
  const reviewHeavySamples = executionSamples
    .filter(
      (item) =>
        item.capabilityTier === 'REVIEW' || item.capabilityTier === 'HEAVY',
    )
    .slice(0, 8);

  return {
    generatedAt,
    selection: args.selection,
    executionSummary: {
      totalSeeded: args.selection.totalSeeded,
      executedCount:
        snapshot.totalCount -
        snapshot.summary.outcomeStatusBreakdown.skipped -
        snapshot.summary.outcomeStatusBreakdown.failed,
      skippedCount: snapshot.summary.outcomeStatusBreakdown.skipped,
      outcomeStatusBreakdown: snapshot.summary.outcomeStatusBreakdown,
      repairValueClassBreakdown: snapshot.summary.repairValueClassBreakdown,
      qualityDeltaSummary: snapshot.summary.qualityDeltaSummary,
      trustedChangedCount: snapshot.summary.trustedChangedCount,
      decisionChangedCount: snapshot.summary.decisionChangedCount,
      fallbackUsedCount: snapshot.summary.fallbackUsedCount,
      reviewUsedCount: snapshot.summary.reviewUsedCount,
      skippedByCleanupCount: snapshot.summary.skippedByCleanupCount,
    },
    groupResults,
    tierCalibration: {
      capabilityTierBreakdown: snapshot.summary.routerCapabilityBreakdown,
      reviewWorthKeeping: buildWorthKeepingTaskList({
        logs: snapshot.items,
        tier: 'REVIEW',
      }),
      heavyWorthKeeping: buildWorthKeepingTaskList({
        logs: snapshot.items,
        tier: 'HEAVY',
      }),
      likelyOverweight: buildOverweightTaskList(snapshot.items),
      likelyUnderweight: buildUnderweightTaskList(snapshot.items),
    },
    qualityCalibration: {
      stateBreakdown,
      statesWithSignal: stateBreakdown
        .filter(
          (item) => item.positiveCount > 0 || item.averageQualityDelta > 0,
        )
        .map((item) => item.qualityState),
      lowOrCriticalImprovedCount: snapshot.items.filter(
        (item) =>
          (item.before.analysisQualityStateBefore === 'LOW' ||
            item.before.analysisQualityStateBefore === 'CRITICAL') &&
          (item.delta.repairValueClass === 'high' ||
            item.delta.repairValueClass === 'medium'),
      ).length,
      highOrMediumStableCount: snapshot.items.filter(
        (item) =>
          (item.before.analysisQualityStateBefore === 'HIGH' ||
            item.before.analysisQualityStateBefore === 'MEDIUM') &&
          (item.execution.outcomeStatus === 'success' ||
            item.execution.outcomeStatus === 'partial' ||
            item.execution.outcomeStatus === 'no_change'),
      ).length,
      trustedBlockingGapEffectiveCount: snapshot.items.filter(
        (item) =>
          item.before.trustedBlockingGapsBefore.length > 0 &&
          item.delta.trustedChanged,
      ).length,
    },
    gapCalibration: {
      mostWorthContinuing: summarizeGaps(snapshot.items, {
        predicate: (item) =>
          item.delta.repairValueClass === 'high' ||
          item.delta.repairValueClass === 'medium' ||
          item.delta.gapCountDelta < 0,
      }),
      mostPersistentNoChange: summarizeGaps(snapshot.items, {
        predicate: (item) => item.execution.outcomeStatus === 'no_change',
      }),
    },
    comparison: buildRefreshComparison({
      baseline: args.baseline,
      refreshGroupResults: groupResults,
      refreshExecutionSummary: snapshot.summary,
      selection: args.selection,
    }),
    insights: {
      mostValuableAction: findMostValuableAction(groupResults),
      mostNoChangeAction: findMostNoChangeAction(groupResults),
      actionsWithSuccessOrPartial: findActionsWithSuccessOrPartial(snapshot.items),
      evidenceRepairImprovementRate:
        groupResults.evidence_repair_refresh.positiveRate,
      decisionRecalcRealNoChangeCount:
        groupResults.decision_recalc_refresh.noChangeCount,
      deepRepairRealNoChangeCount: groupResults.deep_repair_refresh.noChangeCount,
    },
    notes: {
      sampleInterpretation:
        args.selection.groupCounts.decision_recalc_refresh === 0
          ? 'decision_recalc_refresh 现在只看 gate 允许样本；若数量为 0，说明 replay suppression 已把旧 baseline 的 replay 样本挡在门外。'
          : 'decision_recalc_refresh 已只保留通过 gate 的允许样本，可用于重新评估真实 recalc 收益。',
      comparisonInterpretation:
        '修前/修后对比以旧 calibration seed baseline 为参照；若 decision_recalc_refresh 样本为 0，应把旧 20/20 no_change 视为被 replay 污染的旧结论。',
      qualityInterpretation:
        '优先看 LOW/CRITICAL 是否开始出现真实改善，再看 HIGH/MEDIUM 是否更稳定；当前结论仍应结合 refresh 样本量解读。',
    },
    samples: {
      improved: improvedSamples,
      noChange: noChangeSamples,
      reviewHeavy: reviewHeavySamples,
    },
    snapshot,
  };
}

export function renderCalibrationSeedRefreshMarkdown(
  report: CalibrationSeedRefreshReport,
) {
  const lines = [
    '# GitDian Calibration Seed Refresh Report',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- totalSeeded: ${report.selection.totalSeeded}`,
    `- decision_recalc_refresh: ${report.selection.groupCounts.decision_recalc_refresh}`,
    `- deep_repair_refresh: ${report.selection.groupCounts.deep_repair_refresh}`,
    `- evidence_repair_refresh: ${report.selection.groupCounts.evidence_repair_refresh}`,
    `- insufficientGroups: ${
      report.selection.insufficientGroups.length
        ? report.selection.insufficientGroups.join(', ')
        : 'none'
    }`,
    `- insufficientSlices: ${
      report.selection.insufficientSlices.length
        ? report.selection.insufficientSlices.join(', ')
        : 'none'
    }`,
    '',
    '## Refresh Selection',
    '',
    `- decision.allow_recalc_target: ${report.selection.targets.decisionRecalc}`,
    `- deep.high_value_target: ${report.selection.targets.deepRepairHighValue}`,
    `- deep.general_value_target: ${report.selection.targets.deepRepairGeneralValue}`,
    `- evidence.weak_only_target: ${report.selection.targets.evidenceRepairWeakOnly}`,
    `- evidence.non_weak_only_target: ${report.selection.targets.evidenceRepairNonWeakOnly}`,
    `- gate.total_candidates: ${report.selection.decisionGateSummary.totalCandidates}`,
    ...(['allow_recalc', 'suppress_replay', 'allow_recalc_but_expect_no_change', 'suppress_cleanup'] as DecisionRecalcGateDecision[]).map(
      (decision) =>
        `- gate.${decision}: ${report.selection.decisionGateSummary.gateDecisionBreakdown[decision]}`,
    ),
    '',
    '## Execution Summary',
    '',
    ...ANALYSIS_OUTCOME_STATUSES.map(
      (status) =>
        `- outcome.${status}: ${report.executionSummary.outcomeStatusBreakdown[status]}`,
    ),
    ...ANALYSIS_REPAIR_VALUE_CLASSES.map(
      (valueClass) =>
        `- repairValue.${valueClass}: ${report.executionSummary.repairValueClassBreakdown[valueClass]}`,
    ),
    `- executedCount: ${report.executionSummary.executedCount}`,
    `- skippedCount: ${report.executionSummary.skippedCount}`,
    `- trustedChangedCount: ${report.executionSummary.trustedChangedCount}`,
    `- decisionChangedCount: ${report.executionSummary.decisionChangedCount}`,
    `- fallbackUsedCount: ${report.executionSummary.fallbackUsedCount}`,
    `- reviewUsedCount: ${report.executionSummary.reviewUsedCount}`,
    '',
    '## Refresh Group Results',
    '',
    ...renderRefreshSeedGroupMarkdown(
      'decision_recalc_refresh',
      report.groupResults.decision_recalc_refresh,
    ),
    '',
    ...renderRefreshSeedGroupMarkdown(
      'deep_repair_refresh',
      report.groupResults.deep_repair_refresh,
    ),
    '',
    ...renderRefreshSeedGroupMarkdown(
      'evidence_repair_refresh',
      report.groupResults.evidence_repair_refresh,
    ),
    '',
    '## Tier Calibration',
    '',
    ...Object.entries(report.tierCalibration.capabilityTierBreakdown).map(
      ([tier, count]) => `- ${tier}: ${count}`,
    ),
    `- reviewWorthKeeping: ${renderList(report.tierCalibration.reviewWorthKeeping)}`,
    `- heavyWorthKeeping: ${renderList(report.tierCalibration.heavyWorthKeeping)}`,
    `- likelyOverweight: ${renderList(report.tierCalibration.likelyOverweight)}`,
    `- likelyUnderweight: ${renderList(report.tierCalibration.likelyUnderweight)}`,
    '',
    '## Quality Calibration',
    '',
    ...report.qualityCalibration.stateBreakdown.map(
      (item) =>
        `- ${item.qualityState}: count=${item.count} positive=${item.positiveCount} noChange=${item.noChangeCount} negative=${item.negativeCount} avgQualityDelta=${item.averageQualityDelta}`,
    ),
    `- statesWithSignal: ${renderList(report.qualityCalibration.statesWithSignal)}`,
    `- lowOrCriticalImprovedCount: ${report.qualityCalibration.lowOrCriticalImprovedCount}`,
    `- highOrMediumStableCount: ${report.qualityCalibration.highOrMediumStableCount}`,
    `- trustedBlockingGapEffectiveCount: ${report.qualityCalibration.trustedBlockingGapEffectiveCount}`,
    '',
    '## Gap Calibration',
    '',
    `- mostWorthContinuing: ${renderGapList(report.gapCalibration.mostWorthContinuing)}`,
    `- mostPersistentNoChange: ${renderGapList(report.gapCalibration.mostPersistentNoChange)}`,
    '',
    '## Comparison',
    '',
    `- baselineGeneratedAt: ${report.comparison.baselineGeneratedAt ?? 'none'}`,
    ...report.comparison.actionComparisons.map(
      (item) =>
        `- ${item.action}: baselineSelected=${item.baselineSelectedCount} refreshSelected=${item.refreshSelectedCount} baselinePositiveRate=${item.baselinePositiveRate} refreshPositiveRate=${item.refreshPositiveRate} baselineNoChangeRate=${item.baselineNoChangeRate} refreshNoChangeRate=${item.refreshNoChangeRate} | ${item.summary}`,
    ),
    `- overturnedConclusions: ${renderList(report.comparison.overturnedConclusions)}`,
    `- reinforcedConclusions: ${renderList(report.comparison.reinforcedConclusions)}`,
    `- higherConfidenceJudgments: ${renderList(report.comparison.higherConfidenceJudgments)}`,
    '',
    '## Insights',
    '',
    `- mostValuableAction: ${report.insights.mostValuableAction ?? 'none'}`,
    `- mostNoChangeAction: ${report.insights.mostNoChangeAction ?? 'none'}`,
    `- actionsWithSuccessOrPartial: ${renderList(report.insights.actionsWithSuccessOrPartial)}`,
    `- evidenceRepairImprovementRate: ${report.insights.evidenceRepairImprovementRate}`,
    `- decisionRecalcRealNoChangeCount: ${report.insights.decisionRecalcRealNoChangeCount}`,
    `- deepRepairRealNoChangeCount: ${report.insights.deepRepairRealNoChangeCount}`,
    '',
    '## Notes',
    '',
    `- ${report.notes.sampleInterpretation}`,
    `- ${report.notes.comparisonInterpretation}`,
    `- ${report.notes.qualityInterpretation}`,
    '',
    '## Samples',
    '',
    '### improved',
    ...renderExecutionSamples(report.samples.improved),
    '',
    '### no_change',
    ...renderExecutionSamples(report.samples.noChange),
    '',
    '### review_or_heavy',
    ...renderExecutionSamples(report.samples.reviewHeavy),
    '',
    '## Command',
    '',
    '- command: pnpm --filter api report:calibration-seed-refresh',
  ];

  return lines.join('\n');
}

function buildDecisionGateSummary(
  items: HistoricalRepairPriorityItem[],
  gateMap: Map<string, DecisionRecalcGateResult>,
) {
  const breakdown = {
    allow_recalc: 0,
    suppress_replay: 0,
    allow_recalc_but_expect_no_change: 0,
    suppress_cleanup: 0,
  } satisfies Record<DecisionRecalcGateDecision, number>;

  for (const item of items) {
    const decision =
      gateMap.get(item.repoId)?.recalcGateDecision ?? 'suppress_replay';
    breakdown[decision] += 1;
  }

  return {
    totalCandidates: items.length,
    gateDecisionBreakdown: breakdown,
    allowedCandidates: breakdown.allow_recalc,
    suppressedReplayCandidates: breakdown.suppress_replay,
    suppressedCleanupCandidates: breakdown.suppress_cleanup,
    allowedButLowExpectedValueCandidates:
      breakdown.allow_recalc_but_expect_no_change,
  };
}

function pickDecisionRecalcRefreshSeeds(args: {
  items: HistoricalRepairPriorityItem[];
  target: number;
  gateMap: Map<string, DecisionRecalcGateResult>;
  usedRepositoryIds: Set<string>;
}) {
  return args.items
    .filter((item) => item.historicalRepairAction === 'decision_recalc')
    .filter((item) => item.cleanupState === 'active')
    .map((item) => ({
      item,
      gate: args.gateMap.get(item.repoId) ?? null,
    }))
    .filter(({ gate }) => gate?.recalcGateDecision === 'allow_recalc')
    .sort((left, right) => {
      const leftPriority = prioritizedGapScore(
        left.item.decisionRecalcGaps,
        PRIORITIZED_DECISION_GAPS,
      );
      const rightPriority = prioritizedGapScore(
        right.item.decisionRecalcGaps,
        PRIORITIZED_DECISION_GAPS,
      );
      if (rightPriority !== leftPriority) {
        return rightPriority - leftPriority;
      }
      return (
        right.item.historicalRepairPriorityScore -
        left.item.historicalRepairPriorityScore
      );
    })
    .filter(({ item }) => markUsed(args.usedRepositoryIds, item.repoId))
    .slice(0, args.target)
    .map(({ item, gate }) =>
      mapRefreshSelectionItem({
        item,
        seedGroup: 'decision_recalc_refresh',
        seedSlice: 'allowed_recalc',
        seedReasonSummary: `${gate?.recalcGateReason ?? 'allow_recalc'} | conflict gaps: ${item.decisionRecalcGaps
          .slice(0, 3)
          .join(', ')}`,
        recalcGateDecision: gate?.recalcGateDecision ?? null,
        recalcGateReason: gate?.recalcGateReason ?? null,
      }),
    );
}

function pickDeepRepairRefreshSeeds(args: {
  items: HistoricalRepairPriorityItem[];
  target: number;
  usedRepositoryIds: Set<string>;
  highValueOnly: boolean;
}) {
  return args.items
    .filter((item) => item.historicalRepairAction === 'deep_repair')
    .filter((item) => item.cleanupState === 'active')
    .filter((item) => item.deepRepairGaps.length > 0)
    .filter((item) => isHighValueItem(item) === args.highValueOnly)
    .sort((left, right) => {
      const leftPriority = prioritizedGapScore(
        left.deepRepairGaps,
        PRIORITIZED_DEEP_GAPS,
      );
      const rightPriority = prioritizedGapScore(
        right.deepRepairGaps,
        PRIORITIZED_DEEP_GAPS,
      );
      if (rightPriority !== leftPriority) {
        return rightPriority - leftPriority;
      }
      return (
        right.historicalRepairPriorityScore - left.historicalRepairPriorityScore
      );
    })
    .filter((item) => markUsed(args.usedRepositoryIds, item.repoId))
    .slice(0, args.target)
    .map((item) =>
      mapRefreshSelectionItem({
        item,
        seedGroup: 'deep_repair_refresh',
        seedSlice: args.highValueOnly ? 'high_value' : 'general_value',
        seedReasonSummary: `${args.highValueOnly ? 'high_value' : 'general_value'} deep gaps: ${item.deepRepairGaps
          .slice(0, 4)
          .join(', ')}`,
      }),
    );
}

function pickEvidenceRepairRefreshSeeds(args: {
  items: HistoricalRepairPriorityItem[];
  target: number;
  usedRepositoryIds: Set<string>;
  weakOnly: boolean;
}) {
  return args.items
    .filter((item) => item.historicalRepairAction === 'evidence_repair')
    .filter((item) => item.cleanupState === 'active')
    .filter((item) => item.evidenceRepairGaps.length > 0)
    .filter((item) => isWeakOnlyEvidenceRepair(item) === args.weakOnly)
    .sort((left, right) => {
      const leftScore = valueScore(left);
      const rightScore = valueScore(right);
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return (
        right.historicalRepairPriorityScore - left.historicalRepairPriorityScore
      );
    })
    .filter((item) => markUsed(args.usedRepositoryIds, item.repoId))
    .slice(0, args.target)
    .map((item) =>
      mapRefreshSelectionItem({
        item,
        seedGroup: 'evidence_repair_refresh',
        seedSlice: args.weakOnly ? 'weak_only' : 'non_weak_only',
        seedReasonSummary: `${args.weakOnly ? 'weak_only' : 'non_weak_only'} evidence gaps: ${item.evidenceRepairGaps
          .slice(0, 4)
          .join(', ')}`,
      }),
    );
}

function mapRefreshSelectionItem(args: {
  item: HistoricalRepairPriorityItem;
  seedGroup: CalibrationSeedRefreshGroup;
  seedSlice: CalibrationSeedRefreshSlice;
  seedReasonSummary: string;
  recalcGateDecision?: DecisionRecalcGateDecision | null;
  recalcGateReason?: string | null;
}): CalibrationSeedRefreshSelectionItem {
  return {
    repositoryId: args.item.repoId,
    fullName: args.item.fullName,
    seedGroup: args.seedGroup,
    seedSlice: args.seedSlice,
    historicalRepairBucket: args.item.historicalRepairBucket,
    historicalRepairAction: args.item.historicalRepairAction,
    routerCapabilityTier: buildModelTaskRouterDecisionFromHistoricalItem(args.item)
      .capabilityTier,
    analysisQualityStateBefore: args.item.analysisQualityState,
    keyEvidenceGapsBefore: args.item.keyEvidenceGaps,
    trustedBlockingGapsBefore: args.item.trustedBlockingGaps,
    strictVisibilityLevel: args.item.strictVisibilityLevel,
    repositoryValueTier: args.item.repositoryValueTier,
    moneyPriority: args.item.moneyPriority,
    seedReasonSummary: args.seedReasonSummary,
    recalcGateDecision: args.recalcGateDecision ?? null,
    recalcGateReason: args.recalcGateReason ?? null,
  };
}

function summarizeRefreshGroup(args: {
  selection: CalibrationSeedRefreshSelectionItem[];
  logs: AnalysisOutcomeLog[];
}): CalibrationSeedRefreshSummary {
  const outcomeStatusBreakdown = buildStatusBreakdown();
  const repairValueClassBreakdown = buildValueBreakdown();
  const gapCounts = new Map<KeyEvidenceGapTaxonomy, number>();
  const sliceBreakdown: CalibrationSeedRefreshSummary['sliceBreakdown'] = {};
  const selectedBySlice = new Map<CalibrationSeedRefreshSlice, number>();
  let positiveCount = 0;
  let qualityImprovementCount = 0;
  let gapReductionCount = 0;
  let noChangeCount = 0;
  let trustedChangedCount = 0;
  let decisionChangedCount = 0;
  let fallbackUsedCount = 0;
  let reviewUsedCount = 0;
  let totalQualityDelta = 0;

  for (const selection of args.selection) {
    selectedBySlice.set(
      selection.seedSlice,
      (selectedBySlice.get(selection.seedSlice) ?? 0) + 1,
    );
  }

  for (const log of args.logs) {
    outcomeStatusBreakdown[log.execution.outcomeStatus] += 1;
    repairValueClassBreakdown[log.delta.repairValueClass] += 1;
    if (
      log.delta.repairValueClass === 'high' ||
      log.delta.repairValueClass === 'medium'
    ) {
      positiveCount += 1;
    }
    if (log.delta.qualityDelta > 0) {
      qualityImprovementCount += 1;
    }
    if (log.delta.gapCountDelta < 0) {
      gapReductionCount += 1;
    }
    if (log.execution.outcomeStatus === 'no_change') {
      noChangeCount += 1;
    }
    if (log.delta.trustedChanged) {
      trustedChangedCount += 1;
    }
    if (log.delta.decisionChanged) {
      decisionChangedCount += 1;
    }
    if (log.execution.executionUsedFallback) {
      fallbackUsedCount += 1;
    }
    if (log.execution.executionUsedReview) {
      reviewUsedCount += 1;
    }
    totalQualityDelta += log.delta.qualityDelta;
    for (const gap of log.before.keyEvidenceGapsBefore) {
      gapCounts.set(gap as KeyEvidenceGapTaxonomy, (gapCounts.get(gap as KeyEvidenceGapTaxonomy) ?? 0) + 1);
    }
  }

  for (const [slice, selectedCount] of selectedBySlice.entries()) {
    const sliceLogs = args.logs.filter((log) => {
      const selection = args.selection.find(
        (item) =>
          item.repositoryId === log.before.repositoryId &&
          item.historicalRepairAction ===
            (log.before.historicalRepairAction ?? log.before.normalizedTaskType),
      );
      return selection?.seedSlice === slice;
    });
    sliceBreakdown[slice] = {
      selectedCount,
      executedCount: sliceLogs.length,
      noChangeCount: sliceLogs.filter(
        (log) => log.execution.outcomeStatus === 'no_change',
      ).length,
      positiveCount: sliceLogs.filter(
        (log) =>
          log.delta.repairValueClass === 'high' ||
          log.delta.repairValueClass === 'medium',
      ).length,
    };
  }

  return {
    selectedCount: args.selection.length,
    executedCount: args.logs.length,
    positiveCount,
    positiveRate: args.logs.length ? round(positiveCount / args.logs.length) : 0,
    outcomeStatusBreakdown,
    repairValueClassBreakdown,
    qualityImprovementCount,
    gapReductionCount,
    noChangeCount,
    trustedChangedCount,
    decisionChangedCount,
    fallbackUsedCount,
    reviewUsedCount,
    avgQualityDelta: args.logs.length
      ? round(totalQualityDelta / args.logs.length)
      : 0,
    topGaps: [...gapCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([gap, count]) => ({ gap, count })),
    sliceBreakdown,
  };
}

function summarizeQualityStates(logs: AnalysisOutcomeLog[]) {
  const summaryMap = new Map<
    HistoricalInventoryQualityState | 'UNKNOWN',
    {
      count: number;
      positiveCount: number;
      noChangeCount: number;
      negativeCount: number;
      totalQualityDelta: number;
    }
  >();

  for (const log of logs) {
    const key =
      (log.before.analysisQualityStateBefore as HistoricalInventoryQualityState | null) ??
      'UNKNOWN';
    const entry = summaryMap.get(key) ?? {
      count: 0,
      positiveCount: 0,
      noChangeCount: 0,
      negativeCount: 0,
      totalQualityDelta: 0,
    };
    entry.count += 1;
    entry.totalQualityDelta += log.delta.qualityDelta;
    if (
      log.delta.repairValueClass === 'high' ||
      log.delta.repairValueClass === 'medium'
    ) {
      entry.positiveCount += 1;
    } else if (
      log.delta.repairValueClass === 'negative' ||
      log.execution.outcomeStatus === 'failed'
    ) {
      entry.negativeCount += 1;
    }
    if (log.execution.outcomeStatus === 'no_change') {
      entry.noChangeCount += 1;
    }
    summaryMap.set(key, entry);
  }

  return [...summaryMap.entries()]
    .map(([qualityState, entry]) => ({
      qualityState,
      count: entry.count,
      positiveCount: entry.positiveCount,
      noChangeCount: entry.noChangeCount,
      negativeCount: entry.negativeCount,
      averageQualityDelta: entry.count
        ? round(entry.totalQualityDelta / entry.count)
        : 0,
    }))
    .sort((left, right) => right.count - left.count);
}

function summarizeGaps(
  logs: AnalysisOutcomeLog[],
  args: {
    predicate: (item: AnalysisOutcomeLog) => boolean;
  },
) {
  const gapCounts = new Map<KeyEvidenceGapTaxonomy, number>();

  for (const log of logs) {
    if (!args.predicate(log)) {
      continue;
    }
    for (const gap of log.before.keyEvidenceGapsBefore) {
      gapCounts.set(gap as KeyEvidenceGapTaxonomy, (gapCounts.get(gap as KeyEvidenceGapTaxonomy) ?? 0) + 1);
    }
  }

  return [...gapCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([gap, count]) => ({ gap, count }));
}

function buildRefreshComparison(args: {
  baseline: CalibrationSeedBatchReport | null;
  refreshGroupResults: Record<CalibrationSeedRefreshGroup, CalibrationSeedRefreshSummary>;
  refreshExecutionSummary: AnalysisOutcomeSnapshot['summary'];
  selection: CalibrationSeedRefreshSelectionReport;
}): CalibrationSeedRefreshComparison {
  const baseline = args.baseline;
  const baselineOutcomeBreakdown =
    baseline?.executionSummary?.outcomeStatusBreakdown ?? null;
  const baselineValueBreakdown =
    baseline?.executionSummary?.repairValueClassBreakdown ?? null;
  const comparisons = [
    compareAction({
      action: 'decision_recalc',
      baselineGroup: baseline?.groupResults?.decision_recalc ?? null,
      refreshGroup: args.refreshGroupResults.decision_recalc_refresh,
      refreshSelectedCount: args.selection.groupCounts.decision_recalc_refresh,
      gateSummary: args.selection.decisionGateSummary,
    }),
    compareAction({
      action: 'deep_repair',
      baselineGroup: baseline?.groupResults?.deep_repair ?? null,
      refreshGroup: args.refreshGroupResults.deep_repair_refresh,
      refreshSelectedCount: args.selection.groupCounts.deep_repair_refresh,
      gateSummary: args.selection.decisionGateSummary,
    }),
    compareAction({
      action: 'evidence_repair',
      baselineGroup: baseline?.groupResults?.evidence_repair ?? null,
      refreshGroup: args.refreshGroupResults.evidence_repair_refresh,
      refreshSelectedCount: args.selection.groupCounts.evidence_repair_refresh,
      gateSummary: args.selection.decisionGateSummary,
    }),
  ];
  const overturnedConclusions: string[] = [];
  const reinforcedConclusions: string[] = [];
  const higherConfidenceJudgments: string[] = [];

  if (
    (baseline?.groupResults?.decision_recalc?.noChangeCount ?? 0) > 0 &&
    args.selection.groupCounts.decision_recalc_refresh === 0 &&
    args.selection.decisionGateSummary.suppressedReplayCandidates > 0
  ) {
    overturnedConclusions.push(
      '旧 baseline 的 decision_recalc 20/20 no_change 不应再视为真实有效动作评估；post-surgery refresh 已把 replay 样本挡在 allowed recalc 之外。',
    );
    higherConfidenceJudgments.push(
      '对 decision_recalc 可以更有把握地下判断：当前主问题是 replay suppression，而不是“allowed recalc 本身普遍无效”。',
    );
  }

  if (
    (baseline?.groupResults?.deep_repair?.noChangeCount ?? 0) >=
      (baseline?.groupResults?.deep_repair?.executedCount ?? 0) &&
    args.refreshGroupResults.deep_repair_refresh.positiveCount > 0
  ) {
    overturnedConclusions.push(
      'deep_repair 不再是旧 baseline 里的“20/20 全 no_change”；writeback hardening 后已经出现真实改善样本。',
    );
    higherConfidenceJudgments.push(
      '对 deep_repair 可以更有把握地下判断：after-state 现在能反映真实结构变化，后续应评估真实收益而不是 stale 假 no_change。',
    );
  }

  if (
    (baseline?.groupResults?.evidence_repair?.noChangeCount ?? 0) >=
    Math.max(1, (baseline?.groupResults?.evidence_repair?.executedCount ?? 0) - 1)
  ) {
    if (args.refreshGroupResults.evidence_repair_refresh.noChangeCount > 0) {
      reinforcedConclusions.push(
        'evidence_repair 仍然表现出较高 no_change 占比，旧 baseline 对“弱改善率偏低”的判断被强化了。',
      );
    }
  }

  if (
    args.refreshGroupResults.deep_repair_refresh.positiveCount >
    args.refreshGroupResults.evidence_repair_refresh.positiveCount
  ) {
    higherConfidenceJudgments.push(
      'post-surgery refresh 显示 deep_repair 比 evidence_repair 更可能带来结构性变化，当前更值得继续作为高价值修复动作观察。',
    );
  }

  if (
    reinforcedConclusions.length === 0 &&
    overturnedConclusions.length === 0 &&
    higherConfidenceJudgments.length === 0
  ) {
    reinforcedConclusions.push(
      '当前 refresh 已形成新的 post-surgery 基线，但仍需继续积累更多非 cleanup outcome 才能下更强结论。',
    );
  }

  return {
    baselineGeneratedAt: baseline?.generatedAt ?? null,
    baselineTotals:
      baselineOutcomeBreakdown && baselineValueBreakdown
        ? {
            totalSeeded: baseline?.selection?.totalSeeded ?? 0,
            outcomeStatusBreakdown: baselineOutcomeBreakdown,
            repairValueClassBreakdown: baselineValueBreakdown,
          }
        : null,
    actionComparisons: comparisons,
    overturnedConclusions,
    reinforcedConclusions,
    higherConfidenceJudgments,
  };
}

function compareAction(args: {
  action: 'decision_recalc' | 'deep_repair' | 'evidence_repair';
  baselineGroup:
    | {
        selectedCount: number;
        executedCount: number;
        noChangeCount: number;
        repairValueClassBreakdown: Record<AnalysisRepairValueClass, number>;
      }
    | null;
  refreshGroup: CalibrationSeedRefreshSummary;
  refreshSelectedCount: number;
  gateSummary: CalibrationSeedRefreshSelectionReport['decisionGateSummary'];
}) {
  const baselineSelectedCount = args.baselineGroup?.selectedCount ?? 0;
  const baselineExecutedCount = args.baselineGroup?.executedCount ?? 0;
  const baselinePositiveCount =
    (args.baselineGroup?.repairValueClassBreakdown.high ?? 0) +
    (args.baselineGroup?.repairValueClassBreakdown.medium ?? 0);
  const baselinePositiveRate = baselineExecutedCount
    ? round(baselinePositiveCount / baselineExecutedCount)
    : 0;
  const refreshPositiveRate = args.refreshGroup.positiveRate;
  const baselineNoChangeRate = baselineExecutedCount
    ? round((args.baselineGroup?.noChangeCount ?? 0) / baselineExecutedCount)
    : 0;
  const refreshNoChangeRate = args.refreshGroup.executedCount
    ? round(args.refreshGroup.noChangeCount / args.refreshGroup.executedCount)
    : 0;
  let summary = 'post-surgery refresh 已提供新基线。';

  if (args.action === 'decision_recalc') {
    summary =
      args.refreshSelectedCount === 0
        ? `当前 allowed recalc 样本为 0；${args.gateSummary.suppressedReplayCandidates} 个候选被正式 gate 识别为 replay 并挡住。`
        : `allowed recalc 保留 ${args.refreshSelectedCount} 个样本，baseline no_change rate ${baselineNoChangeRate} -> refresh ${refreshNoChangeRate}。`;
  } else if (args.action === 'deep_repair') {
    summary = `baseline no_change rate ${baselineNoChangeRate} -> refresh ${refreshNoChangeRate}，positive rate ${baselinePositiveRate} -> ${refreshPositiveRate}。`;
  } else if (args.action === 'evidence_repair') {
    summary = `evidence_repair 的 positive rate ${baselinePositiveRate} -> ${refreshPositiveRate}，仍需重点关注 no_change 占比。`;
  }

  return {
    action: args.action,
    baselineSelectedCount,
    refreshSelectedCount: args.refreshSelectedCount,
    baselinePositiveRate,
    refreshPositiveRate,
    baselineNoChangeRate,
    refreshNoChangeRate,
    summary,
  };
}

function findLogsForGroup(
  logs: AnalysisOutcomeLog[],
  selections: CalibrationSeedRefreshSelectionItem[],
  group: CalibrationSeedRefreshGroup,
) {
  const selectionKeys = new Set(
    selections
      .filter((item) => item.seedGroup === group)
      .map((item) => buildSelectionKey(item)),
  );

  return logs.filter((item) => selectionKeys.has(buildOutcomeSelectionKey(item)));
}

function findMostValuableAction(
  groupResults: Record<CalibrationSeedRefreshGroup, CalibrationSeedRefreshSummary>,
) {
  const ranked = Object.entries(groupResults)
    .filter(([, summary]) => summary.executedCount > 0)
    .map(([group, summary]) => ({
      group,
      score:
        summary.positiveRate * 100 +
        summary.decisionChangedCount * 10 +
        summary.trustedChangedCount * 10 -
        summary.noChangeCount,
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.group ?? null;
}

function findMostNoChangeAction(
  groupResults: Record<CalibrationSeedRefreshGroup, CalibrationSeedRefreshSummary>,
) {
  const ranked = Object.entries(groupResults)
    .filter(([, summary]) => summary.executedCount > 0)
    .sort((left, right) => right[1].noChangeCount - left[1].noChangeCount);

  return ranked[0]?.[0] ?? null;
}

function findActionsWithSuccessOrPartial(logs: AnalysisOutcomeLog[]) {
  const actions = new Set<string>();
  for (const log of logs) {
    if (
      log.execution.outcomeStatus === 'success' ||
      log.execution.outcomeStatus === 'partial'
    ) {
      actions.add(
        log.before.historicalRepairAction ?? log.before.normalizedTaskType,
      );
    }
  }

  return [...actions];
}

function buildWorthKeepingTaskList(args: {
  logs: AnalysisOutcomeLog[];
  tier: string;
}) {
  const taskScores = new Map<string, number>();

  for (const log of args.logs) {
    if (log.router.routerCapabilityTier !== args.tier) {
      continue;
    }
    if (
      log.delta.repairValueClass !== 'high' &&
      log.delta.repairValueClass !== 'medium' &&
      !log.delta.decisionChanged &&
      !log.delta.trustedChanged
    ) {
      continue;
    }
    const key = log.before.historicalRepairAction ?? log.before.normalizedTaskType;
    taskScores.set(key, (taskScores.get(key) ?? 0) + 1);
  }

  return [...taskScores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([taskType]) => taskType);
}

function buildOverweightTaskList(logs: AnalysisOutcomeLog[]) {
  return buildTierTaskList({
    logs,
    tiers: new Set(['REVIEW', 'HEAVY']),
    predicate: (log) =>
      log.execution.outcomeStatus === 'no_change' ||
      log.delta.repairValueClass === 'low' ||
      log.delta.repairValueClass === 'negative',
  });
}

function buildUnderweightTaskList(logs: AnalysisOutcomeLog[]) {
  return buildTierTaskList({
    logs,
    tiers: new Set(['LIGHT', 'STANDARD']),
    predicate: (log) =>
      log.delta.repairValueClass === 'high' ||
      log.delta.decisionChanged ||
      log.delta.trustedChanged,
  });
}

function buildTierTaskList(args: {
  logs: AnalysisOutcomeLog[];
  tiers: Set<string>;
  predicate: (log: AnalysisOutcomeLog) => boolean;
}) {
  const taskScores = new Map<string, number>();

  for (const log of args.logs) {
    if (!args.tiers.has(log.router.routerCapabilityTier ?? 'NONE')) {
      continue;
    }
    if (!args.predicate(log)) {
      continue;
    }
    const key = log.before.historicalRepairAction ?? log.before.normalizedTaskType;
    taskScores.set(key, (taskScores.get(key) ?? 0) + 1);
  }

  return [...taskScores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([taskType]) => taskType);
}

function buildStatusBreakdown() {
  return ANALYSIS_OUTCOME_STATUSES.reduce<Record<AnalysisOutcomeStatus, number>>(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {
      success: 0,
      partial: 0,
      no_change: 0,
      failed: 0,
      downgraded: 0,
      skipped: 0,
    },
  );
}

function buildValueBreakdown() {
  return ANALYSIS_REPAIR_VALUE_CLASSES.reduce<
    Record<AnalysisRepairValueClass, number>
  >(
    (acc, valueClass) => {
      acc[valueClass] = 0;
      return acc;
    },
    {
      high: 0,
      medium: 0,
      low: 0,
      negative: 0,
    },
  );
}

function prioritizedGapScore(
  gaps: KeyEvidenceGapTaxonomy[],
  prioritized: KeyEvidenceGapTaxonomy[],
) {
  return gaps.reduce((score, gap) => {
    const index = prioritized.indexOf(gap);
    if (index === -1) {
      return score;
    }
    return score + (prioritized.length - index) * 10;
  }, 0);
}

function valueScore(item: HistoricalRepairPriorityItem) {
  let score = item.historicalRepairPriorityScore;
  if (item.repositoryValueTier === 'HIGH') {
    score += 50;
  } else if (item.repositoryValueTier === 'MEDIUM') {
    score += 20;
  }
  if (item.moneyPriority === 'P0') {
    score += 30;
  } else if (item.moneyPriority === 'P1') {
    score += 20;
  }
  return score;
}

function markUsed(usedRepositoryIds: Set<string>, repositoryId: string) {
  if (usedRepositoryIds.has(repositoryId)) {
    return false;
  }
  usedRepositoryIds.add(repositoryId);
  return true;
}

function isHighValueItem(item: HistoricalRepairPriorityItem) {
  return (
    item.repositoryValueTier === 'HIGH' ||
    item.moneyPriority === 'P0' ||
    item.moneyPriority === 'P1'
  );
}

function isWeakOnlyEvidenceRepair(item: HistoricalRepairPriorityItem) {
  return (
    item.evidenceRepairGaps.length > 0 &&
    item.decisionRecalcGaps.length === 0 &&
    item.deepRepairGaps.length === 0 &&
    item.conflictDrivenGaps.length === 0 &&
    item.missingDrivenGaps.length === 0
  );
}

function minGroupTarget(
  group: CalibrationSeedRefreshGroup,
  targets: CalibrationSeedRefreshSelectionReport['targets'],
) {
  switch (group) {
    case 'decision_recalc_refresh':
      return targets.decisionRecalc;
    case 'deep_repair_refresh':
      return targets.deepRepairHighValue + targets.deepRepairGeneralValue;
    case 'evidence_repair_refresh':
      return (
        targets.evidenceRepairWeakOnly + targets.evidenceRepairNonWeakOnly
      );
  }
}

function minSliceTarget(
  slice: CalibrationSeedRefreshSlice,
  targets: CalibrationSeedRefreshSelectionReport['targets'],
) {
  switch (slice) {
    case 'allowed_recalc':
      return targets.decisionRecalc;
    case 'high_value':
      return targets.deepRepairHighValue;
    case 'general_value':
      return targets.deepRepairGeneralValue;
    case 'weak_only':
      return targets.evidenceRepairWeakOnly;
    case 'non_weak_only':
      return targets.evidenceRepairNonWeakOnly;
  }
}

function buildSelectionKey(item: CalibrationSeedRefreshSelectionItem) {
  return `${item.repositoryId}:${item.historicalRepairAction}`;
}

function buildOutcomeSelectionKey(item: AnalysisOutcomeLog) {
  return `${item.before.repositoryId}:${item.before.historicalRepairAction ?? item.before.normalizedTaskType}`;
}

function renderRefreshSeedGroupMarkdown(
  group: CalibrationSeedRefreshGroup,
  summary: CalibrationSeedRefreshSummary,
) {
  return [
    `### ${group}`,
    `- selectedCount: ${summary.selectedCount}`,
    `- executedCount: ${summary.executedCount}`,
    `- positiveCount: ${summary.positiveCount}`,
    `- positiveRate: ${summary.positiveRate}`,
    ...ANALYSIS_OUTCOME_STATUSES.map(
      (status) => `- outcome.${status}: ${summary.outcomeStatusBreakdown[status]}`,
    ),
    ...ANALYSIS_REPAIR_VALUE_CLASSES.map(
      (valueClass) =>
        `- repairValue.${valueClass}: ${summary.repairValueClassBreakdown[valueClass]}`,
    ),
    `- qualityImprovementCount: ${summary.qualityImprovementCount}`,
    `- gapReductionCount: ${summary.gapReductionCount}`,
    `- noChangeCount: ${summary.noChangeCount}`,
    `- trustedChangedCount: ${summary.trustedChangedCount}`,
    `- decisionChangedCount: ${summary.decisionChangedCount}`,
    `- fallbackUsedCount: ${summary.fallbackUsedCount}`,
    `- reviewUsedCount: ${summary.reviewUsedCount}`,
    `- avgQualityDelta: ${summary.avgQualityDelta}`,
    `- topGaps: ${summary.topGaps.length ? summary.topGaps.map((item) => `${item.gap}(${item.count})`).join(', ') : 'none'}`,
    `- sliceBreakdown: ${
      Object.entries(summary.sliceBreakdown)
        .map(
          ([slice, value]) =>
            `${slice}[selected=${value?.selectedCount ?? 0}, executed=${value?.executedCount ?? 0}, noChange=${value?.noChangeCount ?? 0}, positive=${value?.positiveCount ?? 0}]`,
        )
        .join(', ') || 'none'
    }`,
  ];
}

function renderExecutionSamples(samples: CalibrationSeedRefreshExecutionSample[]) {
  if (!samples.length) {
    return ['- none'];
  }

  return samples.map(
    (sample) =>
      `- ${sample.fullName} | group=${sample.seedGroup} | slice=${sample.seedSlice} | status=${sample.outcomeStatus} | value=${sample.repairValueClass} | tier=${sample.capabilityTier ?? 'NONE'} | qualityDelta=${sample.qualityDelta} | gapDelta=${sample.gapCountDelta} | blockingDelta=${sample.blockingGapDelta} | decisionChanged=${sample.decisionChanged} | trustedChanged=${sample.trustedChanged} | reason=${sample.reason}`,
  );
}

function renderList(values: Array<string | HistoricalInventoryQualityState>) {
  return values.length ? values.join(', ') : 'none';
}

function renderGapList(values: Array<{ gap: string; count: number }>) {
  return values.length
    ? values.map((item) => `${item.gap}(${item.count})`).join(', ')
    : 'none';
}

function round(value: number) {
  return Number(value.toFixed(4));
}
