import {
  ApiErrorShape,
  ApiRequestError,
  ApiSuccessResponse,
  EnqueuedTaskResponse,
  FetchRepositoriesRequest,
  FetchRepositoriesResponse,
} from '@/lib/types/repository';

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
}

export async function fetchGitHubRepositories(
  payload: FetchRepositoriesRequest,
) {
  const response = await fetch(`${getApiBaseUrl()}/api/github/fetch-repositories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
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
      message ?? 'Failed to create GitHub fetch task.',
      response.status,
    );
  }

  return body.data;
}
