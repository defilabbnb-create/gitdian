'use client';

import { FormEvent, startTransition, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { JobLogQueryState, buildJobLogListSearchParams } from '@/lib/types/repository';

type JobFiltersProps = {
  query: JobLogQueryState;
};

export function JobFilters({ query }: JobFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending] = useTransition();
  const activeFilters = buildActiveFilters(query);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const search = buildJobLogListSearchParams({
      page: 1,
      pageSize: Number(formData.get('pageSize') || query.pageSize || 20),
      jobName: String(formData.get('jobName') || '').trim() || undefined,
      repositoryId: query.repositoryId,
      focusJobId: query.focusJobId,
      jobStatus:
        (String(formData.get('jobStatus') || '') || undefined) as
          | JobLogQueryState['jobStatus']
          | undefined,
    });

    startTransition(() => {
      router.push(search ? `${pathname}?${search}` : pathname);
    });
  }

  function handleReset() {
    startTransition(() => {
      const search = buildJobLogListSearchParams({
        repositoryId: query.repositoryId,
        focusJobId: query.focusJobId,
      });

      router.push(search ? `${pathname}?${search}` : pathname);
    });
  }

  return (
    <form className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              任务筛选
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              先缩小到你现在真的要排查的那一批，下面的完整任务流才不会变成噪音。
            </p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            当前激活 {activeFilters.length} 项
          </p>
        </div>

        {activeFilters.length ? (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <span
                key={filter}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {filter}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            当前没有额外筛选，展示的是默认任务流视图。
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            任务类型
          </span>
          <input
            name="jobName"
            defaultValue={query.jobName ?? ''}
            placeholder="例如 analysis.run_single"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            任务状态
          </span>
          <select
            name="jobStatus"
            defaultValue={query.jobStatus ?? ''}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="">全部</option>
            <option value="RUNNING">RUNNING</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="FAILED">FAILED</option>
            <option value="PENDING">PENDING</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            每页数量
          </span>
          <select
            name="pageSize"
            defaultValue={String(query.pageSize)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? '更新中...' : '应用筛选'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={isPending}
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          重置
        </button>
      </div>
    </form>
  );
}

function buildActiveFilters(query: JobLogQueryState) {
  const filters: string[] = [];

  if (query.jobName) {
    filters.push(`任务类型 · ${query.jobName}`);
  }

  if (query.jobStatus) {
    filters.push(`任务状态 · ${query.jobStatus}`);
  }

  if (query.pageSize !== 20) {
    filters.push(`每页数量 · ${query.pageSize}`);
  }

  if (query.repositoryId) {
    filters.push('仓库上下文已锁定');
  }

  if (query.focusJobId) {
    filters.push('聚焦单个任务');
  }

  return filters;
}
