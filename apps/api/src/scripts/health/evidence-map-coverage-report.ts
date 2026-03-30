import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { EvidenceMapService } from '../../modules/analysis/evidence-map.service';
import {
  buildEvidenceMapCoverageReport,
  collectEvidenceCoverageRepoIds,
  renderEvidenceMapCoverageMarkdown,
} from '../../modules/analysis/helpers/evidence-map-coverage-report.helper';
import { HistoricalRepairPriorityService } from '../../modules/analysis/historical-repair-priority.service';

type CoverageCliOptions = {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  visibleBrokenTopN?: number;
  highValueWeakTopN?: number;
  randomPerBucket?: number;
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

function parseArgs(argv: string[]): CoverageCliOptions {
  const options: CoverageCliOptions = {
    json: false,
    pretty: true,
    noWrite: false,
    outputDir: null,
    visibleBrokenTopN: 15,
    highValueWeakTopN: 15,
    randomPerBucket: 8,
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
    if (flag === 'output-dir' && value) {
      options.outputDir = value;
    }
    if (flag === 'visible-broken-top-n') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.visibleBrokenTopN = parsed;
      }
    }
    if (flag === 'high-value-weak-top-n') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.highValueWeakTopN = parsed;
      }
    }
    if (flag === 'random-per-bucket') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.randomPerBucket = parsed;
      }
    }
  }

  return options;
}

async function writeCoverageReport(args: {
  report: ReturnType<typeof buildEvidenceMapCoverageReport>;
  writeFiles: boolean;
  outputDir?: string | null;
}) {
  const json = JSON.stringify(args.report, null, 2);
  const markdown = renderEvidenceMapCoverageMarkdown(args.report);

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
    : path.join(process.cwd(), 'reports', 'evidence-map');

  await mkdir(reportsDir, { recursive: true });

  const jsonPath = path.join(
    reportsDir,
    `evidence-map-coverage-${yyyy}${mm}${dd}.json`,
  );
  const markdownPath = path.join(
    reportsDir,
    `evidence-map-coverage-${yyyy}${mm}${dd}.md`,
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
    const priorityService = app.get(HistoricalRepairPriorityService);
    const evidenceMapService = app.get(EvidenceMapService);
    const priorityReport = await priorityService.runPriorityReport();

    const sampledRepoIds = collectEvidenceCoverageRepoIds({
      items: priorityReport.items,
      options: {
        visibleBrokenTopN: options.visibleBrokenTopN,
        highValueWeakTopN: options.highValueWeakTopN,
        randomPerBucket: options.randomPerBucket,
      },
    });

    const evidenceMaps = await evidenceMapService.buildBatch({
      repositoryIds: [...new Set(sampledRepoIds)],
    });

    const report = buildEvidenceMapCoverageReport({
      priorityReport,
      evidenceMaps,
      options: {
        visibleBrokenTopN: options.visibleBrokenTopN,
        highValueWeakTopN: options.highValueWeakTopN,
        randomPerBucket: options.randomPerBucket,
      },
    });
    const written = await writeCoverageReport({
      report,
      writeFiles: !options.noWrite,
      outputDir: options.outputDir,
    });

    if (options.json) {
      process.stdout.write(`${written.json}\n`);
      return;
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          generatedAt: report.generatedAt,
          totalSampled: report.samplePlan.totalSampled,
          mostMissing: report.overall.mostMissingDimensions.slice(0, 3),
          mostWeak: report.overall.mostWeakDimensions.slice(0, 3),
          mostConflict: report.overall.mostConflictDimensions.slice(0, 3),
          visibleBrokenMostMissing: report.highlights.visibleBrokenMostMissing,
          highValueWeakMostMissing: report.highlights.highValueWeakMostMissing,
          jsonPath: written.jsonPath,
          markdownPath: written.markdownPath,
        },
        null,
        options.pretty ? 2 : 0,
      )}\n`,
    );
  } finally {
    await app.close();
  }
}

void bootstrap();
