const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ANALYSIS_OUTCOME_STATUSES,
  ANALYSIS_REPAIR_VALUE_CLASSES,
  buildAnalysisOutcomeLog,
  buildAnalysisOutcomeSnapshot,
  classifyRepairValue,
} = require('../dist/modules/analysis/helpers/analysis-outcome.helper');

test('analysis outcome log computes deltas and high repair value from evidence improvement', () => {
  const log = buildAnalysisOutcomeLog({
    before: {
      repositoryId: 'repo-1',
      normalizedTaskType: 'deep_repair',
      taskIntent: 'repair',
      historicalRepairBucket: 'high_value_weak',
      historicalRepairAction: 'deep_repair',
      cleanupState: 'active',
      analysisQualityScoreBefore: 42,
      analysisQualityStateBefore: 'LOW',
      decisionStateBefore: 'provisional',
      trustedEligibilityBefore: false,
      keyEvidenceGapsBefore: ['technical_maturity_missing', 'execution_missing'],
      trustedBlockingGapsBefore: ['technical_maturity_missing'],
      evidenceCoverageRateBefore: 0.2,
    },
    router: {
      routerCapabilityTier: 'HEAVY',
      routerPriorityClass: 'P1',
      routerFallbackPolicy: 'RETRY_THEN_REVIEW',
      routerRequiresReview: false,
      routerRetryClass: 'RETRY_ONCE_THEN_REVIEW',
      routerReasonSummary: 'high-value deep repair',
      routerCostSensitivity: 'LOW',
      routerLatencySensitivity: 'MEDIUM',
    },
    execution: {
      outcomeStatus: 'success',
      outcomeReason: 'deep_repair_completed',
      executionDurationMs: 1250,
      executionCostClass: 'HIGH',
      executionUsedFallback: false,
      executionUsedReview: false,
    },
    after: {
      analysisQualityScoreAfter: 58,
      analysisQualityStateAfter: 'MEDIUM',
      decisionStateAfter: 'provisional',
      trustedEligibilityAfter: false,
      keyEvidenceGapsAfter: [],
      trustedBlockingGapsAfter: [],
      evidenceCoverageRateAfter: 0.71,
    },
  });

  assert.equal(log.delta.qualityDelta, 16);
  assert.equal(log.delta.gapCountDelta, -2);
  assert.equal(log.delta.blockingGapDelta, -1);
  assert.equal(log.delta.repairValueClass, 'high');
});

test('analysis outcome helper keeps taxonomy stable and classifies negative outcomes', () => {
  assert.deepEqual(ANALYSIS_OUTCOME_STATUSES, [
    'success',
    'partial',
    'no_change',
    'failed',
    'downgraded',
    'skipped',
  ]);
  assert.deepEqual(ANALYSIS_REPAIR_VALUE_CLASSES, [
    'high',
    'medium',
    'low',
    'negative',
  ]);

  const valueClass = classifyRepairValue({
    outcomeStatus: 'downgraded',
    qualityDelta: -2,
    gapCountDelta: 1,
    blockingGapDelta: 0,
    trustedChanged: true,
    decisionChanged: true,
  });

  assert.equal(valueClass, 'negative');
});

test('analysis outcome helper tolerates partial fields and preserves no_change semantics', () => {
  const log = buildAnalysisOutcomeLog({
    before: {
      repositoryId: 'repo-2',
      normalizedTaskType: 'refresh_only',
      taskIntent: 'repair',
      historicalRepairBucket: 'stale_watch',
      historicalRepairAction: 'refresh_only',
      cleanupState: 'active',
      analysisQualityScoreBefore: 40,
      analysisQualityStateBefore: 'LOW',
      decisionStateBefore: null,
      trustedEligibilityBefore: false,
      keyEvidenceGapsBefore: null,
      trustedBlockingGapsBefore: undefined,
      evidenceCoverageRateBefore: null,
    },
    router: {
      routerCapabilityTier: null,
      routerPriorityClass: null,
      routerFallbackPolicy: null,
      routerRequiresReview: false,
      routerRetryClass: null,
      routerReasonSummary: null,
      routerCostSensitivity: null,
      routerLatencySensitivity: null,
    },
    execution: {
      outcomeStatus: 'no_change',
      outcomeReason: 'already_fresh',
      executionDurationMs: -12,
      executionCostClass: null,
      executionUsedFallback: false,
      executionUsedReview: false,
    },
    after: {
      analysisQualityScoreAfter: undefined,
      analysisQualityStateAfter: undefined,
      decisionStateAfter: undefined,
      trustedEligibilityAfter: false,
      keyEvidenceGapsAfter: undefined,
      trustedBlockingGapsAfter: undefined,
      evidenceCoverageRateAfter: undefined,
    },
  });

  assert.equal(log.execution.executionDurationMs, 0);
  assert.equal(log.delta.qualityDelta, 0);
  assert.equal(log.delta.gapCountDelta, 0);
  assert.equal(log.delta.blockingGapDelta, 0);
  assert.equal(log.delta.repairValueClass, 'low');
});

test('analysis outcome snapshot summarizes covered actions and status counts', () => {
  const report = buildAnalysisOutcomeSnapshot({
    source: 'unit_test',
    items: [
      buildAnalysisOutcomeLog({
        before: {
          repositoryId: 'repo-1',
          normalizedTaskType: 'decision_recalc',
          taskIntent: 'recalc',
          historicalRepairBucket: 'visible_broken',
          historicalRepairAction: 'decision_recalc',
          cleanupState: 'active',
          analysisQualityScoreBefore: 30,
          analysisQualityStateBefore: 'CRITICAL',
          decisionStateBefore: 'degraded',
          trustedEligibilityBefore: false,
          keyEvidenceGapsBefore: ['user_conflict'],
          trustedBlockingGapsBefore: ['user_conflict'],
          evidenceCoverageRateBefore: 0.2,
        },
        router: {
          routerCapabilityTier: 'REVIEW',
          routerPriorityClass: 'P0',
          routerFallbackPolicy: 'RETRY_THEN_REVIEW',
          routerRequiresReview: true,
          routerRetryClass: 'RETRY_ONCE_THEN_REVIEW',
          routerReasonSummary: 'conflict recalc',
          routerCostSensitivity: 'LOW',
          routerLatencySensitivity: 'HIGH',
        },
      execution: {
        outcomeStatus: 'partial',
        outcomeReason: 'queued_decision_recalc_execution',
        executionDurationMs: 20,
        executionCostClass: 'HIGH',
        executionUsedFallback: true,
        executionUsedReview: true,
      },
        after: {
          analysisQualityScoreAfter: 30,
          analysisQualityStateAfter: 'CRITICAL',
          decisionStateAfter: 'degraded',
          trustedEligibilityAfter: false,
          keyEvidenceGapsAfter: ['user_conflict'],
          trustedBlockingGapsAfter: ['user_conflict'],
          evidenceCoverageRateAfter: 0.2,
        },
      }),
      buildAnalysisOutcomeLog({
        before: {
          repositoryId: 'repo-2',
          normalizedTaskType: 'downgrade_only',
          taskIntent: 'downgrade',
          historicalRepairBucket: 'archive_or_noise',
          historicalRepairAction: 'downgrade_only',
          cleanupState: 'freeze',
          analysisQualityScoreBefore: 25,
          analysisQualityStateBefore: 'CRITICAL',
          decisionStateBefore: 'trusted',
          trustedEligibilityBefore: true,
          keyEvidenceGapsBefore: ['technical_maturity_missing'],
          trustedBlockingGapsBefore: ['technical_maturity_missing'],
          evidenceCoverageRateBefore: 0.1,
        },
        router: {
          routerCapabilityTier: 'DETERMINISTIC_ONLY',
          routerPriorityClass: 'P3',
          routerFallbackPolicy: 'DOWNGRADE_ONLY',
          routerRequiresReview: false,
          routerRetryClass: 'NONE',
          routerReasonSummary: 'cleanup freeze',
          routerCostSensitivity: 'EXTREME',
          routerLatencySensitivity: 'LOW',
        },
        execution: {
          outcomeStatus: 'downgraded',
          outcomeReason: 'frontend_guard_downgrade_applied',
          executionDurationMs: 0,
          executionCostClass: null,
          executionUsedFallback: false,
          executionUsedReview: false,
        },
        after: {
          analysisQualityScoreAfter: 25,
          analysisQualityStateAfter: 'CRITICAL',
          decisionStateAfter: 'degraded',
          trustedEligibilityAfter: false,
          keyEvidenceGapsAfter: ['technical_maturity_missing'],
          trustedBlockingGapsAfter: ['technical_maturity_missing'],
          evidenceCoverageRateAfter: 0.1,
        },
      }),
    ],
  });

  assert.equal(report.summary.totalCount, 2);
  assert.equal(report.summary.outcomeStatusBreakdown.partial, 1);
  assert.equal(report.summary.outcomeStatusBreakdown.downgraded, 1);
  assert.equal(report.summary.fallbackUsedCount, 1);
  assert.equal(report.summary.reviewUsedCount, 1);
  assert.equal(report.summary.trustedChangedCount, 1);
  assert.equal(report.summary.actionOutcomeStatusBreakdown.decision_recalc.partial, 1);
  assert.equal(report.summary.actionRepairValueClassBreakdown.downgrade_only.negative, 1);
  assert.ok(report.summary.coveredActions.includes('decision_recalc'));
  assert.ok(report.summary.coveredActions.includes('downgrade_only'));
});
