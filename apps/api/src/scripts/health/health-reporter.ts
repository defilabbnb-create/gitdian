import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DailyHealthSnapshot } from './health-metrics.collector';
import { HealthDiffResult } from './health-diff';
import { HealthEvaluation } from './health-evaluator';

export type DailyHealthReport = {
  generatedAt: string;
  status: HealthEvaluation['status'];
  summary: DailyHealthSnapshot['summary'];
  globalSnapshot: DailyHealthSnapshot['globalSnapshot'];
  recentSnapshot: DailyHealthSnapshot['recentSnapshot'];
  checks: HealthEvaluation['checks'];
  recommendations: string[];
  diff: HealthDiffResult | null;
  autoRepair?: Record<string, unknown> | null;
};

export async function writeDailyHealthReport(args: {
  report: DailyHealthReport;
  writeFiles: boolean;
}) {
  const json = JSON.stringify(args.report, null, 2);
  const markdown = renderDailyHealthMarkdown(args.report);

  if (!args.writeFiles) {
    return {
      json,
      markdown,
      jsonPath: null,
      markdownPath: null,
    };
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const reportsDir = path.join(process.cwd(), 'reports', 'health');
  await mkdir(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, `daily-health-${yyyy}${mm}${dd}.json`);
  const markdownPath = path.join(reportsDir, `daily-health-${yyyy}${mm}${dd}.md`);

  await Promise.all([
    writeFile(jsonPath, json, 'utf8'),
    writeFile(markdownPath, markdown, 'utf8'),
  ]);

  return {
    json,
    markdown,
    jsonPath,
    markdownPath,
  };
}

export function renderDailyHealthMarkdown(report: DailyHealthReport) {
  const repo = report.summary.repoSummary;
  const homepage = report.summary.homepageSummary;
  const quality = report.summary.qualitySummary;
  const queue = report.summary.queueSummary;
  const behavior = report.summary.behaviorSummary;
  const historical = report.summary.historicalRepairSummary;
  const global = report.globalSnapshot;
  const recent = report.recentSnapshot;
  const diffLines =
    report.diff?.entries.map((item) => {
      const arrow =
        item.trend === 'improved' ? '↑' : item.trend === 'degraded' ? '↓' : '→';
      return `- ${item.key}: ${arrow} ${item.previous} -> ${item.current}`;
    }) ?? ['- 无昨日基线可对比'];

  return [
    '# GitDian 每日健康报告',
    '',
    '## 总体状态',
    '',
    `- ${report.status}`,
    '',
    '## 核心指标',
    '',
    `- total repos: ${global.totalRepos}`,
    `- fully analyzed: ${global.fullyAnalyzed}`,
    `- deep 覆盖率: ${(global.deepCoverage * 100).toFixed(2)}%`,
    `- incomplete: ${global.incomplete}`,
    `- fallback: ${repo.fallbackRepos}`,
    '',
    '## 最近 1 天',
    '',
    `- new repos: ${recent.newRepos}`,
    `- recent tasks: ${recent.recentTasks}`,
    `- recent failures: ${recent.recentFailures}`,
    '',
    '## 首页污染',
    '',
    `- unsafe %: ${((homepage.homepageUnsafe / Math.max(1, homepage.homepageTotal)) * 100).toFixed(2)}%`,
    `- incomplete %: ${((homepage.homepageIncomplete / Math.max(1, homepage.homepageTotal)) * 100).toFixed(2)}%`,
    `- fallback %: ${((homepage.homepageFallback / Math.max(1, homepage.homepageTotal)) * 100).toFixed(2)}%`,
    '',
    '## one-liner 质量',
    '',
    `- 模板句: ${quality.badTemplateCount}`,
    `- 英文泄漏: ${quality.englishLeakCount}`,
    `- 冲突: ${quality.conflictCount}`,
    '',
    '## 队列状态',
    '',
    `- pending: ${queue.pendingCount}`,
    `- deep backlog: ${queue.deepQueueSize}`,
    `- claude backlog: ${queue.claudeQueueSize}`,
    '',
    '## 历史修复',
    '',
    `- visible_broken: ${historical.visibleBrokenCount}`,
    `- high_value_weak: ${historical.highValueWeakCount}`,
    `- stale_watch: ${historical.staleWatchCount}`,
    `- archive_or_noise: ${historical.archiveOrNoiseCount}`,
    `- historicalTrustedButWeak: ${historical.historicalTrustedButWeakCount}`,
    `- immediateFrontendDowngrade: ${historical.immediateFrontendDowngradeCount}`,
    `- evidenceCoverageRate: ${(historical.evidenceCoverageRate * 100).toFixed(2)}%`,
    `- keyEvidenceMissingCount: ${historical.keyEvidenceMissingCount}`,
    `- evidenceConflictCount: ${historical.evidenceConflictCount}`,
    `- evidenceWeakButVisibleCount: ${historical.evidenceWeakButVisibleCount}`,
    `- conflictDrivenDecisionRecalcCount: ${historical.conflictDrivenDecisionRecalcCount}`,
    `- historicalRepairQueue: ${historical.historicalRepairQueueCount}`,
    `- action breakdown: downgrade=${historical.historicalRepairActionBreakdown.downgrade_only}, refresh=${historical.historicalRepairActionBreakdown.refresh_only}, evidence=${historical.historicalRepairActionBreakdown.evidence_repair}, deep=${historical.historicalRepairActionBreakdown.deep_repair}, recalc=${historical.historicalRepairActionBreakdown.decision_recalc}`,
    `- visible_broken actions: downgrade=${historical.visibleBrokenActionBreakdown.downgrade_only}, evidence=${historical.visibleBrokenActionBreakdown.evidence_repair}, deep=${historical.visibleBrokenActionBreakdown.deep_repair}, recalc=${historical.visibleBrokenActionBreakdown.decision_recalc}`,
    `- high_value_weak actions: refresh=${historical.highValueWeakActionBreakdown.refresh_only}, evidence=${historical.highValueWeakActionBreakdown.evidence_repair}, deep=${historical.highValueWeakActionBreakdown.deep_repair}, recalc=${historical.highValueWeakActionBreakdown.decision_recalc}`,
    `- cleanup states: freeze=${historical.freezeCandidateCount}, archive=${historical.archiveCandidateCount}, purge_ready=${historical.purgeReadyCount}`,
    `- frozen still visible: ${historical.frozenReposStillVisibleCount}`,
    `- archived still scheduled: ${historical.archivedReposStillScheduledCount}`,
    `- router capability breakdown: light=${historical.routerCapabilityBreakdown.LIGHT}, standard=${historical.routerCapabilityBreakdown.STANDARD}, heavy=${historical.routerCapabilityBreakdown.HEAVY}, review=${historical.routerCapabilityBreakdown.REVIEW}, deterministic=${historical.routerCapabilityBreakdown.DETERMINISTIC_ONLY}`,
    `- router fallback breakdown: provider=${historical.routerFallbackBreakdown.PROVIDER_FALLBACK}, deterministic=${historical.routerFallbackBreakdown.DETERMINISTIC_ONLY}, light=${historical.routerFallbackBreakdown.LIGHT_DERIVATION}, retry_review=${historical.routerFallbackBreakdown.RETRY_THEN_REVIEW}, retry_downgrade=${historical.routerFallbackBreakdown.RETRY_THEN_DOWNGRADE}, downgrade=${historical.routerFallbackBreakdown.DOWNGRADE_ONLY}`,
    `- router review required: ${historical.routerReviewRequiredCount}`,
    `- router deterministic-only: ${historical.routerDeterministicOnlyCount}`,
    `- router cleanup suppressed: ${historical.frozenOrArchivedTaskSuppressedCount}`,
    '',
    '## 行为系统',
    '',
    `- completed: ${behavior.completedActions}`,
    `- dropped: ${behavior.droppedActions}`,
    `- 推荐变化: ${behavior.homepageAdaptedCount}`,
    '',
    '## 与昨日对比',
    '',
    ...diffLines,
    '',
    '## 建议动作',
    '',
    ...report.recommendations.map((item) => `- ${item}`),
  ].join('\n');
}
