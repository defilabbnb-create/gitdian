import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { JobsOptions, Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BatchRunAnalysisDto } from '../analysis/dto/batch-run-analysis.dto';
import { RunAnalysisDto } from '../analysis/dto/run-analysis.dto';
import {
  ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY,
  FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY,
} from '../analysis/helpers/frozen-analysis-pool.types';
import {
  evaluateAnalysisPoolIntakeGate,
  readAnalysisPoolFreezeState,
  readFrozenAnalysisPoolBatchSnapshot,
} from '../analysis/helpers/frozen-analysis-pool.helper';
import { BehaviorMemoryService } from '../behavior-memory/behavior-memory.service';
import { BatchFastFilterDto } from '../fast-filter/dto/batch-fast-filter.dto';
import { BackfillCreatedRepositoriesDto } from '../github/dto/backfill-created-repositories.dto';
import { FetchRepositoriesDto } from '../github/dto/fetch-repositories.dto';
import { RunColdToolCollectorDto } from '../github/dto/run-cold-tool-collector.dto';
import { GitHubIdeaSnapshotJobPayload } from '../github/types/github.types';
import { JobLogService } from '../job-log/job-log.service';
import { AdaptiveSchedulerService } from '../scheduler/adaptive-scheduler.service';
import { getQueueConnection } from './queue.redis';
import {
  QUEUE_JOB_TYPES,
  QUEUE_NAMES,
  QueueJobType,
  QueueName,
} from './queue.constants';

export const GITHUB_NEW_REPOSITORY_INTAKE_ENV_NAMES = [
  'GITHUB_NEW_REPOSITORY_INTAKE_ENABLED',
  'GITHUB_INTAKE_ENABLED',
] as const;
export const GITHUB_NEW_REPOSITORY_INTAKE_ENABLED_FALLBACK = false;

export function parseBooleanEnvFlag(
  rawValue: string | null | undefined,
  fallback: boolean,
) {
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function readGitHubNewRepositoryIntakeEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
) {
  for (const envName of GITHUB_NEW_REPOSITORY_INTAKE_ENV_NAMES) {
    const rawValue = env[envName];
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      continue;
    }
    return parseBooleanEnvFlag(
      rawValue,
      GITHUB_NEW_REPOSITORY_INTAKE_ENABLED_FALLBACK,
    );
  }

  return GITHUB_NEW_REPOSITORY_INTAKE_ENABLED_FALLBACK;
}

type EnqueueResult = {
  jobId: string;
  queueName: QueueName;
  queueJobId: string;
  jobStatus: JobStatus;
};

type ActiveSingleAnalysisJobLog = {
  id: string;
  queueName: string | null;
  queueJobId: string | null;
  jobStatus: JobStatus;
  payload: Prisma.JsonValue | null;
  result?: Prisma.JsonValue | null;
  createdAt?: Date;
  startedAt?: Date | null;
  updatedAt?: Date;
  progress?: number;
};

type QueueJobPayload = Record<string, unknown>;

type IdeaSnapshotBulkEntry = {
  payload: GitHubIdeaSnapshotJobPayload;
  triggeredBy?: string;
  parentJobId?: string;
  jobOptionsOverride?: JobsOptions;
};

type SingleAnalysisBulkEntry = {
  repositoryId: string;
  dto: RunAnalysisDto;
  triggeredBy?: string;
  parentJobId?: string;
  metadata?: Record<string, unknown>;
  jobOptionsOverride?: JobsOptions;
};

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

export type ActiveQueueJobLogSnapshot = {
  id: string;
  queueName: string | null;
  queueJobId: string | null;
  jobStatus: JobStatus;
  progress: number;
  payload: Prisma.JsonValue | null;
  result: Prisma.JsonValue | null;
  createdAt: Date;
  startedAt: Date | null;
  updatedAt: Date;
};

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(
    private readonly jobLogService: JobLogService,
    private readonly behaviorMemoryService: BehaviorMemoryService,
    private readonly adaptiveSchedulerService: AdaptiveSchedulerService,
    private readonly prisma: PrismaService,
  ) {}

  async enqueueGitHubFetch(
    dto: FetchRepositoriesDto,
    triggeredBy = 'ui',
  ): Promise<EnqueueResult> {
    this.assertGitHubIntakeEnabled({
      source: 'github_fetch',
    });
    await this.assertAnalysisPoolIntakeAllowed({
      source: 'github_fetch',
    });
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
    this.assertGitHubIntakeEnabled({
      source: 'github_created_backfill',
    });
    await this.assertAnalysisPoolIntakeAllowed({
      source: 'github_created_backfill',
    });
    return this.enqueueJob({
      queueName: QUEUE_NAMES.GITHUB_CREATED_BACKFILL,
      jobName: QUEUE_JOB_TYPES.GITHUB_CREATED_BACKFILL,
      payload: { dto },
      triggeredBy,
    });
  }

  async enqueueGitHubColdToolCollect(
    dto: RunColdToolCollectorDto,
    triggeredBy = 'ui',
    options: {
      ignoreActiveJobId?: string;
    } = {},
  ): Promise<EnqueueResult> {
    this.assertGitHubIntakeEnabled({
      source: 'github_cold_tool_collect',
    });
    await this.assertAnalysisPoolIntakeAllowed({
      source: 'github_fetch',
    });
    const existingActiveJob = await this.findActiveQueueJobLog({
      queueName: QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
      jobName: QUEUE_JOB_TYPES.GITHUB_COLD_TOOL_COLLECT,
    });
    if (existingActiveJob) {
      if (
        options.ignoreActiveJobId &&
        existingActiveJob.id === options.ignoreActiveJobId
      ) {
        return this.enqueueJob({
          queueName: QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
          jobName: QUEUE_JOB_TYPES.GITHUB_COLD_TOOL_COLLECT,
          payload: { dto },
          triggeredBy,
          parentJobId: options.ignoreActiveJobId,
        });
      }
      const recovered = await this.recoverStaleColdToolCollectorEnqueueBlocker(
        existingActiveJob,
      );
      if (!recovered) {
        return this.toExistingEnqueueResult(existingActiveJob);
      }
    }
    return this.enqueueJob({
      queueName: QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
      jobName: QUEUE_JOB_TYPES.GITHUB_COLD_TOOL_COLLECT,
      payload: { dto },
      triggeredBy,
    });
  }

  private async recoverStaleColdToolCollectorEnqueueBlocker(
    jobLog: ActiveSingleAnalysisJobLog,
  ) {
    const staleMs = this.resolveColdToolCollectorEnqueueStaleMs();
    const runtime = this.readColdToolRuntimeState(jobLog.result ?? null);
    const heartbeatAgeMs = this.getColdToolCollectorHeartbeatAgeMs(
      jobLog,
      runtime,
    );

    const queueSnapshot = jobLog.queueJobId
      ? await this.getQueueJobSnapshot(
          QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
          jobLog.queueJobId,
        )
      : null;
    const queueMissing = !queueSnapshot;
    const stale =
      queueMissing ||
      heartbeatAgeMs >= staleMs ||
      (jobLog.jobStatus === JobStatus.PENDING &&
        queueSnapshot &&
        ['waiting', 'delayed', 'prioritized'].includes(queueSnapshot.state) &&
        heartbeatAgeMs >= staleMs / 2);

    if (!stale) {
      return false;
    }

    if (
      jobLog.queueJobId &&
      (!queueSnapshot ||
        ['waiting', 'delayed', 'prioritized'].includes(queueSnapshot.state))
    ) {
      await this.tryRemoveQueueJob(
        QUEUE_NAMES.GITHUB_COLD_TOOL_COLLECT,
        jobLog.queueJobId,
      );
    }

    const ageSecondsText = Number.isFinite(heartbeatAgeMs)
      ? `${Math.max(0, Math.round(heartbeatAgeMs / 1000))}s`
      : 'unknown duration';

    await this.jobLogService.failJob({
      jobId: jobLog.id,
      errorMessage: `Recovered stale cold-tool collector enqueue blocker after ${ageSecondsText} without usable queue progress.`,
      progress: typeof jobLog.progress === 'number' ? jobLog.progress : 0,
      result: {
        staleEnqueueBlocker: true,
        queueState: queueSnapshot?.state ?? null,
        queueJobId: jobLog.queueJobId,
        currentStage: runtime.currentStage,
        runtimeUpdatedAt: runtime.runtimeUpdatedAt,
        heartbeatAgeMs,
        recoveredAt: new Date().toISOString(),
      },
    });

    return true;
  }

  async enqueueSingleAnalysis(
    repositoryId: string,
    dto: RunAnalysisDto,
    triggeredBy = 'ui',
    options: {
      parentJobId?: string;
      metadata?: Record<string, unknown>;
      jobOptionsOverride?: JobsOptions;
    } = {},
  ): Promise<EnqueueResult> {
    await this.assertAnalysisPoolIntakeAllowed({
      source: 'analysis_single',
      repositoryIds: [repositoryId],
    });
    const existingActiveJob = await this.findActiveSingleAnalysisJobLog(
      repositoryId,
    );
    if (existingActiveJob) {
      return this.toExistingEnqueueResult(existingActiveJob);
    }
    const skipPriorityLookup = this.shouldSkipAnalysisPriorityLookup(
      options.jobOptionsOverride,
    );
    const priorityOptions = skipPriorityLookup
      ? {}
      : await this.buildAnalysisPriorityOptions(repositoryId, dto);
    await this.behaviorMemoryService.recordQueueInfluence(
      skipPriorityLookup
        ? this.hasBehaviorPriorityBoost(dto)
        : typeof priorityOptions.priority === 'number',
    );
    const queueRoute = this.resolveSingleAnalysisQueue(dto);

    return this.enqueueJob({
      queueName: queueRoute.queueName,
      jobName: queueRoute.jobName,
      payload: {
        repositoryId,
        dto,
        ...(options.metadata ?? {}),
      },
      triggeredBy,
      parentJobId: options.parentJobId,
      jobOptionsOverride: {
        ...priorityOptions,
        ...(options.jobOptionsOverride ?? {}),
      },
    });
  }

  async enqueueSingleAnalysesBulk(
    entries: SingleAnalysisBulkEntry[],
    triggeredBy = 'ui',
  ): Promise<EnqueueResult[]> {
    if (!entries.length) {
      return [];
    }

    await this.assertAnalysisPoolIntakeAllowed({
      source: 'analysis_single',
      repositoryIds: entries.map((entry) => entry.repositoryId),
    });

    const existingActiveJobsByRepositoryId =
      await this.findActiveSingleAnalysisJobLogs(
        entries.map((entry) => entry.repositoryId),
      );
    const seenRepositoryIds = new Set<string>();
    const dedupedEntries: SingleAnalysisBulkEntry[] = [];
    const existingResultsByRepositoryId = new Map<string, EnqueueResult>();

    for (const entry of entries) {
      const existingActiveJob = existingActiveJobsByRepositoryId.get(
        entry.repositoryId,
      );
      if (existingActiveJob) {
        existingResultsByRepositoryId.set(
          entry.repositoryId,
          this.toExistingEnqueueResult(existingActiveJob),
        );
        continue;
      }

      if (seenRepositoryIds.has(entry.repositoryId)) {
        continue;
      }

      seenRepositoryIds.add(entry.repositoryId);
      dedupedEntries.push(entry);
    }

    if (!dedupedEntries.length) {
      return entries
        .map((entry) => existingResultsByRepositoryId.get(entry.repositoryId))
        .filter(Boolean) as EnqueueResult[];
    }

    const newResultsByRepositoryId = new Map<string, EnqueueResult>();
    const entriesByQueue = new Map<
      QueueName,
      {
        jobName: string;
        entries: SingleAnalysisBulkEntry[];
      }
    >();

    for (const entry of dedupedEntries) {
      const queueRoute = this.resolveSingleAnalysisQueue(entry.dto);
      const current = entriesByQueue.get(queueRoute.queueName);
      if (current) {
        current.entries.push(entry);
        continue;
      }

      entriesByQueue.set(queueRoute.queueName, {
        jobName: queueRoute.jobName,
        entries: [entry],
      });
    }

    for (const [queueName, group] of entriesByQueue.entries()) {
      const groupResults = await this.enqueueSingleAnalysesBulkForQueue(
        queueName,
        group.jobName,
        group.entries,
        triggeredBy,
      );

      for (const result of groupResults) {
        const repositoryId = String(result.repositoryId ?? '').trim();
        if (!repositoryId) {
          continue;
        }
        newResultsByRepositoryId.set(repositoryId, result.enqueueResult);
      }
    }

    return entries.map((entry) => {
      const existing = existingResultsByRepositoryId.get(entry.repositoryId);
      if (existing) {
        return existing;
      }

      const created = newResultsByRepositoryId.get(entry.repositoryId);
      if (!created) {
        throw new BadRequestException(
          `Missing queued result for repository ${entry.repositoryId}.`,
        );
      }

      return created;
    });
  }

  async enqueueIdeaSnapshot(
    payload: GitHubIdeaSnapshotJobPayload,
    triggeredBy = 'backfill',
    options: {
      parentJobId?: string;
      jobOptionsOverride?: JobsOptions;
    } = {},
  ): Promise<EnqueueResult> {
    await this.assertAnalysisPoolIntakeAllowed({
      source: 'analysis_snapshot',
      repositoryIds: [payload.repositoryId],
    });
    const queueName =
      payload.analysisLane === 'cold_tool'
        ? QUEUE_NAMES.ANALYSIS_SNAPSHOT_COLD
        : QUEUE_NAMES.ANALYSIS_SNAPSHOT;
    const jobName =
      payload.analysisLane === 'cold_tool'
        ? QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT_COLD
        : QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT;
    return this.enqueueJob({
      queueName,
      jobName,
      payload,
      triggeredBy,
      parentJobId: options.parentJobId,
      jobOptionsOverride: options.jobOptionsOverride,
    });
  }

  async enqueueIdeaSnapshotsBulk(
    payloads: Array<GitHubIdeaSnapshotJobPayload | IdeaSnapshotBulkEntry>,
    triggeredBy = 'backfill',
    parentJobId?: string,
  ): Promise<EnqueueResult[]> {
    if (!payloads.length) {
      return [];
    }
    const entries = payloads.map((payload) =>
      this.normalizeIdeaSnapshotBulkEntry(payload, triggeredBy, parentJobId),
    );
    await this.assertAnalysisPoolIntakeAllowed({
      source: 'analysis_snapshot',
      repositoryIds: entries.map((entry) => entry.payload.repositoryId),
    });
    const groupedEntries = new Map<
      QueueName,
      {
        jobName: QueueJobType;
        entries: IdeaSnapshotBulkEntry[];
      }
    >();

    for (const entry of entries) {
      const queueName =
        entry.payload.analysisLane === 'cold_tool'
          ? QUEUE_NAMES.ANALYSIS_SNAPSHOT_COLD
          : QUEUE_NAMES.ANALYSIS_SNAPSHOT;
      const jobName =
        entry.payload.analysisLane === 'cold_tool'
          ? QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT_COLD
          : QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT;
      const current = groupedEntries.get(queueName);
      if (current) {
        current.entries.push(entry);
        continue;
      }
      groupedEntries.set(queueName, {
        jobName,
        entries: [entry],
      });
    }

    const results: EnqueueResult[] = [];

    for (const [queueName, group] of groupedEntries.entries()) {
      const queue = this.getQueue(queueName);
      const options = group.entries.map((entry) => ({
        ...this.buildJobOptions(queueName),
        ...(entry.jobOptionsOverride ?? {}),
      }));

      const jobLogs = await this.startQueueJobsBulk(
        group.entries.map((entry, index) =>
          ({
            jobName: group.jobName,
            jobStatus: JobStatus.PENDING,
            queueName,
            payload: entry.payload,
            triggeredBy: entry.triggeredBy ?? triggeredBy,
            attempts: options[index].attempts ?? 1,
            retryCount: 0,
            parentJobId: entry.parentJobId ?? parentJobId,
            startedAt: null,
          }) as const,
        ),
      );

      let jobs;
      try {
        jobs = await queue.addBulk(
          jobLogs.map((jobLog, index) => ({
            name: group.jobName,
            data: {
              ...group.entries[index].payload,
              jobLogId: jobLog.id,
            },
            opts: options[index],
          })),
        );
      } catch (error) {
        await this.cancelQueueJobsBulk(jobLogs.map((jobLog) => jobLog.id), {
          errorMessage: 'Task cancelled because bulk queue add failed.',
          result: {
            bulkQueueAddFailed: true,
            queueName,
          },
        });
        throw error;
      }

      const attachInputs = jobs.map((job, index) => ({
        jobId: jobLogs[index].id,
        queueName,
        queueJobId: String(job.id),
        attempts: options[index].attempts ?? 1,
      }));

      try {
        await this.attachQueueJobsBulk(attachInputs);
      } catch {
        await Promise.all(
          attachInputs.map((input) => this.jobLogService.attachQueueJob(input)),
        );
      }

      results.push(
        ...jobs.map((job, index) => ({
          jobId: jobLogs[index].id,
          queueName,
          queueJobId: String(job.id),
          jobStatus: JobStatus.PENDING,
        })),
      );
    }

    return results;
  }

  async enqueueBatchAnalysis(
    dto: BatchRunAnalysisDto,
    triggeredBy = 'ui',
  ): Promise<EnqueueResult> {
    await this.assertAnalysisPoolIntakeAllowed({
      source: 'analysis_batch',
      repositoryIds: dto.repositoryIds ?? [],
    });
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
    await this.assertAnalysisPoolIntakeAllowed({
      source: 'fast_filter_batch',
      repositoryIds: dto.repositoryIds ?? [],
    });
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

  async getLatestActiveQueueJobLog(args: {
    queueName: QueueName;
    jobName: string;
  }): Promise<ActiveQueueJobLogSnapshot | null> {
    if (!this.prisma?.jobLog) {
      return null;
    }

    return (await this.prisma.jobLog.findFirst({
      where: {
        queueName: args.queueName,
        jobName: args.jobName,
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        queueName: true,
        queueJobId: true,
        jobStatus: true,
        progress: true,
        payload: true,
        result: true,
        createdAt: true,
        startedAt: true,
        updatedAt: true,
      },
    })) as ActiveQueueJobLogSnapshot | null;
  }

  async tryRemoveQueueJob(
    queueName: QueueName,
    queueJobId: string,
  ): Promise<{
    found: boolean;
    removed: boolean;
    state: string | null;
  }> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(queueJobId);

    if (!job) {
      return {
        found: false,
        removed: false,
        state: null,
      };
    }

    const state = await job.getState();

    if (!['waiting', 'delayed', 'prioritized'].includes(state)) {
      return {
        found: true,
        removed: false,
        state,
      };
    }

    await job.remove();

    return {
      found: true,
      removed: true,
      state,
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

    let job;
    try {
      job = await queue.add(
        jobName,
        {
          ...payload,
          jobLogId: jobLog.id,
        },
        options,
      );
    } catch (error) {
      await this.jobLogService.cancelJob({
        jobId: jobLog.id,
        errorMessage: 'Task cancelled because queue add failed.',
        result: {
          queueAddFailed: true,
          queueName,
        },
      });
      throw error;
    }

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
      case QUEUE_NAMES.ANALYSIS_SINGLE_COLD:
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

  private async findActiveSingleAnalysisJobLog(repositoryId: string) {
    if (!this.prisma?.jobLog) {
      return null;
    }

    return (await this.prisma.jobLog.findFirst({
      where: {
        queueName: {
          in: [QUEUE_NAMES.ANALYSIS_SINGLE, QUEUE_NAMES.ANALYSIS_SINGLE_COLD],
        },
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
        payload: {
          path: ['repositoryId'],
          equals: repositoryId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        queueName: true,
        queueJobId: true,
        jobStatus: true,
        payload: true,
        progress: true,
        updatedAt: true,
      },
    })) as ActiveSingleAnalysisJobLog | null;
  }

  private readPositiveIntEnv(value: string | undefined, fallback: number) {
    if (typeof value !== 'string') {
      return fallback;
    }

    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async findActiveSingleAnalysisJobLogs(repositoryIds: string[]) {
    const results = new Map<string, ActiveSingleAnalysisJobLog>();
    if (!this.prisma?.jobLog) {
      return results;
    }

    const uniqueRepositoryIds = [...new Set(repositoryIds.filter(Boolean))];
    if (!uniqueRepositoryIds.length) {
      return results;
    }

    const rows = (await this.prisma.jobLog.findMany({
      where: {
        queueName: {
          in: [QUEUE_NAMES.ANALYSIS_SINGLE, QUEUE_NAMES.ANALYSIS_SINGLE_COLD],
        },
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
        OR: uniqueRepositoryIds.map((repositoryId) => ({
          payload: {
            path: ['repositoryId'],
            equals: repositoryId,
          },
        })),
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        queueName: true,
        queueJobId: true,
        jobStatus: true,
        payload: true,
      },
    })) as ActiveSingleAnalysisJobLog[];

    for (const row of rows) {
      const payload = this.ensurePayload(row.payload);
      const repositoryId = String(payload.repositoryId ?? '').trim();
      if (!repositoryId || results.has(repositoryId)) {
        continue;
      }
      results.set(repositoryId, row);
    }

    return results;
  }

  private async findActiveQueueJobLog(args: {
    queueName: QueueName;
    jobName: string;
  }) {
    if (!this.prisma?.jobLog) {
      return null;
    }

    return (await this.prisma.jobLog.findFirst({
      where: {
        queueName: args.queueName,
        jobName: args.jobName,
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        queueName: true,
        queueJobId: true,
        jobStatus: true,
        payload: true,
        result: true,
        createdAt: true,
        startedAt: true,
        updatedAt: true,
        progress: true,
      },
    })) as ActiveSingleAnalysisJobLog | null;
  }

  private readColdToolRuntimeState(result: Prisma.JsonValue | null) {
    const resultRecord =
      result && typeof result === 'object' && !Array.isArray(result)
        ? this.ensurePayload(result)
        : {};
    const runtimeRecord =
      resultRecord.runtime && typeof resultRecord.runtime === 'object'
        ? this.ensurePayload(resultRecord.runtime as Prisma.JsonValue)
        : {};

    return {
      currentStage: this.toNullableString(runtimeRecord.currentStage),
      runtimeUpdatedAt: this.toNullableString(runtimeRecord.runtimeUpdatedAt),
    };
  }

  private getColdToolCollectorHeartbeatAgeMs(
    jobLog: ActiveSingleAnalysisJobLog,
    runtime: {
      currentStage: string | null;
      runtimeUpdatedAt: string | null;
    },
  ) {
    const runtimeHeartbeatAt = this.parseTimestamp(runtime.runtimeUpdatedAt);
    const persistedHeartbeatAt = jobLog.updatedAt?.getTime() ?? null;
    const referenceTime =
      runtimeHeartbeatAt && persistedHeartbeatAt
        ? Math.max(runtimeHeartbeatAt, persistedHeartbeatAt)
        : runtimeHeartbeatAt ??
          persistedHeartbeatAt ??
          jobLog.startedAt?.getTime() ??
          jobLog.createdAt?.getTime() ??
          null;

    if (!referenceTime) {
      return 0;
    }

    return Math.max(0, Date.now() - referenceTime);
  }

  private resolveColdToolCollectorEnqueueStaleMs() {
    const configuredMs = this.readPositiveIntEnv(
      process.env.COLD_TOOL_COLLECT_ENQUEUE_STALE_MS,
      120_000,
    );
    const runtimeHeartbeatMs = this.readPositiveIntEnv(
      process.env.QUEUE_RUNTIME_HEARTBEAT_MS,
      30_000,
    );
    const watchdogMinutes = this.readPositiveIntEnv(
      process.env.COLD_TOOL_STALE_RUNTIME_MINUTES,
      10,
    );

    return Math.max(
      configuredMs,
      runtimeHeartbeatMs * 6,
      watchdogMinutes * 60_000,
    );
  }

  private parseTimestamp(value: string | null) {
    if (!value) {
      return null;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toNullableString(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }

  private toExistingEnqueueResult(jobLog: ActiveSingleAnalysisJobLog): EnqueueResult {
    return {
      jobId: jobLog.id,
      queueName:
        (jobLog.queueName as QueueName | null) ?? QUEUE_NAMES.ANALYSIS_SINGLE,
      queueJobId: jobLog.queueJobId ?? jobLog.id,
      jobStatus: jobLog.jobStatus,
    };
  }

  private resolveSingleAnalysisQueue(dto: RunAnalysisDto) {
    if (dto.analysisLane === 'cold_tool') {
      return {
        queueName: QUEUE_NAMES.ANALYSIS_SINGLE_COLD,
        jobName: QUEUE_JOB_TYPES.ANALYSIS_SINGLE_COLD,
      } as const;
    }

    return {
      queueName: QUEUE_NAMES.ANALYSIS_SINGLE,
      jobName: QUEUE_JOB_TYPES.ANALYSIS_SINGLE,
    } as const;
  }

  private async enqueueSingleAnalysesBulkForQueue(
    queueName: QueueName,
    jobName: string,
    entries: SingleAnalysisBulkEntry[],
    triggeredBy: string,
  ) {
    const queue = this.getQueue(queueName);
    const normalizedEntries = await Promise.all(
      entries.map(async (entry) => {
        const skipPriorityLookup = this.shouldSkipAnalysisPriorityLookup(
          entry.jobOptionsOverride,
        );
        const priorityOptions = skipPriorityLookup
          ? {}
          : await this.buildAnalysisPriorityOptions(entry.repositoryId, entry.dto);

        return {
          entry,
          payload: {
            repositoryId: entry.repositoryId,
            dto: entry.dto,
            ...(entry.metadata ?? {}),
          },
          options: {
            ...this.buildJobOptions(queueName),
            ...priorityOptions,
            ...(entry.jobOptionsOverride ?? {}),
          },
          behaviorPriorityApplied: skipPriorityLookup
            ? this.hasBehaviorPriorityBoost(entry.dto)
            : typeof priorityOptions.priority === 'number',
        };
      }),
    );

    await this.recordQueueInfluencesBulk(
      normalizedEntries.map((entry) => entry.behaviorPriorityApplied),
    );

    const jobLogs = await this.startQueueJobsBulk(
      normalizedEntries.map(({ entry, payload, options }) => ({
        jobName,
        jobStatus: JobStatus.PENDING,
        queueName,
        payload,
        triggeredBy: entry.triggeredBy ?? triggeredBy,
        attempts: options.attempts ?? 1,
        retryCount: 0,
        parentJobId: entry.parentJobId,
        startedAt: null,
      })),
    );

    let jobs;
    try {
      jobs = await queue.addBulk(
        normalizedEntries.map(({ payload, options }, index) => ({
          name: jobName,
          data: {
            ...payload,
            jobLogId: jobLogs[index].id,
          },
          opts: options,
        })),
      );
    } catch (error) {
      await this.cancelQueueJobsBulk(jobLogs.map((jobLog) => jobLog.id), {
        errorMessage: 'Task cancelled because bulk queue add failed.',
        result: {
          bulkQueueAddFailed: true,
          queueName,
        },
      });
      throw error;
    }

    const attachInputs = jobs.map((job, index) => ({
      jobId: jobLogs[index].id,
      queueName,
      queueJobId: String(job.id),
      attempts: normalizedEntries[index].options.attempts ?? 1,
    }));

    try {
      await this.attachQueueJobsBulk(attachInputs);
    } catch {
      await Promise.all(
        attachInputs.map((input) => this.jobLogService.attachQueueJob(input)),
      );
    }

    return jobs.map((job, index) => ({
      repositoryId: entries[index].repositoryId,
      enqueueResult: {
        jobId: jobLogs[index].id,
        queueName,
        queueJobId: String(job.id),
        jobStatus: JobStatus.PENDING,
      } as EnqueueResult,
    }));
  }

  private normalizeIdeaSnapshotBulkEntry(
    entry: GitHubIdeaSnapshotJobPayload | IdeaSnapshotBulkEntry,
    triggeredBy: string,
    parentJobId?: string,
  ): IdeaSnapshotBulkEntry {
    if (this.isIdeaSnapshotBulkEntry(entry)) {
      return entry;
    }

    return {
      payload: entry,
      triggeredBy,
      parentJobId,
    };
  }

  private isIdeaSnapshotBulkEntry(
    value: GitHubIdeaSnapshotJobPayload | IdeaSnapshotBulkEntry,
  ): value is IdeaSnapshotBulkEntry {
    return (
      typeof value === 'object' &&
      value !== null &&
      'payload' in value &&
      typeof value.payload === 'object' &&
      value.payload !== null
    );
  }

  private async startQueueJobsBulk(
    inputs: Parameters<JobLogService['startJobsBulk']>[0],
  ) {
    if (typeof this.jobLogService.startJobsBulk === 'function') {
      return this.jobLogService.startJobsBulk(inputs);
    }

    return Promise.all(inputs.map((input) => this.jobLogService.startJob(input)));
  }

  private async attachQueueJobsBulk(
    inputs: Parameters<JobLogService['attachQueueJobsBulk']>[0],
  ) {
    if (typeof this.jobLogService.attachQueueJobsBulk === 'function') {
      return this.jobLogService.attachQueueJobsBulk(inputs);
    }

    return Promise.all(
      inputs.map((input) => this.jobLogService.attachQueueJob(input)),
    );
  }

  private async recordQueueInfluencesBulk(appliedFlags: boolean[]) {
    if (!appliedFlags.length) {
      return;
    }

    const behaviorMemoryService = this.behaviorMemoryService as BehaviorMemoryService & {
      recordQueueInfluenceBulk?: (flags: boolean[]) => Promise<unknown>;
    };

    if (typeof behaviorMemoryService.recordQueueInfluenceBulk === 'function') {
      await behaviorMemoryService.recordQueueInfluenceBulk(appliedFlags);
      return;
    }

    await Promise.all(
      appliedFlags.map((applied) =>
        this.behaviorMemoryService.recordQueueInfluence(applied),
      ),
    );
  }

  private async cancelQueueJobsBulk(
    jobIds: string[],
    args: {
      errorMessage: string;
      result?: Record<string, unknown>;
    },
  ) {
    if (!jobIds.length) {
      return;
    }

    if (typeof this.jobLogService.cancelJobsBulk === 'function') {
      await this.jobLogService.cancelJobsBulk({
        jobIds,
        errorMessage: args.errorMessage,
        result: args.result,
      });
      return;
    }

    await Promise.all(
      jobIds.map((jobId) =>
        this.jobLogService.cancelJob({
          jobId,
          errorMessage: args.errorMessage,
          result: args.result,
        }),
      ),
    );
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

  private shouldSkipAnalysisPriorityLookup(jobOptionsOverride?: JobsOptions) {
    return (
      typeof jobOptionsOverride?.priority === 'number' &&
      Number.isFinite(jobOptionsOverride.priority)
    );
  }

  private hasBehaviorPriorityBoost(dto: RunAnalysisDto) {
    return (
      typeof dto.userPreferencePriorityBoost === 'number' &&
      Number.isFinite(dto.userPreferencePriorityBoost) &&
      dto.userPreferencePriorityBoost !== 0
    );
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

  private assertGitHubIntakeEnabled(args: {
    source:
      | 'github_fetch'
      | 'github_created_backfill'
      | 'github_cold_tool_collect';
  }) {
    if (this.readGitHubNewRepositoryIntakeEnabled()) {
      return;
    }

    throw new BadRequestException(
      `GitHub intake is disabled for ${args.source}. Current mode is frozen stock cleanup / historical repair only, so new repositories cannot enter the system.`,
    );
  }

  private readGitHubNewRepositoryIntakeEnabled() {
    return readGitHubNewRepositoryIntakeEnabledFromEnv();
  }

  private async assertAnalysisPoolIntakeAllowed(args: {
    source:
      | 'github_fetch'
      | 'github_created_backfill'
      | 'analysis_single'
      | 'analysis_snapshot'
      | 'analysis_batch'
      | 'fast_filter_batch';
    repositoryIds?: string[];
  }) {
    if (typeof this.prisma?.systemConfig?.findUnique !== 'function') {
      return;
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
      source: args.source,
      repositoryIds: args.repositoryIds,
    });

    if (
      gate.decision === 'suppress_new_entry' ||
      gate.decision === 'suppress_unscoped_batch'
    ) {
      const blockedSuffix = gate.blockedRepositoryIds.length
        ? ` blocked=${gate.blockedRepositoryIds.slice(0, 10).join(', ')}`
        : '';
      throw new BadRequestException(`${gate.reason}${blockedSuffix}`);
    }
  }

  private ensurePayload(payload: unknown): QueueJobPayload {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new BadRequestException('This job payload cannot be retried safely.');
    }

    return payload as QueueJobPayload;
  }
}
