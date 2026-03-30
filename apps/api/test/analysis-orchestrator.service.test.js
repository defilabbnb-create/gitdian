const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AnalysisOrchestratorService,
} = require('../dist/modules/analysis/analysis-orchestrator.service');

function createRepository(overrides = {}) {
  return {
    id: 'repo-1',
    name: 'repo-1',
    fullName: 'acme/repo-1',
    description: 'Useful repo',
    language: 'TypeScript',
    topics: ['ai'],
    categoryL1: 'ai',
    toolLikeScore: { toNumber: () => 80 },
    completenessScore: null,
    completenessLevel: null,
    ideaFitScore: null,
    updatedAt: new Date('2026-03-30T00:00:00.000Z'),
    updatedAtGithub: new Date('2026-03-30T00:00:00.000Z'),
    createdAt: new Date('2026-03-29T00:00:00.000Z'),
    createdAtGithub: new Date('2026-03-29T00:00:00.000Z'),
    analysis: {},
    content: {
      readmeText: 'README',
    },
    ...overrides,
  };
}

function createService(options = {}) {
  const refreshCalls = [];
  const completenessCalls = [];
  const ideaFitCalls = [];
  const ideaExtractCalls = [];
  const enqueueCalls = [];
  let repositoryFindUniqueCount = 0;
  let ensureMissingDeepCallCount = 0;

  const prisma = {
    repository: {
      findUnique: async () => {
        repositoryFindUniqueCount += 1;
        return createRepository(options.repositoryOverrides);
      },
    },
    jobLog: {
      findFirst: async () => options.existingBackstopJob ?? null,
    },
    systemConfig: {
      findUnique: async () => null,
      upsert: async () => null,
    },
  };

  const service = new AnalysisOrchestratorService(
    prisma,
    {
      evaluateRepository: async () => ({
        roughPass: true,
        roughLevel: 'HIGH',
        toolLikeScore: 80,
      }),
    },
    {},
    {
      analyzeRepository: async (_repositoryId, options = {}) => {
        completenessCalls.push(options);
        return {
          completenessScore: 78,
          completenessLevel: 'HIGH',
        };
      },
    },
    {
      analyzeRepository: async (_repositoryId, options = {}) => {
        ideaFitCalls.push(options);
        return {
          ideaFitScore: 82,
          opportunityLevel: 'A',
        };
      },
    },
    {
      analyzeRepository: async (_repositoryId, options = {}) => {
        ideaExtractCalls.push(options);
        return {
          repositoryId: 'repo-1',
          action: 'updated',
          ideaSummary: 'summary',
          problem: 'problem',
          solution: 'solution',
          targetUsers: ['users'],
          productForm: 'SAAS',
          mvpPlan: 'mvp',
          differentiation: 'diff',
          monetization: 'subscription',
          whyNow: 'now',
          risks: ['risk'],
          confidence: 0.8,
          provider: 'test',
          model: 'mock',
          latencyMs: 10,
          fallbackUsed: false,
          extractMode: 'full',
        };
      },
      getIdeaExtractLimiterState: () => ({
        inflight: 0,
        maxInflight: 2,
      }),
    },
    {
      readIdeaSnapshot: () => null,
    },
    {
      refreshInsight: async (repositoryId, behaviorContext) => {
        refreshCalls.push({
          repositoryId,
          behaviorContext,
        });
        return {
          repositoryId,
          insight: {},
        };
      },
    },
    {
      attachDerivedAssets: async (value) => value,
    },
    {
      getLatestKnowledge: async () => null,
    },
    {
      getCurrentPolicy: async () => ({
        systemLoadLevel: 'normal',
      }),
    },
    {
      get: () =>
        options.queueService ?? {
          enqueueSingleAnalysis: async (...args) => {
            enqueueCalls.push(args);
          },
        },
    },
  );

  service.shouldRunIdeaExtract = async () => ({
    shouldRun: true,
    mode: 'full',
    reason: 'eligible_high_value',
    trace: ['eligible_high_value'],
    strength: 'STRONG',
    effectiveStrength: 'STRONG',
  });
  service.recordDeepRuntimeStats = async () => {};
  if (options.stubEnsureMissingDeep !== false) {
    service.ensureMissingDeepAnalysisQueued = async () => {
      ensureMissingDeepCallCount += 1;
    };
  } else {
    const originalEnsureMissingDeep =
      service.ensureMissingDeepAnalysisQueued.bind(service);
    service.ensureMissingDeepAnalysisQueued = async (...args) => {
      ensureMissingDeepCallCount += 1;
      return originalEnsureMissingDeep(...args);
    };
  }

  return {
    service,
    refreshCalls,
    completenessCalls,
    ideaFitCalls,
    ideaExtractCalls,
    enqueueCalls,
    getRepositoryFindUniqueCount: () => repositoryFindUniqueCount,
    getEnsureMissingDeepCallCount: () => ensureMissingDeepCallCount,
  };
}

async function withEnv(overrides, run) {
  const previous = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);

    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}

test('single repository orchestration defers intermediate insight refreshes to the orchestrator', async () => {
  const {
    service,
    refreshCalls,
    completenessCalls,
    ideaFitCalls,
    ideaExtractCalls,
  } = createService();

  const result = await service.runRepositoryAnalysisDirect('repo-1', {
    runFastFilter: false,
    runCompleteness: true,
    runIdeaFit: true,
    runIdeaExtract: true,
    forceRerun: false,
    userSuccessPatterns: ['b2b'],
    userFailurePatterns: ['ad-only'],
    preferredCategories: ['ai'],
    avoidedCategories: ['game'],
    recentValidatedWins: ['agent'],
    recentDroppedReasons: ['weak distribution'],
  });

  assert.equal(result.repositoryId, 'repo-1');
  assert.deepEqual(completenessCalls, [{ refreshInsight: false }]);
  assert.deepEqual(ideaFitCalls, [{ refreshInsight: false }]);
  assert.deepEqual(ideaExtractCalls, [
    {
      deferIfBusy: true,
      mode: 'full',
      refreshInsight: false,
    },
  ]);
  assert.equal(refreshCalls.length, 2);
  assert.deepEqual(refreshCalls[0], {
    repositoryId: 'repo-1',
    behaviorContext: undefined,
  });
  assert.deepEqual(refreshCalls[1], {
    repositoryId: 'repo-1',
    behaviorContext: {
      userSuccessPatterns: ['b2b'],
      userFailurePatterns: ['ad-only'],
      preferredCategories: ['ai'],
      avoidedCategories: ['game'],
      recentValidatedWins: ['agent'],
      recentDroppedReasons: ['weak distribution'],
    },
  });
});

test('refresh-only orchestration uses direct insight refresh path without deep backstop checks', async () => {
  const {
    service,
    refreshCalls,
    getRepositoryFindUniqueCount,
    getEnsureMissingDeepCallCount,
  } = createService({
    stubEnsureMissingDeep: false,
  });

  const result = await service.runRepositoryAnalysisDirect('repo-1', {
    runFastFilter: false,
    runCompleteness: false,
    runIdeaFit: false,
    runIdeaExtract: false,
    forceRerun: true,
    userSuccessPatterns: ['b2b'],
    userFailurePatterns: [],
    preferredCategories: [],
    avoidedCategories: [],
    recentValidatedWins: [],
    recentDroppedReasons: [],
  });

  assert.equal(result.repositoryId, 'repo-1');
  assert.equal(refreshCalls.length, 1);
  assert.deepEqual(refreshCalls[0], {
    repositoryId: 'repo-1',
    behaviorContext: {
      userSuccessPatterns: ['b2b'],
      userFailurePatterns: [],
      preferredCategories: [],
      avoidedCategories: [],
      recentValidatedWins: [],
      recentDroppedReasons: [],
    },
  });
  assert.equal(getRepositoryFindUniqueCount(), 0);
  assert.equal(getEnsureMissingDeepCallCount(), 0);
  assert.equal(result.steps.fastFilter.status, 'skipped');
  assert.equal(result.steps.completeness.status, 'skipped');
  assert.equal(result.steps.ideaFit.status, 'skipped');
  assert.equal(result.steps.ideaExtract.status, 'skipped');
});

test('batch orchestration respects concurrency caps while preserving item order', async () => {
  const { service } = createService();
  const repositories = ['repo-1', 'repo-2', 'repo-3', 'repo-4'].map((id) => ({
    id,
  }));
  let inflight = 0;
  let maxInflight = 0;

  service.selectBatchRepositories = async () => repositories;
  service.executeRepositoryAnalysis = async (repositoryId) => {
    inflight += 1;
    maxInflight = Math.max(maxInflight, inflight);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inflight -= 1;

    return {
      repositoryId,
      steps: {
        fastFilter: {
          status: 'executed',
          message: 'ok',
        },
        completeness: {
          status: 'skipped',
          message: 'skip',
        },
        ideaFit: {
          status: 'skipped',
          message: 'skip',
        },
        ideaExtract: {
          status: 'skipped',
          message: 'skip',
        },
      },
    };
  };

  await withEnv(
    {
      BATCH_ANALYSIS_CONCURRENCY: '4',
      DEEP_ANALYSIS_CONCURRENCY: '2',
    },
    async () => {
      const result = await service.runBatchAnalysisDirect({
        runFastFilter: false,
        runCompleteness: false,
        runIdeaFit: false,
        runIdeaExtract: false,
        forceRerun: false,
        onlyIfMissing: false,
        limit: 4,
      });

      assert.equal(maxInflight, 2);
      assert.equal(result.processed, 4);
      assert.equal(result.succeeded, 4);
      assert.equal(result.failed, 0);
      assert.deepEqual(
        result.items.map((item) => item.repositoryId),
        ['repo-1', 'repo-2', 'repo-3', 'repo-4'],
      );
    },
  );
});

test('missing deep backstop does not re-enqueue idea extract when the gate blocks it', async () => {
  const repository = createRepository({
    analysis: {
      completenessJson: { ok: true },
      ideaFitJson: { ok: true },
      extractedIdeaJson: null,
    },
    finalDecision: {
      repoId: 'repo-1',
    },
    analysisState: {
      deepReady: false,
      analysisStatus: 'DISPLAY_READY',
    },
  });
  const { service, enqueueCalls } = createService({
    repositoryOverrides: repository,
    stubEnsureMissingDeep: false,
  });

  service.shouldRunIdeaExtract = async () => ({
    shouldRun: false,
    mode: 'skip',
    reason: 'strength_not_strong',
    trace: ['one_liner_strength_weak'],
    strength: 'WEAK',
    effectiveStrength: 'WEAK',
  });

  await service.ensureMissingDeepAnalysisQueued('repo-1');

  assert.equal(enqueueCalls.length, 0);
});

test('missing deep backstop still queues remaining deep steps when idea extract is gate-blocked', async () => {
  const repository = createRepository({
    analysis: {
      completenessJson: null,
      ideaFitJson: { ok: true },
      extractedIdeaJson: null,
    },
    finalDecision: {
      repoId: 'repo-1',
    },
    analysisState: {
      deepReady: false,
      analysisStatus: 'DISPLAY_READY',
    },
  });
  const { service, enqueueCalls } = createService({
    repositoryOverrides: repository,
    stubEnsureMissingDeep: false,
  });

  service.shouldRunIdeaExtract = async () => ({
    shouldRun: false,
    mode: 'skip',
    reason: 'strength_not_strong',
    trace: ['one_liner_strength_weak'],
    strength: 'WEAK',
    effectiveStrength: 'WEAK',
  });

  await service.ensureMissingDeepAnalysisQueued('repo-1');

  assert.equal(enqueueCalls.length, 1);
  assert.equal(enqueueCalls[0][0], 'repo-1');
  assert.deepEqual(enqueueCalls[0][1], {
    runFastFilter: false,
    runCompleteness: true,
    runIdeaFit: false,
    runIdeaExtract: false,
    forceRerun: false,
  });
});

test('missing deep backstop force-reruns legacy score-only deep steps so json can be backfilled', async () => {
  const repository = createRepository({
    completenessScore: 78,
    ideaFitScore: 82,
    analysis: {
      completenessJson: null,
      ideaFitJson: null,
      extractedIdeaJson: { ok: true },
    },
    finalDecision: {
      repoId: 'repo-1',
    },
    analysisState: {
      deepReady: false,
      analysisStatus: 'DISPLAY_READY',
    },
  });
  const { service, enqueueCalls } = createService({
    repositoryOverrides: repository,
    stubEnsureMissingDeep: false,
  });

  await service.ensureMissingDeepAnalysisQueued('repo-1');

  assert.equal(enqueueCalls.length, 1);
  assert.equal(enqueueCalls[0][0], 'repo-1');
  assert.deepEqual(enqueueCalls[0][1], {
    runFastFilter: false,
    runCompleteness: true,
    runIdeaFit: true,
    runIdeaExtract: false,
    forceRerun: true,
  });
  assert.deepEqual(enqueueCalls[0][3], {
    metadata: {
      missingDeepAfterFinalDecision: true,
      recoveryMode: 'forced_missing_deep',
      forceBackfillMissingJson: true,
    },
  });
});

test('missing deep backstop does not enqueue duplicate backstop work for the same repository', async () => {
  const repository = createRepository({
    analysis: {
      completenessJson: null,
      ideaFitJson: null,
      extractedIdeaJson: null,
    },
    finalDecision: {
      repoId: 'repo-1',
    },
    analysisState: {
      deepReady: false,
      analysisStatus: 'DISPLAY_READY',
    },
  });
  const { service, enqueueCalls } = createService({
    repositoryOverrides: repository,
    existingBackstopJob: {
      id: 'job-1',
    },
    stubEnsureMissingDeep: false,
  });

  await service.ensureMissingDeepAnalysisQueued('repo-1');

  assert.equal(enqueueCalls.length, 0);
});
