import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { FrozenAnalysisPoolService } from '../modules/analysis/frozen-analysis-pool.service';
import { runWithConcurrency } from '../modules/analysis/helpers/run-with-concurrency.helper';
import { QueueService } from '../modules/queue/queue.service';

type CliOptions = {
  json: boolean;
  pretty: boolean;
  noWrite: boolean;
  outputDir: string | null;
  providers: string[];
  p0Limit: number;
  p1Limit: number;
  p2Limit: number;
  suspectCompleteP0Limit: number;
  suspectCompleteP1Limit: number;
  suspectCompleteP2Limit: number;
  enqueue: boolean;
  enqueueSuspectComplete: boolean;
  staleMinutes: number;
};

type ProviderModelBreakdownRow = {
  provider: string;
  modelName: string;
  repoCount: number;
};

type LegacySummaryRow = {
  total: number;
  noSnapshot: number;
  noInsight: number;
  noDeep: number;
  deepComplete: number;
  fallbackUsed: number;
};

type PriorityBreakdownRow = {
  moneyPriority: string;
  repoCount: number;
  incompleteDeepCount: number;
};

type CandidateBacklogRow = {
  moneyPriority: string;
  total: number;
  noSnapshot: number;
  noInsight: number;
  noDeep: number;
};

type SuspectCompleteBacklogRow = {
  moneyPriority: string;
  total: number;
  localDecisionSourceCount: number;
  conflictCount: number;
  needsRecheckCount: number;
};

type SelectedCandidateRow = {
  repoId: string;
  fullName: string;
  htmlUrl: string;
  provider: string;
  modelName: string;
  moneyPriority: string;
  stars: number;
  moneyScore: number | null;
  hasSnapshot: boolean;
  hasInsight: boolean;
  hasCompleteness: boolean;
  hasIdeaFit: boolean;
  hasIdeaExtract: boolean;
  analyzedAt: string | null;
  remediationReason: string;
  priorityRank: number;
};

type SelectedSuspectCompleteRow = {
  repoId: string;
  fullName: string;
  htmlUrl: string;
  provider: string;
  modelName: string;
  moneyPriority: string;
  stars: number;
  moneyScore: number | null;
  analyzedAt: string | null;
  decisionSource: string | null;
  finalAction: string | null;
  hasConflict: boolean;
  needsRecheck: boolean;
  remediationReason: string;
  priorityRank: number;
};

type ThroughputRow = {
  snapshotCompleted: number;
  deepCompleted: number;
};

type StaleRunningRow = {
  queueName: string;
  runningCount: number;
  staleCount: number;
  oldestStartedAt: string | null;
};

type QueueBacklogRow = {
  queueName: string;
  pendingCount: number;
  runningCount: number;
};

type LegacyLocalAnalysisReport = {
  generatedAt: string;
  scope: {
    providers: string[];
    enqueue: boolean;
    p0Limit: number;
    p1Limit: number;
    p2Limit: number;
    suspectCompleteP0Limit: number;
    suspectCompleteP1Limit: number;
    suspectCompleteP2Limit: number;
    enqueueSuspectComplete: boolean;
    staleMinutes: number;
  };
  providerModelBreakdown: ProviderModelBreakdownRow[];
  backlogSummary: {
    analysisSinglePending: number;
    analysisSingleRunning: number;
    analysisSnapshotPending: number;
    analysisSnapshotRunning: number;
  };
  staleRunningSummary: {
    queueName: string;
    runningCount: number;
    staleCount: number;
    oldestStartedAt: string | null;
  }[];
  throughput: {
    last5m: ThroughputRow & {
      reposPerMinute: number;
      deepPerMinute: number;
      snapshotPerMinute: number;
    };
    last60m: ThroughputRow & {
      reposPerMinute: number;
      deepPerMinute: number;
      snapshotPerMinute: number;
    };
    last24h: ThroughputRow & {
      reposPerMinute: number;
      deepPerMinute: number;
      snapshotPerMinute: number;
    };
  };
  legacySummary: LegacySummaryRow & {
    legacyReposInflight: number;
    completeButStillLegacy: number;
  };
  legacyPriorityBreakdown: PriorityBreakdownRow[];
  remediationBacklog: {
    total: number;
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    byPriority: CandidateBacklogRow[];
  };
  suspectCompleteBacklog: {
    total: number;
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    byPriority: SuspectCompleteBacklogRow[];
  };
  selectedCandidates: SelectedCandidateRow[];
  selectedSuspectCompleteCandidates: SelectedSuspectCompleteRow[];
  enqueueResult: {
    queuedCount: number;
    skippedCount: number;
    queuedByPriority: Record<string, number>;
    skippedByReason: Record<string, number>;
  };
  enqueueSuspectCompleteResult: {
    queuedCount: number;
    skippedCount: number;
    queuedByPriority: Record<string, number>;
    skippedByReason: Record<string, number>;
  };
  frozenPoolPromotion: {
    requestedRepositoryCount: number;
    addedRepositoryCount: number;
    alreadyMemberCount: number;
    unresolvedRepositoryCount: number;
    totalRepositoryCount: number;
  } | null;
  nextActions: string[];
};

function parseBoolean(value: string | undefined, fallback = true) {
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

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    pretty: true,
    noWrite: false,
    outputDir: null,
    providers: ['omlx'],
    p0Limit: 20,
    p1Limit: 20,
    p2Limit: 0,
    suspectCompleteP0Limit: 10,
    suspectCompleteP1Limit: 10,
    suspectCompleteP2Limit: 0,
    enqueue: false,
    enqueueSuspectComplete: false,
    staleMinutes: 60,
  };

  for (const rawArg of argv) {
    const arg = String(rawArg ?? '').trim();
    if (!arg.startsWith('--')) {
      continue;
    }

    const [flag, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=').trim();

    if (flag === 'json') {
      options.json = parseBoolean(value, true);
    }
    if (flag === 'pretty') {
      options.pretty = parseBoolean(value, true);
    }
    if (flag === 'no-write') {
      options.noWrite = parseBoolean(value, true);
    }
    if (flag === 'output-dir' && value) {
      options.outputDir = value;
    }
    if (flag === 'providers' && value) {
      options.providers = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (flag === 'p0-limit') {
      options.p0Limit = parsePositiveInt(value, options.p0Limit);
    }
    if (flag === 'p1-limit') {
      options.p1Limit = parsePositiveInt(value, options.p1Limit);
    }
    if (flag === 'p2-limit') {
      options.p2Limit = parsePositiveInt(value, options.p2Limit);
    }
    if (flag === 'suspect-complete-p0-limit') {
      options.suspectCompleteP0Limit = parsePositiveInt(
        value,
        options.suspectCompleteP0Limit,
      );
    }
    if (flag === 'suspect-complete-p1-limit') {
      options.suspectCompleteP1Limit = parsePositiveInt(
        value,
        options.suspectCompleteP1Limit,
      );
    }
    if (flag === 'suspect-complete-p2-limit') {
      options.suspectCompleteP2Limit = parsePositiveInt(
        value,
        options.suspectCompleteP2Limit,
      );
    }
    if (flag === 'enqueue') {
      options.enqueue = parseBoolean(value, true);
    }
    if (flag === 'enqueue-suspect-complete') {
      options.enqueueSuspectComplete = parseBoolean(value, true);
    }
    if (flag === 'stale-minutes') {
      options.staleMinutes = parsePositiveInt(value, options.staleMinutes);
    }
  }

  if (!options.providers.length) {
    options.providers = ['omlx'];
  }

  return options;
}

function roundRate(value: number) {
  return Number(value.toFixed(2));
}

function buildThroughputRow(row: ThroughputRow, minutes: number) {
  return {
    snapshotCompleted: row.snapshotCompleted,
    deepCompleted: row.deepCompleted,
    reposPerMinute: roundRate((row.snapshotCompleted + row.deepCompleted) / minutes),
    deepPerMinute: roundRate(row.deepCompleted / minutes),
    snapshotPerMinute: roundRate(row.snapshotCompleted / minutes),
  };
}

type EnqueueCandidate = {
  repoId: string;
  moneyPriority: string;
  provider: string;
  modelName: string;
  remediationReason: string;
  extraMetadata?: Record<string, unknown>;
};

type EnqueueSummary = LegacyLocalAnalysisReport['enqueueResult'];
type FrozenPoolPromotionSummary = LegacyLocalAnalysisReport['frozenPoolPromotion'];
type EnqueueCandidateResult =
  | {
      status: 'queued';
      item: EnqueueCandidate;
    }
  | {
      status: 'retry_after_frozen_promotion';
      item: EnqueueCandidate;
    }
  | {
      status: 'skipped';
      item: EnqueueCandidate;
      reason: string;
    };

const LEGACY_LOCAL_ANALYSIS_ENQUEUE_CONCURRENCY_ENV_NAME =
  'LEGACY_LOCAL_ANALYSIS_ENQUEUE_CONCURRENCY';
const LEGACY_LOCAL_ANALYSIS_ENQUEUE_CONCURRENCY_FALLBACK = 8;

function createEnqueueSummary(): EnqueueSummary {
  return {
    queuedCount: 0,
    skippedCount: 0,
    queuedByPriority: {},
    skippedByReason: {},
  };
}

function resolveLegacyLocalAnalysisEnqueueConcurrency(candidateCount: number) {
  return Math.min(
    candidateCount,
    Math.max(
      1,
      parsePositiveInt(
        process.env[LEGACY_LOCAL_ANALYSIS_ENQUEUE_CONCURRENCY_ENV_NAME],
        LEGACY_LOCAL_ANALYSIS_ENQUEUE_CONCURRENCY_FALLBACK,
      ),
    ),
  );
}

function recordQueuedCandidate(summary: EnqueueSummary, item: EnqueueCandidate) {
  summary.queuedCount += 1;
  summary.queuedByPriority[item.moneyPriority] =
    (summary.queuedByPriority[item.moneyPriority] ?? 0) + 1;
}

function recordSkippedCandidate(summary: EnqueueSummary, reason: string) {
  summary.skippedCount += 1;
  summary.skippedByReason[reason] = (summary.skippedByReason[reason] ?? 0) + 1;
}

function mergeFrozenPoolPromotion(
  current: FrozenPoolPromotionSummary,
  next: FrozenPoolPromotionSummary,
): FrozenPoolPromotionSummary {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  return {
    requestedRepositoryCount:
      current.requestedRepositoryCount + next.requestedRepositoryCount,
    addedRepositoryCount: current.addedRepositoryCount + next.addedRepositoryCount,
    alreadyMemberCount: current.alreadyMemberCount + next.alreadyMemberCount,
    unresolvedRepositoryCount:
      current.unresolvedRepositoryCount + next.unresolvedRepositoryCount,
    totalRepositoryCount: Math.max(
      current.totalRepositoryCount,
      next.totalRepositoryCount,
    ),
  };
}

function buildFrozenPoolPromotionSummary(
  value: {
    requestedRepositoryCount: number;
    addedRepositoryCount: number;
    alreadyMemberCount: number;
    unresolvedRepositoryCount: number;
    totalRepositoryCount: number;
  },
): FrozenPoolPromotionSummary {
  return {
    requestedRepositoryCount: value.requestedRepositoryCount,
    addedRepositoryCount: value.addedRepositoryCount,
    alreadyMemberCount: value.alreadyMemberCount,
    unresolvedRepositoryCount: value.unresolvedRepositoryCount,
    totalRepositoryCount: value.totalRepositoryCount,
  };
}

function toQueuePriority(moneyPriority: string) {
  switch (moneyPriority) {
    case 'P0':
      return 8;
    case 'P1':
      return 16;
    case 'P2':
      return 40;
    default:
      return 80;
  }
}

function renderMarkdown(report: LegacyLocalAnalysisReport) {
  const lines = [
    '# Legacy Local Analysis Audit',
    '',
    `- Generated At: ${report.generatedAt}`,
    `- Providers: ${report.scope.providers.join(', ')}`,
    `- Enqueue Applied: ${report.scope.enqueue ? 'yes' : 'no'}`,
    '',
    '## Legacy Summary',
    `- Legacy repos: ${report.legacySummary.total}`,
    `- Missing snapshot: ${report.legacySummary.noSnapshot}`,
    `- Missing insight: ${report.legacySummary.noInsight}`,
    `- Missing deep analysis: ${report.legacySummary.noDeep}`,
    `- Deep complete but still legacy: ${report.legacySummary.deepComplete}`,
    `- Legacy repos already inflight: ${report.legacySummary.legacyReposInflight}`,
    '',
    '## Throughput',
    `- Last 5m: total=${report.throughput.last5m.snapshotCompleted + report.throughput.last5m.deepCompleted}, repos/min=${report.throughput.last5m.reposPerMinute}, deep/min=${report.throughput.last5m.deepPerMinute}, snapshot/min=${report.throughput.last5m.snapshotPerMinute}`,
    `- Last 60m: total=${report.throughput.last60m.snapshotCompleted + report.throughput.last60m.deepCompleted}, repos/min=${report.throughput.last60m.reposPerMinute}, deep/min=${report.throughput.last60m.deepPerMinute}, snapshot/min=${report.throughput.last60m.snapshotPerMinute}`,
    `- Last 24h: total=${report.throughput.last24h.snapshotCompleted + report.throughput.last24h.deepCompleted}, repos/min=${report.throughput.last24h.reposPerMinute}, deep/min=${report.throughput.last24h.deepPerMinute}, snapshot/min=${report.throughput.last24h.snapshotPerMinute}`,
    '',
    '## Remediation Backlog',
    `- Not inflight incomplete candidates: ${report.remediationBacklog.total}`,
    `- P0: ${report.remediationBacklog.p0}`,
    `- P1: ${report.remediationBacklog.p1}`,
    `- P2: ${report.remediationBacklog.p2}`,
    `- P3: ${report.remediationBacklog.p3}`,
    '',
    '## Suspect Complete Backlog',
    `- Not inflight complete-but-legacy suspects: ${report.suspectCompleteBacklog.total}`,
    `- P0: ${report.suspectCompleteBacklog.p0}`,
    `- P1: ${report.suspectCompleteBacklog.p1}`,
    `- P2: ${report.suspectCompleteBacklog.p2}`,
    `- P3: ${report.suspectCompleteBacklog.p3}`,
    '',
    '## Enqueue Result',
    `- Queued: ${report.enqueueResult.queuedCount}`,
    `- Skipped: ${report.enqueueResult.skippedCount}`,
    `- Suspect complete queued: ${report.enqueueSuspectCompleteResult.queuedCount}`,
    `- Suspect complete skipped: ${report.enqueueSuspectCompleteResult.skippedCount}`,
  ];

  if (report.frozenPoolPromotion) {
    lines.push(
      `- Frozen pool promoted: ${report.frozenPoolPromotion.addedRepositoryCount}/${report.frozenPoolPromotion.requestedRepositoryCount}`,
    );
  }

  if (report.selectedCandidates.length) {
    lines.push('', '## Selected Candidates');
    for (const item of report.selectedCandidates.slice(0, 20)) {
      lines.push(
        `- ${item.moneyPriority} ${item.fullName} (${item.remediationReason}) stars=${item.stars} model=${item.modelName}`,
      );
    }
  }

  if (report.selectedSuspectCompleteCandidates.length) {
    lines.push('', '## Selected Suspect Complete Candidates');
    for (const item of report.selectedSuspectCompleteCandidates.slice(0, 20)) {
      lines.push(
        `- ${item.moneyPriority} ${item.fullName} (${item.remediationReason}) source=${item.decisionSource ?? '<null>'} action=${item.finalAction ?? '<null>'}`,
      );
    }
  }

  if (report.nextActions.length) {
    lines.push('', '## Next Actions');
    for (const action of report.nextActions) {
      lines.push(`- ${action}`);
    }
  }

  return lines.join('\n');
}

async function enqueueCandidates(args: {
  candidates: EnqueueCandidate[];
  remediationMode: string;
  queueService: QueueService;
  frozenAnalysisPoolService: FrozenAnalysisPoolService;
  enqueueResult: EnqueueSummary;
  frozenPoolPromotion: FrozenPoolPromotionSummary;
}) {
  const retryAfterFrozenPromotion: EnqueueCandidate[] = [];
  let frozenPoolPromotion = args.frozenPoolPromotion;

  const firstPassResults = await runWithConcurrency(
    args.candidates,
    resolveLegacyLocalAnalysisEnqueueConcurrency(args.candidates.length),
    async (item): Promise<EnqueueCandidateResult> => {
      try {
        await args.queueService.enqueueSingleAnalysis(
          item.repoId,
          {
            runFastFilter: true,
            runCompleteness: true,
            runIdeaFit: true,
            runIdeaExtract: true,
            forceRerun: true,
          },
          args.remediationMode,
          {
            metadata: {
              remediationMode: args.remediationMode,
              previousProvider: item.provider,
              previousModel: item.modelName,
              remediationReason: item.remediationReason,
              ...(item.extraMetadata ?? {}),
            },
            jobOptionsOverride: {
              priority: toQueuePriority(item.moneyPriority),
            },
          },
        );
        return {
          status: 'queued',
          item,
        };
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'queue_enqueue_failed';

        if (reason.includes('analysis_pool_frozen_non_member:analysis_single')) {
          return {
            status: 'retry_after_frozen_promotion',
            item,
          };
        }

        return {
          status: 'skipped',
          item,
          reason,
        };
      }
    },
  );

  for (const result of firstPassResults) {
    if (result.status === 'queued') {
      recordQueuedCandidate(args.enqueueResult, result.item);
      continue;
    }

    if (result.status === 'retry_after_frozen_promotion') {
      retryAfterFrozenPromotion.push(result.item);
      continue;
    }

    recordSkippedCandidate(args.enqueueResult, result.reason);
  }

  if (!retryAfterFrozenPromotion.length) {
    return {
      frozenPoolPromotion,
    };
  }

  const promotionResult =
    await args.frozenAnalysisPoolService.includeRepositoryIdsInFrozenPoolSnapshot({
      repositoryIds: retryAfterFrozenPromotion.map((item) => item.repoId),
      reason: args.remediationMode,
    });
  frozenPoolPromotion = mergeFrozenPoolPromotion(
    frozenPoolPromotion,
    buildFrozenPoolPromotionSummary(promotionResult),
  );

  const retryResults = await runWithConcurrency(
    retryAfterFrozenPromotion,
    resolveLegacyLocalAnalysisEnqueueConcurrency(
      retryAfterFrozenPromotion.length,
    ),
    async (item): Promise<EnqueueCandidateResult> => {
      try {
        await args.queueService.enqueueSingleAnalysis(
          item.repoId,
          {
            runFastFilter: true,
            runCompleteness: true,
            runIdeaFit: true,
            runIdeaExtract: true,
            forceRerun: true,
          },
          args.remediationMode,
          {
            metadata: {
              remediationMode: args.remediationMode,
              previousProvider: item.provider,
              previousModel: item.modelName,
              remediationReason: item.remediationReason,
              frozenPoolPromotionApplied: true,
              ...(item.extraMetadata ?? {}),
            },
            jobOptionsOverride: {
              priority: toQueuePriority(item.moneyPriority),
            },
          },
        );
        return {
          status: 'queued',
          item,
        };
      } catch (error) {
        return {
          status: 'skipped',
          item,
          reason:
            error instanceof Error ? error.message : 'queue_enqueue_failed',
        };
      }
    },
  );

  for (const result of retryResults) {
    if (result.status === 'queued') {
      recordQueuedCandidate(args.enqueueResult, result.item);
      continue;
    }

    recordSkippedCandidate(args.enqueueResult, result.reason);
  }

  return {
    frozenPoolPromotion,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const queueService = app.get(QueueService);
    const frozenAnalysisPoolService = app.get(FrozenAnalysisPoolService);
    const staleCutoff = new Date(Date.now() - options.staleMinutes * 60_000);

    const providerModelBreakdown = (await prisma.$queryRawUnsafe(
      `
        select
          coalesce(provider, '<null>') as provider,
          coalesce("modelName", '<null>') as "modelName",
          count(*)::int as "repoCount"
        from "RepositoryAnalysis"
        group by 1, 2
        order by 3 desc
        limit 20
      `,
    )) as ProviderModelBreakdownRow[];

    const legacySummaryRows = (await prisma.$queryRawUnsafe(
      `
        select
          count(*)::int as total,
          count(*) filter (where a."ideaSnapshotJson" is null)::int as "noSnapshot",
          count(*) filter (where a."ideaSnapshotJson" is not null and a."insightJson" is null)::int as "noInsight",
          count(*) filter (
            where a."ideaSnapshotJson" is not null
              and a."insightJson" is not null
              and (a."completenessJson" is null or a."ideaFitJson" is null or a."extractedIdeaJson" is null)
          )::int as "noDeep",
          count(*) filter (
            where a."completenessJson" is not null
              and a."ideaFitJson" is not null
              and a."extractedIdeaJson" is not null
          )::int as "deepComplete",
          count(*) filter (where a."fallbackUsed" = true)::int as "fallbackUsed"
        from "RepositoryAnalysis" a
        where a.provider = any($1)
      `,
      options.providers,
    )) as LegacySummaryRow[];

    const legacyPriorityBreakdown = (await prisma.$queryRawUnsafe(
      `
        select
          coalesce(cr."moneyPriority", 'NONE') as "moneyPriority",
          count(*)::int as "repoCount",
          count(*) filter (
            where a."completenessJson" is null or a."ideaFitJson" is null or a."extractedIdeaJson" is null
          )::int as "incompleteDeepCount"
        from "RepositoryAnalysis" a
        join "Repository" r on r.id = a."repositoryId"
        left join "RepositoryCachedRanking" cr on cr."repoId" = r.id
        where a.provider = any($1)
        group by 1
        order by case coalesce(cr."moneyPriority", 'NONE')
          when 'P0' then 0
          when 'P1' then 1
          when 'P2' then 2
          when 'P3' then 3
          else 4
        end
      `,
      options.providers,
    )) as PriorityBreakdownRow[];

    const queueBacklogRows = (await prisma.$queryRawUnsafe(
      `
        select
          "queueName" as "queueName",
          count(*) filter (where "jobStatus" = 'PENDING')::int as "pendingCount",
          count(*) filter (where "jobStatus" = 'RUNNING')::int as "runningCount"
        from "JobLog"
        where "queueName" in ('analysis.single', 'analysis.snapshot')
        group by 1
      `,
    )) as QueueBacklogRow[];

    const runningRows = await prisma.jobLog.findMany({
      where: {
        jobStatus: 'RUNNING',
        queueName: {
          in: ['analysis.single', 'analysis.snapshot'],
        },
      },
      select: {
        queueName: true,
        startedAt: true,
      },
      orderBy: [
        {
          queueName: 'asc',
        },
        {
          startedAt: 'asc',
        },
      ],
    });
    const staleRunningSummaryMap = new Map<string, StaleRunningRow>();
    for (const row of runningRows) {
      const queueName = row.queueName ?? '<null>';
      const existing = staleRunningSummaryMap.get(queueName) ?? {
        queueName,
        runningCount: 0,
        staleCount: 0,
        oldestStartedAt: null,
      };
      existing.runningCount += 1;
      if (row.startedAt && row.startedAt < staleCutoff) {
        existing.staleCount += 1;
      }
      if (row.startedAt && !existing.oldestStartedAt) {
        existing.oldestStartedAt = row.startedAt.toISOString();
      }
      staleRunningSummaryMap.set(queueName, existing);
    }
    const staleRunningSummary = Array.from(staleRunningSummaryMap.values()).sort(
      (left, right) => left.queueName.localeCompare(right.queueName),
    );

    const remediationBacklogRows = (await prisma.$queryRawUnsafe(
      `
        with inflight as (
          select distinct cast(payload->>'repositoryId' as text) as repo_id
          from "JobLog"
          where "queueName" in ('analysis.single', 'analysis.snapshot')
            and "jobStatus" in ('PENDING', 'RUNNING')
            and payload->>'repositoryId' is not null
        )
        select
          coalesce(cr."moneyPriority", 'P3') as "moneyPriority",
          count(*)::int as total,
          count(*) filter (where a."ideaSnapshotJson" is null)::int as "noSnapshot",
          count(*) filter (where a."ideaSnapshotJson" is not null and a."insightJson" is null)::int as "noInsight",
          count(*) filter (
            where a."ideaSnapshotJson" is not null
              and a."insightJson" is not null
              and (a."completenessJson" is null or a."ideaFitJson" is null or a."extractedIdeaJson" is null)
          )::int as "noDeep"
        from "RepositoryAnalysis" a
        join "Repository" r on r.id = a."repositoryId"
        left join "RepositoryCachedRanking" cr on cr."repoId" = r.id
        left join inflight i on i.repo_id = r.id
        where a.provider = any($1)
          and i.repo_id is null
          and (
            a."ideaSnapshotJson" is null
            or a."insightJson" is null
            or a."completenessJson" is null
            or a."ideaFitJson" is null
            or a."extractedIdeaJson" is null
          )
        group by 1
        order by case coalesce(cr."moneyPriority", 'P3')
          when 'P0' then 0
          when 'P1' then 1
          when 'P2' then 2
          when 'P3' then 3
          else 4
        end
      `,
      options.providers,
    )) as CandidateBacklogRow[];

    const suspectCompleteBacklogRows = (await prisma.$queryRawUnsafe(
      `
        with inflight as (
          select distinct cast(payload->>'repositoryId' as text) as repo_id
          from "JobLog"
          where "queueName" in ('analysis.single', 'analysis.snapshot')
            and "jobStatus" in ('PENDING', 'RUNNING')
            and payload->>'repositoryId' is not null
        )
        select
          coalesce(cr."moneyPriority", 'P3') as "moneyPriority",
          count(*)::int as total,
          count(*) filter (
            where coalesce(cr."decisionSource", '') in ('local', 'fallback')
          )::int as "localDecisionSourceCount",
          count(*) filter (where coalesce(cr."hasConflict", false) = true)::int as "conflictCount",
          count(*) filter (where coalesce(cr."needsRecheck", false) = true)::int as "needsRecheckCount"
        from "RepositoryAnalysis" a
        join "Repository" r on r.id = a."repositoryId"
        left join "RepositoryCachedRanking" cr on cr."repoId" = r.id
        left join inflight i on i.repo_id = r.id
        where a.provider = any($1)
          and i.repo_id is null
          and a."ideaSnapshotJson" is not null
          and a."insightJson" is not null
          and a."completenessJson" is not null
          and a."ideaFitJson" is not null
          and a."extractedIdeaJson" is not null
          and (
            coalesce(cr."decisionSource", '') in ('local', 'fallback')
            or coalesce(cr."hasConflict", false) = true
            or coalesce(cr."needsRecheck", false) = true
          )
        group by 1
        order by case coalesce(cr."moneyPriority", 'P3')
          when 'P0' then 0
          when 'P1' then 1
          when 'P2' then 2
          when 'P3' then 3
          else 4
        end
      `,
      options.providers,
    )) as SuspectCompleteBacklogRow[];

    const legacyInflightRows = (await prisma.$queryRawUnsafe(
      `
        with inflight as (
          select distinct cast(payload->>'repositoryId' as text) as repo_id
          from "JobLog"
          where "queueName" in ('analysis.single', 'analysis.snapshot')
            and "jobStatus" in ('PENDING', 'RUNNING')
            and payload->>'repositoryId' is not null
        )
        select count(*)::int as count
        from inflight i
        join "RepositoryAnalysis" a on a."repositoryId" = i.repo_id
        where a.provider = any($1)
      `,
      options.providers,
    )) as Array<{ count: number }>;

    const selectCandidatesQuery = `
      with inflight as (
        select distinct cast(payload->>'repositoryId' as text) as repo_id
        from "JobLog"
        where "queueName" in ('analysis.single', 'analysis.snapshot')
          and "jobStatus" in ('PENDING', 'RUNNING')
          and payload->>'repositoryId' is not null
      ),
      ranked as (
        select
          r.id as "repoId",
          r."fullName" as "fullName",
          r."htmlUrl" as "htmlUrl",
          a.provider as provider,
          coalesce(a."modelName", '<null>') as "modelName",
          coalesce(cr."moneyPriority", 'P3') as "moneyPriority",
          r.stars::int as stars,
          cr."moneyScore"::float as "moneyScore",
          (a."ideaSnapshotJson" is not null) as "hasSnapshot",
          (a."insightJson" is not null) as "hasInsight",
          (a."completenessJson" is not null) as "hasCompleteness",
          (a."ideaFitJson" is not null) as "hasIdeaFit",
          (a."extractedIdeaJson" is not null) as "hasIdeaExtract",
          a."analyzedAt"::text as "analyzedAt",
          case
            when a."ideaSnapshotJson" is null then 'NO_SNAPSHOT'
            when a."insightJson" is null then 'NO_INSIGHT'
            else 'NO_DEEP'
          end as "remediationReason",
          row_number() over (
            partition by coalesce(cr."moneyPriority", 'P3')
            order by
              coalesce(cr."moneyScore", 0) desc nulls last,
              r.stars desc,
              r."updatedAtGithub" desc nulls last,
              r.id asc
          )::int as "priorityRank"
        from "RepositoryAnalysis" a
        join "Repository" r on r.id = a."repositoryId"
        left join "RepositoryCachedRanking" cr on cr."repoId" = r.id
        left join inflight i on i.repo_id = r.id
        where a.provider = any($1)
          and i.repo_id is null
          and (
            a."ideaSnapshotJson" is null
            or a."insightJson" is null
            or a."completenessJson" is null
            or a."ideaFitJson" is null
            or a."extractedIdeaJson" is null
          )
      )
      select *
      from ranked
      where ("moneyPriority" = 'P0' and "priorityRank" <= $2)
         or ("moneyPriority" = 'P1' and "priorityRank" <= $3)
         or ("moneyPriority" = 'P2' and "priorityRank" <= $4)
      order by
        case "moneyPriority"
          when 'P0' then 0
          when 'P1' then 1
          when 'P2' then 2
          else 3
        end,
        "priorityRank" asc
    `;

    const selectedCandidates = (await prisma.$queryRawUnsafe(
      selectCandidatesQuery,
      options.providers,
      options.p0Limit,
      options.p1Limit,
      options.p2Limit,
    )) as SelectedCandidateRow[];

    const selectSuspectCompleteCandidatesQuery = `
      with inflight as (
        select distinct cast(payload->>'repositoryId' as text) as repo_id
        from "JobLog"
        where "queueName" in ('analysis.single', 'analysis.snapshot')
          and "jobStatus" in ('PENDING', 'RUNNING')
          and payload->>'repositoryId' is not null
      ),
      ranked as (
        select
          r.id as "repoId",
          r."fullName" as "fullName",
          r."htmlUrl" as "htmlUrl",
          a.provider as provider,
          coalesce(a."modelName", '<null>') as "modelName",
          coalesce(cr."moneyPriority", 'P3') as "moneyPriority",
          r.stars::int as stars,
          cr."moneyScore"::float as "moneyScore",
          a."analyzedAt"::text as "analyzedAt",
          nullif(cr."decisionSource", '') as "decisionSource",
          nullif(cr."finalAction", '') as "finalAction",
          coalesce(cr."hasConflict", false) as "hasConflict",
          coalesce(cr."needsRecheck", false) as "needsRecheck",
          case
            when coalesce(cr."decisionSource", '') in ('local', 'fallback')
              then 'LEGACY_LOCAL_DECISION_SOURCE'
            when coalesce(cr."hasConflict", false) = true
              then 'LEGACY_COMPLETE_CONFLICT'
            when coalesce(cr."needsRecheck", false) = true
              then 'LEGACY_COMPLETE_NEEDS_RECHECK'
            else 'LEGACY_COMPLETE_SUSPECT'
          end as "remediationReason",
          row_number() over (
            partition by coalesce(cr."moneyPriority", 'P3')
            order by
              coalesce(cr."moneyScore", 0) desc nulls last,
              r.stars desc,
              r."updatedAtGithub" desc nulls last,
              r.id asc
          )::int as "priorityRank"
        from "RepositoryAnalysis" a
        join "Repository" r on r.id = a."repositoryId"
        left join "RepositoryCachedRanking" cr on cr."repoId" = r.id
        left join inflight i on i.repo_id = r.id
        where a.provider = any($1)
          and i.repo_id is null
          and a."ideaSnapshotJson" is not null
          and a."insightJson" is not null
          and a."completenessJson" is not null
          and a."ideaFitJson" is not null
          and a."extractedIdeaJson" is not null
          and (
            coalesce(cr."decisionSource", '') in ('local', 'fallback')
            or coalesce(cr."hasConflict", false) = true
            or coalesce(cr."needsRecheck", false) = true
          )
      )
      select *
      from ranked
      where ("moneyPriority" = 'P0' and "priorityRank" <= $2)
         or ("moneyPriority" = 'P1' and "priorityRank" <= $3)
         or ("moneyPriority" = 'P2' and "priorityRank" <= $4)
      order by
        case "moneyPriority"
          when 'P0' then 0
          when 'P1' then 1
          when 'P2' then 2
          else 3
        end,
        "priorityRank" asc
    `;

    const selectedSuspectCompleteCandidates = (await prisma.$queryRawUnsafe(
      selectSuspectCompleteCandidatesQuery,
      options.providers,
      options.suspectCompleteP0Limit,
      options.suspectCompleteP1Limit,
      options.suspectCompleteP2Limit,
    )) as SelectedSuspectCompleteRow[];

    const throughput5mRows = (await prisma.$queryRawUnsafe(
      `
        select
          count(*) filter (where "jobName" = 'analysis.idea_snapshot')::int as "snapshotCompleted",
          count(*) filter (where "jobName" = 'analysis.run_single')::int as "deepCompleted"
        from "JobLog"
        where "jobStatus" = 'SUCCESS'
          and "finishedAt" >= now() - interval '5 minutes'
      `,
    )) as ThroughputRow[];
    const throughput60mRows = (await prisma.$queryRawUnsafe(
      `
        select
          count(*) filter (where "jobName" = 'analysis.idea_snapshot')::int as "snapshotCompleted",
          count(*) filter (where "jobName" = 'analysis.run_single')::int as "deepCompleted"
        from "JobLog"
        where "jobStatus" = 'SUCCESS'
          and "finishedAt" >= now() - interval '60 minutes'
      `,
    )) as ThroughputRow[];
    const throughput24hRows = (await prisma.$queryRawUnsafe(
      `
        select
          count(*) filter (where "jobName" = 'analysis.idea_snapshot')::int as "snapshotCompleted",
          count(*) filter (where "jobName" = 'analysis.run_single')::int as "deepCompleted"
        from "JobLog"
        where "jobStatus" = 'SUCCESS'
          and "finishedAt" >= now() - interval '24 hours'
      `,
    )) as ThroughputRow[];

    const enqueueResult = createEnqueueSummary();
    const enqueueSuspectCompleteResult = createEnqueueSummary();
    let frozenPoolPromotion: LegacyLocalAnalysisReport['frozenPoolPromotion'] = null;

    if (options.enqueue) {
      const result = await enqueueCandidates({
        candidates: selectedCandidates.map((item) => ({
          repoId: item.repoId,
          moneyPriority: item.moneyPriority,
          provider: item.provider,
          modelName: item.modelName,
          remediationReason: item.remediationReason,
        })),
        remediationMode: 'legacy_local_provider_full_rerun',
        queueService,
        frozenAnalysisPoolService,
        enqueueResult,
        frozenPoolPromotion,
      });
      frozenPoolPromotion = result.frozenPoolPromotion;
    }

    if (options.enqueueSuspectComplete) {
      const result = await enqueueCandidates({
        candidates: selectedSuspectCompleteCandidates.map((item) => ({
          repoId: item.repoId,
          moneyPriority: item.moneyPriority,
          provider: item.provider,
          modelName: item.modelName,
          remediationReason: item.remediationReason,
          extraMetadata: {
            previousDecisionSource: item.decisionSource,
            previousFinalAction: item.finalAction,
            previousHasConflict: item.hasConflict,
            previousNeedsRecheck: item.needsRecheck,
          },
        })),
        remediationMode: 'legacy_local_complete_suspect_rerun',
        queueService,
        frozenAnalysisPoolService,
        enqueueResult: enqueueSuspectCompleteResult,
        frozenPoolPromotion,
      });
      frozenPoolPromotion = result.frozenPoolPromotion;
    }

    const backlogSummary = {
      analysisSinglePending:
        queueBacklogRows.find((row) => row.queueName === 'analysis.single')
          ?.pendingCount ?? 0,
      analysisSingleRunning:
        queueBacklogRows.find((row) => row.queueName === 'analysis.single')
          ?.runningCount ?? 0,
      analysisSnapshotPending:
        queueBacklogRows.find((row) => row.queueName === 'analysis.snapshot')
          ?.pendingCount ?? 0,
      analysisSnapshotRunning:
        queueBacklogRows.find((row) => row.queueName === 'analysis.snapshot')
          ?.runningCount ?? 0,
    };
    const suspectCompleteBacklogTotal = suspectCompleteBacklogRows.reduce(
      (sum, row) => sum + row.total,
      0,
    );

    const report: LegacyLocalAnalysisReport = {
      generatedAt: new Date().toISOString(),
      scope: {
        providers: options.providers,
        enqueue: options.enqueue,
        p0Limit: options.p0Limit,
        p1Limit: options.p1Limit,
        p2Limit: options.p2Limit,
        suspectCompleteP0Limit: options.suspectCompleteP0Limit,
        suspectCompleteP1Limit: options.suspectCompleteP1Limit,
        suspectCompleteP2Limit: options.suspectCompleteP2Limit,
        enqueueSuspectComplete: options.enqueueSuspectComplete,
        staleMinutes: options.staleMinutes,
      },
      providerModelBreakdown,
      backlogSummary,
      staleRunningSummary: staleRunningSummary.map((row) => ({
        queueName: row.queueName,
        runningCount: row.runningCount,
        staleCount: row.staleCount,
        oldestStartedAt: row.oldestStartedAt,
      })),
      throughput: {
        last5m: buildThroughputRow(throughput5mRows[0] ?? {
          snapshotCompleted: 0,
          deepCompleted: 0,
        }, 5),
        last60m: buildThroughputRow(throughput60mRows[0] ?? {
          snapshotCompleted: 0,
          deepCompleted: 0,
        }, 60),
        last24h: buildThroughputRow(throughput24hRows[0] ?? {
          snapshotCompleted: 0,
          deepCompleted: 0,
        }, 24 * 60),
      },
      legacySummary: {
        ...(legacySummaryRows[0] ?? {
          total: 0,
          noSnapshot: 0,
          noInsight: 0,
          noDeep: 0,
          deepComplete: 0,
          fallbackUsed: 0,
        }),
        legacyReposInflight: legacyInflightRows[0]?.count ?? 0,
        completeButStillLegacy: legacySummaryRows[0]?.deepComplete ?? 0,
      },
      legacyPriorityBreakdown,
      remediationBacklog: {
        total: remediationBacklogRows.reduce((sum, row) => sum + row.total, 0),
        p0:
          remediationBacklogRows.find((row) => row.moneyPriority === 'P0')?.total ??
          0,
        p1:
          remediationBacklogRows.find((row) => row.moneyPriority === 'P1')?.total ??
          0,
        p2:
          remediationBacklogRows.find((row) => row.moneyPriority === 'P2')?.total ??
          0,
        p3:
          remediationBacklogRows.find((row) => row.moneyPriority === 'P3')?.total ??
          0,
        byPriority: remediationBacklogRows,
      },
      suspectCompleteBacklog: {
        total: suspectCompleteBacklogTotal,
        p0:
          suspectCompleteBacklogRows.find((row) => row.moneyPriority === 'P0')
            ?.total ?? 0,
        p1:
          suspectCompleteBacklogRows.find((row) => row.moneyPriority === 'P1')
            ?.total ?? 0,
        p2:
          suspectCompleteBacklogRows.find((row) => row.moneyPriority === 'P2')
            ?.total ?? 0,
        p3:
          suspectCompleteBacklogRows.find((row) => row.moneyPriority === 'P3')
            ?.total ?? 0,
        byPriority: suspectCompleteBacklogRows,
      },
      selectedCandidates,
      selectedSuspectCompleteCandidates,
      enqueueResult,
      enqueueSuspectCompleteResult,
      frozenPoolPromotion,
      nextActions: [
        backlogSummary.analysisSinglePending > 40_000
          ? 'analysis.single 仍然被 deep backlog 压住，下一刀要优先处理 decision_recalc 堵塞段。'
          : 'analysis.single backlog 已低于 4 万，可继续扩大 legacy local remediation 批次。',
        staleRunningSummary.some((row) => row.staleCount > 0)
          ? 'JobLog 存在长时间 RUNNING 的陈旧记录，建议直接执行 pnpm --filter api queue:reconcile-stale-running -- --apply 做 queue/jobLog 对账。'
          : '当前没有明显 stale RUNNING JobLog，可继续按当前节奏回补 legacy local 数据。',
        frozenPoolPromotion && frozenPoolPromotion.addedRepositoryCount > 0
          ? `已自动把 ${frozenPoolPromotion.addedRepositoryCount} 个 remediation repo 补录进冻结池 membership，再走主分析链入队。`
          : 'legacy remediation 会优先复用当前冻结池和主分析链，不再绕开现有 gate。',
        selectedCandidates.length > 0 && !options.enqueue
          ? '可以直接用同一脚本追加 --enqueue，先回补未在飞的 P0/P1 旧本地模型样本。'
          : '已开始把未在飞的高优先旧本地模型样本切回当前 API 主分析链路。',
        suspectCompleteBacklogTotal > 0 && !options.enqueueSuspectComplete
          ? 'deep 已齐但 decisionSource 仍为 local/fallback 的旧结果需要单独纠偏，可追加 --enqueue-suspect-complete 回补。'
          : '已把 complete-but-legacy suspect 样本纳入 API 主链纠偏。',
      ],
    };

    const markdown = renderMarkdown(report);
    const stamp = report.generatedAt.slice(0, 19).replaceAll(':', '').replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'legacy-local-analysis');
    const markdownPath = path.join(outputDir, `legacy-local-analysis-${stamp}.md`);
    const jsonPath = path.join(outputDir, `legacy-local-analysis-${stamp}.json`);

    if (!options.noWrite) {
      await mkdir(outputDir, { recursive: true });
      await Promise.all([
        writeFile(markdownPath, `${markdown}\n`, 'utf8'),
        writeFile(
          jsonPath,
          `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`,
          'utf8',
        ),
      ]);
    }

    const payload = options.json
      ? report
      : {
          generatedAt: report.generatedAt,
          markdownPath: options.noWrite ? null : markdownPath,
          jsonPath: options.noWrite ? null : jsonPath,
          summary: {
            legacyRepos: report.legacySummary.total,
            legacyNoDeep: report.legacySummary.noDeep,
            legacyDeepComplete: report.legacySummary.deepComplete,
            legacyInflight: report.legacySummary.legacyReposInflight,
            remediationBacklog: report.remediationBacklog.total,
            suspectCompleteBacklog: report.suspectCompleteBacklog.total,
            selectedCandidates: report.selectedCandidates.length,
            selectedSuspectCompleteCandidates:
              report.selectedSuspectCompleteCandidates.length,
            queuedCount: report.enqueueResult.queuedCount,
            queuedSuspectCompleteCount:
              report.enqueueSuspectCompleteResult.queuedCount,
            frozenPoolPromotedCount:
              report.frozenPoolPromotion?.addedRepositoryCount ?? 0,
            last24hReposPerMinute: report.throughput.last24h.reposPerMinute,
            last24hDeepPerMinute: report.throughput.last24h.deepPerMinute,
            staleRunningCount: report.staleRunningSummary.reduce(
              (sum, row) => sum + row.staleCount,
              0,
            ),
          },
        };

    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

void main();
