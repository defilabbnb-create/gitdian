import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { JobStatus, Prisma } from '@prisma/client';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../modules/queue/queue.service';
import { QUEUE_NAMES } from '../../modules/queue/queue.constants';
import { AdaptiveSchedulerService } from '../../modules/scheduler/adaptive-scheduler.service';
import { HistoricalDataRecoveryService } from '../../modules/analysis/historical-data-recovery.service';
import {
  collectDailyHealthMetrics,
  DailyHealthSnapshot,
  persistDailyHealthSnapshot,
} from './health-metrics.collector';
import { diffDailyHealth } from './health-diff';
import { evaluateDailyHealth } from './health-evaluator';
import { generateLiveMd } from './generate-live-md';
import { DailyHealthReport, writeDailyHealthReport } from './health-reporter';

type HealthCliOptions = {
  json: boolean;
  pretty: boolean;
  compare: boolean;
  limit: number;
  homepageOnly: boolean;
  queueOnly: boolean;
  onelineOnly: boolean;
  sinceDays: number;
  noWrite: boolean;
  autoRepair: boolean;
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

function parseArgs(argv: string[]): HealthCliOptions {
  const options: HealthCliOptions = {
    json: false,
    pretty: true,
    compare: true,
    limit: 200,
    homepageOnly: false,
    queueOnly: false,
    onelineOnly: false,
    sinceDays: 1,
    noWrite: false,
    autoRepair: false,
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
    if (flag === 'compare') {
      options.compare = parseBoolean(value);
    }
    if (flag === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
    if (flag === 'homepage-only') {
      options.homepageOnly = parseBoolean(value);
    }
    if (flag === 'queue-only') {
      options.queueOnly = parseBoolean(value);
    }
    if (flag === 'oneline-only') {
      options.onelineOnly = parseBoolean(value);
    }
    if (flag === 'since-days') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.sinceDays = parsed;
      }
    }
    if (flag === 'no-write') {
      options.noWrite = parseBoolean(value);
    }
    if (flag === 'auto-repair') {
      options.autoRepair = parseBoolean(value);
    }
  }

  return options;
}

async function loadPreviousHealthReport() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yyyy = yesterday.getFullYear();
  const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
  const dd = String(yesterday.getDate()).padStart(2, '0');
  const filePath = path.join(
    process.cwd(),
    'reports',
    'health',
    `daily-health-${yyyy}${mm}${dd}.json`,
  );

  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as DailyHealthReport;
  } catch {
    return null;
  }
}

function toSnapshot(report: DailyHealthReport): DailyHealthSnapshot {
  return {
    generatedAt: report.generatedAt,
    summary: report.summary,
    globalSnapshot: report.globalSnapshot,
    recentSnapshot: report.recentSnapshot,
    rawReport: {} as never,
    recentRawReport: {} as never,
  };
}

async function persistHealthReport(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  report: DailyHealthReport,
) {
  await app.get(PrismaService).systemConfig.upsert({
    where: {
      configKey: 'health.daily.latest',
    },
    update: {
      configValue: toJsonValue(report),
    },
    create: {
      configKey: 'health.daily.latest',
      configValue: toJsonValue(report),
    },
  });
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function refreshQueueSummary(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  report: DailyHealthReport,
) {
  const prisma = app.get(PrismaService);
  const queueService = app.get(QueueService);
  const historicalRecoveryService = app.get(HistoricalDataRecoveryService);
  const [snapshotQueue, deepQueue, pendingCount, historicalQueueSummary] = await Promise.all([
    queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SNAPSHOT),
    queueService.getQueueDepth(QUEUE_NAMES.ANALYSIS_SINGLE),
    prisma.jobLog.count({
      where: {
        jobStatus: JobStatus.PENDING,
      },
    }),
    historicalRecoveryService.getHistoricalRepairQueueSummary(),
  ]);

  report.summary.taskSummary.pendingCount = pendingCount;
  report.summary.queueSummary.pendingCount = pendingCount;
  report.summary.queueSummary.snapshotQueueSize = snapshotQueue.total;
  report.summary.queueSummary.deepQueueSize = deepQueue.total;
  report.summary.historicalRepairSummary.historicalRepairQueueCount =
    historicalQueueSummary.totalQueued;
  report.summary.historicalRepairSummary.queueActionBreakdown = {
    downgrade_only: historicalQueueSummary.actionCounts.downgrade_only,
    refresh_only: historicalQueueSummary.actionCounts.refresh_only,
    evidence_repair: historicalQueueSummary.actionCounts.evidence_repair,
    deep_repair: historicalQueueSummary.actionCounts.deep_repair,
    decision_recalc: historicalQueueSummary.actionCounts.decision_recalc,
    archive: 0,
  };
  report.summary.historicalRepairSummary.routerCapabilityBreakdown =
    historicalQueueSummary.routerCapabilityBreakdown;
  report.summary.historicalRepairSummary.routerFallbackBreakdown =
    historicalQueueSummary.routerFallbackBreakdown;
  report.summary.historicalRepairSummary.routerReviewRequiredCount =
    historicalQueueSummary.routerReviewRequiredCount;
  report.summary.historicalRepairSummary.routerDeterministicOnlyCount =
    historicalQueueSummary.routerDeterministicOnlyCount;
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const snapshot = await collectDailyHealthMetrics({
      app,
      options: {
        limit: options.limit,
        sinceDays: options.sinceDays,
      },
    });
    if (!options.noWrite) {
      await persistDailyHealthSnapshot({ app, snapshot });
    }

    const evaluation = evaluateDailyHealth(snapshot);
    const previous = options.compare ? await loadPreviousHealthReport() : null;
    const diff = previous ? diffDailyHealth(snapshot, toSnapshot(previous)) : null;
    const report: DailyHealthReport = {
      generatedAt: snapshot.generatedAt,
      status: evaluation.status,
      summary: snapshot.summary,
      globalSnapshot: snapshot.globalSnapshot,
      recentSnapshot: snapshot.recentSnapshot,
      checks: evaluation.checks,
      recommendations: evaluation.recommendations,
      diff,
      autoRepair: null,
    };
    if (!options.noWrite) {
      if (options.autoRepair) {
        const scheduler = app.get(AdaptiveSchedulerService);
        report.autoRepair = await scheduler.triggerRecoveryFromHealth(report);
      }
      await refreshQueueSummary(app, report);
      report.diff = previous ? diffDailyHealth(toSnapshot(report), toSnapshot(previous)) : null;
    }

    if (!options.noWrite) {
      await persistHealthReport(app, report);
      await generateLiveMd({ report });
    }

    const written = await writeDailyHealthReport({
      report,
      writeFiles: !options.noWrite,
    });

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            report,
            jsonPath: written.jsonPath,
            markdownPath: written.markdownPath,
          },
          null,
          options.pretty ? 2 : 0,
        )}\n`,
      );
      return;
    }

    process.stdout.write(`${written.markdown}\n`);
    if (written.jsonPath && written.markdownPath) {
      process.stdout.write(`\nJSON 报告：${written.jsonPath}\n`);
      process.stdout.write(`Markdown 报告：${written.markdownPath}\n`);
    }
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void bootstrap();
}
