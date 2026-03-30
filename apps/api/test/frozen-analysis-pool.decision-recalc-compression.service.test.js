const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FrozenAnalysisPoolService,
} = require('../dist/modules/analysis/frozen-analysis-pool.service');
const {
  buildAnalysisPoolFreezeState,
  buildFrozenAnalysisPoolBatchSnapshot,
  buildFrozenAnalysisPoolDeletedItem,
  buildFrozenAnalysisPoolMember,
} = require('../dist/modules/analysis/helpers/frozen-analysis-pool.helper');
const {
  buildDecisionRecalcCompletionOverride,
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
      queueState: memberOverrides.queueState,
      completionOverride: memberOverrides.completionOverride,
    }),
    ...memberOverrides,
  };
}

test('decision recalc compression removes compressed repos from pending and repair remaining while keeping worthwhile work', async () => {
  const keepMember = createMember({
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
  const archivedMember = createMember(
    {
      repoId: 'repo-archived',
      fullName: 'acme/repo-archived',
      historicalRepairBucket: 'archive_or_noise',
      repositoryValueTier: 'LOW',
      moneyPriority: 'P3',
      strictVisibilityLevel: 'BACKGROUND',
      analysisQualityScore: 12,
      analysisQualityState: 'CRITICAL',
      trustedBlockingGaps: ['problem_conflict'],
      keyEvidenceGaps: ['problem_conflict'],
      decisionRecalcGaps: ['problem_conflict'],
      conflictDrivenGaps: ['problem_conflict'],
      isUserReachable: false,
      isStrictlyVisibleToUsers: false,
    },
    {
      queueState: {
        pendingJobs: 1,
        runningJobs: 0,
        pendingJobIds: ['job-archive'],
        runningJobIds: [],
      },
    },
  );
  const deletedMember = {
    ...createMember(
      {
        repoId: 'repo-deleted',
        fullName: 'acme/repo-deleted',
        repositoryValueTier: 'LOW',
        moneyPriority: 'P3',
        strictVisibilityLevel: 'BACKGROUND',
        analysisQualityScore: 5,
        analysisQualityState: 'CRITICAL',
        trustedBlockingGaps: ['problem_conflict'],
        keyEvidenceGaps: ['problem_conflict'],
        decisionRecalcGaps: ['problem_conflict'],
        conflictDrivenGaps: ['problem_conflict'],
        isUserReachable: false,
        isStrictlyVisibleToUsers: false,
      },
      {
        queueState: {
          pendingJobs: 1,
          runningJobs: 0,
          pendingJobIds: ['job-delete'],
          runningJobIds: [],
        },
      },
    ),
    deleteCandidate: true,
    deleteApprovedByPolicy: true,
    deleteReason: ['analysis_complete_no_keep_value', 'archive_bucket'],
  };
  const suppressMember = createMember({
    repoId: 'repo-suppress',
    fullName: 'acme/repo-suppress',
    historicalRepairBucket: 'high_value_weak',
    repositoryValueTier: 'MEDIUM',
    moneyPriority: 'P2',
    strictVisibilityLevel: 'FAVORITES',
    analysisQualityScore: 60,
    analysisQualityState: 'MEDIUM',
    trustedBlockingGaps: [],
    keyEvidenceGaps: ['market_conflict'],
    decisionRecalcGaps: ['market_conflict'],
    conflictDrivenGaps: ['market_conflict'],
  });

  const freezeState = buildAnalysisPoolFreezeState({
    batchId: 'batch-1',
    snapshotAt: '2026-03-29T08:00:00.000Z',
  });
  const beforeMembers = [
    keepMember,
    archivedMember,
    deletedMember,
    suppressMember,
  ];
  const archivedAfterMember = createMember(
    {
      repoId: 'repo-archived',
      fullName: 'acme/repo-archived',
      historicalRepairBucket: 'archive_or_noise',
      repositoryValueTier: 'LOW',
      moneyPriority: 'P3',
      strictVisibilityLevel: 'BACKGROUND',
      analysisQualityScore: 12,
      analysisQualityState: 'CRITICAL',
      trustedBlockingGaps: ['problem_conflict'],
      keyEvidenceGaps: ['problem_conflict'],
      decisionRecalcGaps: ['problem_conflict'],
      conflictDrivenGaps: ['problem_conflict'],
      isUserReachable: false,
      isStrictlyVisibleToUsers: false,
    },
    {
      completionOverride: buildDecisionRecalcCompletionOverride({
        member: archivedMember,
        compressionClass: 'promote_archived',
        batchId: 'batch-1',
        generatedAt: '2026-03-29T09:00:00.000Z',
      }),
    },
  );
  const suppressAfterMember = createMember(
    {
      repoId: 'repo-suppress',
      fullName: 'acme/repo-suppress',
      historicalRepairBucket: 'high_value_weak',
      repositoryValueTier: 'MEDIUM',
      moneyPriority: 'P2',
      strictVisibilityLevel: 'FAVORITES',
      analysisQualityScore: 60,
      analysisQualityState: 'MEDIUM',
      trustedBlockingGaps: [],
      keyEvidenceGaps: ['market_conflict'],
      decisionRecalcGaps: ['market_conflict'],
      conflictDrivenGaps: ['market_conflict'],
    },
    {
      completionOverride: buildDecisionRecalcCompletionOverride({
        member: suppressMember,
        compressionClass: 'suppress_from_remaining',
        batchId: 'batch-1',
        generatedAt: '2026-03-29T09:00:00.000Z',
      }),
    },
  );
  const afterMembers = [keepMember, archivedAfterMember, suppressAfterMember];
  const beforeSnapshot = buildFrozenAnalysisPoolBatchSnapshot({
    generatedAt: '2026-03-29T08:00:00.000Z',
    batchId: 'batch-1',
    scope: 'all_new_entries',
    reason: 'stop_365',
    members: beforeMembers,
  });
  const afterSnapshot = buildFrozenAnalysisPoolBatchSnapshot({
    generatedAt: '2026-03-29T09:00:00.000Z',
    batchId: 'batch-1',
    scope: 'all_new_entries',
    reason: 'stop_365',
    members: afterMembers,
  });

  const cancelCalls = [];
  const savedConfigs = [];
  const service = new FrozenAnalysisPoolService(
    {
      systemConfig: {
        findUnique: async () => null,
        upsert: async ({ create }) => create,
      },
      jobLog: {
        updateMany: async () => ({ count: 1 }),
      },
    },
    {
      getSettings: async () => ({
        ai: {
          models: {
            omlxLight: 'light-a',
            omlxDeep: 'deep-b',
            omlx: null,
            openai: null,
          },
        },
      }),
    },
    {
      cancelJob: async (jobId) => {
        cancelCalls.push(jobId);
      },
    },
    {
      runPriorityReport: async () => ({
        items: [],
      }),
    },
    {},
  );

  let snapshotCall = 0;
  service.ensureFrozenAnalysisPoolSnapshot = async () => {
    snapshotCall += 1;
    return snapshotCall === 1
      ? {
          freezeState,
          snapshot: beforeSnapshot,
          members: beforeMembers,
        }
      : {
          freezeState,
          snapshot: afterSnapshot,
          members: afterMembers,
        };
  };
  service.loadFrozenPendingQueueJobs = async () => [
    {
      jobId: 'job-archive',
      queueName: 'analysis.single',
      repositoryId: 'repo-archived',
      member: archivedMember,
      historicalRepairAction: 'decision_recalc',
      routerCapabilityTier: 'FAST',
      drainPriorityClass: 'P2',
      waitingDurationHours: 48,
      waitingDurationBucket: 'd1_3',
      replayRisk: true,
      redundant: false,
      suppressible: false,
      lowRoiStale: true,
      suppressionReason: null,
    },
    {
      jobId: 'job-delete',
      queueName: 'analysis.single',
      repositoryId: 'repo-deleted',
      member: deletedMember,
      historicalRepairAction: 'decision_recalc',
      routerCapabilityTier: 'FAST',
      drainPriorityClass: 'P2',
      waitingDurationHours: 30,
      waitingDurationBucket: 'd1_3',
      replayRisk: false,
      redundant: false,
      suppressible: false,
      lowRoiStale: true,
      suppressionReason: null,
    },
  ];
  service.buildDecisionRecalcGateSnapshotForMembers = async (_members, generatedAt) => ({
    schemaVersion: 'decision_recalc_gate_v1',
    generatedAt,
    totalCandidates: 4,
    items: [
      {
        repositoryId: 'repo-keep',
        fullName: 'acme/repo-keep',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'decision_recalc',
        cleanupState: 'active',
        strictVisibilityLevel: 'HOME',
        repositoryValueTier: 'HIGH',
        moneyPriority: 'P0',
        recalcFingerprint: {
          repositoryId: 'repo-keep',
          keyEvidenceGaps: ['user_conflict'],
          decisionRecalcGaps: ['user_conflict'],
          trustedBlockingGaps: ['user_conflict'],
          relevantConflictSignals: ['user_conflict'],
          evidenceCoverageRate: 0.32,
          freshnessDays: 8,
          evidenceFreshnessDays: 8,
          analysisQualityScore: 78,
          analysisQualityState: 'MEDIUM',
          frontendDecisionState: 'provisional',
          hasDeep: false,
          fallbackFlag: false,
          conflictFlag: true,
          incompleteFlag: false,
          recalcFingerprintHash: 'keep',
        },
        recalcFingerprintHash: 'keep',
        previousFingerprintHash: 'prev-keep',
        recalcGateDecision: 'allow_recalc',
        recalcGateReason: 'recalc_new_signal_detected',
        recalcSignalChanged: true,
        recalcSignalDiffSummary: 'changed',
        recalcGateConfidence: 'HIGH',
        changedFields: ['keyEvidenceGaps'],
        replayedConflictSignals: [],
      },
      {
        repositoryId: 'repo-archived',
        fullName: 'acme/repo-archived',
        historicalRepairBucket: 'archive_or_noise',
        historicalRepairAction: 'decision_recalc',
        cleanupState: 'active',
        strictVisibilityLevel: 'BACKGROUND',
        repositoryValueTier: 'LOW',
        moneyPriority: 'P3',
        recalcFingerprint: {
          repositoryId: 'repo-archived',
          keyEvidenceGaps: ['problem_conflict'],
          decisionRecalcGaps: ['problem_conflict'],
          trustedBlockingGaps: ['problem_conflict'],
          relevantConflictSignals: ['problem_conflict'],
          evidenceCoverageRate: 0.1,
          freshnessDays: 40,
          evidenceFreshnessDays: 40,
          analysisQualityScore: 12,
          analysisQualityState: 'CRITICAL',
          frontendDecisionState: 'degraded',
          hasDeep: false,
          fallbackFlag: false,
          conflictFlag: true,
          incompleteFlag: true,
          recalcFingerprintHash: 'archived',
        },
        recalcFingerprintHash: 'archived',
        previousFingerprintHash: 'prev-archived',
        recalcGateDecision: 'suppress_replay',
        recalcGateReason: 'recalc_replay_suppressed',
        recalcSignalChanged: false,
        recalcSignalDiffSummary: 'unchanged',
        recalcGateConfidence: 'HIGH',
        changedFields: [],
        replayedConflictSignals: ['problem_conflict'],
      },
      {
        repositoryId: 'repo-deleted',
        fullName: 'acme/repo-deleted',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'decision_recalc',
        cleanupState: 'freeze',
        strictVisibilityLevel: 'BACKGROUND',
        repositoryValueTier: 'LOW',
        moneyPriority: 'P3',
        recalcFingerprint: {
          repositoryId: 'repo-deleted',
          keyEvidenceGaps: ['problem_conflict'],
          decisionRecalcGaps: ['problem_conflict'],
          trustedBlockingGaps: ['problem_conflict'],
          relevantConflictSignals: ['problem_conflict'],
          evidenceCoverageRate: 0.08,
          freshnessDays: 70,
          evidenceFreshnessDays: 70,
          analysisQualityScore: 5,
          analysisQualityState: 'CRITICAL',
          frontendDecisionState: 'degraded',
          hasDeep: false,
          fallbackFlag: false,
          conflictFlag: true,
          incompleteFlag: true,
          recalcFingerprintHash: 'deleted',
        },
        recalcFingerprintHash: 'deleted',
        previousFingerprintHash: 'prev-deleted',
        recalcGateDecision: 'suppress_cleanup',
        recalcGateReason: 'recalc_cleanup_suppressed:freeze',
        recalcSignalChanged: true,
        recalcSignalDiffSummary: 'cleanup suppressed',
        recalcGateConfidence: 'HIGH',
        changedFields: ['cleanupState'],
        replayedConflictSignals: [],
      },
      {
        repositoryId: 'repo-suppress',
        fullName: 'acme/repo-suppress',
        historicalRepairBucket: 'high_value_weak',
        historicalRepairAction: 'decision_recalc',
        cleanupState: 'active',
        strictVisibilityLevel: 'FAVORITES',
        repositoryValueTier: 'MEDIUM',
        moneyPriority: 'P2',
        recalcFingerprint: {
          repositoryId: 'repo-suppress',
          keyEvidenceGaps: ['market_conflict'],
          decisionRecalcGaps: ['market_conflict'],
          trustedBlockingGaps: [],
          relevantConflictSignals: ['market_conflict'],
          evidenceCoverageRate: 0.5,
          freshnessDays: 4,
          evidenceFreshnessDays: 4,
          analysisQualityScore: 60,
          analysisQualityState: 'MEDIUM',
          frontendDecisionState: 'provisional',
          hasDeep: false,
          fallbackFlag: false,
          conflictFlag: true,
          incompleteFlag: true,
          recalcFingerprintHash: 'suppress',
        },
        recalcFingerprintHash: 'suppress',
        previousFingerprintHash: 'prev-suppress',
        recalcGateDecision: 'suppress_replay',
        recalcGateReason: 'recalc_replay_suppressed',
        recalcSignalChanged: false,
        recalcSignalDiffSummary: 'unchanged',
        recalcGateConfidence: 'HIGH',
        changedFields: [],
        replayedConflictSignals: ['market_conflict'],
      },
    ],
  });
  service.deleteFrozenPoolRepositories = async (members, batchId, deletedAt) => ({
    deletedItems: members.map((member) =>
      buildFrozenAnalysisPoolDeletedItem({
        member,
        batchId,
        deletedAt,
      }),
    ),
    deleteSuppressedQueueCount: 0,
  });
  service.saveSystemConfig = async (key, value) => {
    savedConfigs.push({ key, value });
  };

  const result = await service.runDecisionRecalcFinishCompressionPass();

  assert.equal(result.decisionRecalcCompressedCount, 3);
  assert.equal(result.decisionRecalcKeptRunningCount, 1);
  assert.equal(result.decisionRecalcPromotedArchivedCount, 1);
  assert.equal(result.decisionRecalcPromotedDeletedCount, 1);
  assert.equal(result.decisionRecalcSuppressedFromRemainingCount, 1);
  assert.equal(result.decisionRecalcRemovedFromPendingCount, 2);
  assert.equal(result.decisionRecalcRemovedFromRepairRemainingCount, 3);
  assert.equal(result.decisionRecalcRemainingAfter, 1);
  assert.equal(result.frozenPoolRemainingAfter, 1);
  assert.deepEqual(cancelCalls.sort(), ['job-archive', 'job-delete']);
  assert.equal(savedConfigs.length >= 1, true);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('outdated pending decision_recalc jobs are suppressed when current action has been downgraded', async () => {
  const service = new FrozenAnalysisPoolService(
    {},
    {},
    {},
    {},
    {},
  );
  const downgradedMember = createMember({
    repoId: 'repo-refresh',
    fullName: 'acme/repo-refresh',
    historicalRepairBucket: 'stale_watch',
    historicalRepairAction: 'refresh_only',
    strictVisibilityLevel: 'DETAIL_ONLY',
    repositoryValueTier: 'MEDIUM',
    moneyPriority: 'P2',
  });
  const rows = [
    {
      jobId: 'job-stale-decision',
      queueName: 'analysis.single',
      repositoryId: 'repo-refresh',
      member: downgradedMember,
      historicalRepairAction: 'decision_recalc',
      routerCapabilityTier: 'FAST',
      drainPriorityClass: 'P2',
      waitingDurationHours: 10,
      waitingDurationBucket: 'h6_24',
      replayRisk: false,
      redundant: false,
      suppressible: false,
      lowRoiStale: false,
      suppressionReason: null,
    },
  ];

  service.applyPendingSuppressionPolicy(rows);

  assert.equal(rows[0].suppressible, true);
  assert.equal(rows[0].lowRoiStale, true);
  assert.equal(
    rows[0].suppressionReason,
    'outdated_decision_recalc_pending_current_refresh_only',
  );
});

test('pending drain finish pass integrates pending triage and decision recalc compression stats', async () => {
  const freezeState = buildAnalysisPoolFreezeState({
    batchId: 'batch-1',
    snapshotAt: '2026-03-30T08:00:00.000Z',
  });
  const pendingDecisionMember = createMember(
    {
      repoId: 'repo-pending-decision',
      fullName: 'acme/repo-pending-decision',
      historicalRepairAction: 'decision_recalc',
      repositoryValueTier: 'MEDIUM',
      moneyPriority: 'P2',
      strictVisibilityLevel: 'DETAIL_ONLY',
      analysisQualityState: 'CRITICAL',
      keyEvidenceGaps: ['monetization_conflict'],
      trustedBlockingGaps: ['monetization_conflict'],
      decisionRecalcGaps: ['monetization_conflict'],
      conflictDrivenGaps: ['monetization_conflict'],
    },
    {
      queueState: {
        pendingJobs: 1,
        runningJobs: 0,
        pendingJobIds: ['job-1'],
        runningJobIds: [],
      },
    },
  );
  const deepMember = createMember({
    repoId: 'repo-deep',
    fullName: 'acme/repo-deep',
    historicalRepairAction: 'deep_repair',
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    strictVisibilityLevel: 'HOME',
    analysisQualityState: 'LOW',
    keyEvidenceGaps: ['execution_conflict'],
    trustedBlockingGaps: ['execution_conflict'],
    needsDeepRepair: true,
    needsDecisionRecalc: false,
  });
  const archivedMember = createMember(
    {
      repoId: 'repo-archived',
      fullName: 'acme/repo-archived',
      historicalRepairAction: 'decision_recalc',
      historicalRepairBucket: 'archive_or_noise',
      repositoryValueTier: 'LOW',
      moneyPriority: 'P3',
      strictVisibilityLevel: 'BACKGROUND',
      analysisQualityState: 'CRITICAL',
      keyEvidenceGaps: ['problem_conflict'],
      trustedBlockingGaps: ['problem_conflict'],
      decisionRecalcGaps: ['problem_conflict'],
      conflictDrivenGaps: ['problem_conflict'],
      isUserReachable: false,
      isStrictlyVisibleToUsers: false,
    },
    {
      completionOverride: buildDecisionRecalcCompletionOverride({
        member: createMember({
          repoId: 'repo-archived',
          fullName: 'acme/repo-archived',
          historicalRepairAction: 'decision_recalc',
          historicalRepairBucket: 'archive_or_noise',
          repositoryValueTier: 'LOW',
          moneyPriority: 'P3',
          strictVisibilityLevel: 'BACKGROUND',
          analysisQualityState: 'CRITICAL',
        }),
        compressionClass: 'promote_archived',
        batchId: 'batch-1',
        generatedAt: '2026-03-30T09:00:00.000Z',
      }),
    },
  );
  const beforeMembers = [pendingDecisionMember, deepMember];
  const afterMembers = [deepMember, archivedMember];
  const beforeSnapshot = buildFrozenAnalysisPoolBatchSnapshot({
    generatedAt: '2026-03-30T08:00:00.000Z',
    batchId: 'batch-1',
    scope: 'all_new_entries',
    reason: 'stop_365',
    members: beforeMembers,
  });
  const afterSnapshot = buildFrozenAnalysisPoolBatchSnapshot({
    generatedAt: '2026-03-30T09:00:00.000Z',
    batchId: 'batch-1',
    scope: 'all_new_entries',
    reason: 'stop_365',
    members: afterMembers,
  });

  const service = new FrozenAnalysisPoolService(
    {
      systemConfig: {
        findUnique: async () => null,
        upsert: async ({ create }) => create,
      },
      jobLog: {
        updateMany: async () => ({ count: 1 }),
      },
    },
    {
      getSettings: async () => ({
        ai: {
          models: {
            omlxLight: 'light-a',
            omlxDeep: 'deep-b',
            omlx: null,
            openai: null,
          },
        },
      }),
    },
    {
      cancelJob: async () => undefined,
    },
    {
      runPriorityReport: async () => ({
        items: [],
      }),
    },
    {
      runHistoricalRepairLoop: async () => ({
        selectedCount: 1,
        execution: {
          downgradeOnly: 0,
          refreshOnly: 0,
          evidenceRepair: 0,
          deepRepair: 1,
          decisionRecalc: 0,
          archive: 0,
        },
        queueSummary: {
          totalQueued: 1,
          actionCounts: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 1,
            decision_recalc: 0,
          },
        },
        analysisOutcomeSummary: {
          outcomeStatusBreakdown: {},
          repairValueClassBreakdown: {},
          actionOutcomeStatusBreakdown: {
            deep_repair: { no_change: 0, partial: 1 },
            decision_recalc: { no_change: 0, partial: 0, skipped: 1 },
            evidence_repair: { no_change: 0, partial: 0 },
          },
          actionRepairValueClassBreakdown: {
            deep_repair: { high: 1, medium: 0 },
            decision_recalc: { high: 0, medium: 0 },
            evidence_repair: { high: 0, medium: 0 },
          },
          qualityDeltaSummary: {
            totalDelta: 1,
            averageDelta: 1,
            positiveCount: 1,
            negativeCount: 0,
            zeroCount: 0,
          },
          trustedChangedCount: 0,
          decisionChangedCount: 0,
          fallbackUsedCount: 0,
          reviewUsedCount: 0,
          skippedByCleanupCount: 0,
        },
        selected: [
          {
            repoId: 'repo-deep',
            fullName: 'acme/repo-deep',
            action: 'deep_repair',
          },
        ],
      }),
    },
  );

  let snapshotCall = 0;
  service.ensureFrozenAnalysisPoolSnapshot = async () => {
    snapshotCall += 1;
    return snapshotCall <= 2
      ? {
          freezeState,
          snapshot: beforeSnapshot,
          members: beforeMembers,
        }
      : {
          freezeState,
          snapshot: afterSnapshot,
          members: afterMembers,
        };
  };
  service.loadFrozenPendingQueueJobs = async ({ memberMap }) =>
    memberMap.has('repo-pending-decision')
      ? [
          {
            jobId: 'job-1',
            queueName: 'analysis.single',
            repositoryId: 'repo-pending-decision',
            member: pendingDecisionMember,
            historicalRepairAction: 'decision_recalc',
            routerCapabilityTier: 'REVIEW',
            drainPriorityClass: 'P1',
            waitingDurationHours: 12,
            waitingDurationBucket: 'h6_24',
            replayRisk: true,
            redundant: false,
            suppressible: true,
            lowRoiStale: true,
            suppressionReason: 'decision_recalc_replay_risk',
          },
        ]
      : [];
  service.buildDecisionRecalcCompressionItemsForMembers = async () => [
    {
      repositoryId: 'repo-pending-decision',
      fullName: 'acme/repo-pending-decision',
      historicalRepairBucket: 'high_value_weak',
      historicalRepairAction: 'decision_recalc',
      repositoryValueTier: 'MEDIUM',
      moneyPriority: 'P2',
      strictVisibilityLevel: 'DETAIL_ONLY',
      cleanupState: 'active',
      analysisQualityState: 'CRITICAL',
      analysisQualityScore: 42,
      trustedBlockingGapCount: 1,
      hasTrustedBlockingGaps: true,
      gateDecision: 'suppress_replay',
      gateReason: 'recalc_replay_suppressed',
      queueStatus: 'pending',
      queueState: {
        pendingJobs: 1,
        runningJobs: 0,
        pendingJobIds: ['job-1'],
        runningJobIds: [],
      },
      waitingDurationHours: 12,
      waitingDurationBucket: 'h6_24',
      hasPendingJobs: true,
      hasRunningJobs: false,
      redundantPendingJobCount: 0,
      stalePendingJobCount: 1,
      deleteCandidate: false,
      deleteReason: [],
      conflictTypes: ['monetization_conflict'],
      compressionClass: 'promote_archived',
      compressionReasons: ['recalc_replay_suppressed', 'low_roi_terminal_archived'],
      worthRunning: false,
      archivable: true,
      suppressible: true,
      canDeleteNow: false,
    },
  ];
  service.cancelPendingQueueJobs = async () => ({
    suppressedCount: 1,
    redundantCount: 0,
  });
  service.selectDrainFinishTargets = () => ['repo-deep'];
  service.runFrozenPoolCompletionPass = async () => ({
    frozenPoolCompletedUsefulCount: 1,
    frozenPoolCompletedArchivedCount: 2,
    frozenPoolCompletedDeletedCount: 0,
    frozenPoolRemainingCount: 1,
    remainingPrimaryReasonBreakdown: {
      pending_queue_jobs: 1,
      repair_action_remaining: 0,
    },
    remainingActionBreakdown: {
      deep_repair: 1,
    },
    retainedDeleteCandidates: [],
    topCompletedUseful: [],
    topArchived: [],
    deletedItems: [],
    topRemaining: [],
  });
  service.runDecisionRecalcFinishCompressionPass = async () => ({
    decisionRecalcRemainingBefore: 1,
    decisionRecalcRemainingAfter: 0,
    decisionRecalcCompressedCount: 1,
    decisionRecalcKeptRunningCount: 0,
    decisionRecalcPromotedArchivedCount: 1,
    decisionRecalcPromotedDeletedCount: 0,
    decisionRecalcSuppressedFromRemainingCount: 0,
    decisionRecalcRemovedFromPendingCount: 1,
    decisionRecalcRemovedFromRepairRemainingCount: 1,
    decisionRecalcStillWorthRunningCount: 0,
    queueCancelledJobCount: 1,
    mostWorthContinuingConflictTypes: [{ conflictType: 'execution_conflict', count: 1 }],
    mostCompressibleConflictTypes: [{ conflictType: 'monetization_conflict', count: 1 }],
  });
  service.saveSystemConfig = async () => undefined;

  const result = await service.runPendingQueueDrainAndRepairFinishPass();

  assert.equal(result.pendingInventory.totalCurrentRemainingCount, 2);
  assert.equal(result.pendingInventory.byQueueStatus.pending, 1);
  assert.equal(result.pendingDrainedCount, 2);
  assert.equal(result.pendingSuppressedCount, 2);
  assert.equal(result.decisionRecalcCompressedCount, 1);
  assert.equal(result.decisionRecalcPromotedArchivedCount, 1);
  assert.equal(result.decisionRecalcRemainingAfter, 0);
  assert.equal(result.frozenPoolRemainingAfter, 1);
  assert.equal(result.hardestAction.action, 'deep_repair');
  assert.equal(result.mostCompressibleAction.action, 'decision_recalc');
});
