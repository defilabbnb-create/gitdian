import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FrozenAnalysisPoolService } from '../modules/analysis/frozen-analysis-pool.service';
import { renderFrozenAnalysisPoolDrainFinishMarkdown } from '../modules/analysis/helpers/frozen-analysis-pool.helper';

type CliOptions = {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  p0Limit?: number;
  p1Limit?: number;
  p2Limit?: number;
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
    json: false,
    pretty: true,
    noWrite: false,
    outputDir: null,
    p0Limit: 220,
    p1Limit: 180,
    p2Limit: 80,
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
    if (flag === 'p0-limit') {
      options.p0Limit = parsePositiveInt(value, options.p0Limit ?? 220);
    }
    if (flag === 'p1-limit') {
      options.p1Limit = parsePositiveInt(value, options.p1Limit ?? 180);
    }
    if (flag === 'p2-limit') {
      options.p2Limit = parsePositiveInt(value, options.p2Limit ?? 80);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const service = app.get(FrozenAnalysisPoolService);
    const result = await service.runPendingQueueDrainAndRepairFinishPass({
      p0Limit: options.p0Limit,
      p1Limit: options.p1Limit,
      p2Limit: options.p2Limit,
    });
    const markdown = renderFrozenAnalysisPoolDrainFinishMarkdown(result);
    const stamp = result.generatedAt.slice(0, 10).replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'frozen-analysis-pool');
    const markdownPath = path.join(
      outputDir,
      `frozen-analysis-pool-drain-finish-${stamp}.md`,
    );
    const jsonPath = path.join(
      outputDir,
      `frozen-analysis-pool-drain-finish-${stamp}.json`,
    );

    if (!options.noWrite) {
      await mkdir(outputDir, { recursive: true });
      await Promise.all([
        writeFile(markdownPath, `${markdown}\n`, 'utf8'),
        writeFile(
          jsonPath,
          `${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`,
          'utf8',
        ),
      ]);
    }

    const payload = options.json
      ? result
      : {
          generatedAt: result.generatedAt,
          markdownPath: options.noWrite ? null : markdownPath,
          jsonPath: options.noWrite ? null : jsonPath,
          summary: {
            pendingDrainedCount: result.pendingDrainedCount,
            pendingStillRemainingCount: result.pendingStillRemainingCount,
            decisionRecalcCompressedCount: result.decisionRecalcCompressedCount,
            decisionRecalcRemainingAfter: result.decisionRecalcRemainingAfter,
            repairActionRemainingReducedCount:
              result.repairActionRemainingReducedCount,
            completedUsefulAddedCount: result.completedUsefulAddedCount,
            completedArchivedAddedCount: result.completedArchivedAddedCount,
            completedDeletedAddedCount: result.completedDeletedAddedCount,
            frozenPoolRemainingCount: result.frozenPoolRemainingCount,
            hardestAction: result.hardestAction,
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
