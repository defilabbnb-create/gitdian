import Link from 'next/link';
import { AppPageHero, AppPageShell } from '@/components/app/page-shell';
import { ColdToolCollectorPanel } from '@/components/cold-tools/cold-tool-collector-panel';
import { ColdRuntimePanel } from '@/components/cold-tools/cold-runtime-panel';
import { RepositoryFilters } from '@/components/repositories/repository-filters';
import { RepositoryList } from '@/components/repositories/repository-list';
import { SettingsBuildInfo } from '@/components/settings/settings-build-info';
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
  let skippedTotal = 0;
  let queuedTotal = 0;
  let errorMessage: string | null = null;

  try {
    const [
      allRepositories,
      completedRepositories,
      pendingRepositories,
      skippedRepositories,
      queuedRepositories,
    ] =
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
        getRepositories(
          {
            ...query,
            page: 1,
            pageSize: 1,
            deepAnalysisState: 'skipped',
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
            deepAnalysisState: 'queued',
          },
          {
            timeoutMs: 20_000,
          },
        ),
      ]);
    repositories = allRepositories;
    completedTotal = completedRepositories.pagination.total;
    pendingTotal = pendingRepositories.pagination.total;
    skippedTotal = skippedRepositories.pagination.total;
    queuedTotal = queuedRepositories.pagination.total;
  } catch (error) {
    errorMessage = getFriendlyRuntimeError(
      error,
      '冷门工具池暂时无法加载，请检查后端 API 是否正常运行。',
    );
  }

  return (
    <AppPageShell tone="emerald">
      <AppPageHero
        eyebrow="冷门工具池"
        title="长尾工具不是补充页，而是专门的新增量雷达。"
        description="这里同时看采集、深分析、完成度和可导出结果。页面优先回答两个问题：冷门链路有没有在跑，以及这一批新增量现在推进到了哪里。"
        tone="emerald"
        chips={[
          '采集与深分析分池运行',
          '已完成 / 未完成直接分类',
          '导出、排队、跳过同页可见',
        ]}
        stats={[
          {
            label: '工具池规模',
            value: repositories
              ? `${repositories.pagination.total.toLocaleString()}`
              : '--',
            helper: '当前冷门视图下的总量。',
          },
          {
            label: '深分析完成',
            value: repositories ? `${completedTotal.toLocaleString()}` : '--',
            helper: '四层结论都齐的冷门条目。',
          },
        ]}
        aside={<ColdToolsHeroAside />}
      />

      <div className="space-y-6">
        <SettingsBuildInfo variant="compact" />
        <ColdRuntimePanel />
        <ColdToolCollectorPanel />

        {repositories ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="冷门工具池规模"
              value={`${repositories.pagination.total.toLocaleString()} 个`}
              helper="只显示被判断为真实活跃用户约 1000 到 100 万的工具。"
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
              label="深度分析待继续"
              value={`${pendingTotal.toLocaleString()} 个`}
              helper="还没完成、也不在排队、也没被明确跳过，通常是未启动或待补跑的条目。"
              href={buildColdToolSectionHref(query, 'pending')}
            />
            <SummaryCard
              label="深度分析已跳过"
              value={`${skippedTotal.toLocaleString()} 个`}
              helper="不是失败，而是 snapshot 明确不值得继续，或当前信号强度偏弱。"
              href={buildColdToolSectionHref(query, 'skipped')}
            />
            <SummaryCard
              label="深度分析排队中"
              value={`${queuedTotal.toLocaleString()} 个`}
              helper="已经进入冷门深分析队列，系统会继续自动跑，不需要手工补触发。"
              href={buildColdToolSectionHref(query, 'queued')}
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
    </AppPageShell>
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
    <section className="surface-card rounded-[26px] p-5 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-xl">
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
  deepAnalysisState: 'completed' | 'pending' | 'skipped' | 'queued',
) {
  const search = buildRepositoryListSearchParams({
    ...query,
    page: 1,
    deepAnalysisState,
  });

  return search ? `/cold-tools?${search}` : '/cold-tools';
}

function ColdToolsHeroAside() {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        快速动作
      </p>
      <div className="mt-3 grid gap-2">
        <Link
          href="/cold-tools?deepAnalysisState=completed"
          className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
        >
          直接看已完成深分析
        </Link>
        <Link
          href="/cold-tools?deepAnalysisState=pending"
          className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
        >
          直接看未完成队列
        </Link>
      </div>
    </div>
  );
}
