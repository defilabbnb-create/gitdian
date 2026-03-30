import { createHash } from 'node:crypto';
import type { RepositoryAnalysis } from '@prisma/client';
import {
  buildAnalysisOutcomeDelta,
} from './analysis-outcome.helper';
import type {
  AnalysisOutcomeAfterContext,
  AnalysisOutcomeBeforeContext,
} from './analysis-outcome.types';
import {
  buildAfterContextFromPriorityItem,
  diffAfterContexts,
} from './repair-effectiveness-surgery.helper';
import type { HistoricalRepairPriorityItem } from './historical-repair-priority.helper';
import type {
  DeepRepairAfterStateResolution,
  DeepRepairAfterStateSource,
  DeepRepairAnalysisSnapshot,
  DeepRepairOutputKind,
  DeepRepairWritebackField,
  DeepRepairWritebackRootCause,
  DeepRepairWritebackTrace,
  DeepWritebackTraceReport,
} from './deep-repair-writeback.types';

export const DEEP_REPAIR_WRITEBACK_SCHEMA_VERSION =
  'deep_repair_writeback_v1';

export function buildDeepRepairAnalysisSnapshot(
  analysis: Pick<
    RepositoryAnalysis,
    'completenessJson' | 'ideaFitJson' | 'extractedIdeaJson'
  > | null,
): DeepRepairAnalysisSnapshot {
  return {
    completenessHash: hashJson(analysis?.completenessJson),
    ideaFitHash: hashJson(analysis?.ideaFitJson),
    ideaExtractHash: hashJson(analysis?.extractedIdeaJson),
  };
}

export function diffDeepRepairAnalysisSnapshots(args: {
  before: DeepRepairAnalysisSnapshot | null;
  after: DeepRepairAnalysisSnapshot | null;
}) {
  const before = args.before ?? emptyDeepRepairAnalysisSnapshot();
  const after = args.after ?? emptyDeepRepairAnalysisSnapshot();
  const changes: string[] = [];

  if (before.completenessHash !== after.completenessHash) {
    changes.push('completeness_output');
  }
  if (before.ideaFitHash !== after.ideaFitHash) {
    changes.push('idea_fit_output');
  }
  if (before.ideaExtractHash !== after.ideaExtractHash) {
    changes.push('idea_extract_output');
  }

  return changes;
}

export function buildAfterContextFromOutcomeBefore(
  before: AnalysisOutcomeBeforeContext,
): AnalysisOutcomeAfterContext {
  return {
    analysisQualityScoreAfter: normalizeNumber(before.analysisQualityScoreBefore),
    analysisQualityStateAfter: normalizeNullableString(
      before.analysisQualityStateBefore,
    ) as AnalysisOutcomeAfterContext['analysisQualityStateAfter'],
    decisionStateAfter: normalizeNullableString(
      before.decisionStateBefore,
    ) as AnalysisOutcomeAfterContext['decisionStateAfter'],
    trustedEligibilityAfter: Boolean(before.trustedEligibilityBefore),
    keyEvidenceGapsAfter: normalizeStringArray(before.keyEvidenceGapsBefore),
    trustedBlockingGapsAfter: normalizeStringArray(
      before.trustedBlockingGapsBefore,
    ),
    evidenceCoverageRateAfter: clampRate(before.evidenceCoverageRateBefore),
  };
}

export function resolveDeepRepairAfterState(args: {
  beforeAfter: AnalysisOutcomeAfterContext;
  liveAfter?: Partial<AnalysisOutcomeAfterContext> | null;
  afterItemOverride?: Partial<AnalysisOutcomeAfterContext> | null;
  persistedAfter?: Partial<AnalysisOutcomeAfterContext> | null;
}): DeepRepairAfterStateResolution {
  const candidates: Array<{
    source: DeepRepairAfterStateSource;
    after: Partial<AnalysisOutcomeAfterContext> | null | undefined;
  }> = [
    {
      source: 'live_after_item',
      after: args.liveAfter,
    },
    {
      source: 'after_item_override',
      after: args.afterItemOverride,
    },
    {
      source: 'persisted_updated_item',
      after: args.persistedAfter,
    },
  ];

  const chosen = candidates.find((candidate) => Boolean(candidate.after));
  const afterContext = normalizeAfterContext(
    chosen?.after ?? args.beforeAfter,
    args.beforeAfter,
  );
  const deepWritebackChangedFields = diffAfterContexts({
    before: args.beforeAfter,
    after: afterContext,
  });
  const afterStateRefreshSource = chosen?.source ?? 'before_fallback';

  return {
    afterContext,
    afterStateRefreshed: afterStateRefreshSource !== 'before_fallback',
    afterStateRefreshSource,
    afterStateChangedFieldCount: deepWritebackChangedFields.length,
    afterStateFallbackUsed: afterStateRefreshSource === 'before_fallback',
    deepWritebackChangedFields,
  };
}

export function buildDeepRepairWritebackTrace(args: {
  repositoryId: string;
  fullName: string;
  originalOutcomeStatus: string;
  originalOutcomeReason: string;
  historicalRepairAction: string | null;
  currentAction: string | null;
  before: AnalysisOutcomeBeforeContext;
  observedAfter: AnalysisOutcomeAfterContext;
  resolution: DeepRepairAfterStateResolution;
  analysisBefore?: DeepRepairAnalysisSnapshot | null;
  analysisAfter?: DeepRepairAnalysisSnapshot | null;
}): DeepRepairWritebackTrace {
  const beforeAfter = buildAfterContextFromOutcomeBefore(args.before);
  const observedAfter = normalizeAfterContext(args.observedAfter, beforeAfter);
  const refreshedAfter = normalizeAfterContext(
    args.resolution.afterContext,
    beforeAfter,
  );
  const deepWritebackMissedFields = diffAfterContexts({
    before: observedAfter,
    after: refreshedAfter,
  });
  const analysisArtifactChanges = diffDeepRepairAnalysisSnapshots({
    before: args.analysisBefore ?? null,
    after: args.analysisAfter ?? null,
  });
  const producedOutputKinds = buildProducedOutputKinds({
    analysisArtifactChanges,
    beforeAfter,
    refreshedAfter,
  });
  const deepWritebackProduced =
    analysisArtifactChanges.length > 0 ||
    args.resolution.deepWritebackChangedFields.length > 0;
  const deepWritebackApplied =
    args.resolution.deepWritebackChangedFields.length > 0;
  const delta = buildAnalysisOutcomeDelta({
    before: args.before,
    after: refreshedAfter,
    outcomeStatus: normalizeOutcomeStatus({
      originalOutcomeStatus: args.originalOutcomeStatus,
      deepWritebackApplied,
    }),
  });
  const wasFakeNoChange =
    args.originalOutcomeStatus === 'no_change' &&
    deepWritebackMissedFields.length > 0;
  const isRealNoChange =
    args.originalOutcomeStatus === 'no_change' && !wasFakeNoChange;
  const rootCauses = dedupeStrings<DeepRepairWritebackRootCause>([
    ...classifyPrimaryAndSecondaryRootCauses({
      originalOutcomeReason: args.originalOutcomeReason,
      originalOutcomeStatus: args.originalOutcomeStatus,
      deepWritebackProduced,
      deepWritebackApplied,
      deepWritebackMissedFields,
      changedFields: args.resolution.deepWritebackChangedFields,
      producedOutputKinds,
      refreshedAfter,
      beforeAfter,
    }),
  ]);
  const primaryRootCause =
    rootCauses[0] ?? (deepWritebackProduced
      ? 'quality_unchanged_after_repair'
      : 'no_new_output');

  return {
    repositoryId: args.repositoryId,
    fullName: args.fullName,
    originalOutcomeStatus: args.originalOutcomeStatus,
    originalOutcomeReason: args.originalOutcomeReason,
    historicalRepairAction: args.historicalRepairAction,
    currentAction: normalizeNullableString(args.currentAction),
    deepWritebackProduced,
    deepWritebackApplied,
    deepWritebackMissedFields,
    deepWritebackChangedFields: args.resolution.deepWritebackChangedFields,
    deepWritebackReasonSummary: buildDeepWritebackReasonSummary({
      primaryRootCause,
      deepWritebackProduced,
      deepWritebackApplied,
      deepWritebackMissedFields,
      changedFields: args.resolution.deepWritebackChangedFields,
      afterStateRefreshSource: args.resolution.afterStateRefreshSource,
    }),
    afterStateRefreshed: args.resolution.afterStateRefreshed,
    afterStateRefreshSource: args.resolution.afterStateRefreshSource,
    afterStateChangedFieldCount: args.resolution.afterStateChangedFieldCount,
    afterStateFallbackUsed: args.resolution.afterStateFallbackUsed,
    primaryRootCause,
    rootCauses,
    producedOutputKinds,
    analysisArtifactChanges,
    beforeAfter,
    observedAfter,
    refreshedAfter,
    wasFakeNoChange,
    isRealNoChange,
    qualityDeltaAfterRefresh: delta.qualityDelta,
    gapCountDeltaAfterRefresh: delta.gapCountDelta,
    blockingGapDeltaAfterRefresh: delta.blockingGapDelta,
    decisionChangedAfterRefresh: delta.decisionChanged,
    repairValueClassAfterRefresh: delta.repairValueClass,
  };
}

export function buildDeepWritebackTraceReport(args: {
  generatedAt?: string;
  seedGeneratedAt?: string | null;
  totalLoggedDeepRepairOutcomes: number;
  highValueSampleCount: number;
  generalValueSampleCount: number;
  samples: DeepRepairWritebackTrace[];
}): DeepWritebackTraceReport {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const refreshedFieldBreakdown = buildFieldBreakdown();
  const missedFieldBreakdown = buildFieldBreakdown();
  const refreshSourceBreakdown = {
    live_after_item: 0,
    after_item_override: 0,
    persisted_updated_item: 0,
    before_fallback: 0,
  } satisfies Record<DeepRepairAfterStateSource, number>;
  const rootCauseBreakdown = {
    no_new_output: 0,
    writeback_missing: 0,
    writeback_partial: 0,
    after_state_lookup_stale: 0,
    evidence_written_but_gaps_unchanged: 0,
    quality_unchanged_after_repair: 0,
    decision_unchanged_after_repair: 0,
  } satisfies Record<DeepRepairWritebackRootCause, number>;

  for (const sample of args.samples) {
    for (const field of sample.deepWritebackChangedFields) {
      refreshedFieldBreakdown[field] += 1;
    }
    for (const field of sample.deepWritebackMissedFields) {
      missedFieldBreakdown[field] += 1;
    }
    refreshSourceBreakdown[sample.afterStateRefreshSource] += 1;
    rootCauseBreakdown[sample.primaryRootCause] += 1;
  }

  const resolvedFakeNoChange = args.samples.filter((sample) => sample.wasFakeNoChange);
  const realNoChange = args.samples.filter((sample) => sample.isRealNoChange);

  return {
    schemaVersion: DEEP_REPAIR_WRITEBACK_SCHEMA_VERSION,
    generatedAt,
    source: {
      seedGeneratedAt: normalizeNullableString(args.seedGeneratedAt),
      totalLoggedDeepRepairOutcomes: args.totalLoggedDeepRepairOutcomes,
      totalValidatedSamples: args.samples.length,
      highValueSampleCount: args.highValueSampleCount,
      generalValueSampleCount: args.generalValueSampleCount,
    },
    summary: {
      totalSampled: args.samples.length,
      deepWritebackProducedCount: args.samples.filter(
        (sample) => sample.deepWritebackProduced,
      ).length,
      deepWritebackAppliedCount: args.samples.filter(
        (sample) => sample.deepWritebackApplied,
      ).length,
      fakeNoChangeCount: resolvedFakeNoChange.length,
      realNoChangeCount: realNoChange.length,
      resolvedFakeNoChangeCount: resolvedFakeNoChange.length,
      remainingRealNoChangeCount: realNoChange.length,
    },
    fieldLevel: {
      refreshedFieldBreakdown,
      missedFieldBreakdown,
      refreshSourceBreakdown,
    },
    rootCauseBreakdown,
    samples: {
      resolvedFakeNoChange: resolvedFakeNoChange.slice(0, 5),
      realNoChange: realNoChange.slice(0, 5),
      all: args.samples,
    },
    notes: {
      afterStatePriority:
        'live_after_item > after_item_override > persisted_updated_item > before_fallback',
      strongestFinding:
        resolvedFakeNoChange.length > 0
          ? '部分 deep_repair 的旧 no_change 实际是 after-state stale，live/persisted after 已能恢复出结构变化。'
          : '当前验证样本里没有再发现新的 deep fake no_change。',
      remainingRisk:
        realNoChange.length > 0
          ? '仍有 deep_repair 样本在刷新后保持 no_change，说明还存在真实无效修复或 gap-profile 不匹配。'
          : '当前 10 条 deep 样本里已没有 remaining real no_change。',
    },
  };
}

export function renderDeepWritebackTraceMarkdown(
  report: DeepWritebackTraceReport,
) {
  const lines = [
    '# Deep Repair Writeback Trace',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- schemaVersion: ${report.schemaVersion}`,
    '- command: pnpm --filter api report:deep-writeback-trace',
    `- afterStatePriority: ${report.notes.afterStatePriority}`,
    '',
    '## Summary',
    `- totalSampled: ${report.summary.totalSampled}`,
    `- deepWritebackProducedCount: ${report.summary.deepWritebackProducedCount}`,
    `- deepWritebackAppliedCount: ${report.summary.deepWritebackAppliedCount}`,
    `- resolvedFakeNoChangeCount: ${report.summary.resolvedFakeNoChangeCount}`,
    `- remainingRealNoChangeCount: ${report.summary.remainingRealNoChangeCount}`,
    '',
    '## Refresh Sources',
    ...renderCountRecord(report.fieldLevel.refreshSourceBreakdown),
    '',
    '## Refreshed Fields',
    ...renderCountRecord(report.fieldLevel.refreshedFieldBreakdown),
    '',
    '## Missed Fields',
    ...renderCountRecord(report.fieldLevel.missedFieldBreakdown),
    '',
    '## Root Causes',
    ...renderCountRecord(report.rootCauseBreakdown),
    '',
    '## Resolved Fake No-change Samples',
    ...renderTraceSamples(report.samples.resolvedFakeNoChange),
    '',
    '## Remaining Real No-change Samples',
    ...renderTraceSamples(report.samples.realNoChange),
    '',
    '## Notes',
    `- ${report.notes.strongestFinding}`,
    `- ${report.notes.remainingRisk}`,
  ];

  return lines.join('\n');
}

function classifyPrimaryAndSecondaryRootCauses(args: {
  originalOutcomeReason: string;
  originalOutcomeStatus: string;
  deepWritebackProduced: boolean;
  deepWritebackApplied: boolean;
  deepWritebackMissedFields: DeepRepairWritebackField[];
  changedFields: DeepRepairWritebackField[];
  producedOutputKinds: DeepRepairOutputKind[];
  refreshedAfter: AnalysisOutcomeAfterContext;
  beforeAfter: AnalysisOutcomeAfterContext;
}): DeepRepairWritebackRootCause[] {
  if (
    args.originalOutcomeReason === 'deep_targets_already_present' ||
    (!args.deepWritebackProduced &&
      args.changedFields.length === 0 &&
      args.deepWritebackMissedFields.length === 0)
  ) {
    return ['no_new_output'];
  }

  if (args.deepWritebackMissedFields.length > 0) {
    return [
      args.changedFields.length > 0 ? 'after_state_lookup_stale' : 'writeback_partial',
      'writeback_partial',
    ];
  }

  if (args.deepWritebackProduced && !args.deepWritebackApplied) {
    if (args.producedOutputKinds.includes('narrative_only')) {
      return ['evidence_written_but_gaps_unchanged', 'quality_unchanged_after_repair'];
    }
    return ['writeback_missing'];
  }

  const qualityChanged =
    args.refreshedAfter.analysisQualityScoreAfter !==
      args.beforeAfter.analysisQualityScoreAfter ||
    args.refreshedAfter.analysisQualityStateAfter !==
      args.beforeAfter.analysisQualityStateAfter;
  const decisionChanged =
    args.refreshedAfter.decisionStateAfter !== args.beforeAfter.decisionStateAfter;

  if (!qualityChanged) {
    return decisionChanged
      ? ['quality_unchanged_after_repair']
      : ['quality_unchanged_after_repair', 'decision_unchanged_after_repair'];
  }

  if (!decisionChanged) {
    return ['decision_unchanged_after_repair'];
  }

  return ['writeback_partial'];
}

function buildProducedOutputKinds(args: {
  analysisArtifactChanges: string[];
  beforeAfter: AnalysisOutcomeAfterContext;
  refreshedAfter: AnalysisOutcomeAfterContext;
}) {
  const produced = new Set<DeepRepairOutputKind>();
  if (args.analysisArtifactChanges.length > 0) {
    produced.add('evidence_node');
  }
  if (
    JSON.stringify(args.beforeAfter.keyEvidenceGapsAfter) !==
      JSON.stringify(args.refreshedAfter.keyEvidenceGapsAfter) ||
    JSON.stringify(args.beforeAfter.trustedBlockingGapsAfter) !==
      JSON.stringify(args.refreshedAfter.trustedBlockingGapsAfter)
  ) {
    produced.add('structured_gap_signal');
  }
  if (
    args.beforeAfter.decisionStateAfter !== args.refreshedAfter.decisionStateAfter ||
    args.beforeAfter.trustedEligibilityAfter !==
      args.refreshedAfter.trustedEligibilityAfter
  ) {
    produced.add('decision_signal');
  }
  if (
    args.beforeAfter.evidenceCoverageRateAfter !==
    args.refreshedAfter.evidenceCoverageRateAfter
  ) {
    produced.add('coverage_signal');
  }
  if (
    args.analysisArtifactChanges.length > 0 &&
    produced.size === 1 &&
    produced.has('evidence_node')
  ) {
    produced.add('narrative_only');
  }

  return [...produced];
}

function buildDeepWritebackReasonSummary(args: {
  primaryRootCause: DeepRepairWritebackRootCause;
  deepWritebackProduced: boolean;
  deepWritebackApplied: boolean;
  deepWritebackMissedFields: DeepRepairWritebackField[];
  changedFields: DeepRepairWritebackField[];
  afterStateRefreshSource: DeepRepairAfterStateSource;
}) {
  const fragments = [
    args.primaryRootCause,
    `refresh_source=${args.afterStateRefreshSource}`,
    `produced=${args.deepWritebackProduced ? 'yes' : 'no'}`,
    `applied=${args.deepWritebackApplied ? 'yes' : 'no'}`,
  ];
  if (args.changedFields.length > 0) {
    fragments.push(`changed=${args.changedFields.join(',')}`);
  }
  if (args.deepWritebackMissedFields.length > 0) {
    fragments.push(`missed=${args.deepWritebackMissedFields.join(',')}`);
  }
  return fragments.join(' | ');
}

function buildFieldBreakdown() {
  return {
    analysisQualityScoreAfter: 0,
    analysisQualityStateAfter: 0,
    decisionStateAfter: 0,
    trustedEligibilityAfter: 0,
    keyEvidenceGapsAfter: 0,
    trustedBlockingGapsAfter: 0,
    evidenceCoverageRateAfter: 0,
  } satisfies Record<DeepRepairWritebackField, number>;
}

function renderCountRecord(record: Record<string, number>) {
  return Object.entries(record)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, value]) => `- ${key}: ${value}`);
}

function renderTraceSamples(samples: DeepRepairWritebackTrace[]) {
  if (!samples.length) {
    return ['- none'];
  }

  return samples.map(
    (sample) =>
      `- ${sample.fullName} | source=${sample.afterStateRefreshSource} | rootCause=${sample.primaryRootCause} | changed=${sample.deepWritebackChangedFields.join(',') || 'none'} | missed=${sample.deepWritebackMissedFields.join(',') || 'none'} | qualityDelta=${sample.qualityDeltaAfterRefresh} | repairValue=${sample.repairValueClassAfterRefresh}`,
  );
}

function normalizeOutcomeStatus(args: {
  originalOutcomeStatus: string;
  deepWritebackApplied: boolean;
}) {
  if (args.originalOutcomeStatus === 'success') {
    return 'success' as const;
  }
  if (args.originalOutcomeStatus === 'partial') {
    return 'partial' as const;
  }
  if (args.originalOutcomeStatus === 'failed') {
    return 'failed' as const;
  }
  if (args.originalOutcomeStatus === 'downgraded') {
    return 'downgraded' as const;
  }
  if (args.originalOutcomeStatus === 'skipped') {
    return 'skipped' as const;
  }

  return args.deepWritebackApplied ? ('partial' as const) : ('no_change' as const);
}

function normalizeAfterContext(
  after: Partial<AnalysisOutcomeAfterContext> | null | undefined,
  before: AnalysisOutcomeAfterContext,
): AnalysisOutcomeAfterContext {
  return {
    analysisQualityScoreAfter: normalizeNumber(
      after?.analysisQualityScoreAfter ?? before.analysisQualityScoreAfter,
    ),
    analysisQualityStateAfter: (normalizeNullableString(
      after?.analysisQualityStateAfter ?? before.analysisQualityStateAfter,
    ) as AnalysisOutcomeAfterContext['analysisQualityStateAfter']) ?? null,
    decisionStateAfter: (normalizeNullableString(
      after?.decisionStateAfter ?? before.decisionStateAfter,
    ) as AnalysisOutcomeAfterContext['decisionStateAfter']) ?? null,
    trustedEligibilityAfter:
      typeof after?.trustedEligibilityAfter === 'boolean'
        ? after.trustedEligibilityAfter
        : before.trustedEligibilityAfter,
    keyEvidenceGapsAfter: normalizeStringArray(
      after?.keyEvidenceGapsAfter ?? before.keyEvidenceGapsAfter,
    ),
    trustedBlockingGapsAfter: normalizeStringArray(
      after?.trustedBlockingGapsAfter ?? before.trustedBlockingGapsAfter,
    ),
    evidenceCoverageRateAfter: clampRate(
      after?.evidenceCoverageRateAfter ?? before.evidenceCoverageRateAfter,
    ),
  };
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

function dedupeStrings<T extends string>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function hashJson(value: unknown) {
  if (value == null) {
    return null;
  }
  const serialized = JSON.stringify(value);
  if (!serialized) {
    return null;
  }
  return createHash('sha1').update(serialized).digest('hex');
}

function emptyDeepRepairAnalysisSnapshot(): DeepRepairAnalysisSnapshot {
  return {
    completenessHash: null,
    ideaFitHash: null,
    ideaExtractHash: null,
  };
}

function normalizeNullableString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
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
