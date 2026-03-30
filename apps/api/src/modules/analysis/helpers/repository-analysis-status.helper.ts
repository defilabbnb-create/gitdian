import {
  buildEvidenceGapTaxonomy,
  formatEvidenceGapLabels,
  normalizeEvidenceGapSeverity,
  normalizeEvidenceGapTaxonomy,
  type KeyEvidenceGapSeverity,
  type KeyEvidenceGapTaxonomy,
} from './evidence-gap-taxonomy.helper';

export type RepositoryDerivedAnalysisStatus =
  | 'NOT_READY'
  | 'SNAPSHOT_ONLY'
  | 'INSIGHT_READY'
  | 'DISPLAY_READY'
  | 'DEEP_PENDING'
  | 'DEEP_DONE'
  | 'REVIEW_PENDING'
  | 'REVIEW_DONE'
  | 'SKIPPED_BY_GATE'
  | 'FAILED';

export type RepositoryDisplayStatus =
  | 'HIDDEN'
  | 'BASIC_READY'
  | 'TRUSTED_READY'
  | 'HIGH_CONFIDENCE_READY'
  | 'UNSAFE';

export type RepositoryIncompleteReason =
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

export type RepositoryLightAnalysis = {
  targetUsers: string;
  monetization: string;
  whyItMatters: string;
  nextStep: string;
  caution: string | null;
  source: 'snapshot' | 'insight' | 'readme' | 'decision_fallback';
};

type EvidenceDimension =
  | 'problem'
  | 'user'
  | 'distribution'
  | 'monetization'
  | 'execution'
  | 'market'
  | 'technical_maturity';

export type RepositoryDerivedAnalysisState = {
  analysisStatus: RepositoryDerivedAnalysisStatus;
  displayStatus: RepositoryDisplayStatus;
  frontendDecisionState: 'trusted' | 'provisional' | 'degraded';
  analysisStatusReason: string | null;
  displayStatusReason: string | null;
  incompleteReason: RepositoryIncompleteReason | null;
  incompleteReasons: RepositoryIncompleteReason[];
  displayReady: boolean;
  trustedDisplayReady: boolean;
  highConfidenceReady: boolean;
  lightDeepReady: boolean;
  fullDeepReady: boolean;
  deepReady: boolean;
  reviewEligible: boolean;
  reviewReady: boolean;
  fullyAnalyzed: boolean;
  fallbackVisible: boolean;
  unsafe: boolean;
  historicalRepairGuard?: {
    bucket: string;
    action: string;
    cleanupState?: string;
    reason: string;
    priorityScore: number;
    frontendDecisionState: 'trusted' | 'provisional' | 'degraded';
  } | null;
  lightAnalysis: RepositoryLightAnalysis | null;
};

type AnalysisStatusInput = {
  source?: 'manual' | 'claude' | 'local' | 'fallback' | null;
  verdict?: 'GOOD' | 'OK' | 'BAD' | null;
  action?: 'BUILD' | 'CLONE' | 'IGNORE' | null;
  moneyPriority?: 'P0' | 'P1' | 'P2' | 'P3' | null;
  oneLinerStrength?: 'STRONG' | 'MEDIUM' | 'WEAK' | null;
  projectType?: 'product' | 'tool' | 'model' | 'infra' | 'demo' | null;
  hasSnapshot?: boolean;
  hasInsight?: boolean;
  hasFinalDecision?: boolean;
  hasIdeaFit?: boolean;
  hasIdeaExtract?: boolean;
  hasCompleteness?: boolean;
  hasClaudeReview?: boolean;
  hasConflict?: boolean;
  needsRecheck?: boolean;
  fallbackUsed?: boolean;
  hasRealUser?: boolean;
  hasClearUseCase?: boolean;
  isDirectlyMonetizable?: boolean;
  targetUsersLabel?: string | null;
  monetizationLabel?: string | null;
  reasonZh?: string | null;
  evidenceSummaryZh?: string | null;
  snapshotReason?: string | null;
  readmeSummary?: string | null;
  evidenceCoverageRate?: number | null;
  evidenceWeakCount?: number | null;
  evidenceConflictCount?: number | null;
  keyEvidenceMissingCount?: number | null;
  keyEvidenceWeakCount?: number | null;
  keyEvidenceConflictCount?: number | null;
  evidenceMissingDimensions?: EvidenceDimension[] | null;
  evidenceWeakDimensions?: EvidenceDimension[] | null;
  evidenceConflictDimensions?: EvidenceDimension[] | null;
  supportingEvidenceDimensions?: EvidenceDimension[] | null;
  deepRepairDimensions?: EvidenceDimension[] | null;
  decisionConflictDimensions?: EvidenceDimension[] | null;
  keyEvidenceGaps?: KeyEvidenceGapTaxonomy[] | null;
  keyEvidenceGapSeverity?: KeyEvidenceGapSeverity | null;
  conflictDrivenGaps?: KeyEvidenceGapTaxonomy[] | null;
  missingDrivenGaps?: KeyEvidenceGapTaxonomy[] | null;
  weakDrivenGaps?: KeyEvidenceGapTaxonomy[] | null;
  decisionRecalcGaps?: KeyEvidenceGapTaxonomy[] | null;
  deepRepairGaps?: KeyEvidenceGapTaxonomy[] | null;
  evidenceRepairGaps?: KeyEvidenceGapTaxonomy[] | null;
  trustedBlockingGaps?: KeyEvidenceGapTaxonomy[] | null;
  snapshotPromising?: boolean | null;
  snapshotNextAction?: string | null;
  deepAnalysisStatus?:
    | 'NOT_STARTED'
    | 'PENDING'
    | 'RUNNING'
    | 'COMPLETED'
    | 'SKIPPED_BY_GATE'
    | 'SKIPPED_BY_STRENGTH'
    | 'FAILED'
    | null;
  deepAnalysisStatusReason?: string | null;
};

const UNCLEAR_USER_PATTERN =
  /不够清楚|待确认|无法识别用户|无法确定目标用户|目标用户仍不清晰|还需要继续确认/;

const UNCLEAR_MONETIZATION_PATTERN =
  /收费路径还不够清楚|先确认真实用户和场景|先验证价值|暂时还不明确|更适合先验证/;

export function deriveRepositoryAnalysisState(
  input: AnalysisStatusInput,
): RepositoryDerivedAnalysisState {
  const hasSnapshot = input.hasSnapshot === true;
  const hasInsight = input.hasInsight === true;
  const hasFinalDecision = input.hasFinalDecision === true;
  const hasIdeaFit = input.hasIdeaFit === true;
  const hasIdeaExtract = input.hasIdeaExtract === true;
  const hasCompleteness = input.hasCompleteness === true;
  const hasClaudeReview = input.hasClaudeReview === true;
  const hasConflict = input.hasConflict === true;
  const needsRecheck = input.needsRecheck === true;
  const fallbackVisible =
    input.source === 'fallback' || input.fallbackUsed === true;
  const fullDeepReady = hasIdeaFit && hasIdeaExtract && hasCompleteness;
  const lightDeepReady = hasInsight || hasSnapshot || hasFinalDecision;
  const evidenceCoverageRate = normalizeEvidenceCoverageRate(
    input.evidenceCoverageRate,
  );
  const keyEvidenceMissingCount = normalizeEvidenceCount(
    input.keyEvidenceMissingCount,
  );
  const keyEvidenceWeakCount = normalizeEvidenceCount(input.keyEvidenceWeakCount);
  const keyEvidenceConflictCount = normalizeEvidenceCount(
    input.keyEvidenceConflictCount,
  );
  const evidenceWeakCount = normalizeEvidenceCount(input.evidenceWeakCount);
  const evidenceConflictCount = normalizeEvidenceCount(
    input.evidenceConflictCount,
  );
  const evidenceMissingDimensions = normalizeEvidenceDimensions(
    input.evidenceMissingDimensions,
  );
  const evidenceWeakDimensions = normalizeEvidenceDimensions(
    input.evidenceWeakDimensions,
  );
  const evidenceConflictDimensions = normalizeEvidenceDimensions(
    input.evidenceConflictDimensions,
  );
  const supportingEvidenceDimensions = normalizeEvidenceDimensions(
    input.supportingEvidenceDimensions,
  );
  const gapTaxonomy = buildEvidenceGapTaxonomy({
    missingDimensions: evidenceMissingDimensions,
    weakDimensions: evidenceWeakDimensions,
    conflictDimensions: evidenceConflictDimensions,
  });
  const keyEvidenceGaps = normalizeEvidenceGapTaxonomy(input.keyEvidenceGaps);
  const conflictDrivenGaps = normalizeEvidenceGapTaxonomy(
    input.conflictDrivenGaps,
  );
  const missingDrivenGaps = normalizeEvidenceGapTaxonomy(
    input.missingDrivenGaps,
  );
  const weakDrivenGaps = normalizeEvidenceGapTaxonomy(input.weakDrivenGaps);
  const decisionRecalcGaps = normalizeEvidenceGapTaxonomy(
    input.decisionRecalcGaps,
  );
  const deepRepairGaps = normalizeEvidenceGapTaxonomy(input.deepRepairGaps);
  const evidenceRepairGaps = normalizeEvidenceGapTaxonomy(
    input.evidenceRepairGaps,
  );
  const trustedBlockingGaps = normalizeEvidenceGapTaxonomy(
    input.trustedBlockingGaps,
  );
  const resolvedConflictDrivenGaps = conflictDrivenGaps.length
    ? conflictDrivenGaps
    : gapTaxonomy.conflictDrivenGaps;
  const resolvedMissingDrivenGaps = missingDrivenGaps.length
    ? missingDrivenGaps
    : gapTaxonomy.missingDrivenGaps;
  const resolvedWeakDrivenGaps = weakDrivenGaps.length
    ? weakDrivenGaps
    : gapTaxonomy.weakDrivenGaps;
  const resolvedDecisionRecalcGaps = decisionRecalcGaps.length
    ? decisionRecalcGaps
    : gapTaxonomy.decisionRecalcGaps;
  const resolvedDeepRepairGaps = deepRepairGaps.length
    ? deepRepairGaps
    : gapTaxonomy.deepRepairGaps;
  const resolvedEvidenceRepairGaps = evidenceRepairGaps.length
    ? evidenceRepairGaps
    : gapTaxonomy.evidenceRepairGaps;
  const resolvedTrustedBlockingGaps = trustedBlockingGaps.length
    ? trustedBlockingGaps
    : gapTaxonomy.trustedBlockingGaps;
  const keyEvidenceGapSeverity =
    normalizeEvidenceGapSeverity(input.keyEvidenceGapSeverity) !== 'NONE'
      ? normalizeEvidenceGapSeverity(input.keyEvidenceGapSeverity)
      : gapTaxonomy.keyEvidenceGapSeverity;
  const reviewEligible = Boolean(
    hasConflict ||
      needsRecheck ||
      input.moneyPriority === 'P0' ||
      input.moneyPriority === 'P1',
  );
  const reviewReady = !reviewEligible || hasClaudeReview;

  const severeSignalMismatch = Boolean(
    (input.action === 'BUILD' &&
      (input.projectType === 'infra' || input.projectType === 'model')) ||
      (input.action === 'BUILD' && input.hasRealUser === false) ||
      (input.action === 'BUILD' && input.hasClearUseCase === false) ||
      (input.action === 'BUILD' && input.snapshotPromising === false),
  );
  const evidenceDecisionConflict = Boolean(
    keyEvidenceConflictCount > 0 ||
      evidenceConflictCount > 0 ||
      resolvedDecisionRecalcGaps.length > 0 ||
      resolvedConflictDrivenGaps.length > 0,
  );
  const keyEvidenceMissing = Boolean(
    keyEvidenceMissingCount > 0 || resolvedMissingDrivenGaps.length > 0,
  );
  const keyEvidenceWeak = Boolean(
    keyEvidenceWeakCount > 0 ||
      evidenceWeakCount > 0 ||
      resolvedWeakDrivenGaps.length > 0,
  );
  const evidenceCoverageWeak =
    typeof evidenceCoverageRate === 'number' && evidenceCoverageRate < 0.45;
  const unsafe =
    fallbackVisible ||
    hasConflict ||
    needsRecheck ||
    evidenceDecisionConflict ||
    severeSignalMismatch ||
    input.deepAnalysisStatus === 'SKIPPED_BY_GATE' ||
    input.deepAnalysisStatus === 'SKIPPED_BY_STRENGTH';

  const displayReady = hasSnapshot || hasInsight || hasFinalDecision;
  const trustedDisplayReady =
    hasSnapshot &&
    hasInsight &&
    hasFinalDecision &&
    fullDeepReady &&
    !unsafe &&
    !evidenceCoverageWeak &&
    resolvedTrustedBlockingGaps.length === 0 &&
    keyEvidenceGapSeverity !== 'HIGH' &&
    keyEvidenceGapSeverity !== 'CRITICAL';
  const highConfidenceReady =
    trustedDisplayReady && reviewReady && !keyEvidenceWeak;
  const fullyAnalyzed = highConfidenceReady;

  const incompleteReasons = deriveIncompleteReasons({
    ...input,
    hasSnapshot,
    hasInsight,
    hasFinalDecision,
    fullDeepReady,
    reviewEligible,
    hasClaudeReview,
    fallbackVisible,
    hasConflict,
    needsRecheck,
  });
  const incompleteReason = incompleteReasons[0] ?? null;

  const analysisStatus =
    resolveAnalysisStatus({
      ...input,
      hasSnapshot,
      hasInsight,
      hasFinalDecision,
      fullDeepReady,
      reviewEligible,
      hasClaudeReview,
      fallbackVisible,
    });
  const displayStatus = resolveDisplayStatus({
    displayReady,
    trustedDisplayReady,
    highConfidenceReady,
    unsafe,
  });

  return {
    analysisStatus,
    displayStatus,
    frontendDecisionState: resolveFrontendDecisionState(displayStatus),
    analysisStatusReason: resolveAnalysisStatusReason(input, incompleteReason),
    displayStatusReason: resolveDisplayStatusReason(displayStatus, incompleteReason),
    incompleteReason,
    incompleteReasons,
    displayReady,
    trustedDisplayReady,
    highConfidenceReady,
    lightDeepReady,
    fullDeepReady,
    deepReady: fullDeepReady,
    reviewEligible,
    reviewReady,
    fullyAnalyzed,
    fallbackVisible,
    unsafe,
    historicalRepairGuard: null,
    lightAnalysis: displayReady
      ? buildRepositoryLightAnalysis(input, {
          displayStatus,
          trustedDisplayReady,
          fullDeepReady,
          fallbackVisible,
          evidenceCoverageWeak,
          keyEvidenceMissing,
          keyEvidenceWeak,
          evidenceDecisionConflict,
          deepRepairGaps: resolvedDeepRepairGaps,
          decisionRecalcGaps: resolvedDecisionRecalcGaps,
          evidenceRepairGaps: resolvedEvidenceRepairGaps,
          evidenceMissingDimensions,
          supportingEvidenceDimensions,
        })
      : null,
  };
}

function resolveFrontendDecisionState(
  displayStatus: RepositoryDisplayStatus,
): 'trusted' | 'provisional' | 'degraded' {
  switch (displayStatus) {
    case 'HIGH_CONFIDENCE_READY':
    case 'TRUSTED_READY':
      return 'trusted';
    case 'BASIC_READY':
      return 'provisional';
    case 'UNSAFE':
    case 'HIDDEN':
    default:
      return 'degraded';
  }
}

function resolveAnalysisStatus(
  input: AnalysisStatusInput & {
    hasSnapshot: boolean;
    hasInsight: boolean;
    hasFinalDecision: boolean;
    fullDeepReady: boolean;
    reviewEligible: boolean;
    hasClaudeReview: boolean;
    fallbackVisible: boolean;
  },
): RepositoryDerivedAnalysisStatus {
  if (input.deepAnalysisStatus === 'FAILED') {
    return 'FAILED';
  }

  if (!input.hasSnapshot && !input.hasInsight && !input.hasFinalDecision) {
    return 'NOT_READY';
  }

  if (input.hasSnapshot && !input.hasInsight) {
    return 'SNAPSHOT_ONLY';
  }

  if (input.hasInsight && !input.hasFinalDecision) {
    return 'INSIGHT_READY';
  }

  if (input.fullDeepReady && input.reviewEligible && !input.hasClaudeReview) {
    return 'REVIEW_PENDING';
  }

  if (input.fullDeepReady && input.hasClaudeReview) {
    return 'REVIEW_DONE';
  }

  if (input.fullDeepReady) {
    return 'DEEP_DONE';
  }

  if (
    input.deepAnalysisStatus === 'PENDING' ||
    input.deepAnalysisStatus === 'RUNNING'
  ) {
    return 'DEEP_PENDING';
  }

  if (
    input.deepAnalysisStatus === 'SKIPPED_BY_GATE' ||
    input.deepAnalysisStatus === 'SKIPPED_BY_STRENGTH'
  ) {
    return 'SKIPPED_BY_GATE';
  }

  if (input.hasFinalDecision) {
    return 'DISPLAY_READY';
  }

  return 'INSIGHT_READY';
}

function resolveDisplayStatus(input: {
  displayReady: boolean;
  trustedDisplayReady: boolean;
  highConfidenceReady: boolean;
  unsafe: boolean;
}): RepositoryDisplayStatus {
  if (!input.displayReady) {
    return 'HIDDEN';
  }

  if (input.unsafe) {
    return 'UNSAFE';
  }

  if (input.highConfidenceReady) {
    return 'HIGH_CONFIDENCE_READY';
  }

  if (input.trustedDisplayReady) {
    return 'TRUSTED_READY';
  }

  return 'BASIC_READY';
}

function deriveIncompleteReasons(
  input: AnalysisStatusInput & {
    hasSnapshot: boolean;
    hasInsight: boolean;
    hasFinalDecision: boolean;
    fullDeepReady: boolean;
    reviewEligible: boolean;
    hasClaudeReview: boolean;
    fallbackVisible: boolean;
    hasConflict: boolean;
    needsRecheck: boolean;
  },
) {
  const reasons: RepositoryIncompleteReason[] = [];

  if (!input.hasSnapshot) {
    reasons.push('NO_SNAPSHOT');
    return reasons;
  }

  if (!input.hasInsight) {
    reasons.push('NO_INSIGHT');
    return reasons;
  }

  if (!input.hasFinalDecision) {
    reasons.push('NO_FINAL_DECISION');
    return reasons;
  }

  if (input.fallbackVisible) {
    reasons.push('FALLBACK_ONLY');
  }

  if (!input.fullDeepReady) {
    if (input.deepAnalysisStatus === 'FAILED') {
      reasons.push('FAILED_DURING_ANALYSIS');
    } else if (
      input.deepAnalysisStatus === 'PENDING' ||
      input.deepAnalysisStatus === 'RUNNING'
    ) {
      reasons.push('QUEUED_NOT_FINISHED');
    } else if (input.deepAnalysisStatus === 'SKIPPED_BY_STRENGTH') {
      reasons.push('SKIPPED_BY_STRENGTH');
    } else if (input.deepAnalysisStatus === 'SKIPPED_BY_GATE') {
      reasons.push('SKIPPED_BY_GATE');
    } else if (input.hasConflict || input.needsRecheck) {
      reasons.push('CONFLICT_HELD_BACK');
    } else {
      reasons.push('NO_DEEP_ANALYSIS');
    }
  }

  if (input.fullDeepReady && input.reviewEligible && !input.hasClaudeReview) {
    reasons.push('NO_CLAUDE_REVIEW');
  }

  return reasons.length ? takeUnique(reasons) : [];
}

function resolveAnalysisStatusReason(
  input: AnalysisStatusInput,
  incompleteReason: RepositoryIncompleteReason | null,
) {
  return (
    cleanText(input.deepAnalysisStatusReason) ??
    cleanText(input.evidenceSummaryZh) ??
    cleanText(input.snapshotReason) ??
    (incompleteReason === 'NO_DEEP_ANALYSIS'
      ? 'deep_not_started'
      : incompleteReason === 'FALLBACK_ONLY'
        ? 'fallback_only'
        : incompleteReason === 'NO_CLAUDE_REVIEW'
          ? 'claude_review_pending'
          : null)
  );
}

function resolveDisplayStatusReason(
  displayStatus: RepositoryDisplayStatus,
  incompleteReason: RepositoryIncompleteReason | null,
) {
  switch (displayStatus) {
    case 'HIDDEN':
      return 'not_enough_analysis';
    case 'UNSAFE':
      return incompleteReason ?? 'unsafe_conflict';
    case 'BASIC_READY':
      return incompleteReason ?? 'basic_display_only';
    case 'TRUSTED_READY':
      return incompleteReason ?? 'trusted_without_deep';
    case 'HIGH_CONFIDENCE_READY':
    default:
      return 'high_confidence_ready';
  }
}

function buildRepositoryLightAnalysis(
  input: AnalysisStatusInput,
  context: {
    displayStatus: RepositoryDisplayStatus;
    trustedDisplayReady: boolean;
    fullDeepReady: boolean;
    fallbackVisible: boolean;
    evidenceCoverageWeak: boolean;
    keyEvidenceMissing: boolean;
    keyEvidenceWeak: boolean;
    evidenceDecisionConflict: boolean;
    deepRepairGaps: KeyEvidenceGapTaxonomy[];
    decisionRecalcGaps: KeyEvidenceGapTaxonomy[];
    evidenceRepairGaps: KeyEvidenceGapTaxonomy[];
    evidenceMissingDimensions: EvidenceDimension[];
    supportingEvidenceDimensions: EvidenceDimension[];
  },
): RepositoryLightAnalysis {
  const targetUsers = resolveLightTargetUsers(input);
  const monetization = resolveLightMonetization(input);
  const whyItMatters = resolveLightWhy(input, context);
  const nextStep = resolveLightNextStep(input, context);
  const caution = resolveLightCaution(input, context);

  return {
    targetUsers,
    monetization,
    whyItMatters,
    nextStep,
    caution,
    source: pickLightAnalysisSource(input),
  };
}

function pickLightAnalysisSource(
  input: AnalysisStatusInput,
): RepositoryLightAnalysis['source'] {
  if (cleanText(input.snapshotReason)) {
    return 'snapshot';
  }

  if (cleanText(input.reasonZh)) {
    return 'insight';
  }

  if (cleanText(input.readmeSummary)) {
    return 'readme';
  }

  return 'decision_fallback';
}

function resolveLightTargetUsers(input: AnalysisStatusInput) {
  const raw = cleanText(input.targetUsersLabel);
  if (raw && !UNCLEAR_USER_PATTERN.test(raw)) {
    return raw;
  }

  if (input.projectType === 'infra' || input.projectType === 'model') {
    return '当前更像技术能力样本，先确认到底是谁会持续用它，再决定要不要继续投入。';
  }

  return '主要面向开发者，但具体用户场景还需要继续确认。';
}

function resolveLightMonetization(input: AnalysisStatusInput) {
  const raw = cleanText(input.monetizationLabel);
  if (
    raw &&
    !UNCLEAR_MONETIZATION_PATTERN.test(raw) &&
    input.hasRealUser === true &&
    input.hasClearUseCase === true &&
    input.isDirectlyMonetizable === true
  ) {
    return raw;
  }

  if (input.action === 'BUILD' && input.hasRealUser && input.hasClearUseCase) {
    return '更适合先验证价值，再判断是否具备稳定收费空间。';
  }

  return '收费路径还不够清楚，建议先确认真实用户和场景。';
}

function resolveLightWhy(
  input: AnalysisStatusInput,
  context: {
    displayStatus: RepositoryDisplayStatus;
    trustedDisplayReady: boolean;
    fullDeepReady: boolean;
    fallbackVisible: boolean;
    evidenceCoverageWeak: boolean;
    keyEvidenceMissing: boolean;
    keyEvidenceWeak: boolean;
    evidenceDecisionConflict: boolean;
    deepRepairGaps: KeyEvidenceGapTaxonomy[];
    decisionRecalcGaps: KeyEvidenceGapTaxonomy[];
    evidenceRepairGaps: KeyEvidenceGapTaxonomy[];
    evidenceMissingDimensions: EvidenceDimension[];
    supportingEvidenceDimensions: EvidenceDimension[];
  },
) {
  if (context.evidenceDecisionConflict) {
    return (
      cleanText(input.evidenceSummaryZh) ??
      `当前关键判断被 ${formatEvidenceGapLabels(
        context.decisionRecalcGaps,
      )} 卡住，先不要把它当成稳定结论。`
    );
  }

  if (
    input.snapshotPromising === false ||
    input.snapshotNextAction === 'SKIP' ||
    input.action === 'IGNORE' ||
    input.moneyPriority === 'P3'
  ) {
    return (
      cleanText(input.snapshotReason) ??
      '基础判断偏保守，当前更适合先观察而不是直接投入产品化。'
    );
  }

  if (context.displayStatus === 'UNSAFE' || context.fallbackVisible) {
    return (
      cleanText(input.evidenceSummaryZh) ??
      cleanText(input.snapshotReason) ??
      cleanText(input.reasonZh) ??
      '当前判断还带着明显不确定性，先不要把它当成已经验证过的产品机会。'
    );
  }

  if (context.deepRepairGaps.length > 0) {
    return (
      cleanText(input.evidenceSummaryZh) ??
      `当前主要缺少 ${formatEvidenceGapLabels(
        context.deepRepairGaps,
      )} 这类关键证据，先补齐再推进更稳。`
    );
  }

  if (context.fullDeepReady) {
    return (
      cleanText(input.evidenceSummaryZh) ??
      cleanText(input.reasonZh) ??
      '深分析已经补齐，可以按当前结论继续推进。'
    );
  }

  return (
    cleanText(input.evidenceSummaryZh) ??
    cleanText(input.reasonZh) ??
    cleanText(input.snapshotReason) ??
    '基础判断已经完成，但深分析还没补齐，先按保守结论做下一步判断。'
  );
}

function resolveLightNextStep(
  input: AnalysisStatusInput,
  context: {
    displayStatus: RepositoryDisplayStatus;
    trustedDisplayReady: boolean;
    fullDeepReady: boolean;
    fallbackVisible: boolean;
    evidenceCoverageWeak: boolean;
    keyEvidenceMissing: boolean;
    keyEvidenceWeak: boolean;
    evidenceDecisionConflict: boolean;
    deepRepairGaps: KeyEvidenceGapTaxonomy[];
    decisionRecalcGaps: KeyEvidenceGapTaxonomy[];
    evidenceRepairGaps: KeyEvidenceGapTaxonomy[];
    evidenceMissingDimensions: EvidenceDimension[];
    supportingEvidenceDimensions: EvidenceDimension[];
  },
) {
  if (
    input.snapshotPromising === false ||
    input.snapshotNextAction === 'SKIP' ||
    input.action === 'IGNORE' ||
    input.moneyPriority === 'P3'
  ) {
    return '暂不投入，先放进观察池；只有当后面出现更明确用户、价值或收费路径时再继续。';
  }

  if (context.evidenceDecisionConflict) {
    return `先重新核对 ${formatEvidenceGapLabels(
      context.decisionRecalcGaps,
    )}，再决定要不要继续投入。`;
  }

  if (context.deepRepairGaps.length > 0) {
    return `先补 ${formatEvidenceGapLabels(
      context.deepRepairGaps,
    )}，再决定是否继续推进。`;
  }

  if (context.keyEvidenceMissing || context.evidenceCoverageWeak) {
    return `先补 ${formatDimensions(
      context.evidenceMissingDimensions,
    )} 关键证据，再判断是否继续投入。`;
  }

  if (context.keyEvidenceWeak || context.evidenceRepairGaps.length > 0) {
    return '先补弱证据并刷新判断，再决定是否继续推进。';
  }

  if (!context.fullDeepReady) {
    if (input.action === 'BUILD') {
      return '先做一个最小可验证版本，用真实用户确认范围、场景和收费意愿。';
    }

    if (input.action === 'CLONE') {
      return '先快速验证核心场景，再决定要不要继续借鉴到产品级。';
    }

    return '先保守观察，等深分析补齐后再决定是否继续投入。';
  }

  if (input.action === 'BUILD') {
    return '立即做，优先继续确认范围和落地方式。';
  }

  if (input.action === 'CLONE') {
    return '快速验证，重点借鉴结构、流程和收费路径。';
  }

  return '暂不投入，除非后面出现新的强信号。';
}

function resolveLightCaution(
  input: AnalysisStatusInput,
  context: {
    displayStatus: RepositoryDisplayStatus;
    trustedDisplayReady: boolean;
    fullDeepReady: boolean;
    fallbackVisible: boolean;
    evidenceCoverageWeak: boolean;
    keyEvidenceMissing: boolean;
    keyEvidenceWeak: boolean;
    evidenceDecisionConflict: boolean;
    deepRepairGaps: KeyEvidenceGapTaxonomy[];
    decisionRecalcGaps: KeyEvidenceGapTaxonomy[];
    evidenceRepairGaps: KeyEvidenceGapTaxonomy[];
    evidenceMissingDimensions: EvidenceDimension[];
    supportingEvidenceDimensions: EvidenceDimension[];
  },
) {
  if (context.evidenceDecisionConflict) {
    return `当前存在 ${formatEvidenceGapLabels(
      context.decisionRecalcGaps,
    )}，继续推进前应先重算判断。`;
  }

  if (context.fallbackVisible) {
    return '当前仍是 fallback 或兜底判断，不适合直接当成高置信结论。';
  }

  if (context.keyEvidenceMissing || context.evidenceCoverageWeak) {
    return `当前仍缺少 ${formatDimensions(
      context.evidenceMissingDimensions,
    )} 关键证据，不适合继续维持强结论。`;
  }

  if (!context.fullDeepReady) {
    return '深分析还没补齐，强 monetization、强 why 和强 build 指令都应按保守结论处理。';
  }

  if (input.hasConflict || input.needsRecheck) {
    return '当前仍有冲突信号，继续推进前建议先看证据层。';
  }

  return null;
}

function isWeakHeadline(value: AnalysisStatusInput['oneLinerStrength']) {
  return value === 'WEAK';
}

function normalizeEvidenceCoverageRate(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeEvidenceCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeEvidenceDimensions(
  value: EvidenceDimension[] | null | undefined,
) {
  if (!Array.isArray(value)) {
    return [] as EvidenceDimension[];
  }

  return takeUnique(
    value.filter((item): item is EvidenceDimension =>
      item === 'problem' ||
      item === 'user' ||
      item === 'distribution' ||
      item === 'monetization' ||
      item === 'execution' ||
      item === 'market' ||
      item === 'technical_maturity',
    ),
  );
}

function formatDimensions(dimensions: EvidenceDimension[]) {
  const normalized = normalizeEvidenceDimensions(dimensions);
  if (!normalized.length) {
    return '关键';
  }

  const labelMap: Record<EvidenceDimension, string> = {
    problem: 'problem',
    user: 'user',
    distribution: 'distribution',
    monetization: 'monetization',
    execution: 'execution',
    market: 'market',
    technical_maturity: 'technical_maturity',
  };

  return normalized.map((item) => labelMap[item]).join(' / ');
}

function cleanText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length ? normalized : null;
}

function takeUnique<T>(items: T[]) {
  return Array.from(new Set(items));
}
