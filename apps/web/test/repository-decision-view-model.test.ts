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
  assert.match(decisionView.display.reason, /macOS本地隐私场景/);
  assert.doesNotMatch(decisionView.display.reason, /技术成熟度/);
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
