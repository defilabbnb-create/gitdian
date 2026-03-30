const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GitHubRadarService,
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

test('topUpDeepAnalysisQueueIfNeeded uses bulk enqueue for eligible backlog candidates', async () => {
  const bulkCalls = [];
  const singleCalls = [];
  const schedulerEvents = [];
  const service = new GitHubRadarService(
    {
      jobLog: {
        findMany: async () => [],
      },
    },
    {
      enqueueSingleAnalysesBulk: async (entries, triggeredBy) => {
        bulkCalls.push({ entries, triggeredBy });
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.single',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
      enqueueSingleAnalysis: async (...args) => {
        singleCalls.push(args);
      },
    },
    {},
    {},
    {
      findDeepAnalysisBacklogCandidates: async () => [
        { id: 'repo-fast-filter', roughLevel: null },
        { id: 'repo-deep-ready', roughLevel: 'STRONG' },
      ],
    },
    {},
    {},
    {},
  );

  service.resolveDeepLowWatermark = () => 3;
  service.resolveDeepHighWatermark = () => 12;
  service.recordSchedulerEvent = async (type, payload) => {
    schedulerEvents.push({ type, payload });
  };

  const queued = await service.topUpDeepAnalysisQueueIfNeeded(
    { total: 1 },
    ['tools'],
  );

  assert.equal(queued, 2);
  assert.equal(bulkCalls.length, 1);
  assert.equal(singleCalls.length, 0);
  assert.equal(bulkCalls[0].triggeredBy, 'radar');
  assert.equal(bulkCalls[0].entries.length, 2);
  assert.equal(bulkCalls[0].entries[0].repositoryId, 'repo-fast-filter');
  assert.equal(bulkCalls[0].entries[0].dto.runFastFilter, true);
  assert.equal(bulkCalls[0].entries[1].repositoryId, 'repo-deep-ready');
  assert.equal(bulkCalls[0].entries[1].dto.runFastFilter, false);
  assert.deepEqual(schedulerEvents, [
    {
      type: 'top_up_deep_analysis',
      payload: {
        queued: 2,
        queueSizeBefore: 1,
        blockedByFrozenPool: 0,
      },
    },
  ]);
});

test('topUpDeepAnalysisQueueIfNeeded falls back to single enqueue after bulk failure', async () => {
  const singleCalls = [];
  const logs = [];
  const service = new GitHubRadarService(
    {
      jobLog: {
        findMany: async () => [
          {
            payload: {
              repositoryId: 'repo-already-active',
            },
          },
        ],
      },
    },
    {
      enqueueSingleAnalysesBulk: async () => {
        throw new Error('bulk failed');
      },
      enqueueSingleAnalysis: async (...args) => {
        singleCalls.push(args);
      },
    },
    {},
    {},
    {
      findDeepAnalysisBacklogCandidates: async () => [
        { id: 'repo-already-active', roughLevel: null },
        { id: 'repo-needs-queue', roughLevel: null },
      ],
    },
    {},
    {},
    {},
  );

  service.resolveDeepLowWatermark = () => 3;
  service.resolveDeepHighWatermark = () => 12;
  service.recordSchedulerEvent = async () => {};
  service.logger.warn = (message) => {
    logs.push(message);
  };

  const queued = await service.topUpDeepAnalysisQueueIfNeeded(
    { total: 1 },
    ['tools'],
  );

  assert.equal(queued, 1);
  assert.equal(singleCalls.length, 1);
  assert.equal(singleCalls[0][0], 'repo-needs-queue');
  assert.equal(singleCalls[0][1].runFastFilter, true);
  assert.equal(singleCalls[0][2], 'radar');
  assert.ok(
    logs.some((entry) =>
      entry.includes('radar deep backlog bulk enqueue failed'),
    ),
  );
});

test('topUpDeepAnalysisQueueIfNeeded skips frozen entries during single fallback and keeps allowed repos flowing', async () => {
  const singleCalls = [];
  const logs = [];
  const schedulerEvents = [];
  const service = new GitHubRadarService(
    {
      jobLog: {
        findMany: async () => [],
      },
    },
    {
      enqueueSingleAnalysesBulk: async () => {
        throw new Error(
          'analysis_pool_frozen_non_member:analysis_single blocked=repo-blocked',
        );
      },
      enqueueSingleAnalysis: async (repositoryId, ...args) => {
        if (repositoryId === 'repo-blocked') {
          throw new Error(
            'analysis_pool_frozen_non_member:analysis_single blocked=repo-blocked',
          );
        }
        singleCalls.push([repositoryId, ...args]);
      },
    },
    {},
    {},
    {
      findDeepAnalysisBacklogCandidates: async () => [
        { id: 'repo-blocked', roughLevel: null },
        { id: 'repo-allowed', roughLevel: 'STRONG' },
      ],
    },
    {},
    {},
    {},
  );

  service.resolveDeepLowWatermark = () => 3;
  service.resolveDeepHighWatermark = () => 12;
  service.recordSchedulerEvent = async (type, payload) => {
    schedulerEvents.push({ type, payload });
  };
  service.logger.warn = (message) => {
    logs.push(message);
  };

  const queued = await service.topUpDeepAnalysisQueueIfNeeded(
    { total: 1 },
    ['tools'],
  );

  assert.equal(queued, 1);
  assert.equal(singleCalls.length, 1);
  assert.equal(singleCalls[0][0], 'repo-allowed');
  assert.ok(
    logs.some((entry) =>
      entry.includes('radar deep backlog skipped frozen entry repositoryId=repo-blocked'),
    ),
  );
  assert.deepEqual(schedulerEvents, [
    {
      type: 'top_up_deep_analysis',
      payload: {
        queued: 1,
        queueSizeBefore: 1,
        blockedByFrozenPool: 1,
      },
    },
  ]);
});

test('topUpDeepAnalysisQueueIfNeeded skips frozen non-members and still queues frozen members', async () => {
  const bulkCalls = [];
  const schedulerEvents = [];
  const service = new GitHubRadarService(
    {
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (where.configKey === 'analysis.pool.freeze.state') {
            return {
              configValue: {
                analysisPoolFrozen: true,
                analysisPoolFreezeReason: 'test_freeze',
                analysisPoolFrozenAt: '2026-03-31T00:00:00.000Z',
                analysisPoolFrozenScope: 'all_new_entries',
                frozenAnalysisPoolBatchId: 'batch-1',
                frozenAnalysisPoolSnapshotAt: '2026-03-31T00:00:00.000Z',
              },
            };
          }

          if (where.configKey === 'analysis.pool.frozen_batch.latest') {
            return {
              configValue: {
                generatedAt: '2026-03-31T00:00:00.000Z',
                frozenAnalysisPoolBatchId: 'batch-1',
                frozenAnalysisPoolSnapshotAt: '2026-03-31T00:00:00.000Z',
                analysisPoolFrozenScope: 'all_new_entries',
                analysisPoolFreezeReason: 'test_freeze',
                repositoryIds: ['repo-member'],
                drainCandidates: {
                  modelARepositoryIds: [],
                  modelBRepositoryIds: [],
                  deleteCandidateRepositoryIds: [],
                },
                summary: {
                  totalPoolSize: 1,
                },
                topMembers: [],
              },
            };
          }

          return null;
        },
      },
    },
    {
      enqueueSingleAnalysesBulk: async (entries, triggeredBy) => {
        bulkCalls.push({ entries, triggeredBy });
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.single',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
      enqueueSingleAnalysis: async () => {},
    },
    {},
    {},
    {
      findDeepAnalysisBacklogCandidates: async () => [
        { id: 'repo-member', roughLevel: null },
        { id: 'repo-outsider', roughLevel: 'STRONG' },
      ],
    },
    {},
    {},
    {},
  );

  service.resolveDeepLowWatermark = () => 3;
  service.resolveDeepHighWatermark = () => 12;
  service.recordSchedulerEvent = async (type, payload) => {
    schedulerEvents.push({ type, payload });
  };

  const queued = await service.topUpDeepAnalysisQueueIfNeeded(
    { total: 1 },
    ['tools'],
  );

  assert.equal(queued, 1);
  assert.equal(bulkCalls.length, 1);
  assert.equal(bulkCalls[0].entries.length, 1);
  assert.equal(bulkCalls[0].entries[0].repositoryId, 'repo-member');
  assert.deepEqual(schedulerEvents, [
    {
      type: 'top_up_deep_analysis',
      payload: {
        queued: 1,
        queueSizeBefore: 1,
        blockedByFrozenPool: 1,
      },
    },
  ]);
});

test('runSchedulerTick skips keyword supply when analysis pool is frozen for new entries', async () => {
  const keywordSupplyCalls = [];
  const schedulerReasons = [];
  const service = new GitHubRadarService(
    {
      systemConfig: {
        findUnique: async () => null,
      },
    },
    {
      getQueueDepth: async () => ({
        total: 0,
      }),
    },
    {},
    {
      getDiagnostics: () => ({
        cooldownTokenCount: 0,
        disabledTokenCount: 0,
        lastKnownRateLimitStatus: null,
        anonymousFallback: false,
      }),
    },
    {},
    {},
    {
      evaluateAndAdjust: async () => ({
        currentSearchConcurrency: 4,
        targetSearchConcurrency: 4,
        adjustmentReason: 'boot_default',
      }),
      getDiagnostics: () => ({
        currentSearchConcurrency: 4,
        targetSearchConcurrency: 4,
        adjustmentReason: 'boot_default',
      }),
    },
    {
      maybeRunKeywordSupply: async () => {
        keywordSupplyCalls.push(true);
        return {
          executed: false,
          reason: 'not_called',
          group: null,
          result: null,
        };
      },
    },
  );

  service.ensureState = async () => ({
    mode: 'live',
    bootstrapStartDate: '2026-03-01',
    bootstrapCursorDate: '2026-03-24',
    bootstrapEndDate: '2026-03-31',
    bootstrapFastStartCursorDate: null,
    fastStartCompleted: true,
    lastScheduledAt: null,
    lastCompletedWindow: null,
    pendingWindow: null,
    isRunning: true,
    lastError: null,
    schedulerReason: 'idle',
  });
  service.maybeRunMaintenanceTick = async () => {};
  service.reconcilePendingWindow = async (state) => state;
  service.isContinuousRadarEnabled = () => true;
  service.resolveEffectiveBackfillQueueTotal = async () => 0;
  service.isBootstrapFastStartEnabled = () => false;
  service.isGitHubConservativeMode = () => false;
  service.buildContinuousBackfillDefaults = () => ({
    language: 'TypeScript',
    starMin: 1,
    perWindowLimit: 10,
    targetCategories: ['tools'],
  });
  service.resolveSnapshotHighWatermark = () => 24;
  service.resolveSnapshotLowWatermark = () => 6;
  service.resolveDeepLowWatermark = () => 2;
  service.topUpDeepAnalysisQueueIfNeeded = async () => 0;
  service.isAnalysisPoolFrozenForNewEntries = async () => true;
  service.updateSchedulerReason = async (_state, reason) => {
    schedulerReasons.push(reason);
  };
  service.recordSchedulerEvent = async () => {};

  await service.runSchedulerTick('interval');

  assert.equal(keywordSupplyCalls.length, 0);
  assert.deepEqual(schedulerReasons, ['analysis_pool_frozen']);
});
