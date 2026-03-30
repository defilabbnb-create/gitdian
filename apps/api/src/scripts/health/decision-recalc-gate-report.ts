import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildDecisionRecalcGateReport,
  buildDecisionRecalcGateSnapshot,
  buildDecisionRecalcGateSnapshotMap,
  readDecisionRecalcGateSnapshot,
  renderDecisionRecalcGateMarkdown,
} from '../../modules/analysis/helpers/decision-recalc-gate.helper';
import { HistoricalRepairPriorityService } from '../../modules/analysis/historical-repair-priority.service';

const DECISION_RECALC_GATE_CONFIG_KEY = 'analysis.decision_recalc_gate.latest';
const OUTCOME_CONFIG_KEY = 'analysis.outcome.latest';
const RUN_CONFIG_KEY = 'analysis.historical_recovery.run.latest';

type CliOptions = {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  limit?: number;
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

function readObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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
    const [previousSnapshotRow, latestRunRow, latestOutcomeRow, priorityReport] =
      await Promise.all([
        prisma.systemConfig.findUnique({
          where: { configKey: DECISION_RECALC_GATE_CONFIG_KEY },
        }),
        prisma.systemConfig.findUnique({
          where: { configKey: RUN_CONFIG_KEY },
        }),
        prisma.systemConfig.findUnique({
          where: { configKey: OUTCOME_CONFIG_KEY },
        }),
        priorityService.runPriorityReport({
          limit: options.limit,
        }),
      ]);

    const previousSnapshot = readDecisionRecalcGateSnapshot(
      previousSnapshotRow?.configValue,
    );
    const currentSnapshot = buildDecisionRecalcGateSnapshot({
      items: priorityReport.items.filter(
        (item) => item.historicalRepairAction === 'decision_recalc',
      ),
      previousSnapshotMap: buildDecisionRecalcGateSnapshotMap(previousSnapshot),
    });

    if (!options.noWrite) {
      await prisma.systemConfig.upsert({
        where: { configKey: DECISION_RECALC_GATE_CONFIG_KEY },
        update: {
          configValue: currentSnapshot as Prisma.InputJsonValue,
        },
        create: {
          configKey: DECISION_RECALC_GATE_CONFIG_KEY,
          configValue: currentSnapshot as Prisma.InputJsonValue,
        },
      });
    }

    const report = buildDecisionRecalcGateReport({
      priorityGeneratedAt: priorityReport.generatedAt,
      currentSnapshot,
      previousSnapshot,
      latestRun: readObject(latestRunRow?.configValue),
      latestOutcomeSnapshot: readObject(latestOutcomeRow?.configValue),
    });
    const markdown = renderDecisionRecalcGateMarkdown(report);
    const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'decision-recalc-gate');
    const markdownPath = path.join(
      outputDir,
      `decision-recalc-gate-${stamp}.md`,
    );
    const jsonPath = path.join(
      outputDir,
      `decision-recalc-gate-${stamp}.json`,
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
          executionImpact: report.executionImpact,
        };

    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

void main();
