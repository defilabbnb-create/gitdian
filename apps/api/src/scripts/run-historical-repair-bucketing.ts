import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { renderHistoricalRepairBucketingMarkdown } from '../modules/analysis/helpers/historical-repair-bucketing.helper';
import {
  HistoricalRepairBucketingOptions,
  HistoricalRepairBucketingService,
} from '../modules/analysis/historical-repair-bucketing.service';

type BucketingCliOptions = HistoricalRepairBucketingOptions & {
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

function parseArgs(argv: string[]): BucketingCliOptions {
  const options: BucketingCliOptions = {
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
    if (flag === 'weak-quality-score') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.weakQualityScore = parsed;
      }
    }
    if (flag === 'archive-freshness-days') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.archiveFreshnessDays = parsed;
      }
    }
    if (flag === 'output-dir' && value) {
      options.outputDir = value;
    }
  }

  return options;
}

async function writeBucketingReport(args: {
  report: Awaited<ReturnType<HistoricalRepairBucketingService['runBucketing']>>;
  writeFiles: boolean;
  outputDir?: string | null;
}) {
  const json = JSON.stringify(args.report, null, 2);
  const markdown = renderHistoricalRepairBucketingMarkdown(args.report);

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
    : path.join(process.cwd(), 'reports', 'historical-repair-bucketing');

  await mkdir(reportsDir, { recursive: true });

  const jsonPath = path.join(
    reportsDir,
    `historical-repair-bucketing-${yyyy}${mm}${dd}.json`,
  );
  const markdownPath = path.join(
    reportsDir,
    `historical-repair-bucketing-${yyyy}${mm}${dd}.md`,
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
    const bucketingService = app.get(HistoricalRepairBucketingService);
    const report = await bucketingService.runBucketing({
      limit: options.limit,
      staleFreshnessDays: options.staleFreshnessDays,
      staleEvidenceDays: options.staleEvidenceDays,
      weakQualityScore: options.weakQualityScore,
      archiveFreshnessDays: options.archiveFreshnessDays,
    });
    const written = await writeBucketingReport({
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
      inventoryGeneratedAt: report.inventoryGeneratedAt,
      visibleBrokenCount: report.summary.keyAnswers.visibleBrokenCount,
      highValueWeakCount: report.summary.keyAnswers.highValueWeakCount,
      staleWatchCount: report.summary.keyAnswers.staleWatchCount,
      archiveOrNoiseCount: report.summary.keyAnswers.archiveOrNoiseCount,
      visibleBrokenFinalDecisionButNoDeepCount:
        report.summary.keyAnswers.visibleBrokenFinalDecisionButNoDeepCount,
      highValueWeakHighMoneyWeakQualityCount:
        report.summary.keyAnswers.highValueWeakHighMoneyWeakQualityCount,
      strictVisibleCount: report.summary.visibilityAudit.counts.strictVisibleCount,
      detailOnlyExposureCount:
        report.summary.visibilityAudit.counts.detailOnlyExposureCount,
      urgentFrontendDowngradeCount:
        report.summary.frontendDowngradeAudit.urgentCount,
      conservativeFrontendDowngradeCount:
        report.summary.frontendDowngradeAudit.conservativeCount,
      jsonPath: written.jsonPath,
      markdownPath: written.markdownPath,
    };

    process.stdout.write(
      `${JSON.stringify(summary, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

void bootstrap();
