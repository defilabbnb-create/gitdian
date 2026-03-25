const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RadarDailySummaryService,
} = require('../dist/modules/github/radar-daily-summary.service');

function createService() {
  return new RadarDailySummaryService(
    {},
    {},
    {},
    {},
    {},
  );
}

function createDecision(id, strength, verdict = 'OK', action = 'CLONE') {
  return {
    repositoryId: id,
    fullName: `repo/${id}`,
    htmlUrl: `https://github.com/repo/${id}`,
    stars: 10,
    createdAtGithub: new Date('2026-03-24T00:00:00.000Z'),
    ideaFitScore: 70,
    oneLinerZh: `项目 ${id}`,
    verdict,
    action,
    category: {
      main: 'tools',
      sub: 'workflow',
    },
    oneLinerStrength: strength,
    finalDecision: {
      oneLinerStrength: strength,
    },
    isPromising: true,
    hasInsight: true,
    hasManualOverride: false,
    hasClaudeReview: false,
    moneyPriority: {
      score: 80,
      tier: 'P1',
      moneyDecision: 'HIGH_VALUE',
    },
  };
}

test('telegram top selection prefers STRONG, then MEDIUM, then limited fallback', () => {
  const service = createService();
  const ranked = [
    createDecision('strong-1', 'STRONG', 'GOOD', 'BUILD'),
    createDecision('weak-1', 'WEAK', 'GOOD', 'BUILD'),
    createDecision('medium-1', 'MEDIUM'),
    createDecision('strong-2', 'STRONG'),
    createDecision('medium-2', 'MEDIUM'),
  ];

  const result = service.selectTopDecisionsByStrength(ranked, 4, 'MIXED');

  assert.deepEqual(
    result.topDecisions.map((item) => item.repositoryId),
    ['strong-1', 'strong-2', 'medium-1', 'medium-2'],
  );
  assert.equal(result.strongCount, 2);
  assert.equal(result.mediumCount, 2);
  assert.equal(result.fallbackCount, 0);
});

test('telegram top selection allows small fallback from WEAK or ungraded items', () => {
  const service = createService();
  const ranked = [
    createDecision('weak-1', 'WEAK'),
    createDecision('weak-2', 'WEAK'),
    createDecision('ungraded-1', null),
  ];

  const result = service.selectTopDecisionsByStrength(ranked, 5, 'MIXED');

  assert.deepEqual(
    result.topDecisions.map((item) => item.repositoryId),
    ['weak-1', 'weak-2'],
  );
  assert.equal(result.strongCount, 0);
  assert.equal(result.mediumCount, 0);
  assert.equal(result.fallbackCount, 2);
});

test('telegram top selection narrows to STRONG plus limited MEDIUM under HIGH_LOAD', () => {
  const service = createService();
  const ranked = [
    createDecision('strong-1', 'STRONG'),
    createDecision('medium-1', 'MEDIUM'),
    createDecision('medium-2', 'MEDIUM'),
    createDecision('medium-3', 'MEDIUM'),
    createDecision('weak-1', 'WEAK'),
  ];

  const result = service.selectTopDecisionsByStrength(ranked, 5, 'STRONG_PREFERRED');

  assert.deepEqual(
    result.topDecisions.map((item) => item.repositoryId),
    ['strong-1', 'medium-1', 'medium-2'],
  );
  assert.equal(result.strongCount, 1);
  assert.equal(result.mediumCount, 2);
  assert.equal(result.fallbackCount, 0);
});

test('telegram top selection becomes STRONG only under EXTREME load', () => {
  const service = createService();
  const ranked = [
    createDecision('strong-1', 'STRONG'),
    createDecision('medium-1', 'MEDIUM'),
    createDecision('weak-1', 'WEAK'),
  ];

  const result = service.selectTopDecisionsByStrength(ranked, 5, 'STRONG_ONLY');

  assert.deepEqual(
    result.topDecisions.map((item) => item.repositoryId),
    ['strong-1'],
  );
  assert.equal(result.strongCount, 1);
  assert.equal(result.mediumCount, 0);
  assert.equal(result.fallbackCount, 0);
});
