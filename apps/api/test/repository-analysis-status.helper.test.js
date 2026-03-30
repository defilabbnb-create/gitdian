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
    evidenceCoverageRate: 0.86,
    keyEvidenceMissingCount: 0,
    keyEvidenceWeakCount: 0,
    keyEvidenceConflictCount: 0,
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
    evidenceCoverageRate: 0.42,
    keyEvidenceMissingCount: 2,
    keyEvidenceWeakCount: 1,
    evidenceMissingDimensions: ['execution', 'market'],
    deepRepairDimensions: ['execution', 'market'],
  });

  assert.equal(state.analysisStatus, 'DISPLAY_READY');
  assert.equal(state.displayStatus, 'BASIC_READY');
  assert.equal(state.fullyAnalyzed, false);
  assert.equal(state.incompleteReason, 'NO_DEEP_ANALYSIS');
  assert.match(state.lightAnalysis.nextStep, /先补 execution \/ market|先补 execution|先补/);
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
    evidenceCoverageRate: 0.25,
    keyEvidenceMissingCount: 1,
    evidenceMissingDimensions: ['problem'],
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
    evidenceCoverageRate: 0.28,
    keyEvidenceMissingCount: 2,
    evidenceMissingDimensions: ['user', 'monetization'],
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
    evidenceCoverageRate: 0.36,
    keyEvidenceMissingCount: 2,
    evidenceMissingDimensions: ['execution', 'technical_maturity'],
    deepRepairDimensions: ['execution', 'technical_maturity'],
  });

  assert.equal(state.analysisStatus, 'DEEP_PENDING');
  assert.equal(state.incompleteReason, 'QUEUED_NOT_FINISHED');
});

test('does not trust strong summary when key evidence is missing', () => {
  const state = deriveRepositoryAnalysisState({
    source: 'claude',
    action: 'BUILD',
    moneyPriority: 'P0',
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
    evidenceCoverageRate: 0.41,
    keyEvidenceMissingCount: 1,
    evidenceMissingDimensions: ['problem'],
  });

  assert.equal(state.displayStatus, 'BASIC_READY');
  assert.equal(state.frontendDecisionState, 'provisional');
});

test('evidence conflict degrades current action even when summary looks complete', () => {
  const state = deriveRepositoryAnalysisState({
    source: 'claude',
    action: 'BUILD',
    moneyPriority: 'P0',
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
    evidenceCoverageRate: 0.78,
    keyEvidenceConflictCount: 2,
    evidenceConflictDimensions: ['user', 'monetization'],
    decisionConflictDimensions: ['user', 'monetization'],
  });

  assert.equal(state.displayStatus, 'UNSAFE');
  assert.equal(state.frontendDecisionState, 'degraded');
  assert.match(state.lightAnalysis.caution, /user冲突 \/ monetization冲突/);
});

test('weak taxonomy gaps block trusted output even when deep is complete', () => {
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
    evidenceCoverageRate: 0.74,
    evidenceWeakCount: 2,
    keyEvidenceWeakCount: 2,
    evidenceWeakDimensions: ['distribution', 'market'],
    weakDrivenGaps: ['distribution_weak', 'market_weak'],
    trustedBlockingGaps: ['distribution_weak', 'market_weak'],
    keyEvidenceGapSeverity: 'MEDIUM',
  });

  assert.equal(state.displayStatus, 'BASIC_READY');
  assert.equal(state.frontendDecisionState, 'provisional');
});
