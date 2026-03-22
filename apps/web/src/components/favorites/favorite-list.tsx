import {
  FavoriteListQueryState,
  FavoriteWithRepositorySummary,
  PaginationMeta,
} from '@/lib/types/repository';
import { FavoriteListItem } from './favorite-list-item';
import { FavoritePagination } from './favorite-pagination';

type FavoriteListProps = {
  items: FavoriteWithRepositorySummary[];
  pagination: PaginationMeta;
  query: FavoriteListQueryState;
};

export function FavoriteList({ items, pagination, query }: FavoriteListProps) {
  if (items.length === 0) {
    return (
      <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Empty Result
        </p>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
          当前筛选条件下没有收藏项目
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          可以先回列表页收藏几个高价值仓库，或者放宽筛选条件查看已有收藏。
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {items.map((favorite) => (
        <FavoriteListItem key={favorite.id} favorite={favorite} />
      ))}
      <FavoritePagination pagination={pagination} query={query} />
    </div>
  );
}
