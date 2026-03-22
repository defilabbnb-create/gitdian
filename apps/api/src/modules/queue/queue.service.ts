import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { JobsOptions, Queue } from 'bullmq';
import { BatchRunAnalysisDto } from '../analysis/dto/batch-run-analysis.dto';
import { RunAnalysisDto } from '../analysis/dto/run-analysis.dto';
import { BatchFastFilterDto } from '../fast-filter/dto/batch-fast-filter.dto';
import { FetchRepositoriesDto } from '../github/dto/fetch-repositories.dto';
import { JobLogService } from '../job-log/job-log.service';
import { getQueueConnection } from './queue.redis';
import { QUEUE_JOB_TYPES, QUEUE_NAMES, QueueName } from './queue.constants';

type EnqueueResult = {
  jobId: string;
  queueName: QueueName;
  queueJobId: string;
  jobStatus: JobStatus;
};

type QueueJobPayload = Record<string, unknown>;

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly jobLogService: JobLogService) {}

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

  async enqueueSingleAnalysis(
    repositoryId: string,
    dto: RunAnalysisDto,
    triggeredBy = 'ui',
  ): Promise<EnqueueResult> {
    return this.enqueueJob({
      queueName: QUEUE_NAMES.ANALYSIS_SINGLE,
      jobName: QUEUE_JOB_TYPES.ANALYSIS_SINGLE,
      payload: {
        repositoryId,
        dto,
      },
      triggeredBy,
    });
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
  }: {
    queueName: QueueName;
    jobName: string;
    payload: QueueJobPayload;
    triggeredBy: string;
    parentJobId?: string;
    retryCount?: number;
  }): Promise<EnqueueResult> {
    const queue = this.getQueue(queueName);
    const options = this.buildJobOptions();
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

  private buildJobOptions(): JobsOptions {
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
