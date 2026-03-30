import type {
  EvidenceMapDimension,
  EvidenceMapNodeStatus,
  RepositoryEvidenceMap,
} from './evidence-map.helper';
import { EVIDENCE_MAP_DIMENSIONS } from './evidence-map.helper';
import type { HistoricalRepairBucket, HistoricalRepairRecommendedAction } from './historical-repair-bucketing.helper';
import type { HistoricalRepairPriorityItem, HistoricalRepairPriorityReport } from './historical-repair-priority.helper';

export type EvidenceMapCoverageBucketSummary = {
  sampledCount: number;
  statusBreakdown: Record<
    EvidenceMapDimension,
    Record<EvidenceMapNodeStatus, number>
  >;
  mostMissingDimensions: Array<{
    dimension: EvidenceMapDimension;
    count: number;
  }>;
  mostWeakDimensions: Array<{
    dimension: EvidenceMapDimension;
    count: number;
  }>;
  mostConflictDimensions: Array<{
    dimension: EvidenceMapDimension;
    count: number;
  }>;
};

export type EvidenceMapCoverageReport = {
  generatedAt: string;
  source: {
    priorityGeneratedAt: string;
  };
  samplePlan: {
    visibleBrokenTopN: number;
    highValueWeakTopN: number;
    randomPerBucket: number;
    totalSampled: number;
  };
  sampledRepoIds: string[];
  overall: {
    sampledCount: number;
    statusBreakdown: Record<
      EvidenceMapDimension,
      Record<EvidenceMapNodeStatus, number>
    >;
    mostMissingDimensions: Array<{
      dimension: EvidenceMapDimension;
      count: number;
    }>;
    mostWeakDimensions: Array<{
      dimension: EvidenceMapDimension;
      count: number;
    }>;
    mostConflictDimensions: Array<{
      dimension: EvidenceMapDimension;
      count: number;
    }>;
  };
  bucketSummaries: Record<HistoricalRepairBucket, EvidenceMapCoverageBucketSummary>;
  actionSummaries: {
    visibleBrokenActions: Record<HistoricalRepairRecommendedAction, number>;
    highValueWeakActions: Record<HistoricalRepairRecommendedAction, number>;
  };
  highlights: {
    visibleBrokenMostMissing: Array<{
      dimension: EvidenceMapDimension;
      count: number;
    }>;
    highValueWeakMostMissing: Array<{
      dimension: EvidenceMapDimension;
      count: number;
    }>;
    mostCommonConflictDimensions: Array<{
      dimension: EvidenceMapDimension;
      count: number;
    }>;
  };
  samples: {
    visibleBrokenTop: EvidenceSampleSummary[];
    highValueWeakTop: EvidenceSampleSummary[];
    downgradeOnlyTop: EvidenceSampleSummary[];
    decisionRecalcTop: EvidenceSampleSummary[];
    bucketRandom: Record<HistoricalRepairBucket, EvidenceSampleSummary[]>;
  };
};

export type EvidenceSampleSummary = {
  repoId: string;
  fullName: string;
  bucket: HistoricalRepairBucket;
  action: HistoricalRepairRecommendedAction;
  priorityScore: number;
  weakestDimensions: EvidenceMapDimension[];
  conflictDimensions: EvidenceMapDimension[];
  missingDimensions: EvidenceMapDimension[];
};

export type EvidenceMapCoverageOptions = {
  visibleBrokenTopN?: number;
  highValueWeakTopN?: number;
  randomPerBucket?: number;
};

export function collectEvidenceCoverageRepoIds(args: {
  items: HistoricalRepairPriorityItem[];
  options?: EvidenceMapCoverageOptions;
}) {
  const options = {
    visibleBrokenTopN: args.options?.visibleBrokenTopN ?? 15,
    highValueWeakTopN: args.options?.highValueWeakTopN ?? 15,
    randomPerBucket: args.options?.randomPerBucket ?? 8,
  };
  return uniqueStrings([
    ...takeTopBucketItems(
      args.items,
      'visible_broken',
      options.visibleBrokenTopN,
    ).map((item) => item.repoId),
    ...takeTopBucketItems(
      args.items,
      'high_value_weak',
      options.highValueWeakTopN,
    ).map((item) => item.repoId),
    ...takeDeterministicBucketSample(
      args.items,
      'visible_broken',
      options.randomPerBucket,
    ).map((item) => item.repoId),
    ...takeDeterministicBucketSample(
      args.items,
      'high_value_weak',
      options.randomPerBucket,
    ).map((item) => item.repoId),
    ...takeDeterministicBucketSample(
      args.items,
      'stale_watch',
      options.randomPerBucket,
    ).map((item) => item.repoId),
    ...takeDeterministicBucketSample(
      args.items,
      'archive_or_noise',
      options.randomPerBucket,
    ).map((item) => item.repoId),
  ]);
}

export function buildEvidenceMapCoverageReport(args: {
  priorityReport: HistoricalRepairPriorityReport;
  evidenceMaps: RepositoryEvidenceMap[];
  options?: EvidenceMapCoverageOptions;
}): EvidenceMapCoverageReport {
  const options = {
    visibleBrokenTopN: args.options?.visibleBrokenTopN ?? 15,
    highValueWeakTopN: args.options?.highValueWeakTopN ?? 15,
    randomPerBucket: args.options?.randomPerBucket ?? 8,
  };
  const evidenceByRepoId = new Map(
    args.evidenceMaps.map((item) => [item.repoId, item] as const),
  );
  const priorityByRepoId = new Map(
    args.priorityReport.items.map((item) => [item.repoId, item] as const),
  );

  const visibleBrokenTop = takeTopBucketItems(
    args.priorityReport.items,
    'visible_broken',
    options.visibleBrokenTopN,
  );
  const highValueWeakTop = takeTopBucketItems(
    args.priorityReport.items,
    'high_value_weak',
    options.highValueWeakTopN,
  );
  const bucketRandom = {
    visible_broken: takeDeterministicBucketSample(
      args.priorityReport.items,
      'visible_broken',
      options.randomPerBucket,
    ),
    high_value_weak: takeDeterministicBucketSample(
      args.priorityReport.items,
      'high_value_weak',
      options.randomPerBucket,
    ),
    stale_watch: takeDeterministicBucketSample(
      args.priorityReport.items,
      'stale_watch',
      options.randomPerBucket,
    ),
    archive_or_noise: takeDeterministicBucketSample(
      args.priorityReport.items,
      'archive_or_noise',
      options.randomPerBucket,
    ),
  } satisfies Record<HistoricalRepairBucket, HistoricalRepairPriorityItem[]>;

  const sampledRepoIds = collectEvidenceCoverageRepoIds({
    items: args.priorityReport.items,
    options,
  });
  const sampledMaps = sampledRepoIds
    .map((repoId) => evidenceByRepoId.get(repoId))
    .filter((item): item is RepositoryEvidenceMap => Boolean(item));

  const overallBreakdown = buildStatusBreakdown(sampledMaps);
  const bucketSummaries = {
    visible_broken: buildBucketSummary(
      sampledMaps,
      priorityByRepoId,
      'visible_broken',
    ),
    high_value_weak: buildBucketSummary(
      sampledMaps,
      priorityByRepoId,
      'high_value_weak',
    ),
    stale_watch: buildBucketSummary(sampledMaps, priorityByRepoId, 'stale_watch'),
    archive_or_noise: buildBucketSummary(
      sampledMaps,
      priorityByRepoId,
      'archive_or_noise',
    ),
  } satisfies Record<HistoricalRepairBucket, EvidenceMapCoverageBucketSummary>;

  return {
    generatedAt: new Date().toISOString(),
    source: {
      priorityGeneratedAt: args.priorityReport.generatedAt,
    },
    samplePlan: {
      visibleBrokenTopN: options.visibleBrokenTopN,
      highValueWeakTopN: options.highValueWeakTopN,
      randomPerBucket: options.randomPerBucket,
      totalSampled: sampledMaps.length,
    },
    sampledRepoIds,
    overall: {
      sampledCount: sampledMaps.length,
      statusBreakdown: overallBreakdown,
      mostMissingDimensions: sortDimensionCounts(
        pickStatusCounts(overallBreakdown, 'missing'),
      ),
      mostWeakDimensions: sortDimensionCounts(
        pickStatusCounts(overallBreakdown, 'weak'),
      ),
      mostConflictDimensions: sortDimensionCounts(
        pickStatusCounts(overallBreakdown, 'conflict'),
      ),
    },
    bucketSummaries,
    actionSummaries: {
      visibleBrokenActions: countActions(visibleBrokenTop),
      highValueWeakActions: countActions(highValueWeakTop),
    },
    highlights: {
      visibleBrokenMostMissing: bucketSummaries.visible_broken.mostMissingDimensions,
      highValueWeakMostMissing:
        bucketSummaries.high_value_weak.mostMissingDimensions,
      mostCommonConflictDimensions: sortDimensionCounts(
        pickStatusCounts(overallBreakdown, 'conflict'),
      ),
    },
    samples: {
      visibleBrokenTop: summarizeEvidenceSamples(visibleBrokenTop, evidenceByRepoId),
      highValueWeakTop: summarizeEvidenceSamples(highValueWeakTop, evidenceByRepoId),
      downgradeOnlyTop: summarizeEvidenceSamples(
        pickTopByAction(args.priorityReport.items, 'downgrade_only', 8),
        evidenceByRepoId,
      ),
      decisionRecalcTop: summarizeEvidenceSamples(
        pickTopByAction(args.priorityReport.items, 'decision_recalc', 8),
        evidenceByRepoId,
      ),
      bucketRandom: {
        visible_broken: summarizeEvidenceSamples(
          bucketRandom.visible_broken,
          evidenceByRepoId,
        ),
        high_value_weak: summarizeEvidenceSamples(
          bucketRandom.high_value_weak,
          evidenceByRepoId,
        ),
        stale_watch: summarizeEvidenceSamples(
          bucketRandom.stale_watch,
          evidenceByRepoId,
        ),
        archive_or_noise: summarizeEvidenceSamples(
          bucketRandom.archive_or_noise,
          evidenceByRepoId,
        ),
      },
    },
  };
}

export function renderEvidenceMapCoverageMarkdown(
  report: EvidenceMapCoverageReport,
) {
  const lines: string[] = [];
  lines.push('# GitDian Evidence Map 覆盖报告');
  lines.push('');
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- priorityGeneratedAt: ${report.source.priorityGeneratedAt}`);
  lines.push(`- totalSampled: ${report.samplePlan.totalSampled}`);
  lines.push(
    `- samplePlan: visible_broken top ${report.samplePlan.visibleBrokenTopN} + high_value_weak top ${report.samplePlan.highValueWeakTopN} + random ${report.samplePlan.randomPerBucket}/bucket`,
  );
  lines.push('');
  lines.push('## 全局结论');
  lines.push('');
  lines.push(
    `- 最常 missing: ${formatDimensionCounts(report.overall.mostMissingDimensions)}`,
  );
  lines.push(
    `- 最常 weak: ${formatDimensionCounts(report.overall.mostWeakDimensions)}`,
  );
  lines.push(
    `- 最常 conflict: ${formatDimensionCounts(report.overall.mostConflictDimensions)}`,
  );
  lines.push('');
  lines.push('## Bucket Highlights');
  lines.push('');
  lines.push(
    `- visible_broken 最常缺: ${formatDimensionCounts(
      report.highlights.visibleBrokenMostMissing,
    )}`,
  );
  lines.push(
    `- high_value_weak 最常缺: ${formatDimensionCounts(
      report.highlights.highValueWeakMostMissing,
    )}`,
  );
  lines.push(
    `- conflict 最集中 evidence: ${formatDimensionCounts(
      report.highlights.mostCommonConflictDimensions,
    )}`,
  );
  lines.push('');
  lines.push('## visible_broken action breakdown');
  lines.push('');
  for (const [key, value] of Object.entries(report.actionSummaries.visibleBrokenActions)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push('');
  lines.push('## high_value_weak action breakdown');
  lines.push('');
  for (const [key, value] of Object.entries(report.actionSummaries.highValueWeakActions)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push('');
  lines.push('## Top Samples');
  lines.push('');
  lines.push('### visible_broken');
  lines.push(...renderSampleList(report.samples.visibleBrokenTop));
  lines.push('');
  lines.push('### high_value_weak');
  lines.push(...renderSampleList(report.samples.highValueWeakTop));
  lines.push('');
  lines.push('### downgrade_only');
  lines.push(...renderSampleList(report.samples.downgradeOnlyTop));
  lines.push('');
  lines.push('### decision_recalc');
  lines.push(...renderSampleList(report.samples.decisionRecalcTop));

  return `${lines.join('\n').trim()}\n`;
}

function buildBucketSummary(
  maps: RepositoryEvidenceMap[],
  priorityByRepoId: Map<string, HistoricalRepairPriorityItem>,
  bucket: HistoricalRepairBucket,
): EvidenceMapCoverageBucketSummary {
  const scoped = maps.filter(
    (item) => priorityByRepoId.get(item.repoId)?.historicalRepairBucket === bucket,
  );
  const breakdown = buildStatusBreakdown(scoped);
  return {
    sampledCount: scoped.length,
    statusBreakdown: breakdown,
    mostMissingDimensions: sortDimensionCounts(
      pickStatusCounts(breakdown, 'missing'),
    ),
    mostWeakDimensions: sortDimensionCounts(pickStatusCounts(breakdown, 'weak')),
    mostConflictDimensions: sortDimensionCounts(
      pickStatusCounts(breakdown, 'conflict'),
    ),
  };
}

function buildStatusBreakdown(maps: RepositoryEvidenceMap[]) {
  const breakdown = Object.fromEntries(
    EVIDENCE_MAP_DIMENSIONS.map((dimension) => [
      dimension,
      {
        present: 0,
        weak: 0,
        missing: 0,
        conflict: 0,
      },
    ]),
  ) as Record<EvidenceMapDimension, Record<EvidenceMapNodeStatus, number>>;

  for (const map of maps) {
    for (const dimension of EVIDENCE_MAP_DIMENSIONS) {
      const status = map.evidence[dimension].status;
      breakdown[dimension][status] += 1;
    }
  }

  return breakdown;
}

function pickStatusCounts(
  breakdown: Record<EvidenceMapDimension, Record<EvidenceMapNodeStatus, number>>,
  status: EvidenceMapNodeStatus,
) {
  return EVIDENCE_MAP_DIMENSIONS.map((dimension) => ({
    dimension,
    count: breakdown[dimension][status],
  }));
}

function sortDimensionCounts(
  values: Array<{ dimension: EvidenceMapDimension; count: number }>,
) {
  return values
    .slice()
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function takeTopBucketItems(
  items: HistoricalRepairPriorityItem[],
  bucket: HistoricalRepairBucket,
  limit: number,
) {
  return items
    .filter((item) => item.historicalRepairBucket === bucket)
    .slice()
    .sort(
      (left, right) =>
        right.historicalRepairPriorityScore - left.historicalRepairPriorityScore,
    )
    .slice(0, limit);
}

function takeDeterministicBucketSample(
  items: HistoricalRepairPriorityItem[],
  bucket: HistoricalRepairBucket,
  limit: number,
) {
  return items
    .filter((item) => item.historicalRepairBucket === bucket)
    .slice()
    .sort((left, right) => stableHash(left.repoId) - stableHash(right.repoId))
    .slice(0, limit);
}

function pickTopByAction(
  items: HistoricalRepairPriorityItem[],
  action: HistoricalRepairRecommendedAction,
  limit: number,
) {
  return items
    .filter((item) => item.historicalRepairAction === action)
    .slice()
    .sort(
      (left, right) =>
        right.historicalRepairPriorityScore - left.historicalRepairPriorityScore,
    )
    .slice(0, limit);
}

function summarizeEvidenceSamples(
  items: HistoricalRepairPriorityItem[],
  evidenceByRepoId: Map<string, RepositoryEvidenceMap>,
): EvidenceSampleSummary[] {
  return items
    .map((item) => {
      const evidence = evidenceByRepoId.get(item.repoId);
      if (!evidence) {
        return null;
      }

      return {
        repoId: item.repoId,
        fullName: item.fullName,
        bucket: item.historicalRepairBucket,
        action: item.historicalRepairAction,
        priorityScore: item.historicalRepairPriorityScore,
        weakestDimensions: evidence.summary.weakestDimensions,
        conflictDimensions: EVIDENCE_MAP_DIMENSIONS.filter(
          (dimension) => evidence.evidence[dimension].status === 'conflict',
        ),
        missingDimensions: EVIDENCE_MAP_DIMENSIONS.filter(
          (dimension) => evidence.evidence[dimension].status === 'missing',
        ),
      } satisfies EvidenceSampleSummary;
    })
    .filter((item): item is EvidenceSampleSummary => Boolean(item));
}

function countActions(items: HistoricalRepairPriorityItem[]) {
  return {
    downgrade_only: countWhere(items, (item) => item.historicalRepairAction === 'downgrade_only'),
    refresh_only: countWhere(items, (item) => item.historicalRepairAction === 'refresh_only'),
    evidence_repair: countWhere(items, (item) => item.historicalRepairAction === 'evidence_repair'),
    deep_repair: countWhere(items, (item) => item.historicalRepairAction === 'deep_repair'),
    decision_recalc: countWhere(items, (item) => item.historicalRepairAction === 'decision_recalc'),
    archive: countWhere(items, (item) => item.historicalRepairAction === 'archive'),
  } satisfies Record<HistoricalRepairRecommendedAction, number>;
}

function renderSampleList(items: EvidenceSampleSummary[]) {
  if (!items.length) {
    return ['- 无'];
  }

  return items.map(
    (item) =>
      `- ${item.fullName} | bucket=${item.bucket} | action=${item.action} | score=${item.priorityScore} | missing=${item.missingDimensions.join(', ') || 'none'} | conflict=${item.conflictDimensions.join(', ') || 'none'}`,
  );
}

function formatDimensionCounts(
  values: Array<{ dimension: EvidenceMapDimension; count: number }>,
) {
  return values
    .filter((item) => item.count > 0)
    .slice(0, 4)
    .map((item) => `${item.dimension}(${item.count})`)
    .join(' / ') || '无';
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
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
