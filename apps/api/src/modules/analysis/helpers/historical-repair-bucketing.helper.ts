import {
  type HistoricalDataInventoryItem,
  type HistoricalDataInventoryReport,
  type HistoricalInventoryValueTier,
} from './historical-data-inventory.helper';

export type HistoricalRepairBucket =
  | 'visible_broken'
  | 'high_value_weak'
  | 'stale_watch'
  | 'archive_or_noise';

export type HistoricalRepairRecommendedAction =
  | 'downgrade_only'
  | 'refresh_only'
  | 'evidence_repair'
  | 'deep_repair'
  | 'decision_recalc'
  | 'archive';

export type HistoricalRepairPriorityLabel =
  | 'P0_VISIBLE_BROKEN'
  | 'P1_HIGH_VALUE_WEAK'
  | 'P2_STALE_WATCH'
  | 'P3_ARCHIVE_OR_NOISE';

export type HistoricalRepairDowngradeSeverity =
  | 'URGENT'
  | 'CONSERVATIVE'
  | 'NONE';

export type HistoricalRepairVisibilityLevel =
  | 'HOME'
  | 'FAVORITES'
  | 'DAILY_SUMMARY'
  | 'TELEGRAM'
  | 'DETAIL_ONLY'
  | 'BACKGROUND';

export type HistoricalRepairBucketingThresholds = {
  weakQualityScore: number;
  archiveFreshnessDays: number;
};

export type HistoricalRepairBucketedItem = HistoricalDataInventoryItem & {
  strictVisibilityLevel: HistoricalRepairVisibilityLevel;
  isStrictlyVisibleToUsers: boolean;
  isDetailOnlyExposure: boolean;
  frontendDowngradeSeverity: HistoricalRepairDowngradeSeverity;
  historicalRepairBucket: HistoricalRepairBucket;
  historicalRepairReason: string;
  historicalRepairPriorityLabel: HistoricalRepairPriorityLabel;
  historicalRepairRecommendedAction: HistoricalRepairRecommendedAction;
  historicalRepairSignals: string[];
};

type BucketSummary = {
  count: number;
  highValueCount: number;
  strictVisibleCount: number;
  fallbackCount: number;
  conflictCount: number;
  incompleteCount: number;
  fallbackRate: number;
  conflictRate: number;
  incompleteRate: number;
  finalDecisionButNoDeepCount: number;
  urgentDowngradeCount: number;
  conservativeDowngradeCount: number;
  recommendedActionCounts: Record<HistoricalRepairRecommendedAction, number>;
};

export type HistoricalRepairBucketingReport = {
  generatedAt: string;
  inventoryGeneratedAt: string;
  thresholds: HistoricalRepairBucketingThresholds;
  summary: {
    totalRepos: number;
    buckets: Record<HistoricalRepairBucket, BucketSummary>;
    keyAnswers: {
      visibleBrokenCount: number;
      highValueWeakCount: number;
      staleWatchCount: number;
      archiveOrNoiseCount: number;
      visibleBrokenFinalDecisionButNoDeepCount: number;
      highValueWeakHighMoneyWeakQualityCount: number;
    };
    visibilityAudit: {
      currentLogic: {
        isVisibleOnHome: string;
        isVisibleOnFavorites: string;
        hasDetailPageExposure: string;
      };
      counts: {
        homeVisibleCount: number;
        favoritesVisibleCount: number;
        dailySummaryVisibleCount: number;
        telegramVisibleCount: number;
        detailExposureCount: number;
        strictVisibleCount: number;
        detailOnlyExposureCount: number;
      };
      isOverBroad: boolean;
      note: string;
    };
    frontendDowngradeAudit: {
      totalCount: number;
      totalRate: number;
      urgentCount: number;
      conservativeCount: number;
      isOverBroad: boolean;
      note: string;
    };
    analysisQualityAudit: {
      lowQualityCount: number;
      weakQualityCount: number;
      isTemporaryHeuristic: boolean;
      note: string;
    };
  };
  samples: Record<HistoricalRepairBucket, HistoricalRepairBucketedItem[]>;
  items: HistoricalRepairBucketedItem[];
};

export function defaultHistoricalRepairBucketingThresholds(): HistoricalRepairBucketingThresholds {
  return {
    weakQualityScore: 55,
    archiveFreshnessDays: 90,
  };
}

export function evaluateHistoricalRepairBucket(args: {
  item: HistoricalDataInventoryItem;
  thresholds?: Partial<HistoricalRepairBucketingThresholds>;
}): HistoricalRepairBucketedItem {
  const thresholds = {
    ...defaultHistoricalRepairBucketingThresholds(),
    ...args.thresholds,
  };
  const item = args.item;
  const strictVisibilityLevel = resolveVisibilityLevel(item);
  const isStrictlyVisibleToUsers = strictVisibilityLevel !== 'DETAIL_ONLY' &&
    strictVisibilityLevel !== 'BACKGROUND';
  const isDetailOnlyExposure =
    !isStrictlyVisibleToUsers && item.hasDetailPageExposure;
  const weakQuality = isWeakQuality(item, thresholds.weakQualityScore);
  const urgentFrontendDowngrade = Boolean(
    isStrictlyVisibleToUsers &&
      (item.hasFinalDecision && !item.hasDeep ||
        item.fallbackFlag ||
        item.conflictFlag ||
        item.incompleteFlag ||
        item.homepageUnsafe),
  );
  const conservativeFrontendDowngrade = Boolean(
    item.needsFrontendDowngrade && !urgentFrontendDowngrade,
  );
  const visibleBrokenSignals = collectVisibleBrokenSignals(item, weakQuality);
  const highValueSignals = collectHighValueSignals(item, weakQuality);
  const staleWatchSignals = collectStaleWatchSignals(item, thresholds);
  const archiveCandidate = isArchiveCandidate(item, thresholds);

  let historicalRepairBucket: HistoricalRepairBucket = 'archive_or_noise';
  if (isStrictlyVisibleToUsers && visibleBrokenSignals.length > 0) {
    historicalRepairBucket = 'visible_broken';
  } else if (highValueSignals.length > 0) {
    historicalRepairBucket = 'high_value_weak';
  } else if (archiveCandidate) {
    historicalRepairBucket = 'archive_or_noise';
  } else {
    historicalRepairBucket = 'stale_watch';
  }

  const historicalRepairSignals =
    historicalRepairBucket === 'visible_broken'
        ? visibleBrokenSignals
        : historicalRepairBucket === 'high_value_weak'
          ? highValueSignals
          : historicalRepairBucket === 'stale_watch'
          ? staleWatchSignals.length
            ? staleWatchSignals
            : ['watch_keep_alive']
          : collectArchiveSignals(item, thresholds);

  const historicalRepairPriorityLabel = toPriorityLabel(historicalRepairBucket);
  const historicalRepairRecommendedAction = pickRecommendedAction({
    item,
    bucket: historicalRepairBucket,
    urgentFrontendDowngrade,
  });
  const historicalRepairReason = renderHistoricalRepairReason({
    bucket: historicalRepairBucket,
    visibilityLevel: strictVisibilityLevel,
    signals: historicalRepairSignals,
    downgradeSeverity: urgentFrontendDowngrade
      ? 'URGENT'
      : conservativeFrontendDowngrade
        ? 'CONSERVATIVE'
        : 'NONE',
  });

  return {
    ...item,
    strictVisibilityLevel,
    isStrictlyVisibleToUsers,
    isDetailOnlyExposure,
    frontendDowngradeSeverity: urgentFrontendDowngrade
      ? 'URGENT'
      : conservativeFrontendDowngrade
        ? 'CONSERVATIVE'
        : 'NONE',
    historicalRepairBucket,
    historicalRepairReason,
    historicalRepairPriorityLabel,
    historicalRepairRecommendedAction,
    historicalRepairSignals,
  };
}

export function buildHistoricalRepairBucketingReport(args: {
  inventoryReport: HistoricalDataInventoryReport;
  items: HistoricalRepairBucketedItem[];
  thresholds?: Partial<HistoricalRepairBucketingThresholds>;
}): HistoricalRepairBucketingReport {
  const thresholds = {
    ...defaultHistoricalRepairBucketingThresholds(),
    ...args.thresholds,
  };
  const items = args.items;
  const buckets = {
    visible_broken: createBucketSummary(),
    high_value_weak: createBucketSummary(),
    stale_watch: createBucketSummary(),
    archive_or_noise: createBucketSummary(),
  } as Record<HistoricalRepairBucket, BucketSummary>;

  for (const item of items) {
    const summary = buckets[item.historicalRepairBucket];
    summary.count += 1;
    summary.highValueCount += isHighValueItem(item) ? 1 : 0;
    summary.strictVisibleCount += item.isStrictlyVisibleToUsers ? 1 : 0;
    summary.fallbackCount += item.fallbackFlag ? 1 : 0;
    summary.conflictCount += item.conflictFlag ? 1 : 0;
    summary.incompleteCount += item.incompleteFlag ? 1 : 0;
    summary.finalDecisionButNoDeepCount +=
      item.hasFinalDecision && !item.hasDeep ? 1 : 0;
    summary.urgentDowngradeCount +=
      item.frontendDowngradeSeverity === 'URGENT' ? 1 : 0;
    summary.conservativeDowngradeCount +=
      item.frontendDowngradeSeverity === 'CONSERVATIVE' ? 1 : 0;
    summary.recommendedActionCounts[item.historicalRepairRecommendedAction] += 1;
  }

  for (const summary of Object.values(buckets)) {
    summary.fallbackRate = roundRatio(summary.fallbackCount / Math.max(1, summary.count));
    summary.conflictRate = roundRatio(summary.conflictCount / Math.max(1, summary.count));
    summary.incompleteRate = roundRatio(
      summary.incompleteCount / Math.max(1, summary.count),
    );
  }

  const strictVisibleCount = countWhere(
    items,
    (item) => item.isStrictlyVisibleToUsers,
  );
  const detailOnlyExposureCount = countWhere(
    items,
    (item) => item.isDetailOnlyExposure,
  );
  const totalFrontendDowngrade = countWhere(
    items,
    (item) => item.needsFrontendDowngrade,
  );
  const urgentFrontendDowngrade = countWhere(
    items,
    (item) => item.frontendDowngradeSeverity === 'URGENT',
  );
  const conservativeFrontendDowngrade = countWhere(
    items,
    (item) => item.frontendDowngradeSeverity === 'CONSERVATIVE',
  );

  const summary = {
    totalRepos: items.length,
    buckets,
    keyAnswers: {
      visibleBrokenCount: buckets.visible_broken.count,
      highValueWeakCount: buckets.high_value_weak.count,
      staleWatchCount: buckets.stale_watch.count,
      archiveOrNoiseCount: buckets.archive_or_noise.count,
      visibleBrokenFinalDecisionButNoDeepCount:
        buckets.visible_broken.finalDecisionButNoDeepCount,
      highValueWeakHighMoneyWeakQualityCount: countWhere(
        items,
        (item) =>
          item.historicalRepairBucket === 'high_value_weak' &&
          (item.moneyPriority === 'P0' || item.moneyPriority === 'P1') &&
          item.analysisQualityState !== 'HIGH',
      ),
    },
    visibilityAudit: {
      currentLogic: {
        isVisibleOnHome:
          '最近 14 天 daily radar 首页榜单中出现过的 repo。',
        isVisibleOnFavorites: 'repository.isFavorited = true。',
        hasDetailPageExposure:
          '当前口径 = displayReady 或 首页/收藏/日报/Telegram 曝光；不是“仅有详情页路由”就算，但因为 displayReady 过宽，结果上几乎等于全库都算 detail exposure。',
      },
      counts: {
        homeVisibleCount: args.inventoryReport.summary.exposure.homeVisibleCount,
        favoritesVisibleCount:
          args.inventoryReport.summary.exposure.favoritesVisibleCount,
        dailySummaryVisibleCount:
          args.inventoryReport.summary.exposure.dailySummaryVisibleCount,
        telegramVisibleCount:
          args.inventoryReport.summary.exposure.telegramVisibleCount,
        detailExposureCount:
          args.inventoryReport.summary.exposure.detailExposureCount,
        strictVisibleCount,
        detailOnlyExposureCount,
      },
      isOverBroad:
        args.inventoryReport.summary.exposure.detailExposureCount >
        strictVisibleCount * 10,
      note:
        detailOnlyExposureCount > strictVisibleCount
          ? '当前 detail exposure 远大于真正进入用户视野的 repo。分桶时已收紧为 home / favorites / daily summary / telegram 四类严格曝光。'
          : '当前 detail exposure 与真实前台曝光接近，可直接复用。',
    },
    frontendDowngradeAudit: {
      totalCount: totalFrontendDowngrade,
      totalRate: roundRatio(totalFrontendDowngrade / Math.max(1, items.length)),
      urgentCount: urgentFrontendDowngrade,
      conservativeCount: conservativeFrontendDowngrade,
      isOverBroad:
        totalFrontendDowngrade >
        Math.max(urgentFrontendDowngrade * 3, strictVisibleCount * 2),
      note:
        totalFrontendDowngrade > strictVisibleCount
          ? 'needsFrontendDowngrade 当前覆盖面过宽。分桶时已拆成 URGENT（真实前台可见且存在明显污染风险）与 CONSERVATIVE（保守降级但不抢 P0 修复）。'
          : 'needsFrontendDowngrade 仍保有区分度，可直接作为 visible_broken 入口信号。',
    },
    analysisQualityAudit: {
      lowQualityCount: countWhere(
        items,
        (item) =>
          item.analysisQualityState === 'LOW' ||
          item.analysisQualityState === 'CRITICAL',
      ),
      weakQualityCount: countWhere(
        items,
        (item) => isWeakQuality(item, thresholds.weakQualityScore),
      ),
      isTemporaryHeuristic: false,
      note:
        'analysisQualityScore 现在是 evidence-backed 的质量总线；bucket 判定仍必须同时看 deep、evidence、visibility、value 与 fallback/conflict/incomplete，不能只看 score。',
    },
  };

  return {
    generatedAt: new Date().toISOString(),
    inventoryGeneratedAt: args.inventoryReport.generatedAt,
    thresholds,
    summary,
    samples: {
      visible_broken: pickBucketSamples(items, 'visible_broken'),
      high_value_weak: pickBucketSamples(items, 'high_value_weak'),
      stale_watch: pickBucketSamples(items, 'stale_watch'),
      archive_or_noise: pickBucketSamples(items, 'archive_or_noise'),
    },
    items,
  };
}

export function renderHistoricalRepairBucketingMarkdown(
  report: HistoricalRepairBucketingReport,
) {
  const lines = [
    '# GitDian 历史数据分层报告',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- inventoryGeneratedAt: ${report.inventoryGeneratedAt}`,
    `- weakQualityScore: ${report.thresholds.weakQualityScore}`,
    `- archiveFreshnessDays: ${report.thresholds.archiveFreshnessDays}`,
    '',
    '## 4 个 repair bucket 定义',
    '',
    '1. visible_broken：真实会进入用户视野（首页 / 收藏 / 日报 / Telegram），且存在假完成、fallback/conflict/incomplete、弱质量或必须立刻前台降级的问题。',
    '2. high_value_weak：高价值 repo 但 deep / evidence / quality 偏弱；不一定已高曝光，但值得优先补修。',
    '3. stale_watch：仍有观察价值，但当前更像 watchlist 维护对象；通常是中价值、证据偏旧或判断偏弱，不应抢 visible_broken / high_value_weak 的修复资源。',
    '4. archive_or_noise：低价值、低曝光、低修复 ROI 的长尾库存，应优先归档或只保留最保守降级。',
    '',
    '## Bucket 数量',
    '',
    `- visible_broken: ${report.summary.keyAnswers.visibleBrokenCount}`,
    `- high_value_weak: ${report.summary.keyAnswers.highValueWeakCount}`,
    `- stale_watch: ${report.summary.keyAnswers.staleWatchCount}`,
    `- archive_or_noise: ${report.summary.keyAnswers.archiveOrNoiseCount}`,
    '',
    '## 回答核心问题',
    '',
    `- visible_broken 数量：${report.summary.keyAnswers.visibleBrokenCount}`,
    `- high_value_weak 数量：${report.summary.keyAnswers.highValueWeakCount}`,
    `- stale_watch 数量：${report.summary.keyAnswers.staleWatchCount}`,
    `- archive_or_noise 数量：${report.summary.keyAnswers.archiveOrNoiseCount}`,
    `- visible_broken 里 hasFinalDecision && !hasDeep：${report.summary.keyAnswers.visibleBrokenFinalDecisionButNoDeepCount}`,
    `- high_value_weak 里 moneyPriority 高 + analysisQuality 弱：${report.summary.keyAnswers.highValueWeakHighMoneyWeakQualityCount}`,
    '',
    '## 每个 bucket 的统计',
    '',
    ...renderBucketSummaryLines(report),
    '',
    '## 3 个特别口径检查',
    '',
    `- isVisibleOnHome：${report.summary.visibilityAudit.currentLogic.isVisibleOnHome}`,
    `- isVisibleOnFavorites：${report.summary.visibilityAudit.currentLogic.isVisibleOnFavorites}`,
    `- hasDetailPageExposure：${report.summary.visibilityAudit.currentLogic.hasDetailPageExposure}`,
    `- 当前 visibility 是否过宽：${report.summary.visibilityAudit.isOverBroad ? '是' : '否'}`,
    `- visibility note：${report.summary.visibilityAudit.note}`,
    `- needsFrontendDowngrade 占全库：${report.summary.frontendDowngradeAudit.totalCount}/${report.summary.totalRepos} (${formatPercent(report.summary.frontendDowngradeAudit.totalRate)})`,
    `- needsFrontendDowngrade 是否过宽：${report.summary.frontendDowngradeAudit.isOverBroad ? '是' : '否'}`,
    `- needsFrontendDowngrade note：${report.summary.frontendDowngradeAudit.note}`,
    `- analysisQualityScore 是否临时估算：${report.summary.analysisQualityAudit.isTemporaryHeuristic ? '是' : '否'}`,
    `- analysisQualityScore note：${report.summary.analysisQualityAudit.note}`,
    '',
    '## 各 bucket 样本',
    '',
    '### visible_broken',
    ...renderBucketSamples(report.samples.visible_broken),
    '',
    '### high_value_weak',
    ...renderBucketSamples(report.samples.high_value_weak),
    '',
    '### stale_watch',
    ...renderBucketSamples(report.samples.stale_watch),
    '',
    '### archive_or_noise',
    ...renderBucketSamples(report.samples.archive_or_noise),
  ];

  return lines.join('\n');
}

function renderBucketSummaryLines(report: HistoricalRepairBucketingReport) {
  return (
    Object.entries(report.summary.buckets) as Array<
      [HistoricalRepairBucket, BucketSummary]
    >
  ).flatMap(([bucket, summary]) => [
    `### ${bucket}`,
    `- count: ${summary.count}`,
    `- highValueCount: ${summary.highValueCount}`,
    `- strictVisibleCount: ${summary.strictVisibleCount}`,
    `- fallback / conflict / incomplete: ${summary.fallbackCount} / ${summary.conflictCount} / ${summary.incompleteCount}`,
    `- fallback / conflict / incomplete rate: ${formatPercent(summary.fallbackRate)} / ${formatPercent(summary.conflictRate)} / ${formatPercent(summary.incompleteRate)}`,
    `- hasFinalDecision && !hasDeep: ${summary.finalDecisionButNoDeepCount}`,
    `- urgent / conservative downgrade: ${summary.urgentDowngradeCount} / ${summary.conservativeDowngradeCount}`,
    `- recommendedActionCounts: deep=${summary.recommendedActionCounts.deep_repair}, evidence=${summary.recommendedActionCounts.evidence_repair}, recalc=${summary.recommendedActionCounts.decision_recalc}, refresh=${summary.recommendedActionCounts.refresh_only}, downgrade=${summary.recommendedActionCounts.downgrade_only}, archive=${summary.recommendedActionCounts.archive}`,
    '',
  ]);
}

function renderBucketSamples(items: HistoricalRepairBucketedItem[]) {
  if (!items.length) {
    return ['- 无'];
  }

  return items.map(
    (item) =>
      `- ${item.fullName} | visibility=${item.strictVisibilityLevel} | value=${item.repositoryValueTier}/${item.moneyPriority ?? 'NONE'} | quality=${item.analysisQualityScore}(${item.analysisQualityState}) | action=${item.historicalRepairRecommendedAction} | reason=${item.historicalRepairReason}`,
  );
}

function resolveVisibilityLevel(
  item: HistoricalDataInventoryItem,
): HistoricalRepairVisibilityLevel {
  if (item.isVisibleOnHome) {
    return 'HOME';
  }
  if (item.isVisibleOnFavorites) {
    return 'FAVORITES';
  }
  if (item.appearedInDailySummary) {
    return 'DAILY_SUMMARY';
  }
  if (item.appearedInTelegram) {
    return 'TELEGRAM';
  }
  if (item.hasDetailPageExposure) {
    return 'DETAIL_ONLY';
  }
  return 'BACKGROUND';
}

function isWeakQuality(item: HistoricalDataInventoryItem, weakQualityScore: number) {
  return Boolean(
    item.analysisQualityState === 'LOW' ||
      item.analysisQualityState === 'CRITICAL' ||
      item.analysisQualityScore < weakQualityScore,
  );
}

function collectVisibleBrokenSignals(
  item: HistoricalDataInventoryItem,
  weakQuality: boolean,
) {
  const signals: string[] = [];
  if (item.hasFinalDecision && !item.hasDeep) {
    signals.push('fake_completion_no_deep');
  }
  if (item.fallbackFlag) {
    signals.push('fallback_visible');
  }
  if (item.conflictFlag) {
    signals.push('conflict_visible');
  }
  if (item.incompleteFlag) {
    signals.push('incomplete_visible');
  }
  if (weakQuality) {
    signals.push('weak_quality_visible');
  }
  if (item.homepageUnsafe) {
    signals.push('homepage_unsafe');
  }
  if (item.needsFreshnessRefresh) {
    signals.push('stale_visible');
  }
  return takeUnique(signals);
}

function collectHighValueSignals(
  item: HistoricalDataInventoryItem,
  weakQuality: boolean,
) {
  if (!isHighValueItem(item)) {
    return [] as string[];
  }

  const signals: string[] = [];
  if (item.hasFinalDecision && !item.hasDeep) {
    signals.push('high_value_no_deep');
  }
  if (item.needsEvidenceRepair) {
    signals.push('high_value_weak_evidence');
  }
  if (weakQuality) {
    signals.push('high_value_weak_quality');
  }
  if (item.fallbackFlag || item.conflictFlag || item.needsDecisionRecalc) {
    signals.push('high_value_decision_unstable');
  }
  if (item.needsFreshnessRefresh) {
    signals.push('high_value_stale');
  }
  return takeUnique(signals);
}

function collectStaleWatchSignals(
  item: HistoricalDataInventoryItem,
  thresholds: HistoricalRepairBucketingThresholds,
) {
  const weakQuality = isWeakQuality(item, thresholds.weakQualityScore);
  const watchable = Boolean(
    item.repositoryValueTier === 'MEDIUM' ||
      item.collectionTier !== 'LONG_TAIL' ||
      item.moneyPriority === 'P2',
  );
  if (!watchable) {
    return [] as string[];
  }

  const signals: string[] = [];
  if (item.needsFreshnessRefresh) {
    signals.push('watch_stale');
  }
  if (item.needsEvidenceRepair) {
    signals.push('watch_evidence_gap');
  }
  if (weakQuality) {
    signals.push('watch_weak_quality');
  }
  if (item.needsDecisionRecalc) {
    signals.push('watch_decision_recalc');
  }
  return takeUnique(signals);
}

function collectArchiveSignals(
  item: HistoricalDataInventoryItem,
  thresholds: HistoricalRepairBucketingThresholds,
) {
  const signals: string[] = [];
  if (item.repositoryValueTier === 'LOW') {
    signals.push('low_value');
  }
  if (item.collectionTier === 'LONG_TAIL') {
    signals.push('long_tail');
  }
  if (
    item.freshnessDays !== null &&
    item.freshnessDays >= thresholds.archiveFreshnessDays
  ) {
    signals.push('very_stale');
  }
  if (!item.isUserReachable) {
    signals.push('low_exposure');
  }
  if (!signals.length) {
    signals.push('repair_roi_too_low');
  }
  return takeUnique(signals);
}

function isArchiveCandidate(
  item: HistoricalDataInventoryItem,
  thresholds: HistoricalRepairBucketingThresholds,
) {
  const veryStale = Boolean(
    item.freshnessDays !== null &&
      item.freshnessDays >= thresholds.archiveFreshnessDays,
  );
  const strictlyVisible = Boolean(
    item.isVisibleOnHome ||
      item.isVisibleOnFavorites ||
      item.appearedInDailySummary ||
      item.appearedInTelegram,
  );
  return Boolean(
    !strictlyVisible &&
      item.collectionTier === 'LONG_TAIL' &&
      item.repositoryValueTier === 'LOW' &&
      (!item.isUserReachable || veryStale || item.moneyPriority === 'P3'),
  );
}

function toPriorityLabel(
  bucket: HistoricalRepairBucket,
): HistoricalRepairPriorityLabel {
  if (bucket === 'visible_broken') {
    return 'P0_VISIBLE_BROKEN';
  }
  if (bucket === 'high_value_weak') {
    return 'P1_HIGH_VALUE_WEAK';
  }
  if (bucket === 'stale_watch') {
    return 'P2_STALE_WATCH';
  }
  return 'P3_ARCHIVE_OR_NOISE';
}

function pickRecommendedAction(args: {
  item: HistoricalDataInventoryItem;
  bucket: HistoricalRepairBucket;
  urgentFrontendDowngrade: boolean;
}): HistoricalRepairRecommendedAction {
  if (args.bucket === 'archive_or_noise') {
    return 'archive';
  }

  if (args.item.hasFinalDecision && !args.item.hasDeep) {
    return 'deep_repair';
  }

  if (args.item.fallbackFlag || args.item.conflictFlag || args.item.needsDecisionRecalc) {
    return 'decision_recalc';
  }

  if (args.item.needsEvidenceRepair) {
    return 'evidence_repair';
  }

  if (args.item.needsFreshnessRefresh) {
    return 'refresh_only';
  }

  if (args.urgentFrontendDowngrade || args.item.needsFrontendDowngrade) {
    return 'downgrade_only';
  }

  return args.bucket === 'stale_watch' ? 'refresh_only' : 'evidence_repair';
}

function renderHistoricalRepairReason(args: {
  bucket: HistoricalRepairBucket;
  visibilityLevel: HistoricalRepairVisibilityLevel;
  signals: string[];
  downgradeSeverity: HistoricalRepairDowngradeSeverity;
}) {
  const prefix =
    args.bucket === 'visible_broken'
      ? `真实前台可见（${args.visibilityLevel}）`
      : args.bucket === 'high_value_weak'
        ? '高价值但分析偏弱'
        : args.bucket === 'stale_watch'
          ? '仍有观察价值但不应抢 P0 修复'
          : '低价值低曝光长尾库存';
  const suffix =
    args.downgradeSeverity === 'URGENT'
      ? '；需立刻前台保守降级'
      : args.downgradeSeverity === 'CONSERVATIVE'
        ? '；建议维持保守降级'
        : '';
  return `${prefix}：${args.signals.join(', ')}${suffix}`;
}

function createBucketSummary(): BucketSummary {
  return {
    count: 0,
    highValueCount: 0,
    strictVisibleCount: 0,
    fallbackCount: 0,
    conflictCount: 0,
    incompleteCount: 0,
    fallbackRate: 0,
    conflictRate: 0,
    incompleteRate: 0,
    finalDecisionButNoDeepCount: 0,
    urgentDowngradeCount: 0,
    conservativeDowngradeCount: 0,
    recommendedActionCounts: {
      downgrade_only: 0,
      refresh_only: 0,
      evidence_repair: 0,
      deep_repair: 0,
      decision_recalc: 0,
      archive: 0,
    },
  };
}

function pickBucketSamples(
  items: HistoricalRepairBucketedItem[],
  bucket: HistoricalRepairBucket,
  limit = 10,
) {
  return items
    .filter((item) => item.historicalRepairBucket === bucket)
    .sort((left, right) => {
      const visibilityRankDiff =
        visibilityRank(right.strictVisibilityLevel) -
        visibilityRank(left.strictVisibilityLevel);
      if (visibilityRankDiff !== 0) {
        return visibilityRankDiff;
      }
      const valueRankDiff =
        valueTierRank(right.repositoryValueTier) -
        valueTierRank(left.repositoryValueTier);
      if (valueRankDiff !== 0) {
        return valueRankDiff;
      }
      return left.analysisQualityScore - right.analysisQualityScore;
    })
    .slice(0, limit);
}

function isHighValueItem(item: HistoricalDataInventoryItem) {
  return Boolean(
    item.repositoryValueTier === 'HIGH' ||
      item.moneyPriority === 'P0' ||
      item.moneyPriority === 'P1' ||
      item.collectionTier === 'CORE',
  );
}

function visibilityRank(level: HistoricalRepairVisibilityLevel) {
  switch (level) {
    case 'HOME':
      return 6;
    case 'FAVORITES':
      return 5;
    case 'DAILY_SUMMARY':
      return 4;
    case 'TELEGRAM':
      return 3;
    case 'DETAIL_ONLY':
      return 2;
    default:
      return 1;
  }
}

function valueTierRank(tier: HistoricalInventoryValueTier) {
  return tier === 'HIGH' ? 3 : tier === 'MEDIUM' ? 2 : 1;
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

function roundRatio(value: number) {
  return Number.isFinite(value)
    ? Number.parseFloat(value.toFixed(4))
    : 0;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function takeUnique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}
