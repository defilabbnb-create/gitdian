const test = require('node:test');
const assert = require('node:assert/strict');

const {
  accumulateFrozenPendingQueueBreakdown,
  buildEmptyFrozenPendingQueueBreakdown,
  buildAnalysisPoolFreezeState,
  buildFrozenAnalysisPoolBatchId,
  buildFrozenAnalysisPoolBatchSnapshot,
  buildFrozenAnalysisPoolCompletionPassResult,
  buildFrozenAnalysisPoolDeletedItem,
  buildFrozenAnalysisPoolDrainResult,
  buildFrozenAnalysisPoolMember,
  buildFrozenAnalysisPoolReport,
  buildFrozenAnalysisPoolRetainedDeleteCandidate,
  classifyFrozenPendingAgeBucket,
  classifyFrozenAnalysisPoolDrainPriority,
  evaluateFrozenPendingSuppression,
  evaluateAnalysisPoolIntakeGate,
  renderFrozenAnalysisPoolDrainFinishMarkdown,
  renderFrozenAnalysisPoolDrainMarkdown,
  renderFrozenAnalysisPoolCompletionMarkdown,
  renderFrozenAnalysisPoolMarkdown,
  scoreFrozenAnalysisPoolMember,
  shouldIncludeFrozenPoolMember,
} = require('../dist/modules/analysis/helpers/frozen-analysis-pool.helper');

function createItem(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/repo-1',
    historicalRepairBucket: 'high_value_weak',
    historicalRepairPriorityScore: 140,
    historicalRepairAction: 'deep_repair',
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
    needsDeepRepair: true,
    needsEvidenceRepair: false,
    needsDecisionRecalc: false,
    trustedBlockingGaps: ['technical_maturity_missing'],
    keyEvidenceGaps: ['technical_maturity_missing'],
    collectionTier: 'WATCH',
    isUserReachable: true,
    isStrictlyVisibleToUsers: true,
    ...overrides,
  };
}

test('new projects are blocked from active pool while frozen members remain allowed', () => {
  const snapshot = buildFrozenAnalysisPoolBatchSnapshot({
    generatedAt: '2026-03-29T08:00:00.000Z',
    batchId: 'batch-1',
    scope: 'all_new_entries',
    reason: 'stop_365',
    members: [
      buildFrozenAnalysisPoolMember({
        item: createItem(),
        batchId: 'batch-1',
        snapshotAt: '2026-03-29T08:00:00.000Z',
        modelNames: {
          modelA: 'light-a',
          modelB: 'deep-b',
        },
      }),
    ],
  });
  const freezeState = buildAnalysisPoolFreezeState({
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
  });

  const allowed = evaluateAnalysisPoolIntakeGate({
    freezeState,
    snapshot,
    source: 'analysis_single',
    repositoryIds: ['repo-1'],
  });
  const blocked = evaluateAnalysisPoolIntakeGate({
    freezeState,
    snapshot,
    source: 'analysis_single',
    repositoryIds: ['repo-2'],
  });

  assert.equal(allowed.decision, 'allow_existing_member');
  assert.equal(blocked.decision, 'suppress_new_entry');
});

test('member assignment stays stable and routes deep work to modelB', () => {
  const batchId = buildFrozenAnalysisPoolBatchId(new Date('2026-03-29T08:00:00.000Z'));
  const member = buildFrozenAnalysisPoolMember({
    item: createItem(),
    batchId,
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });

  assert.equal(member.frozenAnalysisPoolMember, true);
  assert.equal(member.assignedModelLane, 'modelB');
  assert.equal(member.assignedModelName, 'deep-b');
  assert.equal(shouldIncludeFrozenPoolMember(member), true);
  assert.equal(member.analysisCompletionState, 'still_incomplete');
  assert.equal(member.analysisCompletionPrimaryReason, 'repair_action_remaining');
  assert.ok(member.analysisCompletionReason.includes('repair_action_remaining'));
});

test('completed_not_useful_archived can be derived for clear low-value delete candidates', () => {
  const member = buildFrozenAnalysisPoolMember({
    item: createItem({
      repoId: 'repo-2',
      fullName: 'acme/repo-2',
      historicalRepairBucket: 'archive_or_noise',
      historicalRepairAction: 'downgrade_only',
      cleanupState: 'freeze',
      strictVisibilityLevel: 'BACKGROUND',
      repositoryValueTier: 'LOW',
      moneyPriority: 'P3',
      analysisQualityScore: 18,
      analysisQualityState: 'CRITICAL',
      needsDeepRepair: false,
      needsEvidenceRepair: false,
      needsDecisionRecalc: false,
      trustedBlockingGaps: ['problem_missing', 'market_missing'],
      keyEvidenceGaps: ['problem_missing', 'market_missing'],
      collectionTier: 'LONG_TAIL',
      isUserReachable: false,
      isStrictlyVisibleToUsers: false,
    }),
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });

  assert.equal(member.deleteCandidate, true);
  assert.equal(member.deleteApprovedByPolicy, true);
  assert.equal(member.analysisCompletionState, 'completed_not_useful_archived');
  assert.ok(member.deleteReason.includes('analysis_complete_no_keep_value'));
  assert.ok(member.analysisCompletionReason.includes('archive_delete_candidate_ready'));
});

test('completed_not_useful_archived can be promoted from low-value terminal state without legacy final-decision gate', () => {
  const member = buildFrozenAnalysisPoolMember({
    item: createItem({
      repoId: 'repo-archive-loose',
      fullName: 'acme/repo-archive-loose',
      historicalRepairBucket: 'archive_or_noise',
      historicalRepairAction: 'downgrade_only',
      cleanupState: 'freeze',
      strictVisibilityLevel: 'DETAIL_ONLY',
      repositoryValueTier: 'LOW',
      moneyPriority: 'P3',
      analysisQualityScore: 0,
      analysisQualityState: 'CRITICAL',
      hasSnapshot: false,
      hasInsight: false,
      hasFinalDecision: false,
      hasDeep: false,
      needsDeepRepair: false,
      needsEvidenceRepair: false,
      needsDecisionRecalc: false,
      trustedBlockingGaps: ['problem_missing', 'market_missing'],
      keyEvidenceGaps: ['problem_missing', 'market_missing'],
      collectionTier: 'LONG_TAIL',
      isUserReachable: false,
      isStrictlyVisibleToUsers: false,
    }),
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });

  assert.equal(member.analysisCompletionState, 'completed_not_useful_archived');
  assert.equal(member.analysisCompletionPrimaryReason, 'archive_policy_no_keep_value');
  assert.ok(member.analysisCompletionReason.includes('archive_terminal_ready'));
});

test('completed_useful does not require trusted gaps to be fully zero if repair is closed and repo is retainable', () => {
  const member = buildFrozenAnalysisPoolMember({
    item: createItem({
      repoId: 'repo-useful-weak',
      fullName: 'acme/repo-useful-weak',
      historicalRepairAction: 'downgrade_only',
      analysisQualityScore: 64,
      analysisQualityState: 'MEDIUM',
      hasDeep: true,
      needsDeepRepair: false,
      needsEvidenceRepair: false,
      needsDecisionRecalc: false,
      trustedBlockingGaps: ['execution_weak'],
      keyEvidenceGaps: ['execution_weak'],
    }),
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });

  assert.equal(member.analysisCompletionState, 'completed_useful');
  assert.equal(member.analysisCompletionPrimaryReason, 'useful_analysis_closed');
});

test('deleted repositories can be removed from snapshot and no longer re-enter gate', () => {
  const keepMember = buildFrozenAnalysisPoolMember({
    item: createItem(),
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });
  const deletedSnapshot = buildFrozenAnalysisPoolBatchSnapshot({
    generatedAt: '2026-03-29T08:00:00.000Z',
    batchId: 'batch-1',
    scope: 'all_new_entries',
    reason: 'stop_365',
    members: [keepMember],
  });
  const freezeState = buildAnalysisPoolFreezeState({
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
  });
  const gate = evaluateAnalysisPoolIntakeGate({
    freezeState,
    snapshot: deletedSnapshot,
    source: 'analysis_single',
    repositoryIds: ['repo-deleted'],
  });

  assert.equal(gate.decision, 'suppress_new_entry');
});

test('markdown and json-oriented report builders are populated', () => {
  const member = buildFrozenAnalysisPoolMember({
    item: createItem(),
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });
  const freezeState = buildAnalysisPoolFreezeState({
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
  });
  const snapshot = buildFrozenAnalysisPoolBatchSnapshot({
    generatedAt: '2026-03-29T08:00:00.000Z',
    batchId: 'batch-1',
    scope: 'all_new_entries',
    reason: 'stop_365',
    members: [member],
  });
  const report = buildFrozenAnalysisPoolReport({
    generatedAt: '2026-03-29T09:00:00.000Z',
    freezeState,
    modelAssignment: {
      modelA: { model: 'light-a', responsibilities: ['evidence_repair'] },
      modelB: { model: 'deep-b', responsibilities: ['deep_repair'] },
    },
    snapshot,
    members: [member],
  });
  const drain = buildFrozenAnalysisPoolDrainResult({
    generatedAt: '2026-03-29T09:00:00.000Z',
    freezeState,
    batchId: 'batch-1',
    modelAssignment: report.modelAssignment,
    intakeQueueSuppressedCount: 2,
    removedFromActivePoolCount: 1,
    deletedFromRepositoryStoreCount: 1,
    deleteSuppressedQueueCount: 3,
    totalExecuted: 4,
    modelAExecutedCount: 1,
    modelBExecutedCount: 2,
    snapshot,
    members: [member],
    queueSummary: {
      totalQueued: 3,
      actionCounts: {
        downgrade_only: 0,
        refresh_only: 1,
        evidence_repair: 0,
        deep_repair: 2,
        decision_recalc: 0,
      },
    },
    deletedItems: [
      {
        repositoryId: 'repo-x',
        fullName: 'acme/repo-x',
        deleteReason: ['analysis_complete_no_keep_value'],
      },
    ],
  });

  assert.equal(report.snapshot.summary.totalPoolSize, 1);
  assert.equal(drain.executionSummary.deleted, 1);
  assert.match(renderFrozenAnalysisPoolMarkdown(report), /Frozen Analysis Pool/);
  assert.match(
    renderFrozenAnalysisPoolDrainMarkdown(drain),
    /Frozen Analysis Pool Drain/,
  );
});

test('completed_useful and deleted repos are excluded from remaining in completion pass result', () => {
  const usefulMember = buildFrozenAnalysisPoolMember({
    item: createItem({
      repoId: 'repo-useful',
      fullName: 'acme/repo-useful',
      historicalRepairAction: 'downgrade_only',
      analysisQualityScore: 82,
      analysisQualityState: 'HIGH',
      hasDeep: true,
      needsDeepRepair: false,
      needsEvidenceRepair: false,
      needsDecisionRecalc: false,
      trustedBlockingGaps: [],
      keyEvidenceGaps: [],
    }),
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });
  const incompleteMember = buildFrozenAnalysisPoolMember({
    item: createItem({
      repoId: 'repo-incomplete',
      fullName: 'acme/repo-incomplete',
    }),
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });
  const beforeSnapshot = buildFrozenAnalysisPoolBatchSnapshot({
    generatedAt: '2026-03-29T08:00:00.000Z',
    batchId: 'batch-1',
    scope: 'all_new_entries',
    reason: 'stop_365',
    members: [usefulMember, incompleteMember],
  });
  const afterSnapshot = buildFrozenAnalysisPoolBatchSnapshot({
    generatedAt: '2026-03-29T09:00:00.000Z',
    batchId: 'batch-1',
    scope: 'all_new_entries',
    reason: 'stop_365',
    members: [usefulMember],
  });
  const deletedItem = buildFrozenAnalysisPoolDeletedItem({
    member: buildFrozenAnalysisPoolMember({
      item: createItem({
        repoId: 'repo-delete',
        fullName: 'acme/repo-delete',
        historicalRepairBucket: 'archive_or_noise',
        historicalRepairAction: 'downgrade_only',
        cleanupState: 'freeze',
        strictVisibilityLevel: 'BACKGROUND',
        repositoryValueTier: 'LOW',
        moneyPriority: 'P3',
        analysisQualityScore: 5,
        analysisQualityState: 'CRITICAL',
        needsDeepRepair: false,
        needsEvidenceRepair: false,
        needsDecisionRecalc: false,
        trustedBlockingGaps: ['problem_missing'],
        keyEvidenceGaps: ['problem_missing'],
        collectionTier: 'LONG_TAIL',
        isUserReachable: false,
        isStrictlyVisibleToUsers: false,
      }),
      batchId: 'batch-1',
      snapshotAt: '2026-03-29T08:00:00.000Z',
      modelNames: {
        modelA: 'light-a',
        modelB: 'deep-b',
      },
    }),
    batchId: 'batch-1',
    deletedAt: '2026-03-29T09:05:00.000Z',
  });
  const retainedCandidate = buildFrozenAnalysisPoolRetainedDeleteCandidate({
    member: buildFrozenAnalysisPoolMember({
      item: createItem({
        repoId: 'repo-retained',
        fullName: 'acme/repo-retained',
        historicalRepairBucket: 'archive_or_noise',
        historicalRepairAction: 'downgrade_only',
        cleanupState: 'freeze',
        strictVisibilityLevel: 'BACKGROUND',
        repositoryValueTier: 'LOW',
        moneyPriority: 'P3',
        analysisQualityScore: 5,
        analysisQualityState: 'CRITICAL',
        needsDeepRepair: false,
        needsEvidenceRepair: false,
        needsDecisionRecalc: false,
        trustedBlockingGaps: ['problem_missing'],
        keyEvidenceGaps: ['problem_missing'],
        collectionTier: 'LONG_TAIL',
        isUserReachable: false,
        isStrictlyVisibleToUsers: false,
      }),
      queueState: {
        pendingJobs: 0,
        runningJobs: 1,
        pendingJobIds: [],
        runningJobIds: ['job-1'],
      },
      batchId: 'batch-1',
      snapshotAt: '2026-03-29T08:00:00.000Z',
      modelNames: {
        modelA: 'light-a',
        modelB: 'deep-b',
      },
    }),
  });
  const freezeState = buildAnalysisPoolFreezeState({
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T09:00:00.000Z',
  });
  const completion = buildFrozenAnalysisPoolCompletionPassResult({
    generatedAt: '2026-03-29T09:10:00.000Z',
    freezeState,
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T09:00:00.000Z',
    startingBatchPoolSize: beforeSnapshot.summary.totalPoolSize + 1,
    beforeMembers: [usefulMember, incompleteMember],
    currentSnapshot: afterSnapshot,
    currentMembers: [usefulMember],
    deletedItems: [deletedItem],
    retainedDeleteCandidates: [retainedCandidate],
    deleteSuppressedQueueCount: 1,
    latestDrain: {
      generatedAt: '2026-03-29T09:00:00.000Z',
      totalExecuted: 4,
      modelAExecutedCount: 2,
      modelBExecutedCount: 2,
      actionBreakdown: {
        evidence_repair: 2,
        deep_repair: 1,
        decision_recalc: 1,
      },
    },
  });

  assert.equal(completion.frozenPoolCompletedUsefulCount, 1);
  assert.equal(completion.frozenPoolCompletedDeletedCount, 1);
  assert.equal(completion.frozenPoolRemainingCount, 0);
  assert.equal(completion.deletedCount, 1);
  assert.equal(completion.retainedDeleteCandidates.length, 1);
  assert.ok(completion.remainingPrimaryReasonBreakdown);
  assert.ok(completion.completionPromotionSummary);
  assert.match(
    renderFrozenAnalysisPoolCompletionMarkdown(completion),
    /Frozen Analysis Pool Completion/,
  );
});

test('pending drain priority keeps visible/high-value unfinished work above tail noise', () => {
  const p0Member = buildFrozenAnalysisPoolMember({
    item: createItem({
      repoId: 'repo-p0',
      historicalRepairBucket: 'visible_broken',
      historicalRepairAction: 'decision_recalc',
      cleanupState: 'active',
      repositoryValueTier: 'HIGH',
      moneyPriority: 'P0',
      hasFinalDecision: true,
      hasDeep: false,
    }),
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });
  const p2Member = buildFrozenAnalysisPoolMember({
    item: createItem({
      repoId: 'repo-p2',
      historicalRepairBucket: 'archive_or_noise',
      historicalRepairAction: 'refresh_only',
      cleanupState: 'freeze',
      repositoryValueTier: 'LOW',
      moneyPriority: 'P3',
      strictVisibilityLevel: 'BACKGROUND',
    }),
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });

  assert.equal(classifyFrozenAnalysisPoolDrainPriority(p0Member), 'P0');
  assert.equal(classifyFrozenAnalysisPoolDrainPriority(p2Member), 'P2');
  assert.ok(scoreFrozenAnalysisPoolMember(p0Member) > scoreFrozenAnalysisPoolMember(p2Member));
});

test('suppressible and replay-risk pending jobs are identified deterministically', () => {
  const member = buildFrozenAnalysisPoolMember({
    item: createItem({
      repoId: 'repo-replay',
      historicalRepairAction: 'decision_recalc',
      cleanupState: 'active',
    }),
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
    modelNames: {
      modelA: 'light-a',
      modelB: 'deep-b',
    },
  });
  const replayPolicy = evaluateFrozenPendingSuppression({
    member: {
      cleanupState: member.cleanupState,
      historicalRepairBucket: member.historicalRepairBucket,
      historicalRepairAction: member.historicalRepairAction,
      repositoryValueTier: member.repositoryValueTier,
      moneyPriority: member.moneyPriority,
      analysisQualityState: member.analysisQualityState,
      analysisCompletionState: member.analysisCompletionState,
    },
    waitingDurationHours: 2,
    replayRisk: true,
    redundant: false,
  });
  const redundantPolicy = evaluateFrozenPendingSuppression({
    member: {
      cleanupState: member.cleanupState,
      historicalRepairBucket: member.historicalRepairBucket,
      historicalRepairAction: member.historicalRepairAction,
      repositoryValueTier: member.repositoryValueTier,
      moneyPriority: member.moneyPriority,
      analysisQualityState: member.analysisQualityState,
      analysisCompletionState: member.analysisCompletionState,
    },
    waitingDurationHours: 1,
    replayRisk: false,
    redundant: true,
  });

  assert.equal(replayPolicy.suppressible, true);
  assert.equal(replayPolicy.suppressionReason, 'decision_recalc_replay_risk');
  assert.equal(redundantPolicy.suppressible, true);
  assert.equal(redundantPolicy.suppressionReason, 'redundant_pending_job');
});

test('pending queue breakdown aggregation tracks age bucket and lane safely', () => {
  const breakdown = buildEmptyFrozenPendingQueueBreakdown();
  accumulateFrozenPendingQueueBreakdown({
    breakdown,
    sample: {
      jobId: 'job-1',
      queueName: 'analysis.single',
      repositoryId: 'repo-1',
      fullName: 'acme/repo-1',
      historicalRepairAction: 'deep_repair',
      routerCapabilityTier: 'HEAVY',
      cleanupState: 'active',
      historicalRepairBucket: 'high_value_weak',
      repositoryValueTier: 'HIGH',
      moneyPriority: 'P1',
      frozenAnalysisPoolBatchId: 'batch-1',
      modelLane: 'modelB',
      waitingDurationHours: 8,
      waitingDurationBucket: classifyFrozenPendingAgeBucket(8),
      drainPriorityClass: 'P0',
      replayRisk: false,
      suppressible: false,
      redundant: false,
      suppressionReason: null,
    },
  });

  assert.equal(breakdown.totalPendingJobs, 1);
  assert.equal(breakdown.byHistoricalRepairAction.deep_repair, 1);
  assert.equal(breakdown.byRouterCapabilityTier.HEAVY, 1);
  assert.equal(breakdown.byAgeBucket.h6_24, 1);
  assert.equal(breakdown.byModelLane.modelB, 1);
});

test('drain finish markdown renders completion, suppression, and action diagnostics', () => {
  const freezeState = buildAnalysisPoolFreezeState({
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T09:00:00.000Z',
  });
  const markdown = renderFrozenAnalysisPoolDrainFinishMarkdown({
    generatedAt: '2026-03-29T09:20:00.000Z',
    freezeState,
    frozenAnalysisPoolBatchId: 'batch-1',
    pendingQueueBreakdown: buildEmptyFrozenPendingQueueBreakdown(),
    pendingInventory: {
      totalCurrentRemainingCount: 30,
      byAction: {
        decision_recalc: 20,
        deep_repair: 6,
        evidence_repair: 4,
      },
      worthRunningByAction: {
        decision_recalc: 8,
        deep_repair: 5,
      },
      compressibleByAction: {
        decision_recalc: 12,
        evidence_repair: 1,
      },
      byQueueStatus: {
        pending: 20,
        in_flight: 2,
        no_queue: 8,
      },
      byValueClass: {
        high_value: 7,
        medium_value: 18,
        low_value: 5,
      },
      byVisibilityClass: {
        high_visibility: 9,
        low_visibility: 21,
      },
      byCleanupState: {
        active: 28,
        freeze: 2,
        archive: 0,
        purge_ready: 0,
      },
      byConflictType: {
        user_conflict: 11,
        monetization_conflict: 19,
        execution_conflict: 6,
        market_conflict: 3,
        problem_conflict: 5,
      },
      byWaitingDuration: {
        lt_1h: 0,
        h1_6: 4,
        h6_24: 16,
        d1_3: 2,
        gt_3d: 0,
        no_queue: 8,
        in_flight: 0,
      },
      worthRunningCount: 13,
      lowRoiArchivableCount: 6,
      replayOrRedundantCount: 4,
      priorityDrainCount: 9,
      worthRunningSamples: [],
      archiveCandidateSamples: [],
      replayOrRedundantSamples: [],
      priorityDrainSamples: [],
      longestWaitingSamples: [],
    },
    pendingQueueHighPriorityCount: 10,
    pendingQueueLowROIStaleCount: 4,
    pendingQueueSuppressibleCount: 6,
    pendingQueueReplayRiskCount: 3,
    pendingQueueRedundantCount: 2,
    pendingDrainedCount: 12,
    pendingExecutedCount: 8,
    pendingSuppressedCount: 6,
    pendingCancelledRedundantCount: 2,
    pendingPromotedToCompletedCount: 5,
    pendingPromotedToArchivedCount: 3,
    pendingPromotedToDeletedCount: 1,
    pendingStillRemainingCount: 20,
    decisionRecalcRemainingBefore: 22,
    decisionRecalcRemainingAfter: 10,
    decisionRecalcCompressedCount: 12,
    decisionRecalcKeptRunningCount: 10,
    decisionRecalcPromotedArchivedCount: 9,
    decisionRecalcPromotedDeletedCount: 1,
    decisionRecalcSuppressedFromRemainingCount: 2,
    decisionRecalcRemovedFromPendingCount: 5,
    decisionRecalcRemovedFromRepairRemainingCount: 12,
    decisionRecalcStillWorthRunningCount: 10,
    repairFinishBreakdown: {
      decision_recalc: 4,
      deep_repair: 3,
      evidence_repair: 2,
    },
    decisionRecalcFinishSummary: {
      selectedCount: 4,
      queuedCount: 2,
      noChangeCount: 1,
      suppressedCount: 1,
      replayGateEnforced: true,
      hardenedAfterStateEnabled: false,
    },
    deepRepairFinishSummary: {
      selectedCount: 3,
      queuedCount: 3,
      noChangeCount: 0,
      suppressedCount: 0,
      replayGateEnforced: false,
      hardenedAfterStateEnabled: true,
    },
    evidenceRepairFinishSummary: {
      selectedCount: 2,
      queuedCount: 2,
      noChangeCount: 0,
      suppressedCount: 0,
      replayGateEnforced: false,
      hardenedAfterStateEnabled: false,
    },
    repairActionRemainingReducedCount: 7,
    completedUsefulAddedCount: 2,
    completedArchivedAddedCount: 3,
    completedDeletedAddedCount: 1,
    retainedDeleteCandidateCount: 1,
    retainedDeleteReasonBreakdown: { pending_jobs_present: 1 },
    frozenPoolRemainingCount: 100,
    frozenPoolCompletedUsefulCount: 10,
    frozenPoolCompletedArchivedCount: 20,
    frozenPoolCompletedDeletedCount: 5,
    frozenPoolRemainingBefore: 112,
    frozenPoolRemainingAfter: 100,
    topRemainingPrimaryReasons: [{ reason: 'pending_queue_jobs', count: 50 }],
    topRemainingActions: [{ action: 'decision_recalc', count: 30 }],
    hardestAction: { action: 'decision_recalc', count: 30 },
    mostNoChangeAction: { action: 'evidence_repair', count: 12 },
    mostWorthContinuingAction: { action: 'deep_repair', count: 9 },
    mostCompressibleAction: { action: 'decision_recalc', count: 12 },
    mostWorthContinuingConflictTypes: [
      { conflictType: 'monetization_conflict', count: 9 },
    ],
    mostCompressibleConflictTypes: [
      { conflictType: 'user_conflict', count: 5 },
    ],
    pendingAuditSamples: [],
    completedUsefulSamples: [],
    completedArchivedSamples: [],
    completedDeletedSamples: [],
    remainingSamples: [],
    runSummary: {
      selectedCount: 0,
      execution: null,
      queueSummary: null,
      analysisOutcomeSummary: null,
    },
  });

  assert.match(markdown, /Frozen Analysis Pool Pending Drain & Repair Finish/);
  assert.match(markdown, /pendingQueueSuppressibleCount: 6/);
  assert.match(markdown, /Decision Recalc Compression/);
  assert.match(markdown, /worthRunningCount: 13/);
  assert.match(markdown, /repairActionRemainingReducedCount: 7/);
  assert.match(markdown, /hardestAction: decision_recalc \(30\)/);
});
