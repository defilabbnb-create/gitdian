const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAfterContextFromPriorityItem,
  buildDecisionRecalcInputFingerprint,
  buildHistoricalRepairItemIndexes,
  buildRepairEffectivenessSurgeryReport,
  compareDecisionRecalcFingerprints,
  diffAfterContexts,
  renderRepairEffectivenessSurgeryMarkdown,
  resolveHistoricalAfterItem,
} = require('../dist/modules/analysis/helpers/repair-effectiveness-surgery.helper');

function createPriorityItem(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/repo-1',
    historicalRepairBucket: 'high_value_weak',
    historicalRepairAction: 'deep_repair',
    cleanupState: 'active',
    analysisQualityScore: 12,
    analysisQualityState: 'CRITICAL',
    frontendDecisionState: 'degraded',
    keyEvidenceGaps: ['technical_maturity_missing', 'execution_missing'],
    trustedBlockingGaps: ['technical_maturity_missing', 'execution_missing'],
    decisionRecalcGaps: [],
    deepRepairGaps: ['technical_maturity_missing', 'execution_missing'],
    evidenceRepairGaps: [],
    conflictDrivenGaps: [],
    missingDrivenGaps: ['technical_maturity_missing', 'execution_missing'],
    weakDrivenGaps: [],
    evidenceConflictCount: 0,
    evidenceCoverageRate: 0.05,
    hasDeep: false,
    trustedFlowEligible: false,
    cleanupBlocksTrusted: false,
    fallbackFlag: false,
    conflictFlag: false,
    incompleteFlag: false,
    freshnessDays: 14,
    evidenceFreshnessDays: 14,
    ...overrides,
  };
}

test('after-item resolution falls back by repo when action changes after repair', () => {
  const beforeItem = createPriorityItem({
    repoId: 'repo-deep',
    historicalRepairAction: 'deep_repair',
  });
  const afterItem = createPriorityItem({
    repoId: 'repo-deep',
    historicalRepairAction: 'evidence_repair',
    analysisQualityScore: 55,
    analysisQualityState: 'MEDIUM',
    keyEvidenceGaps: ['distribution_weak'],
    trustedBlockingGaps: [],
  });

  const indexes = buildHistoricalRepairItemIndexes([afterItem]);
  const resolution = resolveHistoricalAfterItem({
    beforeItem,
    indexes,
  });

  assert.equal(resolution.resolutionType, 'repo_fallback');
  assert.equal(resolution.actionChanged, true);
  assert.equal(resolution.afterItem.repoId, 'repo-deep');
  assert.equal(resolution.afterAction, 'evidence_repair');
});

test('decision recalc fingerprint comparison detects same-input replay and new signal', () => {
  const before = buildDecisionRecalcInputFingerprint(
    createPriorityItem({
      repoId: 'repo-recalc',
      historicalRepairAction: 'decision_recalc',
      keyEvidenceGaps: ['user_conflict', 'monetization_conflict'],
      decisionRecalcGaps: ['user_conflict', 'monetization_conflict'],
      trustedBlockingGaps: ['user_conflict', 'monetization_conflict'],
      conflictDrivenGaps: ['user_conflict', 'monetization_conflict'],
      evidenceConflictCount: 2,
      analysisQualityScore: 0,
      analysisQualityState: 'CRITICAL',
    }),
  );
  const same = buildDecisionRecalcInputFingerprint(
    createPriorityItem({
      repoId: 'repo-recalc',
      historicalRepairAction: 'decision_recalc',
      keyEvidenceGaps: ['user_conflict', 'monetization_conflict'],
      decisionRecalcGaps: ['user_conflict', 'monetization_conflict'],
      trustedBlockingGaps: ['user_conflict', 'monetization_conflict'],
      conflictDrivenGaps: ['user_conflict', 'monetization_conflict'],
      evidenceConflictCount: 2,
      analysisQualityScore: 0,
      analysisQualityState: 'CRITICAL',
    }),
  );
  const changed = buildDecisionRecalcInputFingerprint(
    createPriorityItem({
      repoId: 'repo-recalc',
      historicalRepairAction: 'decision_recalc',
      keyEvidenceGaps: ['user_conflict'],
      decisionRecalcGaps: ['user_conflict'],
      trustedBlockingGaps: ['user_conflict'],
      conflictDrivenGaps: ['user_conflict'],
      evidenceConflictCount: 1,
      evidenceCoverageRate: 0.4,
      analysisQualityScore: 12,
      analysisQualityState: 'LOW',
    }),
  );

  const sameComparison = compareDecisionRecalcFingerprints({
    before,
    after: same,
  });
  const changedComparison = compareDecisionRecalcFingerprints({
    before,
    after: changed,
  });

  assert.equal(sameComparison.sameInputsReplayed, true);
  assert.equal(sameComparison.hasNewSignal, false);
  assert.equal(changedComparison.sameInputsReplayed, false);
  assert.equal(changedComparison.hasNewSignal, true);
  assert.ok(changedComparison.changedFields.includes('keyEvidenceGaps'));
  assert.ok(changedComparison.changedFields.includes('analysisQualityScore'));
});

test('after-context diff and surgery report render expected summary fields', () => {
  const beforeAfter = buildAfterContextFromPriorityItem(
    createPriorityItem({
      analysisQualityScore: 12,
      analysisQualityState: 'CRITICAL',
      keyEvidenceGaps: ['technical_maturity_missing', 'execution_missing'],
      trustedBlockingGaps: ['technical_maturity_missing', 'execution_missing'],
      evidenceCoverageRate: 0.05,
    }),
  );
  const currentAfter = buildAfterContextFromPriorityItem(
    createPriorityItem({
      historicalRepairAction: 'evidence_repair',
      analysisQualityScore: 55,
      analysisQualityState: 'MEDIUM',
      keyEvidenceGaps: ['distribution_weak'],
      trustedBlockingGaps: [],
      evidenceCoverageRate: 0.72,
    }),
  );
  const refreshedFields = diffAfterContexts({
    before: beforeAfter,
    after: currentAfter,
  });

  assert.ok(refreshedFields.includes('analysisQualityScoreAfter'));
  assert.ok(refreshedFields.includes('analysisQualityStateAfter'));
  assert.ok(refreshedFields.includes('keyEvidenceGapsAfter'));
  assert.ok(refreshedFields.includes('trustedBlockingGapsAfter'));

  const report = buildRepairEffectivenessSurgeryReport({
    seedReport: {
      generatedAt: '2026-03-28T00:00:00.000Z',
      snapshot: {
        items: [],
      },
    },
    deepSamples: [
      {
        repositoryId: 'repo-deep',
        fullName: 'acme/repo-deep',
        originalOutcomeStatus: 'no_change',
        originalOutcomeReason: 'deep_repair_seed_completeness_executed',
        originalAction: 'deep_repair',
        currentAction: 'evidence_repair',
        afterResolutionType: 'repo_fallback',
        refreshedFields,
        writtenArtifacts: {
          hasSnapshot: true,
          hasInsight: true,
          hasCompleteness: true,
          hasIdeaFit: true,
          hasIdeaExtract: true,
        },
        wasFalseNoChange: true,
        primaryWritebackBreak: 'after_state_lookup_stale',
        rootCauseShift: 'writeback_missing -> after_state_lookup_stale',
        originalAfter: beforeAfter,
        currentAfter,
      },
    ],
    recalcSamples: [
      {
        repositoryId: 'repo-recalc',
        fullName: 'acme/repo-recalc',
        beforeFingerprint: buildDecisionRecalcInputFingerprint(
          createPriorityItem({
            repoId: 'repo-recalc',
            historicalRepairAction: 'decision_recalc',
            keyEvidenceGaps: ['user_conflict'],
            decisionRecalcGaps: ['user_conflict'],
            trustedBlockingGaps: ['user_conflict'],
            conflictDrivenGaps: ['user_conflict'],
          }),
        ),
        afterFingerprint: buildDecisionRecalcInputFingerprint(
          createPriorityItem({
            repoId: 'repo-recalc',
            historicalRepairAction: 'decision_recalc',
            keyEvidenceGaps: ['user_conflict'],
            decisionRecalcGaps: ['user_conflict'],
            trustedBlockingGaps: ['user_conflict'],
            conflictDrivenGaps: ['user_conflict'],
          }),
        ),
        comparison: {
          beforeHash: 'a',
          afterHash: 'a',
          sameInputsReplayed: true,
          hasNewSignal: false,
          changedFields: [],
          replayedConflictSignals: ['user_conflict'],
          summary: 'fingerprint unchanged',
        },
        beforeDecisionState: 'degraded',
        afterDecisionState: 'degraded',
        beforeQualityScore: 0,
        afterQualityScore: 0,
        decisionChanged: false,
        qualityDelta: 0,
        gapCountDelta: 0,
        blockingGapDelta: 0,
        primaryRecalcFinding: 'same_inputs_replayed',
      },
    ],
    evidenceSamples: [
      {
        repositoryId: 'repo-evidence',
        fullName: 'acme/repo-evidence',
        originalOutcomeStatus: 'no_change',
        rerunOutcomeReason: 'evidence_repair_snapshot_skipped',
        refreshedFields: [],
        wasStillNoChange: true,
      },
    ],
  });
  const markdown = renderRepairEffectivenessSurgeryMarkdown(report);

  assert.equal(report.summary.falseNoChangeResolvedCount, 1);
  assert.equal(report.recalcTrace.fingerprintSameCount, 1);
  assert.equal(report.evidenceControls.stillNoChangeCount, 1);
  assert.match(markdown, /command: pnpm --filter api report:repair-surgery-trace/);
  assert.match(markdown, /falseNoChangeResolvedCount: 1/);
});
