import { Injectable, Logger } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RadarDailySummaryService } from './radar-daily-summary.service';

type MaintenanceState = {
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
};

type DeepRuntimeStatsState = {
  date: string;
  deepEnteredCount: number;
  deepSkippedCount: number;
  ideaExtractExecutedCount: number;
  ideaExtractSkippedCount: number;
  ideaExtractDeferredCount: number;
  ideaExtractTimeoutCount: number;
  lastIdeaExtractInflight: number;
  ideaExtractMaxInflight: number;
  updatedAt: string | null;
};

type RadarWarning = {
  code: string;
  level: 'warning' | 'critical';
  message: string;
};

const MAINTENANCE_STATE_CONFIG_KEY = 'github.radar.maintenance.state';
const DEEP_RUNTIME_STATS_CONFIG_KEY = 'analysis.deep.runtime_stats';

@Injectable()
export class RadarOperationsService {
  private readonly logger = new Logger(RadarOperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly radarDailySummaryService: RadarDailySummaryService,
  ) {}

  async getMaintenanceState() {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: MAINTENANCE_STATE_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object' || Array.isArray(row.configValue)) {
      return this.emptyMaintenanceState();
    }

    const value = row.configValue as Record<string, unknown>;

    return {
      lastMaintenanceAt: this.toNullableString(value.lastMaintenanceAt),
      lastLogRotationAt: this.toNullableString(value.lastLogRotationAt),
      lastCleanupAt: this.toNullableString(value.lastCleanupAt),
      lastSummarySyncAt: this.toNullableString(value.lastSummarySyncAt),
      latestSummaryDate: this.toNullableString(value.latestSummaryDate),
      lastLogRotation: this.readRotationState(value.lastLogRotation),
      lastCleanup: this.readCleanupState(value.lastCleanup),
    } satisfies MaintenanceState;
  }

  async runMaintenanceCycle() {
    const state = await this.getMaintenanceState();
    const now = new Date().toISOString();
    const [logRotation, cleanup, latestSummary] = await Promise.all([
      this.rotateLaunchdLogs(),
      this.cleanupRetentionData(),
      this.radarDailySummaryService.getLatestSummary(),
    ]);
    const nextState: MaintenanceState = {
      lastMaintenanceAt: now,
      lastLogRotationAt: now,
      lastCleanupAt: now,
      lastSummarySyncAt: now,
      latestSummaryDate: latestSummary?.date ?? state.latestSummaryDate,
      lastLogRotation: logRotation,
      lastCleanup: cleanup,
    };

    await this.saveMaintenanceState(nextState);
    return nextState;
  }

  async getWarnings(args: {
    isRunning: boolean;
    pendingWindowScheduledAt: string | null;
    schedulerReason: string | null;
    snapshotQueueSize: number;
    deepQueueSize: number;
    tokenPoolHealth: {
      hasTokenPool: boolean;
      tokenPoolSize: number;
      anonymousFallback: boolean;
      cooldownTokenCount: number;
      disabledTokenCount: number;
      lastKnownRateLimitStatus: {
        limited: boolean;
      } | null;
    };
    currentSearchConcurrency: number;
    targetSearchConcurrency: number;
    adjustmentReason: string | null;
    recentRetryCount: number;
    recentRateLimitHits: number;
    keywordModeEnabled: boolean;
    activeKeywordGroups: string[];
    keywordGroupStats: Array<{
      group: string;
      fetchedCount: number;
      snapshotPromisingCount: number;
      goodIdeasCount: number;
      cloneIdeasCount: number;
    }>;
    staleThresholdMs: number;
  }) {
    const warnings: RadarWarning[] = [];
    const maintenanceState = await this.getMaintenanceState();
    const timeoutStats = await this.getRecentTimeoutStats();
    const deepRuntimeStats = await this.getDeepRuntimeStats();
    const now = Date.now();

    if (
      !args.tokenPoolHealth.hasTokenPool ||
      args.tokenPoolHealth.tokenPoolSize === 0 ||
      args.tokenPoolHealth.anonymousFallback
    ) {
      warnings.push({
        code: 'github_token_pool_unhealthy',
        level: 'critical',
        message: 'GitHub token pool 当前不健康，系统正退回到匿名或弱配置模式，长期运行稳定性会明显下降。',
      });
    } else if (
      args.tokenPoolHealth.disabledTokenCount > 0 ||
      args.tokenPoolHealth.cooldownTokenCount > 0 ||
      args.tokenPoolHealth.lastKnownRateLimitStatus?.limited
    ) {
      warnings.push({
        code: 'github_rate_limit_pressure',
        level: 'warning',
        message: 'GitHub 抓取层当前存在 cooldown、disabled token 或 rate limit 压力，补给节奏会自动变保守。',
      });
    }

    if (
      args.isRunning &&
      args.pendingWindowScheduledAt &&
      now - new Date(args.pendingWindowScheduledAt).getTime() >
        args.staleThresholdMs / 2
    ) {
      warnings.push({
        code: 'radar_progress_slow',
        level: 'warning',
        message: '当前 backfill window 推进偏慢，系统大概率正在做 GitHub Search 切片或等待 stalled/retry 恢复。',
      });
    }

    if (
      args.isRunning &&
      args.snapshotQueueSize === 0 &&
      args.deepQueueSize === 0 &&
      args.schedulerReason !== 'paused'
    ) {
      warnings.push({
        code: 'queues_idle',
        level: 'warning',
        message: 'snapshot 和 deep 队列当前都处于低活跃状态，系统可能主要耗在 GitHub 搜索层而不是 AI 层。',
      });
    }

    if (args.isRunning && args.snapshotQueueSize === 0) {
      warnings.push({
        code: 'snapshot_queue_starving',
        level: 'warning',
        message: 'snapshot 队列当前接近空转，AI 入口层供给偏弱，建议观察 created backfill 和关键词供给是否正常推进。',
      });
    }

    if (args.isRunning && args.deepQueueSize === 0 && args.snapshotQueueSize > 0) {
      warnings.push({
        code: 'deep_queue_starving',
        level: 'warning',
        message: 'deep analysis 队列当前偏空，说明 promising 候选不足或深读派生节奏偏慢。',
      });
    }

    if (
      args.currentSearchConcurrency < args.targetSearchConcurrency ||
      args.adjustmentReason?.includes('backoff')
    ) {
      warnings.push({
        code: 'github_aggressive_backoff_active',
        level: 'warning',
        message: `GitHub 搜索并发当前处于保守档位（current=${args.currentSearchConcurrency}, target=${args.targetSearchConcurrency}），系统正在主动回避 rate limit 压力。`,
      });
    }

    if (
      args.keywordModeEnabled &&
      args.snapshotQueueSize === 0 &&
      args.activeKeywordGroups.length === 0 &&
      args.keywordGroupStats.every(
        (group) =>
          group.snapshotPromisingCount === 0 &&
          group.goodIdeasCount === 0 &&
          group.cloneIdeasCount === 0,
      )
    ) {
      warnings.push({
        code: 'keyword_supply_too_low',
        level: 'warning',
        message: '关键词供给层当前产出偏低，系统仍主要依赖 created 主线补给。',
      });
    }

    if (
      timeoutStats.snapshotTimeouts >= 3 ||
      timeoutStats.deepTimeouts >= 3 ||
      timeoutStats.ideaExtractTimeouts >= 2
    ) {
      warnings.push({
        code: 'omlx_timeouts_rising',
        level:
          timeoutStats.deepTimeouts >= 3 || timeoutStats.ideaExtractTimeouts >= 2
            ? 'critical'
            : 'warning',
        message: `最近 1 小时 OMLX timeout 偏高（snapshot=${timeoutStats.snapshotTimeouts}, deep=${timeoutStats.deepTimeouts}, extract=${timeoutStats.ideaExtractTimeouts}），建议观察并发和 timeout 配置。`,
      });
    }

    if (
      args.isRunning &&
      maintenanceState.latestSummaryDate !== this.toDateKey(new Date())
    ) {
      warnings.push({
        code: 'daily_summary_missing',
        level: 'warning',
        message: '今天的 Daily Summary 还没有自动沉淀完成，建议检查 backfill / snapshot / deep 是否仍在推进。',
      });
    }

    return {
      warnings,
      maintenanceState,
      timeoutStats,
      deepRuntimeStats: {
        ...deepRuntimeStats,
        ideaExtractExecutionRate:
          deepRuntimeStats.deepEnteredCount > 0
            ? Number(
                (
                  deepRuntimeStats.ideaExtractExecutedCount /
                  deepRuntimeStats.deepEnteredCount
                ).toFixed(3),
              )
            : 0,
      },
    };
  }

  private async rotateLaunchdLogs() {
    const logDir = path.join(
      process.env.HOME ?? '/Users/v188',
      'Library',
      'Logs',
      'gitdian',
    );
    const maxBytes = this.readInt('LOG_ROTATE_MAX_BYTES', 20 * 1024 * 1024);
    const keepFiles = this.readInt('LOG_ROTATE_KEEP_FILES', 14);
    const filenames = [
      'api.stdout.log',
      'api.stderr.log',
      'worker.stdout.log',
      'worker.stderr.log',
      'web.stdout.log',
      'web.stderr.log',
    ];
    let rotatedFiles = 0;
    let deletedFiles = 0;

    await fs.mkdir(logDir, { recursive: true });

    for (const filename of filenames) {
      const filePath = path.join(logDir, filename);
      let stats;

      try {
        stats = await fs.stat(filePath);
      } catch {
        continue;
      }

      if (!stats.isFile() || stats.size <= 0) {
        continue;
      }

      const shouldRotate =
        stats.size >= maxBytes || this.toDateKey(stats.mtime) !== this.toDateKey(new Date());

      if (shouldRotate) {
        const rotatedName = this.buildRotatedLogFilename(filename, new Date());
        const rotatedPath = path.join(logDir, rotatedName);
        await fs.copyFile(filePath, rotatedPath);
        await fs.truncate(filePath, 0);
        rotatedFiles += 1;
      }

      deletedFiles += await this.trimRotatedLogs(logDir, filename, keepFiles);
    }

    if (rotatedFiles > 0 || deletedFiles > 0) {
      this.logger.log(
        `Runtime log rotation completed. rotatedFiles=${rotatedFiles} deletedFiles=${deletedFiles}`,
      );
    }

    return {
      rotatedFiles,
      deletedFiles,
    };
  }

  private async cleanupRetentionData() {
    const failedRetentionDays = this.readInt('FAILED_JOBLOG_RETENTION_DAYS', 14);
    const successRetentionDays = this.readInt('SUCCESS_JOBLOG_RETENTION_DAYS', 45);
    const rawResponseRetentionDays = this.readInt(
      'ANALYSIS_RAW_RESPONSE_RETENTION_DAYS',
      14,
    );
    const failedCutoff = this.addDays(new Date(), -failedRetentionDays);
    const successCutoff = this.addDays(new Date(), -successRetentionDays);
    const rawResponseCutoff = this.addDays(new Date(), -rawResponseRetentionDays);

    const [failedDeletion, successDeletion, clearedRawResponses] =
      await this.prisma.$transaction([
        this.prisma.jobLog.deleteMany({
          where: {
            jobStatus: JobStatus.FAILED,
            finishedAt: {
              lt: failedCutoff,
            },
          },
        }),
        this.prisma.jobLog.deleteMany({
          where: {
            jobStatus: JobStatus.SUCCESS,
            finishedAt: {
              lt: successCutoff,
            },
            jobName: {
              in: [
                'github.fetch_repositories',
                'github.backfill_created_repositories',
                'analysis.idea_snapshot',
                'analysis.run_single',
                'github.radar.scheduler',
              ],
            },
          },
        }),
        this.prisma.$executeRaw`UPDATE "RepositoryAnalysis" SET "rawResponse" = NULL WHERE "rawResponse" IS NOT NULL AND "updatedAt" < ${rawResponseCutoff}`,
      ]);

    if (
      failedDeletion.count > 0 ||
      successDeletion.count > 0 ||
      clearedRawResponses > 0
    ) {
      this.logger.log(
        `Runtime retention cleanup completed. deletedFailedJobLogs=${failedDeletion.count} deletedSucceededJobLogs=${successDeletion.count} clearedAnalysisRawResponses=${clearedRawResponses}`,
      );
    }

    return {
      deletedFailedJobLogs: failedDeletion.count,
      deletedSucceededJobLogs: successDeletion.count,
      clearedAnalysisRawResponses: Number(clearedRawResponses),
    };
  }

  private async getRecentTimeoutStats() {
    const windowStart = this.addDays(new Date(), 0);
    windowStart.setTime(Date.now() - 60 * 60 * 1000);
    const timedOutJobs = await this.prisma.jobLog.findMany({
      where: {
        finishedAt: {
          gte: windowStart,
        },
      },
      select: {
        jobName: true,
        errorMessage: true,
        result: true,
      },
    });

    return timedOutJobs.reduce(
      (summary, job) => {
        if (
          job.jobName === 'analysis.idea_snapshot' &&
          this.containsTimeoutText(job.errorMessage)
        ) {
          summary.snapshotTimeouts += 1;
        }

        if (
          job.jobName === 'analysis.run_single' &&
          (this.containsTimeoutText(job.errorMessage) ||
            this.containsTimeoutText(
              this.readNestedString(job.result, ['steps', 'ideaFit', 'message']),
            ) ||
            this.containsTimeoutText(
              this.readNestedString(job.result, ['steps', 'completeness', 'message']),
            ) ||
            this.containsTimeoutText(
              this.readNestedString(job.result, ['steps', 'ideaExtract', 'message']),
            ))
        ) {
          summary.deepTimeouts += 1;
        }

        if (
          job.jobName === 'analysis.run_single' &&
          this.containsTimeoutText(
            this.readNestedString(job.result, ['steps', 'ideaExtract', 'message']),
          )
        ) {
          summary.ideaExtractTimeouts += 1;
        }

        return summary;
      },
      {
        snapshotTimeouts: 0,
        deepTimeouts: 0,
        ideaExtractTimeouts: 0,
      },
    );
  }

  private async getDeepRuntimeStats(): Promise<DeepRuntimeStatsState> {
    const today = this.toDateKey(new Date());
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: DEEP_RUNTIME_STATS_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (
      !row?.configValue ||
      typeof row.configValue !== 'object' ||
      Array.isArray(row.configValue)
    ) {
      return this.emptyDeepRuntimeStats(today);
    }

    const value = row.configValue as Record<string, unknown>;
    const date = this.toNullableString(value.date) ?? today;

    if (date !== today) {
      return this.emptyDeepRuntimeStats(today);
    }

    return {
      date,
      deepEnteredCount: this.readIntLike(value.deepEnteredCount, 0),
      deepSkippedCount: this.readIntLike(value.deepSkippedCount, 0),
      ideaExtractExecutedCount: this.readIntLike(
        value.ideaExtractExecutedCount,
        0,
      ),
      ideaExtractSkippedCount: this.readIntLike(
        value.ideaExtractSkippedCount,
        0,
      ),
      ideaExtractDeferredCount: this.readIntLike(
        value.ideaExtractDeferredCount,
        0,
      ),
      ideaExtractTimeoutCount: this.readIntLike(
        value.ideaExtractTimeoutCount,
        0,
      ),
      lastIdeaExtractInflight: this.readIntLike(
        value.lastIdeaExtractInflight,
        0,
      ),
      ideaExtractMaxInflight: this.readIntLike(
        value.ideaExtractMaxInflight,
        0,
      ),
      updatedAt: this.toNullableString(value.updatedAt),
    };
  }

  private async saveMaintenanceState(state: MaintenanceState) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: MAINTENANCE_STATE_CONFIG_KEY,
      },
      update: {
        configValue: state as unknown as object,
      },
      create: {
        configKey: MAINTENANCE_STATE_CONFIG_KEY,
        configValue: state as unknown as object,
      },
    });
  }

  private emptyMaintenanceState(): MaintenanceState {
    return {
      lastMaintenanceAt: null,
      lastLogRotationAt: null,
      lastCleanupAt: null,
      lastSummarySyncAt: null,
      latestSummaryDate: null,
      lastLogRotation: null,
      lastCleanup: null,
    };
  }

  private emptyDeepRuntimeStats(today: string): DeepRuntimeStatsState {
    return {
      date: today,
      deepEnteredCount: 0,
      deepSkippedCount: 0,
      ideaExtractExecutedCount: 0,
      ideaExtractSkippedCount: 0,
      ideaExtractDeferredCount: 0,
      ideaExtractTimeoutCount: 0,
      lastIdeaExtractInflight: 0,
      ideaExtractMaxInflight: 0,
      updatedAt: null,
    };
  }

  private readRotationState(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const current = value as Record<string, unknown>;

    return {
      rotatedFiles: this.readIntLike(current.rotatedFiles, 0),
      deletedFiles: this.readIntLike(current.deletedFiles, 0),
    };
  }

  private readCleanupState(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const current = value as Record<string, unknown>;

    return {
      deletedFailedJobLogs: this.readIntLike(current.deletedFailedJobLogs, 0),
      deletedSucceededJobLogs: this.readIntLike(
        current.deletedSucceededJobLogs,
        0,
      ),
      clearedAnalysisRawResponses: this.readIntLike(
        current.clearedAnalysisRawResponses,
        0,
      ),
    };
  }

  private buildRotatedLogFilename(filename: string, now: Date) {
    const dotIndex = filename.indexOf('.log');
    const base = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
    const timestamp = now.toISOString().replace(/[:.]/g, '-');

    return `${base}.${timestamp}.log`;
  }

  private async trimRotatedLogs(logDir: string, filename: string, keepFiles: number) {
    const dotIndex = filename.indexOf('.log');
    const base = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
    const entries = await fs.readdir(logDir);
    const rotatedEntries = entries
      .filter((entry) => entry.startsWith(`${base}.`) && entry.endsWith('.log'))
      .sort()
      .reverse();

    if (rotatedEntries.length <= keepFiles) {
      return 0;
    }

    const toDelete = rotatedEntries.slice(keepFiles);
    await Promise.all(
      toDelete.map((entry) => fs.rm(path.join(logDir, entry), { force: true })),
    );

    return toDelete.length;
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private readIntLike(value: unknown, fallback: number) {
    const parsed = Number.parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }

    return parsed;
  }

  private containsTimeoutText(value: string | null | undefined) {
    const normalized = String(value ?? '').toLowerCase();
    return normalized.includes('timed out') || normalized.includes('timeout');
  }

  private readNestedString(
    value: unknown,
    pathParts: string[],
  ): string | null {
    let current = value;

    for (const part of pathParts) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return typeof current === 'string' ? current : null;
  }

  private toNullableString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private toDateKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private addDays(value: Date, days: number) {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return next;
  }
}
