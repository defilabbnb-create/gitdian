import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { CalibrationSeedBatchService } from '../../modules/analysis/calibration-seed-batch.service';
import { renderCalibrationSeedBatchMarkdown } from '../../modules/analysis/helpers/calibration-seed-batch.helper';

type CliOptions = {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  perGroup?: number;
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
    perGroup: 20,
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
    if (flag === 'per-group') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.perGroup = parsed;
      }
    }
    if (flag === 'concurrency') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.concurrency = parsed;
      }
    }
    if (flag === 'idea-extract-timeout-ms') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.ideaExtractTimeoutMs = parsed;
      }
    }
  }

  return options;
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
    const report = await calibrationSeedBatchService.runSeedBatch({
      perGroup: options.perGroup,
      concurrency: options.concurrency,
    });
    const markdown = renderCalibrationSeedBatchMarkdown(report);
    const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'calibration-seed-batch');
    const markdownPath = path.join(
      outputDir,
      `calibration-seed-batch-${stamp}.md`,
    );
    const jsonPath = path.join(
      outputDir,
      `calibration-seed-batch-${stamp}.json`,
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
          tierCalibration: report.tierCalibration,
          qualityCalibration: report.qualityCalibration,
        };

    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

if (process.argv[1]?.endsWith('calibration-seed-batch-report.js')) {
  void main();
}
