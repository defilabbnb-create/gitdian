const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDailyHealthSnapshot,
  stripDailyHealthRawReports,
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
          items: [
            {
              incomplete: true,
              deepAnalysisStatus: 'NOT_STARTED',
              evidenceSupportingDimensions: ['monetization', 'problem'],
              evidenceCurrentAction: 'build',
              keyEvidenceMissingCount: 0,
            },
            {
              incomplete: true,
              deepAnalysisStatus: 'NOT_STARTED',
              evidenceSupportingDimensions: ['problem'],
              evidenceCurrentAction: 'validate',
              keyEvidenceMissingCount: 2,
            },
          ],
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
    historicalRepairReport: {
      generatedAt: '2026-03-25T00:00:00.000Z',
      summary: {
        visibleBrokenCount: 12,
        highValueWeakCount: 48,
        staleWatchCount: 90,
        archiveOrNoiseCount: 50,
        historicalTrustedButWeakCount: 14,
        immediateFrontendDowngradeCount: 12,
        evidenceCoverageRate: 0.41,
        keyEvidenceMissingCount: 27,
        evidenceConflictCount: 18,
        evidenceWeakButVisibleCount: 9,
        conflictDrivenDecisionRecalcCount: 7,
        actionBreakdown: {
          downgrade_only: 8,
          refresh_only: 10,
          evidence_repair: 20,
          deep_repair: 9,
          decision_recalc: 13,
          archive: 0,
        },
        visibleBrokenActionBreakdown: {
          downgrade_only: 4,
          refresh_only: 0,
          evidence_repair: 2,
          deep_repair: 3,
          decision_recalc: 3,
          archive: 0,
        },
        highValueWeakActionBreakdown: {
          downgrade_only: 1,
          refresh_only: 8,
          evidence_repair: 18,
          deep_repair: 6,
          decision_recalc: 10,
          archive: 0,
        },
      },
    },
    historicalRepairQueueSummary: {
      totalQueued: 17,
      actionCounts: {
        downgrade_only: 0,
        refresh_only: 4,
        evidence_repair: 6,
        deep_repair: 5,
        decision_recalc: 2,
      },
      routerCapabilityBreakdown: {
        LIGHT: 4,
        STANDARD: 6,
        HEAVY: 5,
        REVIEW: 2,
        DETERMINISTIC_ONLY: 0,
      },
      routerFallbackBreakdown: {
        NONE: 0,
        PROVIDER_FALLBACK: 0,
        DETERMINISTIC_ONLY: 4,
        LIGHT_DERIVATION: 6,
        RETRY_THEN_REVIEW: 2,
        RETRY_THEN_DOWNGRADE: 5,
        DOWNGRADE_ONLY: 0,
      },
      routerReviewRequiredCount: 2,
      routerDeterministicOnlyCount: 0,
      queuedWithRouterMetadataCount: 17,
      queuedSamples: [],
    },
  });

  assert.equal(snapshot.summary.repoSummary.totalRepos, 200);
  assert.equal(snapshot.globalSnapshot.totalRepos, 200);
  assert.equal(snapshot.globalSnapshot.deepCoverage, 0.1);
  assert.equal(snapshot.summary.qualitySummary.badTemplateCount, 7);
  assert.equal(snapshot.summary.homepageSummary.homepageNoDeepButStrong, 1);
  assert.equal(snapshot.recentSnapshot.newRepos, 200);
  assert.equal(snapshot.summary.behaviorSummary.completedActions, 1);
  assert.equal(snapshot.summary.behaviorSummary.preferenceSignalsCount, 4);
  assert.equal(snapshot.summary.historicalRepairSummary.visibleBrokenCount, 12);
  assert.equal(snapshot.summary.historicalRepairSummary.historicalRepairQueueCount, 17);
  assert.equal(snapshot.summary.historicalRepairSummary.evidenceConflictCount, 18);
  assert.equal(
    snapshot.summary.historicalRepairSummary.queueActionBreakdown.deep_repair,
    5,
  );
  assert.equal(
    snapshot.summary.historicalRepairSummary.routerCapabilityBreakdown.REVIEW,
    2,
  );
  assert.equal(
    snapshot.summary.historicalRepairSummary.routerFallbackBreakdown.LIGHT_DERIVATION,
    6,
  );
});

test('health collector strips raw reports before persistence payloads', () => {
  const stripped = stripDailyHealthRawReports({
    generatedAt: '2026-03-25T00:00:00.000Z',
    summary: {
      taskSummary: { pendingCount: 1 },
    },
    globalSnapshot: {
      totalRepos: 10,
      fullyAnalyzed: 2,
      incomplete: 8,
      deepCoverage: 0.2,
      finalDecisionButNoDeep: 3,
    },
    recentSnapshot: {
      newRepos: 1,
      recentTasks: 2,
      recentFailures: 0,
    },
    rawReport: {
      queueSummary: {
        deepQueue: {
          total: 999,
        },
      },
    },
    recentRawReport: {
      queueSummary: {
        deepQueue: {
          total: 888,
        },
      },
    },
  });

  assert.deepEqual(stripped, {
    generatedAt: '2026-03-25T00:00:00.000Z',
    summary: {
      taskSummary: { pendingCount: 1 },
    },
    globalSnapshot: {
      totalRepos: 10,
      fullyAnalyzed: 2,
      incomplete: 8,
      deepCoverage: 0.2,
      finalDecisionButNoDeep: 3,
    },
    recentSnapshot: {
      newRepos: 1,
      recentTasks: 2,
      recentFailures: 0,
    },
  });
});
