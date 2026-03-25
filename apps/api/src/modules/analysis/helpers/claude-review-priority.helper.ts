import { ClaudeReviewPriority } from '../claude-concurrency.service';
import { OneLinerStrength } from './one-liner-strength.helper';
import { SelfTuningLoadLevel } from '../self-tuning.service';

export type ClaudeReviewPrioritySource =
  | 'manual'
  | 'scheduler'
  | 'daily_summary'
  | 'telegram'
  | 'homepage_money_first'
  | 'replay'
  | 'audit';

export type ClaudeReviewPriorityContext = {
  source?: ClaudeReviewPrioritySource;
  oneLinerStrength?: OneLinerStrength | null;
  topCandidate?: boolean;
  localVerdict?: 'GOOD' | 'OK' | 'BAD' | null;
  localAction?: 'BUILD' | 'CLONE' | 'IGNORE' | null;
  localConfidence?: number | null;
  moneyPriority?: 'P0' | 'P1' | 'P2' | 'P3' | null;
  projectType?: 'product' | 'tool' | 'model' | 'infra' | 'demo' | null;
  hasRealUser?: boolean;
  hasClearUseCase?: boolean;
  hasProductizationPath?: boolean;
  isDirectlyMonetizable?: boolean;
  isQualifiedDeveloperTool?: boolean;
  needsClaudeReview?: boolean;
  hasConflict?: boolean;
};

export function shouldSkipClaudeReviewByStrength(
  strength?: OneLinerStrength | null,
) {
  return strength === 'WEAK';
}

export function allowedClaudePrioritiesForLoad(
  loadLevel: SelfTuningLoadLevel,
): ClaudeReviewPriority[] {
  if (loadLevel === 'EXTREME') {
    return ['P0'];
  }

  if (loadLevel === 'HIGH_LOAD') {
    return ['P0', 'P1'];
  }

  return ['P0', 'P1', 'P2'];
}

export function isClaudePriorityAllowedForLoad(
  priority: ClaudeReviewPriority,
  loadLevel: SelfTuningLoadLevel,
) {
  return allowedClaudePrioritiesForLoad(loadLevel).includes(priority);
}

function isProductLikeProject(
  projectType: ClaudeReviewPriorityContext['projectType'],
) {
  return projectType === 'product' || projectType === 'tool';
}

export function isBoundaryHighValueClaudeCandidate(
  context: ClaudeReviewPriorityContext,
) {
  return Boolean(
    context.localVerdict === 'OK' &&
      context.localAction === 'CLONE' &&
      isProductLikeProject(context.projectType) &&
      context.hasRealUser &&
      context.hasClearUseCase &&
      (context.hasProductizationPath ||
        context.isDirectlyMonetizable ||
        context.isQualifiedDeveloperTool ||
        context.moneyPriority === 'P1'),
  );
}

export function resolveClaudeReviewPriority(
  context: ClaudeReviewPriorityContext,
): ClaudeReviewPriority {
  const source = context.source ?? 'manual';
  const isTopMoneyPriority =
    context.moneyPriority === 'P0' || context.moneyPriority === 'P1';
  const isReplayWorthReview =
    isTopMoneyPriority || context.moneyPriority === 'P2';

  if (
    source === 'daily_summary' ||
    source === 'telegram' ||
    source === 'homepage_money_first'
  ) {
    return 'P0';
  }

  if (source === 'audit') {
    return context.oneLinerStrength === 'STRONG' ? 'P1' : 'P3';
  }

  let priority: ClaudeReviewPriority;

  if (source === 'replay') {
    priority = isTopMoneyPriority ? 'P2' : 'P3';
  } else if (
    (context.localVerdict === 'GOOD' && context.localAction === 'BUILD') ||
    isTopMoneyPriority
  ) {
    priority = 'P1';
  } else if (
    context.topCandidate &&
    isProductLikeProject(context.projectType) &&
    context.hasRealUser &&
    context.hasClearUseCase
  ) {
    priority = 'P1';
  } else if (
    isBoundaryHighValueClaudeCandidate(context) ||
    ((context.projectType === 'model' || context.projectType === 'infra') &&
      context.hasRealUser &&
      context.hasClearUseCase) ||
    (context.hasConflict && context.moneyPriority === 'P2') ||
    (context.needsClaudeReview && isReplayWorthReview)
  ) {
    priority = 'P2';
  } else if (
    context.localVerdict === 'OK' &&
    (context.localConfidence ?? 0.5) < 0.72 &&
    isProductLikeProject(context.projectType)
  ) {
    priority = 'P2';
  } else {
    priority = 'P3';
  }

  if (context.oneLinerStrength === 'STRONG') {
    return promoteToAtLeastP1(priority);
  }

  return priority;
}

function promoteToAtLeastP1(priority: ClaudeReviewPriority): ClaudeReviewPriority {
  if (priority === 'P0' || priority === 'P1') {
    return priority;
  }

  return 'P1';
}
