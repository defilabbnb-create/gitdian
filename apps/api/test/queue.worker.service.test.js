const test = require('node:test');
const assert = require('node:assert/strict');

const { QueueWorkerService } = require('../dist/modules/queue/queue.worker.service');

function createService(overrides = {}) {
  const jobLogCalls = {
    failJob: [],
    updateJobProgress: [],
  };
  const queueCalls = {
    tryRemoveQueueJob: [],
  };

  const jobLogService = {
    failJob: async (input) => {
      jobLogCalls.failJob.push(input);
      return { id: input.jobId };
    },
    updateJobProgress: async (input) => {
      jobLogCalls.updateJobProgress.push(input);
      return { id: input.jobId };
    },
    ...(overrides.jobLogService ?? {}),
  };
  const queueService = {
    getLatestActiveQueueJobLog: async () => null,
    getQueueJobSnapshot: async () => null,
    tryRemoveQueueJob: async (...args) => {
      queueCalls.tryRemoveQueueJob.push(args);
      return {
        found: true,
        removed: false,
        state: 'active',
      };
    },
    enqueueGitHubColdToolCollect: async () => ({
      jobId: 'job-new',
      queueJobId: 'queue-job-new',
      queueName: 'github.cold-tool-collect',
      jobStatus: 'PENDING',
    }),
    enqueueSingleAnalysis: async () => ({
      jobId: 'analysis-job-new',
      queueJobId: 'analysis-queue-job-new',
      queueName: 'analysis.single',
      jobStatus: 'PENDING',
    }),
    ...(overrides.queueService ?? {}),
  };

  const service = new QueueWorkerService(
    overrides.prisma ?? { jobLog: { findMany: async () => [] } },
    jobLogService,
    overrides.githubService ?? {},
    overrides.gitHubColdToolCollectorService ?? {
      runCollectionDirect: async () => ({
        queriesExecuted: 0,
        fetchedLinks: 0,
        coldToolEvaluated: 0,
        coldToolMatched: 0,
        deepAnalysisQueued: 0,
        activeDomains: [],
        activeProgrammingLanguages: [],
        topMatchedRepositoryIds: [],
      }),
    },
    overrides.radarDailySummaryService ?? {},
    overrides.analysisOrchestratorService ?? {},
    overrides.fastFilterService ?? {},
    queueService,
  );

  return {
    service,
    jobLogCalls,
    queueCalls,
  };
}

test('queue worker does not treat waiting cold-tool job as stale', () => {
  const { service } = createService();
  const stale = service.isColdToolCollectorJobStale(
    {
      createdAt: new Date(Date.now() - 30 * 60_000),
      startedAt: null,
      updatedAt: new Date(Date.now() - 30 * 60_000),
      result: {
        runtime: {
          currentStage: 'cold_tool_discovery',
          runtimeUpdatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
          progress: 82,
        },
      },
    },
    {
      queueJobId: 'queue-job-1',
      state: 'waiting',
      attemptsMade: 0,
      processedOn: null,
      finishedOn: null,
      timestamp: Date.now() - 30 * 60_000,
    },
  );

  assert.equal(stale, false);
});

test('queue worker watchdog fails stale active cold-tool job and preserves runtime stage', async () => {
  const previousStaleMinutes = process.env.COLD_TOOL_STALE_RUNTIME_MINUTES;
  const previousRuntimeHeartbeat = process.env.QUEUE_RUNTIME_HEARTBEAT_MS;
  const previousWatchdogInterval = process.env.COLD_TOOL_WATCHDOG_INTERVAL_MS;

  process.env.COLD_TOOL_STALE_RUNTIME_MINUTES = '1';
  process.env.QUEUE_RUNTIME_HEARTBEAT_MS = '1000';
  process.env.COLD_TOOL_WATCHDOG_INTERVAL_MS = '1000';

  try {
    const staleAt = new Date(Date.now() - 2 * 60_000).toISOString();
    const { service, jobLogCalls, queueCalls } = createService({
      queueService: {
        getLatestActiveQueueJobLog: async () => ({
          id: 'job-cold-stale',
          queueName: 'github.cold-tool-collect',
          queueJobId: 'queue-job-cold-stale',
          jobStatus: 'RUNNING',
          progress: 82,
          payload: null,
          result: {
            runtime: {
              currentStage: 'cold_tool_discovery',
              runtimeUpdatedAt: staleAt,
              progress: 82,
            },
          },
          createdAt: new Date(Date.now() - 5 * 60_000),
          startedAt: new Date(Date.now() - 5 * 60_000),
          updatedAt: new Date(Date.now() - 2 * 60_000),
        }),
        getQueueJobSnapshot: async () => ({
          queueJobId: 'queue-job-cold-stale',
          state: 'active',
          attemptsMade: 0,
          processedOn: Date.now() - 5 * 60_000,
          finishedOn: null,
          timestamp: Date.now() - 5 * 60_000,
        }),
      },
    });

    const recovered = await service.recoverStaleColdToolCollectorJobIfNeeded();

    assert.equal(recovered.jobId, 'job-cold-stale');
    assert.equal(recovered.queueState, 'active');
    assert.equal(queueCalls.tryRemoveQueueJob.length, 0);
    assert.equal(jobLogCalls.failJob.length, 1);
    assert.equal(
      jobLogCalls.failJob[0].errorMessage.includes('watchdog recovered stale job'),
      true,
    );
    assert.equal(jobLogCalls.failJob[0].progress, 82);
    assert.deepEqual(jobLogCalls.failJob[0].result, {
      stale: true,
      recoveredByWatchdog: true,
      queueState: 'active',
      queueRemoved: false,
      queueJobId: 'queue-job-cold-stale',
      currentStage: 'cold_tool_discovery',
      runtimeUpdatedAt: staleAt,
      heartbeatAgeMs: recovered.heartbeatAgeMs,
    });
  } finally {
    if (typeof previousStaleMinutes === 'string') {
      process.env.COLD_TOOL_STALE_RUNTIME_MINUTES = previousStaleMinutes;
    } else {
      delete process.env.COLD_TOOL_STALE_RUNTIME_MINUTES;
    }
    if (typeof previousRuntimeHeartbeat === 'string') {
      process.env.QUEUE_RUNTIME_HEARTBEAT_MS = previousRuntimeHeartbeat;
    } else {
      delete process.env.QUEUE_RUNTIME_HEARTBEAT_MS;
    }
    if (typeof previousWatchdogInterval === 'string') {
      process.env.COLD_TOOL_WATCHDOG_INTERVAL_MS = previousWatchdogInterval;
    } else {
      delete process.env.COLD_TOOL_WATCHDOG_INTERVAL_MS;
    }
  }
});

test('queue worker cold-tool handler syncs collector progress into shared heartbeat', async () => {
  const heartbeatProgress = [];
  const queueProgress = [];
  const { service, jobLogCalls } = createService({
    gitHubColdToolCollectorService: {
      runCollectionDirect: async (_dto, options) => {
        await options.onProgress(82);
        return {
          queriesExecuted: 12,
          fetchedLinks: 48,
          coldToolEvaluated: 20,
          coldToolMatched: 5,
          deepAnalysisQueued: 3,
          activeDomains: ['problem_action_cli'],
          activeProgrammingLanguages: ['TypeScript'],
          topMatchedRepositoryIds: ['repo-1'],
        };
      },
    },
  });

  service.runQueuedJob = async (_job, executor) =>
    executor({
      setProgress: (progress) => {
        heartbeatProgress.push(progress);
      },
      stop: () => {},
    });

  const result = await service.handleGitHubColdToolCollect({
    id: 'queue-job-1',
    queueName: 'github.cold-tool-collect',
    data: {
      jobLogId: 'job-log-1',
      dto: {},
    },
    updateProgress: async (progress) => {
      queueProgress.push(progress);
    },
  });

  assert.deepEqual(heartbeatProgress, [82]);
  assert.deepEqual(queueProgress, [82]);
  assert.equal(jobLogCalls.updateJobProgress.length, 1);
  assert.equal(jobLogCalls.updateJobProgress[0].progress, 82);
  assert.equal(result.coldToolMatched, 5);
});

test('queue worker persists runtime stage changes immediately for cold-tool jobs', async () => {
  const { service, jobLogCalls } = createService({
    gitHubColdToolCollectorService: {
      runCollectionDirect: async (_dto, options) => {
        await options.onProgress(55);
        await options.onHeartbeat({
          currentStage: 'external_import',
          progress: 55,
        });
        await options.onProgress(82);
        await options.onHeartbeat({
          currentStage: 'cold_tool_discovery',
          progress: 82,
        });
        return {
          queriesExecuted: 12,
          fetchedLinks: 48,
          coldToolEvaluated: 20,
          coldToolMatched: 5,
          deepAnalysisQueued: 3,
          activeDomains: ['problem_action_cli'],
          activeProgrammingLanguages: ['TypeScript'],
          topMatchedRepositoryIds: ['repo-1'],
        };
      },
    },
  });

  service.runQueuedJob = async (_job, executor) =>
    executor({
      setProgress: () => {},
      stop: () => {},
    });

  await service.handleGitHubColdToolCollect({
    id: 'queue-job-stage',
    queueName: 'github.cold-tool-collect',
    data: {
      jobLogId: 'job-log-stage',
      dto: {},
    },
    updateProgress: async () => {},
  });

  const runtimeWrites = jobLogCalls.updateJobProgress.filter(
    (entry) => entry.result && entry.result.runtime,
  );

  assert.equal(runtimeWrites.length, 2);
  assert.equal(runtimeWrites[0].result.runtime.currentStage, 'external_import');
  assert.equal(runtimeWrites[1].result.runtime.currentStage, 'cold_tool_discovery');
});

test('queue worker analysis.single watchdog fails stale jobs and requeues them', async () => {
  const requeueCalls = [];
  const { service, jobLogCalls } = createService({
    prisma: {
      jobLog: {
        findMany: async () => [
          {
            id: 'analysis-job-log-1',
            queueJobId: 'analysis-queue-job-1',
            jobStatus: 'RUNNING',
            progress: 10,
            updatedAt: new Date(Date.now() - 40 * 60_000),
            payload: {
              repositoryId: 'repo-cold-1',
              dto: {
                runCompleteness: true,
                runIdeaFit: true,
                runIdeaExtract: true,
                runFastFilter: false,
                analysisLane: 'cold_tool',
              },
              fullDbCatchup: true,
            },
          },
        ],
      },
    },
    queueService: {
      getQueueJobSnapshot: async () => ({
        queueJobId: 'analysis-queue-job-1',
        state: 'active',
        attemptsMade: 0,
        processedOn: Date.now() - 40 * 60_000,
        finishedOn: null,
        timestamp: Date.now() - 40 * 60_000,
      }),
      enqueueSingleAnalysis: async (...args) => {
        requeueCalls.push(args);
        return {
          jobId: 'analysis-job-new',
          queueJobId: 'analysis-queue-job-new',
          queueName: 'analysis.single',
          jobStatus: 'PENDING',
        };
      },
    },
  });

  const summary = await service.recoverStaleAnalysisSingleJobsIfNeeded();

  assert.deepEqual(summary, {
    recoveredCount: 1,
    requeuedCount: 1,
    skippedCount: 0,
  });
  assert.equal(jobLogCalls.failJob.length, 1);
  assert.equal(
    jobLogCalls.failJob[0].errorMessage.includes('watchdog recovered stale running job'),
    true,
  );
  assert.equal(requeueCalls.length, 1);
  assert.equal(requeueCalls[0][0], 'repo-cold-1');
  assert.equal(requeueCalls[0][1].useDeepBundle, true);
  assert.equal(requeueCalls[0][2], 'analysis_single_watchdog');
});

test('queue worker skips inactive job log so stale queue retries cannot resurrect old cold-tool jobs', async () => {
  const updateProgressCalls = [];
  const { service } = createService({
    jobLogService: {
      markJobRunning: async () => ({
        id: 'job-log-stale',
        activated: false,
      }),
    },
    gitHubColdToolCollectorService: {
      runCollectionDirect: async () => {
        throw new Error('executor should not run');
      },
    },
  });

  const result = await service.runQueuedJob(
    {
      id: 'queue-job-stale',
      attemptsMade: 0,
      opts: {
        attempts: 3,
      },
      queueName: 'github.cold-tool-collect',
      data: {
        jobLogId: 'job-log-stale',
      },
      updateProgress: async (progress) => {
        updateProgressCalls.push(progress);
      },
    },
    async () => {
      throw new Error('should not execute');
    },
  );

  assert.deepEqual(updateProgressCalls, [10, 100]);
  assert.deepEqual(result, {
    skipped: true,
    reason: 'job_log_inactive',
  });
});
