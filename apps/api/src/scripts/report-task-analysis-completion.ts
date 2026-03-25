import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { JobStatus, Prisma, RepositoryStatus } from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  assessHistoricalRecoveryBatch,
  HistoricalRecoveryAssessment,
  HistoricalRecoverySignal,
} from '../modules/analysis/helpers/historical-data-recovery.helper';
import { RepositoryDecisionService } from '../modules/analysis/repository-decision.service';
import { QueueService } from '../modules/queue/queue.service';
import { QUEUE_JOB_TYPES, QUEUE_NAMES, QueueName } from '../modules/queue/queue.constants';
import {
  buildHumanSummary,
  buildMarkdownReport,
  buildTopBottlenecks,
  classifyRuntimeTaskStatus,
  evaluateRepoAnalysisState,
  formatInteger,
  getTaskAnalysisDefinitions,
  pickRandomSamples,
  type IncompleteReason,
} from './helpers/task-analysis-completion-report.helper';

export type TaskAnalysisCompletionCliOptions = {
  limit: number;
  json: boolean;
  pretty: boolean;
  includeSamples: boolean;
  queueOnly: boolean;
  repoOnly: boolean;
  homepageOnly: boolean;
  sinceDays: number | null;
  onlyIncomplete: boolean;
  onlyFeatured: boolean;
  onlyConflicts: boolean;
};

type RepositoryRecord = Prisma.RepositoryGetPayload<{
  select: typeof repositorySelect;
}>;

type TaskRow = Prisma.JobLogGetPayload<{
  select: typeof taskSelect;
}>;

type AnalysisJobRow = Prisma.JobLogGetPayload<{
  select: typeof analysisJobSelect;
}>;

type RepoJobRuntime = {
  pendingCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  deferredCount: number;
  latestSnapshotJobState: ReturnType<typeof classifyRuntimeTaskStatus> | null;
  latestDeepJobState: ReturnType<typeof classifyRuntimeTaskStatus> | null;
};

type RepoAuditRecord = {
  repoId: string;
  fullName: string;
  htmlUrl: string;
  status: RepositoryStatus;
  fetched: boolean;
  hasSnapshot: boolean;
  hasInsight: boolean;
  hasFinalDecision: boolean;
  hasIdeaFit: boolean;
  hasIdeaExtract: boolean;
  hasCompleteness: boolean;
  hasClaudeReview: boolean;
  deepDone: boolean;
  fullyAnalyzed: boolean;
  incomplete: boolean;
  trustedListReady: boolean;
  homepageUnsafe: boolean;
  fallbackDirty: boolean;
  severeConflict: boolean;
  missingHeadline: boolean;
  priority: string | null;
  verdict: string | null;
  action: string | null;
  source: string | null;
  oneLinerStrength: string | null;
  oneLinerZh: string;
  targetUsersLabel: string | null;
  monetizationLabel: string | null;
  whyLabel: string | null;
  projectType: string | null;
  category: string | null;
  snapshotPromising: boolean | null;
  snapshotNextAction: string | null;
  deepAnalysisStatus: 'NOT_STARTED' | 'COMPLETED' | 'SKIPPED_BY_GATE' | 'SKIPPED_BY_STRENGTH';
  deepAnalysisStatusReason: string | null;
  appearedOnHomepage: boolean;
  appearedInDailySummary: boolean;
  appearedInTelegram: boolean;
  primaryIncompleteReason: IncompleteReason | null;
  incompleteReasons: IncompleteReason[];
  assessment: HistoricalRecoveryAssessment;
};

export type TaskAnalysisCompletionReportJson = {
  generatedAt: string;
  scope: {
    sinceDays: number | null;
    repoFilters: {
      onlyIncomplete: boolean;
      onlyFeatured: boolean;
      onlyConflicts: boolean;
    };
    exposureWindowDays: number;
  };
  definitions: ReturnType<typeof getTaskAnalysisDefinitions>;
  taskSummary?: Record<string, unknown>;
  repoSummary?: Record<string, unknown>;
  analysisGapSummary?: Record<string, unknown>;
  queueSummary?: Record<string, unknown>;
  exposureSummary?: Record<string, unknown>;
  bottleneckSummary?: Record<string, unknown>;
  qualitySummary?: Record<string, unknown>;
  displayQualitySummary?: Record<string, unknown>;
  userPerceptionSummary?: Record<string, unknown>;
  focusSummary?: Record<string, unknown>;
  samples?: Record<string, unknown>;
  runtimeState?: Record<string, unknown>;
  reportPath?: string;
};

const repositorySelect = Prisma.validator<Prisma.RepositorySelect>()({
  id: true,
  name: true,
  fullName: true,
  htmlUrl: true,
  description: true,
  homepage: true,
  language: true,
  topics: true,
  stars: true,
  status: true,
  ideaFitScore: true,
  finalScore: true,
  toolLikeScore: true,
  roughPass: true,
  categoryL1: true,
  categoryL2: true,
  createdAt: true,
  updatedAt: true,
  createdAtGithub: true,
  updatedAtGithub: true,
  isFavorited: true,
  content: {
    select: {
      fetchedAt: true,
      readmeText: true,
    },
  },
  favorite: {
    select: {
      priority: true,
    },
  },
  analysis: {
    select: {
      ideaSnapshotJson: true,
      insightJson: true,
      claudeReviewJson: true,
      claudeReviewStatus: true,
      claudeReviewReviewedAt: true,
      completenessJson: true,
      ideaFitJson: true,
      extractedIdeaJson: true,
      fallbackUsed: true,
      analyzedAt: true,
      manualVerdict: true,
      manualAction: true,
      manualNote: true,
      manualUpdatedAt: true,
      confidence: true,
    },
  },
});

const dailySummarySelect = Prisma.validator<Prisma.DailyRadarSummarySelect>()({
  id: true,
  date: true,
  topRepositoryIds: true,
  topGoodRepositoryIds: true,
  topCloneRepositoryIds: true,
  topIgnoredRepositoryIds: true,
  telegramSendStatus: true,
  metadata: true,
  fetchedRepositories: true,
  snapshotGenerated: true,
  deepAnalyzed: true,
});

const taskSelect = Prisma.validator<Prisma.JobLogSelect>()({
  id: true,
  jobName: true,
  jobStatus: true,
  queueName: true,
  parentJobId: true,
  retryCount: true,
  errorMessage: true,
  result: true,
  createdAt: true,
});

const analysisJobSelect = Prisma.validator<Prisma.JobLogSelect>()({
  id: true,
  jobName: true,
  jobStatus: true,
  queueName: true,
  parentJobId: true,
  retryCount: true,
  payload: true,
  result: true,
  errorMessage: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
});

function parseBooleanFlag(value: string | undefined, fallback = true) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function parseTaskAnalysisCompletionArgs(
  argv: string[],
): TaskAnalysisCompletionCliOptions {
  const options: TaskAnalysisCompletionCliOptions = {
    limit: 100,
    json: false,
    pretty: true,
    includeSamples: true,
    queueOnly: false,
    repoOnly: false,
    homepageOnly: false,
    sinceDays: null,
    onlyIncomplete: false,
    onlyFeatured: false,
    onlyConflicts: false,
  };

  for (const rawArg of argv) {
    const arg = String(rawArg ?? '').trim();
    if (!arg.startsWith('--')) {
      continue;
    }

    const [flag, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=').trim();

    if (flag === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
    if (flag === 'json') {
      options.json = parseBooleanFlag(value);
    }
    if (flag === 'pretty') {
      options.pretty = parseBooleanFlag(value);
    }
    if (flag === 'include-samples' || flag === 'includeSamples') {
      options.includeSamples = parseBooleanFlag(value);
    }
    if (flag === 'queue-only') {
      options.queueOnly = parseBooleanFlag(value);
    }
    if (flag === 'repo-only') {
      options.repoOnly = parseBooleanFlag(value);
    }
    if (flag === 'homepage-only') {
      options.homepageOnly = parseBooleanFlag(value);
    }
    if (flag === 'since-days') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.sinceDays = parsed;
      }
    }
    if (flag === 'only-incomplete') {
      options.onlyIncomplete = parseBooleanFlag(value);
    }
    if (flag === 'only-featured') {
      options.onlyFeatured = parseBooleanFlag(value);
    }
    if (flag === 'only-conflicts') {
      options.onlyConflicts = parseBooleanFlag(value);
    }
  }

  if (options.queueOnly) {
    options.repoOnly = false;
    options.homepageOnly = false;
  }

  if (options.repoOnly) {
    options.queueOnly = false;
    options.homepageOnly = false;
  }

  if (options.homepageOnly) {
    options.queueOnly = false;
    options.repoOnly = false;
  }

  return options;
}

function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_, currentValue) => {
      if (typeof currentValue === 'bigint') {
        return currentValue.toString();
      }
      if (currentValue instanceof Prisma.Decimal) {
        return currentValue.toNumber();
      }
      return currentValue;
    }),
  ) as T;
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
    .map((item) => String(item ?? '').trim())
    .filter((item) => Boolean(item));
}

function readBoolean(value: unknown) {
  return value === true;
}

function buildSinceDate(sinceDays: number | null) {
  if (!sinceDays || sinceDays <= 0) {
    return null;
  }

  return new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
}

function buildRepositoryTimeWhere(sinceDate: Date | null): Prisma.RepositoryWhereInput | undefined {
  if (!sinceDate) {
    return undefined;
  }

  return {
    OR: [
      { createdAt: { gte: sinceDate } },
      { updatedAt: { gte: sinceDate } },
      { createdAtGithub: { gte: sinceDate } },
      { updatedAtGithub: { gte: sinceDate } },
    ],
  };
}

function buildJobTimeWhere(sinceDate: Date | null): Prisma.JobLogWhereInput | undefined {
  if (!sinceDate) {
    return undefined;
  }

  return {
    createdAt: {
      gte: sinceDate,
    },
  };
}

function buildDailySummaryWhere(sinceDate: Date | null): Prisma.DailyRadarSummaryWhereInput | undefined {
  if (!sinceDate) {
    return undefined;
  }

  return {
    date: {
      gte: sinceDate.toISOString().slice(0, 10),
    },
  };
}

function normalizeTaskStatus(status: JobStatus) {
  switch (status) {
    case JobStatus.SUCCESS:
      return 'COMPLETED';
    default:
      return status;
  }
}

function extractRepositoryIdFromJob(job: AnalysisJobRow) {
  const payload = readObject(job.payload);
  const result = readObject(job.result);
  const fromPayload = readString(payload?.repositoryId);
  if (fromPayload) {
    return fromPayload;
  }

  return readString(result?.repositoryId);
}

function detectCancelled(job: TaskRow) {
  const errorMessage = String(job.errorMessage ?? '').toLowerCase();
  const result = readObject(job.result);
  return (
    errorMessage.includes('cancel') ||
    readBoolean(result?.cancelled) ||
    readString(result?.queueState) !== null
  );
}

function detectStalled(job: TaskRow) {
  return String(job.errorMessage ?? '')
    .toLowerCase()
    .includes('stalled');
}

function detectDeferred(job: AnalysisJobRow) {
  const result = readObject(job.result);
  const deepAnalysis = readObject(result?.deepAnalysis);
  const steps = readObject(result?.steps);
  const ideaExtract = readObject(steps?.ideaExtract);

  return Boolean(
    readString(deepAnalysis?.deferred) ||
      readBoolean(ideaExtract?.ideaExtractDeferred) ||
      readString(ideaExtract?.ideaExtractReason) === 'deferred',
  );
}

function mapQueueDisplayLabel(queueName: string) {
  switch (queueName) {
    case QUEUE_NAMES.GITHUB_FETCH:
      return 'github.fetch';
    case QUEUE_NAMES.GITHUB_CREATED_BACKFILL:
      return 'github.created-backfill';
    case QUEUE_NAMES.ANALYSIS_SNAPSHOT:
      return 'analysis.snapshot';
    case QUEUE_NAMES.ANALYSIS_SINGLE:
      return 'analysis.deep';
    case QUEUE_NAMES.ANALYSIS_BATCH:
      return 'analysis.batch';
    case QUEUE_NAMES.FAST_FILTER_BATCH:
      return 'fast-filter.batch';
    default:
      return queueName;
  }
}

function deriveWorkerConcurrency() {
  const githubBackfill = readIntEnv('GITHUB_BACKFILL_CONCURRENCY', 1);
  const snapshot = readIntEnv('IDEA_SNAPSHOT_CONCURRENCY', 12);
  const requestedDeep = readIntEnv('DEEP_ANALYSIS_CONCURRENCY', 6);
  const deep = Math.min(requestedDeep, Math.max(1, Math.floor(snapshot / 2)));

  return {
    githubBackfill,
    snapshot,
    deep,
    analysisBatch: 1,
    fastFilterBatch: 1,
  };
}

function readIntEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function buildRepoSignal(
  repository: Record<string, unknown>,
  exposureSets: {
    homepageIds: Set<string>;
    dailySummaryIds: Set<string>;
    telegramIds: Set<string>;
  },
): HistoricalRecoverySignal {
  const analysis = readObject(repository.analysis);
  const finalDecision = readObject(repository.finalDecision);
  const moneyDecision = readObject(finalDecision?.moneyDecision);
  const trainingAsset = readObject(repository.trainingAsset);
  const snapshot = readObject(analysis?.ideaSnapshotJson);
  const insight = readObject(analysis?.insightJson);
  const categoryDisplay = readObject(insight?.categoryDisplay);
  const repositoryId = readString(repository.id) ?? '';

  return {
    repoId: repositoryId,
    fullName: readString(repository.fullName) ?? repositoryId,
    htmlUrl: readString(repository.htmlUrl) ?? '',
    oneLinerZh:
      readString(finalDecision?.oneLinerZh) ??
      readString(insight?.oneLinerZh) ??
      readString(snapshot?.oneLinerZh) ??
      readString(repository.description) ??
      readString(repository.fullName) ??
      repositoryId,
    description: readString(repository.description),
    repoName: readString(repository.name),
    updatedAt:
      readString(repository.updatedAtGithub) ??
      readString(repository.updatedAt) ??
      null,
    projectType:
      normalizeProjectType(readString(finalDecision?.projectType)) ??
      normalizeProjectType(readString(readObject(insight?.projectReality)?.type)) ??
      null,
    category:
      readString(finalDecision?.categoryLabelZh) ??
      readString(finalDecision?.category) ??
      readString(categoryDisplay?.label) ??
      null,
    hasRealUser: readBoolean(readObject(insight?.projectReality)?.hasRealUser),
    hasClearUseCase: readBoolean(readObject(insight?.projectReality)?.hasClearUseCase),
    isDirectlyMonetizable: readBoolean(
      readObject(insight?.projectReality)?.isDirectlyMonetizable,
    ),
    verdict: normalizeVerdict(readString(finalDecision?.verdict)),
    action:
      normalizeAction(readString(finalDecision?.action)) ??
      normalizeAction(readString(snapshot?.nextAction)),
    priority: normalizePriority(readString(finalDecision?.moneyPriority)),
    source: normalizeSource(readString(finalDecision?.source)),
    strength: normalizeStrength(readString(finalDecision?.oneLinerStrength)),
    targetUsersLabel: readString(moneyDecision?.targetUsersZh),
    monetizationLabel: readString(moneyDecision?.monetizationSummaryZh),
    whyLabel:
      readString(finalDecision?.reasonZh) ??
      readString(moneyDecision?.reasonZh) ??
      readString(snapshot?.reason),
    snapshotPromising:
      typeof snapshot?.isPromising === 'boolean'
        ? (snapshot?.isPromising as boolean)
        : null,
    snapshotNextAction: readString(snapshot?.nextAction),
    fallbackUsed: readBoolean(analysis?.fallbackUsed),
    hasSnapshot: Boolean(snapshot),
    hasInsight: Boolean(insight),
    hasFinalDecision: Boolean(finalDecision),
    hasIdeaFit: Boolean(analysis?.ideaFitJson),
    hasIdeaExtract: Boolean(analysis?.extractedIdeaJson),
    hasCompleteness: Boolean(analysis?.completenessJson),
    hasClaudeReview: Boolean(
      analysis?.claudeReviewJson && readString(analysis?.claudeReviewStatus) === 'SUCCESS',
    ),
    hasConflict: readBoolean(finalDecision?.hasConflict),
    needsRecheck: readBoolean(finalDecision?.needsRecheck),
    isFavorited: readBoolean(repository.isFavorited),
    favoritePriority: normalizeFavoritePriority(readString(readObject(repository.favorite)?.priority)),
    appearedOnHomepage: exposureSets.homepageIds.has(repositoryId),
    appearedInDailySummary: exposureSets.dailySummaryIds.has(repositoryId),
    appearedInTelegram: exposureSets.telegramIds.has(repositoryId),
    claudeDiffTypes: readStringArray(trainingAsset?.diffTypes),
    claudeMistakeTypes: readStringArray(trainingAsset?.mistakeTypes),
  };
}

function normalizeVerdict(value: string | null) {
  if (value === 'GOOD' || value === 'OK' || value === 'BAD') {
    return value;
  }
  return null;
}

function normalizeAction(value: string | null) {
  if (value === 'BUILD' || value === 'CLONE' || value === 'IGNORE') {
    return value;
  }
  if (value === 'SKIP') {
    return 'IGNORE';
  }
  return null;
}

function normalizePriority(value: string | null) {
  if (value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3') {
    return value;
  }
  return null;
}

function normalizeSource(value: string | null) {
  if (value === 'manual' || value === 'claude' || value === 'local' || value === 'fallback') {
    return value;
  }
  return null;
}

function normalizeStrength(value: string | null) {
  if (value === 'STRONG' || value === 'MEDIUM' || value === 'WEAK') {
    return value;
  }
  return null;
}

function normalizeProjectType(value: string | null) {
  if (
    value === 'product' ||
    value === 'tool' ||
    value === 'model' ||
    value === 'infra' ||
    value === 'demo'
  ) {
    return value;
  }
  return null;
}

function normalizeFavoritePriority(value: string | null) {
  if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH') {
    return value;
  }
  return null;
}

async function safeQueueDepth(
  queueService: QueueService,
  queueName: QueueName,
) {
  try {
    return await queueService.getQueueDepth(queueName);
  } catch (error) {
    return {
      waiting: 0,
      active: 0,
      delayed: 0,
      prioritized: 0,
      total: 0,
      error: error instanceof Error ? error.message : 'queue depth unavailable',
    };
  }
}

async function loadExposureSets(
  prisma: PrismaService,
  exposureWindowDays: number,
  sinceDate: Date | null,
) {
  const fallbackSinceDate =
    sinceDate ??
    new Date(Date.now() - exposureWindowDays * 24 * 60 * 60 * 1000);
  const summaries = await prisma.dailyRadarSummary.findMany({
    where: buildDailySummaryWhere(fallbackSinceDate),
    orderBy: {
      date: 'desc',
    },
    select: dailySummarySelect,
  });

  const homepageIds = new Set<string>();
  const dailySummaryIds = new Set<string>();
  const telegramIds = new Set<string>();

  for (const summary of summaries) {
    const topIds = readStringArray(summary.topRepositoryIds);
    const goodIds = readStringArray(summary.topGoodRepositoryIds);
    const cloneIds = readStringArray(summary.topCloneRepositoryIds);
    const ignoredIds = readStringArray(summary.topIgnoredRepositoryIds);

    for (const repositoryId of [...topIds, ...goodIds, ...cloneIds, ...ignoredIds]) {
      dailySummaryIds.add(repositoryId);
    }
    for (const repositoryId of [...topIds, ...goodIds, ...cloneIds]) {
      homepageIds.add(repositoryId);
    }
    if (summary.telegramSendStatus === 'SENT') {
      for (const repositoryId of [...topIds, ...goodIds, ...cloneIds, ...ignoredIds]) {
        telegramIds.add(repositoryId);
      }
    }
  }

  return {
    summaries,
    homepageIds,
    dailySummaryIds,
    telegramIds,
  };
}

async function loadAnalysisJobs(
  prisma: PrismaService,
  sinceDate: Date | null,
) {
  const rows = await prisma.jobLog.findMany({
    where: {
      ...(buildJobTimeWhere(sinceDate) ?? {}),
      jobName: {
        in: [QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT, QUEUE_JOB_TYPES.ANALYSIS_SINGLE],
      },
    },
    select: analysisJobSelect,
  });

  const repoJobMap = new Map<string, RepoJobRuntime>();
  let deferredCount = 0;
  let failedAnalysisCount = 0;

  for (const row of rows) {
    const repositoryId = extractRepositoryIdFromJob(row);
    if (!repositoryId) {
      continue;
    }

    const current = repoJobMap.get(repositoryId) ?? {
      pendingCount: 0,
      runningCount: 0,
      completedCount: 0,
      failedCount: 0,
      deferredCount: 0,
      latestSnapshotJobState: null,
      latestDeepJobState: null,
    };

    const normalizedStatus = normalizeTaskStatus(row.jobStatus);
    if (normalizedStatus === 'PENDING') {
      current.pendingCount += 1;
    }
    if (normalizedStatus === 'RUNNING') {
      current.runningCount += 1;
    }
    if (normalizedStatus === 'COMPLETED') {
      current.completedCount += 1;
    }
    if (normalizedStatus === 'FAILED') {
      current.failedCount += 1;
      failedAnalysisCount += 1;
    }

    if (detectDeferred(row)) {
      current.deferredCount += 1;
      deferredCount += 1;
    }

    if (row.jobName === QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT) {
      current.latestSnapshotJobState = classifyRuntimeTaskStatus({
        pendingCount: normalizedStatus === 'PENDING' ? 1 : 0,
        runningCount: normalizedStatus === 'RUNNING' ? 1 : 0,
        completedCount: normalizedStatus === 'COMPLETED' ? 1 : 0,
        failedCount: normalizedStatus === 'FAILED' ? 1 : 0,
      });
    }

    if (row.jobName === QUEUE_JOB_TYPES.ANALYSIS_SINGLE) {
      current.latestDeepJobState = classifyRuntimeTaskStatus({
        pendingCount: normalizedStatus === 'PENDING' ? 1 : 0,
        runningCount: normalizedStatus === 'RUNNING' ? 1 : 0,
        completedCount: normalizedStatus === 'COMPLETED' ? 1 : 0,
        failedCount: normalizedStatus === 'FAILED' ? 1 : 0,
      });
    }

    repoJobMap.set(repositoryId, current);
  }

  return {
    repoJobMap,
    deferredCount,
    failedAnalysisCount,
  };
}

function createIncompleteReasonCounter() {
  return {
    NO_SNAPSHOT: 0,
    NO_INSIGHT: 0,
    NO_FINAL_DECISION: 0,
    NO_DEEP_ANALYSIS: 0,
    NO_CLAUDE_REVIEW: 0,
    SKIPPED_BY_GATE: 0,
    SKIPPED_BY_STRENGTH: 0,
    SKIPPED_BY_SELF_TUNING: 0,
    FALLBACK_ONLY: 0,
    CONFLICT_HELD_BACK: 0,
    QUEUED_NOT_FINISHED: 0,
    FAILED_DURING_ANALYSIS: 0,
    UNKNOWN: 0,
  } satisfies Record<IncompleteReason, number>;
}

export async function buildTaskAnalysisCompletionReport(
  options: TaskAnalysisCompletionCliOptions,
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
) {
  const prisma = app.get(PrismaService);
  const queueService = app.get(QueueService);
  const repositoryDecisionService = app.get(RepositoryDecisionService);

  const generatedAt = new Date().toISOString();
  const sinceDate = buildSinceDate(options.sinceDays);
  const exposureWindowDays = options.sinceDays ?? 30;
  const definitions = getTaskAnalysisDefinitions();

  const [taskTotal, rootTasks, childTasks, taskStatusGroups, taskTypeGroups, queueGroups, queueStatusGroups, cancelledFailedJobs, stalledFailedJobs, taskRows, queueSnapshot, dailySummaryData, rankingTopIds, averageDurations, runtimeConfigRows] =
    await Promise.all([
      prisma.jobLog.count({ where: buildJobTimeWhere(sinceDate) }),
      prisma.jobLog.count({
        where: {
          ...(buildJobTimeWhere(sinceDate) ?? {}),
          parentJobId: null,
        },
      }),
      prisma.jobLog.count({
        where: {
          ...(buildJobTimeWhere(sinceDate) ?? {}),
          parentJobId: {
            not: null,
          },
        },
      }),
      prisma.jobLog.groupBy({
        by: ['jobStatus'],
        where: buildJobTimeWhere(sinceDate),
        _count: {
          _all: true,
        },
      }),
      prisma.jobLog.groupBy({
        by: ['jobName'],
        where: buildJobTimeWhere(sinceDate),
        _count: {
          _all: true,
        },
      }),
      prisma.jobLog.groupBy({
        by: ['queueName'],
        where: buildJobTimeWhere(sinceDate),
        _count: {
          _all: true,
        },
      }),
      prisma.jobLog.groupBy({
        by: ['queueName', 'jobStatus'],
        where: buildJobTimeWhere(sinceDate),
        _count: {
          _all: true,
        },
      }),
      prisma.jobLog.count({
        where: {
          ...(buildJobTimeWhere(sinceDate) ?? {}),
          jobStatus: JobStatus.FAILED,
          OR: [
            {
              errorMessage: {
                contains: 'cancel',
                mode: 'insensitive',
              },
            },
          ],
        },
      }),
      prisma.jobLog.count({
        where: {
          ...(buildJobTimeWhere(sinceDate) ?? {}),
          jobStatus: JobStatus.FAILED,
          OR: [
            {
              errorMessage: {
                contains: 'stalled',
                mode: 'insensitive',
              },
            },
          ],
        },
      }),
      prisma.jobLog.findMany({
        where: buildJobTimeWhere(sinceDate),
        select: taskSelect,
      }),
      Promise.all(
        (
          [
            QUEUE_NAMES.GITHUB_FETCH,
            QUEUE_NAMES.GITHUB_CREATED_BACKFILL,
            QUEUE_NAMES.ANALYSIS_SNAPSHOT,
            QUEUE_NAMES.ANALYSIS_SINGLE,
            QUEUE_NAMES.ANALYSIS_BATCH,
            QUEUE_NAMES.FAST_FILTER_BATCH,
          ] as QueueName[]
        ).map(async (queueName) => ({
          queueName,
          runtime: await safeQueueDepth(queueService, queueName),
        })),
      ),
      loadExposureSets(prisma, exposureWindowDays, sinceDate),
      prisma.repositoryCachedRanking.findMany({
        where: sinceDate
          ? {
              repository: {
                is: buildRepositoryTimeWhere(sinceDate),
              },
            }
          : undefined,
        select: {
          repoId: true,
        },
        orderBy: [
          {
            moneyScore: 'desc',
          },
          {
            updatedAt: 'desc',
          },
        ],
        take: 100,
      }),
      prisma.jobLog.groupBy({
        by: ['jobName'],
        where: {
          ...(buildJobTimeWhere(sinceDate) ?? {}),
          jobStatus: JobStatus.SUCCESS,
          durationMs: {
            not: null,
          },
        },
        _avg: {
          durationMs: true,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.systemConfig.findMany({
        where: {
          configKey: {
            in: [
              'github.self_tuning.state',
              'analysis.deep.runtime_stats',
              'claude.runtime_state',
            ],
          },
        },
      }),
    ]);

  const pendingCount = taskStatusGroups.find((row) => row.jobStatus === JobStatus.PENDING)?._count._all ?? 0;
  const runningCount = taskStatusGroups.find((row) => row.jobStatus === JobStatus.RUNNING)?._count._all ?? 0;
  const completedCount = taskStatusGroups.find((row) => row.jobStatus === JobStatus.SUCCESS)?._count._all ?? 0;
  const failedCount = taskStatusGroups.find((row) => row.jobStatus === JobStatus.FAILED)?._count._all ?? 0;
  const retryCount = taskRows.filter((row) => (row.retryCount ?? 0) > 0).length;
  const cancelledCount = Math.max(
    cancelledFailedJobs,
    taskRows.filter((row) => detectCancelled(row)).length,
  );
  const stalledCount = Math.max(
    stalledFailedJobs,
    taskRows.filter((row) => detectStalled(row)).length,
  );

  const queueCompletedFailedMap = new Map<string, { completed: number; failed: number }>();
  for (const row of queueStatusGroups) {
    const queueName = row.queueName ?? 'unassigned';
    const existing = queueCompletedFailedMap.get(queueName) ?? {
      completed: 0,
      failed: 0,
    };
    if (row.jobStatus === JobStatus.SUCCESS) {
      existing.completed = row._count._all;
    }
    if (row.jobStatus === JobStatus.FAILED) {
      existing.failed = row._count._all;
    }
    queueCompletedFailedMap.set(queueName, existing);
  }

  const { repoJobMap, deferredCount, failedAnalysisCount } = await loadAnalysisJobs(
    prisma,
    sinceDate,
  );
  const auditSnapshot = await repositoryDecisionService.getLatestAuditSnapshot();
  const repositoryWhere = buildRepositoryTimeWhere(sinceDate);

  const repoRecordsRaw: Array<{
    repository: RepositoryRecord;
    derived: Record<string, unknown>;
    signal: HistoricalRecoverySignal;
  }> = [];
  const batchSize = 400;
  let cursorId: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const batch: RepositoryRecord[] = await prisma.repository.findMany({
      ...(cursorId
        ? {
            cursor: { id: cursorId },
            skip: 1,
          }
        : {}),
      where: repositoryWhere,
      take: batchSize,
      orderBy: {
        id: 'asc',
      },
      select: repositorySelect,
    });

    if (!batch.length) {
      break;
    }

    const serializedBatch = serialize(batch);
    const derivedBatch = repositoryDecisionService.attachDerivedAssetsWithAudit(
      serializedBatch as unknown as Record<string, unknown>[],
      auditSnapshot,
    ) as Array<Record<string, unknown>>;

    batch.forEach((repository, index) => {
      const derived = derivedBatch[index] ?? {};
      repoRecordsRaw.push({
        repository,
        derived,
        signal: buildRepoSignal(derived, {
          homepageIds: dailySummaryData.homepageIds,
          dailySummaryIds: dailySummaryData.dailySummaryIds,
          telegramIds: dailySummaryData.telegramIds,
        }),
      });
    });

    cursorId = batch[batch.length - 1]?.id ?? null;
    hasMore = Boolean(cursorId);
  }

  const assessments = assessHistoricalRecoveryBatch(
    repoRecordsRaw.map((item) => item.signal),
  );
  const assessmentByRepoId = new Map(assessments.map((item) => [item.repoId, item]));

  const incompleteReasonCounts = createIncompleteReasonCounter();
  const incompleteReasonSamples = new Map<
    IncompleteReason,
    Array<{ repoId: string; fullName: string; reason: IncompleteReason }>
  >();
  const repoMap = new Map<string, RepoAuditRecord>();

  let fetchedRepos = 0;
  let snapshotDoneRepos = 0;
  let insightDoneRepos = 0;
  let finalDecisionDoneRepos = 0;
  let deepDoneRepos = 0;
  let claudeDoneRepos = 0;
  let fullyAnalyzedRepos = 0;
  let incompleteRepos = 0;
  let fallbackRepos = 0;
  let severeConflictRepos = 0;
  let missingHeadlineRepos = 0;
  let homepageUnsafeRepos = 0;
  let displayReadyRepos = 0;
  let trustedDisplayReadyRepos = 0;
  let deepReadyRepos = 0;
  let reviewReadyRepos = 0;
  let lightDeepDoneRepos = 0;
  let fullDeepDoneRepos = 0;
  let detailHalfFinishedRepos = 0;
  let fallbackButStillVisibleCount = 0;
  let noDeepButVisibleCount = 0;
  let severeConflictVisibleRepos = 0;
  let snapshotOnlyCount = 0;
  let snapshotButNoInsightCount = 0;
  let insightButNoFinalDecisionCount = 0;
  let finalDecisionButNoDeepCount = 0;
  let deepQueuedButNotDoneCount = 0;
  let claudeEligibleButNotReviewedCount = 0;
  let skippedByGateCount = 0;
  let skippedByStrengthCount = 0;
  let skippedBySelfTuningCount = 0;
  let badOneLinerCount = 0;
  let templatePhraseCount = 0;
  let unclearUserCount = 0;
  let englishLeakCount = 0;
  let headlineConflictCount = 0;
  let noDeepButHasMonetization = 0;
  let noDeepButHasStrongWhy = 0;
  let fallbackButStrongHeadline = 0;
  let conflictVisibleCount = 0;
  let confidenceTotal = 0;
  let confidenceCount = 0;

  for (const item of repoRecordsRaw) {
    const repository = item.repository;
    const analysis = readObject(repository.analysis);
    const derived = item.derived;
    const finalDecision = readObject(derived.finalDecision);
    const assessment = assessmentByRepoId.get(repository.id);
    if (!assessment) {
      continue;
    }

    const fetched = Boolean(
      repository.content?.fetchedAt ||
        repository.status !== RepositoryStatus.DISCOVERED,
    );
    const hasSnapshot = Boolean(analysis?.ideaSnapshotJson);
    const hasInsight = Boolean(analysis?.insightJson);
    const hasFinalDecision = Boolean(finalDecision);
    const hasIdeaFit = Boolean(analysis?.ideaFitJson);
    const hasIdeaExtract = Boolean(analysis?.extractedIdeaJson);
    const hasCompleteness = Boolean(analysis?.completenessJson);
    const hasClaudeReview = Boolean(
      analysis?.claudeReviewJson &&
        readString(analysis?.claudeReviewStatus) === 'SUCCESS',
    );
    const deepAnalysisStatus = (readString(
      derived.deepAnalysisStatus,
    ) ?? 'NOT_STARTED') as
      | 'NOT_STARTED'
      | 'COMPLETED'
      | 'SKIPPED_BY_GATE'
      | 'SKIPPED_BY_STRENGTH';
    const deepAnalysisStatusReason = readString(derived.deepAnalysisStatusReason);
    const analysisState = readObject(derived.analysisState);
    const source = readString(finalDecision?.source);
    const priority = readString(finalDecision?.moneyPriority);
    const verdict = readString(finalDecision?.verdict);
    const action = readString(finalDecision?.action);
    const oneLinerStrength = readString(finalDecision?.oneLinerStrength);
    const oneLinerZh =
      readString(finalDecision?.oneLinerZh) ??
      readString(readObject(analysis?.insightJson)?.oneLinerZh) ??
      readString(readObject(analysis?.ideaSnapshotJson)?.oneLinerZh) ??
      '';
    const isDisplayReady = readBoolean(analysisState?.displayReady);
    const isDeepReady = readBoolean(analysisState?.deepReady);
    const isReviewReady = readBoolean(analysisState?.reviewReady);
    const isLightDeepReady = readBoolean(analysisState?.lightDeepReady);
    const isFullDeepReady = readBoolean(analysisState?.fullDeepReady);
    const analysisConfidence =
      typeof repository.analysis?.confidence === 'number'
        ? repository.analysis.confidence
        : null;
    const repoJobs = repoJobMap.get(repository.id) ?? {
      pendingCount: 0,
      runningCount: 0,
      completedCount: 0,
      failedCount: 0,
      deferredCount: 0,
      latestSnapshotJobState: null,
      latestDeepJobState: null,
    };
    const claudeEligible = Boolean(
      priority === 'P0' ||
        priority === 'P1' ||
        assessment.metrics.claudeConflict ||
        item.signal.appearedOnHomepage ||
        item.signal.appearedInTelegram,
    );

    const state = evaluateRepoAnalysisState({
      hasSnapshot,
      hasInsight,
      hasFinalDecision,
      hasIdeaFit,
      hasIdeaExtract,
      hasCompleteness,
      hasClaudeReview,
      fallbackDirty: assessment.metrics.fallbackVisible,
      severeConflict: assessment.metrics.claudeConflict,
      badOneliner: assessment.metrics.badOneliner,
      headlineUserConflict: assessment.metrics.headlineUserConflict,
      headlineCategoryConflict: assessment.metrics.headlineCategoryConflict,
      monetizationOverclaim: assessment.metrics.monetizationOverclaim,
      lowValue: Boolean(priority === 'P3' || action === 'IGNORE'),
      appearedOnHomepage: item.signal.appearedOnHomepage ?? false,
      appearedInDailySummary: item.signal.appearedInDailySummary ?? false,
      appearedInTelegram: item.signal.appearedInTelegram ?? false,
      pendingAnalysisJobs: repoJobs.pendingCount,
      runningAnalysisJobs: repoJobs.runningCount,
      failedAnalysisJobs: repoJobs.failedCount,
      hasDeferredAnalysis: repoJobs.deferredCount > 0,
      deepAnalysisStatus,
      deepAnalysisStatusReason,
      claudeEligible,
    });

    if (fetched) {
      fetchedRepos += 1;
    }
    if (hasSnapshot) {
      snapshotDoneRepos += 1;
    }
    if (hasInsight) {
      insightDoneRepos += 1;
    }
    if (hasFinalDecision) {
      finalDecisionDoneRepos += 1;
    }
    if (state.deepDone) {
      deepDoneRepos += 1;
    }
    if (hasClaudeReview) {
      claudeDoneRepos += 1;
    }
    if (state.fullyAnalyzed) {
      fullyAnalyzedRepos += 1;
    }
    if (state.incomplete) {
      incompleteRepos += 1;
    }
    if (assessment.metrics.fallbackVisible) {
      fallbackRepos += 1;
    }
    if (assessment.metrics.claudeConflict) {
      severeConflictRepos += 1;
    }
    if (!oneLinerZh) {
      missingHeadlineRepos += 1;
    }
    if (state.homepageUnsafe) {
      homepageUnsafeRepos += 1;
    }
    if (isDisplayReady) {
      displayReadyRepos += 1;
    }
    if (state.trustedListReady) {
      trustedDisplayReadyRepos += 1;
    }
    if (isDeepReady) {
      deepReadyRepos += 1;
    }
    if (isReviewReady) {
      reviewReadyRepos += 1;
    }
    if (isLightDeepReady) {
      lightDeepDoneRepos += 1;
    }
    if (isFullDeepReady) {
      fullDeepDoneRepos += 1;
    }
    if (hasSnapshot && hasFinalDecision && !state.deepDone) {
      detailHalfFinishedRepos += 1;
    }
    if (isDisplayReady && !isDeepReady) {
      noDeepButVisibleCount += 1;
    }
    if (assessment.metrics.fallbackVisible && hasFinalDecision) {
      fallbackButStillVisibleCount += 1;
    }
    if (assessment.metrics.claudeConflict && isDisplayReady) {
      severeConflictVisibleRepos += 1;
      conflictVisibleCount += 1;
    }
    if (hasSnapshot && !hasInsight && !hasFinalDecision && !state.deepDone) {
      snapshotOnlyCount += 1;
    }
    if (hasSnapshot && !hasInsight) {
      snapshotButNoInsightCount += 1;
    }
    if (hasInsight && !hasFinalDecision) {
      insightButNoFinalDecisionCount += 1;
    }
    if (hasFinalDecision && !state.deepDone) {
      finalDecisionButNoDeepCount += 1;
    }
    if (!state.deepDone && (repoJobs.pendingCount > 0 || repoJobs.runningCount > 0)) {
      deepQueuedButNotDoneCount += 1;
    }
    if (claudeEligible && !hasClaudeReview) {
      claudeEligibleButNotReviewedCount += 1;
    }
    if (state.incompleteReasons.includes('SKIPPED_BY_GATE')) {
      skippedByGateCount += 1;
    }
    if (state.incompleteReasons.includes('SKIPPED_BY_STRENGTH')) {
      skippedByStrengthCount += 1;
    }
    if (state.incompleteReasons.includes('SKIPPED_BY_SELF_TUNING')) {
      skippedBySelfTuningCount += 1;
    }
    if (assessment.metrics.badOneliner) {
      badOneLinerCount += 1;
    }
    if (assessment.repeatedTemplate) {
      templatePhraseCount += 1;
    }
    if (assessment.metrics.headlineUserConflict) {
      unclearUserCount += 1;
    }
    if (assessment.metrics.headlineUserConflict || assessment.metrics.headlineCategoryConflict) {
      headlineConflictCount += 1;
    }
    if (assessment.validator.riskFlags.includes('english_leak')) {
      englishLeakCount += 1;
    }
    if (!isDeepReady && Boolean(readString(readObject(finalDecision?.moneyDecision)?.monetizationSummaryZh))) {
      noDeepButHasMonetization += 1;
    }
    if (!isDeepReady && Boolean(readString(finalDecision?.reasonZh))) {
      noDeepButHasStrongWhy += 1;
    }
    if (assessment.metrics.fallbackVisible && Boolean(oneLinerZh)) {
      fallbackButStrongHeadline += 1;
    }
    if (analysisConfidence !== null) {
      confidenceTotal += analysisConfidence;
      confidenceCount += 1;
    }

    for (const reason of state.incompleteReasons) {
      incompleteReasonCounts[reason] += 1;
      const samples = incompleteReasonSamples.get(reason) ?? [];
      if (samples.length < Math.max(3, Math.min(options.limit, 8))) {
        samples.push({
          repoId: repository.id,
          fullName: repository.fullName,
          reason,
        });
        incompleteReasonSamples.set(reason, samples);
      }
    }

    const record: RepoAuditRecord = {
      repoId: repository.id,
      fullName: repository.fullName,
      htmlUrl: repository.htmlUrl,
      status: repository.status,
      fetched,
      hasSnapshot,
      hasInsight,
      hasFinalDecision,
      hasIdeaFit,
      hasIdeaExtract,
      hasCompleteness,
      hasClaudeReview,
      deepDone: state.deepDone,
      fullyAnalyzed: state.fullyAnalyzed,
      incomplete: state.incomplete,
      trustedListReady: state.trustedListReady,
      homepageUnsafe: state.homepageUnsafe,
      fallbackDirty: assessment.metrics.fallbackVisible,
      severeConflict: assessment.metrics.claudeConflict,
      missingHeadline: !oneLinerZh,
      priority,
      verdict,
      action,
      source,
      oneLinerStrength,
      oneLinerZh,
      targetUsersLabel: readString(readObject(finalDecision?.moneyDecision)?.targetUsersZh),
      monetizationLabel: readString(
        readObject(finalDecision?.moneyDecision)?.monetizationSummaryZh,
      ),
      whyLabel:
        readString(finalDecision?.reasonZh) ??
        readString(readObject(finalDecision?.moneyDecision)?.reasonZh),
      projectType: readString(finalDecision?.projectType),
      category:
        readString(finalDecision?.categoryLabelZh) ?? readString(finalDecision?.category),
      snapshotPromising:
        typeof readObject(analysis?.ideaSnapshotJson)?.isPromising === 'boolean'
          ? (readObject(analysis?.ideaSnapshotJson)?.isPromising as boolean)
          : null,
      snapshotNextAction: readString(readObject(analysis?.ideaSnapshotJson)?.nextAction),
      deepAnalysisStatus,
      deepAnalysisStatusReason,
      appearedOnHomepage: item.signal.appearedOnHomepage ?? false,
      appearedInDailySummary: item.signal.appearedInDailySummary ?? false,
      appearedInTelegram: item.signal.appearedInTelegram ?? false,
      primaryIncompleteReason: state.primaryIncompleteReason,
      incompleteReasons: state.incompleteReasons,
      assessment,
    };

    repoMap.set(repository.id, record);
  }

  const featuredRepoIds = rankingTopIds.map((row) => row.repoId);
  const featuredRepos = featuredRepoIds
    .map((repoId) => repoMap.get(repoId))
    .filter((item): item is RepoAuditRecord => Boolean(item));
  const dailySummaryRepos = Array.from(dailySummaryData.dailySummaryIds)
    .map((repoId) => repoMap.get(repoId))
    .filter((item): item is RepoAuditRecord => Boolean(item));
  const telegramRepos = Array.from(dailySummaryData.telegramIds)
    .map((repoId) => repoMap.get(repoId))
    .filter((item): item is RepoAuditRecord => Boolean(item));
  const moneyPriorityHighButIncomplete = Array.from(repoMap.values()).filter(
    (item) => (item.priority === 'P0' || item.priority === 'P1') && item.incomplete,
  ).length;

  const focusRepos = Array.from(repoMap.values()).filter((item) => {
    if (options.onlyIncomplete && !item.incomplete) {
      return false;
    }
    if (options.onlyFeatured && !featuredRepoIds.includes(item.repoId)) {
      return false;
    }
    if (options.onlyConflicts && !item.severeConflict) {
      return false;
    }
    return true;
  });

  const queueRows = queueSnapshot.map((row) => {
    const completedFailed =
      queueCompletedFailedMap.get(row.queueName) ??
      queueCompletedFailedMap.get(mapQueueDisplayLabel(row.queueName)) ?? {
        completed: 0,
        failed: 0,
      };
    return {
      queue: row.queueName,
      waiting: row.runtime.waiting,
      active: row.runtime.active,
      delayed: row.runtime.delayed,
      prioritized: row.runtime.prioritized,
      failed: completedFailed.failed,
      completed: completedFailed.completed,
      totalRuntime: row.runtime.total,
      error: 'error' in row.runtime ? row.runtime.error : null,
    };
  });

  const biggestBacklogQueueRow = queueRows
    .slice()
    .sort(
      (left, right) =>
        right.waiting +
        right.delayed +
        right.prioritized -
        (left.waiting + left.delayed + left.prioritized),
    )[0];

  const slowestLayerGroup = averageDurations
    .filter((row) =>
      ['analysis.idea_snapshot', 'analysis.run_single', 'github.fetch_repositories', 'github.backfill_created_repositories'].includes(
        row.jobName,
      ),
    )
    .sort(
      (left, right) =>
        (right._avg.durationMs ?? 0) - (left._avg.durationMs ?? 0),
    )[0];

  const mostCommonIncompleteReason = Object.entries(incompleteReasonCounts)
    .sort((left, right) => right[1] - left[1])[0]?.[0] as IncompleteReason | undefined;

  const top3Bottlenecks = buildTopBottlenecks({
    queues: queueRows,
    slowestLayer: slowestLayerGroup
      ? `${slowestLayerGroup.jobName} avgDurationMs=${Math.round(
          slowestLayerGroup._avg.durationMs ?? 0,
        )} sample=${slowestLayerGroup._count._all}`
      : null,
    mostCommonIncompleteReason: mostCommonIncompleteReason ?? null,
    biggestBacklogQueue: biggestBacklogQueueRow
      ? `${biggestBacklogQueueRow.queue} waiting=${biggestBacklogQueueRow.waiting}`
      : null,
    deferredCount,
    failedAnalysisCount,
  });

  const runtimeConfigMap = new Map(
    runtimeConfigRows.map((row) => [row.configKey, row.configValue]),
  );

  const taskSummary = {
    totalTasks: taskTotal,
    rootTasks,
    childTasks,
    pendingCount,
    runningCount,
    completedCount,
    failedCount,
    cancelledCount,
    stalledCount,
    deferredCount,
    retryCount,
    byTaskType: taskTypeGroups
      .map((row) => ({
        jobName: row.jobName,
        count: row._count._all,
      }))
      .sort((left, right) => right.count - left.count),
    byQueue: queueGroups
      .map((row) => ({
        queueName: row.queueName ?? 'unassigned',
        count: row._count._all,
      }))
      .sort((left, right) => right.count - left.count),
    byStatusAndQueue: queueStatusGroups
      .map((row) => ({
        queueName: row.queueName ?? 'unassigned',
        status: normalizeTaskStatus(row.jobStatus),
        count: row._count._all,
      }))
      .sort((left, right) => right.count - left.count),
    snapshotChildTasks: await prisma.jobLog.count({
      where: {
        ...(buildJobTimeWhere(sinceDate) ?? {}),
        jobName: QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT,
        parentJobId: {
          not: null,
        },
      },
    }),
    deepChildTasks: await prisma.jobLog.count({
      where: {
        ...(buildJobTimeWhere(sinceDate) ?? {}),
        jobName: QUEUE_JOB_TYPES.ANALYSIS_SINGLE,
        parentJobId: {
          not: null,
        },
      },
    }),
  };

  const repoSummary = {
    totalRepos: repoMap.size,
    fetchedRepos,
    snapshotDoneRepos,
    insightDoneRepos,
    finalDecisionDoneRepos,
    displayReadyRepos,
    trustedDisplayReadyRepos,
    deepReadyRepos,
    reviewReadyRepos,
    lightDeepDoneRepos,
    fullDeepDoneRepos,
    deepDoneRepos,
    claudeDoneRepos,
    fullyAnalyzedRepos,
    incompleteRepos,
    fallbackRepos,
    severeConflictRepos,
    missingHeadlineRepos,
    homepageUnsafeRepos,
  };

  const analysisGapSummary = {
    snapshotOnlyCount,
    snapshotButNoInsightCount,
    insightButNoFinalDecisionCount,
    finalDecisionButNoDeepCount,
    deepQueuedButNotDoneCount,
    claudeEligibleButNotReviewedCount,
    skippedByGateCount,
    skippedByStrengthCount,
    skippedBySelfTuningCount,
    fallbackButStillVisibleCount,
    noDeepButVisibleCount,
    severeConflictVisibleRepos,
    incompleteReasonCounts,
    incompleteReasonSamples: Object.fromEntries(
      Array.from(incompleteReasonSamples.entries()),
    ),
    mostCommonIncompleteReason: mostCommonIncompleteReason ?? null,
  };

  const queueSummary = {
    workerConcurrency: deriveWorkerConcurrency(),
    snapshotQueue: queueRows.find((row) => row.queue === QUEUE_NAMES.ANALYSIS_SNAPSHOT) ?? null,
    deepQueue: queueRows.find((row) => row.queue === QUEUE_NAMES.ANALYSIS_SINGLE) ?? null,
    githubBackfillQueue:
      queueRows.find((row) => row.queue === QUEUE_NAMES.GITHUB_CREATED_BACKFILL) ?? null,
    githubFetchQueue:
      queueRows.find((row) => row.queue === QUEUE_NAMES.GITHUB_FETCH) ?? null,
    fastFilterQueue:
      queueRows.find((row) => row.queue === QUEUE_NAMES.FAST_FILTER_BATCH) ?? null,
    batchQueue:
      queueRows.find((row) => row.queue === QUEUE_NAMES.ANALYSIS_BATCH) ?? null,
    claudeQueue: readObject(runtimeConfigMap.get('claude.runtime_state')),
    dailySummaryQueue: {
      mode: 'service-driven',
      needsRecomputeCount: dailySummaryData.summaries.filter((item) =>
        readBoolean(readObject(item.metadata)?.needsRecompute),
      ).length,
    },
    telegramQueue: {
      mode: 'service-driven',
      pendingCount: dailySummaryData.summaries.filter(
        (item) => item.telegramSendStatus !== 'SENT',
      ).length,
      sentCount: dailySummaryData.summaries.filter(
        (item) => item.telegramSendStatus === 'SENT',
      ).length,
    },
    biggestBacklogQueue: biggestBacklogQueueRow
      ? `${biggestBacklogQueueRow.queue} waiting=${biggestBacklogQueueRow.waiting} delayed=${biggestBacklogQueueRow.delayed} prioritized=${biggestBacklogQueueRow.prioritized}`
      : null,
  };

  const exposureSummary = {
    homepageFeaturedRepos: featuredRepos.length,
    homepageFeaturedIncomplete: featuredRepos.filter((item) => item.incomplete).length,
    homepageFeaturedUnsafe: featuredRepos.filter((item) => item.homepageUnsafe).length,
    dailySummaryTopRepos: dailySummaryRepos.length,
    dailySummaryTopIncomplete: dailySummaryRepos.filter((item) => item.incomplete).length,
    telegramSentRepos: telegramRepos.length,
    telegramSentIncomplete: telegramRepos.filter((item) => item.incomplete).length,
    moneyPriorityHighButIncomplete,
  };

  const userPerceptionSummary = {
    displayReadyRepos,
    trustedDisplayReadyRepos,
    detailHalfFinishedRepos,
    fallbackButStillVisibleCount,
    noDeepButVisibleCount,
    severeConflictVisibleRepos,
    highExposureButIncompleteCount: Array.from(repoMap.values()).filter(
      (item) =>
        item.incomplete &&
        (item.appearedOnHomepage || item.appearedInDailySummary || item.appearedInTelegram),
    ).length,
  };

  const bottleneckSummary = {
    biggestBacklogQueue: queueSummary.biggestBacklogQueue,
    slowestLayer: slowestLayerGroup
      ? {
          jobName: slowestLayerGroup.jobName,
          averageDurationMs: Math.round(slowestLayerGroup._avg.durationMs ?? 0),
          sampleCount: slowestLayerGroup._count._all,
        }
      : null,
    mostCommonIncompleteReason: mostCommonIncompleteReason ?? null,
    top3Bottlenecks,
  };

  const qualitySummary = {
    badOneLinerCount,
    templatePhraseCount,
    unclearUserCount,
    englishLeakCount,
    headlineConflictCount,
    averageConfidence:
      confidenceCount > 0
        ? Number((confidenceTotal / confidenceCount).toFixed(2))
        : null,
  };

  const displayQualitySummary = {
    noDeepButHasMonetization,
    noDeepButHasStrongWhy,
    fallbackButStrongHeadline,
    conflictVisibleCount,
  };

  const homepageTop100Audit = {
    total: featuredRepos.length,
    fullyAnalyzed: featuredRepos.filter((item) => item.fullyAnalyzed).length,
    incomplete: featuredRepos.filter((item) => item.incomplete).length,
    unsafe: featuredRepos.filter((item) => item.homepageUnsafe).length,
    fallback: featuredRepos.filter((item) => item.fallbackDirty).length,
    severeConflict: featuredRepos.filter((item) => item.severeConflict).length,
    missingHeadline: featuredRepos.filter((item) => item.missingHeadline).length,
    reasons: featuredRepos.reduce<Record<string, number>>((summary, item) => {
      const key = item.primaryIncompleteReason ?? 'COMPLETE';
      summary[key] = (summary[key] ?? 0) + 1;
      return summary;
    }, {}),
    items: options.includeSamples
      ? featuredRepos.map((item) => ({
          repoId: item.repoId,
          fullName: item.fullName,
          priority: item.priority,
          source: item.source,
          fullyAnalyzed: item.fullyAnalyzed,
          incomplete: item.incomplete,
          trustedListReady: item.trustedListReady,
          monetizationLabel: item.monetizationLabel,
          whyLabel: item.whyLabel,
          primaryIncompleteReason: item.primaryIncompleteReason,
          incompleteReasons: item.incompleteReasons,
          deepAnalysisStatus: item.deepAnalysisStatus,
          deepAnalysisStatusReason: item.deepAnalysisStatusReason,
          severeConflict: item.severeConflict,
          fallbackDirty: item.fallbackDirty,
          headline: item.oneLinerZh,
        }))
      : [],
  };

  const incompleteSamplePool = Array.from(repoMap.values()).filter((item) => item.incomplete);
  const incompleteRandomSamples = pickRandomSamples(
    incompleteSamplePool,
    Math.min(options.limit, 100),
  ).map((item) => ({
    repoId: item.repoId,
    fullName: item.fullName,
    priority: item.priority,
    source: item.source,
    primaryIncompleteReason: item.primaryIncompleteReason,
    incompleteReasons: item.incompleteReasons,
    deepAnalysisStatus: item.deepAnalysisStatus,
    deepAnalysisStatusReason: item.deepAnalysisStatusReason,
    hasSnapshot: item.hasSnapshot,
    hasInsight: item.hasInsight,
    hasFinalDecision: item.hasFinalDecision,
    hasIdeaFit: item.hasIdeaFit,
    hasIdeaExtract: item.hasIdeaExtract,
    hasCompleteness: item.hasCompleteness,
    hasClaudeReview: item.hasClaudeReview,
  }));

  const focusSummary = {
    focusRepoCount: focusRepos.length,
    focusIncompleteCount: focusRepos.filter((item) => item.incomplete).length,
    focusConflictCount: focusRepos.filter((item) => item.severeConflict).length,
    focusUnsafeCount: focusRepos.filter((item) => item.homepageUnsafe).length,
  };

  const runtimeState = {
    selfTuning: readObject(runtimeConfigMap.get('github.self_tuning.state')),
    deepRuntimeStats: readObject(runtimeConfigMap.get('analysis.deep.runtime_stats')),
    claudeRuntime: readObject(runtimeConfigMap.get('claude.runtime_state')),
  };

  const report: TaskAnalysisCompletionReportJson = {
    generatedAt,
    scope: {
      sinceDays: options.sinceDays,
      repoFilters: {
        onlyIncomplete: options.onlyIncomplete,
        onlyFeatured: options.onlyFeatured,
        onlyConflicts: options.onlyConflicts,
      },
      exposureWindowDays,
    },
    definitions,
    taskSummary,
    repoSummary,
    analysisGapSummary,
    queueSummary,
    exposureSummary,
    bottleneckSummary,
    qualitySummary,
    displayQualitySummary,
    userPerceptionSummary,
    focusSummary,
    samples: {
      incompleteRandomSamples,
      homepageTop100Audit,
    },
    runtimeState,
  };

  return report;
}

export async function writeTaskAnalysisMarkdownReport(
  report: TaskAnalysisCompletionReportJson,
) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const reportsDir = path.join(process.cwd(), 'reports');
  await mkdir(reportsDir, { recursive: true });
  const filePath = path.join(
    reportsDir,
    `task-analysis-completion-${yyyy}${mm}${dd}-${hh}${mi}${ss}.md`,
  );
  await writeFile(filePath, buildMarkdownReport(report), 'utf8');
  return filePath;
}

async function bootstrap() {
  const options = parseTaskAnalysisCompletionArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const report = await buildTaskAnalysisCompletionReport(options, app);
    const reportPath = await writeTaskAnalysisMarkdownReport(report);
    report.reportPath = reportPath;

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`,
      );
      return;
    }

    const visibleReport = options.queueOnly
      ? {
          generatedAt: report.generatedAt,
          taskSummary: report.taskSummary,
          queueSummary: report.queueSummary,
          bottleneckSummary: report.bottleneckSummary,
        }
      : options.repoOnly
        ? {
            generatedAt: report.generatedAt,
            repoSummary: report.repoSummary,
            analysisGapSummary: report.analysisGapSummary,
            userPerceptionSummary: report.userPerceptionSummary,
          }
        : options.homepageOnly
          ? {
              generatedAt: report.generatedAt,
              exposureSummary: report.exposureSummary,
              samples: report.samples,
            }
          : report;

    process.stdout.write(
      `${buildHumanSummary(
        visibleReport as Parameters<typeof buildHumanSummary>[0],
      )}\n`,
    );
    process.stdout.write(`\nMarkdown 报告：${reportPath}\n`);
    process.stdout.write(
      `JSON 结构化输出：重新运行并追加 --json${options.pretty ? ' --pretty' : ''}\n`,
    );
    if (report.analysisGapSummary) {
      process.stdout.write(
        `\n完整分析口径：${report.definitions.fullyAnalyzed}\n`,
      );
      process.stdout.write(
        `可信展示口径：${report.definitions.trustedDisplayReady}\n`,
      );
      process.stdout.write(
        `Incomplete 随机样本（${formatInteger(
          (report.samples?.incompleteRandomSamples as unknown[] | undefined)?.length ?? 0,
        )} 条）和首页前 100 条专项审计已写入 JSON / Markdown 报告。\n`,
      );
    }
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void bootstrap();
}
