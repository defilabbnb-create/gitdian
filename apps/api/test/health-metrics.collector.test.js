const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDailyHealthSnapshot,
} = require('../dist/scripts/health/health-metrics.collector');

test('health collector builds summary from report and behavior state', () => {
  const snapshot = buildDailyHealthSnapshot({
    report: {
      generatedAt: '2026-03-25T00:00:00.000Z',
      taskSummary: {
        pendingCount: 10,
        runningCount: 2,
        completedCount: 100,
        failedCount: 3,
        stalledCount: 1,
        deferredCount: 5,
      },
      repoSummary: {
        totalRepos: 200,
        snapshotDoneRepos: 180,
        insightDoneRepos: 170,
        displayReadyRepos: 150,
        trustedDisplayReadyRepos: 140,
        deepDoneRepos: 20,
        reviewDoneRepos: 5,
        fullyAnalyzedRepos: 18,
        incompleteRepos: 182,
        fallbackRepos: 11,
        severeConflictRepos: 2,
      },
      analysisGapSummary: {
        finalDecisionButNoDeepCount: 150,
        deepQueuedButNotDoneCount: 30,
        claudeEligibleButNotReviewedCount: 12,
        fallbackButStillVisibleCount: 4,
        mostCommonIncompleteReason: 'NO_DEEP_ANALYSIS',
      },
      qualitySummary: {
        templatePhraseCount: 7,
        englishLeakCount: 0,
        unclearUserCount: 3,
        headlineConflictCount: 2,
        averageConfidence: 0.7,
        badOneLinerCount: 8,
      },
      displayQualitySummary: {
        noDeepButHasMonetization: 3,
        noDeepButHasStrongWhy: 2,
        fallbackButStrongHeadline: 1,
        conflictVisibleCount: 2,
      },
      queueSummary: {
        snapshotQueue: { total: 50 },
        deepQueue: { total: 20 },
        claudeQueue: { queueSize: 4 },
      },
      exposureSummary: {
        homepageFeaturedRepos: 100,
        homepageFeaturedIncomplete: 10,
        dailySummaryTopRepos: 20,
        dailySummaryTopIncomplete: 4,
        telegramSentRepos: 10,
        telegramSentIncomplete: 2,
        moneyPriorityHighButIncomplete: 6,
      },
      samples: {
        homepageTop100Audit: {
          total: 100,
          incomplete: 10,
          unsafe: 5,
          fallback: 1,
          severeConflict: 1,
        },
      },
    },
    behaviorState: {
      recentActionOutcomes: [
        { outcome: 'SUCCESS' },
        { outcome: 'DROPPED' },
      ],
      profile: {
        preferredCategories: ['devtool'],
        avoidedCategories: ['infra'],
        successPatterns: ['FAST_TO_BUILD'],
        failurePatterns: ['TOO_INFRA_HEAVY'],
      },
      runtimeStats: {
        recommendationAdjustedByBehaviorCount: 3,
      },
      metrics: {
        successReasonCoverage: 0.5,
        failureReasonCoverage: 0.5,
        memoryHitRate: 0.4,
        recommendationAdjustedByBehaviorCount: 3,
        staleMemoryDecayCount: 1,
        explainVisibleRate: 0.6,
      },
    },
  });

  assert.equal(snapshot.summary.repoSummary.totalRepos, 200);
  assert.equal(snapshot.summary.qualitySummary.badTemplateCount, 7);
  assert.equal(snapshot.summary.behaviorSummary.completedActions, 1);
  assert.equal(snapshot.summary.behaviorSummary.preferenceSignalsCount, 4);
});
