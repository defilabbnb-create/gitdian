type InsightVerdict = 'GOOD' | 'OK' | 'BAD';
type InsightAction = 'BUILD' | 'CLONE' | 'IGNORE';
type FinalDecisionSource = 'manual' | 'claude' | 'local' | 'fallback';
type FounderPriorityTier = 'P0' | 'P1' | 'P2' | 'P3';

export type RepositoryDecisionDisplaySummary = {
  headlineZh: string;
  judgementLabelZh: string;
  verdictLabelZh: string;
  actionLabelZh: string;
  finalDecisionLabelZh: string;
  moneyPriorityLabelZh: string;
  categoryLabelZh: string;
  recommendedMoveZh: string;
  worthDoingLabelZh: string;
  reasonZh: string;
  targetUsersZh: string;
  monetizationSummaryZh: string;
  sourceLabelZh: string;
};

export function resolveFinalDecisionSource(input: {
  manualOverride?: {
    verdict?: unknown;
    action?: unknown;
    note?: unknown;
  } | null;
  claudeReview?: {
    generatedBy?: unknown;
  } | null;
  insight?: Record<string, unknown> | null;
}): FinalDecisionSource {
  const manualOverride = input.manualOverride;
  if (
    manualOverride &&
    (manualOverride.verdict || manualOverride.action || manualOverride.note)
  ) {
    return 'manual';
  }

  if (input.claudeReview) {
    return cleanText(input.claudeReview.generatedBy, 40) === 'local_fallback'
      ? 'fallback'
      : 'claude';
  }

  if (input.insight) {
    return 'local';
  }

  return 'fallback';
}

export function buildRepositoryDecisionDisplaySummary(input: {
  oneLinerZh: string;
  verdict: InsightVerdict;
  action: InsightAction;
  categoryLabelZh: string;
  moneyPriority: FounderPriorityTier;
  reasonZh: string;
  sourceLabelZh: string;
  moneyDecision: {
    recommendedMoveZh: string;
    targetUsersZh: string;
    monetizationSummaryZh: string;
  };
}): RepositoryDecisionDisplaySummary {
  const verdictLabelZh = verdictLabel(input.verdict);
  const actionLabelZh = actionLabel(input.action);
  const judgementLabelZh = judgementLabel(input.verdict, input.action);
  const moneyPriorityLabelZh = founderPriorityLabel(input.moneyPriority);
  const reasonZh =
    cleanText(input.reasonZh, 320) || '还缺少足够证据，建议先结合摘要和详情再判断。';
  const targetUsersZh =
    cleanText(input.moneyDecision.targetUsersZh, 120) || '用户还不够清楚';
  const monetizationSummaryZh =
    cleanText(input.moneyDecision.monetizationSummaryZh, 160) || '收费路径还不够清楚';
  const recommendedMoveZh =
    cleanText(input.moneyDecision.recommendedMoveZh, 120) ||
    (input.action === 'BUILD'
      ? '更适合你亲自做成产品'
      : input.action === 'CLONE'
        ? '更适合借鉴思路后重做'
        : '现在先跳过');
  const categoryLabelZh =
    cleanText(input.categoryLabelZh, 100) || '待分类';

  return {
    headlineZh:
      cleanText(input.oneLinerZh, 220) || '这个项目还没有形成可读的一句话结论。',
    judgementLabelZh,
    verdictLabelZh,
    actionLabelZh,
    finalDecisionLabelZh: `${judgementLabelZh} · ${actionLabelZh}`,
    moneyPriorityLabelZh,
    categoryLabelZh,
    recommendedMoveZh,
    worthDoingLabelZh: worthDoingLabel(input.action, input.moneyPriority),
    reasonZh,
    targetUsersZh,
    monetizationSummaryZh,
    sourceLabelZh: cleanText(input.sourceLabelZh, 40) || '兜底判断',
  };
}

function verdictLabel(value: InsightVerdict) {
  switch (value) {
    case 'GOOD':
      return '值得重点看';
    case 'OK':
      return '可继续看';
    case 'BAD':
    default:
      return '不建议投入';
  }
}

function actionLabel(value: InsightAction) {
  switch (value) {
    case 'BUILD':
      return '做';
    case 'CLONE':
      return '抄';
    case 'IGNORE':
    default:
      return '忽略';
  }
}

function judgementLabel(verdict: InsightVerdict, action: InsightAction) {
  if (action === 'BUILD' || verdict === 'GOOD') {
    return '值得做';
  }

  if (action === 'CLONE' || verdict === 'OK') {
    return '值得借鉴';
  }

  return '跳过';
}

function founderPriorityLabel(value: FounderPriorityTier) {
  switch (value) {
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

function worthDoingLabel(action: InsightAction, moneyPriority: FounderPriorityTier) {
  if (moneyPriority === 'P0' || moneyPriority === 'P1' || action === 'BUILD') {
    return '值得你优先投入';
  }

  if (moneyPriority === 'P2' || action === 'CLONE') {
    return '更适合借鉴后重做';
  }

  return '现在直接跳过';
}

function cleanText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim().replace(/\s+/g, ' ').slice(0, maxLength);
}
