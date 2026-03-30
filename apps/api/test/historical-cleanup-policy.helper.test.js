const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateHistoricalInventoryItem,
} = require('../dist/modules/analysis/helpers/historical-data-inventory.helper');
const {
  evaluateHistoricalRepairBucket,
} = require('../dist/modules/analysis/helpers/historical-repair-bucketing.helper');
const {
  evaluateHistoricalRepairPriority,
} = require('../dist/modules/analysis/helpers/historical-repair-priority.helper');

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
    lastAnalyzedAt: '2026-03-20T00:00:00.000Z',
    isVisibleOnHome: false,
    isVisibleOnFavorites: false,
    appearedInDailySummary: false,
    appearedInTelegram: false,
    hasDetailPageExposure: false,
    isUserReachable: false,
    moneyPriority: 'P3',
    repositoryValueTier: 'LOW',
    collectionTier: 'LONG_TAIL',
    analysisStatus: 'DISPLAY_READY',
    displayStatus: 'BASIC_READY',
    homepageUnsafe: false,
    badOneLiner: false,
    ...overrides,
  };
}

function priorityItem(overrides = {}) {
  const inventory = evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: baseSignal(overrides),
  });
  const bucketed = evaluateHistoricalRepairBucket({ item: inventory });
  return evaluateHistoricalRepairPriority({ item: bucketed });
}

test('archive_or_noise with low visibility and low quality becomes freeze', () => {
  const item = priorityItem({
    hasSnapshot: false,
    hasInsight: false,
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_SNAPSHOT'],
  });

  assert.equal(item.historicalRepairBucket, 'archive_or_noise');
  assert.equal(item.cleanupState, 'freeze');
  assert.ok(item.cleanupReason.includes('low_value'));
  assert.ok(item.cleanupReason.includes('low_visibility'));
  assert.ok(item.cleanupReason.includes('long_tail_noise'));
});

test('very stale archive_or_noise repo with derived data becomes purge_ready', () => {
  const item = priorityItem({
    lastCollectedAt: '2025-08-01T00:00:00.000Z',
    lastAnalyzedAt: '2025-08-01T00:00:00.000Z',
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasDeep: true,
    incompleteFlag: false,
    fallbackFlag: false,
    conflictFlag: false,
  });

  assert.equal(item.historicalRepairBucket, 'archive_or_noise');
  assert.equal(item.cleanupState, 'purge_ready');
  assert.ok(item.cleanupPurgeTargets.includes('snapshot_outputs'));
  assert.ok(item.cleanupPurgeTargets.includes('decision_outputs'));
  assert.ok(item.cleanupPurgeTargets.includes('repair_logs'));
});

test('high value repo is not incorrectly frozen or archived', () => {
  const item = priorityItem({
    moneyPriority: 'P0',
    repositoryValueTier: 'HIGH',
    collectionTier: 'CORE',
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_DEEP_ANALYSIS'],
    hasDetailPageExposure: true,
    isUserReachable: true,
  });

  assert.equal(item.cleanupState, 'active');
  assert.equal(item.cleanupCandidate, false);
});

test('still-visible cleanup candidates are flagged explicitly', () => {
  const item = priorityItem({
    isVisibleOnHome: true,
    hasSnapshot: false,
    hasInsight: false,
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_SNAPSHOT'],
    homepageUnsafe: true,
  });

  assert.equal(item.cleanupState, 'freeze');
  assert.equal(item.cleanupStillVisible, true);
  assert.equal(item.cleanupBlocksTrusted, true);
});
