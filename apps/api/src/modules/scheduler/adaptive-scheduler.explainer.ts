import { AdaptiveSchedulerDecision } from './adaptive-scheduler.types';

export function explainAdaptiveSchedulerDecision(
  decision: AdaptiveSchedulerDecision,
) {
  const modeLabel = decision.currentMode;
  const summary = buildSummary(decision);
  const bullets = [
    `当前模式：${modeLabel}`,
    ...decision.currentReasons.map((reason) => `原因：${reason}`),
    `调高：${collectRaised(decision).join('、') || '无'}`,
    `调低：${collectLowered(decision).join('、') || '无'}`,
    `预期优先处理：${collectPriorityTargets(decision).join('、') || '高价值 incomplete 与首页候选'}`,
  ];

  return {
    summary,
    bullets,
  };
}

function buildSummary(decision: AdaptiveSchedulerDecision) {
  switch (decision.currentMode) {
    case 'HOMEPAGE_PROTECT':
      return '首页污染偏高，系统正在优先补齐首页候选和高曝光项目。';
    case 'DEEP_RECOVERY':
      return 'deep 覆盖率偏低，系统正在优先补高价值 incomplete 的深分析。';
    case 'FALLBACK_CLEANUP':
      return 'fallback 仍在对用户可见，系统正在优先清理这批低信任结果。';
    case 'CLAUDE_CATCHUP':
      return '高价值冲突样本积压，系统正在优先补 Claude 复核。';
    case 'CRITICAL_BACKPRESSURE':
      return '队列压力过高，系统正在保护首页和高价值项目，并压后长尾任务。';
    case 'NORMAL':
    default:
      return '系统处于正常调度模式，会平衡新数据摄入与历史回收。';
  }
}

function collectRaised(decision: AdaptiveSchedulerDecision) {
  return decision.queueWeightChanges
    .filter((item) => {
      const value = Number.parseFloat(item.split('=')[1] ?? '1');
      return Number.isFinite(value) && value > 1;
    })
    .map((item) => item.replace('=', ' x'));
}

function collectLowered(decision: AdaptiveSchedulerDecision) {
  return decision.queueWeightChanges
    .filter((item) => {
      const value = Number.parseFloat(item.split('=')[1] ?? '1');
      return Number.isFinite(value) && value < 1;
    })
    .map((item) => item.replace('=', ' x'));
}

function collectPriorityTargets(decision: AdaptiveSchedulerDecision) {
  switch (decision.currentMode) {
    case 'HOMEPAGE_PROTECT':
      return ['首页候选', '日报/Telegram 已曝光 incomplete', '高价值 conflict'];
    case 'DEEP_RECOVERY':
      return ['高 moneyPriority incomplete', 'no-deep 但有 finalDecision 的项目'];
    case 'FALLBACK_CLEANUP':
      return ['fallback visible', 'fallback 高曝光项目'];
    case 'CLAUDE_CATCHUP':
      return ['high-value conflict', 'Claude eligible backlog'];
    case 'CRITICAL_BACKPRESSURE':
      return ['首页候选', 'active projects', '高价值 incomplete'];
    case 'NORMAL':
    default:
      return ['新 repo', '高价值 incomplete', '常规回收'];
  }
}
