import { Injectable } from '@nestjs/common';
import { execSync } from 'node:child_process';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GitHubRadarService } from '../github/github-radar.service';

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

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitHubRadarService: GitHubRadarService,
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

  private readBuildValue(value: string | undefined, fallback: string) {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : fallback;
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
