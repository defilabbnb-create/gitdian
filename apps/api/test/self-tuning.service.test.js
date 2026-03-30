const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSelfTuningPolicy,
  computeEffectiveStrength,
  computeSystemLoadLevel,
  resolveSelfTuningPolicy,
  summarizeRecentAnalysisThroughput,
} = require('../dist/modules/analysis/self-tuning.service');

test('computes NORMAL, HIGH_LOAD, and EXTREME system load levels', () => {
  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 320,
      deepQueueSize: 200,
      ideaExtractTimeoutRate: 0.01,
    }),
    'NORMAL',
  );

  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 900,
      deepQueueSize: 200,
      ideaExtractTimeoutRate: 0.01,
    }),
    'HIGH_LOAD',
  );

  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 600,
      deepQueueSize: 900,
      ideaExtractTimeoutRate: 0.01,
    }),
    'HIGH_LOAD',
  );

  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 600,
      deepQueueSize: 200,
      ideaExtractTimeoutRate: 0.08,
    }),
    'HIGH_LOAD',
  );

  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 1600,
      deepQueueSize: 200,
      ideaExtractTimeoutRate: 0.01,
    }),
    'EXTREME',
  );

  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 400,
      deepQueueSize: 2200,
      ideaExtractTimeoutRate: 0.01,
    }),
    'EXTREME',
  );

  assert.equal(
    computeSystemLoadLevel({
      snapshotQueueSize: 400,
      deepQueueSize: 200,
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

test('resolveSelfTuningPolicy relaxes idea extract inflight during deep-drain-only extreme load', () => {
  assert.deepEqual(
    resolveSelfTuningPolicy({
      systemLoadLevel: 'EXTREME',
      snapshotQueueSize: 0,
      deepQueueSize: 50000,
      ideaExtractTimeoutRate: 0.01,
    }),
    {
      ideaExtractMaxInflight: 2,
      claudeConcurrency: 1,
      claudeAllowedPriorities: ['P0'],
      telegramSelectionMode: 'STRONG_ONLY',
      effectiveStrengthPolicy: {
        strong: 'strict',
        medium: 'disabled',
        weak: 'disabled',
      },
      policyMode: 'deep_drain_relief',
    },
  );
});

test('resolveSelfTuningPolicy restores normal extract inflight during stable high-load deep drain', () => {
  assert.deepEqual(
    resolveSelfTuningPolicy({
      systemLoadLevel: 'HIGH_LOAD',
      snapshotQueueSize: 0,
      deepQueueSize: 1288,
      ideaExtractTimeoutRate: 0.01,
    }),
    {
      ideaExtractMaxInflight: 3,
      claudeConcurrency: 3,
      claudeAllowedPriorities: ['P0', 'P1'],
      telegramSelectionMode: 'STRONG_PREFERRED',
      effectiveStrengthPolicy: {
        strong: 'normal',
        medium: 'tightened',
        weak: 'disabled',
      },
      policyMode: 'high_load_deep_drain_relief',
    },
  );
});

test('resolveSelfTuningPolicy keeps default extreme limits when timeouts are elevated', () => {
  assert.deepEqual(
    resolveSelfTuningPolicy({
      systemLoadLevel: 'EXTREME',
      snapshotQueueSize: 0,
      deepQueueSize: 50000,
      ideaExtractTimeoutRate: 0.2,
    }),
    {
      ideaExtractMaxInflight: 1,
      claudeConcurrency: 1,
      claudeAllowedPriorities: ['P0'],
      telegramSelectionMode: 'STRONG_ONLY',
      effectiveStrengthPolicy: {
        strong: 'strict',
        medium: 'disabled',
        weak: 'disabled',
      },
      policyMode: 'default',
    },
  );
});

test('downgrades MEDIUM strength to WEAK under EXTREME load only', () => {
  assert.equal(computeEffectiveStrength('STRONG', 'NORMAL'), 'STRONG');
  assert.equal(computeEffectiveStrength('MEDIUM', 'NORMAL'), 'MEDIUM');
  assert.equal(computeEffectiveStrength('MEDIUM', 'HIGH_LOAD'), 'MEDIUM');
  assert.equal(computeEffectiveStrength('MEDIUM', 'EXTREME'), 'WEAK');
  assert.equal(computeEffectiveStrength('WEAK', 'EXTREME'), 'WEAK');
  assert.equal(computeEffectiveStrength(null, 'EXTREME'), null);
});

test('summarizeRecentAnalysisThroughput counts completed jobs by job type, not queue name', () => {
  assert.deepEqual(
    summarizeRecentAnalysisThroughput({
      jobs: [
        { jobName: 'analysis.idea_snapshot' },
        { jobName: 'analysis.idea_snapshot' },
        { jobName: 'analysis.run_single' },
        { jobName: 'analysis.single' },
        { jobName: 'analysis.snapshot' },
      ],
      windowMs: 5 * 60 * 1000,
    }),
    {
      reposPerMinute: 0.6,
      snapshotThroughput: 0.4,
      deepThroughput: 0.2,
    },
  );
});
