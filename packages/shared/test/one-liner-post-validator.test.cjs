const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ONE_LINER_REVIEWING_FALLBACK,
  ONE_LINER_LOW_PRIORITY_FALLBACK,
  ONE_LINER_TECHNICAL_FALLBACK,
  getOneLinerPostValidatorStats,
  resetOneLinerPostValidatorState,
  validateOneLiner,
  validateOneLinersBatch,
} = require('../dist/index.js');

function baseInput(overrides = {}) {
  return {
    repoId: 'repo-1',
    updatedAt: '2026-03-25T00:00:00.000Z',
    oneLinerZh: '一个帮运维团队自动签发 TLS 证书的 CLI 工具',
    projectType: 'tool',
    category: '工具类 / CLI 工具',
    hasRealUser: true,
    hasClearUseCase: true,
    isDirectlyMonetizable: true,
    verdict: 'GOOD',
    action: 'BUILD',
    priority: 'P1',
    source: 'local',
    targetUsersLabel: '运维团队',
    monetizationLabel: '可以先从团队订阅、托管版或服务化交付验证是否有人付费。',
    whyLabel: '证书续期是明确而重复的工作流。',
    ...overrides,
  };
}

test.beforeEach(() => {
  resetOneLinerPostValidatorState();
});

test('keeps a valid product sentence', () => {
  const result = validateOneLiner(baseInput());
  assert.equal(result.changed, false);
  assert.equal(result.sanitized, '一个帮运维团队自动签发 TLS 证书的 CLI 工具');
  assert.equal(result.severity, 'none');
});

test('keeps a valid tool sentence', () => {
  const result = validateOneLiner(
    baseInput({
      oneLinerZh: '一个用于记录 API 调用日志的中间件，主要面向后端开发者',
      projectType: 'tool',
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: false,
      verdict: 'OK',
      action: 'CLONE',
      priority: 'P2',
      monetizationLabel: '更适合先验证价值，再判断是否具备收费空间。',
    }),
  );

  assert.equal(result.changed, false);
  assert.equal(result.severity, 'none');
});

test('downgrades demo or template headlines', () => {
  const result = validateOneLiner(
    baseInput({
      oneLinerZh: '一个帮团队自动跑流程的工具',
      projectType: 'demo',
      category: 'template / workflow demo',
      hasRealUser: false,
      hasClearUseCase: false,
      isDirectlyMonetizable: false,
    }),
  );

  assert.equal(result.changed, true);
  assert.equal(result.sanitized, ONE_LINER_TECHNICAL_FALLBACK);
  assert.equal(result.layer, 0);
});

test('downgrades model or infra written as product', () => {
  const result = validateOneLiner(
    baseInput({
      oneLinerZh: '一个帮团队自动跑流程的工具',
      projectType: 'infra',
      category: '基础设施',
      isDirectlyMonetizable: false,
    }),
  );

  assert.equal(result.changed, true);
  assert.equal(result.sanitized, ONE_LINER_TECHNICAL_FALLBACK);
  assert.ok(result.riskFlags.includes('category_mismatch'));
});

test('downgrades strong product line when user is unclear', () => {
  const result = validateOneLiner(
    baseInput({
      oneLinerZh: '一个帮团队自动签发证书的工具',
      hasRealUser: false,
      targetUsersLabel: '用户还不够清楚',
    }),
  );

  assert.equal(result.changed, true);
  assert.equal(result.sanitized, ONE_LINER_TECHNICAL_FALLBACK);
  assert.ok(
    result.riskFlags.includes('unclear_user') ||
      result.riskFlags.includes('user_conflict'),
  );
});

test('downgrades monetization overclaim', () => {
  const result = validateOneLiner(
    baseInput({
      oneLinerZh: '一个帮平台工程团队管理证书的工具',
      isDirectlyMonetizable: false,
      monetizationLabel: '已有现实收费路径，可从团队订阅、托管版或企业版收费。',
    }),
  );

  assert.equal(result.changed, true);
  assert.equal(result.sanitized, ONE_LINER_REVIEWING_FALLBACK);
  assert.ok(result.riskFlags.includes('monetization_overclaim'));
});

test('downgrades english leakage', () => {
  const result = validateOneLiner(
    baseInput({
      oneLinerZh: 'A CLI tool for managing certificates and renewals',
    }),
  );

  assert.equal(result.changed, true);
  assert.equal(result.sanitized, ONE_LINER_REVIEWING_FALLBACK);
  assert.ok(result.riskFlags.includes('english_leak'));
});

test('keeps mixed Chinese technical headlines with limited product-name English', () => {
  const headline =
    '面向 React Native 的自主 AI 代理 SDK，支持语音交互、自然语言 UI 控制和自动化测试。';
  const result = validateOneLiner(
    baseInput({
      oneLinerZh: headline,
      projectType: 'tool',
      targetUsersLabel: '开发者、工程团队',
      monetizationLabel: '收费路径还不够清楚，建议先确认真实用户和场景。',
    }),
  );

  assert.equal(result.changed, false);
  assert.equal(result.sanitized, headline);
});

test('downgrades repo-name fallback sentence', () => {
  const result = validateOneLiner(
    baseInput({
      repoName: 'CertFlow',
      fullName: 'team/CertFlow',
      oneLinerZh: '一个名为 CertFlow 的项目',
    }),
  );

  assert.equal(result.changed, true);
  assert.equal(result.sanitized, ONE_LINER_REVIEWING_FALLBACK);
  assert.ok(result.riskFlags.includes('repo_name_fallback'));
});

test('suppresses repeated template families in batch', () => {
  const results = validateOneLinersBatch([
    baseInput({
      repoId: 'repo-1',
      oneLinerZh: '一个帮团队自动跑流程的工具',
      hasRealUser: true,
      hasClearUseCase: true,
    }),
    baseInput({
      repoId: 'repo-2',
      updatedAt: '2026-03-25T00:01:00.000Z',
      oneLinerZh: '一个帮团队自动跑流程的工具',
      hasRealUser: true,
      hasClearUseCase: true,
    }),
    baseInput({
      repoId: 'repo-3',
      updatedAt: '2026-03-25T00:02:00.000Z',
      oneLinerZh: '一个帮团队自动跑流程的工具',
      hasRealUser: true,
      hasClearUseCase: true,
    }),
  ]);

  assert.equal(results[0].changed, false);
  assert.equal(results[1].changed, false);
  assert.equal(results[2].changed, true);
  assert.ok(results[2].riskFlags.includes('template_repetition'));
});

test('cache hits are recorded on repeated validation', () => {
  const first = validateOneLiner(baseInput());
  const second = validateOneLiner(baseInput());
  const runtimeStats = getOneLinerPostValidatorStats();

  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(runtimeStats.cacheHitCount, 1);
  assert.equal(runtimeStats.validatedCount, 2);
});

test('low priority conflicts downgrade to low priority fallback', () => {
  const result = validateOneLiner(
    baseInput({
      oneLinerZh: '一个帮运维团队自动签发 TLS 证书的 CLI 工具',
      priority: 'P3',
      action: 'IGNORE',
      verdict: 'BAD',
      source: 'fallback',
      strength: 'WEAK',
    }),
  );

  assert.equal(result.changed, true);
  assert.equal(result.sanitized, ONE_LINER_LOW_PRIORITY_FALLBACK);
});

test('fallback source alone is enough to downgrade a strong sentence', () => {
  const result = validateOneLiner(
    baseInput({
      source: 'fallback',
      oneLinerZh: '一个帮运维团队自动签发 TLS 证书的 CLI 工具',
      priority: 'P1',
      action: 'BUILD',
      verdict: 'GOOD',
    }),
  );

  assert.equal(result.changed, true);
  assert.equal(result.sanitized, ONE_LINER_LOW_PRIORITY_FALLBACK);
  assert.ok(result.riskFlags.includes('fallback_overclaim'));
});

test('snapshot conflict downgrades a strong opportunity sentence', () => {
  const result = validateOneLiner(
    baseInput({
      oneLinerZh: '一个帮运维团队自动签发 TLS 证书的 CLI 工具',
      snapshotPromising: false,
      snapshotNextAction: 'SKIP',
    }),
  );

  assert.equal(result.changed, true);
  assert.equal(result.sanitized, ONE_LINER_LOW_PRIORITY_FALLBACK);
  assert.ok(result.riskFlags.includes('snapshot_conflict'));
});
