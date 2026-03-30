const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateHistoricalInventoryItem,
  buildHistoricalInventoryReport,
  defaultHistoricalInventoryThresholds,
} = require('../dist/modules/analysis/helpers/historical-data-inventory.helper');

function baseSignal(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/repo',
    htmlUrl: 'https://github.com/acme/repo',
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasDeep: true,
    hasClaudeReview: true,
    fallbackFlag: false,
    conflictFlag: false,
    incompleteFlag: false,
    missingReasons: [],
    confidenceScore: 0.82,
    lastCollectedAt: '2026-03-25T00:00:00.000Z',
    lastAnalyzedAt: '2026-03-26T00:00:00.000Z',
    isVisibleOnHome: false,
    isVisibleOnFavorites: false,
    hasDetailPageExposure: true,
    isUserReachable: true,
    moneyPriority: 'P1',
    repositoryValueTier: 'HIGH',
    collectionTier: 'WATCH',
    analysisStatus: 'DEEP_DONE',
    displayStatus: 'HIGH_CONFIDENCE_READY',
    homepageUnsafe: false,
    badOneLiner: false,
    ...overrides,
  };
}

test('recognizes hasFinalDecision without deep as deep repair target', () => {
  const item = evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: baseSignal({
      hasDeep: false,
      incompleteFlag: true,
      missingReasons: ['NO_DEEP_ANALYSIS'],
      analysisStatus: 'DISPLAY_READY',
    }),
  });

  assert.equal(item.hasFinalDecision, true);
  assert.equal(item.hasDeep, false);
  assert.equal(item.needsDeepRepair, true);
  assert.equal(item.missingReasonCount, 1);
});

test('marks fallback, conflict, and incomplete repos for frontend downgrade', () => {
  const item = evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: baseSignal({
      fallbackFlag: true,
      conflictFlag: true,
      incompleteFlag: true,
      missingReasons: ['FALLBACK_ONLY', 'CONFLICT_HELD_BACK'],
      homepageUnsafe: true,
      isVisibleOnHome: true,
    }),
  });

  assert.equal(item.fallbackFlag, true);
  assert.equal(item.conflictFlag, true);
  assert.equal(item.incompleteFlag, true);
  assert.equal(item.needsFrontendDowngrade, true);
});

test('computes freshness days from collected and analyzed timestamps', () => {
  const item = evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: baseSignal({
      lastCollectedAt: '2026-03-22T10:00:00.000Z',
      lastAnalyzedAt: '2026-03-24T09:00:00.000Z',
    }),
  });

  assert.equal(item.freshnessDays, 4);
  assert.equal(item.evidenceFreshnessDays, 2);
});

test('key evidence gaps lower quality and preserve reason summary', () => {
  const item = evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: baseSignal({
      hasDeep: false,
      incompleteFlag: true,
      evidenceCoverageRate: 0.28,
      evidenceWeakCount: 2,
      evidenceConflictCount: 0,
      keyEvidenceMissingCount: 2,
      keyEvidenceWeakCount: 1,
      evidenceMissingDimensions: ['technical_maturity', 'execution'],
      evidenceWeakDimensions: ['market'],
      evidenceConflictDimensions: [],
      evidenceSupportingDimensions: ['problem', 'user'],
      qualityReasonSummary: '这段旧 summary 不该再主导质量评分',
    }),
  });

  assert.equal(item.analysisQualityState, 'CRITICAL');
  assert.equal(item.keyEvidenceMissingCount, 2);
  assert.equal(item.qualityScoreSchemaVersion, '2026-03-27.v2');
  assert.ok(item.qualityScoreBreakdown.missingPenalty > 0);
  assert.ok(item.qualityBlockingGaps.includes('execution_missing'));
  assert.ok(item.qualityBlockingGaps.includes('technical_maturity_missing'));
  assert.ok(item.qualityBlockingGaps.includes('market_weak'));
  assert.match(item.qualityReasonSummary, /execution缺失|technical_maturity缺失/);
  assert.doesNotMatch(item.qualityReasonSummary, /旧 summary/);
});

test('keeps exposure signals so home and favorites risk can be summarized', () => {
  const first = evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: baseSignal({
      repoId: 'repo-home',
      fullName: 'acme/home',
      htmlUrl: 'https://github.com/acme/home',
      isVisibleOnHome: true,
      isUserReachable: true,
      incompleteFlag: true,
      missingReasons: ['NO_DEEP_ANALYSIS'],
    }),
  });
  const second = evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: baseSignal({
      repoId: 'repo-favorite',
      fullName: 'acme/favorite',
      htmlUrl: 'https://github.com/acme/favorite',
      isVisibleOnFavorites: true,
      hasDetailPageExposure: true,
      isUserReachable: true,
      collectionTier: 'CORE',
      repositoryValueTier: 'MEDIUM',
    }),
  });

  const report = buildHistoricalInventoryReport({
    generatedAt: '2026-03-27T00:00:00.000Z',
    thresholds: defaultHistoricalInventoryThresholds(),
    items: [first, second],
  });

  assert.equal(report.summary.exposure.homeVisibleCount, 1);
  assert.equal(report.summary.exposure.favoritesVisibleCount, 1);
  assert.equal(report.summary.exposure.detailExposureCount, 2);
  assert.equal(report.summary.business.collectionTierCounts.CORE, 1);
});

test('critical quality items are counted separately in the report summary', () => {
  const critical = evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: baseSignal({
      repoId: 'repo-critical',
      fullName: 'acme/critical',
      htmlUrl: 'https://github.com/acme/critical',
      fallbackFlag: true,
      conflictFlag: true,
      keyEvidenceConflictCount: 2,
      evidenceConflictCount: 2,
      evidenceConflictDimensions: ['user', 'monetization'],
      evidenceSupportingDimensions: ['problem'],
      hasDeep: true,
    }),
  });

  const report = buildHistoricalInventoryReport({
    generatedAt: '2026-03-27T00:00:00.000Z',
    thresholds: defaultHistoricalInventoryThresholds(),
    items: [critical],
  });

  assert.equal(critical.analysisQualityState, 'CRITICAL');
  assert.equal(report.summary.quality.criticalQualityCount, 1);
  assert.equal(report.summary.quality.lowQualityCount, 1);
});
