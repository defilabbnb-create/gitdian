import { Injectable } from '@nestjs/common';
import { Prisma, RepositorySourceType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FastFilterService } from '../fast-filter/fast-filter.service';
import { JobLogService } from '../job-log/job-log.service';
import { SettingsService } from '../settings/settings.service';
import { GitHubClient } from './github.client';
import {
  FetchRepositoriesDto,
  GitHubFetchMode,
} from './dto/fetch-repositories.dto';
import {
  GitHubCommitItem,
  GitHubContentItem,
  GitHubIssueItem,
  GitHubRepository,
} from './types/github.types';

type FetchResultItem = {
  githubRepoId: string;
  fullName: string;
  action: 'created' | 'updated' | 'failed';
  message: string;
};

@Injectable()
export class GitHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly githubClient: GitHubClient,
    private readonly fastFilterService: FastFilterService,
    private readonly jobLogService: JobLogService,
    private readonly settingsService: SettingsService,
  ) {}

  async fetchRepositories(dto: FetchRepositoriesDto) {
    const job = await this.jobLogService.startJob({
      jobName: 'github.fetch_repositories',
      payload: {
        query: dto.query ?? null,
        mode: dto.mode ?? null,
        sort: dto.sort ?? null,
        order: dto.order ?? null,
        perPage: dto.perPage ?? null,
        page: dto.page ?? 1,
        starMin: dto.starMin ?? null,
        starMax: dto.starMax ?? null,
        pushedAfter: dto.pushedAfter ?? null,
        language: dto.language ?? null,
        runFastFilter: dto.runFastFilter ?? null,
      },
    });

    try {
      const data = await this.fetchRepositoriesDirect(dto);

      await this.jobLogService.completeJob({
        jobId: job.id,
        result: {
          mode: data.mode,
          requested: data.requested,
          processed: data.processed,
          created: data.created,
          updated: data.updated,
          failed: data.failed,
          items: data.items.slice(0, 20),
        },
      });

      return data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown GitHub fetch error.';

      await this.jobLogService.failJob({
        jobId: job.id,
        errorMessage: message,
      });

      throw error;
    }
  }

  async fetchRepositoriesDirect(dto: FetchRepositoriesDto) {
    const settings = await this.settingsService.getSettings();
    const resolvedMode = dto.mode ?? settings.github.search.defaultMode;
    const resolvedSort = dto.sort ?? settings.github.search.defaultSort;
    const resolvedOrder = dto.order ?? settings.github.search.defaultOrder;
    const resolvedPerPage = dto.perPage ?? settings.github.search.defaultPerPage;
    const resolvedStarMin =
      dto.starMin ?? settings.github.search.defaultStarMin ?? undefined;
    const resolvedStarMax =
      dto.starMax ?? settings.github.search.defaultStarMax ?? undefined;
    const resolvedRecencyDate =
      dto.pushedAfter ??
      this.toDateStringFromDays(
        settings.github.search.defaultPushedAfterDays ??
          (resolvedMode === GitHubFetchMode.CREATED ? 30 : null),
      );
    const runFastFilter =
      dto.runFastFilter ?? settings.github.fetch.runFastFilterByDefault;
    const searchQuery = this.buildSearchQuery({
      ...dto,
      mode: resolvedMode,
      starMin: resolvedStarMin,
      starMax: resolvedStarMax,
      pushedAfter: resolvedRecencyDate,
    });
    const searchResponse = await this.githubClient.searchRepositories({
      q: searchQuery,
      sort: resolvedSort,
      order: resolvedOrder,
      per_page: resolvedPerPage,
      page: dto.page,
    });

    let created = 0;
    let updated = 0;
    let failed = 0;

    const items: FetchResultItem[] = [];

    for (const item of searchResponse.items) {
      try {
        const result = await this.fetchAndPersistRepository(item, runFastFilter);

        if (result.action === 'created') {
          created += 1;
        } else if (result.action === 'updated') {
          updated += 1;
        }

        items.push(result);
      } catch (error) {
        failed += 1;
        items.push({
          githubRepoId: String(item.id),
          fullName: item.full_name,
          action: 'failed',
          message: error instanceof Error ? error.message : 'Unknown error.',
        });
      }
    }

    return {
      mode: resolvedMode,
      requested: resolvedPerPage,
      processed: items.length,
      created,
      updated,
      failed,
      items,
    };
  }

  private async fetchAndPersistRepository(
    searchItem: GitHubRepository,
    runFastFilter = false,
  ) {
    const [owner, repoName] = searchItem.full_name.split('/');

    const repository = await this.githubClient.getRepository(owner, repoName);
    const [readme, rootContents, commits, issues] = await Promise.all([
      this.githubClient.getReadme(owner, repoName),
      this.githubClient.getRootContents(owner, repoName),
      this.githubClient.getRecentCommits(owner, repoName, 15),
      this.githubClient.getRecentIssues(owner, repoName, 10),
    ]);

    const existingRepository = await this.prisma.repository.findUnique({
      where: {
        githubRepoId: BigInt(repository.id),
      },
      select: {
        id: true,
      },
    });

    const repositoryCreateData = this.toRepositoryCreateInput(repository);
    const repositoryUpdateData = this.toRepositoryUpdateInput(repository);
    const contentCreateData = this.toRepositoryContentCreateInput(
      readme?.content,
      readme?.encoding,
      rootContents,
      commits,
      issues,
    );
    const contentUpdateData = this.toRepositoryContentUpdateInput(
      readme?.content,
      readme?.encoding,
      rootContents,
      commits,
      issues,
    );

    if (existingRepository) {
      await this.prisma.repository.update({
        where: { id: existingRepository.id },
        data: repositoryUpdateData,
      });

      await this.prisma.repositoryContent.upsert({
        where: {
          repositoryId: existingRepository.id,
        },
        update: contentUpdateData,
        create: {
          repositoryId: existingRepository.id,
          ...contentCreateData,
        },
      });

      const message = await this.buildResultMessage(
        existingRepository.id,
        'Repository synchronized successfully.',
        runFastFilter,
      );

      return {
        githubRepoId: String(repository.id),
        fullName: repository.full_name,
        action: 'updated' as const,
        message,
      };
    }

    const createdRepository = await this.prisma.repository.create({
      data: repositoryCreateData,
      select: {
        id: true,
      },
    });

    await this.prisma.repositoryContent.create({
      data: {
        repositoryId: createdRepository.id,
        ...contentCreateData,
      },
    });

    const message = await this.buildResultMessage(
      createdRepository.id,
      'Repository fetched and stored successfully.',
      runFastFilter,
    );

    return {
      githubRepoId: String(repository.id),
      fullName: repository.full_name,
      action: 'created' as const,
      message,
    };
  }

  private async buildResultMessage(
    repositoryId: string,
    baseMessage: string,
    runFastFilter: boolean,
  ) {
    if (!runFastFilter) {
      return baseMessage;
    }

    try {
      const result = await this.fastFilterService.evaluateRepository(repositoryId);
      return `${baseMessage} Fast filter completed with level ${result.roughLevel}.`;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown fast filter error.';
      return `${baseMessage} Fast filter failed: ${reason}`;
    }
  }

  private buildSearchQuery(dto: FetchRepositoriesDto) {
    const parts: string[] = [];

    if (dto.query?.trim()) {
      parts.push(dto.query.trim());
    }

    const starMin = dto.starMin;
    const starMax = dto.starMax;

    if (typeof starMin === 'number' && typeof starMax === 'number') {
      parts.push(`stars:${starMin}..${starMax}`);
    } else if (typeof starMin === 'number') {
      parts.push(`stars:>=${starMin}`);
    } else if (typeof starMax === 'number') {
      parts.push(`stars:<=${starMax}`);
    }

    if (dto.mode === GitHubFetchMode.CREATED && dto.pushedAfter) {
      parts.push(`created:>=${dto.pushedAfter}`);
    } else if (dto.pushedAfter) {
      parts.push(`pushed:>=${dto.pushedAfter}`);
    }

    if (dto.language?.trim()) {
      parts.push(`language:${dto.language.trim()}`);
    }

    if (parts.length === 0) {
      parts.push('stars:>0');
    }

    return parts.join(' ');
  }

  private toDateStringFromDays(days: number | null) {
    if (typeof days !== 'number' || days <= 0) {
      return undefined;
    }

    const date = new Date();
    date.setDate(date.getDate() - days);

    return date.toISOString().slice(0, 10);
  }

  private toRepositoryCreateInput(
    repository: GitHubRepository,
  ): Prisma.RepositoryUncheckedCreateInput {
    return {
      githubRepoId: BigInt(repository.id),
      fullName: repository.full_name,
      name: repository.name,
      ownerLogin: repository.owner.login,
      htmlUrl: repository.html_url,
      description: repository.description,
      homepage: repository.homepage,
      language: repository.language,
      license: repository.license?.spdx_id ?? repository.license?.name ?? null,
      defaultBranch: repository.default_branch,
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      watchers: repository.watchers_count,
      openIssues: repository.open_issues_count,
      topics: repository.topics ?? [],
      archived: repository.archived,
      disabled: repository.disabled,
      hasWiki: repository.has_wiki,
      hasIssues: repository.has_issues,
      createdAtGithub: new Date(repository.created_at),
      updatedAtGithub: new Date(repository.updated_at),
      pushedAtGithub: repository.pushed_at ? new Date(repository.pushed_at) : null,
      sourceType: RepositorySourceType.GITHUB_SEARCH,
    };
  }

  private toRepositoryUpdateInput(repository: GitHubRepository): Prisma.RepositoryUpdateInput {
    return {
      githubRepoId: BigInt(repository.id),
      fullName: repository.full_name,
      name: repository.name,
      ownerLogin: repository.owner.login,
      htmlUrl: repository.html_url,
      description: repository.description,
      homepage: repository.homepage,
      language: repository.language,
      license: repository.license?.spdx_id ?? repository.license?.name ?? null,
      defaultBranch: repository.default_branch,
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      watchers: repository.watchers_count,
      openIssues: repository.open_issues_count,
      topics: repository.topics ?? [],
      archived: repository.archived,
      disabled: repository.disabled,
      hasWiki: repository.has_wiki,
      hasIssues: repository.has_issues,
      createdAtGithub: new Date(repository.created_at),
      updatedAtGithub: new Date(repository.updated_at),
      pushedAtGithub: repository.pushed_at ? new Date(repository.pushed_at) : null,
      sourceType: RepositorySourceType.GITHUB_SEARCH,
    };
  }

  private toRepositoryContentCreateInput(
    readmeContent?: string,
    readmeEncoding?: string,
    rootContents: GitHubContentItem[] = [],
    commits: GitHubCommitItem[] = [],
    issues: GitHubIssueItem[] = [],
  ): Omit<Prisma.RepositoryContentUncheckedCreateInput, 'repositoryId'> {
    const rootFileNames = rootContents.map((item) => item.name);
    const normalizedReadme = this.decodeReadme(readmeContent, readmeEncoding);
    const packageManifests = rootContents
      .filter((item) =>
        ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml'].includes(
          item.name,
        ),
      )
      .map((item) => item.name);

    return {
      readmeText: normalizedReadme,
      fileTree: rootContents.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size ?? null,
      })) as Prisma.InputJsonValue,
      rootFiles: rootFileNames as Prisma.InputJsonValue,
      recentCommits: commits.map((item) => ({
        sha: item.sha,
        message: item.commit.message,
        authorLogin: item.author?.login ?? null,
        authorName: item.commit.author.name,
        committedAt: item.commit.author.date,
        htmlUrl: item.html_url,
      })) as Prisma.InputJsonValue,
      recentIssues: issues.map((item) => ({
        id: item.id,
        number: item.number,
        title: item.title,
        state: item.state,
        authorLogin: item.user?.login ?? null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        htmlUrl: item.html_url,
      })) as Prisma.InputJsonValue,
      hasDockerfile: rootFileNames.includes('Dockerfile'),
      hasCompose: rootFileNames.some((name) =>
        ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].includes(
          name,
        ),
      ),
      hasCi:
        rootFileNames.includes('.github') ||
        rootFileNames.includes('.gitlab-ci.yml') ||
        rootFileNames.includes('Jenkinsfile'),
      hasTests: rootFileNames.some((name) =>
        ['test', 'tests', '__tests__', 'spec'].includes(name.toLowerCase()),
      ),
      hasDocs: rootFileNames.some((name) =>
        ['docs', 'README.md', 'README', 'readme.md'].includes(name),
      ),
      hasEnvExample: rootFileNames.some((name) => name.startsWith('.env.example')),
      packageManifests: packageManifests as Prisma.InputJsonValue,
      fetchedAt: new Date(),
    };
  }

  private toRepositoryContentUpdateInput(
    readmeContent?: string,
    readmeEncoding?: string,
    rootContents: GitHubContentItem[] = [],
    commits: GitHubCommitItem[] = [],
    issues: GitHubIssueItem[] = [],
  ): Prisma.RepositoryContentUpdateInput {
    const rootFileNames = rootContents.map((item) => item.name);
    const normalizedReadme = this.decodeReadme(readmeContent, readmeEncoding);
    const packageManifests = rootContents
      .filter((item) =>
        ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml'].includes(
          item.name,
        ),
      )
      .map((item) => item.name);

    return {
      readmeText: normalizedReadme,
      fileTree: rootContents.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size ?? null,
      })) as Prisma.InputJsonValue,
      rootFiles: rootFileNames as Prisma.InputJsonValue,
      recentCommits: commits.map((item) => ({
        sha: item.sha,
        message: item.commit.message,
        authorLogin: item.author?.login ?? null,
        authorName: item.commit.author.name,
        committedAt: item.commit.author.date,
        htmlUrl: item.html_url,
      })) as Prisma.InputJsonValue,
      recentIssues: issues.map((item) => ({
        id: item.id,
        number: item.number,
        title: item.title,
        state: item.state,
        authorLogin: item.user?.login ?? null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        htmlUrl: item.html_url,
      })) as Prisma.InputJsonValue,
      hasDockerfile: rootFileNames.includes('Dockerfile'),
      hasCompose: rootFileNames.some((name) =>
        ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].includes(
          name,
        ),
      ),
      hasCi:
        rootFileNames.includes('.github') ||
        rootFileNames.includes('.gitlab-ci.yml') ||
        rootFileNames.includes('Jenkinsfile'),
      hasTests: rootFileNames.some((name) =>
        ['test', 'tests', '__tests__', 'spec'].includes(name.toLowerCase()),
      ),
      hasDocs: rootFileNames.some((name) =>
        ['docs', 'README.md', 'README', 'readme.md'].includes(name),
      ),
      hasEnvExample: rootFileNames.some((name) => name.startsWith('.env.example')),
      packageManifests: packageManifests as Prisma.InputJsonValue,
      fetchedAt: new Date(),
    };
  }

  private decodeReadme(content?: string, encoding?: string) {
    if (!content) {
      return null;
    }

    if (encoding === 'base64') {
      return Buffer.from(content, 'base64').toString('utf8');
    }

    return content;
  }
}
