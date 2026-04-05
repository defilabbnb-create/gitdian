'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { FormEvent, startTransition, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  buildRepositoryListSearchParams,
  RepositoryListQueryState,
} from '@/lib/types/repository';

const RepositoryAdvancedFiltersPanel = dynamic(
  () =>
    import('./repository-advanced-filters-panel').then(
      (module) => module.RepositoryAdvancedFiltersPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-12 rounded-2xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
    ),
  },
);

type RepositoryFiltersProps = {
  query: RepositoryListQueryState;
};

const PRIMARY_FILTER_KEYS = [
  'keyword',
  'finalVerdict',
  'recommendedAction',
  'moneyPriority',
  'sortBy',
] as const;

export function RepositoryFilters({ query }: RepositoryFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [categoryDraft, setCategoryDraft] = useState(query.finalCategory ?? '');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const advancedFilterCount = useMemo(() => countAdvancedFilters(query), [query]);

  useEffect(() => {
    setCategoryDraft(query.finalCategory ?? '');
  }, [query.finalCategory]);

  useEffect(() => {
    if (!isAdvancedOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAdvancedOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAdvancedOpen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const search = buildRepositoryListSearchParams({
      page: 1,
      pageSize: Number(formData.get('pageSize') || query.pageSize || 20),
      view: query.view,
      displayMode: query.displayMode,
      keyword: String(formData.get('keyword') || '').trim() || undefined,
      language: String(formData.get('language') || '').trim() || undefined,
      opportunityLevel:
        (String(formData.get('opportunityLevel') || '') || undefined) as
          | RepositoryListQueryState['opportunityLevel']
          | undefined,
      isFavorited: toOptionalBoolean(formData.get('isFavorited')),
      roughPass: toOptionalBoolean(formData.get('roughPass')),
      hasCompletenessAnalysis: toOptionalBoolean(
        formData.get('hasCompletenessAnalysis'),
      ),
      hasIdeaFitAnalysis: toOptionalBoolean(formData.get('hasIdeaFitAnalysis')),
      hasExtractedIdea: toOptionalBoolean(formData.get('hasExtractedIdea')),
      hasPromisingIdeaSnapshot: query.hasPromisingIdeaSnapshot,
      hasGoodInsight: toOptionalBoolean(formData.get('hasGoodInsight')),
      hasManualInsight: toOptionalBoolean(formData.get('hasManualInsight')),
      hasColdToolFit: query.hasColdToolFit,
      deepAnalysisState: query.deepAnalysisState,
      finalVerdict:
        (String(formData.get('finalVerdict') || '') || undefined) as
          | RepositoryListQueryState['finalVerdict']
          | undefined,
      finalCategory: String(formData.get('finalCategory') || '').trim() || undefined,
      moneyPriority:
        (String(formData.get('moneyPriority') || '') || undefined) as
          | RepositoryListQueryState['moneyPriority']
          | undefined,
      decisionSource:
        (String(formData.get('decisionSource') || '') || undefined) as
          | RepositoryListQueryState['decisionSource']
          | undefined,
      hasConflict: toOptionalBoolean(formData.get('hasConflict')),
      needsRecheck: toOptionalBoolean(formData.get('needsRecheck')),
      hasTrainingHints: toOptionalBoolean(formData.get('hasTrainingHints')),
      recommendedAction:
        (String(formData.get('recommendedAction') || '') || undefined) as
          | RepositoryListQueryState['recommendedAction']
          | undefined,
      createdAfterDays: toOptionalNumber(formData.get('createdAfterDays')),
      minStars: toOptionalNumber(formData.get('minStars')),
      minFinalScore: toOptionalNumber(formData.get('minFinalScore')),
      sortBy:
        (String(formData.get('sortBy') || query.sortBy) as RepositoryListQueryState['sortBy']) ??
        'moneyPriority',
      order:
        (String(formData.get('order') || query.order) as RepositoryListQueryState['order']) ??
        'desc',
    });

    setIsAdvancedOpen(false);
    startTransition(() => {
      router.push(search ? `${pathname}?${search}` : pathname);
    });
  }

  function handleReset() {
    setIsAdvancedOpen(false);
    startTransition(() => {
      router.push(pathname);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.92)_100%)] p-5 shadow-[0_24px_72px_-40px_rgba(15,23,42,0.24)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            主筛选
          </p>
          <h3 className="font-display mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            先用最少的条件开始筛，不要先被高级筛选打断。
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            首屏只保留搜索、最终结论、建议动作、挣钱优先级和排序。其他条件全部收进“更多筛选”。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setIsAdvancedOpen((current) => !current)}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {isAdvancedOpen
              ? '收起更多筛选'
              : advancedFilterCount > 0
                ? `更多筛选（已启用 ${advancedFilterCount} 项）`
                : '更多筛选'}
          </button>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_58%,#0f766e_100%)] px-5 text-sm font-semibold text-white transition hover:opacity-95"
          >
            应用筛选
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
          >
            重置
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <FilterField label="搜索">
          <input
            name="keyword"
            defaultValue={query.keyword ?? ''}
            placeholder="仓库名、描述、owner"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          />
        </FilterField>

        <FilterField label="最终结论">
          <select
            name="finalVerdict"
            defaultValue={query.finalVerdict ?? ''}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            <option value="">全部</option>
            <option value="GOOD">只看值得做</option>
            <option value="OK">只看可继续看</option>
            <option value="BAD">只看建议跳过</option>
          </select>
        </FilterField>

        <FilterField label="建议动作">
          <select
            name="recommendedAction"
            defaultValue={query.recommendedAction ?? ''}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            <option value="">全部</option>
            <option value="BUILD">只看值得做</option>
            <option value="CLONE">只看值得借鉴</option>
            <option value="IGNORE">只看建议跳过</option>
          </select>
        </FilterField>

        <FilterField label="挣钱优先级">
          <select
            name="moneyPriority"
            defaultValue={query.moneyPriority ?? ''}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            <option value="">全部</option>
            <option value="P0">P0 · 能赚钱</option>
            <option value="P1">P1 · 值得做</option>
            <option value="P2">P2 · 值得借鉴</option>
            <option value="P3">P3 · 低优先</option>
          </select>
        </FilterField>

        <FilterField label="排序">
          <select
            name="sortBy"
            defaultValue={query.sortBy}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            <option value="moneyPriority">挣钱优先</option>
            <option value="insightPriority">创业判断优先</option>
            <option value="latest">最近更新</option>
            <option value="stars">Stars</option>
            <option value="finalScore">总分</option>
            <option value="ideaFitScore">创业匹配度</option>
            <option value="createdAtGithub">GitHub 创建时间</option>
          </select>
        </FilterField>
      </div>

      {isAdvancedOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/20 p-3 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="更多筛选"
          data-repository-advanced-drawer="true"
          onClick={() => setIsAdvancedOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl shadow-slate-900/15"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">更多筛选</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    把语言、收藏、分类、冲突、训练提示和每页数量都收进这里。默认不加载，不打断首屏判断。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdvancedOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                >
                  收起
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <RepositoryAdvancedFiltersPanel
                query={query}
                categoryDraft={categoryDraft}
                onCategoryDraftChange={setCategoryDraft}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setIsAdvancedOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                继续看结果
              </button>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                应用筛选
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function toOptionalBoolean(value: FormDataEntryValue | null) {
  if (value === null || value === '') {
    return undefined;
  }

  return String(value) === 'true';
}

function toOptionalNumber(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function countAdvancedFilters(query: RepositoryListQueryState) {
  return Object.entries(query).reduce((count, [key, value]) => {
    if (PRIMARY_FILTER_KEYS.includes(key as (typeof PRIMARY_FILTER_KEYS)[number])) {
      return count;
    }

    if (
      key === 'page' ||
      key === 'view' ||
      key === 'displayMode' ||
      key === 'hasPromisingIdeaSnapshot' ||
      key === 'hasColdToolFit' ||
      key === 'createdAfterDays'
    ) {
      return count;
    }

    if (value === undefined || value === null || value === '') {
      return count;
    }

    if (key === 'pageSize' && value === 20) {
      return count;
    }

    if (key === 'order' && value === 'desc') {
      return count;
    }

    return count + 1;
  }, 0);
}
