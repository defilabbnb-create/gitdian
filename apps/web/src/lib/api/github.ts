import {
  ApiErrorShape,
  ApiRequestError,
  ApiSuccessResponse,
  BackfillCreatedRepositoriesRequest,
  EnqueuedTaskResponse,
  FetchRepositoriesRequest,
  FetchRepositoriesResponse,
  RadarDailySummaryRecord,
  RadarRuntimeStatusRecord,
} from '@/lib/types/repository';
import { normalizeRadarDailySummaryRecord } from '@/lib/api/normalizers';
import { getApiBaseUrl } from '@/lib/api/base-url';
import { withInternalApiKey } from '@/lib/api/request-headers';

function buildTimeoutSignal(timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortSignal.timeout !== 'function') {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

export async function fetchGitHubRepositories(
  payload: FetchRepositoriesRequest,
) {
  const response = await fetch(`${getApiBaseUrl()}/api/github/fetch-repositories`, {
    method: 'POST',
    headers: withInternalApiKey({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as
    | (ApiSuccessResponse<FetchRepositoriesResponse> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in body && body.success)) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;

    throw new ApiRequestError(
      message ?? 'Failed to fetch GitHub repositories.',
      response.status,
    );
  }

  return body.data;
}

export async function enqueueGitHubRepositories(
  payload: FetchRepositoriesRequest,
) {
  const response = await fetch(
    `${getApiBaseUrl()}/api/github/fetch-repositories/async`,
    {
      method: 'POST',
      headers: withInternalApiKey({
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }),
      body: JSON.stringify(payload),
    },
  );

  const body = (await response.json()) as
    | (ApiSuccessResponse<EnqueuedTaskResponse> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in body && body.success)) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;

    throw new ApiRequestError(
      message ?? 'Failed to create GitHub fetch task.',
      response.status,
    );
  }

  return body.data;
}

export async function enqueueGitHubCreatedBackfill(
  payload: BackfillCreatedRepositoriesRequest,
) {
  const response = await fetch(
    `${getApiBaseUrl()}/api/github/backfill-created-repositories/async`,
    {
      method: 'POST',
      headers: withInternalApiKey({
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }),
      body: JSON.stringify(payload),
    },
  );

  const body = (await response.json()) as
    | (ApiSuccessResponse<EnqueuedTaskResponse> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in body && body.success)) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;

    throw new ApiRequestError(
      message ?? 'Failed to create GitHub created-backfill task.',
      response.status,
    );
  }

  return body.data;
}

export async function getRadarDailySummaries(
  days = 7,
  options: { timeoutMs?: number } = {},
) {
  const search = new URLSearchParams({
    days: String(days),
  });
  const response = await fetch(
    `${getApiBaseUrl()}/api/github/radar/daily-summary?${search.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
      signal: buildTimeoutSignal(options.timeoutMs),
      headers: withInternalApiKey({
        Accept: 'application/json',
      }),
    },
  );

  const body = (await response.json()) as
    | (ApiSuccessResponse<RadarDailySummaryRecord[]> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in body && body.success)) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;

    throw new ApiRequestError(
      message ?? 'Failed to fetch radar daily summaries.',
      response.status,
    );
  }

  return Array.isArray(body.data)
    ? body.data
        .map((item) => normalizeRadarDailySummaryRecord(item))
        .filter((item): item is RadarDailySummaryRecord => item !== null)
    : [];
}

export async function getLatestRadarDailySummary(options: { timeoutMs?: number } = {}) {
  const response = await fetch(
    `${getApiBaseUrl()}/api/github/radar/daily-summary/latest`,
    {
      method: 'GET',
      cache: 'no-store',
      signal: buildTimeoutSignal(options.timeoutMs),
      headers: withInternalApiKey({
        Accept: 'application/json',
      }),
    },
  );

  const body = (await response.json()) as
    | (ApiSuccessResponse<RadarDailySummaryRecord | null> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in body && body.success)) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;

    throw new ApiRequestError(
      message ?? 'Failed to fetch latest radar daily summary.',
      response.status,
    );
  }

  return normalizeRadarDailySummaryRecord(body.data);
}

export async function getRadarRuntimeStatus(
  options: { timeoutMs?: number } = {},
) {
  const response = await fetch(`${getApiBaseUrl()}/api/github/radar/status`, {
    method: 'GET',
    cache: 'no-store',
    signal: buildTimeoutSignal(options.timeoutMs),
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  const body = (await response.json()) as
    | (ApiSuccessResponse<RadarRuntimeStatusRecord> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in body && body.success)) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;

    throw new ApiRequestError(
      message ?? 'Failed to fetch radar runtime status.',
      response.status,
    );
  }

  return body.data;
}
