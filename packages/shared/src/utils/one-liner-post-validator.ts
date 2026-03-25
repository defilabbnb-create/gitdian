export type OneLinerPostValidatorSeverity =
  | 'none'
  | 'low'
  | 'medium'
  | 'high';

export type OneLinerPostValidatorConfidence = 'high' | 'medium' | 'low';

export type OneLinerPostValidatorProjectType =
  | 'product'
  | 'tool'
  | 'model'
  | 'infra'
  | 'demo';

export interface OneLinerPostValidatorInput {
  repoId?: string | null;
  updatedAt?: string | null;
  repoName?: string | null;
  fullName?: string | null;
  oneLinerZh?: string | null;
  projectType?: OneLinerPostValidatorProjectType | string | null;
  category?: string | null;
  categoryMain?: string | null;
  categorySub?: string | null;
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
  verdict?: string | null;
  action?: string | null;
  priority?: string | null;
  source?: string | null;
  confidence?: OneLinerPostValidatorConfidence | number | null;
  strength?: string | null;
  targetUsersLabel?: string | null;
  monetizationLabel?: string | null;
  whyLabel?: string | null;
  snapshotPromising?: boolean | null;
  snapshotNextAction?: string | null;
}

export interface OneLinerPostValidatorResult {
  original: string;
  sanitized: string;
  changed: boolean;
  severity: OneLinerPostValidatorSeverity;
  reasons: string[];
  riskFlags: string[];
  layer: 0 | 1 | 2 | 3 | null;
  templateFamily: string | null;
  cacheHit: boolean;
}

export interface OneLinerPostValidatorStats {
  validatedCount: number;
  changedCount: number;
  blockedByLayer0Count: number;
  conflictCount: number;
  templateSuppressedCount: number;
  cacheHitCount: number;
  averageLatencyMs: number;
}

export const ONE_LINER_REVIEWING_FALLBACK =
  '这个项目的中文摘要还在校正，先看最终结论与详情。';
export const ONE_LINER_LOW_PRIORITY_FALLBACK =
  '这个项目暂时更适合放在低优先观察池里。';
export const ONE_LINER_TECHNICAL_FALLBACK =
  '这个项目当前更像技术实现或能力示例，具体用户和使用场景还不够清晰。';

const MAX_CACHE_SIZE = 800;

const ENGLISH_ONLY_PATTERN = /^[A-Za-z0-9 ,.:;!?'"/#&()_+\-=\\-]+$/;
const ENGLISH_WORD_PATTERN = /[A-Za-z][A-Za-z0-9-]{2,}/g;
const ASCII_LETTER_PATTERN = /[A-Za-z]/g;
const CJK_PATTERN = /[\u4e00-\u9fff]/g;
const REPO_NAME_FALLBACK_PATTERN = /^一个(?:名为|该)?\s*.+(?:的)?项目[。！!?？]?$/;
const REPO_NAME_PREFIX_PATTERN = /^一个(?:该)?仓库名为/;
const STRONG_PRODUCT_PATTERN =
  /^一个帮.+做.+的\s*(?:工具|平台|系统|服务|CLI 工具|浏览器扩展|API 服务|中间件|开发库)[。！!?？]?$/;
const PRODUCTISH_PATTERN =
  /(?:一个帮.+的\s*(?:工具|平台|系统|服务|CLI 工具|浏览器扩展|API 服务|中间件|开发库)|帮.+做.+的\s*(?:工具|平台|系统|服务|CLI 工具|浏览器扩展|API 服务|中间件|开发库)|提供.+(?:服务|接口)|用于.+的\s*(?:工具|平台|服务|库|CLI 工具))/;
const HIGH_VALUE_HEADLINE_PATTERN = /(?:最值得|立即做|适合直接做|值得做)/;
const GENERIC_OBJECT_PATTERN = /^一个(?:工具|项目|平台|系统|解决方案)[。！!?？]?$/;
const EFFICIENCY_PATTERN = /(?:提升效率|优化流程|AI赋能)/;
const UNCLEAR_USER_PATTERN =
  /(?:无法识别用户|无法确定目标用户|用户不清楚|目标用户不明确)/;
const HALF_ENGLISH_SENTENCE_PATTERN =
  /^(?:[A-Za-z0-9-]+\s+){2,}[A-Za-z0-9-]+[.!?]?$/;
const UNKNOWN_CATEGORY_PATTERN = /(?:待分类|unknown|other)/i;
const WEAK_CATEGORY_PATTERN =
  /(?:demo|template|scaffold|starter|boilerplate|tutorial|course|example|示例|模板|脚手架|教程|课程|样例)/i;
const MODEL_INFRA_PATTERN = /(?:模型|基础设施|infra|model)/i;
const STRONG_MONETIZATION_PATTERN =
  /(?:团队订阅|托管版|企业版|已有现实收费路径|比较直接的收费路径|直接做成订阅)/;
const UNCLEAR_MONETIZATION_PATTERN =
  /(?:收费路径还不够清楚|更适合先验证价值|待确认|仍待验证|不够清楚)/;
const STRONG_ACTION_PATTERN = /(?:立即做|开始做这个项目|现在验证|可以收费|值得做)/;

const TEMPLATE_FAMILIES = [
  {
    key: 'workflow_tool',
    pattern: /^一个帮团队自动跑流程的工具[。！!?？]?$/,
  },
  {
    key: 'app_builder_platform',
    pattern: /^一个帮用户快速搭应用的平台[。！!?？]?$/,
  },
  {
    key: 'cli_efficiency_tool',
    pattern: /^一个在命令行里提效的开发工具[。！!?？]?$/,
  },
  {
    key: 'infra_wrapper',
    pattern: /^一个面向底层能力封装的基础设施项目[。！!?？]?$/,
  },
  {
    key: 'model_capability',
    pattern: /^一个面向特定能力场景的模型项目[。！!?？]?$/,
  },
  {
    key: 'team_helper',
    pattern: /^一个帮团队.+的(?:工具|平台|系统)[。！!?？]?$/,
  },
  {
    key: 'user_helper',
    pattern: /^一个帮用户.+的(?:工具|平台|系统)[。！!?？]?$/,
  },
  {
    key: 'cli_helper',
    pattern: /^一个在命令行里.+的(?:工具|服务|库)[。！!?？]?$/,
  },
  {
    key: 'capability_project',
    pattern: /^一个面向.+场景的(?:模型|项目|基础设施项目)[。！!?？]?$/,
  },
];

const cache = new Map<string, OneLinerPostValidatorResult>();

const stats = {
  validatedCount: 0,
  changedCount: 0,
  blockedByLayer0Count: 0,
  conflictCount: 0,
  templateSuppressedCount: 0,
  cacheHitCount: 0,
  totalLatencyMs: 0,
};

type NormalizedInput = {
  original: string;
  normalized: string;
  compact: string;
  lower: string;
  repoName: string;
  fullName: string;
  categoryText: string;
  projectType: string;
  verdict: string;
  action: string;
  priority: string;
  source: string;
  strength: string;
  confidence: OneLinerPostValidatorConfidence | number | null;
  hasRealUser: boolean;
  hasClearUseCase: boolean;
  isDirectlyMonetizable: boolean;
  targetUsersLabel: string;
  monetizationLabel: string;
  whyLabel: string;
  snapshotPromising: boolean | null;
  snapshotNextAction: string;
};

export function resetOneLinerPostValidatorState() {
  cache.clear();
  stats.validatedCount = 0;
  stats.changedCount = 0;
  stats.blockedByLayer0Count = 0;
  stats.conflictCount = 0;
  stats.templateSuppressedCount = 0;
  stats.cacheHitCount = 0;
  stats.totalLatencyMs = 0;
}

export function getOneLinerPostValidatorStats(): OneLinerPostValidatorStats {
  return {
    validatedCount: stats.validatedCount,
    changedCount: stats.changedCount,
    blockedByLayer0Count: stats.blockedByLayer0Count,
    conflictCount: stats.conflictCount,
    templateSuppressedCount: stats.templateSuppressedCount,
    cacheHitCount: stats.cacheHitCount,
    averageLatencyMs:
      stats.validatedCount > 0
        ? Number((stats.totalLatencyMs / stats.validatedCount).toFixed(3))
        : 0,
  };
}

export function explainOneLinerValidation(
  input: OneLinerPostValidatorInput,
): OneLinerPostValidatorResult {
  return validateOneLiner(input);
}

export function sanitizeOneLiner(
  input: OneLinerPostValidatorInput,
): OneLinerPostValidatorResult {
  return validateOneLiner(input);
}

export function validateOneLiner(
  input: OneLinerPostValidatorInput,
): OneLinerPostValidatorResult {
  const startedAt = performanceNow();
  const cacheKey = createCacheKey(input);
  const cached = cache.get(cacheKey);

  if (cached) {
    stats.validatedCount += 1;
    stats.cacheHitCount += 1;
    stats.totalLatencyMs += performanceNow() - startedAt;
    return {
      ...cached,
      cacheHit: true,
    };
  }

  const normalized = normalizeInput(input);
  const templateFamily = getOneLinerTemplateFamily(normalized.original);
  const layer0 = validateLayer0(normalized);
  const result =
    layer0 ??
    validateLayer1(normalized, templateFamily) ??
    buildPassThroughResult(normalized.original, templateFamily);

  rememberCache(cacheKey, result);
  stats.validatedCount += 1;
  if (result.changed) {
    stats.changedCount += 1;
  }
  if (result.layer === 0) {
    stats.blockedByLayer0Count += 1;
  }
  if (result.layer === 1) {
    stats.conflictCount += 1;
  }
  stats.totalLatencyMs += performanceNow() - startedAt;

  return result;
}

export function validateOneLinersBatch(
  inputs: OneLinerPostValidatorInput[],
): OneLinerPostValidatorResult[] {
  const templateCounts = new Map<string, number>();

  return inputs.map((input) => {
    const base = validateOneLiner(input);
    const family = base.templateFamily;

    if (!family) {
      return base;
    }

    const nextCount = (templateCounts.get(family) ?? 0) + 1;
    templateCounts.set(family, nextCount);

    if (base.changed || nextCount < 3) {
      return base;
    }

    const degraded = rewriteWithGuardrail(
      base,
      pickSafeRewrite(input, ['template_repetition']),
      'medium',
      [
        '同一批数据里相似句式已经重复太多，继续保留会让页面看起来像模板生成。',
      ],
      ['template_repetition'],
      2,
    );

    stats.changedCount += 1;
    stats.templateSuppressedCount += 1;

    return degraded;
  });
}

export function getOneLinerTemplateFamily(text: string | null | undefined) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return null;
  }

  for (const family of TEMPLATE_FAMILIES) {
    if (family.pattern.test(normalized)) {
      return family.key;
    }
  }

  return null;
}

function validateLayer0(
  input: NormalizedInput,
): OneLinerPostValidatorResult | null {
  if (!input.original) {
    return buildChangedResult(
      input.original,
      ONE_LINER_REVIEWING_FALLBACK,
      'high',
      ['当前没有可用的一句话，先退回保守提示。'],
      ['empty_oneliner'],
      0,
      null,
    );
  }

  if (
    REPO_NAME_FALLBACK_PATTERN.test(input.original) ||
    REPO_NAME_PREFIX_PATTERN.test(input.original) ||
    startsWithRepositoryName(input)
  ) {
    return buildChangedResult(
      input.original,
      ONE_LINER_REVIEWING_FALLBACK,
      'high',
      ['一句话更像 repo 名拼接句，不是可靠的用户价值描述。'],
      ['repo_name_fallback'],
      0,
      getOneLinerTemplateFamily(input.original),
    );
  }

  if (hasEnglishLeak(input.original) || hasMixedEnglishLeak(input.original)) {
    return buildChangedResult(
      input.original,
      ONE_LINER_REVIEWING_FALLBACK,
      'high',
      ['一句话里出现了英文或半英文泄漏，不适合直接展示给用户。'],
      ['english_leak'],
      0,
      getOneLinerTemplateFamily(input.original),
    );
  }

  if (
    GENERIC_OBJECT_PATTERN.test(input.original) ||
    EFFICIENCY_PATTERN.test(input.original)
  ) {
    return buildChangedResult(
      input.original,
      ONE_LINER_REVIEWING_FALLBACK,
      'high',
      ['一句话过于泛化，无法说明真实能力和用户场景。'],
      ['possible_overgeneralization'],
      0,
      getOneLinerTemplateFamily(input.original),
    );
  }

  if (UNCLEAR_USER_PATTERN.test(input.original)) {
    return buildChangedResult(
      input.original,
      ONE_LINER_TECHNICAL_FALLBACK,
      'high',
      ['一句话直接暴露了用户不清晰，应该退回保守表达。'],
      ['unclear_user'],
      0,
      getOneLinerTemplateFamily(input.original),
    );
  }

  if (
    isWeakCategory(input) &&
    (isProductishHeadline(input.original) || STRONG_PRODUCT_PATTERN.test(input.original))
  ) {
    return buildChangedResult(
      input.original,
      ONE_LINER_TECHNICAL_FALLBACK,
      'high',
      ['项目类型更像示例、模板或能力层，但一句话写成了产品叙事。'],
      ['category_mismatch', 'possible_overgeneralization'],
      0,
      getOneLinerTemplateFamily(input.original),
    );
  }

  return null;
}

function validateLayer1(
  input: NormalizedInput,
  templateFamily: string | null,
): OneLinerPostValidatorResult | null {
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  const productish = isProductishHeadline(input.original);
  const looksConcrete = STRONG_PRODUCT_PATTERN.test(input.original) || productish;
  const monetizationStrong = STRONG_MONETIZATION_PATTERN.test(input.monetizationLabel);

  if (looksConcrete && !input.hasRealUser) {
    reasons.push('一句话写得像明确产品，但目标用户仍不清晰。');
    riskFlags.push('user_conflict');
  }

  if (looksConcrete && !input.hasClearUseCase) {
    reasons.push('一句话写得很确定，但使用场景仍不够清晰。');
    riskFlags.push('use_case_conflict');
  }

  if (monetizationStrong && !input.isDirectlyMonetizable) {
    reasons.push('收费判断很强，但现有信号不足以支撑直接收费结论。');
    riskFlags.push('monetization_overclaim');
  }

  if (
    looksConcrete &&
    (input.projectType === 'infra' ||
      input.projectType === 'model' ||
      input.projectType === 'demo' ||
      MODEL_INFRA_PATTERN.test(input.categoryText))
  ) {
    reasons.push('项目更像 infra、model 或 demo，但一句话写成了产品。');
    riskFlags.push('category_mismatch');
  }

  if (
    looksConcrete &&
    (input.action === 'ignore' ||
      input.action === 'skip' ||
      input.priority === 'p3' ||
      HIGH_VALUE_HEADLINE_PATTERN.test(input.original))
  ) {
    if (input.action === 'ignore' || input.action === 'skip') {
      reasons.push('建议动作已经是跳过，但一句话仍然写得像值得立刻做。');
      riskFlags.push('action_conflict');
    }

    if (input.priority === 'p3') {
      reasons.push('优先级是 P3，但一句话仍然写得像高价值机会。');
      riskFlags.push('priority_conflict');
    }
  }

  if (input.source === 'fallback') {
    reasons.push('当前只拿到 fallback 结果，不应该把一句话写成稳定结论。');
    riskFlags.push('fallback_overclaim');
  }

  if (
    looksConcrete &&
    (input.snapshotPromising === false || input.snapshotNextAction === 'skip')
  ) {
    reasons.push('snapshot 已经给出跳过或不 promising 信号，不能继续把一句话写成高价值机会。');
    riskFlags.push('snapshot_conflict');
  }

  if (UNKNOWN_CATEGORY_PATTERN.test(input.categoryText) && looksConcrete) {
    reasons.push('分类仍待确认，但一句话给了过于具体的产品定位。');
    riskFlags.push('category_mismatch');
  }

  if (riskFlags.length === 0) {
    return null;
  }

  const uniqueReasons = uniqueStrings(reasons);
  const uniqueFlags = uniqueStrings(riskFlags);

  return buildChangedResult(
    input.original,
    pickSafeRewrite(input, uniqueFlags),
    uniqueFlags.includes('action_conflict') ||
      uniqueFlags.includes('priority_conflict')
      ? 'high'
      : 'medium',
    uniqueReasons,
    uniqueFlags,
    1,
    templateFamily,
  );
}

function buildPassThroughResult(
  original: string,
  templateFamily: string | null,
): OneLinerPostValidatorResult {
  return {
    original,
    sanitized: original,
    changed: false,
    severity: 'none',
    reasons: [],
    riskFlags: [],
    layer: null,
    templateFamily,
    cacheHit: false,
  };
}

function buildChangedResult(
  original: string,
  sanitized: string,
  severity: OneLinerPostValidatorSeverity,
  reasons: string[],
  riskFlags: string[],
  layer: 0 | 1 | 2 | 3,
  templateFamily: string | null,
): OneLinerPostValidatorResult {
  return {
    original,
    sanitized,
    changed: sanitized !== original,
    severity,
    reasons: uniqueStrings(reasons),
    riskFlags: uniqueStrings(riskFlags),
    layer,
    templateFamily,
    cacheHit: false,
  };
}

function rewriteWithGuardrail(
  base: OneLinerPostValidatorResult,
  sanitized: string,
  severity: OneLinerPostValidatorSeverity,
  reasons: string[],
  riskFlags: string[],
  layer: 2 | 3,
): OneLinerPostValidatorResult {
  return {
    ...base,
    sanitized,
    changed: sanitized !== base.original,
    severity,
    reasons: uniqueStrings([...base.reasons, ...reasons]),
    riskFlags: uniqueStrings([...base.riskFlags, ...riskFlags]),
    layer,
    cacheHit: false,
  };
}

function pickSafeRewrite(
  input: OneLinerPostValidatorInput | NormalizedInput,
  riskFlags: string[],
) {
  const normalized = isNormalizedInput(input) ? input : normalizeInput(input);
  const isLowPriority =
    normalized.priority === 'p3' ||
    normalized.action === 'ignore' ||
    normalized.action === 'skip' ||
    normalized.source === 'fallback' ||
    normalized.strength === 'weak' ||
    normalized.verdict === 'bad' ||
    riskFlags.includes('priority_conflict') ||
    riskFlags.includes('action_conflict') ||
    riskFlags.includes('fallback_overclaim') ||
    riskFlags.includes('snapshot_conflict');

  if (isLowPriority) {
    return ONE_LINER_LOW_PRIORITY_FALLBACK;
  }

  if (
    !normalized.hasRealUser ||
    !normalized.hasClearUseCase ||
    normalized.projectType === 'demo' ||
    normalized.projectType === 'model' ||
    normalized.projectType === 'infra' ||
    isWeakCategory(normalized)
  ) {
    return ONE_LINER_TECHNICAL_FALLBACK;
  }

  return ONE_LINER_REVIEWING_FALLBACK;
}

function normalizeInput(input: OneLinerPostValidatorInput): NormalizedInput {
  const original = normalizeText(input.oneLinerZh);

  return {
    original,
    normalized: original,
    compact: original.replace(/\s+/g, ''),
    lower: original.toLowerCase(),
    repoName: normalizeText(input.repoName).toLowerCase(),
    fullName: normalizeText(input.fullName).toLowerCase(),
    categoryText: [
      normalizeText(input.category),
      normalizeText(input.categoryMain),
      normalizeText(input.categorySub),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
    projectType: normalizeText(input.projectType).toLowerCase(),
    verdict: normalizeText(input.verdict).toLowerCase(),
    action: normalizeText(input.action).toLowerCase(),
    priority: normalizeText(input.priority).toLowerCase(),
    source: normalizeText(input.source).toLowerCase(),
    strength: normalizeText(input.strength).toLowerCase(),
    confidence: input.confidence ?? null,
    hasRealUser: Boolean(input.hasRealUser),
    hasClearUseCase: Boolean(input.hasClearUseCase),
    isDirectlyMonetizable: Boolean(input.isDirectlyMonetizable),
    targetUsersLabel: normalizeText(input.targetUsersLabel),
    monetizationLabel: normalizeText(input.monetizationLabel),
    whyLabel: normalizeText(input.whyLabel),
    snapshotPromising:
      typeof input.snapshotPromising === 'boolean' ? input.snapshotPromising : null,
    snapshotNextAction: normalizeText(input.snapshotNextAction).toLowerCase(),
  };
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasEnglishLeak(text: string) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return false;
  }

  const asciiLetters = (normalized.match(ASCII_LETTER_PATTERN) ?? []).length;
  const cjkChars = (normalized.match(CJK_PATTERN) ?? []).length;

  return asciiLetters >= 10 && asciiLetters > cjkChars * 2;
}

function hasMixedEnglishLeak(text: string) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return false;
  }

  if (ENGLISH_ONLY_PATTERN.test(normalized)) {
    return /[A-Za-z]{6,}/.test(normalized);
  }

  if (HALF_ENGLISH_SENTENCE_PATTERN.test(normalized)) {
    return true;
  }

  const englishTokens = normalized.match(ENGLISH_WORD_PATTERN) ?? [];

  if (englishTokens.length === 0) {
    return false;
  }

  const asciiLetters = (normalized.match(ASCII_LETTER_PATTERN) ?? []).length;
  const cjkChars = (normalized.match(CJK_PATTERN) ?? []).length;

  if (
    englishTokens.length > 0 &&
    englishTokens.every((token) => token.length <= 4) &&
    asciiLetters <= 8 &&
    cjkChars >= 8
  ) {
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

function isProductishHeadline(text: string) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return false;
  }

  return STRONG_PRODUCT_PATTERN.test(normalized) || PRODUCTISH_PATTERN.test(normalized);
}

function startsWithRepositoryName(input: NormalizedInput) {
  return [input.repoName, input.fullName]
    .filter((value) => value.length >= 3)
    .some((value) => input.lower.startsWith(value));
}

function isWeakCategory(input: NormalizedInput) {
  return WEAK_CATEGORY_PATTERN.test(input.categoryText) || input.projectType === 'demo';
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function createCacheKey(input: OneLinerPostValidatorInput) {
  const key = [
    normalizeText(input.repoId),
    normalizeText(input.updatedAt),
    normalizeText(input.oneLinerZh),
    normalizeText(input.projectType),
    normalizeText(input.category),
    normalizeText(input.categoryMain),
    normalizeText(input.categorySub),
    String(Boolean(input.hasRealUser)),
    String(Boolean(input.hasClearUseCase)),
    String(Boolean(input.isDirectlyMonetizable)),
    normalizeText(input.verdict),
    normalizeText(input.action),
    normalizeText(input.priority),
    normalizeText(input.source),
    normalizeText(input.strength),
    normalizeText(input.targetUsersLabel),
    normalizeText(input.monetizationLabel),
    normalizeText(input.whyLabel),
    String(
      typeof input.snapshotPromising === 'boolean' ? input.snapshotPromising : '',
    ),
    normalizeText(input.snapshotNextAction),
  ].join('|');

  return simpleHash(key);
}

function simpleHash(value: string) {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return String(hash >>> 0);
}

function rememberCache(key: string, result: OneLinerPostValidatorResult) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;

    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, result);
}

function performanceNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function isNormalizedInput(
  value: OneLinerPostValidatorInput | NormalizedInput,
): value is NormalizedInput {
  return 'normalized' in value && 'compact' in value;
}
