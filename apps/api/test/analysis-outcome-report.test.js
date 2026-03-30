const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAnalysisOutcomeReport,
  renderAnalysisOutcomeMarkdown,
} = require('../dist/scripts/health/analysis-outcome-report');

test('analysis outcome report renders schema, taxonomy, and write coverage', () => {
  const report = buildAnalysisOutcomeReport({
    seededFromDryRun: true,
    latestRun: {
      generatedAt: '2026-03-28T10:00:00.000Z',
    },
    snapshot: {
      schemaVersion: 'analysis_outcome_v1',
      generatedAt: '2026-03-28T09:00:00.000Z',
      source: 'historical_repair_loop',
      totalCount: 3,
      truncated: false,
      summary: {
        totalCount: 3,
        coveredActions: [
          'evidence_repair',
          'deep_repair',
          'decision_recalc',
          'downgrade_only',
          'skipped',
        ],
        outcomeStatusBreakdown: {
          success: 0,
          partial: 2,
          no_change: 0,
          failed: 0,
          downgraded: 1,
          skipped: 0,
        },
        repairValueClassBreakdown: {
          high: 0,
          medium: 2,
          low: 0,
          negative: 1,
        },
        executionCostClassBreakdown: {
          LOW: 0,
          MEDIUM: 1,
          HIGH: 2,
          NONE: 0,
        },
        actionBreakdown: {
          downgrade_only: 1,
          refresh_only: 0,
          evidence_repair: 1,
          deep_repair: 0,
          decision_recalc: 1,
          archive: 0,
          skipped: 1,
        },
        actionOutcomeStatusBreakdown: {
          downgrade_only: {
            success: 0,
            partial: 0,
            no_change: 0,
            failed: 0,
            downgraded: 1,
            skipped: 0,
          },
          refresh_only: {
            success: 0,
            partial: 0,
            no_change: 0,
            failed: 0,
            downgraded: 0,
            skipped: 0,
          },
          evidence_repair: {
            success: 0,
            partial: 1,
            no_change: 0,
            failed: 0,
            downgraded: 0,
            skipped: 0,
          },
          deep_repair: {
            success: 0,
            partial: 0,
            no_change: 0,
            failed: 0,
            downgraded: 0,
            skipped: 0,
          },
          decision_recalc: {
            success: 0,
            partial: 1,
            no_change: 0,
            failed: 0,
            downgraded: 0,
            skipped: 0,
          },
          archive: {
            success: 0,
            partial: 0,
            no_change: 0,
            failed: 0,
            downgraded: 0,
            skipped: 0,
          },
          skipped: {
            success: 0,
            partial: 0,
            no_change: 0,
            failed: 0,
            downgraded: 0,
            skipped: 1,
          },
        },
        actionRepairValueClassBreakdown: {
          downgrade_only: { high: 0, medium: 0, low: 0, negative: 1 },
          refresh_only: { high: 0, medium: 0, low: 0, negative: 0 },
          evidence_repair: { high: 0, medium: 1, low: 0, negative: 0 },
          deep_repair: { high: 0, medium: 0, low: 0, negative: 0 },
          decision_recalc: { high: 0, medium: 1, low: 0, negative: 0 },
          archive: { high: 0, medium: 0, low: 0, negative: 0 },
          skipped: { high: 0, medium: 0, low: 1, negative: 0 },
        },
        actionQualityDeltaSummary: {
          downgrade_only: { totalDelta: 0, averageDelta: 0, positiveCount: 0, negativeCount: 0, zeroCount: 1 },
          refresh_only: { totalDelta: 0, averageDelta: 0, positiveCount: 0, negativeCount: 0, zeroCount: 0 },
          evidence_repair: { totalDelta: 4, averageDelta: 4, positiveCount: 1, negativeCount: 0, zeroCount: 0 },
          deep_repair: { totalDelta: 0, averageDelta: 0, positiveCount: 0, negativeCount: 0, zeroCount: 0 },
          decision_recalc: { totalDelta: 3, averageDelta: 3, positiveCount: 1, negativeCount: 0, zeroCount: 0 },
          archive: { totalDelta: 0, averageDelta: 0, positiveCount: 0, negativeCount: 0, zeroCount: 0 },
          skipped: { totalDelta: 0, averageDelta: 0, positiveCount: 0, negativeCount: 0, zeroCount: 1 },
        },
        qualityDeltaSummary: {
          totalDelta: 7,
          averageDelta: 2.3333,
          positiveCount: 2,
          negativeCount: 0,
          zeroCount: 1,
          minDelta: 0,
          maxDelta: 4,
        },
        trustedChangedCount: 1,
        decisionChangedCount: 1,
        fallbackUsedCount: 1,
        reviewUsedCount: 1,
        skippedByCleanupCount: 1,
        routerCapabilityBreakdown: {
          STANDARD: 1,
          HEAVY: 1,
          REVIEW: 1,
        },
      },
      items: [
        {
          before: {
            repositoryId: 'repo-1',
            normalizedTaskType: 'decision_recalc',
            historicalRepairAction: 'decision_recalc',
          },
          execution: {
            outcomeStatus: 'partial',
            outcomeReason: 'queued_decision_recalc_execution',
          },
          delta: {
            repairValueClass: 'medium',
            qualityDelta: 3,
            gapCountDelta: -1,
            blockingGapDelta: -1,
            trustedChanged: false,
            decisionChanged: true,
          },
        },
      ],
    },
  });

  assert.equal(report.schema.schemaVersion, 'analysis_outcome_v1');
  assert.equal(report.summary.totalLogged, 3);
  assert.ok(report.writeEntryCoverage.supportedActions.includes('refresh_only'));
  assert.ok(report.writeEntryCoverage.coveredByLatestSnapshot.includes('skipped'));
  assert.equal(report.taxonomy.outcomeStatuses.length, 6);
  assert.equal(report.taxonomy.repairValueClasses.length, 4);
  assert.equal(report.summary.fallbackUsedCount, 1);
  assert.equal(report.summary.reviewUsedCount, 1);
  assert.equal(report.actionInsights.mostDecisionChangedActions[0].action, 'decision_recalc');
  assert.equal(report.actionInsights.lowestValueActions[0].action, 'downgrade_only');

  const markdown = renderAnalysisOutcomeMarkdown(report);
  assert.match(markdown, /GitDian Analysis Outcome Report/);
  assert.match(markdown, /Outcome Status Taxonomy/);
  assert.match(markdown, /Repair Value Class Rules/);
  assert.match(markdown, /Action Insights/);
  assert.match(markdown, /supportedActions:/);
  assert.match(markdown, /command: pnpm --filter api report:analysis-outcome/);
});
