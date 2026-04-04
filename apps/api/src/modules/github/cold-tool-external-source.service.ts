import { Injectable, Logger } from '@nestjs/common';

export type ExternalSourceHit = {
  source: 'npm' | 'crates';
  query: string;
  packageName: string;
  repositoryFullName: string;
  packageUrl: string | null;
};

@Injectable()
export class ColdToolExternalSourceService {
  private readonly logger = new Logger(ColdToolExternalSourceService.name);

  async discoverRepositoryFullNames(args: {
    queries: string[];
    perQueryLimit: number;
    concurrency: number;
    onQueryProgress?: (progress: {
      completedQueries: number;
      totalQueries: number;
      query: string;
      hitCount: number;
    }) => Promise<void> | void;
  }) {
    const hits: ExternalSourceHit[] = [];
    const uniqueQueries = [...new Set(args.queries.map((item) => item.trim()).filter(Boolean))];
    let completedQueries = 0;

    await this.runWithConcurrency(uniqueQueries, args.concurrency, async (query) => {
      const [npmHits, crateHits] = await Promise.all([
        this.searchNpm(query, args.perQueryLimit),
        this.searchCrates(query, args.perQueryLimit),
      ]);
      hits.push(...npmHits, ...crateHits);
      completedQueries += 1;
      await args.onQueryProgress?.({
        completedQueries,
        totalQueries: uniqueQueries.length,
        query,
        hitCount: npmHits.length + crateHits.length,
      });
    });

    const deduped = new Map<string, ExternalSourceHit[]>();
    for (const hit of hits) {
      const existing = deduped.get(hit.repositoryFullName) ?? [];
      existing.push(hit);
      deduped.set(hit.repositoryFullName, existing);
    }

    return {
      hits,
      byRepositoryFullName: deduped,
    };
  }

  private async searchNpm(query: string, limit: number) {
    const url = new URL('https://registry.npmjs.org/-/v1/search');
    url.searchParams.set('text', query);
    url.searchParams.set('size', String(Math.max(1, Math.min(limit, 20))));
    url.searchParams.set('from', '0');

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (compatible; GitDianColdToolBot/1.0; +https://local3000.luckytad.vip)',
        },
      });
      if (!response.ok) {
        return [] as ExternalSourceHit[];
      }

      const payload = (await response.json()) as {
        objects?: Array<{
          package?: {
            name?: string;
            links?: {
              repository?: string;
              npm?: string;
              homepage?: string;
            };
          };
        }>;
      };

      return (payload.objects ?? [])
        .map((item) => {
          const packageName = item.package?.name?.trim() ?? '';
          const repositoryFullName =
            this.parseGitHubFullName(item.package?.links?.repository) ??
            this.parseGitHubFullName(item.package?.links?.homepage) ??
            null;
          if (!packageName || !repositoryFullName) {
            return null;
          }

          return {
            source: 'npm' as const,
            query,
            packageName,
            repositoryFullName,
            packageUrl: item.package?.links?.npm?.trim() ?? null,
          };
        })
        .filter(Boolean) as ExternalSourceHit[];
    } catch (error) {
      this.logger.debug(
        `cold_tool_external_npm_failed query=${query} reason=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return [];
    }
  }

  private async searchCrates(query: string, limit: number) {
    const url = new URL('https://crates.io/api/v1/crates');
    url.searchParams.set('q', query);
    url.searchParams.set('per_page', String(Math.max(1, Math.min(limit, 20))));
    url.searchParams.set('page', '1');

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (compatible; GitDianColdToolBot/1.0; +https://local3000.luckytad.vip)',
        },
      });
      if (!response.ok) {
        return [] as ExternalSourceHit[];
      }

      const payload = (await response.json()) as {
        crates?: Array<{
          id?: string;
          repository?: string | null;
          homepage?: string | null;
        }>;
      };

      return (payload.crates ?? [])
        .map((item) => {
          const packageName = item.id?.trim() ?? '';
          const repositoryFullName =
            this.parseGitHubFullName(item.repository) ??
            this.parseGitHubFullName(item.homepage) ??
            null;
          if (!packageName || !repositoryFullName) {
            return null;
          }

          return {
            source: 'crates' as const,
            query,
            packageName,
            repositoryFullName,
            packageUrl: packageName
              ? `https://crates.io/crates/${encodeURIComponent(packageName)}`
              : null,
          };
        })
        .filter(Boolean) as ExternalSourceHit[];
    } catch (error) {
      this.logger.debug(
        `cold_tool_external_crates_failed query=${query} reason=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return [];
    }
  }

  private parseGitHubFullName(value: string | null | undefined) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return null;
    }

    const cleaned = normalized
      .replace(/^git\+/, '')
      .replace(/\.git$/i, '')
      .replace(/^git@github\.com:/i, 'https://github.com/');

    try {
      const url = new URL(cleaned);
      if (url.hostname !== 'github.com') {
        return null;
      }

      const segments = url.pathname
        .split('/')
        .map((item) => item.trim())
        .filter(Boolean);
      if (segments.length < 2) {
        return null;
      }

      return `${segments[0]}/${segments[1]}`;
    } catch {
      const sshMatch = cleaned.match(/^github\.com[:/]+([^/]+)\/([^/]+)$/i);
      if (sshMatch) {
        return `${sshMatch[1]}/${sshMatch[2]}`;
      }

      return null;
    }
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ) {
    if (!items.length) {
      return;
    }

    let cursor = 0;
    const runnerCount = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(
      Array.from({ length: runnerCount }, async () => {
        while (cursor < items.length) {
          const currentIndex = cursor;
          cursor += 1;
          await worker(items[currentIndex]);
        }
      }),
    );
  }
}
