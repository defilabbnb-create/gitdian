import { Injectable } from '@nestjs/common';

export type GitHubTokenSelectionStrategy = 'round-robin' | 'fallback';
export type GitHubRequestType = 'search' | 'enrichment' | 'health';

type GitHubTokenState = {
  index: number;
  token: string;
  enabled: boolean;
  lastFailureAt: number | null;
  cooldownUntil: number | null;
  recent403Count: number;
  recentRateLimitResetAt: number | null;
};

export type GitHubRateLimitStatus = {
  tokenIndex: number | null;
  requestType: GitHubRequestType;
  limited: boolean;
  remaining: number | null;
  resetAt: string | null;
  retryAfterMs: number | null;
  updatedAt: string;
};

export type GitHubTokenPoolDiagnostics = {
  hasToken: boolean;
  hasTokenPool: boolean;
  tokenPoolSize: number;
  usingMultiToken: boolean;
  anonymousFallback: boolean;
  disabledTokenCount: number;
  disabledTokenIndexes: number[];
  cooldownTokenCount: number;
  lastKnownRateLimitStatus: GitHubRateLimitStatus | null;
};

export type GitHubTokenSelection = {
  token: string | null;
  tokenIndex: number | null;
  waitMs: number;
  strategy: GitHubTokenSelectionStrategy;
  diagnostics: GitHubTokenPoolDiagnostics;
};

const DEFAULT_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

export function resolveGitHubTokens(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const multiTokenSource = env.GITHUB_TOKENS?.trim();

  if (multiTokenSource) {
    return Array.from(
      new Set(
        multiTokenSource
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean),
      ),
    );
  }

  const singleToken = env.GITHUB_TOKEN?.trim();
  return singleToken ? [singleToken] : [];
}

@Injectable()
export class GitHubTokenPool {
  private readonly states: GitHubTokenState[];
  private cursor = -1;
  private lastKnownRateLimitStatus: GitHubRateLimitStatus | null = null;

  constructor() {
    const tokens = resolveGitHubTokens();
    this.states = tokens.map((token, index) => ({
      index,
      token,
      enabled: true,
      lastFailureAt: null,
      cooldownUntil: null,
      recent403Count: 0,
      recentRateLimitResetAt: null,
    }));
  }

  selectToken(
    strategy: GitHubTokenSelectionStrategy = 'round-robin',
  ): GitHubTokenSelection {
    if (this.states.length === 0) {
      return {
        token: null,
        tokenIndex: null,
        waitMs: 0,
        strategy,
        diagnostics: this.getDiagnostics(),
      };
    }

    const now = Date.now();
    const available = this.states.filter(
      (state) =>
        state.enabled &&
        (state.cooldownUntil === null || state.cooldownUntil <= now),
    );

    if (available.length === 0) {
      const recoverable = this.states
        .filter((state) => state.enabled && state.cooldownUntil !== null)
        .sort(
          (left, right) =>
            (left.cooldownUntil ?? Number.MAX_SAFE_INTEGER) -
            (right.cooldownUntil ?? Number.MAX_SAFE_INTEGER),
        );
      const next = recoverable[0] ?? null;

      return {
        token: next?.token ?? null,
        tokenIndex: next?.index ?? null,
        waitMs:
          next?.cooldownUntil != null
            ? Math.max(0, next.cooldownUntil - now)
            : 0,
        strategy,
        diagnostics: this.getDiagnostics(),
      };
    }

    const selected =
      strategy === 'fallback'
        ? available[0]
        : this.selectRoundRobinToken(available);

    this.cursor = selected.index;

    return {
      token: selected.token,
      tokenIndex: selected.index,
      waitMs: 0,
      strategy,
      diagnostics: this.getDiagnostics(),
    };
  }

  markSuccess(
    tokenIndex: number | null,
    status: Omit<GitHubRateLimitStatus, 'updatedAt'> | null = null,
  ) {
    if (tokenIndex === null) {
      if (status) {
        this.lastKnownRateLimitStatus = {
          ...status,
          updatedAt: new Date().toISOString(),
        };
      }
      return;
    }

    const state = this.states[tokenIndex];
    if (!state) {
      return;
    }

    state.recent403Count = 0;
    if (state.cooldownUntil !== null && state.cooldownUntil <= Date.now()) {
      state.cooldownUntil = null;
    }

    if (status) {
      state.recentRateLimitResetAt = status.resetAt
        ? new Date(status.resetAt).getTime()
        : null;
      this.lastKnownRateLimitStatus = {
        ...status,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  markRateLimited(
    tokenIndex: number | null,
    status: Omit<GitHubRateLimitStatus, 'updatedAt'> | null,
  ) {
    if (tokenIndex === null) {
      if (status) {
        this.lastKnownRateLimitStatus = {
          ...status,
          updatedAt: new Date().toISOString(),
        };
      }
      return;
    }

    const state = this.states[tokenIndex];
    if (!state) {
      return;
    }

    const now = Date.now();
    const resetAtMs = status?.resetAt ? new Date(status.resetAt).getTime() : null;
    const retryAfterMs =
      status?.retryAfterMs ??
      (resetAtMs != null ? Math.max(0, resetAtMs - now) : null);
    const cooldownMs =
      retryAfterMs ??
      Math.min(
        DEFAULT_COOLDOWN_MS * Math.max(1, state.recent403Count + 1),
        MAX_COOLDOWN_MS,
      );

    state.lastFailureAt = now;
    state.recent403Count += 1;
    state.recentRateLimitResetAt = resetAtMs;
    state.cooldownUntil = now + Math.max(1_000, cooldownMs);

    if (status) {
      this.lastKnownRateLimitStatus = {
        ...status,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  markAuthFailure(tokenIndex: number | null) {
    if (tokenIndex === null) {
      return;
    }

    const state = this.states[tokenIndex];
    if (!state) {
      return;
    }

    state.enabled = false;
    state.lastFailureAt = Date.now();
    state.cooldownUntil = null;
  }

  markTransientFailure(tokenIndex: number | null, retryAfterMs = 3_000) {
    if (tokenIndex === null) {
      return;
    }

    const state = this.states[tokenIndex];
    if (!state) {
      return;
    }

    const now = Date.now();
    state.lastFailureAt = now;
    state.cooldownUntil = now + Math.max(500, retryAfterMs);
  }

  getDiagnostics(): GitHubTokenPoolDiagnostics {
    const disabledTokenIndexes = this.states
      .filter((state) => !state.enabled)
      .map((state) => state.index);
    const now = Date.now();

    return {
      hasToken: this.states.length > 0,
      hasTokenPool: this.states.length > 0,
      tokenPoolSize: this.states.length,
      usingMultiToken: this.states.length > 1,
      anonymousFallback: this.states.length === 0,
      disabledTokenCount: disabledTokenIndexes.length,
      disabledTokenIndexes,
      cooldownTokenCount: this.states.filter(
        (state) =>
          state.enabled &&
          state.cooldownUntil !== null &&
          state.cooldownUntil > now,
      ).length,
      lastKnownRateLimitStatus: this.lastKnownRateLimitStatus,
    };
  }

  private selectRoundRobinToken(available: GitHubTokenState[]) {
    const sorted = [...available].sort((left, right) => left.index - right.index);
    const currentIndex = sorted.findIndex((state) => state.index > this.cursor);

    if (currentIndex >= 0) {
      return sorted[currentIndex];
    }

    return sorted[0];
  }
}
