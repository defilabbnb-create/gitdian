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
import { ColdToolExternalSourceService } from './cold-tool-external-source.service';

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

export type ColdToolCollectorRuntimePayload = {
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
  ) {
    const state = await this.ensureState();
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
    const externalDiscovery = await this.coldToolExternalSourceService.discoverRepositoryFullNames({
      queries: this.uniqueKeywords(selectedEntries.map((entry) => entry.keyword)),
      perQueryLimit: this.readPositiveInt('COLD_TOOL_EXTERNAL_PER_QUERY_LIMIT', 6, 1),
      concurrency: this.readPositiveInt('COLD_TOOL_EXTERNAL_QUERY_CONCURRENCY', 3, 1),
    });

    await options.onHeartbeat?.({
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

    this.logger.log(
      `cold_tool_collection stage=external_import sourceHits=${externalDiscovery.hits.length} uniqueRepos=${externalDiscovery.byRepositoryFullName.size}`,
    );
    const existingRepositoriesByFullName =
      await this.findExistingRepositoriesByFullName(
        Array.from(externalDiscovery.byRepositoryFullName.keys()),
      );
    const recentReuseThresholdHours = this.readPositiveInt(
      'COLD_TOOL_EXTERNAL_SKIP_SYNC_RECENT_HOURS',
      72,
      1,
    );

    await this.runWithConcurrency(
      Array.from(externalDiscovery.byRepositoryFullName.entries()),
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
            externalReusedRepositories += 1;
          }
          if (repositoryIds.has(imported.repositoryId)) {
            externalDuplicateRepositoryRefs += 1;
          }
          repositoryIds.add(imported.repositoryId);
          externalImportedRepositories += 1;

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

        await options.onHeartbeat?.({
          currentStage: 'external_import',
          progress: 55,
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
      },
    );

    const repositoryIdList = Array.from(repositoryIds);
    this.logger.log(
      `cold_tool_collection stage=hydrate_content repositoryCandidates=${repositoryIdList.length}`,
    );
    await emitRuntime('hydrate_content', 62);
    const hydrationResult = await this.githubService.hydrateRepositories(
      repositoryIdList,
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
    hydratedRepositories = hydrationResult.hydrated;
    hydrationSkippedRecent = hydrationResult.skippedRecent;
    hydrationFailed = hydrationResult.failed;

    this.logger.log(
      `cold_tool_collection stage=snapshot repositoryCandidates=${repositoryIdList.length}`,
    );
    await emitRuntime('snapshot', 70);
    const snapshotRepositoryChunkSize = this.readPositiveInt(
      'COLD_TOOL_SNAPSHOT_REPOSITORY_CHUNK_SIZE',
      120,
      1,
    );
    const snapshotRepositoryChunks = this.chunkItems(
      repositoryIdList,
      snapshotRepositoryChunkSize,
    );

    for (let index = 0; index < snapshotRepositoryChunks.length; index += 1) {
      const result = await this.ideaSnapshotService.analyzeRepositoriesBatch({
        repositoryIds: snapshotRepositoryChunks[index],
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
      snapshotProcessed += result.processed;
      await emitRuntime(
        'snapshot',
        70 + Math.round(((index + 1) / Math.max(1, snapshotRepositoryChunks.length)) * 10),
      );
    }

    this.logger.log(
      `cold_tool_collection stage=cold_tool_discovery snapshotProcessed=${snapshotProcessed} repositoryCandidates=${repositoryIdList.length}`,
    );
    await emitRuntime('cold_tool_discovery', 82);
    const discoveryRepositoryChunkSize = this.readPositiveInt(
      'COLD_TOOL_DISCOVERY_REPOSITORY_CHUNK_SIZE',
      48,
      1,
    );
    const discoveryRepositoryChunks = this.chunkItems(
      repositoryIdList,
      discoveryRepositoryChunkSize,
    );
    const matchedRepositoryIds = new Set<string>();

    for (let index = 0; index < discoveryRepositoryChunks.length; index += 1) {
      const chunkRepositoryIds = discoveryRepositoryChunks[index];
      const chunkOriginsByRepositoryId = Object.fromEntries(
        chunkRepositoryIds.map((repositoryId: string) => [
          repositoryId,
          originsByRepositoryId.get(repositoryId) ?? [],
        ]),
      );
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
      });
      coldToolEvaluated += result.processed;
      for (const item of result.items) {
        if (item.output?.fitsColdToolPool === true) {
          matchedRepositoryIds.add(item.repositoryId);
        }
      }
      coldToolMatched = matchedRepositoryIds.size;
      await emitRuntime(
        'cold_tool_discovery',
        82 + Math.round(((index + 1) / Math.max(1, discoveryRepositoryChunks.length)) * 10),
      );
    }

    this.logger.log(
      `cold_tool_collection stage=deep_queue coldToolEvaluated=${coldToolEvaluated} coldToolMatched=${coldToolMatched}`,
    );
    await emitRuntime('deep_queue', 95);
    deepAnalysisQueued = await this.enqueueColdToolDeepAnalyses(
      Array.from(matchedRepositoryIds),
    );
    const nextCursor = searchPlan.length
      ? (state.cursor + selectedEntries.length) % searchPlan.length
      : 0;

    const summary = {
      executedAt: new Date().toISOString(),
      queriesExecuted: selectedEntries.length,
      languageRotationSeed,
      queryConcurrency,
      perQueryLimit,
      lookbackDays,
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
      snapshotProcessed,
      coldToolEvaluated,
      coldToolMatched,
      deepAnalysisQueued,
      topMatchedRepositoryIds: Array.from(matchedRepositoryIds).slice(0, 20),
      activeProgrammingLanguages: Array.from(
        new Set(
          selectedEntries
            .map((entry) => entry.codeLanguage)
            .filter((item): item is string => Boolean(item)),
        ),
      ),
      activeDomains: Array.from(new Set(selectedEntries.map((entry) => entry.group))),
      queryPlan: selectedEntries.map((entry) => ({
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
      cursor: nextCursor,
      lastRunAt: new Date().toISOString(),
      lastRunSummary: summary,
    });

    this.logger.log(
      `cold_tool_collection stage=done fetchedLinks=${fetchedLinks} externalImportedRepositories=${externalImportedRepositories} snapshotProcessed=${snapshotProcessed} coldToolMatched=${coldToolMatched} deepAnalysisQueued=${deepAnalysisQueued}`,
    );
    await emitRuntime('done', 100);

    return summary;
  }

  private async enqueueColdToolDeepAnalyses(repositoryIds: string[]) {
    if (!repositoryIds.length) {
      return 0;
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
      }));

    if (!entries.length) {
      return 0;
    }

    await this.queueService.enqueueSingleAnalysesBulk(
      entries,
      'cold_tool_collector',
    );

    return entries.length;
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
