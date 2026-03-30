const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isContinuousRadarConfigured,
  isContinuousRadarSchedulingEnabled,
} = require('../dist/modules/github/github-radar.service');

test('continuous radar scheduling requires radar env and GitHub intake env', () => {
  assert.equal(
    isContinuousRadarSchedulingEnabled({
      ENABLE_CONTINUOUS_RADAR: 'true',
      GITHUB_NEW_REPOSITORY_INTAKE_ENABLED: 'true',
    }),
    true,
  );

  assert.equal(
    isContinuousRadarSchedulingEnabled({
      ENABLE_CONTINUOUS_RADAR: 'true',
      GITHUB_NEW_REPOSITORY_INTAKE_ENABLED: 'false',
    }),
    false,
  );

  assert.equal(
    isContinuousRadarSchedulingEnabled({
      ENABLE_CONTINUOUS_RADAR: 'true',
    }),
    false,
  );

  assert.equal(
    isContinuousRadarSchedulingEnabled({
      ENABLE_CONTINUOUS_RADAR: 'false',
      GITHUB_NEW_REPOSITORY_INTAKE_ENABLED: 'true',
    }),
    false,
  );
});

test('continuous radar scheduling honors legacy GitHub intake env name', () => {
  assert.equal(
    isContinuousRadarSchedulingEnabled({
      ENABLE_CONTINUOUS_RADAR: 'true',
      GITHUB_INTAKE_ENABLED: 'true',
    }),
    true,
  );
});

test('continuous radar configuration helper only reflects radar env flag', () => {
  assert.equal(
    isContinuousRadarConfigured({
      ENABLE_CONTINUOUS_RADAR: 'true',
      GITHUB_NEW_REPOSITORY_INTAKE_ENABLED: 'false',
    }),
    true,
  );

  assert.equal(
    isContinuousRadarConfigured({
      ENABLE_CONTINUOUS_RADAR: 'false',
      GITHUB_NEW_REPOSITORY_INTAKE_ENABLED: 'true',
    }),
    false,
  );
});
