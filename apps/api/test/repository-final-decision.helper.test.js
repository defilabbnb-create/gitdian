const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRepositoryDecisionDisplaySummary,
} = require('../dist/modules/analysis/helpers/repository-final-decision.helper');

test('repository decision display summary falls back to Chinese-safe labels when zh fields contain English', () => {
  const summary = buildRepositoryDecisionDisplaySummary({
    oneLinerZh: '一个帮团队处理工单的工具',
    verdict: 'OK',
    action: 'CLONE',
    categoryLabelZh: '工具类 / AI工具',
    moneyPriority: 'P2',
    reasonZh: '这个方向可以借鉴，但还需要先确认真实付费意愿。',
    sourceLabelZh: '主分析',
    moneyDecision: {
      recommendedMoveZh: '先借鉴再验证',
      targetUsersZh: 'SMB customer support teams, AI automation agencies',
      monetizationSummaryZh:
        'Subscription tiers based on message volume and features',
    },
  });

  assert.equal(summary.targetUsersZh, '用户还不够清楚');
  assert.equal(summary.monetizationSummaryZh, '收费路径还不够清楚');
});
