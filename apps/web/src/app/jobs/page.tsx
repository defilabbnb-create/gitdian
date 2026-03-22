import Link from 'next/link';
import { JobContextBanner } from '@/components/jobs/job-context-banner';
import { JobFilters } from '@/components/jobs/job-filters';
import { JobList } from '@/components/jobs/job-list';
import { getJobLogs } from '@/lib/api/job-logs';
import { getRepositoryById } from '@/lib/api/repositories';
import { normalizeJobLogListQuery } from '@/lib/types/repository';

export const dynamic = 'force-dynamic';

type JobsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const resolvedSearchParams = normalizeJobLogListQuery((await searchParams) ?? {});
  const isRepositoryContext = Boolean(resolvedSearchParams.repositoryId);

  let jobs = null;
  let errorMessage: string | null = null;
  let repositoryContext = null;
  let repositoryContextErrorMessage: string | null = null;

  if (resolvedSearchParams.repositoryId) {
    try {
      const repository = await getRepositoryById(resolvedSearchParams.repositoryId);
      repositoryContext = {
        id: repository.id,
        name: repository.name,
        fullName: repository.fullName,
      };
    } catch (error) {
      repositoryContextErrorMessage =
        error instanceof Error ? error.message : '仓库上下文暂时无法加载。';
    }
  }

  try {
    jobs = await getJobLogs(resolvedSearchParams);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : '暂时无法从后端加载任务历史，请检查 API 服务。';
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_58%,_rgba(14,116,144,0.88)_100%)] px-8 py-10 text-white shadow-xl shadow-slate-900/10">
          <div className="grid gap-10 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Job History
                </p>
                <Link
                  href="/"
                  className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  返回首页
                </Link>
                <Link
                  href={
                    (() => {
                      const params = new URLSearchParams();
                      if (resolvedSearchParams.jobName) {
                        params.set('jobName', resolvedSearchParams.jobName);
                      }
                      if (resolvedSearchParams.jobStatus) {
                        params.set('jobStatus', resolvedSearchParams.jobStatus);
                      }
                      if (resolvedSearchParams.pageSize !== 20) {
                        params.set(
                          'pageSize',
                          String(resolvedSearchParams.pageSize),
                        );
                      }
                      if (resolvedSearchParams.repositoryId) {
                        params.set('repositoryId', resolvedSearchParams.repositoryId);
                      }

                      return params.toString() ? `/jobs?${params}` : '/jobs';
                    })()
                  }
                  className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  刷新任务状态
                </Link>
              </div>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
                {isRepositoryContext
                  ? '只看这一个仓库最近跑过哪些任务，定位问题会快很多。'
                  : '最近跑了哪些任务、成功没、失败在哪，一眼看清。'}
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                {isRepositoryContext
                  ? '当前已经进入仓库上下文模式。你看到的是和这个仓库明确关联的任务记录，可以继续叠加 jobName、状态和分页筛选。'
                  : '这里展示 GitHub 采集、批量粗筛、单仓库分析和批量分析编排的执行日志。先用卡片列表把关键信息看清楚，再通过展开区查看 payload 和 result JSON 细节。'}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <DashboardStat
                label="当前命中"
                value={jobs?.pagination.total ?? '--'}
                helper={isRepositoryContext ? '当前仓库命中的任务数' : '符合当前筛选条件的任务数'}
              />
              <DashboardStat
                label={isRepositoryContext ? '仓库上下文' : '状态筛选'}
                value={
                  isRepositoryContext
                    ? 'REPOSITORY'
                    : resolvedSearchParams.jobStatus ?? 'ALL'
                }
                helper={
                  isRepositoryContext
                    ? '当前按 repositoryId 过滤'
                    : '支持 RUNNING / SUCCESS / FAILED'
                }
              />
              <DashboardStat
                label="每页展示"
                value={resolvedSearchParams.pageSize}
                helper={`第 ${resolvedSearchParams.page} 页`}
              />
            </div>
          </div>
        </section>

        <JobFilters
          key={JSON.stringify(resolvedSearchParams)}
          query={resolvedSearchParams}
        />

        {resolvedSearchParams.repositoryId ? (
          <JobContextBanner
            query={resolvedSearchParams}
            repositoryId={resolvedSearchParams.repositoryId}
            repository={repositoryContext}
            repositoryError={repositoryContextErrorMessage}
          />
        ) : null}

        {errorMessage ? (
          <section className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
              Load Failed
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-rose-950">
              任务历史暂时加载失败
            </h2>
            <p className="mt-3 text-sm leading-7 text-rose-800">{errorMessage}</p>
          </section>
        ) : jobs ? (
          <JobList
            items={jobs.items}
            pagination={jobs.pagination}
            query={resolvedSearchParams}
            currentRepositoryId={resolvedSearchParams.repositoryId}
            focusedJobId={resolvedSearchParams.focusJobId}
          />
        ) : null}
      </div>
    </main>
  );
}

function DashboardStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 px-5 py-5 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-300">{helper}</p>
    </div>
  );
}
