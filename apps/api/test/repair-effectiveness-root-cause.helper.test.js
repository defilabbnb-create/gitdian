const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAnalysisOutcomeLog,
} = require('../dist/modules/analysis/helpers/analysis-outcome.helper');
const {
  REPAIR_EFFECTIVENESS_ROOT_CAUSES,
  buildRepairEffectivenessRootCauseReport,
  classifyRepairEffectivenessRootCause,
  renderRepairEffectivenessRootCauseMarkdown,
} = require('../dist/modules/analysis/helpers/repair-effectiveness-root-cause.helper');

function createOutcomeLog(overrides = {}) {
  const before = {
    repositoryId: 'repo-1',
    normalizedTaskType: 'decision_recalc',
    taskIntent: 'recalc',
    historicalRepairBucket: 'visible_broken',
    historicalRepairAction: 'decision_recalc',
    cleanupState: 'active',
    analysisQualityScoreBefore: 0,
    analysisQualityStateBefore: 'CRITICAL',
    decisionStateBefore: 'degraded',
    trustedEligibilityBefore: false,
    keyEvidenceGapsBefore: [
      'user_conflict',
      'monetization_conflict',
      'execution_conflict',
    ],
    trustedBlockingGapsBefore: [
      'user_conflict',
      'monetization_conflict',
      'execution_conflict',
    ],
    evidenceCoverageRateBefore: 0.57,
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
    outcomeStatus: 'no_change',
    outcomeReason: 'decision_recalc_refresh_insight',
    executionDurationMs: 400,
    executionCostClass: 'HIGH',
    executionUsedFallback: false,
    executionUsedReview: true,
    ...(overrides.execution ?? {}),
  };
  const after = {
    analysisQualityScoreAfter: before.analysisQualityScoreBefore,
    analysisQualityStateAfter: before.analysisQualityStateBefore,
    decisionStateAfter: before.decisionStateBefore,
    trustedEligibilityAfter: before.trustedEligibilityBefore,
    keyEvidenceGapsAfter: [...before.keyEvidenceGapsBefore],
    trustedBlockingGapsAfter: [...before.trustedBlockingGapsBefore],
    evidenceCoverageRateAfter: before.evidenceCoverageRateBefore,
    ...(overrides.after ?? {}),
  };

  return buildAnalysisOutcomeLog({ before, router, execution, after });
}

test('root cause taxonomy is stable and includes required categories', () => {
  const taxonomy = REPAIR_EFFECTIVENESS_ROOT_CAUSES.map((item) => item.rootCause);
  assert.ok(taxonomy.includes('recalc_without_new_signal'));
  assert.ok(taxonomy.includes('writeback_missing'));
  assert.ok(taxonomy.includes('same_inputs_replayed'));
  assert.ok(taxonomy.includes('quality_improved_but_below_state_threshold'));
  assert.ok(taxonomy.includes('fallback_without_structural_change'));
});

test('decision recalc no_change is attributed to no-new-signal conflict recalc root causes', () => {
  const outcome = createOutcomeLog();
  const classification = classifyRepairEffectivenessRootCause({
    log: outcome,
    fullName: 'acme/recalc',
    seedGroup: 'decision_recalc',
  });

  assert.equal(classification.primaryRootCause, 'recalc_without_new_signal');
  assert.ok(
    classification.rootCauses.includes('decision_unchanged_after_recalc'),
  );
  assert.ok(
    classification.rootCauses.includes('conflict_reconfirmed_without_resolution'),
  );
  assert.ok(
    classification.rootCauses.includes('routed_review_without_structural_change'),
  );
});

test('deep repair no_change can be attributed to writeback/gap issues', () => {
  const outcome = createOutcomeLog({
    before: {
      repositoryId: 'repo-deep',
      normalizedTaskType: 'deep_repair',
      taskIntent: 'repair',
      historicalRepairBucket: 'high_value_weak',
      historicalRepairAction: 'deep_repair',
      keyEvidenceGapsBefore: [
        'distribution_missing',
        'execution_missing',
        'market_missing',
        'technical_maturity_missing',
      ],
      trustedBlockingGapsBefore: [
        'distribution_missing',
        'execution_missing',
        'market_missing',
        'technical_maturity_missing',
      ],
      evidenceCoverageRateBefore: 0,
    },
    router: {
      routerCapabilityTier: 'HEAVY',
      routerPriorityClass: 'P1',
      routerFallbackPolicy: 'RETRY_THEN_REVIEW',
      routerRequiresReview: false,
      routerRetryClass: 'RETRY_ONCE_THEN_REVIEW',
      routerReasonSummary: 'deep repair heavy route',
      routerLatencySensitivity: 'MEDIUM',
    },
    execution: {
      outcomeStatus: 'no_change',
      outcomeReason: 'deep_repair_seed_completeness_executed',
      executionUsedReview: false,
    },
  });

  const classification = classifyRepairEffectivenessRootCause({
    log: outcome,
    fullName: 'acme/deep',
    seedGroup: 'deep_repair',
  });

  assert.equal(classification.primaryRootCause, 'writeback_missing');
  assert.ok(classification.rootCauses.includes('evidence_gap_not_reduced'));
  assert.ok(classification.rootCauses.includes('blocking_gaps_unchanged'));
});

test('partial evidence repair is not misclassified as a pure no-change root cause', () => {
  const outcome = createOutcomeLog({
    before: {
      repositoryId: 'repo-evidence',
      normalizedTaskType: 'evidence_repair',
      taskIntent: 'repair',
      historicalRepairBucket: 'high_value_weak',
      historicalRepairAction: 'evidence_repair',
      analysisQualityScoreBefore: 17,
      analysisQualityStateBefore: 'LOW',
      keyEvidenceGapsBefore: [
        'distribution_weak',
        'execution_weak',
        'market_weak',
        'technical_maturity_weak',
      ],
      trustedBlockingGapsBefore: [
        'distribution_weak',
        'execution_weak',
        'market_weak',
        'technical_maturity_weak',
      ],
      evidenceCoverageRateBefore: 0.43,
    },
    router: {
      routerCapabilityTier: 'STANDARD',
      routerPriorityClass: 'P1',
      routerFallbackPolicy: 'LIGHT_DERIVATION',
      routerRequiresReview: false,
      routerRetryClass: 'RETRY_ONCE_THEN_DOWNGRADE',
      routerReasonSummary: 'weak-only evidence repair',
      routerCostSensitivity: 'MEDIUM',
      routerLatencySensitivity: 'LOW',
    },
    execution: {
      outcomeStatus: 'partial',
      outcomeReason: 'evidence_repair_snapshot_skipped',
      executionCostClass: 'MEDIUM',
      executionUsedFallback: true,
      executionUsedReview: false,
    },
    after: {
      analysisQualityScoreAfter: 18,
      analysisQualityStateAfter: 'LOW',
      decisionStateAfter: 'degraded',
      trustedEligibilityAfter: false,
      keyEvidenceGapsAfter: [
        'distribution_weak',
        'execution_weak',
        'market_weak',
        'technical_maturity_weak',
      ],
      trustedBlockingGapsAfter: [
        'distribution_weak',
        'execution_weak',
        'market_weak',
        'technical_maturity_weak',
      ],
      evidenceCoverageRateAfter: 0.43,
    },
  });

  const classification = classifyRepairEffectivenessRootCause({
    log: outcome,
    fullName: 'acme/evidence',
    seedGroup: 'evidence_repair',
  });

  assert.equal(
    classification.primaryRootCause,
    'quality_improved_but_below_state_threshold',
  );
  assert.ok(classification.rootCauses.includes('writeback_partial'));
  assert.ok(classification.rootCauses.includes('same_inputs_replayed'));
});

test('root cause report aggregates action summaries, recommendations, and markdown output', () => {
  const decisionLog = createOutcomeLog();
  const deepLog = createOutcomeLog({
    before: {
      repositoryId: 'repo-deep',
      normalizedTaskType: 'deep_repair',
      taskIntent: 'repair',
      historicalRepairBucket: 'high_value_weak',
      historicalRepairAction: 'deep_repair',
      keyEvidenceGapsBefore: [
        'distribution_missing',
        'execution_missing',
        'market_missing',
        'technical_maturity_missing',
      ],
      trustedBlockingGapsBefore: [
        'distribution_missing',
        'execution_missing',
        'market_missing',
        'technical_maturity_missing',
      ],
      evidenceCoverageRateBefore: 0,
    },
    router: {
      routerCapabilityTier: 'HEAVY',
      routerPriorityClass: 'P1',
      routerFallbackPolicy: 'RETRY_THEN_REVIEW',
      routerRequiresReview: false,
      routerRetryClass: 'RETRY_ONCE_THEN_REVIEW',
    },
    execution: {
      outcomeStatus: 'no_change',
      outcomeReason: 'deep_repair_seed_completeness_executed',
      executionUsedReview: false,
    },
  });
  const evidenceLog = createOutcomeLog({
    before: {
      repositoryId: 'repo-evidence',
      normalizedTaskType: 'evidence_repair',
      taskIntent: 'repair',
      historicalRepairBucket: 'high_value_weak',
      historicalRepairAction: 'evidence_repair',
      analysisQualityScoreBefore: 17,
      analysisQualityStateBefore: 'LOW',
      keyEvidenceGapsBefore: [
        'distribution_weak',
        'execution_weak',
        'market_weak',
        'technical_maturity_weak',
      ],
      trustedBlockingGapsBefore: [
        'distribution_weak',
        'execution_weak',
        'market_weak',
        'technical_maturity_weak',
      ],
      evidenceCoverageRateBefore: 0.43,
    },
    router: {
      routerCapabilityTier: 'STANDARD',
      routerPriorityClass: 'P1',
      routerFallbackPolicy: 'LIGHT_DERIVATION',
      routerRequiresReview: false,
      routerRetryClass: 'RETRY_ONCE_THEN_DOWNGRADE',
    },
    execution: {
      outcomeStatus: 'partial',
      outcomeReason: 'evidence_repair_snapshot_skipped',
      executionCostClass: 'MEDIUM',
      executionUsedFallback: true,
      executionUsedReview: false,
    },
    after: {
      analysisQualityScoreAfter: 18,
      analysisQualityStateAfter: 'LOW',
      keyEvidenceGapsAfter: [
        'distribution_weak',
        'execution_weak',
        'market_weak',
        'technical_maturity_weak',
      ],
      trustedBlockingGapsAfter: [
        'distribution_weak',
        'execution_weak',
        'market_weak',
        'technical_maturity_weak',
      ],
      evidenceCoverageRateAfter: 0.43,
    },
  });

  const report = buildRepairEffectivenessRootCauseReport({
    seedReport: {
      generatedAt: '2026-03-28T12:00:00.000Z',
      selection: {
        totalSeeded: 3,
        items: [
          {
            repositoryId: 'repo-1',
            fullName: 'acme/recalc',
            seedGroup: 'decision_recalc',
            historicalRepairAction: 'decision_recalc',
          },
          {
            repositoryId: 'repo-deep',
            fullName: 'acme/deep',
            seedGroup: 'deep_repair',
            historicalRepairAction: 'deep_repair',
          },
          {
            repositoryId: 'repo-evidence',
            fullName: 'acme/evidence',
            seedGroup: 'evidence_repair',
            historicalRepairAction: 'evidence_repair',
          },
        ],
      },
      snapshot: {
        items: [decisionLog, deepLog, evidenceLog],
      },
    },
  });

  assert.equal(report.source.totalSeeded, 3);
  assert.equal(report.source.analyzedCount, 3);
  assert.equal(
    report.actionRootCauseSummary.decisionRecalc.topPrimaryRootCauses[0].rootCause,
    'recalc_without_new_signal',
  );
  assert.equal(
    report.actionRootCauseSummary.deepRepair.topPrimaryRootCauses[0].rootCause,
    'writeback_missing',
  );
  assert.equal(
    report.actionRootCauseSummary.evidenceRepair.topPrimaryRootCauses[0].rootCause,
    'quality_improved_but_below_state_threshold',
  );
  assert.ok(report.surgeryRecommendations.length >= 3);
  assert.ok(
    report.surgeryRecommendations.some(
      (item) => item.recommendationId === 'decision-recalc-new-signal-gate',
    ),
  );

  const markdown = renderRepairEffectivenessRootCauseMarkdown(report);
  assert.match(markdown, /GitDian Repair Effectiveness Root Cause Report/);
  assert.match(markdown, /decision_recalc/);
  assert.match(markdown, /deep_repair/);
  assert.match(markdown, /evidence_repair/);
  assert.match(markdown, /decision-recalc-new-signal-gate/);
  assert.match(markdown, /command: pnpm --filter api report:repair-root-cause/);
});
