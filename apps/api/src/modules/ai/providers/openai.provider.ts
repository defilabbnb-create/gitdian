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

class OpenAiProviderError extends Error {
  constructor(
    message: string,
    readonly options: {
      statusCode: number | null;
      retryAfterMs: number | null;
      timeout: boolean;
    },
  ) {
    super(message);
    this.name = 'OpenAiProviderError';
  }
}

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;

  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly apiKey = process.env.OPENAI_API_KEY || '';
  private readonly model = process.env.OPENAI_MODEL || null;
  private readonly baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];

  async generateJson<T>(input: GenerateJsonInput): Promise<AiProviderResult<T>> {
    const model = input.modelOverride ?? this.model;

    if (!this.apiKey || !model) {
      throw new ServiceUnavailableException(
        'OpenAI provider is not configured. Please set OPENAI_API_KEY and OPENAI_MODEL.',
      );
    }

    return this.withConcurrencyGate(async (gateWaitMs) => {
      const retryMax = this.readInt('OPENAI_RETRY_MAX', 2);

      for (let attempt = 1; attempt <= retryMax + 1; attempt += 1) {
        try {
          return await this.executeRequest<T>({
            input,
            model,
            gateWaitMs,
          });
        } catch (error) {
          const normalized = this.normalizeError(error);

          if (!this.shouldRetry(normalized) || attempt > retryMax) {
            throw normalized;
          }

          const retryAfterMs = this.resolveRetryDelayMs(normalized, attempt);
          this.logger.warn(
            `provider=${this.name} model=${model ?? 'unknown'} attempt=${attempt}/${retryMax + 1} retryAfterMs=${retryAfterMs} reason=${normalized.message}`,
          );
          await this.sleep(retryAfterMs);
        }
      }

      throw new ServiceUnavailableException('OpenAI request failed after retries.');
    });
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

  private async executeRequest<T>(args: {
    input: GenerateJsonInput;
    model: string;
    gateWaitMs: number;
  }): Promise<AiProviderResult<T>> {
    const startedAt = Date.now();
    const timeoutMs = Math.max(1_000, args.input.timeoutMs ?? this.readInt('OPENAI_TIMEOUT_MS', 30_000));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: args.model,
          response_format: { type: 'json_object' },
          messages: [
            ...(args.input.systemPrompt
              ? [{ role: 'system', content: args.input.systemPrompt }]
              : []),
            {
              role: 'user',
              content: `${args.input.prompt}\n\nReturn valid JSON only.${
                args.input.schemaHint ? `\nSchema hint:\n${args.input.schemaHint}` : ''
              }`,
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new OpenAiProviderError(
          `OpenAI request failed with status ${response.status}: ${errorText}`,
          {
            statusCode: response.status,
            retryAfterMs: this.readRetryAfterMs(response.headers),
            timeout: false,
          },
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
        throw new OpenAiProviderError('OpenAI returned an empty response.', {
          statusCode: response.status,
          retryAfterMs: null,
          timeout: false,
        });
      }

      const latencyMs = Date.now() - startedAt;
      this.logger.log(
        `provider=${this.name} model=${args.model} latencyMs=${latencyMs} gateWaitMs=${args.gateWaitMs} success=true`,
      );

      return {
        data: JSON.parse(text) as T,
        provider: this.name,
        model: args.model,
        latencyMs,
        fallbackUsed: false,
        confidence: null,
        rawResponse: payload,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const normalized = this.normalizeError(error);
      this.logger.error(
        `provider=${this.name} model=${args.model ?? 'unknown'} latencyMs=${latencyMs} gateWaitMs=${args.gateWaitMs} success=false error=${normalized.message}`,
      );
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async withConcurrencyGate<T>(
    run: (gateWaitMs: number) => Promise<T>,
  ): Promise<T> {
    const gateStartedAt = Date.now();
    await this.acquireSlot();
    const gateWaitMs = Date.now() - gateStartedAt;

    try {
      return await run(gateWaitMs);
    } finally {
      this.releaseSlot();
    }
  }

  private async acquireSlot() {
    while (this.inFlight >= this.resolveMaxConcurrency()) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }

    this.inFlight += 1;
  }

  private releaseSlot() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter();
    }
  }

  private resolveMaxConcurrency() {
    return Math.max(1, this.readInt('OPENAI_MAX_CONCURRENCY', 2));
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }
    return parsed;
  }

  private readRetryAfterMs(headers: Headers) {
    const retryAfter = headers.get('retry-after');
    if (!retryAfter) {
      return null;
    }

    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.round(seconds * 1_000);
    }

    const timestamp = Date.parse(retryAfter);
    if (!Number.isNaN(timestamp)) {
      return Math.max(0, timestamp - Date.now());
    }

    return null;
  }

  private shouldRetry(error: OpenAiProviderError) {
    if (error.options.timeout) {
      return true;
    }

    return (
      error.options.statusCode === 429 ||
      error.options.statusCode === 408 ||
      error.options.statusCode === 502 ||
      error.options.statusCode === 503 ||
      error.options.statusCode === 504 ||
      error.options.statusCode === 524
    );
  }

  private resolveRetryDelayMs(error: OpenAiProviderError, attempt: number) {
    return error.options.retryAfterMs ?? Math.min(15_000, attempt * 2_000);
  }

  private normalizeError(error: unknown) {
    if (error instanceof OpenAiProviderError) {
      return error;
    }

    if (error instanceof ServiceUnavailableException) {
      return new OpenAiProviderError(error.message, {
        statusCode: null,
        retryAfterMs: null,
        timeout: false,
      });
    }

    const message = error instanceof Error ? error.message : 'Unknown OpenAI error.';
    const timeout =
      error instanceof Error &&
      (error.name === 'AbortError' || message.toLowerCase().includes('timed out'));

    return new OpenAiProviderError(message, {
      statusCode: null,
      retryAfterMs: null,
      timeout,
    });
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
