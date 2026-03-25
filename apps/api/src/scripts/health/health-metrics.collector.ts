import { Prisma } from '@prisma/client';
import type { INestApplicationContext } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildTaskAnalysisCompletionReport,
  TaskAnalysisCompletionCliOptions,
  TaskAnalysisCompletionReportJson,
} from '../report-task-analysis-completion';
import { BehaviorMemoryService } from '../../modules/behavior-memory/behavior-memory.service';

export type DailyHealthSnapshot = {
  generatedAt: string;
  summary: {
    taskSummary: {
      pendingCount: number;
      runningCount: number;
      completedCount: number;
      failedCount: number;
      stalledCount: number;
      deferredCount: number;
    };
    repoSummary: {
      totalRepos: number;
      snapshotDoneRepos: number;
      insightDoneRepos: number;
      displayReadyRepos: number;
      trustedDisplayReadyRepos: number;
      deepDoneRepos: number;
      reviewDoneRepos: number;
      fullyAnalyzedRepos: number;
      incompleteRepos: number;
      fallbackRepos: number;
      severeConflictRepos: number;
    };
    analysisGapSummary: {
      finalDecisionButNoDeepCount: number;
      deepQueuedButNotDoneCount: number;
      claudeEligibleButNotReviewedCount: number;
      fallbackButStillVisibleCount: number;
      mostCommonIncompleteReason: string | null;
    };
    homepageSummary: {
      homepageTotal: number;
      homepageIncomplete: number;
      homepageUnsafe: number;
      homepageFallback: number;
      homepageConflict: number;
      homepageNoDeepButStrong: number;
    };
    qualitySummary: {
      badTemplateCount: number;
      englishLeakCount: number;
      unclearUserCount: number;
      conflictCount: number;
      averageConfidence: number | null;
      badOneLinerCount: number;
    };
    displayQualitySummary: {
      noDeepButHasMonetization: number;
      noDeepButHasStrongWhy: number;
      fallbackButStrongHeadline: number;
      conflictVisibleCount: number;
    };
    queueSummary: {
      pendingCount: number;
      runningCount: number;
      completedCount: number;
      failedCount: number;
      stalledCount: number;
      deferredCount: number;
      snapshotQueueSize: number;
      deepQueueSize: number;
      claudeQueueSize: number;
    };
    exposureSummary: {
      homepageFeaturedRepos: number;
      homepageFeaturedIncomplete: number;
      dailySummaryTopRepos: number;
      dailySummaryTopIncomplete: number;
      telegramSentRepos: number;
      telegramSentIncomplete: number;
      moneyPriorityHighButIncomplete: number;
    };
    behaviorSummary: {
      actionLoopEntries: number;
      completedActions: number;
      droppedActions: number;
      preferenceSignalsCount: number;
      homepageAdaptedCount: number;
      successReasonCoverage: number;
      failureReasonCoverage: number;
      memoryHitRate: number;
      recommendationAdjustedByBehaviorCount: number;
      staleMemoryDecayCount: number;
      explainVisibleRate: number;
    };
  };
  rawReport: TaskAnalysisCompletionReportJson;
};

export function buildDailyHealthSnapshot(args: {
  report: TaskAnalysisCompletionReportJson;
  behaviorState: Awaited<ReturnType<BehaviorMemoryService['getState']>>;
}) {
  const report = args.report;
  const behaviorState = args.behaviorState;
  const homepageAudit = readObject(report.samples)?.homepageTop100Audit
    ? (readObject(report.samples)?.homepageTop100Audit as Record<string, unknown>)
    : null;
  const homepageItems = Array.isArray(homepageAudit?.items)
    ? (homepageAudit?.items as Array<Record<string, unknown>>)
    : [];
  const taskSummary = readObject(report.taskSummary);
  const repoSummary = readObject(report.repoSummary);
  const analysisGapSummary = readObject(report.analysisGapSummary);
  const qualitySummary = readObject(report.qualitySummary);
  const displayQualitySummary = readObject(report.displayQualitySummary);
  const exposureSummary = readObject(report.exposureSummary);
  const queueSummary = readObject(report.queueSummary);
  const snapshotQueue = readObject(queueSummary?.snapshotQueue);
  const deepQueue = readObject(queueSummary?.deepQueue);
  const claudeQueue = readObject(queueSummary?.claudeQueue);

  return {
    generatedAt: report.generatedAt,
    summary: {
      taskSummary: {
        pendingCount: readNumber(taskSummary?.pendingCount),
        runningCount: readNumber(taskSummary?.runningCount),
        completedCount: readNumber(taskSummary?.completedCount),
        failedCount: readNumber(taskSummary?.failedCount),
        stalledCount: readNumber(taskSummary?.stalledCount),
        deferredCount: readNumber(taskSummary?.deferredCount),
      },
      repoSummary: {
        totalRepos: readNumber(repoSummary?.totalRepos),
        snapshotDoneRepos: readNumber(repoSummary?.snapshotDoneRepos),
        insightDoneRepos: readNumber(repoSummary?.insightDoneRepos),
        displayReadyRepos: readNumber(repoSummary?.displayReadyRepos),
        trustedDisplayReadyRepos: readNumber(repoSummary?.trustedDisplayReadyRepos),
        deepDoneRepos: readNumber(repoSummary?.deepDoneRepos),
        reviewDoneRepos: readNumber(repoSummary?.reviewDoneRepos),
        fullyAnalyzedRepos: readNumber(repoSummary?.fullyAnalyzedRepos),
        incompleteRepos: readNumber(repoSummary?.incompleteRepos),
        fallbackRepos: readNumber(repoSummary?.fallbackRepos),
        severeConflictRepos: readNumber(repoSummary?.severeConflictRepos),
      },
      analysisGapSummary: {
        finalDecisionButNoDeepCount: readNumber(
          analysisGapSummary?.finalDecisionButNoDeepCount,
        ),
        deepQueuedButNotDoneCount: readNumber(
          analysisGapSummary?.deepQueuedButNotDoneCount,
        ),
        claudeEligibleButNotReviewedCount: readNumber(
          analysisGapSummary?.claudeEligibleButNotReviewedCount,
        ),
        fallbackButStillVisibleCount: readNumber(
          analysisGapSummary?.fallbackButStillVisibleCount,
        ),
        mostCommonIncompleteReason:
          readString(analysisGapSummary?.mostCommonIncompleteReason) ?? null,
      },
      homepageSummary: {
        homepageTotal: readNumber(homepageAudit?.total),
        homepageIncomplete: readNumber(homepageAudit?.incomplete),
        homepageUnsafe: readNumber(homepageAudit?.unsafe),
        homepageFallback: readNumber(homepageAudit?.fallback),
        homepageConflict: readNumber(homepageAudit?.severeConflict),
        homepageNoDeepButStrong: homepageItems.filter((item) => {
          const deepStatus = readString(item.deepAnalysisStatus);
          const incomplete = readBoolean(item.incomplete);
          const hasMonetization = Boolean(readString(item.monetizationLabel));
          const hasWhy = Boolean(readString(item.whyLabel));
          return incomplete && deepStatus !== 'COMPLETED' && (hasMonetization || hasWhy);
        }).length,
      },
      qualitySummary: {
        badTemplateCount: readNumber(qualitySummary?.templatePhraseCount),
        englishLeakCount: readNumber(qualitySummary?.englishLeakCount),
        unclearUserCount: readNumber(qualitySummary?.unclearUserCount),
        conflictCount: readNumber(qualitySummary?.headlineConflictCount),
        averageConfidence:
          qualitySummary && typeof qualitySummary.averageConfidence === 'number'
            ? qualitySummary.averageConfidence
            : null,
        badOneLinerCount: readNumber(qualitySummary?.badOneLinerCount),
      },
      displayQualitySummary: {
        noDeepButHasMonetization: readNumber(
          displayQualitySummary?.noDeepButHasMonetization,
        ),
        noDeepButHasStrongWhy: readNumber(
          displayQualitySummary?.noDeepButHasStrongWhy,
        ),
        fallbackButStrongHeadline: readNumber(
          displayQualitySummary?.fallbackButStrongHeadline,
        ),
        conflictVisibleCount: readNumber(displayQualitySummary?.conflictVisibleCount),
      },
      queueSummary: {
        pendingCount: readNumber(taskSummary?.pendingCount),
        runningCount: readNumber(taskSummary?.runningCount),
        completedCount: readNumber(taskSummary?.completedCount),
        failedCount: readNumber(taskSummary?.failedCount),
        stalledCount: readNumber(taskSummary?.stalledCount),
        deferredCount: readNumber(taskSummary?.deferredCount),
        snapshotQueueSize: readNumber(snapshotQueue?.total),
        deepQueueSize: readNumber(deepQueue?.total),
        claudeQueueSize: readNumber(claudeQueue?.queueSize),
      },
      exposureSummary: {
        homepageFeaturedRepos: readNumber(exposureSummary?.homepageFeaturedRepos),
        homepageFeaturedIncomplete: readNumber(
          exposureSummary?.homepageFeaturedIncomplete,
        ),
        dailySummaryTopRepos: readNumber(exposureSummary?.dailySummaryTopRepos),
        dailySummaryTopIncomplete: readNumber(
          exposureSummary?.dailySummaryTopIncomplete,
        ),
        telegramSentRepos: readNumber(exposureSummary?.telegramSentRepos),
        telegramSentIncomplete: readNumber(
          exposureSummary?.telegramSentIncomplete,
        ),
        moneyPriorityHighButIncomplete: readNumber(
          exposureSummary?.moneyPriorityHighButIncomplete,
        ),
      },
      behaviorSummary: {
        actionLoopEntries: behaviorState.recentActionOutcomes.length,
        completedActions: behaviorState.recentActionOutcomes.filter(
          (item) => item.outcome === 'SUCCESS',
        ).length,
        droppedActions: behaviorState.recentActionOutcomes.filter(
          (item) => item.outcome === 'DROPPED' || item.outcome === 'FAILED',
        ).length,
        preferenceSignalsCount:
          behaviorState.profile.preferredCategories.length +
          behaviorState.profile.avoidedCategories.length +
          behaviorState.profile.successPatterns.length +
          behaviorState.profile.failurePatterns.length,
        homepageAdaptedCount:
          behaviorState.runtimeStats.recommendationAdjustedByBehaviorCount,
        successReasonCoverage: behaviorState.metrics.successReasonCoverage,
        failureReasonCoverage: behaviorState.metrics.failureReasonCoverage,
        memoryHitRate: behaviorState.metrics.memoryHitRate,
        recommendationAdjustedByBehaviorCount:
          behaviorState.metrics.recommendationAdjustedByBehaviorCount,
        staleMemoryDecayCount: behaviorState.metrics.staleMemoryDecayCount,
        explainVisibleRate: behaviorState.metrics.explainVisibleRate,
      },
    },
    rawReport: report,
  } satisfies DailyHealthSnapshot;
}

export async function collectDailyHealthMetrics(args: {
  app: INestApplicationContext;
  options?: Partial<TaskAnalysisCompletionCliOptions>;
}) {
  const options: TaskAnalysisCompletionCliOptions = {
    limit: args.options?.limit ?? 200,
    json: false,
    pretty: true,
    includeSamples: true,
    queueOnly: false,
    repoOnly: false,
    homepageOnly: false,
    sinceDays: args.options?.sinceDays ?? 1,
    onlyIncomplete: false,
    onlyFeatured: false,
    onlyConflicts: false,
  };

  const [report, behaviorState] = await Promise.all([
    buildTaskAnalysisCompletionReport(options, args.app),
    args.app.get(BehaviorMemoryService).getState(),
  ]);

  return buildDailyHealthSnapshot({
    report,
    behaviorState,
  });
}

export async function persistDailyHealthSnapshot(args: {
  app: INestApplicationContext;
  snapshot: DailyHealthSnapshot;
}) {
  await args.app.get(PrismaService).systemConfig.upsert({
    where: {
      configKey: 'health.daily.latest',
    },
    update: {
      configValue: toJsonValue(args.snapshot),
    },
    create: {
      configKey: 'health.daily.latest',
      configValue: toJsonValue(args.snapshot),
    },
  });
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function readBoolean(value: unknown) {
  return value === true;
}
