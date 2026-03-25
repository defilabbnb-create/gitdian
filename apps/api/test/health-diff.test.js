const test = require('node:test');
const assert = require('node:assert/strict');

const { diffDailyHealth } = require('../dist/scripts/health/health-diff');

function createSnapshot(overrides = {}) {
  return {
    generatedAt: '2026-03-25T00:00:00.000Z',
    summary: {
      repoSummary: {
        totalRepos: 100,
        deepDoneRepos: 10,
        fullyAnalyzedRepos: 9,
        incompleteRepos: 90,
        fallbackRepos: 12,
      },
      homepageSummary: {
        homepageUnsafe: 20,
      },
      qualitySummary: {
        badOneLinerCount: 5,
      },
      queueSummary: {
        deepQueueSize: 1000,
      },
    },
    ...overrides,
  };
}

test('health diff marks lower incomplete and fallback as improved', () => {
  const previous = createSnapshot();
  const current = createSnapshot({
    summary: {
      ...previous.summary,
      repoSummary: {
        ...previous.summary.repoSummary,
        deepDoneRepos: 20,
        fullyAnalyzedRepos: 18,
        incompleteRepos: 80,
        fallbackRepos: 5,
      },
      homepageSummary: {
        homepageUnsafe: 10,
      },
      qualitySummary: {
        badOneLinerCount: 1,
      },
      queueSummary: {
        deepQueueSize: 500,
      },
    },
  });

  const diff = diffDailyHealth(current, previous);

  assert.ok(diff);
  const incomplete = diff.entries.find((item) => item.key === 'incompleteRepos');
  const deepDone = diff.entries.find((item) => item.key === 'deepDoneRepos');
  assert.equal(incomplete.trend, 'improved');
  assert.equal(deepDone.trend, 'improved');
});
