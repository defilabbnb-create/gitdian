'use client';

import Link from 'next/link';
import { FormEvent, useState, useTransition } from 'react';
import { enqueueColdToolCollector } from '@/lib/api/github';
import { ExportColdToolsButton } from './export-cold-tools-button';

export function ColdToolCollectorPanel() {
  const [queriesPerRun, setQueriesPerRun] = useState(12);
  const [perQueryLimit, setPerQueryLimit] = useState(6);
  const [lookbackDays, setLookbackDays] = useState(365);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      try {
        const task = await enqueueColdToolCollector({
          queriesPerRun,
          perQueryLimit,
          lookbackDays,
          forceRefresh,
        });
        setMessage(
          `冷门工具采集任务已创建，任务号 ${task.jobId}。命中的项目会自动进入深度分析。`,
        );
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : '创建冷门工具采集任务失败。',
        );
      }
    });
  }

  return (
    <details className="relative overflow-hidden rounded-[26px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.96)_0%,rgba(255,255,255,0.92)_58%,rgba(220,252,231,0.88)_100%)] p-4 shadow-[0_24px_70px_-42px_rgba(5,150,105,0.28)]">
      <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.18),transparent_72%)] lg:block" />
      <summary className="relative flex cursor-pointer list-none flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            冷门工具采集框
          </p>
          <p className="text-sm font-semibold text-slate-950">
            轮转关键词采集，命中后自动进深分析；参数默认收起。
          </p>
          <div className="flex flex-wrap gap-2 pt-1 text-xs font-semibold">
            <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-emerald-700">
              两阶段采集
            </span>
            <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-emerald-700">
              命中即进深分析
            </span>
            <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-emerald-700">
              展开采集参数
            </span>
          </div>
        </div>

        <div className="relative flex flex-wrap gap-2">
          <ExportColdToolsButton />
          <Link
            href="/jobs"
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-50"
          >
            去任务页看进度
          </Link>
        </div>
      </summary>

      <form onSubmit={handleSubmit} className="relative mt-5 grid gap-4 lg:grid-cols-4">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            每轮查询数
          </span>
          <input
            type="number"
            min={1}
            max={120}
            value={queriesPerRun}
            onChange={(event) => setQueriesPerRun(Number(event.target.value) || 12)}
            className="w-full rounded-2xl border border-emerald-200 bg-white/92 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            每个查询抓取数
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={perQueryLimit}
            onChange={(event) => setPerQueryLimit(Number(event.target.value) || 6)}
            className="w-full rounded-2xl border border-emerald-200 bg-white/92 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            回溯天数
          </span>
          <input
            type="number"
            min={7}
            max={3650}
            value={lookbackDays}
            onChange={(event) => setLookbackDays(Number(event.target.value) || 365)}
            className="w-full rounded-2xl border border-emerald-200 bg-white/92 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
          />
        </label>

        <div className="flex flex-col gap-3">
          <label className="inline-flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white/92 px-4 py-3 text-sm text-slate-700 shadow-sm">
            <input
              type="checkbox"
              checked={forceRefresh}
              onChange={(event) => setForceRefresh(event.target.checked)}
              className="size-4 rounded border-emerald-300"
            />
            强制重算已有冷门工具判断
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#047857_0%,#059669_58%,#10b981_100%)] px-5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? '正在创建任务...' : '开始采集冷门工具'}
          </button>
        </div>
      </form>

      {message ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </details>
  );
}
