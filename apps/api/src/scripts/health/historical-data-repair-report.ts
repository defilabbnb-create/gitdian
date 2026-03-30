import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { HistoricalRepairPriorityItem, HistoricalRepairPriorityReport } from '../../modules/analysis/helpers/historical-repair-priority.helper';
import { HistoricalDataRecoveryService } from '../../modules/analysis/historical-data-recovery.service';
import {
  HistoricalRepairPriorityOptions,
  HistoricalRepairPriorityService,
} from '../../modules/analysis/historical-repair-priority.service';
import type { DailyHealthReport } from './health-reporter';

const HEALTH_LATEST_CONFIG_KEY = 'health.daily.latest';
const RECOVERY_RUN_CONFIG_KEY = 'analysis.historical_recovery.run.latest';

type HistoricalDataRepairReport = {
  generatedAt: string;
  source: {
    priorityGeneratedAt: string;
    healthGeneratedAt: string | null;
    latestRunGeneratedAt: string | null;
  };
  inventorySummary: {
    totalRepos: number;
    finalDecisionButNoDeepCount: number;
    fallbackCount: number;
    conflictCount: number;
    incompleteCount: number;
    needsFrontendDowngradeCount: number;
    needsDecisionRecalcCount: number;
    highValueWeakCount: number;
  };
  bucketCounts: {
    visible_broken: number;
    high_value_weak: number;
    stale_watch: number;
    archive_or_noise: number;
  };
  evidenceSummary: {
    evidenceCoverageRate: number;
    keyEvidenceMissingCount: number;
    evidenceConflictCount: number;
    evidenceWeakButVisibleCount: number;
    conflictDrivenDecisionRecalcCount: number;
  };
  visibleBrokenActionBreakdown: HistoricalRepairPriorityReport['summary']['visibleBrokenActionBreakdown'];
  highValueWeakActionBreakdown: HistoricalRepairPriorityReport['summary']['highValueWeakActionBreakdown'];
  historicalTrustedButWeak: {
    count: number;
    downgradeTargets: {
      provisional: number;
      degraded: number;
    };
    reasonDistribution: Array<{
      key: string;
      count: number;
    }>;
  };
  executionSummary: {
    historicalRepairQueueCount: number;
    queueActionBreakdown: DailyHealthReport['summary']['historicalRepairSummary']['queueActionBreakdown'];
    latestExecutionCounters: Record<string, number>;
    schedulerLane: string | null;
    visibleBrokenLimit: number | null;
    highValueWeakLimit: number | null;
  };
  topPriorityGroups: {
    visibleBrokenTop: PrioritySample[];
    highValueWeakTop: PrioritySample[];
    downgradeOnlyTop: PrioritySample[];
    deepRepairTop: PrioritySample[];
    decisionRecalcTop: PrioritySample[];
  };
  notes: {
    actionBreakdownVsExecution: string;
    partialExecution: string;
    downgradeBreadth: string;
  };
};

type PrioritySample = {
  fullName: string;
  bucket: string;
  action: string;
  priorityScore: number;
  frontendDecisionState: string;
  strictVisibilityLevel: string;
  moneyPriority: string | null;
  repositoryValueTier: string;
  reason: string;
};

type HistoricalRepairCliOptions = HistoricalRepairPriorityOptions & {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  topN?: number;
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

function parseArgs(argv: string[]): HistoricalRepairCliOptions {
  const options: HistoricalRepairCliOptions = {
    json: false,
    pretty: true,
    noWrite: false,
    outputDir: null,
    topN: 10,
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
    if (flag === 'top-n') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.topN = parsed;
      }
    }
  }

  return options;
}

export function buildHistoricalDataRepairReport(args: {
  priorityReport: HistoricalRepairPriorityReport;
  queueSummary: Awaited<
    ReturnType<HistoricalDataRecoveryService['getHistoricalRepairQueueSummary']>
  >;
  healthReport?: DailyHealthReport | null;
  latestRun?: Record<string, unknown> | null;
  topN?: number;
}): HistoricalDataRepairReport {
  const items = args.priorityReport.items;
  const topN = args.topN ?? 10;
  const healthHistorical = args.healthReport?.summary?.historicalRepairSummary ?? null;
  const autoRepair = readObject(args.healthReport?.autoRepair);
  const latestExecution = (readObject(autoRepair?.execution) ??
    readObject(args.latestRun?.execution)) as Record<string, unknown> | null;
  const lanePolicy = readObject(autoRepair?.lanePolicy) as Record<string, unknown> | null;
  const trustedButWeakItems = items.filter((item) => item.historicalTrustedButWeak);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      priorityGeneratedAt: args.priorityReport.generatedAt,
      healthGeneratedAt: args.healthReport?.generatedAt ?? null,
      latestRunGeneratedAt:
        readString(args.latestRun?.generatedAt) ?? null,
    },
    inventorySummary: {
      totalRepos: items.length,
      finalDecisionButNoDeepCount: countWhere(
        items,
        (item) => item.hasFinalDecision && !item.hasDeep,
      ),
      fallbackCount: countWhere(items, (item) => item.fallbackFlag),
      conflictCount: countWhere(items, (item) => item.conflictFlag),
      incompleteCount: countWhere(items, (item) => item.incompleteFlag),
      needsFrontendDowngradeCount: countWhere(
        items,
        (item) => item.needsFrontendDowngrade,
      ),
      needsDecisionRecalcCount: countWhere(
        items,
        (item) => item.needsDecisionRecalc,
      ),
      highValueWeakCount: args.priorityReport.summary.highValueWeakCount,
    },
    bucketCounts: {
      visible_broken: args.priorityReport.summary.visibleBrokenCount,
      high_value_weak: args.priorityReport.summary.highValueWeakCount,
      stale_watch: args.priorityReport.summary.staleWatchCount,
      archive_or_noise: args.priorityReport.summary.archiveOrNoiseCount,
    },
    evidenceSummary: {
      evidenceCoverageRate: args.priorityReport.summary.evidenceCoverageRate,
      keyEvidenceMissingCount: args.priorityReport.summary.keyEvidenceMissingCount,
      evidenceConflictCount: args.priorityReport.summary.evidenceConflictCount,
      evidenceWeakButVisibleCount:
        args.priorityReport.summary.evidenceWeakButVisibleCount,
      conflictDrivenDecisionRecalcCount:
        args.priorityReport.summary.conflictDrivenDecisionRecalcCount,
    },
    visibleBrokenActionBreakdown:
      args.priorityReport.summary.visibleBrokenActionBreakdown,
    highValueWeakActionBreakdown:
      args.priorityReport.summary.highValueWeakActionBreakdown,
    historicalTrustedButWeak: {
      count: args.priorityReport.summary.historicalTrustedButWeakCount,
      downgradeTargets: {
        provisional: countWhere(
          trustedButWeakItems,
          (item) => item.frontendDecisionState === 'provisional',
        ),
        degraded: countWhere(
          trustedButWeakItems,
          (item) => item.frontendDecisionState === 'degraded',
        ),
      },
      reasonDistribution: topReasonDistribution(trustedButWeakItems, topN),
    },
    executionSummary: {
      historicalRepairQueueCount:
        healthHistorical?.historicalRepairQueueCount ?? args.queueSummary.totalQueued,
      queueActionBreakdown:
        healthHistorical?.queueActionBreakdown ??
        toQueueActionBreakdown(args.queueSummary),
      latestExecutionCounters: {
        downgradeOnly: readNumber(latestExecution?.downgradeOnly),
        refreshOnly: readNumber(latestExecution?.refreshOnly),
        evidenceRepair: readNumber(latestExecution?.evidenceRepair),
        deepRepair: readNumber(latestExecution?.deepRepair),
        decisionRecalc: readNumber(latestExecution?.decisionRecalc),
        archive: readNumber(latestExecution?.archive),
      },
      schedulerLane:
        readString(readObject(args.healthReport?.autoRepair)?.schedulerLane) ?? null,
      visibleBrokenLimit: readOptionalNumber(
        readObject(lanePolicy?.limits)?.visibleBrokenLimit,
      ),
      highValueWeakLimit: readOptionalNumber(
        readObject(lanePolicy?.limits)?.highValueWeakLimit,
      ),
    },
    topPriorityGroups: {
      visibleBrokenTop: toPrioritySamples(
        sortByPriority(
          items.filter((item) => item.historicalRepairBucket === 'visible_broken'),
        ).slice(0, topN),
      ),
      highValueWeakTop: toPrioritySamples(
        sortByPriority(
          items.filter((item) => item.historicalRepairBucket === 'high_value_weak'),
        ).slice(0, topN),
      ),
      downgradeOnlyTop: toPrioritySamples(
        sortByPriority(
          items.filter((item) => item.historicalRepairAction === 'downgrade_only'),
        ).slice(0, topN),
      ),
      deepRepairTop: toPrioritySamples(
        sortByPriority(
          items.filter((item) => item.historicalRepairAction === 'deep_repair'),
        ).slice(0, topN),
      ),
      decisionRecalcTop: toPrioritySamples(
        sortByPriority(
          items.filter((item) => item.historicalRepairAction === 'decision_recalc'),
        ).slice(0, topN),
      ),
    },
    notes: {
      actionBreakdownVsExecution:
        'action breakdown 是全库修复建议分布；latest execution/queue breakdown 只代表本轮 scheduler 按 lane limit 实际执行和入队的那一部分，所以两者不必相等。',
      partialExecution:
        'high_value_weak 总量大，但 scheduler 当前只放行一部分（受 shared queue 压力和 lane limit 控制），避免历史修复把普通分析队列挤爆。',
      downgradeBreadth:
        'needsFrontendDowngrade 是保守降级信号，覆盖面故意更宽；visible_broken 只认真实前台可见且当前有污染风险的对象，所以不会相等。',
    },
  };
}

export function renderHistoricalDataRepairMarkdown(
  report: HistoricalDataRepairReport,
) {
  return [
    '# GitDian 历史数据修复报告',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- priorityGeneratedAt: ${report.source.priorityGeneratedAt}`,
    `- healthGeneratedAt: ${report.source.healthGeneratedAt ?? 'N/A'}`,
    `- latestRunGeneratedAt: ${report.source.latestRunGeneratedAt ?? 'N/A'}`,
    '',
    '## 全库体检摘要',
    '',
    `- total repos: ${report.inventorySummary.totalRepos}`,
    `- hasFinalDecision && !hasDeep: ${report.inventorySummary.finalDecisionButNoDeepCount}`,
    `- fallback / conflict / incomplete: ${report.inventorySummary.fallbackCount} / ${report.inventorySummary.conflictCount} / ${report.inventorySummary.incompleteCount}`,
    `- needsFrontendDowngrade: ${report.inventorySummary.needsFrontendDowngradeCount}`,
    `- needsDecisionRecalc: ${report.inventorySummary.needsDecisionRecalcCount}`,
    `- high-value weak count: ${report.inventorySummary.highValueWeakCount}`,
    '',
    '## 4 个 repair bucket',
    '',
    `- visible_broken: ${report.bucketCounts.visible_broken}`,
    `- high_value_weak: ${report.bucketCounts.high_value_weak}`,
    `- stale_watch: ${report.bucketCounts.stale_watch}`,
    `- archive_or_noise: ${report.bucketCounts.archive_or_noise}`,
    '',
    '## evidence 摘要',
    '',
    `- evidenceCoverageRate: ${(report.evidenceSummary.evidenceCoverageRate * 100).toFixed(2)}%`,
    `- keyEvidenceMissingCount: ${report.evidenceSummary.keyEvidenceMissingCount}`,
    `- evidenceConflictCount: ${report.evidenceSummary.evidenceConflictCount}`,
    `- evidenceWeakButVisibleCount: ${report.evidenceSummary.evidenceWeakButVisibleCount}`,
    `- conflictDrivenDecisionRecalcCount: ${report.evidenceSummary.conflictDrivenDecisionRecalcCount}`,
    '',
    '## visible_broken action breakdown',
    '',
    ...renderActionBreakdown(report.visibleBrokenActionBreakdown),
    '',
    '## high_value_weak action breakdown',
    '',
    ...renderActionBreakdown(report.highValueWeakActionBreakdown),
    '',
    '## historical trusted but weak',
    '',
    `- count: ${report.historicalTrustedButWeak.count}`,
    `- downgrade to provisional: ${report.historicalTrustedButWeak.downgradeTargets.provisional}`,
    `- downgrade to degraded: ${report.historicalTrustedButWeak.downgradeTargets.degraded}`,
    ...report.historicalTrustedButWeak.reasonDistribution.map(
      (item) => `- reason ${item.key}: ${item.count}`,
    ),
    '',
    '## 当前执行摘要',
    '',
    `- historicalRepairQueueCount: ${report.executionSummary.historicalRepairQueueCount}`,
    `- queueActionBreakdown: downgrade=${report.executionSummary.queueActionBreakdown.downgrade_only}, refresh=${report.executionSummary.queueActionBreakdown.refresh_only}, evidence=${report.executionSummary.queueActionBreakdown.evidence_repair}, deep=${report.executionSummary.queueActionBreakdown.deep_repair}, recalc=${report.executionSummary.queueActionBreakdown.decision_recalc}`,
    `- latest execution: downgrade=${report.executionSummary.latestExecutionCounters.downgradeOnly}, refresh=${report.executionSummary.latestExecutionCounters.refreshOnly}, evidence=${report.executionSummary.latestExecutionCounters.evidenceRepair}, deep=${report.executionSummary.latestExecutionCounters.deepRepair}, recalc=${report.executionSummary.latestExecutionCounters.decisionRecalc}`,
    `- scheduler lane: ${report.executionSummary.schedulerLane ?? 'N/A'}`,
    `- visibleBrokenLimit / highValueWeakLimit: ${report.executionSummary.visibleBrokenLimit ?? 'N/A'} / ${report.executionSummary.highValueWeakLimit ?? 'N/A'}`,
    '',
    '## Top repo',
    '',
    '### visible_broken top',
    ...renderPrioritySamples(report.topPriorityGroups.visibleBrokenTop),
    '',
    '### high_value_weak top',
    ...renderPrioritySamples(report.topPriorityGroups.highValueWeakTop),
    '',
    '### downgrade_only top',
    ...renderPrioritySamples(report.topPriorityGroups.downgradeOnlyTop),
    '',
    '### deep_repair top',
    ...renderPrioritySamples(report.topPriorityGroups.deepRepairTop),
    '',
    '### decision_recalc top',
    ...renderPrioritySamples(report.topPriorityGroups.decisionRecalcTop),
    '',
    '## 口径说明',
    '',
    `- ${report.notes.actionBreakdownVsExecution}`,
    `- ${report.notes.partialExecution}`,
    `- ${report.notes.downgradeBreadth}`,
  ].join('\n');
}

async function writeHistoricalDataRepairReport(args: {
  report: HistoricalDataRepairReport;
  writeFiles: boolean;
  outputDir?: string | null;
}) {
  const json = JSON.stringify(args.report, null, 2);
  const markdown = renderHistoricalDataRepairMarkdown(args.report);

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
    : path.join(process.cwd(), 'reports', 'historical-data-repair');

  await mkdir(reportsDir, { recursive: true });

  const jsonPath = path.join(
    reportsDir,
    `historical-data-repair-${yyyy}${mm}${dd}.json`,
  );
  const markdownPath = path.join(
    reportsDir,
    `historical-data-repair-${yyyy}${mm}${dd}.md`,
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
    const recoveryService = app.get(HistoricalDataRecoveryService);
    const prisma = app.get(PrismaService);
    const [priorityReport, queueSummary, healthRow, latestRunRow] = await Promise.all([
      priorityService.runPriorityReport({
        limit: options.limit,
        staleFreshnessDays: options.staleFreshnessDays,
        staleEvidenceDays: options.staleEvidenceDays,
        weakQualityScore: options.weakQualityScore,
        archiveFreshnessDays: options.archiveFreshnessDays,
      }),
      recoveryService.getHistoricalRepairQueueSummary(),
      prisma.systemConfig.findUnique({
        where: { configKey: HEALTH_LATEST_CONFIG_KEY },
        select: { configValue: true },
      }),
      prisma.systemConfig.findUnique({
        where: { configKey: RECOVERY_RUN_CONFIG_KEY },
        select: { configValue: true },
      }),
    ]);

    const report = buildHistoricalDataRepairReport({
      priorityReport,
      queueSummary,
      healthReport: readObject(healthRow?.configValue) as DailyHealthReport | null,
      latestRun: readObject(latestRunRow?.configValue),
      topN: options.topN,
    });
    const written = await writeHistoricalDataRepairReport({
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
          visibleBrokenCount: report.bucketCounts.visible_broken,
          highValueWeakCount: report.bucketCounts.high_value_weak,
          staleWatchCount: report.bucketCounts.stale_watch,
          archiveOrNoiseCount: report.bucketCounts.archive_or_noise,
          historicalRepairQueueCount: report.executionSummary.historicalRepairQueueCount,
          schedulerLane: report.executionSummary.schedulerLane,
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

function renderActionBreakdown(
  breakdown: HistoricalRepairPriorityReport['summary']['actionBreakdown'],
) {
  return [
    `- downgrade_only: ${breakdown.downgrade_only}`,
    `- refresh_only: ${breakdown.refresh_only}`,
    `- evidence_repair: ${breakdown.evidence_repair}`,
    `- deep_repair: ${breakdown.deep_repair}`,
    `- decision_recalc: ${breakdown.decision_recalc}`,
    `- archive: ${breakdown.archive}`,
  ];
}

function renderPrioritySamples(items: PrioritySample[]) {
  if (!items.length) {
    return ['- 无'];
  }

  return items.map(
    (item) =>
      `- ${item.fullName} | bucket=${item.bucket} | action=${item.action} | score=${item.priorityScore} | state=${item.frontendDecisionState} | visibility=${item.strictVisibilityLevel} | value=${item.repositoryValueTier}/${item.moneyPriority ?? 'NONE'} | reason=${item.reason}`,
  );
}

function topReasonDistribution(items: HistoricalRepairPriorityItem[], topN: number) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const signal of item.historicalRepairSignals) {
      counts.set(signal, (counts.get(signal) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, topN)
    .map(([key, count]) => ({ key, count }));
}

function toPrioritySamples(items: HistoricalRepairPriorityItem[]): PrioritySample[] {
  return items.map((item) => ({
    fullName: item.fullName,
    bucket: item.historicalRepairBucket,
    action: item.historicalRepairAction,
    priorityScore: item.historicalRepairPriorityScore,
    frontendDecisionState: item.frontendDecisionState,
    strictVisibilityLevel: item.strictVisibilityLevel,
    moneyPriority: item.moneyPriority,
    repositoryValueTier: item.repositoryValueTier,
    reason: item.historicalRepairReason,
  }));
}

function sortByPriority(items: HistoricalRepairPriorityItem[]) {
  return items
    .slice()
    .sort(
      (left, right) =>
        right.historicalRepairPriorityScore - left.historicalRepairPriorityScore,
    );
}

function toQueueActionBreakdown(
  queueSummary: Awaited<
    ReturnType<HistoricalDataRecoveryService['getHistoricalRepairQueueSummary']>
  >,
): DailyHealthReport['summary']['historicalRepairSummary']['queueActionBreakdown'] {
  return {
    downgrade_only: queueSummary.actionCounts.downgrade_only,
    refresh_only: queueSummary.actionCounts.refresh_only,
    evidence_repair: queueSummary.actionCounts.evidence_repair,
    deep_repair: queueSummary.actionCounts.deep_repair,
    decision_recalc: queueSummary.actionCounts.decision_recalc,
    archive: 0,
  };
}

function readObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function countWhere<T>(items: T[], predicate: (item: T) => boolean) {
  let count = 0;
  for (const item of items) {
    if (predicate(item)) {
      count += 1;
    }
  }
  return count;
}

if (require.main === module) {
  void bootstrap();
}
