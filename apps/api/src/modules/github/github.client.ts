import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GitHubSearchLimiter } from './github-search-limiter';
import {
  GitHubRateLimitStatus,
  GitHubRequestType,
  GitHubTokenPool,
  GitHubTokenSelectionStrategy,
} from './github-token-pool';
import { GitHubSearchConcurrencyService } from './github-search-concurrency.service';
import {
  GitHubCommitItem,
  GitHubContentItem,
  GitHubIssueItem,
  GitHubReadmeResponse,
  GitHubRepository,
  GitHubSearchResponse,
} from './types/github.types';

type RequestOptions = {
  params?: Record<string, string | number | undefined>;
  allowNotFound?: boolean;
  requestType?: GitHubRequestType;
  selectionStrategy?: GitHubTokenSelectionStrategy;
  context?: GitHubRequestContext;
};

type GitHubRequestErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'secondary-rate-limit'
  | 'abuse-detection'
  | 'transient-network'
  | 'http';

type GitHubRequestError = {
  kind: GitHubRequestErrorKind;
  status: number | null;
  message: string;
  retryAfterMs: number | null;
  rateLimitStatus: Omit<GitHubRateLimitStatus, 'updatedAt'> | null;
};

type GitHubRequestSummary = {
  hasToken: boolean;
  hasTokenPool: boolean;
  tokenPoolSize: number;
  usingMultiToken: boolean;
  anonymousFallback: boolean;
  tokensUsed: number[];
  retryCount: number;
  rateLimitHits: number;
  rotatedTokens: number;
  disabledTokens: number[];
  disabledTokenCount: number;
};

const DEFAULT_MAX_ATTEMPTS = 3;

export class GitHubRequestContext {
  private readonly tokensUsed = new Set<number>();
  private retryCount = 0;
  private rateLimitHits = 0;
  private rotatedTokens = 0;
  private disabledTokenCount = 0;
  private lastTokenIndex: number | null = null;

  trackSelection(tokenIndex: number | null) {
    if (tokenIndex === null) {
      return;
    }

    if (this.lastTokenIndex !== null && this.lastTokenIndex !== tokenIndex) {
      this.rotatedTokens += 1;
    }

    this.lastTokenIndex = tokenIndex;
    this.tokensUsed.add(tokenIndex);
  }

  trackRetry() {
    this.retryCount += 1;
  }

  trackRateLimitHit() {
    this.rateLimitHits += 1;
  }

  trackDisabledTokenCount(count: number) {
    this.disabledTokenCount = Math.max(this.disabledTokenCount, count);
  }

  toSummary(diagnostics: ReturnType<GitHubTokenPool['getDiagnostics']>): GitHubRequestSummary {
    return {
      hasToken: diagnostics.hasToken,
      hasTokenPool: diagnostics.hasTokenPool,
      tokenPoolSize: diagnostics.tokenPoolSize,
      usingMultiToken: diagnostics.usingMultiToken,
      anonymousFallback: diagnostics.anonymousFallback,
      tokensUsed: Array.from(this.tokensUsed).sort((left, right) => left - right),
      retryCount: this.retryCount,
      rateLimitHits: this.rateLimitHits,
      rotatedTokens: this.rotatedTokens,
      disabledTokens: diagnostics.disabledTokenIndexes,
      disabledTokenCount: Math.max(
        diagnostics.disabledTokenCount,
        this.disabledTokenCount,
      ),
    };
  }
}

@Injectable()
export class GitHubClient {
  private readonly logger = new Logger(GitHubClient.name);
  private readonly baseUrl =
    process.env.GITHUB_API_BASE_URL || 'https://api.github.com';

  constructor(
    private readonly tokenPool: GitHubTokenPool,
    private readonly searchLimiter: GitHubSearchLimiter,
    private readonly searchConcurrencyService: GitHubSearchConcurrencyService,
  ) {}

  createRequestContext() {
    return new GitHubRequestContext();
  }

  getDiagnostics() {
    return {
      ...this.tokenPool.getDiagnostics(),
      ...this.searchLimiter.getDiagnostics(),
    };
  }

  async healthCheck() {
    const startedAt = Date.now();

    try {
      const context = this.createRequestContext();
      await this.request<{ resources?: unknown }>('/rate_limit', {
        requestType: 'health',
        selectionStrategy: 'fallback',
        context,
      });

      const diagnostics = this.getDiagnostics();

      return {
        ok: true,
        hasToken: diagnostics.hasToken,
        hasTokenPool: diagnostics.hasTokenPool,
        tokenPoolSize: diagnostics.tokenPoolSize,
        usingMultiToken: diagnostics.usingMultiToken,
        anonymousFallback: diagnostics.anonymousFallback,
        lastKnownRateLimitStatus: diagnostics.lastKnownRateLimitStatus,
        latencyMs: Date.now() - startedAt,
        error: null,
      };
    } catch (error) {
      const diagnostics = this.getDiagnostics();

      return {
        ok: false,
        hasToken: diagnostics.hasToken,
        hasTokenPool: diagnostics.hasTokenPool,
        tokenPoolSize: diagnostics.tokenPoolSize,
        usingMultiToken: diagnostics.usingMultiToken,
        anonymousFallback: diagnostics.anonymousFallback,
        lastKnownRateLimitStatus: diagnostics.lastKnownRateLimitStatus,
        latencyMs: Date.now() - startedAt,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown GitHub health check error.',
      };
    }
  }

  async searchRepositories(
    params: {
      q: string;
      sort?: string;
      order?: string;
      per_page?: number;
      page?: number;
    },
    context?: GitHubRequestContext,
  ) {
    return this.request<GitHubSearchResponse>('/search/repositories', {
      params,
      requestType: 'search',
      selectionStrategy: 'round-robin',
      context,
    });
  }

  async getRepository(
    owner: string,
    repo: string,
    context?: GitHubRequestContext,
  ) {
    return this.request<GitHubRepository>(`/repos/${owner}/${repo}`, {
      requestType: 'enrichment',
      selectionStrategy: 'fallback',
      context,
    });
  }

  async getReadme(owner: string, repo: string, context?: GitHubRequestContext) {
    return this.request<GitHubReadmeResponse | null>(`/repos/${owner}/${repo}/readme`, {
      allowNotFound: true,
      requestType: 'enrichment',
      selectionStrategy: 'fallback',
      context,
    });
  }

  async getRootContents(
    owner: string,
    repo: string,
    context?: GitHubRequestContext,
  ) {
    const response = await this.request<GitHubContentItem[] | GitHubContentItem>(
      `/repos/${owner}/${repo}/contents`,
      {
        requestType: 'enrichment',
        selectionStrategy: 'fallback',
        context,
      },
    );

    return Array.isArray(response) ? response : [response];
  }

  async getRecentCommits(
    owner: string,
    repo: string,
    perPage = 10,
    context?: GitHubRequestContext,
  ) {
    return this.request<GitHubCommitItem[]>(`/repos/${owner}/${repo}/commits`, {
      params: {
        per_page: perPage,
      },
      requestType: 'enrichment',
      selectionStrategy: 'fallback',
      context,
    });
  }

  async getRecentIssues(
    owner: string,
    repo: string,
    perPage = 10,
    context?: GitHubRequestContext,
  ) {
    const issues = await this.request<GitHubIssueItem[]>(`/repos/${owner}/${repo}/issues`, {
      params: {
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: perPage,
      },
      requestType: 'enrichment',
      selectionStrategy: 'fallback',
      context,
    });

    return issues.filter((item) => !item.pull_request);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.params);
    const requestType = options.requestType ?? 'enrichment';
    const maxAttempts = this.resolveMaxAttempts();
    const startedAt = Date.now();
    let requestRetryCount = 0;
    let requestRateLimitHits = 0;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const selection = this.tokenPool.selectToken(
        options.selectionStrategy ?? 'round-robin',
      );
      options.context?.trackSelection(selection.tokenIndex);
      options.context?.trackDisabledTokenCount(
        selection.diagnostics.disabledTokenCount,
      );

      if (
        selection.token === null &&
        selection.diagnostics.hasTokenPool &&
        !selection.diagnostics.anonymousFallback
      ) {
        throw new ServiceUnavailableException(
          'All configured GitHub tokens are currently disabled. Please rotate or replace the invalid tokens.',
        );
      }

      if (selection.waitMs > 0) {
        this.logger.warn(
          `GitHub token pool waiting ${selection.waitMs}ms before retrying ${requestType} request ${path}. tokenIndex=${selection.tokenIndex ?? 'anonymous'} poolSize=${selection.diagnostics.tokenPoolSize}`,
        );
        await this.delay(selection.waitMs);
      }

      try {
        const response = await this.executeRequest(url, selection.token, requestType);

        if (options.allowNotFound && response.status === HttpStatus.NOT_FOUND) {
          return null as T;
        }

        if (!response.ok) {
          const errorInfo = await this.parseErrorResponse(
            response,
            selection.tokenIndex,
            requestType,
          );

          const shouldRetry = await this.handleRequestError({
            attempt,
            maxAttempts,
            errorInfo,
            path,
            selection,
            context: options.context,
            onRetry: () => {
              requestRetryCount += 1;
            },
            onRateLimit: () => {
              requestRateLimitHits += 1;
            },
          });

          if (shouldRetry) {
            continue;
          }

          throw this.toPublicException(errorInfo);
        }

        const rateLimitStatus = this.readRateLimitStatus(
          response.headers,
          selection.tokenIndex,
          requestType,
          false,
        );
        this.tokenPool.markSuccess(selection.tokenIndex, rateLimitStatus);
        options.context?.trackDisabledTokenCount(
          this.tokenPool.getDiagnostics().disabledTokenCount,
        );

        if (requestType === 'search') {
          await this.searchConcurrencyService.recordSearchSample({
            latencyMs: Date.now() - startedAt,
            retryCount: requestRetryCount,
            rateLimitHits: requestRateLimitHits,
          });
        }

        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }

        const transientError = this.parseNetworkError(error, requestType);
        if (!transientError) {
          throw error instanceof Error
            ? error
            : new ServiceUnavailableException('Unknown GitHub request error.');
        }

        this.tokenPool.markTransientFailure(selection.tokenIndex, transientError.retryAfterMs ?? 3_000);
        options.context?.trackDisabledTokenCount(
          this.tokenPool.getDiagnostics().disabledTokenCount,
        );

        if (attempt >= maxAttempts) {
          if (requestType === 'search') {
            await this.searchConcurrencyService.recordSearchSample({
              latencyMs: Date.now() - startedAt,
              retryCount: requestRetryCount,
              rateLimitHits: requestRateLimitHits,
            });
          }
          throw this.toPublicException(transientError);
        }

        options.context?.trackRetry();
        requestRetryCount += 1;
        this.logger.warn(
          `GitHub transient error on ${requestType} request ${path}. tokenIndex=${selection.tokenIndex ?? 'anonymous'} attempt=${attempt}/${maxAttempts} message=${transientError.message}`,
        );
        await this.delay(transientError.retryAfterMs ?? 3_000);
        lastError = this.toPublicException(transientError);
      }
    }

    if (requestType === 'search') {
      await this.searchConcurrencyService.recordSearchSample({
        latencyMs: Date.now() - startedAt,
        retryCount: requestRetryCount,
        rateLimitHits: requestRateLimitHits,
      });
    }

    throw lastError ?? new ServiceUnavailableException('GitHub request failed.');
  }

  private async executeRequest(
    url: string,
    token: string | null,
    requestType: GitHubRequestType,
  ) {
    const executor = () =>
      fetch(url, {
        headers: this.buildHeaders(token),
      });

    if (requestType === 'search') {
      return this.searchLimiter.run(executor);
    }

    return executor();
  }

  private buildUrl(path: string, params?: RequestOptions['params']) {
    const url = new URL(path, this.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private buildHeaders(token: string | null) {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'gitdian-api',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  private async parseErrorResponse(
    response: Response,
    tokenIndex: number | null,
    requestType: GitHubRequestType,
  ): Promise<GitHubRequestError> {
    let payload: { message?: string } | null = null;
    let rawText = '';

    try {
      rawText = await response.text();
      payload = rawText ? (JSON.parse(rawText) as { message?: string }) : null;
    } catch {
      payload = rawText ? { message: rawText } : null;
    }

    const message =
      payload?.message ||
      `GitHub API request failed with status ${response.status}.`;
    const loweredMessage = message.toLowerCase();
    const rateLimitStatus = this.readRateLimitStatus(
      response.headers,
      tokenIndex,
      requestType,
      response.status === HttpStatus.FORBIDDEN ||
        response.status === HttpStatus.TOO_MANY_REQUESTS,
    );
    const retryAfterMs = this.readRetryAfterMs(response.headers);

    if (response.status === HttpStatus.UNAUTHORIZED) {
      return {
        kind: 'auth',
        status: response.status,
        message: `${message} GitHub token authentication failed.`,
        retryAfterMs: null,
        rateLimitStatus,
      };
    }

    if (response.status === HttpStatus.TOO_MANY_REQUESTS) {
      return {
        kind: 'rate-limit',
        status: response.status,
        message: `${message} GitHub returned 429.`,
        retryAfterMs,
        rateLimitStatus,
      };
    }

    if (
      response.status === HttpStatus.FORBIDDEN &&
      loweredMessage.includes('secondary rate limit')
    ) {
      return {
        kind: 'secondary-rate-limit',
        status: response.status,
        message: `${message} GitHub secondary rate limit triggered.`,
        retryAfterMs,
        rateLimitStatus,
      };
    }

    if (
      response.status === HttpStatus.FORBIDDEN &&
      loweredMessage.includes('abuse detection')
    ) {
      return {
        kind: 'abuse-detection',
        status: response.status,
        message: `${message} GitHub abuse detection triggered.`,
        retryAfterMs,
        rateLimitStatus,
      };
    }

    if (
      response.status === HttpStatus.FORBIDDEN &&
      (loweredMessage.includes('rate limit') ||
        response.headers.get('x-ratelimit-remaining') === '0')
    ) {
      return {
        kind: 'rate-limit',
        status: response.status,
        message: `${message} GitHub rate limit reached.`,
        retryAfterMs,
        rateLimitStatus,
      };
    }

    return {
      kind: 'http',
      status: response.status,
      message,
      retryAfterMs,
      rateLimitStatus,
    };
  }

  private parseNetworkError(
    error: unknown,
    requestType: GitHubRequestType,
  ): GitHubRequestError | null {
    const message = error instanceof Error ? error.message : '';
    const lowered = message.toLowerCase();

    if (
      lowered.includes('fetch failed') ||
      lowered.includes('socket hang up') ||
      lowered.includes('ecconnreset') ||
      lowered.includes('etimedout') ||
      lowered.includes('timeout') ||
      lowered.includes('network')
    ) {
      return {
        kind: 'transient-network',
        status: null,
        message:
          error instanceof Error
            ? error.message
            : 'Unknown transient GitHub network error.',
        retryAfterMs: 3_000,
        rateLimitStatus: {
          tokenIndex: null,
          requestType,
          limited: false,
          remaining: null,
          resetAt: null,
          retryAfterMs: 3_000,
        },
      };
    }

    return null;
  }

  private async handleRequestError({
    attempt,
    maxAttempts,
    errorInfo,
    path,
    selection,
    context,
    onRetry,
    onRateLimit,
  }: {
    attempt: number;
    maxAttempts: number;
    errorInfo: GitHubRequestError;
    path: string;
    selection: ReturnType<GitHubTokenPool['selectToken']>;
    context?: GitHubRequestContext;
    onRetry?: () => void;
    onRateLimit?: () => void;
  }) {
    switch (errorInfo.kind) {
      case 'auth':
        this.tokenPool.markAuthFailure(selection.tokenIndex);
        context?.trackDisabledTokenCount(
          this.tokenPool.getDiagnostics().disabledTokenCount,
        );
        this.logger.warn(
          `GitHub token authentication failed. tokenIndex=${selection.tokenIndex ?? 'anonymous'} path=${path}`,
        );
        if (attempt < maxAttempts) {
          context?.trackRetry();
          onRetry?.();
          return true;
        }
        return false;

      case 'rate-limit':
      case 'secondary-rate-limit':
      case 'abuse-detection':
        this.tokenPool.markRateLimited(selection.tokenIndex, errorInfo.rateLimitStatus);
        context?.trackRateLimitHit();
        onRateLimit?.();
        context?.trackDisabledTokenCount(
          this.tokenPool.getDiagnostics().disabledTokenCount,
        );
        this.logger.warn(
          `GitHub ${errorInfo.kind} on ${path}. tokenIndex=${selection.tokenIndex ?? 'anonymous'} attempt=${attempt}/${maxAttempts} poolSize=${selection.diagnostics.tokenPoolSize}`,
        );
        if (attempt < maxAttempts) {
          context?.trackRetry();
          onRetry?.();
          await this.delay(errorInfo.retryAfterMs ?? this.buildRetryDelay(attempt));
          return true;
        }
        return false;

      case 'http':
        return false;

      default:
        return false;
    }
  }

  private readRateLimitStatus(
    headers: Headers,
    tokenIndex: number | null,
    requestType: GitHubRequestType,
    limited: boolean,
  ): Omit<GitHubRateLimitStatus, 'updatedAt'> {
    const remainingRaw = headers.get('x-ratelimit-remaining');
    const resetRaw = headers.get('x-ratelimit-reset');

    return {
      tokenIndex,
      requestType,
      limited,
      remaining:
        remainingRaw !== null && remainingRaw !== ''
          ? Number.parseInt(remainingRaw, 10)
          : null,
      resetAt:
        resetRaw !== null && resetRaw !== ''
          ? new Date(Number.parseInt(resetRaw, 10) * 1_000).toISOString()
          : null,
      retryAfterMs: this.readRetryAfterMs(headers),
    };
  }

  private readRetryAfterMs(headers: Headers) {
    const retryAfter = headers.get('retry-after');

    if (!retryAfter) {
      return null;
    }

    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000;
    }

    return null;
  }

  private buildRetryDelay(attempt: number) {
    return Math.min(2_000 * attempt, 15_000);
  }

  private resolveMaxAttempts() {
    return Math.max(
      DEFAULT_MAX_ATTEMPTS,
      Math.min(this.tokenPool.getDiagnostics().tokenPoolSize + 1, 6),
    );
  }

  private toPublicException(errorInfo: GitHubRequestError) {
    if (
      errorInfo.kind === 'rate-limit' ||
      errorInfo.kind === 'secondary-rate-limit' ||
      errorInfo.kind === 'abuse-detection' ||
      errorInfo.kind === 'transient-network'
    ) {
      return new ServiceUnavailableException(
        `${errorInfo.message} GitHub request will benefit from a larger token pool or a retry after cooldown.`,
      );
    }

    if (errorInfo.status) {
      return new HttpException(errorInfo.message, errorInfo.status);
    }

    return new ServiceUnavailableException(errorInfo.message);
  }

  private delay(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
