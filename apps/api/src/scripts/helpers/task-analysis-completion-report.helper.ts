export type IncompleteReason =
  | 'NO_SNAPSHOT'
  | 'NO_INSIGHT'
  | 'NO_FINAL_DECISION'
  | 'NO_DEEP_ANALYSIS'
  | 'NO_CLAUDE_REVIEW'
  | 'SKIPPED_BY_GATE'
  | 'SKIPPED_BY_STRENGTH'
  | 'SKIPPED_BY_SELF_TUNING'
  | 'FALLBACK_ONLY'
  | 'CONFLICT_HELD_BACK'
  | 'QUEUED_NOT_FINISHED'
  | 'FAILED_DURING_ANALYSIS'
  | 'UNKNOWN';

export type RepoAnalysisStateInput = {
  hasSnapshot: boolean;
  hasInsight: boolean;
  hasFinalDecision: boolean;
  hasIdeaFit: boolean;
  hasIdeaExtract: boolean;
  hasCompleteness: boolean;
  hasClaudeReview: boolean;
  fallbackDirty: boolean;
  severeConflict: boolean;
  badOneliner: boolean;
  headlineUserConflict: boolean;
  headlineCategoryConflict: boolean;
  monetizationOverclaim: boolean;
  evidenceCoverageRate?: number | null;
  keyEvidenceMissingCount?: number;
  keyEvidenceWeakCount?: number;
  keyEvidenceConflictCount?: number;
  decisionConflictCount?: number;
  lowValue: boolean;
  appearedOnHomepage: boolean;
  appearedInDailySummary: boolean;
  appearedInTelegram: boolean;
  pendingAnalysisJobs: number;
  runningAnalysisJobs: number;
  failedAnalysisJobs: number;
  hasDeferredAnalysis: boolean;
  deepAnalysisStatus: 'NOT_STARTED' | 'COMPLETED' | 'SKIPPED_BY_GATE' | 'SKIPPED_BY_STRENGTH';
  deepAnalysisStatusReason: string | null;
  claudeEligible: boolean;
};

export type RepoAnalysisState = {
  deepDone: boolean;
  fullyAnalyzed: boolean;
  incomplete: boolean;
  trustedListReady: boolean;
  homepageUnsafe: boolean;
  primaryIncompleteReason: IncompleteReason | null;
  incompleteReasons: IncompleteReason[];
};

export type QueueHealthRow = {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  prioritized: number;
  failed: number;
  completed: number;
};

export type BottleneckInput = {
  queues: QueueHealthRow[];
  slowestLayer: string | null;
  mostCommonIncompleteReason: IncompleteReason | null;
  biggestBacklogQueue: string | null;
  deferredCount: number;
  failedAnalysisCount: number;
};

export type TopBottleneck = {
  title: string;
  evidence: string;
};

export type HistoricalRepairActionBacklogRow = {
  action: string;
  pendingJobs: number;
  runningJobs: number;
  repoCount: number;
};

export type ReportRepoPanelRow = {
  repoId: string;
  fullName: string;
  htmlUrl: string;
  priority: string | null;
  action: string | null;
  historicalRepairAction: string | null;
  historicalRepairBucket: string | null;
  historicalRepairPriorityScore: number | null;
  cleanupState: string | null;
  frontendDecisionState: string | null;
  pendingAnalysisJobs: number;
  runningAnalysisJobs: number;
  pendingSnapshotJobs: number;
  runningSnapshotJobs: number;
  pendingDeepJobs: number;
  runningDeepJobs: number;
  latestSnapshotJobState: string | null;
  latestDeepJobState: string | null;
  inflightActions: string[];
  inflightAction: string | null;
  hasSnapshot: boolean;
  hasInsight: boolean;
  hasFinalDecision: boolean;
  hasIdeaFit: boolean;
  hasIdeaExtract: boolean;
  hasCompleteness: boolean;
  fullyAnalyzed: boolean;
  incomplete: boolean;
  trustedListReady: boolean;
  primaryIncompleteReason: IncompleteReason | null;
  appearedOnHomepage: boolean;
  deepDone: boolean;
  needsDeepRepair: boolean;
  needsDecisionRecalc: boolean;
};

export function getTaskAnalysisDefinitions() {
  return {
    fullyAnalyzed:
      '满足 snapshot + insight + finalDecision + deep 三件套（idea_fit / idea_extract / completeness）且不是 fallback 污染的数据。Claude review 不是 fully_analyzed 的硬条件，但会单独统计是否该补复核。',
    trustedDisplayReady:
      '满足 snapshot + insight + finalDecision，且没有坏标题、严重冲突、fallback 强结论污染，可在列表页展示为“可信判断”。',
    fetched:
      'Repository 已经有 GitHub 内容抓取痕迹：content.fetchedAt 存在，或仓库状态已不再是 DISCOVERED。',
    notes: [
      'SUCCESS 在报告里展示为 COMPLETED，便于非工程视角理解。',
      'CANCELLED / STALLED / DEFERRED 不是数据库原生任务状态，本报告按 JobLog 结果与错误信息做派生统计。',
      'SKIPPED_BY_SELF_TUNING 当前没有稳定的逐 repo 持久化标记，报告默认保守统计为 0，并单独说明这一点。',
      'Claude review 是高价值或冲突样本的增强层，不是 every repo 的基础完成条件。',
    ],
  };
}

export function evaluateRepoAnalysisState(
  input: RepoAnalysisStateInput,
): RepoAnalysisState {
  const deepDone =
    input.hasIdeaFit && input.hasIdeaExtract && input.hasCompleteness;
  const hasEvidenceSignals =
    typeof input.evidenceCoverageRate === 'number' ||
    typeof input.keyEvidenceMissingCount === 'number' ||
    typeof input.keyEvidenceWeakCount === 'number' ||
    typeof input.keyEvidenceConflictCount === 'number' ||
    typeof input.decisionConflictCount === 'number';
  const keyEvidenceMissingCount = normalizeCount(input.keyEvidenceMissingCount);
  const keyEvidenceWeakCount = normalizeCount(input.keyEvidenceWeakCount);
  const keyEvidenceConflictCount = normalizeCount(input.keyEvidenceConflictCount);
  const decisionConflictCount = normalizeCount(input.decisionConflictCount);
  const evidenceCoverageRate = normalizeRatio(input.evidenceCoverageRate);
  const evidenceConflict =
    keyEvidenceConflictCount > 0 || decisionConflictCount > 0;
  const evidenceWeak = keyEvidenceWeakCount > 0;
  const evidenceMissing = keyEvidenceMissingCount > 0;
  const evidenceCoverageWeak =
    evidenceCoverageRate !== null && evidenceCoverageRate < 0.45;
  const fullyAnalyzed =
    input.hasSnapshot &&
    input.hasInsight &&
    input.hasFinalDecision &&
    deepDone &&
    !input.fallbackDirty &&
    !evidenceConflict &&
    !evidenceMissing &&
    !evidenceWeak &&
    !evidenceCoverageWeak;
  const incomplete = !fullyAnalyzed;

  const queueBlocked =
    input.pendingAnalysisJobs > 0 ||
    input.runningAnalysisJobs > 0 ||
    input.hasDeferredAnalysis;
  const incompleteReasons: IncompleteReason[] = [];

  if (!input.hasSnapshot) {
    incompleteReasons.push('NO_SNAPSHOT');
  } else if (!input.hasInsight) {
    incompleteReasons.push(queueBlocked ? 'QUEUED_NOT_FINISHED' : 'NO_INSIGHT');
  } else if (!input.hasFinalDecision) {
    incompleteReasons.push(queueBlocked ? 'QUEUED_NOT_FINISHED' : 'NO_FINAL_DECISION');
  } else {
    if (input.fallbackDirty) {
      incompleteReasons.push('FALLBACK_ONLY');
    }

    if (!deepDone) {
      if (input.failedAnalysisJobs > 0) {
        incompleteReasons.push('FAILED_DURING_ANALYSIS');
      }

      if (queueBlocked) {
        incompleteReasons.push('QUEUED_NOT_FINISHED');
      }

      if (input.deepAnalysisStatus === 'SKIPPED_BY_GATE') {
        incompleteReasons.push('SKIPPED_BY_GATE');
      } else if (input.deepAnalysisStatus === 'SKIPPED_BY_STRENGTH') {
        incompleteReasons.push('SKIPPED_BY_STRENGTH');
      } else if (input.severeConflict) {
        incompleteReasons.push('CONFLICT_HELD_BACK');
      } else {
        incompleteReasons.push('NO_DEEP_ANALYSIS');
      }
    }

  }

  const primaryIncompleteReason =
    incompleteReasons[0] ?? (incomplete ? 'UNKNOWN' : null);

  const trustedListReady =
    input.hasSnapshot &&
    input.hasInsight &&
    input.hasFinalDecision &&
    deepDone &&
    !input.fallbackDirty &&
    !input.severeConflict &&
    !(
      hasEvidenceSignals
        ? evidenceConflict || evidenceMissing || evidenceWeak || evidenceCoverageWeak
        : input.badOneliner ||
            input.headlineUserConflict ||
            input.headlineCategoryConflict ||
            input.monetizationOverclaim
    );

  const homepageUnsafe = Boolean(
    input.lowValue ||
      input.fallbackDirty ||
      input.severeConflict ||
      (hasEvidenceSignals
        ? evidenceConflict || evidenceMissing
        : input.badOneliner ||
            input.headlineUserConflict ||
            input.headlineCategoryConflict ||
            input.monetizationOverclaim) ||
      !trustedListReady ||
      (!deepDone &&
        (input.appearedOnHomepage ||
          input.appearedInDailySummary ||
          input.appearedInTelegram)),
  );

  return {
    deepDone,
    fullyAnalyzed,
    incomplete,
    trustedListReady,
    homepageUnsafe,
    primaryIncompleteReason,
    incompleteReasons: takeUnique(
      incompleteReasons.length ? incompleteReasons : incomplete ? ['UNKNOWN'] : [],
    ),
  };
}

export function ratio(value: number, total: number) {
  if (!total) {
    return 0;
  }

  return Number((value / total).toFixed(4));
}

export function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function classifyRuntimeTaskStatus(input: {
  pendingCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
}) {
  if (input.runningCount > 0) {
    return 'RUNNING';
  }

  if (input.pendingCount > 0) {
    return 'PENDING';
  }

  if (input.failedCount > 0 && input.completedCount === 0) {
    return 'FAILED';
  }

  if (input.completedCount > 0 && input.failedCount === 0) {
    return 'COMPLETED';
  }

  return 'MIXED';
}

export function buildTopBottlenecks(input: BottleneckInput): TopBottleneck[] {
  const rows: TopBottleneck[] = [];
  const biggestQueue = input.queues
    .slice()
    .sort(
      (left, right) =>
        right.waiting +
        right.delayed +
        right.prioritized -
        (left.waiting + left.delayed + left.prioritized),
    )[0];

  if (biggestQueue) {
    rows.push({
      title: '队列积压最大',
      evidence: `${biggestQueue.queue} waiting=${biggestQueue.waiting}, delayed=${biggestQueue.delayed}, prioritized=${biggestQueue.prioritized}`,
    });
  } else if (input.biggestBacklogQueue) {
    rows.push({
      title: '队列积压最大',
      evidence: input.biggestBacklogQueue,
    });
  }

  if (input.slowestLayer) {
    rows.push({
      title: '最慢分析层',
      evidence: input.slowestLayer,
    });
  }

  if (input.mostCommonIncompleteReason) {
    rows.push({
      title: '最常见未完成原因',
      evidence: input.mostCommonIncompleteReason,
    });
  }

  if (input.deferredCount > 0) {
    rows.push({
      title: '延后执行较多',
      evidence: `当前累计 deferred=${input.deferredCount}，说明 deep 或 idea_extract 会因压力或队列水位被推迟。`,
    });
  }

  if (input.failedAnalysisCount > 0) {
    rows.push({
      title: '分析层失败不可忽略',
      evidence: `analysis.snapshot / analysis.run_single 失败任务合计=${input.failedAnalysisCount}`,
    });
  }

  return rows.slice(0, 3);
}

export function pickRandomSamples<T>(items: T[], limit: number) {
  if (items.length <= limit) {
    return [...items];
  }

  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = pool[index];
    pool[index] = pool[swapIndex] as T;
    pool[swapIndex] = current as T;
  }

  return pool.slice(0, limit);
}

export function buildHumanSummary(report: {
  generatedAt: string;
  taskSummary?: {
    totalTasks: number;
    rootTasks: number;
    childTasks: number;
    pendingCount: number;
    runningCount: number;
    completedCount: number;
    failedCount: number;
  };
  repoSummary?: {
    totalRepos: number;
    fullyAnalyzedRepos: number;
    incompleteRepos: number;
    fallbackRepos: number;
    severeConflictRepos: number;
  };
  analysisGapSummary?: {
    mostCommonIncompleteReason: string | null;
    snapshotOnlyCount: number;
    finalDecisionButNoDeepCount: number;
    claudeEligibleButNotReviewedCount: number;
  };
  queueSummary?: {
    biggestBacklogQueue: string | null;
  };
  exposureSummary?: {
    homepageFeaturedRepos: number;
    homepageFeaturedIncomplete: number;
    moneyPriorityHighButIncomplete: number;
  };
  bottleneckSummary?: {
    top3Bottlenecks: TopBottleneck[];
  };
  backlogPanel?: {
    analysisJobs?: {
      pendingJobs: number;
      runningJobs: number;
      queuedOrRunningRepos: number;
    };
  };
  incompletePanel?: {
    totalIncompleteRepos: number;
    queuedOrRunningIncompleteRepos: number;
    countsByPrimaryReason?: Record<string, number>;
  };
  readyToRankPanel?: {
    strictReadyRepos: number;
    strictReadyCoverage: number;
    highPriorityReadySummary?: {
      total: number;
      ready: number;
      coverage: number;
    };
  };
}) {
  const lines = [`GitDian 任务与分析完成度报告`, `生成时间：${report.generatedAt}`];

  if (report.taskSummary) {
    lines.push(
      '',
      `当前总任务数：${formatInteger(report.taskSummary.totalTasks)}`,
      `其中 root jobs：${formatInteger(report.taskSummary.rootTasks)}`,
      `child jobs：${formatInteger(report.taskSummary.childTasks)}`,
      `任务状态分布：PENDING ${formatInteger(report.taskSummary.pendingCount)} / RUNNING ${formatInteger(report.taskSummary.runningCount)} / COMPLETED ${formatInteger(report.taskSummary.completedCount)} / FAILED ${formatInteger(report.taskSummary.failedCount)}`,
    );
  }

  if (report.repoSummary) {
    lines.push(
      '',
      `当前总 repo 数：${formatInteger(report.repoSummary.totalRepos)}`,
      `已完整分析 repo：${formatInteger(report.repoSummary.fullyAnalyzedRepos)}`,
      `仍未完整分析 repo：${formatInteger(report.repoSummary.incompleteRepos)}`,
      `fallback repo：${formatInteger(report.repoSummary.fallbackRepos)}`,
      `严重冲突 repo：${formatInteger(report.repoSummary.severeConflictRepos)}`,
    );
  }

  if (report.analysisGapSummary) {
    lines.push(
      '',
      `最常见未完成原因：${report.analysisGapSummary.mostCommonIncompleteReason ?? 'UNKNOWN'}`,
      `只跑到 snapshot 的 repo：${formatInteger(report.analysisGapSummary.snapshotOnlyCount)}`,
      `已有 finalDecision 但没 deep 的 repo：${formatInteger(report.analysisGapSummary.finalDecisionButNoDeepCount)}`,
      `该进 Claude 但还没复核的 repo：${formatInteger(report.analysisGapSummary.claudeEligibleButNotReviewedCount)}`,
    );
  }

  if (report.queueSummary || report.exposureSummary) {
    lines.push('');
  }

  if (report.queueSummary?.biggestBacklogQueue) {
    lines.push(`当前最大 backlog 队列：${report.queueSummary.biggestBacklogQueue}`);
  }

  if (report.exposureSummary) {
    lines.push(
      `首页前 100 个候选 repo：${formatInteger(report.exposureSummary.homepageFeaturedRepos)}，其中未完整分析：${formatInteger(report.exposureSummary.homepageFeaturedIncomplete)}`,
      `高 moneyPriority 但分析未完成：${formatInteger(report.exposureSummary.moneyPriorityHighButIncomplete)}`,
    );
  }

  if (report.backlogPanel?.analysisJobs) {
    lines.push(
      '',
      `当前分析 backlog：queued/running repo ${formatInteger(report.backlogPanel.analysisJobs.queuedOrRunningRepos)}，pending jobs ${formatInteger(report.backlogPanel.analysisJobs.pendingJobs)}，running jobs ${formatInteger(report.backlogPanel.analysisJobs.runningJobs)}`,
    );
  }

  if (report.incompletePanel) {
    const mostCommonIncompleteReason =
      Object.entries(report.incompletePanel.countsByPrimaryReason ?? {}).sort(
        (left, right) => right[1] - left[1],
      )[0]?.[0] ?? 'UNKNOWN';
    lines.push(
      '',
      `当前 incomplete backlog：${formatInteger(report.incompletePanel.totalIncompleteRepos)}，其中已在队列/运行中 ${formatInteger(report.incompletePanel.queuedOrRunningIncompleteRepos)}，最常见原因 ${mostCommonIncompleteReason}`,
    );
  }

  if (report.readyToRankPanel) {
    lines.push(
      '',
      `ready-to-rank：${formatInteger(report.readyToRankPanel.strictReadyRepos)} / ${formatInteger(report.repoSummary?.totalRepos ?? 0)}（coverage ${(report.readyToRankPanel.strictReadyCoverage * 100).toFixed(2)}%）`,
    );
    if (report.readyToRankPanel.highPriorityReadySummary) {
      lines.push(
        `高优先级 ready：${formatInteger(report.readyToRankPanel.highPriorityReadySummary.ready)} / ${formatInteger(report.readyToRankPanel.highPriorityReadySummary.total)}（coverage ${(report.readyToRankPanel.highPriorityReadySummary.coverage * 100).toFixed(2)}%）`,
      );
    }
  }

  if (report.bottleneckSummary?.top3Bottlenecks?.length) {
    lines.push('', 'Top 3 瓶颈：');
    for (const item of report.bottleneckSummary.top3Bottlenecks) {
      lines.push(`- ${item.title}：${item.evidence}`);
    }
  }

  return lines.join('\n');
}

export function buildMarkdownReport(report: Record<string, unknown>) {
  return `# GitDian 任务与分析完成度报告\n\n\`\`\`json\n${JSON.stringify(
    report,
    null,
    2,
  )}\n\`\`\`\n`;
}

export function buildAnalysisBacklogPanel(args: {
  snapshotQueue?: QueueHealthRow | null;
  deepQueue?: QueueHealthRow | null;
  actionBreakdown: HistoricalRepairActionBacklogRow[];
  repos: ReportRepoPanelRow[];
  limit: number;
}) {
  const inflightRepos = args.repos.filter(
    (item) => item.pendingAnalysisJobs > 0 || item.runningAnalysisJobs > 0,
  );
  const pendingJobs = inflightRepos.reduce(
    (sum, item) => sum + item.pendingAnalysisJobs,
    0,
  );
  const runningJobs = inflightRepos.reduce(
    (sum, item) => sum + item.runningAnalysisJobs,
    0,
  );
  const pendingSnapshotJobs = inflightRepos.reduce(
    (sum, item) => sum + item.pendingSnapshotJobs,
    0,
  );
  const runningSnapshotJobs = inflightRepos.reduce(
    (sum, item) => sum + item.runningSnapshotJobs,
    0,
  );
  const pendingDeepJobs = inflightRepos.reduce(
    (sum, item) => sum + item.pendingDeepJobs,
    0,
  );
  const runningDeepJobs = inflightRepos.reduce(
    (sum, item) => sum + item.runningDeepJobs,
    0,
  );

  const topInflightRepos = inflightRepos
    .slice()
    .sort(comparePanelRows)
    .slice(0, Math.max(1, args.limit))
    .map((item) => ({
      repoId: item.repoId,
      fullName: item.fullName,
      historicalRepairBucket: item.historicalRepairBucket,
      historicalRepairPriorityScore: item.historicalRepairPriorityScore,
      cleanupState: item.cleanupState,
      frontendDecisionState: item.frontendDecisionState,
      inflightAction: item.inflightAction,
      inflightActions: item.inflightActions,
      pendingAnalysisJobs: item.pendingAnalysisJobs,
      runningAnalysisJobs: item.runningAnalysisJobs,
      pendingSnapshotJobs: item.pendingSnapshotJobs,
      runningSnapshotJobs: item.runningSnapshotJobs,
      pendingDeepJobs: item.pendingDeepJobs,
      runningDeepJobs: item.runningDeepJobs,
      primaryIncompleteReason: item.primaryIncompleteReason,
    }));

  return {
    analysisJobs: {
      pendingJobs,
      runningJobs,
      queuedOrRunningRepos: inflightRepos.length,
      snapshotJobs: {
        pendingJobs: pendingSnapshotJobs,
        runningJobs: runningSnapshotJobs,
      },
      deepJobs: {
        pendingJobs: pendingDeepJobs,
        runningJobs: runningDeepJobs,
      },
    },
    runtimeQueues: {
      snapshotQueue: args.snapshotQueue ?? null,
      deepQueue: args.deepQueue ?? null,
    },
    historicalRepairActionBreakdown: args.actionBreakdown
      .slice()
      .sort(
        (left, right) =>
          right.pendingJobs +
          right.runningJobs -
          (left.pendingJobs + left.runningJobs),
      ),
    topInflightRepos,
  };
}

export function buildIncompletePanel(args: {
  repos: ReportRepoPanelRow[];
  limit: number;
}) {
  const incompleteRepos = args.repos.filter((item) => item.incomplete);
  const countsByPrimaryReason: Record<string, number> = {};

  for (const item of incompleteRepos) {
    const key = item.primaryIncompleteReason ?? 'UNKNOWN';
    countsByPrimaryReason[key] = (countsByPrimaryReason[key] ?? 0) + 1;
  }

  const highPriorityIncomplete = incompleteRepos
    .slice()
    .sort(comparePanelRows)
    .slice(0, Math.max(1, args.limit))
    .map((item) => ({
      repoId: item.repoId,
      fullName: item.fullName,
      historicalRepairBucket: item.historicalRepairBucket,
      historicalRepairPriorityScore: item.historicalRepairPriorityScore,
      cleanupState: item.cleanupState,
      frontendDecisionState: item.frontendDecisionState,
      priority: item.priority,
      action: item.action,
      historicalRepairAction: item.historicalRepairAction,
      primaryIncompleteReason: item.primaryIncompleteReason,
      isQueuedOrRunning:
        item.pendingAnalysisJobs > 0 || item.runningAnalysisJobs > 0,
      inflightAction: item.inflightAction,
      hasSnapshot: item.hasSnapshot,
      hasInsight: item.hasInsight,
      hasFinalDecision: item.hasFinalDecision,
      hasCompleteness: item.hasCompleteness,
      hasIdeaFit: item.hasIdeaFit,
      hasIdeaExtract: item.hasIdeaExtract,
      needsDeepRepair: item.needsDeepRepair,
      needsDecisionRecalc: item.needsDecisionRecalc,
    }));

  return {
    totalIncompleteRepos: incompleteRepos.length,
    queuedOrRunningIncompleteRepos: incompleteRepos.filter(
      (item) => item.pendingAnalysisJobs > 0 || item.runningAnalysisJobs > 0,
    ).length,
    countsByPrimaryReason,
    operationalBreakdown: {
      noSnapshot: incompleteRepos.filter(
        (item) => item.primaryIncompleteReason === 'NO_SNAPSHOT',
      ).length,
      noInsight: incompleteRepos.filter(
        (item) => item.primaryIncompleteReason === 'NO_INSIGHT',
      ).length,
      noFinalDecision: incompleteRepos.filter(
        (item) => item.primaryIncompleteReason === 'NO_FINAL_DECISION',
      ).length,
      noDeepAnalysis: incompleteRepos.filter(
        (item) => item.primaryIncompleteReason === 'NO_DEEP_ANALYSIS',
      ).length,
      queuedNotFinished: incompleteRepos.filter(
        (item) => item.primaryIncompleteReason === 'QUEUED_NOT_FINISHED',
      ).length,
      failedDuringAnalysis: incompleteRepos.filter(
        (item) => item.primaryIncompleteReason === 'FAILED_DURING_ANALYSIS',
      ).length,
    },
    highPriorityIncomplete,
  };
}

export function buildReadyToRankPanel(args: {
  repos: ReportRepoPanelRow[];
  featuredRepoIds: string[];
  limit: number;
}) {
  const featuredRepoIdSet = new Set(args.featuredRepoIds);
  const strictReadyRepos = args.repos.filter((item) => isStrictReadyToRank(item));
  const highPriorityRepos = args.repos.filter(
    (item) => item.priority === 'P0' || item.priority === 'P1',
  );
  const highPriorityReady = highPriorityRepos.filter((item) =>
    isStrictReadyToRank(item),
  );
  const featuredRepos = args.repos.filter((item) =>
    featuredRepoIdSet.has(item.repoId),
  );
  const featuredReady = featuredRepos.filter((item) => isStrictReadyToRank(item));

  return {
    strictReadyRepos: strictReadyRepos.length,
    strictReadyCoverage: ratio(strictReadyRepos.length, args.repos.length),
    strictReadyCriteria: {
      requiresSnapshot: true,
      requiresInsight: true,
      requiresFinalDecision: true,
      requiresCompleteness: true,
      requiresIdeaFit: true,
      requiresIdeaExtract: true,
      requiresFullyAnalyzed: true,
      requiresTrustedListReady: true,
      excludesArchiveAndPurgeReady: true,
    },
    highPriorityReadySummary: {
      total: highPriorityRepos.length,
      ready: highPriorityReady.length,
      incomplete: highPriorityRepos.filter((item) => item.incomplete).length,
      coverage: ratio(highPriorityReady.length, highPriorityRepos.length),
    },
    homepageTopReadySummary: {
      total: featuredRepos.length,
      ready: featuredReady.length,
      incomplete: featuredRepos.filter((item) => item.incomplete).length,
      coverage: ratio(featuredReady.length, featuredRepos.length),
    },
    topReadyToRank: strictReadyRepos
      .slice()
      .sort((left, right) => {
        const featuredDelta =
          Number(featuredRepoIdSet.has(right.repoId)) -
          Number(featuredRepoIdSet.has(left.repoId));
        if (featuredDelta !== 0) {
          return featuredDelta;
        }
        return comparePanelRows(left, right);
      })
      .slice(0, Math.max(1, args.limit))
      .map((item) => ({
        repoId: item.repoId,
        fullName: item.fullName,
        historicalRepairBucket: item.historicalRepairBucket,
        historicalRepairPriorityScore: item.historicalRepairPriorityScore,
        priority: item.priority,
        cleanupState: item.cleanupState,
        frontendDecisionState: item.frontendDecisionState,
        appearedOnHomepage: item.appearedOnHomepage,
      })),
  };
}

function takeUnique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function normalizeCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeRatio(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function isStrictReadyToRank(item: ReportRepoPanelRow) {
  const cleanupState = item.cleanupState ?? 'active';
  return (
    cleanupState !== 'archive' &&
    cleanupState !== 'purge_ready' &&
    item.hasSnapshot &&
    item.hasInsight &&
    item.hasFinalDecision &&
    item.hasCompleteness &&
    item.hasIdeaFit &&
    item.hasIdeaExtract &&
    item.fullyAnalyzed &&
    item.trustedListReady
  );
}

function comparePanelRows(left: ReportRepoPanelRow, right: ReportRepoPanelRow) {
  const cleanupDelta =
    cleanupPriority(right.cleanupState) - cleanupPriority(left.cleanupState);
  if (cleanupDelta !== 0) {
    return cleanupDelta;
  }

  const notInflightLeft =
    left.pendingAnalysisJobs === 0 && left.runningAnalysisJobs === 0;
  const notInflightRight =
    right.pendingAnalysisJobs === 0 && right.runningAnalysisJobs === 0;
  const inflightOrderDelta = Number(notInflightRight) - Number(notInflightLeft);
  if (inflightOrderDelta !== 0) {
    return inflightOrderDelta;
  }

  const scoreDelta =
    (right.historicalRepairPriorityScore ?? Number.NEGATIVE_INFINITY) -
    (left.historicalRepairPriorityScore ?? Number.NEGATIVE_INFINITY);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const homepageDelta =
    Number(right.appearedOnHomepage) - Number(left.appearedOnHomepage);
  if (homepageDelta !== 0) {
    return homepageDelta;
  }

  return left.fullName.localeCompare(right.fullName, 'zh-CN');
}

function cleanupPriority(value: string | null) {
  if (value === 'active' || value === null) {
    return 3;
  }
  if (value === 'freeze') {
    return 2;
  }
  if (value === 'archive') {
    return 1;
  }
  if (value === 'purge_ready') {
    return 0;
  }
  return 1;
}

function priorityRank(value: string | null) {
  if (value === 'P0') {
    return 4;
  }
  if (value === 'P1') {
    return 3;
  }
  if (value === 'P2') {
    return 2;
  }
  if (value === 'P3') {
    return 1;
  }
  return 0;
}
