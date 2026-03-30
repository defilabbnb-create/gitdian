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
const {
  buildEvidenceGapTaxonomyReport,
  renderEvidenceGapTaxonomyMarkdown,
} = require('../dist/scripts/health/evidence-gap-taxonomy-report');

let seq = 0;

function item(overrides = {}) {
  const inventoryItem = evaluateHistoricalInventoryItem({
    now: new Date('2026-03-27T00:00:00.000Z'),
    signal: {
      repoId: overrides.repoId || `repo-${++seq}`,
      fullName: overrides.fullName || 'acme/repo',
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
      evidenceSupportingDimensions: ['problem', 'user', 'monetization'],
      qualityReasonSummary: 'distribution 证据偏弱',
      conflictDrivenDecisionRecalc: false,
      ...overrides,
    },
  });
  const bucketed = evaluateHistoricalRepairBucket({ item: inventoryItem });
  return evaluateHistoricalRepairPriority({ item: bucketed });
}

test('taxonomy report summarizes top gaps and action drivers', () => {
  const report = buildEvidenceGapTaxonomyReport({
    priorityGeneratedAt: '2026-03-27T00:00:00.000Z',
    items: [
      item({
        fullName: 'acme/deep-gap',
        moneyPriority: 'P0',
        repositoryValueTier: 'HIGH',
        collectionTier: 'CORE',
        hasDeep: false,
        evidenceCoverageRate: 0.31,
        evidenceWeakCount: 1,
        keyEvidenceMissingCount: 2,
        evidenceMissingDimensions: ['technical_maturity', 'execution'],
        evidenceWeakDimensions: ['market'],
      }),
      item({
        fullName: 'acme/conflict-gap',
        isVisibleOnHome: true,
        evidenceConflictCount: 2,
        keyEvidenceConflictCount: 2,
        evidenceConflictDimensions: ['user', 'monetization'],
      }),
      item({
        fullName: 'acme/weak-gap',
        evidenceWeakCount: 2,
        keyEvidenceWeakCount: 2,
        evidenceWeakDimensions: ['distribution', 'market'],
      }),
    ],
    topN: 3,
  });

  assert.equal(report.summary.totalRepos, 3);
  assert.equal(report.summary.topDecisionRecalcGaps[0].gap, 'monetization_conflict');
  assert.equal(report.summary.topDeepRepairGaps[0].gap, 'execution_missing');

  const markdown = renderEvidenceGapTaxonomyMarkdown(report);
  assert.match(markdown, /Top Decision Recalc Gaps/);
  assert.match(markdown, /visible_broken/);
});
