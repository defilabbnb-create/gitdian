const test = require('node:test');
const assert = require('node:assert/strict');

const { GitHubService } = require('../dist/modules/github/github.service');

function createRepository(id, roughLevel = null) {
  return {
    id,
    roughLevel,
    stars: 0,
    analysis: {
      ideaSnapshotJson: null,
    },
    content: null,
  };
}

function createDecision(action = 'CLONE') {
  return {
    verdict: action === 'BUILD' ? 'GOOD' : 'OK',
    action,
    createdAtGithub: null,
    ideaFitScore: null,
    hasInsight: false,
    hasManualOverride: false,
    stars: 0,
  };
}

function buildService(overrides = {}) {
  return new GitHubService(
    overrides.prisma ?? {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
    },
    {},
    {},
    overrides.ideaSnapshotService ?? {
      readIdeaSnapshot: () => null,
      analyzeRepository: async () => ({
        oneLinerZh: '',
        isPromising: false,
        reason: '',
        category: null,
        toolLike: false,
        nextAction: 'SKIP',
        action: 'skipped',
      }),
    },
    {},
    {},
    overrides.queueService ?? {
      enqueueIdeaSnapshotsBulk: async () => [],
      enqueueSingleAnalysesBulk: async () => [],
      enqueueSingleAnalysis: async () => {},
    },
    overrides.frozenAnalysisPoolService ?? {
      includeRepositoryIdsInFrozenPoolSnapshot: async () => ({
        requestedRepositoryCount: 0,
        addedRepositoryCount: 0,
        alreadyMemberCount: 0,
        unresolvedRepositoryCount: 0,
        totalRepositoryCount: 0,
      }),
    },
  );
}

function installQueueRepositoryCandidatesStubs(service, overrides = {}) {
  service.isPromisingBackfillCandidate =
    overrides.isPromisingBackfillCandidate ?? (() => true);
  service.resolveBackfillCategory =
    overrides.resolveBackfillCategory ??
    (() => ({
      main: 'tools',
      sub: 'other',
    }));
  service.shouldDeepAnalyzeRepository =
    overrides.shouldDeepAnalyzeRepository ??
    (({ repository }) => repository.id !== 'repo-active-deep');
  service.shouldRefreshIdeaSnapshot =
    overrides.shouldRefreshIdeaSnapshot ?? (() => false);
  service.shouldRefreshDeepAnalysis =
    overrides.shouldRefreshDeepAnalysis ?? (() => true);
  service.resolveRepositoryDecision =
    overrides.resolveRepositoryDecision ?? (() => createDecision('CLONE'));
  service.recordDeepSupplyStats =
    overrides.recordDeepSupplyStats ?? (async () => {});
}

test('processIdeaSnapshotQueueJob forceDeepAnalysis bypasses refresh gating for historical repair snapshots', async () => {
  const service = buildService({
    prisma: {
      repository: {
        findMany: async () => [],
        findUnique: async () => createRepository('repo-force-deep'),
      },
      jobLog: {
        findMany: async () => [],
      },
    },
    ideaSnapshotService: {
      analyzeRepository: async () => ({
        oneLinerZh: '一个正在补全分析的高价值开发者工具',
        isPromising: false,
        reason: 'snapshot says skip',
        category: null,
        toolLike: false,
        nextAction: 'SKIP',
        action: 'skipped',
      }),
    },
  });

  service.shouldRefreshDeepAnalysis = () => false;
  service.shouldDeepAnalyzeRepository = () => false;
  service.hasActiveRepositoryJob = async () => false;

  const result = await service.processIdeaSnapshotQueueJob({
    repositoryId: 'repo-force-deep',
    windowDate: '2026-03-31',
    runFastFilter: false,
    runDeepAnalysis: true,
    forceDeepAnalysis: true,
    deepAnalysisOnlyIfPromising: false,
  });

  assert.equal(result.deepAnalysis.shouldQueue, true);
  assert.equal(result.deepAnalysis.runFastFilter, false);
  assert.equal(result.snapshot.nextAction, 'SKIP');
});

test('queueRepositoryCandidates batches active-job lookup and bulk deep enqueue', async () => {
  const jobFindManyCalls = [];
  const bulkCalls = [];
  const singleCalls = [];
  const service = buildService({
    prisma: {
      repository: {
        findMany: async () => [
          createRepository('repo-fast-filter'),
          createRepository('repo-active-deep'),
          createRepository('repo-rough-ready', 'STRONG'),
        ],
      },
      jobLog: {
        findMany: async (args) => {
          jobFindManyCalls.push(args);
          return [
            {
              jobName: 'analysis.run_single',
              payload: {
                repositoryId: 'repo-active-deep',
              },
            },
            {
              jobName: 'analysis.idea_snapshot',
              payload: {
                repositoryId: 'repo-outside-scope',
              },
            },
          ];
        },
      },
    },
    queueService: {
      enqueueIdeaSnapshotsBulk: async () => [],
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
  });

  installQueueRepositoryCandidatesStubs(service);

  const result = await service.queueRepositoryCandidates({
    repositoryIds: [
      'repo-fast-filter',
      'repo-active-deep',
      'repo-rough-ready',
    ],
    windowDate: '2026-03-30',
    runIdeaSnapshot: true,
    runFastFilter: true,
    runDeepAnalysis: true,
    deepAnalysisOnlyIfPromising: true,
    targetCategories: ['tools'],
    parentJobId: 'root-job-1',
    triggeredBy: 'radar',
    fromBackfill: false,
  });

  assert.equal(jobFindManyCalls.length, 1);
  assert.deepEqual(jobFindManyCalls[0].where.jobName.in.sort(), [
    'analysis.idea_snapshot',
    'analysis.run_single',
  ]);
  assert.equal(bulkCalls.length, 1);
  assert.equal(singleCalls.length, 0);
  assert.equal(bulkCalls[0].triggeredBy, 'radar');
  assert.equal(bulkCalls[0].entries.length, 2);
  assert.equal(bulkCalls[0].entries[0].repositoryId, 'repo-fast-filter');
  assert.equal(bulkCalls[0].entries[0].dto.runFastFilter, true);
  assert.equal(bulkCalls[0].entries[0].parentJobId, 'root-job-1');
  assert.equal(
    bulkCalls[0].entries[0].metadata.windowDate,
    '2026-03-30',
  );
  assert.equal(bulkCalls[0].entries[1].repositoryId, 'repo-rough-ready');
  assert.equal(bulkCalls[0].entries[1].dto.runFastFilter, false);
  assert.equal(result.snapshotQueued, 0);
  assert.equal(result.deepAnalysisQueued, 2);
  assert.equal(result.deepSkipped, 0);
  assert.deepEqual(result.topRepositoryIds.sort(), [
    'repo-active-deep',
    'repo-fast-filter',
    'repo-rough-ready',
  ]);
});

test('queueRepositoryCandidates falls back to single enqueue when bulk deep enqueue fails', async () => {
  const singleCalls = [];
  const logs = [];
  const service = buildService({
    prisma: {
      repository: {
        findMany: async () => [
          createRepository('repo-fast-filter'),
          createRepository('repo-rough-ready', 'STRONG'),
        ],
      },
      jobLog: {
        findMany: async () => [],
      },
    },
    queueService: {
      enqueueIdeaSnapshotsBulk: async () => [],
      enqueueSingleAnalysesBulk: async () => {
        throw new Error('bulk failed');
      },
      enqueueSingleAnalysis: async (...args) => {
        singleCalls.push(args);
      },
    },
  });

  installQueueRepositoryCandidatesStubs(service);
  service.logger.warn = (message) => {
    logs.push(message);
  };

  const result = await service.queueRepositoryCandidates({
    repositoryIds: ['repo-fast-filter', 'repo-rough-ready'],
    windowDate: '2026-03-30',
    runIdeaSnapshot: true,
    runFastFilter: true,
    runDeepAnalysis: true,
    deepAnalysisOnlyIfPromising: true,
    targetCategories: ['tools'],
    parentJobId: 'root-job-2',
    triggeredBy: 'backfill',
    fromBackfill: true,
  });

  assert.equal(result.deepAnalysisQueued, 2);
  assert.equal(singleCalls.length, 2);
  assert.equal(singleCalls[0][0], 'repo-fast-filter');
  assert.equal(singleCalls[0][1].runFastFilter, true);
  assert.equal(singleCalls[0][2], 'backfill');
  assert.equal(singleCalls[0][3].parentJobId, 'root-job-2');
  assert.equal(singleCalls[0][3].metadata.fromBackfill, true);
  assert.equal(singleCalls[1][0], 'repo-rough-ready');
  assert.equal(singleCalls[1][1].runFastFilter, false);
  assert.ok(
    logs.some((entry) =>
      entry.includes('github deep child bulk enqueue failed'),
    ),
  );
});

test('queueRepositoryCandidates retries frozen deep entries after frozen-pool promotion', async () => {
  const singleCalls = [];
  const promotionCalls = [];
  const logs = [];
  const service = buildService({
    prisma: {
      repository: {
        findMany: async () => [
          createRepository('repo-ok'),
          createRepository('repo-frozen'),
        ],
      },
      jobLog: {
        findMany: async () => [],
      },
    },
    queueService: {
      enqueueIdeaSnapshotsBulk: async () => [],
      enqueueSingleAnalysesBulk: async () => {
        throw new Error(
          'analysis_pool_frozen_non_member:analysis_single blocked=repo-frozen',
        );
      },
      enqueueSingleAnalysis: async (repositoryId, _dto, _triggeredBy, options) => {
        singleCalls.push({
          repositoryId,
          frozenPoolPromotionApplied:
            options?.metadata?.frozenPoolPromotionApplied === true,
        });
        if (
          repositoryId === 'repo-frozen' &&
          options?.metadata?.frozenPoolPromotionApplied !== true
        ) {
          throw new Error(
            'analysis_pool_frozen_non_member:analysis_single blocked=repo-frozen',
          );
        }
      },
    },
    frozenAnalysisPoolService: {
      includeRepositoryIdsInFrozenPoolSnapshot: async (payload) => {
        promotionCalls.push(payload);
        return {
          requestedRepositoryCount: payload.repositoryIds.length,
          addedRepositoryCount: payload.repositoryIds.length,
          alreadyMemberCount: 0,
          unresolvedRepositoryCount: 0,
          totalRepositoryCount: payload.repositoryIds.length,
        };
      },
    },
  });

  installQueueRepositoryCandidatesStubs(service, {
    shouldRefreshIdeaSnapshot: () => false,
    shouldRefreshDeepAnalysis: () => true,
  });
  service.logger.warn = (message) => {
    logs.push(message);
  };

  const result = await service.queueRepositoryCandidates({
    repositoryIds: ['repo-ok', 'repo-frozen'],
    windowDate: '2026-03-30',
    runIdeaSnapshot: false,
    runFastFilter: true,
    runDeepAnalysis: true,
    deepAnalysisOnlyIfPromising: true,
    targetCategories: ['tools'],
    parentJobId: 'root-job-2b',
    triggeredBy: 'backfill',
    fromBackfill: true,
  });

  assert.equal(result.snapshotQueued, 0);
  assert.equal(result.deepAnalysisQueued, 2);
  assert.deepEqual(singleCalls, [
    {
      repositoryId: 'repo-ok',
      frozenPoolPromotionApplied: false,
    },
    {
      repositoryId: 'repo-frozen',
      frozenPoolPromotionApplied: false,
    },
    {
      repositoryId: 'repo-frozen',
      frozenPoolPromotionApplied: true,
    },
  ]);
  assert.deepEqual(promotionCalls, [
    {
      repositoryIds: ['repo-frozen'],
      reason: 'github_deep_child_enqueue',
    },
  ]);
  assert.ok(
    logs.some((entry) =>
      entry.includes('github deep child bulk enqueue failed'),
    ),
  );
});

test('queueRepositoryCandidates retries frozen snapshot entries after frozen-pool promotion', async () => {
  const bulkCalls = [];
  const singleCalls = [];
  const promotionCalls = [];
  const logs = [];
  const service = buildService({
    prisma: {
      repository: {
        findMany: async () => [
          createRepository('repo-ok'),
          createRepository('repo-frozen'),
        ],
      },
      jobLog: {
        findMany: async () => [],
      },
    },
    queueService: {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        bulkCalls.push(entries);
        throw new Error(
          'analysis_pool_frozen_non_member:analysis_snapshot blocked=repo-frozen',
        );
      },
      enqueueIdeaSnapshot: async (payload) => {
        singleCalls.push(payload);
        if (
          payload.repositoryId === 'repo-frozen' &&
          payload.frozenPoolPromotionApplied !== true
        ) {
          throw new Error(
            'analysis_pool_frozen_non_member:analysis_snapshot blocked=repo-frozen',
          );
        }
        return {
          jobId: `job-${payload.repositoryId}`,
          queueName: 'analysis.snapshot',
          queueJobId: `queue-job-${payload.repositoryId}`,
          jobStatus: 'PENDING',
        };
      },
      enqueueSingleAnalysesBulk: async () => [],
      enqueueSingleAnalysis: async () => {},
    },
    frozenAnalysisPoolService: {
      includeRepositoryIdsInFrozenPoolSnapshot: async (payload) => {
        promotionCalls.push(payload);
        return {
          requestedRepositoryCount: payload.repositoryIds.length,
          addedRepositoryCount: payload.repositoryIds.length,
          alreadyMemberCount: 0,
          unresolvedRepositoryCount: 0,
          totalRepositoryCount: payload.repositoryIds.length,
        };
      },
    },
  });

  installQueueRepositoryCandidatesStubs(service, {
    shouldRefreshIdeaSnapshot: () => true,
    shouldRefreshDeepAnalysis: () => false,
  });
  service.logger.warn = (message) => {
    logs.push(message);
  };

  const result = await service.queueRepositoryCandidates({
    repositoryIds: ['repo-ok', 'repo-frozen'],
    windowDate: '2026-03-30',
    runIdeaSnapshot: true,
    runFastFilter: true,
    runDeepAnalysis: false,
    deepAnalysisOnlyIfPromising: true,
    targetCategories: ['tools'],
    parentJobId: 'root-job-3',
    triggeredBy: 'radar',
    fromBackfill: false,
  });

  assert.equal(bulkCalls.length, 1);
  assert.equal(singleCalls.length, 3);
  assert.deepEqual(
    singleCalls.map((payload) => payload.repositoryId),
    ['repo-ok', 'repo-frozen', 'repo-frozen'],
  );
  assert.equal(
    singleCalls[2].frozenPoolPromotionApplied,
    true,
  );
  assert.deepEqual(promotionCalls, [
    {
      repositoryIds: ['repo-frozen'],
      reason: 'github_snapshot_enqueue',
    },
  ]);
  assert.equal(result.snapshotQueued, 2);
  assert.equal(result.deepAnalysisQueued, 0);
  assert.ok(
    logs.some((entry) =>
      entry.includes('github snapshot bulk enqueue failed'),
    ),
  );
});
