import type { EvidenceMapDimension } from './evidence-map.helper';

export type EvidenceGapDriverKind = 'missing' | 'weak' | 'conflict';
export type KeyEvidenceGapTaxonomy =
  `${EvidenceMapDimension}_${EvidenceGapDriverKind}`;
export type KeyEvidenceGapSeverity =
  | 'NONE'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type EvidenceGapTaxonomySummary = {
  keyEvidenceGaps: KeyEvidenceGapTaxonomy[];
  keyEvidenceGapSeverity: KeyEvidenceGapSeverity;
  keyEvidenceGapSummary: string;
  conflictDrivenGaps: KeyEvidenceGapTaxonomy[];
  missingDrivenGaps: KeyEvidenceGapTaxonomy[];
  weakDrivenGaps: KeyEvidenceGapTaxonomy[];
  decisionRecalcGaps: KeyEvidenceGapTaxonomy[];
  deepRepairGaps: KeyEvidenceGapTaxonomy[];
  evidenceRepairGaps: KeyEvidenceGapTaxonomy[];
  trustedBlockingGaps: KeyEvidenceGapTaxonomy[];
  provisionalGaps: KeyEvidenceGapTaxonomy[];
  degradedGaps: KeyEvidenceGapTaxonomy[];
  highRiskGaps: KeyEvidenceGapTaxonomy[];
};

const GAP_DIMENSIONS: EvidenceMapDimension[] = [
  'problem',
  'user',
  'distribution',
  'monetization',
  'execution',
  'market',
  'technical_maturity',
];

const GAP_STATUSES: EvidenceGapDriverKind[] = ['missing', 'weak', 'conflict'];

export const EVIDENCE_GAP_TAXONOMY = GAP_DIMENSIONS.flatMap((dimension) =>
  GAP_STATUSES.map(
    (status) => `${dimension}_${status}` as KeyEvidenceGapTaxonomy,
  ),
);

export const DECISION_RECALC_GAP_TAXONOMY: KeyEvidenceGapTaxonomy[] = [
  'user_conflict',
  'monetization_conflict',
  'execution_conflict',
];

export const DEEP_REPAIR_GAP_TAXONOMY: KeyEvidenceGapTaxonomy[] = [
  'technical_maturity_missing',
  'execution_missing',
  'market_missing',
  'distribution_missing',
];

export function buildEvidenceGapTaxonomy(args: {
  missingDimensions?: EvidenceMapDimension[] | null;
  weakDimensions?: EvidenceMapDimension[] | null;
  conflictDimensions?: EvidenceMapDimension[] | null;
}): EvidenceGapTaxonomySummary {
  const missingDrivenGaps = toGapList(args.missingDimensions, 'missing');
  const weakDrivenGaps = toGapList(args.weakDimensions, 'weak');
  const conflictDrivenGaps = toGapList(args.conflictDimensions, 'conflict');
  const keyEvidenceGaps = uniqueGaps([
    ...conflictDrivenGaps,
    ...missingDrivenGaps,
    ...weakDrivenGaps,
  ]);
  const decisionRecalcGaps = intersectGaps(
    conflictDrivenGaps,
    DECISION_RECALC_GAP_TAXONOMY,
  );
  const deepRepairGaps = intersectGaps(missingDrivenGaps, DEEP_REPAIR_GAP_TAXONOMY);
  const evidenceRepairGaps = uniqueGaps([
    ...weakDrivenGaps,
    ...missingDrivenGaps.filter((gap) => !deepRepairGaps.includes(gap)),
  ]);
  const trustedBlockingGaps = uniqueGaps([
    ...conflictDrivenGaps,
    ...missingDrivenGaps,
    ...weakDrivenGaps,
  ]);
  const degradedGaps = uniqueGaps([
    ...conflictDrivenGaps,
    ...deepRepairGaps,
  ]);
  const provisionalGaps = uniqueGaps([
    ...missingDrivenGaps.filter((gap) => !deepRepairGaps.includes(gap)),
    ...weakDrivenGaps,
  ]);
  const highRiskGaps = uniqueGaps([
    ...decisionRecalcGaps,
    ...deepRepairGaps,
    ...intersectGaps(missingDrivenGaps, [
      'problem_missing',
      'user_missing',
      'monetization_missing',
    ]),
  ]);

  return {
    keyEvidenceGaps,
    keyEvidenceGapSeverity: resolveGapSeverity({
      conflictDrivenGaps,
      missingDrivenGaps,
      weakDrivenGaps,
      highRiskGaps,
    }),
    keyEvidenceGapSummary: buildGapSummary({
      conflictDrivenGaps,
      missingDrivenGaps,
      weakDrivenGaps,
    }),
    conflictDrivenGaps,
    missingDrivenGaps,
    weakDrivenGaps,
    decisionRecalcGaps,
    deepRepairGaps,
    evidenceRepairGaps,
    trustedBlockingGaps,
    provisionalGaps,
    degradedGaps,
    highRiskGaps,
  };
}

export function normalizeEvidenceGapTaxonomy(
  value: unknown,
): KeyEvidenceGapTaxonomy[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowed = new Set(EVIDENCE_GAP_TAXONOMY);
  return uniqueGaps(
    value.filter(
      (item): item is KeyEvidenceGapTaxonomy =>
        typeof item === 'string' && allowed.has(item as KeyEvidenceGapTaxonomy),
    ),
  );
}

export function normalizeEvidenceGapSeverity(
  value: unknown,
): KeyEvidenceGapSeverity {
  switch (value) {
    case 'LOW':
    case 'MEDIUM':
    case 'HIGH':
    case 'CRITICAL':
      return value;
    case 'NONE':
    default:
      return 'NONE';
  }
}

export function formatEvidenceGapLabels(gaps: KeyEvidenceGapTaxonomy[]) {
  const normalized = normalizeEvidenceGapTaxonomy(gaps);
  if (!normalized.length) {
    return '关键证据缺口';
  }

  return normalized.map(formatEvidenceGapLabel).join(' / ');
}

function toGapList(
  dimensions: EvidenceMapDimension[] | null | undefined,
  status: EvidenceGapDriverKind,
) {
  if (!Array.isArray(dimensions)) {
    return [] as KeyEvidenceGapTaxonomy[];
  }

  const dimensionSet = new Set(GAP_DIMENSIONS);
  return uniqueGaps(
    dimensions
      .filter((dimension): dimension is EvidenceMapDimension =>
        dimensionSet.has(dimension),
      )
      .map((dimension) => `${dimension}_${status}` as KeyEvidenceGapTaxonomy),
  );
}

function intersectGaps(
  source: KeyEvidenceGapTaxonomy[],
  target: KeyEvidenceGapTaxonomy[],
) {
  const targetSet = new Set(target);
  return uniqueGaps(source.filter((gap) => targetSet.has(gap)));
}

function uniqueGaps(gaps: KeyEvidenceGapTaxonomy[]) {
  return [...new Set(gaps)];
}

function resolveGapSeverity(args: {
  conflictDrivenGaps: KeyEvidenceGapTaxonomy[];
  missingDrivenGaps: KeyEvidenceGapTaxonomy[];
  weakDrivenGaps: KeyEvidenceGapTaxonomy[];
  highRiskGaps: KeyEvidenceGapTaxonomy[];
}): KeyEvidenceGapSeverity {
  if (
    args.conflictDrivenGaps.length > 0 ||
    args.highRiskGaps.length >= 2
  ) {
    return 'CRITICAL';
  }
  if (
    args.highRiskGaps.length > 0 ||
    args.missingDrivenGaps.length >= 2
  ) {
    return 'HIGH';
  }
  if (
    args.missingDrivenGaps.length > 0 ||
    args.weakDrivenGaps.length >= 2
  ) {
    return 'MEDIUM';
  }
  if (args.weakDrivenGaps.length > 0) {
    return 'LOW';
  }
  return 'NONE';
}

function buildGapSummary(args: {
  conflictDrivenGaps: KeyEvidenceGapTaxonomy[];
  missingDrivenGaps: KeyEvidenceGapTaxonomy[];
  weakDrivenGaps: KeyEvidenceGapTaxonomy[];
}) {
  const top = uniqueGaps([
    ...args.conflictDrivenGaps,
    ...args.missingDrivenGaps,
    ...args.weakDrivenGaps,
  ]).slice(0, 3);
  if (!top.length) {
    return '当前没有关键 evidence gap。';
  }

  return top.map(formatEvidenceGapLabel).join('；');
}

function formatEvidenceGapLabel(gap: KeyEvidenceGapTaxonomy) {
  const status = gap.endsWith('_missing')
    ? 'missing'
    : gap.endsWith('_weak')
      ? 'weak'
      : 'conflict';
  const normalizedDimension = gap.slice(
    0,
    gap.length - (status === 'conflict' ? '_conflict'.length : `_${status}`.length),
  ) as EvidenceMapDimension;
  const label = DIMENSION_LABELS[normalizedDimension];
  const suffix =
    status === 'missing' ? '缺失' : status === 'weak' ? '偏弱' : '冲突';
  return `${label}${suffix}`;
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
