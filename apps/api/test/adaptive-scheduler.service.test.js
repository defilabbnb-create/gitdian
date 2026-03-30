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

function createModuleRefStub(recoveryService = null) {
  return {
    get(target) {
      if (
        recoveryService &&
        target &&
        target.name === 'HistoricalDataRecoveryService'
      ) {
        return recoveryService;
      }

      return null;
    },
  };
}

test('adaptive scheduler dry-run does not persist state but apply does', async () => {
  const prisma = createPrismaStub();
  const service = new AdaptiveSchedulerService(
    prisma,
    createBehaviorMemoryStub(),
    createModuleRefStub(),
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

test('adaptive scheduler triggers recovery when health crosses loop thresholds', async () => {
  const prisma = createPrismaStub();
  const recoveryCalls = [];
  const service = new AdaptiveSchedulerService(
    prisma,
    createBehaviorMemoryStub(),
    createModuleRefStub({
      runHistoricalRepairLoop: async (input) => {
        recoveryCalls.push(input);
        return {
          selectedCount: input.limit,
          execution: {
            downgradeOnly: input.buckets[0] === 'visible_broken' ? 5 : 0,
            refreshOnly: 0,
            evidenceRepair: input.buckets[0] === 'high_value_weak' ? 10 : 0,
            deepRepair: input.limit,
            decisionRecalc: input.buckets[0] === 'visible_broken' ? 3 : 2,
            archive: 0,
          },
          queueSummary: {
            totalQueued: input.limit,
          },
          routerExecutionSummary: {
            routerCapabilityBreakdown: {
              LIGHT: 0,
              STANDARD: 0,
              HEAVY: input.buckets[0] === 'high_value_weak' ? input.limit : 0,
              REVIEW: input.buckets[0] === 'visible_broken' ? input.limit : 0,
              DETERMINISTIC_ONLY: 0,
            },
            routerFallbackBreakdown: {
              NONE: 0,
              PROVIDER_FALLBACK: 0,
              DETERMINISTIC_ONLY: 0,
              LIGHT_DERIVATION: 0,
              RETRY_THEN_REVIEW: input.limit,
              RETRY_THEN_DOWNGRADE: 0,
              DOWNGRADE_ONLY: 0,
            },
            routerReviewRequiredCount:
              input.buckets[0] === 'visible_broken' ? input.limit : 0,
            routerDeterministicOnlyCount: 0,
            frozenOrArchivedTaskSuppressedCount: 0,
          },
        };
      },
    }),
  );

  const result = await service.triggerRecoveryFromHealth({
    generatedAt: '2026-03-26T00:00:00.000Z',
    status: 'CRITICAL',
    summary: {
      repoSummary: {
        totalRepos: 20000,
        deepDoneRepos: 500,
        fullyAnalyzedRepos: 500,
        incompleteRepos: 19500,
        fallbackRepos: 100,
        severeConflictRepos: 10,
      },
      analysisGapSummary: {
        finalDecisionButNoDeepCount: 15000,
        deepQueuedButNotDoneCount: 300,
        claudeEligibleButNotReviewedCount: 120,
        fallbackButStillVisibleCount: 30,
        mostCommonIncompleteReason: 'NO_DEEP_ANALYSIS',
      },
      homepageSummary: {
        homepageTotal: 100,
        homepageUnsafe: 40,
        homepageIncomplete: 60,
        homepageFallback: 2,
        homepageConflict: 2,
        homepageNoDeepButStrong: 10,
      },
      qualitySummary: {
        badTemplateCount: 20,
      },
      queueSummary: {
        deepQueueSize: 0,
        snapshotQueueSize: 0,
        claudeQueueSize: 0,
        pendingCount: 100,
        runningCount: 10,
        failedCount: 0,
        stalledCount: 0,
      },
      exposureSummary: {
        moneyPriorityHighButIncomplete: 300,
      },
      historicalRepairSummary: {
        visibleBrokenCount: 120,
        highValueWeakCount: 260,
        staleWatchCount: 1000,
        archiveOrNoiseCount: 10000,
        historicalTrustedButWeakCount: 80,
        immediateFrontendDowngradeCount: 90,
        historicalRepairQueueCount: 0,
        historicalRepairActionBreakdown: {},
        visibleBrokenActionBreakdown: {},
        highValueWeakActionBreakdown: {},
        queueActionBreakdown: {},
      },
    },
    globalSnapshot: {
      totalRepos: 20000,
      fullyAnalyzed: 500,
      incomplete: 19500,
      deepCoverage: 0.025,
      finalDecisionButNoDeep: 15000,
    },
    recentSnapshot: {
      newRepos: 200,
      recentTasks: 900,
      recentFailures: 12,
    },
    checks: [],
    recommendations: [],
    diff: null,
    autoRepair: null,
  });

  assert.equal(result.triggered, true);
  assert.equal(recoveryCalls.length, 2);
  assert.deepEqual(recoveryCalls[0].buckets, ['visible_broken']);
  assert.deepEqual(recoveryCalls[1].buckets, ['high_value_weak']);
  assert.equal(result.execution.deepRepair, recoveryCalls[0].limit + recoveryCalls[1].limit);
  assert.equal(result.execution.downgradeOnly, 5);
  assert.equal(result.schedulerLane, 'historical_repair');
  assert.ok(result.actions[0].routerExecutionSummary);
});
