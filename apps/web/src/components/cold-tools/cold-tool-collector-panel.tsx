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
    <section className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(180deg,_rgba(240,253,244,1)_0%,_rgba(236,253,245,0.88)_100%)] p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            冷门工具采集框
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            采全球真实活跃用户约 1万到100万 的互联网工具
          </h2>
          <p className="text-sm leading-7 text-slate-700">
            这条链路会按领域关键词和主流编程语言轮转搜索，仓库入库后先跑
            GPT-5.4 冷门工具判断，命中的项目会立刻进入深度分析。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <ExportColdToolsButton />
          <Link
            href="/jobs"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-50"
          >
            去任务页看进度
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4 lg:grid-cols-4">
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
            className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
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
            className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
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
            className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
          />
        </label>

        <div className="flex flex-col gap-3">
          <label className="inline-flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700">
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
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
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
    </section>
  );
}
