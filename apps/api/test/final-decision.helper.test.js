const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRepositoryDecisionDisplaySummary,
  resolveFinalDecisionSource,
} = require('../dist/modules/analysis/helpers/repository-final-decision.helper');

test('manual override keeps highest source priority', () => {
  const source = resolveFinalDecisionSource({
    manualOverride: { verdict: 'GOOD', note: '人工确认' },
    claudeReview: { generatedBy: 'claude' },
    insight: { verdict: 'OK' },
  });

  assert.equal(source, 'manual');
});

test('local fallback review is identified as fallback source', () => {
  const source = resolveFinalDecisionSource({
    manualOverride: null,
    claudeReview: { generatedBy: 'local_fallback' },
    insight: { verdict: 'GOOD' },
  });

  assert.equal(source, 'fallback');
});

test('display summary stays in human Chinese decision language', () => {
  const summary = buildRepositoryDecisionDisplaySummary({
    oneLinerZh: '给平台工程团队做临时提权审批和审计的工作流工具',
    verdict: 'GOOD',
    action: 'BUILD',
    categoryLabelZh: '工具类 / 安全工具',
    moneyPriority: 'P0',
    reasonZh: '用户明确、场景明确，而且能很快做成团队付费产品。',
    sourceLabelZh: 'Claude 复核',
    moneyDecision: {
      recommendedMoveZh: '更适合你亲自做成产品',
      targetUsersZh: '平台工程团队 / 安全团队',
      monetizationSummaryZh: '可以从团队订阅和审计能力收费。',
    },
  });

  assert.equal(summary.judgementLabelZh, '值得做');
  assert.equal(summary.finalDecisionLabelZh, '值得做 · 做');
  assert.equal(summary.moneyPriorityLabelZh, 'P0 · 能赚钱');
  assert.match(summary.headlineZh, /平台工程团队/);
  assert.match(summary.reasonZh, /用户明确/);
});
