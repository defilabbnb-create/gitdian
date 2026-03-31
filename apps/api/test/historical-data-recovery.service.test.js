const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HistoricalDataRecoveryService,
} = require('../dist/modules/analysis/historical-data-recovery.service');
const {
  buildDecisionRecalcFingerprint,
  buildDecisionRecalcGateSnapshot,
} = require('../dist/modules/analysis/helpers/decision-recalc-gate.helper');

function buildDispatchPlan(overrides = {}) {
  const repoId = overrides.repoId ?? 'repo-1';
  const action = overrides.action ?? 'refresh_only';

  return {
    item: {
      repoId,
      fullName: overrides.fullName ?? `acme/${repoId}`,
      historicalRepairBucket: overrides.bucket ?? 'high_value_weak',
      historicalRepairReason: overrides.reason ?? 'test repair',
      historicalRepairPriorityScore: overrides.priorityScore ?? 160,
      historicalRepairAction: action,
      cleanupState: overrides.cleanupState ?? 'active',
      frontendDecisionState: overrides.frontendDecisionState ?? 'provisional',
      needsImmediateFrontendDowngrade:
        overrides.needsImmediateFrontendDowngrade ?? false,
      historicalTrustedButWeak: overrides.historicalTrustedButWeak ?? false,
      isVisibleOnHome: overrides.isVisibleOnHome ?? false,
      isVisibleOnFavorites: overrides.isVisibleOnFavorites ?? false,
      appearedInDailySummary: overrides.appearedInDailySummary ?? false,
      appearedInTelegram: overrides.appearedInTelegram ?? false,
      repositoryValueTier: overrides.repositoryValueTier ?? 'LOW',
      moneyPriority: overrides.moneyPriority ?? 'P3',
    },
    routerDecision: {
      routerPriorityClass: overrides.routerPriorityClass ?? 'P1',
      allowsDeterministicFallback:
        overrides.allowsDeterministicFallback ?? false,
      fallbackPolicy: overrides.fallbackPolicy ?? 'NONE',
      capabilityTier: overrides.capabilityTier ?? 'STANDARD',
      requiresReview: overrides.requiresReview ?? false,
    },
    routerMetadata: {
      routerNormalizedTaskType:
        overrides.routerNormalizedTaskType ?? 'historical_repair',
      routerTaskIntent: overrides.routerTaskIntent ?? 'repair',
      routerCapabilityTier: overrides.routerCapabilityTier ?? 'STANDARD',
      routerPriorityClass: overrides.routerPriorityClass ?? 'P1',
      routerFallbackPolicy: overrides.routerFallbackPolicy ?? 'NONE',
      routerRequiresReview: overrides.routerRequiresReview ?? false,
      routerRetryClass: overrides.routerRetryClass ?? 'NONE',
      routerCostSensitivity: overrides.routerCostSensitivity ?? 'HIGH',
      routerLatencySensitivity: overrides.routerLatencySensitivity ?? 'LOW',
      routerReasonSummary: overrides.routerReasonSummary ?? 'test dispatch',
    },
    recalcGate: overrides.recalcGate ?? null,
  };
}

function buildInflightRepairJob(overrides = {}) {
  return {
    queueName: overrides.queueName ?? 'analysis.single',
    triggeredBy: overrides.triggeredBy ?? 'historical_repair',
    payload: {
      repositoryId: overrides.repoId ?? 'repo-1',
      historicalRepairAction: overrides.action ?? 'decision_recalc',
      ...(overrides.payload ?? {}),
    },
  };
}

function buildPriorityReportItem(overrides = {}) {
  const repoId = overrides.repoId ?? 'repo-1';
  const action = overrides.action ?? 'refresh_only';
  const keyEvidenceGaps = overrides.keyEvidenceGaps ?? [];
  const trustedBlockingGaps = overrides.trustedBlockingGaps ?? keyEvidenceGaps;

  return {
    repoId,
    fullName: overrides.fullName ?? `acme/${repoId}`,
    htmlUrl: overrides.htmlUrl ?? `https://github.com/acme/${repoId}`,
    hasSnapshot: overrides.hasSnapshot ?? true,
    hasInsight: overrides.hasInsight ?? true,
    hasFinalDecision: overrides.hasFinalDecision ?? false,
    hasDeep: overrides.hasDeep ?? false,
    qualityScoreSchemaVersion: 'test_v1',
    analysisQualityScore: overrides.analysisQualityScore ?? 48,
    analysisQualityState: overrides.analysisQualityState ?? 'LOW',
    evidenceCoverageRate: overrides.evidenceCoverageRate ?? 0.42,
    evidenceWeakCount: overrides.evidenceWeakCount ?? 0,
    evidenceConflictCount: overrides.evidenceConflictCount ?? 0,
    keyEvidenceMissingCount:
      overrides.keyEvidenceMissingCount ?? keyEvidenceGaps.length,
    keyEvidenceWeakCount: overrides.keyEvidenceWeakCount ?? 0,
    keyEvidenceConflictCount: overrides.keyEvidenceConflictCount ?? 0,
    evidenceMissingDimensions: overrides.evidenceMissingDimensions ?? [],
    evidenceWeakDimensions: overrides.evidenceWeakDimensions ?? [],
    evidenceConflictDimensions: overrides.evidenceConflictDimensions ?? [],
    evidenceSupportingDimensions: overrides.evidenceSupportingDimensions ?? [],
    keyEvidenceGaps,
    keyEvidenceGapSeverity: overrides.keyEvidenceGapSeverity ?? 'MEDIUM',
    conflictDrivenGaps: overrides.conflictDrivenGaps ?? [],
    missingDrivenGaps: overrides.missingDrivenGaps ?? keyEvidenceGaps,
    weakDrivenGaps: overrides.weakDrivenGaps ?? [],
    decisionRecalcGaps: overrides.decisionRecalcGaps ?? [],
    deepRepairGaps: overrides.deepRepairGaps ?? [],
    evidenceRepairGaps: overrides.evidenceRepairGaps ?? [],
    trustedBlockingGaps,
    highRiskGaps: overrides.highRiskGaps ?? [],
    qualityReasonSummary: overrides.qualityReasonSummary ?? 'test item',
    qualityScoreBreakdown:
      overrides.qualityScoreBreakdown ?? {
        completenessScore: 0,
        evidenceCoverageScore: 0,
        missingPenalty: 0,
        conflictPenalty: 0,
        freshnessScore: 0,
        deepCompletionBonus: 0,
        trustedEligibilityPenalty: 0,
        weakPenalty: 0,
        fallbackPenalty: 0,
        incompletePenalty: 0,
      },
    qualityBlockingGaps: overrides.qualityBlockingGaps ?? [],
    missingReasonCount: overrides.missingReasonCount ?? 0,
    missingReasons: overrides.missingReasons ?? [],
    fallbackFlag: overrides.fallbackFlag ?? false,
    conflictFlag: overrides.conflictFlag ?? false,
    incompleteFlag: overrides.incompleteFlag ?? false,
    lastCollectedAt: overrides.lastCollectedAt ?? null,
    lastAnalyzedAt: overrides.lastAnalyzedAt ?? null,
    freshnessDays: overrides.freshnessDays ?? 7,
    evidenceFreshnessDays: overrides.evidenceFreshnessDays ?? 7,
    isVisibleOnHome: overrides.isVisibleOnHome ?? false,
    isVisibleOnFavorites: overrides.isVisibleOnFavorites ?? false,
    appearedInDailySummary: overrides.appearedInDailySummary ?? false,
    appearedInTelegram: overrides.appearedInTelegram ?? false,
    hasDetailPageExposure: overrides.hasDetailPageExposure ?? false,
    isUserReachable: overrides.isUserReachable ?? false,
    moneyPriority: overrides.moneyPriority ?? 'P3',
    repositoryValueTier: overrides.repositoryValueTier ?? 'LOW',
    collectionTier: overrides.collectionTier ?? 'WATCH',
    needsDeepRepair: overrides.needsDeepRepair ?? action === 'deep_repair',
    needsEvidenceRepair:
      overrides.needsEvidenceRepair ?? action === 'evidence_repair',
    needsFreshnessRefresh:
      overrides.needsFreshnessRefresh ?? action === 'refresh_only',
    needsDecisionRecalc:
      overrides.needsDecisionRecalc ?? action === 'decision_recalc',
    needsFrontendDowngrade: overrides.needsFrontendDowngrade ?? false,
    conflictDrivenDecisionRecalc:
      overrides.conflictDrivenDecisionRecalc ?? false,
    analysisStatus: overrides.analysisStatus ?? null,
    displayStatus: overrides.displayStatus ?? null,
    homepageUnsafe: overrides.homepageUnsafe ?? false,
    strictVisibilityLevel: overrides.strictVisibilityLevel ?? 'BACKGROUND',
    isStrictlyVisibleToUsers: overrides.isStrictlyVisibleToUsers ?? false,
    isDetailOnlyExposure: overrides.isDetailOnlyExposure ?? false,
    frontendDowngradeSeverity:
      overrides.frontendDowngradeSeverity ?? 'NONE',
    historicalRepairBucket: overrides.bucket ?? 'stale_watch',
    historicalRepairReason: overrides.reason ?? 'test repair candidate',
    historicalRepairPriorityLabel:
      overrides.historicalRepairPriorityLabel ?? 'P2_STALE_WATCH',
    historicalRepairRecommendedAction:
      overrides.historicalRepairRecommendedAction ?? action,
    historicalRepairSignals: overrides.historicalRepairSignals ?? ['watch_keep_alive'],
    historicalRepairPriorityScore: overrides.priorityScore ?? 118,
    historicalRepairAction: action,
    trustedFlowEligible: overrides.trustedFlowEligible ?? false,
    historicalTrustedButWeak: overrides.historicalTrustedButWeak ?? false,
    frontendDecisionState: overrides.frontendDecisionState ?? 'provisional',
    needsImmediateFrontendDowngrade:
      overrides.needsImmediateFrontendDowngrade ?? false,
    cleanupCandidate: overrides.cleanupCandidate ?? false,
    cleanupState: overrides.cleanupState ?? 'active',
    cleanupReason: overrides.cleanupReason ?? [],
    cleanupEligibleAt: overrides.cleanupEligibleAt ?? null,
    cleanupLastEvaluatedAt:
      overrides.cleanupLastEvaluatedAt ?? '2026-03-30T00:00:00.000Z',
    cleanupCollectionPolicy: overrides.cleanupCollectionPolicy ?? 'normal',
    cleanupNextCollectionAfterDays:
      overrides.cleanupNextCollectionAfterDays ?? null,
    cleanupPurgeTargets: overrides.cleanupPurgeTargets ?? [],
    cleanupBlocksTrusted: overrides.cleanupBlocksTrusted ?? false,
    cleanupStillVisible: overrides.cleanupStillVisible ?? false,
    cleanupStillScheduled: overrides.cleanupStillScheduled ?? false,
  };
}

function buildRecentOutcomeRecord(overrides = {}) {
  return {
    repositoryId: overrides.repoId ?? 'repo-1',
    loggedAt: overrides.loggedAt ?? '2026-03-29T00:00:00.000Z',
    historicalRepairAction: overrides.action ?? 'refresh_only',
    historicalRepairBucket: overrides.bucket ?? 'stale_watch',
    outcomeStatus: overrides.outcomeStatus ?? 'no_change',
    outcomeReason:
      overrides.outcomeReason ?? 'low_yield_suppressed_consecutive_low_value_outcomes',
    repairValueClass: overrides.repairValueClass ?? 'low',
    decisionStateBefore: overrides.decisionStateBefore ?? 'provisional',
    evidenceCoverageRateBefore: overrides.evidenceCoverageRateBefore ?? 0.42,
    keyEvidenceGapsBefore: overrides.keyEvidenceGapsBefore ?? [],
    trustedBlockingGapsBefore: overrides.trustedBlockingGapsBefore ?? [],
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('runRecovery supports dry-run and limit without executing heavy stages', async () => {
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {},
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.scanOldBadRecords = async () => ({
    scannedAt: '2026-03-25T00:00:00.000Z',
    scannedCount: 3,
    metrics: {
      scannedCount: 3,
      bad_oneliner_rate: 0.5,
      headline_user_conflict_rate: 0.5,
      headline_category_conflict_rate: 0,
      monetization_overclaim_rate: 0,
      fallback_visible_rate: 0,
      incomplete_analysis_visible_rate: 0,
      claude_conflict_rate: 0,
      homepage_bad_card_rate: 0,
      counts: {
        bad_one_liner: 1,
        headline_user_conflict: 1,
        headline_category_conflict: 0,
        monetization_overclaim: 0,
        fallback_dirty: 0,
        incomplete_analysis: 0,
        claude_conflict: 0,
        template_repetition: 0,
        homepage_bad_card: 0,
        snapshot_conflict: 0,
      },
      priorityCounts: {
        P0: 1,
        P1: 1,
        P2: 1,
      },
    },
    priorityCounts: {
      P0: 1,
      P1: 1,
      P2: 1,
    },
    topSamples: {
      badOneLiners: [],
      conflicts: [],
      fallback: [],
      incomplete: [],
      claudeConflicts: [],
    },
    items: [
      {
        repoId: 'repo-1',
        fullName: 'acme/one',
        htmlUrl: 'https://github.com/acme/one',
        priority: 'P0',
        stages: ['L0', 'L1', 'L3'],
        issues: [{ type: 'bad_one_liner' }],
        validator: { sanitized: 'A', riskFlags: [] },
      },
      {
        repoId: 'repo-2',
        fullName: 'acme/two',
        htmlUrl: 'https://github.com/acme/two',
        priority: 'P1',
        stages: ['L0', 'L2'],
        issues: [{ type: 'incomplete_analysis' }],
        validator: { sanitized: 'B', riskFlags: [] },
      },
      {
        repoId: 'repo-3',
        fullName: 'acme/three',
        htmlUrl: 'https://github.com/acme/three',
        priority: 'P2',
        stages: ['L0'],
        issues: [],
        validator: { sanitized: 'C', riskFlags: [] },
      },
    ],
  });

  let savedValue = null;
  service.saveSystemConfig = async (_key, value) => {
    savedValue = value;
  };

  const result = await service.runRecovery({
    dryRun: true,
    limit: 2,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.selectedCount, 2);
  assert.equal(result.execution.rerunLightAnalysis, 0);
  assert.equal(result.execution.rerunDeepAnalysis, 0);
  assert.equal(result.execution.claudeQueued, 0);
  assert.equal(result.stageCounts.L1, 1);
  assert.equal(result.stageCounts.L2, 1);
  assert.equal(savedValue.selectedCount, 2);
});

test('rerunDeepAnalysis enqueues missing deep work in bulk when available', async () => {
  const bulkCalls = [];
  const queueCalls = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async ({ where }) =>
          (where?.id?.in ?? []).map((id) => ({
            id,
            analysis: {
              completenessJson: null,
              ideaFitJson: null,
              extractedIdeaJson: null,
            },
          })),
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysesBulk: async (entries, triggeredBy) => {
        bulkCalls.push({ entries, triggeredBy });
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.single',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
      enqueueSingleAnalysis: async (repositoryId, dto, triggeredBy, options) => {
        queueCalls.push({ repositoryId, dto, triggeredBy, options });
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  const count = await service.rerunDeepAnalysis(['repo-1']);

  assert.equal(count, 1);
  assert.equal(bulkCalls.length, 1);
  assert.equal(queueCalls.length, 0);
  assert.equal(bulkCalls[0].triggeredBy, 'health_recovery');
  assert.equal(bulkCalls[0].entries.length, 1);
  assert.equal(bulkCalls[0].entries[0].repositoryId, 'repo-1');
  assert.equal(bulkCalls[0].entries[0].dto.runCompleteness, true);
  assert.equal(bulkCalls[0].entries[0].dto.runIdeaFit, true);
  assert.equal(bulkCalls[0].entries[0].dto.runIdeaExtract, true);
  assert.equal(
    bulkCalls[0].entries[0].jobOptionsOverride.priority,
    service.toSingleAnalysisQueuePriority('deep_repair', 160, 'P0'),
  );
});

test('queueClaudeReview falls back to single enqueue when bulk enqueue fails', async () => {
  const bulkCalls = [];
  const queueCalls = [];
  const logs = [];
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysesBulk: async (entries, triggeredBy) => {
        bulkCalls.push({ entries, triggeredBy });
        throw new Error('bulk failed');
      },
      enqueueSingleAnalysis: async (repositoryId, dto, triggeredBy, options) => {
        queueCalls.push({ repositoryId, dto, triggeredBy, options });
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.logger.warn = (message) => {
    logs.push(message);
  };

  const count = await service.queueClaudeReview(['repo-1', 'repo-2']);

  assert.equal(count, 2);
  assert.equal(bulkCalls.length, 1);
  assert.equal(bulkCalls[0].triggeredBy, 'legacy_claude_review_redirect');
  assert.equal(queueCalls.length, 2);
  assert.equal(queueCalls[0].repositoryId, 'repo-1');
  assert.equal(queueCalls[0].triggeredBy, 'legacy_claude_review_redirect');
  assert.equal(queueCalls[0].dto.forceRerun, true);
  assert.equal(queueCalls[0].options.metadata.legacyClaudeEntry, true);
  assert.equal(
    queueCalls[0].options.jobOptionsOverride.priority,
    service.toSingleAnalysisQueuePriority('deep_repair', 150, 'P0'),
  );
  assert.ok(
    logs.some((entry) =>
      entry.includes(
        'historical_recovery bulk single-analysis enqueue failed',
      ),
    ),
  );
});

test('runHistoricalRepairLoop dispatches downgrade, evidence, deep, and recalc actions', async () => {
  const snapshotCalls = [];
  const analysisCalls = [];
  const savedConfigs = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async ({ where }) => {
          const ids = where?.id?.in ?? [];
          if (!ids.includes('repo-deep')) {
            return [];
          }

          return [
            {
              id: 'repo-deep',
              analysis: {
                completenessJson: null,
                ideaFitJson: null,
                extractedIdeaJson: null,
              },
            },
          ];
        },
        findUnique: async ({ where }) => {
          if (where.id !== 'repo-deep') {
            return null;
          }

          return {
            id: 'repo-deep',
            analysis: {
              completenessJson: null,
              ideaFitJson: null,
              extractedIdeaJson: null,
            },
          };
        },
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshot: async (payload, _triggeredBy, options) => {
        snapshotCalls.push({ payload, options });
      },
      enqueueSingleAnalysis: async (repositoryId, dto, _triggeredBy, options) => {
        analysisCalls.push({ repositoryId, dto, options });
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-27T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 2,
          highValueWeakCount: 2,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 1,
          immediateFrontendDowngradeCount: 2,
          evidenceCoverageRate: 0.46,
          keyEvidenceMissingCount: 2,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 1,
          conflictDrivenDecisionRecalcCount: 1,
          actionBreakdown: {
            downgrade_only: 1,
            refresh_only: 0,
            evidence_repair: 1,
            deep_repair: 1,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 1,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 1,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 1,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
        },
        items: [
          {
            repoId: 'repo-downgrade',
            fullName: 'acme/downgrade',
            historicalRepairBucket: 'visible_broken',
            historicalRepairReason: 'visible risk',
            historicalRepairPriorityScore: 180,
            historicalRepairAction: 'downgrade_only',
            cleanupState: 'active',
            frontendDecisionState: 'degraded',
            needsImmediateFrontendDowngrade: true,
            historicalTrustedButWeak: false,
            conflictDrivenDecisionRecalc: false,
          },
          {
            repoId: 'repo-deep',
            fullName: 'acme/deep',
            historicalRepairBucket: 'visible_broken',
            historicalRepairReason: 'missing deep',
            historicalRepairPriorityScore: 170,
            historicalRepairAction: 'deep_repair',
            cleanupState: 'active',
            frontendDecisionState: 'provisional',
            needsImmediateFrontendDowngrade: true,
            historicalTrustedButWeak: true,
            conflictDrivenDecisionRecalc: false,
          },
          {
            repoId: 'repo-evidence',
            fullName: 'acme/evidence',
            historicalRepairBucket: 'high_value_weak',
            historicalRepairReason: 'missing evidence',
            historicalRepairPriorityScore: 150,
            historicalRepairAction: 'evidence_repair',
            cleanupState: 'active',
            frontendDecisionState: 'provisional',
            needsImmediateFrontendDowngrade: false,
            historicalTrustedButWeak: false,
            repositoryValueTier: 'HIGH',
            moneyPriority: 'P1',
            conflictDrivenDecisionRecalc: false,
          },
          {
            repoId: 'repo-recalc',
            fullName: 'acme/recalc',
            historicalRepairBucket: 'high_value_weak',
            historicalRepairReason: 'decision unstable',
            historicalRepairPriorityScore: 145,
            historicalRepairAction: 'decision_recalc',
            cleanupState: 'active',
            frontendDecisionState: 'provisional',
            needsImmediateFrontendDowngrade: false,
            historicalTrustedButWeak: false,
            conflictDrivenDecisionRecalc: true,
            decisionRecalcGaps: ['user_conflict', 'monetization_conflict'],
            evidenceConflictCount: 2,
            conflictFlag: true,
          },
        ],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async (key, value) => {
    savedConfigs.push({ key, value });
  };
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 3,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 1,
      deep_repair: 1,
      decision_recalc: 1,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    buckets: ['visible_broken', 'high_value_weak'],
    minPriorityScore: 120,
  });

  assert.equal(result.execution.downgradeOnly, 1);
  assert.equal(result.execution.evidenceRepair, 1);
  assert.equal(result.execution.deepRepair, 1);
  assert.equal(result.execution.decisionRecalc, 1);
  assert.equal(result.selectedRepositoryIds.length, 4);
  assert.ok(result.selectedRepositoryIds.includes('repo-recalc'));
  assert.equal(result.analysisOutcomeSummary.totalCount, 4);
  assert.ok(
    result.analysisOutcomeSummary.coveredActions.includes('decision_recalc'),
  );
  assert.ok(
    result.analysisOutcomeSummary.coveredActions.includes('downgrade_only'),
  );
  assert.equal(result.analysisOutcomeSummary.reviewUsedCount, 2);
  assert.equal(result.analysisOutcomeSummary.fallbackUsedCount, 1);
  assert.equal(snapshotCalls.length, 0);
  assert.equal(analysisCalls.length, 3);
  assert.ok(
    analysisCalls.some(
      (entry) =>
        entry.repositoryId === 'repo-evidence' &&
        entry.dto.forceRerun === true &&
        entry.options.metadata.historicalRepairEscalatedFromSnapshot === true,
    ),
  );
  assert.ok(
    analysisCalls.some((entry) =>
      ['HEAVY', 'REVIEW'].includes(
        entry.options.metadata.routerCapabilityTier,
      ),
    ),
  );
  assert.ok(
    analysisCalls.some(
      (entry) => entry.options.metadata.routerRequiresReview === true,
    ),
  );
  assert.equal(
    result.routerExecutionSummary.routerReviewRequiredCount,
    2,
  );
  assert.ok(savedConfigs.some((entry) => entry.key.includes('frontend_guard')));
  assert.ok(savedConfigs.some((entry) => entry.key.includes('priority')));
  assert.ok(savedConfigs.some((entry) => entry.key.includes('analysis.outcome')));
});

test('runHistoricalRepairLoop keeps stale_watch snapshot repairs light-only', async () => {
  const snapshotCalls = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async () => null,
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        snapshotCalls.push(entries);
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.snapshot',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 0,
          staleWatchCount: 1,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.42,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 1,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: [
          buildPriorityReportItem({
            repoId: 'repo-watch-evidence',
            action: 'evidence_repair',
            bucket: 'stale_watch',
            reason: 'watch-only light refresh',
            priorityScore: 118,
            strictVisibilityLevel: 'DETAIL_ONLY',
            repositoryValueTier: 'MEDIUM',
            moneyPriority: 'P2',
            keyEvidenceGaps: ['distribution_gap'],
            trustedBlockingGaps: ['distribution_gap'],
            evidenceCoverageRate: 0.42,
          }),
        ],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 1,
    globalPendingCount: 1,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 1,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    buckets: ['stale_watch'],
    minPriorityScore: 0,
  });

  assert.equal(result.execution.evidenceRepair, 1);
  assert.equal(snapshotCalls.length, 1);
  assert.equal(snapshotCalls[0][0].payload.runDeepAnalysis, false);
  assert.equal(snapshotCalls[0][0].payload.forceDeepAnalysis, false);
  assert.equal(
    snapshotCalls[0][0].payload.deepAnalysisOnlyIfPromising,
    undefined,
  );
});

test('runHistoricalRepairLoop prefilters priority buckets before running priority report', async () => {
  let prefilterQueryArgs = null;
  const priorityReportCalls = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async (args) => {
          prefilterQueryArgs = args;
          return [
            { id: 'candidate-high-1' },
            { id: 'candidate-high-2' },
            { id: 'home-1' },
            { id: 'daily-1' },
          ];
        },
      },
      dailyRadarSummary: {
        findMany: async () => [
          {
            topRepositoryIds: ['home-1'],
            topGoodRepositoryIds: [],
            topCloneRepositoryIds: [],
            topIgnoredRepositoryIds: ['daily-1'],
            telegramSendStatus: 'SENT',
          },
        ],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async () => null,
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {},
    {
      runPriorityReport: async (options) => {
        priorityReportCalls.push(options);
        return {
          generatedAt: '2026-03-31T00:00:00.000Z',
          summary: {
            visibleBrokenCount: 1,
            highValueWeakCount: 1,
            staleWatchCount: 0,
            archiveOrNoiseCount: 0,
            historicalTrustedButWeakCount: 0,
            immediateFrontendDowngradeCount: 0,
            evidenceCoverageRate: 0.4,
            keyEvidenceMissingCount: 0,
            evidenceConflictCount: 0,
            evidenceWeakButVisibleCount: 0,
            conflictDrivenDecisionRecalcCount: 1,
            actionBreakdown: {
              downgrade_only: 0,
              refresh_only: 0,
              evidence_repair: 1,
              deep_repair: 0,
              decision_recalc: 1,
              archive: 0,
            },
            visibleBrokenActionBreakdown: {
              downgrade_only: 0,
              refresh_only: 0,
              evidence_repair: 0,
              deep_repair: 0,
              decision_recalc: 1,
              archive: 0,
            },
            highValueWeakActionBreakdown: {
              downgrade_only: 0,
              refresh_only: 0,
              evidence_repair: 1,
              deep_repair: 0,
              decision_recalc: 0,
              archive: 0,
            },
          },
          items: [
            buildPriorityReportItem({
              repoId: 'home-1',
              action: 'decision_recalc',
              bucket: 'visible_broken',
              priorityScore: 220,
              isVisibleOnHome: true,
              strictVisibilityLevel: 'HOME',
              repositoryValueTier: 'HIGH',
              moneyPriority: 'P1',
            }),
            buildPriorityReportItem({
              repoId: 'candidate-high-1',
              action: 'evidence_repair',
              bucket: 'high_value_weak',
              priorityScore: 210,
              repositoryValueTier: 'HIGH',
              moneyPriority: 'P1',
            }),
          ],
          samples: {},
        };
      },
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: true,
    buckets: ['visible_broken', 'high_value_weak'],
    minPriorityScore: 0,
  });

  assert.ok(prefilterQueryArgs);
  assert.equal(priorityReportCalls.length, 1);
  assert.deepEqual(
    new Set(priorityReportCalls[0].repositoryIds),
    new Set(['candidate-high-1', 'candidate-high-2', 'home-1', 'daily-1']),
  );
  assert.equal(result.selectedCount, 2);
});

test('runHistoricalRepairLoop intersects frozen pool scope with priority prefilter candidates', async () => {
  const priorityReportCalls = [];
  let findUniqueCallCount = 0;
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [
          { id: 'candidate-high-1' },
          { id: 'candidate-high-2' },
          { id: 'home-1' },
          { id: 'outside-frozen' },
        ],
      },
      dailyRadarSummary: {
        findMany: async () => [
          {
            topRepositoryIds: ['home-1'],
            topGoodRepositoryIds: [],
            topCloneRepositoryIds: [],
            topIgnoredRepositoryIds: [],
            telegramSendStatus: 'SENT',
          },
        ],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async () => {
          findUniqueCallCount += 1;
          if (findUniqueCallCount === 1) {
            return {
              configValue: {
                analysisPoolFrozen: true,
                analysisPoolFrozenAt: '2026-03-31T00:00:00.000Z',
                analysisPoolFrozenScope: 'all_new_entries',
                frozenAnalysisPoolBatchId:
                  'frozen-analysis-pool-20260331-000000000',
                frozenAnalysisPoolSnapshotAt: '2026-03-31T00:00:00.000Z',
              },
            };
          }
          if (findUniqueCallCount === 2) {
            return {
              configValue: {
                generatedAt: '2026-03-31T00:00:00.000Z',
                frozenAnalysisPoolBatchId:
                  'frozen-analysis-pool-20260331-000000000',
                frozenAnalysisPoolSnapshotAt: '2026-03-31T00:00:00.000Z',
                analysisPoolFrozenScope: 'all_new_entries',
                analysisPoolFreezeReason: 'test_scope',
                repositoryIds: ['candidate-high-1', 'home-1', 'frozen-only'],
                drainCandidates: [],
                summary: {},
                topMembers: [],
              },
            };
          }
          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {},
    {
      runPriorityReport: async (options) => {
        priorityReportCalls.push(options);
        return {
          generatedAt: '2026-03-31T00:00:00.000Z',
          summary: {
            visibleBrokenCount: 1,
            highValueWeakCount: 1,
            staleWatchCount: 0,
            archiveOrNoiseCount: 0,
            historicalTrustedButWeakCount: 0,
            immediateFrontendDowngradeCount: 0,
            evidenceCoverageRate: 0.5,
            keyEvidenceMissingCount: 0,
            evidenceConflictCount: 0,
            evidenceWeakButVisibleCount: 0,
            conflictDrivenDecisionRecalcCount: 1,
            actionBreakdown: {
              downgrade_only: 0,
              refresh_only: 0,
              evidence_repair: 1,
              deep_repair: 0,
              decision_recalc: 1,
              archive: 0,
            },
            visibleBrokenActionBreakdown: {
              downgrade_only: 0,
              refresh_only: 0,
              evidence_repair: 0,
              deep_repair: 0,
              decision_recalc: 1,
              archive: 0,
            },
            highValueWeakActionBreakdown: {
              downgrade_only: 0,
              refresh_only: 0,
              evidence_repair: 1,
              deep_repair: 0,
              decision_recalc: 0,
              archive: 0,
            },
          },
          items: [
            buildPriorityReportItem({
              repoId: 'home-1',
              action: 'decision_recalc',
              bucket: 'visible_broken',
              priorityScore: 220,
              isVisibleOnHome: true,
              strictVisibilityLevel: 'HOME',
              repositoryValueTier: 'HIGH',
              moneyPriority: 'P1',
            }),
            buildPriorityReportItem({
              repoId: 'candidate-high-1',
              action: 'evidence_repair',
              bucket: 'high_value_weak',
              priorityScore: 210,
              repositoryValueTier: 'HIGH',
              moneyPriority: 'P1',
            }),
          ],
          samples: {},
        };
      },
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: true,
    buckets: ['visible_broken', 'high_value_weak'],
    minPriorityScore: 0,
  });

  assert.equal(priorityReportCalls.length, 1);
  assert.deepEqual(
    new Set(priorityReportCalls[0].repositoryIds),
    new Set(['candidate-high-1', 'home-1']),
  );
  assert.equal(result.selectedCount, 2);
});

test('runHistoricalRepairLoop skips priority prefilter when stale_watch is included', async () => {
  let prefilterQueryCount = 0;
  const priorityReportCalls = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => {
          prefilterQueryCount += 1;
          return [];
        },
      },
      dailyRadarSummary: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async () => null,
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {},
    {
      runPriorityReport: async (options) => {
        priorityReportCalls.push(options);
        return {
          generatedAt: '2026-03-31T00:00:00.000Z',
          summary: {
            visibleBrokenCount: 0,
            highValueWeakCount: 0,
            staleWatchCount: 1,
            archiveOrNoiseCount: 0,
            historicalTrustedButWeakCount: 0,
            immediateFrontendDowngradeCount: 0,
            evidenceCoverageRate: 0.42,
            keyEvidenceMissingCount: 0,
            evidenceConflictCount: 0,
            evidenceWeakButVisibleCount: 0,
            conflictDrivenDecisionRecalcCount: 0,
            actionBreakdown: {
              downgrade_only: 0,
              refresh_only: 1,
              evidence_repair: 0,
              deep_repair: 0,
              decision_recalc: 0,
              archive: 0,
            },
            visibleBrokenActionBreakdown: {
              downgrade_only: 0,
              refresh_only: 0,
              evidence_repair: 0,
              deep_repair: 0,
              decision_recalc: 0,
              archive: 0,
            },
            highValueWeakActionBreakdown: {
              downgrade_only: 0,
              refresh_only: 0,
              evidence_repair: 0,
              deep_repair: 0,
              decision_recalc: 0,
              archive: 0,
            },
          },
          items: [
            buildPriorityReportItem({
              repoId: 'stale-1',
              action: 'refresh_only',
              bucket: 'stale_watch',
              priorityScore: 120,
            }),
          ],
          samples: {},
        };
      },
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: true,
    buckets: ['high_value_weak', 'stale_watch'],
    minPriorityScore: 0,
  });

  assert.equal(prefilterQueryCount, 0);
  assert.equal(priorityReportCalls.length, 1);
  assert.equal(priorityReportCalls[0].repositoryIds, undefined);
  assert.equal(result.selectedCount, 1);
});

test('runHistoricalRepairLoop lets downgrade_only piggyback without consuming the actionable stale_watch limit', async () => {
  const staleItems = [
    buildPriorityReportItem({
      repoId: 'stale-down-1',
      action: 'downgrade_only',
      bucket: 'stale_watch',
      priorityScore: 240,
    }),
    buildPriorityReportItem({
      repoId: 'stale-down-2',
      action: 'downgrade_only',
      bucket: 'stale_watch',
      priorityScore: 239,
    }),
    buildPriorityReportItem({
      repoId: 'stale-down-3',
      action: 'downgrade_only',
      bucket: 'stale_watch',
      priorityScore: 238,
    }),
    buildPriorityReportItem({
      repoId: 'stale-refresh-1',
      action: 'refresh_only',
      bucket: 'stale_watch',
      priorityScore: 200,
    }),
    buildPriorityReportItem({
      repoId: 'stale-refresh-2',
      action: 'refresh_only',
      bucket: 'stale_watch',
      priorityScore: 199,
    }),
  ];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      dailyRadarSummary: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async () => null,
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {},
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 0,
          staleWatchCount: staleItems.length,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.42,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 3,
            refresh_only: 2,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: staleItems,
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: true,
    buckets: ['stale_watch'],
    limit: 2,
    minPriorityScore: 0,
  });

  assert.equal(result.selectedCount, 3);
  assert.deepEqual(
    new Set(result.selectedRepositoryIds),
    new Set(['stale-down-1', 'stale-refresh-1', 'stale-refresh-2']),
  );
});

test('runHistoricalRepairLoop merges scoped decision recalc gate snapshots instead of clobbering global baseline', async () => {
  const savedConfigs = [];
  const previousSnapshot = buildDecisionRecalcGateSnapshot({
    items: [
      buildPriorityReportItem({
        repoId: 'repo-legacy',
        fullName: 'acme/legacy',
        action: 'decision_recalc',
        bucket: 'high_value_weak',
        keyEvidenceGaps: ['user_conflict'],
        decisionRecalcGaps: ['user_conflict'],
        trustedBlockingGaps: ['user_conflict'],
        conflictDrivenGaps: ['user_conflict'],
        conflictFlag: true,
        evidenceConflictCount: 1,
      }),
    ],
    generatedAt: '2026-03-29T00:00:00.000Z',
  });
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (where.configKey === 'analysis.decision_recalc_gate.latest') {
            return {
              configValue: previousSnapshot,
            };
          }
          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async () => undefined,
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-30T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.3,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 1,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
        },
        items: [
          buildPriorityReportItem({
            repoId: 'repo-recalc',
            fullName: 'acme/recalc',
            action: 'decision_recalc',
            bucket: 'high_value_weak',
            reason: 'conflict still open',
            priorityScore: 160,
            conflictDrivenDecisionRecalc: true,
            keyEvidenceGaps: ['monetization_conflict'],
            decisionRecalcGaps: ['monetization_conflict'],
            trustedBlockingGaps: ['monetization_conflict'],
            conflictDrivenGaps: ['monetization_conflict'],
            conflictFlag: true,
            evidenceConflictCount: 1,
          }),
        ],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async (key, value) => {
    savedConfigs.push({ key, value });
  };
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 1,
    globalPendingCount: 1,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 1,
    },
  });

  await service.runHistoricalRepairLoop({
    dryRun: false,
    repositoryIds: ['repo-recalc'],
    limit: 1,
    minPriorityScore: 0,
  });

  const persistedGateSnapshot = savedConfigs.find(
    (entry) => entry.key === 'analysis.decision_recalc_gate.latest',
  )?.value;
  assert.ok(persistedGateSnapshot);
  assert.equal(persistedGateSnapshot.totalCandidates, 2);
  assert.deepEqual(
    persistedGateSnapshot.items.map((item) => item.repositoryId).sort(),
    ['repo-legacy', 'repo-recalc'],
  );
});

test('runHistoricalRepairLoop keeps other lanes running when one lane fails', async () => {
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {},
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-30T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 1,
          highValueWeakCount: 3,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.3,
          keyEvidenceMissingCount: 4,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 1,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 1,
            evidence_repair: 1,
            deep_repair: 1,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 1,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 1,
            deep_repair: 1,
            decision_recalc: 1,
            archive: 0,
          },
        },
        items: [
          {
            repoId: 'repo-refresh',
            fullName: 'acme/refresh',
            historicalRepairBucket: 'visible_broken',
            historicalRepairReason: 'refresh needed',
            historicalRepairPriorityScore: 180,
            historicalRepairAction: 'refresh_only',
            cleanupState: 'active',
            frontendDecisionState: 'provisional',
            needsImmediateFrontendDowngrade: false,
            historicalTrustedButWeak: false,
            conflictDrivenDecisionRecalc: false,
          },
          {
            repoId: 'repo-evidence',
            fullName: 'acme/evidence',
            historicalRepairBucket: 'high_value_weak',
            historicalRepairReason: 'evidence needed',
            historicalRepairPriorityScore: 170,
            historicalRepairAction: 'evidence_repair',
            cleanupState: 'active',
            frontendDecisionState: 'provisional',
            needsImmediateFrontendDowngrade: false,
            historicalTrustedButWeak: false,
            conflictDrivenDecisionRecalc: false,
          },
          {
            repoId: 'repo-deep',
            fullName: 'acme/deep',
            historicalRepairBucket: 'high_value_weak',
            historicalRepairReason: 'deep needed',
            historicalRepairPriorityScore: 160,
            historicalRepairAction: 'deep_repair',
            cleanupState: 'active',
            frontendDecisionState: 'provisional',
            needsImmediateFrontendDowngrade: false,
            historicalTrustedButWeak: false,
            conflictDrivenDecisionRecalc: false,
          },
          {
            repoId: 'repo-recalc',
            fullName: 'acme/recalc',
            historicalRepairBucket: 'high_value_weak',
            historicalRepairReason: 'recalc needed',
            historicalRepairPriorityScore: 150,
            historicalRepairAction: 'decision_recalc',
            cleanupState: 'active',
            frontendDecisionState: 'provisional',
            needsImmediateFrontendDowngrade: false,
            historicalTrustedButWeak: false,
            conflictDrivenDecisionRecalc: true,
            decisionRecalcGaps: ['user_conflict'],
          },
        ],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 3,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 1,
      deep_repair: 1,
      decision_recalc: 1,
    },
  });
  service.enqueueHistoricalRefresh = async () => {
    throw new Error('refresh_lane_boom');
  };
  service.enqueueHistoricalEvidenceRepair = async (plans) =>
    plans.map((plan) => ({
      plan,
      outcomeStatus: 'partial',
      outcomeReason: 'queued_evidence_repair_execution',
      executionDurationMs: 5,
    }));
  service.enqueueHistoricalDeepRepair = async (plans) =>
    plans.map((plan) => ({
      plan,
      outcomeStatus: 'partial',
      outcomeReason: 'queued_deep_repair_execution',
      executionDurationMs: 5,
    }));
  service.enqueueHistoricalDecisionRecalc = async (plans) =>
    plans.map((plan) => ({
      plan,
      outcomeStatus: 'partial',
      outcomeReason: 'queued_decision_recalc_execution',
      executionDurationMs: 5,
    }));

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.equal(result.execution.refreshOnly, 0);
  assert.equal(result.execution.evidenceRepair, 1);
  assert.equal(result.execution.deepRepair, 1);
  assert.equal(result.execution.decisionRecalc, 1);
  assert.equal(result.analysisOutcomeSummary.totalCount, 4);
  assert.equal(result.analysisOutcomeSummary.outcomeStatusBreakdown.skipped, 1);
  assert.ok(
    result.analysisOutcomeSummary.coveredActions.includes('refresh_only'),
  );
  assert.ok(
    result.analysisOutcomeSummary.coveredActions.includes('decision_recalc'),
  );
});

test('enqueueHistoricalRefresh prefers bulk snapshot enqueue and preserves payload order', async () => {
  const bulkCalls = [];
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        bulkCalls.push(entries);
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.snapshot',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  const plans = Array.from({ length: 3 }, (_value, index) =>
    buildDispatchPlan({
      repoId: `repo-${index + 1}`,
      action: 'refresh_only',
      routerPriorityClass: index === 0 ? 'P0' : 'P2',
      routerFallbackPolicy: 'DETERMINISTIC_ONLY',
      allowsDeterministicFallback: true,
    }),
  );

  const outcomes = await service.enqueueHistoricalRefresh(plans, new Map());

  assert.equal(bulkCalls.length, 1);
  assert.equal(bulkCalls[0].length, plans.length);
  assert.deepEqual(
    bulkCalls[0].map((entry) => entry.payload.repositoryId),
    plans.map((plan) => plan.item.repoId),
  );
  assert.equal(
    bulkCalls[0][0].jobOptionsOverride.priority,
    service.toQueuePriority(
      plans[0].item.historicalRepairPriorityScore,
      plans[0].routerDecision.routerPriorityClass,
    ),
  );
  assert.equal(outcomes.length, plans.length);
  assert.deepEqual(
    outcomes.map((outcome) => outcome.plan.item.repoId),
    plans.map((plan) => plan.item.repoId),
  );
  assert.ok(outcomes.every((outcome) => outcome.outcomeStatus === 'partial'));
});

test('enqueueHistoricalRefresh falls back to concurrency pool and keeps batch outcomes stable when bulk enqueue fails', async () => {
  const queueCalls = [];
  let inflight = 0;
  let maxInflight = 0;
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async () => {
        throw new Error('mock_bulk_enqueue_failure');
      },
      enqueueIdeaSnapshot: async (payload) => {
        queueCalls.push(payload.repositoryId);
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 60));
        inflight -= 1;

        if (payload.repositoryId === 'repo-3') {
          throw new Error('mock_enqueue_failure');
        }
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.resolveHistoricalRepairLaneConcurrency = () => 4;

  const plans = Array.from({ length: 8 }, (_value, index) =>
    buildDispatchPlan({
      repoId: `repo-${index + 1}`,
      action: 'refresh_only',
      routerPriorityClass: 'P1',
      routerFallbackPolicy: 'DETERMINISTIC_ONLY',
      allowsDeterministicFallback: true,
    }),
  );

  const startedAt = Date.now();
  const outcomes = await service.enqueueHistoricalRefresh(plans, new Map());
  const durationMs = Date.now() - startedAt;

  assert.equal(outcomes.length, plans.length);
  assert.deepEqual(
    outcomes.map((outcome) => outcome.plan.item.repoId),
    plans.map((plan) => plan.item.repoId),
  );
  assert.equal(queueCalls.length, plans.length);
  assert.ok(maxInflight >= 4);
  assert.ok(
    durationMs < 420,
    `expected concurrent dispatch to finish under 420ms, got ${durationMs}ms`,
  );
  assert.equal(outcomes[2].outcomeStatus, 'skipped');
  assert.match(outcomes[2].outcomeReason, /refresh_enqueue_failed/);
  assert.match(outcomes[2].outcomeReason, /mock_enqueue_failure/);
  assert.equal(outcomes[0].outcomeStatus, 'partial');
  assert.equal(outcomes[7].outcomeStatus, 'partial');
});

test('enqueueHistoricalRefresh splits bulk work into 50-sized batches and falls back only for failed batches', async () => {
  const bulkCalls = [];
  const fallbackCalls = [];
  const logs = [];
  const warnings = [];
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        bulkCalls.push(entries.map((entry) => entry.payload.repositoryId));
        if (bulkCalls.length === 2) {
          throw new Error('mock_second_batch_failed');
        }

        return entries.map((_entry, index) => ({
          jobId: `job-${bulkCalls.length}-${index + 1}`,
          queueName: 'analysis.snapshot',
          queueJobId: `queue-job-${bulkCalls.length}-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
      enqueueIdeaSnapshot: async (payload) => {
        fallbackCalls.push(payload.repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.resolveHistoricalRepairLaneConcurrency = () => 5;
  service.logger.log = (message) => {
    logs.push(message);
  };
  service.logger.warn = (message) => {
    warnings.push(message);
  };

  const plans = Array.from({ length: 55 }, (_value, index) =>
    buildDispatchPlan({
      repoId: `repo-${index + 1}`,
      action: 'refresh_only',
      routerPriorityClass: 'P1',
      routerFallbackPolicy: 'DETERMINISTIC_ONLY',
      allowsDeterministicFallback: true,
    }),
  );

  const outcomes = await service.enqueueHistoricalRefresh(plans, new Map());

  assert.equal(bulkCalls.length, 2);
  assert.equal(bulkCalls[0].length, 50);
  assert.equal(bulkCalls[1].length, 5);
  assert.deepEqual(
    fallbackCalls,
    plans.slice(50).map((plan) => plan.item.repoId),
  );
  assert.deepEqual(
    outcomes.map((outcome) => outcome.plan.item.repoId),
    plans.map((plan) => plan.item.repoId),
  );
  assert.ok(outcomes.every((outcome) => outcome.outcomeStatus === 'partial'));
  assert.equal(warnings.length, 1);
  const telemetryLog = logs.find((entry) =>
    entry.includes('historical_repair lane_telemetry lane=refresh_only'),
  );
  assert.ok(telemetryLog);
  assert.match(telemetryLog, /gateWaitMs=\d+/);
  assert.match(telemetryLog, /historicalRepairGlobalConcurrency=20/);
  assert.match(telemetryLog, /bulkBatches=2/);
  assert.match(telemetryLog, /bulkFallbackBatches=1/);
});

test('enqueueHistoricalRefresh skips repos that already have snapshot inflight before bulk enqueue', async () => {
  const bulkCalls = [];
  const logs = [];
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        bulkCalls.push(entries);
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.snapshot',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
      enqueueIdeaSnapshot: async () => {
        throw new Error('fallback should not run');
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.logger.log = (message) => {
    logs.push(message);
  };

  const plans = [
    buildDispatchPlan({
      repoId: 'repo-1',
      action: 'refresh_only',
      routerFallbackPolicy: 'DETERMINISTIC_ONLY',
      allowsDeterministicFallback: true,
    }),
    buildDispatchPlan({
      repoId: 'repo-2',
      action: 'refresh_only',
      routerFallbackPolicy: 'DETERMINISTIC_ONLY',
      allowsDeterministicFallback: true,
    }),
  ];
  const inflightIndex = new Map([
    [
      'repo-2',
      {
        snapshotInFlight: true,
        decisionRecalcInFlight: false,
        actions: new Set(['snapshot']),
      },
    ],
  ]);

  const outcomes = await service.enqueueHistoricalRefresh(plans, inflightIndex);

  assert.equal(bulkCalls.length, 1);
  assert.deepEqual(
    bulkCalls[0].map((entry) => entry.payload.repositoryId),
    ['repo-1'],
  );
  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[0].outcomeStatus, 'partial');
  assert.equal(outcomes[1].outcomeStatus, 'skipped');
  assert.equal(outcomes[1].outcomeReason, 'snapshot_already_inflight');
  const telemetryLog = logs.find((entry) =>
    entry.includes('historical_repair lane_telemetry lane=refresh_only'),
  );
  assert.ok(telemetryLog);
  assert.match(telemetryLog, /dedupeSkipCount=1/);
  assert.match(telemetryLog, /terminalNoRequeueSkipCount=0/);
});

test('enqueueHistoricalRefresh promotes explicit high-value weak repos to single analysis', async () => {
  const bulkCalls = [];
  const analysisCalls = [];
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        bulkCalls.push(entries);
        return [];
      },
      enqueueSingleAnalysis: async (repositoryId, dto, triggeredBy, options) => {
        analysisCalls.push({ repositoryId, dto, triggeredBy, options });
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  const outcomes = await service.enqueueHistoricalRefresh(
    [
      buildDispatchPlan({
        repoId: 'repo-high-value-refresh',
        action: 'refresh_only',
        bucket: 'high_value_weak',
        repositoryValueTier: 'HIGH',
        moneyPriority: 'P1',
        isVisibleOnFavorites: true,
      }),
    ],
    new Map(),
  );

  assert.equal(bulkCalls.length, 0);
  assert.equal(analysisCalls.length, 1);
  assert.equal(analysisCalls[0].repositoryId, 'repo-high-value-refresh');
  assert.equal(analysisCalls[0].dto.forceRerun, true);
  assert.equal(
    analysisCalls[0].options.metadata.historicalRepairEscalatedFromSnapshot,
    true,
  );
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].outcomeStatus, 'partial');
  assert.equal(outcomes[0].outcomeReason, 'queued_refresh_only_execution');
});

test('enqueueHistoricalEvidenceRepair suppresses terminal repos from re-entering snapshot enqueue', async () => {
  let bulkCalled = false;
  const logs = [];
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async () => {
        bulkCalled = true;
        return [];
      },
      enqueueIdeaSnapshot: async () => {
        throw new Error('fallback should not run');
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.logger.log = (message) => {
    logs.push(message);
  };

  const outcomes = await service.enqueueHistoricalEvidenceRepair(
    [
      buildDispatchPlan({
        repoId: 'repo-terminal',
        action: 'evidence_repair',
        cleanupState: 'purge_ready',
      }),
    ],
    new Map(),
  );

  assert.equal(bulkCalled, false);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].outcomeStatus, 'skipped');
  assert.equal(
    outcomes[0].outcomeReason,
    'terminal_repo_no_requeue_evidence_repair',
  );
  const telemetryLog = logs.find((entry) =>
    entry.includes('historical_repair lane_telemetry lane=evidence_repair'),
  );
  assert.ok(telemetryLog);
  assert.match(telemetryLog, /dedupeSkipCount=0/);
  assert.match(telemetryLog, /terminalNoRequeueSkipCount=1/);
});

test('enqueueHistoricalDecisionRecalc suppresses terminal repos before enqueue', async () => {
  const analysisCalls = [];
  const logs = [];
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId) => {
        analysisCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.logger.log = (message) => {
    logs.push(message);
  };

  const outcomes = await service.enqueueHistoricalDecisionRecalc(
    [
      buildDispatchPlan({
        repoId: 'repo-terminal-recalc',
        action: 'decision_recalc',
        cleanupState: 'archive',
      }),
    ],
    new Map(),
  );

  assert.equal(analysisCalls.length, 0);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].outcomeStatus, 'skipped');
  assert.equal(
    outcomes[0].outcomeReason,
    'terminal_repo_no_requeue_decision_recalc',
  );
  const telemetryLog = logs.find((entry) =>
    entry.includes('historical_repair lane_telemetry lane=decision_recalc'),
  );
  assert.ok(telemetryLog);
  assert.match(telemetryLog, /dedupeSkipCount=0/);
  assert.match(telemetryLog, /terminalNoRequeueSkipCount=1/);
});

test('enqueueHistoricalDecisionRecalc assigns a lower queue priority band than deep repair', async () => {
  const queueCalls = [];
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId, dto, triggeredBy, options) => {
        queueCalls.push({ repositoryId, dto, triggeredBy, options });
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  const plan = buildDispatchPlan({
    repoId: 'repo-recalc-priority',
    action: 'decision_recalc',
    priorityScore: 160,
    routerPriorityClass: 'P0',
  });

  const outcomes = await service.enqueueHistoricalDecisionRecalc(
    [plan],
    new Map(),
  );

  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].outcomeStatus, 'partial');
  assert.equal(queueCalls.length, 1);
  const decisionPriority = queueCalls[0].options.jobOptionsOverride.priority;
  const deepPriority = service.toSingleAnalysisQueuePriority(
    'deep_repair',
    plan.item.historicalRepairPriorityScore,
    plan.routerDecision.routerPriorityClass,
  );
  assert.equal(
    decisionPriority,
    service.toSingleAnalysisQueuePriority(
      'decision_recalc',
      plan.item.historicalRepairPriorityScore,
      plan.routerDecision.routerPriorityClass,
    ),
  );
  assert.ok(decisionPriority > deepPriority);
});

test('enqueueHistoricalDeepRepair batches repository lookup with findMany and preserves per-plan outcomes', async () => {
  const queueCalls = [];
  let findManyCallCount = 0;
  let findUniqueCallCount = 0;
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async ({ where }) => {
          findManyCallCount += 1;
          assert.deepEqual(where.id.in.sort(), ['repo-1', 'repo-2', 'repo-3']);
          return [
            {
              id: 'repo-1',
              analysis: {
                completenessJson: null,
                ideaFitJson: null,
                extractedIdeaJson: null,
              },
            },
            {
              id: 'repo-2',
              analysis: {
                completenessJson: { done: true },
                ideaFitJson: { done: true },
                extractedIdeaJson: { done: true },
              },
            },
          ];
        },
        findUnique: async () => {
          findUniqueCallCount += 1;
          return null;
        },
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId, dto) => {
        queueCalls.push({ repositoryId, dto });
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.resolveHistoricalRepairLaneConcurrency = () => 3;

  const outcomes = await service.enqueueHistoricalDeepRepair([
    buildDispatchPlan({
      repoId: 'repo-1',
      action: 'deep_repair',
      requiresReview: true,
      routerPriorityClass: 'P0',
    }),
    buildDispatchPlan({
      repoId: 'repo-2',
      action: 'deep_repair',
      routerPriorityClass: 'P1',
    }),
    buildDispatchPlan({
      repoId: 'repo-3',
      action: 'deep_repair',
      routerPriorityClass: 'P2',
    }),
  ]);

  assert.equal(findManyCallCount, 1);
  assert.equal(findUniqueCallCount, 0);
  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].repositoryId, 'repo-1');
  assert.equal(queueCalls[0].dto.runCompleteness, true);
  assert.equal(queueCalls[0].dto.runIdeaFit, true);
  assert.equal(queueCalls[0].dto.runIdeaExtract, true);
  assert.deepEqual(
    outcomes.map((outcome) => ({
      repoId: outcome.plan.item.repoId,
      outcomeStatus: outcome.outcomeStatus,
      outcomeReason: outcome.outcomeReason,
    })),
    [
      {
        repoId: 'repo-1',
        outcomeStatus: 'partial',
        outcomeReason: 'queued_deep_repair_execution',
      },
      {
        repoId: 'repo-2',
        outcomeStatus: 'no_change',
        outcomeReason: 'deep_targets_already_present',
      },
      {
        repoId: 'repo-3',
        outcomeStatus: 'skipped',
        outcomeReason: 'repository_missing_for_deep_repair',
      },
    ],
  );
});

test('enqueueHistoricalDeepRepair chunks repository lookup at 100 and keeps outcome order stable', async () => {
  const queueCalls = [];
  const findManyCalls = [];
  const logs = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async ({ where }) => {
          const ids = where?.id?.in ?? [];
          findManyCalls.push(ids);

          return ids
            .filter((id) => id !== 'repo-101')
            .reverse()
            .map((id) => ({
              id,
              analysis:
                id === 'repo-070'
                  ? {
                      completenessJson: { done: true },
                      ideaFitJson: { done: true },
                      extractedIdeaJson: { done: true },
                    }
                  : {
                      completenessJson: null,
                      ideaFitJson: null,
                      extractedIdeaJson: null,
                    },
            }));
        },
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId) => {
        queueCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.resolveHistoricalRepairLaneConcurrency = () => 8;
  service.logger.log = (message) => {
    logs.push(message);
  };

  const plans = Array.from({ length: 101 }, (_value, index) =>
    buildDispatchPlan({
      repoId: `repo-${String(index + 1).padStart(3, '0')}`,
      action: 'deep_repair',
      routerPriorityClass: 'P1',
    }),
  );

  const outcomes = await service.enqueueHistoricalDeepRepair(plans);

  assert.equal(findManyCalls.length, 2);
  assert.equal(findManyCalls[0].length, 100);
  assert.equal(findManyCalls[1].length, 1);
  assert.deepEqual(
    outcomes.map((outcome) => outcome.plan.item.repoId),
    plans.map((plan) => plan.item.repoId),
  );
  assert.equal(outcomes[69].outcomeStatus, 'no_change');
  assert.equal(outcomes[69].outcomeReason, 'deep_targets_already_present');
  assert.equal(outcomes[100].outcomeStatus, 'skipped');
  assert.equal(
    outcomes[100].outcomeReason,
    'repository_missing_for_deep_repair',
  );
  assert.equal(queueCalls.length, 99);
  const telemetryLog = logs.find((entry) =>
    entry.includes('historical_repair lane_telemetry lane=deep_repair'),
  );
  assert.ok(telemetryLog);
  assert.match(telemetryLog, /gateWaitMs=\d+/);
  assert.match(telemetryLog, /deepRepairLookupChunkSize=100/);
  assert.match(telemetryLog, /deepRepairLookupChunkCount=2/);
  assert.match(telemetryLog, /deepRepairLookupDurationMs=\d+/);
});

test('deep_repair lane uses bulk single-analysis enqueue when available', async () => {
  const bulkCalls = [];
  const singleCalls = [];
  const logs = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async ({ where }) => {
          const ids = where?.id?.in ?? [];
          return ids.map((id) => ({
            id,
            analysis: {
              completenessJson: null,
              ideaFitJson: null,
              extractedIdeaJson: null,
            },
          }));
        },
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysesBulk: async (entries) => {
        bulkCalls.push(entries);
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.single',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
      enqueueSingleAnalysis: async (repositoryId) => {
        singleCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.logger.log = (message) => {
    logs.push(message);
  };

  const outcomes = await service.enqueueHistoricalDeepRepair([
    buildDispatchPlan({
      repoId: 'repo-deep-bulk-1',
      action: 'deep_repair',
      priorityScore: 168,
      routerPriorityClass: 'P0',
      requiresReview: true,
    }),
    buildDispatchPlan({
      repoId: 'repo-deep-bulk-2',
      action: 'deep_repair',
      priorityScore: 144,
      routerPriorityClass: 'P1',
    }),
  ]);

  assert.equal(bulkCalls.length, 1);
  assert.equal(singleCalls.length, 0);
  assert.equal(bulkCalls[0].length, 2);
  assert.equal(
    bulkCalls[0][0].jobOptionsOverride.priority,
    service.toSingleAnalysisQueuePriority('deep_repair', 168, 'P0'),
  );
  assert.equal(
    bulkCalls[0][1].jobOptionsOverride.priority,
    service.toSingleAnalysisQueuePriority('deep_repair', 144, 'P1'),
  );
  assert.equal(bulkCalls[0][0].metadata.historicalRepairAction, 'deep_repair');
  assert.equal(bulkCalls[0][0].dto.runCompleteness, true);
  assert.ok(outcomes.every((outcome) => outcome.outcomeStatus === 'partial'));
  assert.ok(
    outcomes.every(
      (outcome) => outcome.outcomeReason === 'queued_deep_repair_execution',
    ),
  );
  const telemetryLog = logs.find((entry) =>
    entry.includes('historical_repair lane_telemetry lane=deep_repair'),
  );
  assert.ok(telemetryLog);
  assert.match(telemetryLog, /bulkBatches=1/);
});

test('historical repair global gate caps mixed-lane inflight work', async () => {
  let inflight = 0;
  let maxInflight = 0;
  const enterGatedWork = async () => {
    inflight += 1;
    maxInflight = Math.max(maxInflight, inflight);
    await sleep(40);
    inflight -= 1;
  };
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async ({ where }) => {
          const ids = where?.id?.in ?? [];
          await enterGatedWork();
          return ids.map((id) => ({
            id,
            analysis: {
              completenessJson: null,
              ideaFitJson: null,
              extractedIdeaJson: null,
            },
          }));
        },
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        await enterGatedWork();
        return entries.map((_entry, index) => ({
          jobId: `bulk-job-${index + 1}`,
          queueName: 'analysis.snapshot',
          queueJobId: `bulk-queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
      enqueueSingleAnalysis: async () => {
        await enterGatedWork();
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.resolveHistoricalRepairLaneConcurrency = () => 4;
  service.resolveHistoricalRepairGlobalConcurrency = () => 2;

  const refreshPlans = Array.from({ length: 4 }, (_value, index) =>
    buildDispatchPlan({
      repoId: `refresh-${index + 1}`,
      action: 'refresh_only',
      routerFallbackPolicy: 'DETERMINISTIC_ONLY',
      allowsDeterministicFallback: true,
    }),
  );
  const evidencePlans = Array.from({ length: 4 }, (_value, index) =>
    buildDispatchPlan({
      repoId: `evidence-${index + 1}`,
      action: 'evidence_repair',
    }),
  );
  const deepPlans = Array.from({ length: 4 }, (_value, index) =>
    buildDispatchPlan({
      repoId: `deep-${index + 1}`,
      action: 'deep_repair',
    }),
  );
  const recalcPlans = Array.from({ length: 4 }, (_value, index) =>
    buildDispatchPlan({
      repoId: `recalc-${index + 1}`,
      action: 'decision_recalc',
      recalcGate: {
        recalcGateDecision: 'allow_recalc',
        recalcGateReason: 'recalc_new_signal_detected',
        recalcSignalChanged: true,
        recalcSignalDiffSummary: 'user_conflict_changed',
        recalcGateConfidence: 'HIGH',
        changedFields: ['user_conflict'],
        replayedConflictSignals: [],
      },
    }),
  );

  const [refreshOutcomes, evidenceOutcomes, deepOutcomes, recalcOutcomes] =
    await Promise.all([
      service.enqueueHistoricalRefresh(refreshPlans, new Map()),
      service.enqueueHistoricalEvidenceRepair(evidencePlans, new Map()),
      service.enqueueHistoricalDeepRepair(deepPlans),
      service.enqueueHistoricalDecisionRecalc(recalcPlans, new Map()),
    ]);

  assert.ok(maxInflight <= 2, `expected max inflight <= 2, got ${maxInflight}`);
  assert.ok(
    refreshOutcomes.every((outcome) => outcome.outcomeStatus === 'partial'),
  );
  assert.ok(
    evidenceOutcomes.every((outcome) => outcome.outcomeStatus === 'partial'),
  );
  assert.ok(
    deepOutcomes.every((outcome) => outcome.outcomeStatus === 'partial'),
  );
  assert.ok(
    recalcOutcomes.every((outcome) => outcome.outcomeStatus === 'partial'),
  );
});

test('decision_recalc lane uses bulk single-analysis enqueue when available', async () => {
  const bulkCalls = [];
  const singleCalls = [];
  const logs = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysesBulk: async (entries) => {
        bulkCalls.push(entries);
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.single',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
      enqueueSingleAnalysis: async (repositoryId) => {
        singleCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        summary: {},
        items: [],
      }),
    },
  );

  service.logger.log = (message) => {
    logs.push(message);
  };

  const outcomes = await service.enqueueHistoricalDecisionRecalc(
    [
      buildDispatchPlan({
        repoId: 'repo-bulk-1',
        action: 'decision_recalc',
        priorityScore: 166,
        recalcGate: {
          recalcGateDecision: 'allow_recalc',
          recalcGateReason: 'recalc_new_signal_detected',
          recalcSignalChanged: true,
          recalcSignalDiffSummary: 'user_conflict_changed',
          recalcGateConfidence: 'HIGH',
          changedFields: ['user_conflict'],
          replayedConflictSignals: [],
        },
      }),
      buildDispatchPlan({
        repoId: 'repo-bulk-2',
        action: 'decision_recalc',
        priorityScore: 152,
        routerPriorityClass: 'P0',
        requiresReview: true,
        recalcGate: {
          recalcGateDecision: 'allow_recalc_but_expect_no_change',
          recalcGateReason: 'recalc_signal_minor_change',
          recalcSignalChanged: true,
          recalcSignalDiffSummary: 'headline_conflict_changed',
          recalcGateConfidence: 'MEDIUM',
          changedFields: ['headline_conflict'],
          replayedConflictSignals: [],
        },
      }),
    ],
    new Map(),
  );

  assert.equal(bulkCalls.length, 1);
  assert.equal(singleCalls.length, 0);
  assert.equal(bulkCalls[0].length, 2);
  assert.equal(
    bulkCalls[0][0].jobOptionsOverride.priority,
    service.toSingleAnalysisQueuePriority('decision_recalc', 166, 'P1'),
  );
  assert.equal(
    bulkCalls[0][1].jobOptionsOverride.priority,
    service.toSingleAnalysisQueuePriority('decision_recalc', 152, 'P0'),
  );
  assert.equal(bulkCalls[0][0].metadata.historicalRepairAction, 'decision_recalc');
  assert.equal(outcomes[0].outcomeReason, 'queued_decision_recalc_execution');
  assert.equal(
    outcomes[1].outcomeReason,
    'queued_decision_recalc_execution_low_expected_value',
  );
  assert.ok(outcomes.every((outcome) => outcome.outcomeStatus === 'partial'));
  const telemetryLog = logs.find((entry) =>
    entry.includes('historical_repair lane_telemetry lane=decision_recalc'),
  );
  assert.ok(telemetryLog);
  assert.match(telemetryLog, /bulkBatches=1/);
});

test('runHistoricalRepairLoop emits standardized loop telemetry fields', async () => {
  const logs = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) =>
        entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.snapshot',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        })),
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-30T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.5,
          keyEvidenceMissingCount: 1,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 1,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 1,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: [
          {
            repoId: 'repo-refresh',
            fullName: 'acme/refresh',
            historicalRepairBucket: 'visible_broken',
            historicalRepairReason: 'refresh needed',
            historicalRepairPriorityScore: 180,
            historicalRepairAction: 'refresh_only',
            cleanupState: 'active',
            frontendDecisionState: 'provisional',
            needsImmediateFrontendDowngrade: false,
            historicalTrustedButWeak: false,
            conflictDrivenDecisionRecalc: false,
          },
        ],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 3,
    globalPendingCount: 2,
    globalRunningCount: 1,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 1,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });
  service.logger.log = (message) => {
    logs.push(message);
  };

  await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  const gateConfigLog = logs.find((entry) =>
    entry.includes('historical_repair gate_config'),
  );
  const loopTelemetryLog = logs.find((entry) =>
    entry.includes('historical_repair loop_telemetry'),
  );
  assert.ok(gateConfigLog);
  assert.ok(loopTelemetryLog);
  assert.match(gateConfigLog, /historicalRepairGlobalConcurrency=20/);
  assert.match(loopTelemetryLog, /selectedCount=1/);
  assert.match(loopTelemetryLog, /loopQueuedCount=1/);
  assert.match(loopTelemetryLog, /totalQueuedCount=1/);
  assert.match(loopTelemetryLog, /totalDurationMs=\d+/);
  assert.match(loopTelemetryLog, /loopQueuedPerSecond=\d+\.\d{2}/);
  assert.match(loopTelemetryLog, /queuedPerSecond=\d+\.\d{2}/);
  assert.match(loopTelemetryLog, /globalPendingCount=2/);
  assert.match(loopTelemetryLog, /globalRunningCount=1/);
  assert.match(loopTelemetryLog, /globalQueuedCount=3/);
  assert.match(loopTelemetryLog, /loopDedupeSkipCount=0/);
  assert.match(loopTelemetryLog, /loopTerminalNoRequeueSkipCount=0/);
  assert.match(loopTelemetryLog, /loopLowYieldSkipCount=0/);
  assert.match(loopTelemetryLog, /historicalRepairGlobalConcurrency=20/);
});

test('runHistoricalRepairLoop skips decision_recalc when the same repo already has decision_recalc inflight', async () => {
  const analysisCalls = [];
  const logs = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [
          buildInflightRepairJob({
            repoId: 'repo-recalc',
            action: 'decision_recalc',
            queueName: 'analysis.single',
          }),
        ],
      },
      systemConfig: {
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId) => {
        analysisCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-30T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.3,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 1,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
        },
        items: [
          {
            repoId: 'repo-recalc',
            fullName: 'acme/recalc',
            historicalRepairBucket: 'high_value_weak',
            historicalRepairReason: 'conflict still open',
            historicalRepairPriorityScore: 160,
            historicalRepairAction: 'decision_recalc',
            cleanupState: 'active',
            frontendDecisionState: 'provisional',
            needsImmediateFrontendDowngrade: false,
            historicalTrustedButWeak: false,
            conflictDrivenDecisionRecalc: true,
          },
        ],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 1,
    globalPendingCount: 1,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 1,
    },
  });
  service.logger.log = (message) => {
    logs.push(message);
  };

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.equal(analysisCalls.length, 0);
  assert.equal(result.execution.decisionRecalc, 0);
  assert.equal(result.analysisOutcomeSummary.outcomeStatusBreakdown.skipped, 1);
  const laneTelemetryLog = logs.find((entry) =>
    entry.includes('historical_repair lane_telemetry lane=decision_recalc'),
  );
  const loopTelemetryLog = logs.find((entry) =>
    entry.includes('historical_repair loop_telemetry'),
  );
  assert.ok(laneTelemetryLog);
  assert.ok(loopTelemetryLog);
  assert.match(laneTelemetryLog, /dedupeSkipCount=1/);
  assert.match(laneTelemetryLog, /terminalNoRequeueSkipCount=0/);
  assert.match(loopTelemetryLog, /loopDedupeSkipCount=1/);
  assert.match(loopTelemetryLog, /loopTerminalNoRequeueSkipCount=0/);
});

test('runHistoricalRepairLoop suppresses low-yield repos after three consecutive low-value outcomes', async () => {
  const snapshotCalls = [];
  const logs = [];
  const lowYieldItem = buildPriorityReportItem({
    repoId: 'repo-low-yield',
    action: 'refresh_only',
    bucket: 'stale_watch',
    reason: 'watch-only refresh',
    priorityScore: 104,
    keyEvidenceGaps: [],
    trustedBlockingGaps: [],
    missingDrivenGaps: [],
    evidenceCoverageRate: 0.42,
    strictVisibilityLevel: 'BACKGROUND',
  });
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: '2026-03-29T03:00:00.000Z',
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: lowYieldItem.repoId,
                    loggedAt: '2026-03-29T03:00:00.000Z',
                    action: 'refresh_only',
                    outcomeStatus: 'no_change',
                    outcomeReason: 'no_change_detected',
                  }),
                  buildRecentOutcomeRecord({
                    repoId: lowYieldItem.repoId,
                    loggedAt: '2026-03-28T03:00:00.000Z',
                    action: 'refresh_only',
                    outcomeStatus: 'no_change',
                    outcomeReason: 'deep_targets_already_present',
                  }),
                  buildRecentOutcomeRecord({
                    repoId: lowYieldItem.repoId,
                    loggedAt: '2026-03-27T03:00:00.000Z',
                    action: 'refresh_only',
                    outcomeStatus: 'skipped',
                    outcomeReason: 'snapshot_already_inflight',
                  }),
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        snapshotCalls.push(entries);
        return [];
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-30T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 0,
          staleWatchCount: 1,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.42,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 1,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: [lowYieldItem],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });
  service.logger.log = (message) => {
    logs.push(message);
  };

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.equal(snapshotCalls.length, 0);
  assert.equal(result.execution.refreshOnly, 0);
  assert.equal(result.analysisOutcomeSummary.outcomeStatusBreakdown.skipped, 1);
  const loopTelemetryLog = logs.find((entry) =>
    entry.includes('historical_repair loop_telemetry'),
  );
  assert.ok(loopTelemetryLog);
  assert.match(loopTelemetryLog, /loopLowYieldSkipCount=1/);
  assert.ok(
    result.analysisOutcomeSummary.actionOutcomeStatusBreakdown.refresh_only.skipped >=
      1,
  );
});

test('runHistoricalRepairLoop suppresses stale-watch detail-only evidence_repair after repeated queued churn', async () => {
  const snapshotCalls = [];
  const lowYieldItem = buildPriorityReportItem({
    repoId: 'repo-evidence-low-yield',
    action: 'evidence_repair',
    bucket: 'stale_watch',
    reason: 'detail-only conflict repair churn',
    priorityScore: 112,
    strictVisibilityLevel: 'DETAIL_ONLY',
    repositoryValueTier: 'MEDIUM',
    moneyPriority: 'P2',
    conflictFlag: true,
    evidenceConflictCount: 2,
    keyEvidenceGaps: ['user_conflict'],
    trustedBlockingGaps: ['user_conflict'],
    conflictDrivenGaps: ['user_conflict'],
    decisionRecalcGaps: [],
    missingDrivenGaps: [],
    weakDrivenGaps: ['distribution_weak'],
    evidenceCoverageRate: 0.42,
    isVisibleOnHome: false,
    isVisibleOnFavorites: false,
    appearedInDailySummary: false,
    appearedInTelegram: false,
    historicalTrustedButWeak: false,
  });
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: '2026-03-29T03:00:00.000Z',
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: lowYieldItem.repoId,
                    loggedAt: '2026-03-29T03:00:00.000Z',
                    action: 'evidence_repair',
                    bucket: 'stale_watch',
                    outcomeStatus: 'partial',
                    outcomeReason: 'queued_evidence_repair_execution',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.42,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: lowYieldItem.repoId,
                    loggedAt: '2026-03-28T03:00:00.000Z',
                    action: 'evidence_repair',
                    bucket: 'stale_watch',
                    outcomeStatus: 'partial',
                    outcomeReason: 'queued_evidence_repair_execution',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.42,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: lowYieldItem.repoId,
                    loggedAt: '2026-03-27T03:00:00.000Z',
                    action: 'evidence_repair',
                    bucket: 'stale_watch',
                    outcomeStatus: 'partial',
                    outcomeReason: 'queued_evidence_repair_execution',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.42,
                  }),
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        snapshotCalls.push(entries);
        return [];
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-30T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 0,
          staleWatchCount: 1,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.42,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 1,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: [lowYieldItem],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.equal(snapshotCalls.length, 0);
  assert.equal(result.execution.evidenceRepair, 0);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 1);
  assert.deepEqual(result.selectedRepositoryIds, []);
  assert.equal(
    result.analysisOutcomeSummary.actionOutcomeStatusBreakdown.evidence_repair
      .skipped,
    1,
  );
});

test('runHistoricalRepairLoop does not low-yield suppress repos when a new decision signal is present', async () => {
  const analysisCalls = [];
  const recalcItem = buildPriorityReportItem({
    repoId: 'repo-recalc-signal',
    action: 'decision_recalc',
    bucket: 'high_value_weak',
    reason: 'new conflict signal',
    priorityScore: 152,
    conflictDrivenDecisionRecalc: true,
    conflictFlag: true,
    decisionRecalcGaps: ['user_conflict'],
    keyEvidenceGaps: ['user_conflict'],
    trustedBlockingGaps: ['user_conflict'],
    conflictDrivenGaps: ['user_conflict'],
    evidenceConflictCount: 1,
    evidenceCoverageRate: 0.18,
    strictVisibilityLevel: 'FAVORITES',
    isVisibleOnFavorites: true,
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
  });
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: '2026-03-29T03:00:00.000Z',
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-29T03:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'no_change',
                    outcomeReason: 'queued_decision_recalc_execution_low_expected_value',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-28T03:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'skipped',
                    outcomeReason: 'decision_recalc_already_inflight',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-27T03:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'no_change',
                    outcomeReason: 'no_change_detected',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId) => {
        analysisCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-30T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.18,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 1,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
        },
        items: [recalcItem],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 1,
    globalPendingCount: 1,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 1,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.deepEqual(analysisCalls, ['repo-recalc-signal']);
  assert.equal(result.execution.decisionRecalc, 1);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 0);
});

test('runHistoricalRepairLoop suppresses immediate identical refresh_only replay candidates even when they are high priority', async () => {
  const recentLoggedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const snapshotCalls = [];
  const refreshItem = buildPriorityReportItem({
    repoId: 'repo-refresh-cooldown',
    action: 'refresh_only',
    bucket: 'high_value_weak',
    reason: 'recent refresh replay',
    priorityScore: 240,
    strictVisibilityLevel: 'HOME',
    isVisibleOnHome: true,
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P0',
    keyEvidenceGaps: ['positioning_gap'],
    trustedBlockingGaps: ['positioning_gap'],
    evidenceCoverageRate: 0.38,
  });
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: recentLoggedAt,
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: refreshItem.repoId,
                    loggedAt: recentLoggedAt,
                    action: 'refresh_only',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'partial',
                    outcomeReason: 'queued_refresh_only_execution',
                    decisionStateBefore: refreshItem.frontendDecisionState,
                    keyEvidenceGapsBefore: ['positioning_gap'],
                    trustedBlockingGapsBefore: ['positioning_gap'],
                    evidenceCoverageRateBefore: 0.38,
                  }),
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        snapshotCalls.push(entries);
        return [];
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.38,
          keyEvidenceMissingCount: 1,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 1,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 1,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: [refreshItem],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.equal(snapshotCalls.length, 0);
  assert.equal(result.execution.refreshOnly, 0);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 1);
  assert.deepEqual(result.selectedRepositoryIds, []);
  assert.equal(
    result.analysisOutcomeSummary.actionOutcomeStatusBreakdown.refresh_only
      .skipped,
    1,
  );
});

test('runHistoricalRepairLoop keeps suppressing identical evidence_repair replay after cooldown skips become the latest outcome', async () => {
  const cooldownLoggedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const queuedLoggedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const snapshotCalls = [];
  const evidenceItem = buildPriorityReportItem({
    repoId: 'repo-evidence-cooldown-repeat',
    action: 'evidence_repair',
    bucket: 'visible_broken',
    reason: 'visible evidence replay stuck in cooldown loop',
    priorityScore: 240,
    strictVisibilityLevel: 'HOME',
    isVisibleOnHome: true,
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    needsImmediateFrontendDowngrade: true,
    keyEvidenceGaps: ['distribution_gap', 'execution_gap'],
    trustedBlockingGaps: ['distribution_gap', 'execution_gap'],
    evidenceCoverageRate: 0.31,
  });
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: cooldownLoggedAt,
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: evidenceItem.repoId,
                    loggedAt: cooldownLoggedAt,
                    action: 'evidence_repair',
                    bucket: 'visible_broken',
                    outcomeStatus: 'skipped',
                    outcomeReason: 'recent_snapshot_replay_cooldown',
                    decisionStateBefore: evidenceItem.frontendDecisionState,
                    keyEvidenceGapsBefore: ['distribution_gap', 'execution_gap'],
                    trustedBlockingGapsBefore: [
                      'distribution_gap',
                      'execution_gap',
                    ],
                    evidenceCoverageRateBefore: 0.31,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: evidenceItem.repoId,
                    loggedAt: queuedLoggedAt,
                    action: 'evidence_repair',
                    bucket: 'visible_broken',
                    outcomeStatus: 'partial',
                    outcomeReason: 'queued_evidence_repair_execution',
                    decisionStateBefore: evidenceItem.frontendDecisionState,
                    keyEvidenceGapsBefore: ['distribution_gap', 'execution_gap'],
                    trustedBlockingGapsBefore: [
                      'distribution_gap',
                      'execution_gap',
                    ],
                    evidenceCoverageRateBefore: 0.31,
                  }),
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        snapshotCalls.push(entries);
        return [];
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 1,
          highValueWeakCount: 0,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 1,
          immediateFrontendDowngradeCount: 1,
          evidenceCoverageRate: 0.31,
          keyEvidenceMissingCount: 2,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 1,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 1,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 1,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: [evidenceItem],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.equal(snapshotCalls.length, 0);
  assert.equal(result.execution.evidenceRepair, 0);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 1);
  assert.deepEqual(result.selectedRepositoryIds, []);
  assert.equal(
    result.analysisOutcomeSummary.actionOutcomeStatusBreakdown.evidence_repair
      .skipped,
    1,
  );
});

test('runHistoricalRepairLoop still allows evidence_repair replay after the snapshot cooldown expires', async () => {
  const expiredLoggedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const snapshotCalls = [];
  const evidenceItem = buildPriorityReportItem({
    repoId: 'repo-evidence-cooldown-expired',
    action: 'evidence_repair',
    bucket: 'visible_broken',
    reason: 'evidence replay after cooldown',
    priorityScore: 240,
    strictVisibilityLevel: 'HOME',
    isVisibleOnHome: true,
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    needsImmediateFrontendDowngrade: true,
    keyEvidenceGaps: ['distribution_gap'],
    trustedBlockingGaps: ['distribution_gap'],
    evidenceCoverageRate: 0.24,
  });
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: expiredLoggedAt,
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: evidenceItem.repoId,
                    loggedAt: expiredLoggedAt,
                    action: 'evidence_repair',
                    bucket: 'visible_broken',
                    outcomeStatus: 'partial',
                    outcomeReason: 'queued_evidence_repair_execution',
                    decisionStateBefore: evidenceItem.frontendDecisionState,
                    keyEvidenceGapsBefore: ['distribution_gap'],
                    trustedBlockingGapsBefore: ['distribution_gap'],
                    evidenceCoverageRateBefore: 0.24,
                  }),
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        snapshotCalls.push(entries);
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.snapshot',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 1,
          highValueWeakCount: 0,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 1,
          evidenceCoverageRate: 0.24,
          keyEvidenceMissingCount: 1,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 1,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 1,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 1,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: [evidenceItem],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 1,
    globalPendingCount: 1,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 1,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.equal(snapshotCalls.length, 1);
  assert.equal(result.execution.evidenceRepair, 1);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 0);
  assert.deepEqual(result.selectedRepositoryIds, [evidenceItem.repoId]);
});

test('runHistoricalRepairLoop lets snapshot replay resume once the last real queue is older than cooldown even if newer cooldown skips exist', async () => {
  const cooldownLoggedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const queuedLoggedAt = new Date(Date.now() - 40 * 60 * 1000).toISOString();
  const snapshotCalls = [];
  const refreshItem = buildPriorityReportItem({
    repoId: 'repo-refresh-cooldown-anchor-expired',
    action: 'refresh_only',
    bucket: 'high_value_weak',
    reason: 'resume after real snapshot cooldown anchor expires',
    priorityScore: 240,
    strictVisibilityLevel: 'HOME',
    isVisibleOnHome: true,
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P0',
    keyEvidenceGaps: ['positioning_gap'],
    trustedBlockingGaps: ['positioning_gap'],
    evidenceCoverageRate: 0.38,
  });
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: cooldownLoggedAt,
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: refreshItem.repoId,
                    loggedAt: cooldownLoggedAt,
                    action: 'refresh_only',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'skipped',
                    outcomeReason: 'recent_snapshot_replay_cooldown',
                    decisionStateBefore: refreshItem.frontendDecisionState,
                    keyEvidenceGapsBefore: ['positioning_gap'],
                    trustedBlockingGapsBefore: ['positioning_gap'],
                    evidenceCoverageRateBefore: 0.38,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: refreshItem.repoId,
                    loggedAt: queuedLoggedAt,
                    action: 'refresh_only',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'partial',
                    outcomeReason: 'queued_refresh_only_execution',
                    decisionStateBefore: refreshItem.frontendDecisionState,
                    keyEvidenceGapsBefore: ['positioning_gap'],
                    trustedBlockingGapsBefore: ['positioning_gap'],
                    evidenceCoverageRateBefore: 0.38,
                  }),
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        snapshotCalls.push(entries);
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.snapshot',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.38,
          keyEvidenceMissingCount: 1,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 1,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 1,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: [refreshItem],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 1,
    globalPendingCount: 1,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 1,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.equal(snapshotCalls.length, 1);
  assert.equal(result.execution.refreshOnly, 1);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 0);
  assert.deepEqual(result.selectedRepositoryIds, [refreshItem.repoId]);
});

test('runHistoricalRepairLoop still low-yield suppresses detail-only medium-value replay repairs', async () => {
  const analysisCalls = [];
  const recalcItem = buildPriorityReportItem({
    repoId: 'repo-recalc-priority-replay',
    action: 'decision_recalc',
    bucket: 'high_value_weak',
    reason: 'detail-only replay repair',
    priorityScore: 149,
    conflictDrivenDecisionRecalc: false,
    conflictFlag: true,
    decisionRecalcGaps: ['user_conflict'],
    keyEvidenceGaps: ['user_conflict'],
    trustedBlockingGaps: ['user_conflict'],
    conflictDrivenGaps: ['user_conflict'],
    evidenceConflictCount: 1,
    evidenceCoverageRate: 0.18,
    strictVisibilityLevel: 'DETAIL_ONLY',
    repositoryValueTier: 'MEDIUM',
    moneyPriority: 'P2',
    isVisibleOnHome: false,
    isVisibleOnFavorites: false,
    appearedInDailySummary: false,
    appearedInTelegram: false,
  });
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: '2026-03-29T03:00:00.000Z',
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-29T03:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'no_change',
                    outcomeReason: 'queued_decision_recalc_execution_low_expected_value',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-28T03:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'no_change',
                    outcomeReason: 'no_change_detected',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-27T03:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'skipped',
                    outcomeReason: 'low_yield_suppressed_consecutive_low_value_outcomes',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                ],
              },
            };
          }

          if (where.configKey === 'analysis.decision_recalc_gate.latest') {
            return {
              configValue: buildDecisionRecalcGateSnapshot({
                items: [recalcItem],
                generatedAt: '2026-03-29T00:00:00.000Z',
              }),
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId) => {
        analysisCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-30T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.18,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
        },
        items: [recalcItem],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 1,
    globalPendingCount: 1,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 1,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.deepEqual(analysisCalls, []);
  assert.equal(result.execution.decisionRecalc, 0);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 0);
  assert.equal(
    result.analysisOutcomeSummary.outcomeStatusBreakdown.skipped,
    1,
  );
  assert.equal(result.routerExecutionSummary.recalcReplaySuppressedCount, 1);
});

test('runHistoricalRepairLoop bypasses low-yield suppression for explicit repository ids', async () => {
  const snapshotCalls = [];
  const explicitItem = buildPriorityReportItem({
    repoId: 'repo-explicit',
    action: 'refresh_only',
    bucket: 'stale_watch',
    reason: 'explicit rerun',
    keyEvidenceGaps: [],
    trustedBlockingGaps: [],
    missingDrivenGaps: [],
    evidenceCoverageRate: 0.42,
  });
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: '2026-03-29T03:00:00.000Z',
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: explicitItem.repoId,
                    loggedAt: '2026-03-29T03:00:00.000Z',
                    action: 'refresh_only',
                    outcomeStatus: 'no_change',
                    outcomeReason: 'no_change_detected',
                  }),
                  buildRecentOutcomeRecord({
                    repoId: explicitItem.repoId,
                    loggedAt: '2026-03-28T03:00:00.000Z',
                    action: 'refresh_only',
                    outcomeStatus: 'no_change',
                    outcomeReason: 'deep_targets_already_present',
                  }),
                  buildRecentOutcomeRecord({
                    repoId: explicitItem.repoId,
                    loggedAt: '2026-03-27T03:00:00.000Z',
                    action: 'refresh_only',
                    outcomeStatus: 'skipped',
                    outcomeReason: 'snapshot_already_inflight',
                  }),
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshotsBulk: async (entries) => {
        snapshotCalls.push(entries);
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.snapshot',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-30T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 0,
          staleWatchCount: 1,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.42,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 1,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: [explicitItem],
        samples: {},
      }),
    },
  );

  service.saveSystemConfig = async () => {};
  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 1,
    globalPendingCount: 1,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 1,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
    repositoryIds: [explicitItem.repoId],
  });

  assert.equal(snapshotCalls.length, 1);
  assert.equal(result.execution.refreshOnly, 1);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 0);
});

test('runHistoricalRepairLoop skips freeze and archive repos in queue competition', async () => {
  const snapshotCalls = [];
  const analysisCalls = [];
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findUnique: async () => null,
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshot: async (payload) => {
        snapshotCalls.push(payload);
      },
      enqueueSingleAnalysis: async (repositoryId) => {
        analysisCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-27T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 1,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 2,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 2,
          evidenceCoverageRate: 0.2,
          keyEvidenceMissingCount: 2,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 2,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 1,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 1,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          freezeCandidateCount: 1,
          archiveCandidateCount: 1,
          purgeReadyCount: 0,
          frozenReposStillVisibleCount: 1,
          archivedReposStillScheduledCount: 0,
          cleanupReasonBreakdown: {
            low_value: 2,
            low_visibility: 2,
            low_quality: 2,
            long_tail_noise: 2,
            stale_inactive: 1,
            no_repair_roi: 2,
            archive_bucket: 2,
            trusted_ineligible: 1,
            repeated_low_signal: 1,
          },
          cleanupStateDistribution: {
            active: 0,
            freeze: 1,
            archive: 1,
            purge_ready: 0,
          },
          purgeReadyTargetBreakdown: {
            snapshot_outputs: 0,
            insight_outputs: 0,
            decision_outputs: 0,
            deep_outputs: 0,
            repair_logs: 0,
          },
        },
        items: [
          {
            repoId: 'repo-freeze',
            fullName: 'acme/freeze',
            historicalRepairBucket: 'archive_or_noise',
            historicalRepairReason: 'long tail noise',
            historicalRepairPriorityScore: 40,
            historicalRepairAction: 'downgrade_only',
            cleanupState: 'freeze',
            frontendDecisionState: 'degraded',
            needsImmediateFrontendDowngrade: true,
            historicalTrustedButWeak: false,
            conflictDrivenDecisionRecalc: false,
          },
          {
            repoId: 'repo-archive',
            fullName: 'acme/archive',
            historicalRepairBucket: 'archive_or_noise',
            historicalRepairReason: 'archive candidate',
            historicalRepairPriorityScore: 20,
            historicalRepairAction: 'archive',
            cleanupState: 'archive',
            frontendDecisionState: 'degraded',
            needsImmediateFrontendDowngrade: true,
            historicalTrustedButWeak: false,
            conflictDrivenDecisionRecalc: false,
          },
        ],
        samples: {},
      }),
    },
  );

  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.equal(result.selectedCount, 0);
  assert.equal(result.execution.downgradeOnly, 0);
  assert.equal(snapshotCalls.length, 0);
  assert.equal(analysisCalls.length, 0);
  assert.equal(result.frontendGuard.downgradedCount, 2);
  assert.equal(
    result.routerExecutionSummary.frozenOrArchivedTaskSuppressedCount,
    2,
  );
  assert.equal(result.analysisOutcomeSummary.outcomeStatusBreakdown.skipped, 2);
  assert.equal(result.analysisOutcomeSummary.skippedByCleanupCount, 2);
});

test('runHistoricalRepairLoop queues priority replayed decision_recalc for high-value visible repos', async () => {
  const analysisCalls = [];
  const recalcItem = {
    repoId: 'repo-recalc',
    fullName: 'acme/recalc',
    historicalRepairBucket: 'high_value_weak',
    historicalRepairReason: 'decision unstable',
    historicalRepairPriorityScore: 145,
    historicalRepairAction: 'decision_recalc',
    cleanupState: 'active',
    frontendDecisionState: 'provisional',
    needsImmediateFrontendDowngrade: false,
    historicalTrustedButWeak: false,
    conflictDrivenDecisionRecalc: true,
    decisionRecalcGaps: ['user_conflict', 'monetization_conflict'],
    trustedBlockingGaps: ['user_conflict', 'monetization_conflict'],
    keyEvidenceGaps: ['user_conflict', 'monetization_conflict'],
    conflictDrivenGaps: ['user_conflict', 'monetization_conflict'],
    evidenceConflictCount: 2,
    conflictFlag: true,
    fallbackFlag: false,
    incompleteFlag: false,
    evidenceCoverageRate: 0.12,
    freshnessDays: 8,
    evidenceFreshnessDays: 8,
    analysisQualityScore: 22,
    analysisQualityState: 'LOW',
    strictVisibilityLevel: 'FAVORITES',
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    hasDeep: false,
    trustedFlowEligible: false,
    cleanupBlocksTrusted: false,
  };
  const previousFingerprint = buildDecisionRecalcFingerprint(recalcItem);
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findUnique: async () => null,
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (where.configKey === 'analysis.decision_recalc_gate.latest') {
            return {
              configValue: {
                schemaVersion: 'decision_recalc_gate_v1',
                generatedAt: '2026-03-28T00:00:00.000Z',
                totalCandidates: 1,
                items: [
                  {
                    repositoryId: recalcItem.repoId,
                    fullName: recalcItem.fullName,
                    historicalRepairBucket: recalcItem.historicalRepairBucket,
                    historicalRepairAction: recalcItem.historicalRepairAction,
                    cleanupState: recalcItem.cleanupState,
                    strictVisibilityLevel: recalcItem.strictVisibilityLevel,
                    repositoryValueTier: recalcItem.repositoryValueTier,
                    moneyPriority: recalcItem.moneyPriority,
                    recalcFingerprint: previousFingerprint,
                    recalcFingerprintHash: previousFingerprint.recalcFingerprintHash,
                    previousFingerprintHash: null,
                    recalcGateDecision: 'allow_recalc',
                    recalcGateReason: 'recalc_first_structured_baseline',
                    recalcSignalChanged: true,
                    recalcSignalDiffSummary: 'bootstrap',
                    recalcGateConfidence: 'LOW',
                    changedFields: ['bootstrap'],
                    replayedConflictSignals: [],
                  },
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueIdeaSnapshot: async () => {},
      enqueueSingleAnalysis: async (repositoryId) => {
        analysisCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-28T01:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.12,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 1,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
        },
        items: [recalcItem],
        samples: {},
      }),
    },
  );

  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.deepEqual(analysisCalls, ['repo-recalc']);
  assert.equal(result.execution.decisionRecalc, 1);
  assert.deepEqual(result.selectedRepositoryIds, ['repo-recalc']);
  assert.equal(
    result.routerExecutionSummary.recalcReplaySuppressedCount,
    0,
  );
  assert.equal(result.routerExecutionSummary.recalcAllowedCount, 0);
  assert.equal(
    result.routerExecutionSummary.recalcAllowedButNoChangeExpectedCount,
    1,
  );
  assert.equal(
    result.analysisOutcomeSummary.outcomeStatusBreakdown.partial,
    1,
  );
  assert.equal(
    result.analysisOutcomeSummary.coveredActions.includes('decision_recalc'),
    true,
  );
});

test('runHistoricalRepairLoop low-yield suppresses stable high-priority replay candidates after repeated no-change', async () => {
  const analysisCalls = [];
  const recalcItem = buildPriorityReportItem({
    repoId: 'repo-priority-replay',
    action: 'decision_recalc',
    bucket: 'high_value_weak',
    reason: 'high-value stable replay',
    priorityScore: 151,
    strictVisibilityLevel: 'FAVORITES',
    isVisibleOnFavorites: false,
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    conflictFlag: false,
    conflictDrivenDecisionRecalc: false,
    decisionRecalcGaps: ['user_conflict'],
    keyEvidenceGaps: ['user_conflict'],
    trustedBlockingGaps: ['user_conflict'],
    conflictDrivenGaps: ['user_conflict'],
    evidenceConflictCount: 1,
    evidenceCoverageRate: 0.18,
    analysisQualityScore: 24,
    analysisQualityState: 'LOW',
    hasDeep: false,
  });
  const previousFingerprint = buildDecisionRecalcFingerprint(recalcItem);
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: '2026-03-30T00:00:00.000Z',
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-30T00:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'no_change',
                    outcomeReason:
                      'queued_decision_recalc_execution_low_expected_value',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-29T00:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'no_change',
                    outcomeReason: 'no_change_detected',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-28T00:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'skipped',
                    outcomeReason: 'decision_recalc_already_inflight',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                ],
              },
            };
          }

          if (where.configKey === 'analysis.decision_recalc_gate.latest') {
            return {
              configValue: {
                schemaVersion: 'decision_recalc_gate_v1',
                generatedAt: '2026-03-29T00:00:00.000Z',
                totalCandidates: 1,
                items: [
                  {
                    repositoryId: recalcItem.repoId,
                    fullName: recalcItem.fullName,
                    historicalRepairBucket: recalcItem.historicalRepairBucket,
                    historicalRepairAction: recalcItem.historicalRepairAction,
                    cleanupState: recalcItem.cleanupState,
                    strictVisibilityLevel: recalcItem.strictVisibilityLevel,
                    repositoryValueTier: recalcItem.repositoryValueTier,
                    moneyPriority: recalcItem.moneyPriority,
                    recalcFingerprint: previousFingerprint,
                    recalcFingerprintHash: previousFingerprint.recalcFingerprintHash,
                    previousFingerprintHash: null,
                    recalcGateDecision: 'allow_recalc',
                    recalcGateReason: 'recalc_first_structured_baseline',
                    recalcSignalChanged: true,
                    recalcSignalDiffSummary: 'bootstrap',
                    recalcGateConfidence: 'LOW',
                    changedFields: ['bootstrap'],
                    replayedConflictSignals: [],
                  },
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId) => {
        analysisCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.18,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
        },
        items: [recalcItem],
        samples: {},
      }),
    },
  );

  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.deepEqual(analysisCalls, []);
  assert.equal(result.execution.decisionRecalc, 0);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 1);
  assert.deepEqual(result.selectedRepositoryIds, []);
  assert.equal(
    result.routerExecutionSummary.recalcAllowedButNoChangeExpectedCount,
    1,
  );
  assert.equal(result.routerExecutionSummary.recalcReplaySuppressedCount, 0);
  assert.equal(
    result.analysisOutcomeSummary.actionOutcomeStatusBreakdown.decision_recalc
      .skipped,
    1,
  );
});

test('runHistoricalRepairLoop suppresses immediate repeated high-value decision_recalc replay after a recent no-change execution', async () => {
  const analysisCalls = [];
  const recalcItem = buildPriorityReportItem({
    repoId: 'repo-priority-immediate-replay',
    action: 'decision_recalc',
    bucket: 'high_value_weak',
    reason: 'recent replay should cool down',
    priorityScore: 158,
    strictVisibilityLevel: 'DETAIL_ONLY',
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    conflictFlag: true,
    conflictDrivenDecisionRecalc: false,
    decisionRecalcGaps: ['user_conflict'],
    keyEvidenceGaps: ['user_conflict'],
    trustedBlockingGaps: ['user_conflict'],
    conflictDrivenGaps: ['user_conflict'],
    evidenceConflictCount: 1,
    evidenceCoverageRate: 0.18,
    analysisQualityScore: 24,
    analysisQualityState: 'LOW',
    hasDeep: true,
  });
  const previousFingerprint = buildDecisionRecalcFingerprint(recalcItem);
  const recentLoggedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: recentLoggedAt,
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: recentLoggedAt,
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'partial',
                    outcomeReason:
                      'queued_decision_recalc_execution_low_expected_value',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                ],
              },
            };
          }

          if (where.configKey === 'analysis.decision_recalc_gate.latest') {
            return {
              configValue: {
                schemaVersion: 'decision_recalc_gate_v1',
                generatedAt: recentLoggedAt,
                totalCandidates: 1,
                items: [
                  {
                    repositoryId: recalcItem.repoId,
                    fullName: recalcItem.fullName,
                    historicalRepairBucket: recalcItem.historicalRepairBucket,
                    historicalRepairAction: recalcItem.historicalRepairAction,
                    cleanupState: recalcItem.cleanupState,
                    strictVisibilityLevel: recalcItem.strictVisibilityLevel,
                    repositoryValueTier: recalcItem.repositoryValueTier,
                    moneyPriority: recalcItem.moneyPriority,
                    recalcFingerprint: previousFingerprint,
                    recalcFingerprintHash:
                      previousFingerprint.recalcFingerprintHash,
                    previousFingerprintHash: null,
                    recalcGateDecision: 'allow_recalc',
                    recalcGateReason: 'recalc_first_structured_baseline',
                    recalcSignalChanged: true,
                    recalcSignalDiffSummary: 'bootstrap',
                    recalcGateConfidence: 'LOW',
                    changedFields: ['bootstrap'],
                    replayedConflictSignals: [],
                  },
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId) => {
        analysisCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.18,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
        },
        items: [recalcItem],
        samples: {},
      }),
    },
  );

  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.deepEqual(analysisCalls, []);
  assert.equal(result.execution.decisionRecalc, 0);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 1);
  assert.deepEqual(result.selectedRepositoryIds, []);
  assert.equal(
    result.analysisOutcomeSummary.actionOutcomeStatusBreakdown.decision_recalc
      .skipped,
    1,
  );
});

test('runHistoricalRepairLoop lets decision_recalc replay resume once the last real execution is older than cooldown even if newer cooldown skips exist', async () => {
  const analysisCalls = [];
  const recalcItem = buildPriorityReportItem({
    repoId: 'repo-priority-replay-anchor-expired',
    action: 'decision_recalc',
    bucket: 'high_value_weak',
    reason: 'resume after real recalc cooldown anchor expires',
    priorityScore: 158,
    strictVisibilityLevel: 'DETAIL_ONLY',
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    conflictFlag: true,
    conflictDrivenDecisionRecalc: false,
    decisionRecalcGaps: ['user_conflict'],
    keyEvidenceGaps: ['user_conflict'],
    trustedBlockingGaps: ['user_conflict'],
    conflictDrivenGaps: ['user_conflict'],
    evidenceConflictCount: 1,
    evidenceCoverageRate: 0.18,
    analysisQualityScore: 24,
    analysisQualityState: 'LOW',
    hasDeep: true,
  });
  const previousFingerprint = buildDecisionRecalcFingerprint(recalcItem);
  const cooldownLoggedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const queuedLoggedAt = new Date(Date.now() - 40 * 60 * 1000).toISOString();
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: cooldownLoggedAt,
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: cooldownLoggedAt,
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'skipped',
                    outcomeReason: 'recent_decision_recalc_replay_cooldown',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: queuedLoggedAt,
                    action: 'decision_recalc',
                    bucket: 'high_value_weak',
                    outcomeStatus: 'partial',
                    outcomeReason:
                      'queued_decision_recalc_execution_low_expected_value',
                    keyEvidenceGapsBefore: ['user_conflict'],
                    trustedBlockingGapsBefore: ['user_conflict'],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                ],
              },
            };
          }

          if (where.configKey === 'analysis.decision_recalc_gate.latest') {
            return {
              configValue: {
                schemaVersion: 'decision_recalc_gate_v1',
                generatedAt: cooldownLoggedAt,
                totalCandidates: 1,
                items: [
                  {
                    repositoryId: recalcItem.repoId,
                    fullName: recalcItem.fullName,
                    historicalRepairBucket: recalcItem.historicalRepairBucket,
                    historicalRepairAction: recalcItem.historicalRepairAction,
                    cleanupState: recalcItem.cleanupState,
                    strictVisibilityLevel: recalcItem.strictVisibilityLevel,
                    repositoryValueTier: recalcItem.repositoryValueTier,
                    moneyPriority: recalcItem.moneyPriority,
                    recalcFingerprint: previousFingerprint,
                    recalcFingerprintHash:
                      previousFingerprint.recalcFingerprintHash,
                    previousFingerprintHash: null,
                    recalcGateDecision: 'allow_recalc',
                    recalcGateReason: 'recalc_first_structured_baseline',
                    recalcSignalChanged: true,
                    recalcSignalDiffSummary: 'bootstrap',
                    recalcGateConfidence: 'LOW',
                    changedFields: ['bootstrap'],
                    replayedConflictSignals: [],
                  },
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId) => {
        analysisCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: 1,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.18,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
        },
        items: [recalcItem],
        samples: {},
      }),
    },
  );

  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 1,
    globalPendingCount: 1,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 1,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.deepEqual(analysisCalls, [recalcItem.repoId]);
  assert.equal(result.execution.decisionRecalc, 1);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 0);
});

test('runHistoricalRepairLoop low-yield suppresses stable visible_broken replay candidates after repeated no-change', async () => {
  const analysisCalls = [];
  const recalcItem = buildPriorityReportItem({
    repoId: 'repo-visible-replay',
    action: 'decision_recalc',
    bucket: 'visible_broken',
    reason: 'homepage stable replay',
    priorityScore: 180,
    strictVisibilityLevel: 'HOME',
    isVisibleOnHome: true,
    repositoryValueTier: 'MEDIUM',
    moneyPriority: 'P2',
    conflictFlag: true,
    conflictDrivenDecisionRecalc: false,
    decisionRecalcGaps: ['monetization_conflict'],
    keyEvidenceGaps: ['distribution_weak', 'monetization_conflict'],
    trustedBlockingGaps: ['distribution_weak', 'monetization_conflict'],
    conflictDrivenGaps: ['monetization_conflict'],
    evidenceConflictCount: 1,
    evidenceCoverageRate: 0.18,
    analysisQualityScore: 22,
    analysisQualityState: 'LOW',
    hasDeep: true,
    needsImmediateFrontendDowngrade: true,
  });
  const previousFingerprint = buildDecisionRecalcFingerprint(recalcItem);
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async ({ where }) => {
          if (
            where.configKey ===
            'analysis.historical_repair.recent_outcomes.latest'
          ) {
            return {
              configValue: {
                schemaVersion: 'historical_repair_recent_outcomes_v1',
                generatedAt: '2026-03-30T00:00:00.000Z',
                maxItemsPerRepository: 6,
                items: [
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-30T00:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'visible_broken',
                    outcomeStatus: 'no_change',
                    outcomeReason:
                      'queued_decision_recalc_execution_low_expected_value',
                    keyEvidenceGapsBefore: [
                      'distribution_weak',
                      'monetization_conflict',
                    ],
                    trustedBlockingGapsBefore: [
                      'distribution_weak',
                      'monetization_conflict',
                    ],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-29T00:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'visible_broken',
                    outcomeStatus: 'no_change',
                    outcomeReason: 'no_change_detected',
                    keyEvidenceGapsBefore: [
                      'distribution_weak',
                      'monetization_conflict',
                    ],
                    trustedBlockingGapsBefore: [
                      'distribution_weak',
                      'monetization_conflict',
                    ],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                  buildRecentOutcomeRecord({
                    repoId: recalcItem.repoId,
                    loggedAt: '2026-03-28T00:00:00.000Z',
                    action: 'decision_recalc',
                    bucket: 'visible_broken',
                    outcomeStatus: 'skipped',
                    outcomeReason: 'decision_recalc_already_inflight',
                    keyEvidenceGapsBefore: [
                      'distribution_weak',
                      'monetization_conflict',
                    ],
                    trustedBlockingGapsBefore: [
                      'distribution_weak',
                      'monetization_conflict',
                    ],
                    evidenceCoverageRateBefore: 0.18,
                  }),
                ],
              },
            };
          }

          if (where.configKey === 'analysis.decision_recalc_gate.latest') {
            return {
              configValue: {
                schemaVersion: 'decision_recalc_gate_v1',
                generatedAt: '2026-03-29T00:00:00.000Z',
                totalCandidates: 1,
                items: [
                  {
                    repositoryId: recalcItem.repoId,
                    fullName: recalcItem.fullName,
                    historicalRepairBucket: recalcItem.historicalRepairBucket,
                    historicalRepairAction: recalcItem.historicalRepairAction,
                    cleanupState: recalcItem.cleanupState,
                    strictVisibilityLevel: recalcItem.strictVisibilityLevel,
                    repositoryValueTier: recalcItem.repositoryValueTier,
                    moneyPriority: recalcItem.moneyPriority,
                    recalcFingerprint: previousFingerprint,
                    recalcFingerprintHash: previousFingerprint.recalcFingerprintHash,
                    previousFingerprintHash: null,
                    recalcGateDecision: 'allow_recalc',
                    recalcGateReason: 'recalc_first_structured_baseline',
                    recalcSignalChanged: true,
                    recalcSignalDiffSummary: 'bootstrap',
                    recalcGateConfidence: 'LOW',
                    changedFields: ['bootstrap'],
                    replayedConflictSignals: [],
                  },
                ],
              },
            };
          }

          return null;
        },
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
    {
      enqueueSingleAnalysis: async (repositoryId) => {
        analysisCalls.push(repositoryId);
      },
    },
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 1,
          highValueWeakCount: 0,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 1,
          evidenceCoverageRate: 0.18,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 1,
          evidenceWeakButVisibleCount: 1,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 1,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items: [recalcItem],
        samples: {},
      }),
    },
  );

  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: false,
    minPriorityScore: 0,
  });

  assert.deepEqual(analysisCalls, []);
  assert.equal(result.execution.decisionRecalc, 0);
  assert.equal(result.loopTelemetry.loopLowYieldSkipCount, 1);
  assert.deepEqual(result.selectedRepositoryIds, []);
  assert.equal(
    result.routerExecutionSummary.recalcAllowedButNoChangeExpectedCount,
    1,
  );
  assert.equal(
    result.analysisOutcomeSummary.actionOutcomeStatusBreakdown.decision_recalc
      .skipped,
    1,
  );
});

test('runHistoricalRepairLoop returns full selectedRepositoryIds beyond sample truncation', async () => {
  const items = Array.from({ length: 45 }, (_entry, index) =>
    buildPriorityReportItem({
      repoId: `repo-${index + 1}`,
      fullName: `acme/repo-${index + 1}`,
      action: 'refresh_only',
      bucket: 'high_value_weak',
      reason: `batch item ${index + 1}`,
      priorityScore: 200 - index,
    }),
  );
  const service = new HistoricalDataRecoveryService(
    {
      repository: {
        findMany: async () => [],
      },
      jobLog: {
        findMany: async () => [],
      },
      systemConfig: {
        findUnique: async () => null,
        upsert: async ({ create }) => create,
      },
    },
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (entries) => entries,
    },
    {},
    {
      runPriorityReport: async () => ({
        generatedAt: '2026-03-31T00:00:00.000Z',
        summary: {
          visibleBrokenCount: 0,
          highValueWeakCount: items.length,
          staleWatchCount: 0,
          archiveOrNoiseCount: 0,
          historicalTrustedButWeakCount: 0,
          immediateFrontendDowngradeCount: 0,
          evidenceCoverageRate: 0.42,
          keyEvidenceMissingCount: 0,
          evidenceConflictCount: 0,
          evidenceWeakButVisibleCount: 0,
          conflictDrivenDecisionRecalcCount: 0,
          actionBreakdown: {
            downgrade_only: 0,
            refresh_only: items.length,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          visibleBrokenActionBreakdown: {
            downgrade_only: 0,
            refresh_only: 0,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
          highValueWeakActionBreakdown: {
            downgrade_only: 0,
            refresh_only: items.length,
            evidence_repair: 0,
            deep_repair: 0,
            decision_recalc: 0,
            archive: 0,
          },
        },
        items,
        samples: {},
      }),
    },
  );

  service.getHistoricalRepairQueueSummary = async () => ({
    totalQueued: 0,
    globalPendingCount: 0,
    globalRunningCount: 0,
    actionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    },
  });

  const result = await service.runHistoricalRepairLoop({
    dryRun: true,
    minPriorityScore: 0,
  });

  assert.equal(result.selectedCount, 45);
  assert.equal(result.selected.length, 40);
  assert.equal(result.selectedRepositoryIds.length, 45);
  assert.deepEqual(result.selectedRepositoryIds.slice(0, 3), [
    'repo-1',
    'repo-2',
    'repo-3',
  ]);
  assert.equal(result.selectedRepositoryIds.at(-1), 'repo-45');
});
