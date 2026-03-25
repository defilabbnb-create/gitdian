import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { AnalysisOrchestratorService } from '../analysis/analysis-orchestrator.service';
import { BatchRunAnalysisDto } from '../analysis/dto/batch-run-analysis.dto';
import { RunAnalysisDto } from '../analysis/dto/run-analysis.dto';
import { FastFilterService } from '../fast-filter/fast-filter.service';
import { BatchFastFilterDto } from '../fast-filter/dto/batch-fast-filter.dto';
import { BackfillCreatedRepositoriesDto } from '../github/dto/backfill-created-repositories.dto';
import { GitHubService } from '../github/github.service';
import { FetchRepositoriesDto } from '../github/dto/fetch-repositories.dto';
import { RadarDailySummaryService } from '../github/radar-daily-summary.service';
import { GitHubIdeaSnapshotJobPayload } from '../github/types/github.types';
import { JobLogService } from '../job-log/job-log.service';
import { QUEUE_NAMES } from './queue.constants';
import { getQueueConnection } from './queue.redis';
import { QueueService } from './queue.service';

type QueueJobData = {
  jobLogId: string;
};

@Injectable()
export class QueueWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueWorkerService.name);
  private readonly workers: Worker[] = [];

  constructor(
    private readonly jobLogService: JobLogService,
    private readonly githubService: GitHubService,
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
      this.createWorker(QUEUE_NAMES.ANALYSIS_SINGLE, deepAnalysisConcurrency, (job) =>
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

    this.logger.log(
      `Queue workers started (${this.workers.length}). githubBackfillConcurrency=${backfillConcurrency} ideaSnapshotConcurrency=${snapshotConcurrency} deepAnalysisConcurrency=${deepAnalysisConcurrency}`,
    );
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((worker) => worker.close(true)));
  }

  private createWorker(
    queueName: string,
    concurrency: number,
    processor: (job: Job) => Promise<unknown>,
  ) {
    const lockDuration = this.readConcurrency('QUEUE_LOCK_DURATION_MS', 30_000);
    const stalledInterval = this.readConcurrency(
      'QUEUE_STALLED_INTERVAL_MS',
      30_000,
    );
    const maxStalledCount = this.readConcurrency('QUEUE_MAX_STALLED_COUNT', 1);
    const worker = new Worker(queueName, processor, {
      connection: getQueueConnection(),
      concurrency,
      lockDuration,
      stalledInterval,
      maxStalledCount,
    });

    worker.on('completed', async (job, result) => {
      if (!job?.data?.jobLogId) {
        return;
      }

      try {
        await this.jobLogService.completeJob({
          jobId: job.data.jobLogId,
          result,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to reconcile completed state for job ${job.id}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    });

    worker.on('failed', async (job, error) => {
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

      try {
        if (!isTerminalStallFailure && job.attemptsMade < configuredAttempts) {
          this.logger.warn(
            `Retrying queued job queue=${queueName} jobName=${job.name} jobId=${job.id} attempt=${job.attemptsMade + 1}/${configuredAttempts} error=${errorMessage}`,
          );
          await this.jobLogService.markJobPendingRetry({
            jobId: job.data.jobLogId,
            errorMessage: `${errorMessage} Retrying...`,
            attempts: configuredAttempts,
          });
        } else {
          await this.jobLogService.failJob({
            jobId: job.data.jobLogId,
            errorMessage,
          });
        }
      } catch (reconcileError) {
        this.logger.warn(
          `Failed to reconcile failed state for job ${job.id}: ${
            reconcileError instanceof Error
              ? reconcileError.message
              : 'Unknown error'
          }`,
        );
      }
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
      case QUEUE_NAMES.ANALYSIS_SNAPSHOT:
        return this.readConcurrency('IDEA_SNAPSHOT_CONCURRENCY', 12);
      case QUEUE_NAMES.ANALYSIS_SINGLE:
        return this.readConcurrency('DEEP_ANALYSIS_CONCURRENCY', 6);
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

  private resolveDeepAnalysisConcurrency(snapshotConcurrency: number) {
    const requested = this.readConcurrency('DEEP_ANALYSIS_CONCURRENCY', 6);
    const capped = Math.max(1, Math.floor(snapshotConcurrency / 2));
    const resolved = Math.min(requested, capped);

    if (resolved < requested) {
      this.logger.warn(
        `Clamping deepAnalysisConcurrency from ${requested} to ${resolved} so it does not exceed half of snapshot concurrency (${snapshotConcurrency}).`,
      );
    }

    return resolved;
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

    return this.runQueuedJob(job, async () => {
      const result = await this.githubService.backfillCreatedRepositoriesDirect(
        job.data.dto,
        {
          parentJobId: job.data.jobLogId,
          onProgress: async (progress) => {
            currentProgress = progress;
            await job.updateProgress(progress);
            await this.jobLogService.updateJobProgress({
              jobId: job.data.jobLogId,
              progress,
            });
          },
          onHeartbeat: async (payload) => {
            const now = Date.now();

            if (now - lastHeartbeatAt < 5_000) {
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

  private async handleIdeaSnapshot(
    job: Job<QueueJobData & GitHubIdeaSnapshotJobPayload>,
  ) {
    return this.runQueuedJob(job, async () => {
      const result = await this.githubService.processIdeaSnapshotQueueJob({
        repositoryId: job.data.repositoryId,
        windowDate: job.data.windowDate,
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
        const deepQueueDepth = await this.queueService.getQueueDepth(
          QUEUE_NAMES.ANALYSIS_SINGLE,
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
          },
          'backfill',
          {
            parentJobId: result.deepAnalysis.parentJobId ?? undefined,
            metadata: {
              fromBackfill: true,
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
    job: Job<QueueJobData & { repositoryId: string; dto: RunAnalysisDto }>,
  ) {
    return this.runQueuedJob(job, async () => {
      const result = await this.analysisOrchestratorService.runRepositoryAnalysisDirect(
        job.data.repositoryId,
        job.data.dto,
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
    executor: () => Promise<unknown>,
  ) {
    const jobLogId = job.data.jobLogId;
    const attempt = job.attemptsMade + 1;
    const configuredAttempts =
      typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;

    await job.updateProgress(10);
    await this.jobLogService.markJobRunning({
      jobId: jobLogId,
      attempts: configuredAttempts,
      queueJobId: String(job.id),
      queueName: job.queueName,
    });
    await this.jobLogService.updateJobProgress({
      jobId: jobLogId,
      progress: 10,
    });

    try {
      const result = await executor();

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
    }
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
