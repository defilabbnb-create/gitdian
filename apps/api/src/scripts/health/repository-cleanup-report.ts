import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { HistoricalRepairPriorityItem, HistoricalRepairPriorityReport } from '../../modules/analysis/helpers/historical-repair-priority.helper';
import {
  HistoricalRepairPriorityOptions,
  HistoricalRepairPriorityService,
} from '../../modules/analysis/historical-repair-priority.service';
import type {
  HistoricalCleanupPurgeTarget,
  HistoricalCleanupReason,
  HistoricalCleanupState,
} from '../../modules/analysis/helpers/historical-cleanup-policy.helper';

type RepositoryCleanupReport = {
  generatedAt: string;
  source: {
    priorityGeneratedAt: string;
  };
  cleanupStateDistribution: Record<HistoricalCleanupState, number>;
  cleanupReasonBreakdown: Record<HistoricalCleanupReason, number>;
  purgeReadyTargetBreakdown: Record<HistoricalCleanupPurgeTarget, number>;
  freezeCandidateCount: number;
  archiveCandidateCount: number;
  purgeReadyCount: number;
  frozenReposStillVisibleCount: number;
  archivedReposStillScheduledCount: number;
  topReasons: Array<{ key: HistoricalCleanupReason; count: number }>;
  samples: {
    freeze: CleanupSample[];
    archive: CleanupSample[];
    purgeReady: CleanupSample[];
    stillVisible: CleanupSample[];
  };
  notes: {
    freezePolicy: string;
    archivePolicy: string;
    purgeReadyPolicy: string;
  };
};

type CleanupSample = {
  fullName: string;
  cleanupState: HistoricalCleanupState;
  cleanupReason: HistoricalCleanupReason[];
  action: string;
  visibility: string;
  value: string;
  quality: string;
  purgeTargets: HistoricalCleanupPurgeTarget[];
};

type CleanupCliOptions = HistoricalRepairPriorityOptions & {
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

function parseArgs(argv: string[]): CleanupCliOptions {
  const options: CleanupCliOptions = {
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
    if (flag === 'top-n') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.topN = parsed;
      }
    }
    if (flag === 'output-dir' && value) {
      options.outputDir = value;
    }
  }

  return options;
}

export function buildRepositoryCleanupReport(args: {
  priorityReport: HistoricalRepairPriorityReport;
  topN?: number;
}): RepositoryCleanupReport {
  const topN = args.topN ?? 10;
  const items = args.priorityReport.items;
  const topReasons = (
    Object.entries(args.priorityReport.summary.cleanupReasonBreakdown) as Array<
      [HistoricalCleanupReason, number]
    >
  )
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([key, count]) => ({ key, count }));

  return {
    generatedAt: new Date().toISOString(),
    source: {
      priorityGeneratedAt: args.priorityReport.generatedAt,
    },
    cleanupStateDistribution: args.priorityReport.summary.cleanupStateDistribution,
    cleanupReasonBreakdown: args.priorityReport.summary.cleanupReasonBreakdown,
    purgeReadyTargetBreakdown: args.priorityReport.summary.purgeReadyTargetBreakdown,
    freezeCandidateCount: args.priorityReport.summary.freezeCandidateCount,
    archiveCandidateCount: args.priorityReport.summary.archiveCandidateCount,
    purgeReadyCount: args.priorityReport.summary.purgeReadyCount,
    frozenReposStillVisibleCount:
      args.priorityReport.summary.frozenReposStillVisibleCount,
    archivedReposStillScheduledCount:
      args.priorityReport.summary.archivedReposStillScheduledCount,
    topReasons,
    samples: {
      freeze: pickCleanupSamples(
        items.filter((item) => item.cleanupState === 'freeze'),
        topN,
      ),
      archive: pickCleanupSamples(
        items.filter((item) => item.cleanupState === 'archive'),
        topN,
      ),
      purgeReady: pickCleanupSamples(
        items.filter((item) => item.cleanupState === 'purge_ready'),
        topN,
      ),
      stillVisible: pickCleanupSamples(
        items.filter((item) => item.cleanupCandidate && item.cleanupStillVisible),
        topN,
      ),
    },
    notes: {
      freezePolicy:
        'freeze 用于低价值/低曝光/低质量且修复 ROI 低的仓库；它们会退出高成本修复与高频刷新，但保留主记录。',
      archivePolicy:
        'archive 用于长期满足 freeze 且基本无触达价值的仓库；它们退出主调度链路，completion pass 会主动清掉 pending repair queue，只保留轻量 inventory。',
      purgeReadyPolicy:
        'purge_ready 会进入派生数据清理流程：清掉 pending repair queue、旧 snapshot、cached ranking 与终态 repair logs；repo 主记录保留，严格 deleteCandidate 仍走独立硬删除链。',
    },
  };
}

export function renderRepositoryCleanupMarkdown(report: RepositoryCleanupReport) {
  const lines = [
    '# GitDian 仓库清理策略报告',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- priorityGeneratedAt: ${report.source.priorityGeneratedAt}`,
    '',
    '## Cleanup State',
    '',
    `- active: ${report.cleanupStateDistribution.active}`,
    `- freeze: ${report.cleanupStateDistribution.freeze}`,
    `- archive: ${report.cleanupStateDistribution.archive}`,
    `- purge_ready: ${report.cleanupStateDistribution.purge_ready}`,
    `- frozenReposStillVisible: ${report.frozenReposStillVisibleCount}`,
    `- archivedReposStillScheduled: ${report.archivedReposStillScheduledCount}`,
    '',
    '## Top Reasons',
    '',
    ...report.topReasons.map((item) => `- ${item.key}: ${item.count}`),
    '',
    '## Purge Targets',
    '',
    ...Object.entries(report.purgeReadyTargetBreakdown).map(
      ([key, count]) => `- ${key}: ${count}`,
    ),
    '',
    '## Policy Notes',
    '',
    `- freeze: ${report.notes.freezePolicy}`,
    `- archive: ${report.notes.archivePolicy}`,
    `- purge_ready: ${report.notes.purgeReadyPolicy}`,
    '',
    '## Samples',
    '',
    '### freeze',
    ...renderSamples(report.samples.freeze),
    '',
    '### archive',
    ...renderSamples(report.samples.archive),
    '',
    '### purge_ready',
    ...renderSamples(report.samples.purgeReady),
    '',
    '### still_visible',
    ...renderSamples(report.samples.stillVisible),
  ];

  return lines.join('\n');
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const priorityReport = await app
      .get(HistoricalRepairPriorityService)
      .runPriorityReport(options);
    const report = buildRepositoryCleanupReport({
      priorityReport,
      topN: options.topN,
    });
    const markdown = renderRepositoryCleanupMarkdown(report);
    const json = JSON.stringify(report, null, options.pretty ? 2 : 0);

    if (options.noWrite !== true) {
      const prisma = app.get(PrismaService);
      const outputRoot =
        options.outputDir ??
        path.join(process.cwd(), 'reports', 'repository-cleanup');
      await mkdir(outputRoot, { recursive: true });
      const datePart = report.generatedAt.slice(0, 10).replace(/-/g, '');
      const markdownPath = path.join(
        outputRoot,
        `repository-cleanup-${datePart}.md`,
      );
      const jsonPath = path.join(
        outputRoot,
        `repository-cleanup-${datePart}.json`,
      );
      await writeFile(markdownPath, markdown, 'utf8');
      await writeFile(jsonPath, `${json}\n`, 'utf8');
      await prisma.systemConfig.upsert({
        where: {
          configKey: 'analysis.repository_cleanup.latest',
        },
        update: {
          configValue: {
            generatedAt: report.generatedAt,
            markdownPath,
            jsonPath,
            summary: {
              cleanupStateDistribution: report.cleanupStateDistribution,
              cleanupReasonBreakdown: report.cleanupReasonBreakdown,
              purgeReadyTargetBreakdown: report.purgeReadyTargetBreakdown,
            },
          },
        },
        create: {
          configKey: 'analysis.repository_cleanup.latest',
          configValue: {
            generatedAt: report.generatedAt,
            markdownPath,
            jsonPath,
            summary: {
              cleanupStateDistribution: report.cleanupStateDistribution,
              cleanupReasonBreakdown: report.cleanupReasonBreakdown,
              purgeReadyTargetBreakdown: report.purgeReadyTargetBreakdown,
            },
          },
        },
      });
      if (!options.json) {
        console.log(markdown);
        console.log('');
        console.log(`markdownPath=${markdownPath}`);
        console.log(`jsonPath=${jsonPath}`);
      }
      return;
    }

    if (options.json) {
      console.log(json);
      return;
    }

    console.log(markdown);
  } finally {
    await app.close();
  }
}

function pickCleanupSamples(items: HistoricalRepairPriorityItem[], limit: number) {
  return items
    .slice()
    .sort(
      (left, right) =>
        right.historicalRepairPriorityScore - left.historicalRepairPriorityScore,
    )
    .slice(0, limit)
    .map((item) => ({
      fullName: item.fullName,
      cleanupState: item.cleanupState,
      cleanupReason: item.cleanupReason,
      action: item.historicalRepairAction,
      visibility: item.strictVisibilityLevel,
      value: `${item.repositoryValueTier}/${item.moneyPriority ?? 'NONE'}`,
      quality: `${item.analysisQualityScore}(${item.analysisQualityState})`,
      purgeTargets: item.cleanupPurgeTargets,
    }));
}

function renderSamples(items: CleanupSample[]) {
  if (!items.length) {
    return ['- 无'];
  }
  return items.map(
    (item) =>
      `- ${item.fullName} | cleanup=${item.cleanupState} | action=${item.action} | visibility=${item.visibility} | value=${item.value} | quality=${item.quality} | reasons=${item.cleanupReason.join(', ')} | purge=${item.purgeTargets.join(', ') || 'none'}`,
  );
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
