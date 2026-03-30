import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OmlxProvider } from '../ai/providers/omlx.provider';
import { OpenAiProvider } from '../ai/providers/openai.provider';
import {
  GitHubFetchMode,
  GitHubSearchOrder,
  GitHubSearchSort,
} from '../github/dto/fetch-repositories.dto';
import { GitHubClient } from '../github/github.client';
import { AiProviderName, AiTaskType } from '../ai/interfaces/ai.types';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export type SettingsPayload = {
  github: {
    search: {
      defaultMode: GitHubFetchMode;
      defaultSort: GitHubSearchSort;
      defaultOrder: GitHubSearchOrder;
      defaultPerPage: number;
      defaultStarMin: number | null;
      defaultStarMax: number | null;
      defaultPushedAfterDays: number | null;
    };
    fetch: {
      runFastFilterByDefault: boolean;
    };
  };
  fastFilter: {
    batch: {
      defaultLimit: number;
    };
    onlyUnscreenedByDefault: boolean;
    staleDaysThreshold: number;
    scoreThresholdA: number;
    scoreThresholdB: number;
  };
  ai: {
    defaultProvider: AiProviderName;
    fallbackProvider: AiProviderName;
    enableFallback: boolean;
    taskRouting: Record<AiTaskType, AiProviderName>;
    models: {
      omlx: string | null;
      omlxLight: string | null;
      omlxDeep: string | null;
      openai: string | null;
    };
    timeoutMs: number;
  };
};

type StoredSettingValue = string | number | boolean | null;
type FlatSettings = Record<string, StoredSettingValue>;

export type SettingsHealthPayload = {
  database: {
    ok: boolean;
    latencyMs: number | null;
    error: string | null;
  };
  ai: {
    omlx: {
      ok: boolean;
      model: string | null;
      latencyMs: number | null;
      error: string | null;
    };
    openai: {
      ok: boolean;
      model: string | null;
      latencyMs: number | null;
      error: string | null;
    };
  };
  github: {
    ok: boolean;
    hasToken: boolean;
    hasTokenPool: boolean;
    tokenPoolSize: number;
    usingMultiToken: boolean;
    anonymousFallback: boolean;
    lastKnownRateLimitStatus: {
      tokenIndex: number | null;
      requestType: 'search' | 'enrichment' | 'health';
      limited: boolean;
      remaining: number | null;
      resetAt: string | null;
      retryAfterMs: number | null;
      updatedAt: string;
    } | null;
    latencyMs: number | null;
    error: string | null;
  };
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly omlxProvider: OmlxProvider,
    private readonly openAiProvider: OpenAiProvider,
    private readonly gitHubClient: GitHubClient,
  ) {}

  async getSettings(): Promise<SettingsPayload> {
    const rows = await this.prisma.systemConfig.findMany({
      where: {
        configKey: {
          in: Object.keys(this.getFlatDefaults()),
        },
      },
    });

    return this.applyRuntimeAiDefaults(this.inflateSettings(rows));
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<SettingsPayload> {
    const flatUpdates = this.flattenUpdate(dto);

    if (Object.keys(flatUpdates).length > 0) {
      await this.prisma.$transaction(
        Object.entries(flatUpdates).map(([configKey, configValue]) =>
          this.prisma.systemConfig.upsert({
            where: { configKey },
            update: { configValue: this.toPrismaJsonValue(configValue) },
            create: {
              configKey,
              configValue: this.toPrismaJsonValue(configValue),
            },
          }),
        ),
      );
    }

    return this.getSettings();
  }

  async getSystemHealth(): Promise<SettingsHealthPayload> {
    const [database, omlx, openai, github] = await Promise.all([
      this.checkDatabaseHealth(),
      this.omlxProvider.healthCheck(),
      this.openAiProvider.healthCheck(),
      this.gitHubClient.healthCheck(),
    ]);

    return {
      database,
      ai: {
        omlx: {
          ok: omlx.ok,
          model: omlx.model,
          latencyMs: omlx.latencyMs,
          error: omlx.error ?? null,
        },
        openai: {
          ok: openai.ok,
          model: openai.model,
          latencyMs: openai.latencyMs,
          error: openai.error ?? null,
        },
      },
      github,
    };
  }

  private inflateSettings(
    rows: Array<{ configKey: string; configValue: Prisma.JsonValue }>,
  ): SettingsPayload {
    const defaults = this.getFlatDefaults();
    const merged: Record<string, StoredSettingValue> = { ...defaults };

    for (const row of rows) {
      if (row.configKey in defaults) {
        merged[row.configKey] = this.fromPrismaJsonValue(row.configValue);
      }
    }

    return {
      github: {
        search: {
          defaultMode: this.toGitHubMode(
            merged['github.search.defaultMode'],
            defaults['github.search.defaultMode'] as GitHubFetchMode,
          ),
          defaultSort: this.toGitHubSort(
            merged['github.search.defaultSort'],
            defaults['github.search.defaultSort'] as GitHubSearchSort,
          ),
          defaultOrder: this.toGitHubOrder(
            merged['github.search.defaultOrder'],
            defaults['github.search.defaultOrder'] as GitHubSearchOrder,
          ),
          defaultPerPage: this.toInt(
            merged['github.search.defaultPerPage'],
            defaults['github.search.defaultPerPage'] as number,
          ),
          defaultStarMin: this.toNullableNumber(
            merged['github.search.defaultStarMin'],
            defaults['github.search.defaultStarMin'] as number | null,
          ),
          defaultStarMax: this.toNullableNumber(
            merged['github.search.defaultStarMax'],
            defaults['github.search.defaultStarMax'] as number | null,
          ),
          defaultPushedAfterDays: this.toNullableNumber(
            merged['github.search.defaultPushedAfterDays'],
            defaults['github.search.defaultPushedAfterDays'] as number | null,
          ),
        },
        fetch: {
          runFastFilterByDefault: this.toBoolean(
            merged['github.fetch.runFastFilterByDefault'],
            defaults['github.fetch.runFastFilterByDefault'] as boolean,
          ),
        },
      },
      fastFilter: {
        batch: {
          defaultLimit: this.toInt(
            merged['fastFilter.batch.defaultLimit'],
            defaults['fastFilter.batch.defaultLimit'] as number,
          ),
        },
        onlyUnscreenedByDefault: this.toBoolean(
          merged['fastFilter.onlyUnscreenedByDefault'],
          defaults['fastFilter.onlyUnscreenedByDefault'] as boolean,
        ),
        staleDaysThreshold: this.toInt(
          merged['fastFilter.staleDaysThreshold'],
          defaults['fastFilter.staleDaysThreshold'] as number,
        ),
        scoreThresholdA: this.toInt(
          merged['fastFilter.scoreThresholdA'],
          defaults['fastFilter.scoreThresholdA'] as number,
        ),
        scoreThresholdB: this.toInt(
          merged['fastFilter.scoreThresholdB'],
          defaults['fastFilter.scoreThresholdB'] as number,
        ),
      },
      ai: {
        defaultProvider: this.toProviderName(
          merged['ai.defaultProvider'],
          defaults['ai.defaultProvider'] as AiProviderName,
        ),
        fallbackProvider: this.toProviderName(
          merged['ai.fallbackProvider'],
          defaults['ai.fallbackProvider'] as AiProviderName,
        ),
        enableFallback: this.toBoolean(
          merged['ai.enableFallback'],
          defaults['ai.enableFallback'] as boolean,
        ),
        taskRouting: {
          rough_filter: this.toProviderName(
            merged['ai.taskRouting.rough_filter'],
            defaults['ai.taskRouting.rough_filter'] as AiProviderName,
          ),
          completeness: this.toProviderName(
            merged['ai.taskRouting.completeness'],
            defaults['ai.taskRouting.completeness'] as AiProviderName,
          ),
          basic_analysis: this.toProviderName(
            merged['ai.taskRouting.basic_analysis'],
            defaults['ai.taskRouting.basic_analysis'] as AiProviderName,
          ),
          idea_fit: this.toProviderName(
            merged['ai.taskRouting.idea_fit'],
            defaults['ai.taskRouting.idea_fit'] as AiProviderName,
          ),
          idea_extract: this.toProviderName(
            merged['ai.taskRouting.idea_extract'],
            defaults['ai.taskRouting.idea_extract'] as AiProviderName,
          ),
          idea_snapshot: this.toProviderName(
            merged['ai.taskRouting.idea_snapshot'],
            defaults['ai.taskRouting.idea_snapshot'] as AiProviderName,
          ),
        },
        models: {
          omlx: this.toNullableString(
            merged['ai.models.omlx'],
            defaults['ai.models.omlx'] as string | null,
          ),
          omlxLight: this.toNullableString(
            merged['ai.models.omlxLight'],
            defaults['ai.models.omlxLight'] as string | null,
          ),
          omlxDeep: this.toNullableString(
            merged['ai.models.omlxDeep'],
            defaults['ai.models.omlxDeep'] as string | null,
          ),
          openai: this.toNullableString(
            merged['ai.models.openai'],
            defaults['ai.models.openai'] as string | null,
          ),
        },
        timeoutMs: this.toInt(
          merged['ai.timeoutMs'],
          defaults['ai.timeoutMs'] as number,
        ),
      },
    };
  }

  private applyRuntimeAiDefaults(settings: SettingsPayload): SettingsPayload {
    const normalized = structuredClone(settings);
    const envOpenAiModel = this.readEnvString('OPENAI_MODEL');
    const omlxDeepModel =
      normalized.ai.models.omlxDeep ??
      process.env.OMLX_DEEP_MODEL ??
      process.env.OMLX_MODEL ??
      null;
    const omlxModel = normalized.ai.models.omlx ?? omlxDeepModel;
    const omlxLightModel =
      normalized.ai.models.omlxLight ??
      process.env.OMLX_SNAPSHOT_MODEL ??
      process.env.OMLX_LIGHT_MODEL ??
      omlxModel ??
      null;
    const openAiModel =
      normalized.ai.models.openai ??
      envOpenAiModel ??
      this.readFirstCsvEnvValue('OPENAI_MODEL_CANDIDATES') ??
      null;
    const hasOpenAiConfigured = Boolean(process.env.OPENAI_API_KEY && openAiModel);

    normalized.ai.models.omlx = omlxModel;
    normalized.ai.models.omlxLight = omlxLightModel;
    normalized.ai.models.omlxDeep = omlxDeepModel ?? omlxModel;
    normalized.ai.models.openai = openAiModel;

    if (!hasOpenAiConfigured) {
      normalized.ai.defaultProvider = 'omlx';
      normalized.ai.enableFallback = false;
      normalized.ai.fallbackProvider = 'omlx';
      normalized.ai.taskRouting.rough_filter = 'omlx';
      normalized.ai.taskRouting.completeness = 'omlx';
      normalized.ai.taskRouting.basic_analysis = 'omlx';
      normalized.ai.taskRouting.idea_fit = 'omlx';
      normalized.ai.taskRouting.idea_extract = 'omlx';
      normalized.ai.taskRouting.idea_snapshot = 'omlx';
    }

    return normalized;
  }

  private async checkDatabaseHealth() {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown database health check error.',
      };
    }
  }

  private flattenUpdate(dto: UpdateSettingsDto): FlatSettings {
    const flat: FlatSettings = {};

    if (dto.github?.search) {
      if (dto.github.search.defaultMode !== undefined) {
        flat['github.search.defaultMode'] = dto.github.search.defaultMode;
      }
      if (dto.github.search.defaultSort !== undefined) {
        flat['github.search.defaultSort'] = dto.github.search.defaultSort;
      }
      if (dto.github.search.defaultOrder !== undefined) {
        flat['github.search.defaultOrder'] = dto.github.search.defaultOrder;
      }
      if (dto.github.search.defaultPerPage !== undefined) {
        flat['github.search.defaultPerPage'] = dto.github.search.defaultPerPage;
      }
      if (dto.github.search.defaultStarMin !== undefined) {
        flat['github.search.defaultStarMin'] = this.toJsonInputValue(
          dto.github.search.defaultStarMin,
        );
      }
      if (dto.github.search.defaultStarMax !== undefined) {
        flat['github.search.defaultStarMax'] = this.toJsonInputValue(
          dto.github.search.defaultStarMax,
        );
      }
      if (dto.github.search.defaultPushedAfterDays !== undefined) {
        flat['github.search.defaultPushedAfterDays'] =
          this.toJsonInputValue(dto.github.search.defaultPushedAfterDays);
      }
    }

    if (dto.github?.fetch?.runFastFilterByDefault !== undefined) {
      flat['github.fetch.runFastFilterByDefault'] =
        dto.github.fetch.runFastFilterByDefault;
    }

    if (dto.fastFilter?.batch?.defaultLimit !== undefined) {
      flat['fastFilter.batch.defaultLimit'] = dto.fastFilter.batch.defaultLimit;
    }
    if (dto.fastFilter?.onlyUnscreenedByDefault !== undefined) {
      flat['fastFilter.onlyUnscreenedByDefault'] =
        dto.fastFilter.onlyUnscreenedByDefault;
    }
    if (dto.fastFilter?.staleDaysThreshold !== undefined) {
      flat['fastFilter.staleDaysThreshold'] = dto.fastFilter.staleDaysThreshold;
    }
    if (dto.fastFilter?.scoreThresholdA !== undefined) {
      flat['fastFilter.scoreThresholdA'] = dto.fastFilter.scoreThresholdA;
    }
    if (dto.fastFilter?.scoreThresholdB !== undefined) {
      flat['fastFilter.scoreThresholdB'] = dto.fastFilter.scoreThresholdB;
    }

    if (dto.ai?.defaultProvider !== undefined) {
      flat['ai.defaultProvider'] = dto.ai.defaultProvider;
    }
    if (dto.ai?.fallbackProvider !== undefined) {
      flat['ai.fallbackProvider'] = dto.ai.fallbackProvider;
    }
    if (dto.ai?.enableFallback !== undefined) {
      flat['ai.enableFallback'] = dto.ai.enableFallback;
    }
    if (dto.ai?.taskRouting?.rough_filter !== undefined) {
      flat['ai.taskRouting.rough_filter'] = dto.ai.taskRouting.rough_filter;
    }
    if (dto.ai?.taskRouting?.completeness !== undefined) {
      flat['ai.taskRouting.completeness'] = dto.ai.taskRouting.completeness;
    }
    if (dto.ai?.taskRouting?.idea_fit !== undefined) {
      flat['ai.taskRouting.idea_fit'] = dto.ai.taskRouting.idea_fit;
    }
    if (dto.ai?.taskRouting?.idea_extract !== undefined) {
      flat['ai.taskRouting.idea_extract'] = dto.ai.taskRouting.idea_extract;
    }
    if (dto.ai?.taskRouting?.idea_snapshot !== undefined) {
      flat['ai.taskRouting.idea_snapshot'] = dto.ai.taskRouting.idea_snapshot;
    }
    if (dto.ai?.models?.omlx !== undefined) {
      flat['ai.models.omlx'] = this.toJsonInputValue(dto.ai.models.omlx);
    }
    if (dto.ai?.models?.omlxLight !== undefined) {
      flat['ai.models.omlxLight'] = this.toJsonInputValue(
        dto.ai.models.omlxLight,
      );
    }
    if (dto.ai?.models?.omlxDeep !== undefined) {
      flat['ai.models.omlxDeep'] = this.toJsonInputValue(
        dto.ai.models.omlxDeep,
      );
    }
    if (dto.ai?.models?.openai !== undefined) {
      flat['ai.models.openai'] = this.toJsonInputValue(dto.ai.models.openai);
    }
    if (dto.ai?.timeoutMs !== undefined) {
      flat['ai.timeoutMs'] = dto.ai.timeoutMs;
    }

    return flat;
  }

  private getFlatDefaults(): FlatSettings {
    const envDefaultProvider =
      process.env.AI_DEFAULT_PROVIDER === 'openai' ? 'openai' : 'omlx';
    const envFallbackProvider =
      process.env.AI_FALLBACK_PROVIDER === 'openai'
        ? 'openai'
        : process.env.AI_FALLBACK_PROVIDER === 'omlx'
          ? 'omlx'
          : envDefaultProvider;
    const envEnableFallback =
      process.env.AI_ENABLE_FALLBACK?.toLowerCase() === 'true';

    return {
      'github.search.defaultMode': GitHubFetchMode.UPDATED,
      'github.search.defaultSort': GitHubSearchSort.UPDATED,
      'github.search.defaultOrder': GitHubSearchOrder.DESC,
      'github.search.defaultPerPage': 10,
      'github.search.defaultStarMin': null,
      'github.search.defaultStarMax': null,
      'github.search.defaultPushedAfterDays': null,
      'github.fetch.runFastFilterByDefault': false,

      'fastFilter.batch.defaultLimit': 20,
      'fastFilter.onlyUnscreenedByDefault': true,
      'fastFilter.staleDaysThreshold': 180,
      'fastFilter.scoreThresholdA': 75,
      'fastFilter.scoreThresholdB': 55,

      'ai.defaultProvider': envDefaultProvider,
      'ai.fallbackProvider': envFallbackProvider,
      'ai.enableFallback': envEnableFallback,
      'ai.taskRouting.rough_filter': envDefaultProvider,
      'ai.taskRouting.completeness': envDefaultProvider,
      'ai.taskRouting.basic_analysis': envDefaultProvider,
      'ai.taskRouting.idea_fit': envDefaultProvider,
      'ai.taskRouting.idea_extract': envDefaultProvider,
      'ai.taskRouting.idea_snapshot': envDefaultProvider,
      'ai.models.omlx': process.env.OMLX_MODEL || null,
      'ai.models.omlxLight':
        process.env.OMLX_SNAPSHOT_MODEL || process.env.OMLX_LIGHT_MODEL || null,
      'ai.models.omlxDeep':
        process.env.OMLX_DEEP_MODEL || process.env.OMLX_MODEL || null,
      'ai.models.openai':
        this.readEnvString('OPENAI_MODEL') ??
        this.readFirstCsvEnvValue('OPENAI_MODEL_CANDIDATES') ??
        null,
      'ai.timeoutMs': 30000,
    };
  }

  private readEnvString(envName: string) {
    const value = process.env[envName]?.trim();
    return value ? value : null;
  }

  private readFirstCsvEnvValue(envName: string) {
    const values = (process.env[envName] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    return values[0] ?? null;
  }

  private toGitHubSort(value: unknown, fallback: GitHubSearchSort) {
    return value === GitHubSearchSort.STARS ? GitHubSearchSort.STARS : fallback;
  }

  private toGitHubMode(value: unknown, fallback: GitHubFetchMode) {
    return value === GitHubFetchMode.CREATED ? GitHubFetchMode.CREATED : fallback;
  }

  private toGitHubOrder(value: unknown, fallback: GitHubSearchOrder) {
    return value === GitHubSearchOrder.ASC ? GitHubSearchOrder.ASC : fallback;
  }

  private toProviderName(value: unknown, fallback: AiProviderName) {
    return value === 'openai' ? 'openai' : value === 'omlx' ? 'omlx' : fallback;
  }

  private toBoolean(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private toInt(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value)
      : fallback;
  }

  private toNullableNumber(value: unknown, fallback: number | null) {
    if (value === null) {
      return null;
    }

    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private toNullableString(value: unknown, fallback: string | null) {
    if (value === null) {
      return null;
    }

    return typeof value === 'string' ? value : fallback;
  }

  private toPrismaJsonValue(value: StoredSettingValue) {
    return value === null
      ? (Prisma.JsonNull as unknown as Prisma.InputJsonValue)
      : value;
  }

  private fromPrismaJsonValue(value: Prisma.JsonValue): StoredSettingValue {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    return null;
  }

  private toJsonInputValue(value: StoredSettingValue) {
    return value;
  }
}
