import { FavoritesExpandedPool } from '@/components/favorites/favorites-expanded-pool';
import { FavoritesFollowUpBoard } from '@/components/favorites/favorites-follow-up-board';
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
        {errorMessage ? (
          <section className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
              加载失败
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-rose-950">
              收藏列表暂时加载失败
            </h2>
            <p className="mt-3 text-sm leading-7 text-rose-800">{errorMessage}</p>
          </section>
        ) : favorites ? (
          <section className="space-y-6">
            <FavoritesFollowUpBoard items={favorites.items} />
            <FavoritesExpandedPool
              items={favorites.items}
              pagination={favorites.pagination}
              query={resolvedSearchParams}
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}
