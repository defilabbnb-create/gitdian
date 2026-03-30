import type {
  AnalysisOutcomeAfterContext,
  AnalysisOutcomeLog,
} from './analysis-outcome.types';
import {
  buildDecisionRecalcFingerprint as buildGateDecisionRecalcFingerprint,
  compareDecisionRecalcFingerprints as compareGateDecisionRecalcFingerprints,
} from './decision-recalc-gate.helper';
import type { HistoricalRepairPriorityItem } from './historical-repair-priority.helper';
import type {
  DecisionRecalcFingerprintComparison,
  DecisionRecalcInputFingerprint,
  HistoricalAfterItemResolution,
  RepairEffectivenessSeedSource,
  RepairEffectivenessSurgeryRecommendation,
  RepairEffectivenessSurgeryReport,
} from './repair-effectiveness-surgery.types';

export const REPAIR_EFFECTIVENESS_SURGERY_SCHEMA_VERSION =
  'repair_effectiveness_surgery_v1';

export function buildHistoricalRepairItemIndexes(
  items: HistoricalRepairPriorityItem[],
) {
  const byExactKey = new Map<string, HistoricalRepairPriorityItem>();
  const byRepoId = new Map<string, HistoricalRepairPriorityItem>();

  for (const item of items) {
    byExactKey.set(buildHistoricalRepairItemKey(item), item);
    byRepoId.set(item.repoId, item);
  }

  return {
    byExactKey,
    byRepoId,
  };
}

export function buildHistoricalRepairItemKey(item: {
  repoId: string;
  historicalRepairAction: string | null;
}) {
  return `${String(item.repoId ?? '').trim()}:${String(
    item.historicalRepairAction ?? '',
  ).trim()}`;
}

export function resolveHistoricalAfterItem(args: {
  beforeItem: {
    repoId: string;
    historicalRepairAction: string | null;
  };
  indexes: ReturnType<typeof buildHistoricalRepairItemIndexes>;
}): HistoricalAfterItemResolution {
  const repoId = String(args.beforeItem.repoId ?? '').trim();
  const beforeAction = normalizeNullableString(
    args.beforeItem.historicalRepairAction,
  );
  const exact = args.indexes.byExactKey.get(
    buildHistoricalRepairItemKey({
      repoId,
      historicalRepairAction: beforeAction,
    }),
  );

  if (exact) {
    return {
      repoId,
      beforeAction,
      afterAction: normalizeNullableString(exact.historicalRepairAction),
      resolutionType: 'exact_action',
      actionChanged: false,
      afterItem: exact,
    };
  }

  const fallback = args.indexes.byRepoId.get(repoId) ?? null;
  return {
    repoId,
    beforeAction,
    afterAction: normalizeNullableString(fallback?.historicalRepairAction),
    resolutionType: fallback ? 'repo_fallback' : 'missing',
    actionChanged: Boolean(
      fallback &&
        normalizeNullableString(fallback.historicalRepairAction) !== beforeAction,
    ),
    afterItem: fallback,
  };
}

export function buildDecisionRecalcInputFingerprint(
  item: Pick<
    HistoricalRepairPriorityItem,
    | 'repoId'
    | 'keyEvidenceGaps'
    | 'decisionRecalcGaps'
    | 'trustedBlockingGaps'
    | 'conflictDrivenGaps'
    | 'evidenceConflictCount'
    | 'evidenceCoverageRate'
    | 'freshnessDays'
    | 'evidenceFreshnessDays'
    | 'analysisQualityScore'
    | 'analysisQualityState'
    | 'frontendDecisionState'
    | 'hasDeep'
    | 'fallbackFlag'
    | 'conflictFlag'
    | 'incompleteFlag'
  >,
): DecisionRecalcInputFingerprint {
  return buildGateDecisionRecalcFingerprint(item);
}

export function compareDecisionRecalcFingerprints(args: {
  before: DecisionRecalcInputFingerprint;
  after: DecisionRecalcInputFingerprint;
}): DecisionRecalcFingerprintComparison {
  const diff = compareGateDecisionRecalcFingerprints({
    previous: args.before,
    current: args.after,
  });
  const sameInputsReplayed = !diff.recalcSignalChanged;

  return {
    beforeHash: args.before.recalcFingerprintHash,
    afterHash: args.after.recalcFingerprintHash,
    sameInputsReplayed,
    hasNewSignal: diff.recalcSignalChanged,
    changedFields: diff.changedFields,
    replayedConflictSignals: diff.replayedConflictSignals,
    summary: diff.recalcSignalDiffSummary,
  };
}

export function buildAfterContextFromPriorityItem(
  item: HistoricalRepairPriorityItem | null,
): AnalysisOutcomeAfterContext | null {
  if (!item) {
    return null;
  }

  return {
    analysisQualityScoreAfter: normalizeNumber(item.analysisQualityScore),
    analysisQualityStateAfter: normalizeNullableString(
      item.analysisQualityState,
    ) as AnalysisOutcomeAfterContext['analysisQualityStateAfter'],
    decisionStateAfter: normalizeNullableString(item.frontendDecisionState) as
      | AnalysisOutcomeAfterContext['decisionStateAfter']
      | null,
    trustedEligibilityAfter:
      item.frontendDecisionState === 'trusted' &&
      Boolean(item.trustedFlowEligible) &&
      !Boolean(item.cleanupBlocksTrusted),
    keyEvidenceGapsAfter: normalizeStringArray(item.keyEvidenceGaps),
    trustedBlockingGapsAfter: normalizeStringArray(item.trustedBlockingGaps),
    evidenceCoverageRateAfter: clampRate(item.evidenceCoverageRate),
  };
}

export function diffAfterContexts(args: {
  before: AnalysisOutcomeAfterContext;
  after: AnalysisOutcomeAfterContext | null;
}) {
  if (!args.after) {
    return [] as Array<keyof AnalysisOutcomeAfterContext>;
  }

  const changed: Array<keyof AnalysisOutcomeAfterContext> = [];
  const fields: Array<keyof AnalysisOutcomeAfterContext> = [
    'analysisQualityScoreAfter',
    'analysisQualityStateAfter',
    'decisionStateAfter',
    'trustedEligibilityAfter',
    'keyEvidenceGapsAfter',
    'trustedBlockingGapsAfter',
    'evidenceCoverageRateAfter',
  ];

  for (const field of fields) {
    if (!valuesEqual(args.before[field], args.after[field])) {
      changed.push(field);
    }
  }

  return changed;
}

export function buildRepairEffectivenessSurgeryReport(args: {
  generatedAt?: string;
  seedReport: RepairEffectivenessSeedSource | null;
  deepSamples: RepairEffectivenessSurgeryReport['deepWritebackTrace']['samples'];
  recalcSamples: RepairEffectivenessSurgeryReport['recalcTrace']['samples'];
  evidenceSamples: RepairEffectivenessSurgeryReport['evidenceControls']['samples'];
}): RepairEffectivenessSurgeryReport {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const deepWritebackResolvedCount = args.deepSamples.filter(
    (sample) => sample.wasFalseNoChange,
  ).length;
  const falseNoChangeResolvedCount = deepWritebackResolvedCount;
  const decisionReplayCount = args.recalcSamples.filter(
    (sample) => sample.primaryRecalcFinding === 'same_inputs_replayed',
  ).length;
  const decisionNoNewSignalCount = decisionReplayCount;
  const decisionNewSignalCount = args.recalcSamples.filter(
    (sample) => sample.comparison?.hasNewSignal,
  ).length;
  const decisionChangedCount = args.recalcSamples.filter(
    (sample) => sample.decisionChanged,
  ).length;
  const evidenceControlStillNoChangeCount = args.evidenceSamples.filter(
    (sample) => sample.wasStillNoChange,
  ).length;

  return {
    schemaVersion: REPAIR_EFFECTIVENESS_SURGERY_SCHEMA_VERSION,
    generatedAt,
    source: {
      seedGeneratedAt: normalizeNullableString(args.seedReport?.generatedAt),
      totalLoggedOutcomes: Array.isArray(args.seedReport?.snapshot?.items)
        ? args.seedReport!.snapshot!.items!.length
        : 0,
      sampledDecisionRecalcCount: args.recalcSamples.length,
      sampledDeepRepairCount: args.deepSamples.length,
      sampledEvidenceRepairCount: args.evidenceSamples.length,
    },
    summary: {
      totalValidated:
        args.deepSamples.length + args.recalcSamples.length + args.evidenceSamples.length,
      falseNoChangeResolvedCount,
      deepWritebackResolvedCount,
      decisionReplayCount,
      decisionNoNewSignalCount,
      decisionNewSignalCount,
      decisionChangedCount,
      evidenceControlStillNoChangeCount,
    },
    deepWritebackTrace: {
      totalSampled: args.deepSamples.length,
      falseNoChangeCount: deepWritebackResolvedCount,
      actualBreakdown: countStrings(
        args.deepSamples.map((sample) => sample.primaryWritebackBreak),
      ),
      refreshedFieldBreakdown: countStrings(
        args.deepSamples.flatMap((sample) => sample.refreshedFields),
      ) as Record<keyof AnalysisOutcomeAfterContext, number>,
      samples: args.deepSamples,
    },
    recalcTrace: {
      totalSampled: args.recalcSamples.length,
      fingerprintSameCount: args.recalcSamples.filter(
        (sample) => sample.comparison?.sameInputsReplayed,
      ).length,
      noNewSignalCount: decisionNoNewSignalCount,
      newSignalCount: decisionNewSignalCount,
      decisionChangedCount,
      decisionUnchangedWithNewSignalCount: args.recalcSamples.filter(
        (sample) =>
          sample.comparison?.hasNewSignal && !sample.decisionChanged,
      ).length,
      replayConflictBreakdown: countStrings(
        args.recalcSamples.flatMap(
          (sample) => sample.comparison?.replayedConflictSignals ?? [],
        ),
      ),
      samples: args.recalcSamples,
    },
    evidenceControls: {
      totalSampled: args.evidenceSamples.length,
      stillNoChangeCount: evidenceControlStillNoChangeCount,
      refreshedFieldBreakdown: countStrings(
        args.evidenceSamples.flatMap((sample) => sample.refreshedFields),
      ) as Record<keyof AnalysisOutcomeAfterContext, number>,
      samples: args.evidenceSamples,
    },
    surgeryRecommendations: buildSurgeryRecommendations({
      deepWritebackResolvedCount,
      decisionReplayCount,
      evidenceControlStillNoChangeCount,
    }),
    notes: {
      deepWritebackFinding:
        deepWritebackResolvedCount > 0
          ? 'At least one deep_repair no_change sample was a false no_change caused by stale after-state resolution rather than missing DB writeback.'
          : 'Deep repair samples did not yet show a resolved false no_change in this batch.',
      decisionRecalcFinding:
        decisionReplayCount > 0
          ? 'Decision recalc samples continue to show same-input replay with no new signal.'
          : 'Decision recalc samples showed at least some new structured signal.',
      validationMode:
        'deep_repair samples were revalidated via live after-state recompute; decision_recalc samples were rerun through refreshInsight; evidence_repair samples were rerun as low-cost controls.',
    },
  };
}

export function renderRepairEffectivenessSurgeryMarkdown(
  report: RepairEffectivenessSurgeryReport,
) {
  const lines = [
    '# Repair Surgery Trace',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- schemaVersion: ${report.schemaVersion}`,
    `- command: pnpm --filter api report:repair-surgery-trace`,
    '',
    '## Summary',
    `- totalValidated: ${report.summary.totalValidated}`,
    `- falseNoChangeResolvedCount: ${report.summary.falseNoChangeResolvedCount}`,
    `- decisionReplayCount: ${report.summary.decisionReplayCount}`,
    `- decisionNewSignalCount: ${report.summary.decisionNewSignalCount}`,
    `- decisionChangedCount: ${report.summary.decisionChangedCount}`,
    '',
    '## Deep Writeback Trace',
    `- totalSampled: ${report.deepWritebackTrace.totalSampled}`,
    `- falseNoChangeCount: ${report.deepWritebackTrace.falseNoChangeCount}`,
    ...renderCountRecord(report.deepWritebackTrace.actualBreakdown),
    '',
    '## Recalc Trace',
    `- totalSampled: ${report.recalcTrace.totalSampled}`,
    `- fingerprintSameCount: ${report.recalcTrace.fingerprintSameCount}`,
    `- noNewSignalCount: ${report.recalcTrace.noNewSignalCount}`,
    `- newSignalCount: ${report.recalcTrace.newSignalCount}`,
    `- decisionChangedCount: ${report.recalcTrace.decisionChangedCount}`,
    ...renderCountRecord(report.recalcTrace.replayConflictBreakdown),
    '',
    '## Evidence Controls',
    `- totalSampled: ${report.evidenceControls.totalSampled}`,
    `- stillNoChangeCount: ${report.evidenceControls.stillNoChangeCount}`,
    '',
    '## Recommendations',
    ...report.surgeryRecommendations.map(
      (recommendation) =>
        `- ${recommendation.recommendationId} [${recommendation.recommendationPriority}] ${recommendation.recommendationReason}`,
    ),
    '',
    '## Notes',
    `- ${report.notes.deepWritebackFinding}`,
    `- ${report.notes.decisionRecalcFinding}`,
    `- ${report.notes.validationMode}`,
  ];

  return lines.join('\n');
}

function buildSurgeryRecommendations(args: {
  deepWritebackResolvedCount: number;
  decisionReplayCount: number;
  evidenceControlStillNoChangeCount: number;
}): RepairEffectivenessSurgeryRecommendation[] {
  const recommendations: RepairEffectivenessSurgeryRecommendation[] = [
    {
      recommendationId: 'recalc-new-signal-gate',
      recommendationScope: 'decision',
      recommendationPriority: 'P0',
      recommendationReason:
        args.decisionReplayCount > 0
          ? 'Decision recalc repeatedly replayed the same fingerprint without new signal.'
          : 'Keep recalc fingerprint gating in place even when replay is not currently dominant.',
      targetRootCauses: ['recalc_without_new_signal', 'same_inputs_replayed'],
      expectedEffect:
        'Prevent REVIEW/decision_recalc work from burning cost when structured conflict inputs have not changed.',
    },
    {
      recommendationId: 'deep-after-state-refresh',
      recommendationScope: 'writeback',
      recommendationPriority: 'P0',
      recommendationReason:
        args.deepWritebackResolvedCount > 0
          ? 'Deep repair outcomes were previously hidden by stale after-state lookup and should be read from live repo state.'
          : 'Keep after-state refresh wired to repo-level lookup to avoid future false no_change.',
      targetRootCauses: ['writeback_missing'],
      expectedEffect:
        'Expose real gap/quality changes in outcome logs whenever deep sub-steps already wrote back structured analysis data.',
    },
    {
      recommendationId: 'weak-evidence-repair-review',
      recommendationScope: 'repair',
      recommendationPriority: 'P1',
      recommendationReason:
        args.evidenceControlStillNoChangeCount > 0
          ? 'Weak-only evidence repair controls are still mostly no_change.'
          : 'Evidence repair controls are not currently the main no-change source.',
      targetRootCauses: [
        'evidence_repair_too_weak',
        'fallback_without_structural_change',
      ],
      expectedEffect:
        'Clarify whether weak-only repair should stay lightweight or be reclassified as refresh/skip when it produces no structural movement.',
    },
  ];

  return recommendations;
}

function countStrings(values: Array<string | null | undefined>) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const normalized = normalizeNullableString(value);
    if (!normalized) {
      continue;
    }
    counts[normalized] = (counts[normalized] ?? 0) + 1;
  }
  return counts;
}

function renderCountRecord(record: Record<string, number>) {
  return Object.entries(record)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, value]) => `- ${key}: ${value}`);
}

function normalizeStringArray(values: unknown) {
  if (!Array.isArray(values)) {
    return [] as string[];
  }

  return [...new Set(
    values
      .map((value) => normalizeNullableString(value))
      .filter((value): value is string => Boolean(value)),
  )].sort();
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100) / 100;
}

function clampRate(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Math.round(parsed * 10000) / 10000));
}

function normalizeNullableString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function valuesEqual(left: unknown, right: unknown) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(normalizeStringArray(left)) === JSON.stringify(normalizeStringArray(right));
  }

  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
