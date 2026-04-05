import Link from 'next/link';
import { getLatestRadarDailySummary, getRadarRuntimeStatus } from '@/lib/api/github';

export async function HomeRuntimeStatus() {
  const [summaryResult, statusResult] = await Promise.allSettled([
    getLatestRadarDailySummary({ timeoutMs: 1_500 }),
    getRadarRuntimeStatus({ timeoutMs: 1_500 }),
  ]);

  const summary =
    summaryResult.status === 'fulfilled' ? summaryResult.value : null;
  const status = statusResult.status === 'fulfilled' ? statusResult.value : null;
  const loadLevel = getLoadLevel(status);

  return (
    <section className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.92)_60%,rgba(239,246,255,0.9)_100%)] p-5 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.25)] backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            今日系统状态
          </p>
          <h2 className="font-display mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            只看会影响你今天判断节奏的 4 个信号。
          </h2>
        </div>
        <LoadBadge level={loadLevel.label} />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          label="当前负载"
          value={loadLevel.label}
          helper={loadLevel.helper}
        />
        <StatusCard
          label="待跑 Snapshot"
          value={formatNumber(status?.snapshotQueueSize)}
          helper="当前待处理的主链路仓库数"
        />
        <StatusCard
          label="待跑 Deep"
          value={formatNumber(status?.deepQueueSize)}
          helper="等待深读的候选项目数"
        />
        <StatusCard
          label="今日已分析"
          value={formatNumber(summary?.snapshotGenerated)}
          helper="今天已经完成 snapshot 的项目数"
        />
      </div>
    </section>
  );
}

export function HomeRuntimeStatusFallback() {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white/90 p-5 shadow-sm">
      <div className="h-4 w-28 rounded-full bg-slate-200" />
      <div className="mt-4 h-8 w-72 rounded-full bg-slate-200" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"
          >
            <div className="h-3 w-20 rounded-full bg-slate-200" />
            <div className="mt-4 h-7 w-16 rounded-full bg-slate-200" />
            <div className="mt-3 h-3 w-28 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomeSecondaryLinks() {
  return (
    <nav
      aria-label="其他入口"
      className="px-1 py-1"
    >
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-slate-500">
        <span className="text-slate-400">其他入口</span>
        <EntryLink href="/repositories" label="项目列表" />
        <Separator />
        <EntryLink href="/favorites" label="收藏" />
        <Separator />
        <EntryLink href="/jobs" label="任务" />
        <Separator />
        <EntryLink href="/settings" label="设置" />
      </div>
    </nav>
  );
}

function StatusCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/78 px-4 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

function LoadBadge({ level }: { level: string }) {
  const classes =
    level === 'EXTREME'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : level === 'HIGH'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <div className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${classes}`}>
      当前负载 {level}
    </div>
  );
}

function EntryLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-slate-600 transition hover:text-slate-900"
    >
      {label}
    </Link>
  );
}

function Separator() {
  return <span className="text-slate-300">|</span>;
}

function formatNumber(value?: number | null) {
  if (typeof value !== 'number') {
    return '--';
  }

  return value.toLocaleString();
}

function getLoadLevel(
  status: Awaited<ReturnType<typeof getRadarRuntimeStatus>> | null,
) {
  const snapshotQueueSize = status?.snapshotQueueSize ?? 0;
  const deepQueueSize = status?.deepQueueSize ?? 0;
  const ideaExtractMaxInflight =
    status?.maintenance?.deepRuntimeStats?.ideaExtractMaxInflight ?? null;

  if (snapshotQueueSize >= 1500 || ideaExtractMaxInflight === 1) {
    return {
      label: 'EXTREME',
      helper: '现在先只看最强机会，次级结果会明显收缩。',
    };
  }

  if (snapshotQueueSize >= 800 || deepQueueSize >= 8 || ideaExtractMaxInflight === 2) {
    return {
      label: 'HIGH',
      helper: '现在优先盯高价值结果，次级结果会保守一些。',
    };
  }

  return {
    label: 'NORMAL',
    helper: '当前可以先按挣钱优先列表做判断，不必担心系统拥塞。',
  };
}
