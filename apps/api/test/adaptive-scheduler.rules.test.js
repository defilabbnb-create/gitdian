const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAdaptiveSchedulerDecision,
  buildAdaptiveSchedulerPriorityAdjustment,
} = require('../dist/modules/scheduler/adaptive-scheduler.rules');

function createHealth(overrides = {}) {
  return {
    generatedAt: '2026-03-25T00:00:00.000Z',
    totalRepos: 1000,
    deepDoneRepos: 20,
    fullyAnalyzedRepos: 20,
    incompleteRepos: 950,
    fallbackRepos: 100,
    severeConflictRepos: 10,
    finalDecisionButNoDeepCount: 800,
    deepQueuedButNotDoneCount: 100,
    claudeEligibleButNotReviewedCount: 50,
    fallbackButStillVisibleCount: 0,
    homepageTotal: 100,
    homepageUnsafe: 5,
    homepageIncomplete: 5,
    homepageFallback: 0,
    homepageConflict: 0,
    homepageNoDeepButStrong: 0,
    moneyPriorityHighButIncomplete: 10,
    badTemplateCount: 0,
    deepQueueSize: 100,
    snapshotQueueSize: 100,
    claudeQueueSize: 10,
    pendingCount: 10,
    runningCount: 2,
    failedCount: 0,
    stalledCount: 0,
    mostCommonIncompleteReason: 'NO_DEEP_ANALYSIS',
    ...overrides,
  };
}

test('scheduler enters homepage protect when homepage unsafe is high', () => {
  const decision = buildAdaptiveSchedulerDecision(
    createHealth({
      homepageUnsafe: 30,
      homepageIncomplete: 20,
    }),
  );

  assert.equal(decision.currentMode, 'HOMEPAGE_PROTECT');
  assert.ok(decision.homepageProtectedCount > 0);
});

test('scheduler enters deep recovery when deep coverage is very low', () => {
  const decision = buildAdaptiveSchedulerDecision(
    createHealth({
      deepDoneRepos: 10,
      finalDecisionButNoDeepCount: 1200,
      homepageUnsafe: 0,
      homepageIncomplete: 0,
      fallbackButStillVisibleCount: 0,
      severeConflictRepos: 0,
      claudeEligibleButNotReviewedCount: 0,
    }),
  );

  assert.equal(decision.currentMode, 'DEEP_RECOVERY');
  assert.ok(decision.deepRecoveryCount > 0);
});

test('scheduler enters fallback cleanup when visible fallback exists', () => {
  const decision = buildAdaptiveSchedulerDecision(
    createHealth({
      deepDoneRepos: 100,
      finalDecisionButNoDeepCount: 0,
      fallbackButStillVisibleCount: 8,
      homepageUnsafe: 0,
      homepageIncomplete: 0,
      severeConflictRepos: 0,
      claudeEligibleButNotReviewedCount: 0,
    }),
  );

  assert.equal(decision.currentMode, 'FALLBACK_CLEANUP');
  assert.ok(decision.fallbackRecoveredCount > 0);
});

test('scheduler enters claude catchup when claude backlog is high', () => {
  const decision = buildAdaptiveSchedulerDecision(
    createHealth({
      deepDoneRepos: 100,
      finalDecisionButNoDeepCount: 0,
      fallbackButStillVisibleCount: 0,
      homepageUnsafe: 0,
      homepageIncomplete: 0,
      severeConflictRepos: 80,
      claudeEligibleButNotReviewedCount: 1500,
    }),
  );

  assert.equal(decision.currentMode, 'CLAUDE_CATCHUP');
  assert.ok(decision.claudeCatchupCount > 0);
});

test('scheduler enters critical backpressure when queues explode', () => {
  const decision = buildAdaptiveSchedulerDecision(
    createHealth({
      deepDoneRepos: 100,
      finalDecisionButNoDeepCount: 0,
      fallbackButStillVisibleCount: 0,
      homepageUnsafe: 0,
      homepageIncomplete: 0,
      severeConflictRepos: 0,
      claudeEligibleButNotReviewedCount: 0,
      deepQueueSize: 3000,
      snapshotQueueSize: 7000,
    }),
  );

  assert.equal(decision.currentMode, 'CRITICAL_BACKPRESSURE');
  assert.ok(decision.suppressedRepoCount > 0);
});

test('scheduler priority adjustment suppresses long tail in critical backpressure', () => {
  const adjustment = buildAdaptiveSchedulerPriorityAdjustment({
    state: {
      version: 1,
      currentMode: 'CRITICAL_BACKPRESSURE',
      currentReasons: [],
      queueWeights: {
        snapshot: 0.5,
        deep: 1.6,
        claude: 0.6,
        recovery: 0.5,
        homepageCandidate: 1.8,
        highValueIncomplete: 2,
        fallbackRepair: 1.6,
        longTail: 0.2,
      },
      concurrencyTargets: {
        snapshot: 6,
        deep: 8,
        claude: 1,
        recovery: 2,
      },
      updatedAt: '2026-03-25T00:00:00.000Z',
      nextReviewAt: '2026-03-25T00:15:00.000Z',
      queueWeightChanges: [],
      priorityBoostedRepoCount: 0,
      suppressedRepoCount: 0,
      homepageProtectedCount: 0,
      fallbackRecoveredCount: 0,
      deepRecoveryCount: 0,
      claudeCatchupCount: 0,
      healthSnapshot: createHealth(),
    },
    context: {
      repoId: 'repo-1',
      moneyPriority: 'P2',
      hasConflict: false,
      needsRecheck: false,
      fallbackVisible: false,
      incomplete: true,
      deepReady: false,
      reviewReady: false,
      displayUnsafe: false,
      homepageCandidate: false,
      highExposureCandidate: false,
      activeProject: false,
    },
  });

  assert.equal(adjustment.suppressed, true);
  assert.ok(adjustment.boost < 0);
});
