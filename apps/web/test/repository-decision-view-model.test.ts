import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRepositoryItem } from '../src/lib/api/normalizers';
import { buildRepositoryDecisionViewModel } from '../src/lib/repository-decision-view-model';
import { createRepositoryFixture } from './helpers/repository-fixture';

test('marks hasFinalDecision without deep analysis as provisional', () => {
  const repository = createRepositoryFixture({
    analysis: {
      deepAnalysisStatus: 'NOT_STARTED',
      ideaFitJson: null,
      extractedIdeaJson: null,
      completenessJson: null,
    },
    analysisState: {
      analysisStatus: 'DISPLAY_READY',
      displayStatus: 'TRUSTED_READY',
      deepReady: false,
      fullDeepReady: false,
      lightDeepReady: false,
      fullyAnalyzed: false,
      incompleteReason: 'NO_DEEP_ANALYSIS',
      incompleteReasons: ['NO_DEEP_ANALYSIS'],
    },
  });

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'provisional');
  assert.equal(decisionView.flags.hasFinalDecisionWithoutDeep, true);
  assert.equal(decisionView.display.actionLabel, '先补分析');
  assert.equal(decisionView.display.finalDecisionLabel, '基础判断 · 仅供参考');
});

test('provisional display reason prefers concrete snapshot scene over repair-only hints', () => {
  const repository = normalizeRepositoryItem(
    createRepositoryFixture({
      analysis: {
        deepAnalysisStatus: 'NOT_STARTED',
        ideaFitJson: null,
        completenessJson: null,
        extractedIdeaJson: {
          ideaSummary: '一个帮开发者在命令行里搜索歌曲并管理播放列表的 CLI 工具',
          targetUsers: ['开发者和小团队'],
        },
        ideaSnapshotJson: {
          oneLinerZh: 'macOS 用户利用本地大模型进行会议转录和语音输入，产出纯文本记录。',
          reason:
            '明确针对macOS本地隐私场景，对标Granola和WisprFlow，具备清晰的SaaS或独立应用商业化路径。',
        },
        moneyPriority: {
          targetUsersZh: '开发者和小团队',
          reasonZh: 'technical_maturity 证据偏弱',
        },
      },
      analysisState: {
        analysisStatus: 'REVIEW_PENDING',
        displayStatus: 'BASIC_READY',
        trustedDisplayReady: false,
        highConfidenceReady: false,
        lightDeepReady: false,
        fullDeepReady: false,
        deepReady: false,
        fullyAnalyzed: false,
        incompleteReason: 'NO_DEEP_ANALYSIS',
        incompleteReasons: ['NO_DEEP_ANALYSIS'],
        lightAnalysis: {
          targetUsers: '开发者和小团队',
          whyItMatters: 'technical_maturity 证据偏弱',
          nextStep: '先补弱证据并刷新判断，再决定是否继续推进。',
          source: 'snapshot',
        },
      },
      finalDecision: {
        reasonZh: '这个方向需求明确，虽然同类不少，但只要切口更准，还是值得继续做。',
        decisionSummary: {
          reasonZh: 'technical_maturity 证据偏弱',
          targetUsersZh: '开发者和小团队',
        },
        moneyDecision: {
          targetUsersZh: '开发者和小团队',
          reasonZh:
            '这是面向明确开发者 / 团队工作流的真工具，用户、场景和产品边界都比较清楚，而且小团队有现实机会把它快速包装成可收费产品。',
        },
      },
    }),
  );

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'provisional');
  assert.equal(decisionView.display.targetUsersLabel, '需要会议转录或语音输入的 macOS 用户');
  assert.match(decisionView.display.reason, /macOS本地隐私场景|会议转录和语音输入|技术成熟度/);
  assert.doesNotMatch(decisionView.display.reason, /命令行里搜索歌曲/);
});

test('downgrades fallback repositories to degraded safe copy', () => {
  const repository = createRepositoryFixture({
    analysisState: {
      fallbackVisible: true,
      displayStatus: 'BASIC_READY',
      deepReady: false,
    },
  });

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'degraded');
  assert.equal(decisionView.flags.fallback, true);
  assert.equal(
    decisionView.display.monetizationLabel,
    '可以做团队订阅',
  );
  assert.equal(
    decisionView.display.targetUsersLabel,
    '先从最可能的真实用户访谈开始确认谁会持续使用它。',
  );
});

test('reuses light analysis users and monetization copy for degraded repositories', () => {
  const repository = createRepositoryFixture({
    analysisState: {
      displayStatus: 'UNSAFE',
      trustedDisplayReady: false,
      highConfidenceReady: false,
      fullyAnalyzed: false,
      unsafe: true,
      incompleteReason: 'NO_CLAUDE_REVIEW',
      incompleteReasons: ['NO_CLAUDE_REVIEW'],
      lightAnalysis: {
        targetUsers: '跨境卖家和客服团队',
        monetization: '适合先按席位订阅和自动化处理量收费。',
        whyItMatters: '这个方向能直接减少重复客服处理成本。',
        nextStep: '先验证最常见的自动化工单流程。',
        source: 'snapshot',
      },
    },
  });

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'degraded');
  assert.equal(decisionView.display.targetUsersLabel, '跨境卖家和客服团队');
  assert.equal(
    decisionView.display.monetizationLabel,
    '适合先按席位订阅和自动化处理量收费。',
  );
});

test('downgraded repositories still surface specific light-analysis users and monetization', () => {
  const repository = createRepositoryFixture({
    analysisState: {
      fallbackVisible: true,
      displayStatus: 'BASIC_READY',
      deepReady: false,
      lightAnalysis: {
        targetUsers: '客服团队和运营人员',
        monetization: '可先按团队席位订阅和托管服务验证付费。',
        whyItMatters: '客服场景已经比较明确，只差最后一轮收费验证。',
        nextStep: '先找 5 个客服团队确认是否愿意按席位付费。',
        source: 'snapshot',
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

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'degraded');
  assert.equal(decisionView.display.targetUsersLabel, '客服团队和运营人员');
  assert.equal(
    decisionView.display.monetizationLabel,
    '可先按团队席位订阅和托管服务验证付费。',
  );
});

test('degraded repositories still surface concrete module summaries and localized conflict reasons', () => {
  const repository = createRepositoryFixture({
    analysis: {
      ideaFitJson: {
        coreJudgement: '这个方向已经有明确使用场景，但市场验证还不够扎实。',
        opportunityLevel: 'MEDIUM',
      },
      extractedIdeaJson: {
        extractMode: 'light',
        ideaSummary: '一款本地优先的代码片段管理 CLI 工具',
        targetUsers: ['独立开发者'],
        monetization: '可以先按专业版订阅收费。',
      },
      completenessJson: {
        summary: 'README 已经说清了核心流程，但工程化和测试覆盖还偏薄。',
        completenessLevel: 'MEDIUM',
        runability: 'MEDIUM',
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
        targetUsers: '独立开发者',
        monetization: '可以先按专业版订阅收费。',
        whyItMatters: '冲突集中在 market',
        nextStep: '先补市场证据再决定是否继续推进。',
        source: 'snapshot',
      },
    },
  });

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'degraded');
  assert.match(decisionView.display.reason, /市场/);
  assert.doesNotMatch(decisionView.display.reason, /market/);
  assert.match(
    decisionView.analysisModules.ideaExtract.detailSummary,
    /代码片段管理 CLI 工具/,
  );
  assert.match(
    decisionView.analysisModules.ideaExtract.detailSummary,
    /目标用户：独立开发者/,
  );
  assert.match(
    decisionView.analysisModules.ideaExtract.detailSummary,
    /收费路径：可以先按专业版订阅收费/,
  );
  assert.equal(
    decisionView.analysisModules.ideaExtract.originalAnalysis,
    '一款本地优先的代码片段管理 CLI 工具',
  );
  assert.match(
    decisionView.analysisModules.completeness.detailSummary,
    /README 已经说清了核心流程/,
  );
});

test('degraded display prefers homepage reason and derived users over stale fallback-analysis conflict copy', () => {
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

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'degraded');
  assert.equal(decisionView.display.targetUsersLabel, '跨设备使用 Claude Code 的开发者');
  assert.match(decisionView.display.reason, /极早期阶段|高频刚需/);
  assert.doesNotMatch(decisionView.display.reason, /当前冲突主要集中在/);
});

test('degraded display keeps mixed technical Chinese headline and avoids polluted fallback copy', () => {
  const repository = normalizeRepositoryItem(
    createRepositoryFixture({
      name: 'react-native-agentic-ai',
      fullName: 'mohamed2m2018/react-native-agentic-ai',
      description:
        'Autonomous AI Agent SDK for React Native & Expo with voice control, natural language UI actions, and MCP-powered testing.',
      topics: ['react-native', 'expo', 'ai-agent', 'mcp', 'testing'],
      analysis: {
        ideaSnapshotJson: {
          oneLinerZh:
            '面向 React Native 的自主 AI 代理 SDK，支持语音交互、自然语言 UI 控制和自动化测试。',
        },
        extractedIdeaJson: {
          ideaSummary:
            'Mobile AI TestPilot: A SaaS platform for autonomous, natural language mobile app testing that eliminates brittle UI selectors.',
        },
        insightJson: {
          oneLinerZh:
            '一个用于在命令行里搜索歌曲并管理播放列表的基础设施组件，主要面向开发者',
          verdictReason:
            '这个项目更像技术能力或可借鉴方向，但产品边界和付费逻辑还不够清楚，先按可以抄处理更稳。',
          projectReality: {
            type: 'tool',
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
      },
      finalDecision: {
        action: 'CLONE',
        moneyPriority: 'P2',
        oneLinerZh:
          '一个用于在命令行里搜索歌曲并管理播放列表的基础设施组件，主要面向开发者',
        reasonZh:
          '这个项目更像技术能力或可借鉴方向，但产品边界和付费逻辑还不够清楚，先按可以抄处理更稳。',
        moneyDecision: {
          targetUsersZh: '开发者 / 工程团队',
          monetizationSummaryZh: '收费路径还不够清楚，建议先确认真实用户和场景。',
          reasonZh:
            '这个项目更像技术能力或可借鉴方向，但产品边界和付费逻辑还不够清楚，先按可以抄处理更稳。',
        },
        decisionSummary: {
          headlineZh:
            '一个用于在命令行里搜索歌曲并管理播放列表的基础设施组件，主要面向开发者',
          targetUsersZh: '开发者 / 工程团队',
          monetizationSummaryZh: '收费路径还不够清楚，建议先确认真实用户和场景。',
          reasonZh:
            '这个项目更像技术能力或可借鉴方向，但产品边界和付费逻辑还不够清楚，先按可以抄处理更稳。',
        },
      },
    }),
  );

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'degraded');
  assert.match(decisionView.display.headline, /React Native|AI 代理 SDK/);
  assert.doesNotMatch(decisionView.display.headline, /播放列表/);
  assert.match(decisionView.display.reason, /能力层或参考实现|收费逻辑还没真正跑通/);
  assert.doesNotMatch(decisionView.display.reason, /当前信号存在冲突/);
});

test('historical repair degraded repositories hide strong priority and stale module copy', () => {
  const repository = normalizeRepositoryItem(
    createRepositoryFixture({
      analysis: {
        ideaFitJson: {
          opportunityLevel: 'B',
          coreJudgement: '这是一个值得快速推进的浏览器工具机会。',
        },
        extractedIdeaJson: {
          extractMode: 'light',
          ideaSummary: '一个用于部署和交付应用的基础设施组件，主要面向开发者',
          targetUsers: ['开发者和小团队'],
          monetization: '收费路径暂时不够清楚，先用访谈或试运行确认是否有人愿意为它付费。',
        },
        completenessJson: {
          completenessLevel: 'HIGH',
          summary: '当前完整性等级 HIGH',
        },
      },
      analysisState: {
        analysisStatus: 'REVIEW_PENDING',
        displayStatus: 'UNSAFE',
        frontendDecisionState: 'degraded',
        displayStatusReason: 'historical_repair_guard:decision_recalc',
        analysisStatusReason: '冲突集中在 user / monetization / execution',
        trustedDisplayReady: false,
        highConfidenceReady: false,
        fullyAnalyzed: false,
        unsafe: true,
        incompleteReason: 'NO_CLAUDE_REVIEW',
        incompleteReasons: ['NO_CLAUDE_REVIEW'],
        lightAnalysis: {
          targetUsers: '开发者和小团队',
          monetization: '收费路径暂时不够清楚，先用访谈或试运行确认是否有人愿意为它付费。',
          whyItMatters: '冲突集中在 user / monetization / execution',
          caution: '当前存在 user冲突 / monetization冲突 / execution冲突，继续推进前应先重算判断。',
          nextStep: '暂不投入，先放进观察池；只有当后面出现更明确用户、价值或收费路径时再继续。',
          source: 'snapshot',
        },
      },
      finalDecision: {
        moneyPriority: 'P0',
        reasonZh: '这是个典型工具型机会，问题明确，也有机会很快包装成收费产品。',
        decisionSummary: {
          headlineZh: '一个帮开发者部署和交付应用的浏览器扩展',
          reasonZh: '这是个典型工具型机会，问题明确，也有机会很快包装成收费产品。',
          targetUsersZh: '开发者和小团队',
          monetizationSummaryZh: '收费路径暂时不够清楚，先用访谈或试运行确认是否有人愿意为它付费。',
        },
        moneyDecision: {
          targetUsersZh: '开发者和小团队',
          monetizationSummaryZh: '收费路径暂时不够清楚，先用访谈或试运行确认是否有人愿意为它付费。',
          reasonZh:
            '这是面向明确开发者 / 团队工作流的真工具，用户、场景和产品边界都比较清楚，而且小团队有现实机会把它快速包装成可收费产品。',
        },
        evidenceDecision: {
          summaryZh: '当前判断由 user冲突 / monetization冲突 / execution冲突 卡住，必须先重算判断。',
        } as any,
      } as any,
    }),
  );

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'degraded');
  assert.equal(decisionView.display.priorityLabel, '优先级待复核');
  assert.equal(decisionView.detail.statusLabel, '待重算');
  assert.match(decisionView.display.reason, /重算判断|用户冲突|收费冲突|执行冲突/);
  assert.doesNotMatch(decisionView.display.reason, /典型工具型机会/);
  assert.equal(decisionView.analysisModules.ideaExtract.statusLabel, '历史结果待重算');
  assert.match(decisionView.analysisModules.ideaExtract.detailSummary, /历史结果|待重算/);
  assert.doesNotMatch(decisionView.analysisModules.ideaExtract.detailSummary, /部署和交付应用/);
  assert.equal(decisionView.analysisModules.ideaExtract.originalAnalysis, null);
  assert.equal(
    decisionView.analysisModules.ideaExtract.detailMetrics.find(
      (metric) => metric.label === '目标用户',
    )?.value,
    '待重算',
  );
});

test('downgrades conflicts to degraded observe-first action', () => {
  const repository = createRepositoryFixture({
    finalDecision: {
      hasConflict: true,
      decisionSummary: {
        finalDecisionLabelZh: '值得做 · 立即做',
      },
    },
  });

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'degraded');
  assert.equal(decisionView.flags.conflict, true);
  assert.equal(decisionView.display.actionLabel, '先观察');
  assert.equal(decisionView.display.finalDecisionLabel, '保守判断 · 仅供参考');
});

test('downgrades incomplete repositories when key analysis is missing', () => {
  const repository = createRepositoryFixture({
    analysis: {
      insightJson: null,
    },
    analysisState: {
      fullyAnalyzed: false,
      incompleteReason: 'NO_INSIGHT',
      incompleteReasons: ['NO_INSIGHT'],
    },
  });

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'degraded');
  assert.equal(decisionView.flags.incomplete, true);
  assert.equal(decisionView.display.actionLabel, '先补分析');
});

test('keeps deep-complete repositories trusted', () => {
  const repository = createRepositoryFixture();

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'trusted');
  assert.equal(decisionView.flags.allowStrongClaims, true);
  assert.equal(decisionView.display.actionLabel, '立即做');
  assert.equal(decisionView.display.finalDecisionLabel, '值得做 · 立即做');
  assert.equal(decisionView.detail.primaryActionLabel, '开始验证');
});

test('deep-complete provisional repositories can still start validation on detail page', () => {
  const repository = createRepositoryFixture({
    analysisState: {
      analysisStatus: 'REVIEW_PENDING',
      displayStatus: 'BASIC_READY',
      frontendDecisionState: 'provisional',
      displayReady: true,
      trustedDisplayReady: false,
      highConfidenceReady: false,
      reviewReady: false,
      fullyAnalyzed: false,
      lightDeepReady: true,
      fullDeepReady: true,
      deepReady: true,
      fallbackVisible: false,
      unsafe: false,
    },
  });

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'provisional');
  assert.equal(decisionView.detail.primaryActionLabel, '开始验证');
  assert.equal(
    decisionView.detail.baseJudgementNotice,
    '关键分析已补齐，但当前仍待最终复核。',
  );
});

test('respects frontend decision state when backend marks a repo as provisional', () => {
  const repository = createRepositoryFixture({
    analysisState: {
      displayStatus: 'BASIC_READY',
      frontendDecisionState: 'provisional',
      trustedDisplayReady: false,
      highConfidenceReady: false,
      reviewReady: false,
      fullyAnalyzed: false,
      incompleteReason: 'NO_CLAUDE_REVIEW',
      incompleteReasons: ['NO_CLAUDE_REVIEW'],
      lightAnalysis: {
        targetUsers: '开发者和小团队',
        monetization: '可以先按团队订阅、专业版或托管服务收费，重点验证谁会持续付费。',
        whyItMatters: 'distribution / execution / technical_maturity 证据偏弱',
        nextStep: '先补弱证据并刷新判断，再决定是否继续推进。',
        source: 'snapshot',
      },
    },
    description:
      'Generate production-ready App Store screenshots for iOS apps with automated design and export at Apple-required resolutions.',
    topics: ['ios', 'screenshots', 'app-store-connect'],
    finalDecision: {
      decisionSummary: {
        headlineZh: '一个帮开发者改写简历并生成 ATS 匹配评分的 CLI 工具',
        targetUsersZh: '开发者和小团队',
      },
    },
  });

  const decisionView = buildRepositoryDecisionViewModel(repository);

  assert.equal(decisionView.displayState, 'provisional');
  assert.equal(
    decisionView.display.targetUsersLabel,
    'iOS 应用开发者和移动产品团队',
  );
  assert.match(decisionView.display.reason, /分发、执行、技术成熟度/);
  assert.doesNotMatch(decisionView.display.reason, /distribution|execution/);
});
