import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider } from '../interfaces/ai-provider.interface';
import {
  AiHealthCheckResult,
  AiProviderResult,
  GenerateJsonInput,
} from '../interfaces/ai.types';

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;

  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly apiKey = process.env.OPENAI_API_KEY || '';
  private readonly model = process.env.OPENAI_MODEL || null;
  private readonly baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  async generateJson<T>(input: GenerateJsonInput): Promise<AiProviderResult<T>> {
    const model = input.modelOverride ?? this.model;

    if (!this.apiKey || !model) {
      throw new ServiceUnavailableException(
        'OpenAI provider is not configured. Please set OPENAI_API_KEY and OPENAI_MODEL.',
      );
    }

    const startedAt = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            ...(input.systemPrompt
              ? [{ role: 'system', content: input.systemPrompt }]
              : []),
            {
              role: 'user',
              content: `${input.prompt}\n\nReturn valid JSON only.${
                input.schemaHint ? `\nSchema hint:\n${input.schemaHint}` : ''
              }`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ServiceUnavailableException(
          `OpenAI request failed with status ${response.status}: ${errorText}`,
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

      const text = payload.choices?.[0]?.message?.content;
      if (!text) {
        throw new ServiceUnavailableException('OpenAI returned an empty response.');
      }

      const latencyMs = Date.now() - startedAt;
      this.logger.log(
        `provider=${this.name} model=${model} latencyMs=${latencyMs} success=true`,
      );

      return {
        data: JSON.parse(text) as T,
        provider: this.name,
        model,
        latencyMs,
        fallbackUsed: false,
        confidence: null,
        rawResponse: payload,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : 'Unknown OpenAI error.';

      this.logger.error(
        `provider=${this.name} model=${model ?? 'unknown'} latencyMs=${latencyMs} success=false error=${message}`,
      );

      throw error;
    }
  }

  async healthCheck(): Promise<AiHealthCheckResult> {
    if (!this.apiKey || !this.model) {
      return {
        ok: false,
        model: this.model,
        latencyMs: null,
        error: 'OPENAI_API_KEY or OPENAI_MODEL is not configured.',
      };
    }

    const startedAt = Date.now();

    try {
      await this.generateJson<{ ok: boolean }>({
        taskType: 'basic_analysis',
        prompt: 'Return JSON: {"ok": true}',
        timeoutMs: 5000,
      });

      return {
        ok: true,
        model: this.model,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        model: this.model,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown OpenAI health check error.',
      };
    }
  }
}
