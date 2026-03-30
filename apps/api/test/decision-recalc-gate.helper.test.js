const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDecisionRecalcFingerprint,
  buildDecisionRecalcGateReport,
  buildDecisionRecalcGateResult,
  buildDecisionRecalcGateSnapshot,
  buildDecisionRecalcGateSnapshotMap,
  compareDecisionRecalcFingerprints,
  mergeDecisionRecalcGateSnapshots,
  renderDecisionRecalcGateMarkdown,
} = require('../dist/modules/analysis/helpers/decision-recalc-gate.helper');

function createItem(overrides = {}) {
  return {
    repoId: 'repo-1',
    fullName: 'acme/repo-1',
    historicalRepairBucket: 'high_value_weak',
    historicalRepairAction: 'decision_recalc',
    cleanupState: 'active',
    strictVisibilityLevel: 'FAVORITES',
    repositoryValueTier: 'HIGH',
    moneyPriority: 'P1',
    keyEvidenceGaps: ['user_conflict', 'monetization_conflict'],
    decisionRecalcGaps: ['user_conflict', 'monetization_conflict'],
    trustedBlockingGaps: ['user_conflict', 'monetization_conflict'],
    conflictDrivenGaps: ['user_conflict', 'monetization_conflict'],
    evidenceConflictCount: 2,
    evidenceCoverageRate: 0.18,
    freshnessDays: 7,
    evidenceFreshnessDays: 7,
    analysisQualityScore: 24,
    analysisQualityState: 'LOW',
    frontendDecisionState: 'provisional',
    hasDeep: false,
    fallbackFlag: false,
    conflictFlag: true,
    incompleteFlag: false,
    ...overrides,
  };
}

test('fingerprint equality suppresses replay and cleanup suppresses immediately', () => {
  const item = createItem();
  const previous = buildDecisionRecalcGateResult({ item });
  const replay = buildDecisionRecalcGateResult({
    item,
    previous,
  });
  const cleanup = buildDecisionRecalcGateResult({
    item: createItem({
      repoId: 'repo-2',
      cleanupState: 'freeze',
    }),
  });

  assert.equal(replay.recalcGateDecision, 'suppress_replay');
  assert.equal(replay.recalcSignalChanged, false);
  assert.equal(cleanup.recalcGateDecision, 'suppress_cleanup');
  assert.match(cleanup.recalcGateReason, /recalc_cleanup_suppressed/);
});

test('fingerprint changes allow recalc and low-signal-only changes downgrade confidence', () => {
  const base = buildDecisionRecalcFingerprint(createItem());
  const changed = buildDecisionRecalcFingerprint(
    createItem({
      keyEvidenceGaps: ['user_conflict'],
      decisionRecalcGaps: ['user_conflict'],
      trustedBlockingGaps: ['user_conflict'],
      conflictDrivenGaps: ['user_conflict'],
      evidenceConflictCount: 1,
    }),
  );
  const lowSignal = buildDecisionRecalcGateResult({
    item: createItem({
      analysisQualityScore: 28,
      evidenceCoverageRate: 0.22,
    }),
    previous: {
      repositoryId: 'repo-1',
      fullName: 'acme/repo-1',
      historicalRepairBucket: 'high_value_weak',
      historicalRepairAction: 'decision_recalc',
      cleanupState: 'active',
      strictVisibilityLevel: 'FAVORITES',
      repositoryValueTier: 'HIGH',
      moneyPriority: 'P1',
      recalcFingerprint: base,
      recalcFingerprintHash: base.recalcFingerprintHash,
      previousFingerprintHash: null,
      recalcGateDecision: 'allow_recalc',
      recalcGateReason: 'baseline',
      recalcSignalChanged: true,
      recalcSignalDiffSummary: 'baseline',
      recalcGateConfidence: 'LOW',
      changedFields: ['bootstrap'],
      replayedConflictSignals: [],
    },
  });
  const diff = compareDecisionRecalcFingerprints({
    previous: base,
    current: changed,
  });

  assert.equal(diff.recalcSignalChanged, true);
  assert.ok(diff.changedFields.includes('keyEvidenceGaps'));
  assert.equal(lowSignal.recalcGateDecision, 'allow_recalc_but_expect_no_change');
});

test('gate report renders markdown and aggregates suppression counts', () => {
  const baselineItem = createItem();
  const currentSnapshot = buildDecisionRecalcGateSnapshot({
    items: [
      baselineItem,
      createItem({
        repoId: 'repo-2',
        fullName: 'acme/repo-2',
        cleanupState: 'archive',
      }),
      createItem({
        repoId: 'repo-3',
        fullName: 'acme/repo-3',
        decisionRecalcGaps: ['execution_conflict'],
        keyEvidenceGaps: ['execution_conflict'],
        trustedBlockingGaps: ['execution_conflict'],
        conflictDrivenGaps: ['execution_conflict'],
        evidenceConflictCount: 1,
      }),
    ],
    previousSnapshotMap: buildDecisionRecalcGateSnapshotMap(
      buildDecisionRecalcGateSnapshot({
        items: [baselineItem],
        previousSnapshotMap: null,
        generatedAt: '2026-03-28T00:00:00.000Z',
      }),
    ),
    generatedAt: '2026-03-28T01:00:00.000Z',
  });

  const report = buildDecisionRecalcGateReport({
    priorityGeneratedAt: '2026-03-28T01:00:00.000Z',
    currentSnapshot,
    previousSnapshot: null,
    latestRun: {
      routerExecutionSummary: {
        recalcReplaySuppressedCount: 1,
        recalcCleanupSuppressedCount: 1,
        recalcAllowedCount: 1,
        recalcAllowedButNoChangeExpectedCount: 0,
      },
    },
    latestOutcomeSnapshot: {
      items: [
        {
          before: {
            historicalRepairAction: 'decision_recalc',
          },
          delta: {
            decisionChanged: true,
          },
        },
      ],
    },
  });

  assert.equal(report.summary.recalcReplaySuppressedCount, 1);
  assert.equal(report.summary.recalcCleanupSuppressedCount, 1);
  assert.equal(report.summary.recalcDecisionChangedCount, 1);
  assert.ok(report.summary.topReplayConflictTypes.length >= 1);

  const markdown = renderDecisionRecalcGateMarkdown(report);
  assert.match(markdown, /Decision Recalc Gate/);
  assert.match(markdown, /suppress_replay/);
  assert.match(markdown, /command: pnpm --filter api report:decision-recalc-gate/);
});

test('mergeDecisionRecalcGateSnapshots keeps untouched repos and updates refreshed repos', () => {
  const previousSnapshot = buildDecisionRecalcGateSnapshot({
    items: [
      createItem({
        repoId: 'repo-prev',
        fullName: 'acme/repo-prev',
      }),
      createItem({
        repoId: 'repo-shared',
        fullName: 'acme/repo-shared',
      }),
    ],
    generatedAt: '2026-03-29T00:00:00.000Z',
  });
  const nextSnapshot = buildDecisionRecalcGateSnapshot({
    items: [
      createItem({
        repoId: 'repo-shared',
        fullName: 'acme/repo-shared',
        evidenceCoverageRate: 0.61,
      }),
      createItem({
        repoId: 'repo-next',
        fullName: 'acme/repo-next',
      }),
    ],
    previousSnapshotMap: buildDecisionRecalcGateSnapshotMap(previousSnapshot),
    generatedAt: '2026-03-30T00:00:00.000Z',
  });

  const merged = mergeDecisionRecalcGateSnapshots({
    previousSnapshot,
    nextSnapshot,
  });
  const byRepoId = new Map(merged.items.map((item) => [item.repositoryId, item]));

  assert.equal(merged.generatedAt, '2026-03-30T00:00:00.000Z');
  assert.equal(merged.totalCandidates, 3);
  assert.ok(byRepoId.has('repo-prev'));
  assert.ok(byRepoId.has('repo-next'));
  assert.equal(
    byRepoId.get('repo-shared').recalcFingerprint.evidenceCoverageRate,
    0.61,
  );
});
