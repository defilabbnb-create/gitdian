import {
  AdaptiveSchedulerConcurrencyTargets,
  AdaptiveSchedulerDecision,
  AdaptiveSchedulerHealthInput,
  AdaptiveSchedulerMode,
  AdaptiveSchedulerPriorityAdjustment,
  AdaptiveSchedulerQueueWeights,
  AdaptiveSchedulerRepoContext,
  AdaptiveSchedulerState,
} from './adaptive-scheduler.types';

const DEFAULT_QUEUE_WEIGHTS: AdaptiveSchedulerQueueWeights = {
  snapshot: 1,
  deep: 1,
  claude: 1,
  recovery: 1,
  homepageCandidate: 1,
  highValueIncomplete: 1,
  fallbackRepair: 1,
  longTail: 1,
};

const DEFAULT_CONCURRENCY_TARGETS: AdaptiveSchedulerConcurrencyTargets = {
  snapshot: 12,
  deep: 6,
  claude: 2,
  recovery: 4,
};

function ratio(value: number, total: number) {
  if (!total) {
    return 0;
  }

  return value / total;
}

function resolveQueueWeights(mode: AdaptiveSchedulerMode): AdaptiveSchedulerQueueWeights {
  switch (mode) {
    case 'HOMEPAGE_PROTECT':
      return {
        snapshot: 0.8,
        deep: 1.7,
        claude: 1.2,
        recovery: 1.5,
        homepageCandidate: 2,
        highValueIncomplete: 1.7,
        fallbackRepair: 1.5,
        longTail: 0.4,
      };
    case 'DEEP_RECOVERY':
      return {
        snapshot: 0.7,
        deep: 2,
        claude: 1.1,
        recovery: 1.6,
        homepageCandidate: 1.4,
        highValueIncomplete: 2,
        fallbackRepair: 1.2,
        longTail: 0.5,
      };
    case 'FALLBACK_CLEANUP':
      return {
        snapshot: 0.9,
        deep: 1.3,
        claude: 1,
        recovery: 1.8,
        homepageCandidate: 1.3,
        highValueIncomplete: 1.2,
        fallbackRepair: 2.1,
        longTail: 0.6,
      };
    case 'CLAUDE_CATCHUP':
      return {
        snapshot: 0.9,
        deep: 1.1,
        claude: 1.9,
        recovery: 1.3,
        homepageCandidate: 1.2,
        highValueIncomplete: 1.4,
        fallbackRepair: 1.1,
        longTail: 0.7,
      };
    case 'CRITICAL_BACKPRESSURE':
      return {
        snapshot: 0.5,
        deep: 1.6,
        claude: 0.6,
        recovery: 0.5,
        homepageCandidate: 1.8,
        highValueIncomplete: 2,
        fallbackRepair: 1.6,
        longTail: 0.2,
      };
    case 'NORMAL':
    default:
      return { ...DEFAULT_QUEUE_WEIGHTS };
  }
}

function resolveConcurrencyTargets(
  mode: AdaptiveSchedulerMode,
): AdaptiveSchedulerConcurrencyTargets {
  switch (mode) {
    case 'HOMEPAGE_PROTECT':
      return {
        snapshot: 10,
        deep: 8,
        claude: 2,
        recovery: 5,
      };
    case 'DEEP_RECOVERY':
      return {
        snapshot: 8,
        deep: 10,
        claude: 2,
        recovery: 6,
      };
    case 'FALLBACK_CLEANUP':
      return {
        snapshot: 10,
        deep: 7,
        claude: 2,
        recovery: 8,
      };
    case 'CLAUDE_CATCHUP':
      return {
        snapshot: 10,
        deep: 6,
        claude: 4,
        recovery: 5,
      };
    case 'CRITICAL_BACKPRESSURE':
      return {
        snapshot: 6,
        deep: 8,
        claude: 1,
        recovery: 2,
      };
    case 'NORMAL':
    default:
      return { ...DEFAULT_CONCURRENCY_TARGETS };
  }
}

function shouldKeepMode(
  previousMode: AdaptiveSchedulerMode | null,
  candidateMode: AdaptiveSchedulerMode,
) {
  return previousMode === candidateMode;
}

export function decideAdaptiveSchedulerMode(
  health: AdaptiveSchedulerHealthInput,
  previousState?: AdaptiveSchedulerState | null,
): {
  mode: AdaptiveSchedulerMode;
  reasons: string[];
  homepageUnsafeRate: number;
  homepageIncompleteRate: number;
  deepCoverageRate: number;
  incompleteRate: number;
} {
  const previousMode = previousState?.currentMode ?? null;
  const homepageUnsafeRate = ratio(health.homepageUnsafe, health.homepageTotal);
  const homepageIncompleteRate = ratio(
    health.homepageIncomplete,
    health.homepageTotal,
  );
  const deepCoverageRate = ratio(health.deepDoneRepos, health.totalRepos);
  const incompleteRate = ratio(health.incompleteRepos, health.totalRepos);
  const reasons: string[] = [];

  const highPressure =
    health.deepQueueSize > 2_000 ||
    health.snapshotQueueSize > 6_000 ||
    health.failedCount > 500 ||
    health.stalledCount > 50;
  if (
    highPressure ||
    (shouldKeepMode(previousMode, 'CRITICAL_BACKPRESSURE') &&
      (health.deepQueueSize > 1_500 || health.snapshotQueueSize > 4_500))
  ) {
    reasons.push(
      `deep backlog=${health.deepQueueSize}, snapshot backlog=${health.snapshotQueueSize}, failed=${health.failedCount}, stalled=${health.stalledCount}`,
    );
    return {
      mode: 'CRITICAL_BACKPRESSURE',
      reasons,
      homepageUnsafeRate,
      homepageIncompleteRate,
      deepCoverageRate,
      incompleteRate,
    };
  }

  const homepageProtect =
    homepageUnsafeRate > 0.2 ||
    homepageIncompleteRate > 0.15 ||
    (shouldKeepMode(previousMode, 'HOMEPAGE_PROTECT') &&
      (homepageUnsafeRate > 0.12 || homepageIncompleteRate > 0.1));
  if (homepageProtect) {
    reasons.push(
      `homepage unsafe=${health.homepageUnsafe}/${health.homepageTotal}, incomplete=${health.homepageIncomplete}/${health.homepageTotal}`,
    );
    return {
      mode: 'HOMEPAGE_PROTECT',
      reasons,
      homepageUnsafeRate,
      homepageIncompleteRate,
      deepCoverageRate,
      incompleteRate,
    };
  }

  const fallbackCleanup =
    health.fallbackButStillVisibleCount > 0 ||
    (shouldKeepMode(previousMode, 'FALLBACK_CLEANUP') && health.fallbackRepos > 0);
  if (fallbackCleanup) {
    reasons.push(
      `visible fallback=${health.fallbackButStillVisibleCount}, fallback repos=${health.fallbackRepos}`,
    );
    return {
      mode: 'FALLBACK_CLEANUP',
      reasons,
      homepageUnsafeRate,
      homepageIncompleteRate,
      deepCoverageRate,
      incompleteRate,
    };
  }

  const claudeCatchup =
    health.claudeEligibleButNotReviewedCount > 1_000 ||
    health.severeConflictRepos > 50 ||
    (shouldKeepMode(previousMode, 'CLAUDE_CATCHUP') &&
      (health.claudeEligibleButNotReviewedCount > 700 ||
        health.severeConflictRepos > 25));
  if (claudeCatchup) {
    reasons.push(
      `claude eligible backlog=${health.claudeEligibleButNotReviewedCount}, severe conflicts=${health.severeConflictRepos}`,
    );
    return {
      mode: 'CLAUDE_CATCHUP',
      reasons,
      homepageUnsafeRate,
      homepageIncompleteRate,
      deepCoverageRate,
      incompleteRate,
    };
  }

  const deepRecovery =
    (deepCoverageRate < 0.03 &&
      health.finalDecisionButNoDeepCount > Math.max(1_000, health.totalRepos * 0.2)) ||
    (shouldKeepMode(previousMode, 'DEEP_RECOVERY') &&
      deepCoverageRate < 0.05 &&
      health.finalDecisionButNoDeepCount > Math.max(800, health.totalRepos * 0.15));
  if (deepRecovery) {
    reasons.push(
      `deep coverage=${(deepCoverageRate * 100).toFixed(2)}%, finalDecisionNoDeep=${health.finalDecisionButNoDeepCount}`,
    );
    return {
      mode: 'DEEP_RECOVERY',
      reasons,
      homepageUnsafeRate,
      homepageIncompleteRate,
      deepCoverageRate,
      incompleteRate,
    };
  }

  reasons.push(
    `deep coverage=${(deepCoverageRate * 100).toFixed(2)}%, incomplete=${(incompleteRate * 100).toFixed(2)}%`,
  );

  return {
    mode: 'NORMAL',
    reasons,
    homepageUnsafeRate,
    homepageIncompleteRate,
    deepCoverageRate,
    incompleteRate,
  };
}

export function buildAdaptiveSchedulerDecision(
  health: AdaptiveSchedulerHealthInput,
  previousState?: AdaptiveSchedulerState | null,
): AdaptiveSchedulerDecision {
  const resolved = decideAdaptiveSchedulerMode(health, previousState);
  const mode = resolved.mode;
  const queueWeights = resolveQueueWeights(mode);
  const concurrencyTargets = resolveConcurrencyTargets(mode);
  const updatedAt = new Date().toISOString();
  const nextReviewAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const queueWeightChanges = Object.entries(queueWeights).map(
    ([key, value]) => `${key}=${value.toFixed(2)}`,
  );

  const homepageProtectedCount =
    mode === 'HOMEPAGE_PROTECT'
      ? health.homepageUnsafe + health.homepageIncomplete
      : 0;
  const fallbackRecoveredCount =
    mode === 'FALLBACK_CLEANUP' ? health.fallbackButStillVisibleCount : 0;
  const deepRecoveryCount =
    mode === 'DEEP_RECOVERY'
      ? health.finalDecisionButNoDeepCount + health.moneyPriorityHighButIncomplete
      : 0;
  const claudeCatchupCount =
    mode === 'CLAUDE_CATCHUP' ? health.claudeEligibleButNotReviewedCount : 0;
  const priorityBoostedRepoCount =
    homepageProtectedCount + fallbackRecoveredCount + deepRecoveryCount + claudeCatchupCount;
  const suppressedRepoCount =
    mode === 'CRITICAL_BACKPRESSURE'
      ? Math.max(health.snapshotQueueSize, health.deepQueueSize)
      : Math.max(0, health.incompleteRepos - health.moneyPriorityHighButIncomplete);

  return {
    currentMode: mode,
    currentReasons: resolved.reasons,
    queueWeights,
    concurrencyTargets,
    updatedAt,
    nextReviewAt,
    queueWeightChanges,
    priorityBoostedRepoCount,
    suppressedRepoCount,
    homepageProtectedCount,
    fallbackRecoveredCount,
    deepRecoveryCount,
    claudeCatchupCount,
    healthSnapshot: health,
  };
}

export function buildAdaptiveSchedulerPriorityAdjustment(args: {
  state: AdaptiveSchedulerState | null;
  context: AdaptiveSchedulerRepoContext;
}): AdaptiveSchedulerPriorityAdjustment {
  const { state, context } = args;
  const mode = state?.currentMode ?? 'NORMAL';
  let boost = 0;
  const reasons: string[] = [];

  if (context.activeProject) {
    boost += 4;
    reasons.push('active_project');
  }

  if (context.homepageCandidate || context.highExposureCandidate) {
    boost += 2;
    reasons.push('high_exposure');
  }

  if (context.moneyPriority === 'P0' || context.moneyPriority === 'P1') {
    boost += 3;
    reasons.push('high_money_priority');
  }

  if (context.incomplete && !context.deepReady) {
    boost += 2;
    reasons.push('needs_deep');
  }

  if (context.hasConflict || context.needsRecheck) {
    boost += 2;
    reasons.push('conflict');
  }

  if (context.fallbackVisible) {
    boost += 1;
    reasons.push('fallback_repair');
  }

  if (mode === 'HOMEPAGE_PROTECT') {
    if (context.homepageCandidate) {
      boost += 6;
      reasons.push('homepage_protect');
    }
    if (!context.homepageCandidate && !context.highExposureCandidate && context.incomplete) {
      boost -= 4;
      reasons.push('long_tail_suppressed');
    }
  }

  if (mode === 'DEEP_RECOVERY') {
    if (context.incomplete && (context.moneyPriority === 'P0' || context.moneyPriority === 'P1')) {
      boost += 6;
      reasons.push('deep_recovery_high_value');
    }
    if (!context.incomplete) {
      boost -= 2;
      reasons.push('already_ready');
    }
  }

  if (mode === 'FALLBACK_CLEANUP') {
    if (context.fallbackVisible) {
      boost += 7;
      reasons.push('fallback_cleanup');
    } else if (!context.homepageCandidate) {
      boost -= 2;
      reasons.push('non_fallback_deprioritized');
    }
  }

  if (mode === 'CLAUDE_CATCHUP') {
    if (context.hasConflict || context.needsRecheck) {
      boost += 5;
      reasons.push('claude_catchup');
    }
  }

  if (mode === 'CRITICAL_BACKPRESSURE') {
    if (context.homepageCandidate || context.activeProject) {
      boost += 4;
      reasons.push('critical_keepalive');
    }
    if (!context.homepageCandidate && !context.activeProject && !context.highExposureCandidate) {
      boost -= 8;
      reasons.push('critical_suppression');
    }
  }

  const suppressed = boost <= -6 || (mode === 'CRITICAL_BACKPRESSURE' && boost < 0);

  return {
    boost,
    reasons,
    suppressed,
  };
}
