const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EVIDENCE_MAP_DIMENSIONS,
  buildRepositoryEvidenceMap,
} = require('../dist/modules/analysis/helpers/evidence-map.helper');

function baseRepository(overrides = {}) {
  return {
    id: 'repo-1',
    fullName: 'acme/repo',
    htmlUrl: 'https://github.com/acme/repo',
    description: 'An AI workflow tool for customer support teams.',
    homepage: 'https://acme.example',
    topics: ['ai', 'workflow', 'support'],
    stars: 120,
    growth7d: 8,
    archived: false,
    disabled: false,
    updatedAt: '2026-03-25T00:00:00.000Z',
    updatedAtGithub: '2026-03-24T00:00:00.000Z',
    pushedAtGithub: '2026-03-24T00:00:00.000Z',
    lastCommitAt: '2026-03-24T00:00:00.000Z',
    commitCount30d: 18,
    contributorsCount: 3,
    issueActivityScore: 65,
    content: {
      readmeText: 'Customer support automation for internal teams.',
      fetchedAt: '2026-03-23T00:00:00.000Z',
    },
    analysis: {
      analyzedAt: '2026-03-24T00:00:00.000Z',
      manualUpdatedAt: null,
      claudeReviewReviewedAt: null,
      negativeFlags: [],
      ideaSnapshotJson: {
        reason: '有明确客服效率提升场景',
      },
      insightJson: {
        verdictReason: '面向客服团队的工作流场景明确。',
        projectReality: {
          hasRealUser: true,
          hasClearUseCase: true,
          isDirectlyMonetizable: true,
        },
      },
      extractedIdeaJson: {
        problem: '客服团队需要自动分流和总结重复工单。',
        targetUsers: ['客服主管', '客服运营'],
        productForm: 'SAAS',
        mvpPlan: '先做自动标签和汇总面板。',
        monetization: '按席位收费。',
        whyNow: '生成式 AI 让自动总结和分流可用。',
      },
      ideaFitJson: {
        coreJudgement: '需求真实，适合做垂直 SaaS。',
        scores: {
          monetization: 76,
          executionFeasibility: 68,
          realDemand: 72,
          timingTailwind: 66,
          competitiveBreakthrough: 54,
        },
      },
      completenessJson: {
        completenessScore: 67,
        productionReady: false,
        runability: 'MEDIUM',
        summary: 'README、结构与部署说明基本完整。',
        weaknesses: ['缺少完整的监控与告警说明'],
      },
    },
    finalDecision: {
      moneyDecision: {
        targetUsersZh: '客服主管 / 客服运营',
        monetizationSummaryZh: '按席位收费',
      },
    },
    ...overrides,
  };
}

test('evidence map outputs all required dimensions with stable node structure', () => {
  const map = buildRepositoryEvidenceMap({
    repository: baseRepository(),
    now: new Date('2026-03-27T00:00:00.000Z'),
  });

  assert.equal(map.schemaVersion, '2026-03-27.v1');
  assert.deepEqual(Object.keys(map.evidence), [...EVIDENCE_MAP_DIMENSIONS]);

  for (const key of EVIDENCE_MAP_DIMENSIONS) {
    const node = map.evidence[key];
    assert.ok(['present', 'weak', 'missing', 'conflict'].includes(node.status));
    assert.equal(typeof node.summary, 'string');
    assert.equal(typeof node.confidence, 'number');
    assert.equal(typeof node.conflictFlag, 'boolean');
    assert.ok(Array.isArray(node.sourceRefs));
    assert.ok(Array.isArray(node.derivedFrom));
  }
});

test('missing signals stay missing instead of fake present', () => {
  const map = buildRepositoryEvidenceMap({
    repository: baseRepository({
      homepage: null,
      topics: [],
      analysis: {
        analyzedAt: '2026-03-24T00:00:00.000Z',
        manualUpdatedAt: null,
        claudeReviewReviewedAt: null,
        negativeFlags: [],
        ideaSnapshotJson: null,
        insightJson: null,
        extractedIdeaJson: null,
        ideaFitJson: null,
        completenessJson: null,
      },
      finalDecision: null,
      content: {
        readmeText: null,
        fetchedAt: '2026-03-23T00:00:00.000Z',
      },
    }),
    now: new Date('2026-03-27T00:00:00.000Z'),
  });

  assert.equal(map.evidence.distribution.status, 'missing');
  assert.equal(map.evidence.monetization.status, 'missing');
  assert.equal(map.evidence.problem.status, 'weak');
});

test('source refs keep stable structure for downstream consumers', () => {
  const map = buildRepositoryEvidenceMap({
    repository: baseRepository(),
    now: new Date('2026-03-27T00:00:00.000Z'),
  });
  const ref = map.evidence.problem.sourceRefs[0];

  assert.equal(typeof ref.sourceKind, 'string');
  assert.equal(typeof ref.sourceId, 'string');
  assert.equal(typeof ref.sourcePath, 'string');
  assert.equal(typeof ref.snippetKey, 'string');
  assert.ok('lineRef' in ref);
  assert.ok('capturedAt' in ref);
  assert.ok('freshnessDays' in ref);
});

test('conflict flag is written for contradictory monetization evidence', () => {
  const map = buildRepositoryEvidenceMap({
    repository: baseRepository({
      analysis: {
        ...baseRepository().analysis,
        insightJson: {
          verdictReason: '商业化路径存在争议。',
          projectReality: {
            hasRealUser: true,
            hasClearUseCase: true,
            isDirectlyMonetizable: false,
          },
        },
      },
    }),
    now: new Date('2026-03-27T00:00:00.000Z'),
  });

  assert.equal(map.evidence.monetization.status, 'conflict');
  assert.equal(map.evidence.monetization.conflictFlag, true);
});

test('fallback and incomplete signals downgrade deep-dependent evidence', () => {
  const map = buildRepositoryEvidenceMap({
    repository: baseRepository({
      analysisState: {
        displayReady: true,
        fallbackVisible: true,
        unsafe: false,
        incompleteReasons: ['NO_DEEP_ANALYSIS'],
      },
      analysis: {
        ...baseRepository().analysis,
        fallbackUsed: true,
        completenessJson: null,
      },
      finalDecision: {
        moneyDecision: {
          targetUsersZh: '客服主管 / 客服运营',
          monetizationSummaryZh: '稳定订阅收费',
        },
      },
    }),
    now: new Date('2026-03-27T00:00:00.000Z'),
  });

  assert.equal(map.evidence.problem.status, 'weak');
  assert.equal(map.evidence.user.status, 'weak');
  assert.equal(map.evidence.monetization.status, 'weak');
});

test('use case evidence keeps user and problem from being missing', () => {
  const map = buildRepositoryEvidenceMap({
    repository: baseRepository({
      analysis: {
        ...baseRepository().analysis,
        extractedIdeaJson: {
          problem: '客服团队需要自动总结大量重复工单。',
          targetUsers: ['客服主管'],
          productForm: 'SAAS',
          mvpPlan: '',
          monetization: '',
          whyNow: '',
        },
      },
    }),
    now: new Date('2026-03-27T00:00:00.000Z'),
  });

  assert.notEqual(map.evidence.problem.status, 'missing');
  assert.notEqual(map.evidence.user.status, 'missing');
});

test('missing monetization evidence never pretends to be present', () => {
  const map = buildRepositoryEvidenceMap({
    repository: baseRepository({
      analysis: {
        ...baseRepository().analysis,
        extractedIdeaJson: {
          ...baseRepository().analysis.extractedIdeaJson,
          monetization: '',
        },
        insightJson: {
          verdictReason: '用例清晰',
          projectReality: {
            hasRealUser: true,
            hasClearUseCase: true,
            isDirectlyMonetizable: null,
          },
        },
        ideaFitJson: {
          coreJudgement: 'good',
          scores: {
            realDemand: 68,
            monetization: 0,
            timingTailwind: 60,
            competitiveBreakthrough: 52,
            executionFeasibility: 64,
          },
        },
      },
      finalDecision: null,
    }),
    now: new Date('2026-03-27T00:00:00.000Z'),
  });

  assert.notEqual(map.evidence.monetization.status, 'present');
});

test('stale evidence lowers confidence and preserves freshness days', () => {
  const map = buildRepositoryEvidenceMap({
    repository: baseRepository({
      updatedAt: '2025-12-20T00:00:00.000Z',
      updatedAtGithub: '2025-12-20T00:00:00.000Z',
      pushedAtGithub: '2025-12-20T00:00:00.000Z',
      lastCommitAt: '2025-12-20T00:00:00.000Z',
      content: {
        readmeText: 'Customer support automation for internal teams.',
        fetchedAt: '2025-12-20T00:00:00.000Z',
      },
      analysis: {
        ...baseRepository().analysis,
        analyzedAt: '2025-12-20T00:00:00.000Z',
      },
    }),
    now: new Date('2026-03-27T00:00:00.000Z'),
  });

  assert.ok((map.evidence.market.freshnessDays ?? 0) >= 90);
  assert.ok(map.evidence.market.confidence < 0.76);
});
