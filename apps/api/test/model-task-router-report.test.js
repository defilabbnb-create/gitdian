const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildModelTaskRouterSummaryReport,
  renderModelTaskRouterSummaryMarkdown,
} = require('../dist/modules/analysis/helpers/model-task-router-summary.helper');

test('router summary report aggregates inventory, decision, and execution signals', () => {
  const report = buildModelTaskRouterSummaryReport({
    inventoryReport: {
      generatedAt: '2026-03-28T00:00:00.000Z',
      summary: {
        normalizedTaskTypeCount: 13,
        observedRawTaskSourceCount: 18,
        stillNotUnified: [
          {
            sourceKind: 'queueJobType',
            sourceValue: 'analysis.run_batch',
            coverage: 'ORCHESTRATION_ONLY',
            note: 'wrapper',
          },
        ],
      },
      tasks: [
        {
          normalizedTaskType: 'decision_recalc',
          preferredCapabilityTier: 'REVIEW',
        },
        {
          normalizedTaskType: 'downgrade_only',
          preferredCapabilityTier: 'DETERMINISTIC_ONLY',
        },
      ],
    },
    decisionReport: {
      generatedAt: '2026-03-28T01:00:00.000Z',
      summary: {
        capabilityTierBreakdown: {
          LIGHT: 2,
          STANDARD: 3,
          HEAVY: 4,
          REVIEW: 5,
          DETERMINISTIC_ONLY: 6,
        },
        deterministicOnlyCount: 6,
        reviewRequiredCount: 5,
        highCostWorthKeeping: ['deep_repair', 'decision_recalc'],
        reviewRequiredTasks: ['decision_recalc', 'deep_repair'],
        deterministicOnlyTasks: ['downgrade_only', 'cleanup_related'],
        taskTypeTierDistribution: [
          {
            normalizedTaskType: 'decision_recalc',
            capabilityTierBreakdown: {
              LIGHT: 0,
              STANDARD: 0,
              HEAVY: 0,
              REVIEW: 5,
              DETERMINISTIC_ONLY: 0,
            },
          },
          {
            normalizedTaskType: 'downgrade_only',
            capabilityTierBreakdown: {
              LIGHT: 0,
              STANDARD: 0,
              HEAVY: 0,
              REVIEW: 0,
              DETERMINISTIC_ONLY: 6,
            },
          },
          {
            normalizedTaskType: 'deep_repair',
            capabilityTierBreakdown: {
              LIGHT: 0,
              STANDARD: 0,
              HEAVY: 4,
              REVIEW: 1,
              DETERMINISTIC_ONLY: 0,
            },
          },
        ],
      },
    },
    executionReport: {
      generatedAt: '2026-03-28T02:00:00.000Z',
      source: {
        priorityGeneratedAt: '2026-03-28T01:30:00.000Z',
        latestRunGeneratedAt: '2026-03-28T01:40:00.000Z',
        healthGeneratedAt: '2026-03-28T01:50:00.000Z',
      },
      summary: {
        queuedWithRouterMetadataCount: 12,
        routerCapabilityBreakdown: {
          LIGHT: 0,
          STANDARD: 4,
          HEAVY: 3,
          REVIEW: 5,
          DETERMINISTIC_ONLY: 0,
        },
        routerFallbackBreakdown: {
          NONE: 0,
          PROVIDER_FALLBACK: 0,
          DETERMINISTIC_ONLY: 0,
          LIGHT_DERIVATION: 2,
          RETRY_THEN_REVIEW: 7,
          RETRY_THEN_DOWNGRADE: 3,
          DOWNGRADE_ONLY: 0,
        },
        routerReviewRequiredCount: 5,
        routerDeterministicOnlyCount: 0,
        frozenOrArchivedTaskSuppressedCount: 9,
        reviewRequiredTasks: ['decision_recalc'],
        deterministicOnlyTasks: ['downgrade_only'],
        highCostSuppressedTasks: ['downgrade_only'],
      },
      execution: {
        schedulerLane: 'historical_repair',
        latestExecutionCounters: {},
        queueActionBreakdown: {
          downgrade_only: 0,
          refresh_only: 1,
          evidence_repair: 3,
          deep_repair: 4,
          decision_recalc: 4,
        },
      },
      samples: {
        reviewRequired: [
          {
            fullName: 'acme/recalc',
            taskType: 'decision_recalc',
            capabilityTier: 'REVIEW',
            cleanupState: 'active',
            action: 'decision_recalc',
            reason: 'conflict review',
          },
        ],
        deterministicOnly: [
          {
            fullName: 'acme/drop',
            taskType: 'downgrade_only',
            capabilityTier: 'DETERMINISTIC_ONLY',
            cleanupState: 'freeze',
            action: 'downgrade_only',
            reason: 'cleanup freeze',
          },
        ],
        highCostSuppressed: [
          {
            fullName: 'acme/drop',
            taskType: 'downgrade_only',
            capabilityTier: 'DETERMINISTIC_ONLY',
            cleanupState: 'freeze',
            action: 'downgrade_only',
            reason: 'cleanup freeze',
          },
        ],
      },
    },
  });

  assert.equal(report.summary.normalizedTaskTypeCount, 13);
  assert.equal(report.summary.observedRawTaskSourceCount, 18);
  assert.equal(report.summary.stillNotUnifiedCount, 1);
  assert.equal(report.summary.requiresReviewCount, 5);
  assert.equal(report.summary.deterministicOnlyTaskCount, 6);
  assert.equal(report.summary.frozenOrArchivedTaskSuppressedCount, 9);
  assert.equal(report.execution.schedulerLane, 'historical_repair');
  assert.ok(
    report.taskOverview.topHighCostTasks.some(
      (item) => item.taskType === 'decision_recalc',
    ),
  );
  assert.ok(
    report.taskOverview.topDowngradedTasks.some(
      (item) => item.taskType === 'downgrade_only',
    ),
  );

  const markdown = renderModelTaskRouterSummaryMarkdown(report);
  assert.match(markdown, /GitDian Model Task Router Summary/);
  assert.match(markdown, /Capability Tier Distribution/);
  assert.match(markdown, /Fallback Policy Distribution/);
  assert.match(markdown, /analysis.run_batch/);
  assert.match(markdown, /historical_repair/);
  assert.match(markdown, /command: pnpm --filter api report:model-task-router/);
});
