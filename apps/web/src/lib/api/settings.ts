import { ApiErrorShape, ApiRequestError, ApiSuccessResponse } from '@/lib/types/repository';
import type { BehaviorMemoryState } from 'shared';
import {
  AiHealthPayload,
  SettingsHealthPayload,
  SettingsPayload,
  UpdateSettingsPayload,
} from '@/lib/types/settings';

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
}

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
      message ?? 'Settings request failed.',
      response.status,
    );
  }

  return payload.data;
}

export async function getSettings(options: { timeoutMs?: number } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/settings`, {
    method: 'GET',
    cache: 'no-store',
    signal: buildTimeoutSignal(options.timeoutMs),
    headers: {
      Accept: 'application/json',
    },
  });

  return parseResponse<SettingsPayload>(response);
}

export async function updateSettings(payload: UpdateSettingsPayload) {
  const response = await fetch(`${getApiBaseUrl()}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<SettingsPayload>(response);
}

export async function getSettingsHealth() {
  const response = await fetch(`${getApiBaseUrl()}/api/settings/health`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  return parseResponse<SettingsHealthPayload>(response);
}

export async function getAiHealth(options: { timeoutMs?: number } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/ai/health`, {
    method: 'GET',
    cache: 'no-store',
    signal: buildTimeoutSignal(options.timeoutMs),
    headers: {
      Accept: 'application/json',
    },
  });

  return parseResponse<AiHealthPayload>(response);
}

export async function getBehaviorMemory(options: { timeoutMs?: number } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/settings/behavior-memory`, {
    method: 'GET',
    cache: 'no-store',
    signal: buildTimeoutSignal(options.timeoutMs),
    headers: {
      Accept: 'application/json',
    },
  });

  return parseResponse<BehaviorMemoryState>(response);
}

export async function updateBehaviorMemory(payload: BehaviorMemoryState) {
  const response = await fetch(`${getApiBaseUrl()}/api/settings/behavior-memory`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<BehaviorMemoryState>(response);
}

export async function clearBehaviorMemory() {
  const response = await fetch(`${getApiBaseUrl()}/api/settings/behavior-memory`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });

  return parseResponse<BehaviorMemoryState>(response);
}
