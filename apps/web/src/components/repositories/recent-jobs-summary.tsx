import Link from 'next/link';
import { JobLogListResponse } from '@/lib/types/repository';
import { RecentJobItem } from './recent-job-item';

type RecentJobsSummaryProps = {
  jobs: JobLogListResponse | null;
  errorMessage?: string | null;
};

export function RecentJobsSummary({
  jobs,
  errorMessage,
}: RecentJobsSummaryProps) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            最近任务
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            最近系统任务摘要
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            不用专门跳到任务页，也能先看到最近跑了什么、成功没、失败在哪。这里默认只展示最新几条摘要，足够帮助你判断系统当前是不是在正常工作。
          </p>
        </div>

        <Link
          href="/jobs"
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          查看全部任务
        </Link>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-7 text-amber-800">
          <span className="font-semibold">最近任务暂不可用：</span>
          {errorMessage}
        </div>
      ) : null}

      {!errorMessage && !jobs?.items.length ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
          还没有可展示的最近任务。你可以先运行 GitHub 采集、批量分析或单仓库分析，随后这里就会出现最近任务摘要。
        </div>
      ) : null}

      {jobs?.items.length ? (
        <div className="mt-6 space-y-4">
          {jobs.items.slice(0, 5).map((job) => (
            <RecentJobItem key={job.id} job={job} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
