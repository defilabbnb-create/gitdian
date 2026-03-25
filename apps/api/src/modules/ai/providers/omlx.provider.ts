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

type OmlxChatResponse = {
  output_text?: string;
  text?: string;
  response?: string;
  content?: string;
};

@Injectable()
export class OmlxProvider implements AiProvider {
  readonly name = 'omlx' as const;

  private readonly logger = new Logger(OmlxProvider.name);
  private readonly baseUrl = process.env.OMLX_BASE_URL || 'http://localhost:11434';
  private readonly model = process.env.OMLX_MODEL || null;
  private readonly apiKey = process.env.OMLX_API_KEY || '';
  private snapshotTimeoutCount = 0;
  private deepTimeoutCount = 0;
  private ideaExtractTimeoutCount = 0;

  async generateJson<T>(input: GenerateJsonInput): Promise<AiProviderResult<T>> {
    const startedAt = Date.now();
    const model = input.modelOverride ?? this.model;

    try {
      const rawResponse = await this.requestModel(input, model);
      const parsed = this.parseJsonResponse<T>(rawResponse);
      const latencyMs = Date.now() - startedAt;

      this.logger.log(
        `provider=${this.name} taskType=${input.taskType} model=${model ?? 'unknown'} timeoutMs=${input.timeoutMs ?? 'unknown'} latencyMs=${latencyMs} success=true`,
      );

      return {
        data: parsed,
        provider: this.name,
        model,
        latencyMs,
        fallbackUsed: false,
        confidence: null,
        rawResponse,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : 'Unknown OMLX error.';

      if (this.isTimeoutError(error)) {
        const counters = this.bumpTimeoutCounter(input.taskType);
        this.logger.warn(
          `provider=${this.name} taskType=${input.taskType} model=${model ?? 'unknown'} timeoutMs=${input.timeoutMs ?? 'unknown'} snapshotTimeoutCount=${counters.snapshot} deepTimeoutCount=${counters.deep} ideaExtractTimeoutCount=${counters.ideaExtract}`,
        );
      }

      this.logger.error(
        `provider=${this.name} taskType=${input.taskType} model=${model ?? 'unknown'} latencyMs=${latencyMs} success=false error=${message}`,
      );

      throw error;
    }
  }

  async healthCheck(): Promise<AiHealthCheckResult> {
    if (!this.model) {
      return {
        ok: false,
        model: null,
        latencyMs: null,
        error: 'OMLX_MODEL is not configured.',
      };
    }

    const startedAt = Date.now();

    try {
      await this.requestModel({
        taskType: 'basic_analysis',
        prompt: 'Return JSON: {"ok": true}',
        timeoutMs: 5000,
      }, this.model);

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
        error: error instanceof Error ? error.message : 'Unknown OMLX health check error.',
      };
    }
  }

  private async requestModel(input: GenerateJsonInput, model: string | null) {
    if (!model) {
      throw new ServiceUnavailableException('OMLX_MODEL is not configured.');
    }

    const controller = new AbortController();
    const timeoutMs = input.timeoutMs ?? 20000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // NOTE: This request body is an adapter layer and may need to be adjusted
      // to match the real OMLX service contract in your environment.
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
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
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ServiceUnavailableException(
          `OMLX request failed with status ${response.status}: ${errorText}`,
        );
      }

      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException('OMLX request timed out.');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isTimeoutError(error: unknown) {
    return (
      error instanceof Error &&
      error.message.toLowerCase().includes('timed out')
    );
  }

  private bumpTimeoutCounter(taskType: GenerateJsonInput['taskType']) {
    if (taskType === 'idea_snapshot') {
      this.snapshotTimeoutCount += 1;
    }

    if (taskType === 'idea_extract') {
      this.ideaExtractTimeoutCount += 1;
    }

    if (
      taskType === 'completeness' ||
      taskType === 'idea_fit' ||
      taskType === 'idea_extract' ||
      taskType === 'basic_analysis'
    ) {
      this.deepTimeoutCount += 1;
    }

    return {
      snapshot: this.snapshotTimeoutCount,
      deep: this.deepTimeoutCount,
      ideaExtract: this.ideaExtractTimeoutCount,
    };
  }

  private buildHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  private parseJsonResponse<T>(rawResponse: unknown): T {
    const text = this.extractText(rawResponse);

    if (!text) {
      throw new ServiceUnavailableException(
        'OMLX returned an empty or unsupported response payload.',
      );
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ServiceUnavailableException(
        'OMLX returned a non-JSON response. The response adapter may need to be adjusted for the real service format.',
      );
    }
  }

  private extractText(rawResponse: unknown) {
    const response = rawResponse as
      | {
          choices?: Array<{
            message?: {
              content?: string;
            };
          }>;
        }
      | OmlxChatResponse;

    if (
      'choices' in response &&
      Array.isArray(response.choices) &&
      response.choices[0]?.message?.content
    ) {
      return response.choices[0].message.content;
    }

    if ('output_text' in response && typeof response.output_text === 'string') {
      return response.output_text;
    }

    if ('text' in response && typeof response.text === 'string') {
      return response.text;
    }

    if ('response' in response && typeof response.response === 'string') {
      return response.response;
    }

    if ('content' in response && typeof response.content === 'string') {
      return response.content;
    }

    return null;
  }
}
