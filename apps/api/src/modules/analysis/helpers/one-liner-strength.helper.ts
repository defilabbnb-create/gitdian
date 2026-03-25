export type OneLinerStrength = 'STRONG' | 'MEDIUM' | 'WEAK';
export type ProjectRealityType = 'product' | 'tool' | 'model' | 'infra' | 'demo';
type InsightVerdict = 'GOOD' | 'OK' | 'BAD';
type InsightAction = 'BUILD' | 'CLONE' | 'IGNORE';

export interface OneLinerStrengthInput {
  oneLinerZh: string;
  projectReality: {
    type: ProjectRealityType;
    hasRealUser?: boolean;
    hasClearUseCase?: boolean;
    isDirectlyMonetizable?: boolean;
  };
  stars?: number;
  categoryMain?: string | null;
  categorySub?: string | null;
  riskFlags?: string[];
  ideaFitScore?: number | null;
  verdict?: InsightVerdict | null;
  action?: InsightAction | null;
}

export interface EffectiveOneLinerStrengthInput {
  localStrength?: OneLinerStrength | null;
  claudeStrength?: OneLinerStrength | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  now?: Date;
}

export const ONE_LINER_STRENGTH_CONFIG = {
  strongIdeaFitScore: 60,
  strongStars: 3,
  decayAfterDays: 3,
  directWeakRiskFlags: [
    'unclear_user',
    'unclear_use_case',
    'possible_overgeneralization',
    'infra_mislabel',
    'user_conflict',
    'category_mismatch',
    'monetization_overclaim',
    'english_leak',
    'repo_name_fallback',
    'weak_readme',
  ],
} as const;

const DIRECT_WEAK_PHRASES = [
  '一个工具',
  '一个平台',
  '一个解决方案',
  '提升效率',
  '优化流程',
  'AI赋能',
];

const DEMO_PHRASES_RE = /(示例项目|模板|脚手架|教程|练习|课程)/;
const MODEL_PHRASES_RE = /(多模态模型框架|模型项目|模型框架)/;
const INFRA_COMPONENT_RE = /基础设施组件/;
const CLEAR_USER_RE =
  /(开发者|工程师|团队|运维|管理员|平台工程团队|安全团队|运营团队|设计师|站长|剪辑师|求职者|分析师|使用.+的开发者|macOS 开发者)/;
const CLEAR_ACTION_RE =
  /(管理|监控|生成|审阅|审查|统计|签发|续期|发起|记录|查看|追踪|改写|分离|审批|回收|编辑|预览|处理|限制|巡检|部署|同步|分析|告警|隔离|支撑)/;
const ABSTRACT_RE =
  /(提升.{0,8}效率|优化.{0,8}流程|提供能力|提供支持|增强.{0,8}效率|自动化解决方案|AI赋能)/i;

export function evaluateOneLinerStrength(
  input: OneLinerStrengthInput,
): OneLinerStrength {
  return explainOneLinerStrength(input).strength;
}

export function explainOneLinerStrength(input: OneLinerStrengthInput): {
  strength: OneLinerStrength;
  reasons: string[];
} {
  const oneLinerZh = cleanText(input.oneLinerZh, 160);
  const type = input.projectReality.type;
  const hasRealUser = Boolean(input.projectReality.hasRealUser);
  const hasClearUseCase = Boolean(input.projectReality.hasClearUseCase);
  const isDirectlyMonetizable = Boolean(
    input.projectReality.isDirectlyMonetizable,
  );
  const ideaFitScore =
    typeof input.ideaFitScore === 'number' && Number.isFinite(input.ideaFitScore)
      ? input.ideaFitScore
      : null;
  const riskFlags = normalizeStringArray(input.riskFlags);
  const reasons: string[] = [];

  const looksGeneric =
    !oneLinerZh ||
    oneLinerZh.length < 10 ||
    DIRECT_WEAK_PHRASES.some((phrase) => oneLinerZh.includes(phrase)) ||
    ABSTRACT_RE.test(oneLinerZh);
  const hasExplicitUser = CLEAR_USER_RE.test(oneLinerZh);
  const hasConcreteAction = CLEAR_ACTION_RE.test(oneLinerZh);
  const hasNegativeRisk = riskFlags.some((flag) =>
    ONE_LINER_STRENGTH_CONFIG.directWeakRiskFlags.includes(
      flag as
        | 'unclear_user'
        | 'unclear_use_case'
        | 'possible_overgeneralization'
        | 'infra_mislabel'
        | 'user_conflict'
        | 'category_mismatch'
        | 'monetization_overclaim'
        | 'english_leak'
        | 'repo_name_fallback'
        | 'weak_readme',
    ),
  );
  const strongCategory = ['tools', 'ai', 'data', 'infra'].includes(
    cleanText(input.categoryMain, 24).toLowerCase(),
  );
  if (type === 'demo' || type === 'model') {
    reasons.push(`project_type_${type}`);
    return { strength: 'WEAK', reasons };
  }

  if (looksGeneric) {
    reasons.push('generic_one_liner');
    return { strength: 'WEAK', reasons };
  }

  if (DEMO_PHRASES_RE.test(oneLinerZh)) {
    reasons.push('demo_or_template_wording');
    return { strength: 'WEAK', reasons };
  }

  if (MODEL_PHRASES_RE.test(oneLinerZh)) {
    reasons.push('model_wording');
    return { strength: 'WEAK', reasons };
  }

  if (hasNegativeRisk) {
    reasons.push('negative_risk_flag');
    return { strength: 'WEAK', reasons };
  }

  if (!hasRealUser && !hasClearUseCase) {
    reasons.push('missing_user_and_use_case');
    return { strength: 'WEAK', reasons };
  }

  if (INFRA_COMPONENT_RE.test(oneLinerZh) && (!hasRealUser || !hasClearUseCase)) {
    reasons.push('infra_without_clear_scene');
    return { strength: 'WEAK', reasons };
  }

  const meetsStrongCore =
    (type === 'product' || type === 'tool') &&
    hasRealUser &&
    hasClearUseCase &&
    isDirectlyMonetizable &&
    hasExplicitUser &&
    hasConcreteAction &&
    (ideaFitScore === null ||
      ideaFitScore >= ONE_LINER_STRENGTH_CONFIG.strongIdeaFitScore) &&
    !hasNegativeRisk;

  if (meetsStrongCore) {
    reasons.push('clear_product_candidate');
    if (ideaFitScore !== null) {
      reasons.push(`idea_fit_${Math.round(ideaFitScore)}`);
    }
    if (input.action === 'BUILD' || input.verdict === 'GOOD') {
      reasons.push('decision_signal_support');
    } else if (typeof input.stars === 'number' && input.stars >= ONE_LINER_STRENGTH_CONFIG.strongStars) {
      reasons.push('star_signal_support');
    } else if (strongCategory) {
      reasons.push('category_signal_support');
    }

    return { strength: 'STRONG', reasons };
  }

  if (!hasExplicitUser) {
    reasons.push('user_not_explicit_enough');
  }
  if (!hasConcreteAction) {
    reasons.push('action_not_explicit_enough');
  }
  if (!isDirectlyMonetizable) {
    reasons.push('monetization_not_strong');
  }
  if (type === 'infra') {
    reasons.push('infra_but_clear_enough');
  }
  if (ideaFitScore !== null && ideaFitScore < ONE_LINER_STRENGTH_CONFIG.strongIdeaFitScore) {
    reasons.push(`idea_fit_${Math.round(ideaFitScore)}`);
  }

  return {
    strength: 'MEDIUM',
    reasons,
  };
}

export function applyOneLinerStrengthDecay(
  strength: OneLinerStrength,
  ageDays: number,
): OneLinerStrength {
  if (ageDays <= ONE_LINER_STRENGTH_CONFIG.decayAfterDays) {
    return strength;
  }

  if (strength === 'STRONG') {
    return 'MEDIUM';
  }

  if (strength === 'MEDIUM') {
    return 'WEAK';
  }

  return 'WEAK';
}

export function resolveEffectiveOneLinerStrength(
  input: EffectiveOneLinerStrengthInput,
): {
  strength: OneLinerStrength | null;
  reasons: string[];
} {
  const baseStrength = input.claudeStrength ?? input.localStrength ?? null;
  if (!baseStrength) {
    return {
      strength: null,
      reasons: ['missing_strength'],
    };
  }

  const reasons = [
    input.claudeStrength ? 'source_claude_override' : 'source_local',
  ];
  const ageDays = readAgeDays(input.updatedAt ?? input.createdAt, input.now);
  if (ageDays === null) {
    return {
      strength: baseStrength,
      reasons,
    };
  }

  const decayed = applyOneLinerStrengthDecay(baseStrength, ageDays);
  if (decayed !== baseStrength) {
    reasons.push(`age_decay_${Math.floor(ageDays)}`);
  } else {
    reasons.push(`age_fresh_${Math.floor(ageDays)}`);
  }

  return {
    strength: decayed,
    reasons,
  };
}

function cleanText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanText(item, 80))
    .filter(Boolean);
}

function readAgeDays(
  value: Date | string | null | undefined,
  now: Date | undefined,
) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : typeof value === 'string'
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  const current = now ?? new Date();
  return (current.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
}
