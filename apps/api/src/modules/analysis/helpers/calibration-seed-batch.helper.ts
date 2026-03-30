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
import type { KeyEvidenceGapTaxonomy } from './evidence-gap-taxonomy.helper';
import type {
  HistoricalInventoryQualityState,
} from './historical-data-inventory.helper';
import type { HistoricalRepairPriorityItem } from './historical-repair-priority.helper';
import type {
  ModelTaskCapabilityTierName,
} from './model-task-router.types';
import { buildModelTaskRouterDecisionFromHistoricalItem } from './model-task-router-decision.helper';

export type CalibrationSeedGroup =
  | 'decision_recalc'
  | 'deep_repair'
  | 'evidence_repair';

export type CalibrationSeedSelectionItem = {
  repositoryId: string;
  fullName: string;
  seedGroup: CalibrationSeedGroup;
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
};

export type CalibrationSeedSelectionReport = {
  generatedAt: string;
  perGroupTarget: number;
  totalSeeded: number;
  groupCounts: Record<CalibrationSeedGroup, number>;
  insufficientGroups: CalibrationSeedGroup[];
  items: CalibrationSeedSelectionItem[];
  samples: Record<CalibrationSeedGroup, CalibrationSeedSelectionItem[]>;
};

type CalibrationSeedSummary = {
  selectedCount: number;
  executedCount: number;
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
};

export type CalibrationSeedBatchReport = {
  generatedAt: string;
  selection: CalibrationSeedSelectionReport;
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
  groupResults: Record<CalibrationSeedGroup, CalibrationSeedSummary>;
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
    lowOrCriticalImprovedCount: number;
    highOrMediumStableCount: number;
    trustedBlockingGapEffectiveCount: number;
  };
  notes: {
    sampleInterpretation: string;
    reviewInterpretation: string;
    qualityInterpretation: string;
  };
  samples: {
    improved: Array<CalibrationSeedExecutionSample>;
    noChange: Array<CalibrationSeedExecutionSample>;
    reviewHeavy: Array<CalibrationSeedExecutionSample>;
  };
  snapshot: AnalysisOutcomeSnapshot;
};

export type CalibrationSeedExecutionSample = {
  repositoryId: string;
  fullName: string;
  seedGroup: CalibrationSeedGroup;
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

export function buildCalibrationSeedSelectionReport(args: {
  generatedAt?: string;
  perGroupTarget: number;
  items: HistoricalRepairPriorityItem[];
}): CalibrationSeedSelectionReport {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const usedRepositoryIds = new Set<string>();
  const decisionSeeds = pickDecisionRecalcSeeds({
    items: args.items,
    target: args.perGroupTarget,
    usedRepositoryIds,
  });
  const deepSeeds = pickDeepRepairSeeds({
    items: args.items,
    target: args.perGroupTarget,
    usedRepositoryIds,
  });
  const evidenceSeeds = pickEvidenceRepairSeeds({
    items: args.items,
    target: args.perGroupTarget,
    usedRepositoryIds,
  });
  const selections = [...decisionSeeds, ...deepSeeds, ...evidenceSeeds];
  const items = selections.map((selection) => selection.seed);
  const groupCounts = {
    decision_recalc: decisionSeeds.length,
    deep_repair: deepSeeds.length,
    evidence_repair: evidenceSeeds.length,
  } satisfies Record<CalibrationSeedGroup, number>;

  return {
    generatedAt,
    perGroupTarget: args.perGroupTarget,
    totalSeeded: items.length,
    groupCounts,
    insufficientGroups: (Object.entries(groupCounts) as Array<
      [CalibrationSeedGroup, number]
    >)
      .filter(([, count]) => count < args.perGroupTarget)
      .map(([group]) => group),
    items,
    samples: {
      decision_recalc: items
        .filter((item) => item.seedGroup === 'decision_recalc')
        .slice(0, 8),
      deep_repair: items
        .filter((item) => item.seedGroup === 'deep_repair')
        .slice(0, 8),
      evidence_repair: items
        .filter((item) => item.seedGroup === 'evidence_repair')
        .slice(0, 8),
    },
  };
}

export function buildCalibrationSeedBatchReport(args: {
  selection: CalibrationSeedSelectionReport;
  logs: AnalysisOutcomeLog[];
  generatedAt?: string;
}): CalibrationSeedBatchReport {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const snapshot = buildAnalysisOutcomeSnapshot({
    source: 'calibration_seed_batch',
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
      } satisfies CalibrationSeedExecutionSample;
    })
    .filter((item): item is CalibrationSeedExecutionSample => Boolean(item));
  const groupResults = {
    decision_recalc: summarizeSeedGroup({
      selection: args.selection.items.filter(
        (item) => item.seedGroup === 'decision_recalc',
      ),
      logs: snapshot.items.filter(
        (item) => item.before.historicalRepairAction === 'decision_recalc',
      ),
    }),
    deep_repair: summarizeSeedGroup({
      selection: args.selection.items.filter((item) => item.seedGroup === 'deep_repair'),
      logs: snapshot.items.filter(
        (item) => item.before.historicalRepairAction === 'deep_repair',
      ),
    }),
    evidence_repair: summarizeSeedGroup({
      selection: args.selection.items.filter(
        (item) => item.seedGroup === 'evidence_repair',
      ),
      logs: snapshot.items.filter(
        (item) => item.before.historicalRepairAction === 'evidence_repair',
      ),
    }),
  } satisfies Record<CalibrationSeedGroup, CalibrationSeedSummary>;

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
    notes: {
      sampleInterpretation:
        snapshot.summary.outcomeStatusBreakdown.skipped > snapshot.totalCount / 2
          ? '样本仍有较强 skipped 成分，当前更多是早期趋势。'
          : '样本已经开始进入非 cleanup 的真实 repair outcome，可用于初步比较 action/tier。', 
      reviewInterpretation:
        'REVIEW/HEAVY 是否值得保留，以 qualityDelta、gap reduction、decisionChanged、trustedChanged 为主，不以单次成功率单独判断。',
      qualityInterpretation:
        '质量校准先看 LOW/CRITICAL 是否真正改善，再看 HIGH/MEDIUM 是否稳定；当前结论仍应结合样本量解读。',
    },
    samples: {
      improved: improvedSamples,
      noChange: noChangeSamples,
      reviewHeavy: reviewHeavySamples,
    },
    snapshot,
  };
}

export function renderCalibrationSeedBatchMarkdown(
  report: CalibrationSeedBatchReport,
) {
  const lines = [
    '# GitDian Calibration Seed Batch Report',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- totalSeeded: ${report.selection.totalSeeded}`,
    `- decision_recalc: ${report.selection.groupCounts.decision_recalc}`,
    `- deep_repair: ${report.selection.groupCounts.deep_repair}`,
    `- evidence_repair: ${report.selection.groupCounts.evidence_repair}`,
    `- insufficientGroups: ${
      report.selection.insufficientGroups.length
        ? report.selection.insufficientGroups.join(', ')
        : 'none'
    }`,
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
    `- skippedByCleanupCount: ${report.executionSummary.skippedByCleanupCount}`,
    '',
    '## Seed Group Results',
    '',
    ...renderSeedGroupMarkdown('decision_recalc', report.groupResults.decision_recalc),
    '',
    ...renderSeedGroupMarkdown('deep_repair', report.groupResults.deep_repair),
    '',
    ...renderSeedGroupMarkdown('evidence_repair', report.groupResults.evidence_repair),
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
    `- lowOrCriticalImprovedCount: ${report.qualityCalibration.lowOrCriticalImprovedCount}`,
    `- highOrMediumStableCount: ${report.qualityCalibration.highOrMediumStableCount}`,
    `- trustedBlockingGapEffectiveCount: ${report.qualityCalibration.trustedBlockingGapEffectiveCount}`,
    '',
    '## Notes',
    '',
    `- ${report.notes.sampleInterpretation}`,
    `- ${report.notes.reviewInterpretation}`,
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
  ];

  return lines.join('\n');
}

function pickDecisionRecalcSeeds(args: {
  items: HistoricalRepairPriorityItem[];
  target: number;
  usedRepositoryIds: Set<string>;
}) {
  return args.items
    .filter((item) => item.historicalRepairAction === 'decision_recalc')
    .filter((item) => item.cleanupState === 'active')
    .filter(
      (item) =>
        item.strictVisibilityLevel !== 'BACKGROUND' ||
        item.repositoryValueTier === 'HIGH' ||
        item.moneyPriority === 'P0' ||
        item.moneyPriority === 'P1',
    )
    .filter((item) => item.decisionRecalcGaps.length > 0)
    .sort((left, right) => {
      const leftPriority = prioritizedGapScore(
        left.decisionRecalcGaps,
        PRIORITIZED_DECISION_GAPS,
      );
      const rightPriority = prioritizedGapScore(
        right.decisionRecalcGaps,
        PRIORITIZED_DECISION_GAPS,
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
    .map((item) => ({
      item,
      seed: mapSeedSelectionItem({
        item,
        seedGroup: 'decision_recalc',
        seedReasonSummary: `conflict gaps: ${item.decisionRecalcGaps
          .slice(0, 3)
          .join(', ')}`,
      }),
    }));
}

function pickDeepRepairSeeds(args: {
  items: HistoricalRepairPriorityItem[];
  target: number;
  usedRepositoryIds: Set<string>;
}) {
  return args.items
    .filter((item) => item.historicalRepairAction === 'deep_repair')
    .filter((item) => item.cleanupState === 'active')
    .filter((item) => item.deepRepairGaps.length > 0)
    .sort((left, right) => {
      const bucketWeight =
        left.historicalRepairBucket === 'high_value_weak'
          ? 1
          : 0;
      const otherBucketWeight =
        right.historicalRepairBucket === 'high_value_weak'
          ? 1
          : 0;
      if (otherBucketWeight !== bucketWeight) {
        return otherBucketWeight - bucketWeight;
      }
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
    .map((item) => ({
      item,
      seed: mapSeedSelectionItem({
        item,
        seedGroup: 'deep_repair',
        seedReasonSummary: `missing gaps: ${item.deepRepairGaps
          .slice(0, 4)
          .join(', ')}`,
      }),
    }));
}

function pickEvidenceRepairSeeds(args: {
  items: HistoricalRepairPriorityItem[];
  target: number;
  usedRepositoryIds: Set<string>;
}) {
  return args.items
    .filter((item) => item.historicalRepairAction === 'evidence_repair')
    .filter((item) => item.cleanupState === 'active')
    .filter((item) => item.evidenceRepairGaps.length > 0)
    .filter((item) => item.decisionRecalcGaps.length === 0)
    .filter((item) => item.deepRepairGaps.length === 0)
    .filter((item) => item.conflictDrivenGaps.length === 0)
    .filter((item) => item.missingDrivenGaps.length === 0)
    .sort((left, right) => {
      const leftValueScore = valueScore(left);
      const rightValueScore = valueScore(right);
      if (rightValueScore !== leftValueScore) {
        return rightValueScore - leftValueScore;
      }
      return (
        right.historicalRepairPriorityScore - left.historicalRepairPriorityScore
      );
    })
    .filter((item) => markUsed(args.usedRepositoryIds, item.repoId))
    .slice(0, args.target)
    .map((item) => ({
      item,
      seed: mapSeedSelectionItem({
        item,
        seedGroup: 'evidence_repair',
        seedReasonSummary: `weak-only gaps: ${item.evidenceRepairGaps
          .slice(0, 4)
          .join(', ')}`,
      }),
    }));
}

function mapSeedSelectionItem(args: {
  item: HistoricalRepairPriorityItem;
  seedGroup: CalibrationSeedGroup;
  seedReasonSummary: string;
}): CalibrationSeedSelectionItem {
  return {
    repositoryId: args.item.repoId,
    fullName: args.item.fullName,
    seedGroup: args.seedGroup,
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
  };
}

function summarizeSeedGroup(args: {
  selection: CalibrationSeedSelectionItem[];
  logs: AnalysisOutcomeLog[];
}): CalibrationSeedSummary {
  const outcomeStatusBreakdown = buildStatusBreakdown();
  const repairValueClassBreakdown = buildValueBreakdown();
  const gapCounts = new Map<KeyEvidenceGapTaxonomy, number>();
  let qualityImprovementCount = 0;
  let gapReductionCount = 0;
  let noChangeCount = 0;
  let trustedChangedCount = 0;
  let decisionChangedCount = 0;
  let fallbackUsedCount = 0;
  let reviewUsedCount = 0;
  let totalQualityDelta = 0;

  for (const log of args.logs) {
    outcomeStatusBreakdown[log.execution.outcomeStatus] += 1;
    repairValueClassBreakdown[log.delta.repairValueClass] += 1;
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

  return {
    selectedCount: args.selection.length,
    executedCount: args.logs.length,
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

function buildSelectionKey(item: CalibrationSeedSelectionItem) {
  return `${item.repositoryId}:${item.historicalRepairAction}`;
}

function buildOutcomeSelectionKey(item: AnalysisOutcomeLog) {
  return `${item.before.repositoryId}:${item.before.historicalRepairAction ?? item.before.normalizedTaskType}`;
}

function renderSeedGroupMarkdown(
  group: CalibrationSeedGroup,
  summary: CalibrationSeedSummary,
) {
  return [
    `### ${group}`,
    `- selectedCount: ${summary.selectedCount}`,
    `- executedCount: ${summary.executedCount}`,
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
  ];
}

function renderExecutionSamples(samples: CalibrationSeedExecutionSample[]) {
  if (!samples.length) {
    return ['- none'];
  }

  return samples.map(
    (sample) =>
      `- ${sample.fullName} | group=${sample.seedGroup} | status=${sample.outcomeStatus} | value=${sample.repairValueClass} | tier=${sample.capabilityTier ?? 'NONE'} | qualityDelta=${sample.qualityDelta} | gapDelta=${sample.gapCountDelta} | blockingDelta=${sample.blockingGapDelta} | decisionChanged=${sample.decisionChanged} | trustedChanged=${sample.trustedChanged} | reason=${sample.reason}`,
  );
}

function renderList(values: string[]) {
  return values.length ? values.join(', ') : 'none';
}

function round(value: number) {
  return Number(value.toFixed(4));
}
