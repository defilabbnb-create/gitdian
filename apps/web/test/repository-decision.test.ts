import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRepositoryDecisionHeadline,
  getRepositoryDecisionSummary,
  getRepositoryActionBehaviorContext,
  getRepositoryDisplayMonetizationLabel,
  getRepositoryDisplayTargetUsersLabel,
  getRepositoryFallbackIdeaAnalysis,
  getRepositoryHomepageDecisionReason,
  getRepositoryHomepageMonetizationAnswer,
} from '../src/lib/repository-decision';
import { normalizeRepositoryItem } from '../src/lib/api/normalizers';
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

test('force-degraded headline prefers concrete snapshot subject and localizes conflict dimensions', () => {
  const repository = createRepositoryFixture({
    analysis: {
      ideaSnapshotJson: {
        oneLinerZh: '一款本地优先的代码片段管理 CLI 工具',
      },
      insightJson: {
        oneLinerZh: '一个帮开发者记录 token 与成本明细的 CLI 工具',
        verdictReason: '冲突集中在 market',
      },
    },
    analysisState: {
      lightAnalysis: {
        targetUsers: '开发者',
        monetization: '适合先按专业版订阅收费。',
        whyItMatters: '冲突集中在 market',
        nextStep: '先补市场证据。',
        source: 'snapshot',
      },
      unsafe: true,
      displayStatus: 'UNSAFE',
      incompleteReason: 'NO_CLAUDE_REVIEW',
      incompleteReasons: ['NO_CLAUDE_REVIEW'],
    },
    finalDecision: {
      action: 'IGNORE',
      moneyPriority: 'P3',
      decisionSummary: {
        headlineZh: '一个帮开发者记录 token 与成本明细的 CLI 工具',
      },
    },
  });

  const summary = getRepositoryDecisionSummary(repository);
  const headline = getRepositoryDecisionHeadline(repository, summary, {
    forceDegrade: true,
  });

  assert.match(headline, /代码片段管理 CLI 工具/);
  assert.match(headline, /市场/);
  assert.doesNotMatch(headline, /market/);
  assert.doesNotMatch(headline, /冲突主要集中在/);
  assert.doesNotMatch(headline, /token 与成本明细/);
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
    categoryL1: 'tools',
    categoryL2: 'automation',
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
  assert.match(summary.oneLiner, /跨境卖家和客服团队|自动化工具/);
  assert.doesNotMatch(summary.oneLiner, /中文摘要还在校正/);
});

test('fallback idea analysis reuses extracted idea and deep modules when light analysis is missing', () => {
  const repository = createRepositoryFixture({
    analysis: {
      ideaFitJson: {
        coreJudgement: '客服协作场景已经明确，但还缺最后一轮付费验证。',
      },
      extractedIdeaJson: {
        ideaSummary: '把客服工单、自动回复和知识库集中到一个工作台里。',
        targetUsers: ['客服主管'],
        monetization: '可以先按团队席位订阅收费。',
      },
      completenessJson: {
        summary: 'README 已经说明核心流程，当前主要缺真实团队的落地反馈。',
      },
    },
    analysisState: {
      lightAnalysis: null,
    },
    finalDecision: null,
  });

  const fallback = getRepositoryFallbackIdeaAnalysis(repository);

  assert.equal(fallback.targetUsers, '客服主管');
  assert.equal(fallback.monetization, '可以先按团队席位订阅收费。');
  assert.match(fallback.useCase, /客服协作场景已经明确|工作台/);
  assert.match(fallback.whyItMatters, /客服协作场景已经明确|README 已经说明核心流程/);
});

test('fallback idea analysis prefers repository metadata over hallucinated generic copy', () => {
  const repository = createRepositoryFixture({
    description:
      'Generate production-ready App Store screenshots for iOS apps with automated design and export at Apple-required resolutions.',
    topics: ['ios', 'screenshots', 'app-store-connect'],
    analysisState: {
      lightAnalysis: {
        targetUsers: '开发者和小团队',
        monetization: '可以先按团队订阅、专业版或托管服务收费，重点验证谁会持续付费。',
        whyItMatters: 'distribution / execution / technical_maturity 证据偏弱',
        nextStep: '先补弱证据并刷新判断，再决定是否继续推进。',
        source: 'snapshot',
      },
    },
    finalDecision: {
      decisionSummary: {
        headlineZh: '一个帮开发者改写简历并生成 ATS 匹配评分的 CLI 工具',
        targetUsersZh: '开发者和小团队',
      },
    },
  });

  const fallback = getRepositoryFallbackIdeaAnalysis(repository);

  assert.match(fallback.headline, /App Store 截图/);
  assert.match(fallback.targetUsers, /iOS 应用开发者和移动产品团队/);
  assert.match(fallback.whyItMatters, /分发、执行、技术成熟度这几块证据还偏弱/);
  assert.doesNotMatch(fallback.whyItMatters, /distribution|execution/);
});

test('fallback idea analysis prefers concrete sync users and early-stage reason over stale conflict copy', () => {
  const repository = normalizeRepositoryItem(
    createRepositoryFixture({
      name: 'claude-context-sync',
      fullName: 'acme/claude-context-sync',
      description: 'Sync Claude Code conversations across devices.',
      topics: ['claude-code', 'session-sync', 'cross-device-sync'],
      stars: 4,
      forks: 0,
      analysis: {
        ideaSnapshotJson: {
          oneLinerZh: '一个用于在设备间同步 Claude Code 会话的工具',
          reason: '项目处于极早期阶段，先确认跨设备同步是不是高频刚需。',
          isPromising: false,
          nextAction: 'SKIP',
        },
        extractedIdeaJson: {
          ideaSummary: '一个帮开发者在命令行里搜索歌曲并管理播放列表的 CLI 工具',
          targetUsers: ['运营团队和需要自动化流程的小团队'],
        },
        insightJson: {
          oneLinerZh: '一个帮开发者在命令行里搜索歌曲并管理播放列表的 CLI 工具',
          verdictReason: '当前冲突主要集中在 用户、分发、收费、执行。',
          projectReality: {
            type: 'tool',
            hasRealUser: false,
            hasClearUseCase: false,
            isDirectlyMonetizable: false,
          },
        },
      },
      analysisState: {
        displayStatus: 'UNSAFE',
        trustedDisplayReady: false,
        highConfidenceReady: false,
        fullyAnalyzed: false,
        unsafe: true,
        incompleteReason: 'NO_CLAUDE_REVIEW',
        incompleteReasons: ['NO_CLAUDE_REVIEW'],
        lightAnalysis: {
          targetUsers: '运营团队和需要自动化流程的小团队',
          whyItMatters:
            '当前冲突主要集中在 user, distribution, monetization, execution',
          nextStep: '先确认跨设备同步是否真是高频场景。',
          source: 'snapshot',
        },
      },
      finalDecision: {
        action: 'IGNORE',
        moneyPriority: 'P3',
        decisionSummary: {
          headlineZh: '一个用于在设备间同步 Claude Code 会话的工具',
          reasonZh:
            '项目处于极早期阶段，4 星 0 Fork，先确认跨设备同步是不是高频刚需。',
          targetUsersZh: '跨设备使用 Claude Code 的开发者',
        },
      },
    }),
  );

  const summary = getRepositoryDecisionSummary(repository);
  const fallback = getRepositoryFallbackIdeaAnalysis(repository, summary);

  assert.equal(fallback.targetUsers, '跨设备使用 Claude Code 的开发者');
  assert.match(fallback.whyItMatters, /极早期阶段|高频刚需/);
  assert.match(fallback.useCase, /极早期阶段|高频刚需/);
  assert.doesNotMatch(fallback.whyItMatters, /当前冲突主要集中在/);
});

test('default headline falls back away from stale token-cost copy on visible repositories', () => {
  const repository = createRepositoryFixture({
    description: 'Manage reusable code snippets with local-first search and quick insert.',
    topics: ['snippet', 'developer-tool'],
    analysis: {
      ideaSnapshotJson: {
        oneLinerZh: '一款本地优先的代码片段管理 CLI 工具',
        reason: '当前主要缺少更多真实团队的留存证据。',
      },
      insightJson: {
        oneLinerZh: '一个帮开发者记录 token 与成本明细的 CLI 工具',
        verdictReason: '当前冲突主要集中在 user / monetization。',
      },
    },
    finalDecision: {
      oneLinerZh: '一个帮开发者记录 token 与成本明细的 CLI 工具',
      decisionSummary: {
        headlineZh: '一个帮开发者记录 token 与成本明细的 CLI 工具',
      },
    },
  });

  const summary = getRepositoryDecisionSummary(repository);
  const headline = getRepositoryDecisionHeadline(repository, summary);

  assert.match(headline, /代码片段管理 CLI 工具/);
  assert.doesNotMatch(headline, /token 与成本明细/);
});

test('force-degraded headline keeps specific sports-api subject instead of generic metadata fallback', () => {
  const repository = normalizeRepositoryItem(
    createRepositoryFixture({
      name: 'Corneteiro',
      fullName: 'acme/Corneteiro',
      description: 'Flask API for Cartola FC lineup recommendation and match analysis.',
      topics: ['cartola', 'fantasy-football', 'flask-api', 'lineup-recommendation'],
      analysis: {
        ideaSnapshotJson: {
          oneLinerZh: '一个基于 Flask 的 Cartola FC 数据分析与阵容推荐 API',
          reason: '已有明确体育数据分析场景，但仍要验证持续使用频率。',
        },
        extractedIdeaJson: {
          ideaSummary: '一个帮团队管理密钥和环境变量的工具',
          targetUsers: ['开发团队和平台工程团队'],
        },
        insightJson: {
          oneLinerZh: '一个帮团队管理密钥和环境变量的工具',
          verdictReason: '当前冲突主要集中在 用户、收费、执行。',
          projectReality: {
            type: 'api',
            hasRealUser: false,
            hasClearUseCase: true,
            isDirectlyMonetizable: false,
          },
        },
      },
      analysisState: {
        displayStatus: 'UNSAFE',
        trustedDisplayReady: false,
        highConfidenceReady: false,
        fullyAnalyzed: false,
        unsafe: true,
        incompleteReason: 'NO_CLAUDE_REVIEW',
        incompleteReasons: ['NO_CLAUDE_REVIEW'],
        lightAnalysis: {
          targetUsers: '开发团队和平台工程团队',
          whyItMatters: '当前冲突主要集中在 user, monetization, execution',
          nextStep: '先验证 Cartola 玩家是否会持续依赖阵容推荐。',
          source: 'snapshot',
        },
      },
      finalDecision: {
        action: 'IGNORE',
        moneyPriority: 'P3',
        decisionSummary: {
          headlineZh: '一个基于 Flask 的 Cartola FC 数据分析与阵容推荐 API',
          reasonZh: '已有明确体育数据分析场景，但仍要验证持续使用频率。',
          targetUsersZh: 'Cartola FC 玩家和体育数据分析用户',
        },
      },
    }),
  );

  const summary = getRepositoryDecisionSummary(repository);
  const headline = getRepositoryDecisionHeadline(repository, summary, {
    forceDegrade: true,
  });
  const fallback = getRepositoryFallbackIdeaAnalysis(repository, summary);

  assert.match(headline, /Cartola FC 数据分析与阵容推荐 API/);
  assert.equal(fallback.targetUsers, 'Cartola FC 玩家和体育数据分析用户');
  assert.match(fallback.whyItMatters, /体育数据分析场景|持续使用频率/);
  assert.doesNotMatch(fallback.whyItMatters, /当前冲突主要集中在/);
});

test('trusted display helpers fall back to extracted idea users and monetization when final decision copy is weak', () => {
  const repository = createRepositoryFixture({
    analysis: {
      extractedIdeaJson: {
        targetUsers: ['独立开发者'],
        monetization: '可以先按专业版订阅收费。',
      },
    },
    finalDecision: {
      moneyDecision: {
        targetUsersZh: '',
        monetizationSummaryZh: '',
      },
      decisionSummary: {
        targetUsersZh: '',
        monetizationSummaryZh: '',
      },
    },
  });
  const summary = getRepositoryDecisionSummary(repository);

  assert.equal(getRepositoryDisplayTargetUsersLabel(repository, summary), '独立开发者');
  assert.equal(
    getRepositoryDisplayMonetizationLabel(repository, summary),
    '可以先按专业版订阅收费。',
  );
});

test('display target users prefer repository metadata when final decision copy is overly generic', () => {
  const repository = createRepositoryFixture({
    description:
      'Generate production-ready App Store screenshots for iOS apps with automated design and export at Apple-required resolutions.',
    topics: ['ios', 'screenshots', 'app-store-connect'],
    finalDecision: {
      decisionSummary: {
        targetUsersZh: '开发者和小团队',
      },
      moneyDecision: {
        targetUsersZh: '开发者和小团队',
      },
    },
    analysis: {
      moneyPriority: {
        targetUsersZh: '开发者和小团队',
      },
    },
  });
  const summary = getRepositoryDecisionSummary(repository);

  assert.equal(
    getRepositoryDisplayTargetUsersLabel(repository, summary),
    'iOS 应用开发者和移动产品团队',
  );
});

test('display target users trims subject-led snapshot copy down to the actual audience', () => {
  const repository = normalizeRepositoryItem(
    createRepositoryFixture({
      analysis: {
        ideaSnapshotJson: {
          oneLinerZh: '面向博彩运营方的数字开奖与资金管理后端系统',
        },
      },
      finalDecision: {
        moneyDecision: {
          targetUsersZh: '',
        },
        decisionSummary: {
          targetUsersZh: '',
        },
      },
    }),
  );
  const summary = getRepositoryDecisionSummary(repository);

  assert.equal(getRepositoryDisplayTargetUsersLabel(repository, summary), '博彩运营方');
});

test('display target users can recover React Native audience from repository metadata', () => {
  const repository = createRepositoryFixture({
    description:
      'Autonomous AI Agent SDK for React Native & Expo with natural language UI control and testing.',
    topics: ['react-native', 'expo', 'ui-automation', 'voice-ai', 'mcp'],
    finalDecision: {
      decisionSummary: {
        targetUsersZh: '开发者和小团队',
      },
      moneyDecision: {
        targetUsersZh: '开发者和小团队',
      },
    },
    analysis: {
      moneyPriority: {
        targetUsersZh: '开发者和小团队',
      },
    },
  });
  const summary = getRepositoryDecisionSummary(repository);

  assert.equal(
    getRepositoryDisplayTargetUsersLabel(repository, summary),
    'React Native 开发者和移动应用团队',
  );
});

test('display target users does not swallow action clauses from subject-led orchestration headlines', () => {
  const repository = normalizeRepositoryItem(
    createRepositoryFixture({
      analysis: {
        ideaSnapshotJson: {
          oneLinerZh:
            '面向开发团队将 Linear 工单转化为沙箱 AI 编码代理并输出 PR 的本地编排服务',
        },
      },
      finalDecision: {
        moneyDecision: {
          targetUsersZh: '',
        },
        decisionSummary: {
          targetUsersZh: '',
        },
      },
    }),
  );
  const summary = getRepositoryDecisionSummary(repository);

  assert.equal(getRepositoryDisplayTargetUsersLabel(repository, summary), '开发团队');
});

test('homepage display infers concrete target users, reason, and monetization from repository-specific signals', () => {
  const concreteHeadline =
    'macOS 用户利用本地大模型进行会议转录和语音输入，产出纯文本记录。';
  const repository = createRepositoryFixture({
    description: concreteHeadline,
    analysis: {
      insightJson: {
        oneLinerZh: concreteHeadline,
        verdictReason: '技术成熟度 证据偏弱',
      },
      moneyPriority: {
        reasonZh: '技术成熟度 证据偏弱',
        targetUsersZh: '开发者和小团队',
        monetizationSummaryZh: '可以做团队订阅',
      },
      extractedIdeaJson: {
        ideaSummary: concreteHeadline,
        targetUsers: [],
        monetization: '',
      },
    },
    finalDecision: {
      oneLinerZh: concreteHeadline,
      reasonZh: '技术成熟度 证据偏弱',
      moneyDecision: {
        targetUsersZh: '开发者和小团队',
        monetizationSummaryZh: '可以做团队订阅',
        reasonZh: '技术成熟度 证据偏弱',
      },
      decisionSummary: {
        headlineZh: concreteHeadline,
        targetUsersZh: '开发者和小团队',
        monetizationSummaryZh: '可以做团队订阅',
        reasonZh: '技术成熟度 证据偏弱',
      },
    },
  });
  const summary = getRepositoryDecisionSummary(repository);

  assert.match(
    getRepositoryDisplayTargetUsersLabel(repository, summary),
    /macOS 用户/,
  );
  assert.match(
    getRepositoryHomepageDecisionReason(repository, summary),
    /macOS 用户利用本地大模型进行会议转录和语音输入/,
  );
  assert.match(
    getRepositoryHomepageDecisionReason(repository, summary),
    /技术成熟度(?:这块|这几块)?证据还偏弱|技术成熟度证据偏弱|技术成熟度 证据偏弱/,
  );
  assert.equal(
    getRepositoryDisplayMonetizationLabel(repository, summary),
    '更适合按专业版订阅、录音时长或团队席位收费。',
  );
  assert.equal(
    getRepositoryHomepageMonetizationAnswer(repository, summary),
    '更适合按专业版订阅、录音时长或团队席位收费。',
  );
});

test('display target users can infer product-specific users from plugin-style headlines', () => {
  const repository = createRepositoryFixture({
    description: 'Internal analytics tool',
    analysis: {
      insightJson: {
        oneLinerZh: '一个让 Claude Code 用户分析本地会话 Token 消耗和成本的插件',
      },
    },
    finalDecision: {
      oneLinerZh: '一个让 Claude Code 用户分析本地会话 Token 消耗和成本的插件',
      moneyDecision: {
        targetUsersZh: '开发者和小团队',
      },
      decisionSummary: {
        headlineZh: '一个让 Claude Code 用户分析本地会话 Token 消耗和成本的插件',
        targetUsersZh: '开发者和小团队',
      },
    },
  });
  const summary = getRepositoryDecisionSummary(repository);

  assert.equal(getRepositoryDisplayTargetUsersLabel(repository, summary), 'Claude Code 用户');
});

test('readme-only noise no longer hijacks degraded headline metadata hints', () => {
  const repository = createRepositoryFixture({
    description: 'Internal analytics tool',
    content: {
      readmeText:
        'playlist song search music player terminal music cli demo content',
    },
    analysis: {
      insightJson: {
        oneLinerZh: '',
        verdictReason: '冲突集中在 distribution',
      },
    },
    finalDecision: {
      action: 'IGNORE',
      moneyPriority: 'P3',
      oneLinerZh: '一个工具',
      decisionSummary: {
        headlineZh: '一个工具',
        reasonZh: '冲突集中在 distribution',
      },
    },
  });
  const summary = getRepositoryDecisionSummary(repository);
  const headline = getRepositoryDecisionHeadline(repository, summary, {
    forceDegrade: true,
  });

  assert.doesNotMatch(headline, /歌曲|播放列表|music/i);
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
    /付费路径|收费验证|可以收费/,
  );
});

test('homepage decision reason prefers concrete trusted reason over generic revenue slogan', () => {
  const repository = createRepositoryFixture({
    analysis: {
      insightJson: {
        verdictReason:
          '客服团队每天都在重复分发和回复工单，适合先做一个最小可收费版本验证。',
      },
      moneyPriority: {
        reasonZh:
          '客服团队每天都在重复分发和回复工单，适合先做一个最小可收费版本验证。',
      },
    },
    finalDecision: {
      reasonZh:
        '客服团队每天都在重复分发和回复工单，适合先做一个最小可收费版本验证。',
      decisionSummary: {
        reasonZh:
          '客服团队每天都在重复分发和回复工单，适合先做一个最小可收费版本验证。',
      },
    },
  });

  const summary = getRepositoryDecisionSummary(repository);

  assert.equal(
    getRepositoryHomepageDecisionReason(repository, summary),
    '客服团队每天都在重复分发和回复工单，适合先做一个最小可收费版本验证。',
  );
});

test('summary and behavior context prefer localized category display labels', () => {
  const repository = createRepositoryFixture({
    analysis: {
      insightJson: {
        category: {
          main: 'other',
          sub: 'other',
        },
        categoryDisplay: {
          main: '工具类',
          sub: '自动化工具',
          label: '工具类 / 自动化工具',
        },
      },
    },
    finalDecision: {
      categoryLabelZh: '',
      categoryMain: null,
      categorySub: null,
      decisionSummary: {
        categoryLabelZh: '',
      },
    },
  });

  const summary = getRepositoryDecisionSummary(repository);
  const behaviorContext = getRepositoryActionBehaviorContext(repository, summary);

  assert.equal(summary.categoryLabel, '工具类 / 自动化工具');
  assert.equal(summary.category.label, '工具类 / 自动化工具');
  assert.equal(behaviorContext.categoryLabel, '工具类 / 自动化工具');
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
