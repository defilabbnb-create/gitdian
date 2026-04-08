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
  const summaryQuery: RepositoryListQueryState = {
    ...query,
    page: 1,
    pageSize: 1,
    deepAnalysisState: undefined,
  };

  let repositories = null;
  let summaryRepositories = null;
  let completedTotal = 0;
  let pendingTotal = 0;
  let skippedTotal = 0;
  let queuedTotal = 0;
  let errorMessage: string | null = null;

  try {
    const [
      allRepositories,
      allSummaryRepositories,
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
            ...summaryQuery,
          },
          {
            timeoutMs: 20_000,
          },
        ),
        getRepositories(
          {
            ...summaryQuery,
            deepAnalysisState: 'completed',
          },
          {
            timeoutMs: 20_000,
          },
        ),
        getRepositories(
          {
            ...summaryQuery,
            deepAnalysisState: 'pending',
          },
          {
            timeoutMs: 20_000,
          },
        ),
        getRepositories(
          {
            ...summaryQuery,
            deepAnalysisState: 'skipped',
          },
          {
            timeoutMs: 20_000,
          },
        ),
        getRepositories(
          {
            ...summaryQuery,
            deepAnalysisState: 'queued',
          },
          {
            timeoutMs: 20_000,
          },
        ),
      ]);
    repositories = allRepositories;
    summaryRepositories = allSummaryRepositories;
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

  const totalRepositories = summaryRepositories?.pagination.total ?? 0;
  const completedRate =
    totalRepositories > 0
      ? Math.round((completedTotal / totalRepositories) * 100)
      : 0;
  const actionableTotal = pendingTotal + queuedTotal;

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
              ? `${totalRepositories.toLocaleString()}`
              : '--',
            helper: '当前冷门池整体总量，不受“已完成/排队中/已跳过”卡片筛选影响。',
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
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="冷门工具池规模"
                value={`${totalRepositories.toLocaleString()} 个`}
                helper="当前只保留真实活跃用户约 1000 到 100 万的工具。"
                tone="emerald"
              />
              <SummaryCard
                label="深分析完成率"
                value={`${completedRate}%`}
                helper={`已完成 ${completedTotal.toLocaleString()} 个，表示四层结果都已经齐了。`}
                href={buildColdToolSectionHref(query, 'completed')}
                tone="slate"
              />
              <SummaryCard
                label="待处理总量"
                value={`${actionableTotal.toLocaleString()} 个`}
                helper="等于待继续 + 排队中，更适合盯下一步要推进的条目。"
                tone="amber"
              />
              <SummaryCard
                label="当前自动推进"
                value={
                  queuedTotal > 0 ? `${queuedTotal.toLocaleString()} 个排队中` : '队列空闲'
                }
                helper="这里只看已经进入冷门深分析队列的条目，不包含已跳过。"
                href={buildColdToolSectionHref(query, 'queued')}
                tone={queuedTotal > 0 ? 'amber' : 'emerald'}
              />
            </div>

            <StatusBreakdownCard
              items={[
                {
                  label: '深度分析已完成',
                  value: `${completedTotal.toLocaleString()} 个`,
                  helper: '完整度、Idea Fit、Idea Extract、Insight 四层都齐了。',
                  href: buildColdToolSectionHref(query, 'completed'),
                  tone: 'emerald',
                },
                {
                  label: '深度分析待继续',
                  value: `${pendingTotal.toLocaleString()} 个`,
                  helper: '未完成、未排队、未跳过。通常是未启动或待补跑。',
                  href: buildColdToolSectionHref(query, 'pending'),
                  tone: 'amber',
                },
                {
                  label: '深度分析排队中',
                  value: `${queuedTotal.toLocaleString()} 个`,
                  helper: '已经进队列，系统会自动继续跑。',
                  href: buildColdToolSectionHref(query, 'queued'),
                  tone: 'sky',
                },
                {
                  label: '深度分析已跳过',
                  value: `${skippedTotal.toLocaleString()} 个`,
                  helper: '不是失败，而是 snapshot 或强度判断不值得继续深挖。',
                  href: buildColdToolSectionHref(query, 'skipped'),
                  tone: 'slate',
                },
              ]}
            />

            <InfoStripCard
              title="页面怎么读"
              items={[
                '默认按 GitHub 创建时间排序，先看新进池的工具。',
                '命中冷门池后会自动进入深分析链，不需要手动补触发。',
                '待继续、排队中、已跳过、已完成这四类现在按互斥口径展示。',
              ]}
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
  tone = 'emerald',
}: {
  label: string;
  value: string;
  helper: string;
  href?: string;
  tone?: 'emerald' | 'amber' | 'slate' | 'sky';
}) {
  const toneStyles = {
    emerald: {
      label: 'text-emerald-700',
      border: 'hover:border-emerald-300',
    },
    amber: {
      label: 'text-amber-700',
      border: 'hover:border-amber-300',
    },
    slate: {
      label: 'text-slate-700',
      border: 'hover:border-slate-300',
    },
    sky: {
      label: 'text-sky-700',
      border: 'hover:border-sky-300',
    },
  } as const;
  const styles = toneStyles[tone];
  const content = (
    <section
      className={`surface-card rounded-[26px] p-5 transition hover:-translate-y-0.5 hover:shadow-xl ${styles.border}`}
    >
      <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${styles.label}`}>
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

function StatusBreakdownCard({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    helper: string;
    href: string;
    tone: 'emerald' | 'amber' | 'slate' | 'sky';
  }>;
}) {
  return (
    <section className="surface-card rounded-[30px] p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            分析状态分布
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            深分析现在推进到哪里
          </h2>
        </div>
        <p className="text-sm text-slate-500">
          四类口径互斥，点击任一卡片都会直接带筛选进入列表。
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <SummaryCard
            key={item.label}
            label={item.label}
            value={item.value}
            helper={item.helper}
            href={item.href}
            tone={item.tone}
          />
        ))}
      </div>
    </section>
  );
}

function InfoStripCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <section className="surface-card rounded-[30px] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700"
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
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
          直接看待继续条目
        </Link>
      </div>
    </div>
  );
}
