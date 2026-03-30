import { AiHealthPayload, SettingsHealthPayload, SettingsPayload } from '@/lib/types/settings';

type SettingsRuntimeSummaryProps = {
  settings: SettingsPayload | null;
  health: SettingsHealthPayload | null;
  aiHealth: AiHealthPayload | null;
};

export function SettingsRuntimeSummary({
  settings,
  health,
  aiHealth,
}: SettingsRuntimeSummaryProps) {
  const modelLabel = resolvePrimaryModel(settings);
  const githubLabel = resolveGithubLabel(health);
  const claudeLabel = resolveClaudeLabel(aiHealth);
  const fallbackLabel = resolveFallbackLabel(settings);

  return (
    <section
      data-settings-runtime-summary="true"
      className="rounded-[36px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_58%,_rgba(14,116,144,0.86)_100%)] px-8 py-8 text-white shadow-xl shadow-slate-900/10"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            当前运行模式
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-[3rem]">
            先看系统现在会怎么跑。
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
            当前主判断链路由 {modelLabel} 驱动，数据抓取 {githubLabel}，{claudeLabel}，
            {fallbackLabel}。这里先回答系统现在会不会继续消化存量分析任务，再决定要不要改配置。
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        <RuntimeCard
          label="主判断链路"
          value={modelLabel}
          helper="系统会优先沿着这条主链路做判断。"
        />
        <RuntimeCard
          label="数据抓取"
          value={githubLabel}
          helper="决定今天的仓库供给是否稳定。"
        />
        <RuntimeCard
          label="历史复核入口"
          value={claudeLabel}
          helper="Claude 运行入口已停用，旧复核结果只保留为历史参考。"
        />
        <RuntimeCard
          label="回退策略"
          value={fallbackLabel}
          helper="决定异常时会不会自动兜底。"
        />
        <RuntimeCard
          label="首页默认"
          value="挣钱优先"
          helper="默认先看今天最值得投入的项目。"
        />
      </div>
    </section>
  );
}

function RuntimeCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="rounded-[28px] border border-white/10 bg-white/5 px-5 py-5 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{helper}</p>
    </article>
  );
}

function resolvePrimaryModel(settings: SettingsPayload | null) {
  if (!settings) {
    return 'API 主模型';
  }

  const providerLabel =
    settings.ai.defaultProvider === 'omlx' ? '本地 OMLX' : 'API / OpenAI';
  const modelName =
    settings.ai.defaultProvider === 'omlx'
      ? settings.ai.models.omlx || settings.ai.models.omlxDeep || settings.ai.models.omlxLight
      : settings.ai.models.openai;

  return modelName ? `${providerLabel} · ${modelName}` : providerLabel;
}

function resolveGithubLabel(health: SettingsHealthPayload | null) {
  if (!health?.github.hasToken) {
    return '数据抓取待恢复';
  }

  if (health.github.usingMultiToken) {
    return '数据抓取稳定';
  }

  if (health.github.anonymousFallback) {
    return '抓取可继续';
  }

  return '数据抓取稳定';
}

function resolveClaudeLabel(aiHealth: AiHealthPayload | null) {
  if (!aiHealth) {
    return 'Claude 入口已停用';
  }

  return aiHealth.claude.ok
    ? '检测到 Claude 可用，但运行入口已停用'
    : 'Claude 入口已停用';
}

function resolveFallbackLabel(settings: SettingsPayload | null) {
  if (!settings?.ai.enableFallback) {
    return '异常时不自动切回旧链路';
  }

  return '异常时允许自动回退';
}
