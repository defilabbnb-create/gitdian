export const QUEUE_NAMES = {
  GITHUB_FETCH: 'github.fetch',
  GITHUB_CREATED_BACKFILL: 'github.created-backfill',
  ANALYSIS_SNAPSHOT: 'analysis.snapshot',
  ANALYSIS_SINGLE: 'analysis.single',
  ANALYSIS_BATCH: 'analysis.batch',
  FAST_FILTER_BATCH: 'fast-filter.batch',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const QUEUE_JOB_TYPES = {
  GITHUB_FETCH: 'github.fetch_repositories',
  GITHUB_CREATED_BACKFILL: 'github.backfill_created_repositories',
  ANALYSIS_SNAPSHOT: 'analysis.idea_snapshot',
  ANALYSIS_SINGLE: 'analysis.run_single',
  ANALYSIS_BATCH: 'analysis.run_batch',
  FAST_FILTER_BATCH: 'fast_filter.batch',
} as const;

export type QueueJobType =
  (typeof QUEUE_JOB_TYPES)[keyof typeof QUEUE_JOB_TYPES];
