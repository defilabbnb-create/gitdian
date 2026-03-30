const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAnalysisBacklogPanel,
  buildIncompletePanel,
  buildReadyToRankPanel,
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

function panelRepo(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/repo-1',
    htmlUrl: 'https://github.com/acme/repo-1',
    priority: 'P2',
    action: 'BUILD',
    historicalRepairAction: 'deep_repair',
    historicalRepairBucket: 'high_value_weak',
    historicalRepairPriorityScore: 50,
    cleanupState: 'active',
    frontendDecisionState: 'provisional',
    pendingAnalysisJobs: 0,
    runningAnalysisJobs: 0,
    pendingSnapshotJobs: 0,
    runningSnapshotJobs: 0,
    pendingDeepJobs: 0,
    runningDeepJobs: 0,
    latestSnapshotJobState: null,
    latestDeepJobState: null,
    inflightActions: [],
    inflightAction: null,
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    hasIdeaFit: true,
    hasIdeaExtract: true,
    hasCompleteness: true,
    fullyAnalyzed: true,
    incomplete: false,
    trustedListReady: true,
    primaryIncompleteReason: null,
    appearedOnHomepage: false,
    deepDone: true,
    needsDeepRepair: false,
    needsDecisionRecalc: false,
    ...overrides,
  };
}

test('treats deep trio plus final decision as fully analyzed', () => {
  const state = evaluateRepoAnalysisState(
    baseInput({
      evidenceCoverageRate: 0.82,
      keyEvidenceMissingCount: 0,
      keyEvidenceWeakCount: 0,
      keyEvidenceConflictCount: 0,
      decisionConflictCount: 0,
    }),
  );

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

test('key evidence missing blocks trusted list readiness even without summary red flags', () => {
  const state = evaluateRepoAnalysisState(
    baseInput({
      evidenceCoverageRate: 0.38,
      keyEvidenceMissingCount: 2,
      keyEvidenceWeakCount: 0,
      keyEvidenceConflictCount: 0,
      decisionConflictCount: 0,
      badOneliner: false,
      headlineUserConflict: false,
      headlineCategoryConflict: false,
      monetizationOverclaim: false,
    }),
  );

  assert.equal(state.trustedListReady, false);
  assert.equal(state.homepageUnsafe, true);
});

test('evidence conflict drives homepage unsafe even when narrative heuristics are clean', () => {
  const state = evaluateRepoAnalysisState(
    baseInput({
      evidenceCoverageRate: 0.74,
      keyEvidenceMissingCount: 0,
      keyEvidenceWeakCount: 0,
      keyEvidenceConflictCount: 2,
      decisionConflictCount: 2,
      badOneliner: false,
      headlineUserConflict: false,
      headlineCategoryConflict: false,
      monetizationOverclaim: false,
    }),
  );

  assert.equal(state.trustedListReady, false);
  assert.equal(state.homepageUnsafe, true);
});

test('buildAnalysisBacklogPanel keeps current inflight truth separate from incomplete repos', () => {
  const panel = buildAnalysisBacklogPanel({
    snapshotQueue: {
      queue: 'analysis.snapshot',
      waiting: 3,
      active: 1,
      delayed: 0,
      prioritized: 0,
      failed: 0,
      completed: 0,
    },
    deepQueue: {
      queue: 'analysis.single',
      waiting: 1,
      active: 1,
      delayed: 0,
      prioritized: 0,
      failed: 0,
      completed: 0,
    },
    actionBreakdown: [
      { action: 'refresh_only', pendingJobs: 1, runningJobs: 0, repoCount: 1 },
      { action: 'decision_recalc', pendingJobs: 0, runningJobs: 1, repoCount: 1 },
    ],
    repos: [
      panelRepo({
        repoId: 'queued-snapshot',
        fullName: 'acme/queued-snapshot',
        incomplete: true,
        primaryIncompleteReason: 'QUEUED_NOT_FINISHED',
        pendingAnalysisJobs: 1,
        pendingSnapshotJobs: 1,
        inflightActions: ['refresh_only'],
        inflightAction: 'refresh_only',
      }),
      panelRepo({
        repoId: 'running-deep',
        fullName: 'acme/running-deep',
        incomplete: true,
        primaryIncompleteReason: 'QUEUED_NOT_FINISHED',
        runningAnalysisJobs: 1,
        runningDeepJobs: 1,
        inflightActions: ['decision_recalc'],
        inflightAction: 'decision_recalc',
      }),
      panelRepo({
        repoId: 'incomplete-not-started',
        fullName: 'acme/incomplete-not-started',
        incomplete: true,
        primaryIncompleteReason: 'NO_DEEP_ANALYSIS',
        hasIdeaFit: false,
        hasIdeaExtract: false,
        hasCompleteness: false,
        fullyAnalyzed: false,
        trustedListReady: false,
        deepDone: false,
        needsDeepRepair: true,
      }),
    ],
    limit: 10,
  });

  assert.equal(panel.analysisJobs.pendingJobs, 1);
  assert.equal(panel.analysisJobs.runningJobs, 1);
  assert.equal(panel.analysisJobs.queuedOrRunningRepos, 2);
  assert.equal(panel.analysisJobs.snapshotJobs.pendingJobs, 1);
  assert.equal(panel.analysisJobs.deepJobs.runningJobs, 1);
  assert.equal(panel.runtimeQueues.snapshotQueue.waiting, 3);
  assert.equal(panel.historicalRepairActionBreakdown[0].action, 'refresh_only');
});

test('buildIncompletePanel distinguishes no-deep, queued, and failed states', () => {
  const panel = buildIncompletePanel({
    repos: [
      panelRepo({
        repoId: 'no-deep',
        fullName: 'acme/no-deep',
        incomplete: true,
        fullyAnalyzed: false,
        trustedListReady: false,
        deepDone: false,
        hasIdeaFit: false,
        hasIdeaExtract: false,
        hasCompleteness: false,
        primaryIncompleteReason: 'NO_DEEP_ANALYSIS',
        needsDeepRepair: true,
      }),
      panelRepo({
        repoId: 'queued',
        fullName: 'acme/queued',
        incomplete: true,
        fullyAnalyzed: false,
        trustedListReady: false,
        deepDone: false,
        hasIdeaFit: false,
        hasIdeaExtract: false,
        hasCompleteness: false,
        primaryIncompleteReason: 'QUEUED_NOT_FINISHED',
        pendingAnalysisJobs: 1,
        pendingDeepJobs: 1,
        inflightAction: 'deep_repair',
        inflightActions: ['deep_repair'],
        needsDeepRepair: true,
      }),
      panelRepo({
        repoId: 'failed',
        fullName: 'acme/failed',
        incomplete: true,
        fullyAnalyzed: false,
        trustedListReady: false,
        deepDone: false,
        hasIdeaFit: false,
        hasIdeaExtract: false,
        hasCompleteness: false,
        primaryIncompleteReason: 'FAILED_DURING_ANALYSIS',
        needsDeepRepair: true,
      }),
      panelRepo(),
    ],
    limit: 10,
  });

  assert.equal(panel.totalIncompleteRepos, 3);
  assert.equal(panel.queuedOrRunningIncompleteRepos, 1);
  assert.equal(panel.operationalBreakdown.noDeepAnalysis, 1);
  assert.equal(panel.operationalBreakdown.queuedNotFinished, 1);
  assert.equal(panel.operationalBreakdown.failedDuringAnalysis, 1);
});

test('buildReadyToRankPanel excludes incomplete repos from strict ready coverage', () => {
  const panel = buildReadyToRankPanel({
    repos: [
      panelRepo({
        repoId: 'strict-ready',
        fullName: 'acme/strict-ready',
        priority: 'P0',
        historicalRepairPriorityScore: 95,
        appearedOnHomepage: true,
      }),
      panelRepo({
        repoId: 'featured-incomplete',
        fullName: 'acme/featured-incomplete',
        priority: 'P0',
        historicalRepairPriorityScore: 92,
        incomplete: true,
        fullyAnalyzed: false,
        trustedListReady: false,
        hasCompleteness: false,
        hasIdeaFit: false,
        hasIdeaExtract: false,
        deepDone: false,
        primaryIncompleteReason: 'NO_DEEP_ANALYSIS',
      }),
    ],
    featuredRepoIds: ['strict-ready', 'featured-incomplete'],
    limit: 10,
  });

  assert.equal(panel.strictReadyRepos, 1);
  assert.equal(panel.highPriorityReadySummary.total, 2);
  assert.equal(panel.highPriorityReadySummary.ready, 1);
  assert.equal(panel.homepageTopReadySummary.total, 2);
  assert.equal(panel.homepageTopReadySummary.ready, 1);
  assert.deepEqual(
    panel.topReadyToRank.map((item) => item.repoId),
    ['strict-ready'],
  );
});

test('buildIncompletePanel prioritizes active high-value repos ahead of terminal ones', () => {
  const panel = buildIncompletePanel({
    repos: [
      panelRepo({
        repoId: 'active-high',
        fullName: 'acme/active-high',
        incomplete: true,
        fullyAnalyzed: false,
        trustedListReady: false,
        deepDone: false,
        historicalRepairPriorityScore: 90,
        priority: 'P0',
        primaryIncompleteReason: 'NO_DEEP_ANALYSIS',
        hasCompleteness: false,
        hasIdeaFit: false,
        hasIdeaExtract: false,
      }),
      panelRepo({
        repoId: 'terminal-higher-score',
        fullName: 'acme/terminal-higher-score',
        incomplete: true,
        fullyAnalyzed: false,
        trustedListReady: false,
        deepDone: false,
        historicalRepairPriorityScore: 99,
        priority: 'P0',
        cleanupState: 'archive',
        primaryIncompleteReason: 'NO_DEEP_ANALYSIS',
        hasCompleteness: false,
        hasIdeaFit: false,
        hasIdeaExtract: false,
      }),
      panelRepo({
        repoId: 'active-lower',
        fullName: 'acme/active-lower',
        incomplete: true,
        fullyAnalyzed: false,
        trustedListReady: false,
        deepDone: false,
        historicalRepairPriorityScore: 40,
        priority: 'P2',
        primaryIncompleteReason: 'NO_DEEP_ANALYSIS',
        hasCompleteness: false,
        hasIdeaFit: false,
        hasIdeaExtract: false,
      }),
    ],
    limit: 10,
  });

  assert.deepEqual(
    panel.highPriorityIncomplete.map((item) => item.repoId),
    ['active-high', 'active-lower', 'terminal-higher-score'],
  );
});
