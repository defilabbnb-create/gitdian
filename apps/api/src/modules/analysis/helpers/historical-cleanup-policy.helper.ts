import type {
  HistoricalRepairBucketedItem,
  HistoricalRepairRecommendedAction,
} from './historical-repair-bucketing.helper';

export type HistoricalCleanupState =
  | 'active'
  | 'freeze'
  | 'archive'
  | 'purge_ready';

export type HistoricalCleanupReason =
  | 'low_value'
  | 'low_visibility'
  | 'low_quality'
  | 'long_tail_noise'
  | 'stale_inactive'
  | 'no_repair_roi'
  | 'archive_bucket'
  | 'trusted_ineligible'
  | 'repeated_low_signal';

export type HistoricalCleanupCollectionPolicy = 'normal' | 'slow' | 'paused';

export type HistoricalCleanupPurgeTarget =
  | 'snapshot_outputs'
  | 'insight_outputs'
  | 'decision_outputs'
  | 'deep_outputs'
  | 'repair_logs';

export type HistoricalCleanupThresholds = {
  freezeFreshnessDays: number;
  archiveFreshnessDays: number;
  purgeFreshnessDays: number;
  weakQualityScore: number;
};

export type HistoricalCleanupPolicyResult = {
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

export function defaultHistoricalCleanupThresholds(): HistoricalCleanupThresholds {
  return {
    freezeFreshnessDays: 45,
    archiveFreshnessDays: 120,
    purgeFreshnessDays: 180,
    weakQualityScore: 55,
  };
}

export function evaluateHistoricalCleanupPolicy(args: {
  item: HistoricalRepairBucketedItem;
  historicalRepairAction: HistoricalRepairRecommendedAction;
  trustedFlowEligible: boolean;
  historicalTrustedButWeak: boolean;
  weakQuality: boolean;
  now?: Date;
  thresholds?: Partial<HistoricalCleanupThresholds>;
}): HistoricalCleanupPolicyResult {
  const thresholds = {
    ...defaultHistoricalCleanupThresholds(),
    ...args.thresholds,
  };
  const now = args.now ?? new Date();
  const item = args.item;
  const lowValue = Boolean(
    item.repositoryValueTier === 'LOW' &&
      (item.moneyPriority === null || item.moneyPriority === 'P3'),
  );
  const lowVisibility = Boolean(
    item.strictVisibilityLevel === 'DETAIL_ONLY' ||
      item.strictVisibilityLevel === 'BACKGROUND',
  );
  const longTailNoise = item.collectionTier === 'LONG_TAIL';
  const staleInactive = Boolean(
    (item.freshnessDays !== null &&
      item.freshnessDays >= thresholds.freezeFreshnessDays) ||
      (item.evidenceFreshnessDays !== null &&
        item.evidenceFreshnessDays >= thresholds.freezeFreshnessDays),
  );
  const archiveStale = Boolean(
    (item.freshnessDays !== null &&
      item.freshnessDays >= thresholds.archiveFreshnessDays) ||
      (item.evidenceFreshnessDays !== null &&
        item.evidenceFreshnessDays >= thresholds.archiveFreshnessDays),
  );
  const purgeStale = Boolean(
    (item.freshnessDays !== null &&
      item.freshnessDays >= thresholds.purgeFreshnessDays) ||
      (item.evidenceFreshnessDays !== null &&
        item.evidenceFreshnessDays >= thresholds.purgeFreshnessDays),
  );
  const archiveBucket = item.historicalRepairBucket === 'archive_or_noise';
  const trustedIneligible = Boolean(
    item.trustedBlockingGaps.length > 0 ||
      item.analysisQualityState === 'CRITICAL' ||
      item.analysisQualityState === 'LOW' ||
      item.analysisQualityScore < thresholds.weakQualityScore ||
      args.historicalTrustedButWeak,
  );
  const noRepairRoi = Boolean(
    archiveBucket &&
      lowValue &&
      lowVisibility &&
      (args.historicalRepairAction === 'archive' ||
        args.historicalRepairAction === 'downgrade_only' ||
        args.historicalRepairAction === 'refresh_only') &&
      !item.needsDeepRepair &&
      !item.needsDecisionRecalc,
  );
  const repeatedLowSignal = Boolean(
    archiveBucket &&
      longTailNoise &&
      lowValue &&
      lowVisibility &&
      args.weakQuality &&
      (staleInactive || noRepairRoi),
  );
  const highValueProtected = Boolean(
    item.repositoryValueTier === 'HIGH' ||
      item.moneyPriority === 'P0' ||
      item.moneyPriority === 'P1',
  );

  const reasons = uniqueReasons([
    lowValue ? 'low_value' : null,
    lowVisibility ? 'low_visibility' : null,
    args.weakQuality ? 'low_quality' : null,
    longTailNoise ? 'long_tail_noise' : null,
    staleInactive ? 'stale_inactive' : null,
    noRepairRoi ? 'no_repair_roi' : null,
    archiveBucket ? 'archive_bucket' : null,
    trustedIneligible ? 'trusted_ineligible' : null,
    repeatedLowSignal ? 'repeated_low_signal' : null,
  ]);

  let cleanupState: HistoricalCleanupState = 'active';
  if (!highValueProtected) {
    const freezeCandidate = Boolean(
      (archiveBucket || longTailNoise || noRepairRoi) &&
        (args.weakQuality || staleInactive || trustedIneligible) &&
        (lowVisibility || !item.isUserReachable || item.needsFrontendDowngrade),
    );
    const archiveCandidate = Boolean(
      archiveBucket &&
        freezeCandidate &&
        archiveStale &&
        longTailNoise &&
        lowVisibility,
    );
    const purgeReady = Boolean(
      archiveCandidate &&
        purgeStale &&
        buildPurgeTargets(item).length > 0,
    );

    cleanupState = purgeReady
      ? 'purge_ready'
      : archiveCandidate
        ? 'archive'
        : freezeCandidate
          ? 'freeze'
          : 'active';
  }

  const cleanupCandidate = cleanupState !== 'active';
  const cleanupPurgeTargets =
    cleanupState === 'purge_ready' ? buildPurgeTargets(item) : [];
  const cleanupCollectionPolicy =
    cleanupState === 'active'
      ? 'normal'
      : cleanupState === 'freeze'
        ? 'slow'
        : 'paused';
  const cleanupNextCollectionAfterDays =
    cleanupCollectionPolicy === 'normal'
      ? 14
      : cleanupCollectionPolicy === 'slow'
        ? 90
        : null;
  const cleanupBlocksTrusted = cleanupState !== 'active';

  return {
    cleanupCandidate,
    cleanupState,
    cleanupReason: reasons,
    cleanupEligibleAt: cleanupCandidate ? now.toISOString() : null,
    cleanupLastEvaluatedAt: now.toISOString(),
    cleanupCollectionPolicy,
    cleanupNextCollectionAfterDays,
    cleanupPurgeTargets,
    cleanupBlocksTrusted,
    cleanupStillVisible: cleanupCandidate && item.isStrictlyVisibleToUsers,
    cleanupStillScheduled:
      (cleanupState === 'archive' || cleanupState === 'purge_ready') &&
      args.historicalRepairAction !== 'archive',
  };
}

export function applyCleanupStateToRepairAction(args: {
  cleanupState: HistoricalCleanupState;
  historicalRepairAction: HistoricalRepairRecommendedAction;
}): HistoricalRepairRecommendedAction {
  if (args.cleanupState === 'freeze') {
    return 'downgrade_only';
  }
  if (
    args.cleanupState === 'archive' ||
    args.cleanupState === 'purge_ready'
  ) {
    return 'archive';
  }
  return args.historicalRepairAction;
}

function buildPurgeTargets(
  item: HistoricalRepairBucketedItem,
): HistoricalCleanupPurgeTarget[] {
  const targets: HistoricalCleanupPurgeTarget[] = [];
  if (item.hasSnapshot) {
    targets.push('snapshot_outputs');
  }
  if (item.hasInsight) {
    targets.push('insight_outputs');
  }
  if (item.hasFinalDecision) {
    targets.push('decision_outputs');
  }
  if (
    item.hasDeep ||
    item.evidenceMissingDimensions.length > 0 ||
    item.evidenceWeakDimensions.length > 0 ||
    item.evidenceConflictDimensions.length > 0
  ) {
    targets.push('deep_outputs');
  }
  targets.push('repair_logs');
  return [...new Set(targets)];
}

function uniqueReasons(
  reasons: Array<HistoricalCleanupReason | null>,
): HistoricalCleanupReason[] {
  return [...new Set(reasons.filter(Boolean))] as HistoricalCleanupReason[];
}
