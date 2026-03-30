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

async function withGitHubIntakeEnv(value, run) {
  const previousNew = process.env.GITHUB_NEW_REPOSITORY_INTAKE_ENABLED;
  const previousLegacy = process.env.GITHUB_INTAKE_ENABLED;

  if (typeof value === 'string') {
    process.env.GITHUB_NEW_REPOSITORY_INTAKE_ENABLED = value;
  } else {
    delete process.env.GITHUB_NEW_REPOSITORY_INTAKE_ENABLED;
  }
  delete process.env.GITHUB_INTAKE_ENABLED;

  try {
    await run();
  } finally {
    if (typeof previousNew === 'string') {
      process.env.GITHUB_NEW_REPOSITORY_INTAKE_ENABLED = previousNew;
    } else {
      delete process.env.GITHUB_NEW_REPOSITORY_INTAKE_ENABLED;
    }

    if (typeof previousLegacy === 'string') {
      process.env.GITHUB_INTAKE_ENABLED = previousLegacy;
    } else {
      delete process.env.GITHUB_INTAKE_ENABLED;
    }
  }
}

test('queue service blocks new GitHub fetch intake when business gate is disabled', async () => {
  const { service } = createService();

  await withGitHubIntakeEnv('false', async () => {
    await assert.rejects(
      () =>
        service.enqueueGitHubFetch(
          {
            language: 'TypeScript',
          },
          'ui',
        ),
      /GitHub intake is disabled/,
    );
  });
});

test('queue service blocks new GitHub created backfill intake when business gate is disabled', async () => {
  const { service } = createService();

  await withGitHubIntakeEnv('false', async () => {
    await assert.rejects(
      () =>
        service.enqueueGitHubCreatedBackfill(
          {
            days: 7,
          },
          'scheduler',
        ),
      /GitHub intake is disabled/,
    );
  });
});

test('queue service keeps historical repair snapshot intake available when GitHub intake is disabled', async () => {
  const { service, queueCalls } = createService();

  await withGitHubIntakeEnv('false', async () => {
    await service.enqueueIdeaSnapshot(
      {
        repositoryId: 'repo-historical',
        windowDate: '2026-03-30',
        fromBackfill: false,
        runFastFilter: false,
        runDeepAnalysis: false,
      },
      'historical_repair',
    );
  });

  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].queueName, 'analysis.snapshot');
});

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

test('queue service preserves router metadata on analysis payloads', async () => {
  const { service, queueCalls } = createService();

  await service.enqueueSingleAnalysis(
    'repo-router',
    {
      mode: 'FULL',
    },
    'historical_repair',
    {
      metadata: {
        routerTaskIntent: 'repair',
        routerCapabilityTier: 'REVIEW',
        routerPriorityClass: 'P0',
        routerFallbackPolicy: 'RETRY_THEN_REVIEW',
        routerRequiresReview: true,
        routerReasonSummary: 'conflict-driven recalc requires REVIEW path',
      },
    },
  );

  assert.equal(queueCalls[0].payload.routerTaskIntent, 'repair');
  assert.equal(queueCalls[0].payload.routerCapabilityTier, 'REVIEW');
  assert.equal(queueCalls[0].payload.routerPriorityClass, 'P0');
  assert.equal(queueCalls[0].payload.routerFallbackPolicy, 'RETRY_THEN_REVIEW');
  assert.equal(queueCalls[0].payload.routerRequiresReview, true);
});

test('queue service bulk snapshot enqueue preserves per-job options', async () => {
  const intakeCalls = [];
  const startJobsBulkCalls = [];
  const attachQueueJobsBulkCalls = [];
  const bulkJobs = [];
  const service = new QueueService(
    {
      startJobsBulk: async (inputs) => {
        startJobsBulkCalls.push(inputs);
        return inputs.map((_input, index) => ({
          id: `job-${index + 1}`,
        }));
      },
      attachQueueJobsBulk: async (inputs) => {
        attachQueueJobsBulkCalls.push(inputs);
        return inputs;
      },
      startJob: async () => {
        throw new Error('startJob fallback should not be used');
      },
      attachQueueJob: async () => {
        throw new Error('attachQueueJob fallback should not be used');
      },
    },
    {
      recordQueueInfluence: async () => {},
    },
    {
      getAnalysisPriorityAdjustment: async () => ({
        boost: 0,
        reasons: [],
        suppressed: false,
      }),
    },
    {},
  );

  service.assertAnalysisPoolIntakeAllowed = async (input) => {
    intakeCalls.push(input);
  };
  service.getQueue = () => ({
    addBulk: async (items) => {
      bulkJobs.push(items);
      return items.map((_item, index) => ({
        id: `queue-job-${index + 1}`,
      }));
    },
  });

  const results = await service.enqueueIdeaSnapshotsBulk(
    [
      {
        payload: {
          repositoryId: 'repo-1',
          windowDate: '2026-03-30',
          fromBackfill: true,
          runFastFilter: false,
          runDeepAnalysis: false,
        },
        jobOptionsOverride: {
          priority: 7,
          attempts: 4,
        },
      },
      {
        payload: {
          repositoryId: 'repo-2',
          windowDate: '2026-03-30',
          fromBackfill: true,
          runFastFilter: false,
          runDeepAnalysis: false,
        },
        jobOptionsOverride: {
          priority: 21,
          attempts: 2,
        },
      },
    ],
    'historical_repair',
  );

  assert.equal(intakeCalls.length, 1);
  assert.deepEqual(intakeCalls[0].repositoryIds, ['repo-1', 'repo-2']);
  assert.equal(startJobsBulkCalls.length, 1);
  assert.equal(startJobsBulkCalls[0][0].attempts, 4);
  assert.equal(startJobsBulkCalls[0][1].attempts, 2);
  assert.equal(bulkJobs.length, 1);
  assert.equal(bulkJobs[0][0].opts.priority, 7);
  assert.equal(bulkJobs[0][0].opts.attempts, 4);
  assert.equal(bulkJobs[0][1].opts.priority, 21);
  assert.equal(bulkJobs[0][1].opts.attempts, 2);
  assert.equal(attachQueueJobsBulkCalls.length, 1);
  assert.equal(attachQueueJobsBulkCalls[0][0].attempts, 4);
  assert.equal(attachQueueJobsBulkCalls[0][1].attempts, 2);
  assert.deepEqual(
    results.map((result) => result.queueJobId),
    ['queue-job-1', 'queue-job-2'],
  );
});

test('queue service bulk snapshot enqueue cancels job logs when queue add fails', async () => {
  const cancelCalls = [];
  const service = new QueueService(
    {
      startJobsBulk: async (inputs) =>
        inputs.map((_input, index) => ({
          id: `job-${index + 1}`,
        })),
      cancelJobsBulk: async (input) => {
        cancelCalls.push(input);
        return { count: input.jobIds.length };
      },
      startJob: async () => {
        throw new Error('startJob fallback should not be used');
      },
    },
    {
      recordQueueInfluence: async () => {},
    },
    {
      getAnalysisPriorityAdjustment: async () => ({
        boost: 0,
        reasons: [],
        suppressed: false,
      }),
    },
    {},
  );

  service.assertAnalysisPoolIntakeAllowed = async () => {};
  service.getQueue = () => ({
    addBulk: async () => {
      throw new Error('bulk_add_failed');
    },
  });

  await assert.rejects(
    () =>
      service.enqueueIdeaSnapshotsBulk(
        [
          {
            repositoryId: 'repo-1',
            windowDate: '2026-03-30',
            fromBackfill: true,
            runFastFilter: false,
            runDeepAnalysis: false,
          },
        ],
        'historical_repair',
      ),
    /bulk_add_failed/,
  );

  assert.equal(cancelCalls.length, 1);
  assert.deepEqual(cancelCalls[0].jobIds, ['job-1']);
  assert.equal(
    cancelCalls[0].errorMessage,
    'Task cancelled because bulk queue add failed.',
  );
});

test('queue service bulk single analysis enqueue preserves per-job options and batches behavior tracking', async () => {
  const intakeCalls = [];
  const startJobsBulkCalls = [];
  const attachQueueJobsBulkCalls = [];
  const bulkJobs = [];
  const behaviorBulkCalls = [];
  const service = new QueueService(
    {
      startJobsBulk: async (inputs) => {
        startJobsBulkCalls.push(inputs);
        return inputs.map((_input, index) => ({
          id: `job-${index + 1}`,
        }));
      },
      attachQueueJobsBulk: async (inputs) => {
        attachQueueJobsBulkCalls.push(inputs);
        return inputs;
      },
      startJob: async () => {
        throw new Error('startJob fallback should not be used');
      },
      attachQueueJob: async () => {
        throw new Error('attachQueueJob fallback should not be used');
      },
    },
    {
      recordQueueInfluenceBulk: async (flags) => {
        behaviorBulkCalls.push(flags);
      },
      recordQueueInfluence: async () => {
        throw new Error('recordQueueInfluence fallback should not be used');
      },
    },
    {
      getAnalysisPriorityAdjustment: async () => {
        throw new Error(
          'scheduler lookup should be skipped when explicit priority is provided',
        );
      },
    },
    {},
  );

  service.assertAnalysisPoolIntakeAllowed = async (input) => {
    intakeCalls.push(input);
  };
  service.getQueue = () => ({
    addBulk: async (items) => {
      bulkJobs.push(items);
      return items.map((_item, index) => ({
        id: `queue-job-${index + 1}`,
      }));
    },
  });

  const results = await service.enqueueSingleAnalysesBulk(
    [
      {
        repositoryId: 'repo-1',
        dto: {
          mode: 'FULL',
          userPreferencePriorityBoost: 2,
        },
        metadata: {
          historicalRepairAction: 'decision_recalc',
        },
        jobOptionsOverride: {
          priority: 9,
          attempts: 4,
        },
      },
      {
        repositoryId: 'repo-2',
        dto: {
          mode: 'FULL',
        },
        metadata: {
          historicalRepairAction: 'deep_repair',
        },
        jobOptionsOverride: {
          priority: 17,
          attempts: 2,
        },
      },
    ],
    'historical_repair',
  );

  assert.equal(intakeCalls.length, 1);
  assert.deepEqual(intakeCalls[0].repositoryIds, ['repo-1', 'repo-2']);
  assert.equal(behaviorBulkCalls.length, 1);
  assert.deepEqual(behaviorBulkCalls[0], [true, false]);
  assert.equal(startJobsBulkCalls.length, 1);
  assert.equal(startJobsBulkCalls[0][0].attempts, 4);
  assert.equal(startJobsBulkCalls[0][1].attempts, 2);
  assert.equal(bulkJobs.length, 1);
  assert.equal(bulkJobs[0][0].data.historicalRepairAction, 'decision_recalc');
  assert.equal(bulkJobs[0][0].opts.priority, 9);
  assert.equal(bulkJobs[0][1].data.historicalRepairAction, 'deep_repair');
  assert.equal(bulkJobs[0][1].opts.priority, 17);
  assert.equal(attachQueueJobsBulkCalls.length, 1);
  assert.equal(attachQueueJobsBulkCalls[0][0].attempts, 4);
  assert.equal(attachQueueJobsBulkCalls[0][1].attempts, 2);
  assert.deepEqual(
    results.map((result) => result.queueJobId),
    ['queue-job-1', 'queue-job-2'],
  );
});
