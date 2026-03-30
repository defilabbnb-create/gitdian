const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEvidenceGapTaxonomy,
  formatEvidenceGapLabels,
} = require('../dist/modules/analysis/helpers/evidence-gap-taxonomy.helper');

test('maps evidence statuses into stable taxonomy categories', () => {
  const taxonomy = buildEvidenceGapTaxonomy({
    missingDimensions: ['problem', 'technical_maturity'],
    weakDimensions: ['distribution', 'market'],
    conflictDimensions: ['user', 'monetization'],
  });

  assert.deepEqual(taxonomy.conflictDrivenGaps, [
    'user_conflict',
    'monetization_conflict',
  ]);
  assert.deepEqual(taxonomy.missingDrivenGaps, [
    'problem_missing',
    'technical_maturity_missing',
  ]);
  assert.deepEqual(taxonomy.weakDrivenGaps, ['distribution_weak', 'market_weak']);
  assert.equal(taxonomy.keyEvidenceGapSeverity, 'CRITICAL');
});

test('deep repair and decision recalc gaps are split correctly', () => {
  const taxonomy = buildEvidenceGapTaxonomy({
    missingDimensions: ['technical_maturity', 'execution', 'market'],
    weakDimensions: ['distribution'],
    conflictDimensions: ['execution'],
  });

  assert.deepEqual(taxonomy.decisionRecalcGaps, ['execution_conflict']);
  assert.deepEqual(taxonomy.deepRepairGaps, [
    'technical_maturity_missing',
    'execution_missing',
    'market_missing',
  ]);
  assert.ok(taxonomy.evidenceRepairGaps.includes('distribution_weak'));
});

test('formats gaps into readable labels', () => {
  assert.equal(
    formatEvidenceGapLabels([
      'technical_maturity_missing',
      'monetization_conflict',
    ]),
    'technical_maturity缺失 / monetization冲突',
  );
});
