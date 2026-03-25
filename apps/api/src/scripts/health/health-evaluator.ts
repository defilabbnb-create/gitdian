import { DailyHealthSnapshot } from './health-metrics.collector';
import { HEALTH_THRESHOLDS } from './health-thresholds';

export type HealthLevel = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export type HealthEvaluation = {
  status: HealthLevel;
  checks: Array<{
    key: string;
    level: HealthLevel;
    value: number;
    summary: string;
  }>;
  recommendations: string[];
};

function ratio(value: number, total: number) {
  if (!total) {
    return 0;
  }

  return value / total;
}

export function evaluateDailyHealth(
  snapshot: DailyHealthSnapshot,
): HealthEvaluation {
  const checks: HealthEvaluation['checks'] = [];
  const repo = snapshot.summary.repoSummary;
  const homepage = snapshot.summary.homepageSummary;
  const gaps = snapshot.summary.analysisGapSummary;
  const quality = snapshot.summary.qualitySummary;
  const display = snapshot.summary.displayQualitySummary;
  const queue = snapshot.summary.queueSummary;

  const deepCoverage = ratio(repo.deepDoneRepos, repo.totalRepos);
  checks.push(
    evaluateThreshold({
      key: 'deep_coverage',
      value: deepCoverage,
      warning: HEALTH_THRESHOLDS.deepCoverage.warning,
      critical: HEALTH_THRESHOLDS.deepCoverage.critical,
      reverse: true,
      summary: `deep 覆盖率 ${(deepCoverage * 100).toFixed(2)}%`,
    }),
  );

  const homepageUnsafeRate = ratio(homepage.homepageUnsafe, homepage.homepageTotal);
  checks.push(
    evaluateThreshold({
      key: 'homepage_unsafe_rate',
      value: homepageUnsafeRate,
      warning: HEALTH_THRESHOLDS.homepageUnsafeRate.warning,
      critical: HEALTH_THRESHOLDS.homepageUnsafeRate.critical,
      summary: `首页污染率 ${(homepageUnsafeRate * 100).toFixed(2)}%`,
    }),
  );

  const incompleteRate = ratio(repo.incompleteRepos, repo.totalRepos);
  checks.push(
    evaluateThreshold({
      key: 'incomplete_rate',
      value: incompleteRate,
      warning: HEALTH_THRESHOLDS.incompleteRate.warning,
      critical: HEALTH_THRESHOLDS.incompleteRate.critical,
      summary: `incomplete 比例 ${(incompleteRate * 100).toFixed(2)}%`,
    }),
  );

  checks.push({
    key: 'fallback_visible',
    level: gaps.fallbackButStillVisibleCount > 0 ? 'WARNING' : 'HEALTHY',
    value: gaps.fallbackButStillVisibleCount,
    summary: `fallback 可见数 ${gaps.fallbackButStillVisibleCount}`,
  });

  checks.push(
    evaluateThreshold({
      key: 'bad_template_count',
      value: quality.badTemplateCount,
      warning: HEALTH_THRESHOLDS.badTemplateCount.warning,
      critical: HEALTH_THRESHOLDS.badTemplateCount.critical,
      summary: `模板句数量 ${quality.badTemplateCount}`,
    }),
  );

  checks.push(
    evaluateThreshold({
      key: 'deep_queue_size',
      value: queue.deepQueueSize,
      warning: HEALTH_THRESHOLDS.deepQueueSize.warning,
      critical: HEALTH_THRESHOLDS.deepQueueSize.critical,
      summary: `deep backlog ${queue.deepQueueSize}`,
    }),
  );

  checks.push({
    key: 'no_deep_strong_display',
    level:
      display.noDeepButHasMonetization > 0 || display.noDeepButHasStrongWhy > 0
        ? 'CRITICAL'
        : 'HEALTHY',
    value:
      display.noDeepButHasMonetization + display.noDeepButHasStrongWhy,
    summary: `无 deep 强结论 ${display.noDeepButHasMonetization + display.noDeepButHasStrongWhy}`,
  });

  const status: HealthLevel = checks.some((item) => item.level === 'CRITICAL')
    ? 'CRITICAL'
    : checks.some((item) => item.level === 'WARNING')
      ? 'WARNING'
      : 'HEALTHY';

  const recommendations = buildRecommendations(snapshot, checks);

  return {
    status,
    checks,
    recommendations,
  };
}

function evaluateThreshold(args: {
  key: string;
  value: number;
  warning: number;
  critical: number;
  reverse?: boolean;
  summary: string;
}) {
  const compare = args.reverse
    ? args.value < args.critical
      ? 'CRITICAL'
      : args.value < args.warning
        ? 'WARNING'
        : 'HEALTHY'
    : args.value > args.critical
      ? 'CRITICAL'
      : args.value > args.warning
        ? 'WARNING'
        : 'HEALTHY';

  return {
    key: args.key,
    level: compare,
    value: args.value,
    summary: args.summary,
  } as const;
}

function buildRecommendations(
  snapshot: DailyHealthSnapshot,
  checks: HealthEvaluation['checks'],
) {
  const recommendations: string[] = [];
  if (checks.some((item) => item.key === 'deep_coverage' && item.level !== 'HEALTHY')) {
    recommendations.push('需要补 deep：优先跑首页候选和高 moneyPriority incomplete。');
  }
  if (
    checks.some(
      (item) => item.key === 'fallback_visible' && item.level !== 'HEALTHY',
    )
  ) {
    recommendations.push('需要回收 fallback：先清理仍对用户可见的 fallback repo。');
  }
  if (
    checks.some(
      (item) => item.key === 'bad_template_count' && item.level !== 'HEALTHY',
    )
  ) {
    recommendations.push('需要清洗 one-liner：模板句或弱标题正在回流到展示层。');
  }
  if (
    checks.some(
      (item) => item.key === 'deep_queue_size' && item.level !== 'HEALTHY',
    )
  ) {
    recommendations.push('队列需要扩容或重排：deep backlog 已开始影响高价值项目补齐。');
  }
  if (!recommendations.length) {
    recommendations.push('系统整体健康，可继续正常摄入新 repo 并稳步回收旧数据。');
  }

  if (snapshot.summary.behaviorSummary.preferenceSignalsCount === 0) {
    recommendations.push('行为记忆还很薄，当前推荐主要由项目质量而不是用户历史驱动。');
  }

  return recommendations;
}
