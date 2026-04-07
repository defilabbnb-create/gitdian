import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ColdToolDiscoveryService, ColdToolOrigin } from '../analysis/cold-tool-discovery.service';
import { IdeaSnapshotService } from '../analysis/idea-snapshot.service';
import { QueueService } from '../queue/queue.service';
import { RunAnalysisDto } from '../analysis/dto/run-analysis.dto';
import { GitHubFetchMode } from './dto/fetch-repositories.dto';
import { RunColdToolCollectorDto } from './dto/run-cold-tool-collector.dto';
import { GitHubService } from './github.service';
import {
  ColdToolExternalSourceService,
  ExternalSourceHit,
} from './cold-tool-external-source.service';

type ColdToolCollectorState = {
  cursor: number;
  lastRunAt: string | null;
  lastRunSummary: Record<string, unknown> | null;
};

type ColdToolSearchDomainConfig = {
  group: string;
  labelZh: string;
  keywords: Array<{
    locale: string;
    query: string;
    modes?: GitHubFetchMode[];
    lookbackDays?: number;
  }>;
};

type ColdToolSearchPlanEntry = {
  source: 'github_query' | 'github_curated';
  group: string;
  labelZh: string;
  locale: string;
  keyword: string;
  codeLanguage: string | null;
  searchMode: GitHubFetchMode;
  lookbackDays: number;
};

const COLD_TOOL_COLLECTOR_STATE_CONFIG_KEY = 'github.cold_tool_collector.state';

type ColdToolCollectorStage =
  | 'prepare'
  | 'github_search'
  | 'external_discovery'
  | 'external_import'
  | 'hydrate_content'
  | 'snapshot'
  | 'cold_tool_discovery'
  | 'deep_queue'
  | 'done';

type ColdToolCollectorPipelinePhase =
  | 'full'
  | 'external_import'
  | 'hydrate_content'
  | 'snapshot'
  | 'cold_tool_discovery'
  | 'deep_queue';

export type ColdToolCollectorRuntimePayload = {
  runId: string;
  currentStage: ColdToolCollectorStage;
  progress: number;
  queriesSelected: number;
  githubQueriesCompleted: number;
  githubFetchedLinks: number;
  githubCreatedRepositories: number;
  githubUpdatedRepositories: number;
  githubFailedRepositories: number;
  externalSourceHitCount: number;
  externalImportedRepositories: number;
  externalDuplicateRepositoryRefs: number;
  externalReusedRepositories: number;
  hydratedRepositories: number;
  hydrationSkippedRecent: number;
  hydrationFailed: number;
  repositoryCandidates: number;
  snapshotProcessed: number;
  coldToolEvaluated: number;
  coldToolMatched: number;
  deepAnalysisQueued: number;
  activeDomains: string[];
  activeProgrammingLanguages: string[];
  runtimeUpdatedAt: string;
};

type ColdToolCollectorResumeState = {
  runId: string;
  selectedEntries: ColdToolSearchPlanEntry[];
  nextCursor: number;
  fetchedLinks: number;
  createdRepositories: number;
  updatedRepositories: number;
  failedRepositories: number;
  externalImportedRepositories: number;
  externalDuplicateRepositoryRefs: number;
  externalReusedRepositories: number;
  hydratedRepositories: number;
  hydrationSkippedRecent: number;
  hydrationFailed: number;
  externalSourceHitCount: number;
  externalHits: ExternalSourceHit[];
  externalImportChunkIndex: number;
  repositoryIds: string[];
  originsByRepositoryId: Record<string, ColdToolOrigin[]>;
  hydrateChunkIndex: number;
  snapshotProcessed: number;
  snapshotChunkIndex: number;
  coldToolEvaluated: number;
  discoveryChunkIndex: number;
  discoveryProcessedRepositoryIds: string[];
  matchedRepositoryIds: string[];
  deepQueuedRepositoryIds: string[];
  deepAnalysisQueued: number;
  perQueryLimit: number;
  lookbackDays: number;
  languageRotationSeed: number;
  queryConcurrency: number;
};

type ColdToolCollectorContinuationResult = {
  continued: true;
  nextDto: RunColdToolCollectorDto;
  phase: ColdToolCollectorPipelinePhase;
  repositoryCandidates: number;
};

type ColdToolCollectorDirectResult =
  | Record<string, unknown>
  | ColdToolCollectorContinuationResult;

@Injectable()
export class GitHubColdToolCollectorService {
  private readonly logger = new Logger(GitHubColdToolCollectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly githubService: GitHubService,
    private readonly ideaSnapshotService: IdeaSnapshotService,
    private readonly coldToolDiscoveryService: ColdToolDiscoveryService,
    private readonly queueService: QueueService,
    private readonly coldToolExternalSourceService: ColdToolExternalSourceService,
  ) {}

  async runCollectionDirect(
    dto: RunColdToolCollectorDto = {},
    options: {
      onProgress?: (progress: number) => Promise<void> | void;
      onHeartbeat?: (
        payload: ColdToolCollectorRuntimePayload,
      ) => Promise<void> | void;
    } = {},
  ): Promise<ColdToolCollectorDirectResult> {
    const phase = this.resolvePipelinePhase(dto.phase);
    if (phase === 'external_import') {
      return this.runExternalImportPhase(dto, options);
    }
    if (phase === 'hydrate_content') {
      return this.runHydratePhase(dto, options);
    }
    if (phase === 'snapshot') {
      return this.runSnapshotPhase(dto, options);
    }
    if (phase === 'cold_tool_discovery') {
      return this.runColdToolDiscoveryPhase(dto, options);
    }
    if (phase === 'deep_queue') {
      return this.runDeepQueuePhase(dto, options);
    }

    const state = await this.ensureState();
    const runId = dto.runId ?? randomUUID();
    const queriesPerRun = Math.min(
      dto.queriesPerRun ??
        this.readPositiveInt('COLD_TOOL_QUERIES_PER_RUN', 36, 1),
      240,
    );
    const languageRotationSeed = Math.floor(
      state.cursor / Math.max(1, queriesPerRun),
    );
    const searchPlan = this.buildSearchPlan(languageRotationSeed);
    const boundedQueriesPerRun = Math.min(queriesPerRun, searchPlan.length || 1);
    const selectedEntries = this.selectPlanEntries(
      searchPlan,
      state.cursor,
      boundedQueriesPerRun,
    );
    const perQueryLimit = dto.perQueryLimit ?? this.readPositiveInt(
      'COLD_TOOL_PER_QUERY_LIMIT',
      8,
      1,
    );
    const lookbackDays = dto.lookbackDays ?? this.readPositiveInt(
      'COLD_TOOL_LOOKBACK_DAYS',
      540,
      7,
    );
    const queryConcurrency = this.readPositiveInt(
      'COLD_TOOL_QUERY_CONCURRENCY',
      6,
      1,
    );
    const repositoryIds = new Set<string>();
    const originsByRepositoryId = new Map<string, ColdToolOrigin[]>();

    let fetchedLinks = 0;
    let createdRepositories = 0;
    let updatedRepositories = 0;
    let failedRepositories = 0;
    let externalImportedRepositories = 0;
    let externalDuplicateRepositoryRefs = 0;
    let externalReusedRepositories = 0;
    let hydratedRepositories = 0;
    let hydrationSkippedRecent = 0;
    let hydrationFailed = 0;
    let githubQueriesCompleted = 0;
    let snapshotProcessed = 0;
    let coldToolEvaluated = 0;
    let coldToolMatched = 0;
    let deepAnalysisQueued = 0;

    const emitRuntime = async (
      currentStage: ColdToolCollectorStage,
      progress: number,
    ) => {
      await options.onProgress?.(progress);
      await options.onHeartbeat?.({
        runId,
        currentStage,
        progress,
        queriesSelected: selectedEntries.length,
        githubQueriesCompleted,
        githubFetchedLinks: fetchedLinks,
        githubCreatedRepositories: createdRepositories,
        githubUpdatedRepositories: updatedRepositories,
        githubFailedRepositories: failedRepositories,
        externalSourceHitCount: 0,
        externalImportedRepositories,
        externalDuplicateRepositoryRefs,
        externalReusedRepositories,
        hydratedRepositories,
        hydrationSkippedRecent,
        hydrationFailed,
        repositoryCandidates: repositoryIds.size,
        snapshotProcessed,
        coldToolEvaluated,
        coldToolMatched,
        deepAnalysisQueued,
        activeDomains: Array.from(
          new Set(selectedEntries.map((entry) => entry.group)),
        ),
        activeProgrammingLanguages: Array.from(
          new Set(
            selectedEntries
              .map((entry) => entry.codeLanguage)
              .filter((item): item is string => Boolean(item)),
          ),
        ),
        runtimeUpdatedAt: new Date().toISOString(),
      });
    };

    this.logger.log(
      `cold_tool_collection stage=prepare queriesSelected=${selectedEntries.length} lookbackDays=${lookbackDays} perQueryLimit=${perQueryLimit}`,
    );
    await emitRuntime('prepare', 5);

    await this.runWithConcurrency(selectedEntries, queryConcurrency, async (entry) => {
      const fetchResult = await this.githubService.fetchRepositoriesDirect({
        mode: entry.searchMode,
        query: entry.keyword,
        perPage: perQueryLimit,
        page: 1,
        language: entry.codeLanguage ?? undefined,
        pushedAfter: this.toDateStringFromDays(entry.lookbackDays),
        runFastFilter: false,
      }, {
        repositoryConcurrencyOverride: this.readPositiveInt(
          'COLD_TOOL_GITHUB_FETCH_ENRICH_CONCURRENCY',
          3,
          1,
        ),
        lightweightOnly: true,
      });

      fetchedLinks += fetchResult.processed;
      createdRepositories += fetchResult.created;
      updatedRepositories += fetchResult.updated;
      failedRepositories += fetchResult.failed;
      githubQueriesCompleted += 1;

      const collectedAt = new Date().toISOString();
      for (const item of fetchResult.items) {
        if (!item.repositoryId) {
          continue;
        }

        repositoryIds.add(item.repositoryId);
        this.appendOrigin(
          originsByRepositoryId,
          item.repositoryId,
          {
          collector: 'cold_tools',
          domain: `${entry.group}:${entry.searchMode}`,
          keyword: entry.keyword,
          locale: entry.locale,
          codeLanguage: entry.codeLanguage,
          collectedAt,
          },
        );
      }

      await emitRuntime(
        'github_search',
        10 + Math.round((githubQueriesCompleted / Math.max(1, selectedEntries.length)) * 25),
      );
    });

    this.logger.log(
      `cold_tool_collection stage=external_discovery queries=${selectedEntries.length} repositoryCandidates=${repositoryIds.size}`,
    );
    await emitRuntime('external_discovery', 40);
    const externalDiscovery =
      await this.coldToolExternalSourceService.discoverRepositoryFullNames({
        queries: this.uniqueKeywords(
          selectedEntries.map((entry) => entry.keyword),
        ),
        perQueryLimit: this.readPositiveInt(
          'COLD_TOOL_EXTERNAL_PER_QUERY_LIMIT',
          6,
          1,
        ),
        concurrency: this.readPositiveInt(
          'COLD_TOOL_EXTERNAL_QUERY_CONCURRENCY',
          3,
          1,
        ),
        onQueryProgress: async (progressState) => {
          const progress =
            40 +
            Math.round(
              (progressState.completedQueries /
                Math.max(1, progressState.totalQueries)) *
                5,
            );
          await emitRuntime(
            'external_discovery',
            Math.max(40, Math.min(45, progress)),
          );
        },
      });

    await options.onHeartbeat?.({
      runId,
      currentStage: 'external_discovery',
      progress: 45,
      queriesSelected: selectedEntries.length,
      githubQueriesCompleted,
      githubFetchedLinks: fetchedLinks,
      githubCreatedRepositories: createdRepositories,
      githubUpdatedRepositories: updatedRepositories,
      githubFailedRepositories: failedRepositories,
      externalSourceHitCount: externalDiscovery.hits.length,
      externalImportedRepositories,
      externalDuplicateRepositoryRefs,
      externalReusedRepositories,
      hydratedRepositories,
      hydrationSkippedRecent,
      hydrationFailed,
      repositoryCandidates: repositoryIds.size,
      snapshotProcessed,
      coldToolEvaluated,
      coldToolMatched,
      deepAnalysisQueued,
      activeDomains: Array.from(new Set(selectedEntries.map((entry) => entry.group))),
      activeProgrammingLanguages: Array.from(
        new Set(
          selectedEntries
            .map((entry) => entry.codeLanguage)
            .filter((item): item is string => Boolean(item)),
        ),
      ),
      runtimeUpdatedAt: new Date().toISOString(),
    });

    const resumeState = this.buildResumeState({
      runId,
      selectedEntries,
      nextCursor:
        searchPlan.length
          ? (state.cursor + selectedEntries.length) % searchPlan.length
          : 0,
      fetchedLinks,
      createdRepositories,
      updatedRepositories,
      failedRepositories,
      externalImportedRepositories,
      externalDuplicateRepositoryRefs,
      externalReusedRepositories,
      hydratedRepositories,
      hydrationSkippedRecent,
      hydrationFailed,
      externalSourceHitCount: externalDiscovery.hits.length,
      externalHits: externalDiscovery.hits,
      externalImportChunkIndex: 0,
      repositoryIds: Array.from(repositoryIds),
      originsByRepositoryId: Object.fromEntries(
        Array.from(originsByRepositoryId.entries()),
      ),
      hydrateChunkIndex: 0,
      snapshotProcessed,
      snapshotChunkIndex: 0,
      coldToolEvaluated,
      discoveryChunkIndex: 0,
      discoveryProcessedRepositoryIds: [],
      matchedRepositoryIds: [],
      deepQueuedRepositoryIds: [],
      deepAnalysisQueued,
      perQueryLimit,
      lookbackDays,
      languageRotationSeed,
      queryConcurrency,
    });

    this.logger.log(
      `cold_tool_collection stage=external_import sourceHits=${externalDiscovery.hits.length} uniqueRepos=${externalDiscovery.byRepositoryFullName.size}`,
    );
    await emitRuntime('external_import', 45);

    return {
      continued: true,
      phase: 'external_import',
      repositoryCandidates: resumeState.repositoryIds.length,
      nextDto: {
        ...dto,
        runId: resumeState.runId,
        phase: 'external_import',
        resumeState: resumeState as Record<string, unknown>,
      },
    };
  }

  private async runExternalImportPhase(
    dto: RunColdToolCollectorDto,
    options: {
      onProgress?: (progress: number) => Promise<void> | void;
      onHeartbeat?: (
        payload: ColdToolCollectorRuntimePayload,
      ) => Promise<void> | void;
    },
  ): Promise<ColdToolCollectorDirectResult> {
    const state = this.readResumeState(dto.resumeState);
    const importEntries = this.getExternalImportEntries(state.externalHits);
    const importChunks = this.chunkItems(
      importEntries,
      this.readPositiveInt(
        'COLD_TOOL_EXTERNAL_IMPORT_REPOSITORY_CHUNK_SIZE',
        24,
        1,
      ),
    );
    const chunkIndex = Math.max(0, state.externalImportChunkIndex);

    if (chunkIndex >= importChunks.length) {
      this.logger.log(
        `cold_tool_collection stage=hydrate_content repositoryCandidates=${state.repositoryIds.length}`,
      );
      return {
        continued: true,
        phase: 'hydrate_content',
        repositoryCandidates: state.repositoryIds.length,
        nextDto: {
          ...dto,
          runId: state.runId,
          phase: 'hydrate_content',
          resumeState: state as Record<string, unknown>,
        },
      };
    }

    const existingRepositoriesByFullName =
      await this.findExistingRepositoriesByFullName(
        importEntries.map(([repositoryFullName]) => repositoryFullName),
      );
    const recentReuseThresholdHours = this.readPositiveInt(
      'COLD_TOOL_EXTERNAL_SKIP_SYNC_RECENT_HOURS',
      72,
      1,
    );
    const repositoryIds = new Set(state.repositoryIds);
    const originsByRepositoryId = new Map<string, ColdToolOrigin[]>(
      Object.entries(state.originsByRepositoryId),
    );
    const chunkEntries = importChunks[chunkIndex];

    await this.emitRuntimeFromResumeState(state, 'external_import', 45, options);

    await this.runWithConcurrency(
      chunkEntries,
      this.readPositiveInt('COLD_TOOL_EXTERNAL_IMPORT_CONCURRENCY', 3, 1),
      async ([repositoryFullName, hits]) => {
        try {
          const existingRepository =
            existingRepositoriesByFullName.get(repositoryFullName) ?? null;
          const imported =
            existingRepository &&
            this.wasRepositorySyncedRecently(
              existingRepository.updatedAtGithub,
              existingRepository.updatedAt,
              recentReuseThresholdHours,
            )
              ? {
                  repositoryId: existingRepository.id,
                }
              : await this.githubService.syncRepositoryByFullName(
                  repositoryFullName,
                  { runFastFilter: false, lightweightOnly: true },
                );

          if (existingRepository) {
            state.externalReusedRepositories += 1;
          }
          if (repositoryIds.has(imported.repositoryId)) {
            state.externalDuplicateRepositoryRefs += 1;
          }
          repositoryIds.add(imported.repositoryId);
          state.externalImportedRepositories += 1;

          const collectedAt = new Date().toISOString();
          for (const hit of hits) {
            this.appendOrigin(
              originsByRepositoryId,
              imported.repositoryId,
              {
                collector: `cold_tools_${hit.source}`,
                domain: `${hit.source}:package_registry`,
                keyword: hit.query,
                locale: 'global',
                codeLanguage: null,
                collectedAt,
              },
            );
          }
        } catch {
          // Ignore invalid or deleted repos referenced by registries.
        }
      },
    );

    state.repositoryIds = Array.from(repositoryIds);
    state.originsByRepositoryId = Object.fromEntries(
      Array.from(originsByRepositoryId.entries()),
    );
    state.externalImportChunkIndex = chunkIndex + 1;
    const progress =
      45 +
      Math.round(
        (state.externalImportChunkIndex / Math.max(1, importChunks.length)) * 13,
      );
    await this.emitRuntimeFromResumeState(
      state,
      'external_import',
      Math.max(45, Math.min(58, progress)),
      options,
    );

    if (state.externalImportChunkIndex < importChunks.length) {
      return {
        continued: true,
        phase: 'external_import',
        repositoryCandidates: state.repositoryIds.length,
        nextDto: {
          ...dto,
          runId: state.runId,
          phase: 'external_import',
          resumeState: state as Record<string, unknown>,
        },
      };
    }

    return {
      continued: true,
      phase: 'hydrate_content',
      repositoryCandidates: state.repositoryIds.length,
      nextDto: {
        ...dto,
        runId: state.runId,
        phase: 'hydrate_content',
        resumeState: state as Record<string, unknown>,
      },
    };
  }

  private async runHydratePhase(
    dto: RunColdToolCollectorDto,
    options: {
      onProgress?: (progress: number) => Promise<void> | void;
      onHeartbeat?: (
        payload: ColdToolCollectorRuntimePayload,
      ) => Promise<void> | void;
    },
  ): Promise<ColdToolCollectorDirectResult> {
    const state = this.readResumeState(dto.resumeState);
    const hydrateChunks = this.chunkItems(
      state.repositoryIds,
      this.readPositiveInt(
        'COLD_TOOL_HYDRATE_REPOSITORY_CHUNK_SIZE',
        120,
        1,
      ),
    );
    const chunkIndex = Math.max(0, state.hydrateChunkIndex);

    if (chunkIndex >= hydrateChunks.length) {
      this.logger.log(
        `cold_tool_collection stage=snapshot repositoryCandidates=${state.repositoryIds.length} snapshotChunks=${this.getSnapshotChunks(state.repositoryIds).length}`,
      );
      return {
        continued: true,
        phase: 'snapshot',
        repositoryCandidates: state.repositoryIds.length,
        nextDto: {
          ...dto,
          runId: state.runId,
          phase: 'snapshot',
          resumeState: state as Record<string, unknown>,
        },
      };
    }

    await this.emitRuntimeFromResumeState(state, 'hydrate_content', 62, options);
    const hydrationResult = await this.githubService.hydrateRepositories(
      hydrateChunks[chunkIndex],
      {
        concurrency: this.readPositiveInt(
          'COLD_TOOL_HYDRATE_CONCURRENCY',
          4,
          1,
        ),
        refreshThresholdHours: this.readPositiveInt(
          'COLD_TOOL_HYDRATE_REFRESH_HOURS',
          24,
          1,
        ),
      },
    );
    state.hydratedRepositories += hydrationResult.hydrated;
    state.hydrationSkippedRecent += hydrationResult.skippedRecent;
    state.hydrationFailed += hydrationResult.failed;
    state.hydrateChunkIndex = chunkIndex + 1;
    const progress =
      62 +
      Math.round((state.hydrateChunkIndex / Math.max(1, hydrateChunks.length)) * 8);
    await this.emitRuntimeFromResumeState(
      state,
      'hydrate_content',
      Math.max(62, Math.min(70, progress)),
      options,
    );

    if (state.hydrateChunkIndex < hydrateChunks.length) {
      return {
        continued: true,
        phase: 'hydrate_content',
        repositoryCandidates: state.repositoryIds.length,
        nextDto: {
          ...dto,
          runId: state.runId,
          phase: 'hydrate_content',
          resumeState: state as Record<string, unknown>,
        },
      };
    }

    return {
      continued: true,
      phase: 'snapshot',
      repositoryCandidates: state.repositoryIds.length,
      nextDto: {
        ...dto,
        runId: state.runId,
        phase: 'snapshot',
        resumeState: state as Record<string, unknown>,
      },
    };
  }

  private async runSnapshotPhase(
    dto: RunColdToolCollectorDto,
    options: {
      onProgress?: (progress: number) => Promise<void> | void;
      onHeartbeat?: (
        payload: ColdToolCollectorRuntimePayload,
      ) => Promise<void> | void;
    },
  ): Promise<ColdToolCollectorDirectResult> {
    const state = this.readResumeState(dto.resumeState);
    const snapshotRepositoryChunks = this.getSnapshotChunks(state.repositoryIds);
    const chunkIndex = Math.max(0, state.snapshotChunkIndex);

    if (chunkIndex >= snapshotRepositoryChunks.length) {
      return {
        continued: true,
        phase: 'cold_tool_discovery',
        repositoryCandidates: state.repositoryIds.length,
        nextDto: {
          ...dto,
          runId: state.runId,
          phase: 'cold_tool_discovery',
          resumeState: state as Record<string, unknown>,
        },
      };
    }

    const chunkRepositoryIds = snapshotRepositoryChunks[chunkIndex];
    await this.emitRuntimeFromResumeState(state, 'snapshot', 70, options);
    const result = await this.ideaSnapshotService.analyzeRepositoriesBatch({
      repositoryIds: chunkRepositoryIds,
      batchSize: this.readPositiveInt('COLD_TOOL_SNAPSHOT_BATCH_SIZE', 8, 1),
      onlyIfMissing: true,
      persist: true,
      analysisLane: 'cold_tool',
      modelOverride:
        this.cleanText(process.env.COLD_TOOL_SNAPSHOT_MODEL, 80) ??
        this.cleanText(process.env.COLD_TOOL_OPENAI_LIGHT_MODEL, 80) ??
        this.cleanText(process.env.COLD_TOOL_OPENAI_MODEL, 80) ??
        undefined,
    });
    state.snapshotProcessed += result.processed;
    const earlyDiscoveryEnabled = this.readBoolean(
      'COLD_TOOL_EARLY_DISCOVERY_AFTER_SNAPSHOT',
      true,
    );
    if (earlyDiscoveryEnabled) {
      const discoveryProcessedRepositoryIds = new Set(
        state.discoveryProcessedRepositoryIds,
      );
      const chunkOriginsByRepositoryId = Object.fromEntries(
        chunkRepositoryIds.map((repositoryId: string) => [
          repositoryId,
          state.originsByRepositoryId[repositoryId] ?? [],
        ]),
      );
      const earlyDiscoveryRepositoryIds = chunkRepositoryIds.filter(
        (repositoryId) => !discoveryProcessedRepositoryIds.has(repositoryId),
      );
      if (earlyDiscoveryRepositoryIds.length) {
        const matchedRepositoryIds = new Set(state.matchedRepositoryIds);
        const deepQueuedRepositoryIds = new Set(state.deepQueuedRepositoryIds);
        const discoveryResult =
          await this.coldToolDiscoveryService.analyzeRepositoriesBatch({
            repositoryIds: earlyDiscoveryRepositoryIds,
            originsByRepositoryId: chunkOriginsByRepositoryId,
            batchSize: this.readPositiveInt('COLD_TOOL_DISCOVERY_BATCH_SIZE', 4, 1),
            persist: true,
            forceRefresh: dto.forceRefresh,
            modelOverride:
              dto.modelOverride ??
              this.cleanText(process.env.COLD_TOOL_DISCOVERY_MODEL, 80) ??
              'gpt-5.4',
          });
        state.coldToolEvaluated += discoveryResult.processed;
        const newlyMatchedRepositoryIds = new Set<string>();
        for (const item of discoveryResult.items) {
          if (item.output?.fitsColdToolPool === true) {
            matchedRepositoryIds.add(item.repositoryId);
            newlyMatchedRepositoryIds.add(item.repositoryId);
          }
        }
        state.matchedRepositoryIds = Array.from(matchedRepositoryIds);
        const incrementalQueueCandidates = Array.from(newlyMatchedRepositoryIds).filter(
          (repositoryId) => !deepQueuedRepositoryIds.has(repositoryId),
        );
        if (incrementalQueueCandidates.length) {
          const incrementalQueued = await this.enqueueColdToolDeepAnalyses(
            incrementalQueueCandidates,
          );
          state.deepAnalysisQueued += incrementalQueued.queuedCount;
          incrementalQueued.queuedRepositoryIds.forEach((repositoryId) =>
            deepQueuedRepositoryIds.add(repositoryId),
          );
        }
        earlyDiscoveryRepositoryIds.forEach((repositoryId) =>
          discoveryProcessedRepositoryIds.add(repositoryId),
        );
        state.discoveryProcessedRepositoryIds = Array.from(
          discoveryProcessedRepositoryIds,
        );
        state.deepQueuedRepositoryIds = Array.from(deepQueuedRepositoryIds);
      }
    }
    state.snapshotChunkIndex = chunkIndex + 1;
    const progress =
      70 +
      Math.round(
        (state.snapshotChunkIndex / Math.max(1, snapshotRepositoryChunks.length)) * 10,
      );
    await this.emitRuntimeFromResumeState(state, 'snapshot', progress, options);

    if (state.snapshotChunkIndex < snapshotRepositoryChunks.length) {
      return {
        continued: true,
        phase: 'snapshot',
        repositoryCandidates: state.repositoryIds.length,
        nextDto: {
          ...dto,
          runId: state.runId,
          phase: 'snapshot',
          resumeState: state as Record<string, unknown>,
        },
      };
    }

    this.logger.log(
      `cold_tool_collection stage=cold_tool_discovery snapshotProcessed=${state.snapshotProcessed} repositoryCandidates=${state.repositoryIds.length}`,
    );

    return {
      continued: true,
      phase: 'cold_tool_discovery',
      repositoryCandidates: state.repositoryIds.length,
      nextDto: {
        ...dto,
        runId: state.runId,
        phase: 'cold_tool_discovery',
        resumeState: state as Record<string, unknown>,
      },
    };
  }

  private async runColdToolDiscoveryPhase(
    dto: RunColdToolCollectorDto,
    options: {
      onProgress?: (progress: number) => Promise<void> | void;
      onHeartbeat?: (
        payload: ColdToolCollectorRuntimePayload,
      ) => Promise<void> | void;
    },
  ): Promise<ColdToolCollectorDirectResult> {
    const state = this.readResumeState(dto.resumeState);
    const discoveryProcessedRepositoryIds = new Set(
      state.discoveryProcessedRepositoryIds,
    );
    const remainingDiscoveryRepositoryIds = state.repositoryIds.filter(
      (repositoryId) => !discoveryProcessedRepositoryIds.has(repositoryId),
    );
    const discoveryRepositoryChunks = this.getDiscoveryChunks(
      remainingDiscoveryRepositoryIds,
    );
    const chunkIndex = Math.max(0, state.discoveryChunkIndex);

    if (chunkIndex >= discoveryRepositoryChunks.length) {
      return {
        continued: true,
        phase: 'deep_queue',
        repositoryCandidates: state.repositoryIds.length,
        nextDto: {
          ...dto,
          runId: state.runId,
          phase: 'deep_queue',
          resumeState: state as Record<string, unknown>,
        },
      };
    }

    await this.emitRuntimeFromResumeState(state, 'cold_tool_discovery', 82, options);
    const chunkRepositoryIds = discoveryRepositoryChunks[chunkIndex];
    const chunkOriginsByRepositoryId = Object.fromEntries(
      chunkRepositoryIds.map((repositoryId: string) => [
        repositoryId,
        state.originsByRepositoryId[repositoryId] ?? [],
      ]),
    );
    const matchedRepositoryIds = new Set(state.matchedRepositoryIds);
    const deepQueuedRepositoryIds = new Set(state.deepQueuedRepositoryIds);
    const result = await this.coldToolDiscoveryService.analyzeRepositoriesBatch({
      repositoryIds: chunkRepositoryIds,
      originsByRepositoryId: chunkOriginsByRepositoryId,
      batchSize: this.readPositiveInt('COLD_TOOL_DISCOVERY_BATCH_SIZE', 4, 1),
      persist: true,
      forceRefresh: dto.forceRefresh,
      modelOverride:
        dto.modelOverride ??
        this.cleanText(process.env.COLD_TOOL_DISCOVERY_MODEL, 80) ??
        'gpt-5.4',
      onBatchProgress: async (batchProgress) => {
        const totalChunks = Math.max(1, discoveryRepositoryChunks.length);
        const completedChunkRatio = chunkIndex / totalChunks;
        const currentChunkRatio =
          batchProgress.totalBatches > 0
            ? batchProgress.completedBatches / batchProgress.totalBatches
            : 1;
        const overallRatio =
          completedChunkRatio + currentChunkRatio / totalChunks;
        const progress = 82 + Math.round(overallRatio * 10);

        await this.emitRuntimeFromResumeState(
          state,
          'cold_tool_discovery',
          Math.max(82, Math.min(92, progress)),
          options,
          matchedRepositoryIds,
        );
      },
    });
    state.coldToolEvaluated += result.processed;
    const newlyMatchedRepositoryIds = new Set<string>();
    for (const item of result.items) {
      if (item.output?.fitsColdToolPool === true) {
        matchedRepositoryIds.add(item.repositoryId);
        newlyMatchedRepositoryIds.add(item.repositoryId);
      }
    }
    state.matchedRepositoryIds = Array.from(matchedRepositoryIds);
    const incrementalQueueCandidates = Array.from(newlyMatchedRepositoryIds).filter(
      (repositoryId) => !deepQueuedRepositoryIds.has(repositoryId),
    );
    if (incrementalQueueCandidates.length) {
      const incrementalQueued = await this.enqueueColdToolDeepAnalyses(
        incrementalQueueCandidates,
      );
      state.deepAnalysisQueued += incrementalQueued.queuedCount;
      incrementalQueued.queuedRepositoryIds.forEach((repositoryId) =>
        deepQueuedRepositoryIds.add(repositoryId),
      );
    }
    chunkRepositoryIds.forEach((repositoryId) =>
      discoveryProcessedRepositoryIds.add(repositoryId),
    );
    state.discoveryProcessedRepositoryIds = Array.from(
      discoveryProcessedRepositoryIds,
    );
    state.deepQueuedRepositoryIds = Array.from(deepQueuedRepositoryIds);
    state.discoveryChunkIndex = chunkIndex + 1;
    const progress =
      82 +
      Math.round(
        (state.discoveryChunkIndex / Math.max(1, discoveryRepositoryChunks.length)) * 10,
      );
    await this.emitRuntimeFromResumeState(
      state,
      'cold_tool_discovery',
      progress,
      options,
      matchedRepositoryIds,
    );

    if (state.discoveryChunkIndex < discoveryRepositoryChunks.length) {
      return {
        continued: true,
        phase: 'cold_tool_discovery',
        repositoryCandidates: state.repositoryIds.length,
        nextDto: {
          ...dto,
          runId: state.runId,
          phase: 'cold_tool_discovery',
          resumeState: state as Record<string, unknown>,
        },
      };
    }

    return {
      continued: true,
      phase: 'deep_queue',
      repositoryCandidates: state.repositoryIds.length,
      nextDto: {
        ...dto,
        runId: state.runId,
        phase: 'deep_queue',
        resumeState: state as Record<string, unknown>,
      },
    };
  }

  private async runDeepQueuePhase(
    dto: RunColdToolCollectorDto,
    options: {
      onProgress?: (progress: number) => Promise<void> | void;
      onHeartbeat?: (
        payload: ColdToolCollectorRuntimePayload,
      ) => Promise<void> | void;
    },
  ) {
    const state = this.readResumeState(dto.resumeState);
    const alreadyQueuedRepositoryIds = new Set(state.deepQueuedRepositoryIds);
    const remainingRepositoryIds = state.matchedRepositoryIds.filter(
      (repositoryId) => !alreadyQueuedRepositoryIds.has(repositoryId),
    );
    const queued = await this.enqueueColdToolDeepAnalyses(remainingRepositoryIds);
    state.deepAnalysisQueued += queued.queuedCount;
    queued.queuedRepositoryIds.forEach((repositoryId) =>
      alreadyQueuedRepositoryIds.add(repositoryId),
    );
    state.deepQueuedRepositoryIds = Array.from(alreadyQueuedRepositoryIds);

    await this.emitRuntimeFromResumeState(state, 'deep_queue', 95, options);

    const summary = {
      executedAt: new Date().toISOString(),
      queriesExecuted: state.selectedEntries.length,
      languageRotationSeed: state.languageRotationSeed,
      queryConcurrency: state.queryConcurrency,
      perQueryLimit: state.perQueryLimit,
      lookbackDays: state.lookbackDays,
      fetchedLinks: state.fetchedLinks,
      createdRepositories: state.createdRepositories,
      updatedRepositories: state.updatedRepositories,
      failedRepositories: state.failedRepositories,
      externalImportedRepositories: state.externalImportedRepositories,
      externalDuplicateRepositoryRefs: state.externalDuplicateRepositoryRefs,
      externalReusedRepositories: state.externalReusedRepositories,
      hydratedRepositories: state.hydratedRepositories,
      hydrationSkippedRecent: state.hydrationSkippedRecent,
      hydrationFailed: state.hydrationFailed,
      externalSourceHitCount: state.externalSourceHitCount,
      snapshotProcessed: state.snapshotProcessed,
      coldToolEvaluated: state.coldToolEvaluated,
      coldToolMatched: state.matchedRepositoryIds.length,
      deepAnalysisQueued: state.deepAnalysisQueued,
      topMatchedRepositoryIds: state.matchedRepositoryIds.slice(0, 20),
      activeProgrammingLanguages: Array.from(
        new Set(
          state.selectedEntries
            .map((entry) => entry.codeLanguage)
            .filter((item): item is string => Boolean(item)),
        ),
      ),
      activeDomains: Array.from(
        new Set(state.selectedEntries.map((entry) => entry.group)),
      ),
      queryPlan: state.selectedEntries.map((entry) => ({
        domain: entry.group,
        domainZh: entry.labelZh,
        locale: entry.locale,
        keyword: entry.keyword,
        codeLanguage: entry.codeLanguage,
        searchMode: entry.searchMode,
        lookbackDays: entry.lookbackDays,
      })),
    };

    await this.saveState({
      cursor: state.nextCursor,
      lastRunAt: new Date().toISOString(),
      lastRunSummary: summary,
    });

    this.logger.log(
      `cold_tool_collection runId=${state.runId} stage=done fetchedLinks=${state.fetchedLinks} externalImportedRepositories=${state.externalImportedRepositories} snapshotProcessed=${state.snapshotProcessed} coldToolMatched=${state.matchedRepositoryIds.length} deepAnalysisQueued=${state.deepAnalysisQueued}`,
    );
    await this.emitRuntimeFromResumeState(state, 'done', 100, options);

    return summary;
  }

  private async enqueueColdToolDeepAnalyses(repositoryIds: string[]) {
    if (!repositoryIds.length) {
      return {
        queuedCount: 0,
        queuedRepositoryIds: [],
      };
    }

    const repositories = await this.prisma.repository.findMany({
      where: {
        id: {
          in: repositoryIds,
        },
      },
      include: {
        analysis: true,
      },
    });

    const entries = repositories
      .filter((repository) => {
        const analysis = repository.analysis;
        return !(
          analysis?.completenessJson &&
          analysis?.ideaFitJson &&
          analysis?.extractedIdeaJson &&
          analysis?.insightJson
        );
      })
      .map((repository) => ({
        repositoryId: repository.id,
        dto: {
          runFastFilter: false,
          runCompleteness: true,
          runIdeaFit: true,
          runIdeaExtract: true,
          forceRerun: false,
          analysisLane: 'cold_tool',
        } satisfies RunAnalysisDto,
        triggeredBy: 'cold_tool_collector',
        metadata: {
          fromColdToolCollector: true,
        },
        jobOptionsOverride: {
          priority: this.readPositiveInt(
            'COLD_TOOL_DEEP_ANALYSIS_PRIORITY',
            18,
            1,
          ),
        },
      }));

    if (!entries.length) {
      return {
        queuedCount: 0,
        queuedRepositoryIds: [],
      };
    }

    await this.queueService.enqueueSingleAnalysesBulk(
      entries,
      'cold_tool_collector',
    );

    return {
      queuedCount: entries.length,
      queuedRepositoryIds: entries.map((entry) => entry.repositoryId),
    };
  }

  private buildSearchPlan(languageRotationSeed: number) {
    const programmingLanguages = this.resolveProgrammingLanguages(
      languageRotationSeed,
    );
    const perDomainPlans = this.resolveDomains().map((domain) => {
      const entries: ColdToolSearchPlanEntry[] = [];
      for (const keyword of domain.keywords) {
        const modes =
          keyword.modes && keyword.modes.length
            ? keyword.modes
            : [GitHubFetchMode.CREATED];

        for (const searchMode of modes) {
          for (const codeLanguage of programmingLanguages) {
            entries.push({
              source:
                domain.group === 'awesome_curated' ||
                domain.group === 'alternative_relations'
                  ? 'github_curated'
                  : 'github_query',
              group: domain.group,
              labelZh: domain.labelZh,
              locale: keyword.locale,
              keyword: keyword.query,
              codeLanguage,
              searchMode,
              lookbackDays: keyword.lookbackDays ?? this.readPositiveInt(
                'COLD_TOOL_LOOKBACK_DAYS',
                540,
                7,
              ),
            });
          }
        }
      }

      return entries;
    });

    return this.interleavePlans(perDomainPlans);
  }

  private resolveDomains(): ColdToolSearchDomainConfig[] {
    return [
      ...this.buildProblemActionDomains(),
      {
        group: 'workflow_automation',
        labelZh: '工作流与自动化',
        keywords: [
          { locale: 'en', query: 'workflow automation tool' },
          { locale: 'en', query: 'productivity workflow app' },
          { locale: 'zh', query: '工作流 自动化 工具' },
          { locale: 'ja', query: 'ワークフロー 自動化 ツール' },
          { locale: 'ko', query: '워크플로 자동화 도구' },
          { locale: 'es', query: 'herramienta automatizacion flujo trabajo' },
          {
            locale: 'en',
            query: 'workflow tool',
            modes: [GitHubFetchMode.UPDATED],
            lookbackDays: 45,
          },
        ],
      },
      {
        group: 'developer_tools',
        labelZh: '开发工具',
        keywords: [
          { locale: 'en', query: 'developer tool workflow' },
          { locale: 'en', query: 'api debugging tool' },
          { locale: 'en', query: 'git automation cli tool' },
          { locale: 'en', query: 'local developer productivity app' },
          { locale: 'zh', query: '开发 工具 效率' },
          { locale: 'de', query: 'entwickler werkzeug workflow' },
          { locale: 'fr', query: 'outil productivite developpeur' },
          {
            locale: 'en',
            query: 'developer productivity tool',
            modes: [GitHubFetchMode.UPDATED],
            lookbackDays: 60,
          },
        ],
      },
      {
        group: 'browser_extension',
        labelZh: '浏览器扩展',
        keywords: [
          { locale: 'en', query: 'browser extension productivity' },
          { locale: 'en', query: 'chrome extension workflow' },
          { locale: 'en', query: 'browser automation extension tool' },
          { locale: 'zh', query: '浏览器 扩展 效率 工具' },
          { locale: 'es', query: 'extension navegador productividad' },
          { locale: 'pt', query: 'extensao navegador produtividade' },
          {
            locale: 'en',
            query: 'browser extension tool',
            modes: [GitHubFetchMode.UPDATED],
            lookbackDays: 30,
          },
        ],
      },
      {
        group: 'api_integration',
        labelZh: 'API 与集成工具',
        keywords: [
          { locale: 'en', query: 'api integration tool' },
          { locale: 'en', query: 'automation integration service' },
          { locale: 'en', query: 'internal api workflow tool' },
          { locale: 'zh', query: 'API 集成 工具' },
          { locale: 'pt', query: 'ferramenta integracao api' },
          { locale: 'ja', query: 'API 連携 ツール' },
          {
            locale: 'en',
            query: 'api workflow tool',
            modes: [GitHubFetchMode.UPDATED],
            lookbackDays: 45,
          },
        ],
      },
      {
        group: 'data_tools',
        labelZh: '数据工具',
        keywords: [
          { locale: 'en', query: 'data workflow tool' },
          { locale: 'en', query: 'scraping automation tool' },
          { locale: 'en', query: 'dataset workflow app' },
          { locale: 'zh', query: '数据 工具 采集' },
          { locale: 'fr', query: 'outil donnees workflow' },
          { locale: 'de', query: 'daten workflow werkzeug' },
        ],
      },
      {
        group: 'ops_tools',
        labelZh: '运维与监控工具',
        keywords: [
          { locale: 'en', query: 'monitoring tool workflow' },
          { locale: 'en', query: 'ops automation tool' },
          { locale: 'en', query: 'incident response tool' },
          { locale: 'zh', query: '运维 监控 工具' },
          { locale: 'ko', query: '운영 모니터링 도구' },
          { locale: 'es', query: 'herramienta monitoreo operacion' },
          {
            locale: 'en',
            query: 'ops tool',
            modes: [GitHubFetchMode.UPDATED],
            lookbackDays: 45,
          },
        ],
      },
      {
        group: 'content_tools',
        labelZh: '内容与营销工具',
        keywords: [
          { locale: 'en', query: 'seo content tool' },
          { locale: 'en', query: 'content workflow tool' },
          { locale: 'zh', query: '内容 营销 工具' },
          { locale: 'ja', query: 'コンテンツ ワークフロー ツール' },
        ],
      },
      {
        group: 'support_sales_tools',
        labelZh: '客服与销售工具',
        keywords: [
          { locale: 'en', query: 'customer support tool' },
          { locale: 'en', query: 'sales workflow tool' },
          { locale: 'zh', query: '客服 销售 工具' },
          { locale: 'pt', query: 'ferramenta atendimento vendas' },
        ],
      },
      {
        group: 'creator_tools',
        labelZh: '创作者工具',
        keywords: [
          { locale: 'en', query: 'creator workflow tool' },
          { locale: 'en', query: 'content production app' },
          { locale: 'zh', query: '创作者 工具' },
          { locale: 'ko', query: '크리에이터 도구' },
        ],
      },
      {
        group: 'internal_ops_tools',
        labelZh: '内部效率工具',
        keywords: [
          { locale: 'en', query: 'internal tool workflow' },
          { locale: 'en', query: 'team operations tool' },
          { locale: 'zh', query: '内部 工具 效率' },
          { locale: 'de', query: 'internes team werkzeug' },
        ],
      },
      {
        group: 'research_knowledge_tools',
        labelZh: '研究与知识工具',
        keywords: [
          { locale: 'en', query: 'research workflow tool' },
          { locale: 'en', query: 'knowledge management tool' },
          { locale: 'zh', query: '研究 知识 工具' },
          { locale: 'fr', query: 'outil gestion connaissance' },
        ],
      },
      {
        group: 'cli_terminal_tools',
        labelZh: '命令行与终端工具',
        keywords: [
          { locale: 'en', query: 'cli productivity tool' },
          { locale: 'en', query: 'terminal workflow app' },
          { locale: 'zh', query: '命令行 工具' },
          { locale: 'ja', query: 'ターミナル ツール' },
        ],
      },
      {
        group: 'testing_qa_tools',
        labelZh: '测试与 QA 工具',
        keywords: [
          { locale: 'en', query: 'test automation tool' },
          { locale: 'en', query: 'api testing tool' },
          { locale: 'zh', query: '测试 自动化 工具' },
          { locale: 'es', query: 'herramienta pruebas api' },
        ],
      },
      {
        group: 'docs_knowledge_tools',
        labelZh: '文档与知识工具',
        keywords: [
          { locale: 'en', query: 'knowledge base tool' },
          { locale: 'en', query: 'markdown note app' },
          { locale: 'zh', query: '知识库 文档 工具' },
          { locale: 'ja', query: 'wiki ナレッジ ツール' },
        ],
      },
      {
        group: 'security_privacy_tools',
        labelZh: '安全与隐私工具',
        keywords: [
          { locale: 'en', query: 'secrets management tool' },
          { locale: 'en', query: 'security scanning tool' },
          { locale: 'zh', query: '密钥 管理 工具' },
          { locale: 'fr', query: 'outil gestion secrets' },
          {
            locale: 'en',
            query: 'security tool',
            modes: [GitHubFetchMode.UPDATED],
            lookbackDays: 45,
          },
        ],
      },
      {
        group: 'database_admin_tools',
        labelZh: '数据库管理工具',
        keywords: [
          { locale: 'en', query: 'database client tool' },
          { locale: 'en', query: 'sql workflow tool' },
          { locale: 'zh', query: '数据库 客户端 工具' },
          { locale: 'es', query: 'cliente base de datos' },
        ],
      },
      {
        group: 'awesome_curated',
        labelZh: 'Awesome 清单',
        keywords: [
          { locale: 'en', query: 'topic:awesome self-hosted cli tool' },
          { locale: 'en', query: 'topic:awesome workflow automation' },
          { locale: 'en', query: 'topic:awesome developer tool' },
        ],
      },
      {
        group: 'alternative_relations',
        labelZh: '替代关系',
        keywords: [
          { locale: 'en', query: '"alternative to" open source self-hosted' },
          { locale: 'en', query: '"open source alternative" cli api tool' },
          { locale: 'en', query: '"self-hosted alternative" workflow tool' },
        ],
      },
    ];
  }

  private buildProblemActionDomains(): ColdToolSearchDomainConfig[] {
    const problems = this.readKeywordList(
      'COLD_TOOL_PROBLEM_TERMS',
      'monitor,diff,sync,dedupe,ocr,proxy,scraper,wallet,gateway',
    );
    const actions = this.readKeywordList(
      'COLD_TOOL_ACTION_TERMS',
      'generate,convert,lint,self-host,visualize,orchestrate,backup',
    );
    const forms = this.readKeywordList(
      'COLD_TOOL_FORM_TERMS',
      'cli,sdk,api,agent,worker,plugin,daemon,self-hosted',
    );
    const targets = this.readKeywordList(
      'COLD_TOOL_TARGET_TERMS',
      's3,postgresql,telegram,chrome,kubernetes',
    );
    const maxProblems = this.readPositiveInt(
      'COLD_TOOL_PROBLEM_BUCKET_SIZE',
      6,
      1,
    );
    const maxActions = this.readPositiveInt(
      'COLD_TOOL_ACTION_BUCKET_SIZE',
      2,
      1,
    );
    const maxForms = this.readPositiveInt(
      'COLD_TOOL_FORM_BUCKET_SIZE',
      2,
      1,
    );
    const maxTargets = this.readPositiveInt(
      'COLD_TOOL_TARGET_BUCKET_SIZE',
      2,
      1,
    );

    const selectedProblems = problems.slice(0, maxProblems);
    const selectedActions = actions.slice(0, maxActions);
    const selectedForms = forms.slice(0, maxForms);
    const selectedTargets = targets.slice(0, maxTargets);
    const queries = new Set<string>();

    for (const problem of selectedProblems) {
      for (const action of selectedActions) {
        for (const form of selectedForms) {
          for (const target of selectedTargets) {
            queries.add(`${problem} ${action} ${form} ${target}`);
            queries.add(`"${problem}" "${form}" "${target}" open source`);
          }
        }
      }
    }

    return [
      {
        group: 'problem_action_form',
        labelZh: '问题-动作-形态',
        keywords: Array.from(queries)
          .slice(0, 48)
          .map((query) => ({
            locale: 'en',
            query,
            modes: [GitHubFetchMode.UPDATED, GitHubFetchMode.CREATED],
            lookbackDays: 90,
          })),
      },
    ];
  }

  private resolveProgrammingLanguages(languageRotationSeed: number) {
    const coreLanguages = this.readLanguageList(
      'COLD_TOOL_CORE_LANGUAGES',
      'TypeScript,JavaScript,Python,Go',
    );
    const secondaryLanguages = this.readLanguageList(
      'COLD_TOOL_SECONDARY_LANGUAGES',
      'Java,Rust,C#,PHP',
    );
    const tailLanguages = this.readLanguageList(
      'COLD_TOOL_TAIL_LANGUAGES',
      'Kotlin,Swift,Ruby,Dart,Shell,Elixir',
    );
    const includeAnyLanguage = this.readBoolean(
      'COLD_TOOL_INCLUDE_ANY_LANGUAGE',
      true,
    );

    const secondaryBucketSize = this.readPositiveInt(
      'COLD_TOOL_SECONDARY_BUCKET_SIZE',
      2,
      1,
    );
    const tailBucketSize = this.readPositiveInt(
      'COLD_TOOL_TAIL_BUCKET_SIZE',
      2,
      1,
    );

    const secondaryBucket = this.takeRotatingBucket(
      secondaryLanguages,
      secondaryBucketSize,
      languageRotationSeed,
    );
    const tailBucket = this.takeRotatingBucket(
      tailLanguages,
      tailBucketSize,
      languageRotationSeed,
    );

    const merged = [
      ...(includeAnyLanguage ? [null] : []),
      ...coreLanguages,
      ...secondaryBucket,
      ...tailBucket,
    ];

    return Array.from(new Set(merged));
  }

  private readLanguageList(envName: string, fallback: string) {
    return String(process.env[envName] ?? fallback)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private readKeywordList(envName: string, fallback: string) {
    return String(process.env[envName] ?? fallback)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private takeRotatingBucket(
    items: string[],
    bucketSize: number,
    seed: number,
  ) {
    if (!items.length || bucketSize <= 0) {
      return [] as string[];
    }

    const bucket: string[] = [];
    for (let index = 0; index < Math.min(bucketSize, items.length); index += 1) {
      bucket.push(items[(seed * bucketSize + index) % items.length]);
    }

    return bucket;
  }

  private selectPlanEntries(
    plan: ColdToolSearchPlanEntry[],
    cursor: number,
    count: number,
  ) {
    if (!plan.length || count <= 0) {
      return [] as ColdToolSearchPlanEntry[];
    }

    const entries: ColdToolSearchPlanEntry[] = [];
    const seen = new Set<string>();

    for (
      let offset = 0;
      offset < plan.length && entries.length < count;
      offset += 1
    ) {
      const entry = plan[(cursor + offset) % plan.length];
      const key = this.buildPlanEntryKey(entry);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      entries.push(entry);
    }

    return entries;
  }

  private buildPlanEntryKey(entry: ColdToolSearchPlanEntry) {
    return [
      entry.source,
      entry.group,
      entry.locale,
      entry.keyword,
      entry.codeLanguage ?? '<any>',
      entry.searchMode,
      entry.lookbackDays,
    ].join('|');
  }

  private resolvePipelinePhase(value: unknown): ColdToolCollectorPipelinePhase {
    const normalized = this.cleanText(value, 80);
    if (
      normalized === 'external_import' ||
      normalized === 'hydrate_content' ||
      normalized === 'snapshot' ||
      normalized === 'cold_tool_discovery' ||
      normalized === 'deep_queue'
    ) {
      return normalized;
    }

    return 'full';
  }

  private readResumeState(value: unknown): ColdToolCollectorResumeState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Cold tool collector resume state is missing.');
    }

    const record = value as Record<string, unknown>;
    const selectedEntries = Array.isArray(record.selectedEntries)
      ? record.selectedEntries
          .map((item) => this.normalizePlanEntry(item))
          .filter((item): item is ColdToolSearchPlanEntry => Boolean(item))
      : [];
    const repositoryIds = Array.isArray(record.repositoryIds)
      ? record.repositoryIds
          .map((item) => this.cleanText(item, 160))
          .filter((item): item is string => Boolean(item))
      : [];
    const matchedRepositoryIds = Array.isArray(record.matchedRepositoryIds)
      ? record.matchedRepositoryIds
          .map((item) => this.cleanText(item, 160))
          .filter((item): item is string => Boolean(item))
      : [];
    const discoveryProcessedRepositoryIds = Array.isArray(
      record.discoveryProcessedRepositoryIds,
    )
      ? record.discoveryProcessedRepositoryIds
          .map((item) => this.cleanText(item, 160))
          .filter((item): item is string => Boolean(item))
      : [];
    const deepQueuedRepositoryIds = Array.isArray(record.deepQueuedRepositoryIds)
      ? record.deepQueuedRepositoryIds
          .map((item) => this.cleanText(item, 160))
          .filter((item): item is string => Boolean(item))
      : [];

    return {
      runId: this.cleanText(record.runId, 80) ?? randomUUID(),
      selectedEntries,
      nextCursor: this.readNonNegativeInt(record.nextCursor, 0),
      fetchedLinks: this.readNonNegativeInt(record.fetchedLinks, 0),
      createdRepositories: this.readNonNegativeInt(record.createdRepositories, 0),
      updatedRepositories: this.readNonNegativeInt(record.updatedRepositories, 0),
      failedRepositories: this.readNonNegativeInt(record.failedRepositories, 0),
      externalImportedRepositories: this.readNonNegativeInt(
        record.externalImportedRepositories,
        0,
      ),
      externalDuplicateRepositoryRefs: this.readNonNegativeInt(
        record.externalDuplicateRepositoryRefs,
        0,
      ),
      externalReusedRepositories: this.readNonNegativeInt(
        record.externalReusedRepositories,
        0,
      ),
      hydratedRepositories: this.readNonNegativeInt(record.hydratedRepositories, 0),
      hydrationSkippedRecent: this.readNonNegativeInt(record.hydrationSkippedRecent, 0),
      hydrationFailed: this.readNonNegativeInt(record.hydrationFailed, 0),
      externalSourceHitCount: this.readNonNegativeInt(record.externalSourceHitCount, 0),
      externalHits: this.normalizeExternalHits(record.externalHits),
      externalImportChunkIndex: this.readNonNegativeInt(
        record.externalImportChunkIndex,
        0,
      ),
      repositoryIds,
      originsByRepositoryId: this.normalizeOriginsByRepositoryId(
        record.originsByRepositoryId,
      ),
      hydrateChunkIndex: this.readNonNegativeInt(record.hydrateChunkIndex, 0),
      snapshotProcessed: this.readNonNegativeInt(record.snapshotProcessed, 0),
      snapshotChunkIndex: this.readNonNegativeInt(record.snapshotChunkIndex, 0),
      coldToolEvaluated: this.readNonNegativeInt(record.coldToolEvaluated, 0),
      discoveryChunkIndex: this.readNonNegativeInt(record.discoveryChunkIndex, 0),
      discoveryProcessedRepositoryIds,
      matchedRepositoryIds,
      deepQueuedRepositoryIds,
      deepAnalysisQueued: this.readNonNegativeInt(record.deepAnalysisQueued, 0),
      perQueryLimit: this.readNonNegativeInt(record.perQueryLimit, 0),
      lookbackDays: this.readNonNegativeInt(record.lookbackDays, 0),
      languageRotationSeed: this.readNonNegativeInt(record.languageRotationSeed, 0),
      queryConcurrency: this.readNonNegativeInt(record.queryConcurrency, 0),
    };
  }

  private normalizePlanEntry(value: unknown): ColdToolSearchPlanEntry | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const source = this.cleanText(record.source, 40);
    const group = this.cleanText(record.group, 80);
    const labelZh = this.cleanText(record.labelZh, 80);
    const locale = this.cleanText(record.locale, 40);
    const keyword = this.cleanText(record.keyword, 200);
    const searchMode = this.cleanText(record.searchMode, 40);

    if (
      (source !== 'github_query' && source !== 'github_curated') ||
      !group ||
      !labelZh ||
      !locale ||
      !keyword ||
      !searchMode
    ) {
      return null;
    }

    return {
      source,
      group,
      labelZh,
      locale,
      keyword,
      codeLanguage: this.cleanText(record.codeLanguage, 80),
      searchMode: searchMode as GitHubFetchMode,
      lookbackDays: this.readNonNegativeInt(record.lookbackDays, 0),
    };
  }

  private normalizeOriginsByRepositoryId(
    value: unknown,
  ): Record<string, ColdToolOrigin[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([repositoryId, origins]) => [
        repositoryId,
        this.normalizeOriginsArray(origins),
      ]),
    );
  }

  private normalizeOriginsArray(value: unknown): ColdToolOrigin[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const record = item as Record<string, unknown>;
        const collector = this.cleanText(record.collector, 80);
        const domain = this.cleanText(record.domain, 120);
        const keyword = this.cleanText(record.keyword, 200);
        const locale = this.cleanText(record.locale, 40);
        const collectedAt = this.cleanText(record.collectedAt, 80);
        if (!collector || !domain || !keyword || !locale || !collectedAt) {
          return null;
        }

        return {
          collector,
          domain,
          keyword,
          locale,
          codeLanguage: this.cleanText(record.codeLanguage, 80),
          collectedAt,
        } satisfies ColdToolOrigin;
      })
      .filter((item): item is ColdToolOrigin => Boolean(item));
  }

  private normalizeExternalHits(value: unknown): ExternalSourceHit[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const record = item as Record<string, unknown>;
        const source = this.cleanText(record.source, 20);
        const query = this.cleanText(record.query, 200);
        const packageName = this.cleanText(record.packageName, 200);
        const repositoryFullName = this.cleanText(
          record.repositoryFullName,
          200,
        );

        if (
          (source !== 'npm' && source !== 'crates') ||
          !query ||
          !packageName ||
          !repositoryFullName
        ) {
          return null;
        }

        return {
          source,
          query,
          packageName,
          repositoryFullName,
          packageUrl: this.cleanText(record.packageUrl, 400),
        } satisfies ExternalSourceHit;
      })
      .filter((item): item is ExternalSourceHit => Boolean(item));
  }

  private buildResumeState(
    state: ColdToolCollectorResumeState,
  ): ColdToolCollectorResumeState {
    return {
      ...state,
      runId: state.runId,
      externalHits: state.externalHits.map((hit) => ({ ...hit })),
      externalImportChunkIndex: state.externalImportChunkIndex,
      repositoryIds: [...state.repositoryIds],
      discoveryProcessedRepositoryIds: [...state.discoveryProcessedRepositoryIds],
      matchedRepositoryIds: [...state.matchedRepositoryIds],
      deepQueuedRepositoryIds: [...state.deepQueuedRepositoryIds],
      selectedEntries: state.selectedEntries.map((entry) => ({ ...entry })),
      originsByRepositoryId: Object.fromEntries(
        Object.entries(state.originsByRepositoryId).map(([repositoryId, origins]) => [
          repositoryId,
          origins.map((origin) => ({ ...origin })),
        ]),
      ),
      hydrateChunkIndex: state.hydrateChunkIndex,
    };
  }

  private getSnapshotChunks(repositoryIds: string[]) {
    return this.chunkItems(
      repositoryIds,
      this.readPositiveInt('COLD_TOOL_SNAPSHOT_REPOSITORY_CHUNK_SIZE', 120, 1),
    );
  }

  private getDiscoveryChunks(repositoryIds: string[]) {
    return this.chunkItems(
      repositoryIds,
      this.readPositiveInt('COLD_TOOL_DISCOVERY_REPOSITORY_CHUNK_SIZE', 48, 1),
    );
  }

  private getExternalImportEntries(externalHits: ExternalSourceHit[]) {
    const grouped = new Map<string, ExternalSourceHit[]>();

    for (const hit of externalHits) {
      const existing = grouped.get(hit.repositoryFullName) ?? [];
      existing.push(hit);
      grouped.set(hit.repositoryFullName, existing);
    }

    return Array.from(grouped.entries());
  }

  private async emitRuntimeFromResumeState(
    state: ColdToolCollectorResumeState,
    currentStage: ColdToolCollectorStage,
    progress: number,
    options: {
      onProgress?: (progress: number) => Promise<void> | void;
      onHeartbeat?: (
        payload: ColdToolCollectorRuntimePayload,
      ) => Promise<void> | void;
    },
    matchedRepositoryIds: Set<string> | null = null,
  ) {
    const activeDomains = Array.from(
      new Set(state.selectedEntries.map((entry) => entry.group)),
    );
    const activeProgrammingLanguages = Array.from(
      new Set(
        state.selectedEntries
          .map((entry) => entry.codeLanguage)
          .filter((item): item is string => Boolean(item)),
      ),
    );
    const coldToolMatched = matchedRepositoryIds
      ? matchedRepositoryIds.size
      : state.matchedRepositoryIds.length;

    await options.onProgress?.(progress);
    await options.onHeartbeat?.({
      runId: state.runId,
      currentStage,
      progress,
      queriesSelected: state.selectedEntries.length,
      githubQueriesCompleted: state.selectedEntries.length,
      githubFetchedLinks: state.fetchedLinks,
      githubCreatedRepositories: state.createdRepositories,
      githubUpdatedRepositories: state.updatedRepositories,
      githubFailedRepositories: state.failedRepositories,
      externalSourceHitCount: state.externalSourceHitCount,
      externalImportedRepositories: state.externalImportedRepositories,
      externalDuplicateRepositoryRefs: state.externalDuplicateRepositoryRefs,
      externalReusedRepositories: state.externalReusedRepositories,
      hydratedRepositories: state.hydratedRepositories,
      hydrationSkippedRecent: state.hydrationSkippedRecent,
      hydrationFailed: state.hydrationFailed,
      repositoryCandidates: state.repositoryIds.length,
      snapshotProcessed: state.snapshotProcessed,
      coldToolEvaluated: state.coldToolEvaluated,
      coldToolMatched,
      deepAnalysisQueued: state.deepAnalysisQueued,
      activeDomains,
      activeProgrammingLanguages,
      runtimeUpdatedAt: new Date().toISOString(),
    });
  }

  private uniqueKeywords(keywords: string[]) {
    return [...new Set(keywords.map((item) => item.trim()).filter(Boolean))];
  }

  private appendOrigin(
    originsByRepositoryId: Map<string, ColdToolOrigin[]>,
    repositoryId: string,
    origin: ColdToolOrigin,
  ) {
    const existing = originsByRepositoryId.get(repositoryId) ?? [];
    const nextKey = [
      origin.collector,
      origin.domain,
      origin.keyword,
      origin.locale,
      origin.codeLanguage ?? '<null>',
    ].join('|');
    const existingIndex = existing.findIndex((item) => {
      return (
        [
          item.collector,
          item.domain,
          item.keyword,
          item.locale,
          item.codeLanguage ?? '<null>',
        ].join('|') === nextKey
      );
    });

    if (existingIndex >= 0) {
      existing[existingIndex] = origin;
    } else {
      existing.push(origin);
    }

    originsByRepositoryId.set(repositoryId, existing);
  }

  private interleavePlans(plans: ColdToolSearchPlanEntry[][]) {
    const workingPlans = plans.map((plan) => [...plan]);
    const output: ColdToolSearchPlanEntry[] = [];

    while (workingPlans.some((plan) => plan.length > 0)) {
      for (const plan of workingPlans) {
        const entry = plan.shift();
        if (entry) {
          output.push(entry);
        }
      }
    }

    return output;
  }

  private chunkItems<T>(items: T[], chunkSize: number) {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }

    return chunks;
  }

  private async ensureState() {
    const existing = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: COLD_TOOL_COLLECTOR_STATE_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (
      !existing?.configValue ||
      typeof existing.configValue !== 'object' ||
      Array.isArray(existing.configValue)
    ) {
      const initial = this.buildDefaultState();
      await this.saveState(initial);
      return initial;
    }

    return this.normalizeState(existing.configValue as Record<string, unknown>);
  }

  private async findExistingRepositoriesByFullName(repositoryFullNames: string[]) {
    const uniqueFullNames = [...new Set(repositoryFullNames.filter(Boolean))];
    const rows = await this.prisma.repository.findMany({
      where: {
        fullName: {
          in: uniqueFullNames,
        },
      },
      select: {
        id: true,
        fullName: true,
        updatedAtGithub: true,
        updatedAt: true,
      },
    });

    return new Map(rows.map((row) => [row.fullName, row]));
  }

  private wasRepositorySyncedRecently(
    updatedAtGithub: Date | null,
    updatedAt: Date,
    thresholdHours: number,
  ) {
    const reference = updatedAtGithub ?? updatedAt;
    return Date.now() - reference.getTime() <= thresholdHours * 60 * 60 * 1000;
  }

  private async saveState(state: ColdToolCollectorState) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: COLD_TOOL_COLLECTOR_STATE_CONFIG_KEY,
      },
      update: {
        configValue: state as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: COLD_TOOL_COLLECTOR_STATE_CONFIG_KEY,
        configValue: state as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private buildDefaultState(): ColdToolCollectorState {
    return {
      cursor: 0,
      lastRunAt: null,
      lastRunSummary: null,
    };
  }

  private normalizeState(value: Record<string, unknown>): ColdToolCollectorState {
    return {
      cursor: this.readNonNegativeInt(value.cursor, 0),
      lastRunAt: this.cleanText(value.lastRunAt, 80),
      lastRunSummary:
        value.lastRunSummary &&
        typeof value.lastRunSummary === 'object' &&
        !Array.isArray(value.lastRunSummary)
          ? (value.lastRunSummary as Record<string, unknown>)
          : null,
    };
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

  private toDateStringFromDays(days: number) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return normalized.slice(0, maxLength);
  }

  private readPositiveInt(envName: string, fallback: number, min: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < min) {
      return fallback;
    }

    return parsed;
  }

  private readBoolean(envName: string, fallback: boolean) {
    const raw = process.env[envName]?.trim().toLowerCase();

    if (!raw) {
      return fallback;
    }

    if (['1', 'true', 'yes', 'on'].includes(raw)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(raw)) {
      return false;
    }

    return fallback;
  }

  private readNonNegativeInt(value: unknown, fallback: number) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }

    return parsed;
  }
}
