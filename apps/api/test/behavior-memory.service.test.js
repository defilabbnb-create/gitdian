const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BehaviorMemoryService,
} = require('../dist/modules/behavior-memory/behavior-memory.service');

function createPrismaMock(initial = null) {
  let stored = initial;

  return {
    prisma: {
      systemConfig: {
        findUnique: async () =>
          stored
            ? {
                configKey: 'behavior.memory.state',
                configValue: stored,
              }
            : null,
        upsert: async ({ update, create }) => {
          stored = update?.configValue ?? create?.configValue ?? stored;
          return {
            configKey: 'behavior.memory.state',
            configValue: stored,
          };
        },
      },
    },
    read() {
      return stored;
    },
  };
}

test('behavior memory service normalizes stored state and exposes model input', async () => {
  const mock = createPrismaMock({
    version: 1,
    updatedAt: '2026-03-25T00:00:00.000Z',
    recentActionOutcomes: [
      {
        repoId: 'repo-1',
        repositoryName: 'cert-cli',
        repositoryFullName: 'acme/cert-cli',
        categoryLabel: '工具类 / CLI 工具',
        projectType: 'tool',
        targetUsersLabel: '平台工程团队',
        useCaseLabel: '签发和续期 TLS 证书',
        patternKeys: ['category:工具类 / CLI 工具', 'usecase:签发和续期 TLS 证书'],
        actionStatus: 'COMPLETED',
        followUpStage: 'DECIDE',
        actionStartedAt: '2026-03-24T00:00:00.000Z',
        actionUpdatedAt: new Date().toISOString(),
        outcome: 'SUCCESS',
        successReasons: ['REAL_USER_CONFIRMED', 'FAST_TO_BUILD'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceTags: ['validated'],
        actionScore: 5,
        hasRealUser: true,
        hasClearUseCase: true,
        isDirectlyMonetizable: true,
      },
    ],
  });
  const service = new BehaviorMemoryService(mock.prisma);

  const state = await service.getState();
  const modelInput = await service.getModelInput();

  assert.equal(state.recentActionOutcomes.length, 1);
  assert.deepEqual(modelInput.userSuccessPatterns, ['category:工具类 / CLI 工具', 'usecase:签发和续期 TLS 证书']);
  assert.deepEqual(modelInput.userSuccessReasons, [
    'REAL_USER_CONFIRMED',
    'FAST_TO_BUILD',
  ]);
  assert.equal(modelInput.preferredCategories.includes('工具类 / CLI 工具'), false);
});

test('behavior memory service updates and clears state safely', async () => {
  const mock = createPrismaMock(null);
  const service = new BehaviorMemoryService(mock.prisma);

  const updated = await service.updateState({
    recentActionOutcomes: [
      {
        repoId: 'repo-2',
        repositoryName: 'review-flow',
        repositoryFullName: 'acme/review-flow',
        categoryLabel: '工具类 / 工作流工具',
        projectType: 'tool',
        targetUsersLabel: '开发团队',
        useCaseLabel: 'PR review 审批',
        patternKeys: ['category:工具类 / 工作流工具'],
        actionStatus: 'DROPPED',
        followUpStage: 'OBSERVE',
        actionUpdatedAt: new Date().toISOString(),
        outcome: 'DROPPED',
        successReasons: [],
        failureReasons: ['WRONG_DIRECTION'],
        confidence: 'high',
        source: 'validation_result',
        evidenceTags: ['drop'],
      },
    ],
  });

  assert.equal(updated.recentActionOutcomes.length, 1);
  assert.equal(mock.read().recentActionOutcomes.length, 1);

  const cleared = await service.clearState();
  assert.equal(cleared.recentActionOutcomes.length, 0);
  assert.equal(mock.read().recentActionOutcomes.length, 0);
});

test('behavior memory service merges incoming state with existing persisted memory', async () => {
  const existingUpdatedAt = '2026-03-24T00:00:00.000Z';
  const incomingUpdatedAt = '2026-03-25T00:00:00.000Z';
  const mock = createPrismaMock({
    version: 2,
    updatedAt: existingUpdatedAt,
    recentActionOutcomes: [
      {
        repoId: 'repo-existing',
        categoryLabel: '开发工具',
        patternKeys: ['category:开发工具'],
        actionUpdatedAt: existingUpdatedAt,
        outcome: 'SUCCESS',
        successReasons: ['CLEAR_USE_CASE'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
    ],
    runtimeStats: {
      memoryLookups: 4,
      memoryHits: 3,
      recommendationAdjustedByBehaviorCount: 2,
      staleMemoryDecayCount: 0,
      explainRenderedCount: 1,
      explainVisibleCount: 1,
      queuePriorityEvaluations: 5,
      queuePriorityBoostedCount: 2,
      syncedAt: existingUpdatedAt,
    },
  });
  const service = new BehaviorMemoryService(mock.prisma);

  const updated = await service.updateState({
    version: 2,
    updatedAt: incomingUpdatedAt,
    recentActionOutcomes: [
      {
        repoId: 'repo-incoming',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        actionUpdatedAt: incomingUpdatedAt,
        outcome: 'DROPPED',
        successReasons: [],
        failureReasons: ['TOO_INFRA_HEAVY'],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
    ],
    runtimeStats: {
      memoryLookups: 6,
      memoryHits: 4,
      recommendationAdjustedByBehaviorCount: 3,
      staleMemoryDecayCount: 0,
      explainRenderedCount: 2,
      explainVisibleCount: 1,
      queuePriorityEvaluations: 6,
      queuePriorityBoostedCount: 3,
      syncedAt: incomingUpdatedAt,
    },
  });

  assert.equal(updated.recentActionOutcomes.length, 2);
  assert.equal(updated.runtimeStats.memoryLookups, 6);
  assert.equal(updated.runtimeStats.queuePriorityBoostedCount, 3);
});
