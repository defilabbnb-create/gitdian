import {
  ApiErrorShape,
  ApiRequestError,
  ApiSuccessResponse,
  EnqueuedTaskResponse,
  JobLogItem,
  JobLogListResponse,
  JobLogQueryState,
  buildJobLogListSearchParams,
} from '@/lib/types/repository';

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
}

function buildTimeoutSignal(timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortSignal.timeout !== 'function') {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

export async function getJobLogs(
  query: JobLogQueryState,
  options: {
    timeoutMs?: number;
  } = {},
) {
  const search = buildJobLogListSearchParams(query);
  const response = await fetch(
    `${getApiBaseUrl()}/api/job-logs${search ? `?${search}` : ''}`,
    {
      method: 'GET',
      cache: 'no-store',
      signal: buildTimeoutSignal(options.timeoutMs),
      headers: {
        Accept: 'application/json',
      },
    },
  );

  const payload = (await response.json()) as
    | (ApiSuccessResponse<JobLogListResponse> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in payload && payload.success)) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message;

    throw new ApiRequestError(message ?? 'Failed to fetch job logs.', response.status);
  }

  return payload.data;
}

export async function getJobLogsForRepository(
  repositoryId: string,
  pageSize = 5,
  options: {
    timeoutMs?: number;
  } = {},
) {
  return getJobLogs({
    page: 1,
    pageSize,
    repositoryId,
  }, options);
}

async function parseResponse<T>(response: Response, fallbackMessage: string) {
  const payload = (await response.json()) as
    | (ApiSuccessResponse<T> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in payload && payload.success)) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message;

    throw new ApiRequestError(message ?? fallbackMessage, response.status);
  }

  return payload.data;
}

export async function getJobLogById(jobId: string) {
  const response = await fetch(`${getApiBaseUrl()}/api/job-logs/${jobId}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  return parseResponse<JobLogItem>(response, 'Failed to fetch job detail.');
}

export async function retryJobLog(jobId: string) {
  const response = await fetch(`${getApiBaseUrl()}/api/job-logs/${jobId}/retry`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });

  return parseResponse<EnqueuedTaskResponse>(response, 'Failed to retry job.');
}

export async function cancelJobLog(jobId: string) {
  const response = await fetch(
    `${getApiBaseUrl()}/api/job-logs/${jobId}/cancel`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return parseResponse<JobLogItem>(response, 'Failed to cancel job.');
}
