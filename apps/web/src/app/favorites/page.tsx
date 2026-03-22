import Link from 'next/link';
import { ExportFavoritesButton } from '@/components/favorites/export-favorites-button';
import { FavoriteFilters } from '@/components/favorites/favorite-filters';
import { FavoriteList } from '@/components/favorites/favorite-list';
import { getFavorites } from '@/lib/api/favorites';
import { normalizeFavoriteListQuery } from '@/lib/types/repository';

export const dynamic = 'force-dynamic';

type FavoritesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FavoritesPage({ searchParams }: FavoritesPageProps) {
  const resolvedSearchParams = normalizeFavoriteListQuery(
    (await searchParams) ?? {},
  );

  let favorites = null;
  let errorMessage: string | null = null;

  try {
    favorites = await getFavorites(resolvedSearchParams);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : '暂时无法从后端加载收藏列表，请检查 API 服务。';
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_58%,_rgba(67,56,202,0.88)_100%)] px-8 py-10 text-white shadow-xl shadow-slate-900/10">
          <div className="grid gap-10 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Favorites Library
                </p>
                <Link
                  href="/"
                  className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  返回项目列表
                </Link>
              </div>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
                这里不是浏览区，而是你的高价值仓库库。
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                收藏页优先强调备注、优先级和收藏时间，帮助你把已经认可的项目沉淀成后续重点跟进池，而不是再次从海量仓库里筛一遍。
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <DashboardStat
                label="当前命中"
                value={favorites?.pagination.total ?? '--'}
                helper="符合当前筛选条件的收藏项"
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

        <FavoriteFilters
          key={JSON.stringify(resolvedSearchParams)}
          query={resolvedSearchParams}
        />

        {favorites ? (
          <div className="flex justify-end">
            <ExportFavoritesButton items={favorites.items} />
          </div>
        ) : null}

        {errorMessage ? (
          <section className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
              Load Failed
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-rose-950">
              收藏列表暂时加载失败
            </h2>
            <p className="mt-3 text-sm leading-7 text-rose-800">{errorMessage}</p>
          </section>
        ) : favorites ? (
          <FavoriteList
            items={favorites.items}
            pagination={favorites.pagination}
            query={resolvedSearchParams}
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
