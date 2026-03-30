const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEvidenceDrivenReplacementReport,
  renderEvidenceDrivenReplacementMarkdown,
} = require('../dist/scripts/health/evidence-driven-replacement-report');

function makeItem(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/repo',
    htmlUrl: 'https://github.com/acme/repo',
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasDeep: false,
    analysisQualityScore: 48,
    analysisQualityState: 'LOW',
    evidenceCoverageRate: 0.34,
    evidenceWeakCount: 1,
    evidenceConflictCount: 0,
    keyEvidenceMissingCount: 2,
    keyEvidenceWeakCount: 1,
    keyEvidenceConflictCount: 0,
    evidenceMissingDimensions: ['technical_maturity', 'execution'],
    evidenceWeakDimensions: ['market'],
    evidenceConflictDimensions: [],
    evidenceSupportingDimensions: ['problem', 'user', 'monetization'],
    qualityReasonSummary: '缺少 technical_maturity / execution 关键证据',
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
    analysisStatus: 'DISPLAY_READY',
    displayStatus: 'BASIC_READY',
    homepageUnsafe: true,
    strictVisibilityLevel: 'HOME',
    isStrictlyVisibleToUsers: true,
    isDetailOnlyExposure: false,
    frontendDowngradeSeverity: 'URGENT',
    historicalRepairBucket: 'visible_broken',
    historicalRepairReason: '前台可见且缺少关键 deep 证据',
    historicalRepairPriorityLabel: 'P0_VISIBLE_BROKEN',
    historicalRepairRecommendedAction: 'deep_repair',
    historicalRepairSignals: ['fake_completion_no_deep'],
    historicalRepairPriorityScore: 220,
    historicalRepairAction: 'deep_repair',
    trustedFlowEligible: true,
    historicalTrustedButWeak: true,
    frontendDecisionState: 'provisional',
    needsImmediateFrontendDowngrade: true,
    conflictDrivenDecisionRecalc: false,
    ...overrides,
  };
}

test('replacement report tracks replaced branches and evidence-driven outcomes', () => {
  const report = buildEvidenceDrivenReplacementReport({
    priorityReport: {
      generatedAt: '2026-03-27T12:00:00.000Z',
      bucketingGeneratedAt: '2026-03-27T11:55:00.000Z',
      thresholds: {},
      summary: {
        totalRepos: 4,
        visibleBrokenCount: 1,
        highValueWeakCount: 2,
        staleWatchCount: 1,
        archiveOrNoiseCount: 0,
        historicalTrustedButWeakCount: 3,
        immediateFrontendDowngradeCount: 3,
        evidenceCoverageRate: 0.3,
        keyEvidenceMissingCount: 3,
        evidenceConflictCount: 1,
        evidenceWeakButVisibleCount: 1,
        conflictDrivenDecisionRecalcCount: 1,
        actionBreakdown: {
          downgrade_only: 1,
          refresh_only: 0,
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
          downgrade_only: 1,
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
          fullName: 'acme/conflict',
          historicalRepairAction: 'decision_recalc',
          keyEvidenceConflictCount: 2,
          evidenceConflictCount: 2,
          evidenceConflictDimensions: ['user', 'monetization'],
          conflictDrivenDecisionRecalc: true,
          frontendDecisionState: 'degraded',
          qualityReasonSummary: 'user / monetization 证据冲突',
        }),
        makeItem({
          repoId: 'repo-3',
          fullName: 'acme/weak',
          historicalRepairAction: 'evidence_repair',
          keyEvidenceMissingCount: 0,
          evidenceWeakCount: 3,
          evidenceMissingDimensions: [],
          evidenceWeakDimensions: ['distribution', 'market', 'execution'],
          qualityReasonSummary: 'distribution / market / execution 证据偏弱',
        }),
        makeItem({
          repoId: 'repo-4',
          fullName: 'acme/unsafe',
          historicalRepairAction: 'downgrade_only',
          repositoryValueTier: 'LOW',
          moneyPriority: 'P3',
          keyEvidenceMissingCount: 1,
          evidenceMissingDimensions: ['user'],
          qualityReasonSummary: '低 ROI 且 user 关键证据缺失',
        }),
      ],
    },
  });
  const markdown = renderEvidenceDrivenReplacementMarkdown(report);

  assert.ok(report.summary.criticalImportantCount >= 6);
  assert.ok(report.summary.replacedCriticalImportantCount >= 5);
  assert.equal(report.summary.remainingCriticalImportantCount, 1);
  assert.equal(report.repairSummary.evidenceDrivenRepairActionBreakdown.deep_repair, 1);
  assert.equal(
    report.repairSummary.decisionRecalcEvidenceConflictDrivenCount,
    1,
  );
  assert.ok(report.downgradeSummary.downgradedByKeyEvidenceMissingCount >= 2);
  assert.match(markdown, /Evidence-driven Replacement Report/);
  assert.match(markdown, /replacedCriticalImportantCount/);
  assert.match(markdown, /repository-decision\.service/);
});
