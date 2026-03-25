import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BehaviorMemoryService } from '../behavior-memory/behavior-memory.service';
import type { HistoricalRecoveryAssessment } from '../analysis/helpers/historical-data-recovery.helper';
import { explainAdaptiveSchedulerDecision } from './adaptive-scheduler.explainer';
import {
  buildAdaptiveSchedulerDecision,
  buildAdaptiveSchedulerPriorityAdjustment,
} from './adaptive-scheduler.rules';
import {
  AdaptiveSchedulerDecision,
  AdaptiveSchedulerHealthInput,
  AdaptiveSchedulerPriorityAdjustment,
  AdaptiveSchedulerRepoContext,
  AdaptiveSchedulerState,
} from './adaptive-scheduler.types';

const SCHEDULER_STATE_CONFIG_KEY = 'scheduler.adaptive.state';
const HEALTH_STATE_CONFIG_KEY = 'health.daily.latest';
const DEFAULT_VERSION = 1;

@Injectable()
export class AdaptiveSchedulerService {
  private homepageCache:
    | {
        ids: Set<string>;
        expiresAt: number;
      }
    | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly behaviorMemoryService: BehaviorMemoryService,
  ) {}

  async getState(): Promise<AdaptiveSchedulerState | null> {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: SCHEDULER_STATE_CONFIG_KEY,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object') {
      return null;
    }

    return this.normalizeState(row.configValue);
  }

  async getLatestHealthInput(): Promise<AdaptiveSchedulerHealthInput | null> {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: HEALTH_STATE_CONFIG_KEY,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object') {
      return null;
    }

    const current = row.configValue as Record<string, unknown>;
    const summary = this.readObject(current.summary);
    const repoSummary = this.readObject(summary?.repoSummary);
    const gaps = this.readObject(summary?.analysisGapSummary);
    const queueSummary = this.readObject(summary?.queueSummary);
    const exposure = this.readObject(summary?.homepageSummary);
    const quality = this.readObject(summary?.qualitySummary);
    const exposureSummary = this.readObject(summary?.exposureSummary);

    if (
      !repoSummary ||
      !gaps ||
      !queueSummary ||
      !exposure ||
      !quality ||
      !exposureSummary
    ) {
      return null;
    }

    return {
      generatedAt: this.readString(current.generatedAt) ?? new Date().toISOString(),
      totalRepos: this.readNumber(repoSummary.totalRepos),
      deepDoneRepos: this.readNumber(repoSummary.deepDoneRepos),
      fullyAnalyzedRepos: this.readNumber(repoSummary.fullyAnalyzedRepos),
      incompleteRepos: this.readNumber(repoSummary.incompleteRepos),
      fallbackRepos: this.readNumber(repoSummary.fallbackRepos),
      severeConflictRepos: this.readNumber(repoSummary.severeConflictRepos),
      finalDecisionButNoDeepCount: this.readNumber(gaps.finalDecisionButNoDeepCount),
      deepQueuedButNotDoneCount: this.readNumber(gaps.deepQueuedButNotDoneCount),
      claudeEligibleButNotReviewedCount: this.readNumber(
        gaps.claudeEligibleButNotReviewedCount,
      ),
      fallbackButStillVisibleCount: this.readNumber(
        gaps.fallbackButStillVisibleCount,
      ),
      homepageTotal: this.readNumber(exposure.homepageTotal),
      homepageUnsafe: this.readNumber(exposure.homepageUnsafe),
      homepageIncomplete: this.readNumber(exposure.homepageIncomplete),
      homepageFallback: this.readNumber(exposure.homepageFallback),
      homepageConflict: this.readNumber(exposure.homepageConflict),
      homepageNoDeepButStrong: this.readNumber(exposure.homepageNoDeepButStrong),
      moneyPriorityHighButIncomplete: this.readNumber(
        exposureSummary.moneyPriorityHighButIncomplete,
      ),
      badTemplateCount: this.readNumber(quality.badTemplateCount),
      deepQueueSize: this.readNumber(queueSummary.deepQueueSize),
      snapshotQueueSize: this.readNumber(queueSummary.snapshotQueueSize),
      claudeQueueSize: this.readNumber(queueSummary.claudeQueueSize),
      pendingCount: this.readNumber(queueSummary.pendingCount),
      runningCount: this.readNumber(queueSummary.runningCount),
      failedCount: this.readNumber(queueSummary.failedCount),
      stalledCount: this.readNumber(queueSummary.stalledCount),
      mostCommonIncompleteReason:
        this.readString(gaps.mostCommonIncompleteReason) ?? null,
    };
  }

  async evaluate(options?: {
    apply?: boolean;
    healthInput?: AdaptiveSchedulerHealthInput | null;
  }): Promise<{
    applied: boolean;
    decision: AdaptiveSchedulerDecision;
    explanation: ReturnType<typeof explainAdaptiveSchedulerDecision>;
  }> {
    const previousState = await this.getState();
    const healthInput = options?.healthInput ?? (await this.getLatestHealthInput());

    if (!healthInput) {
      const fallbackHealth: AdaptiveSchedulerHealthInput = {
        generatedAt: new Date().toISOString(),
        totalRepos: 0,
        deepDoneRepos: 0,
        fullyAnalyzedRepos: 0,
        incompleteRepos: 0,
        fallbackRepos: 0,
        severeConflictRepos: 0,
        finalDecisionButNoDeepCount: 0,
        deepQueuedButNotDoneCount: 0,
        claudeEligibleButNotReviewedCount: 0,
        fallbackButStillVisibleCount: 0,
        homepageTotal: 0,
        homepageUnsafe: 0,
        homepageIncomplete: 0,
        homepageFallback: 0,
        homepageConflict: 0,
        homepageNoDeepButStrong: 0,
        moneyPriorityHighButIncomplete: 0,
        badTemplateCount: 0,
        deepQueueSize: 0,
        snapshotQueueSize: 0,
        claudeQueueSize: 0,
        pendingCount: 0,
        runningCount: 0,
        failedCount: 0,
        stalledCount: 0,
        mostCommonIncompleteReason: null,
      };
      const decision = buildAdaptiveSchedulerDecision(fallbackHealth, previousState);
      return {
        applied: false,
        decision,
        explanation: explainAdaptiveSchedulerDecision(decision),
      };
    }

    const decision = buildAdaptiveSchedulerDecision(healthInput, previousState);
    if (options?.apply) {
      await this.persistState({
        version: (previousState?.version ?? DEFAULT_VERSION - 1) + 1,
        ...decision,
      });
    }

    return {
      applied: options?.apply === true,
      decision,
      explanation: explainAdaptiveSchedulerDecision(decision),
    };
  }

  async getAnalysisPriorityAdjustment(
    repositoryId: string,
  ): Promise<AdaptiveSchedulerPriorityAdjustment> {
    const state = await this.getState();
    if (!state) {
      return {
        boost: 0,
        reasons: [],
        suppressed: false,
      };
    }

    const context = await this.loadRepositoryContext(repositoryId);
    return buildAdaptiveSchedulerPriorityAdjustment({ state, context });
  }

  async prioritizeRecoveryAssessments<T extends HistoricalRecoveryAssessment>(
    items: T[],
  ): Promise<T[]> {
    const state = await this.getState();
    if (!state || !items.length) {
      return items;
    }

    return items
      .slice()
      .sort((left, right) => this.scoreRecoveryItem(right, state) - this.scoreRecoveryItem(left, state));
  }

  private async loadRepositoryContext(
    repositoryId: string,
  ): Promise<AdaptiveSchedulerRepoContext> {
    const [repository, ranking, homepageCandidates, behaviorState] = await Promise.all([
      this.prisma.repository.findUnique({
        where: { id: repositoryId },
        select: {
          id: true,
          analysis: {
            select: {
              fallbackUsed: true,
              ideaFitJson: true,
              extractedIdeaJson: true,
              completenessJson: true,
              claudeReviewStatus: true,
            },
          },
        },
      }),
      this.prisma.repositoryCachedRanking.findUnique({
        where: {
          repoId: repositoryId,
        },
      }),
      this.getHomepageCandidateIds(),
      this.behaviorMemoryService.getState(),
    ]);

    const activeRepoIds = new Set(
      behaviorState.recentActionOutcomes
        .filter(
          (item) =>
            item.repoId &&
            (item.actionStatus === 'IN_PROGRESS' || item.actionStatus === 'VALIDATING'),
        )
        .map((item) => item.repoId),
    );

    const deepReady = Boolean(
      repository?.analysis?.ideaFitJson &&
        repository.analysis?.extractedIdeaJson &&
        repository.analysis?.completenessJson,
    );
    const reviewReady = repository?.analysis?.claudeReviewStatus === 'SUCCESS';
    const fallbackVisible =
      ranking?.decisionSource === 'fallback' || repository?.analysis?.fallbackUsed === true;
    const displayUnsafe =
      fallbackVisible || Boolean(ranking?.hasConflict || ranking?.needsRecheck);

    return {
      repoId: repositoryId,
      categoryLabel: null,
      projectType: null,
      moneyPriority: ranking?.moneyPriority ?? null,
      decisionSource: ranking?.decisionSource ?? null,
      hasConflict: Boolean(ranking?.hasConflict),
      needsRecheck: Boolean(ranking?.needsRecheck),
      fallbackVisible,
      incomplete: !deepReady,
      deepReady,
      reviewReady,
      displayUnsafe,
      homepageCandidate: homepageCandidates.has(repositoryId),
      highExposureCandidate: homepageCandidates.has(repositoryId),
      activeProject: activeRepoIds.has(repositoryId),
    };
  }

  private async getHomepageCandidateIds() {
    const now = Date.now();
    if (this.homepageCache && this.homepageCache.expiresAt > now) {
      return this.homepageCache.ids;
    }

    const [ranked, summaries] = await Promise.all([
      this.prisma.repositoryCachedRanking.findMany({
        select: {
          repoId: true,
        },
        orderBy: [
          { moneyScore: 'desc' },
          { updatedAt: 'desc' },
        ],
        take: 100,
      }),
      this.prisma.dailyRadarSummary.findMany({
        orderBy: {
          date: 'desc',
        },
        take: 7,
        select: {
          topRepositoryIds: true,
          topGoodRepositoryIds: true,
          topCloneRepositoryIds: true,
        },
      }),
    ]);

    const ids = new Set<string>(ranked.map((item) => item.repoId));
    for (const summary of summaries) {
      for (const value of [
        ...this.readStringArray(summary.topRepositoryIds),
        ...this.readStringArray(summary.topGoodRepositoryIds),
        ...this.readStringArray(summary.topCloneRepositoryIds),
      ]) {
        ids.add(value);
      }
    }

    this.homepageCache = {
      ids,
      expiresAt: now + 60_000,
    };

    return ids;
  }

  private scoreRecoveryItem(
    item: HistoricalRecoveryAssessment,
    state: AdaptiveSchedulerState,
  ) {
    let score = item.priority === 'P0' ? 100 : item.priority === 'P1' ? 60 : 20;

    if (item.metrics.homepageBadCard) {
      score += 40;
    }
    if (item.metrics.claudeConflict) {
      score += 30;
    }
    if (item.metrics.fallbackVisible) {
      score += 20;
    }
    if (item.metrics.incompleteAnalysisVisible) {
      score += 12;
    }

    switch (state.currentMode) {
      case 'HOMEPAGE_PROTECT':
        if (item.metrics.homepageBadCard) {
          score += 80;
        }
        if (!item.metrics.homepageBadCard && item.priority === 'P2') {
          score -= 20;
        }
        break;
      case 'DEEP_RECOVERY':
        if (item.stages.includes('L2')) {
          score += 60;
        }
        if (item.priority === 'P2') {
          score -= 15;
        }
        break;
      case 'FALLBACK_CLEANUP':
        if (item.metrics.fallbackVisible) {
          score += 80;
        }
        break;
      case 'CLAUDE_CATCHUP':
        if (item.metrics.claudeConflict) {
          score += 70;
        }
        if (!item.metrics.claudeConflict && item.priority === 'P2') {
          score -= 10;
        }
        break;
      case 'CRITICAL_BACKPRESSURE':
        if (item.priority === 'P2' && !item.metrics.homepageBadCard) {
          score -= 50;
        }
        if (item.metrics.homepageBadCard || item.metrics.claudeConflict) {
          score += 30;
        }
        break;
      case 'NORMAL':
      default:
        break;
    }

    return score;
  }

  private async persistState(state: AdaptiveSchedulerState) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: SCHEDULER_STATE_CONFIG_KEY,
      },
      update: {
        configValue: this.toJsonValue(state),
      },
      create: {
        configKey: SCHEDULER_STATE_CONFIG_KEY,
        configValue: this.toJsonValue(state),
      },
    });
  }

  private normalizeState(value: unknown): AdaptiveSchedulerState | null {
    const record = this.readObject(value);
    if (!record) {
      return null;
    }

    const queueWeights = this.readObject(record.queueWeights);
    const concurrencyTargets = this.readObject(record.concurrencyTargets);
    const healthSnapshot = this.readObject(record.healthSnapshot);

    if (!queueWeights || !concurrencyTargets || !healthSnapshot) {
      return null;
    }

    return {
      version: this.readNumber(record.version, DEFAULT_VERSION),
      currentMode:
        (this.readString(record.currentMode) as AdaptiveSchedulerState['currentMode']) ??
        'NORMAL',
      currentReasons: this.readStringArray(record.currentReasons),
      queueWeights: {
        snapshot: this.readNumber(queueWeights.snapshot, 1),
        deep: this.readNumber(queueWeights.deep, 1),
        claude: this.readNumber(queueWeights.claude, 1),
        recovery: this.readNumber(queueWeights.recovery, 1),
        homepageCandidate: this.readNumber(queueWeights.homepageCandidate, 1),
        highValueIncomplete: this.readNumber(queueWeights.highValueIncomplete, 1),
        fallbackRepair: this.readNumber(queueWeights.fallbackRepair, 1),
        longTail: this.readNumber(queueWeights.longTail, 1),
      },
      concurrencyTargets: {
        snapshot: this.readNumber(concurrencyTargets.snapshot, 12),
        deep: this.readNumber(concurrencyTargets.deep, 6),
        claude: this.readNumber(concurrencyTargets.claude, 2),
        recovery: this.readNumber(concurrencyTargets.recovery, 4),
      },
      updatedAt: this.readString(record.updatedAt) ?? new Date().toISOString(),
      nextReviewAt:
        this.readString(record.nextReviewAt) ??
        new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      queueWeightChanges: this.readStringArray(record.queueWeightChanges),
      priorityBoostedRepoCount: this.readNumber(record.priorityBoostedRepoCount),
      suppressedRepoCount: this.readNumber(record.suppressedRepoCount),
      homepageProtectedCount: this.readNumber(record.homepageProtectedCount),
      fallbackRecoveredCount: this.readNumber(record.fallbackRecoveredCount),
      deepRecoveryCount: this.readNumber(record.deepRecoveryCount),
      claudeCatchupCount: this.readNumber(record.claudeCatchupCount),
      healthSnapshot: {
        generatedAt:
          this.readString(healthSnapshot.generatedAt) ?? new Date().toISOString(),
        totalRepos: this.readNumber(healthSnapshot.totalRepos),
        deepDoneRepos: this.readNumber(healthSnapshot.deepDoneRepos),
        fullyAnalyzedRepos: this.readNumber(healthSnapshot.fullyAnalyzedRepos),
        incompleteRepos: this.readNumber(healthSnapshot.incompleteRepos),
        fallbackRepos: this.readNumber(healthSnapshot.fallbackRepos),
        severeConflictRepos: this.readNumber(healthSnapshot.severeConflictRepos),
        finalDecisionButNoDeepCount: this.readNumber(
          healthSnapshot.finalDecisionButNoDeepCount,
        ),
        deepQueuedButNotDoneCount: this.readNumber(
          healthSnapshot.deepQueuedButNotDoneCount,
        ),
        claudeEligibleButNotReviewedCount: this.readNumber(
          healthSnapshot.claudeEligibleButNotReviewedCount,
        ),
        fallbackButStillVisibleCount: this.readNumber(
          healthSnapshot.fallbackButStillVisibleCount,
        ),
        homepageTotal: this.readNumber(healthSnapshot.homepageTotal),
        homepageUnsafe: this.readNumber(healthSnapshot.homepageUnsafe),
        homepageIncomplete: this.readNumber(healthSnapshot.homepageIncomplete),
        homepageFallback: this.readNumber(healthSnapshot.homepageFallback),
        homepageConflict: this.readNumber(healthSnapshot.homepageConflict),
        homepageNoDeepButStrong: this.readNumber(
          healthSnapshot.homepageNoDeepButStrong,
        ),
        moneyPriorityHighButIncomplete: this.readNumber(
          healthSnapshot.moneyPriorityHighButIncomplete,
        ),
        badTemplateCount: this.readNumber(healthSnapshot.badTemplateCount),
        deepQueueSize: this.readNumber(healthSnapshot.deepQueueSize),
        snapshotQueueSize: this.readNumber(healthSnapshot.snapshotQueueSize),
        claudeQueueSize: this.readNumber(healthSnapshot.claudeQueueSize),
        pendingCount: this.readNumber(healthSnapshot.pendingCount),
        runningCount: this.readNumber(healthSnapshot.runningCount),
        failedCount: this.readNumber(healthSnapshot.failedCount),
        stalledCount: this.readNumber(healthSnapshot.stalledCount),
        mostCommonIncompleteReason:
          this.readString(healthSnapshot.mostCommonIncompleteReason) ?? null,
      },
    };
  }

  private readObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readString(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = String(value).trim();
    return normalized.length ? normalized : null;
  }

  private readStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => String(item ?? '').trim())
      .filter((item) => Boolean(item));
  }

  private readNumber(value: unknown, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
