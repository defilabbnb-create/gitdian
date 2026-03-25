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
  ClaudeConcurrencyService,
  ClaudeReviewPriority,
} from './claude-concurrency.service';
import { IdeaExtractService } from './idea-extract.service';
import { OneLinerStrength } from './helpers/one-liner-strength.helper';

export type SelfTuningLoadLevel = 'NORMAL' | 'HIGH_LOAD' | 'EXTREME';
export type TelegramSelectionMode = 'MIXED' | 'STRONG_PREFERRED' | 'STRONG_ONLY';
export type StrengthPolicyMode = 'relaxed' | 'normal' | 'tightened' | 'strict' | 'disabled';

export type SelfTuningRuntimeMetrics = {
  snapshotQueueSize: number;
  deepQueueSize: number;
  ideaExtractTimeoutCount: number;
  ideaExtractDeferredCount: number;
  ideaExtractTimeoutRate: number;
  claudeLatencyMs: number | null;
  claudeErrorRate: number;
  claudeQueueSize: number;
  reposPerMinute: number;
  snapshotThroughput: number;
  deepThroughput: number;
  modelPressureScore: number;
  claudePressureScore: number;
  systemLoadLevel: SelfTuningLoadLevel;
};

export type SelfTuningState = {
  lastUpdatedAt: string | null;
  systemLoadLevel: SelfTuningLoadLevel;
  ideaExtractMaxInflight: number;
  claudeConcurrency: number;
  claudeAllowedPriorities: ClaudeReviewPriority[];
  telegramSelectionMode: TelegramSelectionMode;
  effectiveStrengthPolicy: {
    strong: Extract<StrengthPolicyMode, 'relaxed' | 'normal' | 'strict'>;
    medium: Extract<StrengthPolicyMode, 'normal' | 'tightened' | 'disabled'>;
    weak: 'disabled';
  };
  adjustmentReason: string | null;
  runtimeMetrics: SelfTuningRuntimeMetrics;
  lastDeepRuntimeCounters: {
    date: string | null;
    ideaExtractExecutedCount: number;
    ideaExtractTimeoutCount: number;
    ideaExtractDeferredCount: number;
  };
};

const SELF_TUNING_CONFIG_KEY = 'github.self_tuning.state';
const DEEP_RUNTIME_STATS_CONFIG_KEY = 'analysis.deep.runtime_stats';
const THROUGHPUT_WINDOW_MS = 5 * 60 * 1000;

export function computeSystemLoadLevel(input: {
  snapshotQueueSize: number;
  ideaExtractTimeoutRate: number;
}): SelfTuningLoadLevel {
  if (
    input.snapshotQueueSize >= 1500 ||
    input.ideaExtractTimeoutRate > 0.15
  ) {
    return 'EXTREME';
  }

  if (
    input.snapshotQueueSize >= 800 ||
    input.ideaExtractTimeoutRate > 0.05
  ) {
    return 'HIGH_LOAD';
  }

  return 'NORMAL';
}

export function computeEffectiveStrength(
  baseStrength: OneLinerStrength | null | undefined,
  systemLoadLevel: SelfTuningLoadLevel,
): OneLinerStrength | null {
  if (!baseStrength) {
    return null;
  }

  if (systemLoadLevel === 'EXTREME' && baseStrength === 'MEDIUM') {
    return 'WEAK';
  }

  return baseStrength;
}

export function buildSelfTuningPolicy(systemLoadLevel: SelfTuningLoadLevel) {
  switch (systemLoadLevel) {
    case 'EXTREME':
      return {
        ideaExtractMaxInflight: 1,
        claudeConcurrency: 1,
        claudeAllowedPriorities: ['P0'] as ClaudeReviewPriority[],
        telegramSelectionMode: 'STRONG_ONLY' as TelegramSelectionMode,
        effectiveStrengthPolicy: {
          strong: 'strict' as const,
          medium: 'disabled' as const,
          weak: 'disabled' as const,
        },
      };
    case 'HIGH_LOAD':
      return {
        ideaExtractMaxInflight: 2,
        claudeConcurrency: 3,
        claudeAllowedPriorities: ['P0', 'P1'] as ClaudeReviewPriority[],
        telegramSelectionMode: 'STRONG_PREFERRED' as TelegramSelectionMode,
        effectiveStrengthPolicy: {
          strong: 'normal' as const,
          medium: 'tightened' as const,
          weak: 'disabled' as const,
        },
      };
    case 'NORMAL':
    default:
      return {
        ideaExtractMaxInflight: 3,
        claudeConcurrency: 6,
        claudeAllowedPriorities: ['P0', 'P1', 'P2'] as ClaudeReviewPriority[],
        telegramSelectionMode: 'MIXED' as TelegramSelectionMode,
        effectiveStrengthPolicy: {
          strong: 'relaxed' as const,
          medium: 'normal' as const,
          weak: 'disabled' as const,
        },
      };
  }
}

@Injectable()
export class SelfTuningService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SelfTuningService.name);
  private state: SelfTuningState | null = null;
  private loadPromise: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly claudeConcurrencyService: ClaudeConcurrencyService,
    private readonly ideaExtractService: IdeaExtractService,
  ) {}

  onModuleInit() {
    void this.ensureLoaded();

    if (process.env.ENABLE_QUEUE_WORKERS !== 'true') {
      return;
    }

    const intervalMs = this.readInt('SELF_TUNING_INTERVAL_MS', 60_000);
    this.timer = setInterval(() => {
      void this.evaluateAndPersist('interval');
    }, intervalMs);
    void this.evaluateAndPersist('boot');
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async getState() {
    await this.ensureLoaded();
    return {
      ...this.ensureState(),
      claudeAllowedPriorities: [...this.ensureState().claudeAllowedPriorities],
      effectiveStrengthPolicy: {
        ...this.ensureState().effectiveStrengthPolicy,
      },
      runtimeMetrics: {
        ...this.ensureState().runtimeMetrics,
      },
      lastDeepRuntimeCounters: {
        ...this.ensureState().lastDeepRuntimeCounters,
      },
    };
  }

  async getLoadLevel() {
    return (await this.getState()).systemLoadLevel;
  }

  async getEffectiveStrength(baseStrength: OneLinerStrength | null | undefined) {
    const state = await this.getState();
    return computeEffectiveStrength(baseStrength, state.systemLoadLevel);
  }

  async getCurrentPolicy() {
    const state = await this.getState();
    return {
      systemLoadLevel: state.systemLoadLevel,
      ideaExtractMaxInflight: state.ideaExtractMaxInflight,
      claudeConcurrency: state.claudeConcurrency,
      claudeAllowedPriorities: state.claudeAllowedPriorities,
      telegramSelectionMode: state.telegramSelectionMode,
      effectiveStrengthPolicy: state.effectiveStrengthPolicy,
      adjustmentReason: state.adjustmentReason,
      runtimeMetrics: state.runtimeMetrics,
    };
  }

  async evaluateAndPersist(reason = 'interval') {
    await this.ensureLoaded();
    const previous = this.ensureState();
    const claudeDiagnostics = await this.readClaudeDiagnostics();
    const [snapshotQueue, deepQueue, deepRuntimeStats, throughput] =
      await Promise.all([
        this.queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SNAPSHOT),
        this.queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SINGLE),
        this.readDeepRuntimeStats(),
        this.readThroughputMetrics(),
      ]);
    const deltas = this.computeDeepRuntimeDeltas(
      previous.lastDeepRuntimeCounters,
      deepRuntimeStats,
    );
    const denominator = Math.max(
      1,
      deltas.ideaExtractExecutedCount +
        deltas.ideaExtractDeferredCount +
        deltas.ideaExtractTimeoutCount,
    );
    const timeoutRate = deltas.ideaExtractTimeoutCount / denominator;
    const loadLevel = computeSystemLoadLevel({
      snapshotQueueSize: snapshotQueue.total,
      ideaExtractTimeoutRate: timeoutRate,
    });
    const policy = buildSelfTuningPolicy(loadLevel);
    const runtimeMetrics: SelfTuningRuntimeMetrics = {
      snapshotQueueSize: snapshotQueue.total,
      deepQueueSize: deepQueue.total,
      ideaExtractTimeoutCount: deltas.ideaExtractTimeoutCount,
      ideaExtractDeferredCount: deltas.ideaExtractDeferredCount,
      ideaExtractTimeoutRate: Number(timeoutRate.toFixed(3)),
      claudeLatencyMs: claudeDiagnostics.recentLatency ?? null,
      claudeErrorRate: Number((claudeDiagnostics.recentErrorRate ?? 0).toFixed(3)),
      claudeQueueSize: claudeDiagnostics.pendingCount ?? 0,
      reposPerMinute: throughput.reposPerMinute,
      snapshotThroughput: throughput.snapshotThroughput,
      deepThroughput: throughput.deepThroughput,
      modelPressureScore: this.computeModelPressureScore({
        snapshotQueueSize: snapshotQueue.total,
        deepQueueSize: deepQueue.total,
        timeoutRate,
        deferredCount: deltas.ideaExtractDeferredCount,
      }),
      claudePressureScore: this.computeClaudePressureScore({
        latencyMs: claudeDiagnostics.recentLatency ?? null,
        errorRate: claudeDiagnostics.recentErrorRate ?? 0,
        queueSize: claudeDiagnostics.pendingCount ?? 0,
      }),
      systemLoadLevel: loadLevel,
    };

    this.ideaExtractService.setRuntimeMaxInflight(policy.ideaExtractMaxInflight);

    const adjustmentReason = [
      reason,
      `load_${loadLevel.toLowerCase()}`,
      `snapshot_${snapshotQueue.total}`,
      `timeout_${Math.round(timeoutRate * 100)}`,
    ].join(':');

    const nextState: SelfTuningState = {
      lastUpdatedAt: new Date().toISOString(),
      systemLoadLevel: loadLevel,
      ideaExtractMaxInflight: policy.ideaExtractMaxInflight,
      claudeConcurrency:
        typeof claudeDiagnostics.currentConcurrency === 'number'
          ? claudeDiagnostics.currentConcurrency
          : policy.claudeConcurrency,
      claudeAllowedPriorities: [...policy.claudeAllowedPriorities],
      telegramSelectionMode: policy.telegramSelectionMode,
      effectiveStrengthPolicy: {
        ...policy.effectiveStrengthPolicy,
      },
      adjustmentReason,
      runtimeMetrics,
      lastDeepRuntimeCounters: {
        date: deepRuntimeStats.date,
        ideaExtractExecutedCount: deepRuntimeStats.ideaExtractExecutedCount,
        ideaExtractTimeoutCount: deepRuntimeStats.ideaExtractTimeoutCount,
        ideaExtractDeferredCount: deepRuntimeStats.ideaExtractDeferredCount,
      },
    };

    this.state = nextState;
    await this.persistState(nextState);

    if (
      previous.systemLoadLevel !== nextState.systemLoadLevel ||
      previous.ideaExtractMaxInflight !== nextState.ideaExtractMaxInflight ||
      previous.claudeConcurrency !== nextState.claudeConcurrency
    ) {
      this.logger.log(
        `self_tuning_adjustment loadLevel=${nextState.systemLoadLevel} ideaExtractMaxInflight=${nextState.ideaExtractMaxInflight} claudeConcurrency=${nextState.claudeConcurrency} reason=${adjustmentReason}`,
      );
    }

    return nextState;
  }

  private async ensureLoaded() {
    if (this.state) {
      return;
    }

    if (!this.loadPromise) {
      this.loadPromise = this.loadState();
    }

    await this.loadPromise;
    this.loadPromise = null;
  }

  private async loadState() {
    const existing = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: SELF_TUNING_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    this.state = this.readState(existing?.configValue);
  }

  private ensureState(): SelfTuningState {
    if (!this.state) {
      this.state = this.buildDefaultState();
    }

    return this.state;
  }

  private buildDefaultState(): SelfTuningState {
    const policy = buildSelfTuningPolicy('NORMAL');
    return {
      lastUpdatedAt: null,
      systemLoadLevel: 'NORMAL',
      ideaExtractMaxInflight: policy.ideaExtractMaxInflight,
      claudeConcurrency: policy.claudeConcurrency,
      claudeAllowedPriorities: [...policy.claudeAllowedPriorities],
      telegramSelectionMode: policy.telegramSelectionMode,
      effectiveStrengthPolicy: {
        ...policy.effectiveStrengthPolicy,
      },
      adjustmentReason: 'default_normal',
      runtimeMetrics: {
        snapshotQueueSize: 0,
        deepQueueSize: 0,
        ideaExtractTimeoutCount: 0,
        ideaExtractDeferredCount: 0,
        ideaExtractTimeoutRate: 0,
        claudeLatencyMs: null,
        claudeErrorRate: 0,
        claudeQueueSize: 0,
        reposPerMinute: 0,
        snapshotThroughput: 0,
        deepThroughput: 0,
        modelPressureScore: 0,
        claudePressureScore: 0,
        systemLoadLevel: 'NORMAL',
      },
      lastDeepRuntimeCounters: {
        date: null,
        ideaExtractExecutedCount: 0,
        ideaExtractTimeoutCount: 0,
        ideaExtractDeferredCount: 0,
      },
    };
  }

  private readState(value: Prisma.JsonValue | null | undefined): SelfTuningState {
    const defaults = this.buildDefaultState();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return defaults;
    }

    const record = value as Record<string, unknown>;
    const runtimeMetrics =
      record.runtimeMetrics && typeof record.runtimeMetrics === 'object'
        ? (record.runtimeMetrics as Record<string, unknown>)
        : {};
    const lastDeepRuntimeCounters =
      record.lastDeepRuntimeCounters && typeof record.lastDeepRuntimeCounters === 'object'
        ? (record.lastDeepRuntimeCounters as Record<string, unknown>)
        : {};

    return {
      lastUpdatedAt: this.readString(record.lastUpdatedAt),
      systemLoadLevel:
        this.normalizeLoadLevel(record.systemLoadLevel) ?? defaults.systemLoadLevel,
      ideaExtractMaxInflight: this.readIntLike(
        record.ideaExtractMaxInflight,
        defaults.ideaExtractMaxInflight,
      ),
      claudeConcurrency: this.readIntLike(
        record.claudeConcurrency,
        defaults.claudeConcurrency,
      ),
      claudeAllowedPriorities: this.normalizePriorities(
        record.claudeAllowedPriorities,
        defaults.claudeAllowedPriorities,
      ),
      telegramSelectionMode:
        this.normalizeTelegramSelectionMode(record.telegramSelectionMode) ??
        defaults.telegramSelectionMode,
      effectiveStrengthPolicy: {
        strong:
          this.normalizeStrongStrengthMode(
            this.readRecord(record.effectiveStrengthPolicy)?.strong,
          ) ?? defaults.effectiveStrengthPolicy.strong,
        medium:
          this.normalizeMediumStrengthMode(
            this.readRecord(record.effectiveStrengthPolicy)?.medium,
          ) ?? defaults.effectiveStrengthPolicy.medium,
        weak: 'disabled',
      },
      adjustmentReason:
        this.readString(record.adjustmentReason) ?? defaults.adjustmentReason,
      runtimeMetrics: {
        snapshotQueueSize: this.readIntLike(
          runtimeMetrics.snapshotQueueSize,
          defaults.runtimeMetrics.snapshotQueueSize,
        ),
        deepQueueSize: this.readIntLike(
          runtimeMetrics.deepQueueSize,
          defaults.runtimeMetrics.deepQueueSize,
        ),
        ideaExtractTimeoutCount: this.readIntLike(
          runtimeMetrics.ideaExtractTimeoutCount,
          defaults.runtimeMetrics.ideaExtractTimeoutCount,
        ),
        ideaExtractDeferredCount: this.readIntLike(
          runtimeMetrics.ideaExtractDeferredCount,
          defaults.runtimeMetrics.ideaExtractDeferredCount,
        ),
        ideaExtractTimeoutRate: this.readNullableNumber(
          runtimeMetrics.ideaExtractTimeoutRate,
          defaults.runtimeMetrics.ideaExtractTimeoutRate,
        ) ?? 0,
        claudeLatencyMs: this.readNullableNumber(
          runtimeMetrics.claudeLatencyMs,
          defaults.runtimeMetrics.claudeLatencyMs,
        ),
        claudeErrorRate: this.readNullableNumber(
          runtimeMetrics.claudeErrorRate,
          defaults.runtimeMetrics.claudeErrorRate,
        ) ?? 0,
        claudeQueueSize: this.readIntLike(
          runtimeMetrics.claudeQueueSize,
          defaults.runtimeMetrics.claudeQueueSize,
        ),
        reposPerMinute: this.readNullableNumber(
          runtimeMetrics.reposPerMinute,
          defaults.runtimeMetrics.reposPerMinute,
        ) ?? 0,
        snapshotThroughput: this.readNullableNumber(
          runtimeMetrics.snapshotThroughput,
          defaults.runtimeMetrics.snapshotThroughput,
        ) ?? 0,
        deepThroughput: this.readNullableNumber(
          runtimeMetrics.deepThroughput,
          defaults.runtimeMetrics.deepThroughput,
        ) ?? 0,
        modelPressureScore: this.readNullableNumber(
          runtimeMetrics.modelPressureScore,
          defaults.runtimeMetrics.modelPressureScore,
        ) ?? 0,
        claudePressureScore: this.readNullableNumber(
          runtimeMetrics.claudePressureScore,
          defaults.runtimeMetrics.claudePressureScore,
        ) ?? 0,
        systemLoadLevel:
          this.normalizeLoadLevel(runtimeMetrics.systemLoadLevel) ??
          defaults.runtimeMetrics.systemLoadLevel,
      },
      lastDeepRuntimeCounters: {
        date: this.readString(lastDeepRuntimeCounters.date),
        ideaExtractExecutedCount: this.readIntLike(
          lastDeepRuntimeCounters.ideaExtractExecutedCount,
          defaults.lastDeepRuntimeCounters.ideaExtractExecutedCount,
        ),
        ideaExtractTimeoutCount: this.readIntLike(
          lastDeepRuntimeCounters.ideaExtractTimeoutCount,
          defaults.lastDeepRuntimeCounters.ideaExtractTimeoutCount,
        ),
        ideaExtractDeferredCount: this.readIntLike(
          lastDeepRuntimeCounters.ideaExtractDeferredCount,
          defaults.lastDeepRuntimeCounters.ideaExtractDeferredCount,
        ),
      },
    };
  }

  private async persistState(state: SelfTuningState) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: SELF_TUNING_CONFIG_KEY,
      },
      update: {
        configValue: state as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: SELF_TUNING_CONFIG_KEY,
        configValue: state as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async readClaudeDiagnostics() {
    if (this.claudeConcurrencyService.isAdaptiveEnabled()) {
      return this.claudeConcurrencyService.evaluateAndAdjust();
    }

    return this.claudeConcurrencyService.getDiagnostics();
  }

  private async readDeepRuntimeStats() {
    const value = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: DEEP_RUNTIME_STATS_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });
    const record = this.readRecord(value?.configValue);

    return {
      date: this.readString(record?.date),
      ideaExtractExecutedCount: this.readIntLike(
        record?.ideaExtractExecutedCount,
        0,
      ),
      ideaExtractTimeoutCount: this.readIntLike(
        record?.ideaExtractTimeoutCount,
        0,
      ),
      ideaExtractDeferredCount: this.readIntLike(
        record?.ideaExtractDeferredCount,
        0,
      ),
    };
  }

  private computeDeepRuntimeDeltas(
    previous: SelfTuningState['lastDeepRuntimeCounters'],
    current: {
      date: string | null;
      ideaExtractExecutedCount: number;
      ideaExtractTimeoutCount: number;
      ideaExtractDeferredCount: number;
    },
  ) {
    if (!previous.date || previous.date !== current.date) {
      return {
        ideaExtractExecutedCount: current.ideaExtractExecutedCount,
        ideaExtractTimeoutCount: current.ideaExtractTimeoutCount,
        ideaExtractDeferredCount: current.ideaExtractDeferredCount,
      };
    }

    return {
      ideaExtractExecutedCount: Math.max(
        0,
        current.ideaExtractExecutedCount - previous.ideaExtractExecutedCount,
      ),
      ideaExtractTimeoutCount: Math.max(
        0,
        current.ideaExtractTimeoutCount - previous.ideaExtractTimeoutCount,
      ),
      ideaExtractDeferredCount: Math.max(
        0,
        current.ideaExtractDeferredCount - previous.ideaExtractDeferredCount,
      ),
    };
  }

  private async readThroughputMetrics() {
    const windowStart = new Date(Date.now() - THROUGHPUT_WINDOW_MS);
    const jobs = await this.prisma.jobLog.findMany({
      where: {
        finishedAt: {
          gte: windowStart,
        },
        jobStatus: 'SUCCESS',
        jobName: {
          in: [QUEUE_NAMES.ANALYSIS_SNAPSHOT, QUEUE_NAMES.ANALYSIS_SINGLE],
        },
      },
      select: {
        jobName: true,
      },
    });
    const minutes = THROUGHPUT_WINDOW_MS / 60_000;
    const snapshotCount = jobs.filter(
      (job) => job.jobName === QUEUE_NAMES.ANALYSIS_SNAPSHOT,
    ).length;
    const deepCount = jobs.filter(
      (job) => job.jobName === QUEUE_NAMES.ANALYSIS_SINGLE,
    ).length;

    return {
      reposPerMinute: Number(((snapshotCount + deepCount) / minutes).toFixed(2)),
      snapshotThroughput: Number((snapshotCount / minutes).toFixed(2)),
      deepThroughput: Number((deepCount / minutes).toFixed(2)),
    };
  }

  private computeModelPressureScore(input: {
    snapshotQueueSize: number;
    deepQueueSize: number;
    timeoutRate: number;
    deferredCount: number;
  }) {
    const snapshotPressure = this.clamp(input.snapshotQueueSize / 1500, 0, 1);
    const deepPressure = this.clamp(input.deepQueueSize / 20, 0, 1);
    const timeoutPressure = this.clamp(input.timeoutRate / 0.15, 0, 1);
    const deferredPressure = this.clamp(input.deferredCount / 5, 0, 1);

    return Number(
      (
        snapshotPressure * 0.4 +
        deepPressure * 0.2 +
        timeoutPressure * 0.3 +
        deferredPressure * 0.1
      ).toFixed(3),
    );
  }

  private computeClaudePressureScore(input: {
    latencyMs: number | null;
    errorRate: number;
    queueSize: number;
  }) {
    const latencyPressure = this.clamp((input.latencyMs ?? 0) / 30_000, 0, 1);
    const errorPressure = this.clamp(input.errorRate / 0.15, 0, 1);
    const queuePressure = this.clamp(input.queueSize / 12, 0, 1);

    return Number(
      (latencyPressure * 0.4 + errorPressure * 0.4 + queuePressure * 0.2).toFixed(3),
    );
  }

  private normalizeLoadLevel(value: unknown): SelfTuningLoadLevel | null {
    const normalized = this.readString(value)?.toUpperCase();
    if (
      normalized === 'NORMAL' ||
      normalized === 'HIGH_LOAD' ||
      normalized === 'EXTREME'
    ) {
      return normalized;
    }

    return null;
  }

  private normalizeTelegramSelectionMode(
    value: unknown,
  ): TelegramSelectionMode | null {
    const normalized = this.readString(value)?.toUpperCase();
    if (
      normalized === 'MIXED' ||
      normalized === 'STRONG_PREFERRED' ||
      normalized === 'STRONG_ONLY'
    ) {
      return normalized;
    }

    return null;
  }

  private normalizeStrongStrengthMode(
    value: unknown,
  ): Extract<StrengthPolicyMode, 'relaxed' | 'normal' | 'strict'> | null {
    const normalized = this.readString(value);
    if (normalized === 'relaxed' || normalized === 'normal' || normalized === 'strict') {
      return normalized;
    }

    return null;
  }

  private normalizeMediumStrengthMode(
    value: unknown,
  ): Extract<StrengthPolicyMode, 'normal' | 'tightened' | 'disabled'> | null {
    const normalized = this.readString(value);
    if (
      normalized === 'normal' ||
      normalized === 'tightened' ||
      normalized === 'disabled'
    ) {
      return normalized;
    }

    return null;
  }

  private normalizePriorities(
    value: unknown,
    fallback: ClaudeReviewPriority[],
  ) {
    if (!Array.isArray(value)) {
      return fallback;
    }

    const priorities = value.filter(
      (item) => item === 'P0' || item === 'P1' || item === 'P2' || item === 'P3',
    ) as ClaudeReviewPriority[];

    return priorities.length ? priorities : fallback;
  }

  private readRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private readIntLike(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value)
      : fallback;
  }

  private readInt(name: string, fallback: number) {
    const raw = process.env[name];
    if (!raw) {
      return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private readNullableNumber(value: unknown, fallback: number | null) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
}
