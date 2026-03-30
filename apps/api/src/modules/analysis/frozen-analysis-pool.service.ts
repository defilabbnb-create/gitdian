import { Injectable, Logger } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { QueueService } from '../queue/queue.service';
import { HistoricalDataRecoveryService } from './historical-data-recovery.service';
import { HistoricalRepairPriorityService } from './historical-repair-priority.service';
import {
  ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY,
  FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY,
  FROZEN_ANALYSIS_POOL_COMPLETION_CONFIG_KEY,
  FROZEN_ANALYSIS_POOL_DECISION_RECALC_COMPRESSION_CONFIG_KEY,
  FROZEN_ANALYSIS_POOL_DRAIN_CONFIG_KEY,
  FROZEN_ANALYSIS_POOL_DRAIN_FINISH_CONFIG_KEY,
  type AnalysisPoolFreezeState,
  type FrozenAnalysisCompletionOverride,
  type FrozenAnalysisPoolBatchSnapshot,
  type FrozenAnalysisPoolCompletionPassResult,
  type FrozenAnalysisPoolDrainFinishResult,
  type FrozenAnalysisPoolDrainPriorityClass,
  type FrozenAnalysisPoolDeletedItem,
  type FrozenAnalysisPoolDrainResult,
  type FrozenAnalysisPoolMember,
  type FrozenAnalysisPoolPendingAuditSample,
  type FrozenAnalysisPoolPendingInventory,
  type FrozenAnalysisPoolPendingInventorySample,
  type FrozenAnalysisPoolPendingQueueStatus,
  type FrozenAnalysisPoolPendingQueueBreakdown,
  type FrozenAnalysisPoolQueueState,
  type FrozenAnalysisPoolReport,
  type FrozenAnalysisPoolRetainedDeleteCandidate,
} from './helpers/frozen-analysis-pool.types';
import {
  accumulateFrozenPendingQueueBreakdown,
  buildAnalysisPoolFreezeState,
  buildEmptyFrozenPendingQueueBreakdown,
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
  readAnalysisPoolFreezeState,
  readFrozenAnalysisPoolBatchSnapshot,
  scoreFrozenAnalysisPoolMember,
  shouldIncludeFrozenPoolMember,
} from './helpers/frozen-analysis-pool.helper';
import {
  buildDecisionRecalcCompletionOverride,
  buildDecisionRecalcCompressionItem,
  deriveDecisionRecalcConflictTypes,
  resolveDecisionRecalcQueueStatus,
  resolveDecisionRecalcWaitingDurationBucket,
} from './helpers/decision-recalc-finish-compression.helper';
import type {
  DecisionRecalcCompressionItem,
  DecisionRecalcFinishCompressionResult,
} from './helpers/decision-recalc-finish-compression.types';
import {
  buildDecisionRecalcGateSnapshot,
  buildDecisionRecalcGateSnapshotMap,
  readDecisionRecalcGateSnapshot,
} from './helpers/decision-recalc-gate.helper';
import type {
  DecisionRecalcGateSnapshot,
} from './helpers/decision-recalc-gate.types';
import type { HistoricalRepairPriorityItem } from './helpers/historical-repair-priority.helper';

const FROZEN_ANALYSIS_POOL_CLEANUP_CONFIG_KEY =
  'analysis.pool.cleanup.latest';

type FrozenPendingQueueJob = {
  jobId: string;
  queueName: string | null;
  repositoryId: string;
  member: FrozenAnalysisPoolMember;
  historicalRepairAction: FrozenAnalysisPoolMember['historicalRepairAction'];
  routerCapabilityTier: string | null;
  drainPriorityClass: FrozenAnalysisPoolDrainPriorityClass;
  waitingDurationHours: number;
  waitingDurationBucket: FrozenAnalysisPoolPendingAuditSample['waitingDurationBucket'];
  replayRisk: boolean;
  redundant: boolean;
  suppressible: boolean;
  lowRoiStale: boolean;
  suppressionReason: string | null;
};

type FrozenArchivePurgeCleanupResult = {
  cleanedAt: string;
  batchId: string;
  targetedRepositoryCount: number;
  archiveRepositoryCount: number;
  purgeReadyRepositoryCount: number;
  cancelledPendingJobCount: number;
  cancelledRepositoryCount: number;
  purgedRepositoryCount: number;
  purgedSnapshotCount: number;
  purgedCachedRankingCount: number;
  deletedTerminalJobLogCount: number;
};

@Injectable()
export class FrozenAnalysisPoolService {
  private readonly logger = new Logger(FrozenAnalysisPoolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly queueService: QueueService,
    private readonly historicalRepairPriorityService: HistoricalRepairPriorityService,
    private readonly historicalDataRecoveryService: HistoricalDataRecoveryService,
  ) {}

  async buildFrozenAnalysisPoolReport(options?: {
    refreshSnapshot?: boolean;
  }): Promise<FrozenAnalysisPoolReport> {
    const stateBundle = await this.ensureFrozenAnalysisPoolSnapshot({
      forceRefresh: options?.refreshSnapshot === true,
    });
    const members = stateBundle.members ?? stateBundle.snapshot.topMembers;

    return buildFrozenAnalysisPoolReport({
      generatedAt: new Date().toISOString(),
      freezeState: stateBundle.freezeState,
      modelAssignment: await this.resolveModelAssignment(),
      snapshot: stateBundle.snapshot,
      members,
    });
  }

  async buildFrozenAnalysisPoolCompletionReport(options?: {
    refreshSnapshot?: boolean;
  }): Promise<FrozenAnalysisPoolCompletionPassResult> {
    const latest = await this.loadFrozenPoolCompletionResult();
    if (
      latest &&
      options?.refreshSnapshot !== true &&
      latest.completionPromotionSummary &&
      latest.remainingPrimaryReasonBreakdown &&
      latest.remainingActionBreakdown
    ) {
      return latest;
    }

    return this.previewFrozenPoolCompletionResult();
  }

  async includeRepositoryIdsInFrozenPoolSnapshot(args: {
    repositoryIds: string[];
    reason?: string | null;
  }) {
    const requestedRepositoryIds = [
      ...new Set(args.repositoryIds.map((value) => value.trim()).filter(Boolean)),
    ];
    const promotedAt = new Date().toISOString();

    if (!requestedRepositoryIds.length) {
      const bundle = await this.ensureFrozenAnalysisPoolSnapshot();
      return {
        promotedAt,
        frozenAnalysisPoolBatchId: bundle.snapshot.frozenAnalysisPoolBatchId,
        requestedRepositoryCount: 0,
        addedRepositoryCount: 0,
        alreadyMemberCount: 0,
        unresolvedRepositoryCount: 0,
        totalRepositoryCount: bundle.snapshot.repositoryIds.length,
        addedRepositoryIds: [] as string[],
        unresolvedRepositoryIds: [] as string[],
      };
    }

    const existing = await this.ensureFrozenAnalysisPoolSnapshot();
    const currentRepositoryIds = [
      ...new Set(existing.snapshot.repositoryIds.filter(Boolean)),
    ];
    const currentRepositoryIdSet = new Set(currentRepositoryIds);
    const addedRepositoryIds = requestedRepositoryIds.filter(
      (repositoryId) => !currentRepositoryIdSet.has(repositoryId),
    );

    if (!addedRepositoryIds.length) {
      return {
        promotedAt,
        frozenAnalysisPoolBatchId: existing.snapshot.frozenAnalysisPoolBatchId,
        requestedRepositoryCount: requestedRepositoryIds.length,
        addedRepositoryCount: 0,
        alreadyMemberCount: requestedRepositoryIds.length,
        unresolvedRepositoryCount: 0,
        totalRepositoryCount: currentRepositoryIds.length,
        addedRepositoryIds: [] as string[],
        unresolvedRepositoryIds: [] as string[],
      };
    }

    const batchId = existing.snapshot.frozenAnalysisPoolBatchId;
    const mergedRepositoryIds = [...new Set([...currentRepositoryIds, ...addedRepositoryIds])];
    const members = await this.loadFrozenPoolMembers(
      mergedRepositoryIds,
      batchId,
      promotedAt,
    );
    const memberRepositoryIdSet = new Set(members.map((member) => member.repositoryId));
    const unresolvedRepositoryIds = addedRepositoryIds.filter(
      (repositoryId) => !memberRepositoryIdSet.has(repositoryId),
    );
    const effectiveMembers = members.filter((member) =>
      mergedRepositoryIds.includes(member.repositoryId),
    );
    const freezeState = buildAnalysisPoolFreezeState({
      batchId,
      snapshotAt: promotedAt,
      frozenAt: existing.freezeState.analysisPoolFrozenAt ?? promotedAt,
      reason:
        existing.freezeState.analysisPoolFreezeReason ??
        args.reason ??
        'legacy_local_analysis_remediation',
      scope: existing.freezeState.analysisPoolFrozenScope,
    });
    const snapshot = buildFrozenAnalysisPoolBatchSnapshot({
      generatedAt: promotedAt,
      batchId,
      scope: freezeState.analysisPoolFrozenScope,
      reason: freezeState.analysisPoolFreezeReason,
      members: effectiveMembers,
    });

    await Promise.all([
      this.saveSystemConfig(ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY, freezeState),
      this.saveSystemConfig(FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY, snapshot),
    ]);

    return {
      promotedAt,
      frozenAnalysisPoolBatchId: batchId,
      requestedRepositoryCount: requestedRepositoryIds.length,
      addedRepositoryCount: addedRepositoryIds.length - unresolvedRepositoryIds.length,
      alreadyMemberCount: requestedRepositoryIds.length - addedRepositoryIds.length,
      unresolvedRepositoryCount: unresolvedRepositoryIds.length,
      totalRepositoryCount: snapshot.repositoryIds.length,
      addedRepositoryIds: addedRepositoryIds.filter(
        (repositoryId) => !unresolvedRepositoryIds.includes(repositoryId),
      ),
      unresolvedRepositoryIds,
    };
  }

  async buildFrozenAnalysisPoolDrainFinishReport(options?: {
    refresh?: boolean;
  }): Promise<FrozenAnalysisPoolDrainFinishResult> {
    const latest = await this.loadFrozenPoolDrainFinishResult();
    if (latest && options?.refresh !== true) {
      return latest;
    }
    return this.runPendingQueueDrainAndRepairFinishPass();
  }

  async buildDecisionRecalcFinishCompressionReport(options?: {
    refresh?: boolean;
  }): Promise<DecisionRecalcFinishCompressionResult> {
    const latest = await this.loadDecisionRecalcFinishCompressionResult();
    if (latest && options?.refresh !== true) {
      return latest;
    }
    return this.runDecisionRecalcFinishCompressionPass();
  }

  async runDecisionRecalcFinishCompressionPass(): Promise<DecisionRecalcFinishCompressionResult> {
    const generatedAt = new Date().toISOString();
    const now = new Date(generatedAt);
    const beforeBundle = await this.ensureFrozenAnalysisPoolSnapshot({
      forceRefresh: true,
    });
    const beforeMembers = beforeBundle.members ?? beforeBundle.snapshot.topMembers;
    const decisionRecalcMembers = beforeMembers.filter((member) =>
      member.analysisCompletionState === 'still_incomplete' &&
      member.historicalRepairAction === 'decision_recalc',
    );
    const memberMap = new Map(
      decisionRecalcMembers.map((member) => [member.repositoryId, member]),
    );
    const pendingJobsBefore = await this.loadFrozenPendingQueueJobs({
      memberMap,
      now,
    });
    this.markRedundantPendingJobs(pendingJobsBefore);
    this.applyPendingSuppressionPolicy(pendingJobsBefore);

    const gateSnapshot = await this.buildDecisionRecalcGateSnapshotForMembers(
      decisionRecalcMembers,
      generatedAt,
    );
    const gateSnapshotMap = buildDecisionRecalcGateSnapshotMap(gateSnapshot);
    const compressionItems = this.buildDecisionRecalcCompressionItems({
      members: decisionRecalcMembers,
      gateSnapshotMap,
      pendingRows: pendingJobsBefore,
    });
    const previousCompressionResult =
      await this.loadDecisionRecalcFinishCompressionResult();
    const keepRunningItems = compressionItems.filter(
      (item) => item.compressionClass === 'keep_running',
    );
    const promotedArchivedItems = compressionItems.filter(
      (item) => item.compressionClass === 'promote_archived',
    );
    const promotedDeletedItems = compressionItems.filter(
      (item) => item.compressionClass === 'promote_deleted',
    );
    const suppressedItems = compressionItems.filter(
      (item) => item.compressionClass === 'suppress_from_remaining',
    );
    const compressedItems = compressionItems.filter(
      (item) => item.compressionClass !== 'keep_running',
    );
    const nonKeepRepositoryIds = new Set(
      compressedItems.map((item) => item.repositoryId),
    );
    const pendingCancelOutcome = await this.cancelPendingJobsByRepositoryIds({
      rows: pendingJobsBefore,
      repositoryIds: nonKeepRepositoryIds,
      cancelSource: 'decision_recalc_finish_compression',
    });

    const deletedRepositoryIdSet = new Set(
      promotedDeletedItems.map((item) => item.repositoryId),
    );
    const deletableMembers = decisionRecalcMembers.filter((member) =>
      deletedRepositoryIdSet.has(member.repositoryId),
    );
    const { deletedItems } = await this.deleteFrozenPoolRepositories(
      deletableMembers,
      beforeBundle.snapshot.frozenAnalysisPoolBatchId,
      generatedAt,
    );
    const completionOverrides =
      await this.buildDecisionRecalcCompletionOverridesForBatch({
        batchId: beforeBundle.snapshot.frozenAnalysisPoolBatchId,
        generatedAt,
        currentItems: compressionItems,
        deletedRepositoryIds: new Set(
          deletedItems.map((item) => item.repositoryId),
        ),
      });
    const afterBundle = await this.ensureFrozenAnalysisPoolSnapshot({
      forceRefresh: true,
      completionOverrides,
    });
    const afterMembers = afterBundle.members ?? afterBundle.snapshot.topMembers;
    const afterMemberMap = new Map(
      afterMembers.map((member) => [member.repositoryId, member]),
    );

    const result: DecisionRecalcFinishCompressionResult = {
      generatedAt,
      freezeState: afterBundle.freezeState,
      frozenAnalysisPoolBatchId: afterBundle.snapshot.frozenAnalysisPoolBatchId,
      decisionRecalcRemainingBefore:
        beforeBundle.snapshot.summary.remainingActionBreakdown.decision_recalc ?? 0,
      decisionRecalcRemainingAfter:
        afterBundle.snapshot.summary.remainingActionBreakdown.decision_recalc ?? 0,
      frozenPoolRemainingBefore: beforeBundle.snapshot.summary.byQueueState.remaining,
      frozenPoolRemainingAfter: afterBundle.snapshot.summary.byQueueState.remaining,
      decisionRecalcRemainingShareAfter: this.computeDecisionRecalcRemainingShare(
        afterBundle.snapshot.summary.remainingActionBreakdown.decision_recalc ?? 0,
        afterBundle.snapshot.summary.byQueueState.remaining,
      ),
      decisionRecalcRemainingCount: compressionItems.length,
      decisionRecalcByGateDecision: this.countDecisionRecalcByGateDecision(
        compressionItems,
      ),
      decisionRecalcByHistoricalRepairBucket: this.countDecisionRecalcByProperty(
        compressionItems,
        (item) => item.historicalRepairBucket,
      ),
      decisionRecalcByValueTier: this.countDecisionRecalcByProperty(
        compressionItems,
        (item) => item.repositoryValueTier,
      ),
      decisionRecalcByMoneyPriority: this.countDecisionRecalcByProperty(
        compressionItems,
        (item) => item.moneyPriority ?? 'NONE',
        ['P0', 'P1', 'P2', 'P3', 'NONE'],
      ),
      decisionRecalcByVisibilityLevel: this.countDecisionRecalcByProperty(
        compressionItems,
        (item) => item.strictVisibilityLevel,
      ),
      decisionRecalcByCleanupState: this.countDecisionRecalcByProperty(
        compressionItems,
        (item) => item.cleanupState,
        ['active', 'freeze', 'archive', 'purge_ready'],
      ),
      decisionRecalcByAnalysisQualityState: this.countDecisionRecalcByProperty(
        compressionItems,
        (item) => item.analysisQualityState,
      ),
      decisionRecalcByTrustedBlockingGapPresence: this.countDecisionRecalcByProperty(
        compressionItems,
        (item) => (item.hasTrustedBlockingGaps ? 'present' : 'absent'),
        ['present', 'absent'],
      ),
      decisionRecalcByConflictType: this.countDecisionRecalcByConflictType(
        compressionItems,
      ),
      decisionRecalcByQueueStatus: this.countDecisionRecalcByProperty(
        compressionItems,
        (item) => item.queueStatus,
        ['pending', 'in_flight', 'no_queue'],
      ),
      decisionRecalcByWaitingDuration: this.countDecisionRecalcByProperty(
        compressionItems,
        (item) => item.waitingDurationBucket,
        ['lt_1h', 'h1_6', 'h6_24', 'd1_3', 'gt_3d', 'no_queue'],
      ),
      decisionRecalcSuppressibleCount: compressionItems.filter(
        (item) => item.suppressible,
      ).length,
      decisionRecalcArchivableCount: compressionItems.filter(
        (item) => item.archivable,
      ).length,
      decisionRecalcStillWorthRunningCount: compressionItems.filter(
        (item) => item.worthRunning,
      ).length,
      decisionRecalcCompressedCount: compressedItems.length,
      decisionRecalcKeptRunningCount: keepRunningItems.length,
      decisionRecalcPromotedArchivedCount: promotedArchivedItems.length,
      decisionRecalcPromotedDeletedCount: deletedItems.length,
      decisionRecalcSuppressedFromRemainingCount: suppressedItems.length,
      decisionRecalcRemovedFromPendingCount:
        this.countDecisionRecalcRemovedFromPending({
          compressedItems,
          afterMemberMap,
        }),
      decisionRecalcRemovedFromRepairRemainingCount:
        this.countDecisionRecalcRemovedFromRepairRemaining({
          compressedItems,
          afterMemberMap,
        }),
      queueCancelledJobCount: pendingCancelOutcome.cancelledJobCount,
      queueCancelledRepositoryCount: pendingCancelOutcome.cancelledRepositoryCount,
      archivedRepositoryIds: promotedArchivedItems.map((item) => item.repositoryId),
      deletedRepositoryIds: deletedItems.map((item) => item.repositoryId),
      suppressedRepositoryIds: suppressedItems.map((item) => item.repositoryId),
      keepRunningRepositoryIds: keepRunningItems.map((item) => item.repositoryId),
      topRemainingPrimaryReasonsAfter: this.pickTopReasonCounts(
        afterBundle.snapshot.summary.remainingPrimaryReasonBreakdown,
      ),
      topRemainingActionsAfter: this.pickTopActionCounts(
        afterBundle.snapshot.summary.remainingActionBreakdown,
      ),
      hardestActionAfter: this.pickTopEntry(
        afterBundle.snapshot.summary.remainingActionBreakdown,
      ),
      mostWorthContinuingConflictTypes: this.pickTopConflictTypes(
        keepRunningItems,
      ),
      mostCompressibleConflictTypes: this.pickTopConflictTypes(compressedItems),
      items: compressionItems,
      persistedCompletionOverrideItems: this.mergePersistedCompletionOverrideItems({
        previousResult: previousCompressionResult,
        currentItems: compressionItems,
        deletedRepositoryIds: new Set(deletedItems.map((item) => item.repositoryId)),
      }),
      keptRunningSamples: this.pickDecisionRecalcSamples(keepRunningItems),
      promotedArchivedSamples: this.pickDecisionRecalcSamples(promotedArchivedItems),
      promotedDeletedSamples: this.pickDecisionRecalcSamples(promotedDeletedItems),
      suppressedFromRemainingSamples: this.pickDecisionRecalcSamples(
        suppressedItems,
      ),
    };

    await this.saveSystemConfig(
      FROZEN_ANALYSIS_POOL_DECISION_RECALC_COMPRESSION_CONFIG_KEY,
      result,
    );
    return result;
  }

  async runPendingQueueDrainAndRepairFinishPass(options?: {
    p0Limit?: number;
    p1Limit?: number;
    p2Limit?: number;
  }): Promise<FrozenAnalysisPoolDrainFinishResult> {
    const generatedAt = new Date().toISOString();
    const now = new Date(generatedAt);
    const previousCompletion = await this.loadFrozenPoolCompletionResult();
    const beforeBundle = await this.ensureFrozenAnalysisPoolSnapshot({
      forceRefresh: true,
    });
    const beforeMembers = beforeBundle.members ?? beforeBundle.snapshot.topMembers;
    const memberMap = new Map(
      beforeMembers.map((member) => [member.repositoryId, member]),
    );
    const pendingJobsBefore = await this.loadFrozenPendingQueueJobs({
      memberMap,
      now,
    });
    this.markRedundantPendingJobs(pendingJobsBefore);
    this.applyPendingSuppressionPolicy(pendingJobsBefore);
    const decisionRecalcPreviewItems =
      await this.buildDecisionRecalcCompressionItemsForMembers({
        members: beforeMembers,
        generatedAt,
        pendingRows: pendingJobsBefore,
      });
    const pendingInventory = this.buildPendingInventory({
      members: beforeMembers,
      pendingRows: pendingJobsBefore,
      decisionRecalcCompressionItems: decisionRecalcPreviewItems,
    });
    const pendingQueueBreakdown = this.buildPendingQueueBreakdown(pendingJobsBefore);
    const pendingQueueHighPriorityCount = pendingJobsBefore.filter(
      (job) => job.drainPriorityClass === 'P0',
    ).length;
    const pendingQueueLowROIStaleCount = pendingJobsBefore.filter(
      (job) => job.lowRoiStale,
    ).length;
    const pendingQueueSuppressibleCount = pendingJobsBefore.filter(
      (job) => job.suppressible,
    ).length;
    const pendingQueueReplayRiskCount = pendingJobsBefore.filter(
      (job) => job.replayRisk,
    ).length;
    const pendingQueueRedundantCount = pendingJobsBefore.filter(
      (job) => job.redundant,
    ).length;
    const pendingCancelOutcome = await this.cancelPendingQueueJobs(pendingJobsBefore);

    const midBundle = await this.ensureFrozenAnalysisPoolSnapshot({
      forceRefresh: true,
    });
    const midMembers = midBundle.members ?? midBundle.snapshot.topMembers;
    const finishTargets = this.selectDrainFinishTargets(midMembers, options);
    const repairRunResult =
      finishTargets.length > 0
        ? await this.historicalDataRecoveryService.runHistoricalRepairLoop({
            repositoryIds: finishTargets,
            limit: finishTargets.length,
            dryRun: false,
            minPriorityScore: 0,
          })
        : null;
    await this.runFrozenPoolCompletionPass();
    const decisionRecalcCompressionResult =
      await this.runDecisionRecalcFinishCompressionPass();
    const completionResult = await this.runFrozenPoolCompletionPass();
    const afterBundle = await this.ensureFrozenAnalysisPoolSnapshot({
      forceRefresh: true,
    });
    const afterMembers = afterBundle.members ?? afterBundle.snapshot.topMembers;
    const afterMemberMap = new Map(
      afterMembers.map((member) => [member.repositoryId, member]),
    );
    const pendingJobsAfter = await this.loadFrozenPendingQueueJobs({
      memberMap: afterMemberMap,
      now: new Date(),
    });
    this.markRedundantPendingJobs(pendingJobsAfter);
    this.applyPendingSuppressionPolicy(pendingJobsAfter);

    const beforeCompletedUseful =
      beforeBundle.snapshot.summary.byCompletionState.completed_useful;
    const beforeCompletedArchived =
      beforeBundle.snapshot.summary.byCompletionState.completed_not_useful_archived;
    const beforeCompletedDeleted =
      previousCompletion?.deletedItems.length ?? 0;
    const afterCompletedUseful = completionResult.frozenPoolCompletedUsefulCount;
    const afterCompletedArchived = completionResult.frozenPoolCompletedArchivedCount;
    const afterCompletedDeleted = completionResult.frozenPoolCompletedDeletedCount;
    const completedUsefulAddedCount = Math.max(
      afterCompletedUseful - beforeCompletedUseful,
      0,
    );
    const completedArchivedAddedCount = Math.max(
      afterCompletedArchived - beforeCompletedArchived,
      0,
    );
    const completedDeletedAddedCount = Math.max(
      afterCompletedDeleted - beforeCompletedDeleted,
      0,
    );

    const beforeRepairRemaining =
      beforeBundle.snapshot.summary.remainingPrimaryReasonBreakdown
        .repair_action_remaining ?? 0;
    const afterRepairRemaining =
      afterBundle.snapshot.summary.remainingPrimaryReasonBreakdown
        .repair_action_remaining ?? 0;
    const repairActionRemainingReducedCount = Math.max(
      beforeRepairRemaining - afterRepairRemaining,
      0,
    );
    const decisionRecalcFinishSummary = this.buildActionFinishSummary({
      action: 'decision_recalc',
      selectedCount: finishTargets.length,
      runResult: repairRunResult,
      replayGateEnforced: true,
      hardenedAfterStateEnabled: false,
    });
    const deepRepairFinishSummary = this.buildActionFinishSummary({
      action: 'deep_repair',
      selectedCount: finishTargets.length,
      runResult: repairRunResult,
      replayGateEnforced: false,
      hardenedAfterStateEnabled: true,
    });
    const evidenceRepairFinishSummary = this.buildActionFinishSummary({
      action: 'evidence_repair',
      selectedCount: finishTargets.length,
      runResult: repairRunResult,
      replayGateEnforced: false,
      hardenedAfterStateEnabled: false,
    });
    const repairFinishBreakdown = this.buildRepairFinishBreakdown({
      runResult: repairRunResult,
      completionResult,
    });
    const topRemainingPrimaryReasons = this.pickTopReasonCounts(
      afterBundle.snapshot.summary.remainingPrimaryReasonBreakdown,
    );
    const topRemainingActions = this.pickTopActionCounts(
      afterBundle.snapshot.summary.remainingActionBreakdown,
    );
    const hardestAction = this.pickTopEntry(
      afterBundle.snapshot.summary.remainingActionBreakdown,
    );
    const mostNoChangeAction = repairRunResult
      ? this.pickTopEntry(
          Object.fromEntries(
            Object.entries(
              repairRunResult.analysisOutcomeSummary.actionOutcomeStatusBreakdown,
            ).map(([action, breakdown]) => [
              action,
              Number(breakdown.no_change ?? 0),
            ]),
          ),
        )
      : null;
    const mostWorthContinuingAction = this.pickTopEntry(
      this.countPendingInventoryActions(pendingInventory, 'worthRunning'),
    );
    const mostCompressibleAction = this.pickTopEntry(
      this.countPendingInventoryActions(pendingInventory, 'compressible'),
    );
    const retainedDeleteReasonBreakdown = completionResult.retainedDeleteCandidates
      .flatMap((item) => item.deleteReason)
      .reduce<Record<string, number>>((acc, reason) => {
        acc[reason] = (acc[reason] ?? 0) + 1;
        return acc;
      }, {});

    const result: FrozenAnalysisPoolDrainFinishResult = {
      generatedAt,
      freezeState: afterBundle.freezeState,
      frozenAnalysisPoolBatchId: afterBundle.snapshot.frozenAnalysisPoolBatchId,
      pendingQueueBreakdown,
      pendingInventory,
      pendingQueueHighPriorityCount,
      pendingQueueLowROIStaleCount,
      pendingQueueSuppressibleCount,
      pendingQueueReplayRiskCount,
      pendingQueueRedundantCount,
      pendingDrainedCount: Math.max(
        pendingJobsBefore.length - pendingJobsAfter.length,
          pendingCancelOutcome.suppressedCount +
          pendingCancelOutcome.redundantCount +
          finishTargets.length,
      ),
      pendingExecutedCount: finishTargets.length,
      pendingSuppressedCount:
        pendingCancelOutcome.suppressedCount +
        decisionRecalcCompressionResult.queueCancelledJobCount,
      pendingCancelledRedundantCount: pendingCancelOutcome.redundantCount,
      pendingPromotedToCompletedCount:
        completedUsefulAddedCount + completedArchivedAddedCount,
      pendingPromotedToArchivedCount: completedArchivedAddedCount,
      pendingPromotedToDeletedCount: completedDeletedAddedCount,
      pendingStillRemainingCount: pendingJobsAfter.length,
      decisionRecalcRemainingBefore:
        decisionRecalcCompressionResult.decisionRecalcRemainingBefore,
      decisionRecalcRemainingAfter:
        decisionRecalcCompressionResult.decisionRecalcRemainingAfter,
      decisionRecalcCompressedCount:
        decisionRecalcCompressionResult.decisionRecalcCompressedCount,
      decisionRecalcKeptRunningCount:
        decisionRecalcCompressionResult.decisionRecalcKeptRunningCount,
      decisionRecalcPromotedArchivedCount:
        decisionRecalcCompressionResult.decisionRecalcPromotedArchivedCount,
      decisionRecalcPromotedDeletedCount:
        decisionRecalcCompressionResult.decisionRecalcPromotedDeletedCount,
      decisionRecalcSuppressedFromRemainingCount:
        decisionRecalcCompressionResult.decisionRecalcSuppressedFromRemainingCount,
      decisionRecalcRemovedFromPendingCount:
        decisionRecalcCompressionResult.decisionRecalcRemovedFromPendingCount,
      decisionRecalcRemovedFromRepairRemainingCount:
        decisionRecalcCompressionResult.decisionRecalcRemovedFromRepairRemainingCount,
      decisionRecalcStillWorthRunningCount:
        decisionRecalcCompressionResult.decisionRecalcStillWorthRunningCount,
      repairFinishBreakdown,
      decisionRecalcFinishSummary,
      deepRepairFinishSummary,
      evidenceRepairFinishSummary,
      repairActionRemainingReducedCount,
      completedUsefulAddedCount,
      completedArchivedAddedCount,
      completedDeletedAddedCount,
      retainedDeleteCandidateCount: completionResult.retainedDeleteCandidates.length,
      retainedDeleteReasonBreakdown,
      frozenPoolRemainingCount: completionResult.frozenPoolRemainingCount,
      frozenPoolCompletedUsefulCount: completionResult.frozenPoolCompletedUsefulCount,
      frozenPoolCompletedArchivedCount:
        completionResult.frozenPoolCompletedArchivedCount,
      frozenPoolCompletedDeletedCount: completionResult.frozenPoolCompletedDeletedCount,
      frozenPoolRemainingBefore: beforeBundle.snapshot.summary.byQueueState.remaining,
      frozenPoolRemainingAfter: afterBundle.snapshot.summary.byQueueState.remaining,
      topRemainingPrimaryReasons,
      topRemainingActions,
      hardestAction,
      mostNoChangeAction,
      mostWorthContinuingAction,
      mostCompressibleAction,
      mostWorthContinuingConflictTypes:
        decisionRecalcCompressionResult.mostWorthContinuingConflictTypes,
      mostCompressibleConflictTypes:
        decisionRecalcCompressionResult.mostCompressibleConflictTypes,
      pendingAuditSamples: pendingJobsBefore.slice(0, 60).map((job) =>
        this.toPendingAuditSample(job),
      ),
      completedUsefulSamples: completionResult.topCompletedUseful.slice(0, 20),
      completedArchivedSamples: completionResult.topArchived.slice(0, 20),
      completedDeletedSamples: completionResult.deletedItems.slice(-20),
      remainingSamples: completionResult.topRemaining.slice(0, 20),
      runSummary: {
        selectedCount: repairRunResult?.selectedCount ?? 0,
        execution: repairRunResult?.execution ?? null,
        queueSummary: repairRunResult?.queueSummary ?? null,
        analysisOutcomeSummary: repairRunResult
          ? {
              outcomeStatusBreakdown:
                repairRunResult.analysisOutcomeSummary.outcomeStatusBreakdown,
              repairValueClassBreakdown:
                repairRunResult.analysisOutcomeSummary.repairValueClassBreakdown,
              actionOutcomeStatusBreakdown:
                repairRunResult.analysisOutcomeSummary.actionOutcomeStatusBreakdown,
              actionRepairValueClassBreakdown:
                repairRunResult.analysisOutcomeSummary.actionRepairValueClassBreakdown,
              qualityDeltaSummary: {
                totalDelta:
                  repairRunResult.analysisOutcomeSummary.qualityDeltaSummary
                    .totalDelta,
                averageDelta:
                  repairRunResult.analysisOutcomeSummary.qualityDeltaSummary
                    .averageDelta,
                positiveCount:
                  repairRunResult.analysisOutcomeSummary.qualityDeltaSummary
                    .positiveCount,
                negativeCount:
                  repairRunResult.analysisOutcomeSummary.qualityDeltaSummary
                    .negativeCount,
                zeroCount:
                  repairRunResult.analysisOutcomeSummary.qualityDeltaSummary
                    .zeroCount,
              },
              trustedChangedCount:
                repairRunResult.analysisOutcomeSummary.trustedChangedCount,
              decisionChangedCount:
                repairRunResult.analysisOutcomeSummary.decisionChangedCount,
              fallbackUsedCount:
                repairRunResult.analysisOutcomeSummary.fallbackUsedCount,
              reviewUsedCount:
                repairRunResult.analysisOutcomeSummary.reviewUsedCount,
              skippedByCleanupCount:
                repairRunResult.analysisOutcomeSummary.skippedByCleanupCount,
            }
          : null,
      },
    };

    await this.saveSystemConfig(FROZEN_ANALYSIS_POOL_DRAIN_FINISH_CONFIG_KEY, result);
    return result;
  }

  async runFrozenPoolDrain(): Promise<FrozenAnalysisPoolDrainResult> {
    const generatedAt = new Date().toISOString();
    let stateBundle = await this.ensureFrozenAnalysisPoolSnapshot();
    if (
      !stateBundle.snapshot.drainCandidates.modelARepositoryIds.length &&
      !stateBundle.snapshot.drainCandidates.modelBRepositoryIds.length &&
      !stateBundle.snapshot.drainCandidates.deleteCandidateRepositoryIds.length
    ) {
      stateBundle = await this.ensureFrozenAnalysisPoolSnapshot({
        forceRefresh: true,
      });
    }
    const modelAssignment = await this.resolveModelAssignment();
    const intakeQueueSuppressedCount = await this.cancelPendingIntakeJobs();

    const deleteCandidateIds =
      stateBundle.snapshot.drainCandidates.deleteCandidateRepositoryIds;
    const initialMembers = await this.loadFrozenPoolMembers(
      [
        ...stateBundle.snapshot.drainCandidates.modelARepositoryIds,
        ...stateBundle.snapshot.drainCandidates.modelBRepositoryIds,
        ...deleteCandidateIds,
      ],
      stateBundle.snapshot.frozenAnalysisPoolBatchId,
      stateBundle.snapshot.frozenAnalysisPoolSnapshotAt,
    );
    const deleteCandidates = initialMembers.filter(
      (member) =>
        member.deleteCandidate &&
        deleteCandidateIds.includes(member.repositoryId),
    );
    const deletable = deleteCandidates.filter((member) => member.runningJobs === 0);
    const { deletedItems, deleteSuppressedQueueCount } =
      await this.deleteFrozenPoolRepositories(
        deletable,
        stateBundle.snapshot.frozenAnalysisPoolBatchId,
        generatedAt,
      );
    const deletedIds = new Set(deletedItems.map((item) => item.repositoryId));
    const drainRepositoryIds = [
      ...stateBundle.snapshot.drainCandidates.modelARepositoryIds,
      ...stateBundle.snapshot.drainCandidates.modelBRepositoryIds,
    ].filter((repositoryId) => !deletedIds.has(repositoryId));

    const repairRun = drainRepositoryIds.length
      ? await this.historicalDataRecoveryService.runHistoricalRepairLoop({
          repositoryIds: drainRepositoryIds,
          limit: drainRepositoryIds.length,
          dryRun: false,
        })
      : null;
    const snapshotAfterDelete =
      deletedIds.size > 0
        ? (
            await this.ensureFrozenAnalysisPoolSnapshot({
              forceRefresh: true,
            })
          ).snapshot
        : stateBundle.snapshot;
    const postDrainMembers = await this.loadFrozenPoolMembers(
      drainRepositoryIds,
      stateBundle.snapshot.frozenAnalysisPoolBatchId,
      stateBundle.snapshot.frozenAnalysisPoolSnapshotAt,
    );

    const result = buildFrozenAnalysisPoolDrainResult({
      generatedAt,
      freezeState: stateBundle.freezeState,
      batchId: stateBundle.snapshot.frozenAnalysisPoolBatchId,
      modelAssignment,
      intakeQueueSuppressedCount,
      removedFromActivePoolCount: deletedItems.length,
      deletedFromRepositoryStoreCount: deletedItems.length,
      deleteSuppressedQueueCount,
      totalExecuted:
        (repairRun?.execution.refreshOnly ?? 0) +
        (repairRun?.execution.evidenceRepair ?? 0) +
        (repairRun?.execution.deepRepair ?? 0) +
        (repairRun?.execution.decisionRecalc ?? 0) +
        deletedItems.length,
      modelAExecutedCount:
        (repairRun?.execution.refreshOnly ?? 0) +
        (repairRun?.execution.evidenceRepair ?? 0),
      modelBExecutedCount:
        (repairRun?.execution.deepRepair ?? 0) +
        (repairRun?.execution.decisionRecalc ?? 0),
      snapshot: snapshotAfterDelete,
      members: postDrainMembers,
      queueSummary: {
        totalQueued: repairRun?.queueSummary.totalQueued ?? 0,
        actionCounts: repairRun?.queueSummary.actionCounts ?? {
          downgrade_only: 0,
          refresh_only: 0,
          evidence_repair: 0,
          deep_repair: 0,
          decision_recalc: 0,
        },
      },
      deletedItems,
    });

    await this.saveSystemConfig(FROZEN_ANALYSIS_POOL_DRAIN_CONFIG_KEY, result);
    return result;
  }

  async runFrozenPoolCompletionPass(): Promise<FrozenAnalysisPoolCompletionPassResult> {
    const generatedAt = new Date().toISOString();
    const previousResult = await this.loadFrozenPoolCompletionResult();
    const beforeBundle = await this.ensureFrozenAnalysisPoolSnapshot({
      forceRefresh: true,
    });
    const beforeMembers = beforeBundle.members ?? beforeBundle.snapshot.topMembers;
    await this.cleanupArchivedAndPurgeReadyMembers({
      members: beforeMembers,
      batchId: beforeBundle.snapshot.frozenAnalysisPoolBatchId,
      cleanedAt: generatedAt,
    });
    const deleteCandidates = beforeMembers.filter((member) => member.deleteCandidate);
    const retainedDeleteCandidates: FrozenAnalysisPoolRetainedDeleteCandidate[] = [];
    const deletableMembers: FrozenAnalysisPoolMember[] = [];

    for (const member of deleteCandidates) {
      if (member.runningJobs > 0 || member.pendingJobs > 0) {
        retainedDeleteCandidates.push(
          buildFrozenAnalysisPoolRetainedDeleteCandidate({
            member,
          }),
        );
        continue;
      }
      deletableMembers.push(member);
    }

    const { deletedItems: newlyDeletedItems, deleteSuppressedQueueCount } =
      await this.deleteFrozenPoolRepositories(
        deletableMembers,
        beforeBundle.snapshot.frozenAnalysisPoolBatchId,
        generatedAt,
      );

    const afterBundle = await this.ensureFrozenAnalysisPoolSnapshot({
      forceRefresh: true,
    });
    const currentMembers = afterBundle.members ?? afterBundle.snapshot.topMembers;
    const cumulativeDeletedItems = this.mergeDeletedItems(
      previousResult?.deletedItems ?? [],
      newlyDeletedItems,
    );
    const latestDrain = await this.loadLatestFrozenPoolDrainSummary();
    const result = buildFrozenAnalysisPoolCompletionPassResult({
      generatedAt,
      freezeState: afterBundle.freezeState,
      batchId: afterBundle.snapshot.frozenAnalysisPoolBatchId,
      snapshotAt: afterBundle.snapshot.frozenAnalysisPoolSnapshotAt,
      startingBatchPoolSize:
        previousResult?.startingBatchPoolSize ??
        beforeBundle.snapshot.summary.totalPoolSize,
      beforeMembers,
      currentSnapshot: afterBundle.snapshot,
      currentMembers,
      deletedItems: cumulativeDeletedItems,
      retainedDeleteCandidates,
      deleteSuppressedQueueCount,
      latestDrain,
    });

    await this.saveSystemConfig(
      FROZEN_ANALYSIS_POOL_COMPLETION_CONFIG_KEY,
      result,
    );
    return result;
  }

  async getFrozenAnalysisPoolState() {
    return this.loadFreezeStateBundle();
  }

  private async buildDecisionRecalcGateSnapshotForMembers(
    members: FrozenAnalysisPoolMember[],
    generatedAt: string,
  ) {
    if (!members.length) {
      return buildDecisionRecalcGateSnapshot({
        items: [],
        previousSnapshotMap: null,
        generatedAt,
      });
    }

    const previousSnapshot = await this.loadDecisionRecalcGateSnapshot();
    const currentReport = await this.historicalRepairPriorityService.runPriorityReport({
      repositoryIds: members.map((member) => member.repositoryId),
    });
    const reportItemMap = new Map(
      currentReport.items.map((item) => [item.repoId, item]),
    );
    const gateItems = members
      .map((member) => reportItemMap.get(member.repositoryId))
      .filter(Boolean) as HistoricalRepairPriorityItem[];

    return buildDecisionRecalcGateSnapshot({
      items: gateItems,
      previousSnapshotMap: buildDecisionRecalcGateSnapshotMap(previousSnapshot),
      generatedAt,
    });
  }

  private async buildDecisionRecalcCompressionItemsForMembers(args: {
    members: FrozenAnalysisPoolMember[];
    generatedAt: string;
    pendingRows: FrozenPendingQueueJob[];
  }) {
    const decisionRecalcMembers = args.members.filter(
      (member) =>
        member.analysisCompletionState === 'still_incomplete' &&
        member.historicalRepairAction === 'decision_recalc',
    );
    const gateSnapshot = await this.buildDecisionRecalcGateSnapshotForMembers(
      decisionRecalcMembers,
      args.generatedAt,
    );
    const gateSnapshotMap = buildDecisionRecalcGateSnapshotMap(gateSnapshot);
    return this.buildDecisionRecalcCompressionItems({
      members: decisionRecalcMembers,
      gateSnapshotMap,
      pendingRows: args.pendingRows.filter(
        (row) => row.historicalRepairAction === 'decision_recalc',
      ),
    });
  }

  private buildDecisionRecalcCompressionItems(args: {
    members: FrozenAnalysisPoolMember[];
    gateSnapshotMap: Map<string, DecisionRecalcGateSnapshot['items'][number]>;
    pendingRows: FrozenPendingQueueJob[];
  }) {
    const pendingByRepository = new Map<string, FrozenPendingQueueJob[]>();
    for (const row of args.pendingRows) {
      const list = pendingByRepository.get(row.repositoryId) ?? [];
      list.push(row);
      pendingByRepository.set(row.repositoryId, list);
    }

    return this.sortDecisionRecalcItems(
      args.members.map((member) => {
        const gate = args.gateSnapshotMap.get(member.repositoryId);
        const pendingRows = pendingByRepository.get(member.repositoryId) ?? [];
        const longestPendingHours = pendingRows.length
          ? Math.max(...pendingRows.map((row) => row.waitingDurationHours))
          : null;
        const redundantPendingJobCount = pendingRows.filter(
          (row) => row.redundant,
        ).length;
        const stalePendingJobCount = pendingRows.filter(
          (row) =>
            row.lowRoiStale ||
            row.waitingDurationBucket === 'd1_3' ||
            row.waitingDurationBucket === 'gt_3d',
        ).length;
        const item = buildDecisionRecalcCompressionItem({
          member,
          gateDecision: gate?.recalcGateDecision ?? 'missing_gate_snapshot',
          gateReason: gate?.recalcGateReason ?? null,
          queueStatus: resolveDecisionRecalcQueueStatus(member),
          waitingDurationHours: longestPendingHours,
          waitingDurationBucket:
            resolveDecisionRecalcWaitingDurationBucket(longestPendingHours),
          redundantPendingJobCount,
          stalePendingJobCount,
        });
        item.queueState = {
          pendingJobs: member.pendingJobs,
          runningJobs: member.runningJobs,
          pendingJobIds: [...new Set(pendingRows.map((row) => row.jobId))],
          runningJobIds: [],
        };
        return item;
      }),
    );
  }

  private buildPendingInventory(args: {
    members: FrozenAnalysisPoolMember[];
    pendingRows: FrozenPendingQueueJob[];
    decisionRecalcCompressionItems: DecisionRecalcCompressionItem[];
  }): FrozenAnalysisPoolPendingInventory {
    const pendingByRepository = new Map<string, FrozenPendingQueueJob[]>();
    for (const row of args.pendingRows) {
      const list = pendingByRepository.get(row.repositoryId) ?? [];
      list.push(row);
      pendingByRepository.set(row.repositoryId, list);
    }
    const decisionRecalcMap = new Map(
      args.decisionRecalcCompressionItems.map((item) => [item.repositoryId, item]),
    );
    const items = args.members
      .filter((member) => member.analysisCompletionState === 'still_incomplete')
      .map((member) => {
        const pendingRows = pendingByRepository.get(member.repositoryId) ?? [];
        const decisionRecalcItem = decisionRecalcMap.get(member.repositoryId) ?? null;
        return this.buildPendingInventorySample({
          member,
          pendingRows,
          decisionRecalcItem,
        });
      });

    const inventory: FrozenAnalysisPoolPendingInventory = {
      totalCurrentRemainingCount: items.length,
      byAction: {},
      worthRunningByAction: {},
      compressibleByAction: {},
      byQueueStatus: {
        pending: 0,
        in_flight: 0,
        no_queue: 0,
      },
      byValueClass: {
        high_value: 0,
        medium_value: 0,
        low_value: 0,
      },
      byVisibilityClass: {
        high_visibility: 0,
        low_visibility: 0,
      },
      byCleanupState: {
        active: 0,
        freeze: 0,
        archive: 0,
        purge_ready: 0,
      },
      byConflictType: {
        user_conflict: 0,
        monetization_conflict: 0,
        execution_conflict: 0,
        market_conflict: 0,
        problem_conflict: 0,
      },
      byWaitingDuration: {
        lt_1h: 0,
        h1_6: 0,
        h6_24: 0,
        d1_3: 0,
        gt_3d: 0,
        no_queue: 0,
        in_flight: 0,
      },
      worthRunningCount: 0,
      lowRoiArchivableCount: 0,
      replayOrRedundantCount: 0,
      priorityDrainCount: 0,
      worthRunningSamples: [],
      archiveCandidateSamples: [],
      replayOrRedundantSamples: [],
      priorityDrainSamples: [],
      longestWaitingSamples: [],
    };

    for (const item of items) {
      inventory.byAction[item.historicalRepairAction] =
        (inventory.byAction[item.historicalRepairAction] ?? 0) + 1;
      inventory.byQueueStatus[item.queueStatus] += 1;
      inventory.byValueClass[item.valueClass] += 1;
      inventory.byVisibilityClass[item.visibilityClass] += 1;
      inventory.byCleanupState[item.cleanupState] += 1;
      inventory.byWaitingDuration[item.waitingDurationBucket] += 1;
      for (const conflictType of item.conflictTypes) {
        inventory.byConflictType[conflictType] =
          (inventory.byConflictType[conflictType] ?? 0) + 1;
      }
      if (item.worthRunning) {
        inventory.worthRunningCount += 1;
        inventory.worthRunningByAction[item.historicalRepairAction] =
          (inventory.worthRunningByAction[item.historicalRepairAction] ?? 0) + 1;
      }
      if (item.archivable) {
        inventory.lowRoiArchivableCount += 1;
      }
      if (item.replayOrRedundant) {
        inventory.replayOrRedundantCount += 1;
      }
      if (item.archivable || item.replayOrRedundant || item.suppressible) {
        inventory.compressibleByAction[item.historicalRepairAction] =
          (inventory.compressibleByAction[item.historicalRepairAction] ?? 0) + 1;
      }
      if (item.priorityDrainCandidate) {
        inventory.priorityDrainCount += 1;
      }
    }

    inventory.worthRunningSamples = this.pickPendingInventorySamples(
      items.filter((item) => item.worthRunning),
    );
    inventory.archiveCandidateSamples = this.pickPendingInventorySamples(
      items.filter((item) => item.archivable),
    );
    inventory.replayOrRedundantSamples = this.pickPendingInventorySamples(
      items.filter((item) => item.replayOrRedundant || item.suppressible),
    );
    inventory.priorityDrainSamples = this.pickPendingInventorySamples(
      items.filter((item) => item.priorityDrainCandidate),
    );
    inventory.longestWaitingSamples = [...items]
      .filter((item) => typeof item.waitingDurationHours === 'number')
      .sort(
        (left, right) =>
          Number(right.waitingDurationHours ?? 0) -
          Number(left.waitingDurationHours ?? 0),
      )
      .slice(0, 20);

    return inventory;
  }

  private buildPendingInventorySample(args: {
    member: FrozenAnalysisPoolMember;
    pendingRows: FrozenPendingQueueJob[];
    decisionRecalcItem: DecisionRecalcCompressionItem | null;
  }): FrozenAnalysisPoolPendingInventorySample {
    const queueStatus = this.resolvePendingInventoryQueueStatus(args.member);
    const longestWaitingDurationHours = args.pendingRows.length
      ? Math.max(...args.pendingRows.map((row) => row.waitingDurationHours))
      : null;
    const waitingDurationBucket =
      queueStatus === 'pending'
        ? resolveDecisionRecalcWaitingDurationBucket(longestWaitingDurationHours)
        : queueStatus === 'in_flight'
          ? 'in_flight'
          : 'no_queue';
    const valueClass = this.resolvePendingValueClass(args.member);
    const visibilityClass = this.resolvePendingVisibilityClass(args.member);
    const conflictTypes =
      args.decisionRecalcItem?.conflictTypes ?? deriveDecisionRecalcConflictTypes(args.member);
    const lowQuality =
      args.member.analysisQualityState === 'LOW' ||
      args.member.analysisQualityState === 'CRITICAL';
    const archiveBucket =
      args.member.historicalRepairBucket === 'archive_or_noise';
    const genericArchivable = Boolean(
      args.member.cleanupState !== 'active' ||
        archiveBucket ||
        (valueClass === 'low_value' &&
          visibilityClass === 'low_visibility' &&
          lowQuality),
    );
    const genericWorthRunning = Boolean(
      queueStatus === 'in_flight' ||
        (args.member.cleanupState === 'active' &&
          !genericArchivable &&
          (valueClass !== 'low_value' ||
            visibilityClass === 'high_visibility' ||
            conflictTypes.some((type) =>
              ['user_conflict', 'monetization_conflict', 'execution_conflict'].includes(
                type,
              ),
            ) ||
            args.member.trustedBlockingGaps.length > 0)),
    );
    const replayOrRedundant = args.pendingRows.some(
      (row) => row.replayRisk || row.redundant,
    );
    const suppressibleFromRows = args.pendingRows.some(
      (row) => row.suppressible || row.redundant,
    );
    const archivable =
      args.decisionRecalcItem?.compressionClass === 'promote_archived' ||
      args.decisionRecalcItem?.compressionClass === 'promote_deleted' ||
      args.decisionRecalcItem?.archivable === true ||
      genericArchivable;
    const worthRunning =
      args.decisionRecalcItem?.compressionClass === 'keep_running' ||
      (args.decisionRecalcItem
        ? args.decisionRecalcItem.worthRunning
        : genericWorthRunning);
    const suppressible =
      (args.decisionRecalcItem
        ? args.decisionRecalcItem.compressionClass !== 'keep_running'
        : false) || suppressibleFromRows;
    const drainPriorityClass = classifyFrozenAnalysisPoolDrainPriority(args.member);
    const priorityDrainCandidate = Boolean(
      queueStatus === 'pending' &&
        worthRunning &&
        (drainPriorityClass === 'P0' || drainPriorityClass === 'P1'),
    );

    return {
      repositoryId: args.member.repositoryId,
      fullName: args.member.fullName,
      historicalRepairAction: args.member.historicalRepairAction,
      queueStatus,
      drainPriorityClass,
      repositoryValueTier: args.member.repositoryValueTier,
      valueClass,
      strictVisibilityLevel: args.member.strictVisibilityLevel,
      visibilityClass,
      cleanupState: args.member.cleanupState,
      historicalRepairBucket: args.member.historicalRepairBucket,
      analysisQualityState: args.member.analysisQualityState,
      moneyPriority: args.member.moneyPriority,
      waitingDurationHours:
        queueStatus === 'pending' ? longestWaitingDurationHours : null,
      waitingDurationBucket,
      conflictTypes,
      hasTrustedBlockingGaps: args.member.trustedBlockingGaps.length > 0,
      worthRunning,
      archivable,
      suppressible,
      replayOrRedundant,
      priorityDrainCandidate,
    };
  }

  private resolvePendingInventoryQueueStatus(
    member: Pick<FrozenAnalysisPoolMember, 'pendingJobs' | 'runningJobs'>,
  ): FrozenAnalysisPoolPendingQueueStatus {
    if (member.runningJobs > 0) {
      return 'in_flight';
    }
    if (member.pendingJobs > 0) {
      return 'pending';
    }
    return 'no_queue';
  }

  private resolvePendingValueClass(
    member: Pick<FrozenAnalysisPoolMember, 'repositoryValueTier' | 'moneyPriority'>,
  ) {
    if (
      member.repositoryValueTier === 'HIGH' ||
      member.moneyPriority === 'P0' ||
      member.moneyPriority === 'P1'
    ) {
      return 'high_value' as const;
    }
    if (
      member.repositoryValueTier === 'MEDIUM' ||
      member.moneyPriority === 'P2'
    ) {
      return 'medium_value' as const;
    }
    return 'low_value' as const;
  }

  private resolvePendingVisibilityClass(
    member: Pick<FrozenAnalysisPoolMember, 'strictVisibilityLevel'>,
  ) {
    if (
      member.strictVisibilityLevel === 'HOME' ||
      member.strictVisibilityLevel === 'FAVORITES' ||
      member.strictVisibilityLevel === 'DAILY_SUMMARY'
    ) {
      return 'high_visibility' as const;
    }
    return 'low_visibility' as const;
  }

  private pickPendingInventorySamples(
    items: FrozenAnalysisPoolPendingInventorySample[],
  ) {
    return [...items]
      .sort((left, right) => {
        const leftPriority = this.priorityClassRank(left.drainPriorityClass);
        const rightPriority = this.priorityClassRank(right.drainPriorityClass);
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        const leftWait = Number(left.waitingDurationHours ?? -1);
        const rightWait = Number(right.waitingDurationHours ?? -1);
        if (leftWait !== rightWait) {
          return rightWait - leftWait;
        }
        return left.fullName.localeCompare(right.fullName);
      })
      .slice(0, 20);
  }

  private countPendingInventoryActions(
    inventory: FrozenAnalysisPoolPendingInventory,
    mode: 'worthRunning' | 'compressible',
  ) {
    return mode === 'worthRunning'
      ? inventory.worthRunningByAction
      : inventory.compressibleByAction;
  }

  private async buildDecisionRecalcCompletionOverridesForBatch(args: {
    batchId: string;
    generatedAt: string;
    currentItems: DecisionRecalcCompressionItem[];
    deletedRepositoryIds: Set<string>;
  }) {
    const overrides = await this.loadPersistedDecisionRecalcCompletionOverrides(
      args.batchId,
    );
    for (const item of args.currentItems) {
      if (args.deletedRepositoryIds.has(item.repositoryId)) {
        overrides.delete(item.repositoryId);
        continue;
      }
      const override = buildDecisionRecalcCompletionOverride({
        member: item,
        compressionClass: item.compressionClass,
        batchId: args.batchId,
        generatedAt: args.generatedAt,
      });
      if (override) {
        overrides.set(item.repositoryId, override);
      } else if (item.compressionClass === 'keep_running') {
        overrides.delete(item.repositoryId);
      }
    }
    return overrides;
  }

  private mergePersistedCompletionOverrideItems(args: {
    previousResult: DecisionRecalcFinishCompressionResult | null;
    currentItems: DecisionRecalcCompressionItem[];
    deletedRepositoryIds: Set<string>;
  }) {
    const merged = new Map<string, DecisionRecalcCompressionItem>();
    const previousItems =
      args.previousResult?.persistedCompletionOverrideItems ??
      args.previousResult?.items.filter((item) =>
        item.compressionClass === 'promote_archived' ||
        item.compressionClass === 'suppress_from_remaining',
      ) ??
      [];

    for (const item of previousItems) {
      if (args.deletedRepositoryIds.has(item.repositoryId)) {
        continue;
      }
      if (
        item.compressionClass !== 'promote_archived' &&
        item.compressionClass !== 'suppress_from_remaining'
      ) {
        continue;
      }
      merged.set(item.repositoryId, item);
    }

    for (const item of args.currentItems) {
      if (args.deletedRepositoryIds.has(item.repositoryId)) {
        merged.delete(item.repositoryId);
        continue;
      }
      if (
        item.compressionClass === 'promote_archived' ||
        item.compressionClass === 'suppress_from_remaining'
      ) {
        merged.set(item.repositoryId, item);
      }
      if (item.compressionClass === 'keep_running') {
        merged.delete(item.repositoryId);
      }
    }

    return this.sortDecisionRecalcItems([...merged.values()]);
  }

  private async loadPersistedDecisionRecalcCompletionOverrides(batchId: string) {
    const latest = await this.loadDecisionRecalcFinishCompressionResult();
    const overrides = new Map<string, FrozenAnalysisCompletionOverride>();
    if (!latest || latest.frozenAnalysisPoolBatchId !== batchId) {
      return overrides;
    }

    const persistedItems =
      latest.persistedCompletionOverrideItems ??
      latest.items.filter((item) =>
        item.compressionClass === 'promote_archived' ||
        item.compressionClass === 'suppress_from_remaining',
      );
    for (const item of persistedItems) {
      const override = buildDecisionRecalcCompletionOverride({
        member: item,
        compressionClass: item.compressionClass,
        batchId,
        generatedAt: latest.generatedAt,
      });
      if (override) {
        overrides.set(item.repositoryId, override);
      }
    }
    return overrides;
  }

  private async loadDecisionRecalcGateSnapshot() {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: 'analysis.decision_recalc_gate.latest',
      },
    });

    return readDecisionRecalcGateSnapshot(row?.configValue);
  }

  private async loadDecisionRecalcFinishCompressionResult() {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: FROZEN_ANALYSIS_POOL_DECISION_RECALC_COMPRESSION_CONFIG_KEY,
      },
    });
    const payload = this.readObject(row?.configValue);
    if (!payload) {
      return null;
    }
    return payload as unknown as DecisionRecalcFinishCompressionResult;
  }

  private async cancelPendingJobsByRepositoryIds(args: {
    rows: FrozenPendingQueueJob[];
    repositoryIds: Set<string>;
    cancelSource: 'decision_recalc_finish_compression';
  }) {
    const matchedRows = args.rows.filter((row) =>
      args.repositoryIds.has(row.repositoryId),
    );
    const seenJobIds = new Set<string>();
    const cancelledRepositoryIds = new Set<string>();
    let cancelledJobCount = 0;

    for (const row of matchedRows) {
      if (seenJobIds.has(row.jobId)) {
        continue;
      }
      seenJobIds.add(row.jobId);
      await this.cancelPendingJobWithFallback(
        row.jobId,
        `${args.cancelSource}:${row.historicalRepairAction}`,
      );
      cancelledJobCount += 1;
      cancelledRepositoryIds.add(row.repositoryId);
    }

    return {
      cancelledJobCount,
      cancelledRepositoryCount: cancelledRepositoryIds.size,
    };
  }

  private countDecisionRecalcByGateDecision(items: DecisionRecalcCompressionItem[]) {
    return this.countDecisionRecalcByProperty(
      items,
      (item) => item.gateDecision,
      [
        'allow_recalc',
        'allow_recalc_but_expect_no_change',
        'suppress_replay',
        'suppress_cleanup',
        'missing_gate_snapshot',
      ],
    );
  }

  private countDecisionRecalcByProperty(
    items: DecisionRecalcCompressionItem[],
    pickKey: (item: DecisionRecalcCompressionItem) => string | null | undefined,
    initialKeys?: string[],
  ) {
    const counts = Object.fromEntries(
      (initialKeys ?? []).map((key) => [key, 0]),
    ) as Record<string, number>;
    for (const item of items) {
      const key = pickKey(item) ?? 'unknown';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  private countDecisionRecalcByConflictType(items: DecisionRecalcCompressionItem[]) {
    const counts: Record<string, number> = {
      user_conflict: 0,
      monetization_conflict: 0,
      execution_conflict: 0,
      market_conflict: 0,
      problem_conflict: 0,
    };
    for (const item of items) {
      for (const conflictType of item.conflictTypes) {
        counts[conflictType] = (counts[conflictType] ?? 0) + 1;
      }
    }
    return counts;
  }

  private countDecisionRecalcRemovedFromPending(args: {
    compressedItems: DecisionRecalcCompressionItem[];
    afterMemberMap: Map<string, FrozenAnalysisPoolMember>;
  }) {
    return args.compressedItems.filter((item) => {
      if (item.queueStatus !== 'pending') {
        return false;
      }
      const afterMember = args.afterMemberMap.get(item.repositoryId);
      return !afterMember || afterMember.pendingJobs === 0;
    }).length;
  }

  private countDecisionRecalcRemovedFromRepairRemaining(args: {
    compressedItems: DecisionRecalcCompressionItem[];
    afterMemberMap: Map<string, FrozenAnalysisPoolMember>;
  }) {
    return args.compressedItems.filter((item) => {
      const afterMember = args.afterMemberMap.get(item.repositoryId);
      return !afterMember || afterMember.analysisCompletionState !== 'still_incomplete';
    }).length;
  }

  private pickTopReasonCounts(record: Record<string, number>) {
    return Object.entries(record)
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, 12)
      .map(([reason, count]) => ({
        reason,
        count: Number(count),
      }));
  }

  private pickTopActionCounts(record: Record<string, number>) {
    return Object.entries(record)
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, 12)
      .map(([action, count]) => ({
        action,
        count: Number(count),
      }));
  }

  private pickTopConflictTypes(items: DecisionRecalcCompressionItem[]) {
    const counts = this.countDecisionRecalcByConflictType(items);
    return Object.entries(counts)
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, 5)
      .map(([conflictType, count]) => ({
        conflictType,
        count: Number(count),
      }));
  }

  private pickDecisionRecalcSamples(items: DecisionRecalcCompressionItem[]) {
    return this.sortDecisionRecalcItems(items).slice(0, 20);
  }

  private sortDecisionRecalcItems(items: DecisionRecalcCompressionItem[]) {
    return [...items].sort((left, right) => {
      const leftQueue = this.decisionRecalcQueueStatusRank(left.queueStatus);
      const rightQueue = this.decisionRecalcQueueStatusRank(right.queueStatus);
      if (leftQueue !== rightQueue) {
        return leftQueue - rightQueue;
      }
      const leftValue = this.decisionRecalcValueRank(left);
      const rightValue = this.decisionRecalcValueRank(right);
      if (leftValue !== rightValue) {
        return rightValue - leftValue;
      }
      const leftWait = left.waitingDurationHours ?? -1;
      const rightWait = right.waitingDurationHours ?? -1;
      if (leftWait !== rightWait) {
        return rightWait - leftWait;
      }
      return left.fullName.localeCompare(right.fullName);
    });
  }

  private decisionRecalcQueueStatusRank(
    queueStatus: DecisionRecalcCompressionItem['queueStatus'],
  ) {
    switch (queueStatus) {
      case 'in_flight':
        return 0;
      case 'pending':
        return 1;
      case 'no_queue':
      default:
        return 2;
    }
  }

  private decisionRecalcValueRank(item: DecisionRecalcCompressionItem) {
    const valueTierRank =
      item.repositoryValueTier === 'HIGH'
        ? 4
        : item.repositoryValueTier === 'MEDIUM'
          ? 3
          : item.repositoryValueTier === 'LOW'
            ? 1
            : 0;
    const moneyRank =
      item.moneyPriority === 'P0'
        ? 4
        : item.moneyPriority === 'P1'
          ? 3
          : item.moneyPriority === 'P2'
            ? 2
            : item.moneyPriority === 'P3'
              ? 1
              : 0;
    const visibilityRank =
      item.strictVisibilityLevel === 'HOME'
        ? 4
        : item.strictVisibilityLevel === 'FAVORITES'
          ? 3
          : item.strictVisibilityLevel === 'DAILY_SUMMARY'
            ? 2
            : item.strictVisibilityLevel === 'DETAIL_ONLY'
              ? 1
              : 0;

    return valueTierRank * 100 + moneyRank * 10 + visibilityRank;
  }

  private computeDecisionRecalcRemainingShare(
    decisionRecalcRemainingCount: number,
    frozenPoolRemainingCount: number,
  ) {
    if (frozenPoolRemainingCount <= 0) {
      return 0;
    }
    return Number(
      (
        decisionRecalcRemainingCount / frozenPoolRemainingCount
      ).toFixed(4),
    );
  }

  private async ensureFrozenAnalysisPoolSnapshot(options?: {
    forceRefresh?: boolean;
    completionOverrides?: Map<string, FrozenAnalysisCompletionOverride> | null;
  }) {
    const existing = await this.loadFreezeStateBundle();
    if (
      existing.freezeState?.analysisPoolFrozen &&
      existing.snapshot &&
      options?.forceRefresh !== true &&
      !options?.completionOverrides?.size
    ) {
      return existing as {
        freezeState: AnalysisPoolFreezeState;
        snapshot: FrozenAnalysisPoolBatchSnapshot;
        members?: FrozenAnalysisPoolMember[];
      };
    }

    const generatedAt = new Date().toISOString();
    const modelNames = await this.resolveModelNames();
    const existingRepositoryIds = existing.snapshot?.repositoryIds?.length
      ? [...new Set(existing.snapshot.repositoryIds.filter(Boolean))]
      : null;
    const existingRepositoryIdSet = existingRepositoryIds
      ? new Set(existingRepositoryIds)
      : null;
    const report = await this.historicalRepairPriorityService.runPriorityReport();
    const scopedItems = existingRepositoryIdSet
      ? report.items.filter((item) => existingRepositoryIdSet.has(item.repoId))
      : report.items;
    const reportRepositoryIds = scopedItems.map((item) => item.repoId);
    const queueStateMap = await this.loadRepositoryQueueStateMap(reportRepositoryIds);
    const batchId =
      existing.freezeState?.frozenAnalysisPoolBatchId ??
      existing.snapshot?.frozenAnalysisPoolBatchId ??
      buildFrozenAnalysisPoolBatchId(new Date());
    const persistedCompletionOverrides =
      await this.loadPersistedDecisionRecalcCompletionOverrides(batchId);
    const completionOverrides = new Map<string, FrozenAnalysisCompletionOverride>(
      persistedCompletionOverrides,
    );
    for (const [repositoryId, override] of options?.completionOverrides ?? []) {
      completionOverrides.set(repositoryId, override);
    }
    const rawMembers = scopedItems
      .map((item) =>
        buildFrozenAnalysisPoolMember({
          item,
          queueState: queueStateMap.get(item.repoId),
          batchId,
          snapshotAt: generatedAt,
          modelNames,
          completionOverride: completionOverrides.get(item.repoId),
        }),
      );
    const members = existingRepositoryIds
      ? rawMembers
      : rawMembers.filter((member) => shouldIncludeFrozenPoolMember(member));
    const freezeState = buildAnalysisPoolFreezeState({
      batchId,
      snapshotAt: generatedAt,
      frozenAt: existing.freezeState?.analysisPoolFrozenAt ?? generatedAt,
    });
    const snapshot = buildFrozenAnalysisPoolBatchSnapshot({
      generatedAt,
      batchId,
      scope: freezeState.analysisPoolFrozenScope,
      reason: freezeState.analysisPoolFreezeReason,
      members,
    });

    await Promise.all([
      this.saveSystemConfig(ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY, freezeState),
      this.saveSystemConfig(FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY, snapshot),
    ]);

    return {
      freezeState,
      snapshot,
      members,
    };
  }

  private async loadFreezeStateBundle() {
    const [freezeRow, snapshotRow] = await Promise.all([
      this.prisma.systemConfig.findUnique({
        where: { configKey: ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY },
      }),
      this.prisma.systemConfig.findUnique({
        where: { configKey: FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY },
      }),
    ]);

    return {
      freezeState: readAnalysisPoolFreezeState(freezeRow?.configValue),
      snapshot: readFrozenAnalysisPoolBatchSnapshot(snapshotRow?.configValue),
    };
  }

  private async loadFrozenPoolMembers(
    repositoryIds: string[],
    batchId: string,
    snapshotAt: string,
    completionOverrides?: Map<string, FrozenAnalysisCompletionOverride> | null,
  ) {
    if (!repositoryIds.length) {
      return [] as FrozenAnalysisPoolMember[];
    }

    const modelNames = await this.resolveModelNames();
    const report = await this.historicalRepairPriorityService.runPriorityReport({
      repositoryIds,
    });
    const queueStateMap = await this.loadRepositoryQueueStateMap(repositoryIds);
    const persistedCompletionOverrides =
      await this.loadPersistedDecisionRecalcCompletionOverrides(batchId);
    const mergedOverrides = new Map<string, FrozenAnalysisCompletionOverride>(
      persistedCompletionOverrides,
    );
    for (const [repositoryId, override] of completionOverrides ?? []) {
      mergedOverrides.set(repositoryId, override);
    }
    return report.items.map((item) =>
      buildFrozenAnalysisPoolMember({
        item,
        queueState: queueStateMap.get(item.repoId),
        batchId,
        snapshotAt,
        modelNames,
        completionOverride: mergedOverrides.get(item.repoId),
      }),
    );
  }

  private async loadRepositoryQueueStateMap(repositoryIds: string[]) {
    const normalizedRepositoryIds = [...new Set(repositoryIds.filter(Boolean))];
    const stateMap = new Map<string, FrozenAnalysisPoolQueueState>();
    if (!normalizedRepositoryIds.length) {
      return stateMap;
    }

    const repositoryIdSet = new Set(normalizedRepositoryIds);
    const jobs = await this.prisma.jobLog.findMany({
      where: {
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
        queueName: {
          in: ['analysis.snapshot', 'analysis.single', 'analysis.batch', 'fast-filter.batch'],
        },
      },
      select: {
        id: true,
        jobStatus: true,
        payload: true,
      },
    });

    for (const job of jobs) {
      const payloadRepositoryIds = this.extractRepositoryIdsFromPayload(job.payload);
      for (const repositoryId of payloadRepositoryIds) {
        if (!repositoryIdSet.has(repositoryId)) {
          continue;
        }
        const current = stateMap.get(repositoryId) ?? {
          pendingJobs: 0,
          runningJobs: 0,
          pendingJobIds: [],
          runningJobIds: [],
        };
        if (job.jobStatus === JobStatus.PENDING) {
          current.pendingJobs += 1;
          current.pendingJobIds.push(job.id);
        } else if (job.jobStatus === JobStatus.RUNNING) {
          current.runningJobs += 1;
          current.runningJobIds.push(job.id);
        }
        stateMap.set(repositoryId, current);
      }
    }

    return stateMap;
  }

  private extractRepositoryIdsFromPayload(payload: unknown) {
    const value = this.readObject(payload);
    if (!value) {
      return [] as string[];
    }

    const directId = this.readOptionalString(value.repositoryId);
    const nestedDto = this.readObject(value.dto);
    const rootIds = Array.isArray(value.repositoryIds)
      ? value.repositoryIds.map((entry) => this.readOptionalString(entry)).filter(Boolean)
      : [];
    const dtoIds = Array.isArray(nestedDto?.repositoryIds)
      ? nestedDto.repositoryIds
          .map((entry) => this.readOptionalString(entry))
          .filter(Boolean)
      : [];

    return [...new Set([directId, ...rootIds, ...dtoIds].filter(Boolean))] as string[];
  }

  private async cancelPendingIntakeJobs() {
    const jobs = await this.prisma.jobLog.findMany({
      where: {
        jobStatus: JobStatus.PENDING,
        queueName: {
          in: ['github.fetch', 'github.created-backfill'],
        },
      },
      select: {
        id: true,
      },
    });

    let cancelledCount = 0;
    for (const job of jobs) {
      try {
        await this.queueService.cancelJob(job.id);
        cancelledCount += 1;
      } catch (error) {
        if (this.isIgnorableIntakeCancelError(error)) {
          continue;
        }
        throw error;
      }
    }

    return cancelledCount;
  }

  private async cleanupArchivedAndPurgeReadyMembers(args: {
    members: FrozenAnalysisPoolMember[];
    batchId: string;
    cleanedAt: string;
  }): Promise<FrozenArchivePurgeCleanupResult> {
    const cleanupTargets = args.members.filter(
      (member) =>
        !member.deleteCandidate &&
        member.analysisCompletionState === 'completed_not_useful_archived' &&
        (member.cleanupState === 'archive' || member.cleanupState === 'purge_ready'),
    );

    if (!cleanupTargets.length) {
      const emptyResult: FrozenArchivePurgeCleanupResult = {
        cleanedAt: args.cleanedAt,
        batchId: args.batchId,
        targetedRepositoryCount: 0,
        archiveRepositoryCount: 0,
        purgeReadyRepositoryCount: 0,
        cancelledPendingJobCount: 0,
        cancelledRepositoryCount: 0,
        purgedRepositoryCount: 0,
        purgedSnapshotCount: 0,
        purgedCachedRankingCount: 0,
        deletedTerminalJobLogCount: 0,
      };
      await this.saveSystemConfig(FROZEN_ANALYSIS_POOL_CLEANUP_CONFIG_KEY, emptyResult);
      return emptyResult;
    }

    const memberMap = new Map(
      cleanupTargets.map((member) => [member.repositoryId, member]),
    );
    const pendingRows = await this.loadFrozenPendingQueueJobs({
      memberMap,
      now: new Date(args.cleanedAt),
    });
    const seenJobIds = new Set<string>();
    const cancelledRepositoryIds = new Set<string>();
    let cancelledPendingJobCount = 0;

    for (const row of pendingRows) {
      if (seenJobIds.has(row.jobId)) {
        continue;
      }
      seenJobIds.add(row.jobId);
      await this.cancelPendingJobWithFallback(
        row.jobId,
        `cleanup_${row.member.cleanupState}`,
      );
      cancelledPendingJobCount += 1;
      cancelledRepositoryIds.add(row.repositoryId);
    }

    const purgeReadyRepositoryIds = cleanupTargets
      .filter(
        (member) => member.cleanupState === 'purge_ready' && member.runningJobs === 0,
      )
      .map((member) => member.repositoryId);

    const [snapshotDeleteResult, cachedRankingDeleteResult, deletedTerminalJobLogCount] =
      await Promise.all([
        purgeReadyRepositoryIds.length
          ? this.prisma.repositorySnapshot.deleteMany({
              where: {
                repositoryId: {
                  in: purgeReadyRepositoryIds,
                },
              },
            })
          : Promise.resolve({ count: 0 }),
        purgeReadyRepositoryIds.length
          ? this.prisma.repositoryCachedRanking.deleteMany({
              where: {
                repoId: {
                  in: purgeReadyRepositoryIds,
                },
              },
            })
          : Promise.resolve({ count: 0 }),
        this.deleteTerminalRepairLogsByRepositoryIds(
          cleanupTargets.map((member) => member.repositoryId),
        ),
      ]);

    const result: FrozenArchivePurgeCleanupResult = {
      cleanedAt: args.cleanedAt,
      batchId: args.batchId,
      targetedRepositoryCount: cleanupTargets.length,
      archiveRepositoryCount: cleanupTargets.filter(
        (member) => member.cleanupState === 'archive',
      ).length,
      purgeReadyRepositoryCount: cleanupTargets.filter(
        (member) => member.cleanupState === 'purge_ready',
      ).length,
      cancelledPendingJobCount,
      cancelledRepositoryCount: cancelledRepositoryIds.size,
      purgedRepositoryCount: purgeReadyRepositoryIds.length,
      purgedSnapshotCount: snapshotDeleteResult.count,
      purgedCachedRankingCount: cachedRankingDeleteResult.count,
      deletedTerminalJobLogCount,
    };

    await this.saveSystemConfig(FROZEN_ANALYSIS_POOL_CLEANUP_CONFIG_KEY, result);
    if (
      result.cancelledPendingJobCount > 0 ||
      result.purgedSnapshotCount > 0 ||
      result.purgedCachedRankingCount > 0 ||
      result.deletedTerminalJobLogCount > 0
    ) {
      this.logFrozenPoolCleanupResult(result);
    }

    return result;
  }

  private async deleteTerminalRepairLogsByRepositoryIds(repositoryIds: string[]) {
    const repositoryIdSet = new Set(repositoryIds.filter(Boolean));
    if (!repositoryIdSet.size) {
      return 0;
    }

    const jobs = await this.prisma.jobLog.findMany({
      where: {
        jobStatus: {
          notIn: [JobStatus.PENDING, JobStatus.RUNNING],
        },
        queueName: {
          in: [
            'analysis.snapshot',
            'analysis.single',
            'analysis.batch',
            'fast-filter.batch',
          ],
        },
      },
      select: {
        id: true,
        payload: true,
      },
    });
    const matchedJobIds = jobs
      .filter((job) =>
        this.extractRepositoryIdsFromPayload(job.payload).some((repositoryId) =>
          repositoryIdSet.has(repositoryId),
        ),
      )
      .map((job) => job.id);

    if (!matchedJobIds.length) {
      return 0;
    }

    const deleteResult = await this.prisma.jobLog.deleteMany({
      where: {
        id: {
          in: matchedJobIds,
        },
      },
    });
    return deleteResult.count;
  }

  private logFrozenPoolCleanupResult(result: FrozenArchivePurgeCleanupResult) {
    // Keep this to a single structured line so drain/completion runs can be grep'd easily.
    // It is intentionally separate from delete-candidate metrics because purge_ready keeps repo rows.
    this.logger.log(
      [
        'frozen_analysis_pool cleanup',
        `batchId=${result.batchId}`,
        `targetedRepositoryCount=${result.targetedRepositoryCount}`,
        `archiveRepositoryCount=${result.archiveRepositoryCount}`,
        `purgeReadyRepositoryCount=${result.purgeReadyRepositoryCount}`,
        `cancelledPendingJobCount=${result.cancelledPendingJobCount}`,
        `purgedRepositoryCount=${result.purgedRepositoryCount}`,
        `purgedSnapshotCount=${result.purgedSnapshotCount}`,
        `purgedCachedRankingCount=${result.purgedCachedRankingCount}`,
        `deletedTerminalJobLogCount=${result.deletedTerminalJobLogCount}`,
      ].join(' '),
    );
  }

  private async deleteFrozenPoolRepositories(
    members: FrozenAnalysisPoolMember[],
    batchId: string,
    deletedAt: string,
  ): Promise<{
    deletedItems: FrozenAnalysisPoolDeletedItem[];
    deleteSuppressedQueueCount: number;
  }> {
    if (!members.length) {
      return {
        deletedItems: [],
        deleteSuppressedQueueCount: 0,
      };
    }

    let deleteSuppressedQueueCount = 0;
    const deletedItems: FrozenAnalysisPoolDeletedItem[] = [];

    for (const member of members) {
      const pendingJobs = await this.prisma.jobLog.findMany({
        where: {
          jobStatus: JobStatus.PENDING,
        },
        select: {
          id: true,
          payload: true,
        },
      });
      const matchedPendingJobs = pendingJobs.filter((job) =>
        this.extractRepositoryIdsFromPayload(job.payload).includes(member.repositoryId),
      );
      for (const job of matchedPendingJobs) {
        await this.cancelPendingJobWithFallback(
          job.id,
          `delete_frozen_pool_repository:${member.repositoryId}`,
        );
        deleteSuppressedQueueCount += 1;
      }

      await this.prisma.repository.delete({
        where: {
          id: member.repositoryId,
        },
      });

      deletedItems.push(
        buildFrozenAnalysisPoolDeletedItem({
          member,
          batchId,
          deletedAt,
        }),
      );
    }

    return {
      deletedItems,
      deleteSuppressedQueueCount,
    };
  }

  private async resolveModelAssignment() {
    const modelNames = await this.resolveModelNames();
    return {
      modelA: {
        model: modelNames.modelA,
        responsibilities: [
          'snapshot',
          'insight',
          'idea_extract',
          'idea_fit',
          'completeness',
          'evidence_repair',
          'refresh_only',
        ],
      },
      modelB: {
        model: modelNames.modelB,
        responsibilities: [
          'deep_repair',
          'decision_recalc',
          'review',
          'trusted_blocking_analysis',
          'conflict_resolution',
        ],
      },
    };
  }

  private async resolveModelNames() {
    const settings = await this.settingsService.getSettings();
    const modelA =
      settings.ai.models.omlxLight ??
      settings.ai.models.omlx ??
      settings.ai.models.openai ??
      null;
    const modelB =
      settings.ai.models.omlxDeep ??
      settings.ai.models.omlx ??
      settings.ai.models.openai ??
      null;

    return {
      modelA,
      modelB,
    };
  }

  private async previewFrozenPoolCompletionResult() {
    const stateBundle = await this.ensureFrozenAnalysisPoolSnapshot({
      forceRefresh: true,
    });
    const latestDrain = await this.loadLatestFrozenPoolDrainSummary();
    const previousResult = await this.loadFrozenPoolCompletionResult();
    return buildFrozenAnalysisPoolCompletionPassResult({
      generatedAt: new Date().toISOString(),
      freezeState: stateBundle.freezeState,
      batchId: stateBundle.snapshot.frozenAnalysisPoolBatchId,
      snapshotAt: stateBundle.snapshot.frozenAnalysisPoolSnapshotAt,
      startingBatchPoolSize:
        previousResult?.startingBatchPoolSize ??
        stateBundle.snapshot.summary.totalPoolSize,
      beforeMembers: stateBundle.members ?? stateBundle.snapshot.topMembers,
      currentSnapshot: stateBundle.snapshot,
      currentMembers: stateBundle.members ?? stateBundle.snapshot.topMembers,
      deletedItems: previousResult?.deletedItems ?? [],
      retainedDeleteCandidates: (stateBundle.members ?? stateBundle.snapshot.topMembers)
        .filter((member) => member.deleteCandidate)
        .filter((member) => member.pendingJobs > 0 || member.runningJobs > 0)
        .map((member) => buildFrozenAnalysisPoolRetainedDeleteCandidate({ member })),
      deleteSuppressedQueueCount: previousResult?.deleteSuppressedQueueCount ?? 0,
      latestDrain,
    });
  }

  private async loadLatestFrozenPoolDrainSummary() {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: FROZEN_ANALYSIS_POOL_DRAIN_CONFIG_KEY,
      },
    });
    const payload = this.readObject(row?.configValue);
    const actionBreakdown =
      this.readObject(payload?.queueSummary)?.actionCounts &&
      typeof this.readObject(payload?.queueSummary)?.actionCounts === 'object'
        ? (this.readObject(payload?.queueSummary)?.actionCounts as Record<string, number>)
        : {};

    return {
      generatedAt: this.readOptionalString(payload?.generatedAt),
      totalExecuted: this.readOptionalNumber(payload?.totalExecuted) ?? 0,
      modelAExecutedCount: this.readOptionalNumber(payload?.modelAExecutedCount) ?? 0,
      modelBExecutedCount: this.readOptionalNumber(payload?.modelBExecutedCount) ?? 0,
      actionBreakdown,
    };
  }

  private async loadFrozenPoolCompletionResult() {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: FROZEN_ANALYSIS_POOL_COMPLETION_CONFIG_KEY,
      },
    });
    const payload = this.readObject(row?.configValue);
    if (!payload) {
      return null;
    }

    return payload as unknown as FrozenAnalysisPoolCompletionPassResult;
  }

  private mergeDeletedItems(
    existing: FrozenAnalysisPoolDeletedItem[],
    incoming: FrozenAnalysisPoolDeletedItem[],
  ) {
    const merged = new Map<string, FrozenAnalysisPoolDeletedItem>();
    for (const item of [...existing, ...incoming]) {
      merged.set(item.repositoryId, item);
    }
    return [...merged.values()].sort((left, right) =>
      left.fullName.localeCompare(right.fullName),
    );
  }

  private async loadFrozenPoolDrainFinishResult() {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: FROZEN_ANALYSIS_POOL_DRAIN_FINISH_CONFIG_KEY,
      },
    });
    const payload = this.readObject(row?.configValue);
    if (!payload) {
      return null;
    }
    return payload as unknown as FrozenAnalysisPoolDrainFinishResult;
  }

  private async loadFrozenPendingQueueJobs(args: {
    memberMap: Map<string, FrozenAnalysisPoolMember>;
    now: Date;
  }): Promise<FrozenPendingQueueJob[]> {
    if (!args.memberMap.size) {
      return [];
    }
    const jobs = await this.prisma.jobLog.findMany({
      where: {
        jobStatus: JobStatus.PENDING,
        queueName: {
          in: [
            'analysis.snapshot',
            'analysis.single',
            'analysis.batch',
            'fast-filter.batch',
          ],
        },
      },
      select: {
        id: true,
        queueName: true,
        payload: true,
        createdAt: true,
      },
    });
    const rows: FrozenPendingQueueJob[] = [];
    for (const job of jobs) {
      const payload = this.readObject(job.payload);
      const repositoryIds = this.extractRepositoryIdsFromPayload(job.payload);
      for (const repositoryId of repositoryIds) {
        const member = args.memberMap.get(repositoryId);
        if (!member) {
          continue;
        }
        const waitingDurationHours = Math.max(
          0,
          (args.now.getTime() - job.createdAt.getTime()) / (60 * 60 * 1000),
        );
        const historicalRepairAction =
          this.readHistoricalRepairActionFromPayload(payload) ??
          member.historicalRepairAction;
        rows.push({
          jobId: job.id,
          queueName: this.readOptionalString(job.queueName),
          repositoryId,
          member,
          historicalRepairAction,
          routerCapabilityTier: this.readRouterCapabilityTierFromPayload(payload),
          drainPriorityClass: classifyFrozenAnalysisPoolDrainPriority(member),
          waitingDurationHours,
          waitingDurationBucket: classifyFrozenPendingAgeBucket(
            waitingDurationHours,
          ),
          replayRisk: this.detectReplayRiskFromPayload(payload, historicalRepairAction),
          redundant: false,
          suppressible: false,
          lowRoiStale: false,
          suppressionReason: null,
        });
      }
    }
    rows.sort((left, right) => {
      const leftPriority = this.priorityClassRank(left.drainPriorityClass);
      const rightPriority = this.priorityClassRank(right.drainPriorityClass);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      if (left.waitingDurationHours !== right.waitingDurationHours) {
        return right.waitingDurationHours - left.waitingDurationHours;
      }
      return (
        scoreFrozenAnalysisPoolMember(right.member) -
        scoreFrozenAnalysisPoolMember(left.member)
      );
    });
    return rows;
  }

  private markRedundantPendingJobs(rows: FrozenPendingQueueJob[]) {
    const grouped = new Map<string, FrozenPendingQueueJob[]>();
    for (const row of rows) {
      const key = `${row.repositoryId}:${row.historicalRepairAction}:${row.queueName ?? 'none'}`;
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
    }
    for (const list of grouped.values()) {
      if (list.length <= 1) {
        continue;
      }
      list.sort((left, right) => left.waitingDurationHours - right.waitingDurationHours);
      for (let index = 1; index < list.length; index += 1) {
        list[index].redundant = true;
      }
    }
  }

  private applyPendingSuppressionPolicy(rows: FrozenPendingQueueJob[]) {
    for (const row of rows) {
      const policy = evaluateFrozenPendingSuppression({
        member: {
          cleanupState: row.member.cleanupState,
          historicalRepairBucket: row.member.historicalRepairBucket,
          historicalRepairAction: row.historicalRepairAction,
          repositoryValueTier: row.member.repositoryValueTier,
          moneyPriority: row.member.moneyPriority,
          analysisQualityState: row.member.analysisQualityState,
          analysisCompletionState: row.member.analysisCompletionState,
        },
        waitingDurationHours: row.waitingDurationHours,
        replayRisk: row.replayRisk,
        redundant: row.redundant,
      });
      row.suppressible = policy.suppressible;
      row.lowRoiStale = policy.lowRoiStale;
      row.suppressionReason = policy.suppressionReason;
    }
  }

  private buildPendingQueueBreakdown(
    rows: FrozenPendingQueueJob[],
  ): FrozenAnalysisPoolPendingQueueBreakdown {
    const breakdown = buildEmptyFrozenPendingQueueBreakdown();
    for (const row of rows) {
      accumulateFrozenPendingQueueBreakdown({
        breakdown,
        sample: this.toPendingAuditSample(row),
      });
    }
    return breakdown;
  }

  private async cancelPendingQueueJobs(rows: FrozenPendingQueueJob[]) {
    const seenJobIds = new Set<string>();
    let suppressedCount = 0;
    let redundantCount = 0;
    for (const row of rows) {
      if (!row.suppressible || seenJobIds.has(row.jobId)) {
        continue;
      }
      seenJobIds.add(row.jobId);
      await this.cancelPendingJobWithFallback(
        row.jobId,
        row.suppressionReason ?? 'force_joblog_cancel',
      );
      if (row.redundant) {
        redundantCount += 1;
      } else {
        suppressedCount += 1;
      }
    }
    return {
      suppressedCount,
      redundantCount,
    };
  }

  private resolvePendingQueueCancelFallback(error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error ?? '');
    if (
      message.includes('does not have queue metadata') ||
      message.includes('Queue job could not be found') ||
      message.includes('Only queued jobs can be cancelled safely')
    ) {
      return 'force_joblog_cancel' as const;
    }
    if (message.includes('can no longer be cancelled')) {
      return 'ignore' as const;
    }
    return null;
  }

  private async cancelPendingJobWithFallback(jobId: string, reason: string) {
    try {
      await this.queueService.cancelJob(jobId);
    } catch (error) {
      const fallback = this.resolvePendingQueueCancelFallback(error);
      if (fallback === 'ignore') {
        return;
      }
      if (fallback === 'force_joblog_cancel') {
        await this.forceCancelPendingJobLog(jobId, reason);
        return;
      }
      throw error;
    }
  }

  private async forceCancelPendingJobLog(jobId: string, reason: string) {
    await this.prisma.jobLog.updateMany({
      where: {
        id: jobId,
        jobStatus: JobStatus.PENDING,
      },
      data: {
        jobStatus: JobStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: `Task cancelled by frozen_pool_drain_finish (${reason}).`,
        result: {
          cancelled: true,
          cancelSource: 'frozen_pool_drain_finish',
          reason,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private selectDrainFinishTargets(
    members: FrozenAnalysisPoolMember[],
    options?: {
      p0Limit?: number;
      p1Limit?: number;
      p2Limit?: number;
    },
  ) {
    const candidates = members
      .filter((member) => member.analysisCompletionState === 'still_incomplete')
      .filter((member) => member.cleanupState === 'active')
      .filter((member) => member.pendingJobs === 0 && member.runningJobs === 0)
      .filter((member) =>
        ['decision_recalc', 'deep_repair', 'evidence_repair', 'refresh_only', 'downgrade_only'].includes(
          member.historicalRepairAction,
        ),
      );
    const p0 = candidates
      .filter(
        (member) => classifyFrozenAnalysisPoolDrainPriority(member) === 'P0',
      )
      .sort(
        (left, right) =>
          scoreFrozenAnalysisPoolMember(right) -
          scoreFrozenAnalysisPoolMember(left),
      )
      .slice(0, options?.p0Limit ?? 220);
    const p1 = candidates
      .filter(
        (member) => classifyFrozenAnalysisPoolDrainPriority(member) === 'P1',
      )
      .sort(
        (left, right) =>
          scoreFrozenAnalysisPoolMember(right) -
          scoreFrozenAnalysisPoolMember(left),
      )
      .slice(0, options?.p1Limit ?? 180);
    const p2 = candidates
      .filter(
        (member) => classifyFrozenAnalysisPoolDrainPriority(member) === 'P2',
      )
      .sort(
        (left, right) =>
          scoreFrozenAnalysisPoolMember(right) -
          scoreFrozenAnalysisPoolMember(left),
      )
      .slice(0, options?.p2Limit ?? 80);

    return [...new Set([...p0, ...p1, ...p2].map((member) => member.repositoryId))];
  }

  private buildActionFinishSummary(args: {
    action: 'decision_recalc' | 'deep_repair' | 'evidence_repair';
    selectedCount: number;
    runResult: Awaited<
      ReturnType<HistoricalDataRecoveryService['runHistoricalRepairLoop']>
    > | null;
    replayGateEnforced: boolean;
    hardenedAfterStateEnabled: boolean;
  }) {
    const selectedCount = args.runResult?.selected.filter(
      (item) => item.action === args.action,
    ).length;
    const actionOutcomeStatusBreakdown =
      args.runResult?.analysisOutcomeSummary.actionOutcomeStatusBreakdown?.[
        args.action
      ];
    return {
      selectedCount: selectedCount ?? 0,
      queuedCount: Number(actionOutcomeStatusBreakdown?.partial ?? 0),
      noChangeCount: Number(actionOutcomeStatusBreakdown?.no_change ?? 0),
      suppressedCount: Number(actionOutcomeStatusBreakdown?.skipped ?? 0),
      replayGateEnforced: args.replayGateEnforced,
      hardenedAfterStateEnabled: args.hardenedAfterStateEnabled,
    };
  }

  private buildRepairFinishBreakdown(args: {
    runResult: Awaited<
      ReturnType<HistoricalDataRecoveryService['runHistoricalRepairLoop']>
    > | null;
    completionResult: FrozenAnalysisPoolCompletionPassResult;
  }) {
    const breakdown: Record<string, number> = {
      decision_recalc: 0,
      deep_repair: 0,
      evidence_repair: 0,
      downgrade_only: 0,
      refresh_only: 0,
      completed_useful: args.completionResult.frozenPoolCompletedUsefulCount,
      completed_not_useful_archived:
        args.completionResult.frozenPoolCompletedArchivedCount,
      completed_not_useful_deleted:
        args.completionResult.frozenPoolCompletedDeletedCount,
      still_incomplete: args.completionResult.frozenPoolStillIncompleteCount,
    };
    if (!args.runResult) {
      return breakdown;
    }
    for (const selected of args.runResult.selected) {
      breakdown[selected.action] = (breakdown[selected.action] ?? 0) + 1;
    }
    return breakdown;
  }

  private pickTopEntry(
    record: Record<string, number>,
  ): { action: string; count: number } | null {
    const sorted = Object.entries(record)
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]));
    if (!sorted.length) {
      return null;
    }
    return {
      action: sorted[0][0],
      count: Number(sorted[0][1]),
    };
  }

  private toPendingAuditSample(
    row: FrozenPendingQueueJob,
  ): FrozenAnalysisPoolPendingAuditSample {
    return {
      jobId: row.jobId,
      queueName: row.queueName,
      repositoryId: row.repositoryId,
      fullName: row.member.fullName,
      historicalRepairAction: row.historicalRepairAction,
      routerCapabilityTier: row.routerCapabilityTier,
      cleanupState: row.member.cleanupState,
      historicalRepairBucket: row.member.historicalRepairBucket,
      repositoryValueTier: row.member.repositoryValueTier,
      moneyPriority: row.member.moneyPriority,
      frozenAnalysisPoolBatchId: row.member.frozenAnalysisPoolBatchId,
      modelLane: row.member.assignedModelLane,
      waitingDurationHours: Number(row.waitingDurationHours.toFixed(2)),
      waitingDurationBucket: row.waitingDurationBucket,
      drainPriorityClass: row.drainPriorityClass,
      replayRisk: row.replayRisk,
      suppressible: row.suppressible,
      redundant: row.redundant,
      suppressionReason: row.suppressionReason,
    };
  }

  private readHistoricalRepairActionFromPayload(
    payload: Record<string, unknown> | null,
  ): FrozenAnalysisPoolMember['historicalRepairAction'] | null {
    const action =
      this.readOptionalString(payload?.historicalRepairAction) ??
      this.readOptionalString(this.readObject(payload?.metadata)?.historicalRepairAction);
    if (
      action === 'downgrade_only' ||
      action === 'refresh_only' ||
      action === 'evidence_repair' ||
      action === 'deep_repair' ||
      action === 'decision_recalc' ||
      action === 'archive'
    ) {
      return action;
    }
    return null;
  }

  private readRouterCapabilityTierFromPayload(
    payload: Record<string, unknown> | null,
  ) {
    return (
      this.readOptionalString(payload?.routerCapabilityTier) ??
      this.readOptionalString(this.readObject(payload?.metadata)?.routerCapabilityTier) ??
      null
    );
  }

  private detectReplayRiskFromPayload(
    payload: Record<string, unknown> | null,
    historicalRepairAction: FrozenAnalysisPoolMember['historicalRepairAction'],
  ) {
    if (historicalRepairAction !== 'decision_recalc') {
      return false;
    }
    const recalcGateDecision =
      this.readOptionalString(payload?.recalcGateDecision) ??
      this.readOptionalString(this.readObject(payload?.metadata)?.recalcGateDecision);
    if (recalcGateDecision === 'suppress_replay') {
      return true;
    }
    const recalcSignalChangedRaw =
      payload?.recalcSignalChanged ??
      this.readObject(payload?.metadata)?.recalcSignalChanged;
    const recalcSignalChanged =
      recalcSignalChangedRaw === true ||
      String(recalcSignalChangedRaw ?? '').toLowerCase() === 'true';
    return recalcSignalChanged === false;
  }

  private priorityClassRank(priorityClass: FrozenAnalysisPoolDrainPriorityClass) {
    switch (priorityClass) {
      case 'P0':
        return 0;
      case 'P1':
        return 1;
      case 'P2':
      default:
        return 2;
    }
  }

  private async saveSystemConfig(configKey: string, configValue: unknown) {
    await this.prisma.systemConfig.upsert({
      where: { configKey },
      update: {
        configValue: configValue as Prisma.InputJsonValue,
      },
      create: {
        configKey,
        configValue: configValue as Prisma.InputJsonValue,
      },
    });
  }

  private readObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private isIgnorableIntakeCancelError(error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error ?? '');
    return message.includes('can no longer be cancelled');
  }

  private readOptionalString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  private readOptionalNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
}
