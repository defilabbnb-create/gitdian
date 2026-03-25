const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HistoricalDataRecoveryService,
} = require('../dist/modules/analysis/historical-data-recovery.service');

test('runRecovery supports dry-run and limit without executing heavy stages', async () => {
  const service = new HistoricalDataRecoveryService(
    {},
    {},
    {},
    {},
    {},
    {},
    {
      prioritizeRecoveryAssessments: async (items) => items,
    },
  );

  service.scanOldBadRecords = async () => ({
    scannedAt: '2026-03-25T00:00:00.000Z',
    scannedCount: 3,
    metrics: {
      scannedCount: 3,
      bad_oneliner_rate: 0.5,
      headline_user_conflict_rate: 0.5,
      headline_category_conflict_rate: 0,
      monetization_overclaim_rate: 0,
      fallback_visible_rate: 0,
      incomplete_analysis_visible_rate: 0,
      claude_conflict_rate: 0,
      homepage_bad_card_rate: 0,
      counts: {
        bad_one_liner: 1,
        headline_user_conflict: 1,
        headline_category_conflict: 0,
        monetization_overclaim: 0,
        fallback_dirty: 0,
        incomplete_analysis: 0,
        claude_conflict: 0,
        template_repetition: 0,
        homepage_bad_card: 0,
        snapshot_conflict: 0,
      },
      priorityCounts: {
        P0: 1,
        P1: 1,
        P2: 1,
      },
    },
    priorityCounts: {
      P0: 1,
      P1: 1,
      P2: 1,
    },
    topSamples: {
      badOneLiners: [],
      conflicts: [],
      fallback: [],
      incomplete: [],
      claudeConflicts: [],
    },
    items: [
      {
        repoId: 'repo-1',
        fullName: 'acme/one',
        htmlUrl: 'https://github.com/acme/one',
        priority: 'P0',
        stages: ['L0', 'L1', 'L3'],
        issues: [{ type: 'bad_one_liner' }],
        validator: { sanitized: 'A', riskFlags: [] },
      },
      {
        repoId: 'repo-2',
        fullName: 'acme/two',
        htmlUrl: 'https://github.com/acme/two',
        priority: 'P1',
        stages: ['L0', 'L2'],
        issues: [{ type: 'incomplete_analysis' }],
        validator: { sanitized: 'B', riskFlags: [] },
      },
      {
        repoId: 'repo-3',
        fullName: 'acme/three',
        htmlUrl: 'https://github.com/acme/three',
        priority: 'P2',
        stages: ['L0'],
        issues: [],
        validator: { sanitized: 'C', riskFlags: [] },
      },
    ],
  });

  let savedValue = null;
  service.saveSystemConfig = async (_key, value) => {
    savedValue = value;
  };

  const result = await service.runRecovery({
    dryRun: true,
    limit: 2,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.selectedCount, 2);
  assert.equal(result.execution.rerunLightAnalysis, 0);
  assert.equal(result.execution.rerunDeepAnalysis, 0);
  assert.equal(result.execution.claudeQueued, 0);
  assert.equal(result.stageCounts.L1, 1);
  assert.equal(result.stageCounts.L2, 1);
  assert.equal(savedValue.selectedCount, 2);
});
