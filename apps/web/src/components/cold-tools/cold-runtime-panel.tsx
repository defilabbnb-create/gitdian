import { getColdRuntime } from '@/lib/api/settings';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';

export async function ColdRuntimePanel() {
  try {
    const runtime = await getColdRuntime({ timeoutMs: 4_000 });
    const collectorTone = resolveTone(runtime.collector.heartbeatState);
    const queueTone = resolveTone(runtime.coldDeepQueue.queueState);

    return (
      <section className="rounded-[28px] border border-emerald-200 bg-white/90 p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              冷门运行状态
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              直接看采集、深分析和当前运行版本，不靠感觉判断是不是停了。
            </h2>
          </div>
          <div className="font-mono text-xs text-slate-500">
            Git SHA: {runtime.runtime.gitSha}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <RuntimeCell
            label="当前采集阶段"
            value={runtime.collector.currentStage ?? '空闲'}
            helper={`job=${runtime.collector.currentJobId ?? '--'} progress=${runtime.collector.currentProgress ?? '--'}%`}
            tone={collectorTone}
          />
          <RuntimeCell
            label="最近采集心跳"
            value={formatTime(runtime.collector.lastHeartbeatAt)}
            helper={`状态=${runtime.collector.currentStatus ?? '--'} · ${formatAge(runtime.collector.heartbeatAgeSeconds)}`}
            tone={collectorTone}
          />
          <RuntimeCell
            label="冷门深分析队列"
            value={`active ${runtime.coldDeepQueue.active} / queued ${runtime.coldDeepQueue.queued}`}
            helper={`队列状态=${runtime.coldDeepQueue.queueState} · 最近完成=${formatTime(runtime.coldDeepQueue.latestCompletedAt)}`}
            tone={queueTone}
          />
          <RuntimeCell
            label="最近采集结果"
            value={formatTime(runtime.collector.lastSuccessAt)}
            helper={
              runtime.collector.lastFailureAt
                ? `最近失败=${formatTime(runtime.collector.lastFailureAt)}`
                : '最近没有失败'
            }
          />
        </div>

        {runtime.warnings.length > 0 ? (
          <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
              自动诊断
            </p>
            <div className="mt-3 space-y-2">
              {runtime.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    );
  } catch (error) {
    return (
      <section className="rounded-[28px] border border-rose-200 bg-rose-50/90 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
          冷门运行状态
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          运行态接口暂时不可用，但页面不会因此整页失败。
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          {getFriendlyRuntimeError(
            error,
            '冷门运行态接口当前不可用，优先检查 API 是否已切到最新构建版本。',
          )}
        </p>
      </section>
    );
  }
}

function RuntimeCell({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string;
  value: string;
  helper: string;
  tone?: 'default' | 'healthy' | 'warning' | 'danger';
}) {
  const toneClasses = {
    default: 'border-slate-200 bg-slate-50',
    healthy: 'border-emerald-200 bg-emerald-50',
    warning: 'border-amber-200 bg-amber-50',
    danger: 'border-rose-200 bg-rose-50',
  }[tone];

  return (
    <div className={`rounded-[24px] border px-4 py-4 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

function formatTime(value: string | null) {
  if (!value) {
    return '--';
  }

  try {
    return new Date(value).toLocaleString('zh-CN', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return value;
  }
}

function formatAge(value: number | null) {
  if (value === null) {
    return '未记录心跳';
  }

  if (value < 60) {
    return `${value}s 前`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds}s 前`;
}

function resolveTone(
  state: 'healthy' | 'stale' | 'idle' | 'missing' | 'stalled',
): 'default' | 'healthy' | 'warning' | 'danger' {
  if (state === 'healthy') {
    return 'healthy';
  }

  if (state === 'stale' || state === 'stalled') {
    return 'danger';
  }

  if (state === 'missing') {
    return 'warning';
  }

  return 'default';
}
