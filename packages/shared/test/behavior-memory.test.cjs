const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendBehaviorMemoryEntry,
  buildBehaviorMemoryState,
  buildModelBehaviorMemoryInput,
  clearBehaviorMemoryState,
  createEmptyBehaviorMemoryState,
  explainBehaviorRecommendation,
  inferBehaviorReasons,
  mergeBehaviorMemoryStates,
  scoreBehaviorRecommendation,
} = require('../dist/utils/behavior-memory');

test('completed outcome infers structured success reasons', () => {
  const reasons = inferBehaviorReasons({
    outcome: 'SUCCESS',
    projectType: 'tool',
    hasRealUser: true,
    hasClearUseCase: true,
    isDirectlyMonetizable: true,
    targetUsersLabel: '后端开发者',
    useCaseLabel: '记录 API 调用日志',
    priorityBoosted: true,
  });

  assert.deepEqual(
    reasons.successReasons,
    [
      'REAL_USER_CONFIRMED',
      'CLEAR_USE_CASE',
      'FAST_TO_BUILD',
      'MONETIZATION_CONFIRMED',
      'DISTRIBUTION_CLEAR',
      'DIFFERENTIATED_ENOUGH',
    ],
  );
  assert.equal(reasons.confidence, 'high');
});

test('dropped outcome infers structured failure reasons', () => {
  const reasons = inferBehaviorReasons({
    outcome: 'DROPPED',
    projectType: 'infra',
    hasRealUser: false,
    hasClearUseCase: false,
    isDirectlyMonetizable: false,
    useCaseLabel: '需要大量人工整理配置',
    priorityBoosted: false,
  });

  assert.equal(reasons.failureReasons.includes('NO_REAL_USER'), true);
  assert.equal(reasons.failureReasons.includes('WEAK_MONETIZATION'), true);
  assert.equal(reasons.failureReasons.includes('TOO_INFRA_HEAVY'), true);
  assert.equal(reasons.failureReasons.includes('WRONG_DIRECTION'), true);
  assert.equal(reasons.failureReasons.includes('TOO_MUCH_MANUAL_WORK'), true);
});

test('recent outcomes outweigh old outcomes when building profile', () => {
  const now = '2026-03-25T00:00:00.000Z';
  const state = buildBehaviorMemoryState(
    [
      {
        repoId: 'repo-old-win',
        actionUpdatedAt: '2025-10-01T00:00:00.000Z',
        outcome: 'SUCCESS',
        categoryLabel: '开发工具',
        patternKeys: ['category:开发工具'],
        successReasons: ['CLEAR_USE_CASE'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceTags: ['category:开发工具'],
      },
      {
        repoId: 'repo-new-fail',
        actionUpdatedAt: '2026-03-24T00:00:00.000Z',
        outcome: 'DROPPED',
        categoryLabel: '开发工具',
        patternKeys: ['category:开发工具'],
        successReasons: [],
        failureReasons: ['WRONG_DIRECTION'],
        confidence: 'high',
        source: 'validation_result',
        evidenceTags: ['category:开发工具'],
      },
    ],
    {},
    now,
  );

  const signal = state.profile.categorySignals.find((item) => item.category === '开发工具');

  assert.ok(signal);
  assert.equal(signal.weightedScore < 0, true);
  assert.equal(signal.preferred, false);
});

test('preference profile and recommendation explanation are generated', () => {
  let state = createEmptyBehaviorMemoryState('2026-03-25T00:00:00.000Z');

  for (const [index, repoId] of ['repo-success-1', 'repo-success-2', 'repo-success-3'].entries()) {
    state = appendBehaviorMemoryEntry(state, {
      repoId,
      actionUpdatedAt: `2026-03-2${index + 3}T00:00:00.000Z`,
      outcome: 'SUCCESS',
      categoryLabel: '工具类 / 自动化工具',
      targetUsersLabel: '开发者',
      useCaseLabel: '新项目',
      projectType: 'tool',
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: true,
      patternKeys: ['category:工具类 / 自动化工具', 'usecase:新项目'],
      successReasons: ['CLEAR_USE_CASE', 'FAST_TO_BUILD'],
      failureReasons: [],
      confidence: 'high',
      source: 'validation_result',
      evidenceLevel: 'HIGH',
      evidenceTags: ['category:工具类 / 自动化工具'],
      actionImpactScore: 5,
    });
  }

  const score = scoreBehaviorRecommendation(
    {
      categoryLabel: '工具类 / 自动化工具',
      targetUsersLabel: '开发者',
      useCaseLabel: '新项目',
      projectType: 'tool',
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: true,
      patternKeys: ['category:工具类 / 自动化工具', 'usecase:新项目'],
    },
    state.profile,
  );
  const explanation = explainBehaviorRecommendation(
    {
      categoryLabel: '工具类 / 自动化工具',
      targetUsersLabel: '开发者',
      useCaseLabel: '新项目',
      projectType: 'tool',
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: true,
      patternKeys: ['category:工具类 / 自动化工具', 'usecase:新项目'],
    },
    state.profile,
    score,
  );
  const modelInput = buildModelBehaviorMemoryInput(state.profile);

  assert.equal(score.score > 0, true);
  assert.equal(explanation.influenced, true);
  assert.equal(explanation.explainBreakdown.behaviorWeight > 0, true);
  assert.equal(state.profile.preferredCategories.includes('工具类 / 自动化工具'), true);
  assert.equal(modelInput.preferredCategories.includes('工具类 / 自动化工具'), true);
  assert.equal(modelInput.userSuccessReasons.includes('CLEAR_USE_CASE'), true);
  assert.equal(modelInput.minEvidenceThreshold, 3);
});

test('recent repeated failures override older wins for the same direction', () => {
  const state = buildBehaviorMemoryState(
    [
      {
        repoId: 'repo-old-success',
        actionUpdatedAt: '2026-01-01T00:00:00.000Z',
        outcome: 'SUCCESS',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: ['CLEAR_USE_CASE'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceTags: [],
      },
      {
        repoId: 'repo-fail-1',
        actionUpdatedAt: '2026-03-24T00:00:00.000Z',
        outcome: 'DROPPED',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: [],
        failureReasons: ['TOO_INFRA_HEAVY'],
        confidence: 'high',
        source: 'validation_result',
        evidenceTags: [],
      },
      {
        repoId: 'repo-fail-2',
        actionUpdatedAt: '2026-03-25T00:00:00.000Z',
        outcome: 'DROPPED',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: [],
        failureReasons: ['TOO_INFRA_HEAVY'],
        confidence: 'high',
        source: 'validation_result',
        evidenceTags: [],
      },
      {
        repoId: 'repo-fail-3',
        actionUpdatedAt: '2026-03-25T06:00:00.000Z',
        outcome: 'DROPPED',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: [],
        failureReasons: ['TOO_INFRA_HEAVY'],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
    ],
    {},
    '2026-03-25T12:00:00.000Z',
  );

  assert.equal(state.profile.avoidedCategories.includes('基础设施'), true);
});

test('single failure does not hijack category preference', () => {
  const state = buildBehaviorMemoryState(
    [
      {
        repoId: 'repo-fail-once',
        actionUpdatedAt: '2026-03-25T00:00:00.000Z',
        outcome: 'DROPPED',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: [],
        failureReasons: ['TOO_INFRA_HEAVY'],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
    ],
    {},
    '2026-03-25T12:00:00.000Z',
  );

  assert.equal(state.profile.avoidedCategories.includes('基础设施'), false);
});

test('low evidence progress does not create preferred categories', () => {
  const state = buildBehaviorMemoryState(
    [
      {
        repoId: 'repo-progress',
        actionUpdatedAt: '2026-03-25T00:00:00.000Z',
        outcome: 'IN_PROGRESS',
        categoryLabel: '开发工具',
        patternKeys: ['category:开发工具'],
        successReasons: [],
        failureReasons: [],
        confidence: 'low',
        source: 'manual_click',
        evidenceLevel: 'LOW',
        evidenceTags: [],
        actionImpactScore: 0.4,
      },
      {
        repoId: 'repo-validate',
        actionUpdatedAt: '2026-03-25T01:00:00.000Z',
        outcome: 'VALIDATING',
        categoryLabel: '开发工具',
        patternKeys: ['category:开发工具'],
        successReasons: [],
        failureReasons: [],
        confidence: 'medium',
        source: 'manual_click',
        evidenceLevel: 'MEDIUM',
        evidenceTags: [],
        actionImpactScore: 1.2,
      },
    ],
    {},
    '2026-03-25T12:00:00.000Z',
  );

  assert.equal(state.profile.preferredCategories.includes('开发工具'), false);
  assert.equal(state.metrics.memoryPollutionRate > 0, true);
});

test('recovery can reintroduce a previously failed category', () => {
  const state = buildBehaviorMemoryState(
    [
      {
        repoId: 'infra-fail-1',
        actionUpdatedAt: '2026-03-05T00:00:00.000Z',
        outcome: 'DROPPED',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: [],
        failureReasons: ['TOO_INFRA_HEAVY'],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
      {
        repoId: 'infra-fail-2',
        actionUpdatedAt: '2026-03-10T00:00:00.000Z',
        outcome: 'DROPPED',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: [],
        failureReasons: ['TOO_INFRA_HEAVY'],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
      {
        repoId: 'infra-fail-3',
        actionUpdatedAt: '2026-03-15T00:00:00.000Z',
        outcome: 'DROPPED',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: [],
        failureReasons: ['TOO_INFRA_HEAVY'],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
      {
        repoId: 'infra-win-1',
        actionUpdatedAt: '2026-03-24T00:00:00.000Z',
        outcome: 'SUCCESS',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: ['CLEAR_USE_CASE', 'FAST_TO_BUILD'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
      {
        repoId: 'infra-win-2',
        actionUpdatedAt: '2026-03-25T00:00:00.000Z',
        outcome: 'SUCCESS',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: ['CLEAR_USE_CASE', 'FAST_TO_BUILD'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
      {
        repoId: 'infra-win-3',
        actionUpdatedAt: '2026-03-25T08:00:00.000Z',
        outcome: 'SUCCESS',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: ['REAL_USER_CONFIRMED', 'CLEAR_USE_CASE'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
    ],
    {},
    '2026-03-25T12:00:00.000Z',
  );

  const signal = state.profile.categorySignals.find((item) => item.category === '基础设施');

  assert.ok(signal);
  assert.equal(signal.recoveryScore > 0, true);
  assert.equal(state.metrics.recoveryTriggeredCount >= 1, true);
});

test('recommendation explanation exposes structured weights', () => {
  const state = buildBehaviorMemoryState(
    [
      {
        repoId: 'repo-weight',
        actionUpdatedAt: '2026-03-25T00:00:00.000Z',
        outcome: 'SUCCESS',
        categoryLabel: 'AI工具',
        targetUsersLabel: '开发者',
        useCaseLabel: '自动补全',
        projectType: 'tool',
        hasRealUser: true,
        hasClearUseCase: true,
        isDirectlyMonetizable: true,
        patternKeys: ['category:AI工具', 'usecase:自动补全'],
        successReasons: ['CLEAR_USE_CASE', 'MONETIZATION_CONFIRMED'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
      {
        repoId: 'repo-weight-2',
        actionUpdatedAt: '2026-03-24T00:00:00.000Z',
        outcome: 'SUCCESS',
        categoryLabel: 'AI工具',
        targetUsersLabel: '开发者',
        useCaseLabel: '自动补全',
        projectType: 'tool',
        hasRealUser: true,
        hasClearUseCase: true,
        isDirectlyMonetizable: true,
        patternKeys: ['category:AI工具', 'usecase:自动补全'],
        successReasons: ['CLEAR_USE_CASE', 'FAST_TO_BUILD'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
      {
        repoId: 'repo-weight-3',
        actionUpdatedAt: '2026-03-23T00:00:00.000Z',
        outcome: 'SUCCESS',
        categoryLabel: 'AI工具',
        targetUsersLabel: '开发者',
        useCaseLabel: '自动补全',
        projectType: 'tool',
        hasRealUser: true,
        hasClearUseCase: true,
        isDirectlyMonetizable: true,
        patternKeys: ['category:AI工具', 'usecase:自动补全'],
        successReasons: ['REAL_USER_CONFIRMED'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
    ],
    {},
    '2026-03-25T12:00:00.000Z',
  );

  const score = scoreBehaviorRecommendation(
    {
      categoryLabel: 'AI工具',
      targetUsersLabel: '开发者',
      useCaseLabel: '自动补全',
      projectType: 'tool',
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: true,
      patternKeys: ['category:AI工具', 'usecase:自动补全'],
      strengthWeightHint: 1.6,
      monetizationWeightHint: 1.4,
      freshnessWeightHint: 0.8,
    },
    state.profile,
  );
  const explanation = explainBehaviorRecommendation(
    {
      categoryLabel: 'AI工具',
      targetUsersLabel: '开发者',
      useCaseLabel: '自动补全',
      projectType: 'tool',
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: true,
      patternKeys: ['category:AI工具', 'usecase:自动补全'],
      strengthWeightHint: 1.6,
      monetizationWeightHint: 1.4,
      freshnessWeightHint: 0.8,
    },
    state.profile,
    score,
  );

  assert.equal(typeof explanation.explainBreakdown.behaviorWeight, 'number');
  assert.equal(explanation.explainBreakdown.behaviorWeight > 0, true);
  assert.equal(explanation.bullets[0].includes('行为信号'), true);
});

test('memory can clear a single category or reset fully', () => {
  const seeded = buildBehaviorMemoryState(
    [
      {
        repoId: 'repo-one',
        actionUpdatedAt: '2026-03-25T00:00:00.000Z',
        outcome: 'SUCCESS',
        categoryLabel: '工具类 / 自动化工具',
        patternKeys: ['category:工具类 / 自动化工具'],
        successReasons: ['CLEAR_USE_CASE'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceTags: [],
      },
      {
        repoId: 'repo-two',
        actionUpdatedAt: '2026-03-25T00:00:00.000Z',
        outcome: 'DROPPED',
        categoryLabel: '基础设施',
        patternKeys: ['category:基础设施'],
        successReasons: [],
        failureReasons: ['TOO_INFRA_HEAVY'],
        confidence: 'high',
        source: 'validation_result',
        evidenceTags: [],
      },
    ],
    {},
    '2026-03-25T12:00:00.000Z',
  );

  const categoryCleared = clearBehaviorMemoryState(seeded, {
    type: 'category',
    value: '基础设施',
  });
  const fullyCleared = clearBehaviorMemoryState(seeded, {
    type: 'all',
  });

  assert.equal(categoryCleared.recentActionOutcomes.length, 1);
  assert.equal(fullyCleared.recentActionOutcomes.length, 0);
});

test('merging local and remote memory does not double-count runtime metrics', () => {
  const state = buildBehaviorMemoryState(
    [
      {
        repoId: 'repo-a',
        actionUpdatedAt: '2026-03-25T00:00:00.000Z',
        outcome: 'SUCCESS',
        categoryLabel: '开发工具',
        patternKeys: ['category:开发工具'],
        successReasons: ['CLEAR_USE_CASE'],
        failureReasons: [],
        confidence: 'high',
        source: 'validation_result',
        evidenceLevel: 'HIGH',
        evidenceTags: [],
      },
    ],
    {
      memoryLookups: 7,
      memoryHits: 5,
      recommendationAdjustedByBehaviorCount: 4,
      explainRenderedCount: 3,
      explainVisibleCount: 2,
      queuePriorityEvaluations: 6,
      queuePriorityBoostedCount: 2,
      syncedAt: '2026-03-25T00:10:00.000Z',
    },
    '2026-03-25T00:20:00.000Z',
  );

  const merged = mergeBehaviorMemoryStates(state, state, '2026-03-25T00:30:00.000Z');

  assert.equal(merged.runtimeStats.memoryLookups, 7);
  assert.equal(merged.runtimeStats.memoryHits, 5);
  assert.equal(merged.runtimeStats.queuePriorityEvaluations, 6);
  assert.equal(merged.runtimeStats.queuePriorityBoostedCount, 2);
});
