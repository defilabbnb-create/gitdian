import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider } from './interfaces/ai-provider.interface';
import {
  AiProviderName,
  AiProviderResult,
  AiTaskType,
  GenerateJsonInput,
} from './interfaces/ai.types';
import { OmlxProvider } from './providers/omlx.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class AiRouterService {
  private readonly providers: Record<AiProviderName, AiProvider>;
  constructor(
    private readonly omlxProvider: OmlxProvider,
    private readonly openAiProvider: OpenAiProvider,
    private readonly settingsService: SettingsService,
  ) {
    this.providers = {
      omlx: this.omlxProvider,
      openai: this.openAiProvider,
    };
  }

  async generateJson<T>(input: GenerateJsonInput): Promise<AiProviderResult<T>> {
    const settings = await this.settingsService.getSettings();
    const primaryProviderName = this.resolveProviderForTask(
      input.taskType,
      settings.ai.defaultProvider,
      settings.ai.taskRouting,
    );
    const primaryProvider = this.providers[primaryProviderName];
    const enrichedInput: GenerateJsonInput = {
      ...input,
      timeoutMs: this.resolveTimeoutMs(
        input.taskType,
        input.timeoutMs,
        settings.ai.timeoutMs,
      ),
      modelOverride: this.resolveModelOverride(
        primaryProviderName,
        input.taskType,
        settings,
      ),
    };

    try {
      return await primaryProvider.generateJson<T>(enrichedInput);
    } catch (primaryError) {
      if (!settings.ai.enableFallback) {
        throw primaryError;
      }

      const fallbackProviderName = this.resolveFallbackProvider(
        primaryProviderName,
        settings.ai.fallbackProvider,
      );
      if (!fallbackProviderName) {
        throw primaryError;
      }

      const fallbackProvider = this.providers[fallbackProviderName];

      try {
        const result = await fallbackProvider.generateJson<T>({
          ...enrichedInput,
          modelOverride: this.resolveModelOverride(
            fallbackProviderName,
            input.taskType,
            settings,
          ),
        });
        return {
          ...result,
          fallbackUsed: true,
        };
      } catch {
        throw primaryError;
      }
    }
  }

  private resolveProviderForTask(
    taskType: AiTaskType,
    defaultProvider: AiProviderName,
    taskRouting: Record<AiTaskType, AiProviderName>,
  ): AiProviderName {
    const routedProvider = taskRouting[taskType];
    if (routedProvider && this.providers[routedProvider]) {
      return routedProvider;
    }

    switch (taskType) {
      case 'rough_filter':
      case 'completeness':
      case 'basic_analysis':
      case 'idea_fit':
      case 'idea_extract':
      case 'idea_snapshot':
      default:
        return defaultProvider;
    }
  }

  private resolveFallbackProvider(
    primaryProvider: AiProviderName,
    fallbackProvider: AiProviderName,
  ) {
    if (fallbackProvider === primaryProvider) {
      return null;
    }

    if (!this.providers[fallbackProvider]) {
      throw new ServiceUnavailableException(
        `Fallback provider "${fallbackProvider}" is not registered.`,
      );
    }

    return fallbackProvider;
  }

  private resolveModelOverride(
    providerName: AiProviderName,
    taskType: AiTaskType,
    settings: Awaited<ReturnType<SettingsService['getSettings']>>,
  ) {
    if (providerName === 'openai') {
      return settings.ai.models.openai;
    }

    switch (taskType) {
      case 'idea_snapshot':
        if (this.readBooleanFromEnv('USE_HEAVY_MODEL_FOR_SNAPSHOT', true)) {
          return (
            settings.ai.models.omlxDeep ??
            settings.ai.models.omlx ??
            settings.ai.models.omlxLight
          );
        }

        return (
          settings.ai.models.omlxLight ??
          settings.ai.models.omlx ??
          settings.ai.models.omlxDeep
        );
      case 'completeness':
      case 'idea_fit':
      case 'idea_extract':
      case 'basic_analysis':
        return settings.ai.models.omlxDeep ?? settings.ai.models.omlx;
      case 'rough_filter':
      default:
        return (
          settings.ai.models.omlx ??
          settings.ai.models.omlxDeep ??
          settings.ai.models.omlxLight
        );
    }
  }

  private resolveTimeoutMs(
    taskType: AiTaskType,
    inputTimeoutMs: number | undefined,
    settingsTimeoutMs: number,
  ) {
    const snapshotTimeoutMs = this.readTimeoutFromEnv(
      'OMLX_TIMEOUT_MS_SNAPSHOT',
      60_000,
    );
    const deepTimeoutMs = this.readTimeoutFromEnv(
      'OMLX_TIMEOUT_MS_DEEP',
      180_000,
    );
    const ideaExtractTimeoutMs = this.readTimeoutFromEnv(
      'OMLX_TIMEOUT_MS_IDEA_EXTRACT',
      deepTimeoutMs,
    );

    switch (taskType) {
      case 'idea_snapshot':
        return snapshotTimeoutMs;
      case 'completeness':
      case 'idea_fit':
      case 'basic_analysis':
        return deepTimeoutMs;
      case 'idea_extract':
        return ideaExtractTimeoutMs;
      case 'rough_filter':
      default:
        return inputTimeoutMs ?? settingsTimeoutMs;
    }
  }

  private readTimeoutFromEnv(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < 1_000) {
      return fallback;
    }

    return parsed;
  }

  private readBooleanFromEnv(envName: string, fallback: boolean) {
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
}
