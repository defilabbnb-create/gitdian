import { ApiErrorShape, ApiRequestError, ApiSuccessResponse } from '@/lib/types/repository';
import type { BehaviorMemoryState } from 'shared';
import {
  AiHealthPayload,
  SettingsHealthPayload,
  SettingsPayload,
  UpdateSettingsPayload,
} from '@/lib/types/settings';
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
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  return parseResponse<SettingsPayload>(response);
}

export async function updateSettings(payload: UpdateSettingsPayload) {
  const response = await fetch(`${getApiBaseUrl()}/api/settings`, {
    method: 'PUT',
    headers: withInternalApiKey({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  return parseResponse<SettingsPayload>(response);
}

export async function getSettingsHealth() {
  return getSettingsHealthWithOptions();
}

export async function getSettingsHealthWithOptions(options: { timeoutMs?: number } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/settings/health`, {
    method: 'GET',
    cache: 'no-store',
    signal: buildTimeoutSignal(options.timeoutMs),
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  return parseResponse<SettingsHealthPayload>(response);
}

export async function getAiHealth(options: { timeoutMs?: number } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/ai/health`, {
    method: 'GET',
    cache: 'no-store',
    signal: buildTimeoutSignal(options.timeoutMs),
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  return parseResponse<AiHealthPayload>(response);
}

export type ColdRuntimePayload = {
  generatedAt: string;
  runtime: {
    gitSha: string;
    environment: string;
    bootedAt: string;
    worktreeDirty: boolean;
  };
  collector: {
    currentRunId: string | null;
    currentJobId: string | null;
    currentStatus: string | null;
    currentProgress: number | null;
    currentStage: string | null;
    lastHeartbeatAt: string | null;
    lastSuccessJobId: string | null;
    lastSuccessRunId: string | null;
    lastSuccessAt: string | null;
    lastFailureJobId: string | null;
    lastFailureRunId: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
    heartbeatAgeSeconds: number | null;
    heartbeatState: 'healthy' | 'stale' | 'idle' | 'missing';
    recentPhaseJobs: Array<{
      runId: string | null;
      jobId: string;
      status: string;
      phase: string | null;
      progress: number | null;
      createdAt: string;
      updatedAt: string;
      finishedAt: string | null;
    }>;
  };
  coldDeepQueue: {
    active: number;
    queued: number;
    newestQueuedAt: string | null;
    latestCompletedAt: string | null;
    latestCompletedJobId: string | null;
    newestQueuedAgeSeconds: number | null;
    queueState: 'healthy' | 'stalled' | 'idle';
  };
  warnings: string[];
};

export async function getColdRuntime(options: { timeoutMs?: number } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/system/cold-runtime`, {
    method: 'GET',
    cache: 'no-store',
    signal: buildTimeoutSignal(options.timeoutMs),
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  return parseResponse<ColdRuntimePayload>(response);
}

export async function getBehaviorMemory(options: { timeoutMs?: number } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/settings/behavior-memory`, {
    method: 'GET',
    cache: 'no-store',
    signal: buildTimeoutSignal(options.timeoutMs),
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  return parseResponse<BehaviorMemoryState>(response);
}

export async function updateBehaviorMemory(payload: BehaviorMemoryState) {
  const response = await fetch(`${getApiBaseUrl()}/api/settings/behavior-memory`, {
    method: 'PUT',
    headers: withInternalApiKey({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  return parseResponse<BehaviorMemoryState>(response);
}

export async function clearBehaviorMemory() {
  const response = await fetch(`${getApiBaseUrl()}/api/settings/behavior-memory`, {
    method: 'DELETE',
    headers: withInternalApiKey({
      Accept: 'application/json',
    }),
  });

  return parseResponse<BehaviorMemoryState>(response);
}
