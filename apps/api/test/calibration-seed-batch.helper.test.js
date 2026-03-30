const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAnalysisOutcomeLog,
} = require('../dist/modules/analysis/helpers/analysis-outcome.helper');
const {
  buildCalibrationSeedSelectionReport,
  buildCalibrationSeedBatchReport,
  renderCalibrationSeedBatchMarkdown,
} = require('../dist/modules/analysis/helpers/calibration-seed-batch.helper');

function createPriorityItem(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/repo-1',
    historicalRepairBucket: 'visible_broken',
    historicalRepairAction: 'decision_recalc',
    cleanupState: 'active',
    strictVisibilityLevel: 'HOME',
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    historicalRepairPriorityScore: 120,
    analysisQualityState: 'LOW',
    analysisQualityScore: 38,
    frontendDecisionState: 'provisional',
    keyEvidenceGaps: ['user_conflict', 'monetization_conflict'],
    trustedBlockingGaps: ['user_conflict', 'monetization_conflict'],
    decisionRecalcGaps: ['user_conflict', 'monetization_conflict'],
    deepRepairGaps: [],
    evidenceRepairGaps: [],
    conflictDrivenGaps: ['user_conflict', 'monetization_conflict'],
    missingDrivenGaps: [],
    weakDrivenGaps: [],
    evidenceConflictCount: 2,
    evidenceCoverageRate: 0.22,
    hasDeep: false,
    fallbackFlag: false,
    conflictFlag: true,
    incompleteFlag: false,
    ...overrides,
  };
}

function createOutcomeLog(overrides = {}) {
  const before = {
    repositoryId: 'repo-1',
    normalizedTaskType: 'decision_recalc',
    taskIntent: 'recalc',
    historicalRepairBucket: 'visible_broken',
    historicalRepairAction: 'decision_recalc',
    cleanupState: 'active',
    analysisQualityScoreBefore: 38,
    analysisQualityStateBefore: 'LOW',
    decisionStateBefore: 'provisional',
    trustedEligibilityBefore: false,
    keyEvidenceGapsBefore: ['user_conflict', 'monetization_conflict'],
    trustedBlockingGapsBefore: ['user_conflict', 'monetization_conflict'],
    evidenceCoverageRateBefore: 0.22,
    ...(overrides.before ?? {}),
  };
  const router = {
    routerCapabilityTier: 'REVIEW',
    routerPriorityClass: 'P0',
    routerFallbackPolicy: 'RETRY_THEN_REVIEW',
    routerRequiresReview: true,
    routerRetryClass: 'RETRY_ONCE_THEN_REVIEW',
    routerReasonSummary: 'conflict-driven recalc',
    routerCostSensitivity: 'LOW',
    routerLatencySensitivity: 'HIGH',
    ...(overrides.router ?? {}),
  };
  const execution = {
    outcomeStatus: 'success',
    outcomeReason: 'seed_execution_complete',
    executionDurationMs: 120,
    executionCostClass: 'HIGH',
    executionUsedFallback: false,
    executionUsedReview: true,
    ...(overrides.execution ?? {}),
  };
  const after = {
    analysisQualityScoreAfter: 50,
    analysisQualityStateAfter: 'MEDIUM',
    decisionStateAfter: 'trusted',
    trustedEligibilityAfter: true,
    keyEvidenceGapsAfter: ['user_conflict'],
    trustedBlockingGapsAfter: ['user_conflict'],
    evidenceCoverageRateAfter: 0.34,
    ...(overrides.after ?? {}),
  };

  return buildAnalysisOutcomeLog({ before, router, execution, after });
}

test('seed selection is stable and excludes freeze/archive candidates', () => {
  const selection = buildCalibrationSeedSelectionReport({
    perGroupTarget: 1,
    items: [
      createPriorityItem(),
      createPriorityItem({
        repoId: 'repo-2',
        fullName: 'acme/repo-2',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'deep_repair',
        strictVisibilityLevel: 'DETAIL_ONLY',
        repositoryValueTier: 'HIGH',
        moneyPriority: 'P0',
        deepRepairGaps: ['technical_maturity_missing', 'execution_missing'],
        decisionRecalcGaps: [],
        conflictDrivenGaps: [],
        conflictFlag: false,
      }),
      createPriorityItem({
        repoId: 'repo-3',
        fullName: 'acme/repo-3',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'evidence_repair',
        strictVisibilityLevel: 'FAVORITES',
        repositoryValueTier: 'MEDIUM',
        moneyPriority: 'P2',
        deepRepairGaps: [],
        decisionRecalcGaps: [],
        conflictDrivenGaps: [],
        missingDrivenGaps: [],
        weakDrivenGaps: ['distribution_weak'],
        evidenceRepairGaps: ['distribution_weak'],
        conflictFlag: false,
      }),
      createPriorityItem({
        repoId: 'repo-frozen',
        fullName: 'acme/repo-frozen',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'deep_repair',
        cleanupState: 'freeze',
        deepRepairGaps: ['market_missing'],
      }),
    ],
  });

  assert.equal(selection.totalSeeded, 3);
  assert.equal(selection.groupCounts.decision_recalc, 1);
  assert.equal(selection.groupCounts.deep_repair, 1);
  assert.equal(selection.groupCounts.evidence_repair, 1);
  assert.deepEqual(selection.insufficientGroups, []);
  assert.equal(
    selection.items.some((item) => item.repositoryId === 'repo-frozen'),
    false,
  );
});

test('seed batch report aggregates outcome stats and renders markdown', () => {
  const selection = buildCalibrationSeedSelectionReport({
    perGroupTarget: 1,
    items: [
      createPriorityItem(),
      createPriorityItem({
        repoId: 'repo-2',
        fullName: 'acme/repo-2',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'deep_repair',
        strictVisibilityLevel: 'DETAIL_ONLY',
        repositoryValueTier: 'HIGH',
        moneyPriority: 'P0',
        deepRepairGaps: ['technical_maturity_missing', 'execution_missing'],
        decisionRecalcGaps: [],
        conflictDrivenGaps: [],
        conflictFlag: false,
      }),
      createPriorityItem({
        repoId: 'repo-3',
        fullName: 'acme/repo-3',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'evidence_repair',
        strictVisibilityLevel: 'FAVORITES',
        repositoryValueTier: 'MEDIUM',
        moneyPriority: 'P2',
        deepRepairGaps: [],
        decisionRecalcGaps: [],
        conflictDrivenGaps: [],
        missingDrivenGaps: [],
        weakDrivenGaps: ['distribution_weak'],
        evidenceRepairGaps: ['distribution_weak'],
        conflictFlag: false,
      }),
    ],
  });
  const report = buildCalibrationSeedBatchReport({
    selection,
    logs: [
      createOutcomeLog(),
      createOutcomeLog({
        before: {
          repositoryId: 'repo-2',
          normalizedTaskType: 'deep_repair',
          historicalRepairBucket: 'high_value_weak',
          historicalRepairAction: 'deep_repair',
          keyEvidenceGapsBefore: [
            'technical_maturity_missing',
            'execution_missing',
          ],
          trustedBlockingGapsBefore: [
            'technical_maturity_missing',
            'execution_missing',
          ],
        },
        router: {
          routerCapabilityTier: 'HEAVY',
          routerRequiresReview: false,
        },
        execution: {
          outcomeStatus: 'partial',
          executionUsedReview: false,
        },
        after: {
          analysisQualityScoreAfter: 46,
          analysisQualityStateAfter: 'LOW',
          decisionStateAfter: 'provisional',
          trustedEligibilityAfter: false,
          keyEvidenceGapsAfter: ['execution_missing'],
          trustedBlockingGapsAfter: ['execution_missing'],
          evidenceCoverageRateAfter: 0.29,
        },
      }),
      createOutcomeLog({
        before: {
          repositoryId: 'repo-3',
          normalizedTaskType: 'evidence_repair',
          historicalRepairBucket: 'high_value_weak',
          historicalRepairAction: 'evidence_repair',
          analysisQualityStateBefore: 'MEDIUM',
          keyEvidenceGapsBefore: ['distribution_weak'],
          trustedBlockingGapsBefore: [],
        },
        router: {
          routerCapabilityTier: 'LIGHT',
          routerRequiresReview: false,
          routerFallbackPolicy: 'LIGHT_DERIVATION',
        },
        execution: {
          outcomeStatus: 'no_change',
          executionCostClass: 'LOW',
          executionUsedFallback: true,
          executionUsedReview: false,
        },
        after: {
          analysisQualityScoreAfter: 40,
          analysisQualityStateAfter: 'MEDIUM',
          decisionStateAfter: 'provisional',
          trustedEligibilityAfter: false,
          keyEvidenceGapsAfter: ['distribution_weak'],
          trustedBlockingGapsAfter: [],
          evidenceCoverageRateAfter: 0.22,
        },
      }),
    ],
  });

  assert.equal(report.selection.totalSeeded, 3);
  assert.equal(report.executionSummary.outcomeStatusBreakdown.success, 1);
  assert.equal(report.executionSummary.outcomeStatusBreakdown.partial, 1);
  assert.equal(report.executionSummary.outcomeStatusBreakdown.no_change, 1);
  assert.equal(report.executionSummary.repairValueClassBreakdown.high >= 0, true);
  assert.equal(report.executionSummary.qualityDeltaSummary.totalDelta > 0, true);
  assert.equal(report.executionSummary.trustedChangedCount, 1);
  assert.equal(report.executionSummary.decisionChangedCount, 1);
  assert.equal(report.executionSummary.fallbackUsedCount, 1);
  assert.equal(report.groupResults.decision_recalc.selectedCount, 1);
  assert.equal(report.groupResults.deep_repair.selectedCount, 1);
  assert.equal(report.groupResults.evidence_repair.selectedCount, 1);

  const markdown = renderCalibrationSeedBatchMarkdown(report);
  assert.match(markdown, /Calibration Seed Batch Report/);
  assert.match(markdown, /Execution Summary/);
  assert.match(markdown, /decision_recalc/);
  assert.match(markdown, /deep_repair/);
  assert.match(markdown, /evidence_repair/);
});
