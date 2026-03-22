import {
  ApiErrorShape,
  ApiRequestError,
  ApiSuccessResponse,
  EnqueuedTaskResponse,
  RepositoryOverviewSummary,
  RepositoryListItem,
  RunBatchAnalysisRequest,
  RunBatchAnalysisResponse,
  RunAnalysisRequest,
  RunAnalysisResponse,
  buildRepositoryListSearchParams,
  RepositoryDetail,
  RepositoryListQueryState,
  RepositoryListResponse,
} from '@/lib/types/repository';

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
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

function normalizeRepositoryItem<T extends RepositoryListItem>(item: T): T {
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
        }
      : item.analysis,
  };
}

export async function getRepositories(query: RepositoryListQueryState) {
  const search = buildRepositoryListSearchParams(query);
  const url = `${getApiBaseUrl()}/api/repositories${search ? `?${search}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as
    | (ApiSuccessResponse<RepositoryListResponse> & {
        message?: string;
      })
    | ApiErrorShape;

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
    items: payload.data.items.map((item) => normalizeRepositoryItem(item)),
  };
}

export async function getRepositoryById(id: string) {
  const response = await fetch(`${getApiBaseUrl()}/api/repositories/${id}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as
    | (ApiSuccessResponse<RepositoryDetail> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in payload && payload.success)) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message;

    throw new ApiRequestError(
      message ?? 'Failed to fetch repository detail.',
      response.status,
    );
  }

  return normalizeRepositoryItem(payload.data);
}

export async function getRepositoryOverviewSummary() {
  const response = await fetch(`${getApiBaseUrl()}/api/repositories/summary`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as
    | (ApiSuccessResponse<RepositoryOverviewSummary> & {
        message?: string;
      })
    | ApiErrorShape;

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
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
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
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
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
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
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
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
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
