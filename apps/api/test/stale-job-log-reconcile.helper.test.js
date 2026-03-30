const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decideStaleJobLogReconciliation,
  normalizeQueueObservedState,
  readHistoricalRepairActionFromPayload,
  readRepositoryIdFromPayload,
} = require('../dist/scripts/helpers/stale-job-log-reconcile.helper');

test('stale running helper keeps active queue jobs running', () => {
  const decision = decideStaleJobLogReconciliation(
    normalizeQueueObservedState('active'),
  );

  assert.equal(decision.disposition, 'keep_running');
  assert.equal(decision.reason, 'queue_active_matches_running');
});

test('stale running helper moves waiting-like queue jobs back to pending', () => {
  for (const state of ['waiting', 'delayed', 'prioritized', 'waiting-children']) {
    const decision = decideStaleJobLogReconciliation(
      normalizeQueueObservedState(state),
    );
    assert.equal(decision.disposition, 'mark_pending');
  }
});

test('stale running helper maps completed and failed queue jobs to terminal states', () => {
  const completed = decideStaleJobLogReconciliation(
    normalizeQueueObservedState('completed'),
  );
  const failed = decideStaleJobLogReconciliation(
    normalizeQueueObservedState('failed'),
  );
  const missing = decideStaleJobLogReconciliation(
    normalizeQueueObservedState('missing'),
  );

  assert.equal(completed.disposition, 'mark_success');
  assert.equal(failed.disposition, 'mark_failed');
  assert.equal(missing.disposition, 'mark_failed');
  assert.equal(missing.reason, 'queue_job_missing');
});

test('stale running helper extracts repository id and repair action from payload metadata', () => {
  const payload = {
    repositoryId: 'repo-123',
    routerMetadata: {
      historicalRepairAction: 'decision_recalc',
    },
  };

  assert.equal(readRepositoryIdFromPayload(payload), 'repo-123');
  assert.equal(
    readHistoricalRepairActionFromPayload(payload),
    'decision_recalc',
  );
});

test('stale running helper falls back to manual review for unknown states', () => {
  const decision = decideStaleJobLogReconciliation(
    normalizeQueueObservedState('paused'),
  );

  assert.equal(decision.disposition, 'manual_review');
  assert.equal(decision.reason, 'queue_state_unknown');
});
