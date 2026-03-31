import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  HistoricalDataRecoveryService,
  HistoricalRecoveryPriority,
} from '../modules/analysis/historical-data-recovery.service';

type CliOptions = {
  dryRun?: boolean;
  limit?: number;
  priority?: HistoricalRecoveryPriority | null;
  buckets?: Array<'visible_broken' | 'high_value_weak' | 'stale_watch'>;
  minPriorityScore?: number;
  repositoryIds?: string[];
  repositoryIdsFile?: string;
  selectedRepositoryIdsFile?: string;
  onlyConflicts?: boolean;
  onlyFeatured?: boolean;
  onlyFallback?: boolean;
  onlyIncomplete?: boolean;
  onlyHomepage?: boolean;
  exportTrainingSamples?: boolean;
  outputDir?: string;
  mode?:
    | 'scan_old_bad_records'
    | 'run_recovery'
    | 'repair_display_only'
    | 'rerun_light_analysis'
    | 'rerun_full_deep'
    | 'queue_claude_review'
    | 'historical_repair_loop'
    | 'export_training_samples';
};

const HISTORICAL_REPAIR_BUCKETS = [
  'visible_broken',
  'high_value_weak',
  'stale_watch',
] as const;

function parseCommaSeparatedList(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: true,
    mode: 'run_recovery',
  };

  for (const rawArg of argv) {
    const arg = String(rawArg ?? '').trim();
    if (!arg.startsWith('--')) {
      continue;
    }

    const [flag, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=').trim();

    if (flag === 'dryRun') {
      options.dryRun = parseBoolean(value) ?? true;
    }
    if (flag === 'limit') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
    if (flag === 'priority') {
      const normalized = value.trim().toUpperCase();
      if (normalized === 'P0' || normalized === 'P1' || normalized === 'P2') {
        options.priority = normalized as HistoricalRecoveryPriority;
      }
    }
    if (flag === 'buckets' || flag === 'bucket') {
      const parsed = parseCommaSeparatedList(value).filter((item): item is
        (typeof HISTORICAL_REPAIR_BUCKETS)[number] =>
        HISTORICAL_REPAIR_BUCKETS.includes(
          item as (typeof HISTORICAL_REPAIR_BUCKETS)[number],
        ),
      );
      if (parsed.length) {
        options.buckets = parsed;
      }
    }
    if (flag === 'minPriorityScore') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.minPriorityScore = parsed;
      }
    }
    if (flag === 'repositoryIds' || flag === 'repositoryId') {
      const parsed = parseCommaSeparatedList(value);
      if (parsed.length) {
        options.repositoryIds = parsed;
      }
    }
    if (flag === 'repositoryIdsFile' && value) {
      options.repositoryIdsFile = value;
    }
    if (flag === 'selectedRepositoryIdsFile' && value) {
      options.selectedRepositoryIdsFile = value;
    }
    if (flag === 'onlyConflicts') {
      options.onlyConflicts = parseBoolean(value);
    }
    if (flag === 'onlyFeatured') {
      options.onlyFeatured = parseBoolean(value);
    }
    if (flag === 'onlyHomepage') {
      options.onlyHomepage = parseBoolean(value);
      options.onlyFeatured = options.onlyHomepage;
    }
    if (flag === 'onlyFallback') {
      options.onlyFallback = parseBoolean(value);
    }
    if (flag === 'onlyIncomplete') {
      options.onlyIncomplete = parseBoolean(value);
    }
    if (flag === 'exportTrainingSamples') {
      options.exportTrainingSamples = parseBoolean(value);
    }
    if (flag === 'outputDir' && value) {
      options.outputDir = value;
    }
    if (flag === 'mode' && value) {
      const normalized = value.trim().toLowerCase();
      if (
        normalized === 'scan_old_bad_records' ||
        normalized === 'run_recovery' ||
        normalized === 'repair_display_only' ||
        normalized === 'rerun_light_analysis' ||
        normalized === 'rerun_full_deep' ||
        normalized === 'queue_claude_review' ||
        normalized === 'historical_repair_loop' ||
        normalized === 'export_training_samples'
      ) {
        options.mode = normalized as CliOptions['mode'];
      }
    }
  }

  return options;
}

export function parseHistoricalDataRecoveryArgs(argv: string[]) {
  return parseArgs(argv);
}

async function resolveRepositoryIdsFromFile(filePath: string | undefined) {
  if (!filePath) {
    return [];
  }

  const content = await readFile(path.resolve(filePath), 'utf8');
  return content
    .split(/[\n,\r]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
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
  const repositoryIdsFromFile = await resolveRepositoryIdsFromFile(
    options.repositoryIdsFile,
  );
  if (repositoryIdsFromFile.length) {
    options.repositoryIds = [
      ...(options.repositoryIds ?? []),
      ...repositoryIdsFromFile,
    ];
  }
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const recoveryService = app.get(HistoricalDataRecoveryService);

    if (options.mode === 'scan_old_bad_records') {
      const result = await recoveryService.scanOldBadRecords(options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if (options.mode === 'export_training_samples') {
      const audit = await recoveryService.scanOldBadRecords(options);
      const exportResult = await recoveryService.exportTrainingSamples({
        sampleSize: Math.max(40, Math.min(audit.scannedCount, 240)),
        outputDir: options.outputDir,
        includeFullNames: audit.items.map((item) => item.fullName),
      });
      process.stdout.write(`${JSON.stringify(exportResult, null, 2)}\n`);
      return;
    }

    if (options.mode === 'historical_repair_loop') {
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
          2,
        )}\n`,
      );
      return;
    }

    const result = await recoveryService.runRecovery({
      dryRun: options.dryRun,
      limit: options.limit,
      priority: options.priority,
      onlyConflicts: options.onlyConflicts,
      onlyFeatured: options.onlyFeatured,
      onlyFallback: options.onlyFallback,
      onlyIncomplete: options.onlyIncomplete,
      exportTrainingSamples: options.exportTrainingSamples,
      outputDir: options.outputDir,
      mode:
        options.mode === 'run_recovery' ||
        options.mode === 'repair_display_only' ||
        options.mode === 'rerun_light_analysis' ||
        options.mode === 'rerun_full_deep' ||
        options.mode === 'queue_claude_review'
          ? options.mode
          : 'run_recovery',
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void bootstrap();
}
