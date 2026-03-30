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

function createService() {
  const refreshCalls = [];
  const completenessCalls = [];
  const ideaFitCalls = [];
  const ideaExtractCalls = [];

  const prisma = {
    repository: {
      findUnique: async () => createRepository(),
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
      get: () => null,
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
  service.ensureMissingDeepAnalysisQueued = async () => {};

  return {
    service,
    refreshCalls,
    completenessCalls,
    ideaFitCalls,
    ideaExtractCalls,
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
