import { Prisma } from '@prisma/client';
import type { INestApplicationContext } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildTaskAnalysisCompletionReport,
  TaskAnalysisCompletionCliOptions,
  TaskAnalysisCompletionReportJson,
} from '../report-task-analysis-completion';
import { BehaviorMemoryService } from '../../modules/behavior-memory/behavior-memory.service';
import { HistoricalDataRecoveryService } from '../../modules/analysis/historical-data-recovery.service';
import { HistoricalRepairPriorityService } from '../../modules/analysis/historical-repair-priority.service';
import type { HistoricalRepairActionBreakdown } from '../../modules/analysis/helpers/historical-repair-priority.helper';
import type {
  HistoricalCleanupPurgeTarget,
  HistoricalCleanupReason,
  HistoricalCleanupState,
} from '../../modules/analysis/helpers/historical-cleanup-policy.helper';
import type {
  ModelTaskRouterCapabilityBreakdown,
  ModelTaskRouterFallbackBreakdown,
} from '../../modules/analysis/helpers/model-task-router.types';
import {
  emptyModelTaskRouterCapabilityBreakdown,
  emptyModelTaskRouterFallbackBreakdown,
} from '../../modules/analysis/helpers/model-task-router-decision.helper';

export type HealthSnapshotMode = 'GLOBAL' | 'RECENT';

export type DailyHealthSummary = {
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
  historicalRepairSummary: {
    visibleBrokenCount: number;
    highValueWeakCount: number;
    staleWatchCount: number;
    archiveOrNoiseCount: number;
    historicalTrustedButWeakCount: number;
    immediateFrontendDowngradeCount: number;
    evidenceCoverageRate: number;
    keyEvidenceMissingCount: number;
    evidenceConflictCount: number;
    evidenceWeakButVisibleCount: number;
    conflictDrivenDecisionRecalcCount: number;
    historicalRepairQueueCount: number;
    historicalRepairActionBreakdown: HistoricalRepairActionBreakdown;
    visibleBrokenActionBreakdown: HistoricalRepairActionBreakdown;
    highValueWeakActionBreakdown: HistoricalRepairActionBreakdown;
    queueActionBreakdown: HistoricalRepairActionBreakdown;
    freezeCandidateCount: number;
    archiveCandidateCount: number;
    purgeReadyCount: number;
    frozenReposStillVisibleCount: number;
    archivedReposStillScheduledCount: number;
    cleanupReasonBreakdown: Record<HistoricalCleanupReason, number>;
    cleanupStateDistribution: Record<HistoricalCleanupState, number>;
    purgeReadyTargetBreakdown: Record<HistoricalCleanupPurgeTarget, number>;
    routerCapabilityBreakdown: ModelTaskRouterCapabilityBreakdown;
    routerFallbackBreakdown: ModelTaskRouterFallbackBreakdown;
    routerReviewRequiredCount: number;
    routerDeterministicOnlyCount: number;
    frozenOrArchivedTaskSuppressedCount: number;
  };
};

export type DailyHealthGlobalSnapshot = {
  totalRepos: number;
  fullyAnalyzed: number;
  incomplete: number;
  deepCoverage: number;
  finalDecisionButNoDeep: number;
};

export type DailyHealthRecentSnapshot = {
  newRepos: number;
  recentTasks: number;
  recentFailures: number;
};

export type DailyHealthSnapshot = {
  generatedAt: string;
  summary: DailyHealthSummary;
  globalSnapshot: DailyHealthGlobalSnapshot;
  recentSnapshot: DailyHealthRecentSnapshot;
  rawReport: TaskAnalysisCompletionReportJson;
  recentRawReport: TaskAnalysisCompletionReportJson;
};

export function buildDailyHealthSnapshot(args: {
  report: TaskAnalysisCompletionReportJson;
  recentReport?: TaskAnalysisCompletionReportJson | null;
  behaviorState: Awaited<ReturnType<BehaviorMemoryService['getState']>>;
  historicalRepairReport?: Awaited<
    ReturnType<HistoricalRepairPriorityService['runPriorityReport']>
  > | null;
  historicalRepairQueueSummary?: Awaited<
    ReturnType<HistoricalDataRecoveryService['getHistoricalRepairQueueSummary']>
  > | null;
}) {
  const report = args.report;
  const recentReport = args.recentReport ?? args.report;
  const behaviorState = args.behaviorState;
  const historicalRepairReport = args.historicalRepairReport ?? null;
  const historicalRepairQueueSummary = args.historicalRepairQueueSummary ?? null;
  const summary = buildDailyHealthSummary(
    report,
    behaviorState,
    historicalRepairReport,
    historicalRepairQueueSummary,
  );
  const recentSummary = buildDailyHealthSummary(
    recentReport,
    behaviorState,
    historicalRepairReport,
    historicalRepairQueueSummary,
  );

  return {
    generatedAt: report.generatedAt,
    summary,
    globalSnapshot: buildGlobalSnapshot(summary),
    recentSnapshot: buildRecentSnapshot(recentReport, recentSummary),
    rawReport: report,
    recentRawReport: recentReport,
  } satisfies DailyHealthSnapshot;
}

export function stripDailyHealthRawReports(snapshot: DailyHealthSnapshot) {
  return {
    generatedAt: snapshot.generatedAt,
    summary: snapshot.summary,
    globalSnapshot: snapshot.globalSnapshot,
    recentSnapshot: snapshot.recentSnapshot,
  };
}

export async function collectDailyHealthMetrics(args: {
  app: INestApplicationContext;
  options?: Partial<TaskAnalysisCompletionCliOptions> & {
    mode?: HealthSnapshotMode;
  };
}) {
  const recentSinceDays = args.options?.sinceDays ?? 1;
  const requestedMode = args.options?.mode ?? 'GLOBAL';

  const buildOptionsForMode = (mode: HealthSnapshotMode): TaskAnalysisCompletionCliOptions => ({
    limit: args.options?.limit ?? 200,
    json: false,
    pretty: true,
    includeSamples: false,
    queueOnly: false,
    repoOnly: false,
    homepageOnly: false,
    sinceDays: mode === 'GLOBAL' ? null : recentSinceDays,
    onlyIncomplete: false,
    onlyFeatured: false,
    onlyConflicts: false,
  });

  const globalOptions = buildOptionsForMode('GLOBAL');
  const recentOptions = buildOptionsForMode('RECENT');
  const primaryOptions =
    requestedMode === 'RECENT' ? recentOptions : globalOptions;

  const auxiliaryDataPromise = Promise.all([
    args.app.get(BehaviorMemoryService).getState(),
    args.app.get(HistoricalRepairPriorityService).runPriorityReport(),
    args.app.get(HistoricalDataRecoveryService).getHistoricalRepairQueueSummary(),
  ]);

  const report = await buildTaskAnalysisCompletionReport(primaryOptions, args.app);
  const pairedReport = await buildTaskAnalysisCompletionReport(
    requestedMode === 'RECENT' ? globalOptions : recentOptions,
    args.app,
  );
  const [behaviorState, historicalRepairReport, historicalRepairQueueSummary] =
    await auxiliaryDataPromise;

  const globalReport = requestedMode === 'GLOBAL' ? report : pairedReport;
  const recentReport = requestedMode === 'RECENT' ? report : pairedReport;

  return buildDailyHealthSnapshot({
    report: globalReport,
    recentReport,
    behaviorState,
    historicalRepairReport,
    historicalRepairQueueSummary,
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
      configValue: toJsonValue(stripDailyHealthRawReports(args.snapshot)),
    },
    create: {
      configKey: 'health.daily.latest',
      configValue: toJsonValue(stripDailyHealthRawReports(args.snapshot)),
    },
  });
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function buildDailyHealthSummary(
  report: TaskAnalysisCompletionReportJson,
  behaviorState: Awaited<ReturnType<BehaviorMemoryService['getState']>>,
  historicalRepairReport?: Awaited<
    ReturnType<HistoricalRepairPriorityService['runPriorityReport']>
  > | null,
  historicalRepairQueueSummary?: Awaited<
    ReturnType<HistoricalDataRecoveryService['getHistoricalRepairQueueSummary']>
  > | null,
): DailyHealthSummary {
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
        const supportingEvidence = readStringArray(
          readObject(item)?.evidenceSupportingDimensions,
        );
        const evidenceCurrentAction = readString(
          readObject(item)?.evidenceCurrentAction,
        );
        const keyEvidenceMissingCount = readNumber(
          readObject(item)?.keyEvidenceMissingCount,
        );
        const hasStrongSupportingEvidence = supportingEvidence.some((dimension) =>
          ['monetization', 'problem', 'market', 'execution'].includes(dimension),
        );
        return (
          incomplete &&
          deepStatus !== 'COMPLETED' &&
          (evidenceCurrentAction === 'build' ||
            (hasStrongSupportingEvidence && keyEvidenceMissingCount === 0))
        );
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
    historicalRepairSummary: buildHistoricalRepairSummary(
      historicalRepairReport,
      historicalRepairQueueSummary,
    ),
  };
}

function buildGlobalSnapshot(summary: DailyHealthSummary): DailyHealthGlobalSnapshot {
  return {
    totalRepos: summary.repoSummary.totalRepos,
    fullyAnalyzed: summary.repoSummary.fullyAnalyzedRepos,
    incomplete: summary.repoSummary.incompleteRepos,
    deepCoverage:
      summary.repoSummary.deepDoneRepos / Math.max(1, summary.repoSummary.totalRepos),
    finalDecisionButNoDeep:
      summary.analysisGapSummary.finalDecisionButNoDeepCount,
  };
}

function buildRecentSnapshot(
  recentReport: TaskAnalysisCompletionReportJson,
  summary: DailyHealthSummary,
): DailyHealthRecentSnapshot {
  const recentTaskSummary = readObject(recentReport.taskSummary);
  const recentTasks =
    readNumber(recentTaskSummary?.totalTasks) ||
    summary.taskSummary.pendingCount +
      summary.taskSummary.runningCount +
      summary.taskSummary.completedCount +
      summary.taskSummary.failedCount +
      summary.taskSummary.stalledCount +
      summary.taskSummary.deferredCount;

  return {
    newRepos: summary.repoSummary.totalRepos,
    recentTasks,
    recentFailures: summary.taskSummary.failedCount,
  };
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

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));
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

function buildHistoricalRepairSummary(
  report:
    | Awaited<ReturnType<HistoricalRepairPriorityService['runPriorityReport']>>
    | null
    | undefined,
  queueSummary:
    | Awaited<ReturnType<HistoricalDataRecoveryService['getHistoricalRepairQueueSummary']>>
    | null
    | undefined,
): DailyHealthSummary['historicalRepairSummary'] {
  const emptyBreakdown = emptyHistoricalRepairActionBreakdown();

  if (!report) {
    return {
      visibleBrokenCount: 0,
      highValueWeakCount: 0,
      staleWatchCount: 0,
      archiveOrNoiseCount: 0,
      historicalTrustedButWeakCount: 0,
      immediateFrontendDowngradeCount: 0,
      evidenceCoverageRate: 0,
      keyEvidenceMissingCount: 0,
      evidenceConflictCount: 0,
      evidenceWeakButVisibleCount: 0,
      conflictDrivenDecisionRecalcCount: 0,
      historicalRepairQueueCount: queueSummary?.totalQueued ?? 0,
      historicalRepairActionBreakdown: emptyBreakdown,
      visibleBrokenActionBreakdown: emptyBreakdown,
      highValueWeakActionBreakdown: emptyBreakdown,
      queueActionBreakdown: mergeQueueActionBreakdown(queueSummary),
      freezeCandidateCount: 0,
      archiveCandidateCount: 0,
      purgeReadyCount: 0,
      frozenReposStillVisibleCount: 0,
      archivedReposStillScheduledCount: 0,
      cleanupReasonBreakdown: emptyCleanupReasonBreakdown(),
      cleanupStateDistribution: emptyCleanupStateDistribution(),
      purgeReadyTargetBreakdown: emptyPurgeReadyTargetBreakdown(),
      routerCapabilityBreakdown: emptyModelTaskRouterCapabilityBreakdown(),
      routerFallbackBreakdown: emptyModelTaskRouterFallbackBreakdown(),
      routerReviewRequiredCount: 0,
      routerDeterministicOnlyCount: 0,
      frozenOrArchivedTaskSuppressedCount: 0,
    };
  }

  const cleanupStateDistribution =
    report.summary.cleanupStateDistribution ?? emptyCleanupStateDistribution();
  const cleanupReasonBreakdown =
    report.summary.cleanupReasonBreakdown ?? emptyCleanupReasonBreakdown();
  const purgeReadyTargetBreakdown =
    report.summary.purgeReadyTargetBreakdown ??
    emptyPurgeReadyTargetBreakdown();

  return {
    visibleBrokenCount: report.summary.visibleBrokenCount,
    highValueWeakCount: report.summary.highValueWeakCount,
    staleWatchCount: report.summary.staleWatchCount,
    archiveOrNoiseCount: report.summary.archiveOrNoiseCount,
    historicalTrustedButWeakCount: report.summary.historicalTrustedButWeakCount,
    immediateFrontendDowngradeCount: report.summary.immediateFrontendDowngradeCount,
    evidenceCoverageRate: report.summary.evidenceCoverageRate,
    keyEvidenceMissingCount: report.summary.keyEvidenceMissingCount,
    evidenceConflictCount: report.summary.evidenceConflictCount,
    evidenceWeakButVisibleCount: report.summary.evidenceWeakButVisibleCount,
    conflictDrivenDecisionRecalcCount:
      report.summary.conflictDrivenDecisionRecalcCount,
    historicalRepairQueueCount: queueSummary?.totalQueued ?? 0,
    historicalRepairActionBreakdown: report.summary.actionBreakdown,
    visibleBrokenActionBreakdown: report.summary.visibleBrokenActionBreakdown,
    highValueWeakActionBreakdown: report.summary.highValueWeakActionBreakdown,
    queueActionBreakdown: mergeQueueActionBreakdown(queueSummary),
    freezeCandidateCount: report.summary.freezeCandidateCount,
    archiveCandidateCount: report.summary.archiveCandidateCount,
    purgeReadyCount: report.summary.purgeReadyCount,
    frozenReposStillVisibleCount: report.summary.frozenReposStillVisibleCount,
    archivedReposStillScheduledCount:
      report.summary.archivedReposStillScheduledCount,
    cleanupReasonBreakdown,
    cleanupStateDistribution,
    purgeReadyTargetBreakdown,
    routerCapabilityBreakdown:
      queueSummary?.routerCapabilityBreakdown ??
      emptyModelTaskRouterCapabilityBreakdown(),
    routerFallbackBreakdown:
      queueSummary?.routerFallbackBreakdown ??
      emptyModelTaskRouterFallbackBreakdown(),
    routerReviewRequiredCount: queueSummary?.routerReviewRequiredCount ?? 0,
    routerDeterministicOnlyCount:
      queueSummary?.routerDeterministicOnlyCount ?? 0,
    frozenOrArchivedTaskSuppressedCount:
      cleanupStateDistribution.freeze +
      cleanupStateDistribution.archive +
      cleanupStateDistribution.purge_ready,
  };
}

function mergeQueueActionBreakdown(
  queueSummary:
    | Awaited<ReturnType<HistoricalDataRecoveryService['getHistoricalRepairQueueSummary']>>
    | null
    | undefined,
): HistoricalRepairActionBreakdown {
  const breakdown = emptyHistoricalRepairActionBreakdown();
  if (!queueSummary) {
    return breakdown;
  }

  breakdown.downgrade_only = queueSummary.actionCounts.downgrade_only ?? 0;
  breakdown.refresh_only = queueSummary.actionCounts.refresh_only ?? 0;
  breakdown.evidence_repair = queueSummary.actionCounts.evidence_repair ?? 0;
  breakdown.deep_repair = queueSummary.actionCounts.deep_repair ?? 0;
  breakdown.decision_recalc = queueSummary.actionCounts.decision_recalc ?? 0;
  breakdown.archive = 0;
  return breakdown;
}

function emptyHistoricalRepairActionBreakdown(): HistoricalRepairActionBreakdown {
  return {
    downgrade_only: 0,
    refresh_only: 0,
    evidence_repair: 0,
    deep_repair: 0,
    decision_recalc: 0,
    archive: 0,
  };
}

function emptyCleanupReasonBreakdown(): Record<HistoricalCleanupReason, number> {
  return {
    low_value: 0,
    low_visibility: 0,
    low_quality: 0,
    long_tail_noise: 0,
    stale_inactive: 0,
    no_repair_roi: 0,
    archive_bucket: 0,
    trusted_ineligible: 0,
    repeated_low_signal: 0,
  };
}

function emptyCleanupStateDistribution(): Record<HistoricalCleanupState, number> {
  return {
    active: 0,
    freeze: 0,
    archive: 0,
    purge_ready: 0,
  };
}

function emptyPurgeReadyTargetBreakdown(): Record<
  HistoricalCleanupPurgeTarget,
  number
> {
  return {
    snapshot_outputs: 0,
    insight_outputs: 0,
    decision_outputs: 0,
    deep_outputs: 0,
    repair_logs: 0,
  };
}
