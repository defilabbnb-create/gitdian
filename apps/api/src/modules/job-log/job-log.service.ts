import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueryJobLogsDto } from './dto/query-job-logs.dto';

type StartJobInput = {
  jobName: string;
  payload?: unknown;
  jobStatus?: JobStatus;
  queueName?: string | null;
  queueJobId?: string | null;
  triggeredBy?: string | null;
  attempts?: number;
  retryCount?: number;
  progress?: number;
  parentJobId?: string | null;
  startedAt?: Date | null;
};

type CompleteJobInput = {
  jobId: string;
  result?: unknown;
  progress?: number;
};

type FailJobInput = {
  jobId: string;
  errorMessage: string;
  result?: unknown;
  progress?: number;
};

type AttachQueueJobInput = {
  jobId: string;
  queueName?: string;
  queueJobId: string;
  attempts?: number;
};

type CancelJobsBulkInput = {
  jobIds: string[];
  errorMessage?: string;
  result?: unknown;
};

type MarkJobRunningInput = {
  jobId: string;
  attempts?: number;
  queueName?: string;
  queueJobId?: string;
};

type UpdateJobProgressInput = {
  jobId: string;
  progress: number;
  result?: unknown;
};

type MarkJobPendingRetryInput = {
  jobId: string;
  errorMessage: string;
  attempts?: number;
};

type CancelJobInput = {
  jobId: string;
  errorMessage?: string;
  result?: unknown;
};

@Injectable()
export class JobLogService {
  constructor(private readonly prisma: PrismaService) {}

  async startJob({
    jobName,
    payload,
    jobStatus = JobStatus.RUNNING,
    queueName,
    queueJobId,
    triggeredBy,
    attempts = 0,
    retryCount = 0,
    progress = 0,
    parentJobId,
    startedAt,
  }: StartJobInput) {
    const job = await this.prisma.jobLog.create({
      data: {
        jobName,
        jobStatus,
        queueName: queueName ?? undefined,
        queueJobId: queueJobId ?? undefined,
        triggeredBy: triggeredBy ?? undefined,
        attempts,
        retryCount,
        progress: this.clampProgress(progress),
        parentJobId: parentJobId ?? undefined,
        payload: this.toJsonValue(payload),
        startedAt:
          typeof startedAt !== 'undefined'
            ? startedAt
            : jobStatus === JobStatus.RUNNING
              ? new Date()
              : null,
      },
      select: {
        id: true,
      },
    });

    return job;
  }

  async startJobsBulk(inputs: StartJobInput[]) {
    if (!inputs.length) {
      return [];
    }

    const rows = inputs.map((input) => ({
      id: randomUUID(),
      jobName: input.jobName,
      jobStatus: input.jobStatus ?? JobStatus.RUNNING,
      queueName: input.queueName ?? undefined,
      queueJobId: input.queueJobId ?? undefined,
      triggeredBy: input.triggeredBy ?? undefined,
      attempts: input.attempts ?? 0,
      retryCount: input.retryCount ?? 0,
      progress: this.clampProgress(input.progress ?? 0),
      parentJobId: input.parentJobId ?? undefined,
      payload: this.toJsonValue(input.payload),
      startedAt:
        typeof input.startedAt !== 'undefined'
          ? input.startedAt
          : (input.jobStatus ?? JobStatus.RUNNING) === JobStatus.RUNNING
            ? new Date()
            : null,
    }));

    await this.prisma.jobLog.createMany({
      data: rows,
    });

    return rows.map((row) => ({ id: row.id }));
  }

  async attachQueueJob({
    jobId,
    queueName,
    queueJobId,
    attempts,
  }: AttachQueueJobInput) {
    return this.prisma.jobLog.update({
      where: { id: jobId },
      data: {
        queueName: queueName ?? undefined,
        queueJobId,
        attempts: typeof attempts === 'number' ? attempts : undefined,
      },
    });
  }

  async attachQueueJobsBulk(inputs: AttachQueueJobInput[]) {
    if (!inputs.length) {
      return [];
    }

    return this.prisma.$transaction(
      inputs.map((input) =>
        this.prisma.jobLog.update({
          where: { id: input.jobId },
          data: {
            queueName: input.queueName ?? undefined,
            queueJobId: input.queueJobId,
            attempts:
              typeof input.attempts === 'number' ? input.attempts : undefined,
          },
        }),
      ),
    );
  }

  async markJobRunning({
    jobId,
    attempts,
    queueName,
    queueJobId,
  }: MarkJobRunningInput) {
    const existing = await this.getJobById(jobId);

    return this.prisma.jobLog.update({
      where: { id: jobId },
      data: {
        jobStatus: JobStatus.RUNNING,
        attempts: typeof attempts === 'number' ? attempts : undefined,
        queueName: queueName ?? undefined,
        queueJobId: queueJobId ?? undefined,
        startedAt: existing.startedAt ?? new Date(),
        finishedAt: null,
        durationMs: null,
        errorMessage: null,
      },
    });
  }

  async markJobPendingRetry({
    jobId,
    errorMessage,
    attempts,
  }: MarkJobPendingRetryInput) {
    return this.prisma.jobLog.update({
      where: { id: jobId },
      data: {
        jobStatus: JobStatus.PENDING,
        attempts: typeof attempts === 'number' ? attempts : undefined,
        progress: 0,
        errorMessage,
        finishedAt: null,
        durationMs: null,
      },
    });
  }

  async updateJobProgress({ jobId, progress, result }: UpdateJobProgressInput) {
    return this.prisma.jobLog.update({
      where: { id: jobId },
      data: {
        progress: this.clampProgress(progress),
        result: typeof result === 'undefined' ? undefined : this.toJsonValue(result),
      },
    });
  }

  async completeJob({ jobId, result, progress = 100 }: CompleteJobInput) {
    const existing = await this.getJobById(jobId);
    const finishedAt = new Date();

    return this.prisma.jobLog.update({
      where: { id: jobId },
      data: {
        jobStatus: JobStatus.SUCCESS,
        result: this.toJsonValue(result),
        errorMessage: null,
        progress: this.clampProgress(progress),
        finishedAt,
        durationMs: this.calculateDurationMs(existing.startedAt, finishedAt),
      },
    });
  }

  async failJob({ jobId, errorMessage, result, progress = 0 }: FailJobInput) {
    const existing = await this.getJobById(jobId);
    const finishedAt = new Date();

    return this.prisma.jobLog.update({
      where: { id: jobId },
      data: {
        jobStatus: JobStatus.FAILED,
        result: this.toJsonValue(result),
        errorMessage,
        progress: this.clampProgress(progress),
        finishedAt,
        durationMs: this.calculateDurationMs(existing.startedAt, finishedAt),
      },
    });
  }

  async cancelJob({
    jobId,
    errorMessage = 'Task cancelled.',
    result,
  }: CancelJobInput) {
    const existing = await this.getJobById(jobId);
    const finishedAt = new Date();

    return this.prisma.jobLog.update({
      where: { id: jobId },
      data: {
        jobStatus: JobStatus.FAILED,
        errorMessage,
        result: this.toJsonValue({
          cancelled: true,
          ...(this.isRecord(result) ? result : {}),
        }),
        finishedAt,
        durationMs: this.calculateDurationMs(existing.startedAt, finishedAt),
      },
    });
  }

  async cancelJobsBulk({
    jobIds,
    errorMessage = 'Task cancelled.',
    result,
  }: CancelJobsBulkInput) {
    if (!jobIds.length) {
      return { count: 0 };
    }

    return this.prisma.jobLog.updateMany({
      where: {
        id: {
          in: jobIds,
        },
      },
      data: {
        jobStatus: JobStatus.FAILED,
        errorMessage,
        result: this.toJsonValue({
          cancelled: true,
          ...(this.isRecord(result) ? result : {}),
        }),
        finishedAt: new Date(),
        durationMs: null,
      },
    });
  }

  async getJobById(jobId: string) {
    const job = await this.prisma.jobLog.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Job log with id "${jobId}" was not found.`);
    }

    return this.serialize(job);
  }

  async queryJobs(query: QueryJobLogsDto) {
    const where: Prisma.JobLogWhereInput = {};

    if (query.jobName?.trim()) {
      where.jobName = {
        contains: query.jobName.trim(),
        mode: 'insensitive',
      };
    }

    if (query.jobStatus) {
      where.jobStatus = query.jobStatus;
    }

    if (query.repositoryId?.trim()) {
      const repositoryId = query.repositoryId.trim();

      where.AND = [{
        OR: [
          {
            payload: {
              path: ['repositoryId'],
              equals: repositoryId,
            },
          },
          {
            result: {
              path: ['repositoryId'],
              equals: repositoryId,
            },
          },
          {
            payload: {
              path: ['repositoryIds'],
              array_contains: [repositoryId],
            },
          },
        ],
      }];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.jobLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.jobLog.count({ where }),
    ]);

    return {
      items: this.serialize(items),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  private calculateDurationMs(
    startedAt: Date | string | null,
    finishedAt: Date,
  ) {
    if (!startedAt) {
      return null;
    }

    const normalizedStartedAt =
      startedAt instanceof Date ? startedAt : new Date(startedAt);

    if (Number.isNaN(normalizedStartedAt.getTime())) {
      return null;
    }

    return Math.max(0, finishedAt.getTime() - normalizedStartedAt.getTime());
  }

  private clampProgress(progress: number) {
    return Math.max(0, Math.min(100, Math.round(progress)));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }

    if (value === null) {
      return Prisma.JsonNull;
    }

    return this.serialize(value) as Prisma.InputJsonValue;
  }

  private serialize<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_, currentValue: unknown) => {
        if (typeof currentValue === 'bigint') {
          return currentValue.toString();
        }

        if (currentValue instanceof Prisma.Decimal) {
          return currentValue.toNumber();
        }

        if (currentValue instanceof Date) {
          return currentValue.toISOString();
        }

        return currentValue;
      }),
    ) as T;
  }
}
