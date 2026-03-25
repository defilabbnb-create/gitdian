const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateOneLinerStrength,
  explainOneLinerStrength,
  resolveEffectiveOneLinerStrength,
} = require('../dist/modules/analysis/helpers/one-liner-strength.helper');

test('classifies a real monetizable tool as STRONG', () => {
  const strength = evaluateOneLinerStrength({
    oneLinerZh: '一个帮运维团队自动签发和续期 TLS 证书的工具',
    projectReality: {
      type: 'tool',
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: true,
    },
    ideaFitScore: 75,
  });

  assert.equal(strength, 'STRONG');
});

test('classifies clear infra boundary projects as MEDIUM', () => {
  const result = explainOneLinerStrength({
    oneLinerZh: '一个用于监控 Linux 出站流量并生成防火墙规则的安全工具',
    projectReality: {
      type: 'infra',
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: false,
    },
    ideaFitScore: 65,
  });

  assert.equal(result.strength, 'MEDIUM');
  assert.ok(result.reasons.includes('infra_but_clear_enough'));
});

test('classifies demo and template wording as WEAK', () => {
  const strength = evaluateOneLinerStrength({
    oneLinerZh: '一个用于展示技术能力的示例项目',
    projectReality: {
      type: 'demo',
      hasRealUser: false,
      hasClearUseCase: false,
      isDirectlyMonetizable: false,
    },
    riskFlags: ['unclear_user'],
  });

  assert.equal(strength, 'WEAK');
});

test('classifies Janus-like model wording as WEAK', () => {
  const result = explainOneLinerStrength({
    oneLinerZh: '一个用于图像与文本处理的多模态模型框架',
    projectReality: {
      type: 'model',
      hasRealUser: false,
      hasClearUseCase: true,
      isDirectlyMonetizable: false,
    },
  });

  assert.equal(result.strength, 'WEAK');
  assert.ok(result.reasons.includes('project_type_model'));
});

test('classifies generic productivity wording as WEAK', () => {
  const result = explainOneLinerStrength({
    oneLinerZh: '一个提升开发效率的工具',
    projectReality: {
      type: 'tool',
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: true,
    },
    riskFlags: ['possible_overgeneralization'],
  });

  assert.equal(result.strength, 'WEAK');
  assert.ok(result.reasons.includes('generic_one_liner'));
});

test('classifies a niche but clear monetizable tool as STRONG', () => {
  const result = explainOneLinerStrength({
    oneLinerZh: '一个帮平台工程团队追踪 AI 编码助手 token 与成本的分析工具',
    projectReality: {
      type: 'tool',
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: true,
    },
    ideaFitScore: 62,
  });

  assert.equal(result.strength, 'STRONG');
  assert.ok(result.reasons.includes('clear_product_candidate'));
});

test('downgrades conflict-marked one-liners to WEAK', () => {
  const result = explainOneLinerStrength({
    oneLinerZh: '一个帮工程团队自动完成图像工作流的平台',
    projectReality: {
      type: 'tool',
      hasRealUser: false,
      hasClearUseCase: false,
      isDirectlyMonetizable: false,
    },
    riskFlags: ['user_conflict', 'category_mismatch', 'monetization_overclaim'],
  });

  assert.equal(result.strength, 'WEAK');
  assert.ok(result.reasons.includes('negative_risk_flag'));
});

test('decays strong strength after three days', () => {
  const result = resolveEffectiveOneLinerStrength({
    localStrength: 'STRONG',
    updatedAt: '2026-03-20T00:00:00.000Z',
    now: new Date('2026-03-24T12:00:00.000Z'),
  });

  assert.equal(result.strength, 'MEDIUM');
  assert.ok(result.reasons.includes('age_decay_4'));
});

test('claude strength overrides local strength before decay is applied', () => {
  const result = resolveEffectiveOneLinerStrength({
    localStrength: 'STRONG',
    claudeStrength: 'MEDIUM',
    updatedAt: '2026-03-24T00:00:00.000Z',
    now: new Date('2026-03-24T12:00:00.000Z'),
  });

  assert.equal(result.strength, 'MEDIUM');
  assert.ok(result.reasons.includes('source_claude_override'));
});
