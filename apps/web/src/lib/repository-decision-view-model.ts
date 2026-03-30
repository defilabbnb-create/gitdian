import { detectRepositoryConflicts } from '@/lib/repository-data-guard';
import {
  getRepositoryActionBehaviorContext,
  getRepositoryAnalysisLayerLabel,
  getRepositoryClaudeReviewLabel,
  getRepositoryDecisionHeadline,
  getRepositoryDecisionSummary,
  getRepositoryDeepAnalysisStatus,
  getRepositoryDisplayMonetizationLabel,
  getRepositoryDisplayTargetUsersLabel,
  getRepositoryFallbackIdeaAnalysis,
  getRepositoryHomepageDecisionReason,
  getRepositoryHomepageHeadline,
  getRepositoryHomepageMonetizationAnswer,
  getRepositoryIdeaExtractStatus,
  isRepositoryDecisionLowConfidence,
  localizeAnalysisTerms,
  normalizeAnalysisEvidencePhrase,
  type RepositoryDecisionSummary,
} from '@/lib/repository-decision';
import {
  JobLogItem,
  RepositoryFounderPriority,
  RepositoryIncompleteReason,
  RepositoryInsightAction,
  RepositoryInsightVerdict,
  RepositoryListItem,
} from '@/lib/types/repository';

type RepositoryDecisionSourceTarget = RepositoryListItem;

type RepositoryDecisionViewModelTarget = Partial<RepositoryListItem> &
  Pick<
    RepositoryListItem,
    'id' | 'fullName' | 'name' | 'stars' | 'isFavorited'
  >;

export type RepositoryDecisionDisplayState =
  | 'trusted'
  | 'provisional'
  | 'degraded';

export type RepositoryDecisionConfidenceLevel = 'high' | 'medium' | 'low';

export type RepositoryDecisionCtaIntent =
  | 'start'
  | 'validate'
  | 'follow_up'
  | 'reference'
  | 'pass'
  | 'fail';

export type RepositoryDecisionCtaOption = {
  title: string;
  description: string;
  intent: RepositoryDecisionCtaIntent;
};

export type RepositoryDecisionDetailActionIntent =
  | 'validate'
  | 'analyze'
  | 'review';

export type RepositoryDecisionAnalysisModuleKey =
  | 'ideaFit'
  | 'ideaExtract'
  | 'completeness';

export type RepositoryDecisionAnalysisModuleViewModel = {
  key: RepositoryDecisionAnalysisModuleKey;
  title: string;
  subtitle: string;
  statusLabel: string;
  coreGapLabel: string;
  evidenceNeededLabel: string;
  detailSummary: string;
  originalAnalysis: string | null;
  detailMetrics: Array<{
    label: string;
    value: string;
  }>;
  runner: {
    step: 'ideaFit' | 'ideaExtract' | 'completeness';
    label: string;
    runningLabel: string;
    successLabel: string;
  };
};

export type RepositoryDecisionViewModel = {
  displayState: RepositoryDecisionDisplayState;
  display: {
    headline: string;
    homepageHeadline: string;
    finalDecisionLabel: string;
    actionLabel: string;
    actionSentence: string;
    priorityLabel: string;
    worthDoingLabel: string;
    targetUsersLabel: string;
    monetizationLabel: string;
    homepageMonetizationLabel: string;
    reason: string;
    caution: string;
  };
  detail: {
    statusLabel: RepositoryDecisionDisplayState;
    primaryActionLabel: string;
    primaryActionDescription: string;
    primaryActionIntent: RepositoryDecisionDetailActionIntent;
    baseJudgementNotice: string | null;
    missingEvidenceLabel: string;
  };
  analysisModules: Record<
    RepositoryDecisionAnalysisModuleKey,
    RepositoryDecisionAnalysisModuleViewModel
  >;
  evidence: {
    comparison: {
      localVerdict: string;
      claudeVerdict: string;
      localOneLiner: string;
      claudeOneLiner: string;
      conflictSummary: string;
    };
  };
  verdict: {
    code: RepositoryInsightVerdict;
    judgementLabel: string;
    label: string;
    displayLabel: string;
  };
  action: {
    code: RepositoryInsightAction;
    toneKey: RepositoryInsightAction;
    label: string;
    sentence: string;
  };
  priority: {
    tier: RepositoryFounderPriority;
    toneTier: RepositoryFounderPriority;
    sourceLabel: string;
    displayLabel: string;
  };
  confidence: {
    level: RepositoryDecisionConfidenceLevel;
    label: string;
    isLow: boolean;
  };
  deep: ReturnType<typeof getRepositoryDeepAnalysisStatus> & {
    hasDeepAnalysis: boolean;
    needsAdditionalAnalysis: boolean;
  };
  behaviorContext: ReturnType<typeof getRepositoryActionBehaviorContext>;
  badges: {
    analysisLayerLabel: string;
    claudeReviewLabel: string;
    hasManualOverride: boolean;
    hasConflict: boolean;
    needsRecheck: boolean;
    hasTrainingHints: boolean;
  };
  flags: {
    fallback: boolean;
    conflict: boolean;
    incomplete: boolean;
    missingKeyAnalysis: boolean;
    hasFinalDecision: boolean;
    hasDeepAnalysis: boolean;
    hasFinalDecisionWithoutDeep: boolean;
    hideFromHomepage: boolean;
    allowStrongClaims: boolean;
    allowStrongMonetization: boolean;
    allowStrongUserPersona: boolean;
    allowStrongAction: boolean;
  };
  cta: {
    heading: string;
    primary: RepositoryDecisionCtaOption;
    secondary: RepositoryDecisionCtaOption;
    tertiary: RepositoryDecisionCtaOption;
    showValidationActions: boolean;
  };
};

const SAFE_TARGET_USERS_LABEL =
  '先确认谁会持续使用它，再决定要不要继续投入。';
const SAFE_MONETIZATION_LABEL =
  '收费路径先按未确认处理，补分析后再判断是否具备收费空间。';
const SAFE_WORTH_DOING_LABEL =
  '先观察，等补分析或关键冲突收口后再决定要不要继续投入。';
const SAFE_CAUTION_LABEL =
  '当前信号还不够稳定，先按更保守的动作处理。';

const DEGRADE_INCOMPLETE_REASONS = new Set<RepositoryIncompleteReason>([
  'NO_SNAPSHOT',
  'NO_INSIGHT',
  'NO_FINAL_DECISION',
  'FALLBACK_ONLY',
  'CONFLICT_HELD_BACK',
  'FAILED_DURING_ANALYSIS',
  'UNKNOWN',
]);

function getRepositoryIncompleteReasons(
  repository: RepositoryDecisionViewModelTarget,
) {
  const analysisState = repository.analysisState;

  if (!analysisState) {
    return [];
  }

  return Array.from(
    new Set(
      [
        analysisState.incompleteReason,
        ...(analysisState.incompleteReasons ?? []),
      ].filter(
        (value): value is RepositoryIncompleteReason => typeof value === 'string',
      ),
    ),
  );
}

function hasRepositoryDeepAnalysis(
  repository: RepositoryDecisionViewModelTarget,
  deepStatus: ReturnType<typeof getRepositoryDeepAnalysisStatus>,
) {
  return (
    repository.analysisState?.deepReady === true ||
    (deepStatus.status === 'COMPLETED' && deepStatus.missingSteps.length === 0)
  );
}

function buildDisplayState(args: {
  hasDeepAnalysis: boolean;
  hasFinalDecisionWithoutDeep: boolean;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
}) {
  if (
    args.hasDeepAnalysis &&
    !args.fallback &&
    !args.conflict &&
    !args.missingKeyAnalysis
  ) {
    return 'trusted' as const;
  }

  if (
    args.hasFinalDecisionWithoutDeep &&
    !args.fallback &&
    !args.conflict &&
    !args.missingKeyAnalysis
  ) {
    return 'provisional' as const;
  }

  return 'degraded' as const;
}

function applyAnalysisStateDisplayFloor(
  displayState: RepositoryDecisionDisplayState,
  repository: RepositoryDecisionViewModelTarget,
) {
  const analysisState = repository.analysisState;

  if (!analysisState) {
    return displayState;
  }

  if (analysisState.frontendDecisionState === 'degraded') {
    return 'degraded' as const;
  }

  if (analysisState.unsafe || analysisState.displayStatus === 'UNSAFE') {
    return 'degraded' as const;
  }

  if (
    analysisState.frontendDecisionState === 'provisional' &&
    displayState === 'trusted'
  ) {
    return 'provisional' as const;
  }

  if (
    displayState === 'trusted' &&
    (analysisState.trustedDisplayReady === false ||
      analysisState.highConfidenceReady === false ||
      analysisState.reviewReady === false ||
      analysisState.fullyAnalyzed === false ||
      analysisState.displayStatus === 'BASIC_READY')
  ) {
    return 'provisional' as const;
  }

  return displayState;
}

function getTrustedActionLabel(action: RepositoryInsightAction) {
  if (action === 'BUILD') {
    return '立即做';
  }

  if (action === 'CLONE') {
    return '快速验证';
  }

  return '暂不投入';
}

function getTrustedActionSentence(action: RepositoryInsightAction) {
  if (action === 'BUILD') {
    return '立即做，优先继续确认范围和落地方式。';
  }

  if (action === 'CLONE') {
    return '快速验证，重点借鉴结构、流程和收费路径。';
  }

  return '暂不投入，除非后面出现新的强信号。';
}

function buildDisplayAction(args: {
  displayState: RepositoryDecisionDisplayState;
  action: RepositoryInsightAction;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
}) {
  if (args.displayState === 'trusted') {
    return {
      toneKey: args.action,
      label: getTrustedActionLabel(args.action),
      sentence: getTrustedActionSentence(args.action),
    };
  }

  if (
    args.displayState === 'provisional' ||
    (!args.fallback && !args.conflict && args.missingKeyAnalysis)
  ) {
    return {
      toneKey: 'IGNORE' as const,
      label: '先补分析',
      sentence: '当前只有基础判断，先补深分析，再决定要不要继续投入。',
    };
  }

  return {
    toneKey: 'IGNORE' as const,
    label: '先观察',
    sentence: '当前信号还不稳定，先观察，等证据补齐后再决定要不要继续投入。',
  };
}

function buildDisplayPriority(
  displayState: RepositoryDecisionDisplayState,
  tier: RepositoryFounderPriority,
  sourceLabel: string,
) {
  if (displayState === 'trusted') {
    return {
      toneTier: tier,
      displayLabel: sourceLabel,
    };
  }

  if (displayState === 'provisional') {
    return {
      toneTier: 'P3' as const,
      displayLabel: `${tier} · 待补分析`,
    };
  }

  return {
    toneTier: 'P3' as const,
    displayLabel: `${tier} · 仅供参考`,
  };
}

function buildDisplayConfidence(
  displayState: RepositoryDecisionDisplayState,
  lowConfidence: boolean,
) {
  if (displayState === 'trusted' && !lowConfidence) {
    return {
      level: 'high' as const,
      label: '高信任',
      isLow: false,
    };
  }

  if (displayState === 'provisional') {
    return {
      level: 'medium' as const,
      label: '中信任',
      isLow: false,
    };
  }

  return {
    level: 'low' as const,
    label: '低信任',
    isLow: true,
  };
}

function normalizeFallbackDisplayValue(value: string | null | undefined) {
  const normalized = value
    ? normalizeAnalysisEvidencePhrase(localizeAnalysisTerms(value).trim())
    : '';
  const latinCharCount = (normalized.match(/[A-Za-z]/g) ?? []).length;
  const chineseCharCount = (normalized.match(/[\u3400-\u9fff]/g) ?? []).length;

  if (latinCharCount >= 8 && chineseCharCount * 4 < latinCharCount) {
    return null;
  }

  return normalized ? normalized : null;
}

function isGenericDecisionReason(value: string | null | undefined) {
  return Boolean(
    value &&
      /^(有明确用户和付费路径|有明确付费路径|需求明确，值得优先验证)[。！]?$/u.test(
        value,
      ),
  );
}

function preferMoreSpecificReason(
  primary: string | null,
  secondary: string | null,
) {
  if (!primary) {
    return secondary;
  }

  if (!secondary) {
    return primary;
  }

  if (isGenericDecisionReason(primary) && !isGenericDecisionReason(secondary)) {
    return secondary;
  }

  if (secondary.includes(primary) && secondary.length > primary.length) {
    return secondary;
  }

  return primary;
}

function isGenericDisplayTargetUsers(value: string | null | undefined) {
  return (
    !value ||
    value === '独立开发者和小团队' ||
    value === '开发者和小团队' ||
    value === '开发者' ||
    value === '小团队' ||
    value === '先确认谁会持续使用它，再决定要不要继续投入。' ||
    value === '目标用户还需要继续确认。'
  );
}

function appendConservativeSuffix(
  base: string | null,
  suffix: string,
) {
  if (!base) {
    return suffix;
  }

  return /[。！？]$/.test(base) ? `${base}${suffix}` : `${base}。${suffix}`;
}

function shouldKeepStandaloneDisplayReason(value: string | null): value is string {
  if (!value) {
    return false;
  }

  return !/^(先确认真实用户|先确认谁会持续使用它|基础判断偏保守|后端最终判断还在补齐|当前先按低优先展示)/u.test(
    value,
  ) && !/(当前仍是 fallback|当前信号存在冲突|深分析还没补齐|关键分析还没补齐|中文摘要还在校正)/u.test(value);
}

function buildDisplayReason(args: {
  displayState: RepositoryDecisionDisplayState;
  repository: RepositoryDecisionViewModelTarget;
  summary: RepositoryDecisionSummary;
  fallbackAnalysis: ReturnType<typeof getRepositoryFallbackIdeaAnalysis>;
  fallback: boolean;
  conflict: boolean;
  hasFinalDecisionWithoutDeep: boolean;
  missingKeyAnalysis: boolean;
}) {
  const homepageReason = normalizeFallbackDisplayValue(
    getRepositoryHomepageDecisionReason(
      args.repository as RepositoryDecisionSourceTarget,
      args.summary,
    ),
  );
  if (args.displayState === 'trusted') {
    return homepageReason ?? '当前结论还不够稳定，先按保守动作处理。';
  }

  const fallbackReason =
    normalizeFallbackDisplayValue(args.fallbackAnalysis.whyItMatters) ??
    normalizeFallbackDisplayValue(args.fallbackAnalysis.useCase);
  const baseReason = preferMoreSpecificReason(homepageReason, fallbackReason);

  if (shouldKeepStandaloneDisplayReason(baseReason)) {
    return baseReason;
  }

  if (args.fallback) {
    return appendConservativeSuffix(
      baseReason,
      '当前仍是 fallback 或兜底判断，先别把它当成已经稳定的产品结论。',
    );
  }

  if (args.conflict) {
    return appendConservativeSuffix(
      baseReason,
      '当前信号存在冲突，先按保守口径处理，等关键证据补齐后再决定。',
    );
  }

  if (args.hasFinalDecisionWithoutDeep) {
    return appendConservativeSuffix(
      baseReason,
      '深分析还没补齐，先别把它当成已验证机会。',
    );
  }

  if (args.missingKeyAnalysis) {
    return appendConservativeSuffix(
      baseReason,
      '关键分析还没补齐，先补分析后再决定要不要继续投入。',
    );
  }

  return baseReason ?? '当前结论还不够稳定，先按保守动作处理。';
}

function buildDisplayCaution(displayState: RepositoryDecisionDisplayState) {
  if (displayState === 'trusted') {
    return '当前没有明显冲突，可以继续进入行动层。';
  }

  return SAFE_CAUTION_LABEL;
}

function buildDisplayWorthDoing(
  displayState: RepositoryDecisionDisplayState,
  summary: RepositoryDecisionSummary,
) {
  return displayState === 'trusted'
    ? summary.worthDoingLabel
    : SAFE_WORTH_DOING_LABEL;
}

function buildDisplayTargetUsers(args: {
  displayState: RepositoryDecisionDisplayState;
  repository: RepositoryDecisionViewModelTarget;
  summary: RepositoryDecisionSummary;
  fallbackAnalysis: ReturnType<typeof getRepositoryFallbackIdeaAnalysis>;
}) {
  const displayTargetUsers = normalizeFallbackDisplayValue(
    getRepositoryDisplayTargetUsersLabel(
      args.repository as RepositoryDecisionSourceTarget,
      args.summary,
    ),
  );
  const fallbackTargetUsers =
    normalizeFallbackDisplayValue(args.fallbackAnalysis.targetUsers) ??
    SAFE_TARGET_USERS_LABEL;

  if (
    fallbackTargetUsers &&
    !/^先/u.test(fallbackTargetUsers) &&
    displayTargetUsers &&
    fallbackTargetUsers.includes(displayTargetUsers) &&
    fallbackTargetUsers.length > displayTargetUsers.length
  ) {
    return fallbackTargetUsers;
  }

  if (
    args.displayState !== 'trusted' &&
    /^先/u.test(fallbackTargetUsers) &&
    isGenericDisplayTargetUsers(displayTargetUsers)
  ) {
    return fallbackTargetUsers;
  }

  if (
    displayTargetUsers &&
    !isGenericDisplayTargetUsers(displayTargetUsers)
  ) {
    return displayTargetUsers;
  }

  return args.displayState === 'trusted' && displayTargetUsers
    ? displayTargetUsers
    : fallbackTargetUsers;
}

function buildDisplayMonetization(args: {
  displayState: RepositoryDecisionDisplayState;
  repository: RepositoryDecisionViewModelTarget;
  summary: RepositoryDecisionSummary;
  fallbackAnalysis: ReturnType<typeof getRepositoryFallbackIdeaAnalysis>;
}) {
  if (args.displayState !== 'trusted') {
    const fallbackMonetization =
      normalizeFallbackDisplayValue(args.fallbackAnalysis.monetization) ??
      SAFE_MONETIZATION_LABEL;

    return {
      monetizationLabel: fallbackMonetization,
      homepageMonetizationLabel: fallbackMonetization,
    };
  }

  return {
    monetizationLabel: getRepositoryDisplayMonetizationLabel(
      args.repository as RepositoryDecisionSourceTarget,
      args.summary,
    ),
    homepageMonetizationLabel: getRepositoryHomepageMonetizationAnswer(
      args.repository as RepositoryDecisionSourceTarget,
      args.summary,
    ),
  };
}

function buildDisplayVerdict(
  displayState: RepositoryDecisionDisplayState,
  summary: RepositoryDecisionSummary,
) {
  if (displayState === 'trusted') {
    return summary.finalDecisionLabel;
  }

  if (displayState === 'provisional') {
    return '基础判断 · 仅供参考';
  }

  return '保守判断 · 仅供参考';
}

function mapMissingStepLabel(step: 'ideaFit' | 'ideaExtract' | 'completeness') {
  if (step === 'ideaFit') {
    return 'Idea Fit';
  }

  if (step === 'ideaExtract') {
    return 'Idea Extraction';
  }

  return 'Completeness';
}

function getDetailEvidenceLabel(args: {
  deep: ReturnType<typeof getRepositoryDeepAnalysisStatus>;
  fallback: boolean;
  conflict: boolean;
  hasFinalDecisionWithoutDeep: boolean;
  missingKeyAnalysis: boolean;
}) {
  if (args.deep.missingSteps.length > 0) {
    return `还缺 ${args.deep.missingSteps.map(mapMissingStepLabel).join('、')}`;
  }

  if (args.hasFinalDecisionWithoutDeep || args.missingKeyAnalysis) {
    return '还缺稳定的 deep 证据，先补齐后再决定是否继续投入。';
  }

  if (args.conflict) {
    return '关键分析已补齐，但当前还缺冲突校准和复核结论。';
  }

  if (args.fallback) {
    return '关键分析已补齐，但当前仍命中 fallback，需要补稳定的非兜底结论。';
  }

  return '关键 deep 证据已经补齐';
}

function selectDetailPrimaryAction(args: {
  displayState: RepositoryDecisionDisplayState;
  deep: ReturnType<typeof getRepositoryDeepAnalysisStatus>;
  fallback: boolean;
  conflict: boolean;
  hasFinalDecisionWithoutDeep: boolean;
  missingKeyAnalysis: boolean;
}) {
  const needsAdditionalAnalysis =
    args.deep.missingSteps.length > 0 ||
    args.hasFinalDecisionWithoutDeep ||
    args.missingKeyAnalysis;

  if (
    !needsAdditionalAnalysis &&
    !args.conflict &&
    !args.fallback &&
    (args.displayState === 'trusted' || args.displayState === 'provisional')
  ) {
    return {
      label: '开始验证',
      description:
        args.displayState === 'trusted'
          ? '先用最短路径验证这个判断是否值得继续推进。'
          : '关键分析已补齐，虽然还在待复核，但已经可以先验证最核心假设。',
      intent: 'validate' as const,
      baseJudgementNotice:
        args.displayState === 'trusted'
          ? null
          : '关键分析已补齐，但当前仍待最终复核。',
    };
  }

  if (needsAdditionalAnalysis) {
    return {
      label: '先补分析',
      description: '这是基础判断，不是最终可信结论，先补 deep 再决定是否继续投入。',
      intent: 'analyze' as const,
      baseJudgementNotice: '这是基础判断，不是最终可信结论。',
    };
  }

  if (args.conflict) {
    return {
      label: '先观察',
      description: '关键分析已补齐，但当前结论存在冲突，先看证据和复核口径，不进入强推进。',
      intent: 'review' as const,
      baseJudgementNotice: '当前存在冲突，先按保守结论展示。',
    };
  }

  if (args.fallback) {
    return {
      label: '先观察',
      description: '关键分析已补齐，但当前仍命中 fallback，先按参考信息处理，不进入强推进。',
      intent: 'review' as const,
      baseJudgementNotice: '当前仍命中 fallback，先按保守结论展示。',
    };
  }

  return {
    label: '先观察',
    description: '当前结论暂不进入强推进，先看证据，再决定是否继续投入。',
    intent: 'review' as const,
    baseJudgementNotice: '当前先按保守结论展示。',
  };
}

function buildDetailFields(args: {
  displayState: RepositoryDecisionDisplayState;
  deep: ReturnType<typeof getRepositoryDeepAnalysisStatus>;
  fallback: boolean;
  conflict: boolean;
  hasFinalDecisionWithoutDeep: boolean;
  missingKeyAnalysis: boolean;
}) {
  const primaryAction = selectDetailPrimaryAction(args);

  return {
    statusLabel: args.displayState,
    primaryActionLabel: primaryAction.label,
    primaryActionDescription: primaryAction.description,
    primaryActionIntent: primaryAction.intent,
    baseJudgementNotice: primaryAction.baseJudgementNotice,
    missingEvidenceLabel: getDetailEvidenceLabel(args),
  };
}

function getIdeaExtractStatusLabel(
  status: ReturnType<typeof getRepositoryIdeaExtractStatus>['status'],
) {
  switch (status) {
    case 'COMPLETED':
      return '证据已补齐';
    case 'RUNNING':
      return '补跑中';
    case 'PENDING':
      return '排队中';
    case 'FAILED':
      return '补跑失败';
    case 'SKIPPED_BY_GATE':
      return '基础判断已完成';
    case 'SKIPPED_BY_STRENGTH':
      return '已按强度跳过';
    case 'NOT_STARTED':
    default:
      return '待补分析';
  }
}

function getCollapsedModuleStatusLabel(args: {
  completed: boolean;
  displayState: RepositoryDecisionDisplayState;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
  defaultMissingLabel: string;
}) {
  if (!args.completed) {
    return args.defaultMissingLabel;
  }

  if (args.displayState === 'trusted') {
    return '证据已补齐';
  }

  if (args.missingKeyAnalysis) {
    return '局部已补齐，仍缺其他证据';
  }

  if (args.conflict) {
    return '证据已补齐，但结论受限';
  }

  if (args.fallback) {
    return '证据已补齐，但当前仅供参考';
  }

  return '证据已补齐';
}

function getHeldBackModuleSummary(args: {
  displayState: RepositoryDecisionDisplayState;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
}) {
  if (args.displayState === 'trusted') {
    return null;
  }

  if (args.missingKeyAnalysis) {
    return '这一层就算局部补齐，整页仍缺关键证据，先按保守口径展示。';
  }

  if (args.conflict) {
    return '这一层已有结果，但当前冲突未解，先不要把它当成可推进判断。';
  }

  if (args.fallback) {
    return '这一层已有结果，但当前仍命中 fallback，先按参考信息处理。';
  }

  return '当前先按保守口径展示，不把这一层结果直接升级成行动结论。';
}

function normalizeOriginalAnalysis(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function buildHeldBackSummary(
  rawBase: string | null,
  args: {
    displayState: RepositoryDecisionDisplayState;
    fallback: boolean;
    conflict: boolean;
    missingKeyAnalysis: boolean;
  },
) {
  const base =
    rawBase &&
    /(立即做|可以继续投入|值得优先验证|值得继续推进|验证通过（可做）|开始验证)/.test(
      rawBase,
    )
      ? null
      : rawBase;
  const heldBackSummary =
    getHeldBackModuleSummary(args) ??
    '当前先按保守口径展示，不把这一层结果直接升级成行动结论。';

  if (!base) {
    return heldBackSummary;
  }

  return appendConservativeSuffix(base, heldBackSummary);
}

function buildIdeaFitDetailSummary(args: {
  ideaFit?: {
    opportunityLevel?: string | null;
    negativeFlags?: string[] | null;
    opportunityTags?: string[] | null;
    coreJudgement?: string | null;
  } | null;
  displayState: RepositoryDecisionDisplayState;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
}): string {
  if (args.displayState !== 'trusted') {
    return buildHeldBackSummary(
      normalizeFallbackDisplayValue(args.ideaFit?.coreJudgement) ??
        (args.ideaFit?.opportunityLevel
          ? `当前机会层级 ${args.ideaFit.opportunityLevel}`
          : null),
      args,
    );
  }

  if (!args.ideaFit) {
    return '这层分析还没开始，先补齐创业评分和机会层级。';
  }

  const level = args.ideaFit.opportunityLevel ?? '待补齐';
  const firstTag = args.ideaFit.opportunityTags?.find(Boolean);
  const riskCount = args.ideaFit.negativeFlags?.filter(Boolean).length ?? 0;

  if (riskCount > 0) {
    return `当前机会层级 ${level}，但还有 ${riskCount} 个待确认风险，先结合主结论谨慎推进。`;
  }

  if (firstTag) {
    return `当前机会层级 ${level}，这层最关键的信号是“${firstTag}”。`;
  }

  return `当前机会层级 ${level}，创业价值这层证据已经补齐。`;
}

function buildIdeaExtractDetailSummary(args: {
  extractedIdea?: {
    ideaSummary?: string | null;
    extractMode?: string | null;
    targetUsers?: string[] | null;
    monetization?: string | null;
  } | null;
  displayState: RepositoryDecisionDisplayState;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
  helperText: string;
}): string {
  if (args.displayState !== 'trusted') {
    const targetUser = normalizeFallbackDisplayValue(
      args.extractedIdea?.targetUsers?.find(Boolean),
    );
    const monetization = normalizeFallbackDisplayValue(
      args.extractedIdea?.monetization,
    );
    const summary = [
      normalizeFallbackDisplayValue(args.extractedIdea?.ideaSummary),
      targetUser ? `目标用户：${targetUser}` : null,
      monetization ? `收费路径：${monetization}` : null,
    ]
      .filter(Boolean)
      .join('；');

    return buildHeldBackSummary(summary || null, args);
  }

  if (!args.extractedIdea) {
    return args.helperText;
  }

  const targetUser = args.extractedIdea.targetUsers?.find(Boolean);
  const monetization = normalizeFallbackDisplayValue(args.extractedIdea.monetization);
  const extractMode = args.extractedIdea.extractMode ?? '待补齐';

  if (targetUser && monetization) {
    return `这一层已经补齐一句话点子、目标用户和收费路径，当前聚焦的用户是“${targetUser}”，收费路径是“${monetization}”。`;
  }

  if (targetUser) {
    return `这一层已经补齐一句话点子和目标用户，当前聚焦的用户是“${targetUser}”。`;
  }

  if (monetization) {
    return `这一层已经补齐点子提取结果和收费路径，当前收费判断是“${monetization}”。`;
  }

  return `这一层已经补齐点子提取结果，当前提取模式为 ${extractMode}。`;
}

function buildCompletenessDetailSummary(args: {
  completeness?: {
    completenessLevel?: string | null;
    summary?: string | null;
    runability?: string | null;
  } | null;
  repositoryLevel?: string | null;
  displayState: RepositoryDecisionDisplayState;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
}): string {
  if (args.displayState !== 'trusted') {
    return buildHeldBackSummary(
      normalizeFallbackDisplayValue(args.completeness?.summary) ??
        ((args.completeness?.completenessLevel ?? args.repositoryLevel)
          ? `当前完整性等级 ${args.completeness?.completenessLevel ?? args.repositoryLevel ?? '待补齐'}`
          : null),
      args,
    );
  }

  const level =
    args.completeness?.completenessLevel ?? args.repositoryLevel ?? '待补齐';
  const runability = args.completeness?.runability;

  if (runability) {
    return `当前完整性等级 ${level}，落地成本判断偏 ${runability}。`;
  }

  return `当前完整性等级 ${level}，已经可以用来判断工程成熟度和落地成本。`;
}

function buildIdeaFitModule(args: {
  repository: RepositoryDecisionViewModelTarget;
  displayState: RepositoryDecisionDisplayState;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
  detail: {
    missingEvidenceLabel: string;
  };
}) {
  const ideaFit = args.repository.analysis?.ideaFitJson;
  const completed = Boolean(ideaFit);
  const statusLabel = getCollapsedModuleStatusLabel({
    completed,
    displayState: args.displayState,
    fallback: args.fallback,
    conflict: args.conflict,
    missingKeyAnalysis: args.missingKeyAnalysis,
    defaultMissingLabel: '待补分析',
  });

  return {
    key: 'ideaFit' as const,
    title: 'Idea Fit',
    subtitle: '创业价值判断',
    statusLabel,
    coreGapLabel: completed
      ? args.displayState === 'trusted'
        ? `机会层级 ${ideaFit?.opportunityLevel ?? '已补齐'}`
        : '这一层结果已回填，但当前整页仍按保守口径展示'
      : '还缺创业评分、机会层级和负向信号',
    evidenceNeededLabel: completed
      ? args.displayState === 'trusted'
        ? '这层关键证据已经补齐'
        : args.detail.missingEvidenceLabel
      : '补创业评分、机会层级和负向信号',
    detailSummary: buildIdeaFitDetailSummary({
      ideaFit,
      displayState: args.displayState,
      fallback: args.fallback,
      conflict: args.conflict,
      missingKeyAnalysis: args.missingKeyAnalysis,
    }),
    originalAnalysis: normalizeOriginalAnalysis(ideaFit?.coreJudgement),
    detailMetrics: [
      {
        label: '机会层级',
        value: ideaFit?.opportunityLevel ?? '待补齐',
      },
      {
        label: '核心判断',
        value:
          args.displayState === 'trusted'
            ? normalizeFallbackDisplayValue(ideaFit?.coreJudgement) ?? statusLabel
            : '当前按保守口径展示',
      },
      {
        label: '证据状态',
        value: statusLabel,
      },
    ],
    runner: {
      step: 'ideaFit' as const,
      label: '补创业评分',
      runningLabel: '创业评分补跑中...',
      successLabel: '创业评分已加入队列，稍后刷新就能看到新的判断。',
    },
  };
}

function buildIdeaExtractModule(args: {
  repository: RepositoryDecisionViewModelTarget;
  relatedJobs?: JobLogItem[] | null;
  displayState: RepositoryDecisionDisplayState;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
  detail: {
    missingEvidenceLabel: string;
  };
}) {
  const extractedIdea = args.repository.analysis?.extractedIdeaJson;
  const ideaExtractStatus = getRepositoryIdeaExtractStatus(
    args.repository as RepositoryDecisionSourceTarget,
    args.relatedJobs,
  );
  const completed = Boolean(extractedIdea);
  const statusLabel = completed
    ? getCollapsedModuleStatusLabel({
        completed,
        displayState: args.displayState,
        fallback: args.fallback,
        conflict: args.conflict,
        missingKeyAnalysis: args.missingKeyAnalysis,
        defaultMissingLabel: '待补分析',
      })
    : getIdeaExtractStatusLabel(ideaExtractStatus.status);

  return {
    key: 'ideaExtract' as const,
    title: 'Idea Extraction',
    subtitle: '用户、场景和收费表述',
    statusLabel,
    coreGapLabel: completed
      ? args.displayState === 'trusted'
        ? '一句话点子、用户场景和收费表述已补齐'
        : '这一层结果已回填，但当前整页仍按保守口径展示'
      : '还缺一句话点子、用户场景和收费表述',
    evidenceNeededLabel: completed
      ? args.displayState === 'trusted'
        ? '这层关键证据已经补齐'
        : args.detail.missingEvidenceLabel
      : '补一句话点子、用户场景和收费表述',
    detailSummary: buildIdeaExtractDetailSummary({
      extractedIdea,
      displayState: args.displayState,
      fallback: args.fallback,
      conflict: args.conflict,
      missingKeyAnalysis: args.missingKeyAnalysis,
      helperText: ideaExtractStatus.helperText,
    }),
    originalAnalysis: normalizeOriginalAnalysis(extractedIdea?.ideaSummary),
    detailMetrics: [
      {
        label: '提取模式',
        value: extractedIdea?.extractMode ?? ideaExtractStatus.mode ?? '待补齐',
      },
      {
        label: '目标用户',
        value:
          normalizeFallbackDisplayValue(extractedIdea?.targetUsers?.find(Boolean)) ??
          statusLabel,
      },
      {
        label: '收费路径',
        value:
          normalizeFallbackDisplayValue(extractedIdea?.monetization) ?? statusLabel,
      },
    ],
    runner: {
      step: 'ideaExtract' as const,
      label: '补点子提取',
      runningLabel: '点子提取补跑中...',
      successLabel: '点子提取已加入队列，稍后刷新就能看到新的结果。',
    },
  };
}

function buildCompletenessModule(args: {
  repository: RepositoryDecisionViewModelTarget;
  displayState: RepositoryDecisionDisplayState;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
  detail: {
    missingEvidenceLabel: string;
  };
}) {
  const completeness = args.repository.analysis?.completenessJson;
  const completed = Boolean(completeness);
  const statusLabel = getCollapsedModuleStatusLabel({
    completed,
    displayState: args.displayState,
    fallback: args.fallback,
    conflict: args.conflict,
    missingKeyAnalysis: args.missingKeyAnalysis,
    defaultMissingLabel: '待补分析',
  });

  return {
    key: 'completeness' as const,
    title: 'Completeness',
    subtitle: '完整性与可落地性',
    statusLabel,
    coreGapLabel: completed
      ? args.displayState === 'trusted'
        ? `完整性等级 ${completeness?.completenessLevel ?? args.repository.completenessLevel ?? '已补齐'}`
        : '这一层结果已回填，但当前整页仍按保守口径展示'
      : '还缺完整性等级、工程成熟度和可落地成本判断',
    evidenceNeededLabel: completed
      ? args.displayState === 'trusted'
        ? '这层关键证据已经补齐'
        : args.detail.missingEvidenceLabel
      : '补完整性等级、工程成熟度和可落地成本判断',
    detailSummary: buildCompletenessDetailSummary({
      completeness,
      repositoryLevel: args.repository.completenessLevel ?? null,
      displayState: args.displayState,
      fallback: args.fallback,
      conflict: args.conflict,
      missingKeyAnalysis: args.missingKeyAnalysis,
    }),
    originalAnalysis: normalizeOriginalAnalysis(completeness?.summary),
    detailMetrics: [
      {
        label: '完整性等级',
        value:
          completeness?.completenessLevel ??
          args.repository.completenessLevel ??
          '待补齐',
      },
      {
        label: '落地成本',
        value: normalizeFallbackDisplayValue(completeness?.runability) ?? statusLabel,
      },
      {
        label: '证据状态',
        value: statusLabel,
      },
    ],
    runner: {
      step: 'completeness' as const,
      label: '补完整性分析',
      runningLabel: '完整性分析补跑中...',
      successLabel: '完整性分析已加入队列，稍后刷新就能看到新的结果。',
    },
  };
}

function buildEvidenceComparison(args: {
  summary: RepositoryDecisionSummary;
  fallback: boolean;
  conflict: boolean;
  missingKeyAnalysis: boolean;
}) {
  return {
    localVerdict: args.summary.comparison.localVerdict,
    claudeVerdict: args.summary.comparison.claudeVerdict,
    localOneLiner: args.summary.comparison.localOneLiner,
    claudeOneLiner: args.summary.comparison.claudeOneLiner,
    conflictSummary: args.conflict
      ? args.summary.conflictReasons.length
        ? args.summary.conflictReasons.join('、')
        : '当前存在冲突或复核未收口，先按保守口径处理。'
      : args.fallback
        ? '当前仍命中 fallback，先不要把这组比较当成最终可信结论。'
        : args.missingKeyAnalysis
          ? '关键分析还没补齐，这里的比较先按参考信息处理。'
          : '当前没有明显冲突',
  };
}

function buildHeadline(
  repository: RepositoryDecisionViewModelTarget,
  summary: RepositoryDecisionSummary,
  displayState: RepositoryDecisionDisplayState,
) {
  const forceDegrade = displayState !== 'trusted';

  return {
    headline: getRepositoryDecisionHeadline(
      repository as RepositoryDecisionSourceTarget,
      summary,
      {
      forceDegrade,
      },
    ),
    homepageHeadline: getRepositoryHomepageHeadline(
      repository as RepositoryDecisionSourceTarget,
      summary,
      {
      forceDegrade,
      },
    ),
  };
}

function buildCta(displayState: RepositoryDecisionDisplayState) {
  if (displayState === 'trusted') {
    return {
      heading: '现在就开始行动',
      primary: {
        title: '开始验证',
        description: '先进入详情页验证最关键的证据和路径。',
        intent: 'validate' as const,
      },
      secondary: {
        title: '加入跟进列表',
        description: '把它放进你的长期推进池，并同步到任务页。',
        intent: 'follow_up' as const,
      },
      tertiary: {
        title: '查看详情',
        description: '先保留为参考，再去详情页看完整证据。',
        intent: 'reference' as const,
      },
      showValidationActions: false,
    };
  }

  if (displayState === 'provisional') {
    return {
      heading: '先补分析，再决定下一步',
      primary: {
        title: '先补分析',
        description: '先确认用户、场景和收费路径，再决定要不要继续投入。',
        intent: 'validate' as const,
      },
      secondary: {
        title: '加入跟进列表',
        description: '先把它放进观察列表，等深分析补齐后再回看。',
        intent: 'follow_up' as const,
      },
      tertiary: {
        title: '查看详情',
        description: '先按未验证机会处理，后面有新信号再回看。',
        intent: 'reference' as const,
      },
      showValidationActions: false,
    };
  }

  return {
    heading: '先按保守口径处理',
    primary: {
      title: '先观察',
      description: '当前信号还不稳定，先别把它当成已验证机会。',
      intent: 'reference' as const,
    },
    secondary: {
      title: '加入跟进列表',
      description: '补齐冲突或缺失分析后，再决定是否继续投入。',
      intent: 'follow_up' as const,
    },
    tertiary: {
      title: '查看详情',
      description: '暂时只保留参考价值，不进入强推进流程。',
      intent: 'reference' as const,
    },
    showValidationActions: false,
  };
}

export function buildRepositoryDecisionViewModel(
  repository: RepositoryDecisionViewModelTarget,
  options: {
    relatedJobs?: JobLogItem[] | null;
    summary?: RepositoryDecisionSummary;
  } = {},
): RepositoryDecisionViewModel {
  const repositoryRecord = repository as RepositoryDecisionSourceTarget;
  const summary = options.summary ?? getRepositoryDecisionSummary(repositoryRecord);
  const guard = detectRepositoryConflicts(repositoryRecord, {
    summary,
    relatedJobs: options.relatedJobs ?? [],
  });
  const behaviorContext = getRepositoryActionBehaviorContext(
    repositoryRecord,
    summary,
  );
  const deep = getRepositoryDeepAnalysisStatus(
    repositoryRecord,
    options.relatedJobs,
  );
  const incompleteReasons = getRepositoryIncompleteReasons(repository);
  const hasFinalDecision = Boolean(repository.finalDecision);
  const hasDeepAnalysis = hasRepositoryDeepAnalysis(repository, deep);
  const hasFinalDecisionWithoutDeep = hasFinalDecision && !hasDeepAnalysis;
  const fallback =
    guard.fallback ||
    summary.source === 'fallback' ||
    repository.analysis?.fallbackUsed === true;
  const conflict =
    summary.hasConflict ||
    summary.needsRecheck ||
    guard.snapshotConflict ||
    repository.analysisState?.unsafe === true;
  const missingKeyAnalysis =
    repository.analysisState?.unsafe === true ||
    !repository.analysis?.insightJson ||
    !hasFinalDecision ||
    incompleteReasons.some((reason) => DEGRADE_INCOMPLETE_REASONS.has(reason)) ||
    deep.status === 'FAILED';
  const displayState = buildDisplayState({
    hasDeepAnalysis,
    hasFinalDecisionWithoutDeep,
    fallback,
    conflict,
    missingKeyAnalysis,
  });
  const guardedDisplayState = applyAnalysisStateDisplayFloor(
    displayState,
    repository,
  );
  const lowConfidence =
    isRepositoryDecisionLowConfidence(repositoryRecord, summary) ||
    guardedDisplayState === 'degraded';
  const confidence = buildDisplayConfidence(guardedDisplayState, lowConfidence);
  const actionDisplay = buildDisplayAction({
    displayState: guardedDisplayState,
    action: summary.action,
    fallback,
    conflict,
    missingKeyAnalysis,
  });
  const priorityDisplay = buildDisplayPriority(
    guardedDisplayState,
    summary.moneyPriority.tier,
    summary.moneyPriority.label,
  );
  const fallbackAnalysis = getRepositoryFallbackIdeaAnalysis(repositoryRecord, summary);
  const reason = buildDisplayReason({
    displayState: guardedDisplayState,
    repository,
    summary,
    fallbackAnalysis,
    fallback,
    conflict,
    hasFinalDecisionWithoutDeep,
    missingKeyAnalysis,
  });
  const caution = buildDisplayCaution(guardedDisplayState);
  const verdictLabel = buildDisplayVerdict(guardedDisplayState, summary);
  const headlines = buildHeadline(repository, summary, guardedDisplayState);
  const monetization = buildDisplayMonetization({
    displayState: guardedDisplayState,
    repository,
    summary,
    fallbackAnalysis,
  });
  const targetUsersLabel = buildDisplayTargetUsers({
    displayState: guardedDisplayState,
    repository,
    summary,
    fallbackAnalysis,
  });
  const worthDoingLabel = buildDisplayWorthDoing(guardedDisplayState, summary);
  const cta = buildCta(guardedDisplayState);
  const detail = buildDetailFields({
    displayState: guardedDisplayState,
    deep,
    fallback,
    conflict,
    hasFinalDecisionWithoutDeep,
    missingKeyAnalysis,
  });
  const analysisModules = {
    ideaFit: buildIdeaFitModule({
      repository,
      displayState: guardedDisplayState,
      fallback,
      conflict,
      missingKeyAnalysis,
      detail,
    }),
    ideaExtract: buildIdeaExtractModule({
      repository,
      relatedJobs: options.relatedJobs,
      displayState: guardedDisplayState,
      fallback,
      conflict,
      missingKeyAnalysis,
      detail,
    }),
    completeness: buildCompletenessModule({
      repository,
      displayState: guardedDisplayState,
      fallback,
      conflict,
      missingKeyAnalysis,
      detail,
    }),
  };
  const evidence = {
    comparison: buildEvidenceComparison({
      summary,
      fallback,
      conflict,
      missingKeyAnalysis,
    }),
  };

  return {
    displayState: guardedDisplayState,
    display: {
      headline: headlines.headline,
      homepageHeadline: headlines.homepageHeadline,
      finalDecisionLabel: verdictLabel,
      actionLabel: actionDisplay.label,
      actionSentence: actionDisplay.sentence,
      priorityLabel: priorityDisplay.displayLabel,
      worthDoingLabel,
      targetUsersLabel,
      monetizationLabel: monetization.monetizationLabel,
      homepageMonetizationLabel: monetization.homepageMonetizationLabel,
      reason,
      caution,
    },
    detail,
    analysisModules,
    evidence,
    verdict: {
      code: summary.verdict,
      judgementLabel: summary.judgementLabel,
      label: summary.verdictLabel,
      displayLabel: verdictLabel,
    },
    action: {
      code: summary.action,
      toneKey: actionDisplay.toneKey,
      label: actionDisplay.label,
      sentence: actionDisplay.sentence,
    },
    priority: {
      tier: summary.moneyPriority.tier,
      toneTier: priorityDisplay.toneTier,
      sourceLabel: summary.moneyPriority.label,
      displayLabel: priorityDisplay.displayLabel,
    },
    confidence,
    deep: {
      ...deep,
      hasDeepAnalysis,
      needsAdditionalAnalysis: !hasDeepAnalysis,
    },
    behaviorContext,
    badges: {
      analysisLayerLabel: getRepositoryAnalysisLayerLabel(
        repositoryRecord,
        options.relatedJobs,
      ),
      claudeReviewLabel: getRepositoryClaudeReviewLabel(repositoryRecord),
      hasManualOverride: summary.hasManualOverride,
      hasConflict: summary.hasConflict,
      needsRecheck: summary.needsRecheck,
      hasTrainingHints: summary.hasTrainingHints,
    },
    flags: {
      fallback,
      conflict,
      incomplete: missingKeyAnalysis,
      missingKeyAnalysis,
      hasFinalDecision,
      hasDeepAnalysis,
      hasFinalDecisionWithoutDeep,
      hideFromHomepage: guard.hideFromHomepage || guardedDisplayState !== 'trusted',
      allowStrongClaims: guardedDisplayState === 'trusted',
      allowStrongMonetization: guardedDisplayState === 'trusted',
      allowStrongUserPersona: guardedDisplayState === 'trusted',
      allowStrongAction: guardedDisplayState === 'trusted',
    },
    cta,
  };
}
