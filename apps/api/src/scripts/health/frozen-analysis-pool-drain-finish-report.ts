import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { FrozenAnalysisPoolService } from '../../modules/analysis/frozen-analysis-pool.service';
import { renderFrozenAnalysisPoolDrainFinishMarkdown } from '../../modules/analysis/helpers/frozen-analysis-pool.helper';

type CliOptions = {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  refresh?: boolean;
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

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    pretty: true,
    noWrite: false,
    outputDir: null,
    refresh: false,
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
    if (flag === 'refresh') {
      options.refresh = parseBoolean(value, true);
    }
    if (flag === 'output-dir' && value) {
      options.outputDir = value;
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
    const report = await service.buildFrozenAnalysisPoolDrainFinishReport({
      refresh: options.refresh === true,
    });
    const markdown = renderFrozenAnalysisPoolDrainFinishMarkdown(report);
    const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '');
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
          pendingSummary: {
            pendingQueueHighPriorityCount: report.pendingQueueHighPriorityCount,
            pendingQueueSuppressibleCount: report.pendingQueueSuppressibleCount,
            pendingQueueReplayRiskCount: report.pendingQueueReplayRiskCount,
            pendingDrainedCount: report.pendingDrainedCount,
            pendingStillRemainingCount: report.pendingStillRemainingCount,
            pendingWorthRunningCount: report.pendingInventory.worthRunningCount,
            pendingArchivableCount: report.pendingInventory.lowRoiArchivableCount,
          },
          decisionRecalcSummary: {
            decisionRecalcRemainingBefore: report.decisionRecalcRemainingBefore,
            decisionRecalcRemainingAfter: report.decisionRecalcRemainingAfter,
            decisionRecalcCompressedCount: report.decisionRecalcCompressedCount,
            decisionRecalcPromotedArchivedCount:
              report.decisionRecalcPromotedArchivedCount,
            decisionRecalcPromotedDeletedCount:
              report.decisionRecalcPromotedDeletedCount,
            decisionRecalcSuppressedFromRemainingCount:
              report.decisionRecalcSuppressedFromRemainingCount,
          },
          completionSummary: {
            completedUsefulAddedCount: report.completedUsefulAddedCount,
            completedArchivedAddedCount: report.completedArchivedAddedCount,
            completedDeletedAddedCount: report.completedDeletedAddedCount,
            frozenPoolRemainingCount: report.frozenPoolRemainingCount,
          },
          diagnostics: {
            hardestAction: report.hardestAction,
            mostNoChangeAction: report.mostNoChangeAction,
            mostWorthContinuingAction: report.mostWorthContinuingAction,
            mostCompressibleAction: report.mostCompressibleAction,
            topRemainingPrimaryReasons: report.topRemainingPrimaryReasons,
            topRemainingActions: report.topRemainingActions,
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
