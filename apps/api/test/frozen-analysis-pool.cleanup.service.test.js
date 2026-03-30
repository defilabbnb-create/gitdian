const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FrozenAnalysisPoolService,
} = require('../dist/modules/analysis/frozen-analysis-pool.service');

function makeMember(overrides = {}) {
  return {
    repositoryId: 'repo-1',
    fullName: 'acme/repo-1',
    cleanupState: 'archive',
    analysisCompletionState: 'completed_not_useful_archived',
    deleteCandidate: false,
    runningJobs: 0,
    ...overrides,
  };
}

test('cleanupArchivedAndPurgeReadyMembers cancels pending work and purges safe derived data for purge_ready repos', async () => {
  const snapshotDeleteCalls = [];
  const cachedRankingDeleteCalls = [];
  const deletedJobIds = [];
  const savedConfigs = [];

  const service = new FrozenAnalysisPoolService(
    {
      repositorySnapshot: {
        deleteMany: async (input) => {
          snapshotDeleteCalls.push(input);
          return { count: 3 };
        },
      },
      repositoryCachedRanking: {
        deleteMany: async (input) => {
          cachedRankingDeleteCalls.push(input);
          return { count: 1 };
        },
      },
      jobLog: {
        findMany: async () => [
          {
            id: 'terminal-archive',
            payload: {
              repositoryId: 'repo-archive',
            },
          },
          {
            id: 'terminal-purge',
            payload: {
              repositoryId: 'repo-purge',
            },
          },
          {
            id: 'terminal-other',
            payload: {
              repositoryId: 'repo-other',
            },
          },
        ],
        deleteMany: async (input) => {
          deletedJobIds.push(...input.where.id.in);
          return { count: input.where.id.in.length };
        },
      },
      systemConfig: {
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
  );

  const cancelledJobs = [];
  service.logger.log = () => {};
  service.loadFrozenPendingQueueJobs = async () => [
    {
      jobId: 'pending-archive',
      repositoryId: 'repo-archive',
      member: makeMember({
        repositoryId: 'repo-archive',
        fullName: 'acme/archive',
        cleanupState: 'archive',
      }),
    },
    {
      jobId: 'pending-purge',
      repositoryId: 'repo-purge',
      member: makeMember({
        repositoryId: 'repo-purge',
        fullName: 'acme/purge',
        cleanupState: 'purge_ready',
      }),
    },
  ];
  service.cancelPendingJobWithFallback = async (jobId) => {
    cancelledJobs.push(jobId);
  };
  service.saveSystemConfig = async (key, value) => {
    savedConfigs.push({ key, value });
  };

  const result = await service.cleanupArchivedAndPurgeReadyMembers({
    members: [
      makeMember({
        repositoryId: 'repo-archive',
        fullName: 'acme/archive',
        cleanupState: 'archive',
      }),
      makeMember({
        repositoryId: 'repo-purge',
        fullName: 'acme/purge',
        cleanupState: 'purge_ready',
      }),
      makeMember({
        repositoryId: 'repo-delete',
        fullName: 'acme/delete',
        cleanupState: 'purge_ready',
        deleteCandidate: true,
      }),
      makeMember({
        repositoryId: 'repo-active',
        fullName: 'acme/active',
        cleanupState: 'active',
        analysisCompletionState: 'still_incomplete',
      }),
    ],
    batchId: 'batch-1',
    cleanedAt: '2026-03-30T00:00:00.000Z',
  });

  assert.deepEqual(cancelledJobs.sort(), ['pending-archive', 'pending-purge']);
  assert.equal(snapshotDeleteCalls.length, 1);
  assert.deepEqual(snapshotDeleteCalls[0].where.repositoryId.in, ['repo-purge']);
  assert.equal(cachedRankingDeleteCalls.length, 1);
  assert.deepEqual(cachedRankingDeleteCalls[0].where.repoId.in, ['repo-purge']);
  assert.deepEqual(deletedJobIds.sort(), ['terminal-archive', 'terminal-purge']);
  assert.equal(result.targetedRepositoryCount, 2);
  assert.equal(result.archiveRepositoryCount, 1);
  assert.equal(result.purgeReadyRepositoryCount, 1);
  assert.equal(result.cancelledPendingJobCount, 2);
  assert.equal(result.cancelledRepositoryCount, 2);
  assert.equal(result.purgedRepositoryCount, 1);
  assert.equal(result.purgedSnapshotCount, 3);
  assert.equal(result.purgedCachedRankingCount, 1);
  assert.equal(result.deletedTerminalJobLogCount, 2);
  assert.equal(savedConfigs[0].key, 'analysis.pool.cleanup.latest');
});
