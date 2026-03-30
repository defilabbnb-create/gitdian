const test = require('node:test');
const assert = require('node:assert/strict');

const {
  summarizeEvidenceMap,
  scoreEvidenceBackedQuality,
  buildEvidenceDrivenDecisionSummary,
} = require('../dist/modules/analysis/helpers/evidence-map-insight.helper');

function baseEvidenceMap(overrides = {}) {
  return {
    schemaVersion: '2026-03-27.v1',
    generatedAt: '2026-03-27T00:00:00.000Z',
    repoId: 'repo-1',
    fullName: 'acme/repo',
    htmlUrl: 'https://github.com/acme/repo',
    hasDeep: true,
    evidence: {
      problem: node('present', '问题清楚'),
      user: node('present', '用户明确'),
      distribution: node('weak', '分发路径偏弱', {
        requiresDeep: true,
        missingReason: 'weak_distribution_signal',
      }),
      monetization: node('present', '收费路径明确'),
      execution: node('present', '执行证据完整', { requiresDeep: true }),
      market: node('weak', '市场证据偏弱', {
        requiresDeep: true,
        missingReason: 'weak_market_signal',
      }),
      technical_maturity: node('present', '技术成熟度可接受', {
        requiresDeep: true,
      }),
    },
    summary: {
      presentCount: 5,
      weakCount: 2,
      missingCount: 0,
      conflictCount: 0,
      overallCoverageRate: 0.7143,
      weakestDimensions: ['distribution', 'market'],
    },
    ...overrides,
  };
}

function node(status, summary, overrides = {}) {
  return {
    status,
    summary,
    sourceRefs: [
      {
        sourceKind: 'prior_analysis',
        sourceId: 'src-1',
        sourcePath: 'analysis.demo',
        snippetKey: 'analysis.demo',
        lineRef: null,
        capturedAt: '2026-03-24T00:00:00.000Z',
        freshnessDays: 3,
      },
    ],
    confidence: 0.72,
    freshnessDays: 3,
    conflictFlag: status === 'conflict',
    sourceCount: 1,
    lastUpdatedAt: '2026-03-24T00:00:00.000Z',
    missingReason: status === 'missing' ? 'missing_demo' : null,
    derivedFrom: ['analysis.demo'],
    requiresDeep: false,
    ...overrides,
  };
}

test('user and monetization conflicts become decision-recalc evidence', () => {
  const summary = summarizeEvidenceMap(
    baseEvidenceMap({
      evidence: {
        ...baseEvidenceMap().evidence,
        user: node('conflict', '用户画像打架', { conflictFlag: true }),
        monetization: node('conflict', '变现判断打架', { conflictFlag: true }),
      },
      summary: {
        ...baseEvidenceMap().summary,
        presentCount: 3,
        weakCount: 2,
        conflictCount: 2,
      },
    }),
  );

  assert.deepEqual(summary.decisionConflictDimensions, ['user', 'monetization']);
  assert.deepEqual(summary.decisionRecalcGaps, [
    'user_conflict',
    'monetization_conflict',
  ]);
  assert.equal(summary.conflictCount, 2);
});

test('key evidence missing lowers quality score', () => {
  const summary = summarizeEvidenceMap(
    baseEvidenceMap({
      hasDeep: false,
      evidence: {
        ...baseEvidenceMap().evidence,
        execution: node('missing', '缺执行证据', {
          requiresDeep: true,
          missingReason: 'missing_execution',
        }),
        technical_maturity: node('missing', '缺技术成熟度证据', {
          requiresDeep: true,
          missingReason: 'missing_technical_maturity',
        }),
      },
      summary: {
        ...baseEvidenceMap().summary,
        presentCount: 3,
        weakCount: 2,
        missingCount: 2,
      },
    }),
  );

  const quality = scoreEvidenceBackedQuality({
    evidence: summary,
    hasDeep: false,
    fallbackFlag: false,
    conflictFlag: false,
    incompleteFlag: true,
    freshnessDays: 10,
    evidenceFreshnessDays: 10,
    highQualityScore: 75,
    mediumQualityScore: 45,
  });

  assert.equal(quality.analysisQualityState, 'CRITICAL');
  assert.equal(quality.qualityScoreSchemaVersion, '2026-03-27.v2');
  assert.ok(quality.qualityScoreBreakdown.missingPenalty > 0);
  assert.ok(quality.qualityBlockingGaps.includes('execution_missing'));
  assert.ok(quality.qualityBlockingGaps.includes('technical_maturity_missing'));
  assert.ok(quality.qualityBlockingGaps.includes('distribution_weak'));
  assert.ok(quality.qualityBlockingGaps.includes('market_weak'));
  assert.match(
    quality.qualityReasonSummary,
    /execution缺失|technical_maturity缺失/,
  );
});

test('decision summary prefers deep repair for technical and execution gaps', () => {
  const map = baseEvidenceMap({
    hasDeep: false,
    evidence: {
      ...baseEvidenceMap().evidence,
      execution: node('missing', '缺执行证据', {
        requiresDeep: true,
        missingReason: 'missing_execution',
      }),
      technical_maturity: node('missing', '缺技术成熟度证据', {
        requiresDeep: true,
        missingReason: 'missing_technical_maturity',
      }),
    },
    summary: {
      ...baseEvidenceMap().summary,
      presentCount: 3,
      weakCount: 2,
      missingCount: 2,
    },
  });
  const summary = summarizeEvidenceMap(map);
  const decision = buildEvidenceDrivenDecisionSummary({
    evidenceMap: map,
    evidence: summary,
    currentAction: 'BUILD',
    frontendDecisionState: 'provisional',
    hasDeep: false,
  });

  assert.equal(decision.currentAction, 'deep_repair');
  assert.equal(decision.worthBuilding, false);
});

test('good-looking summary still gets low quality when evidence taxonomy is weak', () => {
  const summary = summarizeEvidenceMap(
    baseEvidenceMap({
      evidence: {
        ...baseEvidenceMap().evidence,
        distribution: node('weak', '分发路径偏弱', {
          requiresDeep: true,
          missingReason: 'weak_distribution_signal',
        }),
        market: node('weak', '市场证据偏弱', {
          requiresDeep: true,
          missingReason: 'weak_market_signal',
        }),
        technical_maturity: node('weak', '技术成熟度偏弱', {
          requiresDeep: true,
          missingReason: 'weak_technical_signal',
        }),
      },
      summary: {
        ...baseEvidenceMap().summary,
        presentCount: 4,
        weakCount: 3,
      },
    }),
  );

  const quality = scoreEvidenceBackedQuality({
    evidence: summary,
    hasDeep: true,
    fallbackFlag: false,
    conflictFlag: false,
    incompleteFlag: false,
    freshnessDays: 8,
    evidenceFreshnessDays: 8,
    highQualityScore: 75,
    mediumQualityScore: 45,
  });

  assert.equal(summary.keyEvidenceGapSeverity, 'MEDIUM');
  assert.ok(quality.qualityScoreBreakdown.weakPenalty > 0);
  assert.notEqual(quality.analysisQualityState, 'HIGH');
});

test('evidence conflict and fallback force critical quality state', () => {
  const summary = summarizeEvidenceMap(
    baseEvidenceMap({
      hasDeep: true,
      evidence: {
        ...baseEvidenceMap().evidence,
        user: node('conflict', '用户画像打架', { conflictFlag: true }),
        monetization: node('conflict', '变现判断打架', { conflictFlag: true }),
      },
      summary: {
        ...baseEvidenceMap().summary,
        presentCount: 3,
        weakCount: 2,
        conflictCount: 2,
      },
    }),
  );

  const quality = scoreEvidenceBackedQuality({
    evidence: summary,
    hasDeep: true,
    fallbackFlag: true,
    conflictFlag: true,
    incompleteFlag: false,
    freshnessDays: 6,
    evidenceFreshnessDays: 6,
    highQualityScore: 75,
    mediumQualityScore: 45,
  });

  assert.equal(quality.analysisQualityState, 'CRITICAL');
  assert.ok(quality.qualityScoreBreakdown.conflictPenalty > 0);
  assert.ok(quality.qualityScoreBreakdown.fallbackPenalty > 0);
});

test('deep completion gives a measurable bonus to quality score', () => {
  const summary = summarizeEvidenceMap(baseEvidenceMap());

  const withoutDeep = scoreEvidenceBackedQuality({
    evidence: summary,
    hasDeep: false,
    fallbackFlag: false,
    conflictFlag: false,
    incompleteFlag: false,
    freshnessDays: 3,
    evidenceFreshnessDays: 3,
    highQualityScore: 75,
    mediumQualityScore: 45,
  });
  const withDeep = scoreEvidenceBackedQuality({
    evidence: summary,
    hasDeep: true,
    fallbackFlag: false,
    conflictFlag: false,
    incompleteFlag: false,
    freshnessDays: 3,
    evidenceFreshnessDays: 3,
    highQualityScore: 75,
    mediumQualityScore: 45,
  });

  assert.ok(withDeep.analysisQualityScore > withoutDeep.analysisQualityScore);
  assert.equal(withDeep.qualityScoreBreakdown.deepCompletionBonus, 12);
  assert.equal(withoutDeep.qualityScoreBreakdown.deepCompletionBonus, 0);
});

test('stale evidence and incomplete state suppress quality even without conflict', () => {
  const summary = summarizeEvidenceMap(baseEvidenceMap());
  const quality = scoreEvidenceBackedQuality({
    evidence: summary,
    hasDeep: true,
    fallbackFlag: false,
    conflictFlag: false,
    incompleteFlag: true,
    freshnessDays: 58,
    evidenceFreshnessDays: 61,
    highQualityScore: 75,
    mediumQualityScore: 45,
  });

  assert.notEqual(quality.analysisQualityState, 'HIGH');
  assert.ok(quality.qualityScoreBreakdown.freshnessScore < 12);
  assert.ok(quality.qualityScoreBreakdown.incompletePenalty > 0);
});
