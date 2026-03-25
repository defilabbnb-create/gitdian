import {
  getOneLinerTemplateFamily,
  validateOneLiner,
  type OneLinerPostValidatorInput,
  type OneLinerPostValidatorResult,
} from 'shared';

export type HistoricalRecoveryPriority = 'P0' | 'P1' | 'P2';
export type HistoricalRecoveryStage = 'L0' | 'L1' | 'L2' | 'L3';

export type HistoricalDirtyType =
  | 'bad_one_liner'
  | 'headline_user_conflict'
  | 'headline_category_conflict'
  | 'monetization_overclaim'
  | 'fallback_dirty'
  | 'incomplete_analysis'
  | 'claude_conflict'
  | 'template_repetition'
  | 'homepage_bad_card'
  | 'snapshot_conflict';

export type HistoricalRecoverySignal = {
  repoId: string;
  fullName: string;
  htmlUrl: string;
  oneLinerZh: string;
  description?: string | null;
  repoName?: string | null;
  updatedAt?: string | null;
  projectType?: 'product' | 'tool' | 'model' | 'infra' | 'demo' | null;
  category?: string | null;
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
  verdict?: 'GOOD' | 'OK' | 'BAD' | null;
  action?: 'BUILD' | 'CLONE' | 'IGNORE' | 'SKIP' | null;
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | null;
  source?: 'manual' | 'claude' | 'local' | 'fallback' | null;
  strength?: 'STRONG' | 'MEDIUM' | 'WEAK' | null;
  targetUsersLabel?: string | null;
  monetizationLabel?: string | null;
  whyLabel?: string | null;
  snapshotPromising?: boolean | null;
  snapshotNextAction?: string | null;
  fallbackUsed?: boolean;
  hasSnapshot?: boolean;
  hasInsight?: boolean;
  hasFinalDecision?: boolean;
  hasIdeaFit?: boolean;
  hasIdeaExtract?: boolean;
  hasCompleteness?: boolean;
  hasClaudeReview?: boolean;
  hasConflict?: boolean;
  needsRecheck?: boolean;
  isFavorited?: boolean;
  favoritePriority?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  appearedOnHomepage?: boolean;
  appearedInDailySummary?: boolean;
  appearedInTelegram?: boolean;
  claudeDiffTypes?: string[];
  claudeMistakeTypes?: string[];
};

export type HistoricalRecoveryIssue = {
  type: HistoricalDirtyType;
  severity: 'low' | 'medium' | 'high';
  reason: string;
};

export type HistoricalRecoveryAssessment = {
  repoId: string;
  fullName: string;
  htmlUrl: string;
  priority: HistoricalRecoveryPriority;
  stages: HistoricalRecoveryStage[];
  issues: HistoricalRecoveryIssue[];
  validator: OneLinerPostValidatorResult;
  changed: boolean;
  severe: boolean;
  repeatedTemplate: boolean;
  fallbackDirty: boolean;
  incompleteAnalysis: boolean;
  autoEscalateLightAnalysis: boolean;
  metrics: {
    badOneliner: boolean;
    headlineUserConflict: boolean;
    headlineCategoryConflict: boolean;
    monetizationOverclaim: boolean;
    fallbackVisible: boolean;
    incompleteAnalysisVisible: boolean;
    claudeConflict: boolean;
    homepageBadCard: boolean;
  };
};

export type HistoricalRecoveryMetrics = {
  scannedCount: number;
  bad_oneliner_rate: number;
  headline_user_conflict_rate: number;
  headline_category_conflict_rate: number;
  monetization_overclaim_rate: number;
  fallback_visible_rate: number;
  incomplete_analysis_visible_rate: number;
  claude_conflict_rate: number;
  homepage_bad_card_rate: number;
  counts: Record<HistoricalDirtyType, number>;
  priorityCounts: Record<HistoricalRecoveryPriority, number>;
};

const HIGH_CONFLICT_DIFF_TYPES = new Set([
  'one_liner_drift',
  'category_mismatch',
  'product_vs_model_mismatch',
  'false_positive_for_wrong_reason',
  'monetization_overclaim',
  'misread_repository_purpose',
]);

const TEMPLATE_FAMILY_THRESHOLD = 3;

export function assessHistoricalRecoveryBatch(
  items: HistoricalRecoverySignal[],
): HistoricalRecoveryAssessment[] {
  const familyCounts = new Map<string, number>();

  for (const item of items) {
    const family = getOneLinerTemplateFamily(item.oneLinerZh ?? '');
    if (!family) {
      continue;
    }
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  }

  return items.map((item) => assessHistoricalRecoveryItem(item, familyCounts));
}

export function assessHistoricalRecoveryItem(
  item: HistoricalRecoverySignal,
  familyCounts?: Map<string, number>,
): HistoricalRecoveryAssessment {
  const validator = validateOneLiner(buildValidatorInput(item));
  const family = getOneLinerTemplateFamily(item.oneLinerZh ?? '');
  const repeatedTemplate =
    Boolean(family) &&
    (familyCounts?.get(family ?? '') ?? 0) >= TEMPLATE_FAMILY_THRESHOLD;
  const issues: HistoricalRecoveryIssue[] = [];

  if (validator.changed) {
    issues.push({
      type: 'bad_one_liner',
      severity: validator.severity === 'high' ? 'high' : 'medium',
      reason: validator.reasons[0] ?? 'one-liner 需要保守降级',
    });
  }

  if (repeatedTemplate) {
    issues.push({
      type: 'template_repetition',
      severity: 'medium',
      reason: '同类模板句在历史数据中重复过多，适合优先重写或重跑。',
    });
  }

  if (
    validator.riskFlags.includes('unclear_user') ||
    validator.riskFlags.includes('user_conflict')
  ) {
    issues.push({
      type: 'headline_user_conflict',
      severity: 'high',
      reason: 'headline 过强，但目标用户或使用场景不够清楚。',
    });
  }

  if (validator.riskFlags.includes('category_mismatch')) {
    issues.push({
      type: 'headline_category_conflict',
      severity: 'high',
      reason: 'headline 的产品叙事与 category / projectType 不一致。',
    });
  }

  if (validator.riskFlags.includes('monetization_overclaim')) {
    issues.push({
      type: 'monetization_overclaim',
      severity: 'high',
      reason: '收费表达过强，但用户、场景或商业证据不足。',
    });
  }

  const fallbackDirty =
    item.source === 'fallback' ||
    item.fallbackUsed === true ||
    validator.riskFlags.includes('fallback_overclaim');
  if (fallbackDirty) {
    issues.push({
      type: 'fallback_dirty',
      severity: 'high',
      reason: 'fallback 数据仍在暴露强结论，应优先降级并排队回收。',
    });
  }

  const incompleteAnalysis = Boolean(
    item.hasSnapshot &&
      (!item.hasInsight ||
        !item.hasFinalDecision ||
        !item.hasIdeaFit ||
        !item.hasIdeaExtract ||
        !item.hasCompleteness),
  );
  if (incompleteAnalysis) {
    issues.push({
      type: 'incomplete_analysis',
      severity: 'medium',
      reason: '仓库已抓取，但 insight / deep analysis 仍不完整。',
    });
  }

  const matchedDiffTypes = [
    ...(item.claudeDiffTypes ?? []),
    ...(item.claudeMistakeTypes ?? []),
  ].filter((type) => HIGH_CONFLICT_DIFF_TYPES.has(type));
  const claudeConflict = Boolean(
    item.hasConflict || item.needsRecheck || matchedDiffTypes.length > 0,
  );
  if (claudeConflict) {
    issues.push({
      type: 'claude_conflict',
      severity: 'high',
      reason:
        matchedDiffTypes.length > 0
          ? `Claude 与本地模型存在高价值冲突：${matchedDiffTypes.join(' / ')}。`
          : '本地模型与复核结果存在冲突，需要优先回收。',
    });
  }

  if (validator.riskFlags.includes('snapshot_conflict')) {
    issues.push({
      type: 'snapshot_conflict',
      severity: 'high',
      reason: 'snapshot 已判非 promising，但页面 headline 仍偏强。',
    });
  }

  const homepageBadCard = Boolean(
    (item.appearedOnHomepage || item.appearedInDailySummary || item.appearedInTelegram) &&
      (fallbackDirty ||
        incompleteAnalysis ||
        validator.changed ||
        claudeConflict ||
        repeatedTemplate),
  );
  if (homepageBadCard) {
    issues.push({
      type: 'homepage_bad_card',
      severity: 'high',
      reason: '该项目已进入高曝光区，但仍带着脏数据或冲突展示。',
    });
  }

  const priority = resolveRecoveryPriority(item, {
    fallbackDirty,
    incompleteAnalysis,
    claudeConflict,
    homepageBadCard,
  });
  const stages = resolveRecoveryStages(item, {
    fallbackDirty,
    incompleteAnalysis,
    claudeConflict,
    repeatedTemplate,
    validator,
    priority,
  });
  const severe = issues.some((issue) => issue.severity === 'high');

  return {
    repoId: item.repoId,
    fullName: item.fullName,
    htmlUrl: item.htmlUrl,
    priority,
    stages,
    issues,
    validator,
    changed: validator.changed,
    severe,
    repeatedTemplate,
    fallbackDirty,
    incompleteAnalysis,
    autoEscalateLightAnalysis: shouldAutoEscalateLightAnalysis(item, {
      incompleteAnalysis,
      claudeConflict,
      homepageBadCard,
    }),
    metrics: {
      badOneliner: validator.changed || repeatedTemplate,
      headlineUserConflict:
        validator.riskFlags.includes('unclear_user') ||
        validator.riskFlags.includes('user_conflict'),
      headlineCategoryConflict: validator.riskFlags.includes('category_mismatch'),
      monetizationOverclaim: validator.riskFlags.includes('monetization_overclaim'),
      fallbackVisible: fallbackDirty,
      incompleteAnalysisVisible: incompleteAnalysis,
      claudeConflict,
      homepageBadCard,
    },
  };
}

export function buildHistoricalRecoveryMetrics(
  assessments: HistoricalRecoveryAssessment[],
): HistoricalRecoveryMetrics {
  const scannedCount = assessments.length || 1;
  const counts: Record<HistoricalDirtyType, number> = {
    bad_one_liner: 0,
    headline_user_conflict: 0,
    headline_category_conflict: 0,
    monetization_overclaim: 0,
    fallback_dirty: 0,
    incomplete_analysis: 0,
    claude_conflict: 0,
    template_repetition: 0,
    homepage_bad_card: 0,
    snapshot_conflict: 0,
  };
  const priorityCounts: Record<HistoricalRecoveryPriority, number> = {
    P0: 0,
    P1: 0,
    P2: 0,
  };

  for (const assessment of assessments) {
    priorityCounts[assessment.priority] += 1;
    for (const issue of assessment.issues) {
      counts[issue.type] += 1;
    }
  }

  return {
    scannedCount: assessments.length,
    bad_oneliner_rate: ratio(
      assessments.filter((item) => item.metrics.badOneliner).length,
      scannedCount,
    ),
    headline_user_conflict_rate: ratio(
      assessments.filter((item) => item.metrics.headlineUserConflict).length,
      scannedCount,
    ),
    headline_category_conflict_rate: ratio(
      assessments.filter((item) => item.metrics.headlineCategoryConflict).length,
      scannedCount,
    ),
    monetization_overclaim_rate: ratio(
      assessments.filter((item) => item.metrics.monetizationOverclaim).length,
      scannedCount,
    ),
    fallback_visible_rate: ratio(
      assessments.filter((item) => item.metrics.fallbackVisible).length,
      scannedCount,
    ),
    incomplete_analysis_visible_rate: ratio(
      assessments.filter((item) => item.metrics.incompleteAnalysisVisible).length,
      scannedCount,
    ),
    claude_conflict_rate: ratio(
      assessments.filter((item) => item.metrics.claudeConflict).length,
      scannedCount,
    ),
    homepage_bad_card_rate: ratio(
      assessments.filter((item) => item.metrics.homepageBadCard).length,
      scannedCount,
    ),
    counts,
    priorityCounts,
  };
}

function resolveRecoveryPriority(
  item: HistoricalRecoverySignal,
  flags: {
    fallbackDirty: boolean;
    incompleteAnalysis: boolean;
    claudeConflict: boolean;
    homepageBadCard: boolean;
  },
): HistoricalRecoveryPriority {
  const highValue =
    item.priority === 'P0' ||
    item.priority === 'P1' ||
    (item.verdict === 'GOOD' && item.action === 'BUILD') ||
    ((item.verdict === 'GOOD' || item.verdict === 'OK') && item.action === 'CLONE');
  const highExposure = Boolean(
    item.appearedOnHomepage || item.appearedInDailySummary || item.appearedInTelegram,
  );

  if (
    highExposure ||
    flags.homepageBadCard ||
    flags.claudeConflict ||
    (flags.incompleteAnalysis && highValue) ||
    item.needsRecheck
  ) {
    return 'P0';
  }

  if (item.isFavorited || highValue || flags.fallbackDirty) {
    return 'P1';
  }

  return 'P2';
}

function resolveRecoveryStages(
  item: HistoricalRecoverySignal,
  flags: {
    fallbackDirty: boolean;
    incompleteAnalysis: boolean;
    claudeConflict: boolean;
    repeatedTemplate: boolean;
    validator: OneLinerPostValidatorResult;
    priority: HistoricalRecoveryPriority;
  },
): HistoricalRecoveryStage[] {
  const stages: HistoricalRecoveryStage[] = ['L0'];
  const needsLightRefresh =
    flags.validator.changed ||
    flags.repeatedTemplate ||
    flags.fallbackDirty ||
    flags.claudeConflict;
  if (needsLightRefresh) {
    stages.push('L1');
  }

  if (
    flags.incompleteAnalysis &&
    (flags.priority === 'P0' || flags.priority === 'P1' || item.needsRecheck)
  ) {
    stages.push('L2');
  }

  if (
    flags.claudeConflict ||
    ((item.priority === 'P0' || item.priority === 'P1') &&
      (item.appearedOnHomepage || item.appearedInTelegram))
  ) {
    stages.push('L3');
  }

  return takeUnique(stages);
}

function shouldAutoEscalateLightAnalysis(
  item: HistoricalRecoverySignal,
  flags: {
    incompleteAnalysis: boolean;
    claudeConflict: boolean;
    homepageBadCard: boolean;
  },
) {
  if (flags.homepageBadCard) {
    return true;
  }

  if (item.priority === 'P0' || item.priority === 'P1') {
    return true;
  }

  if (flags.claudeConflict || item.needsRecheck) {
    return true;
  }

  return flags.incompleteAnalysis;
}

function buildValidatorInput(item: HistoricalRecoverySignal): OneLinerPostValidatorInput {
  return {
    repoId: item.repoId,
    updatedAt: item.updatedAt ?? undefined,
    repoName: item.repoName ?? item.fullName.split('/').pop() ?? item.fullName,
    fullName: item.fullName,
    oneLinerZh: item.oneLinerZh,
    projectType: item.projectType ?? 'tool',
    category: item.category ?? '',
    hasRealUser: item.hasRealUser ?? false,
    hasClearUseCase: item.hasClearUseCase ?? false,
    isDirectlyMonetizable: item.isDirectlyMonetizable ?? false,
    verdict: normalizeVerdict(item.verdict),
    action: normalizeAction(item.action),
    priority: item.priority ?? 'P3',
    source: item.source ?? 'local',
    targetUsersLabel: item.targetUsersLabel ?? '',
    monetizationLabel: item.monetizationLabel ?? '',
    whyLabel: item.whyLabel ?? '',
    snapshotPromising: item.snapshotPromising ?? undefined,
    snapshotNextAction: item.snapshotNextAction ?? undefined,
  };
}

function normalizeVerdict(value: HistoricalRecoverySignal['verdict']) {
  return value === 'GOOD' || value === 'OK' || value === 'BAD' ? value : 'OK';
}

function normalizeAction(value: HistoricalRecoverySignal['action']) {
  if (value === 'BUILD' || value === 'CLONE' || value === 'IGNORE') {
    return value;
  }

  if (value === 'SKIP') {
    return 'IGNORE';
  }

  return 'CLONE';
}

function ratio(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Number((value / total).toFixed(4));
}

function takeUnique<T>(values: T[]) {
  return Array.from(new Set(values));
}
