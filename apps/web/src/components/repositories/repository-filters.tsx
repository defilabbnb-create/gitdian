'use client';

import { FormEvent, startTransition, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  buildRepositoryListSearchParams,
  RepositoryListQueryState,
} from '@/lib/types/repository';

type RepositoryFiltersProps = {
  query: RepositoryListQueryState;
};

export function RepositoryFilters({ query }: RepositoryFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const pageSize = Number(formData.get('pageSize') || query.pageSize || 20);
    const minStars = Number(formData.get('minStars') || 0);
    const minFinalScore = Number(formData.get('minFinalScore') || 0);
    const isFavoritedValue = String(formData.get('isFavorited') || '');
    const roughPassValue = String(formData.get('roughPass') || '');
    const hasCompletenessAnalysisValue = String(
      formData.get('hasCompletenessAnalysis') || '',
    );
    const hasIdeaFitAnalysisValue = String(
      formData.get('hasIdeaFitAnalysis') || '',
    );
    const hasExtractedIdeaValue = String(
      formData.get('hasExtractedIdea') || '',
    );

    const search = buildRepositoryListSearchParams({
      page: 1,
      pageSize,
      view: query.view,
      keyword: String(formData.get('keyword') || '').trim() || undefined,
      language: String(formData.get('language') || '').trim() || undefined,
      opportunityLevel:
        (String(formData.get('opportunityLevel') || '') || undefined) as
          | RepositoryListQueryState['opportunityLevel']
          | undefined,
      isFavorited:
        isFavoritedValue === ''
          ? undefined
          : isFavoritedValue === 'true',
      roughPass:
        roughPassValue === ''
          ? undefined
          : roughPassValue === 'true',
      hasCompletenessAnalysis:
        hasCompletenessAnalysisValue === ''
          ? undefined
          : hasCompletenessAnalysisValue === 'true',
      hasIdeaFitAnalysis:
        hasIdeaFitAnalysisValue === ''
          ? undefined
          : hasIdeaFitAnalysisValue === 'true',
      hasExtractedIdea:
        hasExtractedIdeaValue === ''
          ? undefined
          : hasExtractedIdeaValue === 'true',
      createdAfterDays: query.createdAfterDays,
      minStars: minStars > 0 ? minStars : undefined,
      minFinalScore: minFinalScore > 0 ? minFinalScore : undefined,
      sortBy:
        (String(formData.get('sortBy') || query.sortBy) as RepositoryListQueryState['sortBy']) ??
        'latest',
      order:
        (String(formData.get('order') || query.order) as RepositoryListQueryState['order']) ??
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
            placeholder="仓库名、描述、owner"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          />
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
            收藏
          </span>
          <select
            name="isFavorited"
            defaultValue={
              typeof query.isFavorited === 'boolean' ? String(query.isFavorited) : ''
            }
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="">全部</option>
            <option value="true">仅已收藏</option>
            <option value="false">仅未收藏</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            粗筛结果
          </span>
          <select
            name="roughPass"
            defaultValue={
              typeof query.roughPass === 'boolean' ? String(query.roughPass) : ''
            }
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="">全部</option>
            <option value="true">仅已通过</option>
            <option value="false">仅未通过</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            最低 Stars
          </span>
          <input
            name="minStars"
            type="number"
            min={0}
            defaultValue={query.minStars ?? ''}
            placeholder="100"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          />
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
            完整性分析
          </span>
          <select
            name="hasCompletenessAnalysis"
            defaultValue={
              typeof query.hasCompletenessAnalysis === 'boolean'
                ? String(query.hasCompletenessAnalysis)
                : ''
            }
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="">全部</option>
            <option value="true">已完成</option>
            <option value="false">未完成</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Idea Fit
          </span>
          <select
            name="hasIdeaFitAnalysis"
            defaultValue={
              typeof query.hasIdeaFitAnalysis === 'boolean'
                ? String(query.hasIdeaFitAnalysis)
                : ''
            }
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="">全部</option>
            <option value="true">已完成</option>
            <option value="false">未完成</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            点子提取
          </span>
          <select
            name="hasExtractedIdea"
            defaultValue={
              typeof query.hasExtractedIdea === 'boolean'
                ? String(query.hasExtractedIdea)
                : ''
            }
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="">全部</option>
            <option value="true">已完成</option>
            <option value="false">未完成</option>
          </select>
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
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            排序字段
          </span>
          <select
            name="sortBy"
            defaultValue={query.sortBy}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="latest">最近更新</option>
            <option value="stars">Stars</option>
            <option value="finalScore">Final Score</option>
            <option value="ideaFitScore">Idea Fit</option>
            <option value="createdAt">创建时间</option>
            <option value="createdAtGithub">GitHub 创建时间</option>
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

        <div className="flex items-end gap-3">
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
      </div>
    </form>
  );
}
