import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IdeaMainCategory } from '../analysis/idea-snapshot-taxonomy';
import { GitHubService } from './github.service';
import { RadarDailySummaryService } from './radar-daily-summary.service';

type KeywordGroupName = 'tools' | 'ai' | 'data' | 'infra';

type KeywordGroupConfig = {
  group: KeywordGroupName;
  keywords: string[];
  priority: number;
};

type KeywordGroupStats = {
  searchedCount: number;
  fetchedCount: number;
  snapshotPromisingCount: number;
  deepQueuedCount: number;
  goodIdeasCount: number;
  cloneIdeasCount: number;
  lastSearchedAt: string | null;
  lastProducedAt: string | null;
};

type KeywordSupplyState = {
  strategy: string;
  activeKeywordGroups: string[];
  lastRunAt: string | null;
  lastRunReason: string | null;
  lastSuccessfulGroup: string | null;
  keywordGroupStats: Record<string, KeywordGroupStats>;
};

export type KeywordSupplyDiagnostics = {
  keywordModeEnabled: boolean;
  currentKeywordStrategy: string;
  keywordSearchConcurrency: number;
  keywordLookbackDays: number;
  keywordPerQueryLimit: number;
  activeKeywordGroups: string[];
  keywordGroupStats: Array<
    KeywordGroupStats & {
      group: string;
      priorityScore: number;
    }
  >;
  lastRunAt: string | null;
  lastRunReason: string | null;
  lastSuccessfulGroup: string | null;
};

export type KeywordSupplyRunResult = {
  executed: boolean;
  reason: string;
  group: string | null;
  result: Awaited<ReturnType<GitHubService['runKeywordSupplyDirect']>> | null;
};

const KEYWORD_SUPPLY_STATE_CONFIG_KEY = 'github.radar.keyword.state';
const DEFAULT_GROUP_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_KEYWORD_LOOKBACK_DAYS = 14;
const DEFAULT_KEYWORD_PER_QUERY_LIMIT = 10;

@Injectable()
export class GitHubKeywordSupplyService {
  private readonly logger = new Logger(GitHubKeywordSupplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitHubService: GitHubService,
    private readonly radarDailySummaryService: RadarDailySummaryService,
  ) {}

  isEnabled() {
    return process.env.RADAR_KEYWORD_MODE_ENABLED?.toLowerCase() === 'true';
  }

  async getDiagnostics(): Promise<KeywordSupplyDiagnostics> {
    const state = await this.ensureState();
    const lookbackDays = this.resolveLookbackDays();
    const perQueryLimit = this.resolvePerQueryLimit();

    return {
      keywordModeEnabled: this.isEnabled(),
      currentKeywordStrategy: state.strategy,
      keywordSearchConcurrency: this.resolveSearchConcurrency(),
      keywordLookbackDays: lookbackDays,
      keywordPerQueryLimit: perQueryLimit,
      activeKeywordGroups: state.activeKeywordGroups,
      keywordGroupStats: this.rankKeywordGroups(state).map((entry) => ({
        group: entry.group,
        priorityScore: entry.score,
        ...entry.stats,
      })),
      lastRunAt: state.lastRunAt,
      lastRunReason: state.lastRunReason,
      lastSuccessfulGroup: state.lastSuccessfulGroup,
    };
  }

  async maybeRunKeywordSupply(args: {
    mode: 'bootstrap' | 'live' | 'paused';
    snapshotQueueSize: number;
    snapshotLowWatermark: number;
    deepQueueSize: number;
    deepLowWatermark: number;
    conservativeMode: boolean;
    pendingBackfillWindow: boolean;
    targetCategories: IdeaMainCategory[];
    tokenPoolHealth: {
      anonymousFallback: boolean;
      cooldownTokenCount: number;
      disabledTokenCount: number;
      lastKnownRateLimitStatus: {
        limited: boolean;
      } | null;
    };
  }): Promise<KeywordSupplyRunResult> {
    if (!this.isEnabled()) {
      return {
        executed: false,
        reason: 'keyword_mode_disabled',
        group: null,
        result: null,
      };
    }

    if (args.mode === 'paused') {
      return {
        executed: false,
        reason: 'radar_paused',
        group: null,
        result: null,
      };
    }

    if (args.snapshotQueueSize >= args.snapshotLowWatermark) {
      return {
        executed: false,
        reason: 'snapshot_queue_not_starving',
        group: null,
        result: null,
      };
    }

    if (
      args.tokenPoolHealth.anonymousFallback ||
      args.tokenPoolHealth.disabledTokenCount > 0 ||
      args.tokenPoolHealth.lastKnownRateLimitStatus?.limited
    ) {
      return {
        executed: false,
        reason: 'github_health_not_ready',
        group: null,
        result: null,
      };
    }

    if (args.conservativeMode && !args.pendingBackfillWindow) {
      return {
        executed: false,
        reason: 'github_conservative_mode',
        group: null,
        result: null,
      };
    }

    if (
      args.deepQueueSize >= args.deepLowWatermark &&
      !args.pendingBackfillWindow
    ) {
      return {
        executed: false,
        reason: 'deep_queue_already_fed',
        group: null,
        result: null,
      };
    }

    const state = await this.ensureState();
    const selectedGroup = this.selectGroup(state);

    if (!selectedGroup) {
      await this.saveState({
        ...state,
        activeKeywordGroups: [],
        lastRunReason: 'keyword_groups_on_cooldown',
      });
      return {
        executed: false,
        reason: 'keyword_groups_on_cooldown',
        group: null,
        result: null,
      };
    }

    await this.saveState({
      ...state,
      activeKeywordGroups: [selectedGroup.group],
      lastRunReason: 'keyword_supply_running',
    });

    try {
      const result = await this.gitHubService.runKeywordSupplyDirect({
        group: selectedGroup.group,
        keywords: selectedGroup.keywords,
        lookbackDays: this.resolveLookbackDays(),
        perKeywordLimit: this.resolvePerQueryLimit(),
        language: this.readDefaultLanguage(),
        starMin: this.readDefaultStarMin(),
        targetCategories: args.targetCategories,
        runIdeaSnapshot: true,
        runFastFilter: true,
        runDeepAnalysis: true,
        deepAnalysisOnlyIfPromising: true,
      });

      await this.radarDailySummaryService.recordKeywordSupplyRun({
        group: selectedGroup.group,
        repositoryIds: result.topRepositoryIds,
        fetchedRepositories: result.fetchedLinks,
        snapshotQueued: result.snapshotQueued,
        deepAnalyzed: result.deepAnalysisQueued,
        promisingCandidates: result.promisingCandidates,
        goodIdeas: result.goodIdeas,
        cloneCandidates: result.cloneIdeas,
      });

      const nextState = this.updateStateWithResult(state, selectedGroup.group, result);
      await this.saveState(nextState);

      return {
        executed: true,
        reason: 'keyword_supply_executed',
        group: selectedGroup.group,
        result,
      };
    } catch (error) {
      const nextState = {
        ...state,
        activeKeywordGroups: [],
        lastRunAt: new Date().toISOString(),
        lastRunReason:
          error instanceof Error
            ? this.cleanText(error.message, 200)
            : 'keyword_supply_failed',
      };
      await this.saveState(nextState);
      this.logger.warn(
        `Keyword supply failed for group=${selectedGroup.group}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  private async ensureState() {
    const existing = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: KEYWORD_SUPPLY_STATE_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!existing?.configValue || typeof existing.configValue !== 'object' || Array.isArray(existing.configValue)) {
      const initial = this.buildDefaultState();
      await this.saveState(initial);
      return initial;
    }

    return this.normalizeState(existing.configValue as Record<string, unknown>);
  }

  private async saveState(state: KeywordSupplyState) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: KEYWORD_SUPPLY_STATE_CONFIG_KEY,
      },
      update: {
        configValue: state as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: KEYWORD_SUPPLY_STATE_CONFIG_KEY,
        configValue: state as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private buildDefaultState(): KeywordSupplyState {
    return {
      strategy: this.resolveStrategy(),
      activeKeywordGroups: [],
      lastRunAt: null,
      lastRunReason: null,
      lastSuccessfulGroup: null,
      keywordGroupStats: Object.fromEntries(
        this.resolveKeywordGroups().map((entry) => [
          entry.group,
          this.emptyKeywordGroupStats(),
        ]),
      ),
    };
  }

  private normalizeState(value: Record<string, unknown>): KeywordSupplyState {
    const keywordGroups = this.resolveKeywordGroups();
    const rawStats =
      value.keywordGroupStats &&
      typeof value.keywordGroupStats === 'object' &&
      !Array.isArray(value.keywordGroupStats)
        ? (value.keywordGroupStats as Record<string, unknown>)
        : {};

    return {
      strategy: this.cleanText(value.strategy, 40) || this.resolveStrategy(),
      activeKeywordGroups: this.normalizeStringArray(value.activeKeywordGroups),
      lastRunAt: this.toNullableString(value.lastRunAt),
      lastRunReason: this.toNullableString(value.lastRunReason),
      lastSuccessfulGroup: this.toNullableString(value.lastSuccessfulGroup),
      keywordGroupStats: Object.fromEntries(
        keywordGroups.map((entry) => [
          entry.group,
          this.normalizeKeywordGroupStats(rawStats[entry.group]),
        ]),
      ),
    };
  }

  private updateStateWithResult(
    state: KeywordSupplyState,
    group: string,
    result: Awaited<ReturnType<GitHubService['runKeywordSupplyDirect']>>,
  ): KeywordSupplyState {
    const current = state.keywordGroupStats[group] ?? this.emptyKeywordGroupStats();
    const nextStats: KeywordGroupStats = {
      searchedCount: current.searchedCount + result.keywords.length,
      fetchedCount: current.fetchedCount + result.fetchedLinks,
      snapshotPromisingCount:
        current.snapshotPromisingCount + result.promisingCandidates,
      deepQueuedCount: current.deepQueuedCount + result.deepAnalysisQueued,
      goodIdeasCount: current.goodIdeasCount + result.goodIdeas,
      cloneIdeasCount: current.cloneIdeasCount + result.cloneIdeas,
      lastSearchedAt: new Date().toISOString(),
      lastProducedAt:
        result.snapshotQueued > 0 || result.deepAnalysisQueued > 0
          ? new Date().toISOString()
          : current.lastProducedAt,
    };

    return {
      ...state,
      strategy: this.resolveStrategy(),
      activeKeywordGroups: [],
      lastRunAt: new Date().toISOString(),
      lastRunReason: 'keyword_supply_succeeded',
      lastSuccessfulGroup: group,
      keywordGroupStats: {
        ...state.keywordGroupStats,
        [group]: nextStats,
      },
    };
  }

  private selectGroup(state: KeywordSupplyState) {
    const now = Date.now();
    const cooldownMs = this.resolveGroupCooldownMs();

    return this.rankKeywordGroups(state).find((entry) => {
      const lastSearchedAt = this.toTimestamp(entry.stats.lastSearchedAt);
      if (!lastSearchedAt) {
        return true;
      }

      return now - lastSearchedAt >= cooldownMs;
    }) ?? null;
  }

  private rankKeywordGroups(state: KeywordSupplyState) {
    return this.resolveKeywordGroups()
      .map((entry) => {
        const stats = state.keywordGroupStats[entry.group] ?? this.emptyKeywordGroupStats();
        const score =
          entry.priority +
          stats.goodIdeasCount * 20 +
          stats.cloneIdeasCount * 10 +
          stats.snapshotPromisingCount * 4 +
          stats.deepQueuedCount * 3 +
          Math.min(stats.fetchedCount, 50) -
          Math.max(0, stats.searchedCount - 1) * 2;

        return {
          ...entry,
          stats,
          score,
        };
      })
      .sort((left, right) => right.score - left.score);
  }

  private resolveKeywordGroups(): KeywordGroupConfig[] {
    const groups: KeywordGroupConfig[] = [
      {
        group: 'tools',
        keywords: this.parseKeywords(
          'RADAR_KEYWORDS_TOOLS',
          'workflow,automation,productivity,devtools,cli,browser extension,mcp',
        ),
        priority: 100,
      },
      {
        group: 'ai',
        keywords: this.parseKeywords(
          'RADAR_KEYWORDS_AI',
          'agent,ai coding,rag,search,assistant,openai,langchain',
        ),
        priority: 80,
      },
      {
        group: 'data',
        keywords: this.parseKeywords(
          'RADAR_KEYWORDS_DATA',
          'data pipeline,etl,scraping,analytics,warehouse',
        ),
        priority: 70,
      },
      {
        group: 'infra',
        keywords: this.parseKeywords(
          'RADAR_KEYWORDS_INFRA',
          'auth,observability,deployment,storage,api gateway,security',
        ),
        priority: 60,
      },
    ];

    return groups.filter((entry) => entry.keywords.length > 0);
  }

  private normalizeKeywordGroupStats(value: unknown): KeywordGroupStats {
    const current =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return {
      searchedCount: this.readNonNegativeNumber(current.searchedCount, 0),
      fetchedCount: this.readNonNegativeNumber(current.fetchedCount, 0),
      snapshotPromisingCount: this.readNonNegativeNumber(
        current.snapshotPromisingCount,
        0,
      ),
      deepQueuedCount: this.readNonNegativeNumber(current.deepQueuedCount, 0),
      goodIdeasCount: this.readNonNegativeNumber(current.goodIdeasCount, 0),
      cloneIdeasCount: this.readNonNegativeNumber(current.cloneIdeasCount, 0),
      lastSearchedAt: this.toNullableString(current.lastSearchedAt),
      lastProducedAt: this.toNullableString(current.lastProducedAt),
    };
  }

  private emptyKeywordGroupStats(): KeywordGroupStats {
    return {
      searchedCount: 0,
      fetchedCount: 0,
      snapshotPromisingCount: 0,
      deepQueuedCount: 0,
      goodIdeasCount: 0,
      cloneIdeasCount: 0,
      lastSearchedAt: null,
      lastProducedAt: null,
    };
  }

  private resolveStrategy() {
    return this.cleanText(process.env.RADAR_KEYWORD_STRATEGY, 40) || 'balanced';
  }

  private resolveSearchConcurrency() {
    return this.readInt('RADAR_KEYWORD_SEARCH_CONCURRENCY', 2, 1);
  }

  private resolveLookbackDays() {
    return this.readInt(
      'RADAR_KEYWORD_LOOKBACK_DAYS',
      DEFAULT_KEYWORD_LOOKBACK_DAYS,
      1,
    );
  }

  private resolvePerQueryLimit() {
    return this.readInt(
      'RADAR_KEYWORD_PER_QUERY_LIMIT',
      DEFAULT_KEYWORD_PER_QUERY_LIMIT,
      1,
    );
  }

  private resolveGroupCooldownMs() {
    return this.readInt(
      'RADAR_KEYWORD_GROUP_COOLDOWN_MS',
      DEFAULT_GROUP_COOLDOWN_MS,
      60_000,
    );
  }

  private readDefaultLanguage() {
    const configured = String(
      process.env.CONTINUOUS_DEFAULT_LANGUAGE ?? '',
    ).trim();

    return configured || null;
  }

  private readDefaultStarMin() {
    const raw = process.env.CONTINUOUS_DEFAULT_STAR_MIN ?? '';
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  private parseKeywords(envName: string, fallback: string) {
    return Array.from(
      new Set(
        String(process.env[envName] ?? fallback)
          .split(',')
          .map((value) => value.trim())
          .filter((value) => Boolean(value)),
      ),
    );
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return Array.from(
      new Set(
        value
          .map((item) => String(item ?? '').trim())
          .filter((item) => Boolean(item)),
      ),
    );
  }

  private readInt(envName: string, fallback: number, min: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < min) {
      return fallback;
    }

    return parsed;
  }

  private readNonNegativeNumber(value: unknown, fallback: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseInt(String(value ?? ''), 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }

    return parsed;
  }

  private toNullableString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  private toTimestamp(value: string | null) {
    if (!value) {
      return 0;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();

    if (!normalized) {
      return '';
    }

    return normalized.slice(0, maxLength);
  }
}
