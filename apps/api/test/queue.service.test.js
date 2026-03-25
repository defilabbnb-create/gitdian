const test = require('node:test');
const assert = require('node:assert/strict');

const { QueueService } = require('../dist/modules/queue/queue.service');

function createService() {
  const queueCalls = [];
  const behaviorCalls = [];
  const jobLogService = {};
  const behaviorMemoryService = {
    recordQueueInfluence: async (applied) => {
      behaviorCalls.push(applied);
    },
  };
  const adaptiveSchedulerService = {
    getAnalysisPriorityAdjustment: async () => ({
      boost: 0,
      reasons: [],
      suppressed: false,
    }),
  };
  const service = new QueueService(
    jobLogService,
    behaviorMemoryService,
    adaptiveSchedulerService,
  );

  service.enqueueJob = async (input) => {
    queueCalls.push(input);
    return {
      jobId: 'job-1',
      queueName: input.queueName,
      queueJobId: 'queue-job-1',
      jobStatus: 'PENDING',
    };
  };

  return {
    service,
    queueCalls,
    behaviorCalls,
  };
}

test('queue service applies a positive behavior priority boost to analysis jobs', async () => {
  const { service, queueCalls, behaviorCalls } = createService();

  await service.enqueueSingleAnalysis(
    'repo-1',
    {
      mode: 'FULL',
      userPreferencePriorityBoost: 4,
    },
    'ui',
  );

  assert.equal(behaviorCalls[0], true);
  assert.equal(typeof queueCalls[0].jobOptionsOverride.priority, 'number');
  assert.equal(queueCalls[0].jobOptionsOverride.priority, 36);
});

test('queue service applies a negative behavior priority boost to analysis jobs', async () => {
  const { service, queueCalls, behaviorCalls } = createService();

  await service.enqueueSingleAnalysis(
    'repo-2',
    {
      mode: 'FULL',
      userPreferencePriorityBoost: -3,
    },
    'ui',
  );

  assert.equal(behaviorCalls[0], true);
  assert.equal(queueCalls[0].jobOptionsOverride.priority, 144);
});

test('queue service leaves priority untouched when no behavior boost is provided', async () => {
  const { service, queueCalls, behaviorCalls } = createService();

  await service.enqueueSingleAnalysis(
    'repo-3',
    {
      mode: 'FULL',
    },
    'ui',
  );

  assert.equal(behaviorCalls[0], false);
  assert.deepEqual(queueCalls[0].jobOptionsOverride, {});
});
