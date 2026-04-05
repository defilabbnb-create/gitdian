import Link from 'next/link';
import { Suspense } from 'react';
import { AppPageHero, AppPageShell } from '@/components/app/page-shell';
import { HomePageShellFallback } from '@/components/repositories/home-empty-state-fallback';
import { HomeToolTypeDashboard } from '@/components/repositories/home-tool-type-dashboard';
import { HomeSecondaryLinks } from '@/components/repositories/home-runtime-status';
import { RuntimeFailurePanel } from '@/components/runtime-failure-panel';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';
import { getRepositories } from '@/lib/api/repositories';
import {
  buildHomeFallbackQuery,
  buildHomeFastDefaultQuery,
  resolveHomeRepositoriesTimeoutMs,
  shouldFallbackHomeRepositories,
  shouldUseFastHomeDefaultQuery,
} from '@/lib/home-repositories-policy';
import { normalizeRepositoryListQuery } from '@/lib/types/repository';

export const dynamic = 'force-dynamic';

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function HomePage({ searchParams }: HomePageProps) {
  return (
    <AppPageShell tone="sky">
      <AppPageHero
        eyebrow="创业决策总览"
        title="先判断今天该看什么，再决定采集、深挖还是直接跳过。"
        description="首页不再堆所有列表，而是把机会池分布、冷门工具入口和下一步动作先摆清楚。你一打开就能知道当前应该往哪个池子继续筛。"
        tone="sky"
        chips={[
          '首页看方向，不看噪音',
          '冷门工具池长期运行',
          '任务与设置页负责执行面',
        ]}
        stats={[
          {
            label: '入口定位',
            value: '先定方向',
            helper: '先看机会池结构，再进具体列表。',
          },
          {
            label: '默认动作',
            value: '继续筛选',
            helper: '热门去项目列表，冷门去冷门工具池。',
          },
        ]}
        aside={<HomeHeroAside />}
      />

      <div className="space-y-6">
        <Suspense fallback={<HomePageShellFallback />}>
          <HomePageContent searchParams={searchParams} />
        </Suspense>
      </div>
    </AppPageShell>
  );
}

async function HomePageContent({ searchParams }: HomePageProps) {
  const rawSearchParams = ((await searchParams) ?? {}) as Record<
    string,
    string | string[] | undefined
  >;
  const resolvedSearchParams = normalizeRepositoryListQuery(rawSearchParams);

  let repositories = null;
  let errorMessage: string | null = null;
  const repositoriesResult = await loadHomeRepositories(
    resolvedSearchParams,
    rawSearchParams,
  )
    .then((value) => ({ status: 'fulfilled' as const, value }))
    .catch((reason) => ({ status: 'rejected' as const, reason }));

  if (repositoriesResult.status === 'fulfilled') {
    repositories = repositoriesResult.value.repositories;
  } else {
    errorMessage = getFriendlyRuntimeError(
      repositoriesResult.reason,
      '暂时无法从后端加载项目列表，请检查 API 服务。',
    );
  }

  return (
    <>
      {repositories ? <HomeToolTypeDashboard items={repositories.items} /> : null}

      <HomeContinueScreeningSection />

      {errorMessage ? (
        <RuntimeFailurePanel
          title="项目列表暂时加载失败"
          message={errorMessage}
          recoveryLabel="回到首页保留快捷入口"
          recoveryHref="/"
        />
      ) : null}
    </>
  );
}

async function loadHomeRepositories(
  query: ReturnType<typeof normalizeRepositoryListQuery>,
  rawSearchParams: Record<string, string | string[] | undefined>,
) {
  if (shouldUseFastHomeDefaultQuery(rawSearchParams)) {
    const fastQuery = buildHomeFastDefaultQuery(query);
    const repositories = await getRepositories(fastQuery, {
      timeoutMs: 8_000,
    });

    return {
      repositories,
    };
  }

  try {
    const repositories = await getRepositories(query, {
      timeoutMs: resolveHomeRepositoriesTimeoutMs({
        query,
        rawSearchParams,
      }),
    });

    return {
      repositories,
    };
  } catch (error) {
    if (!shouldFallbackHomeRepositories(query)) {
      throw error;
    }

    const fallbackQuery = buildHomeFallbackQuery(query);
    const repositories = await getRepositories(fallbackQuery, {
      timeoutMs: 6_000,
    });

    return {
      repositories,
    };
  }
}

function HomeContinueScreeningSection() {
  return (
    <section className="surface-card rounded-[28px] px-5 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            去哪里继续筛
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            首页先按工具类型看；需要完整筛选时，再去项目列表。
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            现在首页直接给你工具类型总览和导出表格，完整筛选、批量比较和更深的条件控制都留在项目列表页。
          </p>
        </div>

        <Link
          href="/repositories"
          className="inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          去项目列表继续筛
        </Link>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <HomeSecondaryLinks />
      </div>
    </section>
  );
}

function HomeHeroAside() {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        快速分流
      </p>
      <div className="mt-3 grid gap-2">
        <Link
          href="/repositories"
          className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-sky-300 hover:bg-sky-50"
        >
          去项目列表做完整筛选
        </Link>
        <Link
          href="/cold-tools"
          className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-emerald-300 hover:bg-emerald-50"
        >
          去冷门工具池看长尾增量
        </Link>
        <Link
          href="/jobs"
          className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-amber-300 hover:bg-amber-50"
        >
          去任务页盯执行状态
        </Link>
      </div>
    </div>
  );
}
