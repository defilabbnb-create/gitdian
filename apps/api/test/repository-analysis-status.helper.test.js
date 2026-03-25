const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveRepositoryAnalysisState,
} = require('../dist/modules/analysis/helpers/repository-analysis-status.helper');

test('marks fully analyzed repo as high confidence ready', () => {
  const state = deriveRepositoryAnalysisState({
    source: 'claude',
    action: 'BUILD',
    moneyPriority: 'P1',
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasIdeaFit: true,
    hasIdeaExtract: true,
    hasCompleteness: true,
    hasClaudeReview: true,
    hasRealUser: true,
    hasClearUseCase: true,
    isDirectlyMonetizable: true,
    oneLinerStrength: 'STRONG',
  });

  assert.equal(state.analysisStatus, 'REVIEW_DONE');
  assert.equal(state.displayStatus, 'HIGH_CONFIDENCE_READY');
  assert.equal(state.fullyAnalyzed, true);
});

test('keeps final decision without deep at display ready', () => {
  const state = deriveRepositoryAnalysisState({
    source: 'local',
    action: 'BUILD',
    moneyPriority: 'P1',
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasIdeaFit: false,
    hasIdeaExtract: false,
    hasCompleteness: false,
    hasClaudeReview: false,
    hasRealUser: true,
    hasClearUseCase: true,
    isDirectlyMonetizable: false,
    oneLinerStrength: 'MEDIUM',
    reasonZh: '基础判断已经完成，但还没补齐更深一层分析。',
  });

  assert.equal(state.analysisStatus, 'DISPLAY_READY');
  assert.equal(state.displayStatus, 'TRUSTED_READY');
  assert.equal(state.fullyAnalyzed, false);
  assert.equal(state.incompleteReason, 'NO_DEEP_ANALYSIS');
  assert.match(state.lightAnalysis.nextStep, /先做一个最小可验证版本|先快速验证|先保守观察/);
});

test('marks fallback repo as unsafe', () => {
  const state = deriveRepositoryAnalysisState({
    source: 'fallback',
    action: 'CLONE',
    moneyPriority: 'P2',
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    fallbackUsed: true,
    hasIdeaFit: false,
    hasIdeaExtract: false,
    hasCompleteness: false,
    oneLinerStrength: 'MEDIUM',
  });

  assert.equal(state.displayStatus, 'UNSAFE');
  assert.equal(state.fallbackVisible, true);
  assert.equal(state.incompleteReason, 'FALLBACK_ONLY');
});

test('maps strength skip to skipped by gate family and conservative display', () => {
  const state = deriveRepositoryAnalysisState({
    source: 'local',
    action: 'IGNORE',
    moneyPriority: 'P3',
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasIdeaFit: false,
    hasIdeaExtract: false,
    hasCompleteness: false,
    deepAnalysisStatus: 'SKIPPED_BY_STRENGTH',
    deepAnalysisStatusReason: 'strength_weak',
    oneLinerStrength: 'WEAK',
  });

  assert.equal(state.analysisStatus, 'SKIPPED_BY_GATE');
  assert.equal(state.displayStatus, 'UNSAFE');
  assert.equal(state.incompleteReason, 'SKIPPED_BY_STRENGTH');
});

test('marks queued deep as pending', () => {
  const state = deriveRepositoryAnalysisState({
    source: 'local',
    action: 'CLONE',
    moneyPriority: 'P2',
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasIdeaFit: false,
    hasIdeaExtract: false,
    hasCompleteness: false,
    deepAnalysisStatus: 'PENDING',
    oneLinerStrength: 'MEDIUM',
  });

  assert.equal(state.analysisStatus, 'DEEP_PENDING');
  assert.equal(state.incompleteReason, 'QUEUED_NOT_FINISHED');
});
