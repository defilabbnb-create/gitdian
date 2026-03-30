import assert from 'node:assert/strict';
import test from 'node:test';
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
    '独立开发者和小团队',
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
