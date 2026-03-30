import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { JobStatus, Prisma, RepositorySourceType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  IdeaSnapshotOutput,
  IdeaSnapshotService,
} from '../analysis/idea-snapshot.service';
import {
  IdeaMainCategory,
  normalizeIdeaMainCategory,
} from '../analysis/idea-snapshot-taxonomy';
import { FastFilterService } from '../fast-filter/fast-filter.service';
import { JobLogService } from '../job-log/job-log.service';
import { QUEUE_JOB_TYPES } from '../queue/queue.constants';
import { QueueService } from '../queue/queue.service';
import { SettingsService } from '../settings/settings.service';
import {
  ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY,
  FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY,
} from '../analysis/helpers/frozen-analysis-pool.types';
import {
  evaluateAnalysisPoolIntakeGate,
  readAnalysisPoolFreezeState,
  readFrozenAnalysisPoolBatchSnapshot,
} from '../analysis/helpers/frozen-analysis-pool.helper';
import { BackfillCreatedRepositoriesDto } from './dto/backfill-created-repositories.dto';
import {
  FetchRepositoriesDto,
  GitHubFetchMode,
} from './dto/fetch-repositories.dto';
import {
  GitHubClient,
  GitHubRequestContext,
} from './github.client';
import {
  GitHubCommitItem,
  GitHubContentItem,
  GitHubIssueItem,
  GitHubIdeaSnapshotJobPayload,
  GitHubRepository,
} from './types/github.types';

type FetchResultItem = {
  repositoryId: string;
  githubRepoId: string;
  fullName: string;
  action: 'created' | 'updated' | 'failed';
  message: string;
};

type FetchExecutionSummary = {
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

type FetchRepositoriesResult = {
  mode: GitHubFetchMode;
  requested: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  items: FetchResultItem[];
  searchTotalCount: number;
  requestStats: FetchExecutionSummary;
};

type CreatedSearchWindow = {
  searchWindowStart: string;
  searchWindowEnd: string;
  label: string;
  depth: number;
};

type BackfillHeartbeatPayload = {
  currentSearchWindow: {
    label: string;
    searchWindowStart: string;
    searchWindowEnd: string;
  };
  currentWindowSearchDepth: number;
  currentWindowTotalCount: number | null;
  scannedWindows: number;
  fetchedLinks: number;
  snapshotQueued: number;
  deepAnalysisQueued: number;
  promisingCandidates: number;
  recentRetryCount: number;
  recentRateLimitHits: number;
  runtimeUpdatedAt: string;
};

type QueuedRepositoryCandidateSummary = {
  repositoryIds: string[];
  snapshotQueued: number;
  deepAnalysisQueued: number;
  deepSkipped: number;
  promisingCandidates: number;
  goodIdeas: number;
  cloneIdeas: number;
  toolsCount: number;
  aiCount: number;
  infraCount: number;
  dataCount: number;
  topCategories: Array<{
    main: IdeaMainCategory;
    sub: string;
    count: number;
  }>;
  topRepositoryIds: string[];
};

type DeepRuntimeStatsState = {
  date: string;
  deepEnteredCount: number;
  deepSkippedCount: number;
  ideaExtractExecutedCount: number;
  ideaExtractSkippedCount: number;
  ideaExtractDeferredCount: number;
  ideaExtractTimeoutCount: number;
  lastIdeaExtractInflight: number;
  ideaExtractMaxInflight: number;
  updatedAt: string | null;
};

const DEEP_RUNTIME_STATS_CONFIG_KEY = 'analysis.deep.runtime_stats';

type KeywordSupplyExecutionResult = {
  group: string;
  keywords: string[];
  fetchedLinks: number;
  createdRepositories: number;
  updatedRepositories: number;
  failedRepositories: number;
  snapshotQueued: number;
  deepAnalysisQueued: number;
  promisingCandidates: number;
  goodIdeas: number;
  cloneIdeas: number;
  toolsCount: number;
  aiCount: number;
  infraCount: number;
  dataCount: number;
  topCategories: Array<{
    main: IdeaMainCategory;
    sub: string;
    count: number;
  }>;
  topRepositoryIds: string[];
  requestStats: FetchExecutionSummary;
  reposPerMinute: number;
};

type ResolvedRepositoryDecision = {
  verdict: 'GOOD' | 'OK' | 'BAD';
  action: 'BUILD' | 'CLONE' | 'IGNORE';
  createdAtGithub: Date | null;
  ideaFitScore: number | null;
  hasInsight: boolean;
  hasManualOverride: boolean;
  stars: number;
};

type RepositoryWithAnalysisContext = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
  };
}>;

type SingleAnalysisBulkEntries = Parameters<
  QueueService['enqueueSingleAnalysesBulk']
>[0];
type SingleAnalysisBulkEntry = SingleAnalysisBulkEntries[number];
type ActiveRepositoryJobState = {
  snapshotRepositoryIds: Set<string>;
  deepRepositoryIds: Set<string>;
};

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly githubClient: GitHubClient,
    private readonly fastFilterService: FastFilterService,
    private readonly ideaSnapshotService: IdeaSnapshotService,
    private readonly jobLogService: JobLogService,
    private readonly settingsService: SettingsService,
    private readonly queueService: QueueService,
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
          searchTotalCount: data.searchTotalCount,
          processed: data.processed,
          created: data.created,
          updated: data.updated,
          failed: data.failed,
          requestStats: data.requestStats,
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

  async fetchRepositoriesDirect(
    dto: FetchRepositoriesDto,
    options: {
      requestContext?: GitHubRequestContext;
    } = {},
  ): Promise<FetchRepositoriesResult> {
    const settings = await this.settingsService.getSettings();
    const resolvedMode = dto.mode ?? settings.github.search.defaultMode;
    const resolvedSort = dto.sort ?? settings.github.search.defaultSort;
    const resolvedOrder = dto.order ?? settings.github.search.defaultOrder;
    const resolvedPerPage = dto.perPage ?? settings.github.search.defaultPerPage;
    const queryIncludesExplicitTimeRange = /(^|\s)(created|pushed):/i.test(
      dto.query ?? '',
    );
    const resolvedStarMin =
      dto.starMin ?? settings.github.search.defaultStarMin ?? undefined;
    const resolvedStarMax =
      dto.starMax ?? settings.github.search.defaultStarMax ?? undefined;
    const resolvedRecencyDate =
      queryIncludesExplicitTimeRange
        ? undefined
        : dto.pushedAfter ??
      this.toDateStringFromDays(
        settings.github.search.defaultPushedAfterDays ??
          (resolvedMode === GitHubFetchMode.CREATED ? 30 : null),
      );
    const runFastFilter =
      dto.runFastFilter ?? settings.github.fetch.runFastFilterByDefault;
    const requestContext =
      options.requestContext ?? this.githubClient.createRequestContext();
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
    }, requestContext);

    let created = 0;
    let updated = 0;
    let failed = 0;

    const items: FetchResultItem[] = [];

    for (const item of searchResponse.items) {
      try {
        const result = await this.fetchAndPersistRepository(
          item,
          runFastFilter,
          requestContext,
        );

        if (result.action === 'created') {
          created += 1;
        } else if (result.action === 'updated') {
          updated += 1;
        }

        items.push(result);
      } catch (error) {
        failed += 1;
        items.push({
          repositoryId: '',
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
      searchTotalCount: searchResponse.total_count ?? items.length,
      requestStats: requestContext.toSummary(this.githubClient.getDiagnostics()),
    };
  }

  async backfillCreatedRepositoriesDirect(
    dto: BackfillCreatedRepositoriesDto,
    options: {
      parentJobId?: string;
      onProgress?: (progress: number) => Promise<void> | void;
      onHeartbeat?: (payload?: BackfillHeartbeatPayload) => Promise<void> | void;
    } = {},
  ) {
    const startedAt = Date.now();
    const dayWindows = this.buildCreatedDayWindows(
      dto.days,
      dto.startDate,
      dto.endDate,
    );
    const targetCategories = this.normalizeTargetCategories(dto.targetCategories);
    const detailedCategoryCounts = new Map<string, number>();
    const usedTokenIndexes = new Set<number>();
    const disabledTokenIndexes = new Set<number>();
    const githubDiagnostics = this.githubClient.getDiagnostics();
    const summary = {
      scannedDays: dayWindows.length,
      scannedWindows: 0,
      succeededDays: 0,
      failedDays: 0,
      fetchedLinks: 0,
      createdRepositories: 0,
      updatedRepositories: 0,
      failedRepositories: 0,
      snapshotQueued: 0,
      deepAnalysisQueued: 0,
      snapshotGenerated: 0,
      snapshotUpdated: 0,
      snapshotSkipped: 0,
      snapshotFailed: 0,
      promisingCandidates: 0,
      deepAnalyzed: 0,
      deepSucceeded: 0,
      deepFailed: 0,
      toolsCount: 0,
      aiCount: 0,
      infraCount: 0,
      dataCount: 0,
      tokenPoolSize: githubDiagnostics.tokenPoolSize,
      tokensUsed: [] as number[],
      rateLimitHits: 0,
      rotatedTokens: 0,
      disabledTokens: [] as number[],
      maxWindowDepth: 0,
      topCategories: [] as Array<{
        main: IdeaMainCategory;
        sub: string;
        count: number;
      }>,
      windowSummaries: [] as Array<Record<string, unknown>>,
    };
    const touchedRepositoryIds = new Set<string>();

    let lastWindowError: string | null = null;

    for (const [index, dayWindow] of dayWindows.entries()) {
      let daySucceeded = false;
      const resolutionContext = this.githubClient.createRequestContext();

      try {
        if (options.onHeartbeat) {
          await options.onHeartbeat();
        }
        const searchWindows = await this.resolveCreatedSearchWindows(
          dayWindow,
          dto,
          resolutionContext,
          summary,
          options.onHeartbeat,
        );
        this.mergeRequestSummary(
          summary,
          resolutionContext.toSummary(this.githubClient.getDiagnostics()),
          {
            usedTokenIndexes,
            disabledTokenIndexes,
          },
        );

        for (const searchWindow of searchWindows) {
          const windowContext = this.githubClient.createRequestContext();
          summary.scannedWindows += 1;

          try {
            if (options.onHeartbeat) {
              await options.onHeartbeat({
                currentSearchWindow: {
                  label: searchWindow.label,
                  searchWindowStart: searchWindow.searchWindowStart,
                  searchWindowEnd: searchWindow.searchWindowEnd,
                },
                currentWindowSearchDepth: searchWindow.depth,
                currentWindowTotalCount: searchWindow.windowTotalCount,
                scannedWindows: summary.scannedWindows,
                fetchedLinks: summary.fetchedLinks,
                snapshotQueued: summary.snapshotQueued,
                deepAnalysisQueued: summary.deepAnalysisQueued,
                promisingCandidates: summary.promisingCandidates,
                recentRetryCount: windowContext.toSummary(
                  this.githubClient.getDiagnostics(),
                ).retryCount,
                recentRateLimitHits: windowContext.toSummary(
                  this.githubClient.getDiagnostics(),
                ).rateLimitHits,
                runtimeUpdatedAt: new Date().toISOString(),
              });
            }
            const fetchResult = await this.fetchRepositoriesDirect(
              {
                mode: GitHubFetchMode.CREATED,
                query: this.buildCreatedWindowQuery(searchWindow),
                perPage: dto.perWindowLimit,
                page: 1,
                language: dto.language,
                starMin: dto.starMin,
                // Backfill only fetches + persists candidates.
                // Fast filter, completeness, fit, and extract run in child analysis jobs.
                runFastFilter: false,
              },
              {
                requestContext: windowContext,
              },
            );

            daySucceeded = true;
            summary.maxWindowDepth = Math.max(
              summary.maxWindowDepth,
              searchWindow.depth,
            );
            this.mergeRequestSummary(summary, fetchResult.requestStats, {
              usedTokenIndexes,
              disabledTokenIndexes,
            });

            summary.fetchedLinks += fetchResult.processed;
            summary.createdRepositories += fetchResult.created;
            summary.updatedRepositories += fetchResult.updated;
            summary.failedRepositories += fetchResult.failed;

            let windowSnapshotQueued = 0;
            let windowPromisingCandidates = 0;
            let windowDeepAnalysisQueued = 0;
            const repositoryIds = fetchResult.items
              .map((item) => item.repositoryId)
              .filter((repositoryId): repositoryId is string => Boolean(repositoryId));
            repositoryIds.forEach((repositoryId) => {
              touchedRepositoryIds.add(repositoryId);
            });

            const queuedCandidates = await this.queueRepositoryCandidates({
              repositoryIds,
              windowDate: searchWindow.label,
              runIdeaSnapshot: dto.runIdeaSnapshot,
              runFastFilter: dto.runFastFilter,
              runDeepAnalysis: dto.runDeepAnalysis,
              deepAnalysisOnlyIfPromising: dto.deepAnalysisOnlyIfPromising,
              targetCategories,
              parentJobId: options.parentJobId ?? null,
              triggeredBy: 'backfill',
              fromBackfill: true,
            });

            queuedCandidates.repositoryIds.forEach((repositoryId) => {
              touchedRepositoryIds.add(repositoryId);
            });
            queuedCandidates.topCategories.forEach((category) => {
              const categoryKey = `${category.main}/${category.sub}`;
              detailedCategoryCounts.set(
                categoryKey,
                (detailedCategoryCounts.get(categoryKey) ?? 0) + category.count,
              );
            });

            summary.snapshotQueued += queuedCandidates.snapshotQueued;
            summary.snapshotGenerated += queuedCandidates.snapshotQueued;
            windowSnapshotQueued += queuedCandidates.snapshotQueued;
            summary.deepAnalysisQueued += queuedCandidates.deepAnalysisQueued;
            summary.deepAnalyzed += queuedCandidates.deepAnalysisQueued;
            windowDeepAnalysisQueued += queuedCandidates.deepAnalysisQueued;
            summary.promisingCandidates += queuedCandidates.promisingCandidates;
            windowPromisingCandidates += queuedCandidates.promisingCandidates;
            summary.toolsCount += queuedCandidates.toolsCount;
            summary.aiCount += queuedCandidates.aiCount;
            summary.infraCount += queuedCandidates.infraCount;
            summary.dataCount += queuedCandidates.dataCount;

            summary.windowSummaries.push({
              date: searchWindow.label,
              status: 'success',
              searchWindowStart: searchWindow.searchWindowStart,
              searchWindowEnd: searchWindow.searchWindowEnd,
              windowDepth: searchWindow.depth,
              windowTotalCount: fetchResult.searchTotalCount,
              processed: fetchResult.processed,
              created: fetchResult.created,
              updated: fetchResult.updated,
              failed: fetchResult.failed,
              snapshotQueued: windowSnapshotQueued,
              promisingCandidates: windowPromisingCandidates,
              deepAnalysisQueued: windowDeepAnalysisQueued,
              tokenPoolSize: fetchResult.requestStats.tokenPoolSize,
              tokenIndexesUsed: fetchResult.requestStats.tokensUsed,
              retryCount: fetchResult.requestStats.retryCount,
              rateLimitHits: fetchResult.requestStats.rateLimitHits,
              disabledTokenCount: fetchResult.requestStats.disabledTokenCount,
            });

            if (options.onHeartbeat) {
              await options.onHeartbeat({
                currentSearchWindow: {
                  label: searchWindow.label,
                  searchWindowStart: searchWindow.searchWindowStart,
                  searchWindowEnd: searchWindow.searchWindowEnd,
                },
                currentWindowSearchDepth: searchWindow.depth,
                currentWindowTotalCount: fetchResult.searchTotalCount,
                scannedWindows: summary.scannedWindows,
                fetchedLinks: summary.fetchedLinks,
                snapshotQueued: summary.snapshotQueued,
                deepAnalysisQueued: summary.deepAnalysisQueued,
                promisingCandidates: summary.promisingCandidates,
                recentRetryCount: fetchResult.requestStats.retryCount,
                recentRateLimitHits: fetchResult.requestStats.rateLimitHits,
                runtimeUpdatedAt: new Date().toISOString(),
              });
            }
          } catch (error) {
            const requestSummary = windowContext.toSummary(
              this.githubClient.getDiagnostics(),
            );
            this.mergeRequestSummary(summary, requestSummary, {
              usedTokenIndexes,
              disabledTokenIndexes,
            });

            lastWindowError =
              error instanceof Error
                ? error.message
                : 'Unknown backfill window error.';

            this.logger.warn(
              `Created backfill window failed ${searchWindow.searchWindowStart}..${searchWindow.searchWindowEnd} depth=${searchWindow.depth} error=${lastWindowError}`,
            );

            summary.windowSummaries.push({
              date: searchWindow.label,
              status: 'failed',
              searchWindowStart: searchWindow.searchWindowStart,
              searchWindowEnd: searchWindow.searchWindowEnd,
              windowDepth: searchWindow.depth,
              retryCount: requestSummary.retryCount,
              rateLimitHits: requestSummary.rateLimitHits,
              disabledTokenCount: requestSummary.disabledTokenCount,
              tokenIndexesUsed: requestSummary.tokensUsed,
              error: lastWindowError,
            });
          }
        }
      } catch (error) {
        this.mergeRequestSummary(
          summary,
          resolutionContext.toSummary(this.githubClient.getDiagnostics()),
          {
            usedTokenIndexes,
            disabledTokenIndexes,
          },
        );
        lastWindowError =
          error instanceof Error ? error.message : 'Unknown backfill window error.';
        summary.windowSummaries.push({
          date: dayWindow.label,
          status: 'failed',
          searchWindowStart: dayWindow.searchWindowStart,
          searchWindowEnd: dayWindow.searchWindowEnd,
          windowDepth: dayWindow.depth,
          error: lastWindowError,
        });
      }

      if (daySucceeded) {
        summary.succeededDays += 1;
      } else {
        summary.failedDays += 1;
      }

      if (options.onProgress) {
        const progress = Math.round(((index + 1) / dayWindows.length) * 100);
        await options.onProgress(progress);
      }
    }

    if (summary.succeededDays === 0) {
      throw new Error(lastWindowError ?? 'All created backfill windows failed.');
    }

    const elapsedMinutes = Math.max((Date.now() - startedAt) / 60_000, 1 / 60);

    return {
      ...summary,
      reposPerMinute: Number((summary.fetchedLinks / elapsedMinutes).toFixed(2)),
      snapshotThroughput: Number((summary.snapshotQueued / elapsedMinutes).toFixed(2)),
      deepThroughput: Number((summary.deepAnalysisQueued / elapsedMinutes).toFixed(2)),
      targetCategories,
      tokensUsed: Array.from(usedTokenIndexes).sort((left, right) => left - right),
      disabledTokens: Array.from(disabledTokenIndexes).sort(
        (left, right) => left - right,
      ),
      topCategories: Array.from(detailedCategoryCounts.entries())
        .map(([key, count]) => {
          const [main, sub] = key.split('/');
          return {
            main: normalizeIdeaMainCategory(main),
            sub: sub || 'other',
            count,
          };
        })
        .sort((left, right) => right.count - left.count)
        .slice(0, 6),
      topRepositoryIds: Array.from(touchedRepositoryIds).slice(0, 50),
      windowSummaries: summary.windowSummaries.slice(0, 40),
    };
  }

  async runKeywordSupplyDirect(args: {
    group: string;
    keywords: string[];
    lookbackDays: number;
    perKeywordLimit: number;
    language?: string | null;
    starMin?: number | null;
    targetCategories?: string[];
    runIdeaSnapshot?: boolean;
    runFastFilter?: boolean;
    runDeepAnalysis?: boolean;
    deepAnalysisOnlyIfPromising?: boolean;
    rootJobId?: string | null;
  }): Promise<KeywordSupplyExecutionResult> {
    const requestContext = this.githubClient.createRequestContext();
    const targetCategories = this.normalizeTargetCategories(args.targetCategories);
    const repositoryIds = new Set<string>();
    const lookbackDate = this.toDateStringFromDays(args.lookbackDays);
    const startedAt = Date.now();
    let createdRepositories = 0;
    let updatedRepositories = 0;
    let failedRepositories = 0;
    let fetchedLinks = 0;
    const concurrency = this.readPositiveNumberEnv(
      'RADAR_KEYWORD_SEARCH_CONCURRENCY',
      2,
    );

    await this.runWithConcurrency(
      args.keywords.slice(0, 8),
      concurrency,
      async (keyword) => {
        try {
          const fetchResult = await this.fetchRepositoriesDirect(
            {
              mode: GitHubFetchMode.CREATED,
              query: keyword,
              perPage: args.perKeywordLimit,
              page: 1,
              language: args.language ?? undefined,
              starMin: args.starMin ?? undefined,
              pushedAfter: lookbackDate,
              runFastFilter: false,
            },
            {
              requestContext,
            },
          );

          fetchedLinks += fetchResult.processed;
          createdRepositories += fetchResult.created;
          updatedRepositories += fetchResult.updated;
          failedRepositories += fetchResult.failed;
          fetchResult.items.forEach((item) => {
            if (item.repositoryId) {
              repositoryIds.add(item.repositoryId);
            }
          });
        } catch (error) {
          this.logger.warn(
            `Keyword search fetch failed group=${args.group} keyword="${keyword}": ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      },
    );

    const queuedCandidates = await this.queueRepositoryCandidates({
      repositoryIds: Array.from(repositoryIds),
      windowDate: this.toLocalDateString(new Date()),
      runIdeaSnapshot: args.runIdeaSnapshot ?? true,
      runFastFilter: args.runFastFilter ?? true,
      runDeepAnalysis: args.runDeepAnalysis ?? true,
      deepAnalysisOnlyIfPromising: args.deepAnalysisOnlyIfPromising ?? true,
      targetCategories,
      parentJobId: args.rootJobId ?? null,
      triggeredBy: 'radar',
      fromBackfill: false,
    });

    const elapsedMinutes = Math.max((Date.now() - startedAt) / 60_000, 1 / 60);

    return {
      group: args.group,
      keywords: args.keywords,
      fetchedLinks,
      createdRepositories,
      updatedRepositories,
      failedRepositories,
      snapshotQueued: queuedCandidates.snapshotQueued,
      deepAnalysisQueued: queuedCandidates.deepAnalysisQueued,
      promisingCandidates: queuedCandidates.promisingCandidates,
      goodIdeas: queuedCandidates.goodIdeas,
      cloneIdeas: queuedCandidates.cloneIdeas,
      toolsCount: queuedCandidates.toolsCount,
      aiCount: queuedCandidates.aiCount,
      infraCount: queuedCandidates.infraCount,
      dataCount: queuedCandidates.dataCount,
      topCategories: queuedCandidates.topCategories,
      topRepositoryIds: queuedCandidates.topRepositoryIds,
      requestStats: requestContext.toSummary(this.githubClient.getDiagnostics()),
      reposPerMinute: Number((fetchedLinks / elapsedMinutes).toFixed(2)),
    };
  }

  private async queueRepositoryCandidates(args: {
    repositoryIds: string[];
    windowDate: string;
    runIdeaSnapshot: boolean;
    runFastFilter: boolean;
    runDeepAnalysis: boolean;
    deepAnalysisOnlyIfPromising: boolean;
    targetCategories: IdeaMainCategory[];
    parentJobId: string | null;
    triggeredBy: string;
    fromBackfill: boolean;
  }): Promise<QueuedRepositoryCandidateSummary> {
    const repositoryIds = Array.from(new Set(args.repositoryIds)).filter(Boolean);
    if (!repositoryIds.length) {
      return {
        repositoryIds: [],
        snapshotQueued: 0,
        deepAnalysisQueued: 0,
        deepSkipped: 0,
        promisingCandidates: 0,
        goodIdeas: 0,
        cloneIdeas: 0,
        toolsCount: 0,
        aiCount: 0,
        infraCount: 0,
        dataCount: 0,
        topCategories: [],
        topRepositoryIds: [],
      };
    }

    const activeJobState = await this.loadActiveRepositoryJobState(repositoryIds);
    const repositories = await this.prisma.repository.findMany({
      where: {
        id: {
          in: repositoryIds,
        },
      },
      include: {
        content: true,
        analysis: true,
      },
    });

    const repositoryOutcomes = repositories.map((repository) => {
        const snapshot = this.ideaSnapshotService.readIdeaSnapshot(
          repository.analysis?.ideaSnapshotJson,
        );
        const isPromisingCandidate = this.isPromisingBackfillCandidate({
          repository,
          snapshot,
          deepAnalysisOnlyIfPromising: args.deepAnalysisOnlyIfPromising,
          targetCategories: args.targetCategories,
        });
        const resolvedCategory = this.resolveBackfillCategory(repository, snapshot);
        const shouldDeepAnalyze = this.shouldDeepAnalyzeRepository({
          repository,
          snapshot,
          runDeepAnalysis: args.runDeepAnalysis,
          deepAnalysisOnlyIfPromising: args.deepAnalysisOnlyIfPromising,
          targetCategories: args.targetCategories,
        });
        const hasActiveSnapshotJob =
          activeJobState.snapshotRepositoryIds.has(repository.id);
        const hasActiveDeepJob =
          activeJobState.deepRepositoryIds.has(repository.id);
        const shouldQueueSnapshot =
          args.runIdeaSnapshot &&
          !hasActiveSnapshotJob &&
          this.shouldRefreshIdeaSnapshot(repository);
        const shouldQueueDeepAnalysisDirect =
          !shouldQueueSnapshot &&
          !hasActiveDeepJob &&
          shouldDeepAnalyze &&
          this.shouldRefreshDeepAnalysis(repository);
        const decision = this.resolveRepositoryDecision(repository, snapshot);

        return {
          repository,
          isPromisingCandidate,
          resolvedCategory,
          hasActiveDeepJob,
          shouldDeepAnalyze,
          shouldQueueSnapshot,
          shouldQueueDeepAnalysisDirect,
          decision,
        };
      });

    const bulkSnapshotTargets = repositoryOutcomes.filter(
      (outcome) => outcome.shouldQueueSnapshot,
    );
    if (args.runIdeaSnapshot && bulkSnapshotTargets.length > 0) {
      await this.queueService.enqueueIdeaSnapshotsBulk(
        bulkSnapshotTargets.map(({ repository }) => ({
          repositoryId: repository.id,
          fromBackfill: args.fromBackfill,
          windowDate: args.windowDate,
          runFastFilter: args.runFastFilter,
          runDeepAnalysis: args.runDeepAnalysis,
          deepAnalysisOnlyIfPromising: args.deepAnalysisOnlyIfPromising,
          targetCategories: args.targetCategories,
          rootJobId: args.parentJobId,
        })),
        args.triggeredBy,
        args.parentJobId ?? undefined,
      );
    }
    const deepDirectTargets = repositoryOutcomes.filter(
      (outcome) => outcome.shouldQueueDeepAnalysisDirect,
    );
    if (deepDirectTargets.length > 0) {
      await this.enqueueDeepAnalysisChildJobs(
        deepDirectTargets.map(({ repository }) =>
          this.buildDeepAnalysisChildQueueEntry({
            repositoryId: repository.id,
            windowDate: args.windowDate,
            runFastFilterByDefault: args.runFastFilter,
            parentJobId: args.parentJobId ?? undefined,
            roughLevel: repository.roughLevel,
          }),
        ),
        args.triggeredBy,
      );
    }

    const categoryCounts = new Map<string, number>();
    const deepAnalysisQueued = deepDirectTargets.length;
    let deepSkipped = 0;
    let promisingCandidates = 0;
    let goodIdeas = 0;
    let cloneIdeas = 0;
    let toolsCount = 0;
    let aiCount = 0;
    let infraCount = 0;
    let dataCount = 0;

    for (const outcome of repositoryOutcomes) {
      if (
        args.runDeepAnalysis &&
        !outcome.shouldQueueSnapshot &&
        !outcome.hasActiveDeepJob &&
        !outcome.shouldQueueDeepAnalysisDirect &&
        !outcome.shouldDeepAnalyze
      ) {
        deepSkipped += 1;
      }

      if (outcome.isPromisingCandidate) {
        promisingCandidates += 1;
      }

      if (outcome.decision.verdict === 'GOOD' && outcome.decision.action === 'BUILD') {
        goodIdeas += 1;
      }
      if (outcome.decision.action === 'CLONE') {
        cloneIdeas += 1;
      }

      if (outcome.resolvedCategory) {
        const categoryKey = `${outcome.resolvedCategory.main}/${outcome.resolvedCategory.sub}`;
        categoryCounts.set(categoryKey, (categoryCounts.get(categoryKey) ?? 0) + 1);

        switch (outcome.resolvedCategory.main) {
          case 'tools':
            toolsCount += 1;
            break;
          case 'ai':
            aiCount += 1;
            break;
          case 'infra':
            infraCount += 1;
            break;
          case 'data':
            dataCount += 1;
            break;
          default:
            break;
        }
      }
    }

    const topRepositoryIds = repositoryOutcomes
      .slice()
      .sort((left, right) =>
        this.compareResolvedDecisions(left.decision, right.decision),
      )
      .slice(0, 12)
      .map((outcome) => outcome.repository.id);

    await this.recordDeepSupplyStats({
      deepEnteredCount: deepAnalysisQueued,
      deepSkippedCount: deepSkipped,
    });

    return {
      repositoryIds: repositories.map((repository) => repository.id),
      snapshotQueued: bulkSnapshotTargets.length,
      deepAnalysisQueued,
      deepSkipped,
      promisingCandidates,
      goodIdeas,
      cloneIdeas,
      toolsCount,
      aiCount,
      infraCount,
      dataCount,
      topCategories: Array.from(categoryCounts.entries())
        .map(([key, count]) => {
          const [main, sub] = key.split('/');
          return {
            main: normalizeIdeaMainCategory(main),
            sub: sub || 'other',
            count,
          };
        })
        .sort((left, right) => right.count - left.count)
        .slice(0, 6),
      topRepositoryIds,
    };
  }

  private async loadActiveRepositoryJobState(
    repositoryIds: string[],
  ): Promise<ActiveRepositoryJobState> {
    const trackedRepositoryIds = new Set(repositoryIds.filter(Boolean));
    const state: ActiveRepositoryJobState = {
      snapshotRepositoryIds: new Set<string>(),
      deepRepositoryIds: new Set<string>(),
    };

    if (!trackedRepositoryIds.size) {
      return state;
    }

    const activeJobs = await this.prisma.jobLog.findMany({
      where: {
        jobName: {
          in: [
            QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT,
            QUEUE_JOB_TYPES.ANALYSIS_SINGLE,
          ],
        },
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
      },
      select: {
        jobName: true,
        payload: true,
      },
    });

    for (const job of activeJobs) {
      const repositoryId = this.readRepositoryIdFromJobPayload(job.payload);
      if (!repositoryId || !trackedRepositoryIds.has(repositoryId)) {
        continue;
      }

      if (job.jobName === QUEUE_JOB_TYPES.ANALYSIS_SNAPSHOT) {
        state.snapshotRepositoryIds.add(repositoryId);
      }
      if (job.jobName === QUEUE_JOB_TYPES.ANALYSIS_SINGLE) {
        state.deepRepositoryIds.add(repositoryId);
      }
    }

    return state;
  }

  private readRepositoryIdFromJobPayload(payload: Prisma.JsonValue | null) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    if (!('repositoryId' in payload)) {
      return null;
    }

    const repositoryId = (payload as Record<string, unknown>).repositoryId;
    return typeof repositoryId === 'string' && repositoryId.length > 0
      ? repositoryId
      : null;
  }

  private buildDeepAnalysisChildQueueEntry(args: {
    repositoryId: string;
    windowDate: string;
    runFastFilterByDefault: boolean;
    parentJobId?: string;
    roughLevel: RepositoryWithAnalysisContext['roughLevel'];
  }): SingleAnalysisBulkEntry {
    return {
      repositoryId: args.repositoryId,
      dto: {
        runFastFilter: args.runFastFilterByDefault && !args.roughLevel,
        runCompleteness: true,
        runIdeaFit: true,
        runIdeaExtract: true,
        forceRerun: false,
      },
      parentJobId: args.parentJobId,
      metadata: {
        fromBackfill: true,
        windowDate: args.windowDate,
      },
    };
  }

  private async enqueueDeepAnalysisChildJobs(
    entries: SingleAnalysisBulkEntries,
    triggeredBy: string,
  ) {
    if (!entries.length) {
      return;
    }

    const bulkQueueService = this.queueService as QueueService & {
      enqueueSingleAnalysesBulk?: QueueService['enqueueSingleAnalysesBulk'];
    };
    if (typeof bulkQueueService.enqueueSingleAnalysesBulk === 'function') {
      try {
        await bulkQueueService.enqueueSingleAnalysesBulk(entries, triggeredBy);
        return;
      } catch (error) {
        this.logger.warn(
          `github deep child bulk enqueue failed batchSize=${entries.length} reason=${error instanceof Error ? error.message : 'unknown'} fallback=single_enqueue`,
        );
      }
    }

    await this.runWithConcurrency(
      entries,
      this.resolveDeepAnalysisFallbackEnqueueConcurrency(entries.length),
      async (entry) => {
        await this.queueService.enqueueSingleAnalysis(
          entry.repositoryId,
          entry.dto,
          entry.triggeredBy ?? triggeredBy,
          {
            parentJobId: entry.parentJobId,
            metadata: entry.metadata,
            jobOptionsOverride: entry.jobOptionsOverride,
          },
        );
      },
    );
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

  private mergeRequestSummary(
    summary: {
      rateLimitHits: number;
      rotatedTokens: number;
    },
    requestSummary: FetchExecutionSummary,
    state: {
      usedTokenIndexes: Set<number>;
      disabledTokenIndexes: Set<number>;
    },
  ) {
    summary.rateLimitHits += requestSummary.rateLimitHits;
    summary.rotatedTokens += requestSummary.rotatedTokens;

    requestSummary.tokensUsed.forEach((tokenIndex) => {
      state.usedTokenIndexes.add(tokenIndex);
    });
    requestSummary.disabledTokens.forEach((tokenIndex) => {
      state.disabledTokenIndexes.add(tokenIndex);
    });
  }

  private async resolveCreatedSearchWindows(
    window: CreatedSearchWindow,
    dto: BackfillCreatedRepositoriesDto,
    requestContext: GitHubRequestContext,
    summary?: {
      scannedWindows: number;
      fetchedLinks: number;
      snapshotQueued: number;
      deepAnalysisQueued: number;
      promisingCandidates: number;
    },
    onHeartbeat?: (payload?: BackfillHeartbeatPayload) => Promise<void> | void,
  ): Promise<Array<CreatedSearchWindow & { windowTotalCount: number }>> {
    if (onHeartbeat) {
      await onHeartbeat();
    }
    const query = this.buildSearchQuery({
      mode: GitHubFetchMode.CREATED,
      query: this.buildCreatedWindowQuery(window),
      language: dto.language,
      starMin: dto.starMin,
      page: 1,
    });
    const countResponse = await this.githubClient.searchRepositories(
      {
        q: query,
        per_page: 1,
        page: 1,
      },
      requestContext,
    );

    const windowTotalCount = countResponse.total_count ?? 0;
    this.logger.log(
      `Created search window ${window.searchWindowStart}..${window.searchWindowEnd} depth=${window.depth} total=${windowTotalCount}`,
    );

    if (onHeartbeat) {
      const requestSummary = requestContext.toSummary(this.githubClient.getDiagnostics());
      await onHeartbeat({
        currentSearchWindow: {
          label: window.label,
          searchWindowStart: window.searchWindowStart,
          searchWindowEnd: window.searchWindowEnd,
        },
        currentWindowSearchDepth: window.depth,
        currentWindowTotalCount: windowTotalCount,
        scannedWindows: summary?.scannedWindows ?? 0,
        fetchedLinks: summary?.fetchedLinks ?? 0,
        snapshotQueued: summary?.snapshotQueued ?? 0,
        deepAnalysisQueued: summary?.deepAnalysisQueued ?? 0,
        promisingCandidates: summary?.promisingCandidates ?? 0,
        recentRetryCount: requestSummary.retryCount,
        recentRateLimitHits: requestSummary.rateLimitHits,
        runtimeUpdatedAt: new Date().toISOString(),
      });
    }

    if (
      windowTotalCount <= 1_000 ||
      window.depth >= 10 ||
      this.windowDurationMs(window) <= 60_000
    ) {
      return [{ ...window, windowTotalCount }];
    }

    const [left, right] = this.splitCreatedSearchWindow(window);
    const leftWindows = await this.resolveCreatedSearchWindows(
      left,
      dto,
      requestContext,
      summary,
      onHeartbeat,
    );
    const rightWindows = await this.resolveCreatedSearchWindows(
      right,
      dto,
      requestContext,
      summary,
      onHeartbeat,
    );

    return [...leftWindows, ...rightWindows];
  }

  private splitCreatedSearchWindow(
    window: CreatedSearchWindow,
  ): [CreatedSearchWindow, CreatedSearchWindow] {
    const startMs = new Date(window.searchWindowStart).getTime();
    const endMs = new Date(window.searchWindowEnd).getTime();
    const midpoint = startMs + Math.floor((endMs - startMs) / 2);
    const leftEnd = new Date(midpoint);
    const rightStart = new Date(Math.min(endMs, midpoint + 1_000));

    return [
      {
        label: window.label,
        depth: window.depth + 1,
        searchWindowStart: window.searchWindowStart,
        searchWindowEnd: this.toGitHubDateTime(leftEnd),
      },
      {
        label: window.label,
        depth: window.depth + 1,
        searchWindowStart: this.toGitHubDateTime(rightStart),
        searchWindowEnd: window.searchWindowEnd,
      },
    ];
  }

  private buildCreatedWindowQuery(window: CreatedSearchWindow) {
    return `created:${window.searchWindowStart}..${window.searchWindowEnd}`;
  }

  private windowDurationMs(window: CreatedSearchWindow) {
    return (
      new Date(window.searchWindowEnd).getTime() -
      new Date(window.searchWindowStart).getTime()
    );
  }

  private async fetchAndPersistRepository(
    searchItem: GitHubRepository,
    runFastFilter = false,
    requestContext?: GitHubRequestContext,
  ) {
    const [owner, repoName] = searchItem.full_name.split('/');

    const repository = await this.githubClient.getRepository(
      owner,
      repoName,
      requestContext,
    );
    const [readme, rootContents, commits, issues] = await Promise.all([
      this.githubClient.getReadme(owner, repoName, requestContext),
      this.githubClient.getRootContents(owner, repoName, requestContext),
      this.githubClient.getRecentCommits(owner, repoName, 15, requestContext),
      this.githubClient.getRecentIssues(owner, repoName, 10, requestContext),
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
        repositoryId: existingRepository.id,
        githubRepoId: String(repository.id),
        fullName: repository.full_name,
        action: 'updated' as const,
        message,
      };
    }

    await this.assertAnalysisPoolRepositoryCreateAllowed();

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
      repositoryId: createdRepository.id,
      githubRepoId: String(repository.id),
      fullName: repository.full_name,
      action: 'created' as const,
      message,
    };
  }

  private async runIdeaSnapshotChildJob(
    payload: GitHubIdeaSnapshotJobPayload,
  ) {
    const result = await this.ideaSnapshotService.analyzeRepository(payload.repositoryId, {
      onlyIfMissing: true,
    });
    const snapshot = {
      oneLinerZh: result.oneLinerZh,
      isPromising: result.isPromising,
      reason: result.reason,
      category: result.category,
      toolLike: result.toolLike,
      nextAction: result.nextAction,
    } satisfies IdeaSnapshotOutput;
    const repository = await this.prisma.repository.findUnique({
      where: { id: payload.repositoryId },
      include: {
        content: true,
        analysis: true,
      },
    });

    const hasActiveDeepJob = await this.hasActiveRepositoryJob(
      QUEUE_JOB_TYPES.ANALYSIS_SINGLE,
      payload.repositoryId,
    );
    const shouldQueueDeepAnalysis =
      repository &&
      !hasActiveDeepJob &&
      this.shouldRefreshDeepAnalysis(repository) &&
      this.shouldDeepAnalyzeRepository({
        repository,
        snapshot,
        runDeepAnalysis: payload.runDeepAnalysis ?? true,
        deepAnalysisOnlyIfPromising: payload.deepAnalysisOnlyIfPromising ?? true,
        targetCategories: this.normalizeTargetCategories(payload.targetCategories),
      });

    return {
      repositoryId: payload.repositoryId,
      fromBackfill: payload.fromBackfill ?? false,
      windowDate: payload.windowDate,
      action: result.action,
      snapshot,
      deepAnalysis: {
        shouldQueue: Boolean(shouldQueueDeepAnalysis),
        runFastFilter: payload.runFastFilter ?? true,
        parentJobId: payload.rootJobId ?? null,
      },
    };
  }

  async processIdeaSnapshotQueueJob(payload: GitHubIdeaSnapshotJobPayload) {
    return this.runIdeaSnapshotChildJob(payload);
  }

  private shouldDeepAnalyzeRepository({
    repository,
    snapshot,
    runDeepAnalysis,
    deepAnalysisOnlyIfPromising,
    targetCategories,
  }: {
    repository: RepositoryWithAnalysisContext;
    snapshot: IdeaSnapshotOutput | null;
    runDeepAnalysis: boolean;
    deepAnalysisOnlyIfPromising: boolean;
    targetCategories: IdeaMainCategory[];
  }) {
    if (!runDeepAnalysis) {
      return false;
    }

    const shouldQueueByPromisingSignals = this.isPromisingBackfillCandidate({
      repository,
      snapshot,
      deepAnalysisOnlyIfPromising,
      targetCategories,
    });

    if (shouldQueueByPromisingSignals) {
      return true;
    }

    return this.shouldForceLightIdeaAnalysisCandidate(repository, snapshot);
  }

  async findDeepAnalysisBacklogCandidates(options: {
    limit: number;
    targetCategories?: string[];
    deepAnalysisOnlyIfPromising?: boolean;
  }) {
    const repositories = await this.prisma.repository.findMany({
      where: {
        analysis: {
          isNot: null,
        },
      },
      orderBy: [
        {
          updatedAtGithub: 'desc',
        },
        {
          createdAtGithub: 'desc',
        },
      ],
      take: Math.max(options.limit * 5, 20),
      include: {
        content: true,
        analysis: true,
      },
    });
    const targetCategories = this.normalizeTargetCategories(
      options.targetCategories,
    );

    return repositories
      .filter((repository) => {
        const snapshot = this.ideaSnapshotService.readIdeaSnapshot(
          repository.analysis?.ideaSnapshotJson,
        );

        return (
          this.shouldRefreshDeepAnalysis(repository) &&
          this.shouldDeepAnalyzeRepository({
            repository,
            snapshot,
            runDeepAnalysis: true,
            deepAnalysisOnlyIfPromising:
              options.deepAnalysisOnlyIfPromising ?? true,
            targetCategories,
          })
        );
      })
      .slice(0, options.limit);
  }

  private resolveRepositoryDecision(
    repository: RepositoryWithAnalysisContext,
    snapshot: IdeaSnapshotOutput | null,
  ): ResolvedRepositoryDecision {
    const insight = this.readInsight(repository.analysis?.insightJson);
    const manualVerdict = this.normalizeVerdict(repository.analysis?.manualVerdict);
    const manualAction = this.normalizeAction(repository.analysis?.manualAction);
    const verdict =
      manualVerdict ??
      insight?.verdict ??
      (snapshot?.isPromising ? 'OK' : 'BAD');
    const action =
      manualAction ??
      insight?.action ??
      (verdict === 'GOOD'
        ? 'BUILD'
        : verdict === 'OK'
          ? 'CLONE'
          : 'IGNORE');

    return {
      verdict,
      action,
      createdAtGithub: repository.createdAtGithub ?? null,
      ideaFitScore:
        typeof repository.ideaFitScore === 'number'
          ? repository.ideaFitScore
          : null,
      hasInsight: Boolean(insight),
      hasManualOverride: Boolean(manualVerdict || manualAction),
      stars: repository.stars,
    };
  }

  private compareResolvedDecisions(
    left: ResolvedRepositoryDecision,
    right: ResolvedRepositoryDecision,
  ) {
    if (left.hasManualOverride !== right.hasManualOverride) {
      return Number(right.hasManualOverride) - Number(left.hasManualOverride);
    }

    if (left.hasInsight !== right.hasInsight) {
      return Number(right.hasInsight) - Number(left.hasInsight);
    }

    const leftScore =
      this.verdictWeight(left.verdict) * 100 +
      this.actionWeight(left.action) * 10;
    const rightScore =
      this.verdictWeight(right.verdict) * 100 +
      this.actionWeight(right.action) * 10;

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    const createdAtDiff =
      this.toTimestamp(right.createdAtGithub) -
      this.toTimestamp(left.createdAtGithub);

    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    const ideaFitDiff = (right.ideaFitScore ?? -1) - (left.ideaFitScore ?? -1);

    if (ideaFitDiff !== 0) {
      return ideaFitDiff;
    }

    return right.stars - left.stars;
  }

  private shouldRefreshIdeaSnapshot(repository: RepositoryWithAnalysisContext) {
    const analysis = repository.analysis;
    const lastAnalyzedAt = this.getAnalysisReferenceDate(repository);
    const snapshotRefreshDays = this.readRefreshDays(
      'SNAPSHOT_REFRESH_DAYS',
      14,
    );

    if (!analysis?.ideaSnapshotJson) {
      return true;
    }

    if (!analysis.insightJson) {
      return true;
    }

    if (!lastAnalyzedAt) {
      return true;
    }

    if (this.isOlderThanDays(lastAnalyzedAt, snapshotRefreshDays)) {
      return true;
    }

    return this.hasRepositoryChangedSince(repository, lastAnalyzedAt);
  }

  private shouldRefreshDeepAnalysis(repository: RepositoryWithAnalysisContext) {
    const analysis = repository.analysis;
    const lastAnalyzedAt = this.getAnalysisReferenceDate(repository);
    const deepRefreshDays = this.readRefreshDays(
      'DEEP_ANALYSIS_REFRESH_DAYS',
      30,
    );

    if (!analysis?.ideaSnapshotJson) {
      return false;
    }

    if (
      !analysis.completenessJson ||
      !analysis.ideaFitJson ||
      !analysis.extractedIdeaJson ||
      !analysis.insightJson
    ) {
      return true;
    }

    if (analysis.fallbackUsed === true) {
      return true;
    }

    if (!lastAnalyzedAt) {
      return true;
    }

    if (
      analysis.manualUpdatedAt &&
      !this.isOlderThanDays(analysis.manualUpdatedAt, deepRefreshDays)
    ) {
      return false;
    }

    if (this.isOlderThanDays(lastAnalyzedAt, deepRefreshDays)) {
      return true;
    }

    return this.hasRepositoryChangedSince(repository, lastAnalyzedAt);
  }

  private isPromisingBackfillCandidate({
    repository,
    snapshot,
    deepAnalysisOnlyIfPromising,
    targetCategories,
  }: {
    repository: RepositoryWithAnalysisContext;
    snapshot: IdeaSnapshotOutput | null;
    deepAnalysisOnlyIfPromising: boolean;
    targetCategories: IdeaMainCategory[];
  }) {
    const inTargetCategory = this.matchesTargetCategories(
      repository,
      snapshot,
      targetCategories,
    );
    const hasClearUseCase =
      typeof snapshot?.oneLinerZh === 'string' &&
      snapshot.oneLinerZh.trim().length >= 12 &&
      snapshot.nextAction !== 'SKIP';
    const toolLike = snapshot?.toolLike === true;
    const isPromising = snapshot?.isPromising === true;

    if (!isPromising) {
      return false;
    }

    const qualifyingSignals = [toolLike, inTargetCategory, hasClearUseCase];

    if (!deepAnalysisOnlyIfPromising) {
      return qualifyingSignals.some(Boolean);
    }

    return qualifyingSignals.some(Boolean) && snapshot?.nextAction !== 'SKIP';
  }

  private shouldForceLightIdeaAnalysisCandidate(
    repository: RepositoryWithAnalysisContext,
    snapshot: IdeaSnapshotOutput | null,
  ) {
    const insight = this.readJsonObject(repository.analysis?.insightJson);
    const claudeReview =
      repository.analysis?.claudeReviewStatus === 'SUCCESS'
        ? this.readJsonObject(repository.analysis?.claudeReviewJson)
        : null;
    const projectReality = this.readJsonObject(
      this.readJsonObject(insight?.projectReality),
    );
    const strongBusinessSignals =
      this.readBoolean(projectReality?.hasRealUser) &&
      this.readBoolean(projectReality?.hasClearUseCase) &&
      this.readBoolean(projectReality?.isDirectlyMonetizable);

    const insightVerdict = this.readText(insight?.verdict);
    const insightAction = this.readText(insight?.action);
    const insightType = this.readText(
      this.readJsonObject(insight?.projectReality)?.type,
    );
    const insightOneLiner = this.readText(insight?.oneLinerZh);

    const claudeVerdict = this.readText(claudeReview?.verdict);
    const claudeAction = this.readText(claudeReview?.action);
    const claudeType = this.readText(claudeReview?.projectType);
    const claudeOneLiner = this.readText(claudeReview?.oneLinerZh);

    const hasConflict =
      Boolean(claudeVerdict && insightVerdict && claudeVerdict !== insightVerdict) ||
      Boolean(claudeAction && insightAction && claudeAction !== insightAction) ||
      Boolean(claudeType && insightType && claudeType !== insightType) ||
      Boolean(
        claudeOneLiner &&
          insightOneLiner &&
          claudeOneLiner.trim() !== insightOneLiner.trim(),
      );
    const confidence = this.readNumberMaybe(insight?.confidence) ?? 0;
    const fallbackUsed = repository.analysis?.fallbackUsed === true;
    const missingCoreAnalysis =
      !repository.analysis?.insightJson ||
      !repository.analysis?.ideaFitJson ||
      !repository.analysis?.completenessJson ||
      !repository.analysis?.extractedIdeaJson;
    const highLocalIntent =
      insightVerdict === 'GOOD' ||
      (insightVerdict === 'OK' && insightAction === 'CLONE' && strongBusinessSignals);
    const needsRecheck = hasConflict || (confidence > 0 && confidence < 0.45);
    const snapshotSkipped =
      snapshot?.isPromising === false || snapshot?.nextAction === 'SKIP';
    const snapshotSuggestsPotential =
      snapshot?.isPromising === true ||
      snapshot?.toolLike === true ||
      snapshot?.nextAction === 'DEEP_ANALYZE';

    return (
      highLocalIntent ||
      strongBusinessSignals ||
      hasConflict ||
      (snapshotSkipped && needsRecheck) ||
      (fallbackUsed && missingCoreAnalysis) ||
      (missingCoreAnalysis && snapshotSuggestsPotential)
    );
  }

  private async recordDeepSupplyStats(input: {
    deepEnteredCount: number;
    deepSkippedCount: number;
  }) {
    if (input.deepEnteredCount === 0 && input.deepSkippedCount === 0) {
      return;
    }

    const today = this.toLocalDateString(new Date());
    const existing = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: DEEP_RUNTIME_STATS_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });
    const current = this.readDeepRuntimeStats(existing?.configValue, today);
    const nextState: DeepRuntimeStatsState = {
      ...current,
      date: today,
      deepEnteredCount: current.deepEnteredCount + input.deepEnteredCount,
      deepSkippedCount: current.deepSkippedCount + input.deepSkippedCount,
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.systemConfig.upsert({
      where: {
        configKey: DEEP_RUNTIME_STATS_CONFIG_KEY,
      },
      update: {
        configValue: nextState as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: DEEP_RUNTIME_STATS_CONFIG_KEY,
        configValue: nextState as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private readDeepRuntimeStats(
    value: Prisma.JsonValue | null | undefined,
    today: string,
  ): DeepRuntimeStatsState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.emptyDeepRuntimeStats(today);
    }

    const normalized = value as Record<string, unknown>;
    const date =
      typeof normalized.date === 'string' && normalized.date.trim().length > 0
        ? normalized.date.trim()
        : today;

    if (date !== today) {
      return this.emptyDeepRuntimeStats(today);
    }

    return {
      date,
      deepEnteredCount: this.readNumberStat(normalized.deepEnteredCount),
      deepSkippedCount: this.readNumberStat(normalized.deepSkippedCount),
      ideaExtractExecutedCount: this.readNumberStat(
        normalized.ideaExtractExecutedCount,
      ),
      ideaExtractSkippedCount: this.readNumberStat(
        normalized.ideaExtractSkippedCount,
      ),
      ideaExtractDeferredCount: this.readNumberStat(
        normalized.ideaExtractDeferredCount,
      ),
      ideaExtractTimeoutCount: this.readNumberStat(
        normalized.ideaExtractTimeoutCount,
      ),
      lastIdeaExtractInflight: this.readNumberStat(
        normalized.lastIdeaExtractInflight,
      ),
      ideaExtractMaxInflight: this.readNumberStat(
        normalized.ideaExtractMaxInflight,
      ),
      updatedAt:
        typeof normalized.updatedAt === 'string' ? normalized.updatedAt : null,
    };
  }

  private emptyDeepRuntimeStats(today: string): DeepRuntimeStatsState {
    return {
      date: today,
      deepEnteredCount: 0,
      deepSkippedCount: 0,
      ideaExtractExecutedCount: 0,
      ideaExtractSkippedCount: 0,
      ideaExtractDeferredCount: 0,
      ideaExtractTimeoutCount: 0,
      lastIdeaExtractInflight: 0,
      ideaExtractMaxInflight: 0,
      updatedAt: null,
    };
  }

  private readNumberStat(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private matchesPromisingKeywords(repository: RepositoryWithAnalysisContext) {
    const haystack = [
      repository.name,
      repository.fullName,
      repository.description,
      repository.language,
      ...(repository.topics ?? []),
      repository.content?.readmeText?.slice(0, 1200) ?? '',
    ]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();

    const negativeKeywords = [
      'template',
      'boilerplate',
      'tutorial',
      'showcase',
      'ui clone',
      'pump',
      'sniper',
      'guaranteed profit',
      'passive income',
    ];
    if (negativeKeywords.some((keyword) => haystack.includes(keyword))) {
      return false;
    }

    const keywords = [
      'tool',
      'workflow',
      'automation',
      'productivity',
      'browser extension',
      'chrome extension',
      'plugin',
      'cli',
      'developer tool',
      'devtool',
      'sdk',
      'dashboard',
      'api',
      'integration',
      'scraping',
      'crawler',
      'etl',
      'pipeline',
      'analytics',
      'auth',
      'storage',
      'gateway',
      'deploy',
      'deployment',
      'observability',
      'monitor',
      'ops',
      'no-code',
      'low-code',
      'data sync',
      'extension',
      'ai tool',
      'copilot',
      'assistant',
      'agent',
    ];

    return keywords.some((keyword) => haystack.includes(keyword));
  }

  private normalizeTargetCategories(
    categories: string[] | undefined,
  ): IdeaMainCategory[] {
    const source =
      categories && categories.length > 0
        ? categories
        : ['tools', 'ai', 'data', 'infra'];

    return Array.from(
      new Set(source.map((category) => normalizeIdeaMainCategory(category))),
    );
  }

  private getAnalysisReferenceDate(repository: RepositoryWithAnalysisContext) {
    return (
      repository.analysis?.analyzedAt ??
      repository.analysis?.updatedAt ??
      null
    );
  }

  private hasRepositoryChangedSince(
    repository: RepositoryWithAnalysisContext,
    referenceDate: Date | string | null,
  ) {
    if (!referenceDate) {
      return true;
    }

    const normalizedReference =
      referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

    if (Number.isNaN(normalizedReference.getTime())) {
      return true;
    }

    const upstreamUpdatedAt =
      repository.updatedAtGithub ??
      repository.pushedAtGithub ??
      repository.createdAtGithub ??
      null;

    if (!upstreamUpdatedAt) {
      return false;
    }

    return upstreamUpdatedAt.getTime() > normalizedReference.getTime();
  }

  private isOlderThanDays(value: Date | string, days: number) {
    const normalized = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(normalized.getTime())) {
      return true;
    }

    return Date.now() - normalized.getTime() > days * 24 * 60 * 60 * 1000;
  }

  private readRefreshDays(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private readInsight(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const current = value as Record<string, unknown>;

    return {
      verdict: this.normalizeVerdict(current.verdict),
      action: this.normalizeAction(current.action),
    };
  }

  private readJsonObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readText(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private readNumberMaybe(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private readBoolean(value: unknown) {
    return value === true;
  }

  private normalizeVerdict(value: unknown): 'GOOD' | 'OK' | 'BAD' | null {
    const normalized = String(value ?? '').trim().toUpperCase();

    if (normalized === 'GOOD' || normalized === 'OK' || normalized === 'BAD') {
      return normalized;
    }

    return null;
  }

  private normalizeAction(
    value: unknown,
  ): 'BUILD' | 'CLONE' | 'IGNORE' | null {
    const normalized = String(value ?? '').trim().toUpperCase();

    if (
      normalized === 'BUILD' ||
      normalized === 'CLONE' ||
      normalized === 'IGNORE'
    ) {
      return normalized;
    }

    return null;
  }

  private verdictWeight(value: 'GOOD' | 'OK' | 'BAD') {
    switch (value) {
      case 'GOOD':
        return 3;
      case 'OK':
        return 2;
      case 'BAD':
      default:
        return 1;
    }
  }

  private actionWeight(value: 'BUILD' | 'CLONE' | 'IGNORE') {
    switch (value) {
      case 'BUILD':
        return 3;
      case 'CLONE':
        return 2;
      case 'IGNORE':
      default:
        return 1;
    }
  }

  private readPositiveNumberEnv(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private resolveDeepAnalysisFallbackEnqueueConcurrency(entryCount: number) {
    return Math.min(
      entryCount,
      this.readPositiveNumberEnv('DEEP_ANALYSIS_CONCURRENCY', 6),
    );
  }

  private toTimestamp(value: Date | string | null) {
    if (!value) {
      return 0;
    }

    const timestamp =
      value instanceof Date ? value.getTime() : new Date(value).getTime();

    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private async hasActiveRepositoryJob(jobName: string, repositoryId: string) {
    const activeJob = await this.prisma.jobLog.findFirst({
      where: {
        jobName,
        jobStatus: {
          in: [JobStatus.PENDING, JobStatus.RUNNING],
        },
        payload: {
          path: ['repositoryId'],
          equals: repositoryId,
        },
      },
      select: {
        id: true,
      },
    });

    return Boolean(activeJob);
  }

  private resolveBackfillCategory(
    repository: RepositoryWithAnalysisContext,
    snapshot: IdeaSnapshotOutput | null,
  ) {
    const main = snapshot?.category?.main
      ? normalizeIdeaMainCategory(snapshot.category.main)
      : repository.categoryL1
        ? normalizeIdeaMainCategory(repository.categoryL1)
        : this.matchesPromisingKeywords(repository)
          ? 'tools'
          : null;

    if (!main) {
      return null;
    }

    return {
      main,
      sub:
        snapshot?.category?.sub ??
        repository.categoryL2 ??
        (main === 'tools' ? 'workflow' : 'other'),
    };
  }

  private matchesTargetCategories(
    repository: RepositoryWithAnalysisContext,
    snapshot: IdeaSnapshotOutput | null,
    targetCategories: IdeaMainCategory[],
  ) {
    const category = this.resolveBackfillCategory(repository, snapshot);

    if (category && targetCategories.includes(category.main)) {
      return true;
    }

    return this.matchesPromisingKeywords(repository);
  }

  private buildCreatedDayWindows(
    days: number,
    startDate?: string,
    endDate?: string,
  ): CreatedSearchWindow[] {
    if (startDate || endDate) {
      const rangeStart = startDate ? new Date(startDate) : null;
      const rangeEnd = endDate ? new Date(endDate) : null;

      if (!rangeStart || !rangeEnd) {
        throw new Error('Both startDate and endDate are required for range backfill.');
      }

      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd.setHours(23, 59, 59, 999);

      if (rangeStart.getTime() > rangeEnd.getTime()) {
        throw new Error('Backfill range startDate must be before endDate.');
      }

      const windows: CreatedSearchWindow[] = [];
      const cursor = new Date(rangeStart);

      while (cursor.getTime() <= rangeEnd.getTime()) {
        const dayStart = new Date(cursor);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        windows.push({
          label: this.toLocalDateString(dayStart),
          depth: 0,
          searchWindowStart: this.toGitHubDateTime(dayStart),
          searchWindowEnd: this.toGitHubDateTime(dayEnd),
        });

        cursor.setDate(cursor.getDate() + 1);
      }

      return windows;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: days }, (_, index) => {
      const offset = days - index - 1;
      const dayStart = new Date(today);
      dayStart.setDate(today.getDate() - offset);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      return {
        label: this.toLocalDateString(dayStart),
        depth: 0,
        searchWindowStart: this.toGitHubDateTime(dayStart),
        searchWindowEnd: this.toGitHubDateTime(dayEnd),
      };
    });
  }

  private toLocalDateString(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private toGitHubDateTime(date: Date) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
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

  private async assertAnalysisPoolRepositoryCreateAllowed() {
    if (typeof this.prisma.systemConfig?.findUnique !== 'function') {
      return;
    }
    const [freezeRow, snapshotRow] = await Promise.all([
      this.prisma.systemConfig.findUnique({
        where: {
          configKey: ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY,
        },
      }),
      this.prisma.systemConfig.findUnique({
        where: {
          configKey: FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY,
        },
      }),
    ]);
    const gate = evaluateAnalysisPoolIntakeGate({
      freezeState: readAnalysisPoolFreezeState(freezeRow?.configValue),
      snapshot: readFrozenAnalysisPoolBatchSnapshot(snapshotRow?.configValue),
      source: 'github_fetch',
    });

    if (gate.decision === 'suppress_new_entry') {
      throw new BadRequestException(gate.reason);
    }
  }
}
