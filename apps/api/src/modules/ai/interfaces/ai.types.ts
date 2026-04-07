export type AiTaskType =
  | 'rough_filter'
  | 'completeness'
  | 'basic_analysis'
  | 'idea_extract'
  | 'idea_fit'
  | 'idea_snapshot';

export type AiProviderName = 'omlx' | 'openai';

export type OpenAiRequestOptions = {
  apiKey?: string;
  baseUrl?: string;
  laneKey?: string;
};

export type GenerateJsonInput = {
  taskType: AiTaskType;
  prompt: string;
  systemPrompt?: string;
  schemaHint?: string;
  timeoutMs?: number;
  modelOverride?: string | null;
  providerOverride?: AiProviderName;
  providerOptions?: {
    openai?: OpenAiRequestOptions;
  };
};

export type AiProviderResult<T> = {
  data: T;
  provider: AiProviderName;
  model: string | null;
  latencyMs: number;
  fallbackUsed: boolean;
  confidence: number | null;
  rawResponse: unknown;
};

export type AiHealthCheckResult = {
  ok: boolean;
  model: string | null;
  latencyMs: number | null;
  error?: string;
};
