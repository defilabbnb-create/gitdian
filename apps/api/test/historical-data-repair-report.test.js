const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildHistoricalDataRepairReport,
  renderHistoricalDataRepairMarkdown,
} = require('../dist/scripts/health/historical-data-repair-report');

function makeItem(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/repo',
    htmlUrl: 'https://github.com/acme/repo',
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasDeep: false,
    analysisQualityScore: 50,
    analysisQualityState: 'LOW',
    evidenceCoverageRate: 0.5,
    evidenceWeakCount: 2,
    evidenceConflictCount: 0,
    keyEvidenceMissingCount: 1,
    keyEvidenceWeakCount: 1,
    keyEvidenceConflictCount: 0,
    evidenceMissingDimensions: ['execution'],
    evidenceWeakDimensions: ['market', 'distribution'],
    evidenceConflictDimensions: [],
    evidenceSupportingDimensions: ['problem', 'user', 'monetization'],
    qualityReasonSummary: '缺少 execution 关键证据',
    missingReasonCount: 1,
    missingReasons: ['NO_DEEP_ANALYSIS'],
    fallbackFlag: false,
    conflictFlag: false,
    incompleteFlag: true,
    lastCollectedAt: '2026-03-24T00:00:00.000Z',
    lastAnalyzedAt: '2026-03-24T00:00:00.000Z',
    freshnessDays: 3,
    evidenceFreshnessDays: 3,
    isVisibleOnHome: true,
    isVisibleOnFavorites: false,
    appearedInDailySummary: false,
    appearedInTelegram: false,
    hasDetailPageExposure: true,
    isUserReachable: true,
    moneyPriority: 'P0',
    repositoryValueTier: 'HIGH',
    collectionTier: 'CORE',
    needsDeepRepair: true,
    needsEvidenceRepair: true,
    needsFreshnessRefresh: false,
    needsDecisionRecalc: false,
    needsFrontendDowngrade: true,
    analysisStatus: 'SNAPSHOT_ONLY',
    displayStatus: 'HIGH_CONFIDENCE_READY',
    homepageUnsafe: true,
    strictVisibilityLevel: 'HOME',
    isStrictlyVisibleToUsers: true,
    isDetailOnlyExposure: false,
    frontendDowngradeSeverity: 'URGENT',
    historicalRepairBucket: 'visible_broken',
    historicalRepairReason: '真实前台可见（HOME）：fake_completion_no_deep；需立刻前台保守降级',
    historicalRepairPriorityLabel: 'P0_VISIBLE_BROKEN',
    historicalRepairRecommendedAction: 'deep_repair',
    historicalRepairSignals: ['fake_completion_no_deep'],
    historicalRepairPriorityScore: 240,
    historicalRepairAction: 'deep_repair',
    trustedFlowEligible: true,
    historicalTrustedButWeak: true,
    frontendDecisionState: 'provisional',
    needsImmediateFrontendDowngrade: true,
    conflictDrivenDecisionRecalc: false,
    ...overrides,
  };
}

test('historical data repair report aggregates bucket, action, and execution summary', () => {
  const priorityReport = {
    generatedAt: '2026-03-27T10:42:51.199Z',
    bucketingGeneratedAt: '2026-03-27T10:41:00.000Z',
    thresholds: {},
    summary: {
      totalRepos: 4,
      visibleBrokenCount: 1,
      highValueWeakCount: 2,
      staleWatchCount: 1,
      archiveOrNoiseCount: 0,
      historicalTrustedButWeakCount: 2,
      immediateFrontendDowngradeCount: 2,
      evidenceCoverageRate: 0.43,
      keyEvidenceMissingCount: 3,
      evidenceConflictCount: 1,
      evidenceWeakButVisibleCount: 1,
      conflictDrivenDecisionRecalcCount: 1,
      actionBreakdown: {
        downgrade_only: 0,
        refresh_only: 1,
        evidence_repair: 1,
        deep_repair: 1,
        decision_recalc: 1,
        archive: 0,
      },
      visibleBrokenActionBreakdown: {
        downgrade_only: 0,
        refresh_only: 0,
        evidence_repair: 0,
        deep_repair: 1,
        decision_recalc: 0,
        archive: 0,
      },
      highValueWeakActionBreakdown: {
        downgrade_only: 0,
        refresh_only: 0,
        evidence_repair: 1,
        deep_repair: 0,
        decision_recalc: 1,
        archive: 0,
      },
    },
    samples: {},
    items: [
      makeItem(),
      makeItem({
        repoId: 'repo-2',
        fullName: 'acme/recalc',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'decision_recalc',
        historicalRepairRecommendedAction: 'decision_recalc',
        historicalRepairSignals: ['high_value_decision_unstable'],
        isVisibleOnHome: false,
        strictVisibilityLevel: 'DETAIL_ONLY',
        isStrictlyVisibleToUsers: false,
        frontendDecisionState: 'degraded',
        conflictDrivenDecisionRecalc: true,
      }),
      makeItem({
        repoId: 'repo-3',
        fullName: 'acme/evidence',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'evidence_repair',
        historicalRepairRecommendedAction: 'evidence_repair',
        historicalRepairSignals: ['high_value_weak_evidence'],
        isVisibleOnHome: false,
        strictVisibilityLevel: 'DETAIL_ONLY',
        isStrictlyVisibleToUsers: false,
        historicalTrustedButWeak: false,
        needsImmediateFrontendDowngrade: false,
      }),
      makeItem({
        repoId: 'repo-4',
        fullName: 'acme/stale',
        historicalRepairBucket: 'stale_watch',
        historicalRepairAction: 'refresh_only',
        historicalRepairRecommendedAction: 'refresh_only',
        historicalRepairSignals: ['watch_stale'],
        moneyPriority: 'P2',
        repositoryValueTier: 'MEDIUM',
        collectionTier: 'WATCH',
        isVisibleOnHome: false,
        strictVisibilityLevel: 'BACKGROUND',
        isStrictlyVisibleToUsers: false,
        needsFrontendDowngrade: false,
        historicalTrustedButWeak: false,
        needsImmediateFrontendDowngrade: false,
      }),
    ],
  };
  const queueSummary = {
    totalQueued: 3,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 1,
      deep_repair: 1,
      decision_recalc: 1,
    },
  };
  const healthReport = {
    generatedAt: '2026-03-27T10:43:56.149Z',
    summary: {
      historicalRepairSummary: {
        historicalRepairQueueCount: 3,
        queueActionBreakdown: {
          downgrade_only: 0,
          refresh_only: 0,
          evidence_repair: 1,
          deep_repair: 1,
          decision_recalc: 1,
          archive: 0,
        },
      },
    },
    autoRepair: {
      schedulerLane: 'historical_repair',
      lanePolicy: {
        limits: {
          visibleBrokenLimit: 1,
          highValueWeakLimit: 2,
        },
      },
      execution: {
        downgradeOnly: 0,
        refreshOnly: 0,
        evidenceRepair: 1,
        deepRepair: 1,
        decisionRecalc: 1,
        archive: 0,
      },
    },
  };

  const report = buildHistoricalDataRepairReport({
    priorityReport,
    queueSummary,
    healthReport,
    latestRun: {
      generatedAt: '2026-03-27T10:43:53.239Z',
    },
    topN: 3,
  });
  const markdown = renderHistoricalDataRepairMarkdown(report);

  assert.equal(report.bucketCounts.visible_broken, 1);
  assert.equal(report.bucketCounts.high_value_weak, 2);
  assert.equal(report.executionSummary.schedulerLane, 'historical_repair');
  assert.equal(report.executionSummary.historicalRepairQueueCount, 3);
  assert.equal(report.historicalTrustedButWeak.count, 2);
  assert.equal(report.evidenceSummary.conflictDrivenDecisionRecalcCount, 1);
  assert.match(markdown, /## 4 个 repair bucket/);
  assert.match(markdown, /## evidence 摘要/);
  assert.match(markdown, /visible_broken: 1/);
  assert.match(markdown, /high_value_weak: 2/);
  assert.match(markdown, /scheduler lane: historical_repair/);
  assert.match(markdown, /action breakdown 是全库修复建议分布/);
});
