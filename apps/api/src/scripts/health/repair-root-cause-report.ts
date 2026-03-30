import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildRepairEffectivenessRootCauseReport,
  renderRepairEffectivenessRootCauseMarkdown,
} from '../../modules/analysis/helpers/repair-effectiveness-root-cause.helper';
import type { RepairRootCauseSeedSource } from '../../modules/analysis/helpers/repair-effectiveness-root-cause.types';

const SEED_REPORT_CONFIG_KEY = 'analysis.calibration_seed_batch.latest';

type CliOptions = {
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
  }

  return options;
}

function readSeedReport(value: unknown): RepairRootCauseSeedSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as RepairRootCauseSeedSource;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const seedRow = await prisma.systemConfig.findUnique({
      where: { configKey: SEED_REPORT_CONFIG_KEY },
    });
    const report = buildRepairEffectivenessRootCauseReport({
      seedReport: readSeedReport(seedRow?.configValue),
    });
    const markdown = renderRepairEffectivenessRootCauseMarkdown(report);
    const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'repair-root-cause');
    const markdownPath = path.join(outputDir, `repair-root-cause-${stamp}.md`);
    const jsonPath = path.join(outputDir, `repair-root-cause-${stamp}.json`);

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
          overallRootCauseSummary: report.overallRootCauseSummary,
          actionRootCauseSummary: report.actionRootCauseSummary,
          tierRootCauseSummary: report.tierRootCauseSummary,
          surgeryRecommendations: report.surgeryRecommendations,
        };

    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

if (process.argv[1]?.endsWith('repair-root-cause-report.js')) {
  void main();
}
