import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { JobStatus } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { QUEUE_NAMES, QueueName } from '../modules/queue/queue.constants';
import { getQueueConnection } from '../modules/queue/queue.redis';
import {
  decideStaleJobLogReconciliation,
  normalizeQueueObservedState,
  readHistoricalRepairActionFromPayload,
  readRepositoryIdFromPayload,
  type NormalizedQueueObservedState,
  type StaleJobLogDisposition,
} from './helpers/stale-job-log-reconcile.helper';

type AllowedQueueName =
  | typeof QUEUE_NAMES.ANALYSIS_SINGLE
  | typeof QUEUE_NAMES.ANALYSIS_SNAPSHOT;

type CliOptions = {
  apply: boolean;
  json: boolean;
  pretty: boolean;
  noWrite: boolean;
  outputDir: string | null;
  staleMinutes: number;
  limit: number;
  concurrency: number;
  queueNames: AllowedQueueName[];
};

type StaleJobLogRow = {
  id: string;
  jobName: string;
  queueName: string | null;
  queueJobId: string | null;
  jobStatus: JobStatus;
  triggeredBy: string | null;
  payload: unknown;
  startedAt: Date | null;
  createdAt: Date;
};

type QueueInspection = {
  observedState: NormalizedQueueObservedState;
  job: Job | null;
};

type ReconcileRowResult = {
  jobLogId: string;
  jobStatus: JobStatus;
  queueName: string;
  queueJobId: string | null;
  jobName: string;
  repositoryId: string | null;
  historicalRepairAction: string | null;
  triggeredBy: string | null;
  startedAt: string | null;
  ageMinutes: number;
  observedState: NormalizedQueueObservedState;
  disposition: StaleJobLogDisposition;
  reason: string;
  applied: boolean;
};

type QueueBreakdownRow = {
  queueName: string;
  inspectedCount: number;
  keptRunningCount: number;
  keptPendingCount: number;
  markedRunningCount: number;
  movedToPendingCount: number;
  markedSuccessCount: number;
  markedFailedCount: number;
  manualReviewCount: number;
};

type ActionBreakdownRow = {
  action: string;
  inspectedCount: number;
  markedRunningCount: number;
  movedToPendingCount: number;
  markedSuccessCount: number;
  markedFailedCount: number;
};

type StaleAnalysisJobLogReconcileReport = {
  generatedAt: string;
  scope: {
    apply: boolean;
    staleMinutes: number;
    limit: number;
    concurrency: number;
    queueNames: string[];
  };
  summary: {
    inspectedCount: number;
    keptRunningCount: number;
    keptPendingCount: number;
    markedRunningCount: number;
    movedToPendingCount: number;
    markedSuccessCount: number;
    markedFailedCount: number;
    manualReviewCount: number;
  };
  observedStateBreakdown: Record<string, number>;
  queueBreakdown: QueueBreakdownRow[];
  actionBreakdown: ActionBreakdownRow[];
  samples: ReconcileRowResult[];
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
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    json: false,
    pretty: true,
    noWrite: false,
    outputDir: null,
    staleMinutes: 60,
    limit: 500,
    concurrency: 20,
    queueNames: [QUEUE_NAMES.ANALYSIS_SINGLE, QUEUE_NAMES.ANALYSIS_SNAPSHOT],
  };

  for (const rawArg of argv) {
    const arg = String(rawArg ?? '').trim();

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

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
    if (flag === 'stale-minutes') {
      options.staleMinutes = parsePositiveInt(value, options.staleMinutes);
    }
    if (flag === 'limit') {
      options.limit = parsePositiveInt(value, options.limit);
    }
    if (flag === 'concurrency') {
      options.concurrency = parsePositiveInt(value, options.concurrency);
    }
    if (flag === 'queues' && value) {
      const queueNames = value
        .split(',')
        .map((item) => item.trim())
        .filter(
          (item): item is AllowedQueueName =>
            item === QUEUE_NAMES.ANALYSIS_SINGLE ||
            item === QUEUE_NAMES.ANALYSIS_SNAPSHOT,
        );
      if (queueNames.length) {
        options.queueNames = queueNames;
      }
    }
  }

  return options;
}

function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
) {
  if (!items.length) {
    return Promise.resolve();
  }

  let index = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await handler(items[currentIndex]);
    }
  });

  return Promise.all(workers).then(() => undefined);
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

function calculateAgeMinutes(row: StaleJobLogRow, now: Date) {
  const baseline =
    row.jobStatus === JobStatus.PENDING ? row.createdAt : row.startedAt ?? row.createdAt;

  if (!baseline) {
    return 0;
  }

  return Math.max(
    0,
    Number(((now.getTime() - baseline.getTime()) / 60_000).toFixed(2)),
  );
}

function calculateDurationMs(startedAt: Date | null, finishedAt: Date) {
  if (!startedAt) {
    return null;
  }

  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function buildQueueBreakdown(results: ReconcileRowResult[]): QueueBreakdownRow[] {
  const map = new Map<string, QueueBreakdownRow>();

  for (const row of results) {
    const existing = map.get(row.queueName) ?? {
      queueName: row.queueName,
      inspectedCount: 0,
      keptRunningCount: 0,
      keptPendingCount: 0,
      markedRunningCount: 0,
      movedToPendingCount: 0,
      markedSuccessCount: 0,
      markedFailedCount: 0,
      manualReviewCount: 0,
    };
    existing.inspectedCount += 1;
    if (row.disposition === 'keep_running') {
      existing.keptRunningCount += 1;
    }
    if (row.disposition === 'keep_pending') {
      existing.keptPendingCount += 1;
    }
    if (row.disposition === 'mark_running') {
      existing.markedRunningCount += 1;
    }
    if (row.disposition === 'mark_pending') {
      existing.movedToPendingCount += 1;
    }
    if (row.disposition === 'mark_success') {
      existing.markedSuccessCount += 1;
    }
    if (row.disposition === 'mark_failed') {
      existing.markedFailedCount += 1;
    }
    if (row.disposition === 'manual_review') {
      existing.manualReviewCount += 1;
    }
    map.set(row.queueName, existing);
  }

  return Array.from(map.values()).sort((left, right) =>
    left.queueName.localeCompare(right.queueName),
  );
}

function buildActionBreakdown(results: ReconcileRowResult[]): ActionBreakdownRow[] {
  const map = new Map<string, ActionBreakdownRow>();

  for (const row of results) {
    const action = row.historicalRepairAction ?? 'unclassified';
    const existing = map.get(action) ?? {
      action,
      inspectedCount: 0,
      markedRunningCount: 0,
      movedToPendingCount: 0,
      markedSuccessCount: 0,
      markedFailedCount: 0,
    };

    existing.inspectedCount += 1;
    if (row.disposition === 'mark_running') {
      existing.markedRunningCount += 1;
    }
    if (row.disposition === 'mark_pending') {
      existing.movedToPendingCount += 1;
    }
    if (row.disposition === 'mark_success') {
      existing.markedSuccessCount += 1;
    }
    if (row.disposition === 'mark_failed') {
      existing.markedFailedCount += 1;
    }

    map.set(action, existing);
  }

  return Array.from(map.values()).sort((left, right) => {
    if (right.inspectedCount !== left.inspectedCount) {
      return right.inspectedCount - left.inspectedCount;
    }
    return left.action.localeCompare(right.action);
  });
}

function renderMarkdown(report: StaleAnalysisJobLogReconcileReport) {
  const lines = [
    '# Stale Analysis JobLog Reconcile',
    '',
    `- Generated At: ${report.generatedAt}`,
    `- Apply: ${report.scope.apply ? 'yes' : 'no'}`,
    `- Stale Minutes: ${report.scope.staleMinutes}`,
    `- Inspected: ${report.summary.inspectedCount}`,
    `- Kept running: ${report.summary.keptRunningCount}`,
    `- Kept pending: ${report.summary.keptPendingCount}`,
    `- Marked running: ${report.summary.markedRunningCount}`,
    `- Moved to pending: ${report.summary.movedToPendingCount}`,
    `- Marked success: ${report.summary.markedSuccessCount}`,
    `- Marked failed: ${report.summary.markedFailedCount}`,
    `- Manual review: ${report.summary.manualReviewCount}`,
    '',
    '## Queue Breakdown',
  ];

  for (const row of report.queueBreakdown) {
    lines.push(
      `- ${row.queueName}: inspected=${row.inspectedCount}, keep_running=${row.keptRunningCount}, keep_pending=${row.keptPendingCount}, running=${row.markedRunningCount}, pending=${row.movedToPendingCount}, success=${row.markedSuccessCount}, failed=${row.markedFailedCount}, manual_review=${row.manualReviewCount}`,
    );
  }

  if (report.actionBreakdown.length) {
    lines.push('', '## Action Breakdown');
    for (const row of report.actionBreakdown.slice(0, 10)) {
      lines.push(
        `- ${row.action}: inspected=${row.inspectedCount}, running=${row.markedRunningCount}, pending=${row.movedToPendingCount}, success=${row.markedSuccessCount}, failed=${row.markedFailedCount}`,
      );
    }
  }

  if (report.samples.length) {
    lines.push('', '## Samples');
    for (const row of report.samples) {
      lines.push(
        `- ${row.queueName} ${row.jobName} repo=${row.repositoryId ?? '<null>'} action=${row.historicalRepairAction ?? 'unclassified'} state=${row.observedState} disposition=${row.disposition} ageMinutes=${row.ageMinutes}`,
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

async function inspectQueueState(args: {
  row: StaleJobLogRow;
  queueCache: Map<QueueName, Queue>;
}): Promise<QueueInspection> {
  const queueName = args.row.queueName as QueueName | null;
  if (!queueName || !args.row.queueJobId) {
    return {
      observedState: 'missing',
      job: null,
    };
  }

  let queue = args.queueCache.get(queueName);
  if (!queue) {
    queue = new Queue(queueName, {
      connection: getQueueConnection(),
    });
    args.queueCache.set(queueName, queue);
  }

  const job = await queue.getJob(args.row.queueJobId);
  if (!job) {
    return {
      observedState: 'missing',
      job: null,
    };
  }

  return {
    observedState: normalizeQueueObservedState(await job.getState()),
    job,
  };
}

async function applyReconciliation(args: {
  prisma: PrismaService;
  row: StaleJobLogRow;
  observedState: NormalizedQueueObservedState;
  disposition: StaleJobLogDisposition;
  reason: string;
  queueJob: Job | null;
}) {
  if (
    args.disposition === 'keep_running' ||
    args.disposition === 'keep_pending' ||
    args.disposition === 'manual_review'
  ) {
    return;
  }

  if (args.disposition === 'mark_running') {
    const startedAt =
      typeof args.queueJob?.processedOn === 'number'
        ? new Date(args.queueJob.processedOn)
        : args.row.startedAt ?? new Date();

    await args.prisma.jobLog.update({
      where: { id: args.row.id },
      data: {
        jobStatus: JobStatus.RUNNING,
        startedAt,
        finishedAt: null,
        durationMs: null,
        progress: 0,
        errorMessage: `Stale ${args.row.jobStatus} JobLog reconciled to RUNNING (${args.reason}).`,
      },
    });
    return;
  }

  if (args.disposition === 'mark_pending') {
    await args.prisma.jobLog.update({
      where: { id: args.row.id },
      data: {
        jobStatus: JobStatus.PENDING,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        progress: 0,
        errorMessage: `Stale ${args.row.jobStatus} JobLog reconciled to PENDING (${args.reason}).`,
      },
    });
    return;
  }

  const finishedAt =
    typeof args.queueJob?.finishedOn === 'number'
      ? new Date(args.queueJob.finishedOn)
      : new Date();
  const durationMs = calculateDurationMs(args.row.startedAt, finishedAt);

  if (args.disposition === 'mark_success') {
    await args.prisma.jobLog.update({
      where: { id: args.row.id },
      data: {
        jobStatus: JobStatus.SUCCESS,
        finishedAt,
        durationMs,
        progress: 100,
        errorMessage: null,
        result: {
          staleReconciled: true,
          reconcileReason: args.reason,
          queueState: args.observedState,
          queueReturnValue:
            typeof args.queueJob?.returnvalue === 'undefined'
              ? null
              : args.queueJob.returnvalue,
        },
      },
    });
    return;
  }

  await args.prisma.jobLog.update({
    where: { id: args.row.id },
      data: {
        jobStatus: JobStatus.FAILED,
        finishedAt,
        durationMs,
        progress: 0,
        errorMessage:
          args.queueJob?.failedReason ??
          `Stale ${args.row.jobStatus} JobLog reconciled to FAILED (${args.reason}).`,
        result: {
          staleReconciled: true,
          reconcileReason: args.reason,
        queueState: args.observedState,
        queueJobMissing: args.observedState === 'missing',
      },
    },
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const queueCache = new Map<QueueName, Queue>();

  try {
    const prisma = app.get(PrismaService);
    const generatedAt = new Date().toISOString();
    const now = new Date(generatedAt);
    const cutoff = new Date(now.getTime() - options.staleMinutes * 60_000);
    const rows = (await prisma.jobLog.findMany({
      where: {
        jobStatus: {
          in: [JobStatus.RUNNING, JobStatus.PENDING],
        },
        queueName: {
          in: options.queueNames,
        },
        OR: [
          {
            jobStatus: JobStatus.RUNNING,
            OR: [
              {
                startedAt: {
                  lt: cutoff,
                },
              },
              {
                startedAt: null,
              },
            ],
          },
          {
            jobStatus: JobStatus.PENDING,
            createdAt: {
              lt: cutoff,
            },
          },
        ],
      },
      select: {
        id: true,
        jobName: true,
        queueName: true,
        queueJobId: true,
        jobStatus: true,
        triggeredBy: true,
        payload: true,
        startedAt: true,
        createdAt: true,
      },
      orderBy: [
        {
          startedAt: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
      take: options.limit,
    })) as StaleJobLogRow[];

    const results: ReconcileRowResult[] = [];
    const observedStateBreakdown: Record<string, number> = {};

    await runWithConcurrency(rows, options.concurrency, async (row) => {
      const inspection = await inspectQueueState({
        row,
        queueCache,
      });
      const decision = decideStaleJobLogReconciliation(
        row.jobStatus,
        inspection.observedState,
      );
      observedStateBreakdown[inspection.observedState] =
        (observedStateBreakdown[inspection.observedState] ?? 0) + 1;

      if (options.apply) {
        await applyReconciliation({
          prisma,
          row,
          observedState: inspection.observedState,
          disposition: decision.disposition,
          reason: decision.reason,
          queueJob: inspection.job,
        });
      }

      results.push({
        jobLogId: row.id,
        jobStatus: row.jobStatus,
        queueName: row.queueName ?? '<null>',
        queueJobId: row.queueJobId,
        jobName: row.jobName,
        repositoryId: readRepositoryIdFromPayload(row.payload),
        historicalRepairAction: readHistoricalRepairActionFromPayload(row.payload),
        triggeredBy: row.triggeredBy,
        startedAt: toIsoString(row.startedAt),
        ageMinutes: calculateAgeMinutes(row, now),
        observedState: inspection.observedState,
        disposition: decision.disposition,
        reason: decision.reason,
        applied: options.apply && decision.disposition !== 'manual_review',
      });
    });

    const queueBreakdown = buildQueueBreakdown(results);
    const actionBreakdown = buildActionBreakdown(results);
    const report: StaleAnalysisJobLogReconcileReport = {
      generatedAt,
      scope: {
        apply: options.apply,
        staleMinutes: options.staleMinutes,
        limit: options.limit,
        concurrency: options.concurrency,
        queueNames: options.queueNames,
      },
      summary: {
        inspectedCount: results.length,
        keptRunningCount: results.filter(
          (item) => item.disposition === 'keep_running',
        ).length,
        keptPendingCount: results.filter(
          (item) => item.disposition === 'keep_pending',
        ).length,
        markedRunningCount: results.filter(
          (item) => item.disposition === 'mark_running',
        ).length,
        movedToPendingCount: results.filter(
          (item) => item.disposition === 'mark_pending',
        ).length,
        markedSuccessCount: results.filter(
          (item) => item.disposition === 'mark_success',
        ).length,
        markedFailedCount: results.filter(
          (item) => item.disposition === 'mark_failed',
        ).length,
        manualReviewCount: results.filter(
          (item) => item.disposition === 'manual_review',
        ).length,
      },
      observedStateBreakdown,
      queueBreakdown,
      actionBreakdown,
      samples: results
        .filter((item) => item.disposition !== 'keep_running')
        .sort((left, right) => right.ageMinutes - left.ageMinutes)
        .slice(0, 20),
      nextActions: [
        results.some((item) => item.disposition === 'manual_review')
          ? '存在 queue state 无法自动归类的陈旧 JobLog，先人工核对这些 manual_review 样本。'
          : '陈旧 PENDING / RUNNING JobLog 已全部可自动归类，可继续按当前脚本周期性对账。',
        results.some((item) => item.disposition === 'mark_failed')
          ? 'queue job missing/failed 的陈旧记录已经能自动转成 FAILED，这些 repo 后续会重新暴露到 backlog / incomplete 面板里。'
          : '本轮没有 queue missing/failed 的陈旧记录，不需要额外回补失败链路。',
      ],
    };

    const markdown = renderMarkdown(report);
    const stamp = report.generatedAt.slice(0, 19).replaceAll(':', '').replaceAll('-', '');
    const outputDir =
      options.outputDir ?? path.join(process.cwd(), 'reports', 'queue-health');
    const markdownPath = path.join(
      outputDir,
      `stale-analysis-job-log-reconcile-${stamp}.md`,
    );
    const jsonPath = path.join(
      outputDir,
      `stale-analysis-job-log-reconcile-${stamp}.json`,
    );

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
          summary: report.summary,
          queueBreakdown: report.queueBreakdown,
          actionBreakdown: report.actionBreakdown.slice(0, 10),
        };

    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await Promise.all(
      Array.from(queueCache.values()).map(async (queue) => {
        await queue.close();
      }),
    );
    await app.close();
  }
}

void main();
