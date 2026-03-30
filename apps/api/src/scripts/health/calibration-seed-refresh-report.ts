import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { CalibrationSeedBatchService } from '../../modules/analysis/calibration-seed-batch.service';
import { renderCalibrationSeedRefreshMarkdown } from '../../modules/analysis/helpers/calibration-seed-refresh.helper';

type CliOptions = {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  decisionRecalcTarget?: number;
  deepRepairHighValueTarget?: number;
  deepRepairGeneralValueTarget?: number;
  evidenceRepairWeakOnlyTarget?: number;
  evidenceRepairNonWeakOnlyTarget?: number;
  concurrency?: number;
  ideaExtractTimeoutMs?: number;
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
    decisionRecalcTarget: 20,
    deepRepairHighValueTarget: 10,
    deepRepairGeneralValueTarget: 10,
    evidenceRepairWeakOnlyTarget: 10,
    evidenceRepairNonWeakOnlyTarget: 10,
    concurrency: 2,
    ideaExtractTimeoutMs: 45000,
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
    if (flag === 'decision-target') {
      options.decisionRecalcTarget = parsePositiveInt(
        value,
        options.decisionRecalcTarget ?? 20,
      );
    }
    if (flag === 'deep-high-value-target') {
      options.deepRepairHighValueTarget = parsePositiveInt(
        value,
        options.deepRepairHighValueTarget ?? 10,
      );
    }
    if (flag === 'deep-general-value-target') {
      options.deepRepairGeneralValueTarget = parsePositiveInt(
        value,
        options.deepRepairGeneralValueTarget ?? 10,
      );
    }
    if (flag === 'evidence-weak-only-target') {
      options.evidenceRepairWeakOnlyTarget = parsePositiveInt(
        value,
        options.evidenceRepairWeakOnlyTarget ?? 10,
      );
    }
    if (flag === 'evidence-non-weak-only-target') {
      options.evidenceRepairNonWeakOnlyTarget = parsePositiveInt(
        value,
        options.evidenceRepairNonWeakOnlyTarget ?? 10,
      );
    }
    if (flag === 'concurrency') {
      options.concurrency = parsePositiveInt(value, options.concurrency ?? 2);
    }
    if (flag === 'idea-extract-timeout-ms') {
      options.ideaExtractTimeoutMs = parsePositiveInt(
        value,
        options.ideaExtractTimeoutMs ?? 45000,
      );
    }
  }

  return options;
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  process.env.IDEA_EXTRACT_MAX_INFLIGHT = process.env.IDEA_EXTRACT_MAX_INFLIGHT ?? '1';
  process.env.OMLX_TIMEOUT_MS_IDEA_EXTRACT =
    process.env.OMLX_TIMEOUT_MS_IDEA_EXTRACT ??
    String(options.ideaExtractTimeoutMs ?? 45000);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const calibrationSeedBatchService = app.get(CalibrationSeedBatchService);
    const report = await calibrationSeedBatchService.runSeedBatchRefresh({
      decisionRecalcTarget: options.decisionRecalcTarget,
      deepRepairHighValueTarget: options.deepRepairHighValueTarget,
      deepRepairGeneralValueTarget: options.deepRepairGeneralValueTarget,
      evidenceRepairWeakOnlyTarget: options.evidenceRepairWeakOnlyTarget,
      evidenceRepairNonWeakOnlyTarget: options.evidenceRepairNonWeakOnlyTarget,
      concurrency: options.concurrency,
    });
    const markdown = renderCalibrationSeedRefreshMarkdown(report);
    const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'calibration-seed-refresh');
    const markdownPath = path.join(
      outputDir,
      `calibration-seed-refresh-${stamp}.md`,
    );
    const jsonPath = path.join(
      outputDir,
      `calibration-seed-refresh-${stamp}.json`,
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
          selection: report.selection,
          executionSummary: report.executionSummary,
          comparison: report.comparison,
          insights: report.insights,
        };

    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

if (process.argv[1]?.endsWith('calibration-seed-refresh-report.js')) {
  void main();
}
