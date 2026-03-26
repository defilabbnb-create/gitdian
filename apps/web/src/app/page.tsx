import { Suspense } from 'react';
import {
  HomeFeaturedRepositories,
  HomeNewOpportunitiesStrip,
} from '@/components/repositories/home-featured-repositories';
import { HomeActiveProjectsStrip } from '@/components/repositories/home-active-projects-strip';
import { HomePageShellFallback } from '@/components/repositories/home-empty-state-fallback';
import { HomeOpportunityPool } from '@/components/repositories/home-opportunity-pool';
import { HomeSecondaryLinks } from '@/components/repositories/home-runtime-status';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';
import { getRepositories } from '@/lib/api/repositories';
import { normalizeRepositoryListQuery } from '@/lib/types/repository';

export const dynamic = 'force-dynamic';

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function HomePage({ searchParams }: HomePageProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <Suspense fallback={<HomePageShellFallback />}>
          <HomePageContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
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
  let repositoriesNotice: string | null = null;
  let repositoriesQuery = resolvedSearchParams;
  const isDefaultLandingState = shouldUseFastHomeDefaultQuery(rawSearchParams);

  const repositoriesResult = await loadHomeRepositories(
    resolvedSearchParams,
    rawSearchParams,
  )
    .then((value) => ({ status: 'fulfilled' as const, value }))
    .catch((reason) => ({ status: 'rejected' as const, reason }));

  if (repositoriesResult.status === 'fulfilled') {
    repositories = repositoriesResult.value.repositories;
    repositoriesQuery = repositoriesResult.value.query;
    repositoriesNotice = repositoriesResult.value.notice;
  } else {
    errorMessage = getFriendlyRuntimeError(
      repositoriesResult.reason,
      '暂时无法从后端加载项目列表，请检查 API 服务。',
    );
  }

  return (
    <>
      {repositories ? (
        <section id="focus-board">
          <HomeFeaturedRepositories items={repositories.items} />
        </section>
      ) : null}

      <HomeActiveProjectsStrip />

      {repositories ? <HomeNewOpportunitiesStrip items={repositories.items} /> : null}

      <HomeSecondaryLinks />

      {errorMessage ? (
        <section className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
            加载失败
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-rose-950">
            项目列表暂时加载失败
          </h2>
          <p className="mt-3 text-sm leading-7 text-rose-800">{errorMessage}</p>
        </section>
      ) : repositories ? (
        <HomeOpportunityPool
          query={repositoriesQuery}
          notice={repositoriesNotice}
          collapsedByDefault={isDefaultLandingState}
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
      timeoutMs: 4_000,
    });

    return {
      repositories,
      query: fastQuery,
      notice: null,
    };
  }

  try {
    const repositories = await getRepositories(query, {
      timeoutMs: 8_000,
    });

    return {
      repositories,
      query,
      notice: null,
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
      query: fallbackQuery,
      notice:
        '挣钱优先排序当前响应较慢，首页已自动切到“最近可用项目”以保证先打开和先可读。你仍然可以稍后再切回挣钱优先视图继续看。',
    };
  }
}

function shouldFallbackHomeRepositories(
  query: ReturnType<typeof normalizeRepositoryListQuery>,
) {
  const hasExplicitFilter = Boolean(
    query.keyword ||
      query.language ||
      query.opportunityLevel ||
      query.isFavorited !== undefined ||
      query.roughPass !== undefined ||
      query.hasCompletenessAnalysis !== undefined ||
      query.hasIdeaFitAnalysis !== undefined ||
      query.hasExtractedIdea !== undefined ||
      query.hasPromisingIdeaSnapshot !== undefined ||
      query.hasGoodInsight !== undefined ||
      query.hasManualInsight !== undefined ||
      query.finalVerdict ||
      query.finalCategory ||
      query.moneyPriority ||
      query.decisionSource ||
      query.hasConflict !== undefined ||
      query.needsRecheck !== undefined ||
      query.hasTrainingHints !== undefined ||
      query.recommendedAction ||
      query.createdAfterDays !== undefined ||
      query.minStars !== undefined ||
      query.minFinalScore !== undefined ||
      query.page > 1
  );

  if (hasExplicitFilter) {
    return false;
  }

  return query.sortBy === 'moneyPriority' || query.sortBy === 'insightPriority';
}

function buildHomeFallbackQuery(
  query: ReturnType<typeof normalizeRepositoryListQuery>,
) {
  return {
    ...query,
    view: 'all' as const,
    sortBy: 'latest' as const,
    order: 'desc' as const,
  };
}

function shouldUseFastHomeDefaultQuery(
  rawSearchParams: Record<string, string | string[] | undefined>,
) {
  const entries = Object.entries(rawSearchParams).filter(([, value]) => {
    if (Array.isArray(value)) {
      return value.some((item) => String(item ?? '').trim().length > 0);
    }

    return String(value ?? '').trim().length > 0;
  });

  return entries.length === 0;
}

function buildHomeFastDefaultQuery(
  query: ReturnType<typeof normalizeRepositoryListQuery>,
) {
  return {
    ...query,
    view: 'moneyFirst' as const,
    sortBy: 'moneyPriority' as const,
    order: 'desc' as const,
    pageSize: Math.max(Math.min(query.pageSize, 24), 24),
  };
}
