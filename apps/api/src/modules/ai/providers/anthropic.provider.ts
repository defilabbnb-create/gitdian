import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

export type AnthropicGenerateJsonInput = {
  prompt: string;
  systemPrompt?: string;
  schemaHint?: string;
  modelOverride?: string | null;
  timeoutMs?: number;
  maxTokens?: number;
};

export type AnthropicProviderResult<T> = {
  data: T;
  provider: 'claude';
  model: string | null;
  startTime: string;
  latencyMs: number;
  httpStatus: number;
  timeout: boolean;
  jsonParseSuccess: boolean;
  tokensUsed: number | null;
  rawResponse: unknown;
};

export type AnthropicProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AnthropicHealthCheckResult = {
  ok: boolean;
  model: string | null;
  latencyMs: number | null;
  error?: string;
};

type AnthropicProviderErrorOptions = {
  model: string | null;
  startTime: string;
  latencyMs: number;
  httpStatus: number | null;
  errorType: string;
  timeout: boolean;
  jsonParseSuccess: boolean;
  tokensUsed: number | null;
  rawResponse?: unknown;
};

type AnthropicMessagePayload = {
  id?: string;
  type?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    type?: string;
    message?: string;
  };
};

export class AnthropicProviderError extends Error {
  readonly model: string | null;
  readonly startTime: string;
  readonly latencyMs: number;
  readonly httpStatus: number | null;
  readonly errorType: string;
  readonly timeout: boolean;
  readonly jsonParseSuccess: boolean;
  readonly tokensUsed: number | null;
  readonly rawResponse: unknown;

  constructor(message: string, options: AnthropicProviderErrorOptions) {
    super(message);
    this.name = 'AnthropicProviderError';
    this.model = options.model;
    this.startTime = options.startTime;
    this.latencyMs = options.latencyMs;
    this.httpStatus = options.httpStatus;
    this.errorType = options.errorType;
    this.timeout = options.timeout;
    this.jsonParseSuccess = options.jsonParseSuccess;
    this.tokensUsed = options.tokensUsed;
    this.rawResponse = options.rawResponse;
  }
}

@Injectable()
export class AnthropicProvider {
  readonly name = 'claude' as const;

  private readonly logger = new Logger(AnthropicProvider.name);

  isRetired() {
    return this.readBoolean('CLAUDE_RUNTIME_RETIRED', true);
  }

  isEnabled() {
    return !this.isRetired() && this.readBoolean('CLAUDE_ENABLED', false);
  }

  isConfigured() {
    return !this.isRetired() && Boolean(this.resolveApiKey() && this.resolveModel());
  }

  async generateJson<T>(
    input: AnthropicGenerateJsonInput,
  ): Promise<AnthropicProviderResult<T>> {
    const apiKey = this.resolveApiKey();
    const primaryModel = input.modelOverride ?? this.resolveModel();

    if (this.isRetired()) {
      throw new ServiceUnavailableException(
        'Claude runtime is retired. Use the primary API analysis pipeline instead.',
      );
    }

    if (!this.isEnabled() || !apiKey || !primaryModel) {
      throw new ServiceUnavailableException(
        'Claude provider is not configured. Please set CLAUDE_ENABLED, CLAUDE_API_KEY, and CLAUDE_MODEL.',
      );
    }

    const retryMax = this.readInt('CLAUDE_RETRY_MAX', 2);
    const timeoutMs = input.timeoutMs ?? this.readInt('CLAUDE_TIMEOUT_MS', 120_000);
    const maxTokens = input.maxTokens ?? this.readInt('CLAUDE_MAX_TOKENS', 1_200);
    const startedAt = Date.now();
    const startTime = new Date(startedAt).toISOString();
    let lastError: Error | null = null;

    for (const model of this.resolveModelCandidates(primaryModel)) {
      for (let attempt = 1; attempt <= retryMax + 1; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(`${this.resolveBaseUrl()}/v1/messages`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': apiKey,
              Authorization: `Bearer ${apiKey}`,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: maxTokens,
              temperature: 0,
              system: input.systemPrompt,
              messages: [
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

          const rawText = await response.text();
          const payload = this.safeJsonParse(rawText) as AnthropicMessagePayload | null;
          const tokensUsed = this.extractTokensUsed(payload);

          if (!response.ok) {
            const message =
              payload?.error?.message ??
              rawText.slice(0, 300) ??
              `HTTP ${response.status}`;
            throw new AnthropicProviderError(
              `Claude request failed with status ${response.status}: ${message}`,
              {
                model,
                startTime,
                latencyMs: Date.now() - startedAt,
                httpStatus: response.status,
                errorType: this.resolveHttpErrorType(response.status),
                timeout: false,
                jsonParseSuccess: payload !== null,
                tokensUsed,
                rawResponse: payload ?? rawText,
              },
            );
          }

          const text = payload?.content
            ?.filter((item) => item.type === 'text' && item.text)
            .map((item) => item.text)
            .join('\n')
            .trim();

          if (!text) {
            throw new AnthropicProviderError(
              'Claude returned an empty response payload.',
              {
                model,
                startTime,
                latencyMs: Date.now() - startedAt,
                httpStatus: response.status,
                errorType: 'empty_response',
                timeout: false,
                jsonParseSuccess: payload !== null,
                tokensUsed,
                rawResponse: payload ?? rawText,
              },
            );
          }

          const jsonText = this.extractJsonText(text);
          let data: T;
          try {
            data = JSON.parse(jsonText) as T;
          } catch (error) {
            throw new AnthropicProviderError(
              error instanceof Error
                ? `Claude JSON parse failed: ${error.message}`
                : 'Claude JSON parse failed.',
              {
                model,
                startTime,
                latencyMs: Date.now() - startedAt,
                httpStatus: response.status,
                errorType: 'json_parse_error',
                timeout: false,
                jsonParseSuccess: false,
                tokensUsed,
                rawResponse: payload ?? rawText,
              },
            );
          }

          const latencyMs = Date.now() - startedAt;
          this.logger.log(
            `provider=${this.name} model=${model} timeoutMs=${timeoutMs} latencyMs=${latencyMs} success=true`,
          );

          return {
            data,
            provider: this.name,
            model,
            startTime,
            latencyMs,
            httpStatus: response.status,
            timeout: false,
            jsonParseSuccess: true,
            tokensUsed,
            rawResponse: payload ?? rawText,
          };
        } catch (error) {
          const normalizedError = this.normalizeError(
            error,
            {
              model,
              startTime,
              latencyMs: Date.now() - startedAt,
            },
          );
          const message = normalizedError.message;
          lastError = normalizedError;

          if (
            this.shouldRetryWithModelFallback(normalizedError) &&
            model !== primaryModel &&
            attempt >= 1
          ) {
            break;
          }

          if (
            this.shouldRetryWithModelFallback(normalizedError) &&
            model === primaryModel &&
            this.resolveModelCandidates(primaryModel).length > 1
          ) {
            this.logger.warn(
              `provider=${this.name} model=${model} falling back to alternate model alias after routing failure`,
            );
            break;
          }

          if (!this.shouldRetry(normalizedError) || attempt > retryMax) {
            this.logger.error(
              `provider=${this.name} model=${model ?? 'unknown'} timeoutMs=${timeoutMs} latencyMs=${Date.now() - startedAt} success=false error=${message}`,
            );
            throw normalizedError;
          }

          await this.sleep(attempt * 1_000);
        } finally {
          clearTimeout(timeout);
        }
      }
    }

    throw lastError ?? new ServiceUnavailableException('Claude request failed.');
  }

  async healthCheck(): Promise<AnthropicHealthCheckResult> {
    if (this.isRetired()) {
      return {
        ok: false,
        model: this.resolveModel(),
        latencyMs: null,
        error: 'CLAUDE runtime retired. Historical compatibility stays read-only.',
      };
    }

    if (!this.isEnabled() || !this.isConfigured()) {
      return {
        ok: false,
        model: this.resolveModel(),
        latencyMs: null,
        error: 'CLAUDE provider is not configured.',
      };
    }

    const startedAt = Date.now();

    try {
      await this.generateJson<{ ok: boolean }>({
        prompt: 'Return JSON only: {"ok": true}',
        timeoutMs: Math.min(this.readInt('CLAUDE_TIMEOUT_MS', 120_000), 20_000),
        maxTokens: 120,
      });

      return {
        ok: true,
        model: this.resolveModel(),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        model: this.resolveModel(),
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown Claude error.',
      };
    }
  }

  private shouldRetry(error: unknown) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
    const timeout =
      error instanceof AnthropicProviderError ? error.timeout : false;
    const httpStatus =
      error instanceof AnthropicProviderError ? error.httpStatus : null;

    return (
      timeout ||
      httpStatus === 429 ||
      httpStatus === 502 ||
      httpStatus === 503 ||
      httpStatus === 504 ||
      message.includes('timed out') ||
      message.includes('429') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('temporarily unavailable')
    );
  }

  private shouldRetryWithModelFallback(error: unknown) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();

    return (
      message.includes('无可用渠道') ||
      message.includes('distributor') ||
      message.includes('model')
    );
  }

  private resolveModelCandidates(model: string) {
    const normalized = model.trim();
    const unprefixed = normalized.includes('/')
      ? normalized.split('/').pop()?.trim() ?? normalized
      : normalized;

    return Array.from(
      new Set([normalized, unprefixed].filter((item) => Boolean(item))),
    );
  }

  private resolveBaseUrl() {
    return (
      process.env.CLAUDE_API_BASE_URL?.trim().replace(/\/$/, '') ||
      'https://api.anthropic.com'
    );
  }

  private resolveApiKey() {
    return process.env.CLAUDE_API_KEY?.trim() || '';
  }

  private resolveModel() {
    return process.env.CLAUDE_MODEL?.trim() || 'claude-opus-4-6';
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
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

  private safeJsonParse(value: string) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  private extractJsonText(value: string) {
    const trimmed = value.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return trimmed;
    }

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const objectStart = trimmed.indexOf('{');
    const objectEnd = trimmed.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      return trimmed.slice(objectStart, objectEnd + 1);
    }

    return trimmed;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeError(
    error: unknown,
    context: {
      model: string | null;
      startTime: string;
      latencyMs: number;
    },
  ) {
    if (error instanceof AnthropicProviderError) {
      return error;
    }

    if (error instanceof ServiceUnavailableException) {
      return new AnthropicProviderError(error.message, {
        model: context.model,
        startTime: context.startTime,
        latencyMs: context.latencyMs,
        httpStatus: null,
        errorType: 'service_unavailable',
        timeout: false,
        jsonParseSuccess: true,
        tokensUsed: null,
      });
    }

    const message =
      error instanceof Error ? error.message : 'Unknown Claude error.';
    const timeout =
      error instanceof Error &&
      (error.name === 'AbortError' || message.toLowerCase().includes('aborted'));

    return new AnthropicProviderError(message, {
      model: context.model,
      startTime: context.startTime,
      latencyMs: context.latencyMs,
      httpStatus: null,
      errorType: timeout ? 'timeout' : 'unknown_error',
      timeout,
      jsonParseSuccess: true,
      tokensUsed: null,
    });
  }

  private resolveHttpErrorType(status: number) {
    if (status === 408) {
      return 'timeout';
    }
    if (status === 429) {
      return 'rate_limit';
    }
    if (status >= 500) {
      return 'api_error';
    }
    return 'http_error';
  }

  private extractTokensUsed(payload: AnthropicMessagePayload | null): number | null {
    if (!payload?.usage) {
      return null;
    }

    const values: number[] = [
      payload.usage.input_tokens,
      payload.usage.output_tokens,
      payload.usage.cache_creation_input_tokens,
      payload.usage.cache_read_input_tokens,
    ].filter((value): value is number => Number.isFinite(value));

    if (!values.length) {
      return null;
    }

    return values.reduce((sum, value) => sum + Number(value), 0);
  }
}
