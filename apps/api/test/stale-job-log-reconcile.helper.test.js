const test = require('node:test');
const assert = require('node:assert/strict');
const { JobStatus } = require('@prisma/client');

const {
  decideStaleJobLogReconciliation,
  normalizeQueueObservedState,
  readHistoricalRepairActionFromPayload,
  readRepositoryIdFromPayload,
} = require('../dist/scripts/helpers/stale-job-log-reconcile.helper');

test('stale running helper keeps active queue jobs running', () => {
  const decision = decideStaleJobLogReconciliation(
    JobStatus.RUNNING,
    normalizeQueueObservedState('active'),
  );

  assert.equal(decision.disposition, 'keep_running');
  assert.equal(decision.reason, 'queue_active_matches_running');
});

test('stale running helper moves waiting-like queue jobs back to pending', () => {
  for (const state of ['waiting', 'delayed', 'prioritized', 'waiting-children']) {
    const decision = decideStaleJobLogReconciliation(
      JobStatus.RUNNING,
      normalizeQueueObservedState(state),
    );
    assert.equal(decision.disposition, 'mark_pending');
  }
});

test('stale running helper maps completed and failed queue jobs to terminal states', () => {
  const completed = decideStaleJobLogReconciliation(
    JobStatus.RUNNING,
    normalizeQueueObservedState('completed'),
  );
  const failed = decideStaleJobLogReconciliation(
    JobStatus.RUNNING,
    normalizeQueueObservedState('failed'),
  );
  const missing = decideStaleJobLogReconciliation(
    JobStatus.RUNNING,
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
    JobStatus.RUNNING,
    normalizeQueueObservedState('paused'),
  );

  assert.equal(decision.disposition, 'manual_review');
  assert.equal(decision.reason, 'queue_state_unknown');
});

test('stale pending helper keeps waiting-like queue jobs pending', () => {
  for (const state of ['waiting', 'delayed', 'prioritized', 'waiting-children']) {
    const decision = decideStaleJobLogReconciliation(
      JobStatus.PENDING,
      normalizeQueueObservedState(state),
    );
    assert.equal(decision.disposition, 'keep_pending');
  }
});

test('stale pending helper promotes active queue jobs to running', () => {
  const decision = decideStaleJobLogReconciliation(
    JobStatus.PENDING,
    normalizeQueueObservedState('active'),
  );

  assert.equal(decision.disposition, 'mark_running');
  assert.equal(decision.reason, 'queue_active_should_be_running');
});

test('stale pending helper resolves missing queue jobs to failed', () => {
  const decision = decideStaleJobLogReconciliation(
    JobStatus.PENDING,
    normalizeQueueObservedState('missing'),
  );

  assert.equal(decision.disposition, 'mark_failed');
  assert.equal(decision.reason, 'queue_job_missing');
});
