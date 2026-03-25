import Link from 'next/link';
import { JobLogListResponse } from '@/lib/types/repository';
import { RepositoryRelatedJobItem } from '@/components/repositories/repository-related-job-item';

type RepositoryRelatedJobsProps = {
  repositoryId: string;
  jobs: JobLogListResponse | null;
  errorMessage?: string | null;
};

export function RepositoryRelatedJobs({
  repositoryId,
  jobs,
  errorMessage,
}: RepositoryRelatedJobsProps) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            关联任务
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            只有当你要继续排查时，再看这些关联任务。
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            这里先给最近的关键执行记录，帮助你判断是不是需要跳去任务页继续查。
          </p>
        </div>

        <Link
          href={`/jobs?repositoryId=${repositoryId}`}
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          去任务页继续查
        </Link>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-7 text-amber-800">
          <span className="font-semibold">关联任务暂不可用：</span>
          {errorMessage}
        </div>
      ) : null}

      {!errorMessage && !jobs?.items.length ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
          当前仓库还没有明确关联的任务记录。你可以先在详情页运行一次单仓库分析，或者去首页触发批量分析后再回来查看。
        </div>
      ) : null}

      {jobs?.items.length ? (
        <div className="mt-6 space-y-4">
          {jobs.items.slice(0, 5).map((job) => (
            <RepositoryRelatedJobItem key={job.id} job={job} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
