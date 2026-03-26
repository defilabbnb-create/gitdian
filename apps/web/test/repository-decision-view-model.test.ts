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
    '收费路径先按未确认处理，补分析后再判断是否具备收费空间。',
  );
  assert.equal(
    decisionView.display.targetUsersLabel,
    '先确认谁会持续使用它，再决定要不要继续投入。',
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
