import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRepositoryDecisionHeadline,
  getRepositoryDecisionSummary,
  getRepositoryFallbackIdeaAnalysis,
} from '../src/lib/repository-decision';
import { createRepositoryFixture } from './helpers/repository-fixture';

test('force-degraded low-priority headline uses concrete Chinese reason instead of generic observe-pool copy', () => {
  const repository = createRepositoryFixture({
    analysis: {
      insightJson: {
        verdictReason:
          '同类方案已经很多，当前更适合先观察差异化切口再决定是否继续投入。',
      },
    },
    finalDecision: {
      action: 'IGNORE',
      moneyPriority: 'P3',
      reasonZh: '同类方案已经很多，当前更适合先观察差异化切口再决定是否继续投入。',
      decisionSummary: {
        reasonZh: '同类方案已经很多，当前更适合先观察差异化切口再决定是否继续投入。',
      },
    },
  });
  const summary = getRepositoryDecisionSummary(repository);
  const headline = getRepositoryDecisionHeadline(repository, summary, {
    forceDegrade: true,
  });

  assert.doesNotMatch(headline, /低优先观察池/);
  assert.match(headline, /先观察差异化切口/);
});

test('force-degraded technical headline reuses specific risk reason instead of generic technical template', () => {
  const repository = createRepositoryFixture({
    analysis: {
      insightJson: {
        verdictReason:
          '这个项目更像技术能力或可借鉴方向，但产品边界和付费逻辑还不够清楚，先按可以抄处理更稳。',
      },
    },
    finalDecision: {
      projectType: 'demo',
      reasonZh:
        '这个项目更像技术能力或可借鉴方向，但产品边界和付费逻辑还不够清楚，先按可以抄处理更稳。',
      decisionSummary: {
        reasonZh:
          '这个项目更像技术能力或可借鉴方向，但产品边界和付费逻辑还不够清楚，先按可以抄处理更稳。',
      },
    },
  });
  const summary = getRepositoryDecisionSummary(repository);
  const headline = getRepositoryDecisionHeadline(repository, summary, {
    forceDegrade: true,
  });

  assert.notEqual(
    headline,
    '这个项目当前更像技术实现或能力示例，具体用户和使用场景还不够清晰。',
  );
  assert.match(headline, /产品边界和付费逻辑还不够清楚/);
});

test('fallback idea analysis drops English-heavy light-analysis fields and falls back to Chinese-safe copy', () => {
  const repository = createRepositoryFixture({
    analysisState: {
      lightAnalysis: {
        targetUsers:
          'SMB customer support teams, No-code developers, AI automation agencies',
        monetization:
          'Subscription tiers based on message volume and premium features',
        whyItMatters: '缺少 technical_maturity 证据',
        nextStep: '先补 technical_maturity缺失，再决定是否继续推进。',
        caution: '当前仍缺少 technical_maturity 关键证据，不适合继续维持强结论。',
        source: 'snapshot',
      },
    },
    finalDecision: {
      decisionSummary: {
        targetUsersZh:
          'SMB customer support teams, No-code developers, AI automation agencies',
        monetizationSummaryZh:
          'Subscription tiers based on message volume and premium features',
      },
    },
  });

  const fallback = getRepositoryFallbackIdeaAnalysis(repository);

  assert.doesNotMatch(fallback.targetUsers, /SMB|No-code|agencies/);
  assert.match(fallback.targetUsers, /先从最可能的真实用户访谈开始确认|开发者|用户/);
  assert.doesNotMatch(fallback.monetization, /Subscription|premium features/);
  assert.match(fallback.whyItMatters, /技术成熟度/);
  assert.match(fallback.nextStep, /技术成熟度/);
  assert.match(fallback.caution ?? '', /技术成熟度/);
});
