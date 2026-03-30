const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFrozenAnalysisPoolMember,
} = require('../dist/modules/analysis/helpers/frozen-analysis-pool.helper');
const {
  buildDecisionRecalcCompletionOverride,
  buildDecisionRecalcCompressionItem,
  renderDecisionRecalcFinishCompressionMarkdown,
} = require('../dist/modules/analysis/helpers/decision-recalc-finish-compression.helper');

function createItem(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/repo-1',
    historicalRepairBucket: 'high_value_weak',
    historicalRepairPriorityScore: 140,
    historicalRepairAction: 'decision_recalc',
    historicalRepairReason: 'decision conflict needs recalc',
    cleanupState: 'active',
    cleanupReason: [],
    frontendDecisionState: 'provisional',
    strictVisibilityLevel: 'FAVORITES',
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    analysisQualityScore: 42,
    analysisQualityState: 'LOW',
    hasDeep: false,
    hasSnapshot: true,
    hasInsight: true,
    hasFinalDecision: true,
    needsDeepRepair: false,
    needsEvidenceRepair: false,
    needsDecisionRecalc: true,
    trustedBlockingGaps: ['user_conflict'],
    keyEvidenceGaps: ['user_conflict'],
    decisionRecalcGaps: ['user_conflict'],
    conflictDrivenGaps: ['user_conflict'],
    evidenceConflictCount: 1,
    evidenceCoverageRate: 0.24,
    freshnessDays: 8,
    evidenceFreshnessDays: 8,
    fallbackFlag: false,
    conflictFlag: true,
    incompleteFlag: false,
    collectionTier: 'WATCH',
    isUserReachable: true,
    isStrictlyVisibleToUsers: true,
    ...overrides,
  };
}

function createMember(itemOverrides = {}, memberOverrides = {}) {
  return {
    ...buildFrozenAnalysisPoolMember({
      item: createItem(itemOverrides),
      batchId: 'batch-1',
      snapshotAt: '2026-03-29T08:00:00.000Z',
      modelNames: {
        modelA: 'light-a',
        modelB: 'deep-b',
      },
    }),
    ...memberOverrides,
  };
}

test('suppress_replay decision_recalc low ROI items compress out of keep_running', () => {
  const member = createMember({
    repoId: 'repo-archive',
    fullName: 'acme/repo-archive',
    historicalRepairBucket: 'archive_or_noise',
    strictVisibilityLevel: 'BACKGROUND',
    repositoryValueTier: 'LOW',
    moneyPriority: 'P3',
    analysisQualityScore: 12,
    analysisQualityState: 'CRITICAL',
    trustedBlockingGaps: ['problem_conflict'],
    keyEvidenceGaps: ['problem_conflict'],
    decisionRecalcGaps: ['problem_conflict'],
    conflictDrivenGaps: ['problem_conflict'],
    isUserReachable: false,
    isStrictlyVisibleToUsers: false,
  });

  const item = buildDecisionRecalcCompressionItem({
    member,
    gateDecision: 'suppress_replay',
    gateReason: 'recalc_replay_suppressed',
    queueStatus: 'pending',
    waitingDurationHours: 36,
    waitingDurationBucket: 'd1_3',
    redundantPendingJobCount: 0,
    stalePendingJobCount: 1,
  });

  assert.notEqual(item.compressionClass, 'keep_running');
  assert.equal(item.suppressible, true);
  assert.ok(
    item.compressionReasons.includes('recalc_replay_suppressed') ||
      item.compressionReasons.includes('low_roi_terminal_archived'),
  );
});

test('low ROI decision_recalc can promote archived and delete candidates can promote deleted', () => {
  const archivedMember = createMember({
    repoId: 'repo-low-roi',
    fullName: 'acme/repo-low-roi',
    historicalRepairBucket: 'archive_or_noise',
    strictVisibilityLevel: 'BACKGROUND',
    repositoryValueTier: 'LOW',
    moneyPriority: 'P3',
    analysisQualityScore: 10,
    analysisQualityState: 'CRITICAL',
    trustedBlockingGaps: ['market_conflict'],
    keyEvidenceGaps: ['market_conflict'],
    decisionRecalcGaps: ['market_conflict'],
    conflictDrivenGaps: ['market_conflict'],
    isUserReachable: false,
    isStrictlyVisibleToUsers: false,
  });
  const archivedItem = buildDecisionRecalcCompressionItem({
    member: archivedMember,
    gateDecision: 'allow_recalc_but_expect_no_change',
    gateReason: 'recalc_new_signal_low_expected_value',
    queueStatus: 'no_queue',
    waitingDurationHours: null,
    waitingDurationBucket: 'no_queue',
  });
  const deletedMember = createMember(
    {
      repoId: 'repo-delete',
      fullName: 'acme/repo-delete',
      repositoryValueTier: 'LOW',
      strictVisibilityLevel: 'BACKGROUND',
      moneyPriority: 'P3',
      analysisQualityState: 'CRITICAL',
    },
    {
      deleteCandidate: true,
      deleteApprovedByPolicy: true,
      deleteReason: ['analysis_complete_no_keep_value', 'archive_bucket'],
      pendingJobs: 1,
    },
  );
  const deletedItem = buildDecisionRecalcCompressionItem({
    member: deletedMember,
    gateDecision: 'suppress_cleanup',
    gateReason: 'recalc_cleanup_suppressed:freeze',
    queueStatus: 'pending',
    waitingDurationHours: 28,
    waitingDurationBucket: 'd1_3',
    stalePendingJobCount: 1,
  });

  assert.equal(archivedItem.compressionClass, 'promote_archived');
  assert.equal(deletedItem.compressionClass, 'promote_deleted');

  const archivedOverride = buildDecisionRecalcCompletionOverride({
    member: archivedMember,
    compressionClass: archivedItem.compressionClass,
    batchId: 'batch-1',
    generatedAt: '2026-03-29T09:00:00.000Z',
  });
  const suppressOverride = buildDecisionRecalcCompletionOverride({
    member: deletedMember,
    compressionClass: 'suppress_from_remaining',
    batchId: 'batch-1',
    generatedAt: '2026-03-29T09:00:00.000Z',
  });

  assert.equal(
    archivedOverride.analysisCompletionState,
    'completed_not_useful_archived',
  );
  assert.equal(
    suppressOverride.analysisCompletionState,
    'suppressed_from_remaining',
  );
});

test('keep_running items stay unfinished and markdown/json reports can be generated', () => {
  const member = createMember({
    repoId: 'repo-keep',
    fullName: 'acme/repo-keep',
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P0',
    strictVisibilityLevel: 'HOME',
    analysisQualityScore: 78,
    analysisQualityState: 'MEDIUM',
    trustedBlockingGaps: ['user_conflict', 'execution_conflict'],
    keyEvidenceGaps: ['user_conflict', 'execution_conflict'],
    decisionRecalcGaps: ['user_conflict', 'execution_conflict'],
    conflictDrivenGaps: ['user_conflict', 'execution_conflict'],
  });
  const item = buildDecisionRecalcCompressionItem({
    member,
    gateDecision: 'allow_recalc',
    gateReason: 'recalc_new_signal_detected',
    queueStatus: 'no_queue',
    waitingDurationHours: null,
    waitingDurationBucket: 'no_queue',
  });

  assert.equal(item.compressionClass, 'keep_running');
  assert.equal(item.worthRunning, true);

  const report = {
    generatedAt: '2026-03-29T09:00:00.000Z',
    freezeState: {
      analysisPoolFrozen: true,
      analysisPoolFreezeReason: 'stop_365_expansion_and_drain_frozen_pool',
      analysisPoolFrozenAt: '2026-03-29T08:00:00.000Z',
      analysisPoolFrozenScope: 'all_new_entries',
      frozenAnalysisPoolBatchId: 'batch-1',
      frozenAnalysisPoolSnapshotAt: '2026-03-29T09:00:00.000Z',
    },
    frozenAnalysisPoolBatchId: 'batch-1',
    decisionRecalcRemainingBefore: 4,
    decisionRecalcRemainingAfter: 1,
    frozenPoolRemainingBefore: 9,
    frozenPoolRemainingAfter: 4,
    decisionRecalcRemainingShareAfter: 0.25,
    decisionRecalcRemainingCount: 4,
    decisionRecalcByGateDecision: {
      allow_recalc: 1,
      allow_recalc_but_expect_no_change: 1,
      suppress_replay: 1,
      suppress_cleanup: 1,
    },
    decisionRecalcByHistoricalRepairBucket: {
      high_value_weak: 2,
      archive_or_noise: 2,
    },
    decisionRecalcByValueTier: { HIGH: 1, MEDIUM: 1, LOW: 2 },
    decisionRecalcByMoneyPriority: { P0: 1, P1: 1, P3: 2, P2: 0, NONE: 0 },
    decisionRecalcByVisibilityLevel: { HOME: 1, FAVORITES: 1, BACKGROUND: 2 },
    decisionRecalcByCleanupState: { active: 3, freeze: 1, archive: 0, purge_ready: 0 },
    decisionRecalcByAnalysisQualityState: { MEDIUM: 1, LOW: 1, CRITICAL: 2 },
    decisionRecalcByTrustedBlockingGapPresence: { present: 3, absent: 1 },
    decisionRecalcByConflictType: {
      user_conflict: 2,
      monetization_conflict: 0,
      execution_conflict: 1,
      market_conflict: 1,
      problem_conflict: 1,
    },
    decisionRecalcByQueueStatus: { pending: 2, in_flight: 0, no_queue: 2 },
    decisionRecalcByWaitingDuration: {
      lt_1h: 0,
      h1_6: 0,
      h6_24: 1,
      d1_3: 1,
      gt_3d: 0,
      no_queue: 2,
    },
    decisionRecalcSuppressibleCount: 3,
    decisionRecalcArchivableCount: 2,
    decisionRecalcStillWorthRunningCount: 1,
    decisionRecalcCompressedCount: 3,
    decisionRecalcKeptRunningCount: 1,
    decisionRecalcPromotedArchivedCount: 1,
    decisionRecalcPromotedDeletedCount: 1,
    decisionRecalcSuppressedFromRemainingCount: 1,
    decisionRecalcRemovedFromPendingCount: 2,
    decisionRecalcRemovedFromRepairRemainingCount: 3,
    queueCancelledJobCount: 2,
    queueCancelledRepositoryCount: 2,
    archivedRepositoryIds: ['repo-low-roi'],
    deletedRepositoryIds: ['repo-delete'],
    suppressedRepositoryIds: ['repo-suppress'],
    keepRunningRepositoryIds: ['repo-keep'],
    topRemainingPrimaryReasonsAfter: [{ reason: 'repair_action_remaining', count: 2 }],
    topRemainingActionsAfter: [{ action: 'deep_repair', count: 2 }],
    hardestActionAfter: { action: 'deep_repair', count: 2 },
    mostWorthContinuingConflictTypes: [{ conflictType: 'user_conflict', count: 1 }],
    mostCompressibleConflictTypes: [{ conflictType: 'problem_conflict', count: 1 }],
    items: [item],
    persistedCompletionOverrideItems: [],
    keptRunningSamples: [item],
    promotedArchivedSamples: [],
    promotedDeletedSamples: [],
    suppressedFromRemainingSamples: [],
  };

  const markdown = renderDecisionRecalcFinishCompressionMarkdown(report);

  assert.match(markdown, /Decision Recalc Finish Compression/);
  assert.match(markdown, /command: pnpm --filter api run:decision-recalc-finish-compression/);
  assert.doesNotThrow(() => JSON.stringify(report));
});
