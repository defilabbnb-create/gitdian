import { Injectable } from '@nestjs/common';
import { execSync } from 'node:child_process';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GitHubRadarService } from '../github/github-radar.service';
import { QueueService } from '../queue/queue.service';
import { QUEUE_NAMES } from '../queue/queue.constants';

const SYSTEM_WARNINGS_CONFIG_KEY = 'system.warnings.latest';

export type SystemWarningsPayload = {
  generatedAt: string;
  warnings: Array<{
    code: string;
    level: 'warning' | 'critical';
    message: string;
  }>;
  radar: {
    mode: string;
    isRunning: boolean;
    schedulerEnabled: boolean;
    schedulerReason: string | null;
    bootstrapCursorDate: string;
    pendingWindow:
      | {
          startDate: string;
          endDate: string;
          strategy: string;
        }
      | null;
    snapshotQueueSize: number;
    deepQueueSize: number;
    pendingBackfillJobs: number;
    currentSearchWindow:
      | {
          label: string | null;
          searchWindowStart: string | null;
          searchWindowEnd: string | null;
        }
      | null;
    currentWindowTotalCount: number | null;
    recentRetryCount: number;
    recentRateLimitHits: number;
    currentSearchConcurrency: number;
    targetSearchConcurrency: number;
    adjustmentReason: string | null;
    activeKeywordGroups: string[];
    keywordModeEnabled: boolean;
    keywordGroupStats: unknown[];
  };
  tokenPoolHealth: {
    hasTokenPool: boolean;
    tokenPoolSize: number;
    usingMultiToken: boolean;
    anonymousFallback: boolean;
    cooldownTokenCount: number;
    disabledTokenCount: number;
    lastKnownRateLimitStatus: unknown;
  };
  maintenance: {
    lastMaintenanceAt: string | null;
    lastLogRotationAt: string | null;
    lastCleanupAt: string | null;
    lastSummarySyncAt: string | null;
    latestSummaryDate: string | null;
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
};

export type SystemVersionPayload = {
  generatedAt: string;
  runtime: {
    gitSha: string;
    environment: string;
    bootedAt: string;
    worktreeDirty: boolean;
  };
};

export type SystemColdRuntimePayload = {
  generatedAt: string;
  runtime: SystemVersionPayload['runtime'];
  collector: {
    currentRunId: string | null;
    currentJobId: string | null;
    currentStatus: string | null;
    currentProgress: number | null;
    currentStage: string | null;
    lastHeartbeatAt: string | null;
    lastSuccessJobId: string | null;
    lastSuccessRunId: string | null;
    lastSuccessAt: string | null;
    lastFailureJobId: string | null;
    lastFailureRunId: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
    heartbeatAgeSeconds: number | null;
    heartbeatState: 'healthy' | 'stale' | 'idle' | 'missing';
    recentPhaseJobs: Array<{
      runId: string | null;
      jobId: string;
      status: string;
      phase: string | null;
      progress: number | null;
      createdAt: string;
      updatedAt: string;
      finishedAt: string | null;
    }>;
  };
  coldDeepQueue: {
    active: number;
    queued: number;
    newestQueuedAt: string | null;
    latestCompletedAt: string | null;
    latestCompletedJobId: string | null;
    newestQueuedAgeSeconds: number | null;
    queueState: 'healthy' | 'stalled' | 'idle';
  };
  warnings: string[];
};

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitHubRadarService: GitHubRadarService,
    private readonly queueService: QueueService,
  ) {}

  async getWarnings(): Promise<SystemWarningsPayload> {
    const status = await this.gitHubRadarService.getStatus();

    const payload: SystemWarningsPayload = {
      generatedAt: new Date().toISOString(),
      warnings: status.warnings,
      radar: {
        mode: status.mode,
        isRunning: status.isRunning,
        schedulerEnabled: status.schedulerEnabled,
        schedulerReason: status.schedulerReason,
        bootstrapCursorDate: status.bootstrapCursorDate,
        pendingWindow: status.pendingWindow
          ? {
              startDate: status.pendingWindow.startDate,
              endDate: status.pendingWindow.endDate,
              strategy: status.pendingWindow.strategy,
            }
          : null,
        snapshotQueueSize: status.snapshotQueueSize,
        deepQueueSize: status.deepQueueSize,
        pendingBackfillJobs: status.pendingBackfillJobs,
        currentSearchWindow: status.currentSearchWindow,
        currentWindowTotalCount: status.currentWindowTotalCount,
        recentRetryCount: status.recentRetryCount,
        recentRateLimitHits: status.recentRateLimitHits,
        currentSearchConcurrency: status.currentSearchConcurrency,
        targetSearchConcurrency: status.targetSearchConcurrency,
        adjustmentReason: status.adjustmentReason,
        activeKeywordGroups: status.activeKeywordGroups,
        keywordModeEnabled: status.keywordModeEnabled,
        keywordGroupStats: status.keywordGroupStats,
      },
      tokenPoolHealth: status.tokenPoolHealth,
      maintenance: {
        lastMaintenanceAt: status.maintenance.lastMaintenanceAt,
        lastLogRotationAt: status.maintenance.lastLogRotationAt,
        lastCleanupAt: status.maintenance.lastCleanupAt,
        lastSummarySyncAt: status.maintenance.lastSummarySyncAt,
        latestSummaryDate: status.maintenance.latestSummaryDate,
        timeoutStats: status.maintenance.timeoutStats,
        deepRuntimeStats: status.maintenance.deepRuntimeStats,
      },
    };

    await this.prisma.systemConfig.upsert({
      where: {
        configKey: SYSTEM_WARNINGS_CONFIG_KEY,
      },
      update: {
        configValue: this.toJsonValue(payload),
      },
      create: {
        configKey: SYSTEM_WARNINGS_CONFIG_KEY,
        configValue: this.toJsonValue(payload),
      },
    });

    return payload;
  }

  getVersion(): SystemVersionPayload {
    return {
      generatedAt: new Date().toISOString(),
      runtime: {
        gitSha: this.readBuildValue(
          process.env.GITDIAN_GIT_SHA,
          this.readRuntimeGitSha(),
        ),
        environment: this.readBuildValue(
          process.env.NODE_ENV,
          'unknown environment',
        ),
        bootedAt: this.readBuildValue(
          process.env.GITDIAN_RUNTIME_BOOTED_AT,
          'unknown boot time',
        ),
        worktreeDirty:
          this.readBuildValue(process.env.GITDIAN_WORKTREE_DIRTY, '') === 'true' ||
          this.readRuntimeDirtyFlag(),
      },
    };
  }

  async getColdRuntime(): Promise<SystemColdRuntimePayload> {
    const [collectorJobs, coldDeepQueueDepth, latestQueuedColdDeep, latestCompletedColdDeep] =
      await Promise.all([
        this.prisma.jobLog.findMany({
          where: {
            jobName: 'github.collect_cold_tools',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
          select: {
            id: true,
            jobStatus: true,
            progress: true,
            createdAt: true,
            updatedAt: true,
            finishedAt: true,
            errorMessage: true,
            payload: true,
            result: true,
          },
        }),
        this.queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SINGLE_COLD),
        this.prisma.jobLog.findFirst({
          where: {
            queueName: QUEUE_NAMES.ANALYSIS_SINGLE_COLD,
            jobStatus: {
              in: ['PENDING', 'RUNNING'],
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          select: {
            id: true,
            updatedAt: true,
          },
        }),
        this.prisma.jobLog.findFirst({
          where: {
            queueName: QUEUE_NAMES.ANALYSIS_SINGLE_COLD,
            jobStatus: 'SUCCESS',
          },
          orderBy: {
            finishedAt: 'desc',
          },
          select: {
            id: true,
            finishedAt: true,
          },
        }),
      ]);

    const currentCollector =
      collectorJobs.find((job) => job.jobStatus === 'RUNNING') ??
      collectorJobs.find((job) => job.jobStatus === 'PENDING') ??
      null;
    const lastSuccessCollector =
      collectorJobs.find((job) => job.jobStatus === 'SUCCESS') ?? null;
    const lastFailedCollector =
      collectorJobs.find((job) => job.jobStatus === 'FAILED') ?? null;
    const runtime =
      currentCollector?.result &&
      typeof currentCollector.result === 'object' &&
      !Array.isArray(currentCollector.result) &&
      currentCollector.result.runtime &&
      typeof currentCollector.result.runtime === 'object' &&
      !Array.isArray(currentCollector.result.runtime)
        ? (currentCollector.result.runtime as Record<string, unknown>)
        : null;
    const heartbeatAt =
      typeof runtime?.runtimeUpdatedAt === 'string'
        ? runtime.runtimeUpdatedAt
        : currentCollector?.updatedAt?.toISOString() ?? null;
    const heartbeatAgeSeconds = this.toAgeSeconds(heartbeatAt);
    const heartbeatState = this.resolveCollectorHeartbeatState({
      jobStatus: currentCollector?.jobStatus ?? null,
      heartbeatAgeSeconds,
    });
    const newestQueuedAt = latestQueuedColdDeep?.updatedAt?.toISOString() ?? null;
    const newestQueuedAgeSeconds = this.toAgeSeconds(newestQueuedAt);
    const queuedCount =
      coldDeepQueueDepth.waiting +
      coldDeepQueueDepth.delayed +
      coldDeepQueueDepth.prioritized;
    const coldDeepQueueState = this.resolveColdDeepQueueState({
      active: coldDeepQueueDepth.active,
      queued: queuedCount,
      newestQueuedAgeSeconds,
    });
    const warnings: string[] = [];
    const currentCollectorPayload =
      currentCollector?.result &&
      typeof currentCollector.result === 'object' &&
      !Array.isArray(currentCollector.result)
        ? (currentCollector.result as Record<string, unknown>)
        : null;
    const lastSuccessPayload =
      lastSuccessCollector?.result &&
      typeof lastSuccessCollector.result === 'object' &&
      !Array.isArray(lastSuccessCollector.result)
        ? (lastSuccessCollector.result as Record<string, unknown>)
        : null;
    const lastFailurePayload =
      lastFailedCollector?.result &&
      typeof lastFailedCollector.result === 'object' &&
      !Array.isArray(lastFailedCollector.result)
        ? (lastFailedCollector.result as Record<string, unknown>)
        : null;
    const recentPhaseJobs = collectorJobs.map((job) => {
      const payload =
        job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
          ? (job.payload as Record<string, unknown>)
          : null;
      const resultPayload =
        job.result && typeof job.result === 'object' && !Array.isArray(job.result)
          ? (job.result as Record<string, unknown>)
          : null;

      return {
        runId:
          this.readPayloadRunId(resultPayload) ?? this.readPayloadRunId(payload),
        jobId: job.id,
        status: job.jobStatus,
        phase: this.readPayloadPhase(payload),
        progress: typeof job.progress === 'number' ? job.progress : null,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        finishedAt: job.finishedAt?.toISOString() ?? null,
      };
    });

    if (heartbeatState === 'stale') {
      warnings.push(
        `冷门采集心跳已超过 ${heartbeatAgeSeconds ?? '?'} 秒未更新，watchdog 应该接手恢复。`,
      );
    } else if (heartbeatState === 'missing') {
      warnings.push('冷门采集正在运行，但还没有写入有效运行心跳。');
    }

    if (coldDeepQueueState === 'stalled') {
      warnings.push(
        `冷门深分析队列堆积 ${queuedCount} 个，最近排队项已等待 ${newestQueuedAgeSeconds ?? '?'} 秒。`,
      );
    }

    if (lastFailedCollector?.errorMessage) {
      warnings.push(`最近一次冷门采集失败：${lastFailedCollector.errorMessage}`);
    }

    return {
      generatedAt: new Date().toISOString(),
      runtime: this.getVersion().runtime,
      collector: {
        currentRunId:
          this.readPayloadRunId(currentCollectorPayload) ??
          this.readPayloadRunId(
            currentCollector?.payload &&
              typeof currentCollector.payload === 'object' &&
              !Array.isArray(currentCollector.payload)
              ? (currentCollector.payload as Record<string, unknown>)
              : null,
          ),
        currentJobId: currentCollector?.id ?? null,
        currentStatus: currentCollector?.jobStatus ?? null,
        currentProgress:
          typeof currentCollector?.progress === 'number'
            ? currentCollector.progress
            : null,
        currentStage:
          typeof runtime?.currentStage === 'string' ? runtime.currentStage : null,
        lastHeartbeatAt:
          heartbeatAt,
        lastSuccessJobId: lastSuccessCollector?.id ?? null,
        lastSuccessRunId:
          this.readPayloadRunId(lastSuccessPayload) ??
          this.readPayloadRunId(
            lastSuccessCollector?.payload &&
              typeof lastSuccessCollector.payload === 'object' &&
              !Array.isArray(lastSuccessCollector.payload)
              ? (lastSuccessCollector.payload as Record<string, unknown>)
              : null,
          ),
        lastSuccessAt: lastSuccessCollector?.finishedAt?.toISOString() ?? null,
        lastFailureJobId: lastFailedCollector?.id ?? null,
        lastFailureRunId:
          this.readPayloadRunId(lastFailurePayload) ??
          this.readPayloadRunId(
            lastFailedCollector?.payload &&
              typeof lastFailedCollector.payload === 'object' &&
              !Array.isArray(lastFailedCollector.payload)
              ? (lastFailedCollector.payload as Record<string, unknown>)
              : null,
          ),
        lastFailureAt: lastFailedCollector?.updatedAt?.toISOString() ?? null,
        lastFailureReason: lastFailedCollector?.errorMessage ?? null,
        heartbeatAgeSeconds,
        heartbeatState,
        recentPhaseJobs,
      },
      coldDeepQueue: {
        active: coldDeepQueueDepth.active,
        queued: queuedCount,
        newestQueuedAt,
        latestCompletedAt: latestCompletedColdDeep?.finishedAt?.toISOString() ?? null,
        latestCompletedJobId: latestCompletedColdDeep?.id ?? null,
        newestQueuedAgeSeconds,
        queueState: coldDeepQueueState,
      },
      warnings,
    };
  }

  private readBuildValue(value: string | undefined, fallback: string) {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : fallback;
  }

  private toAgeSeconds(value: string | null) {
    if (!value) {
      return null;
    }

    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return null;
    }

    return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  }

  private resolveCollectorHeartbeatState(input: {
    jobStatus: string | null;
    heartbeatAgeSeconds: number | null;
  }): 'healthy' | 'stale' | 'idle' | 'missing' {
    if (input.jobStatus !== 'RUNNING') {
      return 'idle';
    }

    if (input.heartbeatAgeSeconds === null) {
      return 'missing';
    }

    return input.heartbeatAgeSeconds > this.resolveColdToolStaleSeconds()
      ? 'stale'
      : 'healthy';
  }

  private resolveColdDeepQueueState(input: {
    active: number;
    queued: number;
    newestQueuedAgeSeconds: number | null;
  }): 'healthy' | 'stalled' | 'idle' {
    if (input.active <= 0 && input.queued <= 0) {
      return 'idle';
    }

    if (input.active > 0) {
      return 'healthy';
    }

    if (
      input.queued > 0 &&
      input.newestQueuedAgeSeconds !== null &&
      input.newestQueuedAgeSeconds > this.resolveAnalysisSingleStaleSeconds()
    ) {
      return 'stalled';
    }

    return 'healthy';
  }

  private resolveColdToolStaleSeconds() {
    const staleMinutes = this.readPositiveIntegerEnv(
      process.env.COLD_TOOL_STALE_RUNTIME_MINUTES,
      10,
    );
    const queueHeartbeatMs = this.readPositiveIntegerEnv(
      process.env.QUEUE_JOB_HEARTBEAT_MS,
      15_000,
    );
    const watchdogIntervalMs = this.readPositiveIntegerEnv(
      process.env.COLD_TOOL_WATCHDOG_INTERVAL_MS,
      60_000,
    );

    return Math.max(
      staleMinutes * 60,
      Math.ceil((queueHeartbeatMs * 20) / 1000),
      Math.ceil((watchdogIntervalMs * 2) / 1000),
    );
  }

  private resolveAnalysisSingleStaleSeconds() {
    return (
      this.readPositiveIntegerEnv(process.env.ANALYSIS_SINGLE_STALE_MINUTES, 30) *
      60
    );
  }

  private readPositiveIntegerEnv(value: string | undefined, fallback: number) {
    if (typeof value !== 'string') {
      return fallback;
    }

    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private readPayloadRunId(payload: Record<string, unknown> | null) {
    if (!payload) {
      return null;
    }

    const runtime = payload.runtime;
    if (runtime && typeof runtime === 'object' && !Array.isArray(runtime)) {
      const runId = (runtime as Record<string, unknown>).runId;
      if (typeof runId === 'string' && runId.trim().length > 0) {
        return runId.trim();
      }
    }

    const dto = payload.dto;
    if (dto && typeof dto === 'object' && !Array.isArray(dto)) {
      const runId = (dto as Record<string, unknown>).runId;
      if (typeof runId === 'string' && runId.trim().length > 0) {
        return runId.trim();
      }
    }

    const runId = payload.runId;
    if (typeof runId === 'string' && runId.trim().length > 0) {
      return runId.trim();
    }

    return null;
  }

  private readPayloadPhase(payload: Record<string, unknown> | null) {
    if (!payload) {
      return null;
    }

    const dto = payload.dto;
    if (dto && typeof dto === 'object' && !Array.isArray(dto)) {
      const phase = (dto as Record<string, unknown>).phase;
      if (typeof phase === 'string' && phase.trim().length > 0) {
        return phase.trim();
      }
    }

    return null;
  }

  private readRuntimeGitSha() {
    try {
      return execSync('git rev-parse --short=12 HEAD', {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
      }).trim();
    } catch {
      return 'unknown';
    }
  }

  private readRuntimeDirtyFlag() {
    try {
      const output = execSync('git status --porcelain', {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
      }).trim();
      return output.length > 0;
    } catch {
      return false;
    }
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
