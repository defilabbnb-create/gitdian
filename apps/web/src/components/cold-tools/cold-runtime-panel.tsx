import { getColdRuntime } from '@/lib/api/settings';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';

export async function ColdRuntimePanel() {
  try {
    const runtime = await getColdRuntime({ timeoutMs: 4_000 });
    const collectorTone = resolveTone(runtime.collector.heartbeatState);
    const queueTone = resolveTone(runtime.coldDeepQueue.queueState);

    return (
      <section className="rounded-[32px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(240,253,244,0.92)_58%,rgba(236,253,245,0.88)_100%)] p-5 shadow-[0_28px_80px_-40px_rgba(5,150,105,0.28)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              冷门运行状态
            </p>
            <h2 className="font-display mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              直接看采集、深分析和当前运行版本，不靠感觉判断是不是停了。
            </h2>
          </div>
          <div className="rounded-full border border-emerald-200 bg-white/80 px-4 py-2 font-mono text-xs text-slate-500">
            Git SHA: {runtime.runtime.gitSha}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <RuntimeCell
            label="当前采集阶段"
            value={runtime.collector.currentStage ?? '空闲'}
            helper={`run=${shortId(runtime.collector.currentRunId)} job=${runtime.collector.currentJobId ?? '--'} progress=${runtime.collector.currentProgress ?? '--'}%`}
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

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <RuntimeCell
            label="当前 Run"
            value={shortId(
              runtime.collector.currentRunId ?? runtime.collector.lastSuccessRunId,
            )}
            helper={`最近成功 run=${shortId(runtime.collector.lastSuccessRunId)} · 最近失败 run=${shortId(runtime.collector.lastFailureRunId)}`}
            tone={collectorTone}
          />
          <RuntimeCell
            label="阶段接力"
            value={`${runtime.collector.recentPhaseJobs.length} 条`}
            helper="同一轮冷门采集会拆成多个 phase job，下面直接看接力明细。"
          />
        </div>

        <details className="mt-4 rounded-[24px] border border-slate-200 bg-white/70 px-4 py-4">
          <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              最近 Phase 明细
            </p>
            <p className="font-mono text-xs text-slate-500">
              当前 run: {shortId(runtime.collector.currentRunId)} · 共{' '}
              {runtime.collector.recentPhaseJobs.length} 条
            </p>
          </summary>

          <div className="mt-3 space-y-2">
            {runtime.collector.recentPhaseJobs.map((job) => (
              <div
                key={job.jobId}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <p className="font-mono text-xs text-slate-500">
                    run={shortId(job.runId)} job={job.jobId}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatTime(job.createdAt)}
                    {' -> '}
                    {formatTime(job.updatedAt)}
                  </p>
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <PhaseBadge phase={job.phase} />
                  <StatusBadge status={job.status} />
                  <p className="text-sm text-slate-700">
                    progress={job.progress ?? '--'}%
                  </p>
                  <p className="text-sm text-slate-700">
                    finished={formatTime(job.finishedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>

        <details className="mt-4 rounded-[24px] border border-slate-200 bg-white/70 px-4 py-4">
          <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Phase 统计（24h）
            </p>
            <p className="text-xs text-slate-500">
              共 {runtime.collector.phaseStats24h.length} 个 phase
            </p>
          </summary>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {runtime.collector.phaseStats24h.map((stat) => (
              <div
                key={stat.phase}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <PhaseBadge phase={stat.phase} />
                  <p className="text-xs text-slate-500">
                    最近更新 {formatTime(stat.latestUpdatedAt)}
                  </p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <MetricPill
                    label="总量"
                    value={String(stat.total)}
                  />
                  <MetricPill
                    label="失败率"
                    value={`${stat.failureRate}%`}
                  />
                  <MetricPill
                    label="平均耗时"
                    value={formatDuration(stat.avgDurationSeconds)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span>running={stat.running}</span>
                  <span>success={stat.success}</span>
                  <span>failed={stat.failed}</span>
                </div>
              </div>
            ))}
          </div>
        </details>

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

function PhaseBadge({ phase }: { phase: string | null }) {
  return (
    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
      {phase ?? 'full'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === 'RUNNING'
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : status === 'SUCCESS'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : status === 'FAILED'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>
      {status}
    </span>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
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
    default: 'border-slate-200 bg-white/78',
    healthy: 'border-emerald-200 bg-emerald-50/86',
    warning: 'border-amber-200 bg-amber-50/86',
    danger: 'border-rose-200 bg-rose-50/86',
  }[tone];

  return (
    <div className={`rounded-[24px] border px-4 py-4 shadow-sm ${toneClasses}`}>
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

function shortId(value: string | null) {
  if (!value) {
    return '--';
  }

  return value.slice(0, 12);
}

function formatDuration(value: number | null) {
  if (value === null) {
    return '--';
  }

  if (value < 60) {
    return `${value}s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds}s`;
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
