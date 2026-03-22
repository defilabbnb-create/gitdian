import Link from 'next/link';
import { HomeQuickActions } from '@/components/repositories/home-quick-actions';
import { ExportRepositoriesButton } from '@/components/repositories/export-repositories-button';
import { RecentJobsSummary } from '@/components/repositories/recent-jobs-summary';
import { RepositoryFilters } from '@/components/repositories/repository-filters';
import { RepositoryList } from '@/components/repositories/repository-list';
import { RepositoryOverviewStats } from '@/components/repositories/repository-overview-stats';
import { RepositoryViewSwitcher } from '@/components/repositories/repository-view-switcher';
import { RepositoryWorkflowCards } from '@/components/repositories/repository-workflow-cards';
import { getJobLogs } from '@/lib/api/job-logs';
import { getSettings } from '@/lib/api/settings';
import {
  getRepositories,
  getRepositoryOverviewSummary,
} from '@/lib/api/repositories';
import { normalizeRepositoryListQuery } from '@/lib/types/repository';

export const dynamic = 'force-dynamic';

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = normalizeRepositoryListQuery(
    (await searchParams) ?? {},
  );

  let repositories = null;
  let errorMessage: string | null = null;
  let summary = null;
  let summaryErrorMessage: string | null = null;
  let settings = null;
  let recentJobs = null;
  let recentJobsErrorMessage: string | null = null;

  try {
    repositories = await getRepositories(resolvedSearchParams);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : '暂时无法从后端加载项目列表，请检查 API 服务。';
  }

  try {
    summary = await getRepositoryOverviewSummary();
  } catch (error) {
    summaryErrorMessage =
      error instanceof Error ? error.message : '暂时无法加载首页概览统计。';
  }

  try {
    settings = await getSettings();
  } catch {
    settings = null;
  }

  try {
    recentJobs = await getJobLogs({
      page: 1,
      pageSize: 5,
    });
  } catch (error) {
    recentJobsErrorMessage =
      error instanceof Error ? error.message : '暂时无法加载最近任务摘要。';
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_58%,_rgba(15,23,42,0.92)_100%)] px-8 py-10 text-white shadow-xl shadow-slate-900/10">
          <div className="grid gap-10 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                GitHub Opportunity Radar
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
                先把最值得创业的项目看起来，而不是把技术仓库堆出来。
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                这里优先展示创业判断、点子摘要、完整性和粗筛信号，帮助你快速判断一个
                GitHub 项目值不值得继续投入精力做二次实现、包装和商业化。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <QuickLink href="/favorites" label="查看收藏库" />
                <QuickLink href="/jobs" label="查看任务历史" />
                <QuickLink href="/settings" label="调整系统配置" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <DashboardStat
                label="当前命中"
                value={repositories?.pagination.total ?? '--'}
                helper="符合当前筛选条件的仓库数"
              />
              <DashboardStat
                label="排序依据"
                value={resolvedSearchParams.sortBy}
                helper={`当前按 ${resolvedSearchParams.order === 'desc' ? '降序' : '升序'} 排列`}
              />
              <DashboardStat
                label="每页展示"
                value={resolvedSearchParams.pageSize}
                helper={`第 ${resolvedSearchParams.page} 页`}
              />
            </div>
          </div>
        </section>

        <RepositoryOverviewStats
          summary={summary}
          errorMessage={summaryErrorMessage}
        />

        <RecentJobsSummary
          jobs={recentJobs}
          errorMessage={recentJobsErrorMessage}
        />

        <RepositoryWorkflowCards
          summary={summary}
          errorMessage={summaryErrorMessage}
        />

        {errorMessage ? (
          <section className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
              Load Failed
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-rose-950">
              项目列表暂时加载失败
            </h2>
            <p className="mt-3 text-sm leading-7 text-rose-800">{errorMessage}</p>
          </section>
        ) : repositories ? (
          <>
            <HomeQuickActions
              repositories={repositories.items}
              query={resolvedSearchParams}
              githubDefaults={settings?.github ?? null}
            />
            <RepositoryViewSwitcher query={resolvedSearchParams} />
            <RepositoryFilters
              key={JSON.stringify(resolvedSearchParams)}
              query={resolvedSearchParams}
            />
            <div className="flex justify-end">
              <ExportRepositoriesButton items={repositories.items} />
            </div>
            <RepositoryList
              items={repositories.items}
              pagination={repositories.pagination}
              query={resolvedSearchParams}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}

function QuickLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
    >
      {label}
    </Link>
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
