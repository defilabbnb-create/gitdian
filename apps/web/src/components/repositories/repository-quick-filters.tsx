'use client';

import { startTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  buildRepositoryListSearchParams,
  RepositoryListQueryState,
} from '@/lib/types/repository';
import { COMMON_CATEGORY_SUGGESTIONS } from '@/lib/repository-category-suggestions';

type RepositoryQuickFiltersProps = {
  query: RepositoryListQueryState;
};

export function RepositoryQuickFilters({
  query,
}: RepositoryQuickFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isHighOpportunityActive = query.opportunityLevel === 'HIGH';
  const hasExtractedIdeaActive = query.hasExtractedIdea === true;
  const hasGoodInsightActive = query.hasGoodInsight === true;
  const hasManualInsightActive = query.hasManualInsight === true;
  const hasBuildActionActive = query.recommendedAction === 'BUILD';
  const hasCloneActionActive = query.recommendedAction === 'CLONE';
  const activeCategory = query.finalCategory ?? '';
  const hasActiveQuickFilter =
    isHighOpportunityActive ||
    hasExtractedIdeaActive ||
    hasGoodInsightActive ||
    hasManualInsightActive ||
    hasBuildActionActive ||
    hasCloneActionActive ||
    activeCategory.length > 0;

  function pushQuery(nextQuery: Partial<RepositoryListQueryState>) {
    const search = buildRepositoryListSearchParams({
      ...query,
      ...nextQuery,
      page: 1,
    });

    startTransition(() => {
      router.push(search ? `${pathname}?${search}` : pathname);
    });
  }

  function handleToggleHighOpportunity() {
    pushQuery({
      opportunityLevel: isHighOpportunityActive ? undefined : 'HIGH',
    });
  }

  function handleToggleExtractedIdea() {
    pushQuery({
      hasExtractedIdea: hasExtractedIdeaActive ? undefined : true,
    });
  }

  function handleToggleGoodInsight() {
    pushQuery({
      hasGoodInsight: hasGoodInsightActive ? undefined : true,
    });
  }

  function handleToggleBuildAction() {
    pushQuery({
      recommendedAction: hasBuildActionActive ? undefined : 'BUILD',
    });
  }

  function handleToggleManualInsight() {
    pushQuery({
      hasManualInsight: hasManualInsightActive ? undefined : true,
    });
  }

  function handleToggleCloneAction() {
    pushQuery({
      recommendedAction: hasCloneActionActive ? undefined : 'CLONE',
    });
  }

  function handleToggleCategory(category: string) {
    pushQuery({
      finalCategory: activeCategory === category ? undefined : category,
    });
  }

  function handleClear() {
    pushQuery({
      opportunityLevel: undefined,
      hasExtractedIdea: undefined,
      hasGoodInsight: undefined,
      hasManualInsight: undefined,
      recommendedAction: undefined,
      finalCategory: undefined,
    });
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            快捷筛选
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            一键切到高机会项目，或者只看已经完成点子提取的仓库。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <QuickFilterChip
            active={isHighOpportunityActive}
            label="只看高机会项目"
            helper="opportunityLevel=HIGH"
            onClick={handleToggleHighOpportunity}
          />
          <QuickFilterChip
            active={hasExtractedIdeaActive}
            label="只看已提取点子项目"
            helper="hasExtractedIdea=true"
            onClick={handleToggleExtractedIdea}
          />
          <QuickFilterChip
            active={hasGoodInsightActive}
            label="只看好点子"
            helper="hasGoodInsight=true"
            onClick={handleToggleGoodInsight}
          />
          <QuickFilterChip
            active={hasManualInsightActive}
            label="只看我判断过的"
            helper="hasManualInsight=true"
            onClick={handleToggleManualInsight}
          />
          <QuickFilterChip
            active={hasBuildActionActive}
            label="只看值得做"
            helper="recommendedAction=BUILD"
            onClick={handleToggleBuildAction}
          />
          <QuickFilterChip
            active={hasCloneActionActive}
            label="只看值得借鉴"
            helper="recommendedAction=CLONE"
            onClick={handleToggleCloneAction}
          />
          {hasActiveQuickFilter ? (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              清除快捷筛选
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">常见分类</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              不用再先展开高级筛选，常见分类直接点选就能缩到对应项目池。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {COMMON_CATEGORY_SUGGESTIONS.map((category) => {
              const active = activeCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => handleToggleCategory(category)}
                  className={`inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-semibold transition ${
                    active
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickFilterChip({
  label,
  helper,
  active,
  onClick,
}: {
  label: string;
  helper: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-col items-start rounded-[24px] border px-4 py-3 text-left transition ${
        active
          ? 'border-slate-950 bg-slate-950 text-white'
          : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300 hover:bg-white'
      }`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span
        className={`mt-1 text-xs ${
          active ? 'text-slate-300' : 'text-slate-500'
        }`}
      >
        {helper}
      </span>
    </button>
  );
}
