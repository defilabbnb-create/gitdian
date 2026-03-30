const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildModelTaskRouterDecisionReport,
  renderModelTaskRouterDecisionMarkdown,
} = require('../dist/modules/analysis/helpers/model-task-router-decision.helper');

test('router decision report summarizes capability, review, and cleanup suppression', () => {
  const report = buildModelTaskRouterDecisionReport({
    priorityGeneratedAt: '2026-03-27T00:00:00.000Z',
    repairItems: [
      {
        fullName: 'example/visible-recalc',
        historicalRepairAction: 'decision_recalc',
        historicalRepairBucket: 'visible_broken',
        cleanupState: 'active',
        analysisQualityState: 'CRITICAL',
        keyEvidenceGaps: ['user_conflict', 'monetization_conflict'],
        decisionRecalcGaps: ['user_conflict', 'monetization_conflict'],
        deepRepairGaps: [],
        evidenceRepairGaps: [],
        trustedBlockingGaps: ['user_conflict'],
        evidenceConflictCount: 2,
        evidenceCoverageRate: 0.42,
        hasDeep: false,
        fallbackFlag: false,
        conflictFlag: true,
        incompleteFlag: false,
        strictVisibilityLevel: 'HOME',
        repositoryValueTier: 'HIGH',
        moneyPriority: 'P0',
      },
      {
        fullName: 'example/frozen-deep',
        historicalRepairAction: 'deep_repair',
        historicalRepairBucket: 'archive_or_noise',
        cleanupState: 'freeze',
        analysisQualityState: 'LOW',
        keyEvidenceGaps: ['technical_maturity_missing', 'execution_missing'],
        decisionRecalcGaps: [],
        deepRepairGaps: ['technical_maturity_missing', 'execution_missing'],
        evidenceRepairGaps: [],
        trustedBlockingGaps: ['technical_maturity_missing'],
        evidenceConflictCount: 0,
        evidenceCoverageRate: 0.12,
        hasDeep: false,
        fallbackFlag: false,
        conflictFlag: false,
        incompleteFlag: true,
        strictVisibilityLevel: 'BACKGROUND',
        repositoryValueTier: 'LOW',
        moneyPriority: 'P3',
      },
    ],
  });

  assert.equal(report.summary.dynamicRepairItemCount, 2);
  assert.equal(report.summary.reviewRequiredCount, 1);
  assert.equal(report.summary.cleanupSuppressedCount, 1);
  assert.ok(report.summary.reviewRequiredTasks.includes('decision_recalc'));
  assert.ok(report.summary.deterministicOnlyTasks.includes('deep_repair'));

  const markdown = renderModelTaskRouterDecisionMarkdown(report);
  assert.match(markdown, /GitDian Model Task Router Decision Report/);
  assert.match(markdown, /reviewRequiredCount: 1/);
  assert.match(markdown, /cleanupSuppressedCount: 1/);
  assert.match(markdown, /decision_recalc/);
  assert.match(markdown, /example\/frozen-deep/);
});
