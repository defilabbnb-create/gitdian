const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAnalysisOutcomeLog,
  buildAnalysisOutcomeSnapshot,
} = require('../dist/modules/analysis/helpers/analysis-outcome.helper');
const {
  buildAnalysisCalibrationReport,
  renderAnalysisCalibrationMarkdown,
} = require('../dist/modules/analysis/helpers/analysis-calibration-report.helper');

function createOutcomeLog(overrides = {}) {
  const before = {
    repositoryId: 'repo-1',
    normalizedTaskType: 'evidence_repair',
    taskIntent: 'repair',
    historicalRepairBucket: 'high_value_weak',
    historicalRepairAction: 'evidence_repair',
    cleanupState: 'active',
    analysisQualityScoreBefore: 40,
    analysisQualityStateBefore: 'LOW',
    decisionStateBefore: 'provisional',
    trustedEligibilityBefore: false,
    keyEvidenceGapsBefore: ['execution_missing', 'market_missing'],
    trustedBlockingGapsBefore: ['execution_missing'],
    evidenceCoverageRateBefore: 0.2,
    ...(overrides.before ?? {}),
  };
  const router = {
    routerCapabilityTier: 'STANDARD',
    routerPriorityClass: 'P1',
    routerFallbackPolicy: 'LIGHT_DERIVATION',
    routerRequiresReview: false,
    routerRetryClass: 'RETRY_ONCE',
    routerReasonSummary: 'baseline router decision',
    routerCostSensitivity: 'MEDIUM',
    routerLatencySensitivity: 'MEDIUM',
    ...(overrides.router ?? {}),
  };
  const execution = {
    outcomeStatus: 'partial',
    outcomeReason: 'queued_execution',
    executionDurationMs: 120,
    executionCostClass: 'MEDIUM',
    executionUsedFallback: false,
    executionUsedReview: false,
    ...(overrides.execution ?? {}),
  };
  const after = {
    analysisQualityScoreAfter: 46,
    analysisQualityStateAfter: 'MEDIUM',
    decisionStateAfter: before.decisionStateBefore,
    trustedEligibilityAfter: before.trustedEligibilityBefore,
    keyEvidenceGapsAfter: ['market_missing'],
    trustedBlockingGapsAfter: [],
    evidenceCoverageRateAfter: 0.42,
    ...(overrides.after ?? {}),
  };

  return buildAnalysisOutcomeLog({ before, router, execution, after });
}

test('analysis calibration report aggregates repair, router, quality, gap, and review summaries', () => {
  const snapshot = buildAnalysisOutcomeSnapshot({
    source: 'historical_repair_loop',
    items: [
      createOutcomeLog({
        before: {
          repositoryId: 'repo-evidence-medium',
          normalizedTaskType: 'evidence_repair',
          historicalRepairAction: 'evidence_repair',
          analysisQualityStateBefore: 'LOW',
          keyEvidenceGapsBefore: ['distribution_weak'],
          trustedBlockingGapsBefore: ['distribution_weak'],
        },
        router: {
          routerCapabilityTier: 'LIGHT',
          routerFallbackPolicy: 'LIGHT_DERIVATION',
        },
        execution: {
          executionUsedFallback: true,
        },
        after: {
          analysisQualityScoreAfter: 48,
          analysisQualityStateAfter: 'MEDIUM',
          keyEvidenceGapsAfter: [],
          trustedBlockingGapsAfter: [],
        },
      }),
      createOutcomeLog({
        before: {
          repositoryId: 'repo-deep-high',
          normalizedTaskType: 'deep_repair',
          historicalRepairAction: 'deep_repair',
          analysisQualityScoreBefore: 28,
          analysisQualityStateBefore: 'CRITICAL',
          keyEvidenceGapsBefore: [
            'technical_maturity_missing',
            'execution_missing',
            'market_missing',
          ],
          trustedBlockingGapsBefore: [
            'technical_maturity_missing',
            'execution_missing',
          ],
        },
        router: {
          routerCapabilityTier: 'HEAVY',
          routerFallbackPolicy: 'RETRY_THEN_REVIEW',
          routerReasonSummary: 'deep repair needs heavy capability',
        },
        execution: {
          executionCostClass: 'HIGH',
        },
        after: {
          analysisQualityScoreAfter: 45,
          analysisQualityStateAfter: 'MEDIUM',
          keyEvidenceGapsAfter: ['market_missing'],
          trustedBlockingGapsAfter: [],
          evidenceCoverageRateAfter: 0.58,
        },
      }),
      createOutcomeLog({
        before: {
          repositoryId: 'repo-recalc-review',
          normalizedTaskType: 'decision_recalc',
          taskIntent: 'recalc',
          historicalRepairBucket: 'visible_broken',
          historicalRepairAction: 'decision_recalc',
          analysisQualityScoreBefore: 35,
          analysisQualityStateBefore: 'LOW',
          decisionStateBefore: 'provisional',
          keyEvidenceGapsBefore: ['user_conflict', 'monetization_conflict'],
          trustedBlockingGapsBefore: ['user_conflict', 'monetization_conflict'],
        },
        router: {
          routerCapabilityTier: 'REVIEW',
          routerRequiresReview: true,
          routerFallbackPolicy: 'RETRY_THEN_REVIEW',
          routerRetryClass: 'RETRY_ONCE_THEN_REVIEW',
          routerReasonSummary: 'conflict recalc needs review',
        },
        execution: {
          executionCostClass: 'HIGH',
          executionUsedReview: true,
        },
        after: {
          analysisQualityScoreAfter: 40,
          analysisQualityStateAfter: 'LOW',
          decisionStateAfter: 'trusted',
          trustedEligibilityAfter: true,
          keyEvidenceGapsAfter: ['user_conflict'],
          trustedBlockingGapsAfter: ['user_conflict'],
          evidenceCoverageRateAfter: 0.31,
        },
      }),
      createOutcomeLog({
        before: {
          repositoryId: 'repo-high-nochange',
          normalizedTaskType: 'evidence_repair',
          historicalRepairAction: 'evidence_repair',
          analysisQualityScoreBefore: 82,
          analysisQualityStateBefore: 'HIGH',
          decisionStateBefore: 'trusted',
          trustedEligibilityBefore: true,
          keyEvidenceGapsBefore: ['market_weak'],
          trustedBlockingGapsBefore: [],
          evidenceCoverageRateBefore: 0.74,
        },
        router: {
          routerCapabilityTier: 'STANDARD',
          routerFallbackPolicy: 'NONE',
        },
        execution: {
          outcomeStatus: 'no_change',
          outcomeReason: 'weak_only_no_change',
        },
        after: {
          analysisQualityScoreAfter: 82,
          analysisQualityStateAfter: 'HIGH',
          decisionStateAfter: 'trusted',
          trustedEligibilityAfter: true,
          keyEvidenceGapsAfter: ['market_weak'],
          trustedBlockingGapsAfter: [],
          evidenceCoverageRateAfter: 0.74,
        },
      }),
      createOutcomeLog({
        before: {
          repositoryId: 'repo-downgraded',
          normalizedTaskType: 'downgrade_only',
          taskIntent: 'downgrade',
          historicalRepairBucket: 'visible_broken',
          historicalRepairAction: 'downgrade_only',
          cleanupState: 'freeze',
          analysisQualityScoreBefore: 30,
          analysisQualityStateBefore: 'CRITICAL',
          decisionStateBefore: 'trusted',
          trustedEligibilityBefore: true,
          keyEvidenceGapsBefore: ['technical_maturity_missing'],
          trustedBlockingGapsBefore: ['technical_maturity_missing'],
        },
        router: {
          routerCapabilityTier: 'DETERMINISTIC_ONLY',
          routerFallbackPolicy: 'DOWNGRADE_ONLY',
          routerReasonSummary: 'cleanup downgrade path',
        },
        execution: {
          outcomeStatus: 'downgraded',
          outcomeReason: 'frontend_guard_downgrade_applied',
          executionCostClass: 'LOW',
          executionUsedFallback: true,
        },
        after: {
          analysisQualityScoreAfter: 24,
          analysisQualityStateAfter: 'CRITICAL',
          decisionStateAfter: 'degraded',
          trustedEligibilityAfter: false,
          keyEvidenceGapsAfter: ['technical_maturity_missing'],
          trustedBlockingGapsAfter: ['technical_maturity_missing'],
          evidenceCoverageRateAfter: 0.12,
        },
      }),
      createOutcomeLog({
        before: {
          repositoryId: 'repo-skipped',
          normalizedTaskType: 'refresh_only',
          taskIntent: 'repair',
          historicalRepairBucket: 'archive_or_noise',
          historicalRepairAction: 'refresh_only',
          cleanupState: 'freeze',
          analysisQualityScoreBefore: 18,
          analysisQualityStateBefore: 'CRITICAL',
          keyEvidenceGapsBefore: ['distribution_missing'],
          trustedBlockingGapsBefore: ['distribution_missing'],
        },
        router: {
          routerCapabilityTier: 'DETERMINISTIC_ONLY',
          routerFallbackPolicy: 'DETERMINISTIC_ONLY',
          routerReasonSummary: 'cleanup suppressed',
        },
        execution: {
          outcomeStatus: 'skipped',
          outcomeReason: 'cleanup_state_freeze_suppressed',
          executionCostClass: 'LOW',
        },
        after: {
          analysisQualityScoreAfter: 18,
          analysisQualityStateAfter: 'CRITICAL',
          decisionStateAfter: 'degraded',
          trustedEligibilityAfter: false,
          keyEvidenceGapsAfter: ['distribution_missing'],
          trustedBlockingGapsAfter: ['distribution_missing'],
          evidenceCoverageRateAfter: 0.1,
        },
      }),
    ],
  });

  const report = buildAnalysisCalibrationReport({
    snapshot,
    latestRun: {
      generatedAt: '2026-03-28T11:00:00.000Z',
    },
    seededFromDryRun: false,
  });

  assert.equal(report.source.totalLogged, 6);
  assert.equal(report.repairEffectivenessSummary.actionSummaries.length >= 4, true);
  assert.equal(
    report.repairEffectivenessSummary.topValueActions[0].action,
    'deep_repair',
  );
  assert.equal(
    report.repairEffectivenessSummary.topNoChangeActions[0].action,
    'evidence_repair',
  );
  assert.equal(report.routerCalibrationSummary.capabilityTierBreakdown.REVIEW, 1);
  assert.equal(
    report.routerCalibrationSummary.taskTypeSummaries.find(
      (item) => item.taskType === 'downgrade_only',
    )?.predominantCapabilityTier,
    'DETERMINISTIC_ONLY',
  );
  assert.equal(report.reviewBurdenSummary.requiresReviewCount, 1);
  assert.equal(report.reviewBurdenSummary.reviewUsedCount, 1);
  assert.equal(report.reviewBurdenSummary.reviewDecisionChangedCount, 1);
  assert.ok(
    report.gapEffectivenessSummary.prioritizedRepairGaps.some(
      (item) => item.gap === 'technical_maturity_missing',
    ),
  );
  assert.ok(
    report.qualityCalibrationSummary.thresholdAdjustmentSignals.some(
      (item) =>
        item.qualityState === 'HIGH' && item.signal === 'too_optimistic',
    ),
  );
  assert.ok(
    report.qualityCalibrationSummary.lowOrCriticalButImproved.some(
      (item) => item.repositoryId === 'repo-deep-high',
    ),
  );
});

test('analysis calibration markdown renders all major sections and caveat fields', () => {
  const snapshot = buildAnalysisOutcomeSnapshot({
    source: 'historical_repair_loop',
    items: [
      createOutcomeLog({
        before: {
          repositoryId: 'repo-skipped-1',
          normalizedTaskType: 'refresh_only',
          historicalRepairAction: 'refresh_only',
          cleanupState: 'freeze',
        },
        router: {
          routerCapabilityTier: 'DETERMINISTIC_ONLY',
          routerFallbackPolicy: 'DETERMINISTIC_ONLY',
        },
        execution: {
          outcomeStatus: 'skipped',
          outcomeReason: 'cleanup_state_freeze_suppressed',
        },
        after: {
          analysisQualityScoreAfter: 40,
          analysisQualityStateAfter: 'LOW',
          keyEvidenceGapsAfter: ['distribution_missing'],
          trustedBlockingGapsAfter: ['distribution_missing'],
        },
      }),
      createOutcomeLog({
        before: {
          repositoryId: 'repo-skipped-2',
          normalizedTaskType: 'downgrade_only',
          historicalRepairAction: 'downgrade_only',
          cleanupState: 'freeze',
        },
        router: {
          routerCapabilityTier: 'DETERMINISTIC_ONLY',
          routerFallbackPolicy: 'DOWNGRADE_ONLY',
        },
        execution: {
          outcomeStatus: 'downgraded',
          outcomeReason: 'frontend_guard_downgrade_applied',
        },
        after: {
          analysisQualityScoreAfter: 30,
          analysisQualityStateAfter: 'CRITICAL',
          keyEvidenceGapsAfter: ['technical_maturity_missing'],
          trustedBlockingGapsAfter: ['technical_maturity_missing'],
        },
      }),
    ],
  });

  const report = buildAnalysisCalibrationReport({
    snapshot,
    seededFromDryRun: false,
  });
  const markdown = renderAnalysisCalibrationMarkdown(report);

  assert.equal(report.source.cleanupDominated, true);
  assert.equal(report.source.trendStrength, 'insufficient');
  assert.match(markdown, /GitDian Analysis Calibration Report/);
  assert.match(markdown, /Sample Caveat/);
  assert.match(markdown, /cleanupDominated: yes/);
  assert.match(markdown, /Repair Effectiveness/);
  assert.match(markdown, /Router Calibration/);
  assert.match(markdown, /Quality Calibration/);
  assert.match(markdown, /Gap Effectiveness/);
  assert.match(markdown, /Review Burden/);
  assert.match(markdown, /command: pnpm --filter api report:analysis-calibration/);
});
