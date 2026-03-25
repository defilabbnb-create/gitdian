import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GitHubTokenPoolDiagnostics } from './github-token-pool';

type SearchSample = {
  timestamp: number;
  latencyMs: number;
  retryCount: number;
  rateLimitHits: number;
};

type SearchConcurrencyState = {
  currentConcurrency: number;
  targetConcurrency: number;
  adjustmentReason: string | null;
  lastAdjustedAt: string | null;
  lastRateLimitAt: string | null;
  lastRetryAt: string | null;
  stablePeriods: number;
};

type SearchConcurrencyTelemetry = {
  currentSearchConcurrency: number;
  targetSearchConcurrency: number;
  adjustmentReason: string | null;
  lastAdjustedAt: string | null;
  recentRateLimitHits: number;
  recentRetryCount: number;
  recentAverageLatencyMs: number | null;
  lastRateLimitAt: string | null;
  lastRetryAt: string | null;
};

const SEARCH_CONCURRENCY_STATE_CONFIG_KEY = 'github.search.concurrency.state';

@Injectable()
export class GitHubSearchConcurrencyService {
  private state: SearchConcurrencyState | null = null;
  private readonly samples: SearchSample[] = [];
  private loadingState: Promise<SearchConcurrencyState> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  getCurrentConcurrency() {
    return this.ensureLocalState().currentConcurrency;
  }

  getDiagnostics(): SearchConcurrencyTelemetry {
    const state = this.ensureLocalState();
    const recent = this.getRecentMetrics();

    return {
      currentSearchConcurrency: state.currentConcurrency,
      targetSearchConcurrency: state.targetConcurrency,
      adjustmentReason: state.adjustmentReason,
      lastAdjustedAt: state.lastAdjustedAt,
      recentRateLimitHits: recent.rateLimitHits,
      recentRetryCount: recent.retryCount,
      recentAverageLatencyMs: recent.averageLatencyMs,
      lastRateLimitAt: state.lastRateLimitAt,
      lastRetryAt: state.lastRetryAt,
    };
  }

  async ensureInitialized() {
    await this.ensureState();
  }

  async recordSearchSample(sample: {
    latencyMs: number;
    retryCount: number;
    rateLimitHits: number;
  }) {
    await this.ensureState();
    const now = Date.now();

    this.samples.push({
      timestamp: now,
      latencyMs: Math.max(0, sample.latencyMs),
      retryCount: Math.max(0, sample.retryCount),
      rateLimitHits: Math.max(0, sample.rateLimitHits),
    });
    this.pruneSamples(now);

    const state = this.ensureLocalState();
    let changed = false;

    if (sample.rateLimitHits > 0) {
      state.lastRateLimitAt = new Date(now).toISOString();
      changed = true;
    }

    if (sample.retryCount > 0) {
      state.lastRetryAt = new Date(now).toISOString();
      changed = true;
    }

    if (changed) {
      await this.persistState();
    }
  }

  async evaluateAndAdjust(args: {
    snapshotQueueSize: number;
    deepQueueSize: number;
    snapshotLowWatermark: number;
    deepLowWatermark: number;
    tokenPoolHealth: Pick<
      GitHubTokenPoolDiagnostics,
      | 'cooldownTokenCount'
      | 'disabledTokenCount'
      | 'lastKnownRateLimitStatus'
      | 'anonymousFallback'
    >;
  }) {
    await this.ensureState();
    const state = this.ensureLocalState();
    const now = Date.now();
    const minConcurrency = this.resolveMinConcurrency();
    const maxConcurrency = this.resolveMaxConcurrency();
    const scaleUpStep = this.readInt('GITHUB_SEARCH_SCALE_UP_STEP', 2);
    const scaleDownStep = this.readInt('GITHUB_SEARCH_SCALE_DOWN_STEP', 2);
    const adjustCooldownMs = this.resolveAdjustCooldownMs();
    const recent = this.getRecentMetrics(now);
    const highLatencyThresholdMs = this.readInt(
      'GITHUB_SEARCH_HIGH_LATENCY_MS',
      20_000,
    );
    const retryPressureThreshold = this.readInt(
      'GITHUB_SEARCH_RETRY_PRESSURE_THRESHOLD',
      3,
    );
    const stableCyclesRequired = this.readInt(
      'GITHUB_SEARCH_STABLE_CYCLES_REQUIRED',
      2,
    );

    const underPressure =
      args.tokenPoolHealth.anonymousFallback ||
      args.tokenPoolHealth.disabledTokenCount > 0 ||
      args.tokenPoolHealth.cooldownTokenCount > 0 ||
      Boolean(args.tokenPoolHealth.lastKnownRateLimitStatus?.limited) ||
      recent.rateLimitHits > 0 ||
      recent.retryCount >= retryPressureThreshold ||
      (recent.averageLatencyMs ?? 0) >= highLatencyThresholdMs;
    const queuesHungry =
      args.snapshotQueueSize < args.snapshotLowWatermark &&
      args.deepQueueSize < args.deepLowWatermark;
    const healthy =
      !args.tokenPoolHealth.anonymousFallback &&
      args.tokenPoolHealth.disabledTokenCount === 0 &&
      args.tokenPoolHealth.cooldownTokenCount === 0 &&
      !args.tokenPoolHealth.lastKnownRateLimitStatus?.limited &&
      recent.rateLimitHits === 0 &&
      recent.retryCount <= 1 &&
      (recent.averageLatencyMs === null ||
        recent.averageLatencyMs < highLatencyThresholdMs * 0.7);

    let nextConcurrency = state.currentConcurrency;
    let adjustmentReason = state.adjustmentReason;

    if (underPressure) {
      state.stablePeriods = 0;

      if (
        now - this.toTimestamp(state.lastAdjustedAt) >= adjustCooldownMs &&
        state.currentConcurrency > minConcurrency
      ) {
        nextConcurrency = Math.max(
          minConcurrency,
          state.currentConcurrency - scaleDownStep,
        );
        adjustmentReason =
          recent.rateLimitHits > 0 ||
          Boolean(args.tokenPoolHealth.lastKnownRateLimitStatus?.limited)
            ? 'rate_limit_backoff'
            : args.tokenPoolHealth.cooldownTokenCount > 0
              ? 'token_cooldown_backoff'
              : args.tokenPoolHealth.disabledTokenCount > 0
                ? 'token_disabled_backoff'
                : recent.retryCount >= retryPressureThreshold
                  ? 'retry_pressure_backoff'
                  : 'search_latency_backoff';
      }
    } else if (healthy && queuesHungry) {
      state.stablePeriods += 1;

      if (
        state.stablePeriods >= stableCyclesRequired &&
        now - this.toTimestamp(state.lastAdjustedAt) >= adjustCooldownMs &&
        state.currentConcurrency < maxConcurrency
      ) {
        nextConcurrency = Math.min(
          maxConcurrency,
          state.currentConcurrency + scaleUpStep,
        );
        adjustmentReason = 'queues_hungry_scale_up';
        state.stablePeriods = 0;
      }
    } else {
      state.stablePeriods = 0;
      adjustmentReason = healthy ? 'balanced_hold' : adjustmentReason;
    }

    if (nextConcurrency !== state.currentConcurrency) {
      state.currentConcurrency = nextConcurrency;
      state.targetConcurrency = nextConcurrency;
      state.adjustmentReason = adjustmentReason;
      state.lastAdjustedAt = new Date(now).toISOString();
      await this.persistState();
      return this.getDiagnostics();
    }

    if (adjustmentReason !== state.adjustmentReason) {
      state.adjustmentReason = adjustmentReason;
      await this.persistState();
    }

    return this.getDiagnostics();
  }

  private getRecentMetrics(now = Date.now()) {
    this.pruneSamples(now);
    const windowMs = this.resolveAdjustIntervalMs();
    const lowerBound = now - windowMs;
    const recentSamples = this.samples.filter((sample) => sample.timestamp >= lowerBound);

    if (!recentSamples.length) {
      return {
        rateLimitHits: 0,
        retryCount: 0,
        averageLatencyMs: null as number | null,
      };
    }

    const rateLimitHits = recentSamples.reduce(
      (sum, sample) => sum + sample.rateLimitHits,
      0,
    );
    const retryCount = recentSamples.reduce(
      (sum, sample) => sum + sample.retryCount,
      0,
    );
    const averageLatencyMs = Math.round(
      recentSamples.reduce((sum, sample) => sum + sample.latencyMs, 0) /
        recentSamples.length,
    );

    return {
      rateLimitHits,
      retryCount,
      averageLatencyMs,
    };
  }

  private pruneSamples(now = Date.now()) {
    const retentionWindowMs = this.resolveAdjustIntervalMs() * 6;

    while (this.samples.length > 0) {
      const head = this.samples[0];

      if (now - head.timestamp <= retentionWindowMs) {
        break;
      }

      this.samples.shift();
    }
  }

  private async ensureState() {
    if (this.state) {
      return this.state;
    }

    if (!this.loadingState) {
      this.loadingState = this.loadState();
    }

    this.state = await this.loadingState;
    return this.state;
  }

  private ensureLocalState() {
    if (!this.state) {
      this.state = this.buildDefaultState();
    }

    return this.state;
  }

  private async loadState() {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: SEARCH_CONCURRENCY_STATE_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object' || Array.isArray(row.configValue)) {
      return this.buildDefaultState();
    }

    const value = row.configValue as Record<string, unknown>;
    const maxConcurrency = this.resolveMaxConcurrency();
    const minConcurrency = this.resolveMinConcurrency();
    const currentConcurrency = this.readIntValue(
      value.currentConcurrency,
      maxConcurrency,
    );
    const targetConcurrency = this.readIntValue(
      value.targetConcurrency,
      currentConcurrency,
    );

    return {
      currentConcurrency: this.clamp(currentConcurrency, minConcurrency, maxConcurrency),
      targetConcurrency: this.clamp(targetConcurrency, minConcurrency, maxConcurrency),
      adjustmentReason: this.toNullableString(value.adjustmentReason),
      lastAdjustedAt: this.toNullableString(value.lastAdjustedAt),
      lastRateLimitAt: this.toNullableString(value.lastRateLimitAt),
      lastRetryAt: this.toNullableString(value.lastRetryAt),
      stablePeriods: this.readIntValue(value.stablePeriods, 0),
    } satisfies SearchConcurrencyState;
  }

  private async persistState() {
    const state = this.ensureLocalState();

    await this.prisma.systemConfig.upsert({
      where: {
        configKey: SEARCH_CONCURRENCY_STATE_CONFIG_KEY,
      },
      update: {
        configValue: state as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: SEARCH_CONCURRENCY_STATE_CONFIG_KEY,
        configValue: state as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private buildDefaultState(): SearchConcurrencyState {
    const maxConcurrency = this.resolveMaxConcurrency();

    return {
      currentConcurrency: maxConcurrency,
      targetConcurrency: maxConcurrency,
      adjustmentReason: 'boot_default',
      lastAdjustedAt: null,
      lastRateLimitAt: null,
      lastRetryAt: null,
      stablePeriods: 0,
    };
  }

  private resolveMaxConcurrency() {
    return this.clamp(
      this.readInt('GITHUB_SEARCH_MAX_CONCURRENCY', 8),
      1,
      8,
    );
  }

  private resolveMinConcurrency() {
    return this.clamp(
      this.readInt('GITHUB_SEARCH_MIN_CONCURRENCY', 4),
      1,
      this.resolveMaxConcurrency(),
    );
  }

  private resolveAdjustIntervalMs() {
    return this.readInt('GITHUB_SEARCH_ADJUST_INTERVAL_MS', 60_000);
  }

  private resolveAdjustCooldownMs() {
    return this.readInt(
      'GITHUB_SEARCH_ADJUST_COOLDOWN_MS',
      this.resolveAdjustIntervalMs() * 2,
    );
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private readIntValue(value: unknown, fallback: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return parsed;
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

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
}
