const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AdaptiveSchedulerService,
} = require('../dist/modules/scheduler/adaptive-scheduler.service');

function createPrismaStub() {
  const store = new Map();

  return {
    store,
    systemConfig: {
      findUnique: async ({ where }) => store.get(where.configKey) ?? null,
      upsert: async ({ where, update, create }) => {
        const value = {
          configKey: where.configKey,
          configValue: update?.configValue ?? create.configValue,
        };
        store.set(where.configKey, value);
        return value;
      },
    },
    repository: {
      findUnique: async () => ({
        id: 'repo-1',
        analysis: {
          fallbackUsed: false,
          ideaFitJson: null,
          extractedIdeaJson: null,
          completenessJson: null,
          claudeReviewStatus: null,
        },
      }),
    },
    repositoryCachedRanking: {
      findUnique: async () => ({
        repoId: 'repo-1',
        moneyPriority: 'P1',
        decisionSource: 'local',
        hasConflict: false,
        needsRecheck: false,
      }),
      findMany: async () => [{ repoId: 'repo-1' }],
    },
    dailyRadarSummary: {
      findMany: async () => [],
    },
  };
}

function createBehaviorMemoryStub() {
  return {
    getState: async () => ({
      recentActionOutcomes: [],
    }),
  };
}

test('adaptive scheduler dry-run does not persist state but apply does', async () => {
  const prisma = createPrismaStub();
  const service = new AdaptiveSchedulerService(
    prisma,
    createBehaviorMemoryStub(),
  );

  prisma.store.set('health.daily.latest', {
    configKey: 'health.daily.latest',
    configValue: {
      generatedAt: '2026-03-25T00:00:00.000Z',
      summary: {
        repoSummary: {
          totalRepos: 1000,
          deepDoneRepos: 10,
          fullyAnalyzedRepos: 10,
          incompleteRepos: 950,
          fallbackRepos: 0,
          severeConflictRepos: 0,
        },
        analysisGapSummary: {
          finalDecisionButNoDeepCount: 900,
          deepQueuedButNotDoneCount: 100,
          claudeEligibleButNotReviewedCount: 0,
          fallbackButStillVisibleCount: 0,
          mostCommonIncompleteReason: 'NO_DEEP_ANALYSIS',
        },
        homepageSummary: {
          homepageTotal: 100,
          homepageUnsafe: 0,
          homepageIncomplete: 0,
          homepageFallback: 0,
          homepageConflict: 0,
          homepageNoDeepButStrong: 0,
        },
        qualitySummary: {
          badTemplateCount: 0,
        },
        queueSummary: {
          deepQueue: { total: 100 },
          snapshotQueue: { total: 100 },
          claudeQueue: { queueSize: 0 },
        },
        taskSummary: {
          pendingCount: 0,
          runningCount: 0,
          failedCount: 0,
          stalledCount: 0,
        },
        exposureSummary: {
          moneyPriorityHighButIncomplete: 10,
        },
      },
    },
  });

  const dryRun = await service.evaluate({ apply: false });
  assert.equal(dryRun.applied, false);
  assert.equal(prisma.store.has('scheduler.adaptive.state'), false);

  const apply = await service.evaluate({ apply: true });
  assert.equal(apply.applied, true);
  assert.equal(prisma.store.has('scheduler.adaptive.state'), true);
});
