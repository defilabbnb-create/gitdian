import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AnalysisOrchestratorService } from '../analysis/analysis-orchestrator.service';
import { BatchRunAnalysisDto } from '../analysis/dto/batch-run-analysis.dto';
import { RunAnalysisDto } from '../analysis/dto/run-analysis.dto';
import { FastFilterService } from '../fast-filter/fast-filter.service';
import { BatchFastFilterDto } from '../fast-filter/dto/batch-fast-filter.dto';
import { BackfillCreatedRepositoriesDto } from '../github/dto/backfill-created-repositories.dto';
import { RunColdToolCollectorDto } from '../github/dto/run-cold-tool-collector.dto';
import { GitHubColdToolCollectorService } from '../github/github-cold-tool-collector.service';
import { GitHubService } from '../github/github.service';
import { FetchRepositoriesDto } from '../github/dto/fetch-repositories.dto';
import { RadarDailySummaryService } from '../github/radar-daily-summary.service';
import { GitHubIdeaSnapshotJobPayload } from '../github/types/github.types';
import { JobLogService } from '../job-log/job-log.service';
import { QUEUE_JOB_TYPES, QUEUE_NAMES } from './queue.constants';
import { getQueueConnection } from './queue.redis';
import { QueueService } from './queue.service';

type QueueJobData = {
  jobLogId: string;
};

type JobHeartbeatController = {
  setProgress: (progress: number) => void;
  stop: () => void;
};

type ColdToolRuntimeState = {
  currentStage: string | null;
  runtimeUpdatedAt: string | null;
  progress: number | null;
};

@Injectable()
export class QueueWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueWorkerService.name);
  private readonly workers: Worker[] = [];
  private readonly workerBootedAtMs = Date.now();
  private coldToolSchedulerTimer: NodeJS.Timeout | null = null;
  private coldToolWatchdogTimer: NodeJS.Timeout | null = null;
  private coldToolAutofillTimer: NodeJS.Timeout | null = null;
  private analysisSingleWatchdogTimer: NodeJS.Timeout | null = null;
  private coldToolSchedulerTickInFlight = false;
  private coldToolWatchdogTickInFlight = false;
  private coldToolAutofillTickInFlight = false;
  private analysisSingleWatchdogTickInFlight = false;
  private coldToolAutofillRunInFlight = false;
  private coldToolAutofillLastTriggeredAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobLogService: JobLogService,
    private readonly githubService: GitHubService,
    private readonly gitHubColdToolCollectorService: GitHubColdToolCollectorService,
    private readonly radarDailySummaryService: RadarDailySummaryService,
    private readonly analysisOrchestratorService: AnalysisOrchestratorService,
    private readonly fastFilterService: FastFilterService,
    private readonly queueService: QueueService,
  ) {}

  async onModuleInit() {
    if (process.env.ENABLE_QUEUE_WORKERS !== 'true') {
      return;
    }

    const backfillConcurrency = this.resolveWorkerConcurrency(
      QUEUE_NAMES.GITHUB_CREATED_BACKFILL,
    );
    const snapshotConcurrency = this.resolveWorkerConcurrency(
      QUEUE_NAMES.ANALYSIS_SNAPSHOT,
    );
    const deepAnalysisConcurrency = this.resolveDeepAnalysisConcurrency(
      snapshotConcurrency,
    );
    const coldToolCollectorEnabled = this.readBooleanEnv(
      'ENABLE_COLD_TOOL_COLLECT_WORKER',
      true,
    );

    this.workers.push(
      this.createWorker(QUEUE_NAMES.GITHUB_FETCH, backfillConcurrency, (job) =>
        this.handleGitHubFetch(job as Job<QueueJobData & { dto: FetchRepositoriesDto }>),
      ),
      this.createWorker(QUEUE_NAMES.GITHUB_CREATED_BACKFILL, backfillConcurrency, (job) =>
        this.handleGitHubCreatedBackfill(
          job as Job<QueueJobData & { dto: BackfillCreatedRepositoriesDto }>,
        ),
      ),
      this.createWorker(QUEUE_NAMES.ANALYSIS_SNAPSHOT, snapshotConcurrency, (job) =>
        this.handleIdeaSnapshot(
          job as Job<QueueJobData & GitHubIdeaSnapshotJobPayload>,
        ),
      ),
      this.createWorker(
        QUEUE_NAMES.ANALYSIS_SNAPSHOT_COLD,
        snapshotConcurrency,
        (job) =>
          this.handleIdeaSnapshot(
            job as Job<QueueJobData & GitHubIdeaSnapshotJobPayload>,
          ),
      ),
      this.createWorker(QUEUE_NAMES.ANALYSIS_SINGLE, deepAnalysisConcurrency, (job) =>
        this.handleSingleAnalysis(
          job as Job<
            QueueJobData & { repositoryId: string; dto: RunAnalysisDto }
          >,
        ),
      ),
      this.createWorker(
        QUEUE_NAMES.ANALYSIS_SINGLE_COLD,
        this.resolveColdDeepAnalysisConcurrency(),
        (job) =>
          this.handleSingleAnalysis(
            job as Job<
              QueueJobData & { repositoryId: string; dto: RunAnalysisDto }
            >,
          ),
      ),
      this.createWorker(QUEUE_NAMES.ANALYSIS_BATCH, 1, (job) =>
        this.handleBatchAnalysis(
          job as Job<QueueJobData & { dto: BatchRunAnalysisDto }>,
        ),
      ),
      this.createWorker(QUEUE_NAMES.FAST_FILTER_BATCH, 1, (job) =>
        this.handleFastFilterBatch(
          job as Job<QueueJobData & { dto: BatchFastFilterDto }>,
        ),
      ),
    );

    if (coldToolCollectorEnabled) {
      this.workers.push(
        this.createWorker(
          QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
          backfillConcurrency,
          (job) =>
            this.handleGitHubColdToolCollect(
              job as Job<QueueJobData & { dto: RunColdToolCollectorDto }>,
            ),
        ),
      );
    }

    this.logger.log(
      `Queue workers started (${this.workers.length}). githubBackfillConcurrency=${backfillConcurrency} ideaSnapshotConcurrency=${snapshotConcurrency} deepAnalysisConcurrency=${deepAnalysisConcurrency}`,
    );

    await this.recoverColdToolCollectorInterruptedByWorkerRestart();
    this.startColdToolCollectorScheduler();
    this.startAnalysisSingleWatchdog();
  }

  async onModuleDestroy() {
    if (this.coldToolSchedulerTimer) {
      clearInterval(this.coldToolSchedulerTimer);
      this.coldToolSchedulerTimer = null;
    }
    if (this.coldToolWatchdogTimer) {
      clearInterval(this.coldToolWatchdogTimer);
      this.coldToolWatchdogTimer = null;
    }
    if (this.coldToolAutofillTimer) {
      clearInterval(this.coldToolAutofillTimer);
      this.coldToolAutofillTimer = null;
    }
    if (this.analysisSingleWatchdogTimer) {
      clearInterval(this.analysisSingleWatchdogTimer);
      this.analysisSingleWatchdogTimer = null;
    }
    await Promise.all(this.workers.map((worker) => worker.close(true)));
  }

  private createWorker(
    queueName: string,
    concurrency: number,
    processor: (job: Job) => Promise<unknown>,
  ) {
    const lockDuration = this.readConcurrency('QUEUE_LOCK_DURATION_MS', 600_000);
    const stalledInterval = this.readConcurrency(
      'QUEUE_STALLED_INTERVAL_MS',
      60_000,
    );
    const maxStalledCount = this.readConcurrency('QUEUE_MAX_STALLED_COUNT', 3);
    const worker = new Worker(queueName, processor, {
      connection: getQueueConnection(),
      concurrency,
      lockDuration,
      stalledInterval,
      maxStalledCount,
    });

    worker.on('completed', (job) => {
      if (!job?.data?.jobLogId) {
        return;
      }

      this.logger.debug(
        `Queue job completed queue=${queueName} jobName=${job.name} jobId=${job.id}`,
      );
    });

    worker.on('failed', (job, error) => {
      if (!job?.data?.jobLogId) {
        return;
      }

      const configuredAttempts =
        typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown queued job error.';
      const isTerminalStallFailure = errorMessage.includes(
        'job stalled more than allowable limit',
      );

      if (!isTerminalStallFailure && job.attemptsMade < configuredAttempts) {
        this.logger.warn(
          `Retrying queued job queue=${queueName} jobName=${job.name} jobId=${job.id} attempt=${job.attemptsMade + 1}/${configuredAttempts} error=${errorMessage}`,
        );
        return;
      }

      this.logger.warn(
        `Queue job failed queue=${queueName} jobName=${job.name} jobId=${job.id} error=${errorMessage}`,
      );
    });

    worker.on('error', (error) => {
      this.logger.error(
        `Queue worker error on ${queueName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    });

    worker.on('stalled', (jobId, prev) => {
      this.logger.warn(
        `Queue job stalled queue=${queueName} jobId=${jobId} previous=${prev ?? 'unknown'}`,
      );
    });

    return worker;
  }

  private resolveWorkerConcurrency(queueName: string) {
    switch (queueName) {
      case QUEUE_NAMES.GITHUB_FETCH:
      case QUEUE_NAMES.GITHUB_CREATED_BACKFILL:
        return this.readConcurrency('GITHUB_BACKFILL_CONCURRENCY', 1);
      case QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT:
        return this.readConcurrency('COLD_TOOL_COLLECT_CONCURRENCY', 2);
      case QUEUE_NAMES.ANALYSIS_SNAPSHOT:
        return this.readConcurrency('IDEA_SNAPSHOT_CONCURRENCY', 12);
      case QUEUE_NAMES.ANALYSIS_SINGLE:
        return this.readConcurrency('DEEP_ANALYSIS_CONCURRENCY', 6);
      case QUEUE_NAMES.ANALYSIS_SINGLE_COLD:
        return this.resolveColdDeepAnalysisConcurrency();
      default:
        return 1;
    }
  }

  private readConcurrency(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private readBooleanEnv(envName: string, fallback: boolean) {
    const raw = process.env[envName]?.trim().toLowerCase();

    if (!raw) {
      return fallback;
    }

    if (['1', 'true', 'yes', 'on'].includes(raw)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(raw)) {
      return false;
    }

    return fallback;
  }

  private resolveDeepAnalysisConcurrency(snapshotConcurrency: number) {
    const requested = this.readConcurrency('DEEP_ANALYSIS_CONCURRENCY', 6);
    const prioritizeDeepAnalysis = this.readBooleanEnv(
      'PRIORITIZE_DEEP_ANALYSIS',
      false,
    );

    if (prioritizeDeepAnalysis) {
      return requested;
    }

    const capped = Math.max(1, Math.floor(snapshotConcurrency / 2));
    const resolved = Math.min(requested, capped);

    if (resolved < requested) {
      this.logger.warn(
        `Clamping deepAnalysisConcurrency from ${requested} to ${resolved} so it does not exceed half of snapshot concurrency (${snapshotConcurrency}).`,
      );
    }

    return resolved;
  }

  private resolveColdDeepAnalysisConcurrency() {
    return this.readConcurrency(
      'COLD_TOOL_DEEP_ANALYSIS_CONCURRENCY',
      Math.max(2, Math.floor(this.readConcurrency('DEEP_ANALYSIS_CONCURRENCY', 6) / 2)),
    );
  }

  private async maybeAutofillColdToolCollector(result: {
    deepAnalysisQueued?: number;
  }) {
    if (this.coldToolAutofillRunInFlight) {
      return;
    }

    this.coldToolAutofillRunInFlight = true;
    try {
      const enabled = this.readBooleanEnv(
        'ENABLE_COLD_TOOL_COLLECT_AUTOFILL',
        true,
      );
      if (!enabled) {
        return;
      }

      const cooldownMs = this.readConcurrency(
        'COLD_TOOL_COLLECT_AUTOFILL_COOLDOWN_MS',
        60_000,
      );
      const now = Date.now();
      if (now - this.coldToolAutofillLastTriggeredAt < cooldownMs) {
        return;
      }

      const targetDepth = this.readConcurrency(
        'COLD_TOOL_AUTOFILL_DEEP_QUEUE_TARGET',
        24,
      );
      const activeCollector = await this.queueService.getLatestActiveQueueJobLog({
        queueName: QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
        jobName: QUEUE_JOB_TYPES.GITHUB_COLD_TOOL_COLLECT,
      });
      if (activeCollector) {
        return;
      }

      const depth = await this.queueService.getQueueDepth(
        QUEUE_NAMES.ANALYSIS_SINGLE_COLD,
      );
      const totalDepth =
        depth.active + depth.waiting + depth.delayed + depth.prioritized;

      if (totalDepth >= targetDepth) {
        return;
      }

      this.coldToolAutofillLastTriggeredAt = now;
      const enqueueResult = await this.queueService.enqueueGitHubColdToolCollect(
        {
          queriesPerRun: this.readConcurrency(
            'COLD_TOOL_AUTOFILL_QUERIES_PER_RUN',
            Math.min(12, this.readConcurrency('COLD_TOOL_QUERIES_PER_RUN', 36)),
          ),
          perQueryLimit: this.readConcurrency(
            'COLD_TOOL_AUTOFILL_PER_QUERY_LIMIT',
            Math.min(6, this.readConcurrency('COLD_TOOL_PER_QUERY_LIMIT', 8)),
          ),
          lookbackDays: this.readConcurrency('COLD_TOOL_LOOKBACK_DAYS', 540),
          forceRefresh: this.readBooleanEnv(
            'COLD_TOOL_AUTOFILL_FORCE_REFRESH',
            true,
          ),
        },
        'cold_tool_autofill',
      );

      this.logger.log(
        `Cold tool autofill queued next collector because cold deep queue depth=${totalDepth} target=${targetDepth} recentQueued=${result.deepAnalysisQueued ?? 0} nextJobId=${enqueueResult.jobId} nextQueueJobId=${enqueueResult.queueJobId}`,
      );
    } finally {
      this.coldToolAutofillRunInFlight = false;
    }
  }

  private startColdToolCollectorScheduler() {
    if (process.env.ENABLE_QUEUE_WORKERS !== 'true') {
      return;
    }

    const enabled = this.readBooleanEnv(
      'ENABLE_COLD_TOOL_COLLECT_SCHEDULER',
      true,
    );
    if (!enabled || this.coldToolSchedulerTimer) {
      return;
    }

    const intervalMs = this.readConcurrency(
      'COLD_TOOL_COLLECT_INTERVAL_MS',
      15 * 60_000,
    );

    const tick = async () => {
      if (this.coldToolSchedulerTickInFlight) {
        return;
      }

      this.coldToolSchedulerTickInFlight = true;
      try {
        const result = await this.queueService.enqueueGitHubColdToolCollect(
          {
            queriesPerRun: this.readConcurrency(
              'COLD_TOOL_QUERIES_PER_RUN',
              36,
            ),
            perQueryLimit: this.readConcurrency(
              'COLD_TOOL_PER_QUERY_LIMIT',
              8,
            ),
            lookbackDays: this.readConcurrency(
              'COLD_TOOL_LOOKBACK_DAYS',
              540,
            ),
            forceRefresh: this.readBooleanEnv(
              'COLD_TOOL_SCHEDULER_FORCE_REFRESH',
              false,
            ),
          },
          'cold_tool_scheduler',
        );
        this.logger.log(
          `Cold tool scheduler tick queued jobId=${result.jobId} queueJobId=${result.queueJobId} status=${result.jobStatus}`,
        );
      } catch (error) {
        this.logger.warn(
          `Cold tool scheduler tick failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      } finally {
        this.coldToolSchedulerTickInFlight = false;
      }
    };

    void tick();
    this.coldToolSchedulerTimer = setInterval(() => {
      void tick();
    }, intervalMs);

    this.startColdToolCollectorWatchdog();
    this.startColdToolAutofillMonitor();
  }

  private async recoverColdToolCollectorInterruptedByWorkerRestart() {
    const activeJob = await this.queueService.getLatestActiveQueueJobLog({
      queueName: QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
      jobName: QUEUE_JOB_TYPES.GITHUB_COLD_TOOL_COLLECT,
    });

    if (!activeJob?.queueJobId) {
      return;
    }

    const queueSnapshot = await this.queueService.getQueueJobSnapshot(
      QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
      activeJob.queueJobId,
    );

    if (queueSnapshot?.state !== 'active') {
      return;
    }

    const runtime = this.readColdToolRuntimeState(activeJob.result);
    const heartbeatAtMs =
      this.parseTimestamp(runtime.runtimeUpdatedAt) ??
      activeJob.updatedAt?.getTime() ??
      activeJob.startedAt?.getTime() ??
      activeJob.createdAt.getTime();
    const recoveryGraceMs = this.readConcurrency(
      'COLD_TOOL_RESTART_RECOVERY_GRACE_MS',
      15_000,
    );

    if (heartbeatAtMs >= this.workerBootedAtMs - recoveryGraceMs) {
      return;
    }

    const dto = this.extractColdToolCollectorDto(activeJob.payload);
    const heartbeatAgeMs = Math.max(0, this.workerBootedAtMs - heartbeatAtMs);
    const errorMessage =
      `Recovered cold-tool collector after worker restart interrupted the active phase. orphanedForMs=${heartbeatAgeMs}.`;

    await this.jobLogService.failJob({
      jobId: activeJob.id,
      errorMessage,
      progress: runtime.progress ?? activeJob.progress,
      result: {
        orphanedByWorkerRestart: true,
        queueState: queueSnapshot.state,
        queueJobId: activeJob.queueJobId,
        currentStage: runtime.currentStage,
        runtimeUpdatedAt: runtime.runtimeUpdatedAt,
        workerBootedAt: new Date(this.workerBootedAtMs).toISOString(),
        heartbeatAgeMs,
      },
    });

    this.logger.warn(
      `Cold tool startup recovery replaced orphaned active job jobId=${activeJob.id} queueJobId=${activeJob.queueJobId} stage=${runtime.currentStage ?? 'unknown'} heartbeatAgeMs=${heartbeatAgeMs}`,
    );

    if (!dto) {
      return;
    }

    const replacement = await this.queueService.enqueueGitHubColdToolCollect(
      dto,
      'cold_tool_restart_recovery',
    );

    this.logger.warn(
      `Cold tool startup recovery queued replacement job previousJobId=${activeJob.id} newJobId=${replacement.jobId} newQueueJobId=${replacement.queueJobId}`,
    );
  }

  private startColdToolCollectorWatchdog() {
    const enabled = this.readBooleanEnv(
      'ENABLE_COLD_TOOL_COLLECT_WATCHDOG',
      true,
    );

    if (!enabled || this.coldToolWatchdogTimer) {
      return;
    }

    const intervalMs = this.readConcurrency(
      'COLD_TOOL_WATCHDOG_INTERVAL_MS',
      60_000,
    );

    const tick = async () => {
      if (this.coldToolWatchdogTickInFlight) {
        return;
      }

      this.coldToolWatchdogTickInFlight = true;

      try {
        const recovered = await this.recoverStaleColdToolCollectorJobIfNeeded();

        if (!recovered) {
          await this.maybeAutofillColdToolCollector({});
          return;
        }

        const result = await this.queueService.enqueueGitHubColdToolCollect(
          recovered.dto ?? {
            queriesPerRun: this.readConcurrency(
              'COLD_TOOL_QUERIES_PER_RUN',
              36,
            ),
            perQueryLimit: this.readConcurrency(
              'COLD_TOOL_PER_QUERY_LIMIT',
              8,
            ),
            lookbackDays: this.readConcurrency(
              'COLD_TOOL_LOOKBACK_DAYS',
              540,
            ),
            forceRefresh: this.readBooleanEnv(
              'COLD_TOOL_SCHEDULER_FORCE_REFRESH',
              false,
            ),
          },
          'cold_tool_watchdog',
        );

        this.logger.warn(
          `Cold tool watchdog requeued recovered job previousJobId=${recovered.jobId} previousQueueJobId=${recovered.queueJobId ?? 'unknown'} queueState=${recovered.queueState ?? 'unknown'} heartbeatAgeMs=${recovered.heartbeatAgeMs} newJobId=${result.jobId} newQueueJobId=${result.queueJobId}`,
        );
      } catch (error) {
        this.logger.warn(
          `Cold tool watchdog tick failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      } finally {
        this.coldToolWatchdogTickInFlight = false;
      }
    };

    void tick();
    this.coldToolWatchdogTimer = setInterval(() => {
      void tick();
    }, intervalMs);
  }

  private startColdToolAutofillMonitor() {
    const enabled = this.readBooleanEnv('ENABLE_COLD_TOOL_COLLECT_AUTOFILL', true);
    if (!enabled || this.coldToolAutofillTimer) {
      return;
    }

    const intervalMs = this.readConcurrency(
      'COLD_TOOL_AUTOFILL_CHECK_INTERVAL_MS',
      15_000,
    );

    const tick = async () => {
      if (this.coldToolAutofillTickInFlight) {
        return;
      }

      this.coldToolAutofillTickInFlight = true;
      try {
        await this.maybeAutofillColdToolCollector({});
      } catch (error) {
        this.logger.warn(
          `Cold tool autofill tick failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      } finally {
        this.coldToolAutofillTickInFlight = false;
      }
    };

    void tick();
    this.coldToolAutofillTimer = setInterval(() => {
      void tick();
    }, intervalMs);
  }

  private startAnalysisSingleWatchdog() {
    const enabled = this.readBooleanEnv('ENABLE_ANALYSIS_SINGLE_WATCHDOG', true);

    if (!enabled || this.analysisSingleWatchdogTimer) {
      return;
    }

    const intervalMs = this.readConcurrency(
      'ANALYSIS_SINGLE_WATCHDOG_INTERVAL_MS',
      60_000,
    );

    const tick = async () => {
      if (this.analysisSingleWatchdogTickInFlight) {
        return;
      }

      this.analysisSingleWatchdogTickInFlight = true;

      try {
        const migrated = await this.migrateQueuedColdAnalysisBacklogIfNeeded();
        const replenished = await this.replenishColdAnalysisQueueIfNeeded();
        const summary = await this.recoverStaleAnalysisSingleJobsIfNeeded();
        if (
          !summary.recoveredCount &&
          migrated.migratedCount === 0 &&
          replenished.queuedCount === 0
        ) {
          return;
        }

        this.logger.warn(
          `Analysis.single watchdog migratedCold=${migrated.migratedCount} replenishedCold=${replenished.queuedCount} recovered=${summary.recoveredCount} requeued=${summary.requeuedCount} skipped=${summary.skippedCount}`,
        );
      } catch (error) {
        this.logger.warn(
          `Analysis.single watchdog tick failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      } finally {
        this.analysisSingleWatchdogTickInFlight = false;
      }
    };

    void tick();
    this.analysisSingleWatchdogTimer = setInterval(() => {
      void tick();
    }, intervalMs);
  }

  private resolveDeepQueueHighWatermark() {
    return this.readConcurrency(
      'DEEP_QUEUE_HIGH_WATERMARK',
      this.readConcurrency('DEEP_ANALYSIS_CONCURRENCY', 6) * 4,
    );
  }

  private async handleGitHubFetch(
    job: Job<QueueJobData & { dto: FetchRepositoriesDto }>,
  ) {
    return this.runQueuedJob(job, async () => {
      const result = await this.githubService.fetchRepositoriesDirect(job.data.dto);

      return {
        mode: result.mode,
        requested: result.requested,
        searchTotalCount: result.searchTotalCount,
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        failed: result.failed,
        requestStats: result.requestStats,
        items: result.items.slice(0, 20),
      };
    });
  }

  private async handleGitHubCreatedBackfill(
    job: Job<QueueJobData & { dto: BackfillCreatedRepositoriesDto }>,
  ) {
    let currentProgress = 10;
    let lastHeartbeatAt = 0;
    let lastRuntimeStage: string | null = null;
    let lastRuntimeProgress: number | null = null;
    let lastQueueProgress = 10;
    let lastPersistedProgress = 10;
    let lastPersistedAt = Date.now();
    const progressRefreshMs = this.readConcurrency(
      'QUEUE_DB_HEARTBEAT_MS',
      60_000,
    );
    const runtimeHeartbeatMs = this.readConcurrency(
      'QUEUE_RUNTIME_HEARTBEAT_MS',
      30_000,
    );

    return this.runQueuedJob(job, async (heartbeat) => {
      const result = await this.githubService.backfillCreatedRepositoriesDirect(
        job.data.dto,
        {
          parentJobId: job.data.jobLogId,
          onProgress: async (progress) => {
            const normalizedProgress = Math.max(
              0,
              Math.min(100, Math.round(progress)),
            );
            const now = Date.now();
            currentProgress = normalizedProgress;
            heartbeat.setProgress(normalizedProgress);

            if (normalizedProgress !== lastQueueProgress) {
              await job.updateProgress(normalizedProgress);
              lastQueueProgress = normalizedProgress;
            }

            if (
              normalizedProgress !== lastPersistedProgress ||
              now - lastPersistedAt >= progressRefreshMs
            ) {
              await this.jobLogService.updateJobProgress({
                jobId: job.data.jobLogId,
                progress: normalizedProgress,
              });
              lastPersistedProgress = normalizedProgress;
              lastPersistedAt = now;
            }
          },
          onHeartbeat: async (payload) => {
            if (!payload) {
              return;
            }

            const now = Date.now();
            const runtimeStage = this.readRuntimeStage(payload);
            const runtimeProgress = this.readRuntimeProgress(
              payload,
              currentProgress,
            );
            const shouldPersistRuntime =
              runtimeStage !== lastRuntimeStage ||
              runtimeProgress !== lastRuntimeProgress ||
              now - lastHeartbeatAt >= runtimeHeartbeatMs;

            if (!shouldPersistRuntime) {
              return;
            }

            lastHeartbeatAt = now;
            await this.jobLogService.updateJobProgress({
              jobId: job.data.jobLogId,
              progress: currentProgress,
              result: payload
                ? {
                    runtime: payload,
                  }
                : undefined,
            });
            lastRuntimeStage = runtimeStage;
            lastRuntimeProgress = runtimeProgress;
            lastPersistedProgress = currentProgress;
            lastPersistedAt = now;
          },
        },
      );

      await this.safeRecordDailySummary('backfill', () =>
        this.radarDailySummaryService.recordBackfillRun({
          repositoryIds: this.extractRepositoryIds(result.topRepositoryIds),
          fetchedRepositories: this.readNumericValue(result.fetchedLinks),
          jobId: job.data.jobLogId,
        }),
      );

      return result;
    });
  }

  private async handleGitHubColdToolCollect(
    job: Job<QueueJobData & { dto: RunColdToolCollectorDto }>,
  ) {
    let currentProgress = 10;
    let lastHeartbeatAt = 0;
    let lastRuntimePayload: Record<string, unknown> | null = null;
    let lastRuntimeStage: string | null = null;
    let lastRuntimeProgress: number | null = null;
    let lastQueueProgress = 10;
    let lastPersistedProgress = 10;
    let lastPersistedAt = Date.now();
    const progressRefreshMs = this.readConcurrency(
      'QUEUE_DB_HEARTBEAT_MS',
      60_000,
    );
    const runtimeHeartbeatMs = this.readConcurrency(
      'QUEUE_RUNTIME_HEARTBEAT_MS',
      30_000,
    );

    const result = await this.runQueuedJob(job, async (heartbeat) => {
      const persistRuntimeHeartbeat = async (
        payload: Record<string, unknown>,
        force = false,
      ) => {
        const now = Date.now();
        const runtimeStage = this.readRuntimeStage(payload);
        const runtimeProgress = this.readRuntimeProgress(
          payload,
          currentProgress,
        );
        const shouldPersistRuntime =
          force ||
          runtimeStage !== lastRuntimeStage ||
          runtimeProgress !== lastRuntimeProgress ||
          now - lastHeartbeatAt >= runtimeHeartbeatMs;

        if (!shouldPersistRuntime) {
          return;
        }

        lastHeartbeatAt = now;
        await this.jobLogService.updateJobProgress({
          jobId: job.data.jobLogId,
          progress: currentProgress,
          result: {
            runtime: payload,
          },
        });
        lastRuntimeStage = runtimeStage;
        lastRuntimeProgress = runtimeProgress;
        lastPersistedProgress = currentProgress;
        lastPersistedAt = now;
      };

      const keepalive = setInterval(() => {
        if (!lastRuntimePayload) {
          return;
        }

        void persistRuntimeHeartbeat(lastRuntimePayload, true).catch((error) => {
          this.logger.warn(
            `Cold tool collector keepalive failed jobId=${job.data.jobLogId} reason=${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );
        });
      }, runtimeHeartbeatMs);

      let result;
      try {
        result = await this.gitHubColdToolCollectorService.runCollectionDirect(
          job.data.dto,
          {
            onProgress: async (progress) => {
              const normalizedProgress = Math.max(
                0,
                Math.min(100, Math.round(progress)),
              );
              const now = Date.now();
              currentProgress = normalizedProgress;
              heartbeat.setProgress(normalizedProgress);

              if (normalizedProgress !== lastQueueProgress) {
                await job.updateProgress(normalizedProgress);
                lastQueueProgress = normalizedProgress;
              }

              if (
                normalizedProgress !== lastPersistedProgress ||
                now - lastPersistedAt >= progressRefreshMs
              ) {
                await this.jobLogService.updateJobProgress({
                  jobId: job.data.jobLogId,
                  progress: normalizedProgress,
                });
                lastPersistedProgress = normalizedProgress;
                lastPersistedAt = now;
              }
            },
            onHeartbeat: async (payload) => {
              lastRuntimePayload = payload as Record<string, unknown>;
              await persistRuntimeHeartbeat(lastRuntimePayload);
            },
          },
        );
      } finally {
        clearInterval(keepalive);
      }

      if (this.isColdToolCollectorContinuationResult(result)) {
        return result;
      }

      return {
        queriesExecuted: result.queriesExecuted,
        fetchedLinks: result.fetchedLinks,
        coldToolEvaluated: result.coldToolEvaluated,
        coldToolMatched: result.coldToolMatched,
        deepAnalysisQueued: result.deepAnalysisQueued,
        activeDomains: result.activeDomains,
        activeProgrammingLanguages: result.activeProgrammingLanguages,
        topMatchedRepositoryIds: this.extractRepositoryIds(
          result.topMatchedRepositoryIds,
        ).slice(0, 20),
      };
    });

    if (this.isColdToolCollectorContinuationResult(result)) {
      const handoff = await this.queueService.enqueueGitHubColdToolCollect(
        result.nextDto,
        'cold_tool_pipeline',
        {
          ignoreActiveJobId: job.data.jobLogId,
        },
      );

      this.logger.log(
        `Cold tool collector phase handoff runId=${result.nextDto.runId ?? 'unknown'} phase=${result.phase} repositoryCandidates=${result.repositoryCandidates} nextJobId=${handoff.jobId} nextQueueJobId=${handoff.queueJobId}`,
      );

      return {
        continued: true,
        phase: result.phase,
        repositoryCandidates: result.repositoryCandidates,
        nextJobId: handoff.jobId,
        nextQueueJobId: handoff.queueJobId,
      };
    }

    if (this.isColdToolCollectorSummaryResult(result)) {
      await this.maybeAutofillColdToolCollector(result);
    }

    return result;
  }

  private async handleIdeaSnapshot(
    job: Job<QueueJobData & GitHubIdeaSnapshotJobPayload>,
  ) {
    return this.runQueuedJob(job, async () => {
      const result = await this.githubService.processIdeaSnapshotQueueJob({
        repositoryId: job.data.repositoryId,
        windowDate: job.data.windowDate,
        analysisLane: job.data.analysisLane,
        fromBackfill: job.data.fromBackfill,
        runFastFilter: job.data.runFastFilter,
        runDeepAnalysis: job.data.runDeepAnalysis,
        deepAnalysisOnlyIfPromising: job.data.deepAnalysisOnlyIfPromising,
        targetCategories: job.data.targetCategories,
        rootJobId: job.data.rootJobId,
      });

      await this.safeRecordDailySummary('snapshot', () =>
        this.radarDailySummaryService.recordSnapshotCompletion({
          repositoryId: result.repositoryId,
          jobId: job.data.jobLogId,
        }),
      );

      if (result.deepAnalysis.shouldQueue) {
        const deepQueueName =
          job.data.analysisLane === 'cold_tool'
            ? QUEUE_NAMES.ANALYSIS_SINGLE_COLD
            : QUEUE_NAMES.ANALYSIS_SINGLE;
        const deepQueueDepth = await this.queueService.getQueueDepth(
          deepQueueName,
        );
        const deepQueueHighWatermark = this.resolveDeepQueueHighWatermark();

        if (deepQueueDepth.total >= deepQueueHighWatermark) {
          return {
            ...result,
            deepAnalysis: {
              ...result.deepAnalysis,
              queued: false,
              deferred: 'deepQueueHighWatermark',
              queueDepth: deepQueueDepth.total,
              highWatermark: deepQueueHighWatermark,
            },
          };
        }

        const queuedDeepAnalysis = await this.queueService.enqueueSingleAnalysis(
          result.repositoryId,
          {
            runFastFilter: result.deepAnalysis.runFastFilter,
            runCompleteness: true,
            runIdeaFit: true,
            runIdeaExtract: true,
            forceRerun: false,
            useDeepBundle: job.data.forceDeepAnalysis === true,
            analysisLane: job.data.analysisLane,
          },
          job.data.analysisLane === 'cold_tool'
            ? 'cold_tool_collector'
            : 'backfill',
          {
            parentJobId: result.deepAnalysis.parentJobId ?? undefined,
            metadata: {
              fromBackfill: true,
              fromColdToolCollector: job.data.analysisLane === 'cold_tool',
              fullDbCatchup: job.data.forceDeepAnalysis === true,
              windowDate: result.windowDate,
              snapshotJobId: job.data.jobLogId,
            },
          },
        );

        return {
          ...result,
          deepAnalysis: {
            ...result.deepAnalysis,
            queued: true,
            jobId: queuedDeepAnalysis.jobId,
            queueJobId: queuedDeepAnalysis.queueJobId,
            queueName: queuedDeepAnalysis.queueName,
          },
        };
      }

      return {
        ...result,
        deepAnalysis: {
          ...result.deepAnalysis,
          queued: false,
        },
      };
    });
  }

  private async handleSingleAnalysis(
    job: Job<
      QueueJobData & {
        repositoryId: string;
        dto: RunAnalysisDto;
        fullDbCatchup?: boolean;
      }
    >,
  ) {
    return this.runQueuedJob(job, async () => {
      const dto: RunAnalysisDto = {
        ...job.data.dto,
        useDeepBundle:
          job.data.dto.useDeepBundle === true ||
          job.data.fullDbCatchup === true,
      };
      const result = await this.analysisOrchestratorService.runRepositoryAnalysisDirect(
        job.data.repositoryId,
        dto,
      );

      await this.safeRecordDailySummary('deep_analysis', () =>
        this.radarDailySummaryService.recordDeepAnalysisCompletion({
          repositoryId: job.data.repositoryId,
          jobId: job.data.jobLogId,
        }),
      );

      return result;
    });
  }

  private async handleBatchAnalysis(
    job: Job<QueueJobData & { dto: BatchRunAnalysisDto }>,
  ) {
    return this.runQueuedJob(job, async () => {
      const result = await this.analysisOrchestratorService.runBatchAnalysisDirect(
        job.data.dto,
      );

      return {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        items: result.items.slice(0, 20),
      };
    });
  }

  private async handleFastFilterBatch(
    job: Job<QueueJobData & { dto: BatchFastFilterDto }>,
  ) {
    return this.runQueuedJob(job, async () => {
      const result = await this.fastFilterService.evaluateBatchDirect(job.data.dto);

      return {
        processed: result.processed,
        passed: result.passed,
        failed: result.failed,
        items: result.items.slice(0, 20),
      };
    });
  }

  private async runQueuedJob<T extends QueueJobData>(
    job: Job<T>,
    executor: (heartbeat: JobHeartbeatController) => Promise<unknown>,
  ) {
    const jobLogId = job.data.jobLogId;
    const attempt = job.attemptsMade + 1;
    const configuredAttempts =
      typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;

    await job.updateProgress(10);
    const started = await this.jobLogService.markJobRunning({
      jobId: jobLogId,
      attempts: configuredAttempts,
      queueJobId: String(job.id),
      queueName: job.queueName,
      progress: 10,
    });

    if (!started.activated) {
      this.logger.warn(
        `Skipping queued job queue=${job.queueName} jobId=${job.id} because job log ${jobLogId} is no longer active.`,
      );
      await job.updateProgress(100);
      return {
        skipped: true,
        reason: 'job_log_inactive',
      };
    }

    const heartbeat = this.startJobHeartbeat(job, jobLogId);
    heartbeat.setProgress(10);

    try {
      const result = await executor(heartbeat);

      heartbeat.setProgress(100);
      await job.updateProgress(100);
      await this.jobLogService.completeJob({
        jobId: jobLogId,
        result,
      });

      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown queued job error.';

      if (attempt < configuredAttempts) {
        await this.jobLogService.markJobPendingRetry({
          jobId: jobLogId,
          errorMessage: `${message} Retrying...`,
          attempts: configuredAttempts,
        });
      } else {
        await this.jobLogService.failJob({
          jobId: jobLogId,
          errorMessage: message,
        });
      }

      throw error;
    } finally {
      heartbeat.stop();
    }
  }

  private startJobHeartbeat<T extends QueueJobData>(
    job: Job<T>,
    jobLogId: string,
  ): JobHeartbeatController {
    const heartbeatMs = this.readConcurrency('QUEUE_JOB_HEARTBEAT_MS', 15_000);
    const dbHeartbeatMs = this.readConcurrency('QUEUE_DB_HEARTBEAT_MS', 60_000);
    let active = true;
    let currentProgress = 10;
    let updating = false;
    let lastQueueProgress = 10;
    let lastPersistedProgress = 10;
    let lastPersistedAt = Date.now();

    const timer = setInterval(() => {
      const heartbeatProgress = Math.max(10, Math.min(95, currentProgress));
      const now = Date.now();
      const shouldUpdateQueue = heartbeatProgress !== lastQueueProgress;
      const shouldPersistJobLog =
        heartbeatProgress !== lastPersistedProgress ||
        now - lastPersistedAt >= dbHeartbeatMs;

      if (!active || updating || (!shouldUpdateQueue && !shouldPersistJobLog)) {
        return;
      }

      updating = true;

      void (async () => {
        try {
          if (shouldUpdateQueue) {
            await job.updateProgress(heartbeatProgress);
            lastQueueProgress = heartbeatProgress;
          }

          if (shouldPersistJobLog) {
            await this.jobLogService.updateJobProgress({
              jobId: jobLogId,
              progress: heartbeatProgress,
            });
            lastPersistedProgress = heartbeatProgress;
            lastPersistedAt = now;
          }
        } catch (error) {
          this.logger.warn(
            `Failed to heartbeat queued job queue=${job.queueName} jobId=${job.id}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        } finally {
          updating = false;
        }
      })();
    }, heartbeatMs);

    return {
      setProgress(progress: number) {
        currentProgress = progress;
      },
      stop() {
        active = false;
        clearInterval(timer);
      },
    };
  }

  private async recoverStaleColdToolCollectorJobIfNeeded() {
    const activeJob = await this.queueService.getLatestActiveQueueJobLog({
      queueName: QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
      jobName: QUEUE_JOB_TYPES.GITHUB_COLD_TOOL_COLLECT,
    });

    if (!activeJob) {
      return null;
    }

    const queueSnapshot = activeJob.queueJobId
      ? await this.queueService.getQueueJobSnapshot(
          QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
          activeJob.queueJobId,
        )
      : null;

    if (!this.isColdToolCollectorJobStale(activeJob, queueSnapshot)) {
      return null;
    }

    const runtime = this.readColdToolRuntimeState(activeJob.result);
    const heartbeatAgeMs = this.getColdToolJobHeartbeatAgeMs(activeJob, runtime);
    const queueRemoval =
      activeJob.queueJobId &&
      (!queueSnapshot ||
        ['waiting', 'delayed', 'prioritized'].includes(queueSnapshot.state))
        ? await this.queueService.tryRemoveQueueJob(
            QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
            activeJob.queueJobId,
          )
        : null;
    const queueState = queueRemoval?.state ?? queueSnapshot?.state ?? null;
    const errorMessage = `Cold tool collector watchdog recovered stale job after ${heartbeatAgeMs}ms without runtime heartbeat.`;

    if (
      activeJob.jobStatus === JobStatus.PENDING ||
      activeJob.jobStatus === JobStatus.RUNNING
    ) {
      await this.jobLogService.failJob({
        jobId: activeJob.id,
        errorMessage,
        progress: runtime.progress ?? activeJob.progress,
        result: {
          stale: true,
          recoveredByWatchdog: true,
          queueState,
          queueRemoved: queueRemoval?.removed ?? false,
          queueJobId: activeJob.queueJobId,
          currentStage: runtime.currentStage,
          runtimeUpdatedAt: runtime.runtimeUpdatedAt,
          heartbeatAgeMs,
        },
      });
    }

    this.logger.warn(
      `Cold tool watchdog recovered stale job jobId=${activeJob.id} queueJobId=${activeJob.queueJobId ?? 'unknown'} queueState=${queueState ?? 'unknown'} stage=${runtime.currentStage ?? 'unknown'} heartbeatAgeMs=${heartbeatAgeMs} queueRemoved=${queueRemoval?.removed ?? false}`,
    );

    return {
      jobId: activeJob.id,
      queueJobId: activeJob.queueJobId,
      queueState,
      heartbeatAgeMs,
      dto: this.extractColdToolCollectorDto(activeJob.payload),
    };
  }

  private async recoverStaleAnalysisSingleJobsIfNeeded() {
    const staleMinutes = this.readConcurrency(
      'ANALYSIS_SINGLE_STALE_MINUTES',
      30,
    );
    const limit = this.readConcurrency(
      'ANALYSIS_SINGLE_STALE_RECOVERY_LIMIT',
      Math.max(20, this.readConcurrency('DEEP_ANALYSIS_CONCURRENCY', 6) * 4),
    );
    const cutoff = new Date(Date.now() - staleMinutes * 60_000);
    const staleRows = await this.prisma.jobLog.findMany({
      where: {
        queueName: {
          in: [QUEUE_NAMES.ANALYSIS_SINGLE, QUEUE_NAMES.ANALYSIS_SINGLE_COLD],
        },
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
        updatedAt: {
          lt: cutoff,
        },
      },
      orderBy: {
        updatedAt: 'asc',
      },
      take: limit,
      select: {
        id: true,
        queueName: true,
        queueJobId: true,
        jobStatus: true,
        progress: true,
        triggeredBy: true,
        updatedAt: true,
        payload: true,
      },
    });

    let recoveredCount = 0;
    let requeuedCount = 0;
    let skippedCount = 0;

    for (const row of staleRows) {
      const queueName =
        row.queueName === QUEUE_NAMES.ANALYSIS_SINGLE_COLD
          ? QUEUE_NAMES.ANALYSIS_SINGLE_COLD
          : QUEUE_NAMES.ANALYSIS_SINGLE;
      const queueSnapshot = row.queueJobId
        ? await this.queueService.getQueueJobSnapshot(
            queueName,
            row.queueJobId,
          )
        : null;

      if (
        row.jobStatus === JobStatus.PENDING &&
        queueSnapshot &&
        ['waiting', 'delayed', 'prioritized'].includes(queueSnapshot.state) &&
        !this.shouldRecoverQueuedColdToolAnalysis(row)
      ) {
        skippedCount += 1;
        continue;
      }

      const payload = this.readJsonRecord(row.payload);
      const repositoryId = this.normalizeNullableString(payload.repositoryId);
      const dtoRecord = this.isJsonRecord(payload.dto) ? payload.dto : null;

      if (!repositoryId || !dtoRecord) {
        skippedCount += 1;
        continue;
      }

      if (
        row.jobStatus === JobStatus.PENDING &&
        row.queueJobId &&
        (!queueSnapshot ||
          ['waiting', 'delayed', 'prioritized'].includes(queueSnapshot.state))
      ) {
        await this.queueService.tryRemoveQueueJob(
          queueName,
          row.queueJobId,
        );
      }

      await this.jobLogService.failJob({
        jobId: row.id,
        errorMessage: `Analysis.single watchdog recovered stale ${row.jobStatus.toLowerCase()} job after ${staleMinutes}m without queue progress.`,
        progress: row.progress,
        result: {
          stale: true,
          recoveredByWatchdog: true,
          queueState: queueSnapshot?.state ?? null,
          queueJobId: row.queueJobId,
        },
      });
      recoveredCount += 1;

      const isColdToolAnalysis = this.isColdToolAnalysisPayload(
        payload,
        row.triggeredBy,
      );
      const dto = {
        ...dtoRecord,
        ...(isColdToolAnalysis
          ? {
              analysisLane: 'cold_tool',
            }
          : {}),
        ...(payload.fullDbCatchup === true ? { useDeepBundle: true } : {}),
      } as RunAnalysisDto;

      await this.queueService.enqueueSingleAnalysis(
        repositoryId,
        dto,
        'analysis_single_watchdog',
        {
          parentJobId: row.id,
          metadata: {
            fromAnalysisSingleWatchdog: true,
            ...(isColdToolAnalysis
              ? {
                  fromColdToolCollector: true,
                }
              : {}),
            staleRecoveredQueueJobId: row.queueJobId ?? null,
            staleRecoveredFromStatus: row.jobStatus,
          },
          jobOptionsOverride: isColdToolAnalysis
            ? {
                priority: this.readConcurrency(
                  'COLD_TOOL_DEEP_ANALYSIS_PRIORITY',
                  18,
                ),
              }
            : undefined,
        },
      );
      requeuedCount += 1;
    }

    return {
      recoveredCount,
      requeuedCount,
      skippedCount,
    };
  }

  private async migrateQueuedColdAnalysisBacklogIfNeeded() {
    const cutoff = new Date(
      Date.now() -
        this.readConcurrency(
          'COLD_TOOL_ANALYSIS_QUEUE_MIGRATION_MINUTES',
          5,
        ) *
          60_000,
    );
    const rows = await this.prisma.jobLog.findMany({
      where: {
        queueName: QUEUE_NAMES.ANALYSIS_SINGLE,
        jobStatus: JobStatus.PENDING,
        updatedAt: {
          lt: cutoff,
        },
        OR: [
          {
            triggeredBy: 'cold_tool_collector',
          },
          {
            triggeredBy: 'analysis_single_watchdog',
          },
          {
            payload: {
              path: ['dto', 'analysisLane'],
              equals: 'cold_tool',
            },
          },
          {
            payload: {
              path: ['fromColdToolCollector'],
              equals: true,
            },
          },
        ],
      },
      orderBy: {
        updatedAt: 'asc',
      },
      take: this.readConcurrency('COLD_TOOL_ANALYSIS_QUEUE_MIGRATION_LIMIT', 24),
      select: {
        id: true,
        queueJobId: true,
        jobStatus: true,
        progress: true,
        triggeredBy: true,
        payload: true,
      },
    });

    let migratedCount = 0;

    for (const row of rows) {
      const payload = this.readJsonRecord(row.payload);
      if (!this.isColdToolAnalysisPayload(payload, row.triggeredBy)) {
        continue;
      }

      const repositoryId = this.normalizeNullableString(payload.repositoryId);
      const dtoRecord = this.isJsonRecord(payload.dto) ? payload.dto : null;
      if (!repositoryId || !dtoRecord) {
        continue;
      }

      const queueSnapshot = row.queueJobId
        ? await this.queueService.getQueueJobSnapshot(
            QUEUE_NAMES.ANALYSIS_SINGLE,
            row.queueJobId,
          )
        : null;

      if (
        !queueSnapshot ||
        !['waiting', 'delayed', 'prioritized'].includes(queueSnapshot.state)
      ) {
        continue;
      }

      await this.queueService.tryRemoveQueueJob(
        QUEUE_NAMES.ANALYSIS_SINGLE,
        row.queueJobId ?? '',
      );
      await this.jobLogService.failJob({
        jobId: row.id,
        errorMessage:
          'Queued cold-tool deep analysis was migrated into the dedicated cold analysis queue.',
        progress: row.progress,
        result: {
          migratedToColdQueue: true,
          previousQueueName: QUEUE_NAMES.ANALYSIS_SINGLE,
          previousQueueJobId: row.queueJobId,
          queueState: queueSnapshot.state,
        },
      });

      await this.queueService.enqueueSingleAnalysis(
        repositoryId,
        {
          ...dtoRecord,
          analysisLane: 'cold_tool',
        } as RunAnalysisDto,
        'analysis_single_watchdog',
        {
          parentJobId: row.id,
          metadata: {
            fromColdToolCollector: true,
            migratedFromDefaultAnalysisQueue: true,
            staleRecoveredQueueJobId: row.queueJobId ?? null,
          },
          jobOptionsOverride: {
            priority: this.readConcurrency(
              'COLD_TOOL_DEEP_ANALYSIS_PRIORITY',
              18,
            ),
          },
        },
      );
      migratedCount += 1;
    }

    return {
      migratedCount,
    };
  }

  private async replenishColdAnalysisQueueIfNeeded() {
    const depth = await this.queueService.getQueueDepth(
      QUEUE_NAMES.ANALYSIS_SINGLE_COLD,
    );
    const totalDepth =
      depth.active + depth.waiting + depth.delayed + depth.prioritized;
    const targetDepth = this.readConcurrency(
      'COLD_TOOL_AUTOFILL_DEEP_QUEUE_TARGET',
      48,
    );

    if (totalDepth >= targetDepth) {
      return {
        queuedCount: 0,
      };
    }

    const limit = Math.max(
      1,
      this.readConcurrency('COLD_TOOL_BACKLOG_REPLENISH_LIMIT', 24),
    );
    const rows = await this.prisma.repositoryAnalysis.findMany({
      where: {
        tags: {
          has: 'cold_tool_pool',
        },
        OR: [
          {
            completenessJson: {
              equals: Prisma.AnyNull,
            },
          },
          {
            ideaFitJson: {
              equals: Prisma.AnyNull,
            },
          },
          {
            extractedIdeaJson: {
              equals: Prisma.AnyNull,
            },
          },
          {
            insightJson: {
              equals: Prisma.AnyNull,
            },
          },
        ],
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
      select: {
        repositoryId: true,
      },
    });

    if (!rows.length) {
      return {
        queuedCount: 0,
      };
    }

    const results = await this.queueService.enqueueSingleAnalysesBulk(
      rows.map((row) => ({
        repositoryId: row.repositoryId,
        dto: {
          runFastFilter: false,
          runCompleteness: true,
          runIdeaFit: true,
          runIdeaExtract: true,
          forceRerun: false,
          analysisLane: 'cold_tool',
        } as RunAnalysisDto,
        triggeredBy: 'cold_tool_backlog_replenish',
        metadata: {
          fromColdToolCollector: true,
          replenishedFromColdPool: true,
        },
        jobOptionsOverride: {
          priority: this.readConcurrency(
            'COLD_TOOL_DEEP_ANALYSIS_PRIORITY',
            18,
          ),
        },
      })),
      'cold_tool_backlog_replenish',
    );

    return {
      queuedCount: results.filter((result) => result.jobStatus === 'PENDING').length,
    };
  }

  private shouldRecoverQueuedColdToolAnalysis(row: {
    payload: Prisma.JsonValue | null;
    triggeredBy: string | null;
  }) {
    return this.isColdToolAnalysisPayload(
      this.readJsonRecord(row.payload),
      row.triggeredBy,
    );
  }

  private isColdToolAnalysisPayload(
    payload: Record<string, unknown>,
    triggeredBy?: string | null,
  ) {
    const dto = this.isJsonRecord(payload.dto) ? payload.dto : null;
    const lane = this.normalizeNullableString(dto?.analysisLane);

    if (lane === 'cold_tool') {
      return true;
    }

    if (payload.fromColdToolCollector === true) {
      return true;
    }

    return (
      triggeredBy === 'cold_tool_collector' ||
      triggeredBy === 'analysis_single_watchdog'
    );
  }

  private isColdToolCollectorJobStale(
    job: {
      createdAt: Date;
      startedAt: Date | null;
      updatedAt: Date;
      result: Prisma.JsonValue | null;
    },
    queueSnapshot: Awaited<ReturnType<QueueService['getQueueJobSnapshot']>>,
  ) {
    if (
      queueSnapshot &&
      ['waiting', 'delayed', 'prioritized'].includes(queueSnapshot.state)
    ) {
      return false;
    }

    const runtime = this.readColdToolRuntimeState(job.result);

    return this.getColdToolJobHeartbeatAgeMs(job, runtime) >
      this.resolveColdToolWatchdogStaleMs();
  }

  private getColdToolJobHeartbeatAgeMs(
    job: {
      createdAt: Date;
      startedAt: Date | null;
      updatedAt: Date;
    },
    runtime: ColdToolRuntimeState,
  ) {
    const runtimeHeartbeatAt = this.parseTimestamp(runtime.runtimeUpdatedAt);
    const persistedHeartbeatAt = job.updatedAt?.getTime() ?? null;
    const referenceTime =
      runtimeHeartbeatAt && persistedHeartbeatAt
        ? Math.max(runtimeHeartbeatAt, persistedHeartbeatAt)
        : runtimeHeartbeatAt ??
          persistedHeartbeatAt ??
      job.startedAt?.getTime() ??
      job.createdAt.getTime();

    return Math.max(0, Date.now() - referenceTime);
  }

  private resolveColdToolWatchdogStaleMs() {
    const configuredMinutes = this.readConcurrency(
      'COLD_TOOL_STALE_RUNTIME_MINUTES',
      10,
    );

    return Math.max(
      configuredMinutes * 60_000,
      this.readConcurrency('QUEUE_JOB_HEARTBEAT_MS', 15_000) * 20,
      this.readConcurrency('COLD_TOOL_WATCHDOG_INTERVAL_MS', 60_000) * 2,
    );
  }

  private readColdToolRuntimeState(result: Prisma.JsonValue | null): ColdToolRuntimeState {
    const resultRecord = this.readJsonRecord(result);
    const runtimeCandidate = resultRecord.runtime;
    const runtime = this.isJsonRecord(runtimeCandidate) ? runtimeCandidate : null;

    return {
      currentStage: this.normalizeNullableString(runtime?.currentStage),
      runtimeUpdatedAt: this.normalizeNullableString(runtime?.runtimeUpdatedAt),
      progress: this.toNullableNumber(runtime?.progress),
    };
  }

  private extractColdToolCollectorDto(payload: Prisma.JsonValue | null) {
    const record = this.readJsonRecord(payload);
    const dto = this.isJsonRecord(record.dto) ? record.dto : null;
    return dto ? ({ ...dto } as RunColdToolCollectorDto) : null;
  }

  private isColdToolCollectorContinuationResult(
    value: unknown,
  ): value is {
    continued: true;
    phase: string;
    repositoryCandidates: number;
    nextDto: RunColdToolCollectorDto;
  } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const record = value as Record<string, unknown>;
    return (
      record.continued === true &&
      typeof record.phase === 'string' &&
      typeof record.repositoryCandidates === 'number' &&
      this.isJsonRecord(record.nextDto)
    );
  }

  private isColdToolCollectorSummaryResult(
    value: unknown,
  ): value is {
    deepAnalysisQueued?: number;
  } {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private readJsonRecord(value: Prisma.JsonValue | null | undefined) {
    return this.isJsonRecord(value) ? value : {};
  }

  private isJsonRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private normalizeNullableString(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }

  private toNullableNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const parsed = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseTimestamp(value: string | null) {
    if (!value) {
      return null;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private readRuntimeStage(payload: unknown) {
    if (!this.isJsonRecord(payload)) {
      return null;
    }

    return this.normalizeNullableString(payload.currentStage);
  }

  private readRuntimeProgress(payload: unknown, fallback: number) {
    if (!this.isJsonRecord(payload)) {
      return fallback;
    }

    return this.toNullableNumber(payload.progress) ?? fallback;
  }

  private extractRepositoryIds(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .map((item) => String(item ?? '').trim())
      .filter((item) => Boolean(item));
  }

  private readNumericValue(value: unknown) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? ''));

    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async safeRecordDailySummary(
    label: 'backfill' | 'snapshot' | 'deep_analysis',
    handler: () => Promise<void>,
  ) {
    try {
      await handler();
    } catch (error) {
      this.logger.warn(
        `Failed to record radar daily summary for ${label}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
