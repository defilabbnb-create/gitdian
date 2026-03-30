const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateHistoricalInventoryItem,
} = require('../dist/modules/analysis/helpers/historical-data-inventory.helper');
const {
  evaluateHistoricalRepairBucket,
} = require('../dist/modules/analysis/helpers/historical-repair-bucketing.helper');

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
    lastCollectedAt: '2026-03-20T00:00:00.000Z',
    lastAnalyzedAt: '2026-03-24T00:00:00.000Z',
    isVisibleOnHome: false,
    isVisibleOnFavorites: false,
    appearedInDailySummary: false,
    appearedInTelegram: false,
    hasDetailPageExposure: true,
    isUserReachable: true,
    moneyPriority: 'P2',
    repositoryValueTier: 'MEDIUM',
    collectionTier: 'WATCH',
    analysisStatus: 'DEEP_DONE',
    displayStatus: 'HIGH_CONFIDENCE_READY',
    homepageUnsafe: false,
    badOneLiner: false,
    ...overrides,
  };
}

function inventoryItem(overrides = {}) {
  return evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: baseSignal(overrides),
  });
}

test('visible_broken outranks stale_watch for visible incomplete repo', () => {
  const item = inventoryItem({
    isVisibleOnHome: true,
    appearedInDailySummary: true,
    incompleteFlag: true,
    hasDeep: false,
    missingReasons: ['NO_DEEP_ANALYSIS'],
  });
  const bucketed = evaluateHistoricalRepairBucket({ item });

  assert.equal(bucketed.historicalRepairBucket, 'visible_broken');
  assert.equal(bucketed.historicalRepairPriorityLabel, 'P0_VISIBLE_BROKEN');
});

test('high value weak repo does not fall into archive_or_noise', () => {
  const item = inventoryItem({
    moneyPriority: 'P0',
    repositoryValueTier: 'HIGH',
    collectionTier: 'CORE',
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_DEEP_ANALYSIS'],
    confidenceScore: 0.2,
  });
  const bucketed = evaluateHistoricalRepairBucket({ item });

  assert.equal(bucketed.historicalRepairBucket, 'high_value_weak');
  assert.notEqual(bucketed.historicalRepairBucket, 'archive_or_noise');
});

test('archive_or_noise stays distinct from visible_broken', () => {
  const item = inventoryItem({
    hasDetailPageExposure: false,
    isUserReachable: false,
    repositoryValueTier: 'LOW',
    collectionTier: 'LONG_TAIL',
    moneyPriority: 'P3',
    hasSnapshot: false,
    hasInsight: false,
    hasDeep: false,
    confidenceScore: 0,
    incompleteFlag: true,
    missingReasons: ['NO_SNAPSHOT'],
  });
  const bucketed = evaluateHistoricalRepairBucket({ item });

  assert.equal(bucketed.historicalRepairBucket, 'archive_or_noise');
  assert.equal(bucketed.isStrictlyVisibleToUsers, false);
});

test('visible fallback conflict incomplete repo lands in visible_broken', () => {
  const item = inventoryItem({
    isVisibleOnFavorites: true,
    fallbackFlag: true,
    conflictFlag: true,
    incompleteFlag: true,
    missingReasons: ['FALLBACK_ONLY', 'CONFLICT_HELD_BACK'],
  });
  const bucketed = evaluateHistoricalRepairBucket({ item });

  assert.equal(bucketed.historicalRepairBucket, 'visible_broken');
  assert.equal(bucketed.frontendDowngradeSeverity, 'URGENT');
});

test('high exposure finalDecision without deep lands in visible_broken first', () => {
  const item = inventoryItem({
    isVisibleOnHome: true,
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_DEEP_ANALYSIS'],
  });
  const bucketed = evaluateHistoricalRepairBucket({ item });

  assert.equal(bucketed.historicalRepairBucket, 'visible_broken');
  assert.equal(bucketed.historicalRepairRecommendedAction, 'deep_repair');
});

test('high value weak quality repo lands in high_value_weak', () => {
  const item = inventoryItem({
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    collectionTier: 'CORE',
    confidenceScore: 0.1,
    hasSnapshot: false,
    hasInsight: false,
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_SNAPSHOT', 'NO_INSIGHT', 'NO_DEEP_ANALYSIS'],
    fallbackFlag: false,
    conflictFlag: false,
    hasDetailPageExposure: true,
    isUserReachable: true,
  });
  const bucketed = evaluateHistoricalRepairBucket({ item });

  assert.equal(bucketed.analysisQualityState, 'LOW');
  assert.equal(bucketed.historicalRepairBucket, 'high_value_weak');
});
