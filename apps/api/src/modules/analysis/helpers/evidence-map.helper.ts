export const EVIDENCE_MAP_SCHEMA_VERSION = '2026-03-27.v1';

export const EVIDENCE_MAP_DIMENSIONS = [
  'problem',
  'user',
  'distribution',
  'monetization',
  'execution',
  'market',
  'technical_maturity',
] as const;

export type EvidenceMapDimension = (typeof EVIDENCE_MAP_DIMENSIONS)[number];
export type EvidenceMapNodeStatus = 'present' | 'weak' | 'missing' | 'conflict';
export type EvidenceMapSourceKind =
  | 'readme'
  | 'website'
  | 'release'
  | 'issues'
  | 'commits'
  | 'metadata'
  | 'prior_analysis';

export type EvidenceMapSourceRef = {
  sourceKind: EvidenceMapSourceKind;
  sourceId: string | null;
  sourcePath: string | null;
  snippetKey: string | null;
  lineRef: string | null;
  capturedAt: string | null;
  freshnessDays: number | null;
};

export type EvidenceMapNode = {
  status: EvidenceMapNodeStatus;
  summary: string;
  sourceRefs: EvidenceMapSourceRef[];
  confidence: number;
  freshnessDays: number | null;
  conflictFlag: boolean;
  sourceCount: number;
  lastUpdatedAt: string | null;
  missingReason: string | null;
  derivedFrom: string[];
  requiresDeep: boolean;
};

export type RepositoryEvidenceMap = {
  schemaVersion: string;
  generatedAt: string;
  repoId: string;
  fullName: string;
  htmlUrl: string;
  hasDeep: boolean;
  evidence: Record<EvidenceMapDimension, EvidenceMapNode>;
  summary: {
    presentCount: number;
    weakCount: number;
    missingCount: number;
    conflictCount: number;
    overallCoverageRate: number;
    weakestDimensions: EvidenceMapDimension[];
  };
};

export type EvidenceMapReport = {
  schemaVersion: string;
  generatedAt: string;
  scope: {
    mode: 'single' | 'batch';
    repositoryIds: string[];
    limit: number | null;
  };
  summary: {
    totalRepos: number;
    dimensionBreakdown: Record<
      EvidenceMapDimension,
      Record<EvidenceMapNodeStatus, number>
    >;
    weakestDimensions: Array<{
      dimension: EvidenceMapDimension;
      weakOrMissingCount: number;
      conflictCount: number;
    }>;
  };
  items: RepositoryEvidenceMap[];
};

const UNCLEAR_USER_PATTERN =
  /不够清楚|待确认|无法识别用户|无法确定目标用户|目标用户仍不清晰|还需要继续确认/i;

const UNCLEAR_MONETIZATION_PATTERN =
  /收费路径还不够清楚|先确认真实用户和场景|先验证价值|暂时还不明确|更适合先验证|不具备直接变现/i;

type EvidenceContext = {
  now: Date;
  repository: Record<string, unknown>;
  analysis: Record<string, unknown> | null;
  analysisState: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  insight: Record<string, unknown> | null;
  extractedIdea: Record<string, unknown> | null;
  ideaFit: Record<string, unknown> | null;
  completeness: Record<string, unknown> | null;
  finalDecision: Record<string, unknown> | null;
  moneyDecision: Record<string, unknown> | null;
  projectReality: Record<string, unknown> | null;
  negativeFlags: string[];
  readmeText: string;
  repoId: string;
  fullName: string;
  htmlUrl: string;
  hasDeep: boolean;
};

type EvidenceNodeDraft = {
  status: EvidenceMapNodeStatus;
  summary: string;
  refs: EvidenceMapSourceRef[];
  confidence: number;
  conflictFlag: boolean;
  missingReason?: string | null;
  requiresDeep?: boolean;
};

export function buildRepositoryEvidenceMap(args: {
  repository: Record<string, unknown>;
  now?: Date;
}): RepositoryEvidenceMap {
  const now = args.now ?? new Date();
  const repository = args.repository;
  const analysis = readObject(repository.analysis);
  const analysisState = readObject(repository.analysisState);
  const snapshot = readObject(analysis?.ideaSnapshotJson);
  const insight = readObject(analysis?.insightJson);
  const extractedIdea = readObject(analysis?.extractedIdeaJson);
  const ideaFit = readObject(analysis?.ideaFitJson);
  const completeness = readObject(analysis?.completenessJson);
  const finalDecision = readObject(repository.finalDecision);
  const moneyDecision = readObject(finalDecision?.moneyDecision);
  const projectReality = readObject(insight?.projectReality);
  const readmeText = cleanText(readObject(repository.content)?.readmeText, 12_000);
  const context: EvidenceContext = {
    now,
    repository,
    analysis,
    analysisState,
    snapshot,
    insight,
    extractedIdea,
    ideaFit,
    completeness,
    finalDecision,
    moneyDecision,
    projectReality,
    negativeFlags: normalizeStringArray(analysis?.negativeFlags),
    readmeText,
    repoId: readString(repository.id),
    fullName: readString(repository.fullName),
    htmlUrl: readString(repository.htmlUrl),
    hasDeep: Boolean(ideaFit && extractedIdea && completeness),
  };

  const evidence = {
    problem: finalizeNode(context, buildProblemNode(context)),
    user: finalizeNode(context, buildUserNode(context)),
    distribution: finalizeNode(context, buildDistributionNode(context)),
    monetization: finalizeNode(context, buildMonetizationNode(context)),
    execution: finalizeNode(context, buildExecutionNode(context)),
    market: finalizeNode(context, buildMarketNode(context)),
    technical_maturity: finalizeNode(context, buildTechnicalMaturityNode(context)),
  } satisfies Record<EvidenceMapDimension, EvidenceMapNode>;

  const nodes = Object.values(evidence);
  const weakestDimensions = EVIDENCE_MAP_DIMENSIONS.filter((dimension) => {
    const node = evidence[dimension];
    return node.status === 'missing' || node.status === 'weak' || node.conflictFlag;
  });

  return {
    schemaVersion: EVIDENCE_MAP_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    repoId: context.repoId,
    fullName: context.fullName,
    htmlUrl: context.htmlUrl,
    hasDeep: context.hasDeep,
    evidence,
    summary: {
      presentCount: nodes.filter((item) => item.status === 'present').length,
      weakCount: nodes.filter((item) => item.status === 'weak').length,
      missingCount: nodes.filter((item) => item.status === 'missing').length,
      conflictCount: nodes.filter((item) => item.status === 'conflict').length,
      overallCoverageRate: roundRatio(
        nodes.filter((item) => item.status === 'present').length /
          Math.max(1, nodes.length),
      ),
      weakestDimensions,
    },
  };
}

export function buildEvidenceMapReport(args: {
  items: RepositoryEvidenceMap[];
  repositoryIds?: string[];
  limit?: number | null;
  generatedAt?: string;
}): EvidenceMapReport {
  const summaryBreakdown = Object.fromEntries(
    EVIDENCE_MAP_DIMENSIONS.map((dimension) => [
      dimension,
      {
        present: 0,
        weak: 0,
        missing: 0,
        conflict: 0,
      },
    ]),
  ) as Record<EvidenceMapDimension, Record<EvidenceMapNodeStatus, number>>;

  for (const item of args.items) {
    for (const dimension of EVIDENCE_MAP_DIMENSIONS) {
      const status = item.evidence[dimension].status;
      summaryBreakdown[dimension][status] += 1;
    }
  }

  const weakestDimensions = EVIDENCE_MAP_DIMENSIONS.map((dimension) => ({
    dimension,
    weakOrMissingCount:
      summaryBreakdown[dimension].weak + summaryBreakdown[dimension].missing,
    conflictCount: summaryBreakdown[dimension].conflict,
  })).sort((left, right) => {
    const rightWeight = right.weakOrMissingCount * 10 + right.conflictCount;
    const leftWeight = left.weakOrMissingCount * 10 + left.conflictCount;
    return rightWeight - leftWeight;
  });

  return {
    schemaVersion: EVIDENCE_MAP_SCHEMA_VERSION,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    scope: {
      mode: args.items.length <= 1 ? 'single' : 'batch',
      repositoryIds: args.repositoryIds ?? args.items.map((item) => item.repoId),
      limit: args.limit ?? null,
    },
    summary: {
      totalRepos: args.items.length,
      dimensionBreakdown: summaryBreakdown,
      weakestDimensions,
    },
    items: args.items,
  };
}

export function renderEvidenceMapMarkdown(report: EvidenceMapReport): string {
  const lines: string[] = [];
  lines.push('# Evidence Map Report');
  lines.push('');
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- schemaVersion: ${report.schemaVersion}`);
  lines.push(`- totalRepos: ${report.summary.totalRepos}`);
  lines.push(`- mode: ${report.scope.mode}`);
  if (report.scope.limit !== null) {
    lines.push(`- limit: ${report.scope.limit}`);
  }
  lines.push('');
  lines.push('## Weakest Dimensions');
  lines.push('');

  for (const item of report.summary.weakestDimensions.slice(0, 7)) {
    lines.push(
      `- ${item.dimension}: weakOrMissing=${item.weakOrMissingCount}, conflict=${item.conflictCount}`,
    );
  }

  lines.push('');
  lines.push('## Dimension Breakdown');
  lines.push('');

  for (const dimension of EVIDENCE_MAP_DIMENSIONS) {
    const breakdown = report.summary.dimensionBreakdown[dimension];
    lines.push(
      `- ${dimension}: present=${breakdown.present}, weak=${breakdown.weak}, missing=${breakdown.missing}, conflict=${breakdown.conflict}`,
    );
  }

  lines.push('');
  lines.push('## Samples');
  lines.push('');

  for (const item of report.items.slice(0, 10)) {
    lines.push(`### ${item.fullName}`);
    lines.push('');
    for (const dimension of EVIDENCE_MAP_DIMENSIONS) {
      const node = item.evidence[dimension];
      lines.push(
        `- ${dimension}: ${node.status} | ${node.summary} | requiresDeep=${String(node.requiresDeep)}`,
      );
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function buildProblemNode(context: EvidenceContext): EvidenceNodeDraft {
  const problem = cleanText(context.extractedIdea?.problem, 220);
  const verdictReason = cleanText(context.insight?.verdictReason, 220);
  const snapshotReason = cleanText(context.snapshot?.reason, 180);
  const description = cleanText(context.repository.description, 180);
  const hasClearUseCase = readOptionalBoolean(
    context.projectReality?.hasClearUseCase,
  );
  const refs = compactRefs([
    priorAnalysisRef(
      context,
      'analysis.extractedIdeaJson.problem',
      problem,
    ),
    priorAnalysisRef(
      context,
      'analysis.insightJson.verdictReason',
      verdictReason,
    ),
    priorAnalysisRef(
      context,
      'analysis.ideaSnapshotJson.reason',
      snapshotReason,
    ),
    metadataRef(context, 'repository.description', description),
  ]);
  const conflictFlag = hasClearUseCase === false && Boolean(problem || verdictReason);

  if (conflictFlag) {
    return {
      status: 'conflict',
      summary: '问题定义与当前用例清晰度信号冲突，不能直接信任现有判断。',
      refs,
      confidence: 0.36,
      conflictFlag: true,
      missingReason: 'problem_definition_conflict',
      requiresDeep: true,
    };
  }

  if (problem || verdictReason) {
    return {
      status: 'present',
      summary: problem || verdictReason,
      refs,
      confidence: problem && verdictReason ? 0.86 : 0.74,
      conflictFlag: false,
      requiresDeep: !context.hasDeep,
    };
  }

  if (snapshotReason || description) {
    return {
      status: 'weak',
      summary:
        snapshotReason ||
        description ||
        '只有 README/描述级的弱问题线索，尚未形成稳定问题定义。',
      refs,
      confidence: 0.42,
      conflictFlag: false,
      missingReason: 'missing_explicit_problem_statement',
      requiresDeep: true,
    };
  }

  return {
    status: 'missing',
    summary: '缺少明确的问题定义证据。',
    refs,
    confidence: 0.12,
    conflictFlag: false,
    missingReason: 'missing_problem_statement',
    requiresDeep: true,
  };
}

function buildUserNode(context: EvidenceContext): EvidenceNodeDraft {
  const targetUsers = normalizeStringArray(context.extractedIdea?.targetUsers);
  const targetUsersLabel = cleanText(context.moneyDecision?.targetUsersZh, 160);
  const hasRealUser = readOptionalBoolean(context.projectReality?.hasRealUser);
  const hasClearUseCase = readOptionalBoolean(
    context.projectReality?.hasClearUseCase,
  );
  const unclearUser = UNCLEAR_USER_PATTERN.test(targetUsersLabel);
  const refs = compactRefs([
    priorAnalysisRef(
      context,
      'analysis.extractedIdeaJson.targetUsers',
      targetUsers.join(' / '),
    ),
    priorAnalysisRef(
      context,
      'finalDecision.moneyDecision.targetUsersZh',
      targetUsersLabel,
    ),
    priorAnalysisRef(
      context,
      'analysis.insightJson.projectReality.hasRealUser',
      hasRealUser === null ? '' : String(hasRealUser),
    ),
    priorAnalysisRef(
      context,
      'analysis.insightJson.projectReality.hasClearUseCase',
      hasClearUseCase === null ? '' : String(hasClearUseCase),
    ),
  ]);
  const conflictFlag = hasRealUser === false && (targetUsers.length > 0 || Boolean(targetUsersLabel));

  if (conflictFlag) {
    return {
      status: 'conflict',
      summary: '目标用户文本存在，但现有分析同时认为没有明确真实用户。',
      refs,
      confidence: 0.32,
      conflictFlag: true,
      missingReason: 'user_signal_conflict',
      requiresDeep: true,
    };
  }

  if (targetUsers.length > 0 && hasRealUser !== false && !unclearUser) {
    return {
      status: 'present',
      summary: `目标用户已定义：${targetUsers.slice(0, 3).join('、')}`,
      refs,
      confidence: hasRealUser === true ? 0.84 : 0.72,
      conflictFlag: false,
      requiresDeep: !context.hasDeep,
    };
  }

  if (
    targetUsersLabel ||
    hasRealUser === true ||
    hasClearUseCase === true
  ) {
    return {
      status: 'weak',
      summary:
        targetUsersLabel ||
        '已有用户方向线索，但目标用户定义仍偏粗。',
      refs,
      confidence: 0.46,
      conflictFlag: false,
      missingReason: 'target_user_definition_is_weak',
      requiresDeep: true,
    };
  }

  return {
    status: 'missing',
    summary: '缺少稳定的目标用户证据。',
    refs,
    confidence: 0.12,
    conflictFlag: false,
    missingReason: 'missing_target_users',
    requiresDeep: true,
  };
}

function buildDistributionNode(context: EvidenceContext): EvidenceNodeDraft {
  const homepage = cleanText(context.repository.homepage, 220);
  const productForm = cleanText(context.extractedIdea?.productForm, 80);
  const topics = normalizeStringArray(context.repository.topics).slice(0, 5);
  const refs = compactRefs([
    websiteRef(context, 'repository.homepage', homepage),
    priorAnalysisRef(
      context,
      'analysis.extractedIdeaJson.productForm',
      productForm,
    ),
    metadataRef(context, 'repository.topics', topics.join(' / ')),
  ]);
  const presentByForm = ['SAAS', 'PLUGIN', 'API', 'TOOL_SITE'].includes(
    productForm.toUpperCase(),
  );

  if (homepage && presentByForm) {
    return {
      status: 'present',
      summary: `已有外部触达入口（${homepage}）且产品形态明确为 ${productForm}。`,
      refs,
      confidence: 0.68,
      conflictFlag: false,
      requiresDeep: false,
    };
  }

  if (homepage || productForm || topics.length > 0) {
    return {
      status: 'weak',
      summary:
        homepage ||
        (productForm ? `已有产品形态线索：${productForm}` : '') ||
        '只有弱分发线索，缺少清晰获客/分发证据。',
      refs,
      confidence: 0.34,
      conflictFlag: false,
      missingReason: 'missing_distribution_proof',
      requiresDeep: true,
    };
  }

  return {
    status: 'missing',
    summary: '缺少分发与触达路径证据。',
    refs,
    confidence: 0.08,
    conflictFlag: false,
    missingReason: 'missing_distribution_signal',
    requiresDeep: true,
  };
}

function buildMonetizationNode(context: EvidenceContext): EvidenceNodeDraft {
  const monetization = cleanText(context.extractedIdea?.monetization, 220);
  const monetizationLabel = cleanText(
    context.moneyDecision?.monetizationSummaryZh,
    220,
  );
  const isDirectlyMonetizable = readOptionalBoolean(
    context.projectReality?.isDirectlyMonetizable,
  );
  const monetizationScore = readNumber(context.ideaFit?.scores, 'monetization');
  const refs = compactRefs([
    priorAnalysisRef(
      context,
      'analysis.extractedIdeaJson.monetization',
      monetization,
    ),
    priorAnalysisRef(
      context,
      'finalDecision.moneyDecision.monetizationSummaryZh',
      monetizationLabel,
    ),
    priorAnalysisRef(
      context,
      'analysis.insightJson.projectReality.isDirectlyMonetizable',
      isDirectlyMonetizable === null ? '' : String(isDirectlyMonetizable),
    ),
    priorAnalysisRef(
      context,
      'analysis.ideaFitJson.scores.monetization',
      monetizationScore === null ? '' : String(monetizationScore),
    ),
  ]);
  const conflictFlag =
    isDirectlyMonetizable === false &&
    (Boolean(monetization) ||
      Boolean(monetizationLabel) ||
      (monetizationScore ?? 0) >= 65);
  const unclearMonetization = UNCLEAR_MONETIZATION_PATTERN.test(
    `${monetization} ${monetizationLabel}`.trim(),
  );

  if (conflictFlag) {
    return {
      status: 'conflict',
      summary: '收费路径文本存在，但现有分析同时认为项目不具备直接变现条件。',
      refs,
      confidence: 0.34,
      conflictFlag: true,
      missingReason: 'monetization_conflict',
      requiresDeep: true,
    };
  }

  if ((monetization || monetizationLabel) && isDirectlyMonetizable !== false) {
    if (unclearMonetization) {
      return {
        status: 'weak',
        summary:
          monetizationLabel ||
          monetization ||
          '已有收费线索，但收费路径仍不稳定。',
        refs,
        confidence: 0.42,
        conflictFlag: false,
        missingReason: 'monetization_proof_is_weak',
        requiresDeep: true,
      };
    }
    return {
      status: 'present',
      summary: monetization || monetizationLabel,
      refs,
      confidence: isDirectlyMonetizable === true ? 0.8 : 0.64,
      conflictFlag: false,
      requiresDeep: !context.hasDeep,
    };
  }

  if (
    isDirectlyMonetizable === true ||
    (monetizationScore !== null && monetizationScore >= 55)
  ) {
    return {
      status: 'weak',
      summary: '已有收费可能性信号，但缺少稳定的收费路径证据。',
      refs,
      confidence: 0.44,
      conflictFlag: false,
      missingReason: 'monetization_proof_is_weak',
      requiresDeep: true,
    };
  }

  return {
    status: 'missing',
    summary: '缺少明确的收费路径证据。',
    refs,
    confidence: 0.1,
    conflictFlag: false,
    missingReason: 'missing_monetization_path',
    requiresDeep: true,
  };
}

function buildExecutionNode(context: EvidenceContext): EvidenceNodeDraft {
  const mvpPlan = cleanText(context.extractedIdea?.mvpPlan, 220);
  const completenessSummary = cleanText(context.completeness?.summary, 220);
  const weaknesses = normalizeStringArray(context.completeness?.weaknesses);
  const completenessScore = readNumber(context.completeness, 'completenessScore');
  const executionScore = readNumber(context.ideaFit?.scores, 'executionFeasibility');
  const productionReady = readOptionalBoolean(context.completeness?.productionReady);
  const runability = cleanText(context.completeness?.runability, 40).toUpperCase();
  const refs = compactRefs([
    priorAnalysisRef(context, 'analysis.extractedIdeaJson.mvpPlan', mvpPlan),
    priorAnalysisRef(
      context,
      'analysis.completenessJson.summary',
      completenessSummary,
    ),
    priorAnalysisRef(
      context,
      'analysis.completenessJson.weaknesses',
      weaknesses.join(' / '),
    ),
    priorAnalysisRef(
      context,
      'analysis.ideaFitJson.scores.executionFeasibility',
      executionScore === null ? '' : String(executionScore),
    ),
  ]);
  const conflictFlag =
    Boolean(mvpPlan) &&
    ((runability && runability === 'LOW') ||
      (completenessScore !== null && completenessScore < 30));

  if (conflictFlag) {
    return {
      status: 'conflict',
      summary: '执行方案文本存在，但完整性/可运行性信号过弱，不能直接相信执行路径。',
      refs,
      confidence: 0.33,
      conflictFlag: true,
      missingReason: 'execution_feasibility_conflict',
      requiresDeep: true,
    };
  }

  if (
    mvpPlan &&
    (completenessScore ?? 0) >= 55 &&
    (executionScore ?? 0) >= 50
  ) {
    return {
      status: 'present',
      summary: mvpPlan,
      refs,
      confidence:
        productionReady === true || runability === 'HIGH' ? 0.82 : 0.68,
      conflictFlag: false,
      requiresDeep: !context.hasDeep,
    };
  }

  if (
    mvpPlan ||
    completenessSummary ||
    executionScore !== null ||
    completenessScore !== null
  ) {
    return {
      status: 'weak',
      summary:
        mvpPlan ||
        completenessSummary ||
        '已有执行层线索，但落地条件与实际可运行性仍偏弱。',
      refs,
      confidence: 0.48,
      conflictFlag: false,
      missingReason: 'execution_proof_is_weak',
      requiresDeep: true,
    };
  }

  return {
    status: 'missing',
    summary: '缺少可执行方案与落地条件证据。',
    refs,
    confidence: 0.12,
    conflictFlag: false,
    missingReason: 'missing_execution_plan',
    requiresDeep: true,
  };
}

function buildMarketNode(context: EvidenceContext): EvidenceNodeDraft {
  const whyNow = cleanText(context.extractedIdea?.whyNow, 220);
  const coreJudgement = cleanText(context.ideaFit?.coreJudgement, 220);
  const demand = readNumber(context.ideaFit?.scores, 'realDemand');
  const timing = readNumber(context.ideaFit?.scores, 'timingTailwind');
  const competition = readNumber(
    context.ideaFit?.scores,
    'competitiveBreakthrough',
  );
  const stars = readOptionalNumber(context.repository.stars);
  const growth7d = readOptionalNumber(context.repository.growth7d);
  const refs = compactRefs([
    priorAnalysisRef(context, 'analysis.extractedIdeaJson.whyNow', whyNow),
    priorAnalysisRef(
      context,
      'analysis.ideaFitJson.coreJudgement',
      coreJudgement,
    ),
    priorAnalysisRef(
      context,
      'analysis.ideaFitJson.scores.realDemand',
      demand === null ? '' : String(demand),
    ),
    priorAnalysisRef(
      context,
      'analysis.ideaFitJson.scores.timingTailwind',
      timing === null ? '' : String(timing),
    ),
    priorAnalysisRef(
      context,
      'analysis.ideaFitJson.scores.competitiveBreakthrough',
      competition === null ? '' : String(competition),
    ),
    metadataRef(
      context,
      'repository.marketSignals',
      [stars !== null ? `stars=${stars}` : '', growth7d !== null ? `growth7d=${growth7d}` : '']
        .filter(Boolean)
        .join(' '),
    ),
  ]);
  const averageScore = average([demand, timing, competition]);
  const conflictFlag =
    Boolean(whyNow || coreJudgement) &&
    (averageScore !== null && averageScore < 35);

  if (conflictFlag) {
    return {
      status: 'conflict',
      summary: '市场判断文本存在，但需求/时机/竞争得分过弱。',
      refs,
      confidence: 0.3,
      conflictFlag: true,
      missingReason: 'market_signal_conflict',
      requiresDeep: true,
    };
  }

  if (whyNow && averageScore !== null && averageScore >= 55) {
    return {
      status: 'present',
      summary: whyNow,
      refs,
      confidence: 0.76,
      conflictFlag: false,
      requiresDeep: !context.hasDeep,
    };
  }

  if (
    whyNow ||
    coreJudgement ||
    averageScore !== null ||
    (stars ?? 0) > 0 ||
    (growth7d ?? 0) > 0
  ) {
    return {
      status: 'weak',
      summary:
        whyNow ||
        coreJudgement ||
        '已有市场线索，但缺少稳定的需求/竞争/时机证据。',
      refs,
      confidence: 0.38,
      conflictFlag: false,
      missingReason: 'market_proof_is_weak',
      requiresDeep: true,
    };
  }

  return {
    status: 'missing',
    summary: '缺少市场需求、竞争与时机证据。',
    refs,
    confidence: 0.08,
    conflictFlag: false,
    missingReason: 'missing_market_signal',
    requiresDeep: true,
  };
}

function buildTechnicalMaturityNode(context: EvidenceContext): EvidenceNodeDraft {
  const completenessSummary = cleanText(context.completeness?.summary, 220);
  const completenessScore = readNumber(context.completeness, 'completenessScore');
  const productionReady = readOptionalBoolean(context.completeness?.productionReady);
  const runability = cleanText(context.completeness?.runability, 40).toUpperCase();
  const commitCount30d = readOptionalNumber(context.repository.commitCount30d);
  const contributorsCount = readOptionalNumber(context.repository.contributorsCount);
  const issueActivityScore = readOptionalNumber(context.repository.issueActivityScore);
  const archived = readOptionalBoolean(context.repository.archived) === true;
  const disabled = readOptionalBoolean(context.repository.disabled) === true;
  const refs = compactRefs([
    priorAnalysisRef(
      context,
      'analysis.completenessJson.summary',
      completenessSummary,
    ),
    priorAnalysisRef(
      context,
      'analysis.completenessJson.completenessScore',
      completenessScore === null ? '' : String(completenessScore),
    ),
    commitsRef(
      context,
      'repository.commitCount30d',
      commitCount30d === null ? '' : String(commitCount30d),
    ),
    issuesRef(
      context,
      'repository.issueActivityScore',
      issueActivityScore === null ? '' : String(issueActivityScore),
    ),
    metadataRef(
      context,
      'repository.contributorsCount',
      contributorsCount === null ? '' : String(contributorsCount),
    ),
  ]);
  const conflictFlag =
    (archived || disabled) &&
    ((completenessScore ?? 0) >= 60 || productionReady === true);

  if (conflictFlag) {
    return {
      status: 'conflict',
      summary: '技术成熟度信号与仓库实际状态冲突，存在被高估风险。',
      refs,
      confidence: 0.34,
      conflictFlag: true,
      missingReason: 'technical_maturity_conflict',
      requiresDeep: true,
    };
  }

  if ((completenessScore ?? 0) >= 60 && !archived && !disabled) {
    return {
      status: 'present',
      summary:
        completenessSummary ||
        '完整性和可运行性达到可用水平。',
      refs,
      confidence:
        productionReady === true || runability === 'HIGH' ? 0.84 : 0.7,
      conflictFlag: false,
      requiresDeep: !context.hasDeep,
    };
  }

  if (
    completenessSummary ||
    completenessScore !== null ||
    (commitCount30d ?? 0) > 0 ||
    (contributorsCount ?? 0) > 0
  ) {
    return {
      status: 'weak',
      summary:
        completenessSummary ||
        '已有技术成熟度线索，但还不足以支撑强结论。',
      refs,
      confidence: 0.44,
      conflictFlag: false,
      missingReason: 'technical_maturity_is_weak',
      requiresDeep: true,
    };
  }

  return {
    status: 'missing',
    summary: '缺少可运行性、完整性与维护状态证据。',
    refs,
    confidence: 0.1,
    conflictFlag: false,
    missingReason: 'missing_technical_maturity',
    requiresDeep: true,
  };
}

function finalizeNode(
  context: EvidenceContext,
  draft: EvidenceNodeDraft,
): EvidenceMapNode {
  const lastUpdatedAt = pickLatestDate(draft.refs.map((item) => item.capturedAt));
  const freshnessDays =
    draft.refs
      .map((item) => item.freshnessDays)
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right)[0] ?? null;

  const baseNode: EvidenceMapNode = {
    status: draft.status,
    summary: draft.summary,
    sourceRefs: draft.refs,
    confidence: clampConfidence(draft.confidence),
    freshnessDays,
    conflictFlag: draft.conflictFlag,
    sourceCount: draft.refs.length,
    lastUpdatedAt,
    missingReason: draft.missingReason ?? null,
    derivedFrom: uniqueStrings(
      draft.refs
        .map((item) => item.sourcePath ?? item.snippetKey ?? '')
        .filter(Boolean),
    ),
    requiresDeep: draft.requiresDeep ?? !context.hasDeep,
  };

  return applyRepositoryRiskAdjustments(context, baseNode);
}

function applyRepositoryRiskAdjustments(
  context: EvidenceContext,
  node: EvidenceMapNode,
): EvidenceMapNode {
  const fallbackUsed =
    readOptionalBoolean(context.analysis?.fallbackUsed) === true ||
    readOptionalBoolean(context.analysisState?.fallbackVisible) === true;
  const hasConflict =
    readOptionalBoolean(context.finalDecision?.hasConflict) === true ||
    readOptionalBoolean(context.analysisState?.unsafe) === true ||
    normalizeStringArray(context.analysisState?.incompleteReasons).includes(
      'CONFLICT_HELD_BACK',
    );
  const incomplete =
    normalizeStringArray(context.analysisState?.incompleteReasons).length > 0 ||
    readOptionalBoolean(context.analysisState?.displayReady) === false;
  const stale =
    (node.freshnessDays !== null && node.freshnessDays > 30) ||
    node.sourceRefs.some(
      (item) => item.freshnessDays !== null && item.freshnessDays > 30,
    );
  const usesAnalysisOnly =
    node.sourceRefs.length > 0 &&
    node.sourceRefs.every((item) => item.sourceKind === 'prior_analysis');

  let next: EvidenceMapNode = {
    ...node,
  };

  if (fallbackUsed && usesAnalysisOnly && next.status === 'present') {
    next = {
      ...next,
      status: 'weak',
      confidence: clampConfidence(next.confidence - 0.18),
      missingReason: next.missingReason ?? 'fallback_based_evidence',
    };
  }

  if (!context.hasDeep && next.requiresDeep && next.status === 'present') {
    next = {
      ...next,
      status: 'weak',
      confidence: clampConfidence(next.confidence - 0.14),
      missingReason: next.missingReason ?? 'deep_evidence_not_complete',
    };
  }

  if (stale) {
    next = {
      ...next,
      confidence: clampConfidence(next.confidence - 0.12),
      ...(next.status === 'present' && next.requiresDeep
        ? {
            status: 'weak' as const,
            missingReason: next.missingReason ?? 'stale_evidence',
          }
        : {}),
    };
  }

  if (hasConflict && usesAnalysisOnly && (next.status === 'present' || next.status === 'weak')) {
    next = {
      ...next,
      status: 'conflict',
      confidence: clampConfidence(Math.min(next.confidence, 0.38)),
      conflictFlag: true,
      missingReason: next.missingReason ?? 'repository_level_conflict',
    };
  }

  if (
    incomplete &&
    next.requiresDeep &&
    next.status === 'present' &&
    !next.conflictFlag
  ) {
    next = {
      ...next,
      status: 'weak',
      confidence: clampConfidence(next.confidence - 0.12),
      missingReason: next.missingReason ?? 'incomplete_evidence_chain',
    };
  }

  return next;
}

function priorAnalysisRef(
  context: EvidenceContext,
  sourcePath: string,
  value: string,
): EvidenceMapSourceRef | null {
  if (!cleanText(value, 500)) {
    return null;
  }

  return buildSourceRef({
    context,
    sourceKind: 'prior_analysis',
    sourcePath,
    snippetKey: sourcePath,
    capturedAt: pickLatestDate([
      readOptionalString(context.analysis?.manualUpdatedAt),
      readOptionalString(context.analysis?.claudeReviewReviewedAt),
      readOptionalString(context.analysis?.analyzedAt),
    ]),
  });
}

function metadataRef(
  context: EvidenceContext,
  sourcePath: string,
  value: string,
): EvidenceMapSourceRef | null {
  if (!cleanText(value, 500)) {
    return null;
  }

  return buildSourceRef({
    context,
    sourceKind: 'metadata',
    sourcePath,
    snippetKey: sourcePath,
    capturedAt: pickLatestDate([
      readOptionalString(context.repository.updatedAtGithub),
      readOptionalString(context.repository.updatedAt),
    ]),
  });
}

function websiteRef(
  context: EvidenceContext,
  sourcePath: string,
  value: string,
): EvidenceMapSourceRef | null {
  if (!cleanText(value, 500)) {
    return null;
  }

  return buildSourceRef({
    context,
    sourceKind: 'website',
    sourcePath,
    snippetKey: sourcePath,
    capturedAt: pickLatestDate([
      readOptionalString(readObject(context.repository.content)?.fetchedAt),
      readOptionalString(context.repository.updatedAtGithub),
    ]),
  });
}

function commitsRef(
  context: EvidenceContext,
  sourcePath: string,
  value: string,
): EvidenceMapSourceRef | null {
  if (!cleanText(value, 500)) {
    return null;
  }

  return buildSourceRef({
    context,
    sourceKind: 'commits',
    sourcePath,
    snippetKey: sourcePath,
    capturedAt: pickLatestDate([
      readOptionalString(context.repository.lastCommitAt),
      readOptionalString(context.repository.pushedAtGithub),
    ]),
  });
}

function issuesRef(
  context: EvidenceContext,
  sourcePath: string,
  value: string,
): EvidenceMapSourceRef | null {
  if (!cleanText(value, 500)) {
    return null;
  }

  return buildSourceRef({
    context,
    sourceKind: 'issues',
    sourcePath,
    snippetKey: sourcePath,
    capturedAt: pickLatestDate([
      readOptionalString(context.repository.updatedAtGithub),
      readOptionalString(context.repository.pushedAtGithub),
    ]),
  });
}

function buildSourceRef(args: {
  context: EvidenceContext;
  sourceKind: EvidenceMapSourceKind;
  sourcePath: string;
  snippetKey: string;
  capturedAt: string | null;
}): EvidenceMapSourceRef {
  return {
    sourceKind: args.sourceKind,
    sourceId: args.context.repoId || null,
    sourcePath: args.sourcePath,
    snippetKey: args.snippetKey,
    lineRef: null,
    capturedAt: args.capturedAt,
    freshnessDays: toFreshnessDays(args.capturedAt, args.context.now),
  };
}

function compactRefs(
  refs: Array<EvidenceMapSourceRef | null>,
): EvidenceMapSourceRef[] {
  return refs.filter((item): item is EvidenceMapSourceRef => Boolean(item));
}

function average(values: Array<number | null>) {
  const normalized = values.filter(
    (value): value is number => typeof value === 'number',
  );
  if (!normalized.length) {
    return null;
  }
  return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
}

function roundRatio(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function toFreshnessDays(value: string | null, now: Date) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

function pickLatestDate(values: Array<string | null | undefined>) {
  const dates = values
    .map((value) => readOptionalString(value))
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());

  return dates[0]?.toISOString() ?? null;
}

function readObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function readOptionalString(value: unknown) {
  const normalized = readString(value);
  return normalized || null;
}

function readOptionalBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const numeric = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function readNumber(
  value: unknown,
  key: string,
): number | null {
  const object = readObject(value);
  if (!object) {
    return null;
  }
  return readOptionalNumber(object[key]);
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => readString(item))
    .filter(Boolean);
}

function cleanText(value: unknown, maxLength: number) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}
