import {
  ApiErrorShape,
  ApiRequestError,
  ApiSuccessResponse,
  FavoriteListQueryState,
  FavoriteListResponse,
  FavoriteMutationPayload,
  FavoriteWithRepositorySummary,
  UpdateFavoritePayload,
  buildFavoriteListSearchParams,
} from '@/lib/types/repository';
import { getApiBaseUrl } from '@/lib/api/base-url';
import { withInternalApiKey } from '@/lib/api/request-headers';

function buildTimeoutSignal(timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortSignal.timeout !== 'function') {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

async function parseResponse<T>(response: Response) {
  const payload = (await response.json()) as
    | (ApiSuccessResponse<T> & {
        message?: string;
      })
    | ApiErrorShape;

  if (!response.ok || !('success' in payload && payload.success)) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message;

    throw new ApiRequestError(
      message ?? 'Favorite request failed.',
      response.status,
    );
  }

  return payload.data;
}

export async function getFavorites(
  query: FavoriteListQueryState,
  options: {
    timeoutMs?: number;
  } = {},
) {
  const search = buildFavoriteListSearchParams(query);
  const response = await fetch(
    `${getApiBaseUrl()}/api/favorites${search ? `?${search}` : ''}`,
    {
      method: 'GET',
      cache: 'no-store',
      signal: buildTimeoutSignal(options.timeoutMs),
      headers: withInternalApiKey({
        Accept: 'application/json',
      }),
    },
  );

  return parseResponse<FavoriteListResponse>(response);
}

export async function createFavorite(payload: FavoriteMutationPayload) {
  const response = await fetch(`${getApiBaseUrl()}/api/favorites`, {
    method: 'POST',
    headers: withInternalApiKey({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  return parseResponse<FavoriteWithRepositorySummary>(response);
}

export async function removeFavorite(repositoryId: string) {
  const response = await fetch(`${getApiBaseUrl()}/api/favorites/${repositoryId}`, {
    method: 'DELETE',
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  return parseResponse<FavoriteWithRepositorySummary>(response);
}

export async function updateFavorite(
  repositoryId: string,
  payload: UpdateFavoritePayload,
) {
  const response = await fetch(`${getApiBaseUrl()}/api/favorites/${repositoryId}`, {
    method: 'PATCH',
    headers: withInternalApiKey({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  return parseResponse<FavoriteWithRepositorySummary>(response);
}
