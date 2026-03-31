const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RepositoryDecisionService,
} = require('../dist/modules/analysis/repository-decision.service');

function createMoneyPriority() {
  return {
    score: 92,
    moneyScore: 92,
    tier: 'MUST_LOOK',
    moneyDecision: 'MUST_BUILD',
    moneyDecisionLabelZh: '必做',
    labelZh: 'P0 · 能赚钱',
    reasonZh: '用户清楚、场景清楚，而且可以按团队版本收费。',
    recommendedMoveZh: '更适合你亲自做成产品',
    projectTypeLabelZh: '工具机会',
    targetUsersZh: '财务团队 / 运营团队',
    monetizationSummaryZh: '可按团队订阅和高级审批流程收费。',
    source: 'local_insight',
    businessSignals: {
      targetUser: '财务团队',
      willingnessToPay: 'high',
      monetizationModel: 'team subscription',
      urgency: 'high',
      founderFit: true,
      buildDifficulty: 'low',
    },
    moneySignals: {
      hasClearUser: true,
      hasClearUseCase: true,
      hasPainPoint: true,
      hasMonetizationPath: true,
      isRepeatUsage: true,
      isSmallTeamBuildable: true,
      isInfraOrModel: false,
      isTemplateOrDemo: false,
    },
    signals: {
      projectType: 'tool',
      hasRealUser: true,
      hasClearUseCase: true,
      hasProductizationPath: true,
      isDirectlyMonetizable: true,
      isFounderFit: true,
      isSmallTeamFriendly: true,
      hasNearTermMonetizationPath: true,
      isDeveloperWorkflowTool: false,
      isSaasLike: true,
      looksTemplateOrDemo: false,
      looksInfraLayer: false,
      isSmallTeamExecutable: true,
    },
  };
}

test('repository decision prefers fresh local insight over stale local fallback review', () => {
  const service = new RepositoryDecisionService(
    {},
    {
      calculate: () => createMoneyPriority(),
    },
  );

  const result = service.buildRepositoryAssets(
    {
      id: 'repo-1',
      fullName: 'acme/repo-1',
      htmlUrl: 'https://github.com/acme/repo-1',
      name: 'repo-1',
      description: 'expense approval workflow',
      language: 'TypeScript',
      topics: ['automation', 'finance'],
      stars: 120,
      ideaFitScore: 88,
      finalScore: 90,
      toolLikeScore: 85,
      roughPass: true,
      categoryL1: 'tools',
      categoryL2: 'workflow',
      analysis: {
        insightJson: {
          oneLinerZh: '给财务团队做报销审批和风控校验的自动化工具',
          oneLinerStrength: 'STRONG',
          verdict: 'GOOD',
          action: 'BUILD',
          verdictReason: '本地 insight 已确认用户、场景和收费路径都比较清楚。',
          projectReality: {
            type: 'tool',
            hasRealUser: true,
            hasClearUseCase: true,
            isDirectlyMonetizable: true,
          },
        },
        claudeReviewStatus: 'SUCCESS',
        claudeReviewJson: {
          generatedBy: 'local_fallback',
          needsClaudeReview: true,
          oneLinerZh: '这个项目暂时更适合放在低优先观察池里。',
          verdict: 'BAD',
          action: 'IGNORE',
          reason: 'fallback stale review',
          projectType: 'demo',
          hasRealUser: false,
          hasClearUseCase: false,
          isDirectlyMonetizable: false,
        },
      },
      content: {
        readmeSummary: 'expense approvals',
      },
    },
    null,
    null,
  );

  assert.equal(result.finalDecision.source, 'local');
  assert.equal(
    result.finalDecision.oneLinerZh,
    '给财务团队做报销审批和风控校验的自动化工具',
  );
  assert.equal(result.finalDecision.verdict, 'GOOD');
  assert.equal(result.finalDecision.action, 'BUILD');
  assert.equal(result.finalDecision.hasClaudeReview, false);
  assert.equal(
    result.finalDecision.comparison.claudeOneLinerZh,
    '这个项目暂时更适合放在低优先观察池里。',
  );
  assert.equal(result.analysisState.fallbackVisible, false);
});

test('repository decision treats retired review runtime as non-blocking for fully analyzed state', () => {
  const previousRetired = process.env.CLAUDE_RUNTIME_RETIRED;
  process.env.CLAUDE_RUNTIME_RETIRED = 'true';

  try {
    const service = new RepositoryDecisionService(
      {},
      {
        calculate: () => createMoneyPriority(),
      },
    );

    const result = service.buildRepositoryAssets(
      {
        id: 'repo-2',
        fullName: 'acme/repo-2',
        htmlUrl: 'https://github.com/acme/repo-2',
        name: 'repo-2',
        description: 'expense approval workflow',
        language: 'TypeScript',
        topics: ['automation', 'finance'],
        stars: 120,
        ideaFitScore: 88,
        finalScore: 90,
        toolLikeScore: 85,
        roughPass: true,
        categoryL1: 'tools',
        categoryL2: 'workflow',
        analysis: {
          ideaSnapshotJson: {
            isPromising: true,
            nextAction: 'BUILD',
            reason: '用户与收费路径较清晰。',
            projectReality: {
              type: 'tool',
              hasRealUser: true,
              hasClearUseCase: true,
              isDirectlyMonetizable: true,
            },
          },
          insightJson: {
            oneLinerZh: '给财务团队做报销审批和风控校验的自动化工具',
            oneLinerStrength: 'STRONG',
            verdict: 'GOOD',
            action: 'BUILD',
            verdictReason: '本地 insight 已确认用户、场景和收费路径都比较清楚。',
            projectReality: {
              type: 'tool',
              hasRealUser: true,
              hasClearUseCase: true,
              isDirectlyMonetizable: true,
            },
          },
          completenessJson: {
            summaryZh: '信息完整度较高',
          },
          ideaFitJson: {
            score: 88,
          },
          extractedIdeaJson: {
            summary: 'expense approvals',
          },
          claudeReviewStatus: null,
          claudeReviewJson: null,
        },
        content: {
          readmeSummary: 'expense approvals',
        },
      },
      null,
      null,
    );

    assert.equal(result.analysisState.analysisStatus, 'DEEP_DONE');
    assert.equal(result.analysisState.reviewReady, true);
    assert.notEqual(result.analysisState.incompleteReason, 'NO_CLAUDE_REVIEW');
  } finally {
    if (previousRetired === undefined) {
      delete process.env.CLAUDE_RUNTIME_RETIRED;
    } else {
      process.env.CLAUDE_RUNTIME_RETIRED = previousRetired;
    }
  }
});
