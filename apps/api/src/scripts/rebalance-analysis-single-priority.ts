import { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import {
  normalizeHistoricalRepairRouterPriorityClass,
  toHistoricalSingleAnalysisQueuePriority,
} from '../modules/analysis/helpers/historical-repair-queue-priority.helper';
import { QUEUE_NAMES } from '../modules/queue/queue.constants';
import { getQueueConnection } from '../modules/queue/queue.redis';

type CliOptions = {
  apply: boolean;
  batchSize: number;
  concurrency: number;
  limit: number | null;
};

type PendingJobRow = {
  id: string;
  queueJobId: string | null;
  payload: unknown;
};

type RepairPriorityPayload = {
  historicalRepairAction: string | null;
  historicalRepairPriorityScore: number | null;
  routerPriorityClass: 'P0' | 'P1' | 'P2' | 'P3';
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    batchSize: 500,
    concurrency: 25,
    limit: null,
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

    const [flag, rawValue = ''] = arg.slice(2).split('=');
    const value = rawValue.trim();
    const parsed = Number.parseInt(value, 10);

    if (flag === 'batch-size' && Number.isFinite(parsed) && parsed > 0) {
      options.batchSize = parsed;
    }
    if (flag === 'concurrency' && Number.isFinite(parsed) && parsed > 0) {
      options.concurrency = parsed;
    }
    if (flag === 'limit' && Number.isFinite(parsed) && parsed > 0) {
      options.limit = parsed;
    }
  }

  return options;
}

function readObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
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

  return null;
}

function readRepairPriorityPayload(payload: unknown): RepairPriorityPayload {
  const root = readObject(payload);
  const metadata = readObject(root?.routerMetadata);

  return {
    historicalRepairAction:
      readString(root?.historicalRepairAction) ??
      readString(metadata?.historicalRepairAction) ??
      null,
    historicalRepairPriorityScore:
      readNumber(root?.historicalRepairPriorityScore) ??
      readNumber(metadata?.historicalRepairPriorityScore) ??
      null,
    routerPriorityClass: normalizeHistoricalRepairRouterPriorityClass(
      readString(root?.routerPriorityClass) ??
        readString(metadata?.routerPriorityClass),
    ),
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
) {
  if (!items.length) {
    return;
  }

  let index = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (index < items.length) {
        const currentIndex = index;
        index += 1;
        await handler(items[currentIndex]);
      }
    },
  );

  await Promise.all(workers);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const queue = new Queue(QUEUE_NAMES.ANALYSIS_SINGLE, {
    connection: getQueueConnection(),
  });
  let cursor: string | null = null;
  let processed = 0;
  let matched = 0;
  let changed = 0;
  let missingQueueJob = 0;
  let failed = 0;
  const actionCounts: Record<string, number> = {};
  const changedActionCounts: Record<string, number> = {};

  try {
    while (true) {
      if (options.limit && processed >= options.limit) {
        break;
      }

      const pageSize = options.limit
        ? Math.min(options.batchSize, options.limit - processed)
        : options.batchSize;
      const rows: PendingJobRow[] = await prisma.jobLog.findMany({
        where: {
          queueName: QUEUE_NAMES.ANALYSIS_SINGLE,
          jobStatus: 'PENDING',
          triggeredBy: 'historical_repair',
          queueJobId: {
            not: null,
          },
        },
        select: {
          id: true,
          queueJobId: true,
          payload: true,
        },
        orderBy: {
          id: 'asc',
        },
        take: pageSize,
        ...(cursor
          ? {
              skip: 1,
              cursor: {
                id: cursor,
              },
            }
          : {}),
      });

      if (!rows.length) {
        break;
      }

      cursor = rows[rows.length - 1].id;
      processed += rows.length;

      await runWithConcurrency(rows, options.concurrency, async (row) => {
        const payload = readRepairPriorityPayload(row.payload);
        if (
          payload.historicalRepairAction !== 'deep_repair' &&
          payload.historicalRepairAction !== 'decision_recalc'
        ) {
          return;
        }

        matched += 1;
        actionCounts[payload.historicalRepairAction] =
          (actionCounts[payload.historicalRepairAction] ?? 0) + 1;

        const job = (await queue.getJob(row.queueJobId ?? '')) as
          | Job
          | undefined
          | null;
        if (!job) {
          missingQueueJob += 1;
          return;
        }

        const nextPriority = toHistoricalSingleAnalysisQueuePriority({
          historicalRepairAction: payload.historicalRepairAction,
          priorityScore: payload.historicalRepairPriorityScore,
          routerPriorityClass: payload.routerPriorityClass,
        });
        if (job.priority === nextPriority) {
          return;
        }

        if (!options.apply) {
          changed += 1;
          changedActionCounts[payload.historicalRepairAction] =
            (changedActionCounts[payload.historicalRepairAction] ?? 0) + 1;
          return;
        }

        try {
          await job.changePriority({
            priority: nextPriority,
          });
          changed += 1;
          changedActionCounts[payload.historicalRepairAction] =
            (changedActionCounts[payload.historicalRepairAction] ?? 0) + 1;
        } catch {
          failed += 1;
        }
      });
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          mode: options.apply ? 'apply' : 'dry_run',
          processed,
          matched,
          changed,
          missingQueueJob,
          failed,
          actionCounts,
          changedActionCounts,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await queue.close();
    await prisma.$disconnect();
  }
}

void main();
