const test = require('node:test');
const assert = require('node:assert/strict');

const {
  renderLiveMarkdown,
} = require('../dist/scripts/health/generate-live-md');

test('live markdown renderer includes required closed-loop metrics', () => {
  const markdown = renderLiveMarkdown({
    generatedAt: '2026-03-26T00:00:00.000Z',
    status: 'CRITICAL',
    summary: {
      queueSummary: {
        pendingCount: 50,
        deepQueueSize: 20,
        snapshotQueueSize: 10,
        claudeQueueSize: 5,
      },
      homepageSummary: {
        homepageUnsafe: 40,
        homepageTotal: 100,
        homepageIncomplete: 60,
      },
      historicalRepairSummary: {
        visibleBrokenCount: 12,
        highValueWeakCount: 48,
        staleWatchCount: 90,
        archiveOrNoiseCount: 50,
        historicalTrustedButWeakCount: 14,
        immediateFrontendDowngradeCount: 12,
        historicalRepairQueueCount: 17,
        historicalRepairActionBreakdown: {
          downgrade_only: 4,
          refresh_only: 3,
          evidence_repair: 5,
          deep_repair: 2,
          decision_recalc: 3,
          archive: 0,
        },
      },
    },
    globalSnapshot: {
      totalRepos: 1000,
      fullyAnalyzed: 50,
      incomplete: 950,
      deepCoverage: 0.05,
      finalDecisionButNoDeep: 900,
    },
    recentSnapshot: {
      newRepos: 100,
      recentTasks: 300,
      recentFailures: 12,
    },
    recommendations: ['需要补 deep'],
  });

  assert.match(markdown, /totalRepos: 1000/);
  assert.match(markdown, /fullyAnalyzed: 50/);
  assert.match(markdown, /incomplete: 950/);
  assert.match(markdown, /deepCoverage: 5\.00%/);
  assert.match(markdown, /queueBacklog: 50/);
  assert.match(markdown, /homepageUnsafe: 40\/100/);
  assert.match(markdown, /visibleBroken: 12/);
  assert.match(markdown, /historicalRepairQueue: 17/);
});
