import { buildModelTaskRouterDecision } from './model-task-router-decision.helper';
import type {
  DecisionRecalcFingerprint,
  DecisionRecalcGateDecision,
  DecisionRecalcGateEvaluableItem,
  DecisionRecalcGateReport,
  DecisionRecalcGateResult,
  DecisionRecalcGateSnapshot,
  DecisionRecalcGateSnapshotMap,
  DecisionRecalcSignalDiff,
} from './decision-recalc-gate.types';

export const DECISION_RECALC_GATE_SCHEMA_VERSION = 'decision_recalc_gate_v1';

const LOW_SIGNAL_FIELDS = new Set([
  'evidenceCoverageRate',
  'freshnessDays',
  'evidenceFreshnessDays',
  'analysisQualityScore',
  'analysisQualityState',
  'frontendDecisionState',
]);

export const DECISION_RECALC_GATE_DECISIONS: DecisionRecalcGateDecision[] = [
  'allow_recalc',
  'suppress_replay',
  'allow_recalc_but_expect_no_change',
  'suppress_cleanup',
];

export function buildDecisionRecalcFingerprint(
  item: DecisionRecalcGateEvaluableItem,
): DecisionRecalcFingerprint {
  const relevantConflictSignals = normalizeStringArray([
    ...normalizeStringArray(item.conflictDrivenGaps),
    ...normalizeStringArray(item.decisionRecalcGaps),
    item.conflictFlag ? 'conflict_flag' : null,
    Number(item.evidenceConflictCount ?? 0) > 0
      ? `evidence_conflict_count:${Math.round(
          Number(item.evidenceConflictCount ?? 0),
        )}`
      : null,
  ]);

  const payload = {
    repositoryId: normalizeString(item.repoId),
    keyEvidenceGaps: normalizeStringArray(item.keyEvidenceGaps),
    decisionRecalcGaps: normalizeStringArray(item.decisionRecalcGaps),
    trustedBlockingGaps: normalizeStringArray(item.trustedBlockingGaps),
    relevantConflictSignals,
    evidenceCoverageRate: clampRate(item.evidenceCoverageRate),
    freshnessDays: normalizeNullableNumber(item.freshnessDays),
    evidenceFreshnessDays: normalizeNullableNumber(item.evidenceFreshnessDays),
    analysisQualityScore: normalizeNumber(item.analysisQualityScore),
    analysisQualityState: normalizeNullableString(item.analysisQualityState),
    frontendDecisionState: normalizeNullableString(item.frontendDecisionState),
    hasDeep: Boolean(item.hasDeep),
    fallbackFlag: Boolean(item.fallbackFlag),
    conflictFlag: Boolean(item.conflictFlag),
    incompleteFlag: Boolean(item.incompleteFlag),
  };

  return {
    ...payload,
    recalcFingerprintHash: JSON.stringify(payload),
  };
}

export function compareDecisionRecalcFingerprints(args: {
  previous: DecisionRecalcFingerprint | null;
  current: DecisionRecalcFingerprint;
}): DecisionRecalcSignalDiff {
  if (!args.previous) {
    return {
      recalcSignalChanged: true,
      recalcSignalDiffSummary:
        'no previous fingerprint baseline; treating current structured state as new signal',
      changedFields: ['bootstrap'],
      replayedConflictSignals: [],
    };
  }

  const changedFields: string[] = [];
  const fieldPairs: Array<[string, unknown, unknown]> = [
    ['keyEvidenceGaps', args.previous.keyEvidenceGaps, args.current.keyEvidenceGaps],
    [
      'decisionRecalcGaps',
      args.previous.decisionRecalcGaps,
      args.current.decisionRecalcGaps,
    ],
    [
      'trustedBlockingGaps',
      args.previous.trustedBlockingGaps,
      args.current.trustedBlockingGaps,
    ],
    [
      'relevantConflictSignals',
      args.previous.relevantConflictSignals,
      args.current.relevantConflictSignals,
    ],
    [
      'evidenceCoverageRate',
      args.previous.evidenceCoverageRate,
      args.current.evidenceCoverageRate,
    ],
    ['freshnessDays', args.previous.freshnessDays, args.current.freshnessDays],
    [
      'evidenceFreshnessDays',
      args.previous.evidenceFreshnessDays,
      args.current.evidenceFreshnessDays,
    ],
    [
      'analysisQualityScore',
      args.previous.analysisQualityScore,
      args.current.analysisQualityScore,
    ],
    [
      'analysisQualityState',
      args.previous.analysisQualityState,
      args.current.analysisQualityState,
    ],
    [
      'frontendDecisionState',
      args.previous.frontendDecisionState,
      args.current.frontendDecisionState,
    ],
    ['hasDeep', args.previous.hasDeep, args.current.hasDeep],
    ['fallbackFlag', args.previous.fallbackFlag, args.current.fallbackFlag],
    ['conflictFlag', args.previous.conflictFlag, args.current.conflictFlag],
    ['incompleteFlag', args.previous.incompleteFlag, args.current.incompleteFlag],
  ];

  for (const [field, previous, current] of fieldPairs) {
    if (!valuesEqual(previous, current)) {
      changedFields.push(field);
    }
  }

  const replayedConflictSignals = intersectStringArrays(
    args.previous.relevantConflictSignals,
    args.current.relevantConflictSignals,
  );
  const recalcSignalChanged =
    args.previous.recalcFingerprintHash !== args.current.recalcFingerprintHash;

  return {
    recalcSignalChanged,
    recalcSignalDiffSummary: recalcSignalChanged
      ? `fingerprint changed in ${changedFields.join(', ') || 'unknown fields'}`
      : 'fingerprint unchanged; recalc would replay the same structured inputs',
    changedFields,
    replayedConflictSignals,
  };
}

export function buildDecisionRecalcGateResult(args: {
  item: DecisionRecalcGateEvaluableItem;
  previous?: DecisionRecalcGateResult | null;
}): DecisionRecalcGateResult {
  const item = args.item;
  const recalcFingerprint = buildDecisionRecalcFingerprint(item);
  const previousFingerprint = args.previous?.recalcFingerprint ?? null;
  const signalDiff = compareDecisionRecalcFingerprints({
    previous: previousFingerprint,
    current: recalcFingerprint,
  });
  const cleanupState = normalizeNullableString(item.cleanupState);
  const hasPreviousFingerprint = Boolean(previousFingerprint);
  const lowSignalOnly =
    signalDiff.recalcSignalChanged &&
    signalDiff.changedFields.length > 0 &&
    signalDiff.changedFields.every((field) => LOW_SIGNAL_FIELDS.has(field));

  let recalcGateDecision: DecisionRecalcGateDecision = 'allow_recalc';
  let recalcGateReason = hasPreviousFingerprint
    ? 'recalc_new_signal_detected'
    : 'recalc_first_structured_baseline';
  let recalcGateConfidence: DecisionRecalcGateResult['recalcGateConfidence'] =
    hasPreviousFingerprint ? 'MEDIUM' : 'LOW';

  if (cleanupState && cleanupState !== 'active') {
    recalcGateDecision = 'suppress_cleanup';
    recalcGateReason = `recalc_cleanup_suppressed:${cleanupState}`;
    recalcGateConfidence = 'HIGH';
  } else if (!signalDiff.recalcSignalChanged) {
    recalcGateDecision = 'suppress_replay';
    recalcGateReason = 'recalc_replay_suppressed';
    recalcGateConfidence = 'HIGH';
  } else if (lowSignalOnly) {
    recalcGateDecision = 'allow_recalc_but_expect_no_change';
    recalcGateReason = 'recalc_new_signal_low_expected_value';
    recalcGateConfidence = 'MEDIUM';
  } else {
    recalcGateDecision = 'allow_recalc';
    recalcGateReason = hasPreviousFingerprint
      ? 'recalc_new_signal_detected'
      : 'recalc_first_structured_baseline';
    recalcGateConfidence =
      signalDiff.changedFields.some((field) => !LOW_SIGNAL_FIELDS.has(field))
        ? 'HIGH'
        : 'MEDIUM';
  }

  return {
    repositoryId: normalizeString(item.repoId),
    fullName: normalizeString(item.fullName),
    historicalRepairBucket: normalizeNullableString(
      item.historicalRepairBucket,
    ),
    historicalRepairAction: normalizeNullableString(
      item.historicalRepairAction,
    ),
    cleanupState,
    strictVisibilityLevel: normalizeNullableString(item.strictVisibilityLevel),
    repositoryValueTier: normalizeNullableString(item.repositoryValueTier),
    moneyPriority: normalizeNullableString(item.moneyPriority),
    recalcFingerprint,
    recalcFingerprintHash: recalcFingerprint.recalcFingerprintHash,
    previousFingerprintHash:
      previousFingerprint?.recalcFingerprintHash ?? null,
    recalcGateDecision,
    recalcGateReason,
    recalcSignalChanged: signalDiff.recalcSignalChanged,
    recalcSignalDiffSummary: signalDiff.recalcSignalDiffSummary,
    recalcGateConfidence,
    changedFields: signalDiff.changedFields,
    replayedConflictSignals: signalDiff.replayedConflictSignals,
  };
}

export function buildDecisionRecalcGateSnapshot(args: {
  items: DecisionRecalcGateEvaluableItem[];
  previousSnapshotMap?: DecisionRecalcGateSnapshotMap | null;
  generatedAt?: string;
}): DecisionRecalcGateSnapshot {
  const previousSnapshotMap = args.previousSnapshotMap ?? new Map();
  const items = args.items
    .map((item) =>
      buildDecisionRecalcGateResult({
        item,
        previous: previousSnapshotMap.get(normalizeString(item.repoId)) ?? null,
      }),
    )
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  return {
    schemaVersion: DECISION_RECALC_GATE_SCHEMA_VERSION,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    totalCandidates: items.length,
    items,
  };
}

export function mergeDecisionRecalcGateSnapshots(args: {
  previousSnapshot: DecisionRecalcGateSnapshot | null;
  nextSnapshot: DecisionRecalcGateSnapshot;
}): DecisionRecalcGateSnapshot {
  const merged = new Map<string, DecisionRecalcGateResult>();

  for (const item of args.previousSnapshot?.items ?? []) {
    merged.set(normalizeString(item.repositoryId), item);
  }

  for (const item of args.nextSnapshot.items) {
    merged.set(normalizeString(item.repositoryId), item);
  }

  const items = Array.from(merged.values()).sort((left, right) =>
    left.fullName.localeCompare(right.fullName),
  );

  return {
    schemaVersion:
      normalizeString(args.nextSnapshot.schemaVersion) ||
      DECISION_RECALC_GATE_SCHEMA_VERSION,
    generatedAt:
      normalizeString(args.nextSnapshot.generatedAt) || new Date().toISOString(),
    totalCandidates: items.length,
    items,
  };
}

export function buildDecisionRecalcGateSnapshotMap(
  snapshot: DecisionRecalcGateSnapshot | null,
): DecisionRecalcGateSnapshotMap {
  const map: DecisionRecalcGateSnapshotMap = new Map();

  for (const item of snapshot?.items ?? []) {
    map.set(normalizeString(item.repositoryId), item);
  }

  return map;
}

export function readDecisionRecalcGateSnapshot(
  value: unknown,
): DecisionRecalcGateSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<DecisionRecalcGateSnapshot>;
  if (!Array.isArray(candidate.items)) {
    return null;
  }

  return {
    schemaVersion:
      normalizeString(candidate.schemaVersion) || DECISION_RECALC_GATE_SCHEMA_VERSION,
    generatedAt: normalizeString(candidate.generatedAt) || new Date().toISOString(),
    totalCandidates: Number(candidate.totalCandidates ?? candidate.items.length) || 0,
    items: candidate.items
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as DecisionRecalcGateResult),
  };
}

export function buildDecisionRecalcGateReport(args: {
  priorityGeneratedAt: string | null;
  currentSnapshot: DecisionRecalcGateSnapshot;
  previousSnapshot: DecisionRecalcGateSnapshot | null;
  latestRun?: Record<string, unknown> | null;
  latestOutcomeSnapshot?: Record<string, unknown> | null;
}): DecisionRecalcGateReport {
  const gateDecisionBreakdown = emptyGateDecisionBreakdown();
  const replayConflictBreakdown: Record<string, number> = {};
  const changedFieldBreakdown: Record<string, number> = {};

  for (const item of args.currentSnapshot.items) {
    gateDecisionBreakdown[item.recalcGateDecision] += 1;

    if (item.recalcGateDecision === 'suppress_replay') {
      for (const conflictType of item.replayedConflictSignals) {
        replayConflictBreakdown[conflictType] =
          (replayConflictBreakdown[conflictType] ?? 0) + 1;
      }
    }

    if (item.recalcSignalChanged) {
      for (const field of item.changedFields) {
        changedFieldBreakdown[field] = (changedFieldBreakdown[field] ?? 0) + 1;
      }
    }
  }

  const currentItems = args.currentSnapshot.items;
  const allowed = currentItems.filter(
    (item) => item.recalcGateDecision === 'allow_recalc',
  );
  const allowedButExpectedNoChange = currentItems.filter(
    (item) => item.recalcGateDecision === 'allow_recalc_but_expect_no_change',
  );
  const suppressedReplay = currentItems.filter(
    (item) => item.recalcGateDecision === 'suppress_replay',
  );
  const suppressedCleanup = currentItems.filter(
    (item) => item.recalcGateDecision === 'suppress_cleanup',
  );
  const reviewHighCostSuppressedCount = suppressedReplay.filter((item) => {
    const decision = buildModelTaskRouterDecision({
      normalizedTaskType: 'decision_recalc',
      historicalRepairBucket: item.historicalRepairBucket,
      historicalRepairAction: item.historicalRepairAction,
      cleanupState: item.cleanupState,
      analysisQualityState: item.recalcFingerprint.analysisQualityState as
        | 'HIGH'
        | 'MEDIUM'
        | 'LOW'
        | 'CRITICAL'
        | null,
      keyEvidenceGaps: item.recalcFingerprint.keyEvidenceGaps,
      decisionRecalcGaps: item.recalcFingerprint.decisionRecalcGaps,
      deepRepairGaps: [],
      evidenceRepairGaps: [],
      trustedBlockingGaps: item.recalcFingerprint.trustedBlockingGaps,
      evidenceConflictCount: item.recalcFingerprint.relevantConflictSignals.filter(
        (signal) => signal.startsWith('evidence_conflict_count:'),
      ).length,
      evidenceCoverageRate: item.recalcFingerprint.evidenceCoverageRate,
      hasDeep: item.recalcFingerprint.hasDeep,
      fallbackFlag: item.recalcFingerprint.fallbackFlag,
      conflictFlag: item.recalcFingerprint.conflictFlag,
      incompleteFlag: item.recalcFingerprint.incompleteFlag,
      strictVisibilityLevel: item.strictVisibilityLevel,
      repositoryValueTier: item.repositoryValueTier as 'HIGH' | 'MEDIUM' | 'LOW' | null,
      moneyPriority: item.moneyPriority as 'P0' | 'P1' | 'P2' | 'P3' | null,
    });
    return decision.capabilityTier === 'REVIEW' || decision.capabilityTier === 'HEAVY';
  }).length;
  const latestRunExecutionSummary = readObject(
    args.latestRun?.routerExecutionSummary,
  );
  const executionImpact = {
    totalDecisionRecalcCandidates: currentItems.length,
    totalPreviouslyRunnable:
      args.previousSnapshot?.items.filter(
        (item) => item.recalcGateDecision !== 'suppress_cleanup',
      ).length ?? 0,
    suppressedFromRealExecutionCount:
      readNumber(latestRunExecutionSummary?.recalcReplaySuppressedCount) +
      readNumber(latestRunExecutionSummary?.recalcCleanupSuppressedCount),
    allowedIntoRealExecutionCount:
      readNumber(latestRunExecutionSummary?.recalcAllowedCount) +
      readNumber(latestRunExecutionSummary?.recalcAllowedButNoChangeExpectedCount),
    reducedReviewOrHighCostPathCount:
      readNumber(latestRunExecutionSummary?.recalcReplaySuppressedCount) +
      reviewHighCostSuppressedCount,
  };
  const recalcDecisionChangedCount = countDecisionChangedRecalcs(
    args.latestOutcomeSnapshot,
  );

  return {
    schemaVersion: DECISION_RECALC_GATE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      priorityGeneratedAt: args.priorityGeneratedAt,
      previousSnapshotGeneratedAt: normalizeNullableString(
        args.previousSnapshot?.generatedAt,
      ),
      hadPreviousSnapshot: Boolean(args.previousSnapshot?.items?.length),
      totalCandidates: currentItems.length,
    },
    summary: {
      gateDecisionBreakdown,
      recalcReplaySuppressedCount: suppressedReplay.length,
      recalcCleanupSuppressedCount: suppressedCleanup.length,
      recalcAllowedCount: allowed.length,
      recalcAllowedButNoChangeExpectedCount: allowedButExpectedNoChange.length,
      recalcSignalChangedCount: currentItems.filter(
        (item) => item.recalcSignalChanged,
      ).length,
      recalcSignalUnchangedCount: currentItems.filter(
        (item) => !item.recalcSignalChanged,
      ).length,
      recalcDecisionChangedCount,
      reviewHighCostSuppressedCount,
      topReplayConflictTypes: toTopConflictCounts(replayConflictBreakdown),
      topNewSignalFields: toTopFieldCounts(changedFieldBreakdown),
    },
    replaySummary: {
      topReplayRepos: suppressedReplay.slice(0, 12).map((item) => ({
        repositoryId: item.repositoryId,
        fullName: item.fullName,
        replayedConflictSignals: item.replayedConflictSignals,
        reason: item.recalcGateReason,
      })),
      replayConflictBreakdown,
    },
    signalSummary: {
      changedFieldBreakdown,
      changedButStillExpectedNoChangeCount: allowedButExpectedNoChange.length,
      changedAndAllowedCount: allowed.length,
      changedButDecisionStillLikelyStaticRepos: allowedButExpectedNoChange
        .slice(0, 12)
        .map((item) => ({
          repositoryId: item.repositoryId,
          fullName: item.fullName,
          changedFields: item.changedFields,
          reason: item.recalcGateReason,
        })),
    },
    executionImpact,
    notes: {
      baseline: args.previousSnapshot?.items?.length
        ? 'current gate compares against the last persisted decision recalc gate snapshot'
        : 'no previous snapshot existed; first run establishes the structured baseline',
      replayInterpretation:
        'suppress_replay means the structured fingerprint is unchanged and the recalc would only replay old conflict inputs',
      newSignalInterpretation:
        'allow_recalc requires changed structured signal; allow_recalc_but_expect_no_change means only low-signal fields changed',
    },
    samples: {
      suppressedReplay: suppressedReplay.slice(0, 12),
      allowed: allowed.slice(0, 12),
      allowedButExpectedNoChange: allowedButExpectedNoChange.slice(0, 12),
      suppressedCleanup: suppressedCleanup.slice(0, 12),
    },
    snapshot: args.currentSnapshot,
  };
}

export function renderDecisionRecalcGateMarkdown(
  report: DecisionRecalcGateReport,
): string {
  const lines: string[] = [];
  lines.push('# Decision Recalc Gate');
  lines.push('');
  lines.push(`- Generated At: ${report.generatedAt}`);
  lines.push(
    `- Priority Generated At: ${report.source.priorityGeneratedAt ?? 'unknown'}`,
  );
  lines.push(
    `- Previous Snapshot: ${
      report.source.previousSnapshotGeneratedAt ?? 'none'
    }`,
  );
  lines.push(`- Total Candidates: ${report.source.totalCandidates}`);
  lines.push('');
  lines.push('## Gate Summary');
  lines.push(
    `- allow_recalc: ${report.summary.gateDecisionBreakdown.allow_recalc}`,
  );
  lines.push(
    `- allow_recalc_but_expect_no_change: ${report.summary.gateDecisionBreakdown.allow_recalc_but_expect_no_change}`,
  );
  lines.push(
    `- suppress_replay: ${report.summary.gateDecisionBreakdown.suppress_replay}`,
  );
  lines.push(
    `- suppress_cleanup: ${report.summary.gateDecisionBreakdown.suppress_cleanup}`,
  );
  lines.push(
    `- recalcSignalChanged / Unchanged: ${report.summary.recalcSignalChangedCount} / ${report.summary.recalcSignalUnchangedCount}`,
  );
  lines.push(
    `- recalcDecisionChangedCount: ${report.summary.recalcDecisionChangedCount}`,
  );
  lines.push('');
  lines.push('## Replay Hotspots');
  for (const entry of report.summary.topReplayConflictTypes) {
    lines.push(`- ${entry.conflictType}: ${entry.count}`);
  }
  if (!report.summary.topReplayConflictTypes.length) {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## New Signal Hotspots');
  for (const entry of report.summary.topNewSignalFields) {
    lines.push(`- ${entry.field}: ${entry.count}`);
  }
  if (!report.summary.topNewSignalFields.length) {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## Execution Impact');
  lines.push(
    `- Suppressed From Real Execution: ${report.executionImpact.suppressedFromRealExecutionCount}`,
  );
  lines.push(
    `- Allowed Into Real Execution: ${report.executionImpact.allowedIntoRealExecutionCount}`,
  );
  lines.push(
    `- Reduced Review/High-cost Paths: ${report.executionImpact.reducedReviewOrHighCostPathCount}`,
  );
  lines.push('');
  lines.push('## Notes');
  lines.push(`- ${report.notes.baseline}`);
  lines.push(`- ${report.notes.replayInterpretation}`);
  lines.push(`- ${report.notes.newSignalInterpretation}`);
  lines.push('');
  lines.push('## Audit');
  lines.push('- command: pnpm --filter api report:decision-recalc-gate');
  lines.push(
    '- focus: gateDecisionBreakdown, replayConflictBreakdown, changedFieldBreakdown, executionImpact',
  );
  lines.push(
    '- sample checks: inspect suppressedReplay, allowedButExpectedNoChange, and allowed samples',
  );

  return lines.join('\n');
}

function emptyGateDecisionBreakdown(): Record<DecisionRecalcGateDecision, number> {
  return {
    allow_recalc: 0,
    suppress_replay: 0,
    allow_recalc_but_expect_no_change: 0,
    suppress_cleanup: 0,
  };
}

function toTopConflictCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([conflictType, count]) => ({ conflictType, count }));
}

function toTopFieldCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([field, count]) => ({ field, count }));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(normalizeNullableString)
        .filter((item): item is string => Boolean(item)),
    ),
  ].sort();
}

function normalizeNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(4));
}

function normalizeNullableNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Number(numeric.toFixed(4));
}

function clampRate(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(numeric.toFixed(4))));
}

function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized.length ? normalized : null;
}

function valuesEqual(left: unknown, right: unknown) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  return left === right;
}

function intersectStringArrays(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

function readObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function countDecisionChangedRecalcs(latestOutcomeSnapshot: unknown) {
  const snapshot = readObject(latestOutcomeSnapshot);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];

  return items.filter((item) => {
    const log = readObject(item);
    const before = readObject(log?.before);
    const delta = readObject(log?.delta);

    return (
      normalizeNullableString(before?.historicalRepairAction) === 'decision_recalc' &&
      Boolean(delta?.decisionChanged)
    );
  }).length;
}
