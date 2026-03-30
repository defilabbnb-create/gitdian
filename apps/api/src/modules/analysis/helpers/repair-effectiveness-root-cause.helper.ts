import {
  ANALYSIS_OUTCOME_STATUSES,
  type ANALYSIS_OUTCOME_ACTIONS,
} from './analysis-outcome.helper';
import type {
  AnalysisOutcomeActionKey,
  AnalysisOutcomeLog,
  AnalysisOutcomeStatus,
} from './analysis-outcome.types';
import type { CalibrationSeedGroup } from './calibration-seed-batch.helper';
import type { KeyEvidenceGapTaxonomy } from './evidence-gap-taxonomy.helper';
import type { HistoricalInventoryQualityState } from './historical-data-inventory.helper';
import type { ModelTaskCapabilityTierName } from './model-task-router.types';
import type {
  RepairEffectivenessActionRootCauseSummary,
  RepairEffectivenessClassification,
  RepairEffectivenessGapProfileSummary,
  RepairEffectivenessRecommendation,
  RepairEffectivenessRootCause,
  RepairEffectivenessRootCauseCount,
  RepairEffectivenessRootCauseExplanation,
  RepairEffectivenessRootCauseReport,
  RepairEffectivenessTierRootCauseSummary,
  RepairRootCauseSeedSource,
} from './repair-effectiveness-root-cause.types';

export const REPAIR_EFFECTIVENESS_ROOT_CAUSE_SCHEMA_VERSION =
  'repair_effectiveness_root_cause_v1';

export const REPAIR_EFFECTIVENESS_ROOT_CAUSES: RepairEffectivenessRootCauseExplanation[] =
  [
    {
      rootCause: 'no_new_evidence',
      layer: 'inputs',
      description: 'Repair ran without introducing evidence that could materially change gaps, quality, or decision state.',
    },
    {
      rootCause: 'same_inputs_replayed',
      layer: 'inputs',
      description: 'The action effectively replayed the same snapshot/insight inputs, so the outcome stayed structurally unchanged.',
    },
    {
      rootCause: 'insufficient_evidence_sources',
      layer: 'inputs',
      description: 'The available sources are too thin to let the selected repair action reduce key evidence gaps.',
    },
    {
      rootCause: 'stale_inputs_only',
      layer: 'inputs',
      description: 'Only stale inputs were available, so the action could not produce trustworthy structural change.',
    },
    {
      rootCause: 'writeback_missing',
      layer: 'writeback',
      description: 'A repair sub-step appears to have executed, but no observable after-state change was written back.',
    },
    {
      rootCause: 'writeback_partial',
      layer: 'writeback',
      description: 'A repair wrote something back, but the writeback only nudged score-level outputs and did not reduce structural gaps.',
    },
    {
      rootCause: 'evidence_written_but_gaps_unchanged',
      layer: 'writeback',
      description: 'The run suggests some evidence output was refreshed, but key gaps/blocking gaps remained unchanged.',
    },
    {
      rootCause: 'evidence_gap_not_reduced',
      layer: 'gap_quality',
      description: 'The target evidence gaps stayed flat after the action, so repair effectiveness did not materialize.',
    },
    {
      rootCause: 'blocking_gaps_unchanged',
      layer: 'gap_quality',
      description: 'Trusted-blocking gaps were still present after the run, preventing structural improvement.',
    },
    {
      rootCause: 'quality_unchanged_after_repair',
      layer: 'gap_quality',
      description: 'Quality score and quality state stayed effectively unchanged after the repair action.',
    },
    {
      rootCause: 'quality_improved_but_below_state_threshold',
      layer: 'gap_quality',
      description: 'Quality moved slightly, but not enough to cross a meaningful state threshold or reduce gaps.',
    },
    {
      rootCause: 'decision_unchanged_after_recalc',
      layer: 'decision_recalc',
      description: 'Decision recalc finished without changing the decision state.',
    },
    {
      rootCause: 'conflict_reconfirmed_without_resolution',
      layer: 'decision_recalc',
      description: 'Conflict-driven recalc re-confirmed the same conflict profile instead of resolving it.',
    },
    {
      rootCause: 'recalc_without_new_signal',
      layer: 'decision_recalc',
      description: 'Decision recalc ran without a new signal that could plausibly move gaps, quality, or decision state.',
    },
    {
      rootCause: 'wrong_action_for_gap_profile',
      layer: 'action_selection',
      description: 'The chosen action was poorly matched to the active gap profile, so structural change was unlikely.',
    },
    {
      rootCause: 'deep_repair_not_needed',
      layer: 'action_selection',
      description: 'Deep repair was selected even though the gap profile did not require a heavy deep-oriented fix.',
    },
    {
      rootCause: 'decision_recalc_not_needed',
      layer: 'action_selection',
      description: 'Decision recalc was selected without a conflict pattern that justified recalculation.',
    },
    {
      rootCause: 'evidence_repair_too_weak',
      layer: 'action_selection',
      description: 'Evidence repair targeted only weak gaps and did not create enough structural movement to justify the action.',
    },
    {
      rootCause: 'routed_tier_too_low',
      layer: 'routing_execution',
      description: 'The router sent the task down a capability tier that was too low for the observed gap profile.',
    },
    {
      rootCause: 'routed_review_without_structural_change',
      layer: 'routing_execution',
      description: 'The task consumed a review-heavy path without producing structural change.',
    },
    {
      rootCause: 'fallback_without_structural_change',
      layer: 'routing_execution',
      description: 'Fallback executed, but the after-state still showed no structural change.',
    },
  ];

const DECISION_CONFLICT_GAPS: KeyEvidenceGapTaxonomy[] = [
  'user_conflict',
  'monetization_conflict',
  'execution_conflict',
];
const DEEP_MISSING_GAPS: KeyEvidenceGapTaxonomy[] = [
  'technical_maturity_missing',
  'execution_missing',
  'market_missing',
  'distribution_missing',
];
const WEAK_ONLY_GAPS: KeyEvidenceGapTaxonomy[] = [
  'distribution_weak',
  'market_weak',
  'execution_weak',
  'technical_maturity_weak',
  'problem_weak',
  'user_weak',
  'monetization_weak',
];
const FOCUSED_OUTCOME_STATUSES: AnalysisOutcomeStatus[] = [
  'partial',
  'no_change',
  'downgraded',
  'skipped',
];

type ClassificationContext = {
  log: AnalysisOutcomeLog;
  fullName: string | null;
  seedGroup: CalibrationSeedGroup | null;
};

export function classifyRepairEffectivenessRootCause(
  context: ClassificationContext,
): RepairEffectivenessClassification {
  const log = context.log;
  const beforeGaps = normalizeGapArray(log.before.keyEvidenceGapsBefore);
  const afterGaps = normalizeGapArray(log.after.keyEvidenceGapsAfter);
  const beforeBlocking = normalizeGapArray(log.before.trustedBlockingGapsBefore);
  const afterBlocking = normalizeGapArray(log.after.trustedBlockingGapsAfter);
  const structuralChange = hasStructuralChange(log);
  const reason = String(log.execution.outcomeReason ?? '').trim();
  const action = normalizeAction(log.before.historicalRepairAction);
  const coverageDelta =
    normalizeRate(log.after.evidenceCoverageRateAfter) -
    normalizeRate(log.before.evidenceCoverageRateBefore);
  const beforeConflictGaps = findMatchingGaps(beforeGaps, DECISION_CONFLICT_GAPS);
  const afterConflictGaps = findMatchingGaps(afterGaps, DECISION_CONFLICT_GAPS);
  const beforeDeepMissingGaps = findMatchingGaps(beforeGaps, DEEP_MISSING_GAPS);
  const allWeakOnly =
    beforeGaps.length > 0 && beforeGaps.every((gap) => gap.endsWith('_weak'));
  const rootCauses = new Set<RepairEffectivenessRootCause>();

  if (reason.includes('snapshot_skipped') || reason.includes('refresh_insight')) {
    rootCauses.add('same_inputs_replayed');
  }

  if (
    !structuralChange &&
    coverageDelta <= 0 &&
    beforeGaps.length > 0 &&
    arraysEqual(beforeGaps, afterGaps)
  ) {
    rootCauses.add('no_new_evidence');
  }

  if (
    beforeDeepMissingGaps.length > 0 &&
    normalizeRate(log.before.evidenceCoverageRateBefore) <= 0.15 &&
    normalizeRate(log.after.evidenceCoverageRateAfter) <= 0.15
  ) {
    rootCauses.add('insufficient_evidence_sources');
  }

  if (reason.includes('_executed') && !structuralChange) {
    rootCauses.add('writeback_missing');
  }

  if (
    log.delta.qualityDelta > 0 &&
    log.delta.gapCountDelta === 0 &&
    log.delta.blockingGapDelta === 0 &&
    !log.delta.decisionChanged &&
    !log.delta.trustedChanged
  ) {
    rootCauses.add('writeback_partial');
    rootCauses.add('quality_improved_but_below_state_threshold');
  }

  if (
    (reason.includes('_executed') || coverageDelta > 0 || log.delta.qualityDelta > 0) &&
    log.delta.gapCountDelta === 0 &&
    beforeGaps.length > 0
  ) {
    rootCauses.add('evidence_written_but_gaps_unchanged');
  }

  if (beforeGaps.length > 0 && log.delta.gapCountDelta >= 0) {
    rootCauses.add('evidence_gap_not_reduced');
  }

  if (beforeBlocking.length > 0 && log.delta.blockingGapDelta >= 0) {
    rootCauses.add('blocking_gaps_unchanged');
  }

  if (log.delta.qualityDelta === 0) {
    rootCauses.add('quality_unchanged_after_repair');
  }

  if (action === 'decision_recalc' && !log.delta.decisionChanged) {
    rootCauses.add('decision_unchanged_after_recalc');
  }

  if (
    action === 'decision_recalc' &&
    beforeConflictGaps.length > 0 &&
    arraysEqual(beforeConflictGaps, afterConflictGaps)
  ) {
    rootCauses.add('conflict_reconfirmed_without_resolution');
  }

  if (action === 'decision_recalc' && !structuralChange) {
    rootCauses.add('recalc_without_new_signal');
  }

  if (
    action === 'decision_recalc' &&
    beforeConflictGaps.length === 0 &&
    beforeGaps.length > 0
  ) {
    rootCauses.add('decision_recalc_not_needed');
    rootCauses.add('wrong_action_for_gap_profile');
  }

  if (
    action === 'deep_repair' &&
    beforeDeepMissingGaps.length === 0 &&
    allWeakOnly
  ) {
    rootCauses.add('deep_repair_not_needed');
  }

  if (
    action === 'deep_repair' &&
    beforeDeepMissingGaps.length >= 2 &&
    !structuralChange &&
    (reason.includes('idea_extract_light') || reason.includes('completeness'))
  ) {
    rootCauses.add('wrong_action_for_gap_profile');
  }

  if (action === 'evidence_repair' && allWeakOnly && !structuralChange) {
    rootCauses.add('evidence_repair_too_weak');
  }

  if (
    action === 'evidence_repair' &&
    (beforeGaps.some((gap) => gap.endsWith('_missing')) ||
      beforeConflictGaps.length > 0)
  ) {
    rootCauses.add('wrong_action_for_gap_profile');
  }

  if (
    (log.router.routerCapabilityTier === 'LIGHT' ||
      log.router.routerCapabilityTier === 'STANDARD') &&
    !structuralChange &&
    (beforeDeepMissingGaps.length > 0 || beforeConflictGaps.length > 0)
  ) {
    rootCauses.add('routed_tier_too_low');
  }

  if (log.execution.executionUsedReview && !structuralChange) {
    rootCauses.add('routed_review_without_structural_change');
  }

  if (log.execution.executionUsedFallback && !structuralChange) {
    rootCauses.add('fallback_without_structural_change');
  }

  if (reason.includes('cleanup_state_')) {
    rootCauses.add('stale_inputs_only');
  }

  if (!rootCauses.size) {
    if (log.execution.outcomeStatus === 'partial') {
      rootCauses.add('quality_improved_but_below_state_threshold');
    } else if (log.execution.outcomeStatus === 'downgraded') {
      rootCauses.add('blocking_gaps_unchanged');
    } else {
      rootCauses.add('quality_unchanged_after_repair');
    }
  }

  const rootCauseList = prioritizeRootCauses({
    action,
    outcomeStatus: log.execution.outcomeStatus,
    qualityDelta: log.delta.qualityDelta,
    reasons: [...rootCauses],
  });
  const primaryRootCause = pickPrimaryRootCause({
    action,
    outcomeStatus: log.execution.outcomeStatus,
    reason,
    rootCauses: rootCauseList,
  });

  return {
    repositoryId: log.before.repositoryId,
    fullName: context.fullName,
    seedGroup: context.seedGroup,
    normalizedTaskType: log.before.normalizedTaskType,
    historicalRepairAction: action,
    capabilityTier:
      (log.router.routerCapabilityTier as ModelTaskCapabilityTierName | null) ?? 'NONE',
    qualityStateBefore:
      (log.before.analysisQualityStateBefore as HistoricalInventoryQualityState | null) ??
      'UNKNOWN',
    outcomeStatus: log.execution.outcomeStatus,
    repairValueClass: log.delta.repairValueClass,
    qualityDelta: log.delta.qualityDelta,
    gapCountDelta: log.delta.gapCountDelta,
    blockingGapDelta: log.delta.blockingGapDelta,
    trustedChanged: log.delta.trustedChanged,
    decisionChanged: log.delta.decisionChanged,
    executionUsedFallback: log.execution.executionUsedFallback,
    executionUsedReview: log.execution.executionUsedReview,
    outcomeReason: reason,
    beforeGaps,
    afterGaps,
    beforeBlockingGaps: beforeBlocking,
    afterBlockingGaps: afterBlocking,
    primaryRootCause,
    rootCauses: rootCauseList,
    rootCauseSummary: buildRootCauseSummary(rootCauseList),
    rootCauseConfidence: inferRootCauseConfidence({
      primaryRootCause,
      action,
      reason,
      log,
    }),
  };
}

export function buildRepairEffectivenessRootCauseReport(args: {
  seedReport: RepairRootCauseSeedSource | null;
}): RepairEffectivenessRootCauseReport {
  const generatedAt = new Date().toISOString();
  const selectionItems = Array.isArray(args.seedReport?.selection?.items)
    ? args.seedReport?.selection?.items ?? []
    : [];
  const selectionMap = new Map(
    selectionItems.map((item) => [
      `${item.repositoryId}:${normalizeAction(item.historicalRepairAction) ?? 'skipped'}`,
      item,
    ]),
  );
  const outcomeLogs = Array.isArray(args.seedReport?.snapshot?.items)
    ? args.seedReport?.snapshot?.items ?? []
    : [];
  const relevantLogs = outcomeLogs.filter((log) =>
    FOCUSED_OUTCOME_STATUSES.includes(log.execution.outcomeStatus),
  );
  const classifications = relevantLogs.map((log) => {
    const selection =
      selectionMap.get(
        `${log.before.repositoryId}:${normalizeAction(
          log.before.historicalRepairAction,
        ) ?? 'skipped'}`,
      ) ?? null;
    return classifyRepairEffectivenessRootCause({
      log,
      fullName: selection?.fullName ?? null,
      seedGroup: selection?.seedGroup ?? inferSeedGroup(log),
    });
  });

  const analyzedCount = classifications.length;
  const actionableCount = classifications.filter(
    (item) => item.outcomeStatus !== 'skipped',
  ).length;
  const outcomeStatusBreakdown = buildOutcomeStatusBreakdown(relevantLogs);
  const actionRootCauseSummary = {
    decisionRecalc: summarizeActionRootCauses(
      'decision_recalc',
      classifications.filter((item) => item.historicalRepairAction === 'decision_recalc'),
    ),
    deepRepair: summarizeActionRootCauses(
      'deep_repair',
      classifications.filter((item) => item.historicalRepairAction === 'deep_repair'),
    ),
    evidenceRepair: summarizeActionRootCauses(
      'evidence_repair',
      classifications.filter((item) => item.historicalRepairAction === 'evidence_repair'),
    ),
  };
  const tierRootCauseSummary = summarizeByTier(classifications);
  const gapProfileSummary = {
    decisionConflict: summarizeGapProfile({
      profile: 'decision_conflict',
      items: classifications.filter((item) =>
        item.beforeGaps.some((gap) => DECISION_CONFLICT_GAPS.includes(gap)),
      ),
    }),
    deepMissing: summarizeGapProfile({
      profile: 'deep_missing',
      items: classifications.filter((item) =>
        item.beforeGaps.some((gap) => DEEP_MISSING_GAPS.includes(gap)),
      ),
    }),
    weakOnlyEvidence: summarizeGapProfile({
      profile: 'weak_only_evidence',
      items: classifications.filter(
        (item) =>
          item.historicalRepairAction === 'evidence_repair' &&
          item.beforeGaps.length > 0 &&
          item.beforeGaps.every((gap) => gap.endsWith('_weak')),
      ),
    }),
  };
  const overallRootCauseSummary = {
    primaryRootCauseTop: countPrimaryRootCauses(classifications),
    rootCauseDistribution: countAllRootCauses(classifications),
  };
  const surgeryRecommendations = buildSurgeryRecommendations({
    classifications,
    actionRootCauseSummary,
    tierRootCauseSummary,
  });

  const decisionSummary = actionRootCauseSummary.decisionRecalc;
  const deepSummary = actionRootCauseSummary.deepRepair;
  const evidenceSummary = actionRootCauseSummary.evidenceRepair;
  const strongFindings: string[] = [];
  if (decisionSummary.totalCount > 0 && decisionSummary.noChangeCount === decisionSummary.totalCount) {
    strongFindings.push(
      `decision_recalc ${decisionSummary.noChangeCount}/${decisionSummary.totalCount} 全部 no_change，主根因集中在 ${decisionSummary.topPrimaryRootCauses
        .slice(0, 2)
        .map((item) => item.rootCause)
        .join(' / ')}`,
    );
  }
  if (deepSummary.totalCount > 0 && deepSummary.noChangeCount === deepSummary.totalCount) {
    strongFindings.push(
      `deep_repair ${deepSummary.noChangeCount}/${deepSummary.totalCount} 全部 no_change，主根因集中在 ${deepSummary.topPrimaryRootCauses
        .slice(0, 2)
        .map((item) => item.rootCause)
        .join(' / ')}`,
    );
  }
  if (evidenceSummary.totalCount > 0 && evidenceSummary.noChangeCount >= evidenceSummary.totalCount - 1) {
    strongFindings.push(
      `evidence_repair ${evidenceSummary.noChangeCount}/${evidenceSummary.totalCount} 仍是 no_change 主导，主要卡在 ${evidenceSummary.topPrimaryRootCauses
        .slice(0, 2)
        .map((item) => item.rootCause)
        .join(' / ')}`,
    );
  }

  return {
    generatedAt,
    source: {
      seedGeneratedAt: readString(args.seedReport?.generatedAt),
      totalSeeded: Number(args.seedReport?.selection?.totalSeeded ?? 0),
      analyzedCount,
      actionableCount,
      nonCleanupDominated:
        actionableCount > 0 &&
        ratio(
          classifications.filter(
            (item) =>
              item.outcomeStatus === 'skipped' ||
              item.outcomeStatus === 'downgraded',
          ).length,
          analyzedCount,
        ) < 0.5,
      outcomeStatusBreakdown,
    },
    taxonomy: {
      rootCauses: REPAIR_EFFECTIVENESS_ROOT_CAUSES,
      focusedOutcomeStatuses: FOCUSED_OUTCOME_STATUSES,
    },
    overallRootCauseSummary,
    actionRootCauseSummary,
    tierRootCauseSummary,
    gapProfileSummary,
    surgeryRecommendations,
    conclusions: {
      strongFindings,
      earlyTrends: [
        'evidence_repair 目前只有 1 条 partial，因此 weak-only repair 的收益判断还属于早期趋势。',
        'router tier 过重/过轻目前只基于 60 条 seed outcome，适合做 surgery backlog，不适合直接自动调参。',
      ],
      unansweredQuestions: [
        'deep_repair 的 no_change 里，到底是 writeback 缺失还是 writeback 生效但 inventory 没消费，仍需要下一步做写回链专项核查。',
        'decision_recalc 的 refresh insight 路径是否真的没有新输入门控，需要在下一步修复中进一步验证。',
      ],
    },
    samples: {
      decisionRecalcNoChange: takeSamples(
        classifications.filter(
          (item) =>
            item.historicalRepairAction === 'decision_recalc' &&
            item.outcomeStatus === 'no_change',
        ),
      ),
      deepRepairNoChange: takeSamples(
        classifications.filter(
          (item) =>
            item.historicalRepairAction === 'deep_repair' &&
            item.outcomeStatus === 'no_change',
        ),
      ),
      evidenceRepairWeak: takeSamples(
        classifications.filter(
          (item) => item.historicalRepairAction === 'evidence_repair',
        ),
      ),
      partialImprovements: takeSamples(
        classifications.filter((item) => item.outcomeStatus === 'partial'),
      ),
    },
    audit: {
      commands: [
        'pnpm --filter api report:calibration-seed-batch -- --per-group=20 --pretty --json',
        'pnpm --filter api report:repair-root-cause -- --pretty --json',
      ],
      focusFields: [
        'overallRootCauseSummary.primaryRootCauseTop',
        'actionRootCauseSummary.decisionRecalc',
        'actionRootCauseSummary.deepRepair',
        'actionRootCauseSummary.evidenceRepair',
        'tierRootCauseSummary',
        'surgeryRecommendations',
      ],
      sampleChecks: [
        'Inspect 3 decision_recalc no_change samples and confirm primaryRootCause lands on recalc_without_new_signal or conflict_reconfirmed_without_resolution.',
        'Inspect 3 deep_repair no_change samples and confirm primaryRootCause lands on writeback_missing or evidence_gap_not_reduced.',
        'Inspect the single partial evidence_repair sample and confirm it is not mislabeled as a no_change-only root cause.',
      ],
    },
  };
}

export function renderRepairEffectivenessRootCauseMarkdown(
  report: RepairEffectivenessRootCauseReport,
): string {
  const lines = [
    '# GitDian Repair Effectiveness Root Cause Report',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- seedGeneratedAt: ${report.source.seedGeneratedAt ?? 'n/a'}`,
    `- totalSeeded: ${report.source.totalSeeded}`,
    `- analyzedCount: ${report.source.analyzedCount}`,
    `- actionableCount: ${report.source.actionableCount}`,
    `- nonCleanupDominated: ${report.source.nonCleanupDominated}`,
    '',
    '## Outcome Status Breakdown',
    ...renderStatusBreakdown(report.source.outcomeStatusBreakdown),
    '',
    '## Root Cause Taxonomy',
    ...report.taxonomy.rootCauses.map(
      (item) =>
        `- ${item.rootCause} [${item.layer}]: ${item.description}`,
    ),
    '',
    '## Overall Root Cause Distribution',
    ...renderRootCauseCounts(report.overallRootCauseSummary.primaryRootCauseTop, 'primary'),
    '',
    '## decision_recalc',
    ...renderActionSummary(report.actionRootCauseSummary.decisionRecalc),
    '',
    '## deep_repair',
    ...renderActionSummary(report.actionRootCauseSummary.deepRepair),
    '',
    '## evidence_repair',
    ...renderActionSummary(report.actionRootCauseSummary.evidenceRepair),
    '',
    '## By Tier',
    ...report.tierRootCauseSummary.flatMap((item) => [
      `- ${item.capabilityTier}: count=${item.count}, noChange=${item.noChangeCount}, partial=${item.partialCount}, avgQualityDelta=${item.averageQualityDelta}`,
      ...item.topPrimaryRootCauses
        .slice(0, 3)
        .map((cause) => `  - ${cause.rootCause}: ${cause.count} (${cause.ratio})`),
    ]),
    '',
    '## Gap Profiles',
    ...renderGapProfile('decision_conflict', report.gapProfileSummary.decisionConflict),
    ...renderGapProfile('deep_missing', report.gapProfileSummary.deepMissing),
    ...renderGapProfile(
      'weak_only_evidence',
      report.gapProfileSummary.weakOnlyEvidence,
    ),
    '',
    '## Surgery Recommendations',
    ...report.surgeryRecommendations.map(
      (item) =>
        `- ${item.recommendationId} [${item.recommendationPriority}/${item.recommendationScope}] ${item.recommendationReason} | target=${item.targetRootCauses.join(
          ', ',
        )} | expected=${item.expectedEffect}`,
    ),
    '',
    '## Strong Findings',
    ...report.conclusions.strongFindings.map((item) => `- ${item}`),
    '',
    '## Early Trends',
    ...report.conclusions.earlyTrends.map((item) => `- ${item}`),
    '',
    '## Open Questions',
    ...report.conclusions.unansweredQuestions.map((item) => `- ${item}`),
    '',
    '## Sample Checks',
    ...report.samples.partialImprovements.map(
      (sample) =>
        `- partial: ${sample.fullName ?? sample.repositoryId} | action=${sample.historicalRepairAction} | root=${sample.primaryRootCause} | qDelta=${sample.qualityDelta} | reason=${sample.outcomeReason}`,
    ),
    ...takeSamples(report.samples.decisionRecalcNoChange).map(
      (sample) =>
        `- decision_no_change: ${sample.fullName ?? sample.repositoryId} | root=${sample.primaryRootCause} | tier=${sample.capabilityTier} | reason=${sample.outcomeReason}`,
    ),
    ...takeSamples(report.samples.deepRepairNoChange).map(
      (sample) =>
        `- deep_no_change: ${sample.fullName ?? sample.repositoryId} | root=${sample.primaryRootCause} | tier=${sample.capabilityTier} | reason=${sample.outcomeReason}`,
    ),
    '',
    '## Audit',
    ...report.audit.commands.map((command) => `- command: ${command}`),
  ];

  return lines.join('\n');
}

function buildOutcomeStatusBreakdown(items: AnalysisOutcomeLog[]) {
  return ANALYSIS_OUTCOME_STATUSES.reduce<Record<AnalysisOutcomeStatus, number>>(
    (acc, status) => {
      acc[status] = items.filter((item) => item.execution.outcomeStatus === status).length;
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

function summarizeActionRootCauses(
  action: AnalysisOutcomeActionKey,
  items: RepairEffectivenessClassification[],
): RepairEffectivenessActionRootCauseSummary {
  return {
    action,
    totalCount: items.length,
    outcomeStatusBreakdown: buildClassificationOutcomeBreakdown(items),
    averageQualityDelta: round(
      average(items.map((item) => item.qualityDelta)),
    ),
    noChangeCount: items.filter((item) => item.outcomeStatus === 'no_change').length,
    partialCount: items.filter((item) => item.outcomeStatus === 'partial').length,
    decisionChangedCount: items.filter((item) => item.decisionChanged).length,
    trustedChangedCount: items.filter((item) => item.trustedChanged).length,
    topPrimaryRootCauses: countPrimaryRootCauses(items),
    topRootCauses: countAllRootCauses(items),
    topGaps: countGaps(items),
  };
}

function summarizeByTier(
  items: RepairEffectivenessClassification[],
): RepairEffectivenessTierRootCauseSummary[] {
  const tiers = [...new Set(items.map((item) => item.capabilityTier))];
  return tiers
    .map((capabilityTier) => {
      const subset = items.filter((item) => item.capabilityTier === capabilityTier);
      return {
        capabilityTier,
        count: subset.length,
        noChangeCount: subset.filter((item) => item.outcomeStatus === 'no_change').length,
        partialCount: subset.filter((item) => item.outcomeStatus === 'partial').length,
        averageQualityDelta: round(average(subset.map((item) => item.qualityDelta))),
        topPrimaryRootCauses: countPrimaryRootCauses(subset),
      };
    })
    .sort((left, right) => right.count - left.count);
}

function summarizeGapProfile(args: {
  profile: string;
  items: RepairEffectivenessClassification[];
}): RepairEffectivenessGapProfileSummary {
  return {
    profile: args.profile,
    totalCount: args.items.length,
    noChangeCount: args.items.filter((item) => item.outcomeStatus === 'no_change').length,
    partialCount: args.items.filter((item) => item.outcomeStatus === 'partial').length,
    decisionChangedCount: args.items.filter((item) => item.decisionChanged).length,
    gapReductionCount: args.items.filter((item) => item.gapCountDelta < 0).length,
    topPrimaryRootCauses: countPrimaryRootCauses(args.items),
  };
}

function countPrimaryRootCauses(
  items: RepairEffectivenessClassification[],
): RepairEffectivenessRootCauseCount[] {
  const counts = new Map<RepairEffectivenessRootCause, number>();
  for (const item of items) {
    counts.set(item.primaryRootCause, (counts.get(item.primaryRootCause) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([rootCause, count]) => ({
      rootCause,
      count,
      ratio: round(ratio(count, items.length)),
    }))
    .sort((left, right) => right.count - left.count);
}

function countAllRootCauses(
  items: RepairEffectivenessClassification[],
): RepairEffectivenessRootCauseCount[] {
  const counts = new Map<RepairEffectivenessRootCause, number>();
  for (const item of items) {
    for (const rootCause of item.rootCauses) {
      counts.set(rootCause, (counts.get(rootCause) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([rootCause, count]) => ({
      rootCause,
      count,
      ratio: round(ratio(count, items.length)),
    }))
    .sort((left, right) => right.count - left.count);
}

function countGaps(items: RepairEffectivenessClassification[]) {
  const counts = new Map<KeyEvidenceGapTaxonomy, number>();
  for (const item of items) {
    for (const gap of item.beforeGaps) {
      counts.set(gap, (counts.get(gap) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([gap, count]) => ({ gap, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);
}

function buildSurgeryRecommendations(args: {
  classifications: RepairEffectivenessClassification[];
  actionRootCauseSummary: RepairEffectivenessRootCauseReport['actionRootCauseSummary'];
  tierRootCauseSummary: RepairEffectivenessTierRootCauseSummary[];
}): RepairEffectivenessRecommendation[] {
  const recommendations: RepairEffectivenessRecommendation[] = [];
  const decisionSummary = args.actionRootCauseSummary.decisionRecalc;
  const deepSummary = args.actionRootCauseSummary.deepRepair;
  const evidenceSummary = args.actionRootCauseSummary.evidenceRepair;
  const hasWritebackIssue = args.classifications.some((item) =>
    item.rootCauses.includes('writeback_missing') ||
    item.rootCauses.includes('writeback_partial') ||
    item.rootCauses.includes('evidence_written_but_gaps_unchanged'),
  );
  const reviewTier = args.tierRootCauseSummary.find(
    (item) => item.capabilityTier === 'REVIEW',
  );
  const heavyTier = args.tierRootCauseSummary.find(
    (item) => item.capabilityTier === 'HEAVY',
  );

  if (decisionSummary.totalCount > 0) {
    recommendations.push({
      recommendationId: 'decision-recalc-new-signal-gate',
      recommendationScope: 'decision',
      recommendationPriority: 'P0',
      recommendationReason:
        'decision_recalc 20/20 no_change 说明当前 refresh insight 路径大概率在重放旧输入，没有真正引入可解冲突的新信号。',
      targetRootCauses: [
        'recalc_without_new_signal',
        'same_inputs_replayed',
        'conflict_reconfirmed_without_resolution',
      ],
      expectedEffect:
        '把无新信号的 recalc 从高成本 REVIEW 路径里筛掉，只让有机会改变冲突的对象进入真正 recalc。',
    });
  }

  if (deepSummary.totalCount > 0) {
    recommendations.push({
      recommendationId: 'deep-repair-writeback-check',
      recommendationScope: hasWritebackIssue ? 'writeback' : 'repair',
      recommendationPriority: 'P0',
      recommendationReason:
        'deep_repair 20/20 no_change 且执行理由显示子步骤已执行，优先怀疑写回链或 deep step 与 gap profile 的映射失效。',
      targetRootCauses: [
        'writeback_missing',
        'evidence_gap_not_reduced',
        'wrong_action_for_gap_profile',
      ],
      expectedEffect:
        '确认 deep 子步骤执行后是否真的写回 evidence / gap 消费链，并避免继续把无效 deep repair 压进 HEAVY 路径。',
    });
  }

  if (evidenceSummary.totalCount > 0) {
    recommendations.push({
      recommendationId: 'evidence-repair-weak-only-tighten',
      recommendationScope: 'repair',
      recommendationPriority: 'P1',
      recommendationReason:
        'weak-only evidence_repair 19/20 no_change，当前 snapshot skipped + fallback 组合明显偏保守。',
      targetRootCauses: [
        'same_inputs_replayed',
        'evidence_repair_too_weak',
        'fallback_without_structural_change',
      ],
      expectedEffect:
        '让 weak-only evidence repair 更像“有明确弱 gap 才跑”的路径，减少空转并保留真正能带来小幅改善的样本。',
    });
  }

  if (hasWritebackIssue) {
    recommendations.push({
      recommendationId: 'writeback-chain-audit',
      recommendationScope: 'writeback',
      recommendationPriority: 'P0',
      recommendationReason:
        '执行理由显示动作已跑，但 before/after 完全不变，这是一条高置信写回链疑似失效信号。',
      targetRootCauses: [
        'writeback_missing',
        'writeback_partial',
        'evidence_written_but_gaps_unchanged',
      ],
      expectedEffect:
        '快速确认是否存在“执行成功但 inventory/priority/outcome 消费不到写回变化”的断层。',
    });
  }

  if (
    (reviewTier && reviewTier.noChangeCount === reviewTier.count) ||
    (heavyTier && heavyTier.noChangeCount === heavyTier.count)
  ) {
    recommendations.push({
      recommendationId: 'router-tier-overweight-audit',
      recommendationScope: 'router',
      recommendationPriority: 'P1',
      recommendationReason:
        'REVIEW / HEAVY 当前在 seed batch 里没有产出结构性改善，说明 tier 可能偏重或触发条件偏松。',
      targetRootCauses: [
        'routed_review_without_structural_change',
        'routed_tier_too_low',
        'wrong_action_for_gap_profile',
      ],
      expectedEffect:
        '在不自动调参的前提下，为下一步 router surgery 提供明确的高成本空转样本池。',
    });
  }

  return recommendations;
}

function renderStatusBreakdown(
  breakdown: Record<AnalysisOutcomeStatus, number>,
): string[] {
  return ANALYSIS_OUTCOME_STATUSES.map(
    (status) => `- ${status}: ${breakdown[status] ?? 0}`,
  );
}

function renderRootCauseCounts(
  items: RepairEffectivenessRootCauseCount[],
  label: string,
) {
  return items.map(
    (item) => `- ${label}.${item.rootCause}: ${item.count} (${item.ratio})`,
  );
}

function renderActionSummary(summary: RepairEffectivenessActionRootCauseSummary) {
  return [
    `- totalCount: ${summary.totalCount}`,
    `- noChangeCount: ${summary.noChangeCount}`,
    `- partialCount: ${summary.partialCount}`,
    `- averageQualityDelta: ${summary.averageQualityDelta}`,
    ...summary.topPrimaryRootCauses
      .slice(0, 5)
      .map((item) => `- primary.${item.rootCause}: ${item.count} (${item.ratio})`),
    ...summary.topGaps.slice(0, 5).map((item) => `- gap.${item.gap}: ${item.count}`),
  ];
}

function renderGapProfile(
  label: string,
  summary: RepairEffectivenessGapProfileSummary,
) {
  return [
    `- ${label}: count=${summary.totalCount}, noChange=${summary.noChangeCount}, partial=${summary.partialCount}, decisionChanged=${summary.decisionChangedCount}, gapReduction=${summary.gapReductionCount}`,
    ...summary.topPrimaryRootCauses
      .slice(0, 4)
      .map((item) => `  - ${item.rootCause}: ${item.count} (${item.ratio})`),
  ];
}

function buildClassificationOutcomeBreakdown(
  items: RepairEffectivenessClassification[],
): Record<AnalysisOutcomeStatus, number> {
  return ANALYSIS_OUTCOME_STATUSES.reduce<Record<AnalysisOutcomeStatus, number>>(
    (acc, status) => {
      acc[status] = items.filter((item) => item.outcomeStatus === status).length;
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

function buildRootCauseSummary(rootCauses: RepairEffectivenessRootCause[]) {
  return rootCauses.slice(0, 3).join(' | ');
}

function pickPrimaryRootCause(args: {
  action: AnalysisOutcomeActionKey | null;
  outcomeStatus: AnalysisOutcomeStatus;
  reason: string;
  rootCauses: RepairEffectivenessRootCause[];
}): RepairEffectivenessRootCause {
  if (
    args.action === 'decision_recalc' &&
    args.rootCauses.includes('recalc_without_new_signal')
  ) {
    return 'recalc_without_new_signal';
  }

  if (
    args.action === 'deep_repair' &&
    args.rootCauses.includes('writeback_missing')
  ) {
    return 'writeback_missing';
  }

  if (
    args.action === 'evidence_repair' &&
    args.reason.includes('snapshot_skipped') &&
    args.rootCauses.includes('same_inputs_replayed')
  ) {
    return args.outcomeStatus === 'partial'
      ? 'quality_improved_but_below_state_threshold'
      : 'same_inputs_replayed';
  }

  return args.rootCauses[0] ?? 'quality_unchanged_after_repair';
}

function inferRootCauseConfidence(args: {
  primaryRootCause: RepairEffectivenessRootCause;
  action: AnalysisOutcomeActionKey | null;
  reason: string;
  log: AnalysisOutcomeLog;
}) {
  const base =
    args.primaryRootCause === 'recalc_without_new_signal'
      ? 0.97
      : args.primaryRootCause === 'writeback_missing'
        ? 0.9
        : args.primaryRootCause === 'same_inputs_replayed'
          ? 0.95
          : args.primaryRootCause === 'quality_improved_but_below_state_threshold'
            ? 0.84
            : args.primaryRootCause === 'routed_review_without_structural_change'
              ? 0.82
              : 0.74;
  if (
    args.action === 'decision_recalc' &&
    args.reason.includes('refresh_insight') &&
    args.log.delta.decisionChanged === false
  ) {
    return 0.98;
  }
  return base;
}

function prioritizeRootCauses(args: {
  action: AnalysisOutcomeActionKey | null;
  outcomeStatus: AnalysisOutcomeStatus;
  qualityDelta: number;
  reasons: RepairEffectivenessRootCause[];
}) {
  const basePriority: RepairEffectivenessRootCause[] = [
    'recalc_without_new_signal',
    'writeback_missing',
    'same_inputs_replayed',
    'quality_improved_but_below_state_threshold',
    'conflict_reconfirmed_without_resolution',
    'decision_unchanged_after_recalc',
    'evidence_repair_too_weak',
    'wrong_action_for_gap_profile',
    'evidence_written_but_gaps_unchanged',
    'writeback_partial',
    'no_new_evidence',
    'insufficient_evidence_sources',
    'evidence_gap_not_reduced',
    'blocking_gaps_unchanged',
    'quality_unchanged_after_repair',
    'decision_recalc_not_needed',
    'deep_repair_not_needed',
    'routed_tier_too_low',
    'routed_review_without_structural_change',
    'fallback_without_structural_change',
    'stale_inputs_only',
  ];
  const unique = [...new Set(args.reasons)];
  return unique.sort(
    (left, right) => basePriority.indexOf(left) - basePriority.indexOf(right),
  );
}

function takeSamples<T>(items: T[], limit = 5) {
  return items.slice(0, limit);
}

function inferSeedGroup(log: AnalysisOutcomeLog): CalibrationSeedGroup | null {
  if (
    log.before.historicalRepairAction === 'decision_recalc' ||
    log.before.normalizedTaskType === 'decision_recalc'
  ) {
    return 'decision_recalc';
  }
  if (
    log.before.historicalRepairAction === 'deep_repair' ||
    log.before.normalizedTaskType === 'deep_repair'
  ) {
    return 'deep_repair';
  }
  if (
    log.before.historicalRepairAction === 'evidence_repair' ||
    log.before.normalizedTaskType === 'evidence_repair'
  ) {
    return 'evidence_repair';
  }
  return null;
}

function normalizeAction(value: unknown): AnalysisOutcomeActionKey | null {
  const normalized = String(value ?? '').trim();
  if (
    normalized === 'downgrade_only' ||
    normalized === 'refresh_only' ||
    normalized === 'evidence_repair' ||
    normalized === 'deep_repair' ||
    normalized === 'decision_recalc' ||
    normalized === 'archive' ||
    normalized === 'skipped'
  ) {
    return normalized;
  }
  return null;
}

function normalizeGapArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as KeyEvidenceGapTaxonomy[];
  }
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean) as KeyEvidenceGapTaxonomy[];
}

function normalizeRate(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(1, parsed));
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function hasStructuralChange(log: AnalysisOutcomeLog) {
  return Boolean(
    log.delta.qualityDelta !== 0 ||
      log.delta.gapCountDelta !== 0 ||
      log.delta.blockingGapDelta !== 0 ||
      log.delta.trustedChanged ||
      log.delta.decisionChanged ||
      Math.abs(
        normalizeRate(log.after.evidenceCoverageRateAfter) -
          normalizeRate(log.before.evidenceCoverageRateBefore),
      ) > 0.0001,
  );
}

function findMatchingGaps(
  gaps: KeyEvidenceGapTaxonomy[],
  target: KeyEvidenceGapTaxonomy[],
) {
  return gaps.filter((gap) => target.includes(gap));
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(count: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return count / total;
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

function readString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}
