import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { DailyHealthReport } from './health-reporter';

export const DEFAULT_LIVE_MD_PATH = path.join(
  os.homedir(),
  'Desktop',
  'codexcx',
  'GitDian-LIVE.md',
);

export function renderLiveMarkdown(report: DailyHealthReport) {
  const queueBacklog = report.summary.queueSummary.pendingCount;
  const homepageUnsafeRate =
    report.summary.homepageSummary.homepageUnsafe /
    Math.max(1, report.summary.homepageSummary.homepageTotal);
  const historical = report.summary.historicalRepairSummary;
  const updatedAt = new Date(report.generatedAt);
  const lastUpdated = [
    updatedAt.getFullYear(),
    String(updatedAt.getMonth() + 1).padStart(2, '0'),
    String(updatedAt.getDate()).padStart(2, '0'),
  ].join('-');

  return [
    '# GitDian-LIVE',
    '',
    '## Last Updated',
    '',
    lastUpdated,
    '',
    '---',
    '',
    '# Current System Snapshot',
    '',
    '## Global',
    '',
    `* totalRepos: ${report.globalSnapshot.totalRepos}`,
    `* fullyAnalyzed: ${report.globalSnapshot.fullyAnalyzed}`,
    `* incomplete: ${report.globalSnapshot.incomplete}`,
    `* deepCoverage: ${(report.globalSnapshot.deepCoverage * 100).toFixed(2)}%`,
    `* finalDecisionButNoDeep: ${report.globalSnapshot.finalDecisionButNoDeep}`,
    '',
    '## Exposure',
    '',
    `* homepageUnsafe: ${report.summary.homepageSummary.homepageUnsafe}/${report.summary.homepageSummary.homepageTotal}`,
    `* homepageUnsafeRate: ${(homepageUnsafeRate * 100).toFixed(2)}%`,
    `* homepageIncomplete: ${report.summary.homepageSummary.homepageIncomplete}`,
    '',
    '## Queue',
    '',
    `* queueBacklog: ${queueBacklog}`,
    `* pendingTasks: ${report.summary.queueSummary.pendingCount}`,
    `* deepBacklog: ${report.summary.queueSummary.deepQueueSize}`,
    `* claudeBacklog: ${report.summary.queueSummary.claudeQueueSize}`,
    '',
    '## Historical Repair',
    '',
    `* visibleBroken: ${historical.visibleBrokenCount}`,
    `* highValueWeak: ${historical.highValueWeakCount}`,
    `* staleWatch: ${historical.staleWatchCount}`,
    `* archiveOrNoise: ${historical.archiveOrNoiseCount}`,
    `* trustedButWeak: ${historical.historicalTrustedButWeakCount}`,
    `* frontendDowngradeUrgent: ${historical.immediateFrontendDowngradeCount}`,
    `* historicalRepairQueue: ${historical.historicalRepairQueueCount}`,
    `* actions: downgrade=${historical.historicalRepairActionBreakdown.downgrade_only}, refresh=${historical.historicalRepairActionBreakdown.refresh_only}, evidence=${historical.historicalRepairActionBreakdown.evidence_repair}, deep=${historical.historicalRepairActionBreakdown.deep_repair}, recalc=${historical.historicalRepairActionBreakdown.decision_recalc}`,
    '',
    '## Recent (1d)',
    '',
    `* newRepos: ${report.recentSnapshot.newRepos}`,
    `* recentTasks: ${report.recentSnapshot.recentTasks}`,
    `* recentFailures: ${report.recentSnapshot.recentFailures}`,
    '',
    '## Status',
    '',
    `* overall: ${report.status}`,
    ...report.recommendations.map((item) => `* ${item}`),
    '',
    '---',
    '',
    '# End of LIVE State',
    '',
  ].join('\n');
}

export async function generateLiveMd(args: {
  report: DailyHealthReport;
  outputPath?: string;
}) {
  const outputPath = args.outputPath ?? DEFAULT_LIVE_MD_PATH;
  const markdown = renderLiveMarkdown(args.report);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');

  return {
    outputPath,
    markdown,
  };
}

async function bootstrap() {
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const row = await app.get(PrismaService).systemConfig.findUnique({
      where: {
        configKey: 'health.daily.latest',
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object') {
      throw new Error('health.daily.latest is not available.');
    }

    const report = row.configValue as DailyHealthReport;
    const result = await generateLiveMd({ report });
    process.stdout.write(`${result.outputPath}\n`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void bootstrap();
}
