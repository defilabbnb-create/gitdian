const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EvidenceMapService,
} = require('../dist/modules/analysis/evidence-map.service');

function repositoryRecord(id) {
  return {
    id,
    fullName: `acme/${id}`,
    name: id,
    ownerLogin: 'acme',
    htmlUrl: `https://github.com/acme/${id}`,
    description: 'Useful AI repo',
    homepage: 'https://acme.example',
    language: 'TypeScript',
    license: 'MIT',
    topics: ['ai'],
    stars: 42,
    forks: 2,
    watchers: 5,
    openIssues: 3,
    archived: false,
    disabled: false,
    updatedAt: '2026-03-25T00:00:00.000Z',
    updatedAtGithub: '2026-03-24T00:00:00.000Z',
    pushedAtGithub: '2026-03-24T00:00:00.000Z',
    lastCommitAt: '2026-03-24T00:00:00.000Z',
    commitCount30d: 10,
    contributorsCount: 2,
    issueActivityScore: 55,
    growth7d: 3,
    activityScore: 62,
    completenessScore: 60,
    completenessLevel: 'MEDIUM',
    productionReady: false,
    runability: 'MEDIUM',
    ideaFitScore: 71,
    opportunityLevel: 'A',
    finalScore: 74,
    decision: 'BUILD',
    analysisProvider: 'test',
    analysisModel: 'mock',
    analysisConfidence: 0.8,
    isFavorited: false,
    content: {
      readmeText: 'README text',
      fetchedAt: '2026-03-23T00:00:00.000Z',
    },
    analysis: {
      ideaSnapshotJson: { reason: 'problem exists' },
      insightJson: {
        verdictReason: 'use case clear',
        projectReality: {
          hasRealUser: true,
          hasClearUseCase: true,
          isDirectlyMonetizable: true,
        },
      },
      claudeReviewJson: null,
      claudeReviewStatus: null,
      claudeReviewReviewedAt: null,
      manualVerdict: null,
      manualAction: null,
      manualNote: null,
      manualUpdatedAt: null,
      completenessJson: {
        completenessScore: 60,
        productionReady: false,
        runability: 'MEDIUM',
        summary: 'good enough',
        weaknesses: [],
      },
      ideaFitJson: {
        coreJudgement: 'good',
        scores: {
          realDemand: 68,
          monetization: 66,
          timingTailwind: 60,
          competitiveBreakthrough: 52,
          executionFeasibility: 64,
        },
      },
      extractedIdeaJson: {
        problem: 'ops pain',
        targetUsers: ['ops'],
        productForm: 'SAAS',
        mvpPlan: 'ship v1',
        monetization: 'subscription',
        whyNow: 'AI shift',
      },
      negativeFlags: [],
      tags: [],
      provider: 'test',
      modelName: 'mock',
      promptVersion: 'v1',
      confidence: 0.8,
      fallbackUsed: false,
      analyzedAt: '2026-03-24T00:00:00.000Z',
    },
    favorite: {
      priority: 'MEDIUM',
    },
    cachedRanking: {
      moneyScore: 70,
      moneyPriority: 'P1',
      updatedAt: '2026-03-24T00:00:00.000Z',
    },
    snapshots: [{ snapshotAt: '2026-03-24T00:00:00.000Z' }],
    finalDecision: {
      moneyDecision: {
        targetUsersZh: '运维团队',
        monetizationSummaryZh: '订阅收费',
      },
    },
  };
}

test('buildForRepositoryId returns a single evidence map', async () => {
  const service = new EvidenceMapService(
    {
      repository: {
        findUnique: async () => repositoryRecord('repo-1'),
      },
    },
    {
      attachDerivedAssets: async (value) => value,
    },
  );

  const result = await service.buildForRepositoryId('repo-1');

  assert.equal(result.repoId, 'repo-1');
  assert.equal(result.fullName, 'acme/repo-1');
  assert.equal(result.evidence.problem.status, 'present');
});

test('runReport supports batch mode for multiple repositories', async () => {
  const service = new EvidenceMapService(
    {
      repository: {
        findMany: async () => [repositoryRecord('repo-a'), repositoryRecord('repo-b')],
      },
    },
    {
      attachDerivedAssets: async (value) => value,
    },
  );

  const report = await service.runReport({
    repositoryIds: ['repo-a', 'repo-b'],
  });

  assert.equal(report.scope.mode, 'batch');
  assert.equal(report.summary.totalRepos, 2);
  assert.equal(report.items.length, 2);
});
