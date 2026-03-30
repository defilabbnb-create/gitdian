import {
  getRepositoryDecisionConflictAudit,
  getRepositoryDecisionSummary,
  getRepositoryDeepAnalysisStatus,
  getRepositoryHeadlineValidation,
  getRepositoryOneLinerStrength,
  type RepositoryDecisionSummary,
} from '@/lib/repository-decision';
import {
  JobLogItem,
  RepositoryDetail,
  RepositoryListItem,
} from '@/lib/types/repository';

type RepositoryGuardTarget = RepositoryListItem | RepositoryDetail;

export type RepositoryDataGuardSeverity = 'none' | 'low' | 'medium' | 'high';

export type RepositoryDataGuardResult = {
  severity: RepositoryDataGuardSeverity;
  reasons: string[];
  riskFlags: string[];
  hideFromHomepage: boolean;
  degradeDisplay: boolean;
  hideMonetization: boolean;
  hideWhy: boolean;
  incompleteAnalysis: boolean;
  fallback: boolean;
  weakStrength: boolean;
  snapshotConflict: boolean;
  severeConflict: boolean;
};

export type RepositoryDataGuardStats = {
  conflictDetectedCount: number;
  degradedDisplayCount: number;
  hiddenFromHomepageCount: number;
  fallbackCount: number;
  incompleteAnalysisCount: number;
};

const stats: RepositoryDataGuardStats = {
  conflictDetectedCount: 0,
  degradedDisplayCount: 0,
  hiddenFromHomepageCount: 0,
  fallbackCount: 0,
  incompleteAnalysisCount: 0,
};

export function resetRepositoryDataGuardStats() {
  stats.conflictDetectedCount = 0;
  stats.degradedDisplayCount = 0;
  stats.hiddenFromHomepageCount = 0;
  stats.fallbackCount = 0;
  stats.incompleteAnalysisCount = 0;
}

export function getRepositoryDataGuardStats(): RepositoryDataGuardStats {
  return { ...stats };
}

export function detectRepositoryConflicts(
  repository: RepositoryGuardTarget,
  options: {
    summary?: RepositoryDecisionSummary;
    relatedJobs?: JobLogItem[] | null;
  } = {},
): RepositoryDataGuardResult {
  const summary = options.summary ?? getRepositoryDecisionSummary(repository);
  const validation = getRepositoryHeadlineValidation(repository, summary);
  const audit = getRepositoryDecisionConflictAudit(repository, summary);
  const deepStatus = getRepositoryDeepAnalysisStatus(
    repository,
    options.relatedJobs,
  );
  const analysisState = repository.analysisState ?? null;
  const snapshot = repository.analysis?.ideaSnapshotJson;
  const fallback =
    analysisState?.fallbackVisible === true ||
    summary.source === 'fallback' ||
    repository.analysis?.fallbackUsed === true;
  const weakStrength = getRepositoryOneLinerStrength(repository) === 'WEAK';
  const missingDeepAnalysis =
    analysisState?.deepReady === false ||
    deepStatus.status === 'NOT_STARTED' ||
    deepStatus.status === 'PENDING' ||
    deepStatus.status === 'RUNNING' ||
    deepStatus.status === 'FAILED';
  const incompleteAnalysis =
    analysisState?.fullyAnalyzed === false ||
    !repository.analysis?.insightJson ||
    !repository.finalDecision ||
    missingDeepAnalysis;
  const snapshotConflict =
    validation.riskFlags.includes('snapshot_conflict') ||
    (snapshot?.isPromising === false &&
      (summary.action === 'BUILD' ||
        summary.action === 'CLONE' ||
        summary.moneyPriority.tier === 'P0' ||
        summary.moneyPriority.tier === 'P1' ||
        summary.moneyPriority.tier === 'P2'));

  const reasons: string[] = [];
  const riskFlags = new Set<string>(validation.riskFlags);

  if (fallback) {
    reasons.push('当前仍是 fallback 或兜底结果，不应按稳定分析展示。');
    riskFlags.add('fallback_result');
  }

  if (incompleteAnalysis) {
    reasons.push('核心分析还没补齐，不能把当前判断当成完整结论。');
    riskFlags.add('incomplete_analysis');
  }

  if (snapshotConflict) {
    reasons.push('snapshot 已经给出保守信号，顶部展示必须跟着收口。');
    riskFlags.add('snapshot_conflict');
  }

  if (audit.headlineUserConflict) {
    reasons.push('一句话和用户字段冲突。');
    riskFlags.add('headline_user_conflict');
  }

  if (audit.headlineCategoryConflict) {
    reasons.push('一句话和项目类型或分类冲突。');
    riskFlags.add('headline_category_conflict');
  }

  if (audit.headlineMonetizationConflict) {
    reasons.push('一句话和收费判断冲突。');
    riskFlags.add('headline_monetization_conflict');
  }

  if (audit.headlineActionConflict) {
    reasons.push('一句话和当前 verdict/action 冲突。');
    riskFlags.add('headline_action_conflict');
  }

  if (weakStrength) {
    reasons.push('一句话强度偏弱，应该按低信任处理。');
    riskFlags.add('weak_strength');
  }

  const severeConflict =
    analysisState?.unsafe === true ||
    fallback ||
    snapshotConflict ||
    audit.headlineActionConflict ||
    audit.headlineCategoryConflict ||
    (incompleteAnalysis && validation.changed);
  const degradeDisplay =
    severeConflict ||
    incompleteAnalysis ||
    analysisState?.displayStatus === 'BASIC_READY' ||
    analysisState?.displayStatus === 'TRUSTED_READY' ||
    weakStrength ||
    audit.hasConflict ||
    validation.changed;
  const hideMonetization =
    degradeDisplay &&
    (fallback ||
      incompleteAnalysis ||
      missingDeepAnalysis ||
      audit.headlineMonetizationConflict ||
      audit.unclearUser ||
      snapshotConflict);
  const hideWhy =
    fallback ||
    incompleteAnalysis ||
    missingDeepAnalysis ||
    snapshotConflict ||
    audit.headlineActionConflict;
  const hideFromHomepage =
    analysisState?.displayStatus === 'UNSAFE' ||
    analysisState?.highConfidenceReady === false ||
    severeConflict ||
    weakStrength ||
    summary.moneyPriority.tier === 'P3' ||
    summary.action === 'IGNORE' ||
    validation.changed ||
    audit.unclearUser;

  const severity: RepositoryDataGuardSeverity = severeConflict
    ? 'high'
    : degradeDisplay
      ? 'medium'
      : reasons.length
        ? 'low'
        : 'none';

  if (riskFlags.size > 0) {
    stats.conflictDetectedCount += 1;
  }
  if (degradeDisplay) {
    stats.degradedDisplayCount += 1;
  }
  if (hideFromHomepage) {
    stats.hiddenFromHomepageCount += 1;
  }
  if (fallback) {
    stats.fallbackCount += 1;
  }
  if (incompleteAnalysis) {
    stats.incompleteAnalysisCount += 1;
  }

  return {
    severity,
    reasons,
    riskFlags: Array.from(riskFlags),
    hideFromHomepage,
    degradeDisplay,
    hideMonetization,
    hideWhy,
    incompleteAnalysis,
    fallback,
    weakStrength,
    snapshotConflict,
    severeConflict,
  };
}

export function detectRepositoryConflictsBatch(
  repositories: RepositoryGuardTarget[],
  options: {
    relatedJobsByRepositoryId?: Map<string, JobLogItem[]>;
  } = {},
) {
  return new Map(
    repositories.map((repository) => [
      repository.id,
      detectRepositoryConflicts(repository, {
        relatedJobs: options.relatedJobsByRepositoryId?.get(repository.id) ?? null,
      }),
    ]),
  );
}

export function shouldHideFromHomepage(repository: RepositoryGuardTarget) {
  return detectRepositoryConflicts(repository).hideFromHomepage;
}

export function shouldDegradeDisplay(repository: RepositoryGuardTarget) {
  return detectRepositoryConflicts(repository).degradeDisplay;
}
