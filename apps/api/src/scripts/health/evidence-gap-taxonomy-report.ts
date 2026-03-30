import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import {
  type HistoricalRepairPriorityItem,
} from '../../modules/analysis/helpers/historical-repair-priority.helper';
import type { HistoricalRepairRecommendedAction } from '../../modules/analysis/helpers/historical-repair-bucketing.helper';
import type {
  KeyEvidenceGapTaxonomy,
  KeyEvidenceGapSeverity,
} from '../../modules/analysis/helpers/evidence-gap-taxonomy.helper';
import {
  HistoricalRepairPriorityOptions,
  HistoricalRepairPriorityService,
} from '../../modules/analysis/historical-repair-priority.service';

type EvidenceGapTaxonomyReport = {
  generatedAt: string;
  source: {
    priorityGeneratedAt: string;
  };
  summary: {
    totalRepos: number;
    severityBreakdown: Record<KeyEvidenceGapSeverity, number>;
    mostCommonGaps: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>;
    topDeepRepairGaps: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>;
    topDecisionRecalcGaps: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>;
    topTrustedDowngradeGaps: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>;
    visibleBrokenTopGaps: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>;
    highValueWeakTopGaps: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>;
  };
  samples: {
    deepRepair: SampleItem[];
    decisionRecalc: SampleItem[];
    trustedDowngrade: SampleItem[];
  };
};

type SampleItem = {
  fullName: string;
  bucket: string;
  action: HistoricalRepairRecommendedAction;
  state: string;
  severity: KeyEvidenceGapSeverity;
  gaps: KeyEvidenceGapTaxonomy[];
};

type CliOptions = HistoricalRepairPriorityOptions & {
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

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
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

export function buildEvidenceGapTaxonomyReport(args: {
  items: HistoricalRepairPriorityItem[];
  priorityGeneratedAt: string;
  topN?: number;
}): EvidenceGapTaxonomyReport {
  const topN = args.topN ?? 10;

  return {
    generatedAt: new Date().toISOString(),
    source: {
      priorityGeneratedAt: args.priorityGeneratedAt,
    },
    summary: {
      totalRepos: args.items.length,
      severityBreakdown: buildSeverityBreakdown(args.items),
      mostCommonGaps: topGapCounts(args.items, 'keyEvidenceGaps', topN),
      topDeepRepairGaps: topGapCounts(
        args.items.filter((item) => item.historicalRepairAction === 'deep_repair'),
        'deepRepairGaps',
        topN,
      ),
      topDecisionRecalcGaps: topGapCounts(
        args.items.filter(
          (item) => item.historicalRepairAction === 'decision_recalc',
        ),
        'decisionRecalcGaps',
        topN,
      ),
      topTrustedDowngradeGaps: topGapCounts(
        args.items.filter(
          (item) =>
            item.historicalTrustedButWeak ||
            item.frontendDecisionState !== 'trusted',
        ),
        'trustedBlockingGaps',
        topN,
      ),
      visibleBrokenTopGaps: topGapCounts(
        args.items.filter(
          (item) => item.historicalRepairBucket === 'visible_broken',
        ),
        'keyEvidenceGaps',
        topN,
      ),
      highValueWeakTopGaps: topGapCounts(
        args.items.filter(
          (item) => item.historicalRepairBucket === 'high_value_weak',
        ),
        'keyEvidenceGaps',
        topN,
      ),
    },
    samples: {
      deepRepair: sampleItems(
        args.items.filter((item) => item.historicalRepairAction === 'deep_repair'),
        topN,
      ),
      decisionRecalc: sampleItems(
        args.items.filter(
          (item) => item.historicalRepairAction === 'decision_recalc',
        ),
        topN,
      ),
      trustedDowngrade: sampleItems(
        args.items.filter(
          (item) =>
            item.historicalTrustedButWeak ||
            item.frontendDecisionState !== 'trusted',
        ),
        topN,
      ),
    },
  };
}

export function renderEvidenceGapTaxonomyMarkdown(
  report: EvidenceGapTaxonomyReport,
) {
  const lines = [
    '# GitDian Key Evidence Gap Taxonomy Report',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- priorityGeneratedAt: ${report.source.priorityGeneratedAt}`,
    '',
    '## Summary',
    '',
    `- totalRepos: ${report.summary.totalRepos}`,
    `- severity.NONE: ${report.summary.severityBreakdown.NONE}`,
    `- severity.LOW: ${report.summary.severityBreakdown.LOW}`,
    `- severity.MEDIUM: ${report.summary.severityBreakdown.MEDIUM}`,
    `- severity.HIGH: ${report.summary.severityBreakdown.HIGH}`,
    `- severity.CRITICAL: ${report.summary.severityBreakdown.CRITICAL}`,
    '',
    '## Most Common Gaps',
    '',
    ...renderGapCounts(report.summary.mostCommonGaps),
    '',
    '## Top Deep Repair Gaps',
    '',
    ...renderGapCounts(report.summary.topDeepRepairGaps),
    '',
    '## Top Decision Recalc Gaps',
    '',
    ...renderGapCounts(report.summary.topDecisionRecalcGaps),
    '',
    '## Top Trusted Downgrade Gaps',
    '',
    ...renderGapCounts(report.summary.topTrustedDowngradeGaps),
    '',
    '## Bucket Top Gaps',
    '',
    '### visible_broken',
    ...renderGapCounts(report.summary.visibleBrokenTopGaps),
    '',
    '### high_value_weak',
    ...renderGapCounts(report.summary.highValueWeakTopGaps),
    '',
    '## Samples',
    '',
    '### deep_repair',
    ...renderSamples(report.samples.deepRepair),
    '',
    '### decision_recalc',
    ...renderSamples(report.samples.decisionRecalc),
    '',
    '### trusted_downgrade',
    ...renderSamples(report.samples.trustedDowngrade),
  ];

  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const priorityService = app.get(HistoricalRepairPriorityService);
    const priorityReport = await priorityService.runPriorityReport(options);
    const report = buildEvidenceGapTaxonomyReport({
      items: priorityReport.items,
      priorityGeneratedAt: priorityReport.generatedAt,
      topN: options.topN,
    });
    const markdown = renderEvidenceGapTaxonomyMarkdown(report);
    const baseName = `evidence-gap-taxonomy-${report.generatedAt.slice(0, 10).replace(/-/g, '')}`;
    const outputDir =
      options.outputDir ?? path.join(process.cwd(), 'reports', 'evidence-gap-taxonomy');
    const jsonPath = path.join(outputDir, `${baseName}.json`);
    const markdownPath = path.join(outputDir, `${baseName}.md`);

    if (!options.noWrite) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
      await writeFile(markdownPath, markdown, 'utf8');
    }

    const payload = {
      generatedAt: report.generatedAt,
      totalRepos: report.summary.totalRepos,
      topGap: report.summary.mostCommonGaps[0] ?? null,
      jsonPath,
      markdownPath,
      report,
    };
    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty === false ? 0 : 2)}\n`,
    );
  } finally {
    await app.close();
  }
}

function buildSeverityBreakdown(items: HistoricalRepairPriorityItem[]) {
  const breakdown: Record<KeyEvidenceGapSeverity, number> = {
    NONE: 0,
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  for (const item of items) {
    breakdown[item.keyEvidenceGapSeverity] += 1;
  }
  return breakdown;
}

function topGapCounts(
  items: HistoricalRepairPriorityItem[],
  key:
    | 'keyEvidenceGaps'
    | 'deepRepairGaps'
    | 'decisionRecalcGaps'
    | 'trustedBlockingGaps',
  limit: number,
) {
  const counts = new Map<KeyEvidenceGapTaxonomy, number>();
  for (const item of items) {
    for (const gap of item[key]) {
      counts.set(gap, (counts.get(gap) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([gap, count]) => ({ gap, count }))
    .sort((left, right) => right.count - left.count || left.gap.localeCompare(right.gap))
    .slice(0, limit);
}

function sampleItems(items: HistoricalRepairPriorityItem[], limit: number): SampleItem[] {
  return items
    .slice()
    .sort(
      (left, right) =>
        right.historicalRepairPriorityScore - left.historicalRepairPriorityScore,
    )
    .slice(0, limit)
    .map((item) => ({
      fullName: item.fullName,
      bucket: item.historicalRepairBucket,
      action: item.historicalRepairAction,
      state: item.frontendDecisionState,
      severity: item.keyEvidenceGapSeverity,
      gaps: item.keyEvidenceGaps.slice(0, 6),
    }));
}

function renderGapCounts(
  items: Array<{ gap: KeyEvidenceGapTaxonomy; count: number }>,
) {
  if (!items.length) {
    return ['- 无'];
  }

  return items.map((item) => `- ${item.gap}: ${item.count}`);
}

function renderSamples(items: SampleItem[]) {
  if (!items.length) {
    return ['- 无'];
  }

  return items.map(
    (item) =>
      `- ${item.fullName} | bucket=${item.bucket} | action=${item.action} | state=${item.state} | severity=${item.severity} | gaps=${item.gaps.join(', ')}`,
  );
}

if (process.argv[1]?.endsWith('evidence-gap-taxonomy-report.js')) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
      );
      process.exit(1);
    });
}
