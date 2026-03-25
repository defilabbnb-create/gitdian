const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateRepoAnalysisState,
  getTaskAnalysisDefinitions,
} = require('../dist/scripts/helpers/task-analysis-completion-report.helper');

function baseInput(overrides = {}) {
  return {
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasIdeaFit: true,
    hasIdeaExtract: true,
    hasCompleteness: true,
    hasClaudeReview: true,
    fallbackDirty: false,
    severeConflict: false,
    badOneliner: false,
    headlineUserConflict: false,
    headlineCategoryConflict: false,
    monetizationOverclaim: false,
    lowValue: false,
    appearedOnHomepage: false,
    appearedInDailySummary: false,
    appearedInTelegram: false,
    pendingAnalysisJobs: 0,
    runningAnalysisJobs: 0,
    failedAnalysisJobs: 0,
    hasDeferredAnalysis: false,
    deepAnalysisStatus: 'COMPLETED',
    deepAnalysisStatusReason: null,
    claudeEligible: false,
    ...overrides,
  };
}

test('treats deep trio plus final decision as fully analyzed', () => {
  const state = evaluateRepoAnalysisState(baseInput());

  assert.equal(state.fullyAnalyzed, true);
  assert.equal(state.incomplete, false);
  assert.equal(state.primaryIncompleteReason, null);
  assert.equal(state.trustedListReady, true);
});

test('flags queued snapshot-only repo as incomplete', () => {
  const state = evaluateRepoAnalysisState(
    baseInput({
      hasInsight: false,
      hasFinalDecision: false,
      hasIdeaFit: false,
      hasIdeaExtract: false,
      hasCompleteness: false,
      deepAnalysisStatus: 'NOT_STARTED',
      pendingAnalysisJobs: 1,
    }),
  );

  assert.equal(state.incomplete, true);
  assert.equal(state.primaryIncompleteReason, 'QUEUED_NOT_FINISHED');
});

test('recognizes gate-skipped repos as incomplete with explicit reason', () => {
  const state = evaluateRepoAnalysisState(
    baseInput({
      hasIdeaFit: false,
      hasIdeaExtract: false,
      hasCompleteness: false,
      hasClaudeReview: false,
      deepAnalysisStatus: 'SKIPPED_BY_GATE',
      deepAnalysisStatusReason: 'snapshot_not_promising',
      claudeEligible: true,
    }),
  );

  assert.equal(state.incomplete, true);
  assert.equal(state.incompleteReasons.includes('SKIPPED_BY_GATE'), true);
  assert.equal(state.primaryIncompleteReason, 'SKIPPED_BY_GATE');
});

test('marks fallback dirty repos unsafe for homepage', () => {
  const state = evaluateRepoAnalysisState(
    baseInput({
      fallbackDirty: true,
      hasClaudeReview: false,
      hasIdeaFit: false,
      hasIdeaExtract: false,
      hasCompleteness: false,
      deepAnalysisStatus: 'NOT_STARTED',
    }),
  );

  assert.equal(state.homepageUnsafe, true);
  assert.equal(state.incompleteReasons.includes('FALLBACK_ONLY'), true);
});

test('documents the fully analyzed definition', () => {
  const definitions = getTaskAnalysisDefinitions();
  assert.equal(
    definitions.fullyAnalyzed.includes('snapshot + insight + finalDecision + deep'),
    true,
  );
});
