import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { renderHistoricalInventoryMarkdown } from '../modules/analysis/helpers/historical-data-inventory.helper';
import {
  HistoricalDataInventoryOptions,
  HistoricalDataInventoryService,
} from '../modules/analysis/historical-data-inventory.service';

type InventoryCliOptions = HistoricalDataInventoryOptions & {
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

function parseArgs(argv: string[]): InventoryCliOptions {
  const options: InventoryCliOptions = {
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
      options.json = parseBoolean(value);
    }
    if (flag === 'pretty') {
      options.pretty = parseBoolean(value);
    }
    if (flag === 'no-write') {
      options.noWrite = parseBoolean(value);
    }
    if (flag === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
    if (flag === 'stale-days') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.staleFreshnessDays = parsed;
      }
    }
    if (flag === 'evidence-stale-days') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.staleEvidenceDays = parsed;
      }
    }
    if (flag === 'output-dir' && value) {
      options.outputDir = value;
    }
  }

  return options;
}

async function writeInventoryReport(args: {
  report: Awaited<ReturnType<HistoricalDataInventoryService['runInventory']>>;
  writeFiles: boolean;
  outputDir?: string | null;
}) {
  const json = JSON.stringify(args.report, null, 2);
  const markdown = renderHistoricalInventoryMarkdown(args.report);

  if (!args.writeFiles) {
    return {
      json,
      markdown,
      jsonPath: null,
      markdownPath: null,
    };
  }

  const now = new Date(args.report.generatedAt);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const reportsDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.join(process.cwd(), 'reports', 'historical-data-inventory');

  await mkdir(reportsDir, { recursive: true });

  const jsonPath = path.join(
    reportsDir,
    `historical-data-inventory-${yyyy}${mm}${dd}.json`,
  );
  const markdownPath = path.join(
    reportsDir,
    `historical-data-inventory-${yyyy}${mm}${dd}.md`,
  );

  await Promise.all([
    writeFile(jsonPath, json, 'utf8'),
    writeFile(markdownPath, markdown, 'utf8'),
  ]);

  return {
    json,
    markdown,
    jsonPath,
    markdownPath,
  };
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const inventoryService = app.get(HistoricalDataInventoryService);
    const report = await inventoryService.runInventory({
      limit: options.limit,
      staleFreshnessDays: options.staleFreshnessDays,
      staleEvidenceDays: options.staleEvidenceDays,
    });
    const written = await writeInventoryReport({
      report,
      writeFiles: !options.noWrite,
      outputDir: options.outputDir,
    });

    if (options.json) {
      process.stdout.write(`${written.json}\n`);
      return;
    }

    const summary = {
      generatedAt: report.generatedAt,
      totalRepos: report.summary.totalRepos,
      finalDecisionButNoDeep: report.summary.completion.finalDecisionButNoDeep,
      fallbackCount: report.summary.quality.fallbackCount,
      conflictCount: report.summary.quality.conflictCount,
      incompleteCount: report.summary.quality.incompleteCount,
      staleAnyCount: report.summary.freshness.staleAnyCount,
      frontendPollutionRiskCount:
        report.summary.exposure.frontendPollutionRiskCount,
      highValueWeakQualityCount:
        report.summary.quality.highValueWeakQualityCount,
      jsonPath: written.jsonPath,
      markdownPath: written.markdownPath,
    };

    process.stdout.write(`${JSON.stringify(summary, null, options.pretty ? 2 : 0)}\n`);
  } finally {
    await app.close();
  }
}

void bootstrap();
