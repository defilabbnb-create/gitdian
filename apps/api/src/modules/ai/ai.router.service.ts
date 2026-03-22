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
      timeoutMs: settings.ai.timeoutMs || input.timeoutMs,
      modelOverride:
        primaryProviderName === 'omlx'
          ? settings.ai.models.omlx
          : settings.ai.models.openai,
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
          modelOverride:
            fallbackProviderName === 'omlx'
              ? settings.ai.models.omlx
              : settings.ai.models.openai,
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
}
