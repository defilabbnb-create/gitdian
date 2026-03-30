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
  private readonly defaultModel = process.env.OPENAI_MODEL || null;
  private readonly baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];
  private adaptiveMaxConcurrency = this.resolveConfiguredMaxConcurrency();
  private successStreak = 0;

  async generateJson<T>(input: GenerateJsonInput): Promise<AiProviderResult<T>> {
    const requestedModel = input.modelOverride ?? this.defaultModel;

    if (!this.apiKey || !requestedModel) {
      throw new ServiceUnavailableException(
        'OpenAI provider is not configured. Please set OPENAI_API_KEY and OPENAI_MODEL.',
      );
    }

    const modelCandidates = this.resolveModelCandidates(requestedModel);

    return this.withConcurrencyGate(async (gateWaitMs) => {
      const retryMax = this.readNonNegativeInt(
        'OPENAI_RETRY_MAX',
        modelCandidates.length > 1 ? Math.min(4, modelCandidates.length - 1) : 2,
      );
      const totalAttempts = Math.max(1, retryMax + 1);

      for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        const model = modelCandidates[(attempt - 1) % modelCandidates.length];

        try {
          const result = await this.executeRequest<T>({
            input,
            model,
            gateWaitMs,
          });
          this.recordSuccess();
          return result;
        } catch (error) {
          const normalized = this.normalizeError(error);

          if (!this.shouldRetry(normalized) || attempt >= totalAttempts) {
            throw normalized;
          }

          const retryAfterMs = this.resolveRetryDelayMs(normalized, attempt);
          const nextModel = modelCandidates[attempt % modelCandidates.length];
          this.applyBackpressure(normalized);
          this.logger.warn(
            `provider=${this.name} model=${model ?? 'unknown'} attempt=${attempt}/${totalAttempts} nextModel=${nextModel ?? model ?? 'unknown'} retryAfterMs=${retryAfterMs} concurrencyCap=${this.resolveMaxConcurrency()} reason=${normalized.message}`,
          );
          await this.sleep(retryAfterMs);
        }
      }

      throw new ServiceUnavailableException('OpenAI request failed after retries.');
    });
  }

  async healthCheck(): Promise<AiHealthCheckResult> {
    if (!this.apiKey || !this.defaultModel) {
      return {
        ok: false,
        model: this.defaultModel,
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
        model: this.defaultModel,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        model: this.defaultModel,
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
    return Math.max(
      1,
      Math.min(this.resolveConfiguredMaxConcurrency(), this.adaptiveMaxConcurrency),
    );
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }
    return parsed;
  }

  private readNonNegativeInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }
    return parsed;
  }

  private readFloat(envName: string, fallback: number, min: number, max: number) {
    const parsed = Number.parseFloat(process.env[envName] ?? '');
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
  }

  private resolveConfiguredMaxConcurrency() {
    return Math.max(1, this.readInt('OPENAI_MAX_CONCURRENCY', 2));
  }

  private resolveModelCandidates(requestedModel: string) {
    const configuredCandidates = this.readCsv('OPENAI_MODEL_CANDIDATES');
    const fallbackCandidates =
      configuredCandidates.length === 0 && this.baseUrl.includes('ananapi.com')
        ? ['gpt-5.4', 'gpt-5.2', 'gpt-5.1', 'gpt-5']
        : [];

    return Array.from(
      new Set(
        [requestedModel, ...configuredCandidates, ...fallbackCandidates]
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  private readCsv(envName: string) {
    return (process.env[envName] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
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
    if (error.options.retryAfterMs !== null) {
      return error.options.retryAfterMs;
    }

    if (error.options.statusCode === 429) {
      return Math.min(30_000, attempt * 3_000);
    }

    if (
      error.options.timeout ||
      error.options.statusCode === 502 ||
      error.options.statusCode === 503 ||
      error.options.statusCode === 504 ||
      error.options.statusCode === 524
    ) {
      return Math.min(12_000, attempt * 1_500);
    }

    return Math.min(15_000, attempt * 2_000);
  }

  private applyBackpressure(error: OpenAiProviderError) {
    const currentMax = this.resolveMaxConcurrency();
    if (currentMax <= 1) {
      this.successStreak = 0;
      return;
    }

    let nextMax = currentMax;

    if (error.options.statusCode === 429) {
      const shrinkFactor = this.readFloat(
        'OPENAI_CONCURRENCY_SHRINK_FACTOR',
        0.5,
        0.1,
        0.95,
      );
      nextMax = Math.max(1, Math.floor(currentMax * shrinkFactor));
    } else if (
      error.options.timeout ||
      error.options.statusCode === 502 ||
      error.options.statusCode === 503 ||
      error.options.statusCode === 504 ||
      error.options.statusCode === 524
    ) {
      nextMax = Math.max(1, currentMax - 1);
    }

    if (nextMax === currentMax) {
      nextMax = Math.max(1, currentMax - 1);
    }

    if (nextMax !== this.adaptiveMaxConcurrency) {
      this.logger.warn(
        `provider=${this.name} adaptive_concurrency_reduce from=${this.adaptiveMaxConcurrency} to=${nextMax} status=${error.options.statusCode ?? 'unknown'} timeout=${error.options.timeout}`,
      );
    }

    this.adaptiveMaxConcurrency = nextMax;
    this.successStreak = 0;
  }

  private recordSuccess() {
    const configuredMax = this.resolveConfiguredMaxConcurrency();
    if (this.adaptiveMaxConcurrency >= configuredMax) {
      this.adaptiveMaxConcurrency = configuredMax;
      this.successStreak = 0;
      return;
    }

    this.successStreak += 1;
    const recoveryThreshold = this.readInt(
      'OPENAI_CONCURRENCY_RECOVERY_SUCCESS_COUNT',
      8,
    );
    if (this.successStreak < recoveryThreshold) {
      return;
    }

    const nextMax = Math.min(configuredMax, this.adaptiveMaxConcurrency + 1);
    if (nextMax !== this.adaptiveMaxConcurrency) {
      this.logger.log(
        `provider=${this.name} adaptive_concurrency_recover from=${this.adaptiveMaxConcurrency} to=${nextMax} successStreak=${this.successStreak}`,
      );
    }
    this.adaptiveMaxConcurrency = nextMax;
    this.successStreak = 0;
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
