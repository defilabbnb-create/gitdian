const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  shouldWriteBaseline,
} = require('../dist/scripts/health/decision-recalc-gate-report');

test('decision-recalc-gate report does not persist baseline by default', () => {
  const options = parseArgs([]);
  assert.equal(shouldWriteBaseline(options), false);
});

test('decision-recalc-gate report persists baseline when --write is passed', () => {
  const options = parseArgs(['--write']);
  assert.equal(options.writeBaseline, true);
  assert.equal(shouldWriteBaseline(options), true);
});

test('decision-recalc-gate report respects --no-write even when --write defaults to true', () => {
  const options = parseArgs(['--no-write']);
  assert.equal(options.writeBaseline, false);
  assert.equal(shouldWriteBaseline(options), false);
});
