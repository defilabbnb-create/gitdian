export function getJobDisplayName(jobName: string) {
  const normalized = jobName.trim().toLowerCase();

  if (normalized.includes('analysis.run_single')) {
    return '单仓分析执行';
  }

  if (normalized.includes('analysis.idea_snapshot')) {
    return 'Snapshot 粗筛';
  }

  if (normalized.includes('analysis.completeness')) {
    return '完整性判断';
  }

  if (normalized.includes('analysis.idea_fit')) {
    return '创业匹配判断';
  }

  if (normalized.includes('analysis.idea_extract')) {
    return '深度机会提取';
  }

  if (normalized.includes('analysis.run_batch')) {
    return '批量分析调度';
  }

  if (normalized.includes('fast_filter.batch')) {
    return 'Fast Filter 批处理';
  }

  if (normalized.includes('github.created-backfill')) {
    return 'GitHub 历史回填';
  }

  if (normalized.includes('github.radar')) {
    return 'Radar 调度';
  }

  if (normalized.includes('github.fetch')) {
    return 'GitHub 抓取';
  }

  if (normalized.includes('claude')) {
    return '历史复核任务';
  }

  return jobName;
}
