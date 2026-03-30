const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEvidenceMapCoverageReport,
  collectEvidenceCoverageRepoIds,
} = require('../dist/modules/analysis/helpers/evidence-map-coverage-report.helper');

function priorityItem(repoId, bucket, action, priorityScore, overrides = {}) {
  return {
    repoId,
    fullName: `acme/${repoId}`,
    htmlUrl: `https://github.com/acme/${repoId}`,
    historicalRepairBucket: bucket,
    historicalRepairAction: action,
    historicalRepairPriorityScore: priorityScore,
    historicalRepairReason: 'test',
    frontendDecisionState: 'degraded',
    isStrictlyVisibleToUsers: bucket === 'visible_broken',
    moneyPriority: 'P1',
    repositoryValueTier: 'HIGH',
    hasFinalDecision: true,
    hasDeep: action !== 'deep_repair',
    fallbackFlag: false,
    conflictFlag: false,
    incompleteFlag: false,
    historicalTrustedButWeak: false,
    needsImmediateFrontendDowngrade: false,
    needsDecisionRecalc: action === 'decision_recalc',
    needsFrontendDowngrade: bucket === 'visible_broken',
    freshnessDays: 3,
    evidenceFreshnessDays: 3,
    strictVisibilityLevel: bucket === 'visible_broken' ? 'HOME' : 'BACKGROUND',
    displayStatus: 'BASIC_READY',
    ...overrides,
  };
}

function evidenceMap(repoId, overrides = {}) {
  const baseNode = (status) => ({
    status,
    summary: status,
    sourceRefs: [],
    confidence: 0.5,
    freshnessDays: 3,
    conflictFlag: status === 'conflict',
    sourceCount: 0,
    lastUpdatedAt: null,
    missingReason: status === 'missing' ? 'missing' : null,
    derivedFrom: [],
    requiresDeep: true,
  });

  return {
    schemaVersion: '2026-03-27.v1',
    generatedAt: '2026-03-27T00:00:00.000Z',
    repoId,
    fullName: `acme/${repoId}`,
    htmlUrl: `https://github.com/acme/${repoId}`,
    hasDeep: false,
    evidence: {
      problem: baseNode('present'),
      user: baseNode('weak'),
      distribution: baseNode('missing'),
      monetization: baseNode('weak'),
      execution: baseNode('missing'),
      market: baseNode('missing'),
      technical_maturity: baseNode('missing'),
      ...overrides,
    },
    summary: {
      presentCount: 1,
      weakCount: 2,
      missingCount: 4,
      conflictCount: 0,
      overallCoverageRate: 0.14,
      weakestDimensions: [
        'distribution',
        'execution',
        'market',
        'technical_maturity',
      ],
    },
  };
}

test('coverage report highlights missing evidence by bucket and overall conflict hotspots', () => {
  const priorityReport = {
    generatedAt: '2026-03-27T00:00:00.000Z',
    items: [
      priorityItem('repo-v1', 'visible_broken', 'decision_recalc', 220),
      priorityItem('repo-v2', 'visible_broken', 'downgrade_only', 210),
      priorityItem('repo-h1', 'high_value_weak', 'deep_repair', 180),
      priorityItem('repo-h2', 'high_value_weak', 'evidence_repair', 170),
      priorityItem('repo-s1', 'stale_watch', 'refresh_only', 80),
      priorityItem('repo-a1', 'archive_or_noise', 'archive', 10),
    ],
  };

  const report = buildEvidenceMapCoverageReport({
    priorityReport,
    evidenceMaps: [
      evidenceMap('repo-v1', {
        monetization: { ...evidenceMap('x').evidence.monetization, status: 'conflict', conflictFlag: true },
      }),
      evidenceMap('repo-v2'),
      evidenceMap('repo-h1'),
      evidenceMap('repo-h2'),
      evidenceMap('repo-s1'),
      evidenceMap('repo-a1'),
    ],
    options: {
      visibleBrokenTopN: 2,
      highValueWeakTopN: 2,
      randomPerBucket: 1,
    },
  });

  assert.equal(report.overall.sampledCount >= 4, true);
  assert.equal(report.highlights.visibleBrokenMostMissing[0].dimension, 'distribution');
  assert.equal(report.highlights.highValueWeakMostMissing[0].dimension, 'distribution');
  assert.equal(report.highlights.mostCommonConflictDimensions[0].dimension, 'monetization');
});

test('coverage repo id selection includes top items and per-bucket deterministic samples', () => {
  const ids = collectEvidenceCoverageRepoIds({
    items: [
      priorityItem('repo-v1', 'visible_broken', 'decision_recalc', 220),
      priorityItem('repo-v2', 'visible_broken', 'downgrade_only', 210),
      priorityItem('repo-h1', 'high_value_weak', 'deep_repair', 180),
      priorityItem('repo-s1', 'stale_watch', 'refresh_only', 80),
      priorityItem('repo-a1', 'archive_or_noise', 'archive', 10),
    ],
    options: {
      visibleBrokenTopN: 1,
      highValueWeakTopN: 1,
      randomPerBucket: 1,
    },
  });

  assert.ok(ids.includes('repo-v1'));
  assert.ok(ids.includes('repo-h1'));
  assert.ok(ids.includes('repo-s1'));
  assert.ok(ids.includes('repo-a1'));
});
