import Link from 'next/link';
import {
  JobLogQueryState,
  RepositoryDetail,
  buildJobLogListSearchParams,
} from '@/lib/types/repository';

type JobContextBannerProps = {
  query: JobLogQueryState;
  repositoryId: string;
  repository?: Pick<RepositoryDetail, 'id' | 'name' | 'fullName'> | null;
  repositoryError?: string | null;
};

export function JobContextBanner({
  query,
  repositoryId,
  repository,
  repositoryError,
}: JobContextBannerProps) {
  const allJobsHref = buildAllJobsHref(query);

  return (
    <section className="rounded-[32px] border border-sky-200 bg-[linear-gradient(135deg,_rgba(14,116,144,0.08)_0%,_rgba(255,255,255,0.98)_60%,_rgba(248,250,252,1)_100%)] p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Repository Context
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            正在查看某个仓库的关联任务
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            当前列表已经按仓库维度收窄，方便你直接判断这一个项目最近跑过哪些分析、是否失败、是否需要重新触发。
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-semibold text-sky-700">
              Repository ID · {repositoryId}
            </span>
            {repository ? (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700">
                {repository.name} · {repository.fullName}
              </span>
            ) : null}
          </div>

          {repositoryError ? (
            <p className="mt-4 text-sm leading-7 text-amber-700">
              仓库基础信息暂时没有加载出来，当前仍然会继续按 repositoryId 展示任务记录。
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={allJobsHref}
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            查看全部任务
          </Link>
          <Link
            href={`/repositories/${repositoryId}`}
            className="inline-flex items-center rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            返回仓库详情
          </Link>
        </div>
      </div>
    </section>
  );
}

function buildAllJobsHref(query: JobLogQueryState) {
  const search = buildJobLogListSearchParams({
    ...query,
    repositoryId: undefined,
    focusJobId: undefined,
    page: 1,
  });

  return search ? `/jobs?${search}` : '/jobs';
}
