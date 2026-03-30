const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildModelTaskRouterDecision,
} = require('../dist/modules/analysis/helpers/model-task-router-decision.helper');

test('decision_recalc with conflict-driven gaps enters review path', () => {
  const decision = buildModelTaskRouterDecision({
    normalizedTaskType: 'decision_recalc',
    historicalRepairBucket: 'visible_broken',
    cleanupState: 'active',
    decisionRecalcGaps: ['user_conflict', 'monetization_conflict'],
    evidenceConflictCount: 2,
    strictVisibilityLevel: 'HOME',
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P0',
  });

  assert.equal(decision.capabilityTier, 'REVIEW');
  assert.equal(decision.requiresReview, true);
  assert.equal(decision.retryClass, 'RETRY_ONCE_THEN_REVIEW');
});

test('weak-only evidence repair stays off heavy capability', () => {
  const decision = buildModelTaskRouterDecision({
    normalizedTaskType: 'evidence_repair',
    historicalRepairBucket: 'stale_watch',
    cleanupState: 'active',
    evidenceRepairGaps: ['market_weak', 'distribution_weak'],
    evidenceConflictCount: 0,
    strictVisibilityLevel: 'BACKGROUND',
    repositoryValueTier: 'LOW',
    moneyPriority: 'P3',
  });

  assert.equal(decision.capabilityTier, 'LIGHT');
  assert.notEqual(decision.capabilityTier, 'HEAVY');
});

test('downgrade_only never takes high-cost capability', () => {
  const decision = buildModelTaskRouterDecision({
    normalizedTaskType: 'downgrade_only',
    cleanupState: 'active',
    strictVisibilityLevel: 'HOME',
    repositoryValueTier: 'LOW',
    moneyPriority: 'P3',
  });

  assert.equal(decision.capabilityTier, 'DETERMINISTIC_ONLY');
  assert.equal(decision.requiresReview, false);
});

test('freeze or archive suppresses capability aggressively', () => {
  const frozen = buildModelTaskRouterDecision({
    normalizedTaskType: 'deep_repair',
    cleanupState: 'freeze',
    historicalRepairBucket: 'high_value_weak',
    deepRepairGaps: ['technical_maturity_missing', 'execution_missing'],
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
  });
  const archived = buildModelTaskRouterDecision({
    normalizedTaskType: 'decision_recalc',
    cleanupState: 'archive',
    decisionRecalcGaps: ['user_conflict'],
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P0',
  });

  assert.equal(frozen.capabilityTier, 'DETERMINISTIC_ONLY');
  assert.equal(archived.capabilityTier, 'DETERMINISTIC_ONLY');
  assert.equal(archived.retryClass, 'NONE');
});

test('high value weak wins more capability than archive noise', () => {
  const highValueWeak = buildModelTaskRouterDecision({
    normalizedTaskType: 'deep_repair',
    cleanupState: 'active',
    historicalRepairBucket: 'high_value_weak',
    deepRepairGaps: ['technical_maturity_missing', 'execution_missing'],
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P0',
  });
  const archiveNoise = buildModelTaskRouterDecision({
    normalizedTaskType: 'deep_repair',
    cleanupState: 'freeze',
    historicalRepairBucket: 'archive_or_noise',
    deepRepairGaps: ['technical_maturity_missing', 'execution_missing'],
    repositoryValueTier: 'LOW',
    moneyPriority: 'P3',
  });

  assert.equal(highValueWeak.capabilityTier, 'HEAVY');
  assert.notEqual(archiveNoise.capabilityTier, 'HEAVY');
});
