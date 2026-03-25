'use client';

import { useState } from 'react';
import { FavoriteFilters } from '@/components/favorites/favorite-filters';
import { FavoriteList } from '@/components/favorites/favorite-list';
import { ExportFavoritesButton } from '@/components/favorites/export-favorites-button';
import {
  FavoriteListQueryState,
  FavoriteWithRepositorySummary,
  PaginationMeta,
} from '@/lib/types/repository';

type FavoritesExpandedPoolProps = {
  items: FavoriteWithRepositorySummary[];
  pagination: PaginationMeta;
  query: FavoriteListQueryState;
};

export function FavoritesExpandedPool({
  items,
  pagination,
  query,
}: FavoritesExpandedPoolProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            完整收藏池
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            需要批量回看时，再展开完整收藏池。
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            首屏先帮你决定继续跟什么；只有当你要批量筛选、导出或翻历史收藏时，才展开这一层。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {isExpanded ? '收起完整收藏池' : '展开完整收藏池'}
        </button>
      </div>

      {isExpanded ? (
        <div className="mt-6 space-y-6">
          <FavoriteFilters query={query} />
          <div className="flex justify-end">
            <ExportFavoritesButton items={items} />
          </div>
          <FavoriteList items={items} pagination={pagination} query={query} />
        </div>
      ) : null}
    </section>
  );
}
