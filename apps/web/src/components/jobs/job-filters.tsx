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
      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            任务类型
          </span>
          <input
            name="jobName"
            defaultValue={query.jobName ?? ''}
            placeholder="analysis.run_batch"
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
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? '更新中...' : '应用筛选'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={isPending}
          className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          重置
        </button>
      </div>
    </form>
  );
}
