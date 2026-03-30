const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAnalysisOutcomeLog,
} = require('../dist/modules/analysis/helpers/analysis-outcome.helper');
const {
  buildCalibrationSeedRefreshSelectionReport,
  buildCalibrationSeedRefreshReport,
  renderCalibrationSeedRefreshMarkdown,
} = require('../dist/modules/analysis/helpers/calibration-seed-refresh.helper');

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
    freshnessDays: 30,
    evidenceFreshnessDays: 20,
    hasDeep: false,
    fallbackFlag: false,
    conflictFlag: true,
    incompleteFlag: false,
    ...overrides,
  };
}

function createGateSnapshot(items) {
  return {
    schemaVersion: 'decision_recalc_gate_v1',
    generatedAt: '2026-03-28T10:00:00.000Z',
    totalCandidates: items.length,
    items,
  };
}

function createGateResult(overrides = {}) {
  return {
    repositoryId: 'repo-1',
    fullName: 'acme/repo-1',
    historicalRepairBucket: 'visible_broken',
    historicalRepairAction: 'decision_recalc',
    cleanupState: 'active',
    strictVisibilityLevel: 'HOME',
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    recalcFingerprint: {
      repositoryId: 'repo-1',
      keyEvidenceGaps: ['user_conflict'],
      decisionRecalcGaps: ['user_conflict'],
      trustedBlockingGaps: ['user_conflict'],
      relevantConflictSignals: ['user_conflict'],
      evidenceCoverageRate: 0.22,
      freshnessDays: 30,
      evidenceFreshnessDays: 20,
      analysisQualityScore: 38,
      analysisQualityState: 'LOW',
      frontendDecisionState: 'provisional',
      hasDeep: false,
      fallbackFlag: false,
      conflictFlag: true,
      incompleteFlag: false,
      recalcFingerprintHash: 'hash-1',
    },
    recalcFingerprintHash: 'hash-1',
    previousFingerprintHash: 'hash-0',
    recalcGateDecision: 'allow_recalc',
    recalcGateReason: 'recalc_new_signal_detected',
    recalcSignalChanged: true,
    recalcSignalDiffSummary: 'fingerprint changed in keyEvidenceGaps',
    recalcGateConfidence: 'HIGH',
    changedFields: ['keyEvidenceGaps'],
    replayedConflictSignals: [],
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
    routerReasonSummary: 'refresh test',
    routerCostSensitivity: 'LOW',
    routerLatencySensitivity: 'HIGH',
    ...(overrides.router ?? {}),
  };
  const execution = {
    outcomeStatus: 'success',
    outcomeReason: 'refresh_execution_complete',
    executionDurationMs: 100,
    executionCostClass: 'HIGH',
    executionUsedFallback: false,
    executionUsedReview: true,
    ...(overrides.execution ?? {}),
  };
  const after = {
    analysisQualityScoreAfter: 46,
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

test('refresh selection excludes suppress_replay and keeps deep/evidence slices', () => {
  const selection = buildCalibrationSeedRefreshSelectionReport({
    items: [
      createPriorityItem(),
      createPriorityItem({
        repoId: 'repo-suppress',
        fullName: 'acme/repo-suppress',
      }),
      createPriorityItem({
        repoId: 'repo-2',
        fullName: 'acme/repo-2',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'deep_repair',
        decisionRecalcGaps: [],
        deepRepairGaps: ['technical_maturity_missing', 'execution_missing'],
        conflictDrivenGaps: [],
        conflictFlag: false,
      }),
      createPriorityItem({
        repoId: 'repo-3',
        fullName: 'acme/repo-3',
        historicalRepairBucket: 'stale_watch',
        historicalRepairAction: 'deep_repair',
        repositoryValueTier: 'MEDIUM',
        moneyPriority: 'P3',
        decisionRecalcGaps: [],
        deepRepairGaps: ['market_missing'],
        conflictDrivenGaps: [],
        conflictFlag: false,
      }),
      createPriorityItem({
        repoId: 'repo-4',
        fullName: 'acme/repo-4',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'evidence_repair',
        repositoryValueTier: 'MEDIUM',
        moneyPriority: 'P2',
        decisionRecalcGaps: [],
        deepRepairGaps: [],
        conflictDrivenGaps: [],
        missingDrivenGaps: [],
        weakDrivenGaps: ['distribution_weak'],
        evidenceRepairGaps: ['distribution_weak'],
        conflictFlag: false,
      }),
      createPriorityItem({
        repoId: 'repo-5',
        fullName: 'acme/repo-5',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'evidence_repair',
        repositoryValueTier: 'MEDIUM',
        moneyPriority: 'P2',
        decisionRecalcGaps: [],
        deepRepairGaps: [],
        conflictDrivenGaps: ['execution_conflict'],
        missingDrivenGaps: ['market_missing'],
        weakDrivenGaps: ['distribution_weak'],
        evidenceRepairGaps: ['distribution_weak', 'market_missing'],
        conflictFlag: true,
      }),
      createPriorityItem({
        repoId: 'repo-frozen',
        fullName: 'acme/repo-frozen',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'deep_repair',
        cleanupState: 'freeze',
        decisionRecalcGaps: [],
        deepRepairGaps: ['market_missing'],
      }),
    ],
    decisionGateSnapshot: createGateSnapshot([
      createGateResult(),
      createGateResult({
        repositoryId: 'repo-suppress',
        fullName: 'acme/repo-suppress',
        recalcGateDecision: 'suppress_replay',
        recalcGateReason: 'recalc_replay_suppressed',
        recalcSignalChanged: false,
        recalcSignalDiffSummary: 'fingerprint unchanged',
        changedFields: [],
        replayedConflictSignals: ['monetization_conflict'],
      }),
    ]),
    decisionRecalcTarget: 5,
    deepRepairHighValueTarget: 1,
    deepRepairGeneralValueTarget: 1,
    evidenceRepairWeakOnlyTarget: 1,
    evidenceRepairNonWeakOnlyTarget: 1,
  });

  assert.equal(selection.groupCounts.decision_recalc_refresh, 1);
  assert.equal(selection.groupCounts.deep_repair_refresh, 2);
  assert.equal(selection.groupCounts.evidence_repair_refresh, 2);
  assert.equal(selection.sliceCounts.allowed_recalc, 1);
  assert.equal(selection.sliceCounts.high_value, 1);
  assert.equal(selection.sliceCounts.general_value, 1);
  assert.equal(selection.sliceCounts.weak_only, 1);
  assert.equal(selection.sliceCounts.non_weak_only, 1);
  assert.equal(
    selection.items.some((item) => item.repositoryId === 'repo-suppress'),
    false,
  );
  assert.equal(
    selection.items.some((item) => item.repositoryId === 'repo-frozen'),
    false,
  );
  assert.equal(selection.decisionGateSummary.gateDecisionBreakdown.allow_recalc, 1);
  assert.equal(
    selection.decisionGateSummary.gateDecisionBreakdown.suppress_replay,
    1,
  );
});

test('refresh report builds comparison and non-empty summaries', () => {
  const selection = buildCalibrationSeedRefreshSelectionReport({
    items: [
      createPriorityItem(),
      createPriorityItem({
        repoId: 'repo-2',
        fullName: 'acme/repo-2',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'deep_repair',
        decisionRecalcGaps: [],
        deepRepairGaps: ['technical_maturity_missing', 'execution_missing'],
        conflictDrivenGaps: [],
        conflictFlag: false,
      }),
      createPriorityItem({
        repoId: 'repo-3',
        fullName: 'acme/repo-3',
        historicalRepairBucket: 'stale_watch',
        historicalRepairAction: 'deep_repair',
        repositoryValueTier: 'MEDIUM',
        moneyPriority: 'P3',
        decisionRecalcGaps: [],
        deepRepairGaps: ['market_missing'],
        conflictDrivenGaps: [],
        conflictFlag: false,
      }),
      createPriorityItem({
        repoId: 'repo-4',
        fullName: 'acme/repo-4',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'evidence_repair',
        repositoryValueTier: 'MEDIUM',
        moneyPriority: 'P2',
        decisionRecalcGaps: [],
        deepRepairGaps: [],
        conflictDrivenGaps: [],
        missingDrivenGaps: [],
        weakDrivenGaps: ['distribution_weak'],
        evidenceRepairGaps: ['distribution_weak'],
        conflictFlag: false,
      }),
      createPriorityItem({
        repoId: 'repo-5',
        fullName: 'acme/repo-5',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'evidence_repair',
        repositoryValueTier: 'MEDIUM',
        moneyPriority: 'P2',
        decisionRecalcGaps: [],
        deepRepairGaps: [],
        conflictDrivenGaps: ['execution_conflict'],
        missingDrivenGaps: ['market_missing'],
        weakDrivenGaps: ['distribution_weak'],
        evidenceRepairGaps: ['distribution_weak', 'market_missing'],
        conflictFlag: true,
      }),
    ],
    decisionGateSnapshot: createGateSnapshot([]),
    decisionRecalcTarget: 0,
    deepRepairHighValueTarget: 1,
    deepRepairGeneralValueTarget: 1,
    evidenceRepairWeakOnlyTarget: 1,
    evidenceRepairNonWeakOnlyTarget: 1,
  });

  const report = buildCalibrationSeedRefreshReport({
    selection,
    logs: [
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
          outcomeStatus: 'success',
          executionUsedReview: false,
        },
        after: {
          analysisQualityScoreAfter: 54,
          analysisQualityStateAfter: 'MEDIUM',
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
          normalizedTaskType: 'deep_repair',
          historicalRepairBucket: 'stale_watch',
          historicalRepairAction: 'deep_repair',
          repositoryValueTier: 'MEDIUM',
          keyEvidenceGapsBefore: ['market_missing'],
          trustedBlockingGapsBefore: ['market_missing'],
        },
        router: {
          routerCapabilityTier: 'HEAVY',
          routerRequiresReview: false,
        },
        execution: {
          outcomeStatus: 'no_change',
          executionUsedReview: false,
        },
        after: {
          analysisQualityScoreAfter: 38,
          analysisQualityStateAfter: 'LOW',
          decisionStateAfter: 'provisional',
          trustedEligibilityAfter: false,
          keyEvidenceGapsAfter: ['market_missing'],
          trustedBlockingGapsAfter: ['market_missing'],
          evidenceCoverageRateAfter: 0.22,
        },
      }),
      createOutcomeLog({
        before: {
          repositoryId: 'repo-4',
          normalizedTaskType: 'evidence_repair',
          historicalRepairBucket: 'high_value_weak',
          historicalRepairAction: 'evidence_repair',
          analysisQualityStateBefore: 'LOW',
          keyEvidenceGapsBefore: ['distribution_weak'],
          trustedBlockingGapsBefore: [],
        },
        router: {
          routerCapabilityTier: 'LIGHT',
          routerRequiresReview: false,
          routerFallbackPolicy: 'LIGHT_DERIVATION',
        },
        execution: {
          outcomeStatus: 'partial',
          executionCostClass: 'LOW',
          executionUsedFallback: true,
          executionUsedReview: false,
        },
        after: {
          analysisQualityScoreAfter: 42,
          analysisQualityStateAfter: 'LOW',
          decisionStateAfter: 'provisional',
          trustedEligibilityAfter: false,
          keyEvidenceGapsAfter: [],
          trustedBlockingGapsAfter: [],
          evidenceCoverageRateAfter: 0.27,
        },
      }),
      createOutcomeLog({
        before: {
          repositoryId: 'repo-5',
          normalizedTaskType: 'evidence_repair',
          historicalRepairBucket: 'high_value_weak',
          historicalRepairAction: 'evidence_repair',
          analysisQualityStateBefore: 'CRITICAL',
          keyEvidenceGapsBefore: ['distribution_weak', 'market_missing'],
          trustedBlockingGapsBefore: ['market_missing'],
        },
        router: {
          routerCapabilityTier: 'STANDARD',
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
          analysisQualityScoreAfter: 38,
          analysisQualityStateAfter: 'CRITICAL',
          decisionStateAfter: 'provisional',
          trustedEligibilityAfter: false,
          keyEvidenceGapsAfter: ['distribution_weak', 'market_missing'],
          trustedBlockingGapsAfter: ['market_missing'],
          evidenceCoverageRateAfter: 0.22,
        },
      }),
    ],
    baseline: {
      generatedAt: '2026-03-27T08:00:00.000Z',
      selection: { totalSeeded: 60 },
      executionSummary: {
        outcomeStatusBreakdown: {
          success: 0,
          partial: 1,
          no_change: 59,
          failed: 0,
          downgraded: 0,
          skipped: 0,
        },
        repairValueClassBreakdown: {
          high: 0,
          medium: 1,
          low: 59,
          negative: 0,
        },
      },
      groupResults: {
        decision_recalc: {
          selectedCount: 20,
          executedCount: 20,
          noChangeCount: 20,
          repairValueClassBreakdown: {
            high: 0,
            medium: 0,
            low: 20,
            negative: 0,
          },
        },
        deep_repair: {
          selectedCount: 20,
          executedCount: 20,
          noChangeCount: 20,
          repairValueClassBreakdown: {
            high: 0,
            medium: 0,
            low: 20,
            negative: 0,
          },
        },
        evidence_repair: {
          selectedCount: 20,
          executedCount: 20,
          noChangeCount: 19,
          repairValueClassBreakdown: {
            high: 0,
            medium: 1,
            low: 19,
            negative: 0,
          },
        },
      },
    },
  });
  const markdown = renderCalibrationSeedRefreshMarkdown(report);

  assert.equal(report.executionSummary.outcomeStatusBreakdown.success, 1);
  assert.equal(report.executionSummary.outcomeStatusBreakdown.partial, 1);
  assert.equal(report.groupResults.deep_repair_refresh.positiveCount, 1);
  assert.equal(report.groupResults.evidence_repair_refresh.executedCount, 2);
  assert.equal(report.qualityCalibration.statesWithSignal.includes('LOW'), true);
  assert.equal(report.comparison.actionComparisons.length, 3);
  assert.ok(
    report.comparison.overturnedConclusions.length > 0 ||
      report.comparison.reinforcedConclusions.length > 0 ||
      report.comparison.higherConfidenceJudgments.length > 0,
  );
  assert.match(markdown, /GitDian Calibration Seed Refresh Report/);
  assert.match(markdown, /decision_recalc_refresh/);
  assert.match(markdown, /## Comparison/);
  assert.match(markdown, /report:calibration-seed-refresh/);
});
