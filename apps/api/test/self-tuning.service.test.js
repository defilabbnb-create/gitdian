const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSelfTuningPolicy,
  computeEffectiveStrength,
  computeSystemLoadLevel,
} = require('../dist/modules/analysis/self-tuning.service');

test('computes NORMAL, HIGH_LOAD, and EXTREME system load levels', () => {
  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 320,
      ideaExtractTimeoutRate: 0.01,
    }),
    'NORMAL',
  );

  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 900,
      ideaExtractTimeoutRate: 0.01,
    }),
    'HIGH_LOAD',
  );

  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 600,
      ideaExtractTimeoutRate: 0.08,
    }),
    'HIGH_LOAD',
  );

  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 1600,
      ideaExtractTimeoutRate: 0.01,
    }),
    'EXTREME',
  );

  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 400,
      ideaExtractTimeoutRate: 0.2,
    }),
    'EXTREME',
  );
});

test('builds self-tuning policies for each load level', () => {
  assert.deepEqual(buildSelfTuningPolicy('NORMAL'), {
    ideaExtractMaxInflight: 3,
    claudeConcurrency: 6,
    claudeAllowedPriorities: ['P0', 'P1', 'P2'],
    telegramSelectionMode: 'MIXED',
    effectiveStrengthPolicy: {
      strong: 'relaxed',
      medium: 'normal',
      weak: 'disabled',
    },
  });

  assert.deepEqual(buildSelfTuningPolicy('HIGH_LOAD'), {
    ideaExtractMaxInflight: 2,
    claudeConcurrency: 3,
    claudeAllowedPriorities: ['P0', 'P1'],
    telegramSelectionMode: 'STRONG_PREFERRED',
    effectiveStrengthPolicy: {
      strong: 'normal',
      medium: 'tightened',
      weak: 'disabled',
    },
  });

  assert.deepEqual(buildSelfTuningPolicy('EXTREME'), {
    ideaExtractMaxInflight: 1,
    claudeConcurrency: 1,
    claudeAllowedPriorities: ['P0'],
    telegramSelectionMode: 'STRONG_ONLY',
    effectiveStrengthPolicy: {
      strong: 'strict',
      medium: 'disabled',
      weak: 'disabled',
    },
  });
});

test('downgrades MEDIUM strength to WEAK under EXTREME load only', () => {
  assert.equal(computeEffectiveStrength('STRONG', 'NORMAL'), 'STRONG');
  assert.equal(computeEffectiveStrength('MEDIUM', 'NORMAL'), 'MEDIUM');
  assert.equal(computeEffectiveStrength('MEDIUM', 'HIGH_LOAD'), 'MEDIUM');
  assert.equal(computeEffectiveStrength('MEDIUM', 'EXTREME'), 'WEAK');
  assert.equal(computeEffectiveStrength('WEAK', 'EXTREME'), 'WEAK');
  assert.equal(computeEffectiveStrength(null, 'EXTREME'), null);
});
