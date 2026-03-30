import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRepositoryDecisionHeadline,
  getRepositoryDecisionSummary,
  getRepositoryDisplayMonetizationLabel,
  getRepositoryDisplayTargetUsersLabel,
  getRepositoryFallbackIdeaAnalysis,
  getRepositoryHomepageDecisionReason,
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

test('thin fallback summary reuses light analysis when final decision is missing', () => {
  const repository = createRepositoryFixture({
    finalDecision: null,
    analysisState: {
      lightAnalysis: {
        targetUsers: '跨境卖家和客服团队',
        monetization: '适合先按席位订阅和自动化处理量收费。',
        whyItMatters: '这个方向能直接减少重复客服处理成本。',
        nextStep: '先验证最常见的自动化工单流程。',
        source: 'snapshot',
      },
    },
  });

  const summary = getRepositoryDecisionSummary(repository);

  assert.equal(summary.targetUsersLabel, '跨境卖家和客服团队');
  assert.equal(summary.monetizationLabel, '适合先按席位订阅和自动化处理量收费。');
  assert.match(summary.verdictReason, /减少重复客服处理成本|自动化工单流程/);
});

test('final-decision summary falls back to light-analysis text and inferred category labels', () => {
  const repository = createRepositoryFixture({
    analysis: {
      insightJson: {
        oneLinerZh: '一个帮客服团队集中处理工单与自动回复的工具',
        verdictReason: '客服场景已经比较明确，只差最后一轮收费验证。',
        category: {
          main: 'tools',
          sub: 'automation',
        },
      },
    },
    analysisState: {
      lightAnalysis: {
        targetUsers: '客服团队和运营人员',
        monetization: '可先按团队席位订阅和托管服务验证付费。',
        whyItMatters: '客服场景已经比较明确，只差最后一轮收费验证。',
        nextStep: '先找 5 个客服团队确认是否愿意按席位付费。',
        source: 'snapshot',
      },
    },
    finalDecision: {
      categoryLabelZh: '',
      categoryMain: null,
      categorySub: null,
      reasonZh: '',
      moneyDecision: {
        targetUsersZh: '',
        monetizationSummaryZh: '',
        reasonZh: '',
      },
      decisionSummary: {
        headlineZh: '',
        reasonZh: '',
        targetUsersZh: '',
        monetizationSummaryZh: '',
        categoryLabelZh: '',
      },
    },
  });

  const summary = getRepositoryDecisionSummary(repository);

  assert.equal(summary.targetUsersLabel, '客服团队和运营人员');
  assert.equal(summary.monetizationLabel, '可先按团队席位订阅和托管服务验证付费。');
  assert.equal(summary.categoryLabel, '工具类 / 自动化工具');
  assert.match(summary.verdictReason, /客服场景已经比较明确/);
  assert.equal(
    getRepositoryDisplayTargetUsersLabel(repository, summary),
    '客服团队和运营人员',
  );
  assert.equal(
    getRepositoryDisplayMonetizationLabel(repository, summary),
    '可先按团队席位订阅和托管服务验证付费。',
  );
  assert.match(
    getRepositoryHomepageDecisionReason(repository, summary),
    /可以收费|收费验证/,
  );
});

test('thin fallback summary reuses light-analysis copy when final decision is missing', () => {
  const repository = createRepositoryFixture({
    finalDecision: null,
    analysis: {
      insightJson: {
        oneLinerZh: '一个帮独立开发者管理自动化脚本与提醒任务的工具',
        verdict: 'GOOD',
        action: 'BUILD',
        verdictReason: '独立开发者的重复任务明确，适合先做最小付费验证。',
        category: {
          main: 'tools',
          sub: 'automation',
        },
      },
    },
    analysisState: {
      lightAnalysis: {
        targetUsers: '独立开发者和小团队',
        monetization: '可以先按团队订阅和高级自动化模板收费。',
        whyItMatters: '独立开发者的重复任务明确，适合先做最小付费验证。',
        nextStep: '先做一个自动化模板包，再找 3 个付费意愿强的用户试用。',
        source: 'snapshot',
      },
    },
  });

  const summary = getRepositoryDecisionSummary(repository);

  assert.equal(summary.action, 'BUILD');
  assert.equal(summary.targetUsersLabel, '独立开发者和小团队');
  assert.equal(summary.monetizationLabel, '可以先按团队订阅和高级自动化模板收费。');
  assert.equal(summary.categoryLabel, '工具类 / 自动化工具');
  assert.match(summary.verdictReason, /最小付费验证/);
});
