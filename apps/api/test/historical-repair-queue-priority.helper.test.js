const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toHistoricalRepairQueuePriority,
  toHistoricalSingleAnalysisQueuePriority,
} = require('../dist/modules/analysis/helpers/historical-repair-queue-priority.helper');

test('historical single analysis priority strongly prefers deep repair over decision recalc', () => {
  const deepPriority = toHistoricalSingleAnalysisQueuePriority({
    historicalRepairAction: 'deep_repair',
    priorityScore: 160,
    routerPriorityClass: 'P0',
  });
  const recalcPriority = toHistoricalSingleAnalysisQueuePriority({
    historicalRepairAction: 'decision_recalc',
    priorityScore: 160,
    routerPriorityClass: 'P0',
  });

  assert.ok(deepPriority < recalcPriority);
  assert.equal(deepPriority, 5);
  assert.equal(recalcPriority, 140);
});

test('historical single analysis priority keeps low-value decision recalc in the lowest band', () => {
  const basePriority = toHistoricalRepairQueuePriority(80, 'P3');
  const deepPriority = toHistoricalSingleAnalysisQueuePriority({
    historicalRepairAction: 'deep_repair',
    priorityScore: 80,
    routerPriorityClass: 'P3',
  });
  const recalcPriority = toHistoricalSingleAnalysisQueuePriority({
    historicalRepairAction: 'decision_recalc',
    priorityScore: 80,
    routerPriorityClass: 'P3',
  });

  assert.equal(basePriority, 120);
  assert.equal(deepPriority, 40);
  assert.equal(recalcPriority, 200);
});
