import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { JobsOptions, Queue } from 'bullmq';
import { BatchRunAnalysisDto } from '../analysis/dto/batch-run-analysis.dto';
import { RunAnalysisDto } from '../analysis/dto/run-analysis.dto';
import { BehaviorMemoryService } from '../behavior-memory/behavior-memory.service';
import { BatchFastFilterDto } from '../fast-filter/dto/batch-fast-filter.dto';
import { BackfillCreatedRepositoriesDto } from '../github/dto/backfill-created-repositories.dto';
import { FetchRepositoriesDto } from '../github/dto/fetch-repositories.dto';
import { GitHubIdeaSnapshotJobPayload } from '../github/types/github.types';
import { JobLogService } from '../job-log/job-log.service';
import { AdaptiveSchedulerService } from '../scheduler/adaptive-scheduler.service';
import { getQueueConnection } from './queue.redis';
import { QUEUE_JOB_TYPES, QUEUE_NAMES, QueueName } from './queue.constants';

type EnqueueResult = {
  jobId: string;
  queueName: QueueName;
  queueJobId: string;
  jobStatus: JobStatus;
};

type QueueJobPayload = Record<string, unknown>;

export type QueueDepthSummary = {
  waiting: number;
  active: number;
  delayed: number;
  prioritized: number;
  total: number;
};

export type QueueJobRuntimeSnapshot = {
  queueJobId: string;
  state: string;
  attemptsMade: number;
  processedOn: number | null;
  finishedOn: number | null;
  timestamp: number;
};

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(
    private readonly jobLogService: JobLogService,
    private readonly behaviorMemoryService: BehaviorMemoryService,
    private readonly adaptiveSchedulerService: AdaptiveSchedulerService,
  ) {}

  async enqueueGitHubFetch(
    dto: FetchRepositoriesDto,
    triggeredBy = 'ui',
  ): Promise<EnqueueResult> {
    return this.enqueueJob({
      queueName: QUEUE_NAMES.GITHUB_FETCH,
      jobName: QUEUE_JOB_TYPES.GITHUB_FETCH,
      payload: { dto },
      triggeredBy,
    });
  }

  async enqueueGitHubCreatedBackfill(
    dto: BackfillCreatedRepositoriesDto,
    triggeredBy = 'ui',
  ): Promise<EnqueueResult> {
    return this.enqueueJob({
      queueName: QUEUE_NAMES.GITHUB_CREATED_BACKFILL,
      jobName: QUEUE_JOB_TYPES.GITHUB_CREATED_BACKFILL,
      payload: { dto },
      triggeredBy,
    });
  }

  async enqueueSingleAnalysis(
    repositoryId: string,
    dto: RunAnalysisDto,
    triggeredBy = 'ui',
    options: {
      parentJobId?: string;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<EnqueueResult> {
    const priorityOptions = await this.buildAnalysisPriorityOptions(
      repositoryId,
      dto,
    );
    await this.behaviorMemoryService.recordQueueInfluence(
      typeof priorityOptions.priority === 'number',
    );

    return this.enqueueJob({
      queueName: QUEUE_NAMES.ANALYSIS_SINGLE,
      jobName: QUEUE_JOB_TYPES.ANALYSIS_SINGLE,
      payload: {
        repositoryId,
        dto,
        ...(options.metadata ?? {}),
      },
      triggeredBy,
      parentJobId: options.parentJobId,
      jobOptionsOverride: priorityOptions,
    });
  }

  async enqueueIdeaSnapshot(
    payload: GitHubIdeaSnapshotJobPayload,
    triggeredBy = 'backfill',
    parentJobId?: string,
  ): Promise<EnqueueResult> {
    return this.enqueueJob({
      queueName: QUEUE_NAMES.ANALYSIS_SNAPSHOT,
      jobName: QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT,
      payload,
      triggeredBy,
      parentJobId,
    });
  }

  async enqueueIdeaSnapshotsBulk(
    payloads: GitHubIdeaSnapshotJobPayload[],
    triggeredBy = 'backfill',
    parentJobId?: string,
  ): Promise<EnqueueResult[]> {
    if (!payloads.length) {
      return [];
    }

    const queueName = QUEUE_NAMES.ANALYSIS_SNAPSHOT;
    const jobName = QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT;
    const queue = this.getQueue(queueName);
    const options = this.buildJobOptions(queueName);
    const attempts = options.attempts ?? 1;

    const jobLogs = await Promise.all(
      payloads.map((payload) =>
        this.jobLogService.startJob({
          jobName,
          jobStatus: JobStatus.PENDING,
          queueName,
          payload,
          triggeredBy,
          attempts,
          retryCount: 0,
          parentJobId,
          startedAt: null,
        }),
      ),
    );

    const jobs = await queue.addBulk(
      jobLogs.map((jobLog, index) => ({
        name: jobName,
        data: {
          ...payloads[index],
          jobLogId: jobLog.id,
        },
        opts: options,
      })),
    );

    await Promise.all(
      jobs.map((job, index) =>
        this.jobLogService.attachQueueJob({
          jobId: jobLogs[index].id,
          queueName,
          queueJobId: String(job.id),
          attempts,
        }),
      ),
    );

    return jobs.map((job, index) => ({
      jobId: jobLogs[index].id,
      queueName,
      queueJobId: String(job.id),
      jobStatus: JobStatus.PENDING,
    }));
  }

  async enqueueBatchAnalysis(
    dto: BatchRunAnalysisDto,
    triggeredBy = 'ui',
  ): Promise<EnqueueResult> {
    return this.enqueueJob({
      queueName: QUEUE_NAMES.ANALYSIS_BATCH,
      jobName: QUEUE_JOB_TYPES.ANALYSIS_BATCH,
      payload: { dto },
      triggeredBy,
    });
  }

  async enqueueFastFilterBatch(
    dto: BatchFastFilterDto,
    triggeredBy = 'ui',
  ): Promise<EnqueueResult> {
    return this.enqueueJob({
      queueName: QUEUE_NAMES.FAST_FILTER_BATCH,
      jobName: QUEUE_JOB_TYPES.FAST_FILTER_BATCH,
      payload: { dto },
      triggeredBy,
    });
  }

  async retryJob(jobId: string) {
    const jobLog = await this.jobLogService.getJobById(jobId);

    if (!jobLog.queueName) {
      throw new BadRequestException('This job is not backed by a queue.');
    }

    if (
      jobLog.jobStatus !== JobStatus.FAILED &&
      jobLog.jobStatus !== JobStatus.SUCCESS
    ) {
      throw new BadRequestException(
        'Only completed or failed jobs can be retried.',
      );
    }

    const payload = this.ensurePayload(jobLog.payload);
    const retryCount = (jobLog.retryCount ?? 0) + 1;

    return this.enqueueJob({
      queueName: jobLog.queueName as QueueName,
      jobName: jobLog.jobName,
      payload,
      triggeredBy: jobLog.triggeredBy ?? 'manual',
      parentJobId: jobLog.id,
      retryCount,
    });
  }

  async cancelJob(jobId: string) {
    const jobLog = await this.jobLogService.getJobById(jobId);

    if (!jobLog.queueName || !jobLog.queueJobId) {
      throw new BadRequestException('This job does not have queue metadata.');
    }

    if (jobLog.jobStatus !== JobStatus.PENDING) {
      throw new BadRequestException(
        'Only queued jobs can be cancelled safely.',
      );
    }

    const queue = this.getQueue(jobLog.queueName as QueueName);
    const job = await queue.getJob(jobLog.queueJobId);

    if (!job) {
      throw new BadRequestException('Queue job could not be found.');
    }

    const state = await job.getState();

    if (!['waiting', 'delayed', 'prioritized'].includes(state)) {
      throw new BadRequestException(
        `This job can no longer be cancelled because it is currently ${state}.`,
      );
    }

    await job.remove();
    await this.jobLogService.cancelJob({
      jobId: jobLog.id,
      errorMessage: 'Task cancelled before execution.',
      result: {
        cancelled: true,
        queueState: state,
      },
    });

    return await this.jobLogService.getJobById(jobLog.id);
  }

  async getJobRuntimeInfo(jobId: string) {
    const jobLog = await this.jobLogService.getJobById(jobId);
    let queueState: string | null = null;

    if (jobLog.queueName && jobLog.queueJobId) {
      const queue = this.getQueue(jobLog.queueName as QueueName);
      const job = await queue.getJob(jobLog.queueJobId);

      if (job) {
        queueState = await job.getState();
      }
    }

    return {
      ...jobLog,
      queueState,
      canRetry:
        jobLog.jobStatus === JobStatus.FAILED ||
        jobLog.jobStatus === JobStatus.SUCCESS,
      canCancel:
        jobLog.jobStatus === JobStatus.PENDING &&
        (queueState === null ||
          ['waiting', 'delayed', 'prioritized'].includes(queueState)),
    };
  }

  async getQueueDepth(queueName: QueueName): Promise<QueueDepthSummary> {
    const queue = this.getQueue(queueName);
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
    );

    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;
    const delayed = counts.delayed ?? 0;
    const prioritized = counts.prioritized ?? 0;

    return {
      waiting,
      active,
      delayed,
      prioritized,
      total: waiting + active + delayed + prioritized,
    };
  }

  async getQueueJobSnapshot(
    queueName: QueueName,
    queueJobId: string,
  ): Promise<QueueJobRuntimeSnapshot | null> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(queueJobId);

    if (!job) {
      return null;
    }

    return {
      queueJobId: String(job.id),
      state: await job.getState(),
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
      timestamp: job.timestamp,
    };
  }

  async listQueueJobSnapshots(
    queueName: QueueName,
    states: Array<'active' | 'waiting' | 'delayed' | 'prioritized'>,
  ): Promise<QueueJobRuntimeSnapshot[]> {
    const queue = this.getQueue(queueName);
    const jobs = await queue.getJobs(states, 0, -1, true);

    return Promise.all(
      jobs.map(async (job) => ({
        queueJobId: String(job.id),
        state: await job.getState(),
        attemptsMade: job.attemptsMade,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
        timestamp: job.timestamp,
      })),
    );
  }

  async onModuleDestroy() {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
  }

  private async enqueueJob({
    queueName,
    jobName,
    payload,
    triggeredBy,
    parentJobId,
    retryCount = 0,
    jobOptionsOverride,
  }: {
    queueName: QueueName;
    jobName: string;
    payload: QueueJobPayload;
    triggeredBy: string;
    parentJobId?: string;
    retryCount?: number;
    jobOptionsOverride?: JobsOptions;
  }): Promise<EnqueueResult> {
    const queue = this.getQueue(queueName);
    const options = {
      ...this.buildJobOptions(queueName),
      ...(jobOptionsOverride ?? {}),
    };
    const jobLog = await this.jobLogService.startJob({
      jobName,
      jobStatus: JobStatus.PENDING,
      queueName,
      payload,
      triggeredBy,
      attempts: options.attempts ?? 1,
      retryCount,
      parentJobId,
      startedAt: null,
    });

    const job = await queue.add(
      jobName,
      {
        ...payload,
        jobLogId: jobLog.id,
      },
      options,
    );

    const queueJobId = String(job.id);
    await this.jobLogService.attachQueueJob({
      jobId: jobLog.id,
      queueName,
      queueJobId,
      attempts: options.attempts ?? 1,
    });

    return {
      jobId: jobLog.id,
      queueName,
      queueJobId,
      jobStatus: JobStatus.PENDING,
    };
  }

  private buildJobOptions(queueName: QueueName): JobsOptions {
    switch (queueName) {
      case QUEUE_NAMES.ANALYSIS_SNAPSHOT:
        return {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 4000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        };
      case QUEUE_NAMES.ANALYSIS_SINGLE:
        return {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 8000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        };
      default:
        return {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        };
    }
  }

  private async buildAnalysisPriorityOptions(
    repositoryId: string,
    dto: RunAnalysisDto,
  ): Promise<JobsOptions> {
    const rawBoost =
      typeof dto.userPreferencePriorityBoost === 'number' &&
      Number.isFinite(dto.userPreferencePriorityBoost)
        ? dto.userPreferencePriorityBoost
        : 0;
    const schedulerAdjustment =
      await this.adaptiveSchedulerService.getAnalysisPriorityAdjustment(
        repositoryId,
      );
    const totalBoost = rawBoost + schedulerAdjustment.boost;

    if (totalBoost === 0) {
      return {};
    }

    if (totalBoost > 0) {
      return {
        priority: Math.max(1, 60 - totalBoost * 6),
      };
    }

    return {
      priority: Math.min(200, 120 + Math.abs(totalBoost) * 8),
    };
  }

  private getQueue(queueName: QueueName) {
    const existing = this.queues.get(queueName);

    if (existing) {
      return existing;
    }

    const queue = new Queue(queueName, {
      connection: getQueueConnection(),
    });

    this.queues.set(queueName, queue);
    return queue;
  }

  private ensurePayload(payload: unknown): QueueJobPayload {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new BadRequestException('This job payload cannot be retried safely.');
    }

    return payload as QueueJobPayload;
  }
}
