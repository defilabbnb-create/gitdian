const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MoneyPriorityService,
} = require('../dist/modules/analysis/money-priority.service');

function createService() {
  return new MoneyPriorityService({
    getCachedAdjustments() {
      return {
        clearUserBoost: 0,
        clearUseCaseBoost: 0,
        painPointBoost: 0,
        monetizationBoost: 0,
        repeatUsageBoost: 0,
        smallTeamBuildableBoost: 0,
        infraPenaltyBoost: 0,
        templatePenaltyBoost: 0,
        falsePositiveGoodPenalty: 0,
        cloneableReliefBoost: 0,
      };
    },
    getCachedConfidenceAdjustments() {
      return {
        globalDiscount: 0,
        projectTypeDiscounts: {
          product: 0,
          tool: 0,
          model: 0,
          infra: 0,
          demo: 0,
        },
        decisionDiscounts: {
          mustBuild: 0,
          highValue: 0,
          cloneable: 0,
        },
      };
    },
  });
}

test('keeps monetization conservative when user and use case are unclear', () => {
  const service = createService();
  const result = service.calculate({
    repository: {
      fullName: 'demo/mystery-app',
      description: 'A starter project',
      topics: ['starter', 'template'],
      stars: 2,
    },
    insight: {
      verdict: 'OK',
      action: 'CLONE',
      projectReality: {
        type: 'tool',
        hasRealUser: false,
        hasClearUseCase: false,
        isDirectlyMonetizable: false,
      },
    },
    snapshot: {
      isPromising: false,
      reason: '更像能力验证样本',
      nextAction: 'SKIP',
    },
  });

  assert.equal(
    result.monetizationSummaryZh,
    '收费路径还不够清楚，建议先确认真实用户和场景。',
  );
  assert.equal(result.targetUsersZh, '目标用户仍不清晰，需要进一步确认。');
});

test('keeps infra projects on cautious monetization wording', () => {
  const service = createService();
  const result = service.calculate({
    repository: {
      fullName: 'security/egress-guard',
      description: 'Monitor Linux egress traffic and generate firewall rules',
      topics: ['infra', 'security'],
      stars: 21,
      categoryL1: 'infra',
      categoryL2: 'security',
    },
    insight: {
      verdict: 'OK',
      action: 'CLONE',
      projectReality: {
        type: 'infra',
        hasRealUser: true,
        hasClearUseCase: true,
        isDirectlyMonetizable: false,
      },
    },
    snapshot: {
      isPromising: true,
      reason: '安全团队可能会继续关注这类能力',
      nextAction: 'KEEP',
    },
  });

  assert.equal(
    result.monetizationSummaryZh,
    '更适合先验证价值，再判断是否具备收费空间。',
  );
});

test('drops English-heavy business labels from zh fields and falls back to Chinese-safe summaries', () => {
  const service = createService();
  const result = service.calculate({
    repository: {
      fullName: 'telegram/supercharged-agent',
      description: 'Managed Telegram AI agent hosting',
      topics: ['telegram', 'ai-agent'],
      stars: 58,
      categoryL1: 'ai',
      categoryL2: 'ai-agent',
    },
    insight: {
      verdict: 'GOOD',
      action: 'BUILD',
      projectReality: {
        type: 'product',
        hasRealUser: true,
        hasClearUseCase: true,
        isDirectlyMonetizable: true,
      },
    },
    extractedIdea: {
      targetUsers: [
        'SMB customer support teams',
        'AI automation agencies',
      ],
    },
    claudeReview: {
      hasRealUser: true,
      hasClearUseCase: true,
      hasProductizationPath: true,
      isDirectlyMonetizable: true,
      businessJudgement: {
        isFounderFit: true,
        isSmallTeamFriendly: true,
        hasNearTermMonetizationPath: true,
        moneyPriorityHint: 'HIGH_VALUE',
        moneyReasonZh: '用户和场景都比较清楚。',
      },
      businessSignals: {
        targetUser: 'SMB customer support teams, AI automation agencies',
        willingnessToPay: 'high',
        monetizationModel:
          'Subscription tiers based on message volume and premium features',
        urgency: 'high',
        founderFit: true,
        buildDifficulty: 'medium',
      },
    },
  });

  assert.equal(result.targetUsersZh, '有明确用户，但还需要你再确认细分人群');
  assert.equal(
    result.monetizationSummaryZh,
    '可以先从团队版、托管版或服务化交付验证是否有人付费。',
  );
});
