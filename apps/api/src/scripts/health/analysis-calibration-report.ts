import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildAnalysisOutcomeSnapshot } from '../../modules/analysis/helpers/analysis-outcome.helper';
import type { AnalysisOutcomeSnapshot } from '../../modules/analysis/helpers/analysis-outcome.types';
import {
  buildAnalysisCalibrationReport,
  renderAnalysisCalibrationMarkdown,
} from '../../modules/analysis/helpers/analysis-calibration-report.helper';
import { HistoricalDataRecoveryService } from '../../modules/analysis/historical-data-recovery.service';

const OUTCOME_CONFIG_KEY = 'analysis.outcome.latest';
const RUN_CONFIG_KEY = 'analysis.historical_recovery.run.latest';

type CliOptions = {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  refresh?: boolean;
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
    refresh: false,
    limit: 120,
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
    if (flag === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
  }

  return options;
}

export function readOutcomeSnapshot(value: unknown): AnalysisOutcomeSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Partial<AnalysisOutcomeSnapshot>;
  if (!Array.isArray(payload.items) || !payload.summary) {
    return null;
  }

  return payload as AnalysisOutcomeSnapshot;
}

function buildEmptySnapshot() {
  return buildAnalysisOutcomeSnapshot({
    source: 'analysis_outcome_empty',
    items: [],
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const recoveryService = app.get(HistoricalDataRecoveryService);

    let seededFromDryRun = false;
    let outcomeRow = await prisma.systemConfig.findUnique({
      where: { configKey: OUTCOME_CONFIG_KEY },
    });

    if (!outcomeRow || options.refresh) {
      await recoveryService.runHistoricalRepairLoop({
        dryRun: true,
        limit: options.limit ?? 120,
      });
      seededFromDryRun = true;
      outcomeRow = await prisma.systemConfig.findUnique({
        where: { configKey: OUTCOME_CONFIG_KEY },
      });
    }

    const latestRunRow = await prisma.systemConfig.findUnique({
      where: { configKey: RUN_CONFIG_KEY },
    });
    const report = buildAnalysisCalibrationReport({
      snapshot: readOutcomeSnapshot(outcomeRow?.configValue) ?? buildEmptySnapshot(),
      latestRun:
        latestRunRow?.configValue && typeof latestRunRow.configValue === 'object'
          ? (latestRunRow.configValue as Record<string, unknown>)
          : null,
      seededFromDryRun,
    });
    const markdown = renderAnalysisCalibrationMarkdown(report);
    const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'analysis-calibration');
    const markdownPath = path.join(outputDir, `analysis-calibration-${stamp}.md`);
    const jsonPath = path.join(outputDir, `analysis-calibration-${stamp}.json`);

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
          source: report.source,
          repairEffectivenessSummary: report.repairEffectivenessSummary,
          routerCalibrationSummary: report.routerCalibrationSummary,
          qualityCalibrationSummary: report.qualityCalibrationSummary,
          gapEffectivenessSummary: report.gapEffectivenessSummary,
          reviewBurdenSummary: report.reviewBurdenSummary,
        };

    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

if (process.argv[1]?.endsWith('analysis-calibration-report.js')) {
  void main();
}
