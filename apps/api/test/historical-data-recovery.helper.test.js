const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assessHistoricalRecoveryBatch,
  buildHistoricalRecoveryMetrics,
} = require('../dist/modules/analysis/helpers/historical-data-recovery.helper');

function baseSignal(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/cert-cli',
    htmlUrl: 'https://github.com/acme/cert-cli',
    oneLinerZh: '一个帮平台工程团队签发和续期 TLS 证书的 CLI 工具',
    projectType: 'tool',
    category: '工具类 / CLI 工具',
    hasRealUser: true,
    hasClearUseCase: true,
    isDirectlyMonetizable: true,
    verdict: 'GOOD',
    action: 'BUILD',
    priority: 'P1',
    source: 'local',
    strength: 'STRONG',
    targetUsersLabel: '平台工程团队',
    monetizationLabel: '可以先从团队订阅、托管版或服务化交付验证是否有人付费。',
    whyLabel: '证书续期是明确而重复的工作流。',
    snapshotPromising: true,
    snapshotNextAction: 'KEEP',
    fallbackUsed: false,
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasIdeaFit: true,
    hasIdeaExtract: true,
    hasCompleteness: true,
    hasClaudeReview: true,
    hasConflict: false,
    needsRecheck: false,
    isFavorited: false,
    favoritePriority: null,
    appearedOnHomepage: false,
    appearedInDailySummary: false,
    appearedInTelegram: false,
    claudeDiffTypes: [],
    claudeMistakeTypes: [],
    ...overrides,
  };
}

test('keeps healthy historical records low-risk', () => {
  const [assessment] = assessHistoricalRecoveryBatch([baseSignal()]);
  assert.equal(assessment.issues.length, 0);
  assert.equal(assessment.priority, 'P1');
  assert.deepEqual(assessment.stages, ['L0']);
});

test('downgrades unclear-user product narratives and schedules light refresh', () => {
  const [assessment] = assessHistoricalRecoveryBatch([
    baseSignal({
      oneLinerZh: '一个帮团队自动跑流程的工具',
      hasRealUser: false,
      hasClearUseCase: false,
      targetUsersLabel: '目标用户仍不清晰，需要进一步确认。',
    }),
  ]);

  assert.equal(assessment.metrics.headlineUserConflict, true);
  assert.ok(assessment.stages.includes('L1'));
  assert.ok(assessment.changed);
});

test('marks fallback records as dirty and keeps them out of high-trust path', () => {
  const [assessment] = assessHistoricalRecoveryBatch([
    baseSignal({
      source: 'fallback',
      fallbackUsed: true,
    }),
  ]);

  assert.equal(assessment.metrics.fallbackVisible, true);
  assert.ok(assessment.issues.some((item) => item.type === 'fallback_dirty'));
  assert.ok(assessment.stages.includes('L1'));
});

test('flags incomplete high-value records for deep rerun', () => {
  const [assessment] = assessHistoricalRecoveryBatch([
    baseSignal({
      hasIdeaFit: false,
      hasIdeaExtract: false,
      hasCompleteness: false,
      appearedOnHomepage: true,
    }),
  ]);

  assert.equal(assessment.metrics.incompleteAnalysisVisible, true);
  assert.ok(assessment.stages.includes('L2'));
  assert.equal(assessment.priority, 'P0');
});

test('routes high-value Claude conflicts into P0 and L3', () => {
  const [assessment] = assessHistoricalRecoveryBatch([
    baseSignal({
      appearedInTelegram: true,
      hasConflict: true,
      needsRecheck: true,
      claudeDiffTypes: ['one_liner_drift', 'monetization_overclaim'],
    }),
  ]);

  assert.equal(assessment.metrics.claudeConflict, true);
  assert.equal(assessment.priority, 'P0');
  assert.ok(assessment.stages.includes('L3'));
});

test('detects repeated template families in batch', () => {
  const assessments = assessHistoricalRecoveryBatch([
    baseSignal({
      repoId: 'repo-1',
      fullName: 'a/workflow-1',
      oneLinerZh: '一个帮团队自动跑流程的工具',
      hasRealUser: false,
      hasClearUseCase: false,
    }),
    baseSignal({
      repoId: 'repo-2',
      fullName: 'a/workflow-2',
      oneLinerZh: '一个帮团队自动跑流程的工具',
      hasRealUser: false,
      hasClearUseCase: false,
    }),
    baseSignal({
      repoId: 'repo-3',
      fullName: 'a/workflow-3',
      oneLinerZh: '一个帮团队自动跑流程的工具',
      hasRealUser: false,
      hasClearUseCase: false,
    }),
  ]);

  assert.equal(
    assessments.every((item) => item.repeatedTemplate === true),
    true,
  );
});

test('builds aggregate quality metrics', () => {
  const metrics = buildHistoricalRecoveryMetrics(
    assessHistoricalRecoveryBatch([
      baseSignal({
        oneLinerZh: '一个帮团队自动跑流程的工具',
        hasRealUser: false,
        hasClearUseCase: false,
      }),
      baseSignal({
        source: 'fallback',
        fallbackUsed: true,
      }),
      baseSignal(),
    ]),
  );

  assert.equal(metrics.scannedCount, 3);
  assert.ok(metrics.bad_oneliner_rate > 0);
  assert.ok(metrics.fallback_visible_rate > 0);
});
