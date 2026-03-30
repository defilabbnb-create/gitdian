import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY,
  FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY,
} from '../analysis/helpers/frozen-analysis-pool.types';
import {
  evaluateAnalysisPoolIntakeGate,
  readAnalysisPoolFreezeState,
  readFrozenAnalysisPoolBatchSnapshot,
} from '../analysis/helpers/frozen-analysis-pool.helper';
import { JobLogService } from '../job-log/job-log.service';
import {
  QueueDepthSummary,
  QueueJobRuntimeSnapshot,
  QueueService,
  parseBooleanEnvFlag,
  readGitHubNewRepositoryIntakeEnabledFromEnv,
} from '../queue/queue.service';
import { QUEUE_NAMES } from '../queue/queue.constants';
import {
  IDEA_MAIN_CATEGORIES,
  IdeaMainCategory,
} from '../analysis/idea-snapshot-taxonomy';
import { runWithConcurrency } from '../analysis/helpers/run-with-concurrency.helper';
import { BackfillCreatedRepositoriesDto } from './dto/backfill-created-repositories.dto';
import { GitHubClient } from './github.client';
import { RadarOperationsService } from './radar-operations.service';
import { GitHubService } from './github.service';
import { GitHubKeywordSupplyService } from './github-keyword-supply.service';
import { GitHubSearchConcurrencyService } from './github-search-concurrency.service';

type RadarMode = 'bootstrap' | 'live' | 'paused';
type RadarWindowStrategy = 'fast-start' | 'steady' | 'live';
type SingleAnalysisBulkEntries = Parameters<
  QueueService['enqueueSingleAnalysesBulk']
>[0];

type RadarBackfillDefaults = {
  language: string | null;
  starMin: number | null;
  perWindowLimit: number;
  targetCategories: IdeaMainCategory[];
};

type RadarWindowState = {
  startDate: string;
  endDate: string;
  jobId: string;
  queueJobId: string;
  scheduledAt: string;
  strategy: RadarWindowStrategy;
  widthDays: number;
  searchDepth: number;
  defaults: RadarBackfillDefaults;
};

type RadarCompletedWindow = {
  startDate: string;
  endDate: string;
  jobId: string;
  completedAt: string;
  jobStatus: 'SUCCESS' | 'FAILED';
};

type RadarCompletedMetrics = {
  scannedDays: number;
  scannedWindows: number;
  fetchedLinks: number;
  snapshotQueued: number;
  deepAnalysisQueued: number;
  promisingCandidates: number;
  toolsCount: number;
  aiCount: number;
  infraCount: number;
  dataCount: number;
  targetCategories: string[];
  reposPerMinute: number;
  snapshotThroughput: number;
  deepThroughput: number;
};

type RadarRuntimeWarning = {
  code: string;
  level: 'warning' | 'critical';
  message: string;
};

type PendingBackfillRuntime = {
  currentSearchWindow: {
    label: string | null;
    searchWindowStart: string | null;
    searchWindowEnd: string | null;
  } | null;
  currentWindowSearchDepth: number | null;
  currentWindowTotalCount: number | null;
  recentRetryCount: number;
  recentRateLimitHits: number;
  runtimeUpdatedAt: string | null;
};

type RadarState = {
  mode: RadarMode;
  bootstrapStartDate: string;
  bootstrapCursorDate: string;
  bootstrapEndDate: string;
  bootstrapFastStartCursorDate: string | null;
  fastStartCompleted: boolean;
  lastScheduledAt: string | null;
  lastCompletedWindow: RadarCompletedWindow | null;
  pendingWindow: RadarWindowState | null;
  isRunning: boolean;
  lastError: string | null;
  schedulerReason: string | null;
};

type RadarStatusPayload = {
  mode: RadarMode;
  bootstrapStartDate: string;
  bootstrapCursorDate: string;
  bootstrapEndDate: string;
  bootstrapFastStartCursorDate: string | null;
  bootstrapFastStartEnabled: boolean;
  lastScheduledAt: string | null;
  lastCompletedWindow: RadarCompletedWindow | null;
  pendingWindow: RadarWindowState | null;
  isRunning: boolean;
  lastError: string | null;
  schedulerReason: string | null;
  schedulerEnabled: boolean;
  snapshotQueueSize: number;
  deepQueueSize: number;
  backfillQueueSize: number;
  pendingBackfillJobs: number;
  currentWindowWidth: number | null;
  currentWindowSearchDepth: number | null;
  currentBackfillDefaults: RadarBackfillDefaults & {
    strategy: RadarWindowStrategy;
    fastStart: boolean;
  };
  tokenPoolHealth: {
    hasTokenPool: boolean;
    tokenPoolSize: number;
    usingMultiToken: boolean;
    anonymousFallback: boolean;
    cooldownTokenCount: number;
    disabledTokenCount: number;
    lastKnownRateLimitStatus: ReturnType<
      GitHubClient['getDiagnostics']
    >['lastKnownRateLimitStatus'];
  };
  warnings: RadarRuntimeWarning[];
  maintenance: {
    lastMaintenanceAt: string | null;
    lastLogRotationAt: string | null;
    lastCleanupAt: string | null;
    lastSummarySyncAt: string | null;
    latestSummaryDate: string | null;
    lastLogRotation: {
      rotatedFiles: number;
      deletedFiles: number;
    } | null;
    lastCleanup: {
      deletedFailedJobLogs: number;
      deletedSucceededJobLogs: number;
      clearedAnalysisRawResponses: number;
    } | null;
    timeoutStats: {
      snapshotTimeouts: number;
      deepTimeouts: number;
      ideaExtractTimeouts: number;
    };
    deepRuntimeStats: {
      date: string;
      deepEnteredCount: number;
      deepSkippedCount: number;
      ideaExtractExecutedCount: number;
      ideaExtractSkippedCount: number;
      ideaExtractDeferredCount: number;
      ideaExtractTimeoutCount: number;
      ideaExtractExecutionRate: number;
      lastIdeaExtractInflight: number;
      ideaExtractMaxInflight: number;
      updatedAt: string | null;
    };
  };
  currentSearchWindow: PendingBackfillRuntime['currentSearchWindow'];
  currentWindowTotalCount: number | null;
  recentRetryCount: number;
  recentRateLimitHits: number;
  runtimeUpdatedAt: string | null;
  lastCompletedMetrics: RadarCompletedMetrics | null;
  reposPerMinute: number | null;
  snapshotThroughput: number | null;
  deepThroughput: number | null;
  github: ReturnType<GitHubClient['getDiagnostics']>;
  currentSearchConcurrency: number;
  targetSearchConcurrency: number;
  adjustmentReason: string | null;
  lastAdjustedAt: string | null;
  recentAverageSearchLatencyMs: number | null;
  keywordModeEnabled: boolean;
  currentKeywordStrategy: string;
  keywordSearchConcurrency: number;
  keywordLookbackDays: number;
  activeKeywordGroups: string[];
  keywordGroupStats: Array<{
    group: string;
    searchedCount: number;
    fetchedCount: number;
    snapshotPromisingCount: number;
    deepQueuedCount: number;
    goodIdeasCount: number;
    cloneIdeasCount: number;
    lastSearchedAt: string | null;
    lastProducedAt: string | null;
    priorityScore: number;
  }>;
  currentRecommendedSettings: {
    bootstrapDays: number;
    liveLookbackDays: number;
    schedulerIntervalMs: number;
    bootstrapFastStart: boolean;
    snapshotQueueLowWatermark: number;
    snapshotQueueHighWatermark: number;
    deepQueueLowWatermark: number;
    deepQueueHighWatermark: number;
    snapshotRefreshDays: number;
    deepAnalysisRefreshDays: number;
    continuousDefaultLanguage: string | null;
    continuousDefaultStarMin: number | null;
    continuousDefaultPerWindowLimit: number;
    continuousDefaultTargetCategories: IdeaMainCategory[];
    githubBackfillConcurrency: number;
    githubSearchMaxConcurrency: number;
    githubSearchMinConcurrency: number;
    githubSearchAdjustIntervalMs: number;
    ideaSnapshotConcurrency: number;
    deepAnalysisConcurrency: number;
    snapshotTimeoutMs: number;
    deepTimeoutMs: number;
    ideaExtractTimeoutMs: number;
    ideaExtractMaxInflight: number;
    useHeavyModelForSnapshot: boolean;
    targetCategories: string[];
    keywordModeEnabled: boolean;
    keywordStrategy: string;
    keywordSearchConcurrency: number;
    keywordLookbackDays: number;
    keywordPerQueryLimit: number;
  };
};

const RADAR_STATE_CONFIG_KEY = 'github.radar.state';
const RADAR_SCHEDULER_JOB_NAME = 'github.radar.scheduler';
const DEFAULT_BOOTSTRAP_CHUNK_DAYS = 1;
const DEFAULT_CONSERVATIVE_PER_WINDOW_LIMIT = 5;
const DEFAULT_NORMAL_PER_WINDOW_LIMIT = 10;
const DEFAULT_PENDING_WINDOW_STALE_MS = 120_000;
const DEFAULT_MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_CONTINUOUS_TARGET_CATEGORIES: IdeaMainCategory[] = [
  'tools',
  'ai',
  'data',
  'infra',
];

export function isContinuousRadarConfigured(
  env: NodeJS.ProcessEnv = process.env,
) {
  return parseBooleanEnvFlag(env.ENABLE_CONTINUOUS_RADAR, false);
}

export function isContinuousRadarSchedulingEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return (
    isContinuousRadarConfigured(env) &&
    readGitHubNewRepositoryIntakeEnabledFromEnv(env)
  );
}

@Injectable()
export class GitHubRadarService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GitHubRadarService.name);
  private schedulerTimer: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly jobLogService: JobLogService,
    private readonly gitHubClient: GitHubClient,
    private readonly gitHubService: GitHubService,
    private readonly radarOperationsService: RadarOperationsService,
    private readonly gitHubSearchConcurrencyService: GitHubSearchConcurrencyService,
    private readonly gitHubKeywordSupplyService: GitHubKeywordSupplyService,
  ) {}

  async onModuleInit() {
    if (process.env.ENABLE_QUEUE_WORKERS !== 'true') {
      return;
    }

    if (!isContinuousRadarConfigured()) {
      return;
    }

    await this.ensureState();
    this.startSchedulerLoop();
  }

  onModuleDestroy() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  async start() {
    this.assertContinuousRadarSchedulingEnabled('start');
    const state = await this.ensureState();
    const nextMode = this.resolveResumeMode(state);
    const updated = await this.saveState({
      ...state,
      mode: nextMode,
      isRunning: true,
      lastError: null,
    });

    await this.recordSchedulerEvent('start', {
      mode: updated.mode,
    });
    this.startSchedulerLoop();
    this.triggerSchedulerTick('manual-start');

    return this.getStatus();
  }

  async pause() {
    const state = await this.ensureState();
    const updated = await this.saveState({
      ...state,
      mode: 'paused',
      isRunning: false,
    });

    await this.recordSchedulerEvent('pause', {
      mode: updated.mode,
    });

    return this.getStatus();
  }

  async resume() {
    this.assertContinuousRadarSchedulingEnabled('resume');
    const state = await this.ensureState();
    const nextMode = this.resolveResumeMode(state);
    const updated = await this.saveState({
      ...state,
      mode: nextMode,
      isRunning: true,
      lastError: null,
    });

    await this.recordSchedulerEvent('resume', {
      mode: updated.mode,
    });
    this.startSchedulerLoop();
    this.triggerSchedulerTick('manual-resume');

    return this.getStatus();
  }

  async getStatus(): Promise<RadarStatusPayload> {
    const state = await this.ensureState();
    const [snapshotQueue, deepQueue] = await Promise.all([
      this.queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SNAPSHOT),
      this.queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SINGLE),
    ]);
    const effectiveBackfillQueueSize =
      await this.resolveEffectiveBackfillQueueTotal();
    const githubDiagnostics = this.gitHubClient.getDiagnostics();
    const searchConcurrency = this.gitHubSearchConcurrencyService.getDiagnostics();
    const keywordDiagnostics =
      await this.gitHubKeywordSupplyService.getDiagnostics();
    const pendingRuntime = state.pendingWindow
      ? await this.loadPendingBackfillRuntime(state.pendingWindow.jobId)
      : null;
    const lastCompletedMetrics = await this.loadLastCompletedMetrics(
      state.lastCompletedWindow?.jobId ?? null,
    );
    const bootstrapFastStartEnabled = this.isBootstrapFastStartEnabled(
      state,
      snapshotQueue.total,
      deepQueue.total,
    );
    const conservativeMode = this.isGitHubConservativeMode(githubDiagnostics);
    const nextDefaults = this.buildContinuousBackfillDefaults(
      bootstrapFastStartEnabled,
      conservativeMode,
    );
    const schedulerReason = this.resolveStatusSchedulerReason(
      state,
      snapshotQueue,
      deepQueue,
      effectiveBackfillQueueSize,
      githubDiagnostics,
      bootstrapFastStartEnabled,
    );
    const currentBackfillDefaults: RadarStatusPayload['currentBackfillDefaults'] =
      state.pendingWindow
      ? {
          ...state.pendingWindow.defaults,
          strategy: state.pendingWindow.strategy,
          fastStart: state.pendingWindow.strategy === 'fast-start',
        }
      : {
          ...nextDefaults,
          strategy:
            state.mode === 'live'
              ? 'live'
              : bootstrapFastStartEnabled
                ? 'fast-start'
                : 'steady',
          fastStart: bootstrapFastStartEnabled,
        };
    const warningState = await this.radarOperationsService.getWarnings({
      isRunning: state.isRunning,
      pendingWindowScheduledAt: state.pendingWindow?.scheduledAt ?? null,
      schedulerReason,
      snapshotQueueSize: snapshotQueue.total,
      deepQueueSize: deepQueue.total,
      tokenPoolHealth: {
        hasTokenPool: githubDiagnostics.hasTokenPool,
        tokenPoolSize: githubDiagnostics.tokenPoolSize,
        anonymousFallback: githubDiagnostics.anonymousFallback,
        cooldownTokenCount: githubDiagnostics.cooldownTokenCount,
        disabledTokenCount: githubDiagnostics.disabledTokenCount,
        lastKnownRateLimitStatus: githubDiagnostics.lastKnownRateLimitStatus,
      },
      currentSearchConcurrency: searchConcurrency.currentSearchConcurrency,
      targetSearchConcurrency: searchConcurrency.targetSearchConcurrency,
      adjustmentReason: searchConcurrency.adjustmentReason,
      recentRetryCount:
        pendingRuntime?.recentRetryCount ?? searchConcurrency.recentRetryCount,
      recentRateLimitHits:
        pendingRuntime?.recentRateLimitHits ??
        searchConcurrency.recentRateLimitHits,
      keywordModeEnabled: keywordDiagnostics.keywordModeEnabled,
      activeKeywordGroups: keywordDiagnostics.activeKeywordGroups,
      keywordGroupStats: keywordDiagnostics.keywordGroupStats,
      staleThresholdMs: this.resolvePendingWindowStaleMs(),
    });

    return {
      ...state,
      bootstrapFastStartEnabled,
      schedulerEnabled:
        process.env.ENABLE_QUEUE_WORKERS === 'true' &&
        this.isContinuousRadarEnabled(),
      schedulerReason,
      snapshotQueueSize: snapshotQueue.total,
      deepQueueSize: deepQueue.total,
      backfillQueueSize: effectiveBackfillQueueSize,
      pendingBackfillJobs: effectiveBackfillQueueSize,
      currentWindowWidth: state.pendingWindow?.widthDays ?? null,
      currentWindowSearchDepth: state.pendingWindow?.searchDepth ?? null,
      currentBackfillDefaults,
      tokenPoolHealth: {
        hasTokenPool: githubDiagnostics.hasTokenPool,
        tokenPoolSize: githubDiagnostics.tokenPoolSize,
        usingMultiToken: githubDiagnostics.usingMultiToken,
        anonymousFallback: githubDiagnostics.anonymousFallback,
        cooldownTokenCount: githubDiagnostics.cooldownTokenCount,
        disabledTokenCount: githubDiagnostics.disabledTokenCount,
        lastKnownRateLimitStatus: githubDiagnostics.lastKnownRateLimitStatus,
      },
      warnings: warningState.warnings,
      maintenance: {
        ...warningState.maintenanceState,
        timeoutStats: warningState.timeoutStats,
        deepRuntimeStats: warningState.deepRuntimeStats,
      },
      currentSearchWindow:
        pendingRuntime?.currentSearchWindow ??
        (state.pendingWindow
          ? {
              label: state.pendingWindow.startDate,
              searchWindowStart: state.pendingWindow.startDate,
              searchWindowEnd: state.pendingWindow.endDate,
            }
          : null),
      currentWindowTotalCount: pendingRuntime?.currentWindowTotalCount ?? null,
      recentRetryCount: pendingRuntime?.recentRetryCount ?? 0,
      recentRateLimitHits: pendingRuntime?.recentRateLimitHits ?? 0,
      runtimeUpdatedAt: pendingRuntime?.runtimeUpdatedAt ?? null,
      lastCompletedMetrics,
      reposPerMinute: lastCompletedMetrics?.reposPerMinute ?? null,
      snapshotThroughput: lastCompletedMetrics?.snapshotThroughput ?? null,
      deepThroughput: lastCompletedMetrics?.deepThroughput ?? null,
      github: githubDiagnostics,
      currentSearchConcurrency: searchConcurrency.currentSearchConcurrency,
      targetSearchConcurrency: searchConcurrency.targetSearchConcurrency,
      adjustmentReason: searchConcurrency.adjustmentReason,
      lastAdjustedAt: searchConcurrency.lastAdjustedAt,
      recentAverageSearchLatencyMs: searchConcurrency.recentAverageLatencyMs,
      keywordModeEnabled: keywordDiagnostics.keywordModeEnabled,
      currentKeywordStrategy: keywordDiagnostics.currentKeywordStrategy,
      keywordSearchConcurrency: keywordDiagnostics.keywordSearchConcurrency,
      keywordLookbackDays: keywordDiagnostics.keywordLookbackDays,
      activeKeywordGroups: keywordDiagnostics.activeKeywordGroups,
      keywordGroupStats: keywordDiagnostics.keywordGroupStats,
      currentRecommendedSettings: this.buildRecommendedSettings(),
    };
  }

  private startSchedulerLoop() {
    if (this.schedulerTimer) {
      return;
    }

    const intervalMs = this.readInt('RADAR_SCHEDULER_INTERVAL_MS', 15_000);
    this.schedulerTimer = setInterval(() => {
      this.triggerSchedulerTick('interval');
    }, intervalMs);

    this.triggerSchedulerTick('boot');
  }

  private triggerSchedulerTick(reason: string) {
    void this.runSchedulerTick(reason);
  }

  private async runSchedulerTick(reason: string) {
    if (this.tickInFlight) {
      return;
    }

    this.tickInFlight = true;

    try {
      let state = await this.ensureState();
      await this.maybeRunMaintenanceTick();

      if (!state.isRunning || state.mode === 'paused') {
        return;
      }

      state = await this.reconcilePendingWindow(state);

      if (!this.isContinuousRadarEnabled()) {
        await this.updateSchedulerReason(state, 'github_intake_disabled');
        return;
      }

      const githubDiagnostics = this.gitHubClient.getDiagnostics();
      const [snapshotQueue, deepQueue] = await Promise.all([
        this.queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SNAPSHOT),
        this.queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SINGLE),
      ]);
      const snapshotLowWatermark = this.resolveSnapshotLowWatermark();
      const deepLowWatermark = this.resolveDeepLowWatermark();
      const searchConcurrency =
        await this.gitHubSearchConcurrencyService.evaluateAndAdjust({
          snapshotQueueSize: snapshotQueue.total,
          deepQueueSize: deepQueue.total,
          snapshotLowWatermark,
          deepLowWatermark,
          tokenPoolHealth: {
            cooldownTokenCount: githubDiagnostics.cooldownTokenCount,
            disabledTokenCount: githubDiagnostics.disabledTokenCount,
            lastKnownRateLimitStatus: githubDiagnostics.lastKnownRateLimitStatus,
            anonymousFallback: githubDiagnostics.anonymousFallback,
          },
        });
      const effectiveBackfillQueueTotal =
        await this.resolveEffectiveBackfillQueueTotal();

      const bootstrapFastStartEnabled = this.isBootstrapFastStartEnabled(
        state,
        snapshotQueue.total,
        deepQueue.total,
      );
      const conservativeMode = this.isGitHubConservativeMode(githubDiagnostics);
      const currentDefaults = this.buildContinuousBackfillDefaults(
        bootstrapFastStartEnabled,
        conservativeMode,
      );
      const targetCategories = currentDefaults.targetCategories;
      const deepQueued = await this.topUpDeepAnalysisQueueIfNeeded(
        deepQueue,
        targetCategories,
      );

      const backfillConcurrency = this.readInt('GITHUB_BACKFILL_CONCURRENCY', 1);
      const snapshotHighWatermark = this.resolveSnapshotHighWatermark();

      const keywordSupply = await this.gitHubKeywordSupplyService.maybeRunKeywordSupply({
        mode: state.mode,
        snapshotQueueSize: snapshotQueue.total,
        snapshotLowWatermark,
        deepQueueSize: deepQueue.total,
        deepLowWatermark,
        conservativeMode,
        pendingBackfillWindow: Boolean(state.pendingWindow),
        targetCategories,
        tokenPoolHealth: {
          anonymousFallback: githubDiagnostics.anonymousFallback,
          cooldownTokenCount: githubDiagnostics.cooldownTokenCount,
          disabledTokenCount: githubDiagnostics.disabledTokenCount,
          lastKnownRateLimitStatus: githubDiagnostics.lastKnownRateLimitStatus,
        },
      });

      if (keywordSupply.executed) {
        await this.updateSchedulerReason(
          state,
          `keyword_supply_${keywordSupply.group ?? 'unknown'}`,
        );
        await this.recordSchedulerEvent('run_keyword_supply', {
          mode: state.mode,
          group: keywordSupply.group,
          searchConcurrency: searchConcurrency.currentSearchConcurrency,
          snapshotQueueSize: snapshotQueue.total,
          deepQueueSize: deepQueue.total,
          result: keywordSupply.result,
        });
        return;
      }

      if (snapshotQueue.total >= snapshotHighWatermark) {
        await this.updateSchedulerReason(state, 'snapshot_queue_high_watermark');
        return;
      }

      if (effectiveBackfillQueueTotal >= backfillConcurrency || state.pendingWindow) {
        const pendingReason = state.pendingWindow
          ? snapshotQueue.total === 0 && deepQueue.total === 0
            ? 'pending_backfill_resolving_search_windows'
            : 'pending_backfill_running'
          : 'backfill_concurrency_saturated';
        await this.updateSchedulerReason(state, pendingReason);
        return;
      }

      if (await this.isAnalysisPoolFrozenForNewEntries()) {
        await this.updateSchedulerReason(state, 'analysis_pool_frozen');
        return;
      }

      const shouldScheduleBackfill = conservativeMode
        ? snapshotQueue.total === 0
        : snapshotQueue.total < snapshotLowWatermark;

      if (!shouldScheduleBackfill) {
        await this.updateSchedulerReason(
          state,
          conservativeMode
            ? 'github_conservative_mode_waiting'
            : 'snapshot_queue_above_low_watermark',
        );
        return;
      }

      const nextWindow = this.resolveNextWindow(
        state,
        conservativeMode,
        bootstrapFastStartEnabled,
      );

      if (!nextWindow) {
        await this.updateSchedulerReason(state, 'no_bootstrap_window_available');
        return;
      }

      const dto = this.buildBackfillDtoForWindow(
        nextWindow.startDate,
        nextWindow.endDate,
        nextWindow.defaults,
        conservativeMode,
      );
      const queuedJob = await this.queueService.enqueueGitHubCreatedBackfill(
        dto,
        'radar',
      );

      state = await this.saveState({
        ...state,
        lastScheduledAt: new Date().toISOString(),
        pendingWindow: {
          startDate: nextWindow.startDate,
          endDate: nextWindow.endDate,
          jobId: queuedJob.jobId,
          queueJobId: queuedJob.queueJobId,
          scheduledAt: new Date().toISOString(),
          strategy: nextWindow.strategy,
          widthDays: nextWindow.widthDays,
          searchDepth: nextWindow.searchDepth,
          defaults: nextWindow.defaults,
        },
        schedulerReason:
          nextWindow.strategy === 'fast-start'
            ? 'scheduled_bootstrap_fast_start'
            : nextWindow.strategy === 'live'
              ? 'scheduled_live_backfill'
              : 'scheduled_bootstrap_backfill',
      });

      await this.recordSchedulerEvent('schedule_backfill', {
        reason,
        mode: state.mode,
        startDate: nextWindow.startDate,
        endDate: nextWindow.endDate,
        strategy: nextWindow.strategy,
        conservativeMode,
        bootstrapFastStartEnabled,
        language: nextWindow.defaults.language,
        starMin: nextWindow.defaults.starMin,
        perWindowLimit: nextWindow.defaults.perWindowLimit,
        targetCategories: nextWindow.defaults.targetCategories,
        currentWindowWidth: nextWindow.widthDays,
        currentWindowSearchDepth: nextWindow.searchDepth,
        snapshotQueueSize: snapshotQueue.total,
        deepQueueSize: deepQueue.total,
        backfillQueueSize: effectiveBackfillQueueTotal,
        deepQueued,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown radar scheduler error.';
      this.logger.warn(`Continuous radar tick failed: ${message}`);

      const state = await this.ensureState();
      await this.saveState({
        ...state,
        lastError: message,
      });
    } finally {
      this.tickInFlight = false;
    }
  }

  private async reconcilePendingWindow(state: RadarState) {
    if (!state.pendingWindow) {
      return state;
    }

    const job = await this.prisma.jobLog.findUnique({
      where: {
        id: state.pendingWindow.jobId,
      },
      select: {
        id: true,
        jobStatus: true,
        errorMessage: true,
        finishedAt: true,
        result: true,
        createdAt: true,
        startedAt: true,
        updatedAt: true,
      },
    });

    if (!job) {
      return this.saveState({
        ...state,
        pendingWindow: null,
        lastError: 'Tracked radar backfill job could not be found.',
      });
    }

    if (job.jobStatus === JobStatus.PENDING || job.jobStatus === JobStatus.RUNNING) {
      const queueSnapshot = await this.queueService.getQueueJobSnapshot(
        QUEUE_NAMES.GITHUB_CREATED_BACKFILL,
        state.pendingWindow.queueJobId,
      );

      if (this.isBackfillJobStale(job, queueSnapshot)) {
        return this.recoverStalePendingWindow(state, job, queueSnapshot);
      }

      return state;
    }

    const completedAt = job.finishedAt?.toISOString() ?? new Date().toISOString();
    const completedWindow: RadarCompletedWindow = {
      startDate: state.pendingWindow.startDate,
      endDate: state.pendingWindow.endDate,
      jobId: state.pendingWindow.jobId,
      completedAt,
      jobStatus: job.jobStatus,
    };
    const resultPayload = this.readJsonRecord(job.result);
    const snapshotQueued = this.readNumericValue(resultPayload.snapshotQueued);
    const deepAnalysisQueued = this.readNumericValue(
      resultPayload.deepAnalysisQueued,
    );
    const promisingCandidates = this.readNumericValue(
      resultPayload.promisingCandidates,
    );

    if (job.jobStatus === JobStatus.SUCCESS) {
      if (state.pendingWindow.strategy === 'fast-start') {
        const nextFastStartCursor = this.getNextFastStartCursor(state);
        const fastStartCompleted =
          state.fastStartCompleted ||
          snapshotQueued > 0 ||
          deepAnalysisQueued > 0 ||
          promisingCandidates > 0 ||
          !nextFastStartCursor ||
          this.compareDateStrings(nextFastStartCursor, state.bootstrapCursorDate) < 0;

        return this.saveState({
          ...state,
          bootstrapFastStartCursorDate: fastStartCompleted
            ? null
            : nextFastStartCursor,
          fastStartCompleted,
          lastCompletedWindow: completedWindow,
          pendingWindow: null,
          lastError: null,
          schedulerReason: fastStartCompleted
            ? 'fast_start_completed'
            : 'fast_start_advance_recent_window',
        });
      }

      const nextCursorDate =
        state.mode === 'bootstrap'
          ? this.addDays(state.pendingWindow.endDate, 1)
          : state.bootstrapCursorDate;
      const bootstrapCompleted =
        state.mode === 'bootstrap' &&
        this.compareDateStrings(nextCursorDate, state.bootstrapEndDate) > 0;

      return this.saveState({
        ...state,
        mode: bootstrapCompleted ? 'live' : state.mode,
        bootstrapCursorDate: bootstrapCompleted
          ? nextCursorDate
          : nextCursorDate,
        bootstrapFastStartCursorDate: bootstrapCompleted
          ? null
          : state.bootstrapFastStartCursorDate,
        fastStartCompleted: bootstrapCompleted ? true : state.fastStartCompleted,
        lastCompletedWindow: completedWindow,
        pendingWindow: null,
        lastError: null,
        schedulerReason: bootstrapCompleted
          ? 'bootstrap_completed_switch_to_live'
          : 'bootstrap_cursor_advanced',
      });
    }

    if (state.pendingWindow.strategy === 'fast-start') {
      const nextFastStartCursor = this.getNextFastStartCursor(state);
      const fastStartCompleted =
        !nextFastStartCursor ||
        this.compareDateStrings(nextFastStartCursor, state.bootstrapCursorDate) < 0;

      return this.saveState({
        ...state,
        bootstrapFastStartCursorDate: fastStartCompleted
          ? null
          : nextFastStartCursor,
        fastStartCompleted,
        lastCompletedWindow: completedWindow,
        pendingWindow: null,
        lastError: job.errorMessage ?? 'Radar backfill window failed.',
        schedulerReason: 'fast_start_window_failed',
      });
    }

    return this.saveState({
      ...state,
      lastCompletedWindow: completedWindow,
      pendingWindow: null,
      lastError: job.errorMessage ?? 'Radar backfill window failed.',
      schedulerReason: 'bootstrap_window_failed',
    });
  }

  private async recoverStalePendingWindow(
    state: RadarState,
    job: {
      id: string;
      jobStatus: JobStatus;
      createdAt: Date;
      startedAt: Date | null;
      updatedAt: Date;
    },
    queueSnapshot: QueueJobRuntimeSnapshot | null,
  ) {
    const heartbeatAgeMs = this.getBackfillJobHeartbeatAgeMs(job);
    const errorMessage = `Radar backfill window became stale after ${heartbeatAgeMs}ms without heartbeat and will be rescheduled automatically.`;

    if (job.jobStatus === JobStatus.PENDING || job.jobStatus === JobStatus.RUNNING) {
      await this.jobLogService.failJob({
        jobId: job.id,
        errorMessage,
        result: {
          stale: true,
          recoveredByScheduler: true,
          queueState: queueSnapshot?.state ?? null,
          queueJobId: state.pendingWindow?.queueJobId ?? null,
          heartbeatAgeMs,
        },
      });
    }

    await this.recordSchedulerEvent('recover_stale_backfill', {
      mode: state.mode,
      jobId: job.id,
      queueJobId: state.pendingWindow?.queueJobId ?? null,
      startDate: state.pendingWindow?.startDate ?? null,
      endDate: state.pendingWindow?.endDate ?? null,
      strategy: state.pendingWindow?.strategy ?? null,
      queueState: queueSnapshot?.state ?? null,
      heartbeatAgeMs,
    });

    return this.saveState({
      ...state,
      pendingWindow: null,
      lastError: errorMessage,
      schedulerReason: 'recovered_stale_pending_window',
    });
  }

  private async resolveEffectiveBackfillQueueTotal() {
    const queueJobs = await this.queueService.listQueueJobSnapshots(
      QUEUE_NAMES.GITHUB_CREATED_BACKFILL,
      ['active', 'waiting', 'delayed', 'prioritized'],
    );

    if (!queueJobs.length) {
      return 0;
    }

    const queueJobIds = queueJobs.map((job) => job.queueJobId);
    const jobLogs = await this.prisma.jobLog.findMany({
      where: {
        queueName: QUEUE_NAMES.GITHUB_CREATED_BACKFILL,
        queueJobId: {
          in: queueJobIds,
        },
      },
      select: {
        queueJobId: true,
        jobStatus: true,
        createdAt: true,
        startedAt: true,
        updatedAt: true,
      },
    });
    const jobLogMap = new Map(
      jobLogs.map((jobLog) => [jobLog.queueJobId ?? '', jobLog]),
    );

    return queueJobs.reduce((count, queueJob) => {
      if (queueJob.state !== 'active') {
        return count + 1;
      }

      const jobLog = jobLogMap.get(queueJob.queueJobId);

      if (!jobLog) {
        return count + 1;
      }

      if (
        jobLog.jobStatus === JobStatus.SUCCESS ||
        jobLog.jobStatus === JobStatus.FAILED
      ) {
        return count;
      }

      if (this.isBackfillJobStale(jobLog, queueJob)) {
        return count;
      }

      return count + 1;
    }, 0);
  }

  private isBackfillJobStale(
    job: {
      createdAt: Date;
      startedAt: Date | null;
      updatedAt: Date;
    },
    queueSnapshot: QueueJobRuntimeSnapshot | null,
  ) {
    if (
      queueSnapshot &&
      ['waiting', 'delayed', 'prioritized'].includes(queueSnapshot.state)
    ) {
      return false;
    }

    return this.getBackfillJobHeartbeatAgeMs(job) > this.resolvePendingWindowStaleMs();
  }

  private getBackfillJobHeartbeatAgeMs(job: {
    createdAt: Date;
    startedAt: Date | null;
    updatedAt: Date;
  }) {
    const referenceTime =
      job.updatedAt?.getTime() ??
      job.startedAt?.getTime() ??
      job.createdAt.getTime();

    return Math.max(0, Date.now() - referenceTime);
  }

  private resolvePendingWindowStaleMs() {
    return Math.max(
      DEFAULT_PENDING_WINDOW_STALE_MS,
      this.readInt('RADAR_SCHEDULER_INTERVAL_MS', 15_000) * 8,
    );
  }

  private async topUpDeepAnalysisQueueIfNeeded(
    deepQueue: QueueDepthSummary,
    targetCategories: string[],
  ) {
    const deepLowWatermark = this.resolveDeepLowWatermark();
    const deepHighWatermark = this.resolveDeepHighWatermark();

    if (deepQueue.total >= deepLowWatermark || deepQueue.total >= deepHighWatermark) {
      return 0;
    }

    const deficit = Math.max(0, deepLowWatermark - deepQueue.total);
    if (deficit === 0) {
      return 0;
    }

    const activeDeepJobs = await this.prisma.jobLog.findMany({
      where: {
        jobName: 'analysis.run_single',
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
      },
      select: {
        payload: true,
      },
    });
    const activeRepositoryIds = new Set(
      activeDeepJobs
        .map((job) =>
          job.payload &&
          typeof job.payload === 'object' &&
          !Array.isArray(job.payload) &&
          'repositoryId' in job.payload
            ? String((job.payload as Record<string, unknown>).repositoryId)
            : null,
        )
        .filter((value): value is string => Boolean(value)),
    );
    const candidates = await this.gitHubService.findDeepAnalysisBacklogCandidates({
      limit: deficit,
      targetCategories,
      deepAnalysisOnlyIfPromising: true,
    });
    const eligibleCandidates = candidates.filter(
      (repository) => !activeRepositoryIds.has(repository.id),
    );

    if (!eligibleCandidates.length) {
      return 0;
    }

    const bulkQueueService = this.queueService as QueueService & {
      enqueueSingleAnalysesBulk?: QueueService['enqueueSingleAnalysesBulk'];
    };
    const queueEntries: SingleAnalysisBulkEntries = eligibleCandidates.map(
      (repository) => ({
        repositoryId: repository.id,
        dto: {
          runFastFilter: !repository.roughLevel,
          runCompleteness: true,
          runIdeaFit: true,
          runIdeaExtract: true,
          forceRerun: false,
        },
      }),
    );

    if (typeof bulkQueueService.enqueueSingleAnalysesBulk === 'function') {
      try {
        await bulkQueueService.enqueueSingleAnalysesBulk(queueEntries, 'radar');
      } catch (error) {
        this.logger.warn(
          `radar deep backlog bulk enqueue failed batchSize=${queueEntries.length} reason=${error instanceof Error ? error.message : 'unknown'} fallback=single_enqueue`,
        );
        await this.enqueueDeepBacklogEntriesIndividually(queueEntries, 'radar');
      }
    } else {
      await this.enqueueDeepBacklogEntriesIndividually(queueEntries, 'radar');
    }

    await this.recordSchedulerEvent('top_up_deep_analysis', {
      queued: eligibleCandidates.length,
      queueSizeBefore: deepQueue.total,
    });

    return eligibleCandidates.length;
  }

  private async enqueueDeepBacklogEntriesIndividually(
    entries: SingleAnalysisBulkEntries,
    triggeredBy: string,
  ) {
    await runWithConcurrency(
      entries,
      this.resolveDeepFallbackEnqueueConcurrency(entries.length),
      async (entry) => {
        await this.queueService.enqueueSingleAnalysis(
          entry.repositoryId,
          entry.dto,
          entry.triggeredBy ?? triggeredBy,
          {
            parentJobId: entry.parentJobId,
            metadata: entry.metadata,
            jobOptionsOverride: entry.jobOptionsOverride,
          },
        );
      },
    );
  }

  private resolveDeepFallbackEnqueueConcurrency(entryCount: number) {
    return Math.min(
      entryCount,
      this.readInt('DEEP_ANALYSIS_CONCURRENCY', 6),
    );
  }

  private buildBackfillDtoForWindow(
    startDate: string,
    endDate: string,
    defaults: RadarBackfillDefaults,
    conservativeMode: boolean,
  ): BackfillCreatedRepositoriesDto {
    return {
      startDate,
      endDate,
      days: this.diffDaysInclusive(startDate, endDate),
      perWindowLimit: conservativeMode
        ? Math.min(defaults.perWindowLimit, DEFAULT_CONSERVATIVE_PER_WINDOW_LIMIT)
        : defaults.perWindowLimit,
      language: defaults.language ?? undefined,
      starMin: defaults.starMin ?? undefined,
      runIdeaSnapshot: true,
      runFastFilter: true,
      runDeepAnalysis: true,
      deepAnalysisOnlyIfPromising: true,
      targetCategories: defaults.targetCategories,
    };
  }

  private resolveNextWindow(
    state: RadarState,
    conservativeMode: boolean,
    bootstrapFastStartEnabled: boolean,
  ):
    | {
        startDate: string;
        endDate: string;
        strategy: RadarWindowStrategy;
        widthDays: number;
        searchDepth: number;
        defaults: RadarBackfillDefaults;
      }
    | null {
    const defaults = this.buildContinuousBackfillDefaults(
      bootstrapFastStartEnabled,
      conservativeMode,
    );

    if (state.mode === 'bootstrap') {
      const bootstrapCursor = state.bootstrapCursorDate;

      if (this.compareDateStrings(bootstrapCursor, state.bootstrapEndDate) > 0) {
        return null;
      }

      if (
        bootstrapFastStartEnabled &&
        state.bootstrapFastStartCursorDate &&
        this.compareDateStrings(
          state.bootstrapFastStartCursorDate,
          bootstrapCursor,
        ) >= 0
      ) {
        return {
          startDate: state.bootstrapFastStartCursorDate,
          endDate: state.bootstrapFastStartCursorDate,
          strategy: 'fast-start',
          widthDays: 1,
          searchDepth: 0,
          defaults,
        };
      }

      const chunkDays = conservativeMode ? 1 : DEFAULT_BOOTSTRAP_CHUNK_DAYS;
      const endDate = this.minDateString(
        this.addDays(bootstrapCursor, chunkDays - 1),
        state.bootstrapEndDate,
      );

      return {
        startDate: bootstrapCursor,
        endDate,
        strategy: 'steady',
        widthDays: this.diffDaysInclusive(bootstrapCursor, endDate),
        searchDepth: 0,
        defaults,
      };
    }

    const liveLookbackDays = this.readInt('RADAR_LIVE_LOOKBACK_DAYS', 1);
    const liveEndDate = this.toDateString(new Date());
    const liveStartDate = this.addDays(liveEndDate, -(liveLookbackDays - 1));

    return {
      startDate: liveStartDate,
      endDate: liveEndDate,
      strategy: 'live',
      widthDays: this.diffDaysInclusive(liveStartDate, liveEndDate),
      searchDepth: 0,
      defaults,
    };
  }

  private async ensureState() {
    const existing = await this.readState();

    if (existing) {
      return existing;
    }

    return this.saveState(this.buildDefaultState());
  }

  private async readState(): Promise<RadarState | null> {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: RADAR_STATE_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object' || Array.isArray(row.configValue)) {
      return null;
    }

    return this.normalizeRadarState(row.configValue as Record<string, unknown>);
  }

  private async saveState(state: RadarState) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: RADAR_STATE_CONFIG_KEY,
      },
      update: {
        configValue: state as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: RADAR_STATE_CONFIG_KEY,
        configValue: state as unknown as Prisma.InputJsonValue,
      },
    });

    return state;
  }

  private buildDefaultState(): RadarState {
    const bootstrapDays = this.readInt('RADAR_BOOTSTRAP_DAYS', 365);
    const bootstrapEndDate = this.toDateString(new Date());
    const bootstrapStartDate = this.addDays(bootstrapEndDate, -(bootstrapDays - 1));

    return {
      mode: 'bootstrap',
      bootstrapStartDate,
      bootstrapCursorDate: bootstrapStartDate,
      bootstrapEndDate,
      bootstrapFastStartCursorDate: bootstrapEndDate,
      fastStartCompleted: false,
      lastScheduledAt: null,
      lastCompletedWindow: null,
      pendingWindow: null,
      isRunning: true,
      lastError: null,
      schedulerReason: 'idle',
    };
  }

  private normalizeRadarState(value: Record<string, unknown>): RadarState {
    const bootstrapEndDate = this.normalizeDateString(
      value.bootstrapEndDate,
      this.toDateString(new Date()),
    );
    const bootstrapStartDate = this.normalizeDateString(
      value.bootstrapStartDate,
      this.addDays(
        bootstrapEndDate,
        -(this.readInt('RADAR_BOOTSTRAP_DAYS', 365) - 1),
      ),
    );
    const bootstrapCursorDate = this.normalizeDateString(
      value.bootstrapCursorDate,
      bootstrapStartDate,
    );
    const fastStartCompleted = value.fastStartCompleted === true;
    const bootstrapFastStartCursorDate = fastStartCompleted
      ? null
      : this.normalizeNullableDateString(value.bootstrapFastStartCursorDate) ??
        bootstrapEndDate;

    return {
      mode: this.normalizeMode(value.mode),
      bootstrapStartDate,
      bootstrapCursorDate,
      bootstrapEndDate,
      bootstrapFastStartCursorDate,
      fastStartCompleted,
      lastScheduledAt: this.normalizeNullableString(value.lastScheduledAt),
      lastCompletedWindow: this.normalizeCompletedWindow(value.lastCompletedWindow),
      pendingWindow: this.normalizePendingWindow(value.pendingWindow),
      isRunning: value.isRunning !== false,
      lastError: this.normalizeNullableString(value.lastError),
      schedulerReason: this.normalizeNullableString(value.schedulerReason),
    };
  }

  private normalizeCompletedWindow(value: unknown): RadarCompletedWindow | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const current = value as Record<string, unknown>;
    const jobStatus =
      current.jobStatus === 'FAILED' ? 'FAILED' : current.jobStatus === 'SUCCESS' ? 'SUCCESS' : null;

    if (!jobStatus) {
      return null;
    }

    return {
      startDate: this.normalizeDateString(current.startDate, this.toDateString(new Date())),
      endDate: this.normalizeDateString(current.endDate, this.toDateString(new Date())),
      jobId: String(current.jobId ?? ''),
      completedAt: this.normalizeNullableString(current.completedAt) ?? new Date().toISOString(),
      jobStatus,
    };
  }

  private normalizePendingWindow(value: unknown): RadarWindowState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const current = value as Record<string, unknown>;
    const jobId = String(current.jobId ?? '').trim();
    const queueJobId = String(current.queueJobId ?? '').trim();

    if (!jobId || !queueJobId) {
      return null;
    }

    return {
      startDate: this.normalizeDateString(current.startDate, this.toDateString(new Date())),
      endDate: this.normalizeDateString(current.endDate, this.toDateString(new Date())),
      jobId,
      queueJobId,
      scheduledAt:
        this.normalizeNullableString(current.scheduledAt) ??
        new Date().toISOString(),
      strategy:
        current.strategy === 'fast-start' ||
        current.strategy === 'steady' ||
        current.strategy === 'live'
          ? current.strategy
          : 'steady',
      widthDays: this.readPositiveNumber(current.widthDays, 1),
      searchDepth: this.readNonNegativeNumber(current.searchDepth, 0),
      defaults: this.normalizeBackfillDefaults(current.defaults),
    };
  }

  private resolveResumeMode(state: RadarState): RadarMode {
    if (this.compareDateStrings(state.bootstrapCursorDate, state.bootstrapEndDate) > 0) {
      return 'live';
    }

    return 'bootstrap';
  }

  private isContinuousRadarEnabled() {
    return isContinuousRadarSchedulingEnabled();
  }

  private assertContinuousRadarSchedulingEnabled(
    action: 'start' | 'resume',
  ) {
    if (this.isContinuousRadarEnabled()) {
      return;
    }

    throw new BadRequestException(
      `Continuous radar ${action} is disabled while GitHub intake is closed. Current mode is frozen stock cleanup / historical repair only, so radar backfill cannot be resumed.`,
    );
  }

  private isGitHubConservativeMode(
    diagnostics: ReturnType<GitHubClient['getDiagnostics']>,
  ) {
    return Boolean(
      diagnostics.anonymousFallback ||
        diagnostics.cooldownTokenCount > 0 ||
        diagnostics.lastKnownRateLimitStatus?.limited,
    );
  }

  private resolveSnapshotLowWatermark() {
    return this.readInt(
      'SNAPSHOT_QUEUE_LOW_WATERMARK',
      this.readInt('IDEA_SNAPSHOT_CONCURRENCY', 12) * 2,
    );
  }

  private resolveSnapshotHighWatermark() {
    return this.readInt(
      'SNAPSHOT_QUEUE_HIGH_WATERMARK',
      this.readInt('IDEA_SNAPSHOT_CONCURRENCY', 12) * 6,
    );
  }

  private resolveDeepLowWatermark() {
    return this.readInt(
      'DEEP_QUEUE_LOW_WATERMARK',
      this.readInt('DEEP_ANALYSIS_CONCURRENCY', 6),
    );
  }

  private resolveDeepHighWatermark() {
    return this.readInt(
      'DEEP_QUEUE_HIGH_WATERMARK',
      this.readInt('DEEP_ANALYSIS_CONCURRENCY', 6) * 4,
    );
  }

  private buildRecommendedSettings() {
    return {
      bootstrapDays: this.readInt('RADAR_BOOTSTRAP_DAYS', 365),
      liveLookbackDays: this.readInt('RADAR_LIVE_LOOKBACK_DAYS', 1),
      schedulerIntervalMs: this.readInt('RADAR_SCHEDULER_INTERVAL_MS', 15_000),
      bootstrapFastStart:
        process.env.RADAR_BOOTSTRAP_FAST_START?.toLowerCase() !== 'false',
      snapshotQueueLowWatermark: this.resolveSnapshotLowWatermark(),
      snapshotQueueHighWatermark: this.resolveSnapshotHighWatermark(),
      deepQueueLowWatermark: this.resolveDeepLowWatermark(),
      deepQueueHighWatermark: this.resolveDeepHighWatermark(),
      snapshotRefreshDays: this.readInt('SNAPSHOT_REFRESH_DAYS', 14),
      deepAnalysisRefreshDays: this.readInt('DEEP_ANALYSIS_REFRESH_DAYS', 30),
      continuousDefaultLanguage: this.readContinuousDefaultLanguage(true),
      continuousDefaultStarMin: this.readContinuousDefaultStarMin(true),
      continuousDefaultPerWindowLimit: this.readContinuousDefaultPerWindowLimit(),
      continuousDefaultTargetCategories: this.resolveContinuousTargetCategories(),
      githubBackfillConcurrency: this.readInt('GITHUB_BACKFILL_CONCURRENCY', 1),
      githubSearchMaxConcurrency: this.readInt('GITHUB_SEARCH_MAX_CONCURRENCY', 8),
      githubSearchMinConcurrency: this.readInt('GITHUB_SEARCH_MIN_CONCURRENCY', 4),
      githubSearchAdjustIntervalMs: this.readInt(
        'GITHUB_SEARCH_ADJUST_INTERVAL_MS',
        60_000,
      ),
      ideaSnapshotConcurrency: this.readInt('IDEA_SNAPSHOT_CONCURRENCY', 12),
      deepAnalysisConcurrency: this.readInt('DEEP_ANALYSIS_CONCURRENCY', 6),
      snapshotTimeoutMs: this.readInt('OMLX_TIMEOUT_MS_SNAPSHOT', 120_000),
      deepTimeoutMs: this.readInt('OMLX_TIMEOUT_MS_DEEP', 180_000),
      ideaExtractTimeoutMs: this.readInt(
        'OMLX_TIMEOUT_MS_IDEA_EXTRACT',
        this.readInt('OMLX_TIMEOUT_MS_DEEP', 180_000),
      ),
      ideaExtractMaxInflight: this.readInt('IDEA_EXTRACT_MAX_INFLIGHT', 2),
      useHeavyModelForSnapshot:
        process.env.USE_HEAVY_MODEL_FOR_SNAPSHOT?.toLowerCase() !== 'false',
      targetCategories: this.resolveContinuousTargetCategories(),
      keywordModeEnabled:
        process.env.RADAR_KEYWORD_MODE_ENABLED?.toLowerCase() === 'true',
      keywordStrategy: String(
        process.env.RADAR_KEYWORD_STRATEGY ?? 'balanced',
      ).trim(),
      keywordSearchConcurrency: this.readInt(
        'RADAR_KEYWORD_SEARCH_CONCURRENCY',
        2,
      ),
      keywordLookbackDays: this.readInt('RADAR_KEYWORD_LOOKBACK_DAYS', 14),
      keywordPerQueryLimit: this.readInt('RADAR_KEYWORD_PER_QUERY_LIMIT', 10),
    };
  }

  private buildContinuousBackfillDefaults(
    bootstrapFastStartEnabled: boolean,
    conservativeMode: boolean,
  ): RadarBackfillDefaults {
    const perWindowLimit = this.readContinuousDefaultPerWindowLimit();

    return {
      language: this.readContinuousDefaultLanguage(bootstrapFastStartEnabled),
      starMin: this.readContinuousDefaultStarMin(bootstrapFastStartEnabled),
      perWindowLimit: conservativeMode
        ? Math.min(perWindowLimit, DEFAULT_CONSERVATIVE_PER_WINDOW_LIMIT)
        : perWindowLimit,
      targetCategories: this.resolveContinuousTargetCategories(),
    };
  }

  private isBootstrapFastStartEnabled(
    state: RadarState,
    snapshotQueueSize: number,
    deepQueueSize: number,
  ) {
    if (process.env.RADAR_BOOTSTRAP_FAST_START?.toLowerCase() === 'false') {
      return false;
    }

    if (state.mode !== 'bootstrap' || state.fastStartCompleted) {
      return false;
    }

    if (!state.bootstrapFastStartCursorDate) {
      return false;
    }

    if (
      this.compareDateStrings(
        state.bootstrapFastStartCursorDate,
        state.bootstrapCursorDate,
      ) < 0
    ) {
      return false;
    }

    if (state.pendingWindow?.strategy === 'fast-start') {
      return true;
    }

    return (
      !state.lastCompletedWindow ||
      (snapshotQueueSize < this.resolveSnapshotLowWatermark() &&
        deepQueueSize < this.resolveDeepLowWatermark())
    );
  }

  private resolveStatusSchedulerReason(
    state: RadarState,
    snapshotQueue: QueueDepthSummary,
    deepQueue: QueueDepthSummary,
    effectiveBackfillQueueSize: number,
    githubDiagnostics: ReturnType<GitHubClient['getDiagnostics']>,
    bootstrapFastStartEnabled: boolean,
  ) {
    const searchDiagnostics = this.gitHubSearchConcurrencyService.getDiagnostics();

    if (!state.isRunning || state.mode === 'paused') {
      return 'paused';
    }

    if (state.schedulerReason?.startsWith('keyword_supply_')) {
      return state.schedulerReason;
    }

    if (state.pendingWindow) {
      if (snapshotQueue.total === 0 && deepQueue.total === 0) {
        return 'pending_backfill_resolving_search_windows';
      }

      return 'pending_backfill_running';
    }

    if (snapshotQueue.total >= this.resolveSnapshotHighWatermark()) {
      return 'snapshot_queue_high_watermark';
    }

    if (
      effectiveBackfillQueueSize >=
      this.readInt('GITHUB_BACKFILL_CONCURRENCY', 1)
    ) {
      return 'backfill_concurrency_saturated';
    }

    if (this.isGitHubConservativeMode(githubDiagnostics)) {
      return 'github_conservative_mode_waiting';
    }

    if (
      searchDiagnostics.currentSearchConcurrency <
      searchDiagnostics.targetSearchConcurrency
    ) {
      return 'github_search_scaling';
    }

    if (bootstrapFastStartEnabled) {
      return 'bootstrap_fast_start_ready';
    }

    return state.schedulerReason ?? 'idle';
  }

  private resolveContinuousTargetCategories(): IdeaMainCategory[] {
    const configured = String(
      process.env.CONTINUOUS_DEFAULT_TARGET_CATEGORIES ?? '',
    )
      .split(',')
      .map((value) => String(value).trim().toLowerCase())
      .filter((value): value is IdeaMainCategory =>
        (IDEA_MAIN_CATEGORIES as readonly string[]).includes(value),
      );
    const unique = Array.from(new Set(configured));

    if (!unique.length) {
      return DEFAULT_CONTINUOUS_TARGET_CATEGORIES;
    }

    return unique;
  }

  private readContinuousDefaultLanguage(bootstrapFastStartEnabled: boolean) {
    if (!bootstrapFastStartEnabled) {
      return null;
    }

    const configured = String(
      process.env.CONTINUOUS_DEFAULT_LANGUAGE ?? '',
    ).trim();

    return configured || 'TypeScript';
  }

  private readContinuousDefaultStarMin(bootstrapFastStartEnabled: boolean) {
    if (!bootstrapFastStartEnabled) {
      return null;
    }

    const configured = Number.parseInt(
      process.env.CONTINUOUS_DEFAULT_STAR_MIN ?? '',
      10,
    );

    if (Number.isFinite(configured) && configured >= 0) {
      return configured;
    }

    return 1;
  }

  private readContinuousDefaultPerWindowLimit() {
    return this.readInt(
      'CONTINUOUS_DEFAULT_PER_WINDOW_LIMIT',
      DEFAULT_NORMAL_PER_WINDOW_LIMIT,
    );
  }

  private async updateSchedulerReason(state: RadarState, schedulerReason: string) {
    if (state.schedulerReason === schedulerReason) {
      return state;
    }

    return this.saveState({
      ...state,
      schedulerReason,
    });
  }

  private getNextFastStartCursor(state: RadarState) {
    if (!state.bootstrapFastStartCursorDate) {
      return null;
    }

    return this.addDays(state.bootstrapFastStartCursorDate, -1);
  }

  private normalizeBackfillDefaults(value: unknown): RadarBackfillDefaults {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.buildContinuousBackfillDefaults(false, false);
    }

    const current = value as Record<string, unknown>;
    const categories = Array.isArray(current.targetCategories)
      ? Array.from(
          new Set(
            current.targetCategories
              .map((item) => String(item ?? '').trim().toLowerCase())
              .filter((item): item is IdeaMainCategory =>
                (IDEA_MAIN_CATEGORIES as readonly string[]).includes(item),
              ),
          ),
        )
      : [];

    return {
      language: this.normalizeNullableString(current.language),
      starMin: this.readNullableNonNegativeNumber(current.starMin),
      perWindowLimit: this.readPositiveNumber(
        current.perWindowLimit,
        this.readContinuousDefaultPerWindowLimit(),
      ),
      targetCategories: categories.length
        ? categories
        : this.resolveContinuousTargetCategories(),
    };
  }

  private readJsonRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {} as Record<string, unknown>;
    }

    return value as Record<string, unknown>;
  }

  private readNumericValue(value: unknown) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? ''));

    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async recordSchedulerEvent(
    action: string,
    payload: Record<string, unknown>,
  ) {
    const job = await this.jobLogService.startJob({
      jobName: RADAR_SCHEDULER_JOB_NAME,
      jobStatus: JobStatus.RUNNING,
      triggeredBy: 'radar',
      payload: {
        action,
        ...payload,
      },
    });

    await this.jobLogService.completeJob({
      jobId: job.id,
      result: {
        action,
        ...payload,
      },
    });
  }

  private async loadLastCompletedMetrics(jobId: string | null) {
    if (!jobId) {
      return null;
    }

    const job = await this.prisma.jobLog.findUnique({
      where: { id: jobId },
      select: {
        result: true,
      },
    });
    const result = this.readJsonRecord(job?.result);

    if (!Object.keys(result).length) {
      return null;
    }

    return {
      scannedDays: this.readNumericValue(result.scannedDays),
      scannedWindows: this.readNumericValue(result.scannedWindows),
      fetchedLinks: this.readNumericValue(result.fetchedLinks),
      snapshotQueued: this.readNumericValue(result.snapshotQueued),
      deepAnalysisQueued: this.readNumericValue(result.deepAnalysisQueued),
      promisingCandidates: this.readNumericValue(result.promisingCandidates),
      toolsCount: this.readNumericValue(result.toolsCount),
      aiCount: this.readNumericValue(result.aiCount),
      infraCount: this.readNumericValue(result.infraCount),
      dataCount: this.readNumericValue(result.dataCount),
      targetCategories: Array.isArray(result.targetCategories)
        ? result.targetCategories.map((item) => String(item ?? ''))
        : [],
      reposPerMinute: this.readNumericValue(result.reposPerMinute),
      snapshotThroughput: this.readNumericValue(result.snapshotThroughput),
      deepThroughput: this.readNumericValue(result.deepThroughput),
    } satisfies RadarCompletedMetrics;
  }

  private async loadPendingBackfillRuntime(jobId: string): Promise<PendingBackfillRuntime | null> {
    const job = await this.prisma.jobLog.findUnique({
      where: {
        id: jobId,
      },
      select: {
        result: true,
        updatedAt: true,
      },
    });

    const result = this.readJsonRecord(job?.result);
    const runtime = this.readJsonRecord(result.runtime);

    if (!Object.keys(runtime).length) {
      return null;
    }

    return {
      currentSearchWindow:
        runtime.currentSearchWindow &&
        typeof runtime.currentSearchWindow === 'object' &&
        !Array.isArray(runtime.currentSearchWindow)
          ? {
              label: this.normalizeNullableString(
                (runtime.currentSearchWindow as Record<string, unknown>).label,
              ),
              searchWindowStart: this.normalizeNullableString(
                (runtime.currentSearchWindow as Record<string, unknown>)
                  .searchWindowStart,
              ),
              searchWindowEnd: this.normalizeNullableString(
                (runtime.currentSearchWindow as Record<string, unknown>)
                  .searchWindowEnd,
              ),
            }
          : null,
      currentWindowSearchDepth: this.readNullableNonNegativeNumber(
        runtime.currentWindowSearchDepth,
      ),
      currentWindowTotalCount: this.readNullableNonNegativeNumber(
        runtime.currentWindowTotalCount,
      ),
      recentRetryCount: this.readNumericValue(runtime.recentRetryCount),
      recentRateLimitHits: this.readNumericValue(runtime.recentRateLimitHits),
      runtimeUpdatedAt:
        this.normalizeNullableString(runtime.runtimeUpdatedAt) ??
        job?.updatedAt?.toISOString() ??
        null,
    };
  }

  private async maybeRunMaintenanceTick() {
    const state = await this.radarOperationsService.getMaintenanceState();
    const lastMaintenanceAt = state.lastMaintenanceAt
      ? new Date(state.lastMaintenanceAt).getTime()
      : 0;
    const intervalMs = this.readInt(
      'RADAR_MAINTENANCE_INTERVAL_MS',
      DEFAULT_MAINTENANCE_INTERVAL_MS,
    );

    if (Date.now() - lastMaintenanceAt < intervalMs) {
      return;
    }

    await this.radarOperationsService.runMaintenanceCycle();
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private compareDateStrings(left: string, right: string) {
    return left.localeCompare(right);
  }

  private minDateString(left: string, right: string) {
    return this.compareDateStrings(left, right) <= 0 ? left : right;
  }

  private addDays(dateString: string, offset: number) {
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);

    return this.toDateString(date);
  }

  private diffDaysInclusive(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    return Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
    );
  }

  private normalizeMode(value: unknown): RadarMode {
    if (value === 'paused') {
      return 'paused';
    }

    if (value === 'live') {
      return 'live';
    }

    return 'bootstrap';
  }

  private normalizeDateString(value: unknown, fallback: string) {
    const normalized = String(value ?? '').trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return normalized;
    }

    return fallback;
  }

  private normalizeNullableDateString(value: unknown) {
    const normalized = String(value ?? '').trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return normalized;
    }

    return null;
  }

  private normalizeNullableString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private readPositiveNumber(value: unknown, fallback: number) {
    const parsed = Number.parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private readNonNegativeNumber(value: unknown, fallback: number) {
    const parsed = Number.parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }

    return parsed;
  }

  private readNullableNonNegativeNumber(value: unknown) {
    const parsed = Number.parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  private toDateString(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private async isAnalysisPoolFrozenForNewEntries() {
    if (typeof this.prisma.systemConfig?.findUnique !== 'function') {
      return false;
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
    const gate = evaluateAnalysisPoolIntakeGate({
      freezeState: readAnalysisPoolFreezeState(freezeRow?.configValue),
      snapshot: readFrozenAnalysisPoolBatchSnapshot(snapshotRow?.configValue),
      source: 'github_created_backfill',
    });

    return gate.decision === 'suppress_new_entry';
  }
}
