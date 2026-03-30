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

export async function getFavorites(query: FavoriteListQueryState) {
  const search = buildFavoriteListSearchParams(query);
  const response = await fetch(
    `${getApiBaseUrl()}/api/favorites${search ? `?${search}` : ''}`,
    {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  return parseResponse<FavoriteListResponse>(response);
}

export async function createFavorite(payload: FavoriteMutationPayload) {
  const response = await fetch(`${getApiBaseUrl()}/api/favorites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<FavoriteWithRepositorySummary>(response);
}

export async function removeFavorite(repositoryId: string) {
  const response = await fetch(`${getApiBaseUrl()}/api/favorites/${repositoryId}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });

  return parseResponse<FavoriteWithRepositorySummary>(response);
}

export async function updateFavorite(
  repositoryId: string,
  payload: UpdateFavoritePayload,
) {
  const response = await fetch(`${getApiBaseUrl()}/api/favorites/${repositoryId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<FavoriteWithRepositorySummary>(response);
}
