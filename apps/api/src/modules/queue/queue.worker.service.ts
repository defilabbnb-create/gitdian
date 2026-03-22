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
import { GitHubService } from '../github/github.service';
import { FetchRepositoriesDto } from '../github/dto/fetch-repositories.dto';
import { JobLogService } from '../job-log/job-log.service';
import { QUEUE_NAMES } from './queue.constants';
import { getQueueConnection } from './queue.redis';

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
    private readonly analysisOrchestratorService: AnalysisOrchestratorService,
    private readonly fastFilterService: FastFilterService,
  ) {}

  async onModuleInit() {
    if (process.env.ENABLE_QUEUE_WORKERS !== 'true') {
      return;
    }

    this.workers.push(
      this.createWorker(QUEUE_NAMES.GITHUB_FETCH, (job) =>
        this.handleGitHubFetch(job as Job<QueueJobData & { dto: FetchRepositoriesDto }>),
      ),
      this.createWorker(QUEUE_NAMES.ANALYSIS_SINGLE, (job) =>
        this.handleSingleAnalysis(
          job as Job<
            QueueJobData & { repositoryId: string; dto: RunAnalysisDto }
          >,
        ),
      ),
      this.createWorker(QUEUE_NAMES.ANALYSIS_BATCH, (job) =>
        this.handleBatchAnalysis(
          job as Job<QueueJobData & { dto: BatchRunAnalysisDto }>,
        ),
      ),
      this.createWorker(QUEUE_NAMES.FAST_FILTER_BATCH, (job) =>
        this.handleFastFilterBatch(
          job as Job<QueueJobData & { dto: BatchFastFilterDto }>,
        ),
      ),
    );

    this.logger.log(`Queue workers started (${this.workers.length}).`);
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }

  private createWorker(queueName: string, processor: (job: Job) => Promise<unknown>) {
    const worker = new Worker(queueName, processor, {
      connection: getQueueConnection(),
      concurrency: 1,
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

      try {
        if (job.attemptsMade < configuredAttempts) {
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

    return worker;
  }

  private async handleGitHubFetch(
    job: Job<QueueJobData & { dto: FetchRepositoriesDto }>,
  ) {
    return this.runQueuedJob(job, async () => {
      const result = await this.githubService.fetchRepositoriesDirect(job.data.dto);

      return {
        mode: result.mode,
        requested: result.requested,
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        failed: result.failed,
        items: result.items.slice(0, 20),
      };
    });
  }

  private async handleSingleAnalysis(
    job: Job<QueueJobData & { repositoryId: string; dto: RunAnalysisDto }>,
  ) {
    return this.runQueuedJob(job, async () =>
      this.analysisOrchestratorService.runRepositoryAnalysisDirect(
        job.data.repositoryId,
        job.data.dto,
      ),
    );
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
}
