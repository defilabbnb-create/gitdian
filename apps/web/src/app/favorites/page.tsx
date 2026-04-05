import { AppPageHero, AppPageShell } from '@/components/app/page-shell';
import { FavoritesExpandedPool } from '@/components/favorites/favorites-expanded-pool';
import { FavoritesFollowUpBoard } from '@/components/favorites/favorites-follow-up-board';
import { RuntimeFailurePanel } from '@/components/runtime-failure-panel';
import { getFavorites } from '@/lib/api/favorites';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';
import {
  buildFavoriteListSearchParams,
  normalizeFavoriteListQuery,
} from '@/lib/types/repository';

export const dynamic = 'force-dynamic';

type FavoritesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FavoritesPage({ searchParams }: FavoritesPageProps) {
  const resolvedSearchParams = normalizeFavoriteListQuery(
    (await searchParams) ?? {},
  );
  const favoritesReturnHref = buildFavoritesReturnHref(resolvedSearchParams);

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
    <AppPageShell tone="rose">
      <AppPageHero
        eyebrow="收藏池"
        title="收藏页不是仓库墓地，而是你准备继续推进的候选面板。"
        description="这里优先看跟进状态、备注、下一步动作和回流入口。页面应该让你迅速区分：哪些要继续推进，哪些只是暂存观察。"
        tone="rose"
        chips={[
          '跟进优先于收藏本身',
          '备注与回流入口同页',
          '把短期推进项和观察项分开看',
        ]}
        stats={[
          {
            label: '当前模式',
            value: resolvedSearchParams.priority
              ? `优先级 ${resolvedSearchParams.priority}`
              : '全部收藏',
            helper: resolvedSearchParams.keyword
              ? `关键词：${resolvedSearchParams.keyword}`
              : '收藏操作会保留当前筛选上下文。',
          },
        ]}
      />

      <div className="space-y-6">
        {errorMessage ? (
          <RuntimeFailurePanel
            title="收藏列表暂时加载失败"
            message={errorMessage}
            recoveryLabel="回到项目列表继续筛选"
            recoveryHref="/repositories"
          />
        ) : favorites ? (
          <section className="space-y-6">
            <FavoritesFollowUpBoard
              items={favorites.items}
              returnBaseHref={favoritesReturnHref}
            />
            <FavoritesExpandedPool
              items={favorites.items}
              pagination={favorites.pagination}
              query={resolvedSearchParams}
              returnBaseHref={favoritesReturnHref}
            />
          </section>
        ) : null}
      </div>
    </AppPageShell>
  );
}

function buildFavoritesReturnHref(
  query: ReturnType<typeof normalizeFavoriteListQuery>,
) {
  const search = buildFavoriteListSearchParams(query);
  return search ? `/favorites?${search}` : '/favorites';
}
