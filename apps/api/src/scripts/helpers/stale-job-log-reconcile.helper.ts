import { JobStatus } from '@prisma/client';

export type NormalizedQueueObservedState =
  | 'active'
  | 'waiting'
  | 'waiting-children'
  | 'delayed'
  | 'prioritized'
  | 'completed'
  | 'failed'
  | 'missing'
  | 'unknown';

export type StaleJobLogDisposition =
  | 'keep_running'
  | 'keep_pending'
  | 'mark_running'
  | 'mark_pending'
  | 'mark_success'
  | 'mark_failed'
  | 'manual_review';

export type StaleJobLogDecision = {
  disposition: StaleJobLogDisposition;
  reason: string;
};

function readObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

export function normalizeQueueObservedState(
  value: string | null | undefined,
): NormalizedQueueObservedState {
  switch (value) {
    case 'active':
    case 'waiting':
    case 'waiting-children':
    case 'delayed':
    case 'prioritized':
    case 'completed':
    case 'failed':
      return value;
    case 'missing':
      return 'missing';
    default:
      return 'unknown';
  }
}

export function decideStaleJobLogReconciliation(
  currentStatus: JobStatus,
  state: NormalizedQueueObservedState,
): StaleJobLogDecision {
  if (currentStatus === JobStatus.PENDING) {
    switch (state) {
      case 'active':
        return {
          disposition: 'mark_running',
          reason: 'queue_active_should_be_running',
        };
      case 'waiting':
      case 'waiting-children':
      case 'delayed':
      case 'prioritized':
        return {
          disposition: 'keep_pending',
          reason: `queue_${state}_matches_pending`,
        };
      case 'completed':
        return {
          disposition: 'mark_success',
          reason: 'queue_completed_should_be_success',
        };
      case 'failed':
      case 'missing':
        return {
          disposition: 'mark_failed',
          reason:
            state === 'failed'
              ? 'queue_failed_should_be_failed'
              : 'queue_job_missing',
        };
      default:
        return {
          disposition: 'manual_review',
          reason: 'queue_state_unknown',
        };
    }
  }

  switch (state) {
    case 'active':
      return {
        disposition: 'keep_running',
        reason: 'queue_active_matches_running',
      };
    case 'waiting':
    case 'waiting-children':
    case 'delayed':
    case 'prioritized':
      return {
        disposition: 'mark_pending',
        reason: `queue_${state}_should_be_pending`,
      };
    case 'completed':
      return {
        disposition: 'mark_success',
        reason: 'queue_completed_should_be_success',
      };
    case 'failed':
    case 'missing':
      return {
        disposition: 'mark_failed',
        reason:
          state === 'failed'
            ? 'queue_failed_should_be_failed'
            : 'queue_job_missing',
      };
    default:
      return {
        disposition: 'manual_review',
        reason: 'queue_state_unknown',
      };
  }
}

export function readHistoricalRepairActionFromPayload(payload: unknown) {
  const root = readObject(payload);
  const routerMetadata = readObject(root?.routerMetadata);

  return (
    readString(root?.historicalRepairAction) ??
    readString(routerMetadata?.historicalRepairAction) ??
    null
  );
}

export function readRepositoryIdFromPayload(payload: unknown) {
  const root = readObject(payload);
  return readString(root?.repositoryId);
}
