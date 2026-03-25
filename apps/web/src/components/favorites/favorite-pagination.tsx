'use client';

import Link from 'next/link';
import {
  FavoriteListQueryState,
  PaginationMeta,
  buildFavoriteListSearchParams,
} from '@/lib/types/repository';

type FavoritePaginationProps = {
  pagination: PaginationMeta;
  query: FavoriteListQueryState;
};

function buildPageHref(query: FavoriteListQueryState, page: number) {
  const search = buildFavoriteListSearchParams({
    ...query,
    page,
  });

  return search ? `/favorites?${search}` : '/favorites';
}

export function FavoritePagination({
  pagination,
  query,
}: FavoritePaginationProps) {
  if (pagination.total <= pagination.pageSize) {
    return null;
  }

  const pages = Array.from(
    new Set(
      [1, pagination.page - 1, pagination.page, pagination.page + 1, pagination.totalPages]
        .filter((page) => page >= 1 && page <= pagination.totalPages)
        .sort((left, right) => left - right),
    ),
  );

  return (
    <nav className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-slate-600">
        第 <span className="font-semibold text-slate-900">{pagination.page}</span> 页，共{' '}
        <span className="font-semibold text-slate-900">{pagination.totalPages}</span> 页，
        累计 <span className="font-semibold text-slate-900">{pagination.total}</span> 个收藏
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildPageHref(query, Math.max(1, pagination.page - 1))}
          aria-disabled={pagination.page <= 1}
          className={`inline-flex h-10 items-center rounded-2xl border px-4 text-sm font-medium ${
            pagination.page <= 1
              ? 'pointer-events-none border-slate-200 text-slate-300'
              : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          上一页
        </Link>

        {pages.map((page) => (
          <Link
            key={page}
            href={buildPageHref(query, page)}
            className={`inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border px-3 text-sm font-semibold ${
              page === pagination.page
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            {page}
          </Link>
        ))}

        <Link
          href={buildPageHref(query, Math.min(pagination.totalPages, pagination.page + 1))}
          aria-disabled={pagination.page >= pagination.totalPages}
          className={`inline-flex h-10 items-center rounded-2xl border px-4 text-sm font-medium ${
            pagination.page >= pagination.totalPages
              ? 'pointer-events-none border-slate-200 text-slate-300'
              : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          下一页
        </Link>
      </div>
    </nav>
  );
}
