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
