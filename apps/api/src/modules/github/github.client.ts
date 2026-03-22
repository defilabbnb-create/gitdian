import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
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
};

@Injectable()
export class GitHubClient {
  private readonly baseUrl =
    process.env.GITHUB_API_BASE_URL || 'https://api.github.com';

  private readonly token = process.env.GITHUB_TOKEN;

  async healthCheck() {
    const startedAt = Date.now();

    try {
      await this.request<{ resources?: unknown }>('/rate_limit');

      return {
        ok: true,
        hasToken: Boolean(this.token),
        latencyMs: Date.now() - startedAt,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        hasToken: Boolean(this.token),
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown GitHub health check error.',
      };
    }
  }

  async searchRepositories(params: {
    q: string;
    sort?: string;
    order?: string;
    per_page?: number;
    page?: number;
  }) {
    return this.request<GitHubSearchResponse>('/search/repositories', {
      params,
    });
  }

  async getRepository(owner: string, repo: string) {
    return this.request<GitHubRepository>(`/repos/${owner}/${repo}`);
  }

  async getReadme(owner: string, repo: string) {
    return this.request<GitHubReadmeResponse | null>(`/repos/${owner}/${repo}/readme`, {
      allowNotFound: true,
    });
  }

  async getRootContents(owner: string, repo: string) {
    const response = await this.request<GitHubContentItem[] | GitHubContentItem>(
      `/repos/${owner}/${repo}/contents`,
    );

    return Array.isArray(response) ? response : [response];
  }

  async getRecentCommits(owner: string, repo: string, perPage = 10) {
    return this.request<GitHubCommitItem[]>(`/repos/${owner}/${repo}/commits`, {
      params: {
        per_page: perPage,
      },
    });
  }

  async getRecentIssues(owner: string, repo: string, perPage = 10) {
    const issues = await this.request<GitHubIssueItem[]>(`/repos/${owner}/${repo}/issues`, {
      params: {
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: perPage,
      },
    });

    return issues.filter((item) => !item.pull_request);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options.params);
    const response = await fetch(url, {
      headers: this.buildHeaders(),
    });

    if (options.allowNotFound && response.status === HttpStatus.NOT_FOUND) {
      return null as T;
    }

    if (!response.ok) {
      await this.throwGitHubError(response);
    }

    return (await response.json()) as T;
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

  private buildHeaders() {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'gitdian-api',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    // Anonymous requests are allowed, but GitHub rate limits them much more aggressively.
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  private async throwGitHubError(response: Response): Promise<never> {
    let payload: { message?: string } | null = null;

    try {
      payload = (await response.json()) as { message?: string };
    } catch {
      payload = null;
    }

    const message =
      payload?.message ||
      `GitHub API request failed with status ${response.status}.`;

    if (
      response.status === HttpStatus.FORBIDDEN ||
      response.status === HttpStatus.TOO_MANY_REQUESTS
    ) {
      throw new ServiceUnavailableException(
        `${message} GitHub may be rate limiting this request. Configure GITHUB_TOKEN to increase limits.`,
      );
    }

    throw new HttpException(message, response.status);
  }
}
