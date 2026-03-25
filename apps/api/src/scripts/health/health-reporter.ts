import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DailyHealthSnapshot } from './health-metrics.collector';
import { HealthDiffResult } from './health-diff';
import { HealthEvaluation } from './health-evaluator';

export type DailyHealthReport = {
  generatedAt: string;
  status: HealthEvaluation['status'];
  summary: DailyHealthSnapshot['summary'];
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
    `- total repos: ${repo.totalRepos}`,
    `- fully analyzed: ${repo.fullyAnalyzedRepos}`,
    `- deep 覆盖率: ${((repo.deepDoneRepos / Math.max(1, repo.totalRepos)) * 100).toFixed(2)}%`,
    `- incomplete: ${repo.incompleteRepos}`,
    `- fallback: ${repo.fallbackRepos}`,
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
