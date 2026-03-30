import { Injectable, Logger } from '@nestjs/common';
import {
  Favorite,
  JobStatus,
  Prisma,
  Repository,
  RepositoryAnalysis,
  RepositoryContent,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { AdaptiveSchedulerService } from '../scheduler/adaptive-scheduler.service';
import { ClaudeReviewService } from './claude-review.service';
import { RunAnalysisDto } from './dto/run-analysis.dto';
import { RepositoryDecisionService } from './repository-decision.service';
import { RepositoryInsightService } from './repository-insight.service';
import { TrainingKnowledgeExportService } from './training-knowledge-export.service';
import { HistoricalRepairPriorityService } from './historical-repair-priority.service';
import {
  assessHistoricalRecoveryBatch,
  buildHistoricalRecoveryMetrics,
  HistoricalRecoveryAssessment,
  HistoricalRecoveryMetrics,
  HistoricalRecoveryPriority,
  HistoricalRecoverySignal,
  HistoricalRecoveryStage,
} from './helpers/historical-data-recovery.helper';
import {
  HistoricalRepairPriorityItem,
  HistoricalFrontendDecisionState,
  HistoricalRepairPriorityReport,
} from './helpers/historical-repair-priority.helper';
import {
  buildModelTaskRouterDecision,
  buildModelTaskRouterDecisionInputFromHistoricalItem,
  buildModelTaskRouterExecutionMetadata,
  emptyModelTaskRouterCapabilityBreakdown,
  emptyModelTaskRouterFallbackBreakdown,
} from './helpers/model-task-router-decision.helper';
import type {
  ModelTaskRouterExecutionMetadata,
  ModelTaskRouterDecisionOutput,
  ModelTaskCapabilityTierName,
  ModelTaskFallbackPolicy,
  ModelTaskRouterCapabilityBreakdown,
  ModelTaskRouterFallbackBreakdown,
} from './helpers/model-task-router.types';
import {
  buildDecisionRecalcGateSnapshot,
  buildDecisionRecalcGateSnapshotMap,
  mergeDecisionRecalcGateSnapshots,
  readDecisionRecalcGateSnapshot,
} from './helpers/decision-recalc-gate.helper';
import {
  toHistoricalRepairQueuePriority,
  toHistoricalSingleAnalysisQueuePriority,
} from './helpers/historical-repair-queue-priority.helper';
import { runWithConcurrency } from './helpers/run-with-concurrency.helper';
import type {
  DecisionRecalcGateResult,
  DecisionRecalcGateSnapshot,
  DecisionRecalcGateSnapshotMap,
} from './helpers/decision-recalc-gate.types';
import {
  buildAnalysisOutcomeSnapshot,
  buildHistoricalRepairOutcomeLog,
} from './helpers/analysis-outcome.helper';
import {
  ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY,
  FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY,
} from './helpers/frozen-analysis-pool.types';
import {
  readAnalysisPoolFreezeState,
  readFrozenAnalysisPoolBatchSnapshot,
} from './helpers/frozen-analysis-pool.helper';
import type {
  AnalysisOutcomeDecisionState,
  AnalysisOutcomeLog,
  AnalysisOutcomeStatus,
  AnalysisOutcomeSummary,
  AnalysisOutcomeSnapshot,
  AnalysisRepairValueClass,
} from './helpers/analysis-outcome.types';

export type { HistoricalRecoveryPriority } from './helpers/historical-data-recovery.helper';

const AUDIT_CONFIG_KEY = 'analysis.historical_recovery.audit.latest';
const RUN_CONFIG_KEY = 'analysis.historical_recovery.run.latest';
const PRIORITY_CONFIG_KEY = 'analysis.historical_repair.priority.latest';
const FRONTEND_GUARD_CONFIG_KEY =
  'analysis.historical_repair.frontend_guard.latest';
const OUTCOME_CONFIG_KEY = 'analysis.outcome.latest';
const HISTORICAL_REPAIR_RECENT_OUTCOMES_CONFIG_KEY =
  'analysis.historical_repair.recent_outcomes.latest';
const DECISION_RECALC_GATE_CONFIG_KEY = 'analysis.decision_recalc_gate.latest';
const HISTORICAL_REPAIR_RECENT_OUTCOMES_SCHEMA_VERSION =
  'historical_repair_recent_outcomes_v1';
const HISTORICAL_REPAIR_CONCURRENCY_MIN = 1;
const HISTORICAL_REPAIR_CONCURRENCY_MAX = 32;
const HISTORICAL_REPAIR_LOW_YIELD_CONSECUTIVE_THRESHOLD = 3;
const HISTORICAL_REPAIR_RECENT_OUTCOME_HISTORY_LIMIT = 6;
const HISTORICAL_REPAIR_LOW_YIELD_COVERAGE_DELTA_THRESHOLD = 0.05;
const HISTORICAL_REPAIR_GLOBAL_CONCURRENCY_ENV_NAME =
  'HISTORICAL_REPAIR_GLOBAL_CONCURRENCY';
const HISTORICAL_REPAIR_GLOBAL_CONCURRENCY_FALLBACK = 20;
const HISTORICAL_REPAIR_DEEP_LOOKUP_CHUNK_SIZE = 100;
const HISTORICAL_REPAIR_DEEP_LOOKUP_CONCURRENCY = 2;
const HISTORICAL_REPAIR_SNAPSHOT_BULK_BATCH_SIZE = 50;
const HISTORICAL_REPAIR_SINGLE_ANALYSIS_BULK_BATCH_SIZE = 50;
const HISTORICAL_REPAIR_RATE_PRECISION = 2;
const HISTORICAL_REPAIR_LANE_CONCURRENCY = {
  refresh_only: {
    envName: 'HISTORICAL_REPAIR_REFRESH_CONCURRENCY',
    fallback: 12,
  },
  evidence_repair: {
    envName: 'HISTORICAL_REPAIR_EVIDENCE_CONCURRENCY',
    fallback: 12,
  },
  deep_repair: {
    envName: 'HISTORICAL_REPAIR_DEEP_CONCURRENCY',
    fallback: 6,
  },
  decision_recalc: {
    envName: 'HISTORICAL_REPAIR_DECISION_RECALC_CONCURRENCY',
    fallback: 10,
  },
} as const;

type RepositoryRecoveryTarget = Repository & {
  analysis: RepositoryAnalysis | null;
  content: RepositoryContent | null;
  favorite: Favorite | null;
};

type RecoverySummarySample = {
  repoId: string;
  fullName: string;
  htmlUrl: string;
  priority: HistoricalRecoveryPriority;
  stages: HistoricalRecoveryStage[];
  issues: string[];
  oneLinerZh: string;
  source: string | null;
};

type SingleAnalysisBulkEntries = Parameters<
  QueueService['enqueueSingleAnalysesBulk']
>[0];
type SingleAnalysisBulkEntry = SingleAnalysisBulkEntries[number];

export type HistoricalRecoveryScanOptions = {
  limit?: number;
  priority?: HistoricalRecoveryPriority | null;
  onlyConflicts?: boolean;
  onlyFeatured?: boolean;
  onlyFallback?: boolean;
  onlyIncomplete?: boolean;
  onlyHighValue?: boolean;
  onlyMissingDeep?: boolean;
};

export type HistoricalRecoveryRunOptions = HistoricalRecoveryScanOptions & {
  dryRun?: boolean;
  exportTrainingSamples?: boolean;
  outputDir?: string;
  mode?:
    | 'run_recovery'
    | 'repair_display_only'
    | 'rerun_light_analysis'
    | 'rerun_full_deep'
    | 'queue_claude_review';
};

export type HistoricalRecoveryAuditResult = {
  scannedAt: string;
  scannedCount: number;
  metrics: HistoricalRecoveryMetrics;
  priorityCounts: Record<HistoricalRecoveryPriority, number>;
  topSamples: {
    badOneLiners: RecoverySummarySample[];
    conflicts: RecoverySummarySample[];
    fallback: RecoverySummarySample[];
    incomplete: RecoverySummarySample[];
    claudeConflicts: RecoverySummarySample[];
  };
  items: HistoricalRecoveryAssessment[];
};

export type HistoricalRecoveryRunResult = {
  scannedAt: string;
  dryRun: boolean;
  selectedCount: number;
  metrics: HistoricalRecoveryMetrics;
  stageCounts: Record<HistoricalRecoveryStage, number>;
  selected: RecoverySummarySample[];
  execution: {
    rerunLightAnalysis: number;
    rerunDeepAnalysis: number;
    claudeQueued: number;
  };
  trainingExport: Awaited<
    ReturnType<TrainingKnowledgeExportService['exportKnowledgeAssets']>
  > | null;
};

export type HistoricalRepairRunOptions = {
  limit?: number;
  dryRun?: boolean;
  buckets?: Array<'visible_broken' | 'high_value_weak' | 'stale_watch'>;
  minPriorityScore?: number;
  repositoryIds?: string[];
};

export type HistoricalRepairQueueSummary = {
  totalQueued: number;
  globalPendingCount: number;
  globalRunningCount: number;
  actionCounts: Record<
    'downgrade_only' | 'refresh_only' | 'evidence_repair' | 'deep_repair' | 'decision_recalc',
    number
  >;
  routerCapabilityBreakdown: ModelTaskRouterCapabilityBreakdown;
  routerFallbackBreakdown: ModelTaskRouterFallbackBreakdown;
  routerReviewRequiredCount: number;
  routerDeterministicOnlyCount: number;
  queuedWithRouterMetadataCount: number;
  queuedSamples: Array<{
    repoId: string | null;
    action: string | null;
    capabilityTier: ModelTaskCapabilityTierName;
    fallbackPolicy: ModelTaskFallbackPolicy;
    requiresReview: boolean;
    queueName: string | null;
  }>;
};

export type HistoricalRepairRunResult = {
  generatedAt: string;
  dryRun: boolean;
  selectedCount: number;
  visibleBrokenCount: number;
  highValueWeakCount: number;
  staleWatchCount: number;
  archiveOrNoiseCount: number;
  historicalTrustedButWeakCount: number;
  historicalRepairActionBreakdown: HistoricalRepairPriorityReport['summary']['actionBreakdown'];
  visibleBrokenActionBreakdown: HistoricalRepairPriorityReport['summary']['visibleBrokenActionBreakdown'];
  highValueWeakActionBreakdown: HistoricalRepairPriorityReport['summary']['highValueWeakActionBreakdown'];
  execution: {
    downgradeOnly: number;
    refreshOnly: number;
    evidenceRepair: number;
    deepRepair: number;
    decisionRecalc: number;
    archive: number;
  };
  loopTelemetry: {
    loopQueuedCount: number;
    loopQueuedPerSecond: number;
    loopDedupeSkipCount: number;
    loopTerminalNoRequeueSkipCount: number;
    loopLowYieldSkipCount: number;
    totalDurationMs: number;
    historicalRepairGlobalConcurrency: number;
    globalPendingCount: number;
    globalRunningCount: number;
    globalQueuedCount: number;
  };
  queueSummary: HistoricalRepairQueueSummary;
  routerExecutionSummary: {
    routerCapabilityBreakdown: ModelTaskRouterCapabilityBreakdown;
    routerFallbackBreakdown: ModelTaskRouterFallbackBreakdown;
    routerReviewRequiredCount: number;
    routerDeterministicOnlyCount: number;
    frozenOrArchivedTaskSuppressedCount: number;
    recalcReplaySuppressedCount: number;
    recalcCleanupSuppressedCount: number;
    recalcAllowedCount: number;
    recalcAllowedButNoChangeExpectedCount: number;
    recalcSignalChangedCount: number;
    recalcSignalUnchangedCount: number;
    topReplayConflictTypes: Array<{ conflictType: string; count: number }>;
  };
  frontendGuard: {
    updatedAt: string;
    downgradedCount: number;
    trustedButWeakCount: number;
  };
  analysisOutcomeSummary: AnalysisOutcomeSummary;
  selected: Array<{
    repoId: string;
    fullName: string;
    bucket: string;
    action: string;
    cleanupState: string;
    priorityScore: number;
    frontendDecisionState: HistoricalFrontendDecisionState;
    routerCapabilityTier: ModelTaskCapabilityTierName;
    routerFallbackPolicy: ModelTaskFallbackPolicy;
    routerRequiresReview: boolean;
    reason: string;
  }>;
};

type HistoricalRepairDispatchPlan = {
  item: HistoricalRepairPriorityItem;
  routerDecision: ModelTaskRouterDecisionOutput;
  routerMetadata: ModelTaskRouterExecutionMetadata;
  recalcGate: DecisionRecalcGateResult | null;
};

type HistoricalRepairDispatchOutcome = {
  plan: HistoricalRepairDispatchPlan;
  outcomeStatus: AnalysisOutcomeStatus;
  outcomeReason: string;
  executionDurationMs: number;
  executionUsedFallback?: boolean;
  executionUsedReview?: boolean;
};

type HistoricalRepairDispatchLane = keyof typeof HISTORICAL_REPAIR_LANE_CONCURRENCY;

type HistoricalRepairLaneTelemetry = {
  gateAcquireCount: number;
  gateWaitDurationMs: number;
  bulkBatchCount: number;
  bulkFallbackCount: number;
  deepLookupChunkCount: number;
  deepLookupDurationMs: number;
  dedupeSkipCount: number;
  terminalNoRequeueSkipCount: number;
};

type HistoricalRepairRecentOutcomeRecord = {
  repositoryId: string;
  loggedAt: string;
  historicalRepairAction: HistoricalRepairPriorityItem['historicalRepairAction'] | null;
  historicalRepairBucket: HistoricalRepairPriorityItem['historicalRepairBucket'] | null;
  outcomeStatus: AnalysisOutcomeStatus;
  outcomeReason: string;
  repairValueClass: AnalysisRepairValueClass;
  decisionStateBefore: AnalysisOutcomeDecisionState;
  evidenceCoverageRateBefore: number;
  keyEvidenceGapsBefore: string[];
  trustedBlockingGapsBefore: string[];
};

type HistoricalRepairRecentOutcomesSnapshot = {
  schemaVersion: string;
  generatedAt: string;
  maxItemsPerRepository: number;
  items: HistoricalRepairRecentOutcomeRecord[];
};

type HistoricalRepairRecentOutcomeIndex = Map<
  string,
  HistoricalRepairRecentOutcomeRecord[]
>;

type HistoricalRepairInflightState = {
  snapshotInFlight: boolean;
  decisionRecalcInFlight: boolean;
  actions: Set<string>;
};

type HistoricalRepairInflightIndex = Map<string, HistoricalRepairInflightState>;

type HistoricalRepairPlanSuppression = {
  suppressed: boolean;
  reason: string | null;
  suppressionType: 'dedupe' | 'terminal_no_requeue' | null;
};

type HistoricalRepairLowYieldSuppression = {
  suppressed: boolean;
  reason: string | null;
};

@Injectable()
export class HistoricalDataRecoveryService {
  private readonly logger = new Logger(HistoricalDataRecoveryService.name);
  private historicalRepairGlobalGateInFlight = 0;
  private readonly historicalRepairGlobalGateWaiters: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly repositoryDecisionService: RepositoryDecisionService,
    private readonly repositoryInsightService: RepositoryInsightService,
    private readonly claudeReviewService: ClaudeReviewService,
    private readonly trainingKnowledgeExportService: TrainingKnowledgeExportService,
    private readonly adaptiveSchedulerService: AdaptiveSchedulerService,
    private readonly queueService: QueueService,
    private readonly historicalRepairPriorityService: HistoricalRepairPriorityService,
  ) {}

  async scanOldBadRecords(
    options?: HistoricalRecoveryScanOptions,
  ): Promise<HistoricalRecoveryAuditResult> {
    const scannedAt = new Date().toISOString();
    const exposureSets = await this.loadExposureSets();
    const repositories = await this.loadRepositories();
    const auditSnapshot =
      await this.repositoryDecisionService.getLatestAuditSnapshot();
    const derived =
      this.repositoryDecisionService.attachDerivedAssetsWithAudit(
        repositories as unknown as Record<string, unknown>[],
        auditSnapshot,
      ) as Array<Record<string, unknown>>;
    const assessments = assessHistoricalRecoveryBatch(
      derived.map((repository) => this.toRecoverySignal(repository, exposureSets)),
    );
    const filtered = await this.filterAssessments(assessments, options);
    const selected =
      options?.limit && options.limit > 0
        ? filtered.slice(0, options.limit)
        : filtered;
    const metrics = buildHistoricalRecoveryMetrics(filtered);

    const result: HistoricalRecoveryAuditResult = {
      scannedAt,
      scannedCount: filtered.length,
      metrics,
      priorityCounts: metrics.priorityCounts,
      topSamples: {
        badOneLiners: this.pickSamples(
          filtered.filter((item) => item.metrics.badOneliner),
        ),
        conflicts: this.pickSamples(
          filtered.filter(
            (item) =>
              item.metrics.headlineUserConflict ||
              item.metrics.headlineCategoryConflict ||
              item.metrics.monetizationOverclaim,
          ),
        ),
        fallback: this.pickSamples(
          filtered.filter((item) => item.metrics.fallbackVisible),
        ),
        incomplete: this.pickSamples(
          filtered.filter((item) => item.metrics.incompleteAnalysisVisible),
        ),
        claudeConflicts: this.pickSamples(
          filtered.filter((item) => item.metrics.claudeConflict),
        ),
      },
      items: selected,
    };

    await this.saveSystemConfig(AUDIT_CONFIG_KEY, {
      scannedAt,
      scannedCount: result.scannedCount,
      metrics: result.metrics,
      priorityCounts: result.priorityCounts,
      topSamples: result.topSamples,
    });
    this.logger.log(
      `historical_data_recovery scan completed scanned=${result.scannedCount} p0=${result.priorityCounts.P0} p1=${result.priorityCounts.P1} p2=${result.priorityCounts.P2}`,
    );

    return result;
  }

  async rerunLightAnalysis(repositoryIds: string[]) {
    let count = 0;
    for (const repositoryId of repositoryIds) {
      await this.repositoryInsightService.refreshInsight(repositoryId);
      count += 1;
    }
    return count;
  }

  async rerunDeepAnalysis(repositoryIds: string[]) {
    const repositoryMap = await this.loadHistoricalRecoveryDeepAnalysisRepositoryMap(
      repositoryIds,
    );
    const entries: SingleAnalysisBulkEntries = [];

    for (const repositoryId of repositoryIds) {
      const repository = repositoryMap.get(repositoryId);
      if (!repository) {
        continue;
      }

      const dto = this.buildMissingDeepAnalysisDto(repository);
      if (!dto.runCompleteness && !dto.runIdeaFit && !dto.runIdeaExtract) {
        continue;
      }

      entries.push({
        repositoryId,
        dto,
        metadata: {
          recoveryMode: 'rerun_full_deep',
          missingDeep: true,
          repoId: repositoryId,
        },
        jobOptionsOverride: {
          priority: this.toSingleAnalysisQueuePriority(
            'deep_repair',
            160,
            'P0',
          ),
        },
      });
    }

    return this.enqueueHistoricalRecoverySingleAnalysisEntries(
      entries,
      'health_recovery',
    );
  }

  async queueClaudeReview(repositoryIds: string[]) {
    if (!repositoryIds.length) {
      return 0;
    }

    return this.enqueueHistoricalRecoverySingleAnalysisEntries(
      repositoryIds.map((repositoryId) => ({
        repositoryId,
        dto: {
          runFastFilter: true,
          runCompleteness: true,
          runIdeaFit: true,
          runIdeaExtract: true,
          forceRerun: true,
        },
        metadata: {
          recoveryMode: 'legacy_claude_redirect',
          missingDeep: false,
          repoId: repositoryId,
          legacyClaudeEntry: true,
          routerTaskIntent: 'review',
          routerReasonSummary:
            'Historical recovery L3 now redirects into the primary API analysis pipeline.',
        },
        jobOptionsOverride: {
          priority: this.toSingleAnalysisQueuePriority(
            'deep_repair',
            150,
            'P0',
          ),
        },
      })),
      'legacy_claude_review_redirect',
    );
  }

  async exportTrainingSamples(options?: {
    sampleSize?: number;
    outputDir?: string;
    includeFullNames?: string[];
  }) {
    return this.trainingKnowledgeExportService.exportKnowledgeAssets({
      sampleSize: options?.sampleSize,
      outputDir: options?.outputDir,
      includeFullNames: options?.includeFullNames,
    });
  }

  async runRecovery(
    options?: HistoricalRecoveryRunOptions,
  ): Promise<HistoricalRecoveryRunResult> {
    const audit = await this.scanOldBadRecords(options);
    const selected = audit.items.slice(
      0,
      Math.max(1, Math.min(options?.limit ?? audit.items.length, audit.items.length)),
    );
    const stageCounts: Record<HistoricalRecoveryStage, number> = {
      L0: selected.filter((item) => item.stages.includes('L0')).length,
      L1: selected.filter((item) => item.stages.includes('L1')).length,
      L2: selected.filter((item) => item.stages.includes('L2')).length,
      L3: selected.filter((item) => item.stages.includes('L3')).length,
    };

    if (options?.dryRun !== false) {
      const dryRunResult: HistoricalRecoveryRunResult = {
        scannedAt: audit.scannedAt,
        dryRun: true,
        selectedCount: selected.length,
        metrics: audit.metrics,
        stageCounts,
        selected: this.pickSamples(selected, selected.length),
        execution: {
          rerunLightAnalysis: 0,
          rerunDeepAnalysis: 0,
          claudeQueued: 0,
        },
        trainingExport: null,
      };

      await this.saveSystemConfig(RUN_CONFIG_KEY, dryRunResult);
      return dryRunResult;
    }

    const mode = options?.mode ?? 'run_recovery';
    const lightIds = this.selectRepositoryIdsByMode(selected, mode, 'L1');
    const deepIds = this.selectRepositoryIdsByMode(selected, mode, 'L2');
    const claudeIds = this.selectRepositoryIdsByMode(selected, mode, 'L3');

    const rerunLightAnalysis = await this.rerunLightAnalysis(lightIds);
    const rerunDeepAnalysis = await this.rerunDeepAnalysis(deepIds);
    const claudeQueued = await this.queueClaudeReview(claudeIds);
    const trainingExport = options?.exportTrainingSamples
      ? await this.exportTrainingSamples({
          sampleSize: Math.max(40, Math.min(selected.length * 3, 240)),
          outputDir: options.outputDir,
          includeFullNames: selected.map((item) => item.fullName),
        })
      : null;

    const result: HistoricalRecoveryRunResult = {
      scannedAt: audit.scannedAt,
      dryRun: false,
      selectedCount: selected.length,
      metrics: audit.metrics,
      stageCounts,
      selected: this.pickSamples(selected, selected.length),
      execution: {
        rerunLightAnalysis,
        rerunDeepAnalysis,
        claudeQueued,
      },
      trainingExport,
    };

    await this.saveSystemConfig(RUN_CONFIG_KEY, result);
    this.logger.log(
      `historical_data_recovery run completed selected=${selected.length} l1=${rerunLightAnalysis} l2=${rerunDeepAnalysis} l3=${claudeQueued}`,
    );

    return result;
  }

  async buildHistoricalRepairPriorityReport(
    options?: Pick<HistoricalRepairRunOptions, 'repositoryIds'>,
  ) {
    const repositoryIds = await this.resolveHistoricalRepairRepositoryIds(
      options?.repositoryIds ?? null,
    );
    return this.historicalRepairPriorityService.runPriorityReport({
      repositoryIds: repositoryIds ?? undefined,
    });
  }

  async getHistoricalRepairQueueSummary(): Promise<HistoricalRepairQueueSummary> {
    const jobs = await this.prisma.jobLog.findMany({
      where: {
        queueName: {
          in: ['analysis.single', 'analysis.snapshot'],
        },
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
      },
      select: {
        payload: true,
        queueName: true,
        jobStatus: true,
      },
    });

    const actionCounts: HistoricalRepairQueueSummary['actionCounts'] = {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
    };
    const routerCapabilityBreakdown = emptyModelTaskRouterCapabilityBreakdown();
    const routerFallbackBreakdown = emptyModelTaskRouterFallbackBreakdown();
    let routerReviewRequiredCount = 0;
    let routerDeterministicOnlyCount = 0;
    let queuedWithRouterMetadataCount = 0;
    let globalPendingCount = 0;
    let globalRunningCount = 0;
    const queuedSamples: HistoricalRepairQueueSummary['queuedSamples'] = [];

    for (const job of jobs) {
      if (job.jobStatus === JobStatus.PENDING) {
        globalPendingCount += 1;
      } else if (job.jobStatus === JobStatus.RUNNING) {
        globalRunningCount += 1;
      }
      const payload = this.readObject(job.payload);
      const action = this.readHistoricalRepairAction(payload);
      if (!action) {
        continue;
      }
      actionCounts[action] += 1;

      const routerMetadata = this.readRouterMetadata(payload);
      if (!routerMetadata) {
        continue;
      }

      queuedWithRouterMetadataCount += 1;
      routerCapabilityBreakdown[routerMetadata.routerCapabilityTier] += 1;
      routerFallbackBreakdown[routerMetadata.routerFallbackPolicy] += 1;
      if (routerMetadata.routerRequiresReview) {
        routerReviewRequiredCount += 1;
      }
      if (routerMetadata.routerCapabilityTier === 'DETERMINISTIC_ONLY') {
        routerDeterministicOnlyCount += 1;
      }
      if (queuedSamples.length < 20) {
        queuedSamples.push({
          repoId: this.readOptionalString(payload?.repositoryId),
          action,
          capabilityTier: routerMetadata.routerCapabilityTier,
          fallbackPolicy: routerMetadata.routerFallbackPolicy,
          requiresReview: routerMetadata.routerRequiresReview,
          queueName: this.readOptionalString(job.queueName),
        });
      }
    }

    return {
      totalQueued: globalPendingCount + globalRunningCount,
      globalPendingCount,
      globalRunningCount,
      actionCounts,
      routerCapabilityBreakdown,
      routerFallbackBreakdown,
      routerReviewRequiredCount,
      routerDeterministicOnlyCount,
      queuedWithRouterMetadataCount,
      queuedSamples,
    };
  }

  async runHistoricalRepairLoop(
    options?: HistoricalRepairRunOptions,
  ): Promise<HistoricalRepairRunResult> {
    const loopStartedAt = Date.now();
    const globalConcurrency = this.resolveHistoricalRepairGlobalConcurrency();
    this.logger.log(
      `historical_repair gate_config historicalRepairGlobalConcurrency=${globalConcurrency}`,
    );
    const repositoryIds = await this.resolveHistoricalRepairRepositoryIds(
      options?.repositoryIds ?? null,
    );
    const report = await this.historicalRepairPriorityService.runPriorityReport({
      repositoryIds: repositoryIds ?? undefined,
    });
    const generatedAt = new Date().toISOString();
    const previousDecisionRecalcGateSnapshot =
      await this.loadDecisionRecalcGateSnapshot();
    const decisionRecalcGateSnapshot = buildDecisionRecalcGateSnapshot({
      items: report.items.filter(
        (item) => item.historicalRepairAction === 'decision_recalc',
      ),
      previousSnapshotMap: buildDecisionRecalcGateSnapshotMap(
        previousDecisionRecalcGateSnapshot,
      ),
      generatedAt,
    });
    const hasScopedRepositoryIds = Boolean(
      Array.isArray(repositoryIds) && repositoryIds.length > 0,
    );
    const decisionRecalcGateSnapshotToPersist = hasScopedRepositoryIds
      ? mergeDecisionRecalcGateSnapshots({
          previousSnapshot: previousDecisionRecalcGateSnapshot,
          nextSnapshot: decisionRecalcGateSnapshot,
        })
      : decisionRecalcGateSnapshot;
    const decisionRecalcGateMap = buildDecisionRecalcGateSnapshotMap(
      decisionRecalcGateSnapshot,
    );
    const allowedBuckets = (options?.buckets ?? null) as ReadonlyArray<string> | null;
    const filtered = report.items
      .filter((item) => item.cleanupState === 'active')
      .filter((item) =>
        allowedBuckets?.length
          ? allowedBuckets.includes(item.historicalRepairBucket)
          : item.historicalRepairBucket !== 'archive_or_noise',
      )
      .filter((item) =>
        typeof options?.minPriorityScore === 'number'
          ? item.historicalRepairPriorityScore >= options.minPriorityScore
          : true,
      )
      .filter((item) => item.historicalRepairAction !== 'archive')
      .sort(
        (left, right) =>
          right.historicalRepairPriorityScore - left.historicalRepairPriorityScore,
      );
    const selected =
      typeof options?.limit === 'number' && options.limit > 0
        ? filtered.slice(0, options.limit)
        : filtered;
    const hasExplicitRepositoryIds = Boolean(
      Array.isArray(options?.repositoryIds) &&
        options.repositoryIds.some((repositoryId) => Boolean(repositoryId)),
    );
    const rawDispatchPlans = this.buildHistoricalRepairDispatchPlans(
      selected,
      decisionRecalcGateMap,
    );
    const recentOutcomeIndex =
      !hasExplicitRepositoryIds && rawDispatchPlans.length > 0
        ? await this.loadHistoricalRepairRecentOutcomeIndex()
        : new Map<string, HistoricalRepairRecentOutcomeRecord[]>();
    const {
      allowedPlans: dispatchPlans,
      suppressedOutcomes: lowYieldSuppressedOutcomes,
    } = hasExplicitRepositoryIds
      ? {
          allowedPlans: rawDispatchPlans,
          suppressedOutcomes: [] as HistoricalRepairDispatchOutcome[],
        }
      : this.applyHistoricalRepairLowYieldSuppression({
          plans: rawDispatchPlans,
          recentOutcomeIndex,
        });
    const grouped = this.groupHistoricalRepairActions(dispatchPlans);
    const suppressedPlans = this.buildHistoricalRepairDispatchPlans(
      report.items
        .filter(
          (item) =>
            item.cleanupState === 'freeze' ||
            item.cleanupState === 'archive' ||
            item.cleanupState === 'purge_ready',
        )
        .slice(0, 60),
      decisionRecalcGateMap,
    );
    const suppressedByCleanupCount = report.items.filter(
      (item) =>
        item.cleanupState === 'freeze' ||
        item.cleanupState === 'archive' ||
        item.cleanupState === 'purge_ready',
    ).length;
    const frontendGuardItems = report.items.filter(
      (item) =>
        item.needsImmediateFrontendDowngrade ||
        item.historicalTrustedButWeak ||
        item.cleanupState !== 'active',
    );

    if (options?.dryRun !== false) {
      const queueSummary = await this.getHistoricalRepairQueueSummary();
      const loopTelemetry = {
        loopQueuedCount: 0,
        loopQueuedPerSecond: 0,
        loopDedupeSkipCount: 0,
        loopTerminalNoRequeueSkipCount: 0,
        loopLowYieldSkipCount: lowYieldSuppressedOutcomes.length,
        totalDurationMs: Date.now() - loopStartedAt,
        historicalRepairGlobalConcurrency: globalConcurrency,
        globalPendingCount: queueSummary.globalPendingCount ?? queueSummary.totalQueued,
        globalRunningCount: queueSummary.globalRunningCount ?? 0,
        globalQueuedCount: queueSummary.totalQueued,
      };
      const dryRunOutcomeLogs = this.buildHistoricalRepairOutcomeLogs({
        refreshOnlyOutcomes: [],
        evidenceRepairOutcomes: [],
        deepRepairOutcomes: [],
        decisionRecalcOutcomes: [],
        lowYieldSuppressedOutcomes,
        downgradePlans: grouped.downgrade_only,
        suppressedPlans,
      });
      const dryRunOutcomeSnapshot = buildAnalysisOutcomeSnapshot({
        source: 'historical_repair_loop',
        generatedAt,
        items: dryRunOutcomeLogs,
      });
      await this.persistAnalysisOutcomeSnapshot(dryRunOutcomeSnapshot);

      return {
        generatedAt,
        dryRun: true,
        selectedCount: selected.length,
        visibleBrokenCount: report.summary.visibleBrokenCount,
        highValueWeakCount: report.summary.highValueWeakCount,
        staleWatchCount: report.summary.staleWatchCount,
        archiveOrNoiseCount: report.summary.archiveOrNoiseCount,
        historicalTrustedButWeakCount: report.summary.historicalTrustedButWeakCount,
        historicalRepairActionBreakdown: report.summary.actionBreakdown,
        visibleBrokenActionBreakdown: report.summary.visibleBrokenActionBreakdown,
        highValueWeakActionBreakdown: report.summary.highValueWeakActionBreakdown,
        execution: {
          downgradeOnly: 0,
          refreshOnly: 0,
          evidenceRepair: 0,
          deepRepair: 0,
          decisionRecalc: 0,
          archive: 0,
        },
        loopTelemetry,
        queueSummary,
        routerExecutionSummary: this.buildRouterExecutionSummary(
          [
            ...dispatchPlans,
            ...lowYieldSuppressedOutcomes.map((outcome) => outcome.plan),
            ...suppressedPlans,
          ],
          suppressedByCleanupCount,
        ),
        frontendGuard: {
          updatedAt: generatedAt,
          downgradedCount: frontendGuardItems.length,
          trustedButWeakCount: report.summary.historicalTrustedButWeakCount,
        },
        analysisOutcomeSummary: dryRunOutcomeSnapshot.summary,
        selected: this.mapPrioritySamples(dispatchPlans),
      };
    }

    await this.persistHistoricalRepairPrioritySnapshot(report);
    await this.persistHistoricalFrontendGuard(frontendGuardItems, generatedAt);
    await this.persistDecisionRecalcGateSnapshot(
      decisionRecalcGateSnapshotToPersist,
    );
    const inflightIndex = await this.loadHistoricalRepairInflightIndex();

    const laneExecutions = [
      {
        lane: 'refresh_only' as const,
        plans: grouped.refresh_only,
        execute: () =>
          this.enqueueHistoricalRefresh(grouped.refresh_only, inflightIndex),
      },
      {
        lane: 'evidence_repair' as const,
        plans: grouped.evidence_repair,
        execute: () =>
          this.enqueueHistoricalEvidenceRepair(
            grouped.evidence_repair,
            inflightIndex,
          ),
      },
      {
        lane: 'deep_repair' as const,
        plans: grouped.deep_repair,
        execute: () => this.enqueueHistoricalDeepRepair(grouped.deep_repair),
      },
      {
        lane: 'decision_recalc' as const,
        plans: grouped.decision_recalc,
        execute: () =>
          this.enqueueHistoricalDecisionRecalc(
            grouped.decision_recalc,
            inflightIndex,
          ),
      },
    ];
    const laneStartedAt = laneExecutions.map(() => Date.now());
    const laneSettledResults = await Promise.allSettled(
      laneExecutions.map((entry, index) => {
        laneStartedAt[index] = Date.now();
        return entry.execute();
      }),
    );
    const [
      refreshOnlyOutcomes,
      evidenceRepairOutcomes,
      deepRepairOutcomes,
      decisionRecalcOutcomes,
    ] = laneSettledResults.map((result, index) =>
      this.resolveHistoricalRepairLaneResult({
        lane: laneExecutions[index].lane,
        plans: laneExecutions[index].plans,
        settledResult: result,
        startedAt: laneStartedAt[index],
      }),
    );
    const downgradeOnly = grouped.downgrade_only.length;
    const archive = grouped.archive.length;
    const queueSummary = await this.getHistoricalRepairQueueSummary();
    const execution = {
      downgradeOnly,
      refreshOnly: refreshOnlyOutcomes.filter(
        (entry) => entry.outcomeStatus === 'partial',
      ).length,
      evidenceRepair: evidenceRepairOutcomes.filter(
        (entry) => entry.outcomeStatus === 'partial',
      ).length,
      deepRepair: deepRepairOutcomes.filter(
        (entry) => entry.outcomeStatus === 'partial',
      ).length,
      decisionRecalc: decisionRecalcOutcomes.filter(
        (entry) => entry.outcomeStatus === 'partial',
      ).length,
      archive,
    };
    const outcomeLogs = this.buildHistoricalRepairOutcomeLogs({
      refreshOnlyOutcomes,
      evidenceRepairOutcomes,
      deepRepairOutcomes,
      decisionRecalcOutcomes,
      lowYieldSuppressedOutcomes,
      downgradePlans: grouped.downgrade_only,
      suppressedPlans,
    });
    const outcomeSnapshot = buildAnalysisOutcomeSnapshot({
      source: 'historical_repair_loop',
      generatedAt,
      items: outcomeLogs,
    });
    const totalDurationMs = Date.now() - loopStartedAt;
    const loopQueuedCount =
      execution.refreshOnly +
      execution.evidenceRepair +
      execution.deepRepair +
      execution.decisionRecalc;
    const loopQueuedPerSecond = this.computeHistoricalRepairQueuedPerSecond(
      loopQueuedCount,
      totalDurationMs,
    );
    const loopDedupeSkipCount = outcomeLogs.filter((log) =>
      this.isHistoricalRepairDedupeOutcomeReason(log.execution.outcomeReason),
    ).length;
    const loopTerminalNoRequeueSkipCount = outcomeLogs.filter((log) =>
      this.isHistoricalRepairTerminalNoRequeueOutcomeReason(
        log.execution.outcomeReason,
      ),
    ).length;
    const loopLowYieldSkipCount = outcomeLogs.filter((log) =>
      this.isHistoricalRepairLowYieldOutcomeReason(log.execution.outcomeReason),
    ).length;
    const loopTelemetry = {
      loopQueuedCount,
      loopQueuedPerSecond,
      loopDedupeSkipCount,
      loopTerminalNoRequeueSkipCount,
      loopLowYieldSkipCount,
      totalDurationMs,
      historicalRepairGlobalConcurrency: globalConcurrency,
      globalPendingCount: queueSummary.globalPendingCount ?? queueSummary.totalQueued,
      globalRunningCount: queueSummary.globalRunningCount ?? 0,
      globalQueuedCount: queueSummary.totalQueued,
    };

    const result: HistoricalRepairRunResult = {
      generatedAt,
      dryRun: false,
      selectedCount: selected.length,
      visibleBrokenCount: report.summary.visibleBrokenCount,
      highValueWeakCount: report.summary.highValueWeakCount,
      staleWatchCount: report.summary.staleWatchCount,
      archiveOrNoiseCount: report.summary.archiveOrNoiseCount,
      historicalTrustedButWeakCount: report.summary.historicalTrustedButWeakCount,
      historicalRepairActionBreakdown: report.summary.actionBreakdown,
      visibleBrokenActionBreakdown: report.summary.visibleBrokenActionBreakdown,
      highValueWeakActionBreakdown: report.summary.highValueWeakActionBreakdown,
      execution,
      loopTelemetry,
      queueSummary,
      routerExecutionSummary: this.buildRouterExecutionSummary(
        [
          ...dispatchPlans,
          ...lowYieldSuppressedOutcomes.map((outcome) => outcome.plan),
          ...suppressedPlans,
        ],
        suppressedByCleanupCount,
      ),
      frontendGuard: {
        updatedAt: generatedAt,
        downgradedCount: frontendGuardItems.length,
        trustedButWeakCount: report.summary.historicalTrustedButWeakCount,
      },
      analysisOutcomeSummary: outcomeSnapshot.summary,
      selected: this.mapPrioritySamples(dispatchPlans),
    };

    await this.persistAnalysisOutcomeSnapshot(outcomeSnapshot);
    await this.persistHistoricalRepairRecentOutcomes(outcomeLogs);
    await this.saveSystemConfig(RUN_CONFIG_KEY, result);
    this.logHistoricalRepairLoopTelemetry({
      selectedCount: selected.length,
      loopQueuedCount,
      loopQueuedPerSecond,
      globalPendingCount: loopTelemetry.globalPendingCount,
      globalRunningCount: loopTelemetry.globalRunningCount,
      globalQueuedCount: loopTelemetry.globalQueuedCount,
      loopDedupeSkipCount: loopTelemetry.loopDedupeSkipCount,
      loopTerminalNoRequeueSkipCount:
        loopTelemetry.loopTerminalNoRequeueSkipCount,
      loopLowYieldSkipCount: loopTelemetry.loopLowYieldSkipCount,
      totalDurationMs,
      historicalRepairGlobalConcurrency: globalConcurrency,
      execution: result.execution,
    });
    return result;
  }

  private async loadRepositories() {
    const batchSize = 200;
    const repositories: RepositoryRecoveryTarget[] = [];
    let cursorId: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const batch: RepositoryRecoveryTarget[] = await this.prisma.repository.findMany({
        ...(cursorId
          ? {
              cursor: { id: cursorId },
              skip: 1,
            }
          : {}),
        orderBy: {
          id: 'asc',
        },
        take: batchSize,
        include: {
          analysis: true,
          content: true,
          favorite: true,
        },
      });

      if (!batch.length) {
        break;
      }

      repositories.push(...batch);

      cursorId = batch[batch.length - 1]?.id ?? null;
      if (!cursorId) {
        hasMore = false;
      }
    }

    return repositories;
  }

  private async loadExposureSets() {
    const summaries = await this.prisma.dailyRadarSummary.findMany({
      orderBy: {
        date: 'desc',
      },
      take: 14,
      select: {
        topRepositoryIds: true,
        topGoodRepositoryIds: true,
        topCloneRepositoryIds: true,
        topIgnoredRepositoryIds: true,
        telegramSendStatus: true,
      },
    });

    const homepageIds = new Set<string>();
    const dailySummaryIds = new Set<string>();
    const telegramIds = new Set<string>();

    for (const summary of summaries) {
      const topIds = this.readStringArray(summary.topRepositoryIds);
      const goodIds = this.readStringArray(summary.topGoodRepositoryIds);
      const cloneIds = this.readStringArray(summary.topCloneRepositoryIds);
      const ignoredIds = this.readStringArray(summary.topIgnoredRepositoryIds);
      const allIds = [...topIds, ...goodIds, ...cloneIds, ...ignoredIds];

      for (const repositoryId of allIds) {
        dailySummaryIds.add(repositoryId);
      }
      for (const repositoryId of [...topIds, ...goodIds, ...cloneIds]) {
        homepageIds.add(repositoryId);
      }
      if (summary.telegramSendStatus === 'SENT') {
        for (const repositoryId of allIds) {
          telegramIds.add(repositoryId);
        }
      }
    }

    return {
      homepageIds,
      dailySummaryIds,
      telegramIds,
    };
  }

  private toRecoverySignal(
    repository: Record<string, unknown>,
    exposureSets: {
      homepageIds: Set<string>;
      dailySummaryIds: Set<string>;
      telegramIds: Set<string>;
    },
  ): HistoricalRecoverySignal {
    const analysis = this.readObject(repository.analysis);
    const finalDecision = this.readObject(repository.finalDecision);
    const moneyDecision = this.readObject(finalDecision?.moneyDecision);
    const trainingAsset = this.readObject(repository.trainingAsset);
    const snapshot = this.readObject(analysis?.ideaSnapshotJson);
    const insight = this.readObject(analysis?.insightJson);
    const categoryDisplay = this.readObject(insight?.categoryDisplay);
    const repositoryId = this.readString(repository.id);

    return {
      repoId: repositoryId,
      fullName: this.readString(repository.fullName),
      htmlUrl: this.readString(repository.htmlUrl),
      oneLinerZh:
        this.readString(finalDecision?.oneLinerZh) ||
        this.readString(insight?.oneLinerZh) ||
        this.readString(snapshot?.oneLinerZh) ||
        this.readString(repository.description) ||
        this.readString(repository.fullName),
      description: this.readOptionalString(repository.description),
      repoName: this.readOptionalString(repository.name),
      updatedAt:
        this.readOptionalString(repository.updatedAtGithub) ||
        this.readOptionalString(repository.updatedAt) ||
        null,
      projectType:
        this.normalizeProjectType(finalDecision?.projectType) ??
        this.normalizeProjectType(this.readObject(insight?.projectReality)?.type) ??
        null,
      category:
        this.readOptionalString(finalDecision?.categoryLabelZh) ||
        this.readOptionalString(finalDecision?.category) ||
        this.readOptionalString(categoryDisplay?.label) ||
        null,
      hasRealUser: this.readOptionalBoolean(
        this.readObject(insight?.projectReality)?.hasRealUser,
      ),
      hasClearUseCase: this.readOptionalBoolean(
        this.readObject(insight?.projectReality)?.hasClearUseCase,
      ),
      isDirectlyMonetizable: this.readOptionalBoolean(
        this.readObject(insight?.projectReality)?.isDirectlyMonetizable,
      ),
      verdict: this.normalizeVerdict(finalDecision?.verdict),
      action:
        this.normalizeAction(finalDecision?.action) ??
        this.normalizeAction(snapshot?.nextAction) ??
        null,
      priority: this.normalizePriority(finalDecision?.moneyPriority),
      source: this.normalizeSource(finalDecision?.source),
      strength: this.normalizeStrength(finalDecision?.oneLinerStrength),
      targetUsersLabel: this.readOptionalString(moneyDecision?.targetUsersZh),
      monetizationLabel: this.readOptionalString(moneyDecision?.monetizationSummaryZh),
      whyLabel:
        this.readOptionalString(finalDecision?.reasonZh) ||
        this.readOptionalString(moneyDecision?.reasonZh) ||
        this.readOptionalString(snapshot?.reason) ||
        null,
      snapshotPromising: this.readOptionalBoolean(snapshot?.isPromising),
      snapshotNextAction: this.readOptionalString(snapshot?.nextAction),
      fallbackUsed: this.readOptionalBoolean(analysis?.fallbackUsed) === true,
      hasSnapshot: Boolean(snapshot),
      hasInsight: Boolean(insight),
      hasFinalDecision: Boolean(finalDecision),
      hasIdeaFit: Boolean(analysis?.ideaFitJson),
      hasIdeaExtract: Boolean(analysis?.extractedIdeaJson),
      hasCompleteness: Boolean(analysis?.completenessJson),
      hasClaudeReview: Boolean(analysis?.claudeReviewJson),
      hasConflict: this.readOptionalBoolean(finalDecision?.hasConflict) === true,
      needsRecheck: this.readOptionalBoolean(finalDecision?.needsRecheck) === true,
      isFavorited: this.readOptionalBoolean(repository.isFavorited) === true,
      favoritePriority: this.normalizeFavoritePriority(
        this.readObject(repository.favorite)?.priority,
      ),
      appearedOnHomepage: exposureSets.homepageIds.has(repositoryId),
      appearedInDailySummary: exposureSets.dailySummaryIds.has(repositoryId),
      appearedInTelegram: exposureSets.telegramIds.has(repositoryId),
      claudeDiffTypes: this.readStringArray(trainingAsset?.diffTypes),
      claudeMistakeTypes: this.readStringArray(trainingAsset?.mistakeTypes),
    };
  }

  private async filterAssessments(
    items: HistoricalRecoveryAssessment[],
    options?: HistoricalRecoveryScanOptions,
  ) {
    const filtered = items
      .filter((item) =>
        options?.priority ? item.priority === options.priority : true,
      )
      .filter((item) =>
        options?.onlyConflicts ? item.metrics.claudeConflict : true,
      )
      .filter((item) =>
        options?.onlyFeatured ? item.metrics.homepageBadCard : true,
      )
      .filter((item) =>
        options?.onlyFallback ? item.metrics.fallbackVisible : true,
      )
      .filter((item) =>
        options?.onlyIncomplete ? item.metrics.incompleteAnalysisVisible : true,
      )
      .filter((item) =>
        options?.onlyHighValue
          ? item.priority === 'P0' || item.priority === 'P1'
          : true,
      )
      .filter((item) =>
        options?.onlyMissingDeep ? item.stages.includes('L2') : true,
      )
      .sort((left, right) => this.rankAssessment(left) - this.rankAssessment(right));

    return this.adaptiveSchedulerService.prioritizeRecoveryAssessments(filtered);
  }

  private rankAssessment(item: HistoricalRecoveryAssessment) {
    const priorityRank = item.priority === 'P0' ? 0 : item.priority === 'P1' ? 1 : 2;
    const severityRank = item.severe ? 0 : 1;
    return priorityRank * 10 + severityRank;
  }

  private buildMissingDeepAnalysisDto(repository: {
    analysis: RepositoryAnalysis | null;
  }) {
    return {
      runFastFilter: false,
      runCompleteness: !repository.analysis?.completenessJson,
      runIdeaFit: !repository.analysis?.ideaFitJson,
      runIdeaExtract: !repository.analysis?.extractedIdeaJson,
      forceRerun: false,
    };
  }

  private async loadHistoricalRecoveryDeepAnalysisRepositoryMap(
    repositoryIds: string[],
  ) {
    const uniqueRepositoryIds = [...new Set(repositoryIds.filter(Boolean))];
    if (!uniqueRepositoryIds.length) {
      return new Map<
        string,
        Repository & {
          analysis: RepositoryAnalysis | null;
        }
      >();
    }

    const repositoryIdChunks = this.chunkItems(
      uniqueRepositoryIds,
      HISTORICAL_REPAIR_DEEP_LOOKUP_CHUNK_SIZE,
    );
    const repositoriesByChunk = await runWithConcurrency(
      repositoryIdChunks,
      Math.min(
        HISTORICAL_REPAIR_DEEP_LOOKUP_CONCURRENCY,
        repositoryIdChunks.length,
      ),
      (repositoryIdChunk) =>
        this.prisma.repository.findMany({
          where: {
            id: {
              in: repositoryIdChunk,
            },
          },
          include: {
            analysis: true,
          },
        }),
    );

    return new Map(
      repositoriesByChunk
        .flat()
        .map((repository) => [repository.id, repository]),
    );
  }

  private async enqueueHistoricalRecoverySingleAnalysisEntries(
    entries: SingleAnalysisBulkEntries,
    triggeredBy: string,
  ) {
    if (!entries.length) {
      return 0;
    }

    const bulkQueueService = this.queueService as QueueService & {
      enqueueSingleAnalysesBulk?: QueueService['enqueueSingleAnalysesBulk'];
    };
    let queuedCount = 0;
    const entryBatches = this.chunkItems(
      entries,
      HISTORICAL_REPAIR_SINGLE_ANALYSIS_BULK_BATCH_SIZE,
    );

    for (const entryBatch of entryBatches) {
      if (typeof bulkQueueService.enqueueSingleAnalysesBulk === 'function') {
        try {
          const results = await bulkQueueService.enqueueSingleAnalysesBulk(
            entryBatch,
            triggeredBy,
          );
          queuedCount += results.length;
          continue;
        } catch (error) {
          this.logger.warn(
            `historical_recovery bulk single-analysis enqueue failed triggeredBy=${triggeredBy} batchSize=${entryBatch.length} reason=${this.readErrorMessage(error) || 'unknown'} fallback=single_enqueue`,
          );
        }
      }

      const fallbackResults = await runWithConcurrency(
        entryBatch,
        this.resolveHistoricalRecoverySingleAnalysisFallbackConcurrency(
          entryBatch.length,
        ),
        async (entry) => {
          await this.enqueueHistoricalRecoverySingleAnalysisEntry(
            entry,
            triggeredBy,
          );
          return 1;
        },
      );
      queuedCount += fallbackResults.length;
    }

    return queuedCount;
  }

  private async enqueueHistoricalRecoverySingleAnalysisEntry(
    entry: SingleAnalysisBulkEntry,
    triggeredBy: string,
  ) {
    return this.queueService.enqueueSingleAnalysis(
      entry.repositoryId,
      entry.dto,
      entry.triggeredBy ?? triggeredBy,
      {
        parentJobId: entry.parentJobId,
        metadata: entry.metadata,
        jobOptionsOverride: entry.jobOptionsOverride,
      },
    );
  }

  private selectRepositoryIdsByMode(
    items: HistoricalRecoveryAssessment[],
    mode:
      | 'run_recovery'
      | 'repair_display_only'
      | 'rerun_light_analysis'
      | 'rerun_full_deep'
      | 'queue_claude_review',
    stage: HistoricalRecoveryStage,
  ) {
    if (mode === 'repair_display_only') {
      return stage === 'L0' || stage === 'L1'
        ? items
            .filter((item) => item.stages.includes('L1'))
            .map((item) => item.repoId)
        : [];
    }

    if (mode === 'rerun_light_analysis') {
      return stage === 'L1'
        ? items
            .filter((item) => item.stages.includes('L1'))
            .map((item) => item.repoId)
        : [];
    }

    if (mode === 'rerun_full_deep') {
      return stage === 'L2'
        ? items
            .filter((item) => item.stages.includes('L2'))
            .map((item) => item.repoId)
        : [];
    }

    if (mode === 'queue_claude_review') {
      return stage === 'L3'
        ? items
            .filter((item) => item.stages.includes('L3'))
            .map((item) => item.repoId)
        : [];
    }

    return items
      .filter((item) => item.stages.includes(stage))
      .map((item) => item.repoId);
  }

  private buildHistoricalRepairDispatchPlans(
    items: HistoricalRepairPriorityItem[],
    decisionRecalcGateMap?: DecisionRecalcGateSnapshotMap | null,
  ): HistoricalRepairDispatchPlan[] {
    return items
      .map((item) => {
        const input = buildModelTaskRouterDecisionInputFromHistoricalItem(item);
        const baseRouterDecision = buildModelTaskRouterDecision(input);
        const recalcGate =
          item.historicalRepairAction === 'decision_recalc'
            ? decisionRecalcGateMap?.get(item.repoId) ?? null
            : null;
        const routerDecision = recalcGate
          ? {
              ...baseRouterDecision,
              routerReasonSummary: this.decorateRecalcRouterReasonSummary(
                baseRouterDecision.routerReasonSummary,
                recalcGate,
              ),
            }
          : baseRouterDecision;
        const routerMetadata = buildModelTaskRouterExecutionMetadata({
          input,
          decision: routerDecision,
        });
        if (recalcGate) {
          routerMetadata.recalcGateDecision = recalcGate.recalcGateDecision;
          routerMetadata.recalcGateReason = recalcGate.recalcGateReason;
          routerMetadata.recalcSignalChanged = recalcGate.recalcSignalChanged;
          routerMetadata.recalcSignalDiffSummary =
            recalcGate.recalcSignalDiffSummary;
          routerMetadata.recalcGateConfidence = recalcGate.recalcGateConfidence;
          routerMetadata.recalcFingerprintHash =
            recalcGate.recalcFingerprintHash;
        }

        return {
          item,
          routerDecision,
          routerMetadata,
          recalcGate,
        };
      })
      .sort((left, right) => {
        const priorityDiff =
          this.routerPriorityRank(left.routerDecision.routerPriorityClass) -
          this.routerPriorityRank(right.routerDecision.routerPriorityClass);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return (
          right.item.historicalRepairPriorityScore -
          left.item.historicalRepairPriorityScore
        );
      });
  }

  private buildRouterExecutionSummary(
    plans: HistoricalRepairDispatchPlan[],
    suppressedCount: number,
  ) {
    const routerCapabilityBreakdown = emptyModelTaskRouterCapabilityBreakdown();
    const routerFallbackBreakdown = emptyModelTaskRouterFallbackBreakdown();
    let routerReviewRequiredCount = 0;
    let routerDeterministicOnlyCount = 0;
    let recalcReplaySuppressedCount = 0;
    let recalcCleanupSuppressedCount = 0;
    let recalcAllowedCount = 0;
    let recalcAllowedButNoChangeExpectedCount = 0;
    let recalcSignalChangedCount = 0;
    let recalcSignalUnchangedCount = 0;
    const replayConflictBreakdown = new Map<string, number>();

    for (const plan of plans) {
      routerCapabilityBreakdown[plan.routerDecision.capabilityTier] += 1;
      routerFallbackBreakdown[plan.routerDecision.fallbackPolicy] += 1;
      if (plan.routerDecision.requiresReview) {
        routerReviewRequiredCount += 1;
      }
      if (plan.routerDecision.capabilityTier === 'DETERMINISTIC_ONLY') {
        routerDeterministicOnlyCount += 1;
      }
      if (plan.recalcGate) {
        if (plan.recalcGate.recalcSignalChanged) {
          recalcSignalChangedCount += 1;
        } else {
          recalcSignalUnchangedCount += 1;
        }

        switch (plan.recalcGate.recalcGateDecision) {
          case 'suppress_replay':
            recalcReplaySuppressedCount += 1;
            for (const conflictType of plan.recalcGate.replayedConflictSignals) {
              replayConflictBreakdown.set(
                conflictType,
                (replayConflictBreakdown.get(conflictType) ?? 0) + 1,
              );
            }
            break;
          case 'suppress_cleanup':
            recalcCleanupSuppressedCount += 1;
            break;
          case 'allow_recalc':
            recalcAllowedCount += 1;
            break;
          case 'allow_recalc_but_expect_no_change':
            recalcAllowedButNoChangeExpectedCount += 1;
            break;
        }
      }
    }

    return {
      routerCapabilityBreakdown,
      routerFallbackBreakdown,
      routerReviewRequiredCount,
      routerDeterministicOnlyCount,
      frozenOrArchivedTaskSuppressedCount: suppressedCount,
      recalcReplaySuppressedCount,
      recalcCleanupSuppressedCount,
      recalcAllowedCount,
      recalcAllowedButNoChangeExpectedCount,
      recalcSignalChangedCount,
      recalcSignalUnchangedCount,
      topReplayConflictTypes: Array.from(replayConflictBreakdown.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 12)
        .map(([conflictType, count]) => ({ conflictType, count })),
    };
  }

  private groupHistoricalRepairActions(plans: HistoricalRepairDispatchPlan[]) {
    return {
      downgrade_only: plans.filter(
        (plan) => plan.item.historicalRepairAction === 'downgrade_only',
      ),
      refresh_only: plans.filter(
        (plan) => plan.item.historicalRepairAction === 'refresh_only',
      ),
      evidence_repair: plans.filter(
        (plan) => plan.item.historicalRepairAction === 'evidence_repair',
      ),
      deep_repair: plans.filter(
        (plan) => plan.item.historicalRepairAction === 'deep_repair',
      ),
      decision_recalc: plans.filter(
        (plan) => plan.item.historicalRepairAction === 'decision_recalc',
      ),
      archive: plans.filter(
        (plan) => plan.item.historicalRepairAction === 'archive',
      ),
    };
  }

  private async enqueueHistoricalRefresh(
    plans: HistoricalRepairDispatchPlan[],
    inflightIndex: HistoricalRepairInflightIndex,
  ) {
    return this.enqueueHistoricalSnapshotLane({
      lane: 'refresh_only',
      plans,
      inflightIndex,
      queuedOutcomeReason: 'queued_refresh_only_execution',
      enqueueFailureReason: 'refresh_enqueue_failed',
      executionUsedFallback: (plan) =>
        plan.routerDecision.allowsDeterministicFallback ||
        plan.routerDecision.fallbackPolicy === 'DETERMINISTIC_ONLY',
    });
  }

  private async enqueueHistoricalEvidenceRepair(
    plans: HistoricalRepairDispatchPlan[],
    inflightIndex: HistoricalRepairInflightIndex,
  ) {
    return this.enqueueHistoricalSnapshotLane({
      lane: 'evidence_repair',
      plans,
      inflightIndex,
      queuedOutcomeReason: 'queued_evidence_repair_execution',
      enqueueFailureReason: 'evidence_repair_enqueue_failed',
      executionUsedFallback: (plan) =>
        plan.routerDecision.allowsDeterministicFallback ||
        plan.routerDecision.fallbackPolicy === 'LIGHT_DERIVATION' ||
        plan.routerDecision.capabilityTier === 'LIGHT',
    });
  }

  private async enqueueHistoricalDeepRepair(plans: HistoricalRepairDispatchPlan[]) {
    if (!plans.length) {
      return [];
    }

    const concurrency = this.resolveHistoricalRepairLaneConcurrency(
      'deep_repair',
      plans.length,
    );
    const telemetry = this.createHistoricalRepairLaneTelemetry();
    const bulkQueueService = this.queueService as QueueService & {
      enqueueSingleAnalysesBulk?: QueueService['enqueueSingleAnalysesBulk'];
    };

    try {
      const repositoryMap = await this.loadDeepRepairRepositoryMap(
        plans,
        telemetry,
      );
      const filtered = plans.reduce<{
        queueablePlans: HistoricalRepairDispatchPlan[];
        outcomeMap: Map<
          HistoricalRepairDispatchPlan,
          HistoricalRepairDispatchOutcome
        >;
      }>(
        (acc, plan) => {
          const startedAt = Date.now();
          const item = plan.item;
          const repository = repositoryMap.get(item.repoId) ?? null;

          if (!repository) {
            acc.outcomeMap.set(plan, {
              plan,
              outcomeStatus: 'skipped',
              outcomeReason: 'repository_missing_for_deep_repair',
              executionDurationMs: Date.now() - startedAt,
            });
            return acc;
          }

          const dto = this.buildMissingDeepAnalysisDto(repository);
          if (!dto.runCompleteness && !dto.runIdeaFit && !dto.runIdeaExtract) {
            acc.outcomeMap.set(plan, {
              plan,
              outcomeStatus: 'no_change',
              outcomeReason: 'deep_targets_already_present',
              executionDurationMs: Date.now() - startedAt,
            });
            return acc;
          }

          acc.queueablePlans.push(plan);
          return acc;
        },
        {
          queueablePlans: [],
          outcomeMap: new Map(),
        },
      );

      if (!filtered.queueablePlans.length) {
        return plans
          .map((plan) => filtered.outcomeMap.get(plan) ?? null)
          .filter(Boolean) as HistoricalRepairDispatchOutcome[];
      }

      const planBatches = this.chunkItems(
        filtered.queueablePlans,
        HISTORICAL_REPAIR_SINGLE_ANALYSIS_BULK_BATCH_SIZE,
      );

      for (const planBatch of planBatches) {
        if (typeof bulkQueueService.enqueueSingleAnalysesBulk === 'function') {
          telemetry.bulkBatchCount += 1;
          const bulkStartedAt = Date.now();

          try {
            await this.runWithinHistoricalRepairGlobalGate({
              telemetry,
              handler: () =>
                bulkQueueService.enqueueSingleAnalysesBulk!(
                  planBatch.map((plan) =>
                    this.buildHistoricalDeepRepairBulkEntry(
                      plan,
                      repositoryMap.get(plan.item.repoId)!,
                    ),
                  ),
                  'historical_repair',
                ),
            });
            const durationMs = Date.now() - bulkStartedAt;
            for (const plan of planBatch) {
              filtered.outcomeMap.set(
                plan,
                this.buildHistoricalDeepRepairQueuedOutcome(
                  plan,
                  durationMs,
                ),
              );
            }
            continue;
          } catch (error) {
            telemetry.bulkFallbackCount += 1;
            this.logger.warn(
              `historical_repair bulk single-analysis lane failed lane=deep_repair batchSize=${planBatch.length} reason=${this.readErrorMessage(error) || 'unknown'} fallback=single_enqueue`,
            );
          }
        }

        const fallbackOutcomes = await this.enqueueHistoricalDeepRepairFallbackBatch(
          {
            plans: planBatch,
            concurrency,
            telemetry,
            repositoryMap,
          },
        );
        for (const outcome of fallbackOutcomes) {
          filtered.outcomeMap.set(outcome.plan, outcome);
        }
      }

      return plans
        .map((plan) => filtered.outcomeMap.get(plan) ?? null)
        .filter(Boolean) as HistoricalRepairDispatchOutcome[];
    } finally {
      this.logHistoricalRepairLaneTelemetry('deep_repair', telemetry);
    }
  }

  private async enqueueHistoricalDeepRepairFallbackBatch(args: {
    plans: HistoricalRepairDispatchPlan[];
    concurrency: number;
    telemetry: HistoricalRepairLaneTelemetry;
    repositoryMap: Awaited<
      ReturnType<HistoricalDataRecoveryService['loadDeepRepairRepositoryMap']>
    >;
  }) {
    return runWithConcurrency<
      HistoricalRepairDispatchPlan,
      HistoricalRepairDispatchOutcome
    >(args.plans, args.concurrency, async (plan) => {
      const startedAt = Date.now();
      const repository = args.repositoryMap.get(plan.item.repoId);

      if (!repository) {
        return {
          plan,
          outcomeStatus: 'skipped',
          outcomeReason: 'repository_missing_for_deep_repair',
          executionDurationMs: Date.now() - startedAt,
        };
      }

      try {
        const queueInput = this.buildHistoricalDeepRepairQueueInput(
          plan,
          repository,
        );
        await this.runWithinHistoricalRepairGlobalGate({
          telemetry: args.telemetry,
          handler: () =>
            this.queueService.enqueueSingleAnalysis(
              queueInput.repositoryId,
              queueInput.dto,
              'historical_repair',
              queueInput.options,
            ),
        });
        return this.buildHistoricalDeepRepairQueuedOutcome(
          plan,
          Date.now() - startedAt,
        );
      } catch (error) {
        return this.buildHistoricalRepairDispatchFailureOutcome({
          plan,
          lane: 'deep_repair',
          fallbackReason: 'deep_repair_enqueue_failed',
          startedAt,
          error,
        });
      }
    });
  }

  private async enqueueHistoricalDecisionRecalc(
    plans: HistoricalRepairDispatchPlan[],
    inflightIndex: HistoricalRepairInflightIndex,
  ) {
    if (!plans.length) {
      return [];
    }

    const concurrency = this.resolveHistoricalRepairLaneConcurrency(
      'decision_recalc',
      plans.length,
    );
    const telemetry = this.createHistoricalRepairLaneTelemetry();
    const bulkQueueService = this.queueService as QueueService & {
      enqueueSingleAnalysesBulk?: QueueService['enqueueSingleAnalysesBulk'];
    };

    try {
      const filtered = plans.reduce<{
        allowedPlans: HistoricalRepairDispatchPlan[];
        skippedOutcomeMap: Map<
          HistoricalRepairDispatchPlan,
          HistoricalRepairDispatchOutcome
        >;
      }>(
        (acc, plan) => {
          if (
            plan.recalcGate?.recalcGateDecision === 'suppress_replay' ||
            plan.recalcGate?.recalcGateDecision === 'suppress_cleanup'
          ) {
            acc.skippedOutcomeMap.set(plan, {
              plan,
              outcomeStatus: 'skipped',
              outcomeReason: plan.recalcGate.recalcGateReason,
              executionDurationMs: 0,
              executionUsedFallback: true,
            });
            return acc;
          }

          const suppression = this.shouldSuppressHistoricalRepairPlan({
            lane: 'decision_recalc',
            plan,
            inflightIndex,
          });
          if (!suppression.suppressed) {
            acc.allowedPlans.push(plan);
            return acc;
          }

          if (suppression.suppressionType === 'dedupe') {
            telemetry.dedupeSkipCount += 1;
          }
          if (suppression.suppressionType === 'terminal_no_requeue') {
            telemetry.terminalNoRequeueSkipCount += 1;
          }
          acc.skippedOutcomeMap.set(plan, {
            plan,
            outcomeStatus: 'skipped',
            outcomeReason: suppression.reason ?? 'decision_recalc_suppressed',
            executionDurationMs: 0,
            executionUsedFallback: true,
          });
          return acc;
        },
        {
          allowedPlans: [],
          skippedOutcomeMap: new Map(),
        },
      );

      if (!filtered.allowedPlans.length) {
        return plans
          .map((plan) => filtered.skippedOutcomeMap.get(plan) ?? null)
          .filter(Boolean) as HistoricalRepairDispatchOutcome[];
      }

      const outcomeMap = new Map<
        HistoricalRepairDispatchPlan,
        HistoricalRepairDispatchOutcome
      >(filtered.skippedOutcomeMap);
      const planBatches = this.chunkItems(
        filtered.allowedPlans,
        HISTORICAL_REPAIR_SINGLE_ANALYSIS_BULK_BATCH_SIZE,
      );

      for (const planBatch of planBatches) {
        if (typeof bulkQueueService.enqueueSingleAnalysesBulk === 'function') {
          telemetry.bulkBatchCount += 1;
          const bulkStartedAt = Date.now();

          try {
            await this.runWithinHistoricalRepairGlobalGate({
              telemetry,
              handler: () =>
                bulkQueueService.enqueueSingleAnalysesBulk!(
                  planBatch.map((plan) =>
                    this.buildHistoricalDecisionRecalcBulkEntry(plan),
                  ),
                  'historical_repair',
                ),
            });
            const durationMs = Date.now() - bulkStartedAt;
            for (const plan of planBatch) {
              outcomeMap.set(
                plan,
                this.buildHistoricalDecisionRecalcQueuedOutcome(
                  plan,
                  durationMs,
                ),
              );
            }
            continue;
          } catch (error) {
            telemetry.bulkFallbackCount += 1;
            this.logger.warn(
              `historical_repair bulk single-analysis lane failed lane=decision_recalc batchSize=${planBatch.length} reason=${this.readErrorMessage(error) || 'unknown'} fallback=single_enqueue`,
            );
          }
        }

        const fallbackOutcomes =
          await this.enqueueHistoricalDecisionRecalcFallbackBatch({
            plans: planBatch,
            concurrency,
            telemetry,
          });
        for (const outcome of fallbackOutcomes) {
          outcomeMap.set(outcome.plan, outcome);
        }
      }

      return plans
        .map((plan) => outcomeMap.get(plan) ?? null)
        .filter(Boolean) as HistoricalRepairDispatchOutcome[];
    } finally {
      this.logHistoricalRepairLaneTelemetry('decision_recalc', telemetry);
    }
  }

  private async enqueueHistoricalDecisionRecalcFallbackBatch(args: {
    plans: HistoricalRepairDispatchPlan[];
    concurrency: number;
    telemetry: HistoricalRepairLaneTelemetry;
  }) {
    return runWithConcurrency<
      HistoricalRepairDispatchPlan,
      HistoricalRepairDispatchOutcome
    >(args.plans, args.concurrency, async (plan) => {
      const startedAt = Date.now();
      const queueInput = this.buildHistoricalDecisionRecalcQueueInput(plan);

      try {
        await this.runWithinHistoricalRepairGlobalGate({
          telemetry: args.telemetry,
          handler: () =>
            this.queueService.enqueueSingleAnalysis(
              queueInput.repositoryId,
              queueInput.dto,
              'historical_repair',
              queueInput.options,
            ),
        });
        return this.buildHistoricalDecisionRecalcQueuedOutcome(
          plan,
          Date.now() - startedAt,
        );
      } catch (error) {
        return this.buildHistoricalRepairDispatchFailureOutcome({
          plan,
          lane: 'decision_recalc',
          fallbackReason: 'decision_recalc_enqueue_failed',
          startedAt,
          error,
        });
      }
    });
  }

  private async enqueueHistoricalSnapshotLane(args: {
    lane: 'refresh_only' | 'evidence_repair';
    plans: HistoricalRepairDispatchPlan[];
    inflightIndex: HistoricalRepairInflightIndex;
    queuedOutcomeReason: string;
    enqueueFailureReason: string;
    executionUsedFallback: (
      plan: HistoricalRepairDispatchPlan,
    ) => boolean | undefined;
  }) {
    if (!args.plans.length) {
      return [];
    }

    const telemetry = this.createHistoricalRepairLaneTelemetry();
    const concurrency = this.resolveHistoricalRepairLaneConcurrency(
      args.lane,
      args.plans.length,
    );
    const windowDate = new Date().toISOString().slice(0, 10);

    try {
      const filtered = args.plans.reduce<{
        allowedPlans: HistoricalRepairDispatchPlan[];
        skippedOutcomeMap: Map<
          HistoricalRepairDispatchPlan,
          HistoricalRepairDispatchOutcome
        >;
      }>(
        (acc, plan) => {
          const suppression = this.shouldSuppressHistoricalRepairPlan({
            lane: args.lane,
            plan,
            inflightIndex: args.inflightIndex,
          });
          if (!suppression.suppressed) {
            acc.allowedPlans.push(plan);
            return acc;
          }

          if (suppression.suppressionType === 'dedupe') {
            telemetry.dedupeSkipCount += 1;
          }
          if (suppression.suppressionType === 'terminal_no_requeue') {
            telemetry.terminalNoRequeueSkipCount += 1;
          }
          acc.skippedOutcomeMap.set(plan, {
            plan,
            outcomeStatus: 'skipped',
            outcomeReason: suppression.reason ?? `${args.lane}_suppressed`,
            executionDurationMs: 0,
            executionUsedFallback: true,
          });
          return acc;
        },
        {
          allowedPlans: [],
          skippedOutcomeMap: new Map(),
        },
      );
      if (!filtered.allowedPlans.length) {
        return args.plans
          .map((plan) => filtered.skippedOutcomeMap.get(plan) ?? null)
          .filter(Boolean) as HistoricalRepairDispatchOutcome[];
      }

      const outcomeMap = new Map<
        HistoricalRepairDispatchPlan,
        HistoricalRepairDispatchOutcome
      >(filtered.skippedOutcomeMap);
      const planBatches = this.chunkItems(
        filtered.allowedPlans,
        HISTORICAL_REPAIR_SNAPSHOT_BULK_BATCH_SIZE,
      );

      for (const planBatch of planBatches) {
        const batchEntries = planBatch.map((plan) =>
          this.buildHistoricalSnapshotBulkEntry(plan, windowDate),
        );
        const bulkStartedAt = Date.now();
        telemetry.bulkBatchCount += 1;

        try {
          await this.runWithinHistoricalRepairGlobalGate({
            telemetry,
            handler: () =>
              this.queueService.enqueueIdeaSnapshotsBulk(
                batchEntries,
                'historical_repair',
              ),
          });
          const durationMs = Date.now() - bulkStartedAt;
          for (const plan of planBatch) {
            outcomeMap.set(plan, {
              plan,
              outcomeStatus: 'partial' as const,
              outcomeReason: args.queuedOutcomeReason,
              executionDurationMs: durationMs,
              executionUsedFallback: args.executionUsedFallback(plan),
            });
          }
          continue;
        } catch (error) {
          telemetry.bulkFallbackCount += 1;
          this.logger.warn(
            `historical_repair bulk snapshot lane failed lane=${args.lane} batchSize=${planBatch.length} reason=${this.readErrorMessage(error) || 'unknown'} fallback=single_enqueue`,
          );
        }

        const fallbackOutcomes = await this.enqueueHistoricalSnapshotLaneFallbackBatch(
          {
            ...args,
            plans: planBatch,
            concurrency,
            telemetry,
            windowDate,
          },
        );
        for (const outcome of fallbackOutcomes) {
          outcomeMap.set(outcome.plan, outcome);
        }
      }

      return args.plans
        .map((plan) => outcomeMap.get(plan) ?? null)
        .filter(Boolean) as HistoricalRepairDispatchOutcome[];
    } finally {
      this.logHistoricalRepairLaneTelemetry(args.lane, telemetry);
    }
  }

  private async enqueueHistoricalSnapshotLaneFallbackBatch(args: {
    lane: 'refresh_only' | 'evidence_repair';
    plans: HistoricalRepairDispatchPlan[];
    inflightIndex: HistoricalRepairInflightIndex;
    queuedOutcomeReason: string;
    enqueueFailureReason: string;
    executionUsedFallback: (
      plan: HistoricalRepairDispatchPlan,
    ) => boolean | undefined;
    concurrency: number;
    telemetry: HistoricalRepairLaneTelemetry;
    windowDate: string;
  }) {
    return runWithConcurrency<
      HistoricalRepairDispatchPlan,
      HistoricalRepairDispatchOutcome
    >(args.plans, args.concurrency, async (plan) => {
      const startedAt = Date.now();

      const suppression = this.shouldSuppressHistoricalRepairPlan({
        lane: args.lane,
        plan,
        inflightIndex: args.inflightIndex,
        fromFallback: true,
      });
      if (suppression.suppressed) {
        if (suppression.suppressionType === 'dedupe') {
          args.telemetry.dedupeSkipCount += 1;
        }
        if (suppression.suppressionType === 'terminal_no_requeue') {
          args.telemetry.terminalNoRequeueSkipCount += 1;
        }
        return {
          plan,
          outcomeStatus: 'skipped',
          outcomeReason: suppression.reason ?? `${args.lane}_fallback_suppressed`,
          executionDurationMs: Date.now() - startedAt,
          executionUsedFallback: true,
        };
      }

      try {
        await this.runWithinHistoricalRepairGlobalGate({
          telemetry: args.telemetry,
          handler: () =>
            this.queueService.enqueueIdeaSnapshot(
              this.buildHistoricalSnapshotPayload(plan, args.windowDate),
              'historical_repair',
              {
                jobOptionsOverride: {
                  priority: this.toQueuePriority(
                    plan.item.historicalRepairPriorityScore,
                    plan.routerDecision.routerPriorityClass,
                  ),
                },
              },
            ),
        });
        return {
          plan,
          outcomeStatus: 'partial',
          outcomeReason: args.queuedOutcomeReason,
          executionDurationMs: Date.now() - startedAt,
          executionUsedFallback: args.executionUsedFallback(plan),
        };
      } catch (singleError) {
        return this.buildHistoricalRepairDispatchFailureOutcome({
          plan,
          lane: args.lane,
          fallbackReason: args.enqueueFailureReason,
          startedAt,
          error: singleError,
        });
      }
    });
  }

  private buildHistoricalSnapshotPayload(
    plan: HistoricalRepairDispatchPlan,
    windowDate: string,
  ) {
    return {
      repositoryId: plan.item.repoId,
      windowDate,
      fromBackfill: true,
      runFastFilter: false,
      runDeepAnalysis: false,
      historicalRepairLane: plan.item.historicalRepairBucket,
      historicalRepairAction: plan.item.historicalRepairAction,
      historicalRepairPriorityScore: plan.item.historicalRepairPriorityScore,
      ...plan.routerMetadata,
    };
  }

  private buildHistoricalSnapshotBulkEntry(
    plan: HistoricalRepairDispatchPlan,
    windowDate: string,
  ) {
    return {
      payload: this.buildHistoricalSnapshotPayload(plan, windowDate),
      jobOptionsOverride: {
        priority: this.toQueuePriority(
          plan.item.historicalRepairPriorityScore,
          plan.routerDecision.routerPriorityClass,
        ),
      },
    };
  }

  private buildHistoricalDecisionRecalcQueueInput(
    plan: HistoricalRepairDispatchPlan,
  ) {
    const item = plan.item;
    return {
      repositoryId: item.repoId,
      dto: {
        runFastFilter: false,
        runCompleteness: false,
        runIdeaFit: false,
        runIdeaExtract: false,
        forceRerun: true,
        userPreferencePriorityBoost: this.toPriorityBoost(
          item.historicalRepairPriorityScore,
          plan.routerDecision.routerPriorityClass,
          plan.routerDecision.requiresReview,
        ),
        userPreferencePriorityReasons: [
          `historical_repair:${item.historicalRepairBucket}`,
          `historical_action:${item.historicalRepairAction}`,
          `router_tier:${plan.routerDecision.capabilityTier}`,
          `router_priority:${plan.routerDecision.routerPriorityClass}`,
        ],
      } satisfies RunAnalysisDto,
      options: {
        metadata: {
          historicalRepairLane: item.historicalRepairBucket,
          historicalRepairAction: item.historicalRepairAction,
          historicalRepairPriorityScore: item.historicalRepairPriorityScore,
          ...plan.routerMetadata,
        },
        jobOptionsOverride: {
          priority: this.toSingleAnalysisQueuePriority(
            item.historicalRepairAction,
            item.historicalRepairPriorityScore,
            plan.routerDecision.routerPriorityClass,
          ),
        },
      },
    };
  }

  private buildHistoricalDeepRepairQueueInput(
    plan: HistoricalRepairDispatchPlan,
    repository: { analysis: RepositoryAnalysis | null },
  ) {
    const item = plan.item;
    const dto = this.buildMissingDeepAnalysisDto(repository);

    return {
      repositoryId: item.repoId,
      dto: {
        ...dto,
        userPreferencePriorityBoost: this.toPriorityBoost(
          item.historicalRepairPriorityScore,
          plan.routerDecision.routerPriorityClass,
          plan.routerDecision.requiresReview,
        ),
        userPreferencePriorityReasons: [
          `historical_repair:${item.historicalRepairBucket}`,
          `historical_action:${item.historicalRepairAction}`,
          `router_tier:${plan.routerDecision.capabilityTier}`,
          `router_priority:${plan.routerDecision.routerPriorityClass}`,
        ],
      } satisfies RunAnalysisDto,
      options: {
        metadata: {
          historicalRepairLane: item.historicalRepairBucket,
          historicalRepairAction: item.historicalRepairAction,
          historicalRepairPriorityScore: item.historicalRepairPriorityScore,
          ...plan.routerMetadata,
        },
        jobOptionsOverride: {
          priority: this.toSingleAnalysisQueuePriority(
            item.historicalRepairAction,
            item.historicalRepairPriorityScore,
            plan.routerDecision.routerPriorityClass,
          ),
        },
      },
    };
  }

  private buildHistoricalDecisionRecalcBulkEntry(
    plan: HistoricalRepairDispatchPlan,
  ) {
    const queueInput = this.buildHistoricalDecisionRecalcQueueInput(plan);
    return {
      repositoryId: queueInput.repositoryId,
      dto: queueInput.dto,
      metadata: queueInput.options.metadata,
      jobOptionsOverride: queueInput.options.jobOptionsOverride,
    };
  }

  private buildHistoricalDeepRepairBulkEntry(
    plan: HistoricalRepairDispatchPlan,
    repository: { analysis: RepositoryAnalysis | null },
  ) {
    const queueInput = this.buildHistoricalDeepRepairQueueInput(
      plan,
      repository,
    );
    return {
      repositoryId: queueInput.repositoryId,
      dto: queueInput.dto,
      metadata: queueInput.options.metadata,
      jobOptionsOverride: queueInput.options.jobOptionsOverride,
    };
  }

  private buildHistoricalDeepRepairQueuedOutcome(
    plan: HistoricalRepairDispatchPlan,
    executionDurationMs: number,
  ): HistoricalRepairDispatchOutcome {
    return {
      plan,
      outcomeStatus: 'partial',
      outcomeReason: 'queued_deep_repair_execution',
      executionDurationMs,
      executionUsedReview: plan.routerDecision.requiresReview,
    };
  }

  private buildHistoricalDecisionRecalcQueuedOutcome(
    plan: HistoricalRepairDispatchPlan,
    executionDurationMs: number,
  ): HistoricalRepairDispatchOutcome {
    return {
      plan,
      outcomeStatus: 'partial',
      outcomeReason:
        plan.recalcGate?.recalcGateDecision ===
        'allow_recalc_but_expect_no_change'
          ? 'queued_decision_recalc_execution_low_expected_value'
          : 'queued_decision_recalc_execution',
      executionDurationMs,
      executionUsedReview: plan.routerDecision.requiresReview,
    };
  }

  private pickSamples(items: HistoricalRecoveryAssessment[], limit = 6) {
    return items.slice(0, limit).map((item) => ({
      repoId: item.repoId,
      fullName: item.fullName,
      htmlUrl: item.htmlUrl,
      priority: item.priority,
      stages: item.stages,
      issues: item.issues.map((issue) => issue.type),
      oneLinerZh: item.validator.sanitized,
      source: item.validator.riskFlags.includes('fallback_overclaim') ? 'fallback' : null,
    }));
  }

  private mapPrioritySamples(plans: HistoricalRepairDispatchPlan[]) {
    return plans.slice(0, 40).map((plan) => ({
      repoId: plan.item.repoId,
      fullName: plan.item.fullName,
      bucket: plan.item.historicalRepairBucket,
      action: plan.item.historicalRepairAction,
      cleanupState: plan.item.cleanupState,
      priorityScore: plan.item.historicalRepairPriorityScore,
      frontendDecisionState: plan.item.frontendDecisionState,
      routerCapabilityTier: plan.routerDecision.capabilityTier,
      routerFallbackPolicy: plan.routerDecision.fallbackPolicy,
      routerRequiresReview: plan.routerDecision.requiresReview,
      reason: plan.item.historicalRepairReason,
    }));
  }

  private async persistHistoricalRepairPrioritySnapshot(
    report: HistoricalRepairPriorityReport,
  ) {
    await this.saveSystemConfig(PRIORITY_CONFIG_KEY, {
      generatedAt: report.generatedAt,
      summary: report.summary,
      samples: report.samples,
    });
  }

  private async persistHistoricalFrontendGuard(
    items: HistoricalRepairPriorityItem[],
    updatedAt: string,
  ) {
    await this.saveSystemConfig(FRONTEND_GUARD_CONFIG_KEY, {
      updatedAt,
      items: items.map((item) => ({
        repoId: item.repoId,
        bucket: item.historicalRepairBucket,
        action: item.historicalRepairAction,
        cleanupState: item.cleanupState,
        reason: item.historicalRepairReason,
        priorityScore: item.historicalRepairPriorityScore,
        frontendDecisionState: item.frontendDecisionState,
      })),
    });
  }

  private async loadDecisionRecalcGateSnapshot() {
    if (typeof this.prisma.systemConfig?.findUnique !== 'function') {
      return null;
    }

    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: DECISION_RECALC_GATE_CONFIG_KEY,
      },
    });

    return readDecisionRecalcGateSnapshot(row?.configValue);
  }

  private async resolveHistoricalRepairRepositoryIds(
    explicitRepositoryIds: string[] | null,
  ) {
    const normalizedExplicit = Array.isArray(explicitRepositoryIds)
      ? [...new Set(explicitRepositoryIds.filter(Boolean))]
      : [];
    if (normalizedExplicit.length > 0) {
      return normalizedExplicit;
    }

    if (typeof this.prisma.systemConfig?.findUnique !== 'function') {
      return null;
    }

    const [freezeRow, snapshotRow] = await Promise.all([
      this.prisma.systemConfig.findUnique({
        where: {
          configKey: ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY,
        },
      }),
      this.prisma.systemConfig.findUnique({
        where: {
          configKey: FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY,
        },
      }),
    ]);
    const freezeState = readAnalysisPoolFreezeState(freezeRow?.configValue);
    const snapshot = readFrozenAnalysisPoolBatchSnapshot(snapshotRow?.configValue);

    if (!freezeState?.analysisPoolFrozen || !snapshot?.repositoryIds?.length) {
      return null;
    }

    return [...new Set(snapshot.repositoryIds.filter(Boolean))];
  }

  private async persistDecisionRecalcGateSnapshot(
    snapshot: DecisionRecalcGateSnapshot,
  ) {
    await this.saveSystemConfig(DECISION_RECALC_GATE_CONFIG_KEY, snapshot);
  }

  private async persistAnalysisOutcomeSnapshot(
    snapshot: AnalysisOutcomeSnapshot,
  ) {
    await this.saveSystemConfig(OUTCOME_CONFIG_KEY, snapshot);
  }

  private async loadHistoricalRepairRecentOutcomeIndex(): Promise<HistoricalRepairRecentOutcomeIndex> {
    const index: HistoricalRepairRecentOutcomeIndex = new Map();
    if (typeof this.prisma.systemConfig?.findUnique !== 'function') {
      return index;
    }

    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: HISTORICAL_REPAIR_RECENT_OUTCOMES_CONFIG_KEY,
      },
    });
    const snapshot = this.readHistoricalRepairRecentOutcomesSnapshot(
      row?.configValue,
    );
    if (!snapshot) {
      return index;
    }

    for (const item of snapshot.items) {
      const records = index.get(item.repositoryId) ?? [];
      records.push(item);
      index.set(item.repositoryId, records);
    }

    return index;
  }

  private async persistHistoricalRepairRecentOutcomes(
    outcomeLogs: AnalysisOutcomeLog[],
  ) {
    const nextRecords = outcomeLogs.map((log) =>
      this.toHistoricalRepairRecentOutcomeRecord(log),
    );
    const current =
      typeof this.prisma.systemConfig?.findUnique === 'function'
        ? await this.prisma.systemConfig.findUnique({
            where: {
              configKey: HISTORICAL_REPAIR_RECENT_OUTCOMES_CONFIG_KEY,
            },
          })
        : null;
    const existing = this.readHistoricalRepairRecentOutcomesSnapshot(
      current?.configValue,
    );
    const dedupedKeys = new Set<string>();
    const grouped = new Map<string, HistoricalRepairRecentOutcomeRecord[]>();
    const merged = [...nextRecords, ...(existing?.items ?? [])].sort((left, right) =>
      right.loggedAt.localeCompare(left.loggedAt),
    );

    for (const record of merged) {
      const dedupeKey = [
        record.repositoryId,
        record.loggedAt,
        record.historicalRepairAction ?? 'none',
        record.outcomeReason,
      ].join(':');
      if (dedupedKeys.has(dedupeKey)) {
        continue;
      }
      dedupedKeys.add(dedupeKey);

      const records = grouped.get(record.repositoryId) ?? [];
      if (records.length >= HISTORICAL_REPAIR_RECENT_OUTCOME_HISTORY_LIMIT) {
        continue;
      }
      records.push(record);
      grouped.set(record.repositoryId, records);
    }

    await this.saveSystemConfig(HISTORICAL_REPAIR_RECENT_OUTCOMES_CONFIG_KEY, {
      schemaVersion: HISTORICAL_REPAIR_RECENT_OUTCOMES_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      maxItemsPerRepository: HISTORICAL_REPAIR_RECENT_OUTCOME_HISTORY_LIMIT,
      items: [...grouped.values()].flat(),
    } satisfies HistoricalRepairRecentOutcomesSnapshot);
  }

  private readHistoricalRepairRecentOutcomesSnapshot(
    value: unknown,
  ): HistoricalRepairRecentOutcomesSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const payload = value as Partial<HistoricalRepairRecentOutcomesSnapshot>;
    if (!Array.isArray(payload.items)) {
      return null;
    }

    const items = payload.items
      .map((item) => this.readHistoricalRepairRecentOutcomeRecord(item))
      .filter(
        (
          item,
        ): item is HistoricalRepairRecentOutcomeRecord => Boolean(item),
      );

    return {
      schemaVersion:
        this.readOptionalString(payload.schemaVersion) ??
        HISTORICAL_REPAIR_RECENT_OUTCOMES_SCHEMA_VERSION,
      generatedAt: this.readOptionalString(payload.generatedAt) ?? '',
      maxItemsPerRepository:
        this.readOptionalNumber(payload.maxItemsPerRepository) ??
        HISTORICAL_REPAIR_RECENT_OUTCOME_HISTORY_LIMIT,
      items,
    };
  }

  private readHistoricalRepairRecentOutcomeRecord(
    value: unknown,
  ): HistoricalRepairRecentOutcomeRecord | null {
    const payload = this.readObject(value);
    const repositoryId = this.readOptionalString(payload?.repositoryId);
    const loggedAt = this.readOptionalString(payload?.loggedAt);
    const outcomeStatus = this.readHistoricalRepairOutcomeStatus(
      payload?.outcomeStatus,
    );
    const outcomeReason = this.readOptionalString(payload?.outcomeReason);

    if (!repositoryId || !loggedAt || !outcomeStatus || !outcomeReason) {
      return null;
    }

    return {
      repositoryId,
      loggedAt,
      historicalRepairAction: this.readHistoricalRepairAction(payload),
      historicalRepairBucket: this.readHistoricalRepairBucket(
        payload?.historicalRepairBucket,
      ),
      outcomeStatus,
      outcomeReason,
      repairValueClass:
        this.readAnalysisRepairValueClass(payload?.repairValueClass) ?? 'low',
      decisionStateBefore:
        this.readAnalysisOutcomeDecisionState(payload?.decisionStateBefore),
      evidenceCoverageRateBefore:
        this.readOptionalNumber(payload?.evidenceCoverageRateBefore) ?? 0,
      keyEvidenceGapsBefore: this.readStringArray(payload?.keyEvidenceGapsBefore),
      trustedBlockingGapsBefore: this.readStringArray(
        payload?.trustedBlockingGapsBefore,
      ),
    };
  }

  private toHistoricalRepairRecentOutcomeRecord(
    log: AnalysisOutcomeLog,
  ): HistoricalRepairRecentOutcomeRecord {
    return {
      repositoryId: log.before.repositoryId,
      loggedAt: log.loggedAt,
      historicalRepairAction: log.before.historicalRepairAction,
      historicalRepairBucket: log.before.historicalRepairBucket,
      outcomeStatus: log.execution.outcomeStatus,
      outcomeReason: log.execution.outcomeReason,
      repairValueClass: log.delta.repairValueClass,
      decisionStateBefore: log.before.decisionStateBefore,
      evidenceCoverageRateBefore: log.before.evidenceCoverageRateBefore,
      keyEvidenceGapsBefore: log.before.keyEvidenceGapsBefore,
      trustedBlockingGapsBefore: log.before.trustedBlockingGapsBefore,
    };
  }

  private async loadHistoricalRepairInflightIndex(): Promise<HistoricalRepairInflightIndex> {
    const inflightIndex: HistoricalRepairInflightIndex = new Map();
    if (typeof this.prisma.jobLog?.findMany !== 'function') {
      return inflightIndex;
    }

    const jobs = await this.prisma.jobLog.findMany({
      where: {
        queueName: {
          in: ['analysis.single', 'analysis.snapshot'],
        },
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
      },
      select: {
        queueName: true,
        payload: true,
        triggeredBy: true,
      },
    });

    let snapshotRepoCount = 0;
    let decisionRecalcRepoCount = 0;

    for (const job of jobs) {
      const payload = this.readObject(job.payload);
      const repositoryId = this.readOptionalString(payload?.repositoryId);
      if (!repositoryId) {
        continue;
      }
      const state = inflightIndex.get(repositoryId) ?? {
        snapshotInFlight: false,
        decisionRecalcInFlight: false,
        actions: new Set<string>(),
      };
      const action = this.readHistoricalRepairAction(payload);

      if (job.queueName === 'analysis.snapshot') {
        if (!state.snapshotInFlight) {
          snapshotRepoCount += 1;
        }
        state.snapshotInFlight = true;
        state.actions.add('snapshot');
        if (action) {
          state.actions.add(action);
        }
      }

      if (
        job.queueName === 'analysis.single' &&
        action === 'decision_recalc'
      ) {
        if (!state.decisionRecalcInFlight) {
          decisionRecalcRepoCount += 1;
        }
        state.decisionRecalcInFlight = true;
        state.actions.add('decision_recalc');
      }

      if (state.snapshotInFlight || state.decisionRecalcInFlight) {
        inflightIndex.set(repositoryId, state);
      }
    }

    if (snapshotRepoCount > 0 || decisionRecalcRepoCount > 0) {
      this.logger.log(
        `historical_repair inflight_index snapshotRepoCount=${snapshotRepoCount} decisionRecalcRepoCount=${decisionRecalcRepoCount}`,
      );
    }

    return inflightIndex;
  }

  private isTerminalHistoricalRepairItem(item: HistoricalRepairPriorityItem) {
    const frontendDecisionState = this.readOptionalString(
      (item as unknown as Record<string, unknown>)?.frontendDecisionState,
    );
    return (
      item.cleanupState === 'archive' ||
      item.cleanupState === 'purge_ready' ||
      frontendDecisionState === 'completed_not_useful_archived'
    );
  }

  private shouldSuppressHistoricalRepairPlan(args: {
    lane: 'refresh_only' | 'evidence_repair' | 'decision_recalc';
    plan: HistoricalRepairDispatchPlan;
    inflightIndex: HistoricalRepairInflightIndex;
    fromFallback?: boolean;
  }): HistoricalRepairPlanSuppression {
    if (this.isTerminalHistoricalRepairItem(args.plan.item)) {
      if (args.lane === 'decision_recalc') {
        return {
          suppressed: true,
          reason: 'terminal_repo_no_requeue_decision_recalc',
          suppressionType: 'terminal_no_requeue',
        };
      }
      if (args.fromFallback) {
        return {
          suppressed: true,
          reason: 'terminal_repo_no_requeue_snapshot_fallback',
          suppressionType: 'terminal_no_requeue',
        };
      }
      return {
        suppressed: true,
        reason:
          args.lane === 'refresh_only'
            ? 'terminal_repo_no_requeue_refresh_only'
            : 'terminal_repo_no_requeue_evidence_repair',
        suppressionType: 'terminal_no_requeue',
      };
    }

    const inflightState = args.inflightIndex.get(args.plan.item.repoId);
    if (!inflightState) {
      return {
        suppressed: false,
        reason: null,
        suppressionType: null,
      };
    }

    if (
      args.lane === 'decision_recalc' &&
      (inflightState.decisionRecalcInFlight ||
        inflightState.actions.has('decision_recalc'))
    ) {
      return {
        suppressed: true,
        reason: 'decision_recalc_already_inflight',
        suppressionType: 'dedupe',
      };
    }

    if (
      (args.lane === 'refresh_only' || args.lane === 'evidence_repair') &&
      inflightState.snapshotInFlight
    ) {
      return {
        suppressed: true,
        reason: args.fromFallback
          ? 'snapshot_already_inflight_fallback'
          : 'snapshot_already_inflight',
        suppressionType: 'dedupe',
      };
    }

    return {
      suppressed: false,
      reason: null,
      suppressionType: null,
    };
  }

  private applyHistoricalRepairLowYieldSuppression(args: {
    plans: HistoricalRepairDispatchPlan[];
    recentOutcomeIndex: HistoricalRepairRecentOutcomeIndex;
  }) {
    const allowedPlans: HistoricalRepairDispatchPlan[] = [];
    const suppressedOutcomes: HistoricalRepairDispatchOutcome[] = [];

    for (const plan of args.plans) {
      const suppression = this.shouldSuppressHistoricalRepairPlanForLowYield({
        plan,
        recentOutcomeIndex: args.recentOutcomeIndex,
      });
      if (!suppression.suppressed) {
        allowedPlans.push(plan);
        continue;
      }

      suppressedOutcomes.push({
        plan,
        outcomeStatus: 'skipped',
        outcomeReason:
          suppression.reason ??
          'low_yield_suppressed_consecutive_low_value_outcomes',
        executionDurationMs: 0,
        executionUsedFallback: true,
      });
    }

    return {
      allowedPlans,
      suppressedOutcomes,
    };
  }

  private shouldSuppressHistoricalRepairPlanForLowYield(args: {
    plan: HistoricalRepairDispatchPlan;
    recentOutcomeIndex: HistoricalRepairRecentOutcomeIndex;
  }): HistoricalRepairLowYieldSuppression {
    const action = args.plan.item.historicalRepairAction;
    if (action === 'downgrade_only' || action === 'archive') {
      return {
        suppressed: false,
        reason: null,
      };
    }

    const recentOutcomes =
      args.recentOutcomeIndex.get(args.plan.item.repoId) ?? [];
    if (
      recentOutcomes.length < HISTORICAL_REPAIR_LOW_YIELD_CONSECUTIVE_THRESHOLD
    ) {
      return {
        suppressed: false,
        reason: null,
      };
    }

    if (
      this.hasHistoricalRepairPrioritySignal({
        plan: args.plan,
        recentOutcomes,
      })
    ) {
      return {
        suppressed: false,
        reason: null,
      };
    }

    const consecutiveLowYield = recentOutcomes
      .slice(0, HISTORICAL_REPAIR_LOW_YIELD_CONSECUTIVE_THRESHOLD)
      .every((record) => this.isHistoricalRepairLowYieldRecentOutcome(record));

    return consecutiveLowYield
      ? {
          suppressed: true,
          reason: 'low_yield_suppressed_consecutive_low_value_outcomes',
        }
      : {
          suppressed: false,
          reason: null,
        };
  }

  private hasHistoricalRepairPrioritySignal(args: {
    plan: HistoricalRepairDispatchPlan;
    recentOutcomes: HistoricalRepairRecentOutcomeRecord[];
  }) {
    const item = args.plan.item;
    const latest = args.recentOutcomes[0] ?? null;

    if (
      item.needsImmediateFrontendDowngrade ||
      item.conflictDrivenDecisionRecalc ||
      item.conflictFlag ||
      item.isVisibleOnHome ||
      item.isVisibleOnFavorites ||
      item.appearedInDailySummary ||
      item.appearedInTelegram ||
      item.historicalRepairBucket === 'visible_broken'
    ) {
      return true;
    }

    if (args.plan.recalcGate?.recalcSignalChanged) {
      return true;
    }

    if (!latest) {
      return false;
    }

    if (latest.historicalRepairAction !== item.historicalRepairAction) {
      return true;
    }

    if (latest.historicalRepairBucket !== item.historicalRepairBucket) {
      return true;
    }

    if (latest.decisionStateBefore !== item.frontendDecisionState) {
      return true;
    }

    if (
      !this.areStringArraysEqual(
        latest.keyEvidenceGapsBefore,
        item.keyEvidenceGaps,
      ) ||
      !this.areStringArraysEqual(
        latest.trustedBlockingGapsBefore,
        item.trustedBlockingGaps,
      )
    ) {
      return true;
    }

    return (
      Math.abs(latest.evidenceCoverageRateBefore - item.evidenceCoverageRate) >=
      HISTORICAL_REPAIR_LOW_YIELD_COVERAGE_DELTA_THRESHOLD
    );
  }

  private isHistoricalRepairLowYieldRecentOutcome(
    record: HistoricalRepairRecentOutcomeRecord,
  ) {
    return (
      record.outcomeStatus === 'no_change' ||
      record.outcomeReason ===
        'low_yield_suppressed_consecutive_low_value_outcomes' ||
      record.outcomeReason === 'deep_targets_already_present' ||
      record.outcomeReason ===
        'queued_decision_recalc_execution_low_expected_value' ||
      this.isHistoricalRepairDedupeOutcomeReason(record.outcomeReason) ||
      this.isHistoricalRepairTerminalNoRequeueOutcomeReason(
        record.outcomeReason,
      )
    );
  }

  private decorateRecalcRouterReasonSummary(
    baseReasonSummary: string,
    recalcGate: DecisionRecalcGateResult,
  ) {
    const fragments = [baseReasonSummary];

    switch (recalcGate.recalcGateDecision) {
      case 'allow_recalc':
        fragments.push('recalc_new_signal');
        break;
      case 'allow_recalc_but_expect_no_change':
        fragments.push('recalc_new_signal_low_expected_value');
        break;
      case 'suppress_replay':
        fragments.push('recalc_replay_suppressed');
        break;
      case 'suppress_cleanup':
        fragments.push('recalc_cleanup_suppressed');
        break;
    }

    if (recalcGate.recalcSignalDiffSummary) {
      fragments.push(recalcGate.recalcSignalDiffSummary);
    }

    return fragments.filter(Boolean).join(' | ');
  }

  private buildHistoricalRepairOutcomeLogs(args: {
    refreshOnlyOutcomes: HistoricalRepairDispatchOutcome[];
    evidenceRepairOutcomes: HistoricalRepairDispatchOutcome[];
    deepRepairOutcomes: HistoricalRepairDispatchOutcome[];
    decisionRecalcOutcomes: HistoricalRepairDispatchOutcome[];
    lowYieldSuppressedOutcomes: HistoricalRepairDispatchOutcome[];
    downgradePlans: HistoricalRepairDispatchPlan[];
    suppressedPlans: HistoricalRepairDispatchPlan[];
  }): AnalysisOutcomeLog[] {
    const logs: AnalysisOutcomeLog[] = [];

    for (const plan of args.downgradePlans) {
      logs.push(
        buildHistoricalRepairOutcomeLog({
          item: plan.item,
          routerDecision: plan.routerDecision,
          routerMetadata: plan.routerMetadata,
          outcomeStatus: 'downgraded',
          outcomeReason: 'frontend_guard_downgrade_applied',
          executionUsedFallback: true,
        }),
      );
    }

    for (const outcome of [
      ...args.refreshOnlyOutcomes,
      ...args.evidenceRepairOutcomes,
      ...args.deepRepairOutcomes,
      ...args.decisionRecalcOutcomes,
      ...args.lowYieldSuppressedOutcomes,
    ]) {
      logs.push(
        buildHistoricalRepairOutcomeLog({
          item: outcome.plan.item,
          routerDecision: outcome.plan.routerDecision,
          routerMetadata: outcome.plan.routerMetadata,
          outcomeStatus: outcome.outcomeStatus,
          outcomeReason: outcome.outcomeReason,
          executionDurationMs: outcome.executionDurationMs,
          executionUsedFallback: outcome.executionUsedFallback,
          executionUsedReview: outcome.executionUsedReview,
        }),
      );
    }

    for (const plan of args.suppressedPlans) {
      logs.push(
        buildHistoricalRepairOutcomeLog({
          item: plan.item,
          routerDecision: plan.routerDecision,
          routerMetadata: plan.routerMetadata,
          outcomeStatus: 'skipped',
          outcomeReason:
            plan.recalcGate?.recalcGateDecision === 'suppress_cleanup'
              ? plan.recalcGate.recalcGateReason
              : `cleanup_state_${plan.item.cleanupState}_suppressed`,
        }),
      );
    }

    return logs;
  }

  private resolveHistoricalRepairLaneResult(args: {
    lane: HistoricalRepairDispatchLane;
    plans: HistoricalRepairDispatchPlan[];
    settledResult: PromiseSettledResult<HistoricalRepairDispatchOutcome[]>;
    startedAt: number;
  }) {
    const durationMs = Date.now() - args.startedAt;

    if (args.settledResult.status === 'fulfilled') {
      this.logHistoricalRepairLaneOutcomeSummary(
        args.lane,
        args.plans.length,
        args.settledResult.value,
        durationMs,
      );
      return args.settledResult.value;
    }

    const errorMessage = this.readErrorMessage(args.settledResult.reason);
    this.logger.warn(
      `historical_repair lane failed lane=${args.lane} plans=${args.plans.length} durationMs=${durationMs} reason=${errorMessage || 'unknown'}`,
    );

    const outcomes = args.plans.map((plan) => ({
      plan,
      outcomeStatus: 'skipped' as const,
      outcomeReason: errorMessage
        ? `${args.lane}_lane_failed:${errorMessage}`
        : `${args.lane}_lane_failed`,
      executionDurationMs: durationMs,
      executionUsedFallback: true,
    }));
    this.logHistoricalRepairLaneOutcomeSummary(
      args.lane,
      args.plans.length,
      outcomes,
      durationMs,
    );
    return outcomes;
  }

  private logHistoricalRepairLaneOutcomeSummary(
    lane: HistoricalRepairDispatchLane,
    planCount: number,
    outcomes: HistoricalRepairDispatchOutcome[],
    durationMs: number,
  ) {
    if (planCount <= 0) {
      return;
    }

    const partialCount = outcomes.filter(
      (outcome) => outcome.outcomeStatus === 'partial',
    ).length;
    const skippedCount = outcomes.filter(
      (outcome) => outcome.outcomeStatus === 'skipped',
    ).length;
    const noChangeCount = outcomes.filter(
      (outcome) => outcome.outcomeStatus === 'no_change',
    ).length;
    const downgradedCount = outcomes.filter(
      (outcome) => outcome.outcomeStatus === 'downgraded',
    ).length;

    this.logger.log(
      `historical_repair lane_summary lane=${lane} planCount=${planCount} totalDurationMs=${durationMs} partialCount=${partialCount} skippedCount=${skippedCount} noChangeCount=${noChangeCount} downgradedCount=${downgradedCount}`,
    );
  }

  private logHistoricalRepairLaneTelemetry(
    lane: HistoricalRepairDispatchLane,
    telemetry: HistoricalRepairLaneTelemetry,
  ) {
    if (
      telemetry.gateAcquireCount <= 0 &&
      telemetry.dedupeSkipCount <= 0 &&
      telemetry.terminalNoRequeueSkipCount <= 0
    ) {
      return;
    }

    const fragments = [
      `historical_repair lane_telemetry lane=${lane}`,
      `gateWaitMs=${telemetry.gateWaitDurationMs}`,
      `gateAcquireCount=${telemetry.gateAcquireCount}`,
      `historicalRepairGlobalConcurrency=${this.resolveHistoricalRepairGlobalConcurrency()}`,
      `bulkBatches=${telemetry.bulkBatchCount}`,
      `bulkFallbackBatches=${telemetry.bulkFallbackCount}`,
      `deepRepairLookupChunkSize=${
        lane === 'deep_repair' ? HISTORICAL_REPAIR_DEEP_LOOKUP_CHUNK_SIZE : 0
      }`,
      `deepRepairLookupChunkCount=${telemetry.deepLookupChunkCount}`,
      `deepRepairLookupDurationMs=${telemetry.deepLookupDurationMs}`,
      `dedupeSkipCount=${telemetry.dedupeSkipCount}`,
      `terminalNoRequeueSkipCount=${telemetry.terminalNoRequeueSkipCount}`,
    ];

    this.logger.log(fragments.join(' '));
  }

  private logHistoricalRepairLoopTelemetry(args: {
    selectedCount: number;
    loopQueuedCount: number;
    loopQueuedPerSecond: number;
    globalPendingCount: number;
    globalRunningCount: number;
    globalQueuedCount: number;
    loopDedupeSkipCount: number;
    loopTerminalNoRequeueSkipCount: number;
    loopLowYieldSkipCount: number;
    totalDurationMs: number;
    historicalRepairGlobalConcurrency: number;
    execution: HistoricalRepairRunResult['execution'];
  }) {
    this.logger.log(
      [
        'historical_repair loop_telemetry',
        `selectedCount=${args.selectedCount}`,
        `loopQueuedCount=${args.loopQueuedCount}`,
        `totalQueuedCount=${args.loopQueuedCount}`,
        `totalDurationMs=${args.totalDurationMs}`,
        `loopQueuedPerSecond=${this.formatHistoricalRepairRate(
          args.loopQueuedPerSecond,
        )}`,
        `queuedPerSecond=${this.formatHistoricalRepairRate(
          args.loopQueuedPerSecond,
        )}`,
        `globalPendingCount=${args.globalPendingCount}`,
        `globalRunningCount=${args.globalRunningCount}`,
        `globalQueuedCount=${args.globalQueuedCount}`,
        `loopDedupeSkipCount=${args.loopDedupeSkipCount}`,
        `loopTerminalNoRequeueSkipCount=${args.loopTerminalNoRequeueSkipCount}`,
        `loopLowYieldSkipCount=${args.loopLowYieldSkipCount}`,
        `historicalRepairGlobalConcurrency=${args.historicalRepairGlobalConcurrency}`,
        `refreshPartialCount=${args.execution.refreshOnly}`,
        `evidencePartialCount=${args.execution.evidenceRepair}`,
        `deepPartialCount=${args.execution.deepRepair}`,
        `decisionRecalcPartialCount=${args.execution.decisionRecalc}`,
        `downgradeOnlyCount=${args.execution.downgradeOnly}`,
        `archiveCount=${args.execution.archive}`,
      ].join(' '),
    );
  }

  private resolveHistoricalRepairLaneConcurrency(
    lane: HistoricalRepairDispatchLane,
    planCount: number,
  ) {
    const config = HISTORICAL_REPAIR_LANE_CONCURRENCY[lane];
    const resolved = this.readClampedConcurrency(config.envName, config.fallback);

    if (planCount > 0) {
      this.logger.log(
        `historical_repair dispatch lane=${lane} plans=${planCount} concurrency=${resolved}`,
      );
    }

    return resolved;
  }

  private resolveHistoricalRepairGlobalConcurrency() {
    return this.readClampedConcurrency(
      HISTORICAL_REPAIR_GLOBAL_CONCURRENCY_ENV_NAME,
      HISTORICAL_REPAIR_GLOBAL_CONCURRENCY_FALLBACK,
    );
  }

  private resolveHistoricalRecoverySingleAnalysisFallbackConcurrency(
    entryCount: number,
  ) {
    return Math.min(
      entryCount,
      this.readClampedConcurrency(
        HISTORICAL_REPAIR_LANE_CONCURRENCY.deep_repair.envName,
        HISTORICAL_REPAIR_LANE_CONCURRENCY.deep_repair.fallback,
      ),
    );
  }

  private createHistoricalRepairLaneTelemetry(): HistoricalRepairLaneTelemetry {
    return {
      gateAcquireCount: 0,
      gateWaitDurationMs: 0,
      bulkBatchCount: 0,
      bulkFallbackCount: 0,
      deepLookupChunkCount: 0,
      deepLookupDurationMs: 0,
      dedupeSkipCount: 0,
      terminalNoRequeueSkipCount: 0,
    };
  }

  private async loadDeepRepairRepositoryMap(
    plans: HistoricalRepairDispatchPlan[],
    telemetry: HistoricalRepairLaneTelemetry,
  ) {
    const repositoryIds = [
      ...new Set(plans.map((plan) => plan.item.repoId).filter(Boolean)),
    ];
    const repositoryIdChunks = this.chunkItems(
      repositoryIds,
      HISTORICAL_REPAIR_DEEP_LOOKUP_CHUNK_SIZE,
    );
    telemetry.deepLookupChunkCount = repositoryIdChunks.length;

    const repositoriesByChunk = await runWithConcurrency(
      repositoryIdChunks,
      Math.min(
        HISTORICAL_REPAIR_DEEP_LOOKUP_CONCURRENCY,
        repositoryIdChunks.length,
      ),
      async (repositoryIdChunk) =>
        this.runWithinHistoricalRepairGlobalGate({
          telemetry,
          handler: async () => {
            const startedAt = Date.now();
            const repositories = await this.prisma.repository.findMany({
              where: {
                id: {
                  in: repositoryIdChunk,
                },
              },
              include: {
                analysis: true,
              },
            });
            telemetry.deepLookupDurationMs += Date.now() - startedAt;
            return repositories;
          },
        }),
    );

    return new Map(
      repositoriesByChunk
        .flat()
        .map((repository) => [repository.id, repository]),
    );
  }

  private async runWithinHistoricalRepairGlobalGate<T>(args: {
    telemetry: HistoricalRepairLaneTelemetry;
    handler: () => Promise<T>;
  }) {
    const lease = await this.acquireHistoricalRepairGlobalGate();
    args.telemetry.gateAcquireCount += 1;
    args.telemetry.gateWaitDurationMs += lease.waitDurationMs;

    try {
      return await args.handler();
    } finally {
      lease.release();
    }
  }

  private async acquireHistoricalRepairGlobalGate() {
    const waitStartedAt = Date.now();
    const concurrency = this.resolveHistoricalRepairGlobalConcurrency();

    while (this.historicalRepairGlobalGateInFlight >= concurrency) {
      await new Promise<void>((resolve) => {
        this.historicalRepairGlobalGateWaiters.push(resolve);
      });
    }

    this.historicalRepairGlobalGateInFlight += 1;
    let released = false;

    return {
      waitDurationMs: Date.now() - waitStartedAt,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.historicalRepairGlobalGateInFlight = Math.max(
          0,
          this.historicalRepairGlobalGateInFlight - 1,
        );
        const nextWaiter = this.historicalRepairGlobalGateWaiters.shift();
        nextWaiter?.();
      },
    };
  }

  private chunkItems<T>(items: T[], chunkSize: number) {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }

    return chunks;
  }

  private computeHistoricalRepairQueuedPerSecond(
    totalQueuedCount: number,
    totalDurationMs: number,
  ) {
    if (totalQueuedCount <= 0 || totalDurationMs <= 0) {
      return 0;
    }

    return (totalQueuedCount * 1000) / totalDurationMs;
  }

  private formatHistoricalRepairRate(rate: number) {
    if (!Number.isFinite(rate)) {
      return '0';
    }

    return rate.toFixed(HISTORICAL_REPAIR_RATE_PRECISION);
  }

  private readClampedConcurrency(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    if (parsed < HISTORICAL_REPAIR_CONCURRENCY_MIN) {
      this.logger.warn(
        `historical_repair concurrency env=${envName} value=${parsed} below minimum; using ${HISTORICAL_REPAIR_CONCURRENCY_MIN}`,
      );
      return HISTORICAL_REPAIR_CONCURRENCY_MIN;
    }

    if (parsed > HISTORICAL_REPAIR_CONCURRENCY_MAX) {
      this.logger.warn(
        `historical_repair concurrency env=${envName} value=${parsed} above maximum; using ${HISTORICAL_REPAIR_CONCURRENCY_MAX}`,
      );
      return HISTORICAL_REPAIR_CONCURRENCY_MAX;
    }

    return parsed;
  }

  private buildHistoricalRepairDispatchFailureOutcome(args: {
    plan: HistoricalRepairDispatchPlan;
    lane: HistoricalRepairDispatchLane;
    fallbackReason: string;
    startedAt: number;
    error: unknown;
  }): HistoricalRepairDispatchOutcome {
    const errorMessage = this.readErrorMessage(args.error);
    this.logger.warn(
      `historical_repair dispatch failed lane=${args.lane} repoId=${args.plan.item.repoId} reason=${errorMessage}`,
    );

    return {
      plan: args.plan,
      outcomeStatus: 'skipped',
      outcomeReason: errorMessage
        ? `${args.fallbackReason}:${errorMessage}`
        : args.fallbackReason,
      executionDurationMs: Date.now() - args.startedAt,
      executionUsedFallback: true,
    };
  }

  private readErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return this.readString(error.message);
    }

    return this.readString(error);
  }

  private isHistoricalRepairDedupeOutcomeReason(reason: string) {
    return (
      reason === 'decision_recalc_already_inflight' ||
      reason === 'snapshot_already_inflight' ||
      reason === 'snapshot_already_inflight_fallback'
    );
  }

  private isHistoricalRepairTerminalNoRequeueOutcomeReason(reason: string) {
    return (
      reason === 'terminal_repo_no_requeue_decision_recalc' ||
      reason === 'terminal_repo_no_requeue_refresh_only' ||
      reason === 'terminal_repo_no_requeue_evidence_repair' ||
      reason === 'terminal_repo_no_requeue_snapshot_fallback'
    );
  }

  private isHistoricalRepairLowYieldOutcomeReason(reason: string) {
    return reason === 'low_yield_suppressed_consecutive_low_value_outcomes';
  }

  private async saveSystemConfig(configKey: string, value: unknown) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey,
      },
      update: {
        configValue: value as Prisma.InputJsonValue,
      },
      create: {
        configKey,
        configValue: value as Prisma.InputJsonValue,
      },
    });
  }

  private readObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readString(value: unknown) {
    return String(value ?? '').trim();
  }

  private readHistoricalRepairAction(value: Record<string, unknown> | null) {
    const action =
      this.readString(value?.historicalRepairAction) ||
      this.readString(this.readObject(value?.metadata)?.historicalRepairAction);
    if (
      action === 'downgrade_only' ||
      action === 'refresh_only' ||
      action === 'evidence_repair' ||
      action === 'deep_repair' ||
      action === 'decision_recalc'
    ) {
      return action;
    }

    return null;
  }

  private readOptionalString(value: unknown) {
    const normalized = this.readString(value);
    return normalized || null;
  }

  private readOptionalNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private readOptionalBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return null;
  }

  private readStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.readString(item))
      .filter(Boolean);
  }

  private readHistoricalRepairBucket(value: unknown) {
    const bucket = this.readOptionalString(value);
    if (
      bucket === 'visible_broken' ||
      bucket === 'high_value_weak' ||
      bucket === 'stale_watch' ||
      bucket === 'archive_or_noise'
    ) {
      return bucket;
    }

    return null;
  }

  private readHistoricalRepairOutcomeStatus(value: unknown) {
    const status = this.readOptionalString(value);
    if (
      status === 'success' ||
      status === 'partial' ||
      status === 'no_change' ||
      status === 'failed' ||
      status === 'downgraded' ||
      status === 'skipped'
    ) {
      return status;
    }

    return null;
  }

  private readAnalysisRepairValueClass(value: unknown) {
    const repairValueClass = this.readOptionalString(value);
    if (
      repairValueClass === 'high' ||
      repairValueClass === 'medium' ||
      repairValueClass === 'low' ||
      repairValueClass === 'negative'
    ) {
      return repairValueClass;
    }

    return null;
  }

  private readAnalysisOutcomeDecisionState(value: unknown) {
    const decisionState = this.readOptionalString(value);
    if (
      decisionState === 'trusted' ||
      decisionState === 'provisional' ||
      decisionState === 'degraded'
    ) {
      return decisionState;
    }

    return null;
  }

  private areStringArraysEqual(left: string[], right: string[]) {
    const normalizedLeft = [...new Set(left.filter(Boolean))].sort();
    const normalizedRight = [...new Set(right.filter(Boolean))].sort();
    if (normalizedLeft.length !== normalizedRight.length) {
      return false;
    }

    return normalizedLeft.every((value, index) => value === normalizedRight[index]);
  }

  private toQueuePriority(
    priorityScore: number,
    routerPriorityClass: 'P0' | 'P1' | 'P2' | 'P3' = 'P2',
  ) {
    return toHistoricalRepairQueuePriority(priorityScore, routerPriorityClass);
  }

  private toSingleAnalysisQueuePriority(
    historicalRepairAction: string | null | undefined,
    priorityScore: number,
    routerPriorityClass: 'P0' | 'P1' | 'P2' | 'P3' = 'P2',
  ) {
    return toHistoricalSingleAnalysisQueuePriority({
      historicalRepairAction,
      priorityScore,
      routerPriorityClass,
    });
  }

  private toPriorityBoost(
    priorityScore: number,
    routerPriorityClass: 'P0' | 'P1' | 'P2' | 'P3' = 'P2',
    requiresReview = false,
  ) {
    const base = Math.max(1, Math.min(12, Math.floor(priorityScore / 18)));
    const routerBoost =
      routerPriorityClass === 'P0'
        ? 4
        : routerPriorityClass === 'P1'
          ? 2
          : routerPriorityClass === 'P2'
            ? 1
            : 0;
    const reviewBoost = requiresReview ? 1 : 0;
    return Math.max(1, Math.min(12, base + routerBoost + reviewBoost));
  }

  private routerPriorityRank(priorityClass: 'P0' | 'P1' | 'P2' | 'P3') {
    switch (priorityClass) {
      case 'P0':
        return 0;
      case 'P1':
        return 1;
      case 'P2':
        return 2;
      case 'P3':
      default:
        return 3;
    }
  }

  private readRouterMetadata(
    value: Record<string, unknown> | null,
  ): ModelTaskRouterExecutionMetadata | null {
    if (!value) {
      return null;
    }

    const capabilityTier = this.readRouterCapabilityTier(value);
    const fallbackPolicy = this.readRouterFallbackPolicy(value);
    if (!capabilityTier || !fallbackPolicy) {
      return null;
    }

    return {
      routerNormalizedTaskType:
        (this.readString(value.routerNormalizedTaskType) ||
          this.readString(this.readObject(value.metadata)?.routerNormalizedTaskType)) as ModelTaskRouterExecutionMetadata['routerNormalizedTaskType'],
      routerTaskIntent:
        (this.readString(value.routerTaskIntent) ||
          this.readString(this.readObject(value.metadata)?.routerTaskIntent)) as ModelTaskRouterExecutionMetadata['routerTaskIntent'],
      routerCapabilityTier: capabilityTier,
      routerPriorityClass:
        (this.readString(value.routerPriorityClass) ||
          this.readString(this.readObject(value.metadata)?.routerPriorityClass) ||
          'P2') as ModelTaskRouterExecutionMetadata['routerPriorityClass'],
      routerFallbackPolicy: fallbackPolicy,
      routerRequiresReview:
        this.readOptionalBoolean(value.routerRequiresReview) === true ||
        this.readOptionalBoolean(this.readObject(value.metadata)?.routerRequiresReview) ===
          true,
      routerRetryClass:
        (this.readString(value.routerRetryClass) ||
          this.readString(this.readObject(value.metadata)?.routerRetryClass) ||
          'NONE') as ModelTaskRouterExecutionMetadata['routerRetryClass'],
      routerCostSensitivity:
        (this.readString(value.routerCostSensitivity) ||
          this.readString(this.readObject(value.metadata)?.routerCostSensitivity) ||
          'HIGH') as ModelTaskRouterExecutionMetadata['routerCostSensitivity'],
      routerLatencySensitivity:
        (this.readString(value.routerLatencySensitivity) ||
          this.readString(this.readObject(value.metadata)?.routerLatencySensitivity) ||
          'LOW') as ModelTaskRouterExecutionMetadata['routerLatencySensitivity'],
      routerReasonSummary:
        this.readString(value.routerReasonSummary) ||
        this.readString(this.readObject(value.metadata)?.routerReasonSummary),
    };
  }

  private readRouterCapabilityTier(
    value: Record<string, unknown>,
  ): ModelTaskCapabilityTierName | null {
    const normalized =
      this.readString(value.routerCapabilityTier) ||
      this.readString(this.readObject(value.metadata)?.routerCapabilityTier);
    if (
      normalized === 'LIGHT' ||
      normalized === 'STANDARD' ||
      normalized === 'HEAVY' ||
      normalized === 'REVIEW' ||
      normalized === 'DETERMINISTIC_ONLY'
    ) {
      return normalized;
    }

    return null;
  }

  private readRouterFallbackPolicy(
    value: Record<string, unknown>,
  ): ModelTaskFallbackPolicy | null {
    const normalized =
      this.readString(value.routerFallbackPolicy) ||
      this.readString(this.readObject(value.metadata)?.routerFallbackPolicy);
    if (
      normalized === 'NONE' ||
      normalized === 'PROVIDER_FALLBACK' ||
      normalized === 'DETERMINISTIC_ONLY' ||
      normalized === 'LIGHT_DERIVATION' ||
      normalized === 'RETRY_THEN_REVIEW' ||
      normalized === 'RETRY_THEN_DOWNGRADE' ||
      normalized === 'DOWNGRADE_ONLY'
    ) {
      return normalized;
    }

    return null;
  }

  private normalizeProjectType(value: unknown) {
    const normalized = this.readString(value).toLowerCase();
    if (
      normalized === 'product' ||
      normalized === 'tool' ||
      normalized === 'model' ||
      normalized === 'infra' ||
      normalized === 'demo'
    ) {
      return normalized as HistoricalRecoverySignal['projectType'];
    }

    return null;
  }

  private normalizeVerdict(value: unknown) {
    const normalized = this.readString(value).toUpperCase();
    if (normalized === 'GOOD' || normalized === 'OK' || normalized === 'BAD') {
      return normalized as HistoricalRecoverySignal['verdict'];
    }

    return null;
  }

  private normalizeAction(value: unknown) {
    const normalized = this.readString(value).toUpperCase();
    if (
      normalized === 'BUILD' ||
      normalized === 'CLONE' ||
      normalized === 'IGNORE' ||
      normalized === 'SKIP'
    ) {
      return normalized as HistoricalRecoverySignal['action'];
    }

    return null;
  }

  private normalizePriority(value: unknown) {
    const normalized = this.readString(value).toUpperCase();
    if (normalized === 'P0' || normalized === 'P1' || normalized === 'P2' || normalized === 'P3') {
      return normalized as HistoricalRecoverySignal['priority'];
    }

    return null;
  }

  private normalizeSource(value: unknown) {
    const normalized = this.readString(value).toLowerCase();
    if (
      normalized === 'manual' ||
      normalized === 'claude' ||
      normalized === 'local' ||
      normalized === 'fallback'
    ) {
      return normalized as HistoricalRecoverySignal['source'];
    }

    return null;
  }

  private normalizeStrength(value: unknown) {
    const normalized = this.readString(value).toUpperCase();
    if (normalized === 'STRONG' || normalized === 'MEDIUM' || normalized === 'WEAK') {
      return normalized as HistoricalRecoverySignal['strength'];
    }

    return null;
  }

  private normalizeFavoritePriority(value: unknown) {
    const normalized = this.readString(value).toUpperCase();
    if (normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'HIGH') {
      return normalized as HistoricalRecoverySignal['favoritePriority'];
    }

    return null;
  }
}
