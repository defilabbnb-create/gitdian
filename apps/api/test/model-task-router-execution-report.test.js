const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildModelTaskRouterExecutionReport,
  renderModelTaskRouterExecutionMarkdown,
} = require('../dist/modules/analysis/helpers/model-task-router-execution.helper');

test('router execution report summarizes queued router metadata and suppression', () => {
  const priorityReport = {
    generatedAt: '2026-03-28T00:00:00.000Z',
    summary: {
      cleanupStateDistribution: {
        active: 1,
        freeze: 1,
        archive: 1,
        purge_ready: 0,
      },
    },
    items: [
      {
        fullName: 'acme/recalc',
        historicalRepairBucket: 'visible_broken',
        historicalRepairAction: 'decision_recalc',
        cleanupState: 'active',
        decisionRecalcGaps: ['user_conflict'],
        deepRepairGaps: [],
        evidenceRepairGaps: [],
        trustedBlockingGaps: ['user_conflict'],
        keyEvidenceGaps: ['user_conflict'],
        evidenceConflictCount: 1,
        evidenceCoverageRate: 0.4,
        repositoryValueTier: 'HIGH',
        moneyPriority: 'P0',
        fallbackFlag: false,
        conflictFlag: true,
        incompleteFlag: false,
        hasDeep: false,
        analysisQualityState: 'CRITICAL',
      },
      {
        fullName: 'acme/frozen-deep',
        historicalRepairBucket: 'archive_or_noise',
        historicalRepairAction: 'deep_repair',
        cleanupState: 'freeze',
        decisionRecalcGaps: [],
        deepRepairGaps: ['technical_maturity_missing', 'execution_missing'],
        evidenceRepairGaps: [],
        trustedBlockingGaps: ['technical_maturity_missing'],
        keyEvidenceGaps: ['technical_maturity_missing', 'execution_missing'],
        evidenceConflictCount: 0,
        evidenceCoverageRate: 0.1,
        repositoryValueTier: 'LOW',
        moneyPriority: 'P3',
        fallbackFlag: false,
        conflictFlag: false,
        incompleteFlag: true,
        hasDeep: false,
        analysisQualityState: 'LOW',
      },
    ],
  };

  const report = buildModelTaskRouterExecutionReport({
    priorityReport,
    queueSummary: {
      totalQueued: 2,
      actionCounts: {
        downgrade_only: 0,
        refresh_only: 0,
        evidence_repair: 0,
        deep_repair: 1,
        decision_recalc: 1,
      },
      routerCapabilityBreakdown: {
        LIGHT: 0,
        STANDARD: 0,
        HEAVY: 1,
        REVIEW: 1,
        DETERMINISTIC_ONLY: 0,
      },
      routerFallbackBreakdown: {
        NONE: 0,
        PROVIDER_FALLBACK: 0,
        DETERMINISTIC_ONLY: 0,
        LIGHT_DERIVATION: 0,
        RETRY_THEN_REVIEW: 2,
        RETRY_THEN_DOWNGRADE: 0,
        DOWNGRADE_ONLY: 0,
      },
      routerReviewRequiredCount: 1,
      routerDeterministicOnlyCount: 0,
      queuedWithRouterMetadataCount: 2,
      queuedSamples: [
        {
          repoId: 'repo-1',
          action: 'decision_recalc',
          capabilityTier: 'REVIEW',
          fallbackPolicy: 'RETRY_THEN_REVIEW',
          requiresReview: true,
          queueName: 'analysis.single',
        },
      ],
    },
    latestRun: {
      generatedAt: '2026-03-28T01:00:00.000Z',
    },
    healthReport: {
      generatedAt: '2026-03-28T02:00:00.000Z',
      autoRepair: {
        schedulerLane: 'historical_repair',
        execution: {
          deepRepair: 1,
          decisionRecalc: 1,
        },
      },
    },
  });

  assert.equal(report.summary.queuedWithRouterMetadataCount, 2);
  assert.equal(report.summary.routerReviewRequiredCount, 1);
  assert.equal(report.summary.frozenOrArchivedTaskSuppressedCount, 2);
  assert.ok(report.summary.reviewRequiredTasks.includes('decision_recalc'));
  assert.ok(report.summary.highCostSuppressedTasks.includes('deep_repair'));

  const markdown = renderModelTaskRouterExecutionMarkdown(report);
  assert.match(markdown, /GitDian Model Task Router Execution Report/);
  assert.match(markdown, /queuedWithRouterMetadataCount: 2/);
  assert.match(markdown, /schedulerLane: historical_repair/);
  assert.match(markdown, /decision_recalc/);
});
