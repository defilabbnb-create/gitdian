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
  OpenAiRequestOptions,
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

type OpenAiLaneConfig = {
  targets: OpenAiTargetConfig[];
  defaultModel: string | null;
  laneKey: string;
};

type OpenAiTargetConfig = {
  apiKey: string;
  baseUrl: string;
  stateKey: string;
};

type OpenAiLaneSequenceState = {
  requestSequence: number;
};

type OpenAiTargetState = {
  inFlight: number;
  waiters: Array<() => void>;
  adaptiveMaxConcurrency: number;
  successStreak: number;
};

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;

  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly laneSequenceStates = new Map<string, OpenAiLaneSequenceState>();
  private readonly targetStates = new Map<string, OpenAiTargetState>();

  async generateJson<T>(input: GenerateJsonInput): Promise<AiProviderResult<T>> {
    const laneConfig = this.resolveLaneConfig(input.providerOptions?.openai);
    const laneSequenceState = this.getLaneSequenceState(laneConfig);
    const requestedModel = input.modelOverride ?? laneConfig.defaultModel;

    if (!laneConfig.targets.length || !requestedModel) {
      throw new ServiceUnavailableException(
        'OpenAI provider is not configured. Please set OPENAI_API_KEY and OPENAI_MODEL (or OPENAI_MODEL_CANDIDATES).',
      );
    }

    const modelCandidates = this.buildScheduledModelCandidates(
      requestedModel,
      laneConfig,
      laneSequenceState,
    );
    const targetCandidates = this.buildScheduledTargets(
      laneConfig,
      laneSequenceState,
    );

    const retryMax = this.readNonNegativeInt(
      'OPENAI_RETRY_MAX',
      modelCandidates.length > 1 || targetCandidates.length > 1
        ? Math.min(
            4,
            Math.max(modelCandidates.length, targetCandidates.length) - 1,
          )
        : 2,
    );
    const totalAttempts = Math.max(1, retryMax + 1);

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      const model = modelCandidates[(attempt - 1) % modelCandidates.length];
      const attemptTarget =
        targetCandidates[(attempt - 1) % targetCandidates.length];
      const attemptState = this.getTargetState(attemptTarget, laneConfig);

      try {
        const result = await this.withConcurrencyGate(
          laneConfig,
          attemptState,
          async (gateWaitMs) =>
            this.executeRequest<T>({
              input,
              model,
              gateWaitMs,
              laneConfig,
              targetConfig: attemptTarget,
            }),
        );
        this.recordSuccess(laneConfig, attemptState);
        return result;
      } catch (error) {
        const normalized = this.normalizeError(error);

        if (!this.shouldRetry(normalized) || attempt >= totalAttempts) {
          throw normalized;
        }

        const retryAfterMs = this.resolveRetryDelayMs(normalized, attempt);
        const nextModel = modelCandidates[attempt % modelCandidates.length];
        const nextTarget = targetCandidates[attempt % targetCandidates.length];
        this.applyBackpressure(normalized, laneConfig, attemptState);
        this.logger.warn(
          `provider=${this.name} lane=${laneConfig.laneKey} target=${attemptTarget.stateKey} model=${model ?? 'unknown'} attempt=${attempt}/${totalAttempts} nextTarget=${nextTarget.stateKey} nextModel=${nextModel ?? model ?? 'unknown'} retryAfterMs=${retryAfterMs} concurrencyCap=${this.resolveMaxConcurrency(laneConfig, attemptState)} reason=${normalized.message}`,
        );
        await this.sleep(retryAfterMs);
      }
    }

    throw new ServiceUnavailableException('OpenAI request failed after retries.');
  }

  async healthCheck(): Promise<AiHealthCheckResult> {
    const laneConfig = this.resolveDefaultLaneConfig();
    if (!laneConfig.targets.length || !laneConfig.defaultModel) {
      return {
        ok: false,
        model: laneConfig.defaultModel,
        latencyMs: null,
        error:
          'OPENAI_API_KEY or an OpenAI model (OPENAI_MODEL / OPENAI_MODEL_CANDIDATES) is not configured.',
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
        model: laneConfig.defaultModel,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        model: laneConfig.defaultModel,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown OpenAI health check error.',
      };
    }
  }

  private async executeRequest<T>(args: {
    input: GenerateJsonInput;
    model: string;
    gateWaitMs: number;
    laneConfig: OpenAiLaneConfig;
    targetConfig: OpenAiTargetConfig;
  }): Promise<AiProviderResult<T>> {
    const startedAt = Date.now();
    const timeoutMs = Math.max(1_000, args.input.timeoutMs ?? this.readInt('OPENAI_TIMEOUT_MS', 30_000));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const requestBody = this.buildChatCompletionBody(args.input, args.model);

    try {
      const response = await fetch(`${args.targetConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.targetConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
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
          text?: string;
          message?: {
            content?:
              | string
              | Array<{
                  type?: string;
                  text?: string;
                }>;
            refusal?: string | null;
          };
          finish_reason?: string | null;
        }>;
        output_text?: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const text = this.extractResponseText(payload);
      if (!text) {
        const streamFallbackText = await this.tryStreamingTextFallback({
          ...args,
          timeoutMs,
          requestBody,
        });
        if (streamFallbackText) {
          const latencyMs = Date.now() - startedAt;
          this.logger.log(
            `provider=${this.name} lane=${args.laneConfig.laneKey} target=${args.targetConfig.stateKey} model=${args.model} latencyMs=${latencyMs} gateWaitMs=${args.gateWaitMs} success=true fallback=ananapi_stream_recovery`,
          );

          return {
            data: JSON.parse(streamFallbackText) as T,
            provider: this.name,
            model: args.model,
            latencyMs,
            fallbackUsed: true,
            confidence: null,
            rawResponse: payload,
          };
        }

        const payloadSummary = this.buildEmptyResponseSummary(payload);
        throw new OpenAiProviderError(
          `OpenAI returned an empty response. ${payloadSummary}`,
          {
          statusCode: response.status,
          retryAfterMs: null,
          timeout: false,
          },
        );
      }

      const latencyMs = Date.now() - startedAt;
      this.logger.log(
        `provider=${this.name} lane=${args.laneConfig.laneKey} target=${args.targetConfig.stateKey} model=${args.model} latencyMs=${latencyMs} gateWaitMs=${args.gateWaitMs} success=true`,
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
        `provider=${this.name} lane=${args.laneConfig.laneKey} target=${args.targetConfig.stateKey} model=${args.model ?? 'unknown'} latencyMs=${latencyMs} gateWaitMs=${args.gateWaitMs} success=false error=${normalized.message}`,
      );
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildChatCompletionBody(
    input: GenerateJsonInput,
    model: string,
  ): {
    model: string;
    response_format: { type: 'json_object' };
    messages: Array<{ role: string; content: string }>;
  } {
    return {
      model,
      response_format: { type: 'json_object' as const },
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
    };
  }

  private async tryStreamingTextFallback(args: {
    input: GenerateJsonInput;
    model: string;
    gateWaitMs: number;
    laneConfig: OpenAiLaneConfig;
    targetConfig: OpenAiTargetConfig;
    timeoutMs: number;
    requestBody: {
      model: string;
      response_format: { type: 'json_object' };
      messages: Array<{ role: string; content: string }>;
    };
  }) {
    if (!args.targetConfig.baseUrl.includes('ananapi.com')) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

    try {
      const response = await fetch(`${args.targetConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.targetConfig.apiKey}`,
        },
        body: JSON.stringify({
          ...args.requestBody,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        return null;
      }

      const streamText = await this.readStreamingChatCompletion(response);
      return streamText;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readStreamingChatCompletion(response: Response) {
    const reader = response.body?.getReader();
    if (!reader) {
      return null;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const lines = frame
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        for (const line of lines) {
          if (!line.startsWith('data:')) {
            continue;
          }

          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{
                delta?: {
                  content?:
                    | string
                    | Array<{
                        type?: string;
                        text?: string;
                      }>;
                };
              }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') {
              text += delta;
            } else if (Array.isArray(delta)) {
              text += delta
                .map((item) =>
                  typeof item?.text === 'string' ? item.text : '',
                )
                .join('');
            }
          } catch {
            continue;
          }
        }
      }
    }

    const normalized = text.trim();
    return normalized.length ? normalized : null;
  }

  private extractResponseText(payload: {
    choices?: Array<{
      text?: string;
      message?: {
        content?:
          | string
          | Array<{
              type?: string;
              text?: string;
            }>;
        refusal?: string | null;
      };
    }>;
    output_text?: string;
  }) {
    if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
      return payload.output_text.trim();
    }

    const choice = payload.choices?.[0];
    if (!choice) {
      return null;
    }

    if (typeof choice.text === 'string' && choice.text.trim()) {
      return choice.text.trim();
    }

    const content = choice.message?.content;
    if (typeof content === 'string' && content.trim()) {
      return content.trim();
    }

    if (Array.isArray(content)) {
      const text = content
        .map((item) => (typeof item?.text === 'string' ? item.text.trim() : ''))
        .filter(Boolean)
        .join('\n')
        .trim();
      if (text) {
        return text;
      }
    }

    if (typeof choice.message?.refusal === 'string' && choice.message.refusal.trim()) {
      return choice.message.refusal.trim();
    }

    return null;
  }

  private buildEmptyResponseSummary(payload: {
    choices?: Array<{
      text?: string;
      message?: {
        content?: unknown;
        refusal?: string | null;
      };
      finish_reason?: string | null;
    }>;
    output_text?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }) {
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    const contentType = Array.isArray(content) ? 'array' : typeof content;
    const usage = payload.usage ?? {};

    return [
      `payloadKeys=${Object.keys(payload).join(',') || 'none'}`,
      `finishReason=${choice?.finish_reason ?? 'unknown'}`,
      `messageKeys=${
        choice?.message ? Object.keys(choice.message).join(',') || 'none' : 'none'
      }`,
      `contentType=${contentType}`,
      `hasTextField=${typeof choice?.text === 'string' && choice.text.trim() ? 'yes' : 'no'}`,
      `hasOutputText=${
        typeof payload.output_text === 'string' && payload.output_text.trim()
          ? 'yes'
          : 'no'
      }`,
      `usageCompletionTokens=${usage.completion_tokens ?? 'unknown'}`,
      `usageTotalTokens=${usage.total_tokens ?? 'unknown'}`,
    ].join(' ');
  }

  private async withConcurrencyGate<T>(
    laneConfig: OpenAiLaneConfig,
    targetState: OpenAiTargetState,
    run: (gateWaitMs: number) => Promise<T>,
  ): Promise<T> {
    const gateStartedAt = Date.now();
    await this.acquireSlot(laneConfig, targetState);
    const gateWaitMs = Date.now() - gateStartedAt;

    try {
      return await run(gateWaitMs);
    } finally {
      this.releaseSlot(targetState);
    }
  }

  private async acquireSlot(
    laneConfig: OpenAiLaneConfig,
    targetState: OpenAiTargetState,
  ) {
    while (
      targetState.inFlight >= this.resolveMaxConcurrency(laneConfig, targetState)
    ) {
      await new Promise<void>((resolve) => {
        targetState.waiters.push(resolve);
      });
    }

    targetState.inFlight += 1;
  }

  private releaseSlot(targetState: OpenAiTargetState) {
    targetState.inFlight = Math.max(0, targetState.inFlight - 1);
    const waiter = targetState.waiters.shift();
    if (waiter) {
      waiter();
    }
  }

  resolveMaxConcurrency(
    laneConfig: OpenAiLaneConfig = this.resolveDefaultLaneConfig(),
    targetState: OpenAiTargetState = this.getTargetState(
      laneConfig.targets[0],
      laneConfig,
    ),
  ) {
    return Math.max(
      1,
      Math.min(
        this.resolveConfiguredMaxConcurrency(laneConfig),
        targetState.adaptiveMaxConcurrency,
      ),
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

  private resolveConfiguredMaxConcurrency(laneConfig: OpenAiLaneConfig) {
    if (laneConfig.laneKey === 'cold_tool') {
      return Math.max(
        1,
        this.readInt(
          'COLD_TOOL_OPENAI_MAX_CONCURRENCY',
          this.readInt('OPENAI_MAX_CONCURRENCY', 2),
        ),
      );
    }

    return Math.max(1, this.readInt('OPENAI_MAX_CONCURRENCY', 2));
  }

  private shouldSpreadAcrossModelCandidates(laneConfig: OpenAiLaneConfig) {
    if (laneConfig.laneKey === 'cold_tool') {
      return this.readBoolean(
        'COLD_TOOL_OPENAI_MULTI_MODEL_SPREAD_ENABLED',
        this.readBoolean('OPENAI_MULTI_MODEL_SPREAD_ENABLED', false),
      );
    }

    return this.readBoolean('OPENAI_MULTI_MODEL_SPREAD_ENABLED', false);
  }

  private resolveConfiguredDefaultModel(laneConfig: OpenAiLaneConfig) {
    if (laneConfig.laneKey === 'cold_tool') {
      const configuredColdToolDefault =
        process.env.COLD_TOOL_OPENAI_MODEL?.trim() ||
        process.env.COLD_TOOL_DISCOVERY_MODEL?.trim();
      if (configuredColdToolDefault) {
        return configuredColdToolDefault;
      }
    }

    const configuredDefault = process.env.OPENAI_MODEL?.trim();
    if (configuredDefault) {
      return configuredDefault;
    }

    return this.readCsv('OPENAI_MODEL_CANDIDATES')[0] ?? null;
  }

  private resolveModelCandidates(
    requestedModel: string,
    laneConfig: OpenAiLaneConfig,
  ) {
    const configuredCandidates =
      laneConfig.laneKey === 'cold_tool'
        ? this.readCsv('COLD_TOOL_OPENAI_MODEL_CANDIDATES').length
          ? this.readCsv('COLD_TOOL_OPENAI_MODEL_CANDIDATES')
          : this.readCsv('OPENAI_MODEL_CANDIDATES')
        : this.readCsv('OPENAI_MODEL_CANDIDATES');
    const fallbackCandidates =
      configuredCandidates.length === 0 &&
      laneConfig.targets[0]?.baseUrl.includes('ananapi.com')
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

  private buildScheduledModelCandidates(
    requestedModel: string,
    laneConfig: OpenAiLaneConfig,
    laneSequenceState: OpenAiLaneSequenceState,
  ) {
    const candidates = this.resolveModelCandidates(requestedModel, laneConfig);
    if (!this.shouldSpreadAcrossModelCandidates(laneConfig) || candidates.length <= 1) {
      return candidates;
    }

    const offset = laneSequenceState.requestSequence % candidates.length;
    laneSequenceState.requestSequence =
      (laneSequenceState.requestSequence + 1) % Number.MAX_SAFE_INTEGER;

    return [
      ...candidates.slice(offset),
      ...candidates.slice(0, offset),
    ];
  }

  private buildScheduledTargets(
    laneConfig: OpenAiLaneConfig,
    laneSequenceState: OpenAiLaneSequenceState,
  ) {
    if (laneConfig.targets.length <= 1) {
      return laneConfig.targets;
    }

    const offset = laneSequenceState.requestSequence % laneConfig.targets.length;
    laneSequenceState.requestSequence =
      (laneSequenceState.requestSequence + 1) % Number.MAX_SAFE_INTEGER;

    return [
      ...laneConfig.targets.slice(offset),
      ...laneConfig.targets.slice(0, offset),
    ];
  }

  private readCsv(envName: string) {
    return (process.env[envName] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
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

  private applyBackpressure(
    error: OpenAiProviderError,
    laneConfig: OpenAiLaneConfig,
    targetState: OpenAiTargetState,
  ) {
    const currentMax = this.resolveMaxConcurrency(laneConfig, targetState);
    if (currentMax <= 1) {
      targetState.successStreak = 0;
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

    if (nextMax !== targetState.adaptiveMaxConcurrency) {
      this.logger.warn(
        `provider=${this.name} lane=${laneConfig.laneKey} adaptive_concurrency_reduce from=${targetState.adaptiveMaxConcurrency} to=${nextMax} status=${error.options.statusCode ?? 'unknown'} timeout=${error.options.timeout}`,
      );
    }

    targetState.adaptiveMaxConcurrency = nextMax;
    targetState.successStreak = 0;
  }

  private recordSuccess(
    laneConfig: OpenAiLaneConfig,
    targetState: OpenAiTargetState,
  ) {
    const configuredMax = this.resolveConfiguredMaxConcurrency(laneConfig);
    if (targetState.adaptiveMaxConcurrency >= configuredMax) {
      targetState.adaptiveMaxConcurrency = configuredMax;
      targetState.successStreak = 0;
      return;
    }

    targetState.successStreak += 1;
    const recoveryThreshold = this.readInt(
      laneConfig.laneKey === 'cold_tool'
        ? 'COLD_TOOL_OPENAI_CONCURRENCY_RECOVERY_SUCCESS_COUNT'
        : 'OPENAI_CONCURRENCY_RECOVERY_SUCCESS_COUNT',
      8,
    );
    if (targetState.successStreak < recoveryThreshold) {
      return;
    }

    const nextMax = Math.min(configuredMax, targetState.adaptiveMaxConcurrency + 1);
    if (nextMax !== targetState.adaptiveMaxConcurrency) {
      this.logger.log(
        `provider=${this.name} lane=${laneConfig.laneKey} adaptive_concurrency_recover from=${targetState.adaptiveMaxConcurrency} to=${nextMax} successStreak=${targetState.successStreak}`,
      );
    }
    targetState.adaptiveMaxConcurrency = nextMax;
    targetState.successStreak = 0;
  }

  private resolveDefaultLaneConfig() {
    return this.resolveLaneConfig();
  }

  private resolveLaneConfig(
    options?: OpenAiRequestOptions,
  ): OpenAiLaneConfig {
    const laneKey = options?.laneKey?.trim() || 'default';
    const baseUrl =
      options?.baseUrl?.trim() ||
      (laneKey === 'cold_tool'
        ? process.env.COLD_TOOL_OPENAI_BASE_URL?.trim()
        : '') ||
      process.env.OPENAI_BASE_URL?.trim() ||
      'https://api.openai.com/v1';
    const apiKeys = this.resolveLaneApiKeys(laneKey, options?.apiKey);

    const laneConfig: OpenAiLaneConfig = {
      targets: apiKeys.map((apiKey, index) => ({
        apiKey,
        baseUrl,
        stateKey: `${laneKey}:${index + 1}`,
      })),
      defaultModel: null,
      laneKey,
    };
    laneConfig.defaultModel = this.resolveConfiguredDefaultModel(laneConfig);
    return laneConfig;
  }

  private resolveLaneApiKeys(laneKey: string, overrideApiKey?: string) {
    if (overrideApiKey?.trim()) {
      return [overrideApiKey.trim()];
    }

    const envNames =
      laneKey === 'cold_tool'
        ? ['COLD_TOOL_OPENAI_API_KEYS', 'COLD_TOOL_OPENAI_API_KEY']
        : ['OPENAI_API_KEYS', 'OPENAI_API_KEY'];

    return Array.from(
      new Set(
        envNames
          .flatMap((envName) => this.readCsv(envName))
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  private getLaneSequenceState(laneConfig: OpenAiLaneConfig) {
    const existing = this.laneSequenceStates.get(laneConfig.laneKey);
    if (existing) {
      return existing;
    }

    const created: OpenAiLaneSequenceState = {
      requestSequence: 0,
    };
    this.laneSequenceStates.set(laneConfig.laneKey, created);
    return created;
  }

  private getTargetState(
    targetConfig: OpenAiTargetConfig | undefined,
    laneConfig: OpenAiLaneConfig,
  ) {
    if (!targetConfig) {
      return {
        inFlight: 0,
        waiters: [],
        adaptiveMaxConcurrency: this.resolveConfiguredMaxConcurrency(laneConfig),
        successStreak: 0,
      };
    }

    const existing = this.targetStates.get(targetConfig.stateKey);
    if (existing) {
      return existing;
    }

    const created: OpenAiTargetState = {
      inFlight: 0,
      waiters: [],
      adaptiveMaxConcurrency: this.resolveConfiguredMaxConcurrency(laneConfig),
      successStreak: 0,
    };
    this.targetStates.set(targetConfig.stateKey, created);
    return created;
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
