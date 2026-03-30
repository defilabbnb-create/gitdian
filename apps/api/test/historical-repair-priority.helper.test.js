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
    evidenceCoverageRate: 0.72,
    evidenceWeakCount: 1,
    evidenceConflictCount: 0,
    keyEvidenceMissingCount: 0,
    keyEvidenceWeakCount: 1,
    keyEvidenceConflictCount: 0,
    evidenceMissingDimensions: [],
    evidenceWeakDimensions: ['distribution'],
    evidenceConflictDimensions: [],
    evidenceSupportingDimensions: ['problem', 'user', 'monetization', 'execution'],
    qualityReasonSummary: 'distribution 证据偏弱',
    conflictDrivenDecisionRecalc: false,
    ...overrides,
  };
}

function priorityItem(overrides = {}) {
  const inventoryItem = evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: baseSignal(overrides),
  });
  const bucketed = evaluateHistoricalRepairBucket({ item: inventoryItem });
  return evaluateHistoricalRepairPriority({ item: bucketed });
}

test('hasFinalDecision without deep and high exposure gets high repair priority', () => {
  const visibleBroken = priorityItem({
    isVisibleOnHome: true,
    appearedInDailySummary: true,
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_DEEP_ANALYSIS'],
  });
  const staleWatch = priorityItem({
    hasFinalDecision: false,
    hasDeep: false,
    lastCollectedAt: '2025-12-01T00:00:00.000Z',
    lastAnalyzedAt: '2025-12-01T00:00:00.000Z',
    displayStatus: 'BASIC_READY',
  });

  assert.equal(visibleBroken.historicalRepairBucket, 'visible_broken');
  assert.equal(visibleBroken.historicalRepairAction, 'deep_repair');
  assert.ok(
    visibleBroken.historicalRepairPriorityScore >
      staleWatch.historicalRepairPriorityScore,
  );
});

test('visible_broken actions are not forced into deep_repair only', () => {
  const decisionRecalc = priorityItem({
    isVisibleOnFavorites: true,
    fallbackFlag: true,
    conflictFlag: true,
    incompleteFlag: false,
    missingReasons: ['FALLBACK_ONLY', 'CONFLICT_HELD_BACK'],
  });
  const downgradeOnly = priorityItem({
    isVisibleOnHome: true,
    moneyPriority: 'P3',
    repositoryValueTier: 'LOW',
    homepageUnsafe: true,
    lastCollectedAt: '2026-03-24T00:00:00.000Z',
    lastAnalyzedAt: '2026-03-24T00:00:00.000Z',
    displayStatus: 'HIGH_CONFIDENCE_READY',
    evidenceWeakCount: 0,
    keyEvidenceWeakCount: 0,
    evidenceWeakDimensions: [],
    qualityReasonSummary: '前台不安全且 ROI 偏低',
  });

  assert.equal(decisionRecalc.historicalRepairBucket, 'visible_broken');
  assert.equal(decisionRecalc.historicalRepairAction, 'decision_recalc');
  assert.equal(downgradeOnly.historicalRepairBucket, 'visible_broken');
  assert.equal(downgradeOnly.historicalRepairAction, 'downgrade_only');
});

test('user and monetization evidence conflicts prefer decision_recalc', () => {
  const decisionRecalc = priorityItem({
    isVisibleOnHome: true,
    evidenceConflictCount: 2,
    keyEvidenceConflictCount: 2,
    evidenceConflictDimensions: ['user', 'monetization'],
    qualityReasonSummary: 'user / monetization 证据冲突',
  });

  assert.equal(decisionRecalc.historicalRepairAction, 'decision_recalc');
  assert.equal(decisionRecalc.conflictDrivenDecisionRecalc, true);
});

test('detail-only stale-watch conflicts no longer stay on repair backlog by default', () => {
  const item = priorityItem({
    isVisibleOnHome: false,
    isVisibleOnFavorites: false,
    appearedInDailySummary: false,
    appearedInTelegram: false,
    hasDetailPageExposure: true,
    displayStatus: 'BASIC_READY',
    moneyPriority: 'P2',
    repositoryValueTier: 'MEDIUM',
    collectionTier: 'WATCH',
    evidenceConflictCount: 2,
    keyEvidenceConflictCount: 2,
    evidenceConflictDimensions: ['user', 'monetization'],
    evidenceWeakCount: 2,
    keyEvidenceWeakCount: 2,
    evidenceWeakDimensions: ['distribution', 'market'],
    qualityReasonSummary: 'detail-only watchlist conflict should stay on cheaper repair path',
  });

  assert.equal(item.historicalRepairBucket, 'stale_watch');
  assert.equal(item.strictVisibilityLevel, 'DETAIL_ONLY');
  assert.equal(item.historicalRepairAction, 'downgrade_only');
});

test('detail-only stale-watch conflicts with missing gaps still prefer evidence repair', () => {
  const item = priorityItem({
    isVisibleOnHome: false,
    isVisibleOnFavorites: false,
    appearedInDailySummary: false,
    appearedInTelegram: false,
    hasDetailPageExposure: true,
    moneyPriority: 'P2',
    repositoryValueTier: 'MEDIUM',
    collectionTier: 'WATCH',
    evidenceConflictCount: 2,
    keyEvidenceConflictCount: 2,
    evidenceConflictDimensions: ['user', 'monetization'],
    keyEvidenceMissingCount: 1,
    evidenceMissingDimensions: ['market'],
    evidenceWeakCount: 1,
    keyEvidenceWeakCount: 1,
    evidenceWeakDimensions: ['distribution'],
    qualityReasonSummary: 'detail-only watch conflict with missing evidence still merits repair',
  });

  assert.equal(item.historicalRepairBucket, 'stale_watch');
  assert.equal(item.strictVisibilityLevel, 'DETAIL_ONLY');
  assert.equal(item.historicalRepairAction, 'evidence_repair');
});

test('detail-only stale-watch deep-missing final decisions prefer downgrade only', () => {
  const item = priorityItem({
    isVisibleOnHome: false,
    isVisibleOnFavorites: false,
    appearedInDailySummary: false,
    appearedInTelegram: false,
    hasDetailPageExposure: true,
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_DEEP_ANALYSIS'],
    displayStatus: 'UNSAFE',
    moneyPriority: 'P2',
    repositoryValueTier: 'MEDIUM',
    collectionTier: 'WATCH',
    keyEvidenceMissingCount: 4,
    evidenceMissingDimensions: [
      'distribution',
      'execution',
      'market',
      'technical_maturity',
    ],
    evidenceWeakCount: 0,
    keyEvidenceWeakCount: 0,
    evidenceWeakDimensions: [],
    qualityReasonSummary: 'detail-only watch final decision lacks deep coverage and should downgrade first',
  });

  assert.equal(item.historicalRepairBucket, 'stale_watch');
  assert.equal(item.strictVisibilityLevel, 'DETAIL_ONLY');
  assert.equal(item.hasFinalDecision, true);
  assert.equal(item.hasDeep, false);
  assert.equal(item.needsFrontendDowngrade, true);
  assert.equal(item.historicalRepairAction, 'downgrade_only');
});

test('high value weak repo prefers evidence or deep repair instead of archive', () => {
  const evidenceRepair = priorityItem({
    moneyPriority: 'P0',
    repositoryValueTier: 'HIGH',
    collectionTier: 'CORE',
    hasFinalDecision: false,
    hasSnapshot: false,
    hasInsight: false,
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_SNAPSHOT', 'NO_INSIGHT'],
    confidenceScore: 0.1,
    evidenceCoverageRate: 0.12,
    evidenceWeakCount: 0,
    keyEvidenceMissingCount: 2,
    evidenceMissingDimensions: ['execution', 'market'],
    evidenceWeakDimensions: [],
    qualityReasonSummary: '缺少 execution / market 证据',
  });
  const archive = priorityItem({
    moneyPriority: 'P3',
    repositoryValueTier: 'LOW',
    collectionTier: 'LONG_TAIL',
    hasSnapshot: false,
    hasInsight: false,
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_SNAPSHOT'],
    hasDetailPageExposure: false,
    isUserReachable: false,
  });

  assert.equal(evidenceRepair.historicalRepairBucket, 'high_value_weak');
  assert.ok(
    ['evidence_repair', 'deep_repair'].includes(
      evidenceRepair.historicalRepairAction,
    ),
  );
  assert.equal(archive.historicalRepairBucket, 'archive_or_noise');
  assert.equal(archive.cleanupState, 'freeze');
  assert.equal(archive.historicalRepairAction, 'downgrade_only');
  assert.ok(
    evidenceRepair.historicalRepairPriorityScore >
      archive.historicalRepairPriorityScore,
  );
});

test('high value repo with technical and execution gaps prefers deep repair', () => {
  const item = priorityItem({
    moneyPriority: 'P0',
    repositoryValueTier: 'HIGH',
    collectionTier: 'CORE',
    hasDeep: false,
    evidenceCoverageRate: 0.31,
    evidenceWeakCount: 1,
    keyEvidenceMissingCount: 2,
    evidenceMissingDimensions: ['technical_maturity', 'execution'],
    evidenceWeakDimensions: ['market'],
    qualityReasonSummary: '缺少 technical_maturity / execution 关键证据',
  });

  assert.equal(item.historicalRepairBucket, 'high_value_weak');
  assert.equal(item.historicalRepairAction, 'deep_repair');
});

test('weak-only evidence prefers evidence repair instead of deep repair', () => {
  const item = priorityItem({
    moneyPriority: 'P1',
    repositoryValueTier: 'HIGH',
    collectionTier: 'CORE',
    evidenceWeakCount: 3,
    keyEvidenceWeakCount: 2,
    evidenceWeakDimensions: ['distribution', 'market', 'problem'],
    evidenceMissingDimensions: [],
    evidenceConflictDimensions: [],
    qualityReasonSummary: 'distribution / market 证据偏弱',
  });

  assert.equal(item.historicalRepairBucket, 'high_value_weak');
  assert.equal(item.historicalRepairAction, 'evidence_repair');
});

test('detail-only basic-ready high-value weak-only evidence prefers refresh', () => {
  const item = priorityItem({
    hasDetailPageExposure: true,
    displayStatus: 'BASIC_READY',
    moneyPriority: 'P0',
    repositoryValueTier: 'HIGH',
    collectionTier: 'CORE',
    evidenceWeakCount: 2,
    keyEvidenceWeakCount: 2,
    evidenceWeakDimensions: ['distribution', 'market'],
    evidenceMissingDimensions: [],
    evidenceConflictDimensions: [],
    qualityReasonSummary: 'detail-only high-value weak evidence should stay on refresh path first',
  });

  assert.equal(item.historicalRepairBucket, 'high_value_weak');
  assert.equal(item.strictVisibilityLevel, 'DETAIL_ONLY');
  assert.equal(item.historicalRepairAction, 'refresh_only');
});

test('detail-only trusted-ready no-claude-review high-value weak state prefers refresh', () => {
  const item = priorityItem({
    hasDetailPageExposure: true,
    displayStatus: 'TRUSTED_READY',
    hasClaudeReview: false,
    incompleteFlag: true,
    missingReasons: ['NO_CLAUDE_REVIEW'],
    moneyPriority: 'P0',
    repositoryValueTier: 'HIGH',
    collectionTier: 'CORE',
    evidenceWeakCount: 0,
    keyEvidenceWeakCount: 0,
    evidenceWeakDimensions: [],
    evidenceMissingDimensions: [],
    evidenceConflictDimensions: [],
    qualityReasonSummary: '历史分析链路不稳定',
  });

  assert.equal(item.historicalRepairBucket, 'high_value_weak');
  assert.equal(item.strictVisibilityLevel, 'DETAIL_ONLY');
  assert.equal(item.historicalTrustedButWeak, true);
  assert.equal(item.historicalRepairAction, 'refresh_only');
});

test('detail-only unsafe no-claude-review pure market-conflict high-value weak state prefers refresh', () => {
  const item = priorityItem({
    hasDetailPageExposure: true,
    displayStatus: 'UNSAFE',
    hasClaudeReview: false,
    incompleteFlag: true,
    missingReasons: ['NO_CLAUDE_REVIEW'],
    moneyPriority: 'P0',
    repositoryValueTier: 'HIGH',
    collectionTier: 'CORE',
    evidenceConflictCount: 1,
    keyEvidenceConflictCount: 1,
    evidenceConflictDimensions: ['market'],
    evidenceWeakCount: 0,
    keyEvidenceWeakCount: 0,
    evidenceWeakDimensions: [],
    evidenceMissingDimensions: [],
    qualityReasonSummary: 'detail-only market conflict is pending review but should refresh first',
  });

  assert.equal(item.historicalRepairBucket, 'high_value_weak');
  assert.equal(item.strictVisibilityLevel, 'DETAIL_ONLY');
  assert.equal(item.historicalTrustedButWeak, true);
  assert.equal(item.historicalRepairAction, 'refresh_only');
});

test('detail-only unsafe no-claude-review market-conflict with extra weak gaps stays on evidence repair', () => {
  const item = priorityItem({
    hasDetailPageExposure: true,
    displayStatus: 'UNSAFE',
    hasClaudeReview: false,
    incompleteFlag: true,
    missingReasons: ['NO_CLAUDE_REVIEW'],
    moneyPriority: 'P0',
    repositoryValueTier: 'HIGH',
    collectionTier: 'CORE',
    evidenceConflictCount: 1,
    keyEvidenceConflictCount: 1,
    evidenceConflictDimensions: ['market'],
    evidenceWeakCount: 1,
    keyEvidenceWeakCount: 1,
    evidenceWeakDimensions: ['distribution'],
    evidenceMissingDimensions: [],
    qualityReasonSummary: 'market conflict plus weak evidence should keep evidence repair path',
  });

  assert.equal(item.historicalRepairBucket, 'high_value_weak');
  assert.equal(item.strictVisibilityLevel, 'DETAIL_ONLY');
  assert.equal(item.historicalRepairAction, 'evidence_repair');
});

test('stale-watch weak-only evidence prefers refresh over evidence repair', () => {
  const item = priorityItem({
    hasDetailPageExposure: true,
    displayStatus: 'BASIC_READY',
    moneyPriority: 'P2',
    repositoryValueTier: 'MEDIUM',
    collectionTier: 'WATCH',
    evidenceWeakCount: 2,
    keyEvidenceWeakCount: 2,
    evidenceWeakDimensions: ['distribution', 'market'],
    evidenceMissingDimensions: [],
    evidenceConflictDimensions: [],
    qualityReasonSummary: 'detail-only watch weak evidence should stay on refresh path',
  });

  assert.equal(item.historicalRepairBucket, 'stale_watch');
  assert.equal(item.historicalTrustedButWeak, false);
  assert.equal(item.historicalRepairAction, 'refresh_only');
});

test('historical trusted but weak gets downgraded from trusted flow', () => {
  const item = priorityItem({
    isVisibleOnFavorites: true,
    displayStatus: 'TRUSTED_READY',
    lastCollectedAt: '2025-12-01T00:00:00.000Z',
    lastAnalyzedAt: '2025-12-01T00:00:00.000Z',
    evidenceWeakCount: 2,
    keyEvidenceMissingCount: 1,
    evidenceMissingDimensions: ['market'],
    qualityReasonSummary: '缺少 market 关键证据',
  });

  assert.equal(item.trustedFlowEligible, true);
  assert.equal(item.historicalTrustedButWeak, true);
  assert.equal(item.frontendDecisionState, 'degraded');
  assert.equal(item.needsImmediateFrontendDowngrade, true);
});

test('fallback, incomplete, and noDeep drive provisional or degraded frontend states', () => {
  const fallbackItem = priorityItem({
    isVisibleOnFavorites: true,
    fallbackFlag: true,
    conflictFlag: false,
    incompleteFlag: true,
    missingReasons: ['FALLBACK_ONLY'],
  });
  const noDeepItem = priorityItem({
    isVisibleOnHome: true,
    hasDeep: false,
    incompleteFlag: true,
    missingReasons: ['NO_DEEP_ANALYSIS'],
  });

  assert.equal(fallbackItem.frontendDecisionState, 'degraded');
  assert.equal(fallbackItem.needsImmediateFrontendDowngrade, true);
  assert.ok(
    ['provisional', 'degraded'].includes(noDeepItem.frontendDecisionState),
  );
  assert.notEqual(noDeepItem.frontendDecisionState, 'trusted');
  assert.equal(noDeepItem.needsImmediateFrontendDowngrade, true);
});
