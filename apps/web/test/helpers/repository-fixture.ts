import type { RepositoryDetail } from '../../src/lib/types/repository';

type RepositoryOverride = {
  [key: string]: unknown;
  analysis?: Record<string, unknown> | null;
  analysisState?: Record<string, unknown> | null;
  finalDecision?: Record<string, unknown> | null;
};

export function createRepositoryFixture(
  overrides: RepositoryOverride = {},
): RepositoryDetail {
  const baseFinalDecision = {
    repoId: 'repo-1',
    oneLinerZh: '一个帮独立开发者管理部署流程的工具',
    oneLinerStrength: 'STRONG',
    verdict: 'GOOD',
    action: 'BUILD',
    category: 'tools',
    categoryLabelZh: '工具类',
    categoryMain: 'tools',
    categorySub: 'devtools',
    projectType: 'tool',
    moneyPriority: 'P1',
    moneyPriorityLabelZh: 'P1 · 值得做',
    reasonZh: '有明确用户和付费路径',
    source: 'local_insight',
    sourceLabelZh: '系统判断',
    hasConflict: false,
    needsRecheck: false,
    hasTrainingHints: false,
    hasClaudeReview: true,
    hasManualOverride: false,
    comparison: {
      localVerdict: 'GOOD',
      localAction: 'BUILD',
      localOneLinerZh: '一个帮独立开发者管理部署流程的工具',
      claudeVerdict: 'GOOD',
      claudeAction: 'BUILD',
      claudeOneLinerZh: '一个帮独立开发者管理部署流程的工具',
      conflictReasons: [],
    },
    moneyDecision: {
      labelZh: '值得做',
      score: 92,
      recommendedMoveZh: '立即做',
      targetUsersZh: '独立开发者和小团队',
      monetizationSummaryZh: '可以做团队订阅',
      reasonZh: '有明确付费路径',
    },
    decisionSummary: {
      headlineZh: '一个帮独立开发者管理部署流程的工具',
      judgementLabelZh: '值得重点看',
      verdictLabelZh: '值得重点看',
      actionLabelZh: '适合直接做',
      finalDecisionLabelZh: '值得做 · 立即做',
      moneyPriorityLabelZh: 'P1 · 值得做',
      categoryLabelZh: '工具类',
      recommendedMoveZh: '立即做',
      worthDoingLabelZh: '现在值得继续推进',
      reasonZh: '有明确用户和付费路径',
      targetUsersZh: '独立开发者和小团队',
      monetizationSummaryZh: '可以做团队订阅',
      sourceLabelZh: '系统判断',
    },
  };

  const baseAnalysis = {
    id: 'analysis-1',
    fallbackUsed: false,
    insightJson: {
      oneLinerZh: '一个帮独立开发者管理部署流程的工具',
      verdict: 'GOOD',
      verdictReason: '有明确用户和付费路径',
      action: 'BUILD',
      completenessScore: 88,
      completenessLevel: 'HIGH',
      category: {
        main: 'tools',
        sub: 'devtools',
      },
      projectReality: {
        type: 'tool',
        hasRealUser: true,
        hasClearUseCase: true,
        isDirectlyMonetizable: true,
      },
      summaryTags: ['部署', '小团队'],
    },
    moneyPriority: {
      score: 92,
      moneyScore: 92,
      tier: 'WORTH_BUILDING',
      moneyDecision: 'HIGH_VALUE',
      labelZh: '值得做',
      reasonZh: '有明确用户和付费路径',
      recommendedMoveZh: '立即做',
      projectTypeLabelZh: '工具类',
      targetUsersZh: '独立开发者和小团队',
      monetizationSummaryZh: '可以做团队订阅',
      source: 'local_insight',
      signals: {
        projectType: 'tool',
        hasRealUser: true,
        hasClearUseCase: true,
        hasProductizationPath: true,
        isDirectlyMonetizable: true,
        isFounderFit: true,
        isSmallTeamFriendly: true,
        hasNearTermMonetizationPath: true,
        isDeveloperWorkflowTool: true,
        isSaasLike: true,
        looksTemplateOrDemo: false,
        looksInfraLayer: false,
        isSmallTeamExecutable: true,
      },
    },
    ideaFitJson: {
      coreJudgement: '需求明确，值得优先验证。',
      opportunityLevel: 'HIGH',
      scores: {
        realDemand: 83,
        toolProductization: 82,
        monetization: 78,
        competitiveBreakthrough: 71,
        timingTailwind: 70,
        executionFeasibility: 86,
        founderFit: 79,
      },
      opportunityTags: ['高频工作流'],
      negativeFlags: [],
    },
    extractedIdeaJson: {
      extractMode: 'full',
      ideaSummary: '把部署流程压缩成独立开发者可直接上手的自动化工具。',
    },
    completenessJson: {
      summary: '结构和可运行性都比较清楚。',
      completenessLevel: 'HIGH',
    },
    deepAnalysisStatus: 'COMPLETED',
    ideaExtractStatus: 'COMPLETED',
  };

  const baseAnalysisState = {
    analysisStatus: 'REVIEW_DONE',
    displayStatus: 'HIGH_CONFIDENCE_READY',
    displayReady: true,
    trustedDisplayReady: true,
    highConfidenceReady: true,
    lightDeepReady: true,
    fullDeepReady: true,
    deepReady: true,
    reviewEligible: true,
    reviewReady: true,
    fullyAnalyzed: true,
    fallbackVisible: false,
    unsafe: false,
  };

  const {
    analysis: analysisInput,
    analysisState: analysisStateInput,
    finalDecision: finalDecisionInput,
    ...restOverrides
  } = overrides;
  const analysisOverride = analysisInput ?? {};
  const finalDecisionOverride = finalDecisionInput ?? {};

  return {
    id: 'repo-1',
    fullName: 'acme/repo-1',
    name: 'repo-1',
    ownerLogin: 'acme',
    htmlUrl: 'https://github.com/acme/repo-1',
    description: '一个帮独立开发者管理部署流程的工具',
    stars: 128,
    roughPass: true,
    productionReady: true,
    completenessLevel: 'HIGH',
    decision: 'RECOMMENDED',
    isFavorited: false,
    createdAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T00:00:00.000Z',
    createdAtGithub: '2026-03-20T00:00:00.000Z',
    language: 'TypeScript',
    topics: ['automation'],
    archived: false,
    disabled: false,
    hasWiki: false,
    hasIssues: true,
    watchers: 10,
    forks: 3,
    openIssues: 2,
    sourceType: 'github',
    snapshots: [],
    analysis: {
      ...baseAnalysis,
      ...(analysisOverride ?? {}),
      moneyPriority: {
        ...baseAnalysis.moneyPriority,
        ...((analysisOverride as Record<string, any>).moneyPriority ?? {}),
        signals: {
          ...baseAnalysis.moneyPriority.signals,
          ...(((analysisOverride as Record<string, any>).moneyPriority ?? {})
            .signals ?? {}),
        },
      },
    } as any,
    analysisState: {
      ...baseAnalysisState,
      ...(analysisStateInput ?? {}),
    } as any,
    finalDecision:
      finalDecisionInput === null
        ? null
        : ({
            ...baseFinalDecision,
            ...(finalDecisionOverride ?? {}),
            comparison: {
              ...baseFinalDecision.comparison,
              ...((finalDecisionOverride as Record<string, any>).comparison ?? {}),
            },
            moneyDecision: {
              ...baseFinalDecision.moneyDecision,
              ...((finalDecisionOverride as Record<string, any>).moneyDecision ?? {}),
            },
            decisionSummary: {
              ...baseFinalDecision.decisionSummary,
              ...((finalDecisionOverride as Record<string, any>).decisionSummary ??
                {}),
            },
          } as any),
    ...restOverrides,
  } as RepositoryDetail;
}
