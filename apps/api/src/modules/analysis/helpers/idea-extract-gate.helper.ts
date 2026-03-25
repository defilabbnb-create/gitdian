type InsightVerdict = 'GOOD' | 'OK' | 'BAD';
type ProjectRealityType = 'product' | 'tool' | 'model' | 'infra' | 'demo';
type OneLinerStrength = 'STRONG' | 'MEDIUM' | 'WEAK';
type SelfTuningLoadLevel = 'NORMAL' | 'HIGH_LOAD' | 'EXTREME';

export type IdeaExtractGateReason =
  | 'eligible_high_value'
  | 'eligible_light_value'
  | 'strength_not_strong'
  | 'not_high_value'
  | 'low_idea_fit'
  | 'not_promising'
  | 'not_tool_like'
  | 'negative_signal'
  | 'weak_readme'
  | 'missing_signal'
  | 'template_or_demo'
  | 'capability_layer'
  | 'unclear_use_case'
  | 'weak_monetization_path'
  | 'already_exists'
  | 'deferred'
  | 'execution_failed';

export type IdeaExtractExecutionMode = 'full' | 'light' | 'skip';

export type IdeaExtractGateDecision = {
  shouldRun: boolean;
  reason: IdeaExtractGateReason;
  trace: string[];
  strength?: OneLinerStrength | null;
  effectiveStrength?: OneLinerStrength | null;
  mode: IdeaExtractExecutionMode;
};

export function evaluateIdeaExtractGate(input: {
  snapshotIsPromising: boolean;
  toolLike: boolean;
  verdict: InsightVerdict | null;
  oneLinerStrength?: OneLinerStrength | null;
  forceLightAnalysis?: boolean;
  loadLevel?: SelfTuningLoadLevel;
  ideaFitScore: number;
  readmeLength: number;
  categoryMain: string | null;
  haystack: string;
  projectRealityType?: ProjectRealityType | null;
  heuristicAdjustments?: {
    templateDetectionBoost?: number;
    modelInfraLeakageBoost?: number;
    earlyGoodGuard?: number;
  } | null;
}): IdeaExtractGateDecision {
  const trace: string[] = [];
  const haystack = input.haystack.toLowerCase();
  const templateLike = looksTemplateLike(haystack);
  const capabilityLike = looksCapabilityLike(haystack);
  const clearUseCase = hasClearUseCase(haystack);
  const hasMonetizationPath = looksMonetizable(haystack);
  const matchesStrengthKeyword = [
    'automation',
    'api',
    'workflow',
    'agent',
    'platform',
    'tooling',
    'review',
    'approval',
    'audit',
    'dashboard',
    'security',
    'terminal',
  ].some((keyword) => haystack.includes(keyword));
  const inTargetCategory = ['tools', 'ai', 'data'].includes(
    String(input.categoryMain ?? '').toLowerCase(),
  );
  const negativeKeywords = [
    'template',
    'boilerplate',
    'starter',
    'scaffold',
    'leetcode',
    'course',
    'tutorial',
    'demo',
    'internal tool',
    'for internal use',
    'passive income',
    'arbitrage',
    'pump',
    'sniper',
  ];
  const hasNegativeSignal = negativeKeywords.some((keyword) =>
    haystack.includes(keyword),
  );
  const hasWeakReadme = input.readmeLength < 250;
  const hasStrengthSignal = matchesStrengthKeyword || inTargetCategory;
  const templateBoost = input.heuristicAdjustments?.templateDetectionBoost ?? 0;
  const capabilityBoost = input.heuristicAdjustments?.modelInfraLeakageBoost ?? 0;
  const earlyGuard = input.heuristicAdjustments?.earlyGoodGuard ?? 0;
  const loadLevel = input.loadLevel ?? 'NORMAL';
  const strongStrength = input.oneLinerStrength === 'STRONG';
  const mediumStrength = input.oneLinerStrength === 'MEDIUM';
  const forceLightAnalysis = input.forceLightAnalysis === true;

  if (forceLightAnalysis) {
    trace.push('forced_light_analysis');
    return {
      shouldRun: true,
      reason: 'eligible_light_value',
      trace: [...trace, 'idea_extract_mode_light'],
      mode: 'light',
    };
  }

  if (input.oneLinerStrength === 'WEAK') {
    return blocked(
      'strength_not_strong',
      trace,
      'one_liner_strength_weak',
      'skip',
    );
  }

  if (strongStrength) {
    trace.push('one_liner_strength_strong');
  }
  if (mediumStrength) {
    trace.push('one_liner_strength_medium');
  }

  if (templateBoost >= 0.18 && (templateLike || input.projectRealityType === 'demo')) {
    trace.push('template_or_demo_signal');
  }

  if (
    capabilityBoost >= 0.18 &&
    (input.projectRealityType === 'model' ||
      input.projectRealityType === 'infra' ||
      capabilityLike)
  ) {
    trace.push('capability_layer_signal');
  }

  if (hasNegativeSignal) {
    trace.push('negative_keyword_signal');
  }

  if (!input.snapshotIsPromising) {
    trace.push('snapshot_not_promising');
  } else {
    trace.push('snapshot_promising');
  }

  if (!input.toolLike) {
    trace.push('tool_like_missing');
  } else {
    trace.push('tool_like_confirmed');
  }

  if (input.verdict !== 'GOOD' && input.verdict !== 'OK') {
    trace.push(`verdict_${String(input.verdict).toLowerCase()}`);
  } else {
    trace.push(`verdict_${String(input.verdict).toLowerCase()}`);
  }

  trace.push(`idea_fit_${Math.round(input.ideaFitScore)}`);

  if (hasWeakReadme) {
    trace.push(`readme_too_short_${input.readmeLength}`);
  }

  if (earlyGuard >= 0.18 && !clearUseCase) {
    trace.push('use_case_unclear');
  }

  if (!hasMonetizationPath) {
    trace.push('monetization_path_weak');
  }

  if (!hasStrengthSignal) {
    trace.push('strength_signal_missing');
  }

  trace.push(clearUseCase ? 'clear_use_case' : 'use_case_not_strong_but_allowed');
  if (hasMonetizationPath) {
    trace.push('monetization_path_present');
  }
  trace.push(matchesStrengthKeyword ? 'strength_keyword_matched' : 'target_category_matched');

  return {
    shouldRun: true,
    reason:
      strongStrength && loadLevel !== 'EXTREME'
        ? 'eligible_high_value'
        : 'eligible_light_value',
    trace: [
      ...trace,
      strongStrength && loadLevel !== 'EXTREME'
        ? 'idea_extract_mode_full'
        : 'idea_extract_mode_light',
    ],
    mode: strongStrength && loadLevel !== 'EXTREME' ? 'full' : 'light',
  };
}

function blocked(
  reason: IdeaExtractGateReason,
  trace: string[],
  signal: string,
  mode: IdeaExtractExecutionMode,
): IdeaExtractGateDecision {
  return {
    shouldRun: false,
    reason,
    trace: [...trace, signal],
    mode,
  };
}

function looksTemplateLike(haystack: string) {
  return /(template|starter|boilerplate|scaffold|reference implementation|demo project|sample project|course project|tutorial)/i.test(
    haystack,
  );
}

function looksCapabilityLike(haystack: string) {
  return /(framework|sdk|library|proxy|gateway|router|provider|orchestration|model runtime|serving stack|routing layer|mcp server framework|agent framework|inference engine|fallback layer)/i.test(
    haystack,
  );
}

function hasClearUseCase(haystack: string) {
  return /(review|approval|audit|dashboard|monitor|deploy|debug|search|workflow|automation|temporary access|policy|terminal|code review|pull request|access control|developer workflow|用户|团队|审批|审查|工作流|监控|自动化)/i.test(
    haystack,
  );
}

function looksMonetizable(haystack: string) {
  return /(saas|subscription|paid|billing|team|teams|enterprise|b2b|platform team|security|compliance|audit|approval|access control|policy|monitor|ops|developer workflow|api|dashboard|cost|workflow automation|review)/i.test(
    haystack,
  );
}
