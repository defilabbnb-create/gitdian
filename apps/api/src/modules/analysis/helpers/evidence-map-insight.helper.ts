import type {
  EvidenceMapDimension,
  EvidenceMapNode,
  RepositoryEvidenceMap,
} from './evidence-map.helper';
import {
  buildEvidenceGapTaxonomy,
  formatEvidenceGapLabels,
  type EvidenceGapTaxonomySummary,
} from './evidence-gap-taxonomy.helper';

export const EVIDENCE_DECISION_CONFLICT_DIMENSIONS: EvidenceMapDimension[] = [
  'user',
  'monetization',
  'execution',
];

export const EVIDENCE_DEEP_REPAIR_DIMENSIONS: EvidenceMapDimension[] = [
  'technical_maturity',
  'execution',
  'market',
  'distribution',
];

export const EVIDENCE_CORE_DECISION_DIMENSIONS: EvidenceMapDimension[] = [
  'problem',
  'user',
  'monetization',
];

export type EvidenceMapInsightSummary = {
  coverageRate: number;
  presentCount: number;
  weakCount: number;
  missingCount: number;
  conflictCount: number;
  averageConfidence: number;
  averageFreshnessDays: number | null;
  supportingDimensions: EvidenceMapDimension[];
  weakDimensions: EvidenceMapDimension[];
  missingDimensions: EvidenceMapDimension[];
  conflictDimensions: EvidenceMapDimension[];
  staleDimensions: EvidenceMapDimension[];
  keyMissingDimensions: EvidenceMapDimension[];
  keyWeakDimensions: EvidenceMapDimension[];
  keyConflictDimensions: EvidenceMapDimension[];
  decisionConflictDimensions: EvidenceMapDimension[];
  deepRepairDimensions: EvidenceMapDimension[];
  coreDecisionMissingDimensions: EvidenceMapDimension[];
  requiresDeepDimensions: EvidenceMapDimension[];
  summaryZh: string;
} & EvidenceGapTaxonomySummary;

export type EvidenceBackedQualityResult = {
  qualityScoreSchemaVersion: string;
  analysisQualityScore: number;
  analysisQualityState: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
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
};

export const ANALYSIS_QUALITY_SCORE_SCHEMA_VERSION = '2026-03-27.v2';

export type EvidenceDrivenDecisionSummary = {
  evidenceCoverageRate: number;
  supportingEvidence: Array<{
    dimension: EvidenceMapDimension;
    summary: string;
    confidence: number;
  }>;
  weakEvidence: Array<{
    dimension: EvidenceMapDimension;
    summary: string;
    missingReason: string | null;
  }>;
  missingEvidence: Array<{
    dimension: EvidenceMapDimension;
    missingReason: string | null;
  }>;
  conflictingEvidence: Array<{
    dimension: EvidenceMapDimension;
    summary: string;
  }>;
  worthReviewing: boolean;
  worthValidating: boolean;
  worthBuilding: boolean;
  currentAction:
    | 'downgrade_only'
    | 'refresh_only'
    | 'evidence_repair'
    | 'deep_repair'
    | 'decision_recalc'
    | 'validate'
    | 'build';
  summaryZh: string;
};

export function summarizeEvidenceMap(
  map: RepositoryEvidenceMap,
): EvidenceMapInsightSummary {
  const entries = Object.entries(map.evidence) as Array<
    [EvidenceMapDimension, EvidenceMapNode]
  >;
  const supportingDimensions = entries
    .filter(([, node]) => node.status === 'present')
    .map(([dimension]) => dimension);
  const weakDimensions = entries
    .filter(([, node]) => node.status === 'weak')
    .map(([dimension]) => dimension);
  const missingDimensions = entries
    .filter(([, node]) => node.status === 'missing')
    .map(([dimension]) => dimension);
  const conflictDimensions = entries
    .filter(([, node]) => node.status === 'conflict' || node.conflictFlag)
    .map(([dimension]) => dimension);
  const staleDimensions = entries
    .filter(([, node]) => node.freshnessDays !== null && node.freshnessDays > 30)
    .map(([dimension]) => dimension);
  const requiresDeepDimensions = entries
    .filter(([, node]) => node.requiresDeep)
    .map(([dimension]) => dimension);
  const averageConfidence = round(
    entries.reduce((sum, [, node]) => sum + node.confidence, 0) /
      Math.max(1, entries.length),
  );
  const freshnessValues = entries
    .map(([, node]) => node.freshnessDays)
    .filter((value): value is number => typeof value === 'number');
  const averageFreshnessDays = freshnessValues.length
    ? round(
        freshnessValues.reduce((sum, value) => sum + value, 0) /
          freshnessValues.length,
      )
    : null;
  const keyMissingDimensions = intersectDimensions(
    missingDimensions,
    uniqueDimensions([
      ...EVIDENCE_DEEP_REPAIR_DIMENSIONS,
      ...EVIDENCE_CORE_DECISION_DIMENSIONS,
    ]),
  );
  const keyWeakDimensions = intersectDimensions(
    weakDimensions,
    uniqueDimensions([
      ...EVIDENCE_DEEP_REPAIR_DIMENSIONS,
      ...EVIDENCE_CORE_DECISION_DIMENSIONS,
    ]),
  );
  const keyConflictDimensions = intersectDimensions(
    conflictDimensions,
    uniqueDimensions([
      ...EVIDENCE_DECISION_CONFLICT_DIMENSIONS,
      ...EVIDENCE_CORE_DECISION_DIMENSIONS,
    ]),
  );
  const decisionConflictDimensions = intersectDimensions(
    conflictDimensions,
    EVIDENCE_DECISION_CONFLICT_DIMENSIONS,
  );
  const deepRepairDimensions = uniqueDimensions([
    ...intersectDimensions(missingDimensions, EVIDENCE_DEEP_REPAIR_DIMENSIONS),
    ...intersectDimensions(
      weakDimensions.filter((dimension) => requiresDeepDimensions.includes(dimension)),
      EVIDENCE_DEEP_REPAIR_DIMENSIONS,
    ),
  ]);
  const coreDecisionMissingDimensions = intersectDimensions(
    missingDimensions,
    EVIDENCE_CORE_DECISION_DIMENSIONS,
  );
  const gapTaxonomy = buildEvidenceGapTaxonomy({
    missingDimensions,
    weakDimensions,
    conflictDimensions,
  });

  return {
    coverageRate: map.summary.overallCoverageRate,
    presentCount: map.summary.presentCount,
    weakCount: map.summary.weakCount,
    missingCount: map.summary.missingCount,
    conflictCount: map.summary.conflictCount,
    averageConfidence,
    averageFreshnessDays,
    supportingDimensions,
    weakDimensions,
    missingDimensions,
    conflictDimensions,
    staleDimensions,
    keyMissingDimensions,
    keyWeakDimensions,
    keyConflictDimensions,
    decisionConflictDimensions,
    deepRepairDimensions,
    coreDecisionMissingDimensions,
    requiresDeepDimensions,
    summaryZh: buildEvidenceSummaryText({
      supportingDimensions,
      weakDimensions,
      missingDimensions,
      conflictDimensions,
      staleDimensions,
    }),
    ...gapTaxonomy,
  };
}

export function scoreEvidenceBackedQuality(args: {
  evidence: EvidenceMapInsightSummary;
  hasDeep: boolean;
  fallbackFlag: boolean;
  conflictFlag: boolean;
  incompleteFlag: boolean;
  freshnessDays: number | null;
  evidenceFreshnessDays: number | null;
  highQualityScore: number;
  mediumQualityScore: number;
}): EvidenceBackedQualityResult {
  const completenessScore =
    Math.max(
      0,
      24 -
        Math.min(12, args.evidence.missingDrivenGaps.length * 4) -
        Math.min(6, args.incompleteFlag ? 6 : 0),
    );
  const evidenceCoverageScore = round(args.evidence.coverageRate * 32);
  const freshnessScore = freshnessContribution(
    args.freshnessDays,
    args.evidenceFreshnessDays,
    args.evidence.averageFreshnessDays,
  );
  const deepCompletionBonus = args.hasDeep ? 12 : 0;
  const missingPenalty = Math.min(
    34,
    args.evidence.missingDrivenGaps.length * 8 +
      args.evidence.highRiskGaps.filter((gap) => gap.endsWith('_missing')).length * 4,
  );
  const conflictPenalty = Math.min(
    40,
    args.evidence.conflictDrivenGaps.length * 12 +
      args.evidence.highRiskGaps.filter((gap) => gap.endsWith('_conflict')).length * 3,
  );
  const weakPenalty = Math.min(18, args.evidence.weakDrivenGaps.length * 3);
  const trustedEligibilityPenalty = Math.min(
    18,
    args.evidence.trustedBlockingGaps.length * 4 +
      (args.evidence.keyEvidenceGapSeverity === 'HIGH' ? 4 : 0) +
      (args.evidence.keyEvidenceGapSeverity === 'CRITICAL' ? 8 : 0),
  );
  const fallbackPenalty = args.fallbackFlag ? 14 : args.conflictFlag ? 10 : 0;
  const incompletePenalty = args.incompleteFlag ? 8 : 0;
  const score = clampScore(
    completenessScore +
      evidenceCoverageScore +
      freshnessScore +
      deepCompletionBonus -
      missingPenalty -
      conflictPenalty -
      weakPenalty -
      trustedEligibilityPenalty -
      fallbackPenalty -
      incompletePenalty,
  );

  const forceCritical = Boolean(
    args.evidence.keyEvidenceGapSeverity === 'CRITICAL' ||
      args.evidence.conflictDrivenGaps.length > 0 ||
      (args.fallbackFlag && args.evidence.trustedBlockingGaps.length > 0) ||
      (args.conflictFlag && args.evidence.trustedBlockingGaps.length > 0),
  );
  const forceLow = Boolean(
    !forceCritical &&
      (args.evidence.keyEvidenceGapSeverity === 'HIGH' ||
        args.incompleteFlag ||
        args.evidence.highRiskGaps.length > 0 ||
        args.evidence.missingDrivenGaps.length >= 2),
  );
  const analysisQualityState = forceCritical
    ? 'CRITICAL'
    : forceLow
      ? 'LOW'
      : score >= args.highQualityScore &&
            args.hasDeep &&
            args.evidence.trustedBlockingGaps.length === 0 &&
            !args.fallbackFlag &&
            !args.conflictFlag &&
            !args.incompleteFlag
        ? 'HIGH'
        : score >= args.mediumQualityScore
          ? 'MEDIUM'
          : 'LOW';

  return {
    qualityScoreSchemaVersion: ANALYSIS_QUALITY_SCORE_SCHEMA_VERSION,
    analysisQualityScore: score,
    analysisQualityState,
    qualityReasonSummary: buildQualityReasonSummary({
      evidence: args.evidence,
      hasDeep: args.hasDeep,
      fallbackFlag: args.fallbackFlag,
      conflictFlag: args.conflictFlag,
      incompleteFlag: args.incompleteFlag,
    }),
    qualityScoreBreakdown: {
      completenessScore,
      evidenceCoverageScore,
      missingPenalty,
      conflictPenalty,
      freshnessScore,
      deepCompletionBonus,
      trustedEligibilityPenalty,
      weakPenalty,
      fallbackPenalty,
      incompletePenalty,
    },
    qualityBlockingGaps: args.evidence.trustedBlockingGaps,
  };
}

export function buildEvidenceDrivenDecisionSummary(args: {
  evidenceMap: RepositoryEvidenceMap;
  evidence: EvidenceMapInsightSummary;
  currentAction: 'BUILD' | 'CLONE' | 'IGNORE';
  frontendDecisionState: 'trusted' | 'provisional' | 'degraded';
  hasDeep: boolean;
}): EvidenceDrivenDecisionSummary {
  const supportingEvidence = pickEvidenceDetails(
    args.evidenceMap,
    args.evidence.supportingDimensions,
  );
  const weakEvidence = args.evidence.weakDimensions.map((dimension) => ({
    dimension,
    summary: args.evidenceMap.evidence[dimension].summary,
    missingReason: args.evidenceMap.evidence[dimension].missingReason,
  }));
  const missingEvidence = args.evidence.missingDimensions.map((dimension) => ({
    dimension,
    missingReason: args.evidenceMap.evidence[dimension].missingReason,
  }));
  const conflictingEvidence = args.evidence.conflictDimensions.map((dimension) => ({
    dimension,
    summary: args.evidenceMap.evidence[dimension].summary,
  }));

  let currentAction: EvidenceDrivenDecisionSummary['currentAction'] = 'validate';
  if (args.evidence.decisionRecalcGaps.length > 0) {
    currentAction = 'decision_recalc';
  } else if (args.evidence.deepRepairGaps.length > 0) {
    currentAction = args.hasDeep ? 'evidence_repair' : 'deep_repair';
  } else if (args.evidence.evidenceRepairGaps.length > 0) {
    currentAction = 'evidence_repair';
  } else if (args.evidence.staleDimensions.length > 0) {
    currentAction = 'refresh_only';
  } else if (args.frontendDecisionState === 'degraded') {
    currentAction = 'downgrade_only';
  } else if (args.currentAction === 'BUILD') {
    currentAction = 'build';
  } else {
    currentAction = 'validate';
  }

  return {
    evidenceCoverageRate: args.evidence.coverageRate,
    supportingEvidence,
    weakEvidence,
    missingEvidence,
    conflictingEvidence,
    worthReviewing: Boolean(
      args.evidence.decisionRecalcGaps.length > 0 ||
        args.frontendDecisionState === 'degraded' ||
        currentAction === 'decision_recalc',
    ),
    worthValidating: Boolean(
      currentAction === 'validate' ||
        currentAction === 'evidence_repair' ||
        currentAction === 'refresh_only',
    ),
    worthBuilding: Boolean(
      currentAction === 'build' &&
        args.frontendDecisionState === 'trusted' &&
        args.evidence.trustedBlockingGaps.length === 0,
    ),
    currentAction,
    summaryZh: buildDecisionSummaryText({
      frontendDecisionState: args.frontendDecisionState,
      currentAction,
      evidence: args.evidence,
    }),
  };
}

function buildEvidenceSummaryText(args: {
  supportingDimensions: EvidenceMapDimension[];
  weakDimensions: EvidenceMapDimension[];
  missingDimensions: EvidenceMapDimension[];
  conflictDimensions: EvidenceMapDimension[];
  staleDimensions: EvidenceMapDimension[];
}) {
  const chunks: string[] = [];
  if (args.conflictDimensions.length) {
    chunks.push(`冲突集中在 ${formatDimensions(args.conflictDimensions)}`);
  }
  if (args.missingDimensions.length) {
    chunks.push(`缺少 ${formatDimensions(args.missingDimensions)} 证据`);
  }
  if (args.weakDimensions.length) {
    chunks.push(`${formatDimensions(args.weakDimensions)} 证据偏弱`);
  }
  if (args.staleDimensions.length) {
    chunks.push(`${formatDimensions(args.staleDimensions)} 偏旧`);
  }
  if (!chunks.length && args.supportingDimensions.length) {
    chunks.push(`当前主要由 ${formatDimensions(args.supportingDimensions)} 支撑`);
  }
  return chunks[0] ?? '当前证据仍偏弱，需要补充更多结构化信号。';
}

function buildQualityReasonSummary(args: {
  evidence: EvidenceMapInsightSummary;
  hasDeep: boolean;
  fallbackFlag: boolean;
  conflictFlag: boolean;
  incompleteFlag: boolean;
}) {
  const reasons: string[] = [];
  if (args.evidence.conflictDrivenGaps.length) {
    reasons.push(formatEvidenceGapLabels(args.evidence.conflictDrivenGaps));
  }
  if (args.evidence.missingDrivenGaps.length) {
    reasons.push(formatEvidenceGapLabels(args.evidence.missingDrivenGaps));
  }
  if (args.evidence.weakDrivenGaps.length) {
    reasons.push(formatEvidenceGapLabels(args.evidence.weakDrivenGaps));
  }
  if (args.evidence.staleDimensions.length) {
    reasons.push('证据新鲜度偏旧');
  }
  if (args.fallbackFlag || args.conflictFlag || args.incompleteFlag) {
    reasons.push('历史分析链路不稳定');
  }
  if (!reasons.length && args.hasDeep) {
    reasons.push('deep 证据完整且覆盖较高');
  }
  if (!reasons.length) {
    reasons.push('当前证据覆盖有限');
  }
  return reasons.slice(0, 3).join('；');
}

function buildDecisionSummaryText(args: {
  frontendDecisionState: 'trusted' | 'provisional' | 'degraded';
  currentAction: EvidenceDrivenDecisionSummary['currentAction'];
  evidence: EvidenceMapInsightSummary;
}) {
  if (args.currentAction === 'decision_recalc') {
    return `当前判断由 ${formatEvidenceGapLabels(
      args.evidence.decisionRecalcGaps,
    )} 卡住，必须先重算判断。`;
  }
  if (args.currentAction === 'deep_repair') {
    return `当前只能先补 ${formatEvidenceGapLabels(
      args.evidence.deepRepairGaps,
    )} 这类关键缺口，再决定是否继续推进。`;
  }
  if (args.currentAction === 'evidence_repair') {
    return `当前结论已有基础支撑，但 ${formatEvidenceGapLabels(
      args.evidence.evidenceRepairGaps,
    )} 仍需补强，先补证据再推进更稳。`;
  }
  if (args.currentAction === 'refresh_only') {
    return '当前主要问题是证据偏旧，先刷新再判断是否继续推进。';
  }
  if (args.currentAction === 'downgrade_only') {
    return '当前证据不足以继续维持强结论，先降级展示更稳。';
  }
  if (args.currentAction === 'build') {
    return '当前关键证据已较完整，可以进入更具体的验证与搭建。';
  }
  if (args.frontendDecisionState === 'trusted') {
    return '当前证据能支撑继续验证，但仍应保持证据追踪。';
  }
  return '当前更适合先验证，不适合直接做强推进结论。';
}

function pickEvidenceDetails(
  map: RepositoryEvidenceMap,
  dimensions: EvidenceMapDimension[],
) {
  return dimensions.map((dimension) => ({
    dimension,
    summary: map.evidence[dimension].summary,
    confidence: map.evidence[dimension].confidence,
  }));
}

function freshnessContribution(
  freshnessDays: number | null,
  evidenceFreshnessDays: number | null,
  averageFreshnessDays: number | null,
) {
  const freshest = [freshnessDays, evidenceFreshnessDays, averageFreshnessDays].filter(
    (value): value is number => typeof value === 'number',
  );
  if (!freshest.length) {
    return 0;
  }

  const best = Math.min(...freshest);
  return Math.max(0, Math.min(10, 10 - best / 6));
}

function formatDimensions(dimensions: EvidenceMapDimension[]) {
  return uniqueDimensions(dimensions)
    .map((dimension) => DIMENSION_LABELS[dimension])
    .join(' / ');
}

function intersectDimensions(
  source: EvidenceMapDimension[],
  target: EvidenceMapDimension[],
) {
  const targetSet = new Set(target);
  return uniqueDimensions(source.filter((dimension) => targetSet.has(dimension)));
}

function uniqueDimensions(dimensions: EvidenceMapDimension[]) {
  return [...new Set(dimensions)];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

const DIMENSION_LABELS: Record<EvidenceMapDimension, string> = {
  problem: 'problem',
  user: 'user',
  distribution: 'distribution',
  monetization: 'monetization',
  execution: 'execution',
  market: 'market',
  technical_maturity: 'technical_maturity',
};
