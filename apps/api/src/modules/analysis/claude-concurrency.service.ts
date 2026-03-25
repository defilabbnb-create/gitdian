import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { QueueService } from '../queue/queue.service';
import {
  AnthropicGenerateJsonInput,
  AnthropicProvider,
  AnthropicProviderError,
  AnthropicProviderResult,
} from '../ai/providers/anthropic.provider';

export type ClaudeReviewPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type ClaudeConcurrencySkipReason =
  | 'priority_shed'
  | 'backpressure_shed'
  | 'fallback_active';
export type ClaudeRuntimeMode =
  | 'NORMAL'
  | 'DEGRADED'
  | 'FALLBACK'
  | 'RECOVERING';

export type ClaudeBenchmarkRequestRecord = {
  repositoryId: string;
  priority: ClaudeReviewPriority;
  startTime: string;
  latencyMs: number;
  batchSize: number;
  success: boolean;
  httpStatus: number | null;
  errorType: string | null;
  timeout: boolean;
  jsonParseSuccess: boolean;
  tokensUsed: number | null;
};

export type ClaudeBenchmarkLevelReport = {
  concurrency: number;
  sampleSize: number;
  successRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  timeoutRate: number;
  jsonErrorRate: number;
  throughputPerMin: number;
  errorRate: number;
  httpStatusCounts: Record<string, number>;
  errorTypeCounts: Record<string, number>;
  requests: ClaudeBenchmarkRequestRecord[];
};

export type ClaudeBenchmarkCalibrationReport = {
  model: string;
  benchmarkedAt: string;
  sampleSize: number;
  sampledRepositoryIds: string[];
  sampleBreakdown: {
    goodCandidateCount: number;
    lowConfidenceOkCount: number;
    nonProductCount: number;
  };
  levels: ClaudeBenchmarkLevelReport[];
  stableConcurrency: number;
  aggressive: number;
  safe: number;
  conservative: number;
  notRecommendedFrom: number | null;
};

type ClaudeConcurrencyState = {
  currentConcurrency: number;
  targetConcurrency: number;
  lastAdjustedAt: string | null;
  adjustmentReason: string | null;
  recentTimeoutRate: number;
  recentErrorRate: number;
  recentLatency: number | null;
  recentP90Latency: number | null;
  recentJsonErrorRate: number;
  stableConcurrency: number;
  aggressiveConcurrency: number;
  safeConcurrency: number;
  conservativeConcurrency: number;
  baselineLatencyMs: number | null;
  consecutiveFailures: number;
};

type ClaudePriorityCounts = Record<ClaudeReviewPriority, number>;

type ClaudeRuntimeState = {
  mode: ClaudeRuntimeMode;
  currentConcurrency: number;
  targetConcurrency: number;
  adjustmentReason: string | null;
  recentSuccessRate: number;
  recentTimeoutRate: number;
  recentErrorRate: number;
  recentLatency: number | null;
  recentP90Latency: number | null;
  activeReviewCount: number;
  queuedReviewCount: number;
  activeByPriority: ClaudePriorityCounts;
  queuedByPriority: ClaudePriorityCounts;
  topPriorityBeingServed: ClaudeReviewPriority | null;
  lastDegradedAt: string | null;
  lastFallbackAt: string | null;
  lastRecoveredAt: string | null;
  recoveryAttempts: number;
  fallbackCount: number;
  healthCheckFailureStreak: number;
  healthCheckSuccessStreak: number;
  lastHealthCheckAt: string | null;
  claudeQps: number;
  claudeBatchSize: number | null;
  claudeChangeRate: number | null;
  claudeDowngradeRate: number | null;
  snapshotQueueSize: number;
  deepQueueSize: number;
  omlxTimeoutPressure: boolean;
  systemLoadLevel: 'normal' | 'high' | 'extreme';
};

type ClaudeRuntimeMetrics = {
  sampleCount: number;
  successRate: number;
  errorRate: number;
  timeoutRate: number;
  jsonErrorRate: number;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p90LatencyMs: number | null;
  p95LatencyMs: number | null;
  throughputPerMin: number;
};

type ClaudeExecutionSample = {
  timestamp: number;
  startTime: string;
  latencyMs: number;
  batchSize: number;
  success: boolean;
  httpStatus: number | null;
  errorType: string | null;
  timeout: boolean;
  jsonParseSuccess: boolean;
  tokensUsed: number | null;
  priority: ClaudeReviewPriority;
};

type ClaudeSystemLoadSnapshot = {
  snapshotQueueSize: number;
  deepQueueSize: number;
  omlxTimeoutPressure: boolean;
  highLoad: boolean;
  extremeLoad: boolean;
  loadLevel: 'normal' | 'high' | 'extreme';
  sampledAt: number;
};

type PendingRequest = {
  priority: ClaudeReviewPriority;
  allowSkip: boolean;
  createdAt: number;
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

type ClaudeGenerateJsonExecution<T> =
  | {
      status: 'executed';
      result: AnthropicProviderResult<T>;
    }
  | {
      status: 'skipped';
      reason: ClaudeConcurrencySkipReason;
    };

const CLAUDE_CONCURRENCY_STATE_CONFIG_KEY = 'claude.review.concurrency.state';
const CLAUDE_CONCURRENCY_BENCHMARK_CONFIG_KEY =
  'claude.review.concurrency.benchmark.latest';
const CLAUDE_CONCURRENCY_STEPS = [1, 2, 3, 4, 6, 8, 10, 12] as const;
const CLAUDE_RUNTIME_STATE_CONFIG_KEY = 'claude.runtime_state';
const CLAUDE_RUNTIME_RECOVERY_STEPS = [1, 2, 3, 4, 6, 8, 10, 12] as const;

class ClaudeConcurrencySkippedError extends Error {
  constructor(readonly reason: ClaudeConcurrencySkipReason) {
    super(`Claude request skipped: ${reason}`);
    this.name = 'ClaudeConcurrencySkippedError';
  }
}

@Injectable()
export class ClaudeConcurrencyService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ClaudeConcurrencyService.name);
  private readonly samples: ClaudeExecutionSample[] = [];
  private readonly pending: Record<
    ClaudeReviewPriority,
    PendingRequest[]
  > = {
    P0: [],
    P1: [],
    P2: [],
    P3: [],
  };
  private readonly activeByPriority: ClaudePriorityCounts = {
    P0: 0,
    P1: 0,
    P2: 0,
    P3: 0,
  };

  private state: ClaudeConcurrencyState | null = null;
  private runtimeState: ClaudeRuntimeState | null = null;
  private benchmarkReport: ClaudeBenchmarkCalibrationReport | null = null;
  private loadingState: Promise<void> | null = null;
  private evaluationTimer: NodeJS.Timeout | null = null;
  private systemLoadSnapshot: ClaudeSystemLoadSnapshot | null = null;
  private inFlight = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly anthropicProvider: AnthropicProvider,
  ) {}

  onModuleInit() {
    if (!this.isAdaptiveEnabled()) {
      return;
    }

    void this.ensureInitialized();

    if (process.env.ENABLE_QUEUE_WORKERS === 'true') {
      this.evaluationTimer = setInterval(() => {
        void this.evaluateAndAdjust();
      }, this.resolveAdjustIntervalMs());
    }
  }

  onModuleDestroy() {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
    }
  }

  isAdaptiveEnabled() {
    return this.readBoolean('CLAUDE_ADAPTIVE_CONCURRENCY_ENABLED', false);
  }

  async generateJson<T>(
    input: AnthropicGenerateJsonInput,
    options: {
      priority: ClaudeReviewPriority;
      allowSkip?: boolean;
      batchSize?: number;
    },
  ): Promise<ClaudeGenerateJsonExecution<T>> {
    if (!this.isAdaptiveEnabled()) {
      return {
        status: 'executed',
        result: await this.executeProviderCall(input, options.priority),
      };
    }

    await this.ensureInitialized();
    await this.refreshSystemLoadSnapshotIfNeeded();
    const runtimeState = this.ensureRuntimeState();
    const priority = options.priority;
    const allowSkip =
      options.allowSkip ?? (priority === 'P2' || priority === 'P3');

    if (runtimeState.mode === 'FALLBACK') {
      return {
        status: 'skipped',
        reason: 'fallback_active',
      };
    }

    if (allowSkip && this.shouldShedPriority(priority)) {
      return {
        status: 'skipped',
        reason: 'priority_shed',
      };
    }

    const pendingCount = this.getPendingCount();
    const pendingLimit = this.resolvePendingLimit(priority);
    if (allowSkip && pendingCount >= pendingLimit) {
      return {
        status: 'skipped',
        reason: 'backpressure_shed',
      };
    }

    let result: AnthropicProviderResult<T>;
    try {
      result = (await this.scheduleExecution(
        priority,
        allowSkip,
        () =>
          this.executeProviderCall(input, priority, {
            batchSize: options.batchSize,
          }),
      )) as AnthropicProviderResult<T>;
    } catch (error) {
      if (error instanceof ClaudeConcurrencySkippedError) {
        return {
          status: 'skipped',
          reason: error.reason,
        };
      }

      throw error;
    }

    return {
      status: 'executed',
      result,
    };
  }

  async applyBenchmarkCalibration(report: ClaudeBenchmarkCalibrationReport) {
    this.benchmarkReport = report;
    await this.persistBenchmarkReport();

    const safeLevel =
      report.levels.find((item) => item.concurrency === report.safe) ?? null;
    const now = new Date().toISOString();
    const configuredMax = this.resolveConfiguredMaxConcurrency();
    const configuredHighLoad = this.resolveHighLoadConcurrency();
    this.state = {
      currentConcurrency: Math.min(report.aggressive, configuredMax),
      targetConcurrency: Math.min(report.aggressive, configuredMax),
      lastAdjustedAt: now,
      adjustmentReason: 'benchmark_calibrated',
      recentTimeoutRate: 0,
      recentErrorRate: 0,
      recentLatency: safeLevel?.avgLatencyMs ?? null,
      recentP90Latency: safeLevel?.p90LatencyMs ?? null,
      recentJsonErrorRate: 0,
      stableConcurrency: Math.min(report.stableConcurrency, configuredMax),
      aggressiveConcurrency: Math.min(report.aggressive, configuredMax),
      safeConcurrency: Math.min(report.safe, configuredMax),
      conservativeConcurrency: Math.min(report.conservative, configuredHighLoad),
      baselineLatencyMs: safeLevel?.avgLatencyMs ?? null,
      consecutiveFailures: 0,
    };
    this.runtimeState = {
      ...this.buildDefaultRuntimeState(report),
      mode: 'NORMAL',
      currentConcurrency: Math.min(report.aggressive, configuredMax),
      targetConcurrency: Math.min(report.aggressive, configuredMax),
      adjustmentReason: 'benchmark_calibrated',
    };

    await this.persistState();
    await this.persistRuntimeState();
    return this.getDiagnostics();
  }

  async getBenchmarkReport() {
    await this.ensureInitialized();
    return this.benchmarkReport;
  }

  async getDiagnostics() {
    await this.ensureInitialized();
    await this.refreshSystemLoadSnapshotIfNeeded();
    const state = this.ensureLocalState();
    const runtimeState = this.ensureRuntimeState();
    const recent = this.getRecentMetrics();
    this.refreshRuntimeStateSnapshot(recent);
    const systemLoad = this.ensureSystemLoadSnapshot();

    return {
      ...state,
      mode: runtimeState.mode,
      runtimeState,
      inFlight: this.inFlight,
      activeReviewCount: this.inFlight,
      pendingCount: this.getPendingCount(),
      queuedReviewCount: this.getPendingCount(),
      activeByPriority: this.copyPriorityCounts(this.activeByPriority),
      queuedByPriority: this.getPendingCountsByPriority(),
      topPriorityBeingServed: this.resolveTopPriorityBeingServed(),
      recentSampleCount: recent.sampleCount,
      recentSuccessRate: recent.successRate,
      recentTimeoutRate: recent.timeoutRate,
      recentErrorRate: recent.errorRate,
      recentJsonErrorRate: recent.jsonErrorRate,
      recentLatency: recent.avgLatencyMs,
      recentP90Latency: recent.p90LatencyMs,
      avgLatency: recent.avgLatencyMs,
      p90Latency: recent.p90LatencyMs,
      claudeQps: runtimeState.claudeQps,
      claudeBatchSize: runtimeState.claudeBatchSize,
      claudeChangeRate: runtimeState.claudeChangeRate,
      claudeDowngradeRate: runtimeState.claudeDowngradeRate,
      snapshotQueueSize: systemLoad.snapshotQueueSize,
      deepQueueSize: systemLoad.deepQueueSize,
      omlxTimeoutPressure: systemLoad.omlxTimeoutPressure,
      systemLoadLevel: systemLoad.loadLevel,
    };
  }

  async evaluateAndAdjust() {
    if (!this.isAdaptiveEnabled()) {
      return this.getDiagnostics();
    }

    await this.ensureInitialized();
    await this.refreshSystemLoadSnapshotIfNeeded(true);
    const state = this.ensureLocalState();
    const runtimeState = this.ensureRuntimeState();
    const recent = this.getRecentMetrics();
    const systemLoad = this.ensureSystemLoadSnapshot();
    const baselineLatencyMs = state.baselineLatencyMs ?? recent.avgLatencyMs ?? null;
    const degradedSignal =
      recent.timeoutRate > 0.15 ||
      recent.errorRate > 0.15 ||
      state.consecutiveFailures >= 5;
    const underPressure =
      recent.timeoutRate > 0.05 ||
      recent.errorRate > 0.05 ||
      (baselineLatencyMs !== null &&
        recent.p90LatencyMs !== null &&
        recent.p90LatencyMs > baselineLatencyMs * 2) ||
      state.consecutiveFailures >= 3;
    const latencyStable =
      recent.avgLatencyMs !== null &&
      recent.p90LatencyMs !== null &&
      baselineLatencyMs !== null &&
      recent.avgLatencyMs <= baselineLatencyMs * 1.25 &&
      recent.p90LatencyMs <= baselineLatencyMs * 1.5;
    const backlog = this.getPendingCount() > 0;
    const shouldScaleUp =
      recent.sampleCount > 0 &&
      recent.timeoutRate < 0.01 &&
      recent.errorRate < 0.01 &&
      latencyStable &&
      backlog;

    const now = Date.now();
    if (
      (runtimeState.mode === 'NORMAL' || runtimeState.mode === 'RECOVERING') &&
      degradedSignal
    ) {
      this.enterDegraded(now);
    }

    await this.maybeRunHealthCheck(now, recent);

    let nextConcurrency = state.currentConcurrency;
    let adjustmentReason = 'balanced_hold';

    if (runtimeState.mode === 'FALLBACK') {
      nextConcurrency = 0;
      adjustmentReason = 'fallback_active';
    } else if (runtimeState.mode === 'DEGRADED') {
      nextConcurrency = this.resolveMinConcurrency();
      adjustmentReason = 'network_degraded';
    } else if (runtimeState.mode === 'RECOVERING') {
      if (
        recent.sampleCount > 0 &&
        recent.timeoutRate < 0.05 &&
        recent.errorRate < 0.05
      ) {
        nextConcurrency = this.nextRecoveryStep(state.currentConcurrency);
        adjustmentReason =
          nextConcurrency >= state.stableConcurrency
            ? 'recovered'
            : 'recovery_scale_up';
      } else if (
        recent.sampleCount > 0 &&
        (recent.timeoutRate >= 0.05 || recent.errorRate >= 0.05)
      ) {
        this.enterDegraded(now, 'recovery_backoff');
        nextConcurrency = this.resolveMinConcurrency();
        adjustmentReason = 'network_degraded';
      }
    } else if (systemLoad.extremeLoad) {
      nextConcurrency = this.resolveMinConcurrency();
      adjustmentReason = 'system_extreme_backoff';
    } else if (systemLoad.highLoad) {
      nextConcurrency = this.resolveHighLoadConcurrency();
      adjustmentReason = 'system_high_load';
    } else if (underPressure) {
      nextConcurrency = this.previousStep(state.currentConcurrency);
      adjustmentReason = 'error_backoff';
    } else if (shouldScaleUp) {
      nextConcurrency = this.nextStep(state.currentConcurrency);
      adjustmentReason = 'stable_scale_up';
    }

    if (
      runtimeState.mode === 'RECOVERING' &&
      nextConcurrency >= state.stableConcurrency &&
      recent.sampleCount > 0 &&
      recent.timeoutRate < 0.05 &&
      recent.errorRate < 0.05
    ) {
      this.completeRecovery(now);
      adjustmentReason = 'balanced_hold';
    }

    const isoNow = new Date(now).toISOString();
    state.recentTimeoutRate = recent.timeoutRate;
    state.recentErrorRate = recent.errorRate;
    state.recentJsonErrorRate = recent.jsonErrorRate;
    state.recentLatency = recent.avgLatencyMs;
    state.recentP90Latency = recent.p90LatencyMs;
    state.targetConcurrency = nextConcurrency;
    runtimeState.currentConcurrency = nextConcurrency;

    if (nextConcurrency !== state.currentConcurrency) {
      state.currentConcurrency = nextConcurrency;
      state.lastAdjustedAt = isoNow;
      state.adjustmentReason = adjustmentReason;
      this.logger.log(
        `claude_concurrency_adjusted concurrency=${nextConcurrency} reason=${adjustmentReason} timeoutRate=${recent.timeoutRate.toFixed(3)} errorRate=${recent.errorRate.toFixed(3)} p90=${Math.round(recent.p90LatencyMs ?? 0)}`,
      );
      this.dispatchPending();
    } else if (state.adjustmentReason !== adjustmentReason) {
      state.adjustmentReason = adjustmentReason;
      state.lastAdjustedAt = isoNow;
    }

    await this.persistState();
    await this.persistRuntimeState();
    return this.getDiagnostics();
  }

  async getRuntimeState() {
    await this.ensureInitialized();
    return { ...this.ensureRuntimeState() };
  }

  async shouldUseLocalFallback() {
    const runtimeState = await this.getRuntimeState();
    return runtimeState.mode === 'FALLBACK';
  }

  async shouldPauseReplay() {
    const diagnostics = await this.getDiagnostics();
    return (
      diagnostics.mode === 'FALLBACK' ||
      diagnostics.mode === 'DEGRADED' ||
      diagnostics.mode === 'RECOVERING' ||
      diagnostics.systemLoadLevel === 'high' ||
      diagnostics.systemLoadLevel === 'extreme' ||
      diagnostics.pendingCount > 0 ||
      diagnostics.inFlight >= Math.max(1, diagnostics.currentConcurrency)
    );
  }

  private async executeProviderCall<T>(
    input: AnthropicGenerateJsonInput,
    priority: ClaudeReviewPriority,
    options?: {
      batchSize?: number;
    },
  ) {
    const batchSize = Math.max(1, options?.batchSize ?? 1);
    try {
      const result = await this.anthropicProvider.generateJson<T>(input);
      this.recordSample({
        timestamp: Date.now(),
        startTime: result.startTime,
        latencyMs: Math.max(0, result.latencyMs),
        batchSize,
        success: true,
        httpStatus: result.httpStatus,
        errorType: null,
        timeout: result.timeout,
        jsonParseSuccess: result.jsonParseSuccess,
        tokensUsed: result.tokensUsed,
        priority,
      });
      return result;
    } catch (error) {
      const normalized =
        error instanceof AnthropicProviderError
          ? error
          : new AnthropicProviderError(
              error instanceof Error ? error.message : 'Unknown Claude error.',
              {
                model: process.env.CLAUDE_MODEL?.trim() || 'claude-opus-4-6',
                startTime: new Date().toISOString(),
                latencyMs: 0,
                httpStatus: null,
                errorType: 'unknown_error',
                timeout: false,
                jsonParseSuccess: true,
                tokensUsed: null,
              },
            );

      this.recordSample({
        timestamp: Date.now(),
        startTime: normalized.startTime,
        latencyMs: Math.max(0, normalized.latencyMs),
        batchSize,
        success: false,
        httpStatus: normalized.httpStatus,
        errorType: normalized.errorType,
        timeout: normalized.timeout,
        jsonParseSuccess: normalized.jsonParseSuccess,
        tokensUsed: normalized.tokensUsed,
        priority,
      });

      throw normalized;
    }
  }

  private scheduleExecution<T>(
    priority: ClaudeReviewPriority,
    allowSkip: boolean,
    execute: () => Promise<T>,
  ): Promise<T> {
    if (this.inFlight < this.ensureLocalState().currentConcurrency) {
      return this.startExecution(priority, execute);
    }

    return new Promise<T>((resolve, reject) => {
      this.pending[priority].push({
        priority,
        allowSkip,
        createdAt: Date.now(),
        execute: () => execute(),
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
  }

  private startExecution<T>(
    priority: ClaudeReviewPriority,
    execute: () => Promise<T>,
  ) {
    this.inFlight += 1;
    this.activeByPriority[priority] += 1;

    return execute().finally(() => {
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.activeByPriority[priority] = Math.max(
        0,
        this.activeByPriority[priority] - 1,
      );
      this.dispatchPending();
    });
  }

  private dispatchPending() {
    const state = this.ensureLocalState();

    while (this.inFlight < state.currentConcurrency) {
      const next = this.shiftNextPending();
      if (!next) {
        break;
      }

      this.inFlight += 1;
      this.activeByPriority[next.priority] += 1;
      void next
        .execute()
        .then((value) => {
          next.resolve(value);
        })
        .catch((error) => {
          next.reject(error);
        })
        .finally(() => {
          this.inFlight = Math.max(0, this.inFlight - 1);
          this.activeByPriority[next.priority] = Math.max(
            0,
            this.activeByPriority[next.priority] - 1,
          );
          this.dispatchPending();
        });
    }
  }

  private shiftNextPending() {
    for (const priority of ['P0', 'P1', 'P2', 'P3'] as const) {
      const task = this.pending[priority].shift();
      if (task) {
        return task;
      }
    }

    return null;
  }

  private recordSample(sample: ClaudeExecutionSample) {
    const state = this.ensureLocalState();
    const runtimeState = this.ensureRuntimeState();
    this.samples.push(sample);
    this.pruneSamples(sample.timestamp);

    if (sample.success) {
      state.consecutiveFailures = 0;
      if (runtimeState.mode !== 'FALLBACK') {
        runtimeState.healthCheckSuccessStreak = 0;
      }
    } else {
      state.consecutiveFailures += 1;
    }
  }

  private getRecentMetrics(now = Date.now()): ClaudeRuntimeMetrics {
    this.pruneSamples(now);
    const windowMs = this.resolveAdjustIntervalMs();
    const lowerBound = now - windowMs;
    const recentSamples = this.samples.filter((sample) => sample.timestamp >= lowerBound);
    const latencies = recentSamples
      .map((sample) => Math.max(0, sample.latencyMs))
      .filter((value) => Number.isFinite(value));
    const totalBatchItems = recentSamples.reduce(
      (sum, sample) => sum + Math.max(1, sample.batchSize),
      0,
    );
    const timeouts = recentSamples.filter((sample) => sample.timeout).length;
    const errors = recentSamples.filter((sample) => !sample.success).length;
    const jsonErrors = recentSamples.filter((sample) => !sample.jsonParseSuccess).length;
    const durationMs =
      recentSamples.length > 1
        ? Math.max(
            1,
            recentSamples[recentSamples.length - 1].timestamp - recentSamples[0].timestamp,
          )
        : recentSamples.length === 1
          ? Math.max(1, recentSamples[0].latencyMs)
          : 0;

    return {
      sampleCount: recentSamples.length,
      successRate:
        recentSamples.length > 0 ? (recentSamples.length - errors) / recentSamples.length : 1,
      errorRate: recentSamples.length > 0 ? errors / recentSamples.length : 0,
      timeoutRate: recentSamples.length > 0 ? timeouts / recentSamples.length : 0,
      jsonErrorRate: recentSamples.length > 0 ? jsonErrors / recentSamples.length : 0,
      avgLatencyMs: latencies.length > 0 ? Math.round(this.average(latencies)) : null,
      p50LatencyMs: latencies.length > 0 ? this.percentile(latencies, 0.5) : null,
      p90LatencyMs: latencies.length > 0 ? this.percentile(latencies, 0.9) : null,
      p95LatencyMs: latencies.length > 0 ? this.percentile(latencies, 0.95) : null,
      throughputPerMin:
        durationMs > 0 ? Math.round((totalBatchItems / durationMs) * 60_000) : 0,
    };
  }

  private pruneSamples(now = Date.now()) {
    const retentionWindowMs = this.resolveAdjustIntervalMs() * 10;

    while (this.samples.length > 0) {
      if (now - this.samples[0].timestamp <= retentionWindowMs) {
        break;
      }
      this.samples.shift();
    }
  }

  private shouldShedPriority(priority: ClaudeReviewPriority) {
    if (priority === 'P0' || priority === 'P1') {
      return false;
    }

    const runtimeState = this.ensureRuntimeState();
    const systemLoad = this.ensureSystemLoadSnapshot();
    if (runtimeState.mode === 'DEGRADED') {
      return true;
    }
    if (systemLoad.highLoad || systemLoad.extremeLoad) {
      return true;
    }

    const recent = this.getRecentMetrics();
    const state = this.ensureLocalState();
    const baseline = state.baselineLatencyMs ?? recent.avgLatencyMs ?? null;

    return (
      recent.timeoutRate > 0.05 ||
      recent.errorRate > 0.05 ||
      (baseline !== null &&
        recent.p90LatencyMs !== null &&
        recent.p90LatencyMs > baseline * 2) ||
      state.consecutiveFailures >= 3
    );
  }

  private resolvePendingLimit(priority: ClaudeReviewPriority) {
    const currentConcurrency = this.ensureLocalState().currentConcurrency;
    if (priority === 'P0' || priority === 'P1') {
      return Math.max(currentConcurrency * 4, 12);
    }

    return Math.max(currentConcurrency * 2, 6);
  }

  private getPendingCount() {
    return this.pending.P0.length +
      this.pending.P1.length +
      this.pending.P2.length +
      this.pending.P3.length;
  }

  private getPendingCountsByPriority(): ClaudePriorityCounts {
    return {
      P0: this.pending.P0.length,
      P1: this.pending.P1.length,
      P2: this.pending.P2.length,
      P3: this.pending.P3.length,
    };
  }

  private async ensureInitialized() {
    if (this.state && this.benchmarkReport && this.runtimeState) {
      return;
    }

    if (!this.loadingState) {
      this.loadingState = this.loadInitialState();
    }

    await this.loadingState;
  }

  private async loadInitialState() {
    const [stateRow, benchmarkRow, runtimeRow] = await Promise.all([
      this.prisma.systemConfig.findUnique({
        where: {
          configKey: CLAUDE_CONCURRENCY_STATE_CONFIG_KEY,
        },
        select: {
          configValue: true,
        },
      }),
      this.prisma.systemConfig.findUnique({
        where: {
          configKey: CLAUDE_CONCURRENCY_BENCHMARK_CONFIG_KEY,
        },
        select: {
          configValue: true,
        },
      }),
      this.prisma.systemConfig.findUnique({
        where: {
          configKey: CLAUDE_RUNTIME_STATE_CONFIG_KEY,
        },
        select: {
          configValue: true,
        },
      }),
    ]);

    this.benchmarkReport = this.normalizeBenchmarkReport(benchmarkRow?.configValue);
    this.state = this.normalizeState(
      stateRow?.configValue,
      this.benchmarkReport,
    );
    this.runtimeState = this.normalizeRuntimeState(
      runtimeRow?.configValue,
      this.benchmarkReport,
    );
  }

  private ensureLocalState() {
    if (!this.state) {
      this.state = this.buildDefaultState(this.benchmarkReport);
    }

    return this.state;
  }

  private ensureRuntimeState() {
    if (!this.runtimeState) {
      this.runtimeState = this.buildDefaultRuntimeState(this.benchmarkReport);
    }

    return this.runtimeState;
  }

  private normalizeState(
    value: Prisma.JsonValue | null | undefined,
    benchmarkReport: ClaudeBenchmarkCalibrationReport | null,
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.buildDefaultState(benchmarkReport);
    }

    const record = value as Record<string, unknown>;
    const defaultState = this.buildDefaultState(benchmarkReport);
    return {
      currentConcurrency: this.clampToStep(
        this.readIntLike(record.currentConcurrency, defaultState.currentConcurrency),
      ),
      targetConcurrency: this.clampToStep(
        this.readIntLike(record.targetConcurrency, defaultState.targetConcurrency),
      ),
      lastAdjustedAt: this.toNullableString(record.lastAdjustedAt),
      adjustmentReason:
        this.toNullableString(record.adjustmentReason) ?? defaultState.adjustmentReason,
      recentTimeoutRate: this.readRateLike(
        record.recentTimeoutRate,
        defaultState.recentTimeoutRate,
      ),
      recentErrorRate: this.readRateLike(
        record.recentErrorRate,
        defaultState.recentErrorRate,
      ),
      recentLatency: this.readNullableNumber(
        record.recentLatency,
        defaultState.recentLatency,
      ),
      recentP90Latency: this.readNullableNumber(
        record.recentP90Latency,
        defaultState.recentP90Latency,
      ),
      recentJsonErrorRate: this.readRateLike(
        record.recentJsonErrorRate,
        defaultState.recentJsonErrorRate,
      ),
      stableConcurrency: this.clampToStep(
        this.readIntLike(record.stableConcurrency, defaultState.stableConcurrency),
      ),
      aggressiveConcurrency: this.clampToStep(
        this.readIntLike(
          record.aggressiveConcurrency,
          defaultState.aggressiveConcurrency,
        ),
      ),
      safeConcurrency: this.clampToStep(
        this.readIntLike(record.safeConcurrency, defaultState.safeConcurrency),
      ),
      conservativeConcurrency: this.clampToStep(
        this.readIntLike(
          record.conservativeConcurrency,
          defaultState.conservativeConcurrency,
        ),
      ),
      baselineLatencyMs: this.readNullableNumber(
        record.baselineLatencyMs,
        defaultState.baselineLatencyMs,
      ),
      consecutiveFailures: this.readIntLike(
        record.consecutiveFailures,
        defaultState.consecutiveFailures,
      ),
    } satisfies ClaudeConcurrencyState;
  }

  private normalizeBenchmarkReport(
    value: Prisma.JsonValue | null | undefined,
  ): ClaudeBenchmarkCalibrationReport | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const levels = Array.isArray(record.levels)
      ? record.levels
          .map((item) => this.normalizeBenchmarkLevel(item))
          .filter((item): item is ClaudeBenchmarkLevelReport => item !== null)
      : [];

    if (!levels.length) {
      return null;
    }

    return {
      model: this.toNullableString(record.model) ?? 'claude-opus-4-6',
      benchmarkedAt: this.toNullableString(record.benchmarkedAt) ?? new Date().toISOString(),
      sampleSize: this.readIntLike(record.sampleSize, levels[0]?.sampleSize ?? 0),
      sampledRepositoryIds: this.normalizeStringArray(record.sampledRepositoryIds),
      sampleBreakdown: {
        goodCandidateCount: this.readIntLike(
          (record.sampleBreakdown as Record<string, unknown> | undefined)
            ?.goodCandidateCount,
          0,
        ),
        lowConfidenceOkCount: this.readIntLike(
          (record.sampleBreakdown as Record<string, unknown> | undefined)
            ?.lowConfidenceOkCount,
          0,
        ),
        nonProductCount: this.readIntLike(
          (record.sampleBreakdown as Record<string, unknown> | undefined)
            ?.nonProductCount,
          0,
        ),
      },
      levels,
      stableConcurrency: this.clampToStep(
        this.readIntLike(record.stableConcurrency, 2),
      ),
      aggressive: this.clampToStep(this.readIntLike(record.aggressive, 4)),
      safe: this.clampToStep(this.readIntLike(record.safe, 2)),
      conservative: this.clampToStep(
        this.readIntLike(record.conservative, 2),
      ),
      notRecommendedFrom: this.readNullableNumber(record.notRecommendedFrom, null),
    };
  }

  private normalizeBenchmarkLevel(value: unknown): ClaudeBenchmarkLevelReport | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    return {
      concurrency: this.clampToStep(this.readIntLike(record.concurrency, 2)),
      sampleSize: this.readIntLike(record.sampleSize, 0),
      successRate: this.readRateLike(record.successRate, 0),
      avgLatencyMs: this.readIntLike(record.avgLatencyMs, 0),
      p50LatencyMs: this.readIntLike(record.p50LatencyMs, 0),
      p90LatencyMs: this.readIntLike(record.p90LatencyMs, 0),
      p95LatencyMs: this.readIntLike(record.p95LatencyMs, 0),
      timeoutRate: this.readRateLike(record.timeoutRate, 0),
      jsonErrorRate: this.readRateLike(record.jsonErrorRate, 0),
      throughputPerMin: this.readIntLike(record.throughputPerMin, 0),
      errorRate: this.readRateLike(record.errorRate, 0),
      httpStatusCounts: this.normalizeNumericMap(record.httpStatusCounts),
      errorTypeCounts: this.normalizeNumericMap(record.errorTypeCounts),
      requests: Array.isArray(record.requests)
        ? record.requests
            .map((item) => this.normalizeBenchmarkRequest(item))
            .filter((item): item is ClaudeBenchmarkRequestRecord => item !== null)
        : [],
    };
  }

  private normalizeBenchmarkRequest(value: unknown): ClaudeBenchmarkRequestRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    return {
      repositoryId: this.toNullableString(record.repositoryId) ?? '',
      priority: this.normalizePriority(record.priority),
      startTime: this.toNullableString(record.startTime) ?? new Date().toISOString(),
      latencyMs: this.readIntLike(record.latencyMs, 0),
      batchSize: this.readIntLike(record.batchSize, 1),
      success: Boolean(record.success),
      httpStatus: this.readNullableNumber(record.httpStatus, null),
      errorType: this.toNullableString(record.errorType),
      timeout: Boolean(record.timeout),
      jsonParseSuccess: Boolean(record.jsonParseSuccess),
      tokensUsed: this.readNullableNumber(record.tokensUsed, null),
    };
  }

  private async persistState() {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: CLAUDE_CONCURRENCY_STATE_CONFIG_KEY,
      },
      update: {
        configValue: this.ensureLocalState() as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: CLAUDE_CONCURRENCY_STATE_CONFIG_KEY,
        configValue: this.ensureLocalState() as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async persistRuntimeState() {
    this.refreshRuntimeStateSnapshot();
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: CLAUDE_RUNTIME_STATE_CONFIG_KEY,
      },
      update: {
        configValue: this.ensureRuntimeState() as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: CLAUDE_RUNTIME_STATE_CONFIG_KEY,
        configValue: this.ensureRuntimeState() as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async persistBenchmarkReport() {
    if (!this.benchmarkReport) {
      return;
    }

    await this.prisma.systemConfig.upsert({
      where: {
        configKey: CLAUDE_CONCURRENCY_BENCHMARK_CONFIG_KEY,
      },
      update: {
        configValue: this.benchmarkReport as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: CLAUDE_CONCURRENCY_BENCHMARK_CONFIG_KEY,
        configValue: this.benchmarkReport as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private buildDefaultState(
    benchmarkReport: ClaudeBenchmarkCalibrationReport | null,
  ): ClaudeConcurrencyState {
    const configuredMax = this.resolveConfiguredMaxConcurrency();
    const configuredHighLoad = this.resolveHighLoadConcurrency();
    const safeConcurrency = this.clampToStep(
      Math.min(benchmarkReport?.safe ?? configuredMax, configuredMax),
    );
    const aggressiveConcurrency = this.clampToStep(
      Math.min(benchmarkReport?.aggressive ?? configuredMax, configuredMax),
    );
    const conservativeConcurrency = this.clampToStep(
      Math.min(benchmarkReport?.conservative ?? configuredHighLoad, configuredHighLoad),
    );
    const safeLevel =
      benchmarkReport?.levels.find((item) => item.concurrency === safeConcurrency) ?? null;

    return {
      currentConcurrency: aggressiveConcurrency,
      targetConcurrency: aggressiveConcurrency,
      lastAdjustedAt: null,
      adjustmentReason: 'boot_default',
      recentTimeoutRate: 0,
      recentErrorRate: 0,
      recentLatency: safeLevel?.avgLatencyMs ?? null,
      recentP90Latency: safeLevel?.p90LatencyMs ?? null,
      recentJsonErrorRate: 0,
      stableConcurrency: Math.min(
        benchmarkReport?.stableConcurrency ?? safeConcurrency,
        configuredMax,
      ),
      aggressiveConcurrency,
      safeConcurrency,
      conservativeConcurrency,
      baselineLatencyMs: safeLevel?.avgLatencyMs ?? null,
      consecutiveFailures: 0,
    };
  }

  private buildDefaultRuntimeState(
    benchmarkReport: ClaudeBenchmarkCalibrationReport | null,
  ): ClaudeRuntimeState {
    const currentConcurrency = this.clampRuntimeStep(
      Math.min(
        benchmarkReport?.aggressive ?? this.resolveConfiguredMaxConcurrency(),
        this.resolveConfiguredMaxConcurrency(),
      ),
    );
    return {
      mode: 'NORMAL',
      currentConcurrency,
      targetConcurrency: currentConcurrency,
      adjustmentReason: 'boot_default',
      recentSuccessRate: 1,
      recentTimeoutRate: 0,
      recentErrorRate: 0,
      recentLatency: null,
      recentP90Latency: null,
      activeReviewCount: 0,
      queuedReviewCount: 0,
      activeByPriority: this.emptyPriorityCounts(),
      queuedByPriority: this.emptyPriorityCounts(),
      topPriorityBeingServed: null,
      lastDegradedAt: null,
      lastFallbackAt: null,
      lastRecoveredAt: null,
      recoveryAttempts: 0,
      fallbackCount: 0,
      healthCheckFailureStreak: 0,
      healthCheckSuccessStreak: 0,
      lastHealthCheckAt: null,
      claudeQps: 0,
      claudeBatchSize: null,
      claudeChangeRate: null,
      claudeDowngradeRate: null,
      snapshotQueueSize: 0,
      deepQueueSize: 0,
      omlxTimeoutPressure: false,
      systemLoadLevel: 'normal',
    };
  }

  private normalizeRuntimeState(
    value: Prisma.JsonValue | null | undefined,
    benchmarkReport: ClaudeBenchmarkCalibrationReport | null,
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.buildDefaultRuntimeState(benchmarkReport);
    }

    const record = value as Record<string, unknown>;
    const defaults = this.buildDefaultRuntimeState(benchmarkReport);

    return {
      mode: this.normalizeMode(record.mode) ?? defaults.mode,
      currentConcurrency: this.clampRuntimeStep(
        this.readIntLike(record.currentConcurrency, defaults.currentConcurrency),
      ),
      targetConcurrency: this.clampRuntimeStep(
        this.readIntLike(record.targetConcurrency, defaults.targetConcurrency),
      ),
      adjustmentReason:
        this.toNullableString(record.adjustmentReason) ??
        defaults.adjustmentReason,
      recentSuccessRate: this.readRateLike(
        record.recentSuccessRate,
        defaults.recentSuccessRate,
      ),
      recentTimeoutRate: this.readRateLike(
        record.recentTimeoutRate,
        defaults.recentTimeoutRate,
      ),
      recentErrorRate: this.readRateLike(
        record.recentErrorRate,
        defaults.recentErrorRate,
      ),
      recentLatency: this.readNullableNumber(
        record.recentLatency,
        defaults.recentLatency,
      ),
      recentP90Latency: this.readNullableNumber(
        record.recentP90Latency,
        defaults.recentP90Latency,
      ),
      activeReviewCount: this.readIntLike(
        record.activeReviewCount,
        defaults.activeReviewCount,
      ),
      queuedReviewCount: this.readIntLike(
        record.queuedReviewCount,
        defaults.queuedReviewCount,
      ),
      activeByPriority: this.normalizePriorityCounts(
        record.activeByPriority,
        defaults.activeByPriority,
      ),
      queuedByPriority: this.normalizePriorityCounts(
        record.queuedByPriority,
        defaults.queuedByPriority,
      ),
      topPriorityBeingServed:
        this.normalizePriority(record.topPriorityBeingServed) ??
        defaults.topPriorityBeingServed,
      lastDegradedAt: this.toNullableString(record.lastDegradedAt),
      lastFallbackAt: this.toNullableString(record.lastFallbackAt),
      lastRecoveredAt: this.toNullableString(record.lastRecoveredAt),
      recoveryAttempts: this.readIntLike(
        record.recoveryAttempts,
        defaults.recoveryAttempts,
      ),
      fallbackCount: this.readIntLike(record.fallbackCount, defaults.fallbackCount),
      healthCheckFailureStreak: this.readIntLike(
        record.healthCheckFailureStreak,
        defaults.healthCheckFailureStreak,
      ),
      healthCheckSuccessStreak: this.readIntLike(
        record.healthCheckSuccessStreak,
        defaults.healthCheckSuccessStreak,
      ),
      lastHealthCheckAt: this.toNullableString(record.lastHealthCheckAt),
      claudeQps: this.readNullableNumber(record.claudeQps, defaults.claudeQps) ?? 0,
      claudeBatchSize: this.readNullableNumber(
        record.claudeBatchSize,
        defaults.claudeBatchSize,
      ),
      claudeChangeRate: this.readNullableNumber(
        record.claudeChangeRate,
        defaults.claudeChangeRate,
      ),
      claudeDowngradeRate: this.readNullableNumber(
        record.claudeDowngradeRate,
        defaults.claudeDowngradeRate,
      ),
      snapshotQueueSize: this.readIntLike(
        record.snapshotQueueSize,
        defaults.snapshotQueueSize,
      ),
      deepQueueSize: this.readIntLike(record.deepQueueSize, defaults.deepQueueSize),
      omlxTimeoutPressure: Boolean(record.omlxTimeoutPressure),
      systemLoadLevel:
        this.normalizeSystemLoadLevel(record.systemLoadLevel) ??
        defaults.systemLoadLevel,
    } satisfies ClaudeRuntimeState;
  }

  private resolveAdjustIntervalMs() {
    return this.readInt('CLAUDE_ADJUST_INTERVAL_MS', 60_000);
  }

  private resolveHealthCheckIntervalMs() {
    return this.readInt('CLAUDE_HEALTH_CHECK_INTERVAL_MS', 300_000);
  }

  private resolveConfiguredMaxConcurrency() {
    return this.clampToStep(this.readInt('CLAUDE_REVIEW_MAX_CONCURRENCY', 6));
  }

  private resolveHighLoadConcurrency() {
    const configured = this.readInt('CLAUDE_REVIEW_HIGH_LOAD_CONCURRENCY', 3);
    return this.clampToStep(
      Math.min(configured, this.resolveConfiguredMaxConcurrency()),
    );
  }

  private resolveMinConcurrency() {
    const configured = this.readInt('CLAUDE_REVIEW_MIN_CONCURRENCY', 1);
    return this.clampToStep(
      Math.min(
        Math.max(1, configured),
        this.resolveHighLoadConcurrency(),
      ),
    );
  }

  private async refreshSystemLoadSnapshotIfNeeded(force = false) {
    const snapshot = this.systemLoadSnapshot;
    if (!force && snapshot && Date.now() - snapshot.sampledAt < 15_000) {
      return snapshot;
    }

    const [snapshotQueue, deepQueue, timeoutStats] = await Promise.all([
      this.queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SNAPSHOT),
      this.queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SINGLE),
      this.getRecentOmlxTimeoutStats(),
    ]);
    const snapshotHighWatermark = this.readInt(
      'SNAPSHOT_QUEUE_HIGH_WATERMARK',
      1000,
    );
    const deepHighWatermark = this.readInt('DEEP_QUEUE_HIGH_WATERMARK', 10);
    const omlxTimeoutPressure =
      timeoutStats.snapshotTimeouts >= 3 ||
      timeoutStats.deepTimeouts >= 3 ||
      timeoutStats.ideaExtractTimeouts >= 2;
    const severeOmlxTimeoutPressure =
      timeoutStats.snapshotTimeouts >= 6 ||
      timeoutStats.deepTimeouts >= 6 ||
      timeoutStats.ideaExtractTimeouts >= 4;
    const highLoad =
      snapshotQueue.total > snapshotHighWatermark ||
      deepQueue.total > deepHighWatermark ||
      omlxTimeoutPressure;
    const extremeLoad =
      snapshotQueue.total > snapshotHighWatermark * 2 ||
      deepQueue.total > deepHighWatermark * 2 ||
      severeOmlxTimeoutPressure;

    this.systemLoadSnapshot = {
      snapshotQueueSize: snapshotQueue.total,
      deepQueueSize: deepQueue.total,
      omlxTimeoutPressure,
      highLoad,
      extremeLoad,
      loadLevel: extremeLoad ? 'extreme' : highLoad ? 'high' : 'normal',
      sampledAt: Date.now(),
    };

    return this.systemLoadSnapshot;
  }

  private ensureSystemLoadSnapshot() {
    if (!this.systemLoadSnapshot) {
      this.systemLoadSnapshot = {
        snapshotQueueSize: 0,
        deepQueueSize: 0,
        omlxTimeoutPressure: false,
        highLoad: false,
        extremeLoad: false,
        loadLevel: 'normal',
        sampledAt: 0,
      };
    }

    return this.systemLoadSnapshot;
  }

  private async getRecentOmlxTimeoutStats() {
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);
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

  private average(values: number[]) {
    if (!values.length) {
      return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private percentile(values: number[], ratio: number) {
    if (!values.length) {
      return 0;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * ratio) - 1),
    );
    return sorted[index];
  }

  private previousStep(value: number) {
    const steps: number[] = [...CLAUDE_CONCURRENCY_STEPS];
    const minConcurrency = this.resolveMinConcurrency();
    const boundedSteps = steps.filter((step) => step >= minConcurrency);
    const index = boundedSteps.indexOf(this.clampToStep(value));
    if (index <= 0) {
      return boundedSteps[0] ?? minConcurrency;
    }
    return boundedSteps[index - 1] ?? minConcurrency;
  }

  private nextStep(value: number) {
    const steps: number[] = [...CLAUDE_CONCURRENCY_STEPS];
    const maxConcurrency = this.resolveConfiguredMaxConcurrency();
    const boundedSteps = steps.filter((step) => step <= maxConcurrency);
    const index = boundedSteps.indexOf(this.clampToStep(value));
    if (index < 0 || index >= boundedSteps.length - 1) {
      return boundedSteps[boundedSteps.length - 1] ?? maxConcurrency;
    }
    return boundedSteps[index + 1] ?? maxConcurrency;
  }

  private nextRecoveryStep(value: number) {
    const steps: number[] = [...CLAUDE_RUNTIME_RECOVERY_STEPS];
    const current = this.clampRuntimeStep(value);
    const target = Math.min(
      this.ensureLocalState().stableConcurrency,
      this.resolveConfiguredMaxConcurrency(),
    );
    const boundedSteps = steps.filter((step) => step <= target);
    const currentIndex = boundedSteps.indexOf(current);
    const next =
      currentIndex >= 0 && currentIndex < boundedSteps.length - 1
        ? boundedSteps[currentIndex + 1]
        : current;

    return Math.min(target, next);
  }

  private clampToStep(value: number) {
    const numeric = Number.isFinite(value) ? Math.round(value) : 2;
    let closest: number = CLAUDE_CONCURRENCY_STEPS[0];
    let distance = Math.abs(numeric - closest);

    for (const step of CLAUDE_CONCURRENCY_STEPS) {
      const nextDistance = Math.abs(numeric - step);
      if (nextDistance < distance) {
        closest = step;
        distance = nextDistance;
      }
    }

    return closest;
  }

  private clampRuntimeStep(value: number) {
    const numeric = Number.isFinite(value) ? Math.round(value) : 1;
    let closest: number = CLAUDE_RUNTIME_RECOVERY_STEPS[0];
    let distance = Math.abs(numeric - closest);

    for (const step of CLAUDE_RUNTIME_RECOVERY_STEPS) {
      const nextDistance = Math.abs(numeric - step);
      if (nextDistance < distance) {
        closest = step;
        distance = nextDistance;
      }
    }

    return closest;
  }

  private async maybeRunHealthCheck(now: number, recent: ClaudeRuntimeMetrics) {
    const runtimeState = this.ensureRuntimeState();

    if (
      runtimeState.mode !== 'DEGRADED' &&
      runtimeState.mode !== 'FALLBACK'
    ) {
      return;
    }

    if (
      now - this.toTimestamp(runtimeState.lastHealthCheckAt) <
      this.resolveHealthCheckIntervalMs()
    ) {
      return;
    }

    const health = await this.anthropicProvider.healthCheck();
    runtimeState.lastHealthCheckAt = new Date(now).toISOString();

    if (!health.ok) {
      runtimeState.healthCheckFailureStreak += 1;
      runtimeState.healthCheckSuccessStreak = 0;

      if (
        runtimeState.mode === 'DEGRADED' &&
        runtimeState.healthCheckFailureStreak >= 3
      ) {
        this.enterFallback(now);
      }

      await this.persistRuntimeState();
      return;
    }

    runtimeState.healthCheckFailureStreak = 0;
    runtimeState.healthCheckSuccessStreak += 1;

    if (
      runtimeState.mode === 'DEGRADED' &&
      recent.timeoutRate < 0.05 &&
      recent.errorRate < 0.05
    ) {
      this.startRecovery(now);
    }

    if (
      runtimeState.mode === 'FALLBACK' &&
      runtimeState.healthCheckSuccessStreak >= 2
    ) {
      this.startRecovery(now);
    }

    await this.persistRuntimeState();
  }

  private enterDegraded(now: number, reason = 'network_degraded') {
    const state = this.ensureLocalState();
    const runtimeState = this.ensureRuntimeState();
    const degradedConcurrency = this.resolveMinConcurrency();
    runtimeState.mode = 'DEGRADED';
    runtimeState.currentConcurrency = degradedConcurrency;
    runtimeState.targetConcurrency = degradedConcurrency;
    runtimeState.adjustmentReason = reason;
    runtimeState.lastDegradedAt = new Date(now).toISOString();
    runtimeState.healthCheckFailureStreak = 0;
    runtimeState.healthCheckSuccessStreak = 0;
    state.currentConcurrency = degradedConcurrency;
    state.targetConcurrency = degradedConcurrency;
    state.adjustmentReason = reason;
    state.lastAdjustedAt = new Date(now).toISOString();
    this.drainPending(
      (task) => task.priority === 'P2' || task.priority === 'P3',
      'priority_shed',
    );
    this.logger.warn('claude degraded');
  }

  private enterFallback(now: number) {
    const state = this.ensureLocalState();
    const runtimeState = this.ensureRuntimeState();
    runtimeState.mode = 'FALLBACK';
    runtimeState.currentConcurrency = 0;
    runtimeState.targetConcurrency = 0;
    runtimeState.adjustmentReason = 'local_fallback_active';
    runtimeState.lastFallbackAt = new Date(now).toISOString();
    runtimeState.fallbackCount += 1;
    runtimeState.healthCheckSuccessStreak = 0;
    state.currentConcurrency = 0;
    state.targetConcurrency = 0;
    state.adjustmentReason = 'local_fallback_active';
    state.lastAdjustedAt = new Date(now).toISOString();
    this.drainPending(() => true, 'fallback_active');
    this.logger.warn('claude fallback activated');
  }

  private startRecovery(now: number) {
    const state = this.ensureLocalState();
    const runtimeState = this.ensureRuntimeState();
    runtimeState.mode = 'RECOVERING';
    runtimeState.currentConcurrency = 1;
    runtimeState.targetConcurrency = 1;
    runtimeState.adjustmentReason = 'recovery_started';
    runtimeState.recoveryAttempts += 1;
    runtimeState.healthCheckFailureStreak = 0;
    runtimeState.healthCheckSuccessStreak = 0;
    state.currentConcurrency = 1;
    state.targetConcurrency = 1;
    state.adjustmentReason = 'recovery_started';
    state.lastAdjustedAt = new Date(now).toISOString();
    this.logger.log('claude recovery started');
  }

  private completeRecovery(now: number) {
    const state = this.ensureLocalState();
    const runtimeState = this.ensureRuntimeState();
    runtimeState.mode = 'NORMAL';
    runtimeState.currentConcurrency = state.stableConcurrency;
    runtimeState.targetConcurrency = state.stableConcurrency;
    runtimeState.adjustmentReason = 'balanced_hold';
    runtimeState.lastRecoveredAt = new Date(now).toISOString();
    runtimeState.healthCheckFailureStreak = 0;
    runtimeState.healthCheckSuccessStreak = 0;
    state.currentConcurrency = state.stableConcurrency;
    state.targetConcurrency = state.stableConcurrency;
    state.adjustmentReason = 'balanced_hold';
    state.lastAdjustedAt = new Date(now).toISOString();
    this.logger.log('claude recovered');
  }

  private drainPending(
    shouldDrain: (task: PendingRequest) => boolean,
    reason: ClaudeConcurrencySkipReason,
  ) {
    for (const priority of ['P0', 'P1', 'P2', 'P3'] as const) {
      const keep: PendingRequest[] = [];

      for (const task of this.pending[priority]) {
        if (!shouldDrain(task)) {
          keep.push(task);
          continue;
        }

        task.reject(new ClaudeConcurrencySkippedError(reason));
      }

      this.pending[priority] = keep;
    }
  }

  private normalizeMode(value: unknown): ClaudeRuntimeMode | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (
      normalized === 'NORMAL' ||
      normalized === 'DEGRADED' ||
      normalized === 'FALLBACK' ||
      normalized === 'RECOVERING'
    ) {
      return normalized;
    }

    return null;
  }

  private refreshRuntimeStateSnapshot(
    recent: ClaudeRuntimeMetrics = this.getRecentMetrics(),
  ) {
    const runtimeState = this.ensureRuntimeState();
    const state = this.ensureLocalState();
    const systemLoad = this.ensureSystemLoadSnapshot();
    runtimeState.currentConcurrency = state.currentConcurrency;
    runtimeState.targetConcurrency = state.targetConcurrency;
    runtimeState.adjustmentReason = state.adjustmentReason;
    runtimeState.recentSuccessRate = recent.successRate;
    runtimeState.recentTimeoutRate = recent.timeoutRate;
    runtimeState.recentErrorRate = recent.errorRate;
    runtimeState.recentLatency = recent.avgLatencyMs;
    runtimeState.recentP90Latency = recent.p90LatencyMs;
    runtimeState.activeReviewCount = this.inFlight;
    runtimeState.queuedReviewCount = this.getPendingCount();
    runtimeState.activeByPriority = this.copyPriorityCounts(this.activeByPriority);
    runtimeState.queuedByPriority = this.getPendingCountsByPriority();
    runtimeState.topPriorityBeingServed = this.resolveTopPriorityBeingServed();
    runtimeState.claudeQps = Number((recent.throughputPerMin / 60).toFixed(3));
    runtimeState.snapshotQueueSize = systemLoad.snapshotQueueSize;
    runtimeState.deepQueueSize = systemLoad.deepQueueSize;
    runtimeState.omlxTimeoutPressure = systemLoad.omlxTimeoutPressure;
    runtimeState.systemLoadLevel = systemLoad.loadLevel;
  }

  private resolveTopPriorityBeingServed(): ClaudeReviewPriority | null {
    for (const priority of ['P0', 'P1', 'P2', 'P3'] as const) {
      if (this.activeByPriority[priority] > 0 || this.pending[priority].length > 0) {
        return priority;
      }
    }

    return null;
  }

  private emptyPriorityCounts(): ClaudePriorityCounts {
    return {
      P0: 0,
      P1: 0,
      P2: 0,
      P3: 0,
    };
  }

  private copyPriorityCounts(value: ClaudePriorityCounts): ClaudePriorityCounts {
    return {
      P0: value.P0,
      P1: value.P1,
      P2: value.P2,
      P3: value.P3,
    };
  }

  private normalizePriorityCounts(
    value: unknown,
    fallback: ClaudePriorityCounts,
  ): ClaudePriorityCounts {
    const record =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return {
      P0: this.readIntLike(record.P0, fallback.P0),
      P1: this.readIntLike(record.P1, fallback.P1),
      P2: this.readIntLike(record.P2, fallback.P2),
      P3: this.readIntLike(record.P3, fallback.P3),
    };
  }

  private normalizePriority(value: unknown): ClaudeReviewPriority {
    const normalized = String(value ?? 'P2').trim().toUpperCase();
    if (normalized === 'P0' || normalized === 'P1' || normalized === 'P2') {
      return normalized;
    }
    return 'P3';
  }

  private normalizeNumericMap(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {} as Record<string, number>;
    }

    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record)
        .map(([key, item]) => [key, this.readIntLike(item, 0)] as const)
        .filter(([, item]) => item > 0),
    );
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => String(item ?? '').trim())
      .filter((item) => Boolean(item));
  }

  private normalizeSystemLoadLevel(
    value: unknown,
  ): ClaudeRuntimeState['systemLoadLevel'] | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (
      normalized === 'normal' ||
      normalized === 'high' ||
      normalized === 'extreme'
    ) {
      return normalized;
    }

    return null;
  }

  private containsTimeoutText(value: string | null | undefined) {
    const normalized = String(value ?? '').toLowerCase();
    return normalized.includes('timed out') || normalized.includes('timeout');
  }

  private readNestedString(value: unknown, pathParts: string[]) {
    let current = value;

    for (const part of pathParts) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return typeof current === 'string' ? current : null;
  }

  private readBoolean(envName: string, fallback: boolean) {
    const raw = process.env[envName]?.trim().toLowerCase();
    if (!raw) {
      return fallback;
    }
    if (['1', 'true', 'yes', 'on'].includes(raw)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(raw)) {
      return false;
    }
    return fallback;
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }
    return parsed;
  }

  private readIntLike(value: unknown, fallback: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.round(parsed);
  }

  private readRateLike(value: unknown, fallback: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? ''));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(0, Math.min(1, parsed));
  }

  private readNullableNumber(value: unknown, fallback: number | null) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? ''));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.round(parsed);
  }

  private toNullableString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  private toTimestamp(value: string | null) {
    if (!value) {
      return 0;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
