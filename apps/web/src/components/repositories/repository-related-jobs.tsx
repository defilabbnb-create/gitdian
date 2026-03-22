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
            Related Jobs
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            关联任务记录
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            这里优先展示和当前仓库明确关联的任务记录，先把最近的分析执行结果看清楚，再决定要不要跳去任务页看全局历史。
          </p>
        </div>

        <Link
          href={`/jobs?repositoryId=${repositoryId}`}
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          查看全部任务
        </Link>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm leading-7 text-rose-700">
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
