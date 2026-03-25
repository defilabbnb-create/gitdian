'use client';

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
          暂无结果
        </p>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
          现在没有需要继续跟的收藏项
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          可以先回项目页收藏几个值得继续跟的项目，或者放宽筛选条件继续查看。
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
