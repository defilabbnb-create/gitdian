const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRepositoryCleanupReport,
  renderRepositoryCleanupMarkdown,
} = require('../dist/scripts/health/repository-cleanup-report');

function makeItem(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/repo',
    historicalRepairBucket: 'archive_or_noise',
    historicalRepairAction: 'downgrade_only',
    historicalRepairPriorityScore: 40,
    strictVisibilityLevel: 'BACKGROUND',
    repositoryValueTier: 'LOW',
    moneyPriority: 'P3',
    analysisQualityScore: 24,
    analysisQualityState: 'CRITICAL',
    cleanupState: 'freeze',
    cleanupReason: ['low_value', 'low_visibility', 'low_quality'],
    cleanupPurgeTargets: [],
    cleanupStillVisible: false,
    ...overrides,
  };
}

test('repository cleanup report summarizes cleanup states and reasons', () => {
  const priorityReport = {
    generatedAt: '2026-03-27T00:00:00.000Z',
    summary: {
      cleanupStateDistribution: {
        active: 1,
        freeze: 2,
        archive: 1,
        purge_ready: 1,
      },
      cleanupReasonBreakdown: {
        low_value: 3,
        low_visibility: 3,
        low_quality: 4,
        long_tail_noise: 2,
        stale_inactive: 2,
        no_repair_roi: 2,
        archive_bucket: 2,
        trusted_ineligible: 1,
        repeated_low_signal: 1,
      },
      purgeReadyTargetBreakdown: {
        snapshot_outputs: 1,
        insight_outputs: 1,
        decision_outputs: 1,
        deep_outputs: 1,
        repair_logs: 1,
      },
      freezeCandidateCount: 2,
      archiveCandidateCount: 1,
      purgeReadyCount: 1,
      frozenReposStillVisibleCount: 1,
      archivedReposStillScheduledCount: 0,
    },
    items: [
      makeItem({
        cleanupState: 'freeze',
        strictVisibilityLevel: 'HOME',
        cleanupStillVisible: true,
      }),
      makeItem({
        repoId: 'repo-2',
        fullName: 'acme/archive',
        cleanupState: 'archive',
        historicalRepairAction: 'archive',
        cleanupReason: ['archive_bucket', 'stale_inactive', 'repeated_low_signal'],
      }),
      makeItem({
        repoId: 'repo-3',
        fullName: 'acme/purge',
        cleanupState: 'purge_ready',
        historicalRepairAction: 'archive',
        cleanupReason: ['archive_bucket', 'stale_inactive', 'repeated_low_signal'],
        cleanupPurgeTargets: [
          'snapshot_outputs',
          'insight_outputs',
          'decision_outputs',
          'deep_outputs',
          'repair_logs',
        ],
      }),
    ],
  };

  const report = buildRepositoryCleanupReport({
    priorityReport,
    topN: 3,
  });
  const markdown = renderRepositoryCleanupMarkdown(report);

  assert.equal(report.freezeCandidateCount, 2);
  assert.equal(report.archiveCandidateCount, 1);
  assert.equal(report.purgeReadyCount, 1);
  assert.equal(report.samples.freeze.length, 1);
  assert.equal(report.samples.archive.length, 1);
  assert.equal(report.samples.purgeReady.length, 1);
  assert.match(markdown, /## Cleanup State/);
  assert.match(markdown, /freeze: 2/);
  assert.match(markdown, /purge_ready: 1/);
  assert.match(markdown, /## Top Reasons/);
});
