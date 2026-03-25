const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateDailyHealth,
} = require('../dist/scripts/health/health-evaluator');

test('health evaluator marks deep coverage and homepage pollution as critical', () => {
  const result = evaluateDailyHealth({
    generatedAt: '2026-03-25T00:00:00.000Z',
    summary: {
      taskSummary: {
        pendingCount: 10,
        runningCount: 2,
        completedCount: 100,
        failedCount: 1,
        stalledCount: 0,
        deferredCount: 0,
      },
      repoSummary: {
        totalRepos: 1000,
        snapshotDoneRepos: 900,
        insightDoneRepos: 850,
        displayReadyRepos: 800,
        trustedDisplayReadyRepos: 700,
        deepDoneRepos: 10,
        reviewDoneRepos: 5,
        fullyAnalyzedRepos: 10,
        incompleteRepos: 950,
        fallbackRepos: 20,
        severeConflictRepos: 5,
      },
      analysisGapSummary: {
        finalDecisionButNoDeepCount: 900,
        deepQueuedButNotDoneCount: 100,
        claudeEligibleButNotReviewedCount: 50,
        fallbackButStillVisibleCount: 3,
        mostCommonIncompleteReason: 'NO_DEEP_ANALYSIS',
      },
      homepageSummary: {
        homepageTotal: 100,
        homepageIncomplete: 30,
        homepageUnsafe: 25,
        homepageFallback: 2,
        homepageConflict: 1,
        homepageNoDeepButStrong: 2,
      },
      qualitySummary: {
        badTemplateCount: 6,
        englishLeakCount: 0,
        unclearUserCount: 0,
        conflictCount: 0,
        averageConfidence: 0.5,
        badOneLinerCount: 6,
      },
      displayQualitySummary: {
        noDeepButHasMonetization: 1,
        noDeepButHasStrongWhy: 1,
        fallbackButStrongHeadline: 0,
        conflictVisibleCount: 0,
      },
      queueSummary: {
        pendingCount: 10,
        runningCount: 2,
        completedCount: 100,
        failedCount: 1,
        stalledCount: 0,
        deferredCount: 0,
        snapshotQueueSize: 100,
        deepQueueSize: 2500,
        claudeQueueSize: 10,
      },
      exposureSummary: {
        homepageFeaturedRepos: 100,
        homepageFeaturedIncomplete: 30,
        dailySummaryTopRepos: 10,
        dailySummaryTopIncomplete: 5,
        telegramSentRepos: 10,
        telegramSentIncomplete: 5,
        moneyPriorityHighButIncomplete: 20,
      },
      behaviorSummary: {
        actionLoopEntries: 1,
        completedActions: 0,
        droppedActions: 0,
        preferenceSignalsCount: 0,
        homepageAdaptedCount: 0,
        successReasonCoverage: 0,
        failureReasonCoverage: 0,
        memoryHitRate: 0,
        recommendationAdjustedByBehaviorCount: 0,
        staleMemoryDecayCount: 0,
        explainVisibleRate: 0,
      },
    },
    rawReport: {},
  });

  assert.equal(result.status, 'CRITICAL');
  assert.ok(result.recommendations.some((item) => item.includes('补 deep')));
});
