import { FavoritesExpandedPool } from '@/components/favorites/favorites-expanded-pool';
import { FavoritesFollowUpBoard } from '@/components/favorites/favorites-follow-up-board';
import { RuntimeFailurePanel } from '@/components/runtime-failure-panel';
import { getFavorites } from '@/lib/api/favorites';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';
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
    favorites = await getFavorites(resolvedSearchParams, {
      timeoutMs: 6_000,
    });
  } catch (error) {
    errorMessage = getFriendlyRuntimeError(
      error,
      '暂时无法从后端加载收藏列表，请检查 API 服务。',
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        {errorMessage ? (
          <RuntimeFailurePanel
            title="收藏列表暂时加载失败"
            message={errorMessage}
            recoveryLabel="回到项目列表继续筛选"
            recoveryHref="/"
          />
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
