import {
  ApiErrorShape,
  ApiRequestError,
  ApiSuccessResponse,
  EnqueuedTaskResponse,
  RepositoryDetail,
  RepositoryListItem,
  RepositoryListQueryState,
  RepositoryListResponse,
  RepositoryManualOverrideRecord,
  RepositoryOverviewSummary,
  RunBatchAnalysisRequest,
  RunBatchAnalysisResponse,
  RunAnalysisRequest,
  RunAnalysisResponse,
  UpdateManualInsightPayload,
  buildRepositoryListSearchParams,
} from '@/lib/types/repository';
import { normalizeRepositoryItem } from '@/lib/api/normalizers';
import { getApiBaseUrl } from '@/lib/api/base-url';
import { withInternalApiKey } from '@/lib/api/request-headers';

type ApiPayload<T> =
  | (ApiSuccessResponse<T> & {
      message?: string;
    })
  | ApiErrorShape;

function getRepositoryListApiUrl(search: string) {
  if (typeof window !== 'undefined') {
    return `/api/repositories${search ? `?${search}` : ''}`;
  }

  return `${getApiBaseUrl()}/api/repositories${search ? `?${search}` : ''}`;
}

function buildTimeoutSignal(timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortSignal.timeout !== 'function') {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

function toNullableNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeRepositoryNumbers<T extends RepositoryListItem>(item: T): T {
  return {
    ...item,
    toolLikeScore: toNullableNumber(item.toolLikeScore),
    completenessScore: toNullableNumber(item.completenessScore),
    ideaFitScore: toNullableNumber(item.ideaFitScore),
    finalScore: toNullableNumber(item.finalScore),
    analysisConfidence: 'analysisConfidence' in item
      ? toNullableNumber(item.analysisConfidence)
      : undefined,
    analysis: item.analysis
      ? {
          ...item.analysis,
          confidence: toNullableNumber(item.analysis.confidence),
          moneyPriority: item.analysis.moneyPriority
            ? {
                ...item.analysis.moneyPriority,
                score: toNullableNumber(item.analysis.moneyPriority.score) ?? 0,
                moneyScore:
                  toNullableNumber(item.analysis.moneyPriority.moneyScore) ??
                  toNullableNumber(item.analysis.moneyPriority.score) ??
                  0,
              }
            : item.analysis.moneyPriority,
        }
      : item.analysis,
    finalDecision: item.finalDecision
      ? {
          ...item.finalDecision,
          moneyDecision: {
            ...item.finalDecision.moneyDecision,
            score: toNullableNumber(item.finalDecision.moneyDecision?.score) ?? 0,
          },
        }
      : item.finalDecision,
  };
}

async function parseApiPayload<T>(
  response: Response,
  fallbackMessage: string,
) {
  const raw = await response.text();
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new ApiRequestError(fallbackMessage, response.status);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new ApiRequestError(fallbackMessage, response.status);
  }
}

export async function getRepositories(
  query: RepositoryListQueryState,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
) {
  const search = buildRepositoryListSearchParams(query, {
    includeUiState: false,
  });
  const url = getRepositoryListApiUrl(search);
  const signal =
    options.signal ??
    buildTimeoutSignal(options.timeoutMs);

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    signal,
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  const payload = await parseApiPayload<ApiPayload<RepositoryListResponse>>(
    response,
    'Repository list returned invalid JSON.',
  );

  if (!response.ok || !('success' in payload && payload.success)) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message;

    throw new ApiRequestError(
      message ?? 'Failed to fetch repositories.',
      response.status,
    );
  }

  return {
    ...payload.data,
    items: payload.data.items.map((item) =>
      normalizeRepositoryItem(normalizeRepositoryNumbers(item)),
    ),
  };
}

export async function getRepositoryById(
  id: string,
  options: {
    timeoutMs?: number;
  } = {},
) {
  const response = await fetch(`${getApiBaseUrl()}/api/repositories/${id}`, {
    method: 'GET',
    cache: 'no-store',
    signal: buildTimeoutSignal(options.timeoutMs),
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  const payload = await parseApiPayload<ApiPayload<RepositoryDetail>>(
    response,
    'Repository detail returned invalid JSON.',
  );

  if (!response.ok || !('success' in payload && payload.success)) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message;

    throw new ApiRequestError(
      message ?? 'Failed to fetch repository detail.',
      response.status,
    );
  }

  return normalizeRepositoryItem(normalizeRepositoryNumbers(payload.data));
}

export async function updateRepositoryManualInsight(
  id: string,
  payload: UpdateManualInsightPayload,
) {
  const response = await fetch(`${getApiBaseUrl()}/api/repositories/${id}/manual-insight`, {
    method: 'POST',
    headers: withInternalApiKey({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  const body = await parseApiPayload<
    ApiPayload<RepositoryManualOverrideRecord | null>
  >(response, 'Repository manual insight returned invalid JSON.');

  if (!response.ok || !('success' in body && body.success)) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;

    throw new ApiRequestError(
      message ?? 'Failed to update repository manual insight.',
      response.status,
    );
  }

  return body.data;
}

export async function getRepositoryOverviewSummary(options: { timeoutMs?: number } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/repositories/summary`, {
    method: 'GET',
    cache: 'no-store',
    signal: buildTimeoutSignal(options.timeoutMs),
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  const payload = await parseApiPayload<ApiPayload<RepositoryOverviewSummary>>(
    response,
    'Repository summary returned invalid JSON.',
  );

  if (!response.ok || !('success' in payload && payload.success)) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message;

    throw new ApiRequestError(
      message ?? 'Failed to fetch repository overview summary.',
      response.status,
    );
  }

  return payload.data;
}

export async function runRepositoryAnalysis(
  id: string,
  payload: RunAnalysisRequest,
) {
  const response = await fetch(`${getApiBaseUrl()}/api/analysis/run/${id}`, {
    method: 'POST',
    headers: withInternalApiKey({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as
    | (ApiSuccessResponse<RunAnalysisResponse> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in body && body.success)) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;

    throw new ApiRequestError(
      message ?? 'Failed to run repository analysis.',
      response.status,
    );
  }

  return body.data;
}

export async function enqueueRepositoryAnalysis(
  id: string,
  payload: RunAnalysisRequest,
) {
  const response = await fetch(
    `${getApiBaseUrl()}/api/analysis/run/${id}/async`,
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
      message ?? 'Failed to enqueue repository analysis.',
      response.status,
    );
  }

  return body.data;
}

export async function runBatchRepositoryAnalysis(
  payload: RunBatchAnalysisRequest,
) {
  const response = await fetch(`${getApiBaseUrl()}/api/analysis/run/batch`, {
    method: 'POST',
    headers: withInternalApiKey({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as
    | (ApiSuccessResponse<RunBatchAnalysisResponse> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in body && body.success)) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;

    throw new ApiRequestError(
      message ?? 'Failed to run batch repository analysis.',
      response.status,
    );
  }

  return body.data;
}

export async function enqueueBatchRepositoryAnalysis(
  payload: RunBatchAnalysisRequest,
) {
  const response = await fetch(
    `${getApiBaseUrl()}/api/analysis/run/batch/async`,
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
      message ?? 'Failed to enqueue batch repository analysis.',
      response.status,
    );
  }

  return body.data;
}
