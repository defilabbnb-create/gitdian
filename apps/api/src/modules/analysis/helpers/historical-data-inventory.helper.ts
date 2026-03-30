import {
  EVIDENCE_MAP_DIMENSIONS,
  type EvidenceMapDimension,
} from './evidence-map.helper';
import {
  scoreEvidenceBackedQuality,
  type EvidenceMapInsightSummary,
} from './evidence-map-insight.helper';
import {
  buildEvidenceGapTaxonomy,
  normalizeEvidenceGapSeverity,
  normalizeEvidenceGapTaxonomy,
  type EvidenceGapTaxonomySummary,
  type KeyEvidenceGapSeverity,
  type KeyEvidenceGapTaxonomy,
} from './evidence-gap-taxonomy.helper';

export type HistoricalInventoryQualityState =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'CRITICAL';
export type HistoricalInventoryValueTier = 'HIGH' | 'MEDIUM' | 'LOW';
export type HistoricalInventoryCollectionTier = 'CORE' | 'WATCH' | 'LONG_TAIL';

export type HistoricalInventoryThresholds = {
  staleFreshnessDays: number;
  staleEvidenceDays: number;
  lowEvidenceCoverageRate: number;
  highQualityScore: number;
  mediumQualityScore: number;
};

export type HistoricalInventoryFlagsInput = {
  hasSnapshot: boolean;
  hasInsight: boolean;
  hasFinalDecision: boolean;
  hasDeep: boolean;
  hasClaudeReview: boolean;
  fallbackFlag: boolean;
  conflictFlag: boolean;
  incompleteFlag: boolean;
  missingReasons: string[];
  confidenceScore: number | null;
  lastCollectedAt: string | null;
  lastAnalyzedAt: string | null;
  isVisibleOnHome: boolean;
  isVisibleOnFavorites: boolean;
  appearedInDailySummary?: boolean;
  appearedInTelegram?: boolean;
  hasDetailPageExposure: boolean;
  isUserReachable: boolean;
  moneyPriority: 'P0' | 'P1' | 'P2' | 'P3' | null;
  repositoryValueTier: HistoricalInventoryValueTier;
  collectionTier: HistoricalInventoryCollectionTier;
  analysisStatus?: string | null;
  displayStatus?: string | null;
  homepageUnsafe?: boolean;
  badOneLiner?: boolean;
  evidenceCoverageRate?: number;
  evidenceWeakCount?: number;
  evidenceConflictCount?: number;
  keyEvidenceMissingCount?: number;
  keyEvidenceWeakCount?: number;
  keyEvidenceConflictCount?: number;
  evidenceMissingDimensions?: EvidenceMapDimension[];
  evidenceWeakDimensions?: EvidenceMapDimension[];
  evidenceConflictDimensions?: EvidenceMapDimension[];
  evidenceSupportingDimensions?: EvidenceMapDimension[];
  keyEvidenceGaps?: KeyEvidenceGapTaxonomy[];
  keyEvidenceGapSeverity?: KeyEvidenceGapSeverity | null;
  conflictDrivenGaps?: KeyEvidenceGapTaxonomy[];
  missingDrivenGaps?: KeyEvidenceGapTaxonomy[];
  weakDrivenGaps?: KeyEvidenceGapTaxonomy[];
  decisionRecalcGaps?: KeyEvidenceGapTaxonomy[];
  deepRepairGaps?: KeyEvidenceGapTaxonomy[];
  evidenceRepairGaps?: KeyEvidenceGapTaxonomy[];
  trustedBlockingGaps?: KeyEvidenceGapTaxonomy[];
  qualityReasonSummary?: string | null;
  conflictDrivenDecisionRecalc?: boolean;
};

export type HistoricalDataInventoryItem = {
  repoId: string;
  fullName: string;
  htmlUrl: string;
  hasSnapshot: boolean;
  hasInsight: boolean;
  hasFinalDecision: boolean;
  hasDeep: boolean;
  qualityScoreSchemaVersion: string;
  analysisQualityScore: number;
  analysisQualityState: HistoricalInventoryQualityState;
  evidenceCoverageRate: number;
  evidenceWeakCount: number;
  evidenceConflictCount: number;
  keyEvidenceMissingCount: number;
  keyEvidenceWeakCount: number;
  keyEvidenceConflictCount: number;
  evidenceMissingDimensions: EvidenceMapDimension[];
  evidenceWeakDimensions: EvidenceMapDimension[];
  evidenceConflictDimensions: EvidenceMapDimension[];
  evidenceSupportingDimensions: EvidenceMapDimension[];
  keyEvidenceGaps: KeyEvidenceGapTaxonomy[];
  keyEvidenceGapSeverity: KeyEvidenceGapSeverity;
  conflictDrivenGaps: KeyEvidenceGapTaxonomy[];
  missingDrivenGaps: KeyEvidenceGapTaxonomy[];
  weakDrivenGaps: KeyEvidenceGapTaxonomy[];
  decisionRecalcGaps: KeyEvidenceGapTaxonomy[];
  deepRepairGaps: KeyEvidenceGapTaxonomy[];
  evidenceRepairGaps: KeyEvidenceGapTaxonomy[];
  trustedBlockingGaps: KeyEvidenceGapTaxonomy[];
  highRiskGaps: KeyEvidenceGapTaxonomy[];
  qualityReasonSummary: string;
  qualityScoreBreakdown: {
    completenessScore: number;
    evidenceCoverageScore: number;
    missingPenalty: number;
    conflictPenalty: number;
    freshnessScore: number;
    deepCompletionBonus: number;
    trustedEligibilityPenalty: number;
    weakPenalty: number;
    fallbackPenalty: number;
    incompletePenalty: number;
  };
  qualityBlockingGaps: string[];
  missingReasonCount: number;
  missingReasons: string[];
  fallbackFlag: boolean;
  conflictFlag: boolean;
  incompleteFlag: boolean;
  lastCollectedAt: string | null;
  lastAnalyzedAt: string | null;
  freshnessDays: number | null;
  evidenceFreshnessDays: number | null;
  isVisibleOnHome: boolean;
  isVisibleOnFavorites: boolean;
  appearedInDailySummary: boolean;
  appearedInTelegram: boolean;
  hasDetailPageExposure: boolean;
  isUserReachable: boolean;
  moneyPriority: 'P0' | 'P1' | 'P2' | 'P3' | null;
  repositoryValueTier: HistoricalInventoryValueTier;
  collectionTier: HistoricalInventoryCollectionTier;
  needsDeepRepair: boolean;
  needsEvidenceRepair: boolean;
  needsFreshnessRefresh: boolean;
  needsDecisionRecalc: boolean;
  needsFrontendDowngrade: boolean;
  conflictDrivenDecisionRecalc: boolean;
  analysisStatus: string | null;
  displayStatus: string | null;
  homepageUnsafe: boolean;
};

export type HistoricalDataInventoryReport = {
  generatedAt: string;
  thresholds: HistoricalInventoryThresholds;
  summary: {
    totalRepos: number;
    completion: {
      hasSnapshot: number;
      hasInsight: number;
      hasFinalDecision: number;
      hasDeep: number;
      finalDecisionButNoDeep: number;
    };
    quality: {
      averageQualityScore: number;
      lowQualityCount: number;
      criticalQualityCount: number;
      mediumQualityCount: number;
      fallbackCount: number;
      conflictCount: number;
      incompleteCount: number;
      lowEvidenceCoverageCount: number;
      highValueWeakQualityCount: number;
    };
    freshness: {
      staleCollectionCount: number;
      staleEvidenceCount: number;
      staleAnyCount: number;
    };
    exposure: {
      homeVisibleCount: number;
      favoritesVisibleCount: number;
      dailySummaryVisibleCount: number;
      telegramVisibleCount: number;
      detailExposureCount: number;
      userReachableCount: number;
      frontendPollutionRiskCount: number;
      homePollutionRiskCount: number;
      favoritesPollutionRiskCount: number;
      detailPollutionRiskCount: number;
    };
    business: {
      highValueCount: number;
      moneyPriorityCounts: Record<'P0' | 'P1' | 'P2' | 'P3' | 'NONE', number>;
      valueTierCounts: Record<HistoricalInventoryValueTier, number>;
      collectionTierCounts: Record<HistoricalInventoryCollectionTier, number>;
    };
    repair: {
      needsDeepRepair: number;
      needsEvidenceRepair: number;
      needsFreshnessRefresh: number;
      needsDecisionRecalc: number;
      needsFrontendDowngrade: number;
    };
    topIssues: Array<{
      key: string;
      count: number;
      summary: string;
    }>;
  };
  samples: {
    finalDecisionButNoDeep: HistoricalDataInventoryItem[];
    exposureRisk: HistoricalDataInventoryItem[];
    staleHighValue: HistoricalDataInventoryItem[];
    highValueWeakQuality: HistoricalDataInventoryItem[];
  };
  items: HistoricalDataInventoryItem[];
};

const EVIDENCE_KEYS = [
  'snapshot',
  'insight',
  'final_decision',
  'idea_fit',
  'idea_extract',
  'completeness',
] as const;

export function defaultHistoricalInventoryThresholds(): HistoricalInventoryThresholds {
  return {
    staleFreshnessDays: 30,
    staleEvidenceDays: 30,
    lowEvidenceCoverageRate: 0.6,
    highQualityScore: 75,
    mediumQualityScore: 45,
  };
}

export function evaluateHistoricalInventoryItem(args: {
  signal: HistoricalInventoryFlagsInput & {
    repoId: string;
    fullName: string;
    htmlUrl: string;
  };
  now?: Date;
  thresholds?: Partial<HistoricalInventoryThresholds>;
}): HistoricalDataInventoryItem {
  const now = args.now ?? new Date();
  const thresholds = {
    ...defaultHistoricalInventoryThresholds(),
    ...args.thresholds,
  };
  const signal = args.signal;
  const evidencePresentCount = [
    signal.hasSnapshot,
    signal.hasInsight,
    signal.hasFinalDecision,
    signal.hasDeep && signal.hasSnapshot,
    signal.hasDeep && signal.hasInsight,
    signal.hasDeep,
  ].filter(Boolean).length;
  const evidenceCoverageRate = roundRatio(
    (typeof signal.evidenceCoverageRate === 'number'
      ? signal.evidenceCoverageRate
      : evidencePresentCount / EVIDENCE_KEYS.length),
  );
  const evidenceWeakCount =
    typeof signal.evidenceWeakCount === 'number'
      ? signal.evidenceWeakCount
      : Math.max(0, EVIDENCE_KEYS.length - evidencePresentCount);
  const evidenceConflictCount =
    typeof signal.evidenceConflictCount === 'number'
      ? signal.evidenceConflictCount
      : signal.conflictFlag
        ? 1
        : 0;
  const keyEvidenceMissingCount =
    typeof signal.keyEvidenceMissingCount === 'number'
      ? signal.keyEvidenceMissingCount
      : 0;
  const keyEvidenceWeakCount =
    typeof signal.keyEvidenceWeakCount === 'number'
      ? signal.keyEvidenceWeakCount
      : 0;
  const keyEvidenceConflictCount =
    typeof signal.keyEvidenceConflictCount === 'number'
      ? signal.keyEvidenceConflictCount
      : evidenceConflictCount > 0
        ? 1
        : 0;
  const evidenceMissingDimensions = takeUnique(
    signal.evidenceMissingDimensions ?? [],
  ) as EvidenceMapDimension[];
  const evidenceWeakDimensions = takeUnique(
    signal.evidenceWeakDimensions ?? [],
  ) as EvidenceMapDimension[];
  const evidenceConflictDimensions = takeUnique(
    signal.evidenceConflictDimensions ?? [],
  ) as EvidenceMapDimension[];
  const evidenceSupportingDimensions = takeUnique(
    signal.evidenceSupportingDimensions ?? [],
  ) as EvidenceMapDimension[];
  const missingReasons = takeUnique(signal.missingReasons);
  const missingReasonCount = missingReasons.length;
  const freshnessDays = toFreshnessDays(signal.lastCollectedAt, now);
  const evidenceFreshnessDays = toFreshnessDays(signal.lastAnalyzedAt, now);
  const normalizedConfidence =
    signal.confidenceScore === null
      ? 0
      : Math.max(0, Math.min(1, signal.confidenceScore));
  const evidenceDimensionCount = EVIDENCE_MAP_DIMENSIONS.length;

  const evidenceSummary: EvidenceMapInsightSummary = {
    coverageRate: evidenceCoverageRate,
    presentCount: Math.max(
      0,
      evidenceDimensionCount -
        evidenceWeakCount -
        evidenceMissingDimensions.length -
        evidenceConflictCount,
    ),
    weakCount: evidenceWeakCount,
    missingCount: evidenceMissingDimensions.length,
    conflictCount: evidenceConflictCount,
    averageConfidence: normalizedConfidence,
    averageFreshnessDays: evidenceFreshnessDays,
    supportingDimensions: evidenceSupportingDimensions,
    weakDimensions: evidenceWeakDimensions,
    missingDimensions: evidenceMissingDimensions,
    conflictDimensions: evidenceConflictDimensions,
    staleDimensions: [],
    keyMissingDimensions: evidenceMissingDimensions.slice(0, keyEvidenceMissingCount),
    keyWeakDimensions: evidenceWeakDimensions.slice(0, keyEvidenceWeakCount),
    keyConflictDimensions: evidenceConflictDimensions.slice(
      0,
      keyEvidenceConflictCount,
    ),
    decisionConflictDimensions: evidenceConflictDimensions.slice(
      0,
      keyEvidenceConflictCount,
    ),
    deepRepairDimensions: evidenceMissingDimensions.slice(0, keyEvidenceMissingCount),
    coreDecisionMissingDimensions: [],
    requiresDeepDimensions: [],
    summaryZh: '当前证据仍偏弱，需要补齐关键 evidence 后再稳定判断。',
    ...resolveGapTaxonomy({
      signal,
      evidenceMissingDimensions,
      evidenceWeakDimensions,
      evidenceConflictDimensions,
    }),
  };
  const keyEvidenceGapSeverity =
    evidenceSummary.keyEvidenceGapSeverity === 'NONE'
      ? normalizeEvidenceGapSeverity(signal.keyEvidenceGapSeverity)
      : evidenceSummary.keyEvidenceGapSeverity;
  const keyEvidenceGaps = evidenceSummary.keyEvidenceGaps;
  const conflictDrivenGaps = evidenceSummary.conflictDrivenGaps;
  const missingDrivenGaps = evidenceSummary.missingDrivenGaps;
  const weakDrivenGaps = evidenceSummary.weakDrivenGaps;
  const decisionRecalcGaps = evidenceSummary.decisionRecalcGaps;
  const deepRepairGaps = evidenceSummary.deepRepairGaps;
  const evidenceRepairGaps = evidenceSummary.evidenceRepairGaps;
  const trustedBlockingGaps = evidenceSummary.trustedBlockingGaps;

  const evidenceQuality = scoreEvidenceBackedQuality({
    evidence: evidenceSummary,
    hasDeep: signal.hasDeep,
    fallbackFlag: signal.fallbackFlag,
    conflictFlag: signal.conflictFlag,
    incompleteFlag: signal.incompleteFlag,
    freshnessDays,
    evidenceFreshnessDays,
    highQualityScore: thresholds.highQualityScore,
    mediumQualityScore: thresholds.mediumQualityScore,
  });
  const analysisQualityScore = evidenceQuality.analysisQualityScore;
  const analysisQualityState = evidenceQuality.analysisQualityState;

  const needsDeepRepair = Boolean(
    (signal.hasFinalDecision && !signal.hasDeep) || deepRepairGaps.length > 0,
  );
  const needsEvidenceRepair = Boolean(
    !signal.hasSnapshot ||
      !signal.hasInsight ||
      evidenceCoverageRate < thresholds.lowEvidenceCoverageRate ||
      missingReasonCount > 0 ||
      evidenceRepairGaps.length > 0,
  );
  const needsFreshnessRefresh = Boolean(
    (freshnessDays !== null && freshnessDays > thresholds.staleFreshnessDays) ||
      (evidenceFreshnessDays !== null &&
        evidenceFreshnessDays > thresholds.staleEvidenceDays),
  );
  const needsDecisionRecalc = Boolean(
    (signal.hasInsight && !signal.hasFinalDecision) ||
      signal.fallbackFlag ||
      signal.conflictFlag ||
      decisionRecalcGaps.length > 0 ||
      (signal.hasFinalDecision &&
        freshnessDays !== null &&
        evidenceFreshnessDays !== null &&
        freshnessDays > evidenceFreshnessDays),
  );
  const needsFrontendDowngrade = Boolean(
    signal.isUserReachable &&
      (signal.fallbackFlag ||
        signal.conflictFlag ||
        signal.incompleteFlag ||
        (analysisQualityState === 'LOW' ||
          analysisQualityState === 'CRITICAL') ||
        trustedBlockingGaps.length > 0 ||
        keyEvidenceGapSeverity === 'HIGH' ||
        keyEvidenceGapSeverity === 'CRITICAL' ||
        signal.homepageUnsafe ||
        needsFreshnessRefresh),
  );

  return {
    repoId: signal.repoId,
    fullName: signal.fullName,
    htmlUrl: signal.htmlUrl,
    hasSnapshot: signal.hasSnapshot,
    hasInsight: signal.hasInsight,
    hasFinalDecision: signal.hasFinalDecision,
    hasDeep: signal.hasDeep,
    qualityScoreSchemaVersion: evidenceQuality.qualityScoreSchemaVersion,
    analysisQualityScore,
    analysisQualityState,
    evidenceCoverageRate,
    evidenceWeakCount,
    evidenceConflictCount,
    keyEvidenceMissingCount,
    keyEvidenceWeakCount,
    keyEvidenceConflictCount,
    evidenceMissingDimensions,
    evidenceWeakDimensions,
    evidenceConflictDimensions,
    evidenceSupportingDimensions,
    keyEvidenceGaps,
    keyEvidenceGapSeverity,
    conflictDrivenGaps,
    missingDrivenGaps,
    weakDrivenGaps,
    decisionRecalcGaps,
    deepRepairGaps,
    evidenceRepairGaps,
    trustedBlockingGaps,
    highRiskGaps: evidenceSummary.highRiskGaps,
    qualityReasonSummary: evidenceQuality.qualityReasonSummary,
    qualityScoreBreakdown: evidenceQuality.qualityScoreBreakdown,
    qualityBlockingGaps: evidenceQuality.qualityBlockingGaps,
    missingReasonCount,
    missingReasons,
    fallbackFlag: signal.fallbackFlag,
    conflictFlag: signal.conflictFlag,
    incompleteFlag: signal.incompleteFlag,
    lastCollectedAt: signal.lastCollectedAt,
    lastAnalyzedAt: signal.lastAnalyzedAt,
    freshnessDays,
    evidenceFreshnessDays,
    isVisibleOnHome: signal.isVisibleOnHome,
    isVisibleOnFavorites: signal.isVisibleOnFavorites,
    appearedInDailySummary: signal.appearedInDailySummary ?? false,
    appearedInTelegram: signal.appearedInTelegram ?? false,
    hasDetailPageExposure: signal.hasDetailPageExposure,
    isUserReachable: signal.isUserReachable,
    moneyPriority: signal.moneyPriority,
    repositoryValueTier: signal.repositoryValueTier,
    collectionTier: signal.collectionTier,
    needsDeepRepair,
    needsEvidenceRepair,
    needsFreshnessRefresh,
    needsDecisionRecalc,
    needsFrontendDowngrade,
    conflictDrivenDecisionRecalc:
      Boolean(signal.conflictDrivenDecisionRecalc) || decisionRecalcGaps.length > 0,
    analysisStatus: signal.analysisStatus ?? null,
    displayStatus: signal.displayStatus ?? null,
    homepageUnsafe: signal.homepageUnsafe ?? false,
  };
}

function resolveGapTaxonomy(args: {
  signal: HistoricalInventoryFlagsInput;
  evidenceMissingDimensions: EvidenceMapDimension[];
  evidenceWeakDimensions: EvidenceMapDimension[];
  evidenceConflictDimensions: EvidenceMapDimension[];
}): EvidenceGapTaxonomySummary {
  const derived = buildEvidenceGapTaxonomy({
    missingDimensions: args.evidenceMissingDimensions,
    weakDimensions: args.evidenceWeakDimensions,
    conflictDimensions: args.evidenceConflictDimensions,
  });
  const keyEvidenceGaps = normalizeEvidenceGapTaxonomy(args.signal.keyEvidenceGaps);
  const conflictDrivenGaps = normalizeEvidenceGapTaxonomy(
    args.signal.conflictDrivenGaps,
  );
  const missingDrivenGaps = normalizeEvidenceGapTaxonomy(
    args.signal.missingDrivenGaps,
  );
  const weakDrivenGaps = normalizeEvidenceGapTaxonomy(args.signal.weakDrivenGaps);
  const decisionRecalcGaps = normalizeEvidenceGapTaxonomy(
    args.signal.decisionRecalcGaps,
  );
  const deepRepairGaps = normalizeEvidenceGapTaxonomy(args.signal.deepRepairGaps);
  const evidenceRepairGaps = normalizeEvidenceGapTaxonomy(
    args.signal.evidenceRepairGaps,
  );
  const trustedBlockingGaps = normalizeEvidenceGapTaxonomy(
    args.signal.trustedBlockingGaps,
  );
  return {
    ...derived,
    keyEvidenceGaps: keyEvidenceGaps.length
      ? keyEvidenceGaps
      : derived.keyEvidenceGaps,
    keyEvidenceGapSeverity:
      normalizeEvidenceGapSeverity(args.signal.keyEvidenceGapSeverity) !== 'NONE'
        ? normalizeEvidenceGapSeverity(args.signal.keyEvidenceGapSeverity)
        : derived.keyEvidenceGapSeverity,
    keyEvidenceGapSummary: derived.keyEvidenceGapSummary,
    conflictDrivenGaps: conflictDrivenGaps.length
      ? conflictDrivenGaps
      : derived.conflictDrivenGaps,
    missingDrivenGaps: missingDrivenGaps.length
      ? missingDrivenGaps
      : derived.missingDrivenGaps,
    weakDrivenGaps: weakDrivenGaps.length
      ? weakDrivenGaps
      : derived.weakDrivenGaps,
    decisionRecalcGaps: decisionRecalcGaps.length
      ? decisionRecalcGaps
      : derived.decisionRecalcGaps,
    deepRepairGaps: deepRepairGaps.length
      ? deepRepairGaps
      : derived.deepRepairGaps,
    evidenceRepairGaps: evidenceRepairGaps.length
      ? evidenceRepairGaps
      : derived.evidenceRepairGaps,
    trustedBlockingGaps: trustedBlockingGaps.length
      ? trustedBlockingGaps
      : derived.trustedBlockingGaps,
  };
}

export function buildHistoricalInventoryReport(args: {
  generatedAt: string;
  items: HistoricalDataInventoryItem[];
  thresholds?: Partial<HistoricalInventoryThresholds>;
}): HistoricalDataInventoryReport {
  const thresholds = {
    ...defaultHistoricalInventoryThresholds(),
    ...args.thresholds,
  };
  const items = args.items;
  const totalRepos = items.length || 1;
  const averageQualityScore = roundScore(
    items.reduce((sum, item) => sum + item.analysisQualityScore, 0) / totalRepos,
  );
  const moneyPriorityCounts = {
    P0: 0,
    P1: 0,
    P2: 0,
    P3: 0,
    NONE: 0,
  } as Record<'P0' | 'P1' | 'P2' | 'P3' | 'NONE', number>;
  const valueTierCounts = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  } as Record<HistoricalInventoryValueTier, number>;
  const collectionTierCounts = {
    CORE: 0,
    WATCH: 0,
    LONG_TAIL: 0,
  } as Record<HistoricalInventoryCollectionTier, number>;

  for (const item of items) {
    moneyPriorityCounts[item.moneyPriority ?? 'NONE'] += 1;
    valueTierCounts[item.repositoryValueTier] += 1;
    collectionTierCounts[item.collectionTier] += 1;
  }

  const summary = {
    totalRepos: items.length,
    completion: {
      hasSnapshot: countWhere(items, (item) => item.hasSnapshot),
      hasInsight: countWhere(items, (item) => item.hasInsight),
      hasFinalDecision: countWhere(items, (item) => item.hasFinalDecision),
      hasDeep: countWhere(items, (item) => item.hasDeep),
      finalDecisionButNoDeep: countWhere(
        items,
        (item) => item.hasFinalDecision && !item.hasDeep,
      ),
    },
    quality: {
      averageQualityScore,
      lowQualityCount: countWhere(
        items,
        (item) =>
          item.analysisQualityState === 'LOW' ||
          item.analysisQualityState === 'CRITICAL',
      ),
      criticalQualityCount: countWhere(
        items,
        (item) => item.analysisQualityState === 'CRITICAL',
      ),
      mediumQualityCount: countWhere(
        items,
        (item) => item.analysisQualityState === 'MEDIUM',
      ),
      fallbackCount: countWhere(items, (item) => item.fallbackFlag),
      conflictCount: countWhere(items, (item) => item.conflictFlag),
      incompleteCount: countWhere(items, (item) => item.incompleteFlag),
      lowEvidenceCoverageCount: countWhere(
        items,
        (item) => item.evidenceCoverageRate < thresholds.lowEvidenceCoverageRate,
      ),
      highValueWeakQualityCount: countWhere(
        items,
        (item) =>
          item.repositoryValueTier === 'HIGH' &&
          item.analysisQualityState !== 'HIGH',
      ),
    },
    freshness: {
      staleCollectionCount: countWhere(
        items,
        (item) =>
          item.freshnessDays !== null &&
          item.freshnessDays > thresholds.staleFreshnessDays,
      ),
      staleEvidenceCount: countWhere(
        items,
        (item) =>
          item.evidenceFreshnessDays !== null &&
          item.evidenceFreshnessDays > thresholds.staleEvidenceDays,
      ),
      staleAnyCount: countWhere(
        items,
        (item) => item.needsFreshnessRefresh,
      ),
    },
    exposure: {
      homeVisibleCount: countWhere(items, (item) => item.isVisibleOnHome),
      favoritesVisibleCount: countWhere(
        items,
        (item) => item.isVisibleOnFavorites,
      ),
      dailySummaryVisibleCount: countWhere(
        items,
        (item) => item.appearedInDailySummary,
      ),
      telegramVisibleCount: countWhere(
        items,
        (item) => item.appearedInTelegram,
      ),
      detailExposureCount: countWhere(
        items,
        (item) => item.hasDetailPageExposure,
      ),
      userReachableCount: countWhere(items, (item) => item.isUserReachable),
      frontendPollutionRiskCount: countWhere(
        items,
        (item) => item.needsFrontendDowngrade,
      ),
      homePollutionRiskCount: countWhere(
        items,
        (item) => item.isVisibleOnHome && item.needsFrontendDowngrade,
      ),
      favoritesPollutionRiskCount: countWhere(
        items,
        (item) => item.isVisibleOnFavorites && item.needsFrontendDowngrade,
      ),
      detailPollutionRiskCount: countWhere(
        items,
        (item) => item.hasDetailPageExposure && item.needsFrontendDowngrade,
      ),
    },
    business: {
      highValueCount: countWhere(
        items,
        (item) => item.repositoryValueTier === 'HIGH',
      ),
      moneyPriorityCounts,
      valueTierCounts,
      collectionTierCounts,
    },
    repair: {
      needsDeepRepair: countWhere(items, (item) => item.needsDeepRepair),
      needsEvidenceRepair: countWhere(items, (item) => item.needsEvidenceRepair),
      needsFreshnessRefresh: countWhere(
        items,
        (item) => item.needsFreshnessRefresh,
      ),
      needsDecisionRecalc: countWhere(
        items,
        (item) => item.needsDecisionRecalc,
      ),
      needsFrontendDowngrade: countWhere(
        items,
        (item) => item.needsFrontendDowngrade,
      ),
    },
    topIssues: [] as Array<{ key: string; count: number; summary: string }>,
  };

  summary.topIssues = [
    {
      key: 'needsEvidenceRepair',
      count: summary.repair.needsEvidenceRepair,
      summary: '证据层仍不完整，snapshot / insight / deep 至少有一层缺失。',
    },
    {
      key: 'frontendPollutionRisk',
      count: summary.exposure.frontendPollutionRiskCount,
      summary: '仍可能污染首页、收藏或详情的历史数据。',
    },
    {
      key: 'finalDecisionButNoDeep',
      count: summary.completion.finalDecisionButNoDeep,
      summary: '已有 finalDecision，但 deep 三件套仍未补齐。',
    },
    {
      key: 'needsDecisionRecalc',
      count: summary.repair.needsDecisionRecalc,
      summary: '当前判断需要重算，常见原因是 fallback / conflict 或证据更新后未重算。',
    },
    {
      key: 'highValueWeakQuality',
      count: summary.quality.highValueWeakQualityCount,
      summary: '高价值 repo 里仍有明显质量偏弱的判断。',
    },
  ].sort((left, right) => right.count - left.count);

  return {
    generatedAt: args.generatedAt,
    thresholds,
    summary,
    samples: {
      finalDecisionButNoDeep: pickTopSamples(
        items.filter((item) => item.hasFinalDecision && !item.hasDeep),
      ),
      exposureRisk: pickTopSamples(
        items.filter((item) => item.needsFrontendDowngrade),
      ),
      staleHighValue: pickTopSamples(
        items.filter(
          (item) =>
            item.repositoryValueTier === 'HIGH' && item.needsFreshnessRefresh,
        ),
      ),
      highValueWeakQuality: pickTopSamples(
        items.filter(
          (item) =>
            item.repositoryValueTier === 'HIGH' &&
            item.analysisQualityState !== 'HIGH',
        ),
      ),
    },
    items,
  };
}

export function renderHistoricalInventoryMarkdown(
  report: HistoricalDataInventoryReport,
) {
  const { summary, thresholds } = report;
  const lines = [
    '# GitDian 历史数据体检报告',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- staleFreshnessDays: ${thresholds.staleFreshnessDays}`,
    `- staleEvidenceDays: ${thresholds.staleEvidenceDays}`,
    '',
    '## 总览',
    '',
    `- 全库 repo: ${summary.totalRepos}`,
    `- hasFinalDecision && !hasDeep: ${summary.completion.finalDecisionButNoDeep}`,
    `- fallback / conflict / incomplete: ${summary.quality.fallbackCount} / ${summary.quality.conflictCount} / ${summary.quality.incompleteCount}`,
    `- freshness 过旧: ${summary.freshness.staleAnyCount}`,
    `- 可能污染前台: ${summary.exposure.frontendPollutionRiskCount}`,
    `- 高价值但质量偏弱: ${summary.quality.highValueWeakQualityCount}`,
    '',
    '## 回答核心问题',
    '',
    `- 全库有多少 repo 处于 hasFinalDecision && !hasDeep：${summary.completion.finalDecisionButNoDeep}`,
    `- 有多少 repo 属于 fallback/conflict/incomplete：${summary.quality.fallbackCount}/${summary.quality.conflictCount}/${summary.quality.incompleteCount}`,
    `- 有多少 repo freshness 过旧：${summary.freshness.staleAnyCount}`,
    `- 有多少 repo 仍可能污染首页/收藏/详情：${summary.exposure.homePollutionRiskCount}/${summary.exposure.favoritesPollutionRiskCount}/${summary.exposure.detailPollutionRiskCount}`,
    `- 高价值 repo 里有多少分析质量偏弱：${summary.quality.highValueWeakQualityCount}`,
    '',
    '## 修复建议分布',
    '',
    `- needsDeepRepair: ${summary.repair.needsDeepRepair}`,
    `- needsEvidenceRepair: ${summary.repair.needsEvidenceRepair}`,
    `- needsFreshnessRefresh: ${summary.repair.needsFreshnessRefresh}`,
    `- needsDecisionRecalc: ${summary.repair.needsDecisionRecalc}`,
    `- needsFrontendDowngrade: ${summary.repair.needsFrontendDowngrade}`,
    '',
    '## 前 5 个核心问题',
    '',
    ...summary.topIssues.slice(0, 5).map(
      (item, index) => `${index + 1}. ${item.key}: ${item.count} · ${item.summary}`,
    ),
    '',
    '## 高风险样本',
    '',
    '### finalDecision 但没有 deep',
    ...renderSampleLines(report.samples.finalDecisionButNoDeep),
    '',
    '### 仍可能污染前台',
    ...renderSampleLines(report.samples.exposureRisk),
    '',
    '### 高价值但数据已过旧',
    ...renderSampleLines(report.samples.staleHighValue),
    '',
    '### 高价值但质量偏弱',
    ...renderSampleLines(report.samples.highValueWeakQuality),
    '',
    '## 口径说明',
    '',
    '- analysisQualityScore 现在是 evidence-backed 的质量总线；它综合了 completeness、evidence 覆盖率、gap penalty、新鲜度、deep completion 与 trusted eligibility。',
    '- evidenceCoverageRate 先按 snapshot / insight / finalDecision / ideaFit / ideaExtract / completeness 六层估算。',
    '- collectionTier 当前是推导字段：CORE > WATCH > LONG_TAIL，用于区分收藏/首页/长尾库存。',
  ];

  return lines.join('\n');
}

function renderSampleLines(items: HistoricalDataInventoryItem[]) {
  if (!items.length) {
    return ['- 无'];
  }

  return items.map(
    (item) =>
      `- ${item.fullName} | quality=${item.analysisQualityScore}(${item.analysisQualityState}) | priority=${item.moneyPriority ?? 'NONE'} | value=${item.repositoryValueTier} | reachable=${item.isUserReachable} | repairs=${collectRepairFlags(item).join(', ')}`,
  );
}

function collectRepairFlags(item: HistoricalDataInventoryItem) {
  const flags: string[] = [];
  if (item.needsDeepRepair) {
    flags.push('deep');
  }
  if (item.needsEvidenceRepair) {
    flags.push('evidence');
  }
  if (item.needsFreshnessRefresh) {
    flags.push('freshness');
  }
  if (item.needsDecisionRecalc) {
    flags.push('decision');
  }
  if (item.needsFrontendDowngrade) {
    flags.push('frontend');
  }
  return flags.length ? flags : ['none'];
}

function pickTopSamples(items: HistoricalDataInventoryItem[], limit = 10) {
  return items
    .slice()
    .sort((left, right) => {
      const valueRank = compareValueTier(right.repositoryValueTier, left.repositoryValueTier);
      if (valueRank !== 0) {
        return valueRank;
      }
      return right.analysisQualityScore - left.analysisQualityScore;
    })
    .slice(0, limit);
}

function compareValueTier(
  left: HistoricalInventoryValueTier,
  right: HistoricalInventoryValueTier,
) {
  return valueTierRank(left) - valueTierRank(right);
}

function valueTierRank(tier: HistoricalInventoryValueTier) {
  return tier === 'HIGH' ? 3 : tier === 'MEDIUM' ? 2 : 1;
}

function toFreshnessDays(value: string | null, now: Date) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}

function roundScore(value: number) {
  return Number(value.toFixed(2));
}

function takeUnique(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  );
}

function countWhere<T>(items: T[], predicate: (item: T) => boolean) {
  return items.filter(predicate).length;
}
