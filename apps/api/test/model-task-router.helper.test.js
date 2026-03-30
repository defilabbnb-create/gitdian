const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODEL_TASK_INTENTS,
  MODEL_TASK_CAPABILITY_TIERS,
  buildModelTaskRouterInventoryReport,
  getModelTaskRouterDefinition,
  normalizeModelTaskType,
} = require('../dist/modules/analysis/helpers/model-task-router.helper');

test('task types normalize consistently across different entry hints', () => {
  assert.equal(
    normalizeModelTaskType({ aiTaskType: 'idea_snapshot' }),
    'snapshot',
  );
  assert.equal(
    normalizeModelTaskType({ queueJobType: 'analysis.idea_snapshot' }),
    'snapshot',
  );
  assert.equal(
    normalizeModelTaskType({ directTaskType: 'snapshot' }),
    'snapshot',
  );

  assert.equal(
    normalizeModelTaskType({ repairAction: 'decision_recalc' }),
    'decision_recalc',
  );
  assert.equal(
    normalizeModelTaskType({
      queueJobType: 'analysis.run_single',
      repairAction: 'decision_recalc',
    }),
    'decision_recalc',
  );

  assert.equal(
    normalizeModelTaskType({ aiTaskType: 'basic_analysis' }),
    'claude_review',
  );
  assert.equal(
    normalizeModelTaskType({ serviceMode: 'queue_claude_review' }),
    'claude_review',
  );
});

test('task intent taxonomy stays stable and centralized', () => {
  assert.deepEqual(MODEL_TASK_INTENTS, [
    'extract',
    'classify',
    'score',
    'synthesize',
    'repair',
    'recalc',
    'review',
    'downgrade',
    'cleanup',
  ]);
});

test('capability tier mapping stays stable for key tasks', () => {
  const deepRepair = getModelTaskRouterDefinition('deep_repair');
  const claudeReview = getModelTaskRouterDefinition('claude_review');
  const fastFilter = getModelTaskRouterDefinition('fast_filter');

  assert.equal(deepRepair.preferredCapabilityTier, 'HEAVY');
  assert.equal(claudeReview.preferredCapabilityTier, 'REVIEW');
  assert.equal(fastFilter.preferredCapabilityTier, 'DETERMINISTIC_ONLY');
  assert.ok(
    MODEL_TASK_CAPABILITY_TIERS.HEAVY.allowedTaskTypes.includes('deep_repair'),
  );
  assert.ok(
    MODEL_TASK_CAPABILITY_TIERS.REVIEW.allowedTaskTypes.includes('claude_review'),
  );
});

test('fallback policy is never empty for normalized tasks', () => {
  const report = buildModelTaskRouterInventoryReport();
  for (const task of report.tasks) {
    assert.ok(task.taskFallbackPolicy);
    assert.ok(Array.isArray(task.currentFallback));
    assert.ok(task.currentFallback.length >= 1);
  }
});
