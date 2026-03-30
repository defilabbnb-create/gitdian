import {
  type HistoricalRepairBucket,
  type HistoricalRepairBucketedItem,
  type HistoricalRepairBucketingReport,
  type HistoricalRepairRecommendedAction,
  type HistoricalRepairVisibilityLevel,
} from './historical-repair-bucketing.helper';
import {
  applyCleanupStateToRepairAction,
  evaluateHistoricalCleanupPolicy,
  type HistoricalCleanupCollectionPolicy,
  type HistoricalCleanupPurgeTarget,
  type HistoricalCleanupReason,
  type HistoricalCleanupState,
} from './historical-cleanup-policy.helper';

export type HistoricalFrontendDecisionState =
  | 'trusted'
  | 'provisional'
  | 'degraded';

export type HistoricalRepairPriorityThresholds = {
  weakQualityScore: number;
  staleFreshnessDays: number;
  staleEvidenceDays: number;
};

export type HistoricalRepairPriorityItem = HistoricalRepairBucketedItem & {
  historicalRepairPriorityScore: number;
  historicalRepairAction: HistoricalRepairRecommendedAction;
  trustedFlowEligible: boolean;
  historicalTrustedButWeak: boolean;
  frontendDecisionState: HistoricalFrontendDecisionState;
  needsImmediateFrontendDowngrade: boolean;
  conflictDrivenDecisionRecalc: boolean;
  cleanupCandidate: boolean;
  cleanupState: HistoricalCleanupState;
  cleanupReason: HistoricalCleanupReason[];
  cleanupEligibleAt: string | null;
  cleanupLastEvaluatedAt: string;
  cleanupCollectionPolicy: HistoricalCleanupCollectionPolicy;
  cleanupNextCollectionAfterDays: number | null;
  cleanupPurgeTargets: HistoricalCleanupPurgeTarget[];
  cleanupBlocksTrusted: boolean;
  cleanupStillVisible: boolean;
  cleanupStillScheduled: boolean;
};

export type HistoricalRepairActionBreakdown = Record<
  HistoricalRepairRecommendedAction,
  number
>;

export type HistoricalRepairPriorityReport = {
  generatedAt: string;
  bucketingGeneratedAt: string;
  thresholds: HistoricalRepairPriorityThresholds;
  summary: {
    totalRepos: number;
    visibleBrokenCount: number;
    highValueWeakCount: number;
    staleWatchCount: number;
    archiveOrNoiseCount: number;
    historicalTrustedButWeakCount: number;
    immediateFrontendDowngradeCount: number;
    evidenceCoverageRate: number;
    keyEvidenceMissingCount: number;
    evidenceConflictCount: number;
    evidenceWeakButVisibleCount: number;
    conflictDrivenDecisionRecalcCount: number;
    actionBreakdown: HistoricalRepairActionBreakdown;
    visibleBrokenActionBreakdown: HistoricalRepairActionBreakdown;
    highValueWeakActionBreakdown: HistoricalRepairActionBreakdown;
    freezeCandidateCount: number;
    archiveCandidateCount: number;
    purgeReadyCount: number;
    frozenReposStillVisibleCount: number;
    archivedReposStillScheduledCount: number;
    cleanupReasonBreakdown: Record<HistoricalCleanupReason, number>;
    cleanupStateDistribution: Record<HistoricalCleanupState, number>;
    purgeReadyTargetBreakdown: Record<HistoricalCleanupPurgeTarget, number>;
  };
  samples: {
    topPriority: HistoricalRepairPriorityItem[];
    deepRepair: HistoricalRepairPriorityItem[];
    evidenceRepair: HistoricalRepairPriorityItem[];
    decisionRecalc: HistoricalRepairPriorityItem[];
    downgradeOnly: HistoricalRepairPriorityItem[];
  };
  items: HistoricalRepairPriorityItem[];
};

export function defaultHistoricalRepairPriorityThresholds(): HistoricalRepairPriorityThresholds {
  return {
    weakQualityScore: 55,
    staleFreshnessDays: 30,
    staleEvidenceDays: 30,
  };
}

export function evaluateHistoricalRepairPriority(args: {
  item: HistoricalRepairBucketedItem;
  thresholds?: Partial<HistoricalRepairPriorityThresholds>;
}): HistoricalRepairPriorityItem {
  const thresholds = {
    ...defaultHistoricalRepairPriorityThresholds(),
    ...args.thresholds,
  };
  const item = args.item;
  const trustedFlowEligible = Boolean(
    item.displayStatus === 'TRUSTED_READY' ||
      item.displayStatus === 'HIGH_CONFIDENCE_READY' ||
      item.moneyPriority === 'P0' ||
      item.moneyPriority === 'P1',
  );
  const weakQuality = Boolean(
    item.analysisQualityState === 'LOW' ||
      item.analysisQualityState === 'CRITICAL' ||
      item.analysisQualityScore < thresholds.weakQualityScore,
  );
  const coreEvidenceGap = Boolean(!item.hasSnapshot || !item.hasInsight);
  const finalDecisionButNoDeep = item.hasFinalDecision && !item.hasDeep;
  const keyEvidenceMissing = item.missingDrivenGaps.length > 0;
  const evidenceConflict = item.conflictDrivenGaps.length > 0;
  const evidenceDecisionConflict = item.decisionRecalcGaps.length > 0;
  const evidenceWeakOnly = Boolean(
    item.weakDrivenGaps.length > 0 &&
      item.conflictDrivenGaps.length === 0 &&
      item.missingDrivenGaps.length === 0,
  );
  const freshnessWeak = Boolean(
    (item.freshnessDays !== null &&
      item.freshnessDays > thresholds.staleFreshnessDays) ||
      (item.evidenceFreshnessDays !== null &&
        item.evidenceFreshnessDays > thresholds.staleEvidenceDays),
  );
  const historicalTrustedButWeak = Boolean(
    trustedFlowEligible &&
      (finalDecisionButNoDeep ||
        item.fallbackFlag ||
        item.conflictFlag ||
        item.incompleteFlag ||
        weakQuality ||
        item.trustedBlockingGaps.length > 0 ||
        freshnessWeak ||
        item.needsDecisionRecalc),
  );
  const actionResolution = resolveHistoricalRepairAction({
    item,
    weakQuality,
    coreEvidenceGap,
    finalDecisionButNoDeep,
    keyEvidenceMissing,
    evidenceConflict,
    evidenceDecisionConflict,
    evidenceWeakOnly,
    freshnessWeak,
    historicalTrustedButWeak,
  });
  const cleanupPolicy = evaluateHistoricalCleanupPolicy({
    item,
    historicalRepairAction: actionResolution.action,
    trustedFlowEligible,
    historicalTrustedButWeak,
    weakQuality,
  });
  const historicalRepairAction = applyCleanupStateToRepairAction({
    cleanupState: cleanupPolicy.cleanupState,
    historicalRepairAction: actionResolution.action,
  });
  const frontendDecisionState = resolveFrontendDecisionState({
    item,
    weakQuality,
    finalDecisionButNoDeep,
    keyEvidenceMissing,
    evidenceConflict,
    evidenceWeakOnly,
    historicalTrustedButWeak,
    action: historicalRepairAction,
    cleanupState: cleanupPolicy.cleanupState,
    cleanupBlocksTrusted: cleanupPolicy.cleanupBlocksTrusted,
  });
  const needsImmediateFrontendDowngrade = Boolean(
    frontendDecisionState !== 'trusted' &&
      (item.isStrictlyVisibleToUsers ||
        historicalTrustedButWeak ||
        cleanupPolicy.cleanupCandidate),
  );

  return {
    ...item,
    historicalRepairPriorityScore: clampScore(
      scoreHistoricalRepairPriority({
        item,
        action: historicalRepairAction,
        trustedFlowEligible,
        weakQuality,
        finalDecisionButNoDeep,
        freshnessWeak,
        historicalTrustedButWeak,
      }),
    ),
    historicalRepairAction,
    trustedFlowEligible,
    historicalTrustedButWeak,
    frontendDecisionState,
    needsImmediateFrontendDowngrade,
    conflictDrivenDecisionRecalc: actionResolution.conflictDrivenDecisionRecalc,
    cleanupCandidate: cleanupPolicy.cleanupCandidate,
    cleanupState: cleanupPolicy.cleanupState,
    cleanupReason: cleanupPolicy.cleanupReason,
    cleanupEligibleAt: cleanupPolicy.cleanupEligibleAt,
    cleanupLastEvaluatedAt: cleanupPolicy.cleanupLastEvaluatedAt,
    cleanupCollectionPolicy: cleanupPolicy.cleanupCollectionPolicy,
    cleanupNextCollectionAfterDays: cleanupPolicy.cleanupNextCollectionAfterDays,
    cleanupPurgeTargets: cleanupPolicy.cleanupPurgeTargets,
    cleanupBlocksTrusted: cleanupPolicy.cleanupBlocksTrusted,
    cleanupStillVisible: cleanupPolicy.cleanupStillVisible,
    cleanupStillScheduled: cleanupPolicy.cleanupStillScheduled,
  };
}

export function buildHistoricalRepairPriorityReport(args: {
  bucketingReport: HistoricalRepairBucketingReport;
  items: HistoricalRepairPriorityItem[];
  thresholds?: Partial<HistoricalRepairPriorityThresholds>;
}): HistoricalRepairPriorityReport {
  const thresholds = {
    ...defaultHistoricalRepairPriorityThresholds(),
    ...args.thresholds,
  };
  const items = args.items;

  return {
    generatedAt: new Date().toISOString(),
    bucketingGeneratedAt: args.bucketingReport.generatedAt,
    thresholds,
    summary: {
      totalRepos: items.length,
      visibleBrokenCount: countWhere(
        items,
        (item) => item.historicalRepairBucket === 'visible_broken',
      ),
      highValueWeakCount: countWhere(
        items,
        (item) => item.historicalRepairBucket === 'high_value_weak',
      ),
      staleWatchCount: countWhere(
        items,
        (item) => item.historicalRepairBucket === 'stale_watch',
      ),
      archiveOrNoiseCount: countWhere(
        items,
        (item) => item.historicalRepairBucket === 'archive_or_noise',
      ),
      historicalTrustedButWeakCount: countWhere(
        items,
        (item) => item.historicalTrustedButWeak,
      ),
      immediateFrontendDowngradeCount: countWhere(
        items,
        (item) => item.needsImmediateFrontendDowngrade,
      ),
      evidenceCoverageRate: roundRatio(
        items.reduce((sum, item) => sum + item.evidenceCoverageRate, 0) /
          Math.max(1, items.length),
      ),
      keyEvidenceMissingCount: countWhere(
        items,
        (item) => item.keyEvidenceMissingCount > 0,
      ),
      evidenceConflictCount: countWhere(
        items,
        (item) => item.evidenceConflictCount > 0,
      ),
      evidenceWeakButVisibleCount: countWhere(
        items,
        (item) =>
          item.isStrictlyVisibleToUsers &&
          item.evidenceWeakCount > 0 &&
          item.evidenceConflictCount === 0,
      ),
      conflictDrivenDecisionRecalcCount: countWhere(
        items,
        (item) => item.conflictDrivenDecisionRecalc,
      ),
      actionBreakdown: buildActionBreakdown(items),
      visibleBrokenActionBreakdown: buildActionBreakdown(
        items.filter((item) => item.historicalRepairBucket === 'visible_broken'),
      ),
      highValueWeakActionBreakdown: buildActionBreakdown(
        items.filter((item) => item.historicalRepairBucket === 'high_value_weak'),
      ),
      freezeCandidateCount: countWhere(items, (item) => item.cleanupState === 'freeze'),
      archiveCandidateCount: countWhere(items, (item) => item.cleanupState === 'archive'),
      purgeReadyCount: countWhere(items, (item) => item.cleanupState === 'purge_ready'),
      frozenReposStillVisibleCount: countWhere(
        items,
        (item) => item.cleanupState === 'freeze' && item.cleanupStillVisible,
      ),
      archivedReposStillScheduledCount: countWhere(
        items,
        (item) =>
          (item.cleanupState === 'archive' ||
            item.cleanupState === 'purge_ready') &&
          item.cleanupStillScheduled,
      ),
      cleanupReasonBreakdown: buildCleanupReasonBreakdown(items),
      cleanupStateDistribution: buildCleanupStateDistribution(items),
      purgeReadyTargetBreakdown: buildPurgeReadyTargetBreakdown(items),
    },
    samples: {
      topPriority: pickSamples(items),
      deepRepair: pickSamples(
        items.filter((item) => item.historicalRepairAction === 'deep_repair'),
      ),
      evidenceRepair: pickSamples(
        items.filter((item) => item.historicalRepairAction === 'evidence_repair'),
      ),
      decisionRecalc: pickSamples(
        items.filter((item) => item.historicalRepairAction === 'decision_recalc'),
      ),
      downgradeOnly: pickSamples(
        items.filter((item) => item.historicalRepairAction === 'downgrade_only'),
      ),
    },
    items,
  };
}

export function renderHistoricalRepairPriorityMarkdown(
  report: HistoricalRepairPriorityReport,
) {
  const lines = [
    '# GitDian 历史修复优先级报告',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- bucketingGeneratedAt: ${report.bucketingGeneratedAt}`,
    '',
    '## 优先级规则',
    '',
    '- priority score = 曝光优先级 + 业务价值 + 质量风险 + 新鲜度风险 + 动作收益。',
    '- strict exposure 只认：首页 / 收藏 / 日报 / Telegram；detail only 不再直接视作高优先。',
    '- analysisQualityScore 只作为辅助信号，不能单独决定 bucket/action。',
    '',
    '## 核心数量',
    '',
    `- visible_broken: ${report.summary.visibleBrokenCount}`,
    `- high_value_weak: ${report.summary.highValueWeakCount}`,
    `- stale_watch: ${report.summary.staleWatchCount}`,
    `- archive_or_noise: ${report.summary.archiveOrNoiseCount}`,
    `- historicalTrustedButWeak: ${report.summary.historicalTrustedButWeakCount}`,
    `- immediateFrontendDowngrade: ${report.summary.immediateFrontendDowngradeCount}`,
    `- evidenceCoverageRate: ${formatPercent(report.summary.evidenceCoverageRate)}`,
    `- keyEvidenceMissingCount: ${report.summary.keyEvidenceMissingCount}`,
    `- evidenceConflictCount: ${report.summary.evidenceConflictCount}`,
    `- evidenceWeakButVisibleCount: ${report.summary.evidenceWeakButVisibleCount}`,
    `- conflictDrivenDecisionRecalcCount: ${report.summary.conflictDrivenDecisionRecalcCount}`,
    `- freezeCandidateCount: ${report.summary.freezeCandidateCount}`,
    `- archiveCandidateCount: ${report.summary.archiveCandidateCount}`,
    `- purgeReadyCount: ${report.summary.purgeReadyCount}`,
    `- frozenReposStillVisibleCount: ${report.summary.frozenReposStillVisibleCount}`,
    `- archivedReposStillScheduledCount: ${report.summary.archivedReposStillScheduledCount}`,
    '',
    '## Action Breakdown',
    '',
    ...renderActionBreakdown('all', report.summary.actionBreakdown),
    '',
    '### visible_broken',
    ...renderActionBreakdown(
      'visible_broken',
      report.summary.visibleBrokenActionBreakdown,
    ),
    '',
    '### high_value_weak',
    ...renderActionBreakdown(
      'high_value_weak',
      report.summary.highValueWeakActionBreakdown,
    ),
    '',
    '## Cleanup',
    '',
    `- active: ${report.summary.cleanupStateDistribution.active}`,
    `- freeze: ${report.summary.cleanupStateDistribution.freeze}`,
    `- archive: ${report.summary.cleanupStateDistribution.archive}`,
    `- purge_ready: ${report.summary.cleanupStateDistribution.purge_ready}`,
    `- top cleanup reasons: ${renderCleanupReasonSummary(
      report.summary.cleanupReasonBreakdown,
    )}`,
    '',
    '## 样本',
    '',
    '### top priority',
    ...renderPrioritySamples(report.samples.topPriority),
    '',
    '### deep repair',
    ...renderPrioritySamples(report.samples.deepRepair),
    '',
    '### evidence repair',
    ...renderPrioritySamples(report.samples.evidenceRepair),
    '',
    '### decision recalc',
    ...renderPrioritySamples(report.samples.decisionRecalc),
    '',
    '### downgrade only',
    ...renderPrioritySamples(report.samples.downgradeOnly),
  ];

  return lines.join('\n');
}

function resolveHistoricalRepairAction(args: {
  item: HistoricalRepairBucketedItem;
  weakQuality: boolean;
  coreEvidenceGap: boolean;
  finalDecisionButNoDeep: boolean;
  keyEvidenceMissing: boolean;
  evidenceConflict: boolean;
  evidenceDecisionConflict: boolean;
  evidenceWeakOnly: boolean;
  freshnessWeak: boolean;
  historicalTrustedButWeak: boolean;
}): {
  action: HistoricalRepairRecommendedAction;
  conflictDrivenDecisionRecalc: boolean;
} {
  const { item } = args;
  const watchOnlyDecisionRecalcCandidate = isWatchOnlyDecisionRecalcCandidate(
    item,
  );
  const lowRepairRoi = Boolean(
    item.repositoryValueTier === 'LOW' &&
      (item.moneyPriority === null || item.moneyPriority === 'P3'),
  );
  const unstableDecisionSignal = Boolean(
    args.evidenceDecisionConflict || item.fallbackFlag || item.conflictFlag,
  );
  const hasDeepRepairGap = item.deepRepairGaps.length > 0;
  const weakOnlyStaleWatchPrefersRefresh = Boolean(
    item.historicalRepairBucket === 'stale_watch' &&
      args.evidenceWeakOnly &&
      !args.historicalTrustedButWeak,
  );
  const watchOnlyConflictPrefersDowngrade = Boolean(
    watchOnlyDecisionRecalcCandidate &&
      item.needsFrontendDowngrade &&
      !args.historicalTrustedButWeak &&
      !args.finalDecisionButNoDeep &&
      !args.coreEvidenceGap &&
      !args.keyEvidenceMissing &&
      item.missingDrivenGaps.length === 0 &&
      (args.evidenceConflict || args.evidenceDecisionConflict),
  );
  const watchOnlyDeepGapPrefersDowngrade = Boolean(
    watchOnlyDecisionRecalcCandidate &&
      item.needsFrontendDowngrade &&
      !args.historicalTrustedButWeak &&
      !args.coreEvidenceGap &&
      args.finalDecisionButNoDeep &&
      hasDeepRepairGap,
  );
  const detailOnlyHighValueWeakPrefersRefresh = Boolean(
    item.historicalRepairBucket === 'high_value_weak' &&
      item.strictVisibilityLevel === 'DETAIL_ONLY' &&
      item.displayStatus === 'BASIC_READY' &&
      !args.coreEvidenceGap &&
      !args.keyEvidenceMissing &&
      !hasDeepRepairGap &&
      !args.finalDecisionButNoDeep &&
      args.evidenceWeakOnly,
  );
  const detailOnlyClaudeReviewPendingHighValueWeakPrefersRefresh = Boolean(
    item.historicalRepairBucket === 'high_value_weak' &&
      item.strictVisibilityLevel === 'DETAIL_ONLY' &&
      item.displayStatus === 'TRUSTED_READY' &&
      item.incompleteFlag &&
      item.missingReasons.length === 1 &&
      item.missingReasons[0] === 'NO_CLAUDE_REVIEW' &&
      !item.fallbackFlag &&
      !item.conflictFlag &&
      !args.coreEvidenceGap &&
      !args.keyEvidenceMissing &&
      !hasDeepRepairGap &&
      !args.finalDecisionButNoDeep &&
      !args.evidenceConflict &&
      !args.evidenceDecisionConflict &&
      item.evidenceRepairGaps.length === 0,
  );

  if (item.historicalRepairBucket === 'archive_or_noise') {
    return {
      action: 'archive',
      conflictDrivenDecisionRecalc: false,
    };
  }

  if (item.historicalRepairBucket === 'visible_broken') {
    if (unstableDecisionSignal) {
      return {
        action: 'decision_recalc',
        conflictDrivenDecisionRecalc: args.evidenceDecisionConflict,
      };
    }
    if (
      (item.frontendDowngradeSeverity === 'URGENT' || item.homepageUnsafe) &&
      lowRepairRoi &&
      item.keyEvidenceGapSeverity !== 'CRITICAL' &&
      !hasDeepRepairGap
    ) {
      return {
        action: 'downgrade_only',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (args.finalDecisionButNoDeep && !lowRepairRoi) {
      return {
        action: 'deep_repair',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (hasDeepRepairGap && !lowRepairRoi) {
      return {
        action: 'deep_repair',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (args.coreEvidenceGap || args.keyEvidenceMissing) {
      return {
        action: 'evidence_repair',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (args.evidenceWeakOnly) {
      return {
        action: 'evidence_repair',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (
      item.frontendDowngradeSeverity === 'URGENT' ||
      args.weakQuality ||
      item.homepageUnsafe ||
      item.keyEvidenceGapSeverity === 'HIGH'
    ) {
      return {
        action: 'downgrade_only',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (args.freshnessWeak) {
      return {
        action: 'refresh_only',
        conflictDrivenDecisionRecalc: false,
      };
    }
    return {
      action: args.finalDecisionButNoDeep ? 'deep_repair' : 'downgrade_only',
      conflictDrivenDecisionRecalc: false,
    };
  }

  if (item.historicalRepairBucket === 'high_value_weak') {
    if (unstableDecisionSignal) {
      return {
        action: 'decision_recalc',
        conflictDrivenDecisionRecalc: args.evidenceDecisionConflict,
      };
    }
    if (hasDeepRepairGap || args.finalDecisionButNoDeep) {
      return {
        action: 'deep_repair',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (detailOnlyHighValueWeakPrefersRefresh) {
      return {
        action: 'refresh_only',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (detailOnlyClaudeReviewPendingHighValueWeakPrefersRefresh) {
      return {
        action: 'refresh_only',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (
      args.coreEvidenceGap ||
      args.keyEvidenceMissing ||
      item.evidenceRepairGaps.length > 0 ||
      args.evidenceWeakOnly
    ) {
      return {
        action: 'evidence_repair',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (args.freshnessWeak) {
      return {
        action: 'refresh_only',
        conflictDrivenDecisionRecalc: false,
      };
    }
    return {
      action:
        args.weakQuality || item.evidenceRepairGaps.length > 0 || args.evidenceConflict
          ? 'evidence_repair'
          : 'refresh_only',
      conflictDrivenDecisionRecalc: false,
    };
  }

  if (args.freshnessWeak) {
    return {
      action: 'refresh_only',
      conflictDrivenDecisionRecalc: false,
    };
  }
  if (watchOnlyDecisionRecalcCandidate) {
    if (weakOnlyStaleWatchPrefersRefresh) {
      return {
        action: 'refresh_only',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (watchOnlyConflictPrefersDowngrade) {
      return {
        action: 'downgrade_only',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (watchOnlyDeepGapPrefersDowngrade) {
      return {
        action: 'downgrade_only',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (
      args.coreEvidenceGap ||
      args.keyEvidenceMissing ||
      item.evidenceRepairGaps.length > 0 ||
      args.evidenceWeakOnly ||
      args.evidenceConflict ||
      args.evidenceDecisionConflict
    ) {
      return {
        action: 'evidence_repair',
        conflictDrivenDecisionRecalc: false,
      };
    }
    if (
      item.needsFrontendDowngrade ||
      args.historicalTrustedButWeak ||
      item.frontendDowngradeSeverity === 'CONSERVATIVE'
    ) {
      return {
        action: 'downgrade_only',
        conflictDrivenDecisionRecalc: false,
      };
    }
    return {
      action: 'refresh_only',
      conflictDrivenDecisionRecalc: false,
    };
  }
  if (unstableDecisionSignal) {
    return {
      action: 'decision_recalc',
      conflictDrivenDecisionRecalc: args.evidenceDecisionConflict,
    };
  }
  if (hasDeepRepairGap && args.finalDecisionButNoDeep) {
    return {
      action: 'deep_repair',
      conflictDrivenDecisionRecalc: false,
    };
  }
  if (weakOnlyStaleWatchPrefersRefresh) {
    return {
      action: 'refresh_only',
      conflictDrivenDecisionRecalc: false,
    };
  }
  if (
    args.coreEvidenceGap ||
    args.keyEvidenceMissing ||
    item.evidenceRepairGaps.length > 0 ||
    args.evidenceWeakOnly
  ) {
    return {
      action: 'evidence_repair',
      conflictDrivenDecisionRecalc: false,
    };
  }
  if (
    item.needsFrontendDowngrade ||
    args.historicalTrustedButWeak ||
    item.frontendDowngradeSeverity === 'CONSERVATIVE'
  ) {
    return {
      action: 'downgrade_only',
      conflictDrivenDecisionRecalc: false,
    };
  }
  return {
    action: 'refresh_only',
    conflictDrivenDecisionRecalc: false,
  };
}

function resolveFrontendDecisionState(args: {
  item: HistoricalRepairBucketedItem;
  weakQuality: boolean;
  finalDecisionButNoDeep: boolean;
  keyEvidenceMissing: boolean;
  evidenceConflict: boolean;
  evidenceWeakOnly: boolean;
  historicalTrustedButWeak: boolean;
  action: HistoricalRepairRecommendedAction;
  cleanupState: HistoricalCleanupState;
  cleanupBlocksTrusted: boolean;
}): HistoricalFrontendDecisionState {
  if (
    args.cleanupState === 'archive' ||
    args.cleanupState === 'purge_ready'
  ) {
    return 'degraded';
  }

  if (
    args.item.fallbackFlag ||
    args.item.conflictFlag ||
    args.item.incompleteFlag ||
    args.weakQuality ||
    args.evidenceConflict ||
    args.item.homepageUnsafe ||
    args.action === 'downgrade_only' ||
    args.cleanupBlocksTrusted
  ) {
    return args.cleanupState === 'freeze' ? 'provisional' : 'degraded';
  }

  if (
    args.finalDecisionButNoDeep ||
    args.keyEvidenceMissing ||
    args.evidenceWeakOnly ||
    args.item.needsFreshnessRefresh ||
    args.item.needsDecisionRecalc ||
    args.historicalTrustedButWeak ||
    args.action === 'refresh_only'
  ) {
    return 'provisional';
  }

  if (
    args.item.displayStatus === 'TRUSTED_READY' ||
    args.item.displayStatus === 'HIGH_CONFIDENCE_READY'
  ) {
    return 'trusted';
  }

  return args.item.displayStatus === 'BASIC_READY' ? 'provisional' : 'degraded';
}

function isWatchOnlyDecisionRecalcCandidate(item: HistoricalRepairBucketedItem) {
  if (item.historicalRepairBucket !== 'stale_watch') {
    return false;
  }

  if (item.strictVisibilityLevel !== 'DETAIL_ONLY') {
    return false;
  }

  if (item.repositoryValueTier === 'HIGH') {
    return false;
  }

  if (item.moneyPriority === 'P0' || item.moneyPriority === 'P1') {
    return false;
  }

  return true;
}

function scoreHistoricalRepairPriority(args: {
  item: HistoricalRepairBucketedItem;
  action: HistoricalRepairRecommendedAction;
  trustedFlowEligible: boolean;
  weakQuality: boolean;
  finalDecisionButNoDeep: boolean;
  freshnessWeak: boolean;
  historicalTrustedButWeak: boolean;
}) {
  const bucketScore = bucketWeight(args.item.historicalRepairBucket);
  const exposureScore = visibilityWeight(args.item.strictVisibilityLevel);
  const valueScore =
    moneyPriorityWeight(args.item.moneyPriority) +
    valueTierWeight(args.item.repositoryValueTier) +
    (args.trustedFlowEligible ? 12 : 0);
  const riskScore =
    (args.finalDecisionButNoDeep ? 28 : 0) +
    (args.item.fallbackFlag ? 22 : 0) +
    (args.item.conflictFlag ? 20 : 0) +
    (args.item.incompleteFlag ? 18 : 0) +
    (args.weakQuality ? 16 : 0) +
    Math.min(30, args.item.missingDrivenGaps.length * 8) +
    Math.min(36, args.item.conflictDrivenGaps.length * 12) +
    Math.min(18, args.item.weakDrivenGaps.length * 3) +
    Math.min(20, args.item.highRiskGaps.length * 4) +
    (args.historicalTrustedButWeak ? 14 : 0);
  const freshnessScore =
    (args.item.needsFreshnessRefresh ? 8 : 0) + (args.freshnessWeak ? 4 : 0);
  const actionScore = actionWeight(args.action);

  return bucketScore + exposureScore + valueScore + riskScore + freshnessScore + actionScore;
}

function buildActionBreakdown(
  items: HistoricalRepairPriorityItem[],
): HistoricalRepairActionBreakdown {
  const breakdown = emptyActionBreakdown();
  for (const item of items) {
    breakdown[item.historicalRepairAction] += 1;
  }
  return breakdown;
}

function pickSamples(items: HistoricalRepairPriorityItem[], limit = 10) {
  return items
    .slice()
    .sort(
      (left, right) =>
        right.historicalRepairPriorityScore - left.historicalRepairPriorityScore,
    )
    .slice(0, limit);
}

function emptyActionBreakdown(): HistoricalRepairActionBreakdown {
  return {
    downgrade_only: 0,
    refresh_only: 0,
    evidence_repair: 0,
    deep_repair: 0,
    decision_recalc: 0,
    archive: 0,
  };
}

function renderActionBreakdown(
  _label: string,
  breakdown: HistoricalRepairActionBreakdown,
) {
  return [
    `- downgrade_only: ${breakdown.downgrade_only}`,
    `- refresh_only: ${breakdown.refresh_only}`,
    `- evidence_repair: ${breakdown.evidence_repair}`,
    `- deep_repair: ${breakdown.deep_repair}`,
    `- decision_recalc: ${breakdown.decision_recalc}`,
    `- archive: ${breakdown.archive}`,
  ];
}

function renderPrioritySamples(items: HistoricalRepairPriorityItem[]) {
  if (!items.length) {
    return ['- 无'];
  }

  return items.map(
    (item) =>
      `- ${item.fullName} | score=${item.historicalRepairPriorityScore} | bucket=${item.historicalRepairBucket} | action=${item.historicalRepairAction} | cleanup=${item.cleanupState} | state=${item.frontendDecisionState} | reason=${item.historicalRepairReason}`,
  );
}

function buildCleanupReasonBreakdown(items: HistoricalRepairPriorityItem[]) {
  const breakdown: Record<HistoricalCleanupReason, number> = {
    low_value: 0,
    low_visibility: 0,
    low_quality: 0,
    long_tail_noise: 0,
    stale_inactive: 0,
    no_repair_roi: 0,
    archive_bucket: 0,
    trusted_ineligible: 0,
    repeated_low_signal: 0,
  };
  for (const item of items) {
    for (const reason of item.cleanupReason) {
      breakdown[reason] += 1;
    }
  }
  return breakdown;
}

function buildCleanupStateDistribution(items: HistoricalRepairPriorityItem[]) {
  const distribution: Record<HistoricalCleanupState, number> = {
    active: 0,
    freeze: 0,
    archive: 0,
    purge_ready: 0,
  };
  for (const item of items) {
    distribution[item.cleanupState] += 1;
  }
  return distribution;
}

function buildPurgeReadyTargetBreakdown(items: HistoricalRepairPriorityItem[]) {
  const breakdown: Record<HistoricalCleanupPurgeTarget, number> = {
    snapshot_outputs: 0,
    insight_outputs: 0,
    decision_outputs: 0,
    deep_outputs: 0,
    repair_logs: 0,
  };
  for (const item of items) {
    for (const target of item.cleanupPurgeTargets) {
      breakdown[target] += 1;
    }
  }
  return breakdown;
}

function renderCleanupReasonSummary(
  breakdown: Record<HistoricalCleanupReason, number>,
) {
  return (
    Object.entries(breakdown)
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(', ') || 'none'
  );
}

function bucketWeight(bucket: HistoricalRepairBucket) {
  switch (bucket) {
    case 'visible_broken':
      return 90;
    case 'high_value_weak':
      return 60;
    case 'stale_watch':
      return 20;
    case 'archive_or_noise':
    default:
      return -20;
  }
}

function visibilityWeight(level: HistoricalRepairVisibilityLevel) {
  switch (level) {
    case 'HOME':
      return 100;
    case 'FAVORITES':
      return 90;
    case 'DAILY_SUMMARY':
      return 80;
    case 'TELEGRAM':
      return 70;
    case 'DETAIL_ONLY':
      return 30;
    case 'BACKGROUND':
    default:
      return 8;
  }
}

function moneyPriorityWeight(priority: HistoricalRepairBucketedItem['moneyPriority']) {
  switch (priority) {
    case 'P0':
      return 40;
    case 'P1':
      return 30;
    case 'P2':
      return 18;
    case 'P3':
    default:
      return 4;
  }
}

function valueTierWeight(tier: HistoricalRepairBucketedItem['repositoryValueTier']) {
  switch (tier) {
    case 'HIGH':
      return 20;
    case 'MEDIUM':
      return 10;
    case 'LOW':
    default:
      return 0;
  }
}

function actionWeight(action: HistoricalRepairRecommendedAction) {
  switch (action) {
    case 'deep_repair':
      return 22;
    case 'evidence_repair':
      return 18;
    case 'decision_recalc':
      return 15;
    case 'refresh_only':
      return 10;
    case 'downgrade_only':
      return 8;
    case 'archive':
    default:
      return -40;
  }
}

function countWhere<T>(items: T[], predicate: (item: T) => boolean) {
  let count = 0;
  for (const item of items) {
    if (predicate(item)) {
      count += 1;
    }
  }
  return count;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(240, Math.round(value)));
}

function roundRatio(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}
