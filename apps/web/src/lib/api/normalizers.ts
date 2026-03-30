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
import { localizeAnalysisTerms } from '@/lib/repository-decision';

const MAIN_CATEGORY_LABELS: Record<string, string> = {
  tools: '工具类',
  platform: '平台类',
  ai: 'AI 应用',
  data: '数据类',
  infra: '基础设施',
  content: '内容类',
  game: '游戏类',
  other: '其他',
};

const SUB_CATEGORY_LABELS: Record<string, string> = {
  devtools: '开发工具',
  automation: '自动化工具',
  'browser-extension': '浏览器扩展',
  productivity: '效率工具',
  workflow: '工作流工具',
  deployment: '部署工具',
  observability: '可观测性',
  security: '安全工具',
  analytics: '数据分析',
  'api-platform': 'API 平台',
  'content-creation': '内容创作',
  other: '其他',
};

const GENERIC_COPY_PATTERNS = [
  /^这个项目还缺少清晰的一句话说明[。！]?$/,
  /^当前缺少足够信息[，。].*$/,
  /^当前缺少完整理由[，。].*$/,
  /^用户描述还不够清楚$/,
  /^收费路径还不够清楚$/,
  /^待分类$/,
];

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

function normalizePreferredText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const localized = localizeAnalysisTerms(value).replace(/\s+/g, ' ').trim();

  if (!localized) {
    return null;
  }

  const latinCharCount = (localized.match(/[A-Za-z]/g) ?? []).length;
  const chineseCharCount = (localized.match(/[\u3400-\u9fff]/g) ?? []).length;

  if (latinCharCount >= 8 && chineseCharCount * 4 < latinCharCount) {
    return null;
  }

  if (GENERIC_COPY_PATTERNS.some((pattern) => pattern.test(localized))) {
    return null;
  }

  return localized;
}

function pickPreferredText(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = normalizePreferredText(value);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function formatSnapshotCategoryLabel(
  item: Pick<RepositoryListItem, 'analysis' | 'finalDecision'>,
) {
  const snapshotCategory = item.analysis?.ideaSnapshotJson?.category;

  if (!snapshotCategory) {
    return null;
  }

  const mainLabel =
    MAIN_CATEGORY_LABELS[snapshotCategory.main] ?? snapshotCategory.main;
  const subLabel =
    SUB_CATEGORY_LABELS[snapshotCategory.sub] ?? snapshotCategory.sub;

  if (mainLabel && subLabel && subLabel !== 'other') {
    return `${mainLabel} / ${subLabel}`;
  }

  return mainLabel || null;
}

function resolveLocalizedDecisionCopy(
  item: Pick<RepositoryListItem, 'analysis' | 'analysisState' | 'finalDecision'>,
) {
  const analysis = item.analysis;
  const finalDecision = item.finalDecision;
  const lightAnalysis = item.analysisState?.lightAnalysis;

  return {
    headline: pickPreferredText(
      analysis?.ideaSnapshotJson?.oneLinerZh,
      analysis?.extractedIdeaJson?.ideaSummary,
      analysis?.insightJson?.oneLinerZh,
      finalDecision?.oneLinerZh,
      finalDecision?.decisionSummary?.headlineZh,
    ),
    categoryLabel: pickPreferredText(
      analysis?.insightJson?.categoryDisplay?.label,
      formatSnapshotCategoryLabel(item),
      finalDecision?.decisionSummary?.categoryLabelZh,
      finalDecision?.categoryLabelZh,
    ),
    targetUsers: pickPreferredText(
      lightAnalysis?.targetUsers,
      analysis?.extractedIdeaJson?.targetUsers?.find(Boolean),
      analysis?.moneyPriority?.targetUsersZh,
      finalDecision?.moneyDecision?.targetUsersZh,
      finalDecision?.decisionSummary?.targetUsersZh,
    ),
    monetization: pickPreferredText(
      lightAnalysis?.monetization,
      analysis?.extractedIdeaJson?.monetization,
      analysis?.moneyPriority?.monetizationSummaryZh,
      finalDecision?.moneyDecision?.monetizationSummaryZh,
      finalDecision?.decisionSummary?.monetizationSummaryZh,
    ),
    reason: pickPreferredText(
      lightAnalysis?.whyItMatters,
      analysis?.insightJson?.verdictReason,
      analysis?.moneyPriority?.reasonZh,
      finalDecision?.reasonZh,
      finalDecision?.moneyDecision?.reasonZh,
      finalDecision?.decisionSummary?.reasonZh,
    ),
  };
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
  const normalizedFinalDecision = normalizeFinalDecision(item.finalDecision);
  const localizedCopy = resolveLocalizedDecisionCopy({
    analysis: item.analysis,
    analysisState: item.analysisState,
    finalDecision: normalizedFinalDecision,
  });

  return {
    ...item,
    finalDecision: normalizedFinalDecision
      ? {
          ...normalizedFinalDecision,
          oneLinerZh: cleanText(
            localizedCopy.headline,
            normalizedFinalDecision.oneLinerZh,
            normalizedFinalDecision.decisionSummary.headlineZh,
          ),
          categoryLabelZh: cleanText(
            localizedCopy.categoryLabel,
            normalizedFinalDecision.categoryLabelZh,
            normalizedFinalDecision.decisionSummary.categoryLabelZh,
            '待分类',
          ),
          reasonZh: cleanText(
            localizedCopy.reason,
            normalizedFinalDecision.reasonZh,
            normalizedFinalDecision.moneyDecision?.reasonZh,
            normalizedFinalDecision.decisionSummary.reasonZh,
          ),
          moneyDecision: {
            ...normalizedFinalDecision.moneyDecision,
            targetUsersZh: cleanText(
              localizedCopy.targetUsers,
              normalizedFinalDecision.moneyDecision?.targetUsersZh,
              normalizedFinalDecision.decisionSummary.targetUsersZh,
            ),
            monetizationSummaryZh: cleanText(
              localizedCopy.monetization,
              normalizedFinalDecision.moneyDecision?.monetizationSummaryZh,
              normalizedFinalDecision.decisionSummary.monetizationSummaryZh,
            ),
            reasonZh: cleanText(
              localizedCopy.reason,
              normalizedFinalDecision.moneyDecision?.reasonZh,
              normalizedFinalDecision.reasonZh,
              normalizedFinalDecision.decisionSummary.reasonZh,
            ),
          },
          decisionSummary: {
            ...normalizedFinalDecision.decisionSummary,
            headlineZh: cleanText(
              localizedCopy.headline,
              normalizedFinalDecision.decisionSummary.headlineZh,
              normalizedFinalDecision.oneLinerZh,
            ),
            categoryLabelZh: cleanText(
              localizedCopy.categoryLabel,
              normalizedFinalDecision.decisionSummary.categoryLabelZh,
              normalizedFinalDecision.categoryLabelZh,
              '待分类',
            ),
            targetUsersZh: cleanText(
              localizedCopy.targetUsers,
              normalizedFinalDecision.decisionSummary.targetUsersZh,
              normalizedFinalDecision.moneyDecision?.targetUsersZh,
            ),
            monetizationSummaryZh: cleanText(
              localizedCopy.monetization,
              normalizedFinalDecision.decisionSummary.monetizationSummaryZh,
              normalizedFinalDecision.moneyDecision?.monetizationSummaryZh,
            ),
            reasonZh: cleanText(
              localizedCopy.reason,
              normalizedFinalDecision.decisionSummary.reasonZh,
              normalizedFinalDecision.reasonZh,
              normalizedFinalDecision.moneyDecision?.reasonZh,
            ),
          },
        }
      : normalizedFinalDecision,
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
