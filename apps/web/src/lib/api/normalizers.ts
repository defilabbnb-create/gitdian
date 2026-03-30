import {
  MoneyDecision,
  RadarDailySummaryItem,
  RadarDailySummaryRecord,
  RepositoryDecisionSource,
  RepositoryFinalDecisionDisplaySummaryRecord,
  RepositoryFinalDecisionRecord,
  RepositoryFounderPriority,
  RepositoryInsightAction,
  RepositoryInsightVerdict,
  RepositoryListItem,
  RepositoryTrainingAssetRecord,
} from '@/lib/types/repository';

function cleanText(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return '';
}

function inferMoneyDecision(
  priority: RepositoryFounderPriority,
  action: RepositoryInsightAction,
): MoneyDecision {
  switch (priority) {
    case 'P0':
      return 'MUST_BUILD';
    case 'P1':
      return 'HIGH_VALUE';
    case 'P2':
      return 'CLONEABLE';
    case 'P3':
    default:
      return action === 'IGNORE' ? 'IGNORE' : 'LOW_VALUE';
  }
}

function normalizeFounderPriority(
  value?: RepositoryFounderPriority | null,
): RepositoryFounderPriority {
  return value === 'P0' || value === 'P1' || value === 'P2' ? value : 'P3';
}

function normalizeMoneyDecision(
  value?: MoneyDecision | null,
): MoneyDecision {
  switch (value) {
    case 'MUST_BUILD':
      return 'MUST_BUILD';
    case 'HIGH_VALUE':
    case 'BUILDABLE':
      return 'HIGH_VALUE';
    case 'CLONEABLE':
    case 'CLONE_ONLY':
      return 'CLONEABLE';
    case 'LOW_VALUE':
    case 'NOT_WORTH':
      return 'LOW_VALUE';
    case 'IGNORE':
    default:
      return 'IGNORE';
  }
}

function founderPriorityLabel(priority: RepositoryFounderPriority) {
  switch (priority) {
    case 'P0':
      return 'P0 · 能赚钱';
    case 'P1':
      return 'P1 · 值得做';
    case 'P2':
      return 'P2 · 值得借鉴';
    case 'P3':
    default:
      return 'P3 · 低优先';
  }
}

function verdictLabel(verdict: RepositoryInsightVerdict) {
  switch (verdict) {
    case 'GOOD':
      return '值得重点看';
    case 'OK':
      return '可继续看';
    case 'BAD':
    default:
      return '不建议投入';
  }
}

function actionLabel(action: RepositoryInsightAction) {
  switch (action) {
    case 'BUILD':
      return '做';
    case 'CLONE':
      return '抄';
    case 'IGNORE':
    default:
      return '忽略';
  }
}

function judgementLabel(action: RepositoryInsightAction) {
  switch (action) {
    case 'BUILD':
      return '值得做';
    case 'CLONE':
      return '值得借鉴';
    case 'IGNORE':
    default:
      return '跳过';
  }
}

function worthDoingLabel(moneyDecision: MoneyDecision) {
  switch (moneyDecision) {
    case 'MUST_BUILD':
    case 'HIGH_VALUE':
      return '值得你优先投入';
    case 'CLONEABLE':
      return '更适合借鉴后重做';
    case 'LOW_VALUE':
      return '先观察，不要急着做';
    case 'IGNORE':
    default:
      return '现在直接跳过';
  }
}

function sourceLabel(source?: RepositoryDecisionSource | null) {
  switch (source) {
    case 'manual':
      return '人工判断';
    case 'claude':
      return '历史复核';
    case 'local':
      return '主分析';
    case 'fallback':
    default:
      return '兜底判断';
  }
}

function safeDecisionSummary(
  summary: RepositoryFinalDecisionDisplaySummaryRecord | null | undefined,
  fallback: RepositoryFinalDecisionDisplaySummaryRecord,
): RepositoryFinalDecisionDisplaySummaryRecord {
  return {
    headlineZh: cleanText(summary?.headlineZh, fallback.headlineZh),
    judgementLabelZh: cleanText(
      summary?.judgementLabelZh,
      fallback.judgementLabelZh,
    ),
    verdictLabelZh: cleanText(summary?.verdictLabelZh, fallback.verdictLabelZh),
    actionLabelZh: cleanText(summary?.actionLabelZh, fallback.actionLabelZh),
    finalDecisionLabelZh: cleanText(
      summary?.finalDecisionLabelZh,
      fallback.finalDecisionLabelZh,
    ),
    moneyPriorityLabelZh: cleanText(
      summary?.moneyPriorityLabelZh,
      fallback.moneyPriorityLabelZh,
    ),
    categoryLabelZh: cleanText(
      summary?.categoryLabelZh,
      fallback.categoryLabelZh,
    ),
    recommendedMoveZh: cleanText(
      summary?.recommendedMoveZh,
      fallback.recommendedMoveZh,
    ),
    worthDoingLabelZh: cleanText(
      summary?.worthDoingLabelZh,
      fallback.worthDoingLabelZh,
    ),
    reasonZh: cleanText(summary?.reasonZh, fallback.reasonZh),
    targetUsersZh: cleanText(summary?.targetUsersZh, fallback.targetUsersZh),
    monetizationSummaryZh: cleanText(
      summary?.monetizationSummaryZh,
      fallback.monetizationSummaryZh,
    ),
    sourceLabelZh: cleanText(summary?.sourceLabelZh, fallback.sourceLabelZh),
  };
}

function normalizeTrainingAsset(
  trainingAsset?: RepositoryTrainingAssetRecord | null,
): RepositoryTrainingAssetRecord | null | undefined {
  if (!trainingAsset) {
    return trainingAsset;
  }

  return {
    ...trainingAsset,
    mistakeTypes: Array.isArray(trainingAsset.mistakeTypes)
      ? trainingAsset.mistakeTypes
      : [],
    suggestions: Array.isArray(trainingAsset.suggestions)
      ? trainingAsset.suggestions
      : [],
    diffTypes: Array.isArray(trainingAsset.diffTypes)
      ? trainingAsset.diffTypes
      : [],
    auditProblemTypes: Array.isArray(trainingAsset.auditProblemTypes)
      ? trainingAsset.auditProblemTypes
      : [],
    auditSuggestions: Array.isArray(trainingAsset.auditSuggestions)
      ? trainingAsset.auditSuggestions
      : [],
    fallbackReplayDiff: Array.isArray(trainingAsset.fallbackReplayDiff)
      ? trainingAsset.fallbackReplayDiff
      : [],
  };
}

export function normalizeFinalDecision(
  finalDecision?: RepositoryFinalDecisionRecord | null,
): RepositoryFinalDecisionRecord | null | undefined {
  if (!finalDecision) {
    return finalDecision;
  }

  const normalizedMoneyPriority = normalizeFounderPriority(
    finalDecision.moneyPriority,
  );
  const normalizedMoneyDecision = normalizeMoneyDecision(
    inferMoneyDecision(normalizedMoneyPriority, finalDecision.action),
  );
  const fallbackSummary = {
    headlineZh: cleanText(
      finalDecision.oneLinerZh,
      '这个项目还缺少清晰的一句话说明。',
    ),
    judgementLabelZh: judgementLabel(finalDecision.action),
    verdictLabelZh: verdictLabel(finalDecision.verdict),
    actionLabelZh: actionLabel(finalDecision.action),
    finalDecisionLabelZh: `${judgementLabel(finalDecision.action)} · ${actionLabel(
      finalDecision.action,
    )}`,
    moneyPriorityLabelZh: cleanText(
      finalDecision.moneyPriorityLabelZh,
      founderPriorityLabel(normalizedMoneyPriority),
    ),
    categoryLabelZh: cleanText(
      finalDecision.categoryLabelZh,
      finalDecision.category,
      '待分类',
    ),
    recommendedMoveZh: cleanText(
      finalDecision.moneyDecision?.recommendedMoveZh,
      finalDecision.action === 'BUILD'
        ? '更适合你亲自做成产品'
        : finalDecision.action === 'CLONE'
          ? '更适合借鉴思路后重做'
          : '现在先跳过',
    ),
    worthDoingLabelZh: worthDoingLabel(normalizedMoneyDecision),
    reasonZh: cleanText(
      finalDecision.reasonZh,
      finalDecision.moneyDecision?.reasonZh,
      '当前缺少足够信息，先按保守结论展示。',
    ),
    targetUsersZh: cleanText(
      finalDecision.moneyDecision?.targetUsersZh,
      '用户描述还不够清楚',
    ),
    monetizationSummaryZh: cleanText(
      finalDecision.moneyDecision?.monetizationSummaryZh,
      '收费路径还不够清楚',
    ),
    sourceLabelZh: cleanText(
      finalDecision.sourceLabelZh,
      sourceLabel(finalDecision.source),
    ),
  } satisfies RepositoryFinalDecisionDisplaySummaryRecord;

  return {
    ...finalDecision,
    moneyPriority: normalizedMoneyPriority,
    moneyPriorityLabelZh: cleanText(
      finalDecision.moneyPriorityLabelZh,
      founderPriorityLabel(normalizedMoneyPriority),
    ),
    categoryLabelZh: cleanText(
      finalDecision.categoryLabelZh,
      finalDecision.category,
      '待分类',
    ),
    reasonZh: cleanText(
      finalDecision.reasonZh,
      finalDecision.moneyDecision?.reasonZh,
      '当前缺少足够信息，先按保守结论展示。',
    ),
    sourceLabelZh: cleanText(
      finalDecision.sourceLabelZh,
      sourceLabel(finalDecision.source),
    ),
    comparison: {
      ...finalDecision.comparison,
      conflictReasons: Array.isArray(finalDecision.comparison?.conflictReasons)
        ? finalDecision.comparison.conflictReasons
        : [],
    },
    moneyDecision: {
      ...finalDecision.moneyDecision,
      score:
        typeof finalDecision.moneyDecision?.score === 'number'
          ? finalDecision.moneyDecision.score
          : 0,
      labelZh: cleanText(
        finalDecision.moneyDecision?.labelZh,
        fallbackSummary.moneyPriorityLabelZh,
      ),
      recommendedMoveZh: cleanText(
        finalDecision.moneyDecision?.recommendedMoveZh,
        fallbackSummary.recommendedMoveZh,
      ),
      targetUsersZh: cleanText(
        finalDecision.moneyDecision?.targetUsersZh,
        fallbackSummary.targetUsersZh,
      ),
      monetizationSummaryZh: cleanText(
        finalDecision.moneyDecision?.monetizationSummaryZh,
        fallbackSummary.monetizationSummaryZh,
      ),
      reasonZh: cleanText(
        finalDecision.moneyDecision?.reasonZh,
        fallbackSummary.reasonZh,
      ),
    },
    decisionSummary: safeDecisionSummary(
      finalDecision.decisionSummary,
      fallbackSummary,
    ),
  };
}

export function normalizeRepositoryItem<T extends RepositoryListItem>(item: T): T {
  return {
    ...item,
    finalDecision: normalizeFinalDecision(item.finalDecision),
    trainingAsset: normalizeTrainingAsset(item.trainingAsset),
  };
}

function defaultSummaryCategory(
  item: RadarDailySummaryItem,
): RadarDailySummaryItem['category'] {
  return {
    main: item.category?.main ?? 'other',
    sub: item.category?.sub ?? 'other',
  };
}

function defaultItemDecisionSummary(
  item: RadarDailySummaryItem,
): RepositoryFinalDecisionDisplaySummaryRecord {
  const resolvedDecision = normalizeMoneyDecision(item.moneyDecision);

  return {
    headlineZh: cleanText(
      item.oneLinerZh,
      '这个项目还缺少清晰的一句话说明。',
    ),
    judgementLabelZh:
      resolvedDecision === 'MUST_BUILD' || resolvedDecision === 'HIGH_VALUE'
        ? '值得做'
        : resolvedDecision === 'CLONEABLE'
          ? '值得借鉴'
          : '跳过',
    verdictLabelZh: verdictLabel(item.verdict),
    actionLabelZh: actionLabel(item.action),
    finalDecisionLabelZh: `${judgementLabel(item.action)} · ${actionLabel(
      item.action,
    )}`,
    moneyPriorityLabelZh: cleanText(
      item.moneyPriorityLabelZh,
      founderPriorityLabel('P3'),
    ),
    categoryLabelZh: cleanText(item.category?.sub, item.category?.main, '待分类'),
    recommendedMoveZh: cleanText(
      item.recommendedMoveZh,
      item.action === 'BUILD'
        ? '更适合你亲自做成产品'
        : item.action === 'CLONE'
          ? '更适合借鉴思路后重做'
          : '现在先跳过',
    ),
    worthDoingLabelZh: worthDoingLabel(resolvedDecision),
    reasonZh: cleanText(
      item.moneyPriorityReasonZh,
      '当前缺少完整理由，建议先看详情再决定。',
    ),
    targetUsersZh: cleanText(item.targetUsersZh, '用户描述还不够清楚'),
    monetizationSummaryZh: cleanText(
      item.monetizationSummaryZh,
      '收费路径还不够清楚',
    ),
    sourceLabelZh: item.hasManualOverride
      ? '人工判断'
      : item.hasClaudeReview
        ? '历史复核'
        : '系统判断',
  };
}

function normalizeRadarDailySummaryItem(
  item: RadarDailySummaryItem,
): RadarDailySummaryItem {
  return {
    ...item,
    category: defaultSummaryCategory(item),
    oneLinerZh: cleanText(
      item.oneLinerZh,
      '这个项目还缺少清晰的一句话说明。',
    ),
    moneyPriorityLabelZh: cleanText(item.moneyPriorityLabelZh, 'P3 · 低优先'),
    moneyPriorityReasonZh: cleanText(
      item.moneyPriorityReasonZh,
      '当前缺少完整理由，建议点进详情再判断。',
    ),
    recommendedMoveZh: cleanText(
      item.recommendedMoveZh,
      item.action === 'BUILD'
        ? '更适合你亲自做成产品'
        : item.action === 'CLONE'
          ? '更适合借鉴思路后重做'
          : '现在先跳过',
    ),
    targetUsersZh: cleanText(item.targetUsersZh, '用户描述还不够清楚'),
    monetizationSummaryZh: cleanText(
      item.monetizationSummaryZh,
      '收费路径还不够清楚',
    ),
    decisionSummary: safeDecisionSummary(
      item.decisionSummary,
      defaultItemDecisionSummary(item),
    ),
  };
}

export function normalizeRadarDailySummaryRecord(
  summary?: RadarDailySummaryRecord | null,
): RadarDailySummaryRecord | null {
  if (!summary) {
    return null;
  }

  return {
    ...summary,
    topCategories: Array.isArray(summary.topCategories) ? summary.topCategories : [],
    topRepositoryIds: Array.isArray(summary.topRepositoryIds)
      ? summary.topRepositoryIds
      : [],
    topGoodRepositoryIds: Array.isArray(summary.topGoodRepositoryIds)
      ? summary.topGoodRepositoryIds
      : [],
    topCloneRepositoryIds: Array.isArray(summary.topCloneRepositoryIds)
      ? summary.topCloneRepositoryIds
      : [],
    topIgnoredRepositoryIds: Array.isArray(summary.topIgnoredRepositoryIds)
      ? summary.topIgnoredRepositoryIds
      : [],
    topItems: Array.isArray(summary.topItems)
      ? summary.topItems.map((item) => normalizeRadarDailySummaryItem(item))
      : [],
    topMustBuildItems: Array.isArray(summary.topMustBuildItems)
      ? summary.topMustBuildItems.map((item) => normalizeRadarDailySummaryItem(item))
      : [],
    topHighValueItems: Array.isArray(summary.topHighValueItems)
      ? summary.topHighValueItems.map((item) => normalizeRadarDailySummaryItem(item))
      : [],
    topCloneableItems: Array.isArray(summary.topCloneableItems)
      ? summary.topCloneableItems.map((item) => normalizeRadarDailySummaryItem(item))
      : [],
    topGoodItems: Array.isArray(summary.topGoodItems)
      ? summary.topGoodItems.map((item) => normalizeRadarDailySummaryItem(item))
      : [],
    topCloneItems: Array.isArray(summary.topCloneItems)
      ? summary.topCloneItems.map((item) => normalizeRadarDailySummaryItem(item))
      : [],
    topIgnoredItems: Array.isArray(summary.topIgnoredItems)
      ? summary.topIgnoredItems.map((item) => normalizeRadarDailySummaryItem(item))
      : [],
    keywordGroupStats: Array.isArray(summary.keywordGroupStats)
      ? summary.keywordGroupStats
      : [],
    topKeywordGroups: Array.isArray(summary.topKeywordGroups)
      ? summary.topKeywordGroups
      : [],
  };
}
