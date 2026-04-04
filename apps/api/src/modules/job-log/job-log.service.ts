import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import {
  countJobLogsSafe,
  queryJobLogsSafe,
} from '../../common/prisma/job-log-safe-read';
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
  progress?: number;
};

type MarkJobRunningResult = {
  id: string;
  activated: boolean;
};

type MarkJobPendingRetryResult = {
  id: string;
  pendingRetry: boolean;
};

type UpdateJobProgressResult = {
  id: string;
  applied: boolean;
};

type CompleteJobResult = {
  id: string;
  completed: boolean;
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

  private async getJobTimingState(jobId: string) {
    const job = await this.prisma.jobLog.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        jobStatus: true,
        startedAt: true,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job log with id "${jobId}" was not found.`);
    }

    return job;
  }

  private isJobMutable(jobStatus: JobStatus) {
    return jobStatus === JobStatus.PENDING || jobStatus === JobStatus.RUNNING;
  }

  private buildJobLogQueryFilters(query: QueryJobLogsDto) {
    const where: Prisma.JobLogWhereInput = {};
    const sqlConditions: string[] = [];
    const sqlParams: unknown[] = [];

    if (query.jobName?.trim()) {
      const normalized = query.jobName.trim();
      where.jobName = {
        contains: normalized,
        mode: 'insensitive',
      };
      sqlParams.push(`%${normalized}%`);
      sqlConditions.push(`"jobName" ILIKE $${sqlParams.length}`);
    }

    if (query.jobStatus) {
      where.jobStatus = query.jobStatus;
      sqlParams.push(query.jobStatus);
      sqlConditions.push(`"jobStatus" = $${sqlParams.length}::"JobStatus"`);
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

      sqlParams.push(repositoryId);
      const repositoryParamIndex = sqlParams.length;
      sqlConditions.push(`(
        "payload"->>'repositoryId' = $${repositoryParamIndex}
        OR "result"->>'repositoryId' = $${repositoryParamIndex}
        OR COALESCE("payload"->'repositoryIds', '[]'::jsonb) ? $${repositoryParamIndex}
      )`);
    }

    return {
      where,
      whereSql: sqlConditions.join(' AND '),
      sqlParams,
    };
  }

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
      select: {
        id: true,
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
          select: {
            id: true,
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
    progress,
  }: MarkJobRunningInput): Promise<MarkJobRunningResult> {
    const existing = await this.getJobTimingState(jobId);

    if (!this.isJobMutable(existing.jobStatus)) {
      return {
        id: existing.id,
        activated: false,
      };
    }

    await this.prisma.jobLog.update({
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
        progress:
          typeof progress === 'number'
            ? this.clampProgress(progress)
            : undefined,
      },
      select: {
        id: true,
      },
    });

    return {
      id: existing.id,
      activated: true,
    };
  }

  async markJobPendingRetry({
    jobId,
    errorMessage,
    attempts,
  }: MarkJobPendingRetryInput): Promise<MarkJobPendingRetryResult> {
    const existing = await this.getJobTimingState(jobId);

    if (!this.isJobMutable(existing.jobStatus)) {
      return {
        id: existing.id,
        pendingRetry: false,
      };
    }

    await this.prisma.jobLog.update({
      where: { id: jobId },
      data: {
        jobStatus: JobStatus.PENDING,
        attempts: typeof attempts === 'number' ? attempts : undefined,
        progress: 0,
        errorMessage,
        finishedAt: null,
        durationMs: null,
      },
      select: {
        id: true,
      },
    });

    return {
      id: existing.id,
      pendingRetry: true,
    };
  }

  async updateJobProgress({
    jobId,
    progress,
    result,
  }: UpdateJobProgressInput): Promise<UpdateJobProgressResult> {
    const updateResult = await this.prisma.jobLog.updateMany({
      where: {
        id: jobId,
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
      },
      data: {
        progress: this.clampProgress(progress),
        result: typeof result === 'undefined' ? undefined : this.toJsonValue(result),
      },
    });

    return {
      id: jobId,
      applied: updateResult.count > 0,
    };
  }

  async completeJob({
    jobId,
    result,
    progress = 100,
  }: CompleteJobInput): Promise<CompleteJobResult> {
    const existing = await this.getJobTimingState(jobId);

    if (!this.isJobMutable(existing.jobStatus)) {
      return {
        id: existing.id,
        completed: false,
      };
    }

    const finishedAt = new Date();

    await this.prisma.jobLog.update({
      where: { id: jobId },
      data: {
        jobStatus: JobStatus.SUCCESS,
        result: this.toJsonValue(result),
        errorMessage: null,
        progress: this.clampProgress(progress),
        finishedAt,
        durationMs: this.calculateDurationMs(existing.startedAt, finishedAt),
      },
      select: {
        id: true,
      },
    });

    return {
      id: existing.id,
      completed: true,
    };
  }

  async failJob({ jobId, errorMessage, result, progress = 0 }: FailJobInput) {
    const existing = await this.getJobTimingState(jobId);
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
      select: {
        id: true,
      },
    });
  }

  async cancelJob({
    jobId,
    errorMessage = 'Task cancelled.',
    result,
  }: CancelJobInput) {
    const existing = await this.getJobTimingState(jobId);
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
      select: {
        id: true,
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
    const [job] = await queryJobLogsSafe(this.prisma, {
      whereSql: `"id" = $1`,
      params: [jobId],
      limit: 1,
    });

    if (!job) {
      throw new NotFoundException(`Job log with id "${jobId}" was not found.`);
    }

    return this.serialize(job);
  }

  async queryJobs(query: QueryJobLogsDto) {
    const { where, whereSql, sqlParams } = this.buildJobLogQueryFilters(query);
    const [items, total] = await Promise.all([
      queryJobLogsSafe(this.prisma, {
        whereSql,
        params: sqlParams,
        orderBySql: `"createdAt" DESC`,
        offset: (query.page - 1) * query.pageSize,
        limit: query.pageSize,
      }),
      whereSql
        ? countJobLogsSafe(this.prisma, {
            whereSql,
            params: sqlParams,
          })
        : this.prisma.jobLog.count({ where }),
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
