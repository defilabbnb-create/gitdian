import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EvidenceMapService } from '../modules/analysis/evidence-map.service';
import { renderEvidenceMapMarkdown } from '../modules/analysis/helpers/evidence-map.helper';

type EvidenceMapCliOptions = {
  repositoryId?: string;
  repositoryIds?: string[];
  limit?: number;
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

function parseArgs(argv: string[]): EvidenceMapCliOptions {
  const options: EvidenceMapCliOptions = {
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

    if (flag === 'repository-id' && value) {
      options.repositoryId = value;
    }
    if (flag === 'repository-ids' && value) {
      options.repositoryIds = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (flag === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
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
  }

  return options;
}

async function writeEvidenceMapReport(args: {
  report: Awaited<ReturnType<EvidenceMapService['runReport']>>;
  writeFiles: boolean;
  outputDir?: string | null;
}) {
  const json = JSON.stringify(args.report, null, 2);
  const markdown = renderEvidenceMapMarkdown(args.report);

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
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const reportsDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.join(process.cwd(), 'reports', 'evidence-map');

  await mkdir(reportsDir, { recursive: true });

  const scopeLabel =
    args.report.scope.mode === 'single'
      ? args.report.scope.repositoryIds[0] ?? 'single'
      : `batch-${args.report.summary.totalRepos}`;
  const safeScope = scopeLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const jsonPath = path.join(
    reportsDir,
    `evidence-map-${safeScope}-${yyyy}${mm}${dd}-${hh}${min}${ss}.json`,
  );
  const markdownPath = path.join(
    reportsDir,
    `evidence-map-${safeScope}-${yyyy}${mm}${dd}-${hh}${min}${ss}.md`,
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
    const evidenceMapService = app.get(EvidenceMapService);
    const report = await evidenceMapService.runReport({
      repositoryId: options.repositoryId,
      repositoryIds: options.repositoryIds,
      limit: options.limit,
    });
    const written = await writeEvidenceMapReport({
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
          schemaVersion: report.schemaVersion,
          mode: report.scope.mode,
          totalRepos: report.summary.totalRepos,
          weakestDimensions: report.summary.weakestDimensions.slice(0, 3),
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
