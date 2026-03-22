'use client';

import { startTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  buildRepositoryListSearchParams,
  RepositoryListQueryState,
} from '@/lib/types/repository';

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
  const hasActiveQuickFilter =
    isHighOpportunityActive || hasExtractedIdeaActive;

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

  function handleClear() {
    pushQuery({
      opportunityLevel: undefined,
      hasExtractedIdea: undefined,
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
