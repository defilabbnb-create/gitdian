import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildModelTaskRouterExecutionReport,
  renderModelTaskRouterExecutionMarkdown,
} from '../../modules/analysis/helpers/model-task-router-execution.helper';
import { HistoricalDataRecoveryService } from '../../modules/analysis/historical-data-recovery.service';
import {
  HistoricalRepairPriorityOptions,
  HistoricalRepairPriorityService,
} from '../../modules/analysis/historical-repair-priority.service';

const HEALTH_LATEST_CONFIG_KEY = 'health.daily.latest';
const RECOVERY_RUN_CONFIG_KEY = 'analysis.historical_recovery.run.latest';

type CliOptions = HistoricalRepairPriorityOptions & {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
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
    if (flag === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
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
    const prisma = app.get(PrismaService);
    const priorityService = app.get(HistoricalRepairPriorityService);
    const recoveryService = app.get(HistoricalDataRecoveryService);
    const [priorityReport, queueSummary, healthRow, latestRunRow] = await Promise.all([
      priorityService.runPriorityReport(options),
      recoveryService.getHistoricalRepairQueueSummary(),
      prisma.systemConfig.findUnique({
        where: { configKey: HEALTH_LATEST_CONFIG_KEY },
      }),
      prisma.systemConfig.findUnique({
        where: { configKey: RECOVERY_RUN_CONFIG_KEY },
      }),
    ]);

    const report = buildModelTaskRouterExecutionReport({
      priorityReport,
      queueSummary,
      healthReport:
        healthRow?.configValue && typeof healthRow.configValue === 'object'
          ? (healthRow.configValue as Record<string, unknown>)
          : null,
      latestRun:
        latestRunRow?.configValue && typeof latestRunRow.configValue === 'object'
          ? (latestRunRow.configValue as Record<string, unknown>)
          : null,
    });
    const markdown = renderModelTaskRouterExecutionMarkdown(report);
    const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'model-task-router');
    const markdownPath = path.join(
      outputDir,
      `model-task-router-execution-${stamp}.md`,
    );
    const jsonPath = path.join(
      outputDir,
      `model-task-router-execution-${stamp}.json`,
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
        };

    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

void main();
