export type SettingsPayload = {
  github: {
    search: {
      defaultMode: 'updated' | 'created';
      defaultSort: 'updated' | 'stars';
      defaultOrder: 'asc' | 'desc';
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
    defaultProvider: 'omlx' | 'openai';
    fallbackProvider: 'omlx' | 'openai';
    enableFallback: boolean;
    taskRouting: {
      rough_filter: 'omlx' | 'openai';
      completeness: 'omlx' | 'openai';
      basic_analysis: 'omlx' | 'openai';
      idea_fit: 'omlx' | 'openai';
      idea_extract: 'omlx' | 'openai';
    };
    models: {
      omlx: string | null;
      openai: string | null;
    };
    timeoutMs: number;
  };
};

export type UpdateSettingsPayload = Partial<{
  github: Partial<SettingsPayload['github']> & {
    search?: Partial<SettingsPayload['github']['search']>;
    fetch?: Partial<SettingsPayload['github']['fetch']>;
  };
  fastFilter: Partial<SettingsPayload['fastFilter']> & {
    batch?: Partial<SettingsPayload['fastFilter']['batch']>;
  };
  ai: Partial<SettingsPayload['ai']> & {
    taskRouting?: Partial<SettingsPayload['ai']['taskRouting']>;
    models?: Partial<SettingsPayload['ai']['models']>;
  };
}>;

export type ProviderHealthStatus = {
  ok: boolean;
  model: string | null;
  latencyMs: number | null;
  error: string | null;
};

export type SettingsHealthPayload = {
  database: {
    ok: boolean;
    latencyMs: number | null;
    error: string | null;
  };
  ai: {
    omlx: ProviderHealthStatus;
    openai: ProviderHealthStatus;
  };
  github: {
    ok: boolean;
    hasToken: boolean;
    latencyMs: number | null;
    error: string | null;
  };
};
