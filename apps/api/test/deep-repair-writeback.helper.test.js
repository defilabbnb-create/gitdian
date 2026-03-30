const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAfterContextFromOutcomeBefore,
  buildDeepRepairAnalysisSnapshot,
  buildDeepRepairWritebackTrace,
  buildDeepWritebackTraceReport,
  renderDeepWritebackTraceMarkdown,
  resolveDeepRepairAfterState,
} = require('../dist/modules/analysis/helpers/deep-repair-writeback.helper');

function createBeforeContext(overrides = {}) {
  return {
    repositoryId: 'repo-1',
    normalizedTaskType: 'deep_repair',
    taskIntent: 'repair',
    historicalRepairBucket: 'high_value_weak',
    historicalRepairAction: 'deep_repair',
    cleanupState: 'active',
    analysisQualityScoreBefore: 24,
    analysisQualityStateBefore: 'LOW',
    decisionStateBefore: 'degraded',
    trustedEligibilityBefore: false,
    keyEvidenceGapsBefore: ['technical_maturity_missing', 'execution_missing'],
    trustedBlockingGapsBefore: ['technical_maturity_missing', 'execution_missing'],
    evidenceCoverageRateBefore: 0.18,
    ...overrides,
  };
}

test('deep repair after-state resolution prefers live after item over persisted fallback', () => {
  const beforeAfter = buildAfterContextFromOutcomeBefore(createBeforeContext());
  const resolution = resolveDeepRepairAfterState({
    beforeAfter,
    liveAfter: {
      analysisQualityScoreAfter: 52,
      analysisQualityStateAfter: 'MEDIUM',
      keyEvidenceGapsAfter: ['distribution_weak'],
      trustedBlockingGapsAfter: [],
      evidenceCoverageRateAfter: 0.61,
      decisionStateAfter: 'provisional',
      trustedEligibilityAfter: false,
    },
    persistedAfter: {
      analysisQualityScoreAfter: 40,
      analysisQualityStateAfter: 'LOW',
      keyEvidenceGapsAfter: ['market_missing'],
      trustedBlockingGapsAfter: ['market_missing'],
      evidenceCoverageRateAfter: 0.4,
      decisionStateAfter: 'degraded',
      trustedEligibilityAfter: false,
    },
  });

  assert.equal(resolution.afterStateRefreshSource, 'live_after_item');
  assert.equal(resolution.afterStateFallbackUsed, false);
  assert.ok(
    resolution.deepWritebackChangedFields.includes('analysisQualityScoreAfter'),
  );
  assert.ok(resolution.deepWritebackChangedFields.includes('keyEvidenceGapsAfter'));
});

test('deep repair trace marks stale after-state as fake no_change and captures changed fields', () => {
  const before = createBeforeContext();
  const beforeAfter = buildAfterContextFromOutcomeBefore(before);
  const resolution = resolveDeepRepairAfterState({
    beforeAfter,
    persistedAfter: {
      analysisQualityScoreAfter: 55,
      analysisQualityStateAfter: 'MEDIUM',
      decisionStateAfter: 'provisional',
      trustedEligibilityAfter: false,
      keyEvidenceGapsAfter: ['distribution_weak'],
      trustedBlockingGapsAfter: [],
      evidenceCoverageRateAfter: 0.72,
    },
  });
  const trace = buildDeepRepairWritebackTrace({
    repositoryId: 'repo-1',
    fullName: 'acme/repo-1',
    originalOutcomeStatus: 'no_change',
    originalOutcomeReason: 'deep_repair_seed_completeness_executed',
    historicalRepairAction: 'deep_repair',
    currentAction: 'evidence_repair',
    before,
    observedAfter: beforeAfter,
    resolution,
    analysisBefore: buildDeepRepairAnalysisSnapshot({
      completenessJson: null,
      ideaFitJson: null,
      extractedIdeaJson: null,
    }),
    analysisAfter: buildDeepRepairAnalysisSnapshot({
      completenessJson: { ok: true },
      ideaFitJson: null,
      extractedIdeaJson: null,
    }),
  });

  assert.equal(trace.wasFakeNoChange, true);
  assert.equal(trace.primaryRootCause, 'after_state_lookup_stale');
  assert.ok(trace.deepWritebackMissedFields.includes('analysisQualityScoreAfter'));
  assert.ok(trace.deepWritebackMissedFields.includes('keyEvidenceGapsAfter'));
  assert.equal(trace.repairValueClassAfterRefresh, 'high');
});

test('deep repair trace keeps real no_change when there is no new output', () => {
  const before = createBeforeContext();
  const beforeAfter = buildAfterContextFromOutcomeBefore(before);
  const resolution = resolveDeepRepairAfterState({
    beforeAfter,
  });
  const trace = buildDeepRepairWritebackTrace({
    repositoryId: 'repo-2',
    fullName: 'acme/repo-2',
    originalOutcomeStatus: 'no_change',
    originalOutcomeReason: 'deep_targets_already_present',
    historicalRepairAction: 'deep_repair',
    currentAction: 'deep_repair',
    before,
    observedAfter: beforeAfter,
    resolution,
    analysisBefore: buildDeepRepairAnalysisSnapshot({
      completenessJson: { ok: true },
      ideaFitJson: { ok: true },
      extractedIdeaJson: { ok: true },
    }),
    analysisAfter: buildDeepRepairAnalysisSnapshot({
      completenessJson: { ok: true },
      ideaFitJson: { ok: true },
      extractedIdeaJson: { ok: true },
    }),
  });

  assert.equal(trace.wasFakeNoChange, false);
  assert.equal(trace.isRealNoChange, true);
  assert.equal(trace.primaryRootCause, 'no_new_output');
  assert.equal(trace.deepWritebackProduced, false);
});

test('deep writeback report renders markdown and aggregates fake vs real no_change', () => {
  const before = createBeforeContext();
  const beforeAfter = buildAfterContextFromOutcomeBefore(before);
  const staleResolution = resolveDeepRepairAfterState({
    beforeAfter,
    persistedAfter: {
      analysisQualityScoreAfter: 55,
      analysisQualityStateAfter: 'MEDIUM',
      decisionStateAfter: 'provisional',
      trustedEligibilityAfter: false,
      keyEvidenceGapsAfter: ['distribution_weak'],
      trustedBlockingGapsAfter: [],
      evidenceCoverageRateAfter: 0.72,
    },
  });
  const staleTrace = buildDeepRepairWritebackTrace({
    repositoryId: 'repo-1',
    fullName: 'acme/repo-1',
    originalOutcomeStatus: 'no_change',
    originalOutcomeReason: 'deep_repair_seed_completeness_executed',
    historicalRepairAction: 'deep_repair',
    currentAction: 'evidence_repair',
    before,
    observedAfter: beforeAfter,
    resolution: staleResolution,
    analysisBefore: buildDeepRepairAnalysisSnapshot({
      completenessJson: null,
      ideaFitJson: null,
      extractedIdeaJson: null,
    }),
    analysisAfter: buildDeepRepairAnalysisSnapshot({
      completenessJson: { ok: true },
      ideaFitJson: null,
      extractedIdeaJson: null,
    }),
  });
  const realTrace = buildDeepRepairWritebackTrace({
    repositoryId: 'repo-2',
    fullName: 'acme/repo-2',
    originalOutcomeStatus: 'no_change',
    originalOutcomeReason: 'deep_targets_already_present',
    historicalRepairAction: 'deep_repair',
    currentAction: 'deep_repair',
    before,
    observedAfter: beforeAfter,
    resolution: resolveDeepRepairAfterState({ beforeAfter }),
    analysisBefore: buildDeepRepairAnalysisSnapshot({
      completenessJson: { ok: true },
      ideaFitJson: { ok: true },
      extractedIdeaJson: { ok: true },
    }),
    analysisAfter: buildDeepRepairAnalysisSnapshot({
      completenessJson: { ok: true },
      ideaFitJson: { ok: true },
      extractedIdeaJson: { ok: true },
    }),
  });
  const report = buildDeepWritebackTraceReport({
    seedGeneratedAt: '2026-03-28T00:00:00.000Z',
    totalLoggedDeepRepairOutcomes: 20,
    highValueSampleCount: 1,
    generalValueSampleCount: 1,
    samples: [staleTrace, realTrace],
  });
  const markdown = renderDeepWritebackTraceMarkdown(report);

  assert.equal(report.summary.resolvedFakeNoChangeCount, 1);
  assert.equal(report.summary.remainingRealNoChangeCount, 1);
  assert.equal(report.fieldLevel.refreshSourceBreakdown.persisted_updated_item, 1);
  assert.match(markdown, /command: pnpm --filter api report:deep-writeback-trace/);
  assert.match(markdown, /resolvedFakeNoChangeCount: 1/);
});
