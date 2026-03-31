import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  HistoricalDataRecoveryService,
  type HistoricalRepairRunOptions,
} from '../modules/analysis/historical-data-recovery.service';

type HistoricalRepairBucket = NonNullable<HistoricalRepairRunOptions['buckets']>[number];

type CliOptions = HistoricalRepairRunOptions & {
  pretty?: boolean;
  selectedRepositoryIdsFile?: string;
};

const ALLOWED_BUCKETS: HistoricalRepairBucket[] = [
  'visible_broken',
  'high_value_weak',
  'stale_watch',
];

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

function parseList(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBuckets(value: string | undefined): HistoricalRepairBucket[] {
  const parsed = parseList(value).filter((item): item is HistoricalRepairBucket =>
    ALLOWED_BUCKETS.includes(item as HistoricalRepairBucket),
  );

  return Array.from(new Set(parsed));
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: true,
    pretty: true,
  };

  for (const rawArg of argv) {
    const arg = String(rawArg ?? '').trim();
    if (!arg.startsWith('--')) {
      continue;
    }

    const [flag, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=').trim();

    if (flag === 'dryRun') {
      options.dryRun = parseBoolean(value);
    }
    if (flag === 'pretty') {
      options.pretty = parseBoolean(value);
    }
    if (flag === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
    if (flag === 'minPriorityScore') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        options.minPriorityScore = parsed;
      }
    }
    if (flag === 'buckets') {
      const parsed = parseBuckets(value);
      if (parsed.length > 0) {
        options.buckets = parsed;
      }
    }
    if (flag === 'repositoryIds') {
      const parsed = parseList(value);
      if (parsed.length > 0) {
        options.repositoryIds = parsed;
      }
    }
    if (flag === 'selectedRepositoryIdsFile' && value) {
      options.selectedRepositoryIdsFile = value;
    }
  }

  return options;
}

async function maybeWriteSelectedRepositoryIds(
  filePath: string | undefined,
  repositoryIds: string[] | undefined,
) {
  if (!filePath) {
    return null;
  }

  const resolvedPath = path.resolve(filePath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${(repositoryIds ?? []).join('\n')}\n`, 'utf8');
  return resolvedPath;
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const recoveryService = app.get(HistoricalDataRecoveryService);
    const result = await recoveryService.runHistoricalRepairLoop({
      dryRun: options.dryRun,
      limit: options.limit,
      buckets: options.buckets,
      minPriorityScore: options.minPriorityScore,
      repositoryIds: options.repositoryIds,
    });
    const selectedRepositoryIdsFile = await maybeWriteSelectedRepositoryIds(
      options.selectedRepositoryIdsFile,
      result.selectedRepositoryIds,
    );
    process.stdout.write(
      `${JSON.stringify(
        selectedRepositoryIdsFile
          ? { ...result, selectedRepositoryIdsFile }
          : result,
        null,
        options.pretty ? 2 : 0,
      )}\n`,
    );
  } finally {
    await app.close();
  }
}

void bootstrap();
