import {
  ONE_LINER_LOW_PRIORITY_FALLBACK,
  ONE_LINER_REVIEWING_FALLBACK,
  ONE_LINER_TECHNICAL_FALLBACK,
  getOneLinerPostValidatorStats,
  getOneLinerTemplateFamily,
  type OneLinerPostValidatorInput,
  type OneLinerPostValidatorResult,
  validateOneLiner,
  validateOneLinersBatch,
} from 'shared';
import {
  MoneyDecision,
  JobLogItem,
  MoneyPriorityTier,
  RepositoryAnalysisStatus,
  RepositoryAnalysisRecord,
  RepositoryAnalysisStateRecord,
  RepositoryCompletenessLevel,
  RepositoryDecision,
  RepositoryDetail,
  RepositoryDecisionSource,
  RepositoryFinalDecisionRecord,
  RepositoryFounderPriority,
  RepositoryIdeaMainCategory,
  RepositoryIdeaExtractStatus,
  RepositoryIdeaNextAction,
  RepositoryInsightAction,
  RepositoryInsightVerdict,
  RepositoryListItem,
  RepositoryMoneyPriorityRecord,
  RepositoryOneLinerStrength,
  RepositoryOpportunityLevel,
} from '@/lib/types/repository';

export type RepositoryVerdict = RepositoryInsightVerdict;
export type RepositoryAction = RepositoryInsightAction;

type RepositoryDecisionTarget = RepositoryListItem | RepositoryDetail;
export type RepositoryHeadlineValidation = OneLinerPostValidatorResult;

export type RepositoryIdeaExtractStatusDetail = {
  status: RepositoryIdeaExtractStatus;
  mode: 'full' | 'light' | 'skip' | null;
  reason: string | null;
  helperText: string;
};

export type RepositoryDeepAnalysisStatusDetail = {
  status: RepositoryAnalysisStatus;
  reason: string | null;
  helperText: string;
  label: string;
  missingSteps: Array<'ideaFit' | 'ideaExtract' | 'completeness'>;
};

export type RepositoryFallbackIdeaAnalysis = {
  headline: string;
  targetUsers: string;
  useCase: string;
  monetization: string;
  whyItMatters: string;
  nextStep: string;
  caution: string | null;
};

export type RepositoryDecisionConflictAudit = {
  headlineUserConflict: boolean;
  headlineCategoryConflict: boolean;
  headlineMonetizationConflict: boolean;
  headlineActionConflict: boolean;
  templatedHeadline: boolean;
  unclearUser: boolean;
  hasConflict: boolean;
};

export type RepositoryActionBehaviorContext = {
  categoryLabel: string | null;
  projectType: string | null;
  targetUsersLabel: string | null;
  useCaseLabel: string | null;
  patternKeys: string[];
  hasRealUser: boolean;
  hasClearUseCase: boolean;
  isDirectlyMonetizable: boolean;
};

type CategoryDisplay = {
  main: string | null;
  sub: string | null;
  label: string;
};

type MoneyPriorityDisplay = {
  score: number;
  tier: RepositoryFounderPriority;
  moneyDecision: MoneyDecision;
  label: string;
  reason: string;
  recommendedMove: string;
  targetUsers: string;
  monetization: string;
  projectTypeLabel: string;
  legacyTier?: MoneyPriorityTier | null;
};

export type RepositoryDecisionSummary = {
  oneLiner: string;
  judgementLabel: string;
  finalDecisionLabel: string;
  verdict: RepositoryVerdict;
  verdictLabel: string;
  verdictReason: string;
  action: RepositoryAction;
  actionLabel: string;
  category: CategoryDisplay;
  completenessLabel: string;
  completenessLevel: RepositoryCompletenessLevel | null;
  nextActionLabel: string;
  tags: string[];
  hasManualOverride: boolean;
  manualNote: string;
  manualUpdatedAt: string;
  moneyPriority: MoneyPriorityDisplay;
  targetUsersLabel: string;
  monetizationLabel: string;
  recommendedMoveLabel: string;
  worthDoingLabel: string;
  categoryLabel: string;
  source: RepositoryDecisionSource;
  sourceLabel: string;
  hasConflict: boolean;
  needsRecheck: boolean;
  hasTrainingHints: boolean;
  conflictReasons: string[];
  trainingMistakes: string[];
  trainingSuggestions: string[];
  comparison: {
    localVerdict: string;
    claudeVerdict: string;
    localOneLiner: string;
    claudeOneLiner: string;
  };
};

const MAIN_CATEGORY_LABELS: Record<RepositoryIdeaMainCategory, string> = {
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
  'ai-tools': 'AI工具',
  automation: '自动化工具',
  'data-tools': '数据工具',
  'browser-extension': '浏览器扩展',
  productivity: '效率工具',
  workflow: '工作流工具',
  cli: '命令行工具',
  'no-code': '无代码工具',
  'ops-tools': '运维工具',
  marketplace: '交易平台',
  'app-builder': '应用搭建',
  'workflow-platform': '工作流平台',
  'developer-platform': '开发者平台',
  'api-platform': 'API 平台',
  'ai-writing': 'AI写作',
  'ai-code': 'AI编程',
  'ai-agent': 'AI Agent',
  'ai-image': 'AI图像',
  'ai-search': 'AI搜索',
  'data-pipeline': '数据管道',
  analytics: '数据分析',
  scraping: '数据采集',
  etl: 'ETL 工具',
  dataset: '数据集',
  'data-observability': '数据可观测',
  deployment: '部署工具',
  observability: '可观测性',
  auth: '身份认证',
  storage: '存储服务',
  'api-gateway': 'API 网关',
  devops: 'DevOps',
  cloud: '云基础设施',
  monitoring: '监控告警',
  security: '安全工具',
  'content-creation': '内容创作',
  seo: 'SEO 工具',
  publishing: '发布分发',
  media: '媒体工具',
  'game-tooling': '游戏工具',
  'game-content': '游戏内容',
  'game-platform': '游戏平台',
  other: '其他',
};

const VERDICT_LABELS: Record<RepositoryVerdict, string> = {
  GOOD: '值得重点看',
  OK: '可继续看',
  BAD: '不建议投入',
};

const ACTION_LABELS: Record<RepositoryAction, string> = {
  BUILD: '适合直接做',
  CLONE: '适合借鉴',
  IGNORE: '先跳过',
};

function actionJudgementLabel(action: RepositoryAction) {
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

const SNAPSHOT_ACTION_LABELS: Record<RepositoryIdeaNextAction, string> = {
  KEEP: '继续观察',
  SKIP: '先忽略',
  DEEP_ANALYZE: '继续深读',
};

const MONEY_TIER_LABELS: Record<MoneyPriorityTier, string> = {
  MUST_LOOK: '最高优先',
  WORTH_BUILDING: '值得做',
  WORTH_CLONING: '值得借鉴',
  LOW_PRIORITY: '低优先',
  IGNORE: '跳过',
};

const FOUNDER_PRIORITY_LABELS: Record<RepositoryFounderPriority, string> = {
  P0: 'P0 · 能赚钱',
  P1: 'P1 · 值得做',
  P2: 'P2 · 值得借鉴',
  P3: 'P3 · 低优先',
};

const MONEY_DECISION_LABELS: Record<MoneyDecision, string> = {
  MUST_BUILD: '🔥 必做',
  HIGH_VALUE: '👍 值得做',
  CLONEABLE: '🤔 可抄',
  LOW_VALUE: '低优先',
  IGNORE: '❌ 忽略',
  BUILDABLE: '👍 值得做',
  CLONE_ONLY: '🤔 可抄',
  NOT_WORTH: '低优先',
};

const GENERIC_ONE_LINER_PATTERNS = [
  /^一个(?:工具|平台|系统|解决方案)[。！]?$/,
  /^一个(?:项目|仓库)[。！]?$/,
  /^一个名为.+的项目[。！]?$/,
  /^一个(?:该)?仓库名为/,
  /无法识别用户/,
  /无法确定目标用户/,
  /no clear user/i,
  /提升效率/,
  /优化流程/,
  /AI赋能/i,
  /细分人群/,
  /还需要再确认/,
  /需要进一步确认/,
  /仍需确认/,
  /^一个帮.+(?:提效|提升效率)的(?:工具|平台)$/,
];

const STRUCTURALLY_WEAK_HOMEPAGE_PATTERNS = [
  /示例项目/,
  /模板/,
  /脚手架/,
  /教程/,
  /课程/,
  /样例/,
  /starter/i,
  /scaffold/i,
  /template/i,
  /boilerplate/i,
  /demo/i,
  /tutorial/i,
  /course/i,
  /example/i,
];

const TEMPLATE_ONE_LINER_PATTERNS = [
  /^一个帮团队自动跑流程的工具[。！]?$/,
  /^一个帮用户快速搭应用的平台[。！]?$/,
  /^一个在命令行里提效的开发工具[。！]?$/,
  /^一个面向底层能力封装的基础设施项目[。！]?$/,
  /^一个面向特定能力场景的模型项目[。！]?$/,
  /^一个帮开发者提效的工程工具[。！]?$/,
  /^一个帮用户提效的 AI 工具[。！]?$/,
  /^一个帮团队提升日常效率的工具[。！]?$/,
  /^一个自动处理和汇总数据的服务[。！]?$/,
  /^一个帮团队处理和分析数据的工具[。！]?$/,
  /^一个帮团队看清数据变化的工具[。！]?$/,
  /^一个让项目更容易部署上线的工具[。！]?$/,
  /^一个帮产品快速接入登录和权限的服务[。！]?$/,
];

const KNOWN_BAD_HEADLINE_PATTERNS = [
  /^一个(?:帮(?:开发者|工程师|运维人员|团队)|用于)?记录 token 与成本明细的(?:CLI 工具|工具|代码项目|浏览器扩展).*/,
  /^一个(?:帮(?:开发者|工程师|团队)|用于)?管理环境变量和密钥的(?:CLI 工具|工具|代码项目|浏览器扩展).*/,
  /^一个(?:帮(?:开发者|工程师|运维人员)|用于)?在命令行里搜索歌曲并管理播放列表的(?:CLI 工具|工具).*/,
];

const STRONG_MONETIZATION_PATTERNS = [
  /可从团队订阅、托管版或企业版收费/,
  /已有现实收费路径/,
  /比较直接的收费路径/,
  /直接做成订阅或团队付费产品/,
  /较直接的收费可能/,
];

const GENERIC_HOMEPAGE_REASON_PATTERNS = [
  /^已经有人在用，可以收费[。！]?$/,
  /^替代已有工具，有明显优势[。！]?$/,
  /^自动化明确场景，可快速落地[。！]?$/,
  /^有明确用户和付费路径[。！]?$/,
  /^有明确付费路径[。！]?$/,
  /^需求明确，值得优先验证[。！]?$/,
  /^结构和可运行性都比较清楚[。！]?$/,
  /^这个方向本身没问题，但同类已经很多，更适合借鉴做法后换个切口[。！]?$/,
  /^这个方向需求明确，虽然同类不少，但只要切口更准，还是值得继续做[。！]?$/,
  /^这个项目更像技术能力或可借鉴方向，但产品边界和付费逻辑还不够清楚，先按可以抄处理更稳[。！]?$/,
  /^方向不算错，但项目还不够完整，暂时还撑不起一个清晰产品[。！]?$/,
  /^先确认真实用户、场景和投入价值，再决定要不要继续推进[。！]?$/,
  /^基础判断偏保守.*$/,
  /^后端最终判断还在补齐.*$/,
  /^当前先按低优先展示.*$/,
  /^先确认谁会持续使用它，再决定要不要继续投入[。！]?$/,
];

const ABSTRACT_SIGNAL_REASON_PATTERNS = [
  /^(技术成熟度|市场|用户|收费|分发|执行|问题|留存|获客)(?:这块|这几块)?(?:证据)?\s*(?:还)?(?:偏弱|不足|缺失|待补|仍缺|还在补|不够稳|不够清楚)[。！]?$/,
  /^(技术成熟度|市场|用户|收费|分发|执行|问题|留存|获客)(?:这块)?(?:证据)?\s*还有冲突[。！]?$/,
  /^当前冲突主要集中在\s*(技术成熟度|市场|用户|收费|分发|执行|问题|留存|获客)(?:[、，,]\s*(技术成熟度|市场|用户|收费|分发|执行|问题|留存|获客))*[。！]?$/,
  /^冲突集中在\s*(技术成熟度|市场|用户|收费|分发|执行|问题|留存|获客)(?:[、，,]\s*(技术成熟度|市场|用户|收费|分发|执行|问题|留存|获客))*[。！]?$/,
];

const STRONG_FORWARD_ACTION_PATTERNS = [
  /立即做/,
  /可以继续投入/,
  /值得优先验证/,
  /值得继续推进/,
  /验证通过（可做）/,
  /开始验证/,
];

const ANALYSIS_TERM_LABELS: Record<string, string> = {
  technical_maturity: '技术成熟度',
  monetization: '收费',
  execution: '执行',
  market: '市场',
  distribution: '分发',
  retention: '留存',
  acquisition: '获客',
  productization: '产品化',
  product: '产品',
  user: '用户',
  users: '用户',
  audience: '用户',
  problem: '问题',
  solution: '解决方案',
  pricing: '定价',
  channel: '渠道',
};

export const HOMEPAGE_LOW_PRIORITY_FALLBACK =
  '这个项目暂时更适合放在低优先观察池里。';
export const HOMEPAGE_REVIEWING_FALLBACK =
  '这个项目的中文摘要还在校正，先看最终结论与详情。';

type DecisionHeadlineOptions = {
  forceDegrade?: boolean;
};

export function getCategoryDisplay(
  mainCategory?: string | null,
  subCategory?: string | null,
): CategoryDisplay {
  const normalizedMain = normalizeCategoryKey(mainCategory);
  const normalizedSub = normalizeCategoryKey(subCategory);
  const main =
    normalizedMain && normalizedMain in MAIN_CATEGORY_LABELS
      ? MAIN_CATEGORY_LABELS[normalizedMain as RepositoryIdeaMainCategory]
      : null;
  const sub = normalizedSub ? SUB_CATEGORY_LABELS[normalizedSub] ?? '待细分' : null;

  if (main && sub) {
    return {
      main,
      sub,
      label: `${main} / ${sub}`,
    };
  }

  if (main) {
    return {
      main,
      sub: null,
      label: main,
    };
  }

  return {
    main: null,
    sub: null,
    label: '待分类',
  };
}

function getSnapshotCategoryDisplay(
  repository: RepositoryDecisionTarget,
): CategoryDisplay | null {
  const snapshotCategory = repository.analysis?.ideaSnapshotJson?.category;

  if (!snapshotCategory) {
    return null;
  }

  const display = getCategoryDisplay(snapshotCategory.main, snapshotCategory.sub);
  return display.label === '待分类' ? null : display;
}

function resolveRepositoryCategoryDisplay(
  repository: RepositoryDecisionTarget,
  fallback: {
    mainCategory?: string | null;
    subCategory?: string | null;
  } = {},
): CategoryDisplay {
  const derived = getCategoryDisplay(
    fallback.mainCategory ??
      repository.finalDecision?.categoryMain ??
      repository.analysis?.insightJson?.category?.main ??
      repository.analysis?.ideaSnapshotJson?.category?.main ??
      repository.categoryL1 ??
      repository.finalDecision?.category ??
      null,
    fallback.subCategory ??
      repository.finalDecision?.categorySub ??
      repository.analysis?.insightJson?.category?.sub ??
      repository.analysis?.ideaSnapshotJson?.category?.sub ??
      repository.categoryL2 ??
      null,
  );
  const snapshotDisplay = getSnapshotCategoryDisplay(repository);

  return {
    main: derived.main ?? snapshotDisplay?.main ?? null,
    sub: derived.sub ?? snapshotDisplay?.sub ?? null,
    label: pickText(
      repository.analysis?.insightJson?.categoryDisplay?.label,
      repository.finalDecision?.decisionSummary?.categoryLabelZh,
      repository.finalDecision?.categoryLabelZh,
      snapshotDisplay?.label,
      derived.label,
      '待分类',
    ),
  };
}

export function getRepositoryDecisionSummary(
  repository: RepositoryDecisionTarget,
): RepositoryDecisionSummary {
  const finalDecision = repository.finalDecision;
  const finalDisplay = finalDecision?.decisionSummary ?? null;
  if (finalDecision && finalDisplay) {
    return buildSummaryFromFinalDecision(repository, finalDecision);
  }

  return buildThinFallbackSummary(repository);
}

function buildThinFallbackSummary(
  repository: RepositoryDecisionTarget,
): RepositoryDecisionSummary {
  const trainingAsset = repository.trainingAsset;
  const analysisState = getRepositoryAnalysisState(repository);
  const insight = repository.analysis?.insightJson;
  const snapshot = repository.analysis?.ideaSnapshotJson;
  const fallbackCategory = resolveRepositoryCategoryDisplay(repository, {
    mainCategory: insight?.category?.main ?? repository.categoryL1,
    subCategory: insight?.category?.sub ?? repository.categoryL2,
  });
  const fallbackAction = insight?.action ?? 'CLONE';
  const fallbackVerdict = insight?.verdict ?? 'OK';
  const moneyPriority: MoneyPriorityDisplay = {
    score: 0,
    tier: 'P3',
    moneyDecision: 'LOW_VALUE',
    label: 'P3 · 低优先',
    reason:
      pickLocalizedText(
        analysisState?.lightAnalysis?.whyItMatters,
        analysisState?.lightAnalysis?.nextStep,
        insight?.verdictReason,
        snapshot?.reason,
      ) || '后端最终判断还在补齐，当前先按低优先展示，避免前端自己重新推理。',
    recommendedMove:
      pickLocalizedText(
        analysisState?.lightAnalysis?.nextStep,
        repository.analysis?.moneyPriority?.recommendedMoveZh,
      ) || '稍后再看',
    targetUsers:
      pickLocalizedText(
        analysisState?.lightAnalysis?.targetUsers,
        repository.analysis?.moneyPriority?.targetUsersZh,
      ) || '用户还不够清楚',
    monetization:
      pickLocalizedText(
        analysisState?.lightAnalysis?.monetization,
        repository.analysis?.moneyPriority?.monetizationSummaryZh,
      ) || '收费路径还不够清楚',
    projectTypeLabel: fallbackCategory.label,
    legacyTier: null,
  };
  const targetUsersLabel = moneyPriority.targetUsers;
  const fallbackOneLiner = buildThinFallbackOneLiner({
    repository,
    categoryLabel: fallbackCategory.label,
    targetUsersLabel,
    preferredOneLiners: [
      insight?.oneLinerZh,
      repository.coreAsset?.oneLinerZh,
      repository.description,
    ],
  });

  return {
    oneLiner: fallbackOneLiner,
    judgementLabel: actionJudgementLabel(fallbackAction),
    finalDecisionLabel: `${actionJudgementLabel(fallbackAction)} · ${ACTION_LABELS[fallbackAction]}`,
    verdict: fallbackVerdict,
    verdictLabel: VERDICT_LABELS[fallbackVerdict],
    verdictReason: moneyPriority.reason,
    action: fallbackAction,
    actionLabel: ACTION_LABELS[fallbackAction],
    category: fallbackCategory,
    completenessLabel: repository.completenessLevel ?? '待补分析',
    completenessLevel: repository.completenessLevel ?? null,
    nextActionLabel:
      snapshot?.nextAction
        ? SNAPSHOT_ACTION_LABELS[snapshot.nextAction]
        : ACTION_LABELS[fallbackAction],
    tags: [moneyPriority.label, fallbackCategory.label].filter(Boolean),
    hasManualOverride: false,
    manualNote: '',
    manualUpdatedAt: '',
    moneyPriority,
    targetUsersLabel,
    monetizationLabel: moneyPriority.monetization,
    recommendedMoveLabel: moneyPriority.recommendedMove,
    worthDoingLabel: '等后端最终判断补齐后再决定',
    categoryLabel: fallbackCategory.label,
    source: 'fallback',
    sourceLabel: '系统兜底展示',
    hasConflict: false,
    needsRecheck: true,
    hasTrainingHints: Boolean(trainingAsset?.mistakeTypes?.length || trainingAsset?.suggestions?.length),
    conflictReasons: [],
    trainingMistakes: trainingAsset?.mistakeTypes ?? [],
    trainingSuggestions: trainingAsset?.suggestions ?? [],
    comparison: {
      localVerdict: '暂无',
      claudeVerdict: '暂无',
      localOneLiner: '暂无主分析一句话',
      claudeOneLiner: '暂无历史复核一句话',
    },
  };
}

function buildThinFallbackOneLiner(args: {
  repository: RepositoryDecisionTarget;
  categoryLabel: string;
  targetUsersLabel: string;
  preferredOneLiners: Array<unknown>;
}) {
  const preferred = args.preferredOneLiners
    .map((value) => cleanDecisionText(value))
    .find(
      (value) =>
        value.length > 0 &&
        !isGenericOneLiner(value) &&
        !looksLikeGenericFallbackSubject(value) &&
        !isTemplatedDecisionHeadline(value) &&
        !isUnsafeRepositoryHeadline(value),
    );

  if (preferred) {
    return preferred;
  }

  const targetUsers = hasUnclearUserLabel(args.targetUsersLabel)
    ? ''
    : trimHeadlinePunctuation(args.targetUsersLabel) ?? '';
  const categoryLabel =
    args.categoryLabel && args.categoryLabel !== '待分类'
      ? trimHeadlinePunctuation(args.categoryLabel) ?? ''
      : '';

  if (targetUsers && categoryLabel) {
    return `面向${targetUsers}的${categoryLabel}项目，当前细节分析还在补齐。`;
  }

  if (categoryLabel) {
    return `一个${categoryLabel}方向项目，当前细节分析还在补齐。`;
  }

  if (targetUsers) {
    return `面向${targetUsers}的项目，当前细节分析还在补齐。`;
  }

  return '这个项目当前细节分析还在补齐，先结合仓库描述和详情查看。';
}

function buildSummaryFromFinalDecision(
  repository: RepositoryDecisionTarget,
  finalDecision: RepositoryFinalDecisionRecord,
): RepositoryDecisionSummary {
  const finalDisplay = finalDecision.decisionSummary;
  const trainingAsset = repository.trainingAsset;
  const insight = repository.analysis?.insightJson;
  const snapshot = repository.analysis?.ideaSnapshotJson;
  const analysisState = getRepositoryAnalysisState(repository);
  const fallbackCategory = resolveRepositoryCategoryDisplay(repository, {
    mainCategory:
      finalDecision.categoryMain ??
      insight?.category?.main ??
      repository.categoryL1 ??
      finalDecision.category,
    subCategory:
      finalDecision.categorySub ?? insight?.category?.sub ?? repository.categoryL2,
  });
  const resolvedFounderPriority =
    normalizeFounderPriority(finalDecision.moneyPriority) ?? 'P3';
  const moneyDecision = repository.analysis?.moneyPriority?.moneyDecision
    ? normalizeMoneyDecision(repository.analysis.moneyPriority.moneyDecision)
    : founderPriorityToMoneyDecision(resolvedFounderPriority);
  const moneyPriority: MoneyPriorityDisplay = {
    score:
      finalDecision.moneyDecision?.score ??
      repository.analysis?.moneyPriority?.moneyScore ??
      repository.analysis?.moneyPriority?.score ??
      0,
    tier: resolvedFounderPriority,
    moneyDecision,
    label: pickText(finalDisplay.moneyPriorityLabelZh),
    reason: pickText(
      finalDisplay.reasonZh,
      finalDecision.reasonZh,
      finalDecision.moneyDecision?.reasonZh,
      pickLocalizedText(
        analysisState?.lightAnalysis?.whyItMatters,
        analysisState?.lightAnalysis?.nextStep,
      ),
      insight?.verdictReason,
    ),
    recommendedMove: pickText(finalDisplay.recommendedMoveZh),
    targetUsers: pickText(
      finalDisplay.targetUsersZh,
      finalDecision.moneyDecision?.targetUsersZh,
      pickLocalizedText(analysisState?.lightAnalysis?.targetUsers),
      repository.analysis?.moneyPriority?.targetUsersZh,
    ),
    monetization: pickText(
      finalDisplay.monetizationSummaryZh,
      finalDecision.moneyDecision?.monetizationSummaryZh,
      pickLocalizedText(analysisState?.lightAnalysis?.monetization),
      repository.analysis?.moneyPriority?.monetizationSummaryZh,
    ),
    projectTypeLabel: pickText(
      finalDisplay.categoryLabelZh,
      finalDecision.categoryLabelZh,
      fallbackCategory.label,
    ),
    legacyTier: repository.analysis?.moneyPriority?.tier ?? null,
  };
  const conflictReasons = Array.from(
    new Set([
      ...(finalDecision.comparison?.conflictReasons ?? []),
      ...(trainingAsset?.diffTypes ?? []),
      ...(trainingAsset?.mistakeTypes ?? []),
    ]),
  ).slice(0, 8);

  return {
    oneLiner: pickText(finalDisplay.headlineZh, finalDecision.oneLinerZh),
    judgementLabel: pickText(finalDisplay.judgementLabelZh),
    finalDecisionLabel: pickText(finalDisplay.finalDecisionLabelZh),
    verdict: finalDecision.verdict,
    verdictLabel: pickText(finalDisplay.verdictLabelZh, VERDICT_LABELS[finalDecision.verdict]),
    verdictReason: pickText(
      finalDisplay.reasonZh,
      finalDecision.reasonZh,
      finalDecision.moneyDecision?.reasonZh,
      pickLocalizedText(
        analysisState?.lightAnalysis?.whyItMatters,
        analysisState?.lightAnalysis?.nextStep,
      ),
      insight?.verdictReason,
    ),
    action: finalDecision.action,
    actionLabel: pickText(finalDisplay.actionLabelZh, ACTION_LABELS[finalDecision.action]),
    category: {
      main: pickText(finalDecision.categoryMain, fallbackCategory.main) || null,
      sub: pickText(finalDecision.categorySub, fallbackCategory.sub) || null,
      label: pickText(
        finalDecision.categoryLabelZh,
        finalDisplay.categoryLabelZh,
        fallbackCategory.label,
        '待分类',
      ),
    },
    completenessLabel:
      insight?.completenessLevel ?? repository.completenessLevel ?? '待补分析',
    completenessLevel: insight?.completenessLevel ?? repository.completenessLevel ?? null,
    nextActionLabel:
      snapshot?.nextAction ? SNAPSHOT_ACTION_LABELS[snapshot.nextAction] : ACTION_LABELS[finalDecision.action],
    tags: buildDecisionTags(repository, moneyPriority),
    hasManualOverride: Boolean(finalDecision.hasManualOverride),
    manualNote: cleanText(repository.analysis?.manualOverride?.note),
    manualUpdatedAt: cleanText(repository.analysis?.manualOverride?.updatedAt),
    moneyPriority,
    targetUsersLabel: moneyPriority.targetUsers,
    monetizationLabel: moneyPriority.monetization,
    recommendedMoveLabel: moneyPriority.recommendedMove,
    worthDoingLabel: pickText(finalDisplay.worthDoingLabelZh),
    categoryLabel: pickText(
      finalDisplay.categoryLabelZh,
      finalDecision.categoryLabelZh,
      fallbackCategory.label,
    ),
    source: finalDecision.source,
    sourceLabel: pickText(finalDisplay.sourceLabelZh, finalDecision.sourceLabelZh, '系统判断'),
    hasConflict: Boolean(finalDecision.hasConflict),
    needsRecheck: Boolean(finalDecision.needsRecheck),
    hasTrainingHints:
      Boolean(finalDecision.hasTrainingHints) ||
      Boolean(trainingAsset?.mistakeTypes?.length || trainingAsset?.suggestions?.length),
    conflictReasons,
    trainingMistakes: trainingAsset?.mistakeTypes ?? [],
    trainingSuggestions: trainingAsset?.suggestions ?? [],
    comparison: {
      localVerdict:
        [finalDecision.comparison?.localVerdict, finalDecision.comparison?.localAction]
          .filter(Boolean)
          .join(' + ') || '暂无',
      claudeVerdict:
        [finalDecision.comparison?.claudeVerdict, finalDecision.comparison?.claudeAction]
          .filter(Boolean)
          .join(' + ') || '暂无',
      localOneLiner:
        pickText(finalDecision.comparison?.localOneLinerZh) || '暂无主分析一句话',
      claudeOneLiner:
        pickText(finalDecision.comparison?.claudeOneLinerZh) ||
        '暂无历史复核一句话',
    },
  };
}

function fallbackTierToMoneyDecision(tier: MoneyPriorityTier): MoneyDecision {
  switch (tier) {
    case 'MUST_LOOK':
      return 'MUST_BUILD';
    case 'WORTH_BUILDING':
      return 'HIGH_VALUE';
    case 'WORTH_CLONING':
      return 'CLONEABLE';
    case 'LOW_PRIORITY':
      return 'LOW_VALUE';
    case 'IGNORE':
    default:
      return 'IGNORE';
  }
}

function normalizeMoneyDecision(value?: MoneyDecision | null): MoneyDecision {
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

function buildDecisionTags(
  repository: RepositoryDecisionTarget,
  moneyPriority: MoneyPriorityDisplay,
) {
  const tags: string[] = [moneyPriority.label];
  const snapshot = repository.analysis?.ideaSnapshotJson;
  const category = getCategoryDisplay(
    snapshot?.category?.main ?? repository.categoryL1,
    snapshot?.category?.sub ?? repository.categoryL2,
  );
  const needsAnalysis = hasMissingAnalysis(repository.analysis);

  if (category.sub) {
    tags.push(category.sub);
  } else if (category.main) {
    tags.push(category.main);
  }

  if (isRecentlyCreated(repository.createdAtGithub)) {
    tags.push('新项目');
  }

  if (snapshot?.nextAction === 'DEEP_ANALYZE') {
    tags.push('值得深读');
  }

  if (moneyPriority.projectTypeLabel && !tags.includes(moneyPriority.projectTypeLabel)) {
    tags.push(moneyPriority.projectTypeLabel);
  }

  if (needsAnalysis) {
    tags.push('待补分析');
  }

  return Array.from(new Set(tags)).slice(0, 4);
}

function hasMissingAnalysis(analysis?: RepositoryAnalysisRecord | null) {
  return !analysis?.ideaFitJson || !analysis?.completenessJson || !analysis?.extractedIdeaJson;
}

function isRecentlyCreated(createdAtGithub?: string | null) {
  if (!createdAtGithub) {
    return false;
  }

  const createdTime = new Date(createdAtGithub).getTime();

  if (Number.isNaN(createdTime)) {
    return false;
  }

  return Date.now() - createdTime <= 30 * 24 * 60 * 60 * 1000;
}

function normalizeCategoryKey(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function cleanText(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : '';
}

function cleanDecisionText(value: unknown) {
  const normalized = cleanText(value);
  if (!normalized) {
    return '';
  }

  if (hasEnglishLeak(normalized) || hasMixedHomepageEnglishLeak(normalized)) {
    return '';
  }

  return normalized;
}

export function localizeAnalysisTerms(value: string) {
  let normalized = value;

  for (const [key, label] of Object.entries(ANALYSIS_TERM_LABELS)) {
    normalized = normalized.replace(new RegExp(`\\b${key}\\b`, 'gi'), label);
  }

  return normalized
    .replace(/\s*\/\s*/g, '、')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeEvidenceDimensionList(value: string) {
  return value
    .replace(/\s*\/\s*/g, '、')
    .replace(/\s*、\s*/g, '、')
    .replace(/[、，,\s]+$/u, '')
    .trim();
}

const EVIDENCE_DIMENSION_REASON_LABELS: Record<string, string> = {
  technical_maturity: '技术成熟度',
  market: '市场空间',
  user: '目标用户',
  users: '目标用户',
  audience: '目标用户',
  problem: '真实问题',
  distribution: '分发路径',
  channel: '分发路径',
  monetization: '收费方式',
  pricing: '收费方式',
  execution: '执行成本',
  retention: '留存表现',
  acquisition: '获客路径',
};

function resolveEvidenceReasonLabel(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return EVIDENCE_DIMENSION_REASON_LABELS[normalized.toLowerCase()] ?? normalized;
}

function extractEvidenceDimensions(value: string) {
  const normalized = localizeAnalysisTerms(value).trim();

  if (!normalized) {
    return [];
  }

  const match =
    normalized.match(/^当前冲突主要集中在(.+?)[。！]?$/u) ??
    normalized.match(/^冲突集中在\s*(.+?)[。！]?$/u) ??
    normalized.match(/^(.+?)这几块证据还偏弱[。！]?$/u) ??
    normalized.match(/^(.+?)证据偏弱[。！]?$/u);

  if (!match?.[1]) {
    return [];
  }

  return Array.from(
    new Set(
      normalizeEvidenceDimensionList(match[1])
        .split(/[、，,]/u)
        .map((item) => resolveEvidenceReasonLabel(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

function formatEvidenceGapClause(value: string) {
  const dimensions = extractEvidenceDimensions(value);

  if (dimensions.length === 0) {
    return null;
  }

  if (/偏弱/u.test(value)) {
    return dimensions.length === 1
      ? `${dimensions[0]}这块证据还偏弱`
      : `${dimensions.join('、')}这几块证据还偏弱`;
  }

  return dimensions.length === 1
    ? `${dimensions[0]}这块判断还没收敛`
    : `${dimensions.join('、')}这几块判断还没收敛`;
}

export function normalizeAnalysisEvidencePhrase(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return '';
  }

  const weakEvidenceMatch = normalized.match(/^(.+?)\s*证据偏弱[。！]?$/u);

  if (weakEvidenceMatch) {
    return `${normalizeEvidenceDimensionList(weakEvidenceMatch[1])}这几块证据还偏弱`;
  }

  const conflictMatch = normalized.match(/^冲突集中在\s*(.+?)[。！]?$/u);

  if (conflictMatch) {
    return `当前冲突主要集中在${normalizeEvidenceDimensionList(conflictMatch[1])}`;
  }

  return normalized;
}

function cleanLocalizedDecisionText(value: unknown) {
  const normalized = cleanText(value);
  if (!normalized) {
    return '';
  }

  return cleanDecisionText(
    normalizeAnalysisEvidencePhrase(localizeAnalysisTerms(normalized)),
  );
}

function pickText(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = cleanText(value);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function pickLocalizedText(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = cleanLocalizedDecisionText(value);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function hasStrongForwardActionPhrase(value: string) {
  return STRONG_FORWARD_ACTION_PATTERNS.some((pattern) => pattern.test(value));
}

function pickConservativeLocalizedText(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = cleanLocalizedDecisionText(value);

    if (normalized && !hasStrongForwardActionPhrase(normalized)) {
      return normalized;
    }
  }

  return '';
}

function isGenericHomepageReason(value: string) {
  return GENERIC_HOMEPAGE_REASON_PATTERNS.some((pattern) => pattern.test(value));
}

function isAbstractSignalReason(value: string) {
  return ABSTRACT_SIGNAL_REASON_PATTERNS.some((pattern) => pattern.test(value));
}

function pickSpecificHomepageReason(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = cleanLocalizedDecisionText(value);

    if (
      normalized &&
      !isGenericHomepageReason(normalized) &&
      !isAbstractSignalReason(normalized)
    ) {
      return normalized;
    }
  }

  return '';
}

function inferTargetUsersFromHeadline(headline: string) {
  const normalized = trimHeadlinePunctuation(headline);

  if (!normalized) {
    return null;
  }

  const finalizeTargetUsers = (
    value: string | null | undefined,
    options: {
      dedicatedScene?: boolean;
    } = {},
  ) => {
    const trimmed = value
      ?.replace(/^一个让/u, '')
      ?.replace(/^为/u, '')
      ?.replace(/^(?:主要)?面向/u, '')
      .replace(/^(?:最)?适合/u, '')
      .replace(/的(?:工具|平台|系统|服务|后端(?:系统|服务)?|扩展|应用|SDK|API|客户端|项目).*$/u, '')
      .replace(/(?:将|通过|利用|借助|在).+$/u, '')
      .replace(/[，。；;：:、]+$/gu, '')
      .trim();

    if (!trimmed) {
      return null;
    }

    if (
      /(用户|开发者|团队|卖家|商家|运营|设计师|学生|老师|创作者|工程师|管理员|企业|公司|组织|研究者|程序员|博主|面试官|销售|客服|产品经理|HR|招聘者)/u.test(
        trimmed,
      )
    ) {
      return trimmed;
    }

    if (options.dedicatedScene) {
      return `${trimmed}场景用户`;
    }

    return trimmed.length <= 10 ? `${trimmed}用户` : trimmed;
  };

  const dedicatedSceneMatch = normalized.match(
    /^(.+?用户)(?:利用|使用|通过|借助).+?进行(.+?)(?:，|。|；|;|并|但|且|$)/u,
  );

  if (dedicatedSceneMatch?.[1] && dedicatedSceneMatch?.[2]) {
    const users = finalizeTargetUsers(dedicatedSceneMatch[1]);
    const scene = dedicatedSceneMatch[2]
      .replace(/[、，,]/gu, '或')
      .replace(/和/gu, '或')
      .trim();

    if (users && scene) {
      return `需要${scene}的 ${users}`;
    }
  }

  const patterns: Array<{
    pattern: RegExp;
    map?: (value: string) => string | null;
    dedicatedScene?: boolean;
  }> = [
    {
      pattern: /^面向(.+?)(?:的|将|通过|利用|借助|在)/u,
    },
    {
      pattern: /^为(.+?)提供/u,
    },
    {
      pattern: /^(.+?用户)(?:利用|使用|通过|借助|在)/u,
    },
    {
      pattern: /^(.+?用户)(?:分析|查看|管理|追踪|记录|生成|同步|搜索|配置)/u,
    },
    {
      pattern: /^一个让(.+?用户)(?:分析|查看|管理|追踪|记录|生成|同步|搜索|配置)/u,
    },
    {
      pattern: /主要面向(.+?)(?:，|。|；|;|并|但|且|$)/u,
    },
    {
      pattern: /面向(.+?)(?:，|。|；|;|并|但|且|$)/u,
    },
    {
      pattern: /专为(.+?)设计/u,
      dedicatedScene: true,
    },
    {
      pattern: /帮助(.+?)(?:进行|完成|管理|处理|接入|搭建|记录|搜索|同步|分析|转录|结算)/u,
    },
    {
      pattern: /^一个帮(.+?)做.+的(?:工具|系统|平台|项目)/u,
    },
  ];

  for (const item of patterns) {
    const matched = normalized.match(item.pattern);

    if (!matched?.[1]) {
      continue;
    }

    const resolved = item.map ? item.map(matched[1]) : matched[1];
    const finalized = finalizeTargetUsers(resolved, {
      dedicatedScene: item.dedicatedScene,
    });

    if (finalized) {
      return finalized;
    }
  }

  return null;
}

type RepositoryMetadataHint = {
  pattern: RegExp;
  subject: string;
  targetUsers: string;
  requiresStrongEvidence?: boolean;
};

const REPOSITORY_METADATA_HINTS: RepositoryMetadataHint[] = [
  {
    pattern:
      /(claude code|context sync|session sync|conversation sync|cross-device sync|sync.*claude)/i,
    subject: '一个用于在设备间同步 Claude Code 会话的工具',
    targetUsers: '跨设备使用 Claude Code 的开发者',
  },
  {
    pattern:
      /(app[- ]store|app store connect|testflight|google play|ios apps?|iphone|swiftui|screenshots?)/i,
    subject: '一个帮 iOS 应用生成 App Store 截图的工具',
    targetUsers: 'iOS 应用开发者和移动产品团队',
  },
  {
    pattern:
      /(meeting|transcri|transcript|voice input|dictat|speech[- ]to[- ]text|speech to text|whisper|voice typing|audio notes|macos)/i,
    subject: '一个面向 macOS 的会议转录和语音输入工具',
    targetUsers: '需要会议转录或语音输入的 macOS 用户',
  },
  {
    pattern:
      /(react[- ]native|expo|mobile[- ]ai|voice[- ]ai|gemini live|ui[- ]automation)/i,
    subject: '一个面向 React Native 应用的自主 AI 代理与自动化测试 SDK',
    targetUsers: 'React Native 开发者和移动应用团队',
  },
  {
    pattern:
      /(parallel ai coding|coding sessions orchestrated from markdown|workflow orchestration for ai coding agents|coding control plane|linear[- ]driven coding|autonomous ticket|merged pr|sandbox ai coding|agent orchestration)/i,
    subject: '一个用于编排并行 AI 编码任务和 PR 流程的工程工作台',
    targetUsers: '需要并行调度 AI 编码任务的开发团队',
  },
  {
    pattern:
      /(ui validation|ui audit|design system|qa engineers?|browser extension for automated ui validation|webpage against them)/i,
    subject: '一个在浏览器里验证 UI 标准并审查页面质量的扩展',
    targetUsers: '前端开发者、设计师和 QA 团队',
  },
  {
    pattern:
      /(bruno[- ]inspired|api client|request interception|browser extension)/i,
    subject: '一个带请求拦截和浏览器扩展能力的 Web API 客户端',
    targetUsers: '需要调试和管理接口请求的开发者',
  },
  {
    pattern:
      /(status dashboard|real[- ]time status|api status|cloudflare workers|runtime metrics)/i,
    subject: '一个展示 AI API 实时状态和运行指标的监控面板',
    targetUsers: '需要监控 AI API 与服务状态的开发团队',
  },
  {
    pattern: /(snippet|code snippet|snippets? manager)/i,
    subject: '一个本地优先的代码片段管理工具',
    targetUsers: '经常复用代码片段的开发者',
  },
  {
    pattern:
      /(playlist|playlists|song search|search songs?|music cli|terminal music|music player)/i,
    subject: '一个用于在命令行里搜索歌曲并管理播放列表的工具',
    targetUsers: '主要在命令行里管理音乐的开发者',
    requiresStrongEvidence: true,
  },
  {
    pattern: /(resume|ats|curriculum vitae|job application|cover letter)/i,
    subject: '一个帮求职者优化简历并生成 ATS 匹配评分的工具',
    targetUsers: '正在求职的开发者和候选人',
  },
  {
    pattern:
      /(cartola|fantasy football|lineup recommender|lineup recommendation|roster|squad builder|match analysis)/i,
    subject: '一个做体育数据分析与阵容推荐的 API 工具',
    targetUsers: '体育数据分析用户和阵容推荐场景用户',
  },
  {
    pattern:
      /(expense|expenses|split bill|bill split|group expense|settlement|travel budget|trip costs?)/i,
      subject: '一个帮小团队记账和自动结算群费的工具',
      targetUsers: '需要分摊出行或活动费用的小团队',
  },
  {
    pattern:
      /(secret|secrets|environment variables?|env vars?|dotenv|token manager|vault|secret manager)/i,
    subject: '一个帮团队管理密钥和环境变量的工具',
    targetUsers: '开发团队和平台工程团队',
    requiresStrongEvidence: true,
  },
  {
    pattern:
      /(?:\bauth\b|auth[-_ ]|authentication|authorization|login|permissions?|rbac|sso|oauth)/i,
    subject: '一个帮应用接入登录和权限能力的工具',
    targetUsers: '需要快速接入登录和权限的开发团队',
  },
];

function getRepositoryMetadataCorpus(repository: RepositoryDecisionTarget) {
  return [
    repository.name,
    repository.fullName,
    repository.description,
    repository.homepage,
    repository.language,
    repository.topics?.join(' '),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
}

function hasStrongRepositoryMetadataHintEvidence(
  repository: RepositoryDecisionTarget,
  pattern: RegExp,
) {
  const coreValues = [
    repository.name,
    repository.fullName,
    repository.description,
    repository.topics?.join(' '),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  let coreHits = 0;
  for (const value of coreValues) {
    if (pattern.test(value)) {
      coreHits += 1;
    }
  }

  if (coreHits > 0) {
    return true;
  }

  const supportValues = [repository.homepage, repository.language].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  let supportHits = 0;
  for (const value of supportValues) {
    if (pattern.test(value)) {
      supportHits += 1;
    }
  }

  return coreHits + supportHits >= 2;
}

function matchRepositoryMetadataHint(repository: RepositoryDecisionTarget) {
  const corpus = getRepositoryMetadataCorpus(repository);

  if (!corpus) {
    return null;
  }

  for (const hint of REPOSITORY_METADATA_HINTS) {
    if (!hint.pattern.test(corpus)) {
      continue;
    }

    if (
      hint.requiresStrongEvidence &&
      !hasStrongRepositoryMetadataHintEvidence(repository, hint.pattern)
    ) {
      continue;
    }

    return hint;
  }

  return null;
}

function inferRepositorySpecificSubject(
  repository: RepositoryDecisionTarget,
  _summary: RepositoryDecisionSummary,
) {
  const hint = matchRepositoryMetadataHint(repository);

  if (hint) {
    return hint.subject;
  }

  const localizedDescription = trimHeadlinePunctuation(repository.description);

  if (
    localizedDescription &&
    !hasEnglishLeak(localizedDescription) &&
    !isGenericOneLiner(localizedDescription)
  ) {
    return localizedDescription;
  }

  return null;
}

function inferRepositoryTargetUsersFromMetadata(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary,
) {
  const hint = matchRepositoryMetadataHint(repository);

  if (hint) {
    return hint.targetUsers;
  }

  const headlineTargetUsers = inferTargetUsersFromHeadline(
    pickHeadlineCandidateText(
      repository.analysis?.ideaSnapshotJson?.oneLinerZh,
      repository.finalDecision?.decisionSummary?.headlineZh,
      repository.finalDecision?.oneLinerZh,
      repository.analysis?.extractedIdeaJson?.ideaSummary,
      repository.analysis?.insightJson?.oneLinerZh,
      repository.description,
    ),
  );

  if (headlineTargetUsers) {
    return headlineTargetUsers;
  }

  const categoryLabel = summary.category.label;

  if (categoryLabel.includes('开发工具') || categoryLabel.includes('CLI')) {
    return '开发者和技术小团队';
  }

  if (categoryLabel.includes('API 平台')) {
    return '开发者和技术团队';
  }

  return null;
}

function cleanHeadlineCandidateText(value: unknown) {
  const normalized = cleanText(value);

  if (!normalized) {
    return '';
  }

  const localized = localizeAnalysisTerms(normalized).replace(/\s+/g, ' ').trim();

  if (!localized) {
    return '';
  }

  if (!hasEnglishLeak(localized) && !hasMixedHomepageEnglishLeak(localized)) {
    return localized;
  }

  const englishTokens = localized.match(/[A-Za-z][A-Za-z0-9-]{1,}/g) ?? [];
  const asciiLetters = (localized.match(/[A-Za-z]/g) ?? []).length;
  const cjkChars = (localized.match(/[\u3400-\u9fff]/g) ?? []).length;
  const allowsMixedProductNames =
    cjkChars >= 6 &&
    englishTokens.length <= 4 &&
    asciiLetters <= 24 &&
    asciiLetters < cjkChars * 2;

  return allowsMixedProductNames ? localized : '';
}

function trimHeadlinePunctuation(text: string | null | undefined) {
  const normalized = cleanHeadlineCandidateText(text)
    .replace(/[。！!？?，,；;：:]+$/gu, '')
    .trim();
  return normalized || null;
}

function looksLikeGenericFallbackSubject(text: string) {
  return /^(一个帮(?:独立)?开发者.+(?:工具|CLI 工具|平台|系统)|一个帮团队.+(?:工具|平台|系统)|一个帮用户.+(?:工具|平台|系统)|把.+(?:工具|CLI 工具|平台|系统))$/u.test(
    text,
  );
}

function isStockFallbackHeadline(text: string) {
  return (
    text === ONE_LINER_LOW_PRIORITY_FALLBACK ||
    text === ONE_LINER_REVIEWING_FALLBACK ||
    text === ONE_LINER_TECHNICAL_FALLBACK ||
    text === HOMEPAGE_LOW_PRIORITY_FALLBACK ||
    text === HOMEPAGE_REVIEWING_FALLBACK
  );
}

function isUnsafeRepositoryHeadline(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  return (
    isStockFallbackHeadline(normalized) ||
    KNOWN_BAD_HEADLINE_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    (/token/i.test(normalized) && /成本明细/.test(normalized)) ||
    (/环境变量/.test(normalized) && /密钥/.test(normalized)) ||
    /播放列表/.test(normalized)
  );
}

function pickHeadlineCandidateText(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = trimHeadlinePunctuation(value as string | null | undefined);

    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function resolveSpecificFallbackSubject(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary,
) {
  const analysisState = getRepositoryAnalysisState(repository);
  const repositoryMetadataHint = matchRepositoryMetadataHint(repository);
  const safeHeadline = [
    repository.analysis?.ideaSnapshotJson?.oneLinerZh,
    repository.finalDecision?.decisionSummary?.headlineZh,
    repository.finalDecision?.oneLinerZh,
    summary.oneLiner,
    repository.analysis?.insightJson?.oneLinerZh,
    repository.analysis?.extractedIdeaJson?.ideaSummary,
    repository.coreAsset?.oneLinerZh,
    repository.description,
  ]
    .map((value) => trimHeadlinePunctuation(value ?? ''))
    .find((value): value is string => {
      if (!value) {
        return false;
      }

      const candidateHint = REPOSITORY_METADATA_HINTS.find((hint) =>
        hint.pattern.test(value),
      );

      if (
        repositoryMetadataHint &&
        candidateHint &&
        candidateHint.subject !== repositoryMetadataHint.subject
      ) {
        return false;
      }

      if (
        repositoryMetadataHint &&
        !candidateHint &&
        looksLikeGenericFallbackSubject(value)
      ) {
        return false;
      }

      return (
        !isGenericOneLiner(value) &&
        !isTemplatedDecisionHeadline(value) &&
        !isUnsafeRepositoryHeadline(value)
      );
    });

  if (safeHeadline) {
    return safeHeadline;
  }

  const metadataSubject = inferRepositorySpecificSubject(repository, summary);

  if (metadataSubject) {
    return metadataSubject;
  }

  const targetUsers = [
    !hasUnclearUserLabel(summary.targetUsersLabel) ? summary.targetUsersLabel : '',
    analysisState?.lightAnalysis?.targetUsers ?? '',
    inferTargetUsersFromHeadline(summary.oneLiner) ?? '',
  ]
    .map((value) => trimHeadlinePunctuation(value))
    .find((value): value is string => Boolean(value));
  const categoryLabel = [
    summary.category.sub,
    summary.moneyPriority.projectTypeLabel,
    summary.category.label,
  ]
    .map((value) => trimHeadlinePunctuation(value))
    .find((value): value is string => Boolean(value) && value !== '待分类');

  if (targetUsers && categoryLabel) {
    return `面向${targetUsers}的${categoryLabel}项目`;
  }

  if (targetUsers) {
    return `面向${targetUsers}的项目`;
  }

  if (categoryLabel) {
    return `一个${categoryLabel}方向项目`;
  }

  return null;
}

function buildSpecificFallbackHeadline(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary,
  mode: 'low_priority' | 'technical' | 'reviewing',
) {
  const finalizeHeadline = (value: string) => {
    const sentence = /[。！？]$/.test(value) ? value : `${value}。`;
    return sentence.length <= 96
      ? sentence
      : `${sentence.slice(0, 95).trimEnd()}…`;
  };
  const reason = pickLocalizedText(
    repository.analysisState?.lightAnalysis?.whyItMatters,
    repository.analysisState?.lightAnalysis?.caution,
    repository.analysis?.ideaSnapshotJson?.reason,
    repository.analysis?.insightJson?.verdictReason,
    summary.verdictReason,
    summary.recommendedMoveLabel,
    repository.analysisState?.lightAnalysis?.nextStep,
  ).replace(/^[，、；：\s]+/, '');
  const subject = resolveSpecificFallbackSubject(repository, summary);
  const evidenceGapClause = formatEvidenceGapClause(reason);

  if (reason) {
    if (evidenceGapClause && subject) {
      return finalizeHeadline(`${subject}，但${evidenceGapClause}。`);
    }

    if (
      subject &&
      mode === 'reviewing' &&
      /(?:证据|冲突|缺少|待补|不够稳|不够清楚)/u.test(reason)
    ) {
      return finalizeHeadline(`${subject}，先结合结论和详情再判断。`);
    }

    if (/^(这个项目|这个方向|当前|README|仓库)/.test(reason)) {
      const subjectLedReason =
        subject && (isGenericHomepageReason(reason) || isAbstractSignalReason(reason))
          ? buildSubjectLedHomepageReason(repository, summary, reason)
          : null;

      return finalizeHeadline(subjectLedReason || reason);
    }

    const reasonLed =
      mode === 'technical'
        ? `这个项目更像技术能力或参考实现，但${reason}`
        : mode === 'low_priority'
          ? summary.action === 'CLONE'
            ? `这个方向可借鉴，但${reason}`
            : `这个项目先观察，${reason}`
          : `这个项目还在补充判断，但${reason}`;

    return finalizeHeadline(reasonLed);
  }

  if (!subject) {
    return null;
  }

  if (mode === 'low_priority') {
    return `${subject}，当前先放观察池。`;
  }

  if (mode === 'technical') {
    return `${subject}，中文摘要还要再校正。`;
  }

  return `${subject}，先结合结论和详情再判断。`;
}

function founderPriorityToMoneyDecision(
  priority: RepositoryFounderPriority,
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
      return 'LOW_VALUE';
  }
}

export function getVerdictTone(verdict: RepositoryVerdict) {
  return {
    GOOD: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    OK: 'border-amber-200 bg-amber-50 text-amber-700',
    BAD: 'border-slate-200 bg-slate-100 text-slate-600',
  }[verdict];
}

export function getActionTone(action: RepositoryAction) {
  return {
    BUILD: 'border-sky-200 bg-sky-50 text-sky-700',
    CLONE: 'border-violet-200 bg-violet-50 text-violet-700',
    IGNORE: 'border-slate-200 bg-slate-100 text-slate-600',
  }[action];
}

export function getMoneyPriorityTone(
  tier: MoneyPriorityTier | RepositoryFounderPriority,
) {
  return {
    P0: 'border-rose-200 bg-rose-50 text-rose-700',
    P1: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    P2: 'border-amber-200 bg-amber-50 text-amber-700',
    P3: 'border-slate-200 bg-slate-100 text-slate-600',
    MUST_LOOK: 'border-rose-200 bg-rose-50 text-rose-700',
    WORTH_BUILDING: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    WORTH_CLONING: 'border-amber-200 bg-amber-50 text-amber-700',
    LOW_PRIORITY: 'border-slate-200 bg-slate-100 text-slate-600',
    IGNORE: 'border-slate-200 bg-slate-100 text-slate-600',
  }[tier] ?? 'border-slate-200 bg-slate-100 text-slate-600';
}

export function isGenericOneLiner(oneLiner: string) {
  const text = oneLiner.trim();

  if (!text) {
    return true;
  }

  return GENERIC_ONE_LINER_PATTERNS.some((pattern) => pattern.test(text));
}

export function isRepositoryDecisionLowConfidence(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
) {
  const validation = getRepositoryHeadlineValidation(repository, summary);
  const oneLinerStrength = getRepositoryOneLinerStrength(repository);

  if (oneLinerStrength === 'WEAK') {
    return true;
  }

  return (
    validation.changed ||
    summary.source === 'fallback' ||
    summary.needsRecheck ||
    summary.hasConflict ||
    isGenericOneLiner(summary.oneLiner) ||
    isTemplatedDecisionHeadline(summary.oneLiner)
  );
}

export function getRepositoryOneLinerStrength(
  repository: RepositoryDecisionTarget,
): RepositoryOneLinerStrength | null {
  return (
    repository.finalDecision?.oneLinerStrength ??
    repository.coreAsset?.oneLinerStrength ??
    null
  );
}

function hasUnclearUserLabel(label: string) {
  const normalized = cleanText(label);
  const asciiTokens = normalized.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? [];
  const cjkChars = (normalized.match(/[\u3400-\u9fff]/g) ?? []).length;
  const englishHeavyUserLabel =
    (cjkChars === 0 && asciiTokens.length >= 3) ||
    (cjkChars <= 2 && asciiTokens.length >= 4 && !normalized.includes('用户'));

  return (
    label.includes('不够清楚') ||
    label.includes('待确认') ||
    label.includes('细分人群') ||
    label.includes('需要进一步确认') ||
    label.includes('还需要再确认') ||
    label.includes('仍需确认') ||
    label.includes('无法识别用户') ||
    label.includes('无法确定目标用户') ||
    englishHeavyUserLabel
  );
}

function hasUnclearMonetizationLabel(label: string) {
  return (
    label.includes('不够清楚') ||
    label.includes('待确认') ||
    label.includes('仍待验证') ||
    label.includes('收费空间') ||
    label.includes('先验证价值') ||
    label.includes('商业化路径不明确')
  );
}

function isGenericSafeTargetUsersLabel(label: string) {
  const normalized = cleanLocalizedDecisionText(label);

  return (
    normalized === '独立开发者和小团队' ||
    normalized === '开发者和小团队' ||
    normalized === '开发者' ||
    normalized === '小团队'
  );
}

function isGenericSafeMonetizationLabel(label: string) {
  const normalized = cleanLocalizedDecisionText(label);

  return (
    normalized === '可以做团队订阅' ||
    normalized === '能，可以直接做成订阅或团队付费产品。' ||
    normalized === '能，已经能看到比较直接的收费路径。' ||
    normalized === '更适合按专业版订阅或团队席位收费。'
  );
}

function pickSpecificTargetUsersText(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = cleanLocalizedDecisionText(value);

    if (
      normalized &&
      !hasUnclearUserLabel(normalized) &&
      !isGenericSafeTargetUsersLabel(normalized)
    ) {
      return normalized;
    }
  }

  return '';
}

function pickSpecificMonetizationText(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = cleanLocalizedDecisionText(value);

    if (
      normalized &&
      !hasUnclearMonetizationLabel(normalized) &&
      !isGenericSafeMonetizationLabel(normalized)
    ) {
      return normalized;
    }
  }

  return '';
}

function inferRepositoryMonetizationHint(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary,
) {
  const corpus = [
    repository.finalDecision?.decisionSummary?.headlineZh,
    repository.finalDecision?.oneLinerZh,
    repository.analysis?.ideaSnapshotJson?.oneLinerZh,
    repository.analysis?.extractedIdeaJson?.ideaSummary,
    repository.analysis?.insightJson?.oneLinerZh,
    repository.analysisState?.lightAnalysis?.whyItMatters,
    summary.oneLiner,
    repository.description,
    summary.categoryLabel,
    summary.moneyPriority.projectTypeLabel,
  ]
    .map((value) => cleanLocalizedDecisionText(value))
    .filter(Boolean)
    .join(' ');

  if (!corpus) {
    return null;
  }

  if (/转录|语音|录音|会议纪要|字幕/u.test(corpus)) {
    return '更适合按专业版订阅、录音时长或团队席位收费。';
  }

  if (/登录|权限|认证|身份|auth/iu.test(corpus)) {
    return '更适合按项目数、活跃用户数或团队版收费。';
  }

  if (/记账|报销|结算|财务|账单/u.test(corpus)) {
    return '更适合按团队席位、组织版或高级自动化能力收费。';
  }

  if (/API|接口|调用|网关|sdk|开发者平台/iu.test(corpus)) {
    return '更适合按调用量、额度包或团队套餐收费。';
  }

  if (/客服|工单|自动回复|知识库|运营/u.test(corpus)) {
    return '更适合按团队席位、自动化处理量或高级协作能力收费。';
  }

  if (/工作流|自动化|流程/u.test(corpus)) {
    return '更适合按任务量、团队席位或高级自动化能力收费。';
  }

  if (/CLI|命令行|开发工具|部署|DevOps|监控|可观测|安全/iu.test(corpus)) {
    return '更适合按专业版订阅、团队版或托管服务收费。';
  }

  return '更适合按专业版订阅或团队席位收费。';
}

function buildSubjectLedHomepageReason(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary,
  reason: string | null | undefined,
) {
  const normalizedReason = cleanLocalizedDecisionText(reason);

  if (!normalizedReason) {
    return null;
  }

  if (
    !isGenericHomepageReason(normalizedReason) &&
    !isAbstractSignalReason(normalizedReason)
  ) {
    return normalizedReason;
  }

  const subject = trimHeadlinePunctuation(resolveSpecificFallbackSubject(repository, summary));

  if (!subject) {
    return normalizedReason;
  }

  const compactReason = normalizedReason.replace(/\s+/g, '');
  const evidenceGapClause = formatEvidenceGapClause(compactReason);

  if (evidenceGapClause) {
    return `${subject}，但${evidenceGapClause}。`;
  }

  if (/^已经有人在用，可以收费/u.test(compactReason)) {
    return `${subject}，已经能看到现实付费路径。`;
  }

  if (/^替代已有工具，有明显优势/u.test(compactReason)) {
    return `${subject}，已经能看出替代现有方案的差异化价值。`;
  }

  if (/^自动化明确场景，可快速落地/u.test(compactReason)) {
    return `${subject}，核心场景已经比较明确，具备快速验证空间。`;
  }

  if (
    /^这个项目更像技术能力或可借鉴方向，但产品边界和付费逻辑还不够清楚，先按可以抄处理更稳/u.test(
      compactReason,
    )
  ) {
    return `${subject}，当前更像能力层或参考实现，产品边界和付费逻辑还不够清楚。`;
  }

  if (
    /^这个方向本身没问题，但同类已经很多，更适合借鉴做法后换个切口/u.test(
      compactReason,
    )
  ) {
    return `${subject}，方向成立，但同类方案已经很多，更适合换个切口再看。`;
  }

  if (
    /^这个方向需求明确，虽然同类不少，但只要切口更准，还是值得继续做/u.test(
      compactReason,
    )
  ) {
    return `${subject}，需求不算伪命题，但同类已经不少，关键要看能不能切出新价值。`;
  }

  if (/^方向不算错，但项目还不够完整，暂时还撑不起一个清晰产品/u.test(compactReason)) {
    return `${subject}，方向不算偏，但当前完成度还不够，暂时撑不起完整产品判断。`;
  }

  if (
    /^(有明确用户和付费路径|有明确付费路径|需求明确，值得优先验证)$/u.test(
      compactReason,
    )
  ) {
    return null;
  }

  return /^冲突集中在/u.test(compactReason)
    ? `${subject}，${compactReason}。`
    : `${subject}，但${compactReason.replace(/[。！？]+$/u, '')}。`;
}

function hasEnglishLeak(text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return false;
  }

  const asciiLetters = (normalized.match(/[A-Za-z]/g) ?? []).length;
  const cjkChars = (normalized.match(/[\u4e00-\u9fff]/g) ?? []).length;

  return asciiLetters >= 10 && asciiLetters > cjkChars * 2;
}

function hasMixedHomepageEnglishLeak(text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return false;
  }

  if (/^[A-Za-z0-9 ,.:;!?'"/#&()_+\-=\\-]+$/.test(normalized)) {
    return /[A-Za-z]{6,}/.test(normalized);
  }

  if (/^(?:[A-Za-z0-9-]+\s+){2,}[A-Za-z0-9-]+[.!?]?$/i.test(normalized)) {
    return true;
  }

  const englishTokens = normalized.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [];

  if (englishTokens.length === 0) {
    return false;
  }

  const asciiLetters = (normalized.match(/[A-Za-z]/g) ?? []).length;
  const cjkChars = (normalized.match(/[\u4e00-\u9fff]/g) ?? []).length;

  if (allowsMixedTechnicalHeadline(englishTokens, asciiLetters, cjkChars)) {
    return false;
  }

  return (
    (englishTokens.length >= 2 && asciiLetters >= 6 && cjkChars >= 4) ||
    (englishTokens.some((token) => token.length >= 5) &&
      asciiLetters >= 6 &&
      cjkChars >= 4) ||
    (englishTokens.length >= 3 && asciiLetters >= 12 && asciiLetters > cjkChars) ||
    englishTokens.some((token) => token.length >= 12)
  );
}

function allowsMixedTechnicalHeadline(
  englishTokens: string[],
  asciiLetters: number,
  cjkChars: number,
) {
  return (
    cjkChars >= 6 &&
    englishTokens.length > 0 &&
    englishTokens.length <= 6 &&
    asciiLetters <= 36 &&
    asciiLetters <= cjkChars * 2 &&
    englishTokens.every((token) => token.length <= 12)
  );
}

export function getRepositoryHeadlineTemplateKey(text: string) {
  return getOneLinerTemplateFamily(text);
}

export function isTemplatedDecisionHeadline(text: string) {
  const normalized = cleanText(text);

  if (!normalized) {
    return false;
  }

  return (
    TEMPLATE_ONE_LINER_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    getRepositoryHeadlineTemplateKey(normalized) !== null
  );
}

function resolveRepositoryProjectType(repository: RepositoryDecisionTarget) {
  return (
    repository.finalDecision?.projectType ??
    repository.analysis?.moneyPriority?.signals?.projectType ??
    repository.analysis?.insightJson?.projectReality?.type ??
    null
  );
}

function resolveRepositorySignals(repository: RepositoryDecisionTarget) {
  const rankingSignals = repository.analysis?.moneyPriority?.signals;
  const projectReality = repository.analysis?.insightJson?.projectReality;

  return {
    projectType: resolveRepositoryProjectType(repository),
    hasRealUser:
      rankingSignals?.hasRealUser ?? Boolean(projectReality?.hasRealUser),
    hasClearUseCase:
      rankingSignals?.hasClearUseCase ?? Boolean(projectReality?.hasClearUseCase),
    isDirectlyMonetizable:
      rankingSignals?.isDirectlyMonetizable ??
      Boolean(projectReality?.isDirectlyMonetizable),
  };
}

function normalizeBehaviorPatternValue(value: string | null | undefined) {
  const normalized = cleanDecisionText(value)
    ?.replace(/\s+/g, ' ')
    .replace(/^当前阶段 ·\s*/, '')
    .replace(/^当前状态 ·\s*/, '')
    .trim();

  if (!normalized || normalized.length < 2) {
    return null;
  }

  return normalized;
}

function buildBehaviorPatternKey(prefix: string, value: string | null | undefined) {
  const normalized = normalizeBehaviorPatternValue(value);
  return normalized ? `${prefix}:${normalized}` : null;
}

function buildRepositoryUseCaseLabel(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary,
) {
  const summaryTags = repository.analysis?.insightJson?.summaryTags ?? [];
  const tagHint = summaryTags
    .map((item) => cleanDecisionText(item))
    .find((item) => item && item.length >= 2);

  return (
    tagHint ||
    summary.category.sub ||
    cleanDecisionText(summary.verdictReason) ||
    cleanDecisionText(summary.moneyPriority.reason) ||
    cleanDecisionText(repository.analysis?.ideaSnapshotJson?.reason) ||
    summary.category.label
  );
}

export function getRepositoryActionBehaviorContext(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
): RepositoryActionBehaviorContext {
  const signals = resolveRepositorySignals(repository);
  const resolvedCategory = resolveRepositoryCategoryDisplay(repository, {
    mainCategory: summary.category.main,
    subCategory: summary.category.sub,
  });
  const targetUsersLabel = getRepositoryDisplayTargetUsersLabel(repository, summary);
  const useCaseLabel = buildRepositoryUseCaseLabel(repository, summary);
  const patternKeys = Array.from(
    new Set(
      [
        buildBehaviorPatternKey('category', resolvedCategory.label),
        buildBehaviorPatternKey('subcategory', resolvedCategory.sub),
        buildBehaviorPatternKey('type', signals.projectType),
        buildBehaviorPatternKey('user', targetUsersLabel),
        buildBehaviorPatternKey('usecase', useCaseLabel),
      ].filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 12);

  return {
    categoryLabel: resolvedCategory.label || null,
    projectType: signals.projectType,
    targetUsersLabel: targetUsersLabel || null,
    useCaseLabel: useCaseLabel || null,
    patternKeys,
    hasRealUser: Boolean(signals.hasRealUser),
    hasClearUseCase: Boolean(signals.hasClearUseCase),
    isDirectlyMonetizable: Boolean(signals.isDirectlyMonetizable),
  };
}

function buildRepositoryHeadlineValidationInput(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary,
): OneLinerPostValidatorInput {
  const signals = resolveRepositorySignals(repository);
  const insightMeta = repository.analysis?.insightJson?.oneLinerMeta;
  const claudeMeta = repository.analysis?.claudeReviewJson?.oneLinerMeta;
  const snapshot = repository.analysis?.ideaSnapshotJson;

  return {
    repoId: repository.id,
    updatedAt: repository.updatedAt,
    repoName: repository.name,
    fullName: repository.fullName,
    oneLinerZh: summary.oneLiner,
    projectType: resolveRepositoryProjectType(repository),
    category: summary.categoryLabel,
    categoryMain: summary.category.main,
    categorySub: summary.category.sub,
    hasRealUser: signals.hasRealUser,
    hasClearUseCase: signals.hasClearUseCase,
    isDirectlyMonetizable: signals.isDirectlyMonetizable,
    verdict: summary.verdict,
    action: summary.action,
    priority: summary.moneyPriority.tier,
    source: summary.source,
    confidence:
      claudeMeta?.confidenceLevel ??
      insightMeta?.confidence ??
      repository.analysis?.confidence ??
      ('analysisConfidence' in repository ? repository.analysisConfidence : null) ??
      null,
    strength: getRepositoryOneLinerStrength(repository),
    targetUsersLabel: summary.targetUsersLabel,
    monetizationLabel: summary.monetizationLabel,
    whyLabel: summary.moneyPriority.reason || summary.verdictReason,
    snapshotPromising:
      typeof snapshot?.isPromising === 'boolean' ? snapshot.isPromising : null,
    snapshotNextAction: cleanText(snapshot?.nextAction),
  };
}

export function getRepositoryHeadlineValidation(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
): RepositoryHeadlineValidation {
  return validateOneLiner(
    buildRepositoryHeadlineValidationInput(repository, summary),
  );
}

export function validateRepositoryHeadlineBatch(
  repositories: RepositoryDecisionTarget[],
) {
  const summaries = repositories.map((repository) =>
    getRepositoryDecisionSummary(repository),
  );
  const results = validateOneLinersBatch(
    repositories.map((repository, index) =>
      buildRepositoryHeadlineValidationInput(repository, summaries[index]),
    ),
  );

  return new Map(
    repositories.map((repository, index) => [repository.id, results[index]]),
  );
}

export function getRepositoryHeadlineValidatorStats() {
  return getOneLinerPostValidatorStats();
}

function pickRepositoryHeadlineFallback(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary,
  validation: RepositoryHeadlineValidation,
) {
  if (
    validation.riskFlags.includes('action_conflict') ||
    validation.riskFlags.includes('priority_conflict') ||
    validation.riskFlags.includes('fallback_overclaim') ||
    validation.riskFlags.includes('snapshot_conflict') ||
    summary.moneyPriority.tier === 'P3' ||
    summary.action === 'IGNORE' ||
    summary.source === 'fallback'
  ) {
    return (
      buildSpecificFallbackHeadline(repository, summary, 'low_priority') ??
      ONE_LINER_LOW_PRIORITY_FALLBACK
    );
  }

  if (
    validation.riskFlags.includes('category_mismatch') ||
    validation.riskFlags.includes('user_conflict') ||
    validation.riskFlags.includes('use_case_conflict') ||
    isStructurallyWeakHomepageCandidate(repository, summary)
  ) {
    return (
      buildSpecificFallbackHeadline(repository, summary, 'technical') ??
      ONE_LINER_TECHNICAL_FALLBACK
    );
  }

  return (
    buildSpecificFallbackHeadline(repository, summary, 'reviewing') ??
    ONE_LINER_REVIEWING_FALLBACK
  );
}

function headlineLooksLikeConcreteProduct(text: string) {
  const normalized = cleanText(text);

  if (!normalized) {
    return false;
  }

  return (
    /^一个帮.+的(?:工具|平台|系统|服务)[。！]?$/.test(normalized) ||
    /一个把.+(?:工具|平台|服务|扩展)/.test(normalized) ||
    /一个给.+提供.+(?:服务|接口)/.test(normalized) ||
    /一个帮.+(?:接入|管理|部署|监控|处理|生成|分析)/.test(normalized)
  );
}

function getRepositoryAnalysisState(
  repository: RepositoryDecisionTarget,
): RepositoryAnalysisStateRecord | null {
  return repository.analysisState ?? null;
}

function looksLikeModelOrInfraCategory(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary,
) {
  const projectType = resolveRepositoryProjectType(repository);
  return (
    projectType === 'model' ||
    projectType === 'infra' ||
    summary.categoryLabel === '待分类' ||
    summary.categoryLabel.includes('基础设施') ||
    summary.categoryLabel.includes('模型')
  );
}

function hasStrongMonetizationClaim(label: string) {
  return STRONG_MONETIZATION_PATTERNS.some((pattern) => pattern.test(label));
}

export function getRepositoryDecisionConflictAudit(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
): RepositoryDecisionConflictAudit {
  const validation = getRepositoryHeadlineValidation(repository, summary);
  const signals = resolveRepositorySignals(repository);
  const flags = new Set(validation.riskFlags);
  const templatedHeadline = validation.templateFamily !== null;
  const unclearUser =
    hasUnclearUserLabel(summary.targetUsersLabel) ||
    !signals.hasRealUser ||
    flags.has('unclear_user');
  const headlineUserConflict = flags.has('user_conflict');
  const headlineCategoryConflict =
    flags.has('category_mismatch') ||
    (headlineLooksLikeConcreteProduct(cleanText(summary.oneLiner)) &&
      looksLikeModelOrInfraCategory(repository, summary));
  const headlineMonetizationConflict =
    flags.has('monetization_overclaim') ||
    (hasStrongMonetizationClaim(summary.monetizationLabel) &&
      (!signals.hasRealUser ||
        !signals.hasClearUseCase ||
        !signals.isDirectlyMonetizable ||
        headlineCategoryConflict ||
        unclearUser));
  const headlineActionConflict =
    flags.has('action_conflict') ||
    flags.has('priority_conflict') ||
    flags.has('fallback_overclaim') ||
    flags.has('snapshot_conflict');

  return {
    headlineUserConflict,
    headlineCategoryConflict,
    headlineMonetizationConflict,
    headlineActionConflict,
    templatedHeadline,
    unclearUser,
    hasConflict:
      headlineUserConflict ||
      headlineCategoryConflict ||
      headlineMonetizationConflict ||
      headlineActionConflict ||
      templatedHeadline,
  };
}

function hasStrictHomepageHeadlineRisk(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary,
) {
  const validation = getRepositoryHeadlineValidation(repository, summary);

  return (
    validation.changed ||
    validation.severity === 'high' ||
    isStructurallyWeakHomepageCandidate(repository, summary)
  );
}

export function hasStrongHomepageHeadline(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
) {
  const validation = getRepositoryHeadlineValidation(repository, summary);
  return !validation.changed && validation.severity === 'none';
}

export function isStructurallyWeakHomepageCandidate(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
) {
  const projectType =
    repository.finalDecision?.projectType ??
    repository.analysis?.moneyPriority?.signals?.projectType ??
    null;

  if (projectType === 'demo' || projectType === 'model') {
    return true;
  }

  const combinedText = [
    summary.categoryLabel,
    summary.moneyPriority.projectTypeLabel,
    summary.oneLiner,
    repository.name,
    repository.fullName,
    repository.description,
  ]
    .filter(Boolean)
    .join(' ');

  return STRUCTURALLY_WEAK_HOMEPAGE_PATTERNS.some((pattern) =>
    pattern.test(combinedText),
  );
}

export function getRepositoryDecisionHeadline(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
  options?: DecisionHeadlineOptions,
) {
  const validation = getRepositoryHeadlineValidation(repository, summary);

  if (options?.forceDegrade) {
    return pickRepositoryHeadlineFallback(repository, summary, validation);
  }

  if (isUnsafeRepositoryHeadline(validation.sanitized)) {
    return pickRepositoryHeadlineFallback(repository, summary, validation);
  }

  return validation.sanitized;
}

export function getRepositoryIdeaExtractStatus(
  repository: RepositoryDecisionTarget,
  relatedJobs?: JobLogItem[] | null,
): RepositoryIdeaExtractStatusDetail {
  const analysis = repository.analysis;
  const analysisState = getRepositoryAnalysisState(repository);
  const mode =
    analysis?.ideaExtractMode === 'full' ||
    analysis?.ideaExtractMode === 'light' ||
    analysis?.ideaExtractMode === 'skip'
      ? analysis.ideaExtractMode
      : analysis?.extractedIdeaJson?.extractMode ?? null;
  const deepStatus = getRepositoryDeepAnalysisStatus(repository, relatedJobs);
  const baseStatus =
    analysis?.ideaExtractStatus ??
    (analysis?.extractedIdeaJson
      ? 'COMPLETED'
      : deepStatus.status === 'SKIPPED_BY_GATE'
        ? 'SKIPPED_BY_GATE'
        : deepStatus.status === 'SKIPPED_BY_STRENGTH'
          ? 'SKIPPED_BY_STRENGTH'
          : 'NOT_STARTED');
  const relevantJob = getLatestMatchingJob(relatedJobs, isIdeaExtractRelatedJob);

  if (relevantJob?.jobStatus === 'RUNNING') {
    return {
      status: 'RUNNING',
      mode,
      reason: analysis?.ideaExtractStatusReason ?? null,
      helperText: '正在补这层分析，稍后刷新就能看到更完整的用户、场景和收费判断。',
    };
  }

  if (relevantJob?.jobStatus === 'PENDING') {
    return {
      status: 'PENDING',
      mode,
      reason: analysis?.ideaExtractStatusReason ?? null,
      helperText: '这层分析已经排队，轮到它时会补齐更完整的产品语言。',
    };
  }

  if (relevantJob?.jobStatus === 'FAILED') {
    return {
      status: 'FAILED',
      mode,
      reason: analysis?.ideaExtractStatusReason ?? 'execution_failed',
      helperText: '这层分析上一次没有跑完，你现在可以立即重试，把用户、场景和收费判断补齐。',
    };
  }

  if (baseStatus === 'COMPLETED') {
    return {
      status: 'COMPLETED',
      mode,
      reason: null,
      helperText:
        mode === 'light'
          ? '当前是轻量分析版本，已经先补齐了用户、场景、收费和为什么值得看。'
          : '这层分析已经完成，可以直接看更完整的产品点子和风险。',
    };
  }

  if (baseStatus === 'SKIPPED_BY_GATE') {
    return {
      status: 'SKIPPED_BY_GATE',
      mode: mode ?? 'skip',
      reason: analysis?.ideaExtractStatusReason ?? deepStatus.reason,
      helperText:
        '基础判断已经完成，但这层深分析没有继续跑；下面会先用 snapshot、README 和主分析结果补一版基础分析。',
    };
  }

  if (baseStatus === 'SKIPPED_BY_STRENGTH') {
    return {
      status: 'SKIPPED_BY_STRENGTH',
      mode: mode ?? 'skip',
      reason: analysis?.ideaExtractStatusReason ?? 'strength_weak',
      helperText: '这类项目当前不会投入更深的点子提取，但下面仍会给你基础分析，方便快速判断。',
    };
  }

  return {
    status:
      analysisState?.analysisStatus === 'DEEP_PENDING' ? 'PENDING' : 'NOT_STARTED',
    mode,
    reason: analysis?.ideaExtractStatusReason ?? null,
    helperText:
      analysisState?.analysisStatus === 'DEEP_PENDING'
        ? '这层分析已经排队，页面先用轻分析兜底，避免你先看到空结果。'
        : '这层分析还没开始，页面会先用已有判断补一版基础分析，避免整块空着。',
  };
}

export function getRepositoryDeepAnalysisStatus(
  repository: RepositoryDecisionTarget,
  relatedJobs?: JobLogItem[] | null,
): RepositoryDeepAnalysisStatusDetail {
  const analysis = repository.analysis;
  const analysisState = getRepositoryAnalysisState(repository);
  const missingSteps: Array<'ideaFit' | 'ideaExtract' | 'completeness'> = [];

  if (!analysis?.ideaFitJson) {
    missingSteps.push('ideaFit');
  }
  if (!analysis?.extractedIdeaJson) {
    missingSteps.push('ideaExtract');
  }
  if (!analysis?.completenessJson) {
    missingSteps.push('completeness');
  }

  const deepJob = getLatestMatchingJob(relatedJobs, isDeepAnalysisRelatedJob);

  if (deepJob?.jobStatus === 'RUNNING') {
    return {
      status: 'RUNNING',
      reason: null,
      label: '正在补跑创业评分',
      helperText: '系统正在补跑创业评分、点子提取或完整性分析，稍后刷新就能看到更完整的判断。',
      missingSteps,
    };
  }

  if (deepJob?.jobStatus === 'PENDING') {
    return {
      status: 'PENDING',
      reason: null,
      label: '已排队等待补分析',
      helperText: '补分析已经排队，轮到它时会继续补齐创业评分、点子提取和完整性分析。',
      missingSteps,
    };
  }

  if (deepJob?.jobStatus === 'FAILED') {
    return {
      status: 'FAILED',
      reason: 'execution_failed',
      label: '补分析失败',
      helperText: '上一次补分析没有跑完；你现在可以直接点击“立即补分析”重新补齐。',
      missingSteps,
    };
  }

  const baseStatus =
    analysis?.deepAnalysisStatus ??
    (analysisState?.analysisStatus === 'DEEP_DONE' ||
    analysisState?.analysisStatus === 'REVIEW_PENDING' ||
    analysisState?.analysisStatus === 'REVIEW_DONE'
      ? 'COMPLETED'
      : analysisState?.analysisStatus === 'DEEP_PENDING'
        ? 'PENDING'
        : analysisState?.analysisStatus === 'SKIPPED_BY_GATE'
          ? 'SKIPPED_BY_GATE'
          : analysis?.ideaExtractStatus === 'SKIPPED_BY_GATE'
            ? 'SKIPPED_BY_GATE'
            : analysis?.ideaExtractStatus === 'SKIPPED_BY_STRENGTH'
              ? 'SKIPPED_BY_STRENGTH'
              : getRepositoryOneLinerStrength(repository) === 'WEAK'
                ? 'SKIPPED_BY_STRENGTH'
                : 'NOT_STARTED');
  const reason =
    analysis?.deepAnalysisStatusReason ?? analysis?.ideaExtractStatusReason ?? null;

  switch (baseStatus) {
    case 'COMPLETED':
      return {
        status: 'COMPLETED',
        reason,
        label:
          analysisState?.analysisStatus === 'REVIEW_PENDING'
            ? '深分析已完成，等待复核'
            : analysisState?.analysisStatus === 'REVIEW_DONE'
              ? '深分析与复核已完成'
              : '深分析已完成',
        helperText:
          missingSteps.length > 0
            ? '关键分析已经有内容可看，但还有个别补充步骤没回填完。'
            : '创业评分、点子提取和完整性分析都已经完成，可以直接往下看。',
        missingSteps,
      };
    case 'SKIPPED_BY_GATE':
      return {
        status: 'SKIPPED_BY_GATE',
        reason,
        label: '已完成基础判断，未进入深分析',
        helperText:
          reason === 'snapshot_not_promising' || reason === 'snapshot_next_action_skip'
            ? 'snapshot 判断这个仓库当前不值得继续进深分析，所以页面先给你一版基础分析和保守结论。'
            : '这次没有进入深分析，页面先用已有字段补一版基础分析，避免整块空着。',
        missingSteps,
      };
    case 'SKIPPED_BY_STRENGTH':
      return {
        status: 'SKIPPED_BY_STRENGTH',
        reason,
        label: '深分析已跳过',
        helperText: '当前信号偏弱，所以没有继续投入更深分析；页面会先展示一版基础判断方便你快速决策。',
        missingSteps,
      };
    case 'NOT_STARTED':
    default:
      return {
        status: 'NOT_STARTED',
        reason,
        label:
          analysisState?.displayStatus === 'TRUSTED_READY'
            ? '基础判断已完成，深分析未完成'
            : '基础判断已完成，补分析尚未开始',
        helperText:
          analysisState?.displayStatus === 'TRUSTED_READY'
            ? '当前已经有可信的基础判断，但创业评分、点子提取和完整性分析还没补齐，页面先按保守结论展示。'
            : '仓库已经完成抓取和基础判断，但创业评分、点子提取和完整性分析还没开始，页面先给你基础 fallback 分析。',
        missingSteps,
      };
  }
}

export function getRepositoryFallbackIdeaAnalysis(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
): RepositoryFallbackIdeaAnalysis {
  const analysisState = getRepositoryAnalysisState(repository);
  const insight = repository.analysis?.insightJson;
  const snapshot = repository.analysis?.ideaSnapshotJson;
  const projectReality = insight?.projectReality;
  const validation = getRepositoryHeadlineValidation(repository, summary);
  const headline = pickRepositoryHeadlineFallback(
    repository,
    summary,
    validation,
  );
  const snapshotSkipped =
    snapshot?.isPromising === false || snapshot?.nextAction === 'SKIP';
  const metadataTargetUsers = inferRepositoryTargetUsersFromMetadata(
    repository,
    summary,
  );
  const displayTargetUsers = getRepositoryDisplayTargetUsersLabel(
    repository,
    summary,
  );
  const shouldPreferDerivedTargetUsers =
    validation.riskFlags.includes('user_conflict') ||
    validation.riskFlags.includes('use_case_conflict') ||
    validation.riskFlags.includes('category_mismatch') ||
    validation.riskFlags.includes('snapshot_conflict') ||
    validation.riskFlags.includes('fallback_overclaim');
  const specificCandidateTargetUsers = pickSpecificTargetUsersText(
    repository.finalDecision?.moneyDecision?.targetUsersZh,
    repository.finalDecision?.decisionSummary?.targetUsersZh,
    analysisState?.lightAnalysis?.targetUsers,
    repository.analysis?.extractedIdeaJson?.targetUsers?.find(Boolean),
    repository.analysis?.moneyPriority?.targetUsersZh,
    !hasUnclearUserLabel(summary.targetUsersLabel)
      ? summary.targetUsersLabel
      : null,
  );
  const candidateTargetUsers = pickLocalizedText(
    analysisState?.lightAnalysis?.targetUsers,
    repository.finalDecision?.moneyDecision?.targetUsersZh,
    repository.finalDecision?.decisionSummary?.targetUsersZh,
    repository.analysis?.extractedIdeaJson?.targetUsers?.find(Boolean),
    repository.analysis?.moneyPriority?.targetUsersZh,
    !hasUnclearUserLabel(summary.targetUsersLabel)
      ? summary.targetUsersLabel
      : null,
  );
  const preferredDisplayTargetUsers =
    displayTargetUsers &&
    !isGenericSafeTargetUsersLabel(displayTargetUsers) &&
    displayTargetUsers !== '先确认谁会持续使用它，再决定要不要继续投入。' &&
    displayTargetUsers !== '目标用户还需要继续确认。'
      ? displayTargetUsers
      : '';
  const safeCandidateTargetUsers =
    !shouldPreferDerivedTargetUsers &&
    (specificCandidateTargetUsers || candidateTargetUsers) &&
    !isGenericSafeTargetUsersLabel(
      specificCandidateTargetUsers || candidateTargetUsers,
    )
      ? specificCandidateTargetUsers || candidateTargetUsers
      : '';
  const targetUsers =
    preferredDisplayTargetUsers ||
    safeCandidateTargetUsers ||
    inferTargetUsersFromHeadline(headline) ||
    metadataTargetUsers ||
    '先从最可能的真实用户访谈开始确认谁会持续使用它。';
  const homepageReason = cleanLocalizedDecisionText(
    getRepositoryHomepageDecisionReason(repository, summary),
  );
  const concreteHomepageReason =
    homepageReason &&
    !isGenericHomepageReason(homepageReason) &&
    !isAbstractSignalReason(homepageReason)
      ? homepageReason
      : '';
  const prioritizedReason =
    buildSubjectLedHomepageReason(
      repository,
      summary,
      pickSpecificHomepageReason(
        isAbstractSignalReason(analysisState?.lightAnalysis?.whyItMatters ?? '')
          ? null
          : analysisState?.lightAnalysis?.whyItMatters,
        cleanDecisionText(snapshot?.reason),
        summary.verdictReason,
        pickConservativeLocalizedText(repository.analysis?.ideaFitJson?.coreJudgement),
        pickConservativeLocalizedText(repository.analysis?.completenessJson?.summary),
        insight?.verdictReason,
      ),
    ) ||
    buildSubjectLedHomepageReason(
      repository,
      summary,
      pickLocalizedText(analysisState?.lightAnalysis?.whyItMatters),
    ) ||
    pickLocalizedText(analysisState?.lightAnalysis?.whyItMatters);
  const monetization =
    pickLocalizedText(
      analysisState?.lightAnalysis?.monetization,
      repository.analysis?.extractedIdeaJson?.monetization,
      repository.analysis?.moneyPriority?.monetizationSummaryZh,
      repository.finalDecision?.moneyDecision?.monetizationSummaryZh,
      repository.finalDecision?.decisionSummary?.monetizationSummaryZh,
      !hasUnclearMonetizationLabel(summary.monetizationLabel)
        ? summary.monetizationLabel
        : null,
    ) ||
    (summary.action === 'BUILD'
      ? '先按团队订阅、专业版或托管服务验证有没有人愿意付费。'
      : '先验证是否有人愿意为这个场景持续付费，再决定是否继续投入。');
  const useCase =
    pickLocalizedText(
      prioritizedReason,
      concreteHomepageReason,
      pickConservativeLocalizedText(repository.analysis?.ideaFitJson?.coreJudgement),
      repository.analysis?.extractedIdeaJson?.ideaSummary,
      pickConservativeLocalizedText(repository.analysis?.completenessJson?.summary),
      analysisState?.lightAnalysis?.nextStep,
      snapshotSkipped ? snapshot?.reason : null,
      insight?.verdictReason,
      summary.verdictReason,
      summary.recommendedMoveLabel,
    ) || '先把这个项目压缩成一个能明确用户、场景和收费方式的最小验证版本。';
  const whyItMatters =
    pickLocalizedText(
      prioritizedReason,
      concreteHomepageReason,
      pickConservativeLocalizedText(repository.analysis?.ideaFitJson?.coreJudgement),
      pickConservativeLocalizedText(repository.analysis?.completenessJson?.summary),
      repository.analysis?.extractedIdeaJson?.ideaSummary,
      snapshotSkipped ? snapshot?.reason : null,
    ) ||
    (snapshotSkipped
      ? '基础判断认为这个项目还不够像独立产品，当前更适合先观察而不是继续重投入。'
      : getRepositoryHomepageDecisionReason(repository, summary));
  const nextStep =
    pickLocalizedText(analysisState?.lightAnalysis?.nextStep) ||
    (snapshotSkipped
      ? '暂不投入，先放进观察池；只有当后面出现更明确用户、独立价值或收费路径时再继续补分析。'
      : summary.action === 'BUILD'
        ? '立即做一个最小可验证版本，再用真实用户确认范围。'
        : summary.action === 'CLONE'
          ? '先快速验证核心场景，再决定要不要继续抄到产品级。'
          : '先放进观察池，除非后面出现更强信号再重新投入。');
  const caution =
    pickLocalizedText(
      analysisState?.lightAnalysis?.caution,
      projectReality?.whyNotProduct,
      snapshotSkipped ? snapshot?.oneLinerZh : null,
    ) || null;

  if (analysisState?.lightAnalysis) {
    return {
      headline,
      targetUsers,
      useCase,
      monetization,
      whyItMatters,
      nextStep,
      caution,
    };
  }

  return {
    headline,
    targetUsers,
    useCase,
    monetization,
    whyItMatters,
    nextStep,
    caution,
  };
}

export function shouldDegradeHomepageHeadline(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
  options: DecisionHeadlineOptions = {},
) {
  const validation = getRepositoryHeadlineValidation(repository, summary);

  if (options.forceDegrade) {
    return true;
  }

  if (
    summary.source === 'fallback' ||
    summary.moneyPriority.tier === 'P3' ||
    summary.action === 'IGNORE' ||
    summary.verdict === 'BAD'
  ) {
    return true;
  }

  if (hasUnclearUserLabel(summary.targetUsersLabel)) {
    return true;
  }

  return (
    validation.changed ||
    getRepositoryDecisionConflictAudit(repository, summary).hasConflict ||
    hasStrictHomepageHeadlineRisk(repository, summary) ||
    isStructurallyWeakHomepageCandidate(repository, summary) ||
    isRepositoryDecisionLowConfidence(repository, summary) ||
    hasEnglishLeak(summary.oneLiner) ||
    isGenericOneLiner(summary.oneLiner)
  );
}

export function getRepositoryHomepageHeadline(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
  options?: DecisionHeadlineOptions,
) {
  return sanitizeHomepageHeadlineStrict(repository, summary, options);
}

export function sanitizeHomepageHeadlineStrict(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
  options?: DecisionHeadlineOptions,
) {
  return sanitizeDecisionHeadlineStrict(repository, summary, options);
}

export function sanitizeDecisionHeadlineStrict(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
  options: DecisionHeadlineOptions = {},
) {
  const validation = getRepositoryHeadlineValidation(repository, summary);

  if (options.forceDegrade) {
    return pickRepositoryHeadlineFallback(repository, summary, validation);
  }

  return validation.sanitized;
}

export function getRepositoryDisplayMonetizationLabel(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
): string {
  const audit = getRepositoryDecisionConflictAudit(repository, summary);
  const validation = getRepositoryHeadlineValidation(repository, summary);
  const signals = resolveRepositorySignals(repository);
  const raw = cleanText(summary.monetizationLabel);
  const lightAnalysisMonetization = pickLocalizedText(
    repository.analysisState?.lightAnalysis?.monetization,
  );
  const extractedIdeaMonetization = pickLocalizedText(
    repository.analysis?.extractedIdeaJson?.monetization,
    repository.analysis?.moneyPriority?.monetizationSummaryZh,
    repository.finalDecision?.moneyDecision?.monetizationSummaryZh,
    repository.finalDecision?.decisionSummary?.monetizationSummaryZh,
  );
  const specificMonetization =
    pickSpecificMonetizationText(lightAnalysisMonetization, extractedIdeaMonetization) ||
    inferRepositoryMonetizationHint(repository, summary);

  if (
      !raw ||
      hasUnclearMonetizationLabel(raw) ||
      isGenericSafeMonetizationLabel(raw) ||
      !signals.hasRealUser ||
      !signals.hasClearUseCase ||
      !signals.isDirectlyMonetizable ||
      summary.moneyPriority.tier === 'P3' ||
      summary.action === 'IGNORE' ||
      audit.unclearUser ||
      audit.headlineCategoryConflict ||
      audit.headlineMonetizationConflict ||
      validation.riskFlags.includes('fallback_overclaim') ||
      validation.riskFlags.includes('snapshot_conflict') ||
      validation.riskFlags.includes('use_case_conflict') ||
      summary.categoryLabel === '待分类' ||
      isStructurallyWeakHomepageCandidate(repository, summary)
  ) {
    if (
      lightAnalysisMonetization &&
      !hasUnclearMonetizationLabel(lightAnalysisMonetization) &&
      !isGenericSafeMonetizationLabel(lightAnalysisMonetization)
    ) {
      return lightAnalysisMonetization;
    }

    if (
      extractedIdeaMonetization &&
      !hasUnclearMonetizationLabel(extractedIdeaMonetization) &&
      !isGenericSafeMonetizationLabel(extractedIdeaMonetization)
    ) {
      return extractedIdeaMonetization;
    }

    if (specificMonetization) {
      return specificMonetization;
    }

    return signals.hasRealUser && signals.hasClearUseCase
      ? '更适合先验证价值，再判断是否具备收费空间。'
      : '收费路径还不够清楚，建议先确认真实用户和场景。';
  }

  return isGenericSafeMonetizationLabel(raw) && specificMonetization
    ? specificMonetization
    : raw;
}

export function getRepositoryDisplayTargetUsersLabel(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
): string {
  const validation = getRepositoryHeadlineValidation(repository, summary);
  const signals = resolveRepositorySignals(repository);
  const raw = cleanText(summary.targetUsersLabel);
  const lightAnalysisTargetUsers = pickLocalizedText(
    repository.analysisState?.lightAnalysis?.targetUsers,
  );
  const finalDecisionTargetUsers = pickLocalizedText(
    repository.finalDecision?.decisionSummary?.targetUsersZh,
    repository.finalDecision?.moneyDecision?.targetUsersZh,
  );
  const extractedIdeaTargetUsers = pickLocalizedText(
    repository.analysis?.extractedIdeaJson?.targetUsers?.find(Boolean),
  );
  const moneyPriorityTargetUsers = pickLocalizedText(
    repository.analysis?.moneyPriority?.targetUsersZh,
  );
  const inferredTargetUsers =
    inferTargetUsersFromHeadline(
      pickHeadlineCandidateText(
        repository.finalDecision?.decisionSummary?.headlineZh,
        repository.finalDecision?.oneLinerZh,
        repository.analysis?.ideaSnapshotJson?.oneLinerZh,
        repository.analysis?.insightJson?.oneLinerZh,
        summary.oneLiner,
        repository.description,
      ),
    ) ||
    inferRepositoryTargetUsersFromMetadata(repository, summary) ||
    null;
  const specificFallbackTargetUsers = pickSpecificTargetUsersText(
    finalDecisionTargetUsers,
    lightAnalysisTargetUsers,
    extractedIdeaTargetUsers,
    moneyPriorityTargetUsers,
    inferredTargetUsers,
  );

  if (
    !raw ||
    !signals.hasRealUser ||
    !signals.hasClearUseCase ||
    hasUnclearUserLabel(raw) ||
    isGenericSafeTargetUsersLabel(raw) ||
    validation.riskFlags.includes('user_conflict') ||
    validation.riskFlags.includes('use_case_conflict') ||
    validation.riskFlags.includes('fallback_overclaim') ||
    validation.riskFlags.includes('snapshot_conflict')
  ) {
    const snapshotLedTargetUsers =
      (validation.riskFlags.includes('snapshot_conflict') ||
        validation.riskFlags.includes('fallback_overclaim')) &&
      raw &&
      !hasUnclearUserLabel(raw) &&
      !isGenericSafeTargetUsersLabel(raw)
        ? inferredTargetUsers ?? raw
        : null;

    if (snapshotLedTargetUsers && !hasUnclearUserLabel(snapshotLedTargetUsers)) {
      return snapshotLedTargetUsers;
    }

    if (specificFallbackTargetUsers) {
      return specificFallbackTargetUsers;
    }

    if (
      lightAnalysisTargetUsers &&
      !hasUnclearUserLabel(lightAnalysisTargetUsers)
    ) {
      return !isGenericSafeTargetUsersLabel(lightAnalysisTargetUsers)
        ? lightAnalysisTargetUsers
        : inferredTargetUsers ?? lightAnalysisTargetUsers;
    }

    if (inferredTargetUsers && !hasUnclearUserLabel(inferredTargetUsers)) {
      return inferredTargetUsers;
    }

    const genericFallbackTargetUsers = [
      finalDecisionTargetUsers,
      lightAnalysisTargetUsers,
      extractedIdeaTargetUsers,
      moneyPriorityTargetUsers,
    ].find(
      (value): value is string =>
        Boolean(value) && !hasUnclearUserLabel(value),
    );

    if (genericFallbackTargetUsers) {
      return genericFallbackTargetUsers;
    }

    return shouldDegradeHomepageHeadline(repository, summary)
      ? '先确认谁会持续使用它，再决定要不要继续投入。'
      : '目标用户还需要继续确认。';
  }

  if (
    inferredTargetUsers &&
    raw &&
    inferredTargetUsers.includes(raw) &&
    inferredTargetUsers.length > raw.length
  ) {
    return inferredTargetUsers;
  }

  return isGenericSafeTargetUsersLabel(raw) && inferredTargetUsers
    ? inferredTargetUsers
    : raw;
}

export function getRepositoryHomepageDecisionReason(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
): string {
  const signals = repository.analysis?.moneyPriority?.signals;
  const validation = getRepositoryHeadlineValidation(repository, summary);
  const snapshot = repository.analysis?.ideaSnapshotJson;
  const prioritizedReason = pickLocalizedText(
    repository.finalDecision?.decisionSummary?.reasonZh,
    repository.finalDecision?.reasonZh,
    repository.finalDecision?.moneyDecision?.reasonZh,
    repository.analysisState?.lightAnalysis?.whyItMatters,
    repository.analysis?.insightJson?.verdictReason,
    summary.moneyPriority.reason,
    summary.verdictReason,
    cleanDecisionText(snapshot?.reason),
  );
  const specificReason = pickSpecificHomepageReason(
    repository.finalDecision?.decisionSummary?.reasonZh,
    repository.finalDecision?.reasonZh,
    repository.finalDecision?.moneyDecision?.reasonZh,
    repository.analysisState?.lightAnalysis?.whyItMatters,
    repository.analysis?.insightJson?.verdictReason,
    summary.moneyPriority.reason,
    summary.verdictReason,
    cleanDecisionText(snapshot?.reason),
    pickConservativeLocalizedText(
      repository.analysis?.ideaFitJson?.coreJudgement,
      repository.analysis?.completenessJson?.summary,
    ),
  );
  const fallbackReason =
    specificReason ||
    pickLocalizedText(
      repository.analysisState?.lightAnalysis?.whyItMatters,
      pickConservativeLocalizedText(
        repository.analysis?.ideaFitJson?.coreJudgement,
        repository.analysis?.completenessJson?.summary,
      ),
      repository.analysis?.extractedIdeaJson?.ideaSummary,
      repository.analysisState?.lightAnalysis?.nextStep,
      cleanDecisionText(snapshot?.reason),
      summary.moneyPriority.reason,
      summary.verdictReason,
    );
  const enrichedSpecificReason = buildSubjectLedHomepageReason(
    repository,
    summary,
    specificReason,
  );
  const enrichedFallbackReason = buildSubjectLedHomepageReason(
    repository,
    summary,
    fallbackReason,
  );
  const normalizedPriorityReason = cleanLocalizedDecisionText(prioritizedReason);
  const preferredPriorityReason =
    normalizedPriorityReason &&
    (isGenericHomepageReason(normalizedPriorityReason) ||
      isAbstractSignalReason(normalizedPriorityReason))
      ? buildSubjectLedHomepageReason(repository, summary, normalizedPriorityReason)
      : null;
  const lowerReason = summary.moneyPriority.reason.toLowerCase();
  const hasDirectMonetization =
    Boolean(signals?.isDirectlyMonetizable) ||
    !hasUnclearMonetizationLabel(summary.monetizationLabel);
  const hasWeakUserSignal = hasUnclearUserLabel(summary.targetUsersLabel);
  const hasWeakUseCaseSignal =
    signals?.hasClearUseCase === false || validation.riskFlags.includes('use_case_conflict');

  if (
    summary.source === 'fallback' ||
    validation.riskFlags.includes('fallback_overclaim') ||
    validation.riskFlags.includes('snapshot_conflict')
  ) {
    return (
      enrichedSpecificReason ||
      preferredPriorityReason ||
      enrichedFallbackReason ||
      '基础判断偏保守，先不要把它当成已经完成的产品机会，优先确认用户、场景和是否值得继续分析。'
    );
  }

  if (
    summary.action === 'IGNORE' ||
    summary.moneyPriority.tier === 'P3' ||
    hasWeakUserSignal ||
    hasWeakUseCaseSignal
  ) {
    return (
      enrichedSpecificReason ||
      preferredPriorityReason ||
      enrichedFallbackReason ||
      '先确认真实用户、场景和投入价值，再决定要不要继续推进。'
    );
  }

  if (enrichedSpecificReason) {
    return enrichedSpecificReason;
  }

  if (preferredPriorityReason) {
    return preferredPriorityReason;
  }

  if (
    hasDirectMonetization &&
    (summary.action === 'BUILD' || summary.moneyPriority.tier === 'P0')
  ) {
    return (
      buildSubjectLedHomepageReason(repository, summary, '已经有人在用，可以收费') ||
      '已经有人在用，可以收费'
    );
  }

  if (
    summary.action === 'CLONE' ||
    lowerReason.includes('替代') ||
    lowerReason.includes('优势') ||
    lowerReason.includes('借鉴')
  ) {
    return (
      buildSubjectLedHomepageReason(repository, summary, '替代已有工具，有明显优势') ||
      '替代已有工具，有明显优势'
    );
  }

  return (
    buildSubjectLedHomepageReason(repository, summary, '自动化明确场景，可快速落地') ||
    '自动化明确场景，可快速落地'
  );
}

export function getRepositoryHomepageMonetizationAnswer(
  repository: RepositoryDecisionTarget,
  summary: RepositoryDecisionSummary = getRepositoryDecisionSummary(repository),
): string {
  const signals = repository.analysis?.moneyPriority?.signals;
  const validation = getRepositoryHeadlineValidation(repository, summary);
  const direct = Boolean(signals?.isDirectlyMonetizable);
  const displayLabel = getRepositoryDisplayMonetizationLabel(repository, summary);
  const lightAnalysisMonetization = pickLocalizedText(
    repository.analysisState?.lightAnalysis?.monetization,
  );
  const extractedIdeaMonetization = pickLocalizedText(
    repository.analysis?.extractedIdeaJson?.monetization,
    repository.analysis?.moneyPriority?.monetizationSummaryZh,
    repository.finalDecision?.moneyDecision?.monetizationSummaryZh,
    repository.finalDecision?.decisionSummary?.monetizationSummaryZh,
  );
  const specificMonetization =
    pickSpecificMonetizationText(
      displayLabel,
      lightAnalysisMonetization,
      extractedIdeaMonetization,
    ) || inferRepositoryMonetizationHint(repository, summary);

  if (
    summary.source === 'fallback' ||
    validation.riskFlags.includes('fallback_overclaim') ||
    validation.riskFlags.includes('snapshot_conflict')
  ) {
    return specificMonetization
      ? specificMonetization
      : '收费路径还不够清楚，建议先确认真实用户和场景。';
  }

  if (displayLabel.includes('收费路径还不够清楚')) {
    return specificMonetization
      ? specificMonetization
      : '收费路径还不够清楚，建议先确认真实用户和场景。';
  }

  if (displayLabel.includes('更适合先验证价值')) {
    return specificMonetization
      ? specificMonetization
      : '更适合先验证价值，再判断是否具备收费空间。';
  }

  if (specificMonetization) {
    return specificMonetization;
  }

  if (direct) {
    return '更适合按专业版订阅或团队席位收费。';
  }

  if (hasUnclearMonetizationLabel(displayLabel)) {
    return '暂时还不明确。';
  }

  return displayLabel;
}

export function getRepositoryAnalysisLayerLabel(
  repository: RepositoryDecisionTarget,
  relatedJobs?: JobLogItem[] | null,
) {
  const analysisState = getRepositoryAnalysisState(repository);
  if (analysisState?.analysisStatus === 'REVIEW_DONE') {
    return '深分析与复核已完成';
  }
  if (analysisState?.analysisStatus === 'REVIEW_PENDING') {
    return '深分析已完成，等待复核';
  }
  if (analysisState?.analysisStatus === 'DEEP_DONE') {
    return '深分析已完成';
  }
  if (analysisState?.analysisStatus === 'DISPLAY_READY') {
    return '基础判断已完成';
  }
  const deepStatus = getRepositoryDeepAnalysisStatus(repository, relatedJobs);

  switch (deepStatus.status) {
    case 'COMPLETED':
      return '深分析已完成';
    case 'RUNNING':
      return '正在补跑深分析';
    case 'PENDING':
      return '深分析排队中';
    case 'FAILED':
      return '补分析失败';
    case 'SKIPPED_BY_GATE':
      return '基础判断已完成';
    case 'SKIPPED_BY_STRENGTH':
      return '深分析已跳过';
    case 'NOT_STARTED':
    default:
      return '基础判断已完成';
  }
}

export function getRepositoryClaudeReviewLabel(
  repository: RepositoryDecisionTarget,
) {
  return repository.finalDecision?.hasClaudeReview
    ? '历史复核已保留'
    : '当前仅主分析';
}

export function compareRepositoriesByInsightPriority(
  left: RepositoryDecisionTarget,
  right: RepositoryDecisionTarget,
) {
  const leftSummary = getRepositoryDecisionSummary(left);
  const rightSummary = getRepositoryDecisionSummary(right);
  const moneyDelta = rightSummary.moneyPriority.score - leftSummary.moneyPriority.score;

  if (moneyDelta !== 0) {
    return moneyDelta;
  }

  const verdictDelta =
    getVerdictPriorityWeight(rightSummary.verdict) -
    getVerdictPriorityWeight(leftSummary.verdict);

  if (verdictDelta !== 0) {
    return verdictDelta;
  }

  const actionDelta =
    getActionPriorityWeight(rightSummary.action) -
    getActionPriorityWeight(leftSummary.action);

  if (actionDelta !== 0) {
    return actionDelta;
  }

  const createdAtGithubDelta =
    (new Date(right.createdAtGithub ?? 0).getTime() || 0) -
    (new Date(left.createdAtGithub ?? 0).getTime() || 0);

  if (createdAtGithubDelta !== 0) {
    return createdAtGithubDelta;
  }

  return (right.ideaFitScore ?? 0) - (left.ideaFitScore ?? 0);
}

export function getCompletenessTone(level?: string | null) {
  if (level === 'HIGH') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (level === 'MEDIUM') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export function getOpportunityTone(level?: RepositoryOpportunityLevel | null) {
  if (level === 'HIGH') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (level === 'MEDIUM') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export function getDecisionTone(decision: RepositoryDecision) {
  if (decision === 'RECOMMENDED') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (decision === 'WATCHLIST') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function getVerdictPriorityWeight(verdict: RepositoryVerdict) {
  return {
    GOOD: 3,
    OK: 2,
    BAD: 1,
  }[verdict];
}

function getActionPriorityWeight(action: RepositoryAction) {
  return {
    BUILD: 3,
    CLONE: 2,
    IGNORE: 1,
  }[action];
}

export function getMoneyPriorityLabel(
  tier: MoneyPriorityTier | RepositoryFounderPriority,
) {
  if (tier in FOUNDER_PRIORITY_LABELS) {
    return FOUNDER_PRIORITY_LABELS[tier as RepositoryFounderPriority];
  }

  return MONEY_TIER_LABELS[tier as MoneyPriorityTier];
}

export function getMoneyDecisionLabel(
  value?: MoneyDecision | null,
  fallbackTier?: MoneyPriorityTier | null,
) {
  const moneyDecision =
    value && value !== 'IGNORE'
      ? normalizeMoneyDecision(value)
      : fallbackTier
        ? fallbackTierToMoneyDecision(fallbackTier)
        : 'IGNORE';

  return MONEY_DECISION_LABELS[moneyDecision];
}

export function normalizeMoneyPriorityScore(
  value?: RepositoryMoneyPriorityRecord | null,
) {
  return value?.moneyScore ?? value?.score ?? 0;
}

function isIdeaExtractRelatedJob(job: JobLogItem) {
  if (job.jobName.includes('idea_extract')) {
    return true;
  }

  if (job.jobName !== 'analysis.run_single') {
    return false;
  }

  const payload = job.payload ?? {};
  if (payload.runIdeaExtract === true) {
    return true;
  }

  const result = job.result;
  if (!result || typeof result !== 'object') {
    return false;
  }

  const steps = (result as Record<string, unknown>).steps;
  return Boolean(steps && typeof steps === 'object' && (steps as Record<string, unknown>).ideaExtract);
}

function isDeepAnalysisRelatedJob(job: JobLogItem) {
  if (
    job.jobName.includes('idea_extract') ||
    job.jobName.includes('idea_fit') ||
    job.jobName.includes('completeness')
  ) {
    return true;
  }

  if (job.jobName !== 'analysis.run_single') {
    return false;
  }

  const payload = job.payload ?? {};
  if (
    payload.runIdeaFit === true ||
    payload.runIdeaExtract === true ||
    payload.runCompleteness === true
  ) {
    return true;
  }

  const result = job.result;
  if (!result || typeof result !== 'object') {
    return false;
  }

  const steps = (result as Record<string, unknown>).steps;
  if (!steps || typeof steps !== 'object') {
    return false;
  }

  const normalized = steps as Record<string, unknown>;
  return Boolean(
    normalized.ideaFit || normalized.ideaExtract || normalized.completeness,
  );
}

function getLatestMatchingJob(
  relatedJobs: JobLogItem[] | null | undefined,
  matcher: (job: JobLogItem) => boolean,
) {
  return (relatedJobs ?? [])
    .filter(matcher)
    .sort((left, right) => {
      const leftTime = toJobTimestamp(left);
      const rightTime = toJobTimestamp(right);
      return rightTime - leftTime;
    })[0];
}

function toJobTimestamp(job: JobLogItem) {
  return (
    Date.parse(job.updatedAt ?? '') ||
    Date.parse(job.finishedAt ?? '') ||
    Date.parse(job.startedAt ?? '') ||
    0
  );
}

function normalizeFounderPriority(
  value?: RepositoryFounderPriority | null,
): RepositoryFounderPriority | null {
  return value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3'
    ? value
    : null;
}
