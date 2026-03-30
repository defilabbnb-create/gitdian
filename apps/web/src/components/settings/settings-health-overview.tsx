import { AiHealthPayload, SettingsHealthPayload } from '@/lib/types/settings';

type SettingsHealthOverviewProps = {
  health: SettingsHealthPayload | null;
  aiHealth: AiHealthPayload | null;
  healthErrorMessage?: string | null;
};

export function SettingsHealthOverview({
  health,
  aiHealth,
  healthErrorMessage,
}: SettingsHealthOverviewProps) {
  const summary = buildHealthSummary(health, aiHealth, healthErrorMessage ?? null);

  return (
    <section
      data-settings-health-summary="true"
      className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        系统健康摘要
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        {summary.title}
      </h2>
      <p className="mt-3 text-sm leading-7 text-slate-600">{summary.description}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <HealthMiniCard
          label="数据抓取"
          value={summary.github.value}
          helper={summary.github.helper}
        />
        <HealthMiniCard
          label="API 主链"
          value={summary.openai.value}
          helper={summary.openai.helper}
        />
        <HealthMiniCard
          label="历史复核入口"
          value={summary.claude.value}
          helper={summary.claude.helper}
        />
      </div>
    </section>
  );
}

function HealthMiniCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </article>
  );
}

function buildHealthSummary(
  health: SettingsHealthPayload | null,
  aiHealth: AiHealthPayload | null,
  healthErrorMessage: string | null,
) {
  if (healthErrorMessage) {
    return {
      title: '当前健康摘要待确认',
      description: '系统健康读取失败，先按现有运行模式继续，必要时再展开工程细项排查。',
      github: {
        value: '待确认',
        helper: '运行检查暂时不可用。',
      },
      openai: {
        value: '待确认',
        helper: '先按已有配置运行。',
      },
      claude: {
        value: '待确认',
        helper: '需要时再展开排查。',
      },
    };
  }

  if (!health) {
    return {
      title: '当前还没有健康摘要',
      description: '系统健康还没回传，先按当前默认配置跑起来，必要时再点开工程细项。',
      github: {
        value: '待检查',
        helper: '还没有最新的抓取状态。',
      },
      openai: {
        value: '待检查',
        helper: '还没有最新的 API 主链状态。',
      },
      claude: {
        value: '待检查',
        helper: '历史复核入口状态稍后再看。',
      },
    };
  }

  const githubOk = health.github.ok;
  const openaiOk = health.ai.openai.ok;
  const claudeOk = aiHealth?.claude.ok ?? false;
  const databaseOk = health.database.ok;
  const coreHealthy = openaiOk && databaseOk;

  return {
    title: coreHealthy ? '当前主链路可运行' : '当前主链路有待处理项',
    description: coreHealthy
      ? '核心链路现在是通的，先按当前默认配置继续跑。只有当结果不对或明显变慢时，再展开工程细项。'
      : '核心链路里有至少一项不稳定。先确认最常改配置，再决定要不要下钻工程排查。',
    github: {
      value: githubOk ? '可继续抓取' : '需要检查',
      helper: health.github.hasToken
        ? 'GitHub token 已配置，先看是否限流或延迟。'
        : '当前缺少 token，抓取稳定性会受影响。',
    },
    openai: {
      value: openaiOk ? '主分析正常' : '主分析待恢复',
      helper: openaiOk
        ? `当前模型：${health.ai.openai.model ?? '--'}`
        : health.ai.openai.error ?? '需要优先恢复 API 主链。',
    },
    claude: {
      value: claudeOk ? '检测到残留可用' : '已停用',
      helper: claudeOk
        ? `当前模型：${aiHealth?.claude.model ?? '--'}，但运行入口已不再使用。`
        : '不影响主分析和前端结果展示。',
    },
  };
}
