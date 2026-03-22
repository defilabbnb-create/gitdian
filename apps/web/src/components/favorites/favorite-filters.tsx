'use client';

import { FormEvent, startTransition, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  FavoriteListQueryState,
  buildFavoriteListSearchParams,
} from '@/lib/types/repository';

type FavoriteFiltersProps = {
  query: FavoriteListQueryState;
};

export function FavoriteFilters({ query }: FavoriteFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const pageSize = Number(formData.get('pageSize') || query.pageSize || 20);
    const minFinalScore = Number(formData.get('minFinalScore') || 0);

    const search = buildFavoriteListSearchParams({
      page: 1,
      pageSize,
      keyword: String(formData.get('keyword') || '').trim() || undefined,
      priority:
        (String(formData.get('priority') || '') || undefined) as
          | FavoriteListQueryState['priority']
          | undefined,
      language: String(formData.get('language') || '').trim() || undefined,
      opportunityLevel:
        (String(formData.get('opportunityLevel') || '') || undefined) as
          | FavoriteListQueryState['opportunityLevel']
          | undefined,
      minFinalScore: minFinalScore > 0 ? minFinalScore : undefined,
      sortBy:
        (String(formData.get('sortBy') || query.sortBy) as FavoriteListQueryState['sortBy']) ??
        'createdAt',
      order:
        (String(formData.get('order') || query.order) as FavoriteListQueryState['order']) ??
        'desc',
    });

    startTransition(() => {
      router.push(search ? `${pathname}?${search}` : pathname);
    });
  }

  function handleReset() {
    startTransition(() => {
      router.push(pathname);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            搜索
          </span>
          <input
            name="keyword"
            defaultValue={query.keyword ?? ''}
            placeholder="仓库名、描述、备注"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            优先级
          </span>
          <select
            name="priority"
            defaultValue={query.priority ?? ''}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="">全部</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            语言
          </span>
          <input
            name="language"
            defaultValue={query.language ?? ''}
            placeholder="TypeScript / Python"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            创业等级
          </span>
          <select
            name="opportunityLevel"
            defaultValue={query.opportunityLevel ?? ''}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="">全部</option>
            <option value="HIGH">高潜力</option>
            <option value="MEDIUM">中潜力</option>
            <option value="LOW">低潜力</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            最低总分
          </span>
          <input
            name="minFinalScore"
            type="number"
            min={0}
            defaultValue={query.minFinalScore ?? ''}
            placeholder="70"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            每页数量
          </span>
          <select
            name="pageSize"
            defaultValue={String(query.pageSize)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            排序字段
          </span>
          <select
            name="sortBy"
            defaultValue={query.sortBy}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="createdAt">收藏时间</option>
            <option value="updatedAt">更新时间</option>
            <option value="finalScore">Final Score</option>
            <option value="stars">Stars</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            顺序
          </span>
          <select
            name="order"
            defaultValue={query.order}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? '更新中...' : '应用筛选'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={isPending}
          className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          重置
        </button>
      </div>
    </form>
  );
}
