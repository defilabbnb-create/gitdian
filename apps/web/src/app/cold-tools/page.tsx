import { ColdToolCollectorPanel } from '@/components/cold-tools/cold-tool-collector-panel';
import { RepositoryFilters } from '@/components/repositories/repository-filters';
import { RepositoryList } from '@/components/repositories/repository-list';
import { RuntimeFailurePanel } from '@/components/runtime-failure-panel';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';
import { getRepositories } from '@/lib/api/repositories';
import {
  applyRepositoryViewQuery,
  buildRepositoryListSearchParams,
  normalizeRepositoryListQuery,
  RepositoryListQueryState,
} from '@/lib/types/repository';

export const dynamic = 'force-dynamic';

type ColdToolsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ColdToolsPage({
  searchParams,
}: ColdToolsPageProps) {
  const rawSearchParams = ((await searchParams) ?? {}) as Record<
    string,
    string | string[] | undefined
  >;
  const baseQuery = normalizeRepositoryListQuery(rawSearchParams);
  const query = applyRepositoryViewQuery(
    {
      ...baseQuery,
      pageSize: baseQuery.pageSize || 24,
    },
    'coldTools',
  );

  let repositories = null;
  let completedTotal = 0;
  let pendingTotal = 0;
  let errorMessage: string | null = null;

  try {
    const [allRepositories, completedRepositories, pendingRepositories] =
      await Promise.all([
        getRepositories(query, {
          timeoutMs: 20_000,
        }),
        getRepositories(
          {
            ...query,
            page: 1,
            pageSize: 1,
            deepAnalysisState: 'completed',
          },
          {
            timeoutMs: 20_000,
          },
        ),
        getRepositories(
          {
            ...query,
            page: 1,
            pageSize: 1,
            deepAnalysisState: 'pending',
          },
          {
            timeoutMs: 20_000,
          },
        ),
      ]);
    repositories = allRepositories;
    completedTotal = completedRepositories.pagination.total;
    pendingTotal = pendingRepositories.pagination.total;
  } catch (error) {
    errorMessage = getFriendlyRuntimeError(
      error,
      '冷门工具池暂时无法加载，请检查后端 API 是否正常运行。',
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_24%),linear-gradient(180deg,_#f8fafc_0%,_#ecfdf5_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <ColdToolCollectorPanel />

        {repositories ? (
          <section className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              label="冷门工具池规模"
              value={`${repositories.pagination.total.toLocaleString()} 个`}
              helper="只显示被判断为真实活跃用户约 1万到100万的工具。"
            />
            <SummaryCard
              label="默认排序"
              value="按 GitHub 创建时间"
              helper="先看最近进入池子的工具，再继续筛选真实用户场景。"
            />
            <SummaryCard
              label="后续动作"
              value="命中即深分析"
              helper="入池命中的项目已经自动进入完整分析链，不需要再手动补触发。"
            />
            <SummaryCard
              label="深度分析已完成"
              value={`${completedTotal.toLocaleString()} 个`}
              helper="完整度、Idea Fit、Idea Extract 和 Insight 四层都齐了。"
              href={buildColdToolSectionHref(query, 'completed')}
            />
            <SummaryCard
              label="深度分析未完成"
              value={`${pendingTotal.toLocaleString()} 个`}
              helper="还在补完整分析链，适合继续盯任务和导出未完成清单。"
              href={buildColdToolSectionHref(query, 'pending')}
            />
          </section>
        ) : null}

        <RepositoryFilters query={query} />

        {errorMessage ? (
          <RuntimeFailurePanel
            title="冷门工具池暂时加载失败"
            message={errorMessage}
            recoveryLabel="回到冷门工具池首页"
            recoveryHref="/cold-tools"
          />
        ) : repositories ? (
          <RepositoryList
            items={repositories.items}
            pagination={repositories.pagination}
            query={query}
            basePath="/cold-tools"
          />
        ) : null}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  href,
}: {
  label: string;
  value: string;
  helper: string;
  href?: string;
}) {
  const content = (
    <section className="rounded-[24px] border border-emerald-200 bg-white/90 p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
        {label}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </section>
  );

  if (!href) {
    return content;
  }

  return <a href={href}>{content}</a>;
}

function buildColdToolSectionHref(
  query: RepositoryListQueryState,
  deepAnalysisState: 'completed' | 'pending',
) {
  const search = buildRepositoryListSearchParams({
    ...query,
    page: 1,
    deepAnalysisState,
  });

  return search ? `/cold-tools?${search}` : '/cold-tools';
}
