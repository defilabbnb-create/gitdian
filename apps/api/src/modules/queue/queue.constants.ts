export const QUEUE_NAMES = {
  GITHUB_FETCH: 'github.fetch',
  GITHUB_CREATED_BACKFILL: 'github.created-backfill',
  GITHUB_COLD_TOOL_COLLECT: 'github.cold-tool-collect',
  ANALYSIS_SNAPSHOT: 'analysis.snapshot',
  ANALYSIS_SINGLE: 'analysis.single',
  ANALYSIS_SINGLE_COLD: 'analysis.single.cold',
  ANALYSIS_BATCH: 'analysis.batch',
  FAST_FILTER_BATCH: 'fast-filter.batch',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const QUEUE_JOB_TYPES = {
  GITHUB_FETCH: 'github.fetch_repositories',
  GITHUB_CREATED_BACKFILL: 'github.backfill_created_repositories',
  GITHUB_COLD_TOOL_COLLECT: 'github.collect_cold_tools',
  ANALYSIS_SNAPSHOT: 'analysis.idea_snapshot',
  ANALYSIS_SINGLE: 'analysis.run_single',
  ANALYSIS_SINGLE_COLD: 'analysis.run_single_cold',
  ANALYSIS_BATCH: 'analysis.run_batch',
  FAST_FILTER_BATCH: 'fast_filter.batch',
} as const;

export type QueueJobType =
  (typeof QUEUE_JOB_TYPES)[keyof typeof QUEUE_JOB_TYPES];
