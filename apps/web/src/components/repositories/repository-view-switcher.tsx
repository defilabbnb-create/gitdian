'use client';

import { startTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  buildRepositoryListSearchParams,
  RepositoryListQueryState,
  RepositoryRecommendedView,
} from '@/lib/types/repository';

type RepositoryViewSwitcherProps = {
  query: RepositoryListQueryState;
};

const viewOptions: Array<{
  value: RepositoryRecommendedView;
  label: string;
  helper: string;
}> = [
  {
    value: 'all',
    label: '全部项目',
    helper: '回到普通首页浏览状态',
  },
  {
    value: 'highOpportunity',
    label: '高机会项目',
    helper: 'opportunityLevel=HIGH',
  },
  {
    value: 'highOpportunityUnfavorited',
    label: '高机会待收藏',
    helper: 'HIGH 且未收藏',
  },
  {
    value: 'extractedIdea',
    label: '已提取点子',
    helper: 'hasExtractedIdea=true',
  },
  {
    value: 'ideaExtractionPending',
    label: '待补点子',
    helper: '已完成 Idea Fit，但还没提取点子',
  },
  {
    value: 'pendingAnalysis',
    label: '待分析项目',
    helper: 'hasIdeaFitAnalysis=false',
  },
  {
    value: 'favoritedPendingAnalysis',
    label: '已收藏待补分析',
    helper: '已收藏且未完成 Idea Fit',
  },
  {
    value: 'newRadar',
    label: '新项目雷达',
    helper: '最近 30 天创建 · GitHub 创建时间倒序',
  },
];

export function RepositoryViewSwitcher({
  query,
}: RepositoryViewSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();

  function handleSwitch(nextView: RepositoryRecommendedView) {
    const baseQuery: RepositoryListQueryState = {
      ...query,
      page: 1,
      view: nextView,
      opportunityLevel: undefined,
      isFavorited: undefined,
      hasIdeaFitAnalysis: undefined,
      hasExtractedIdea: undefined,
      createdAfterDays: undefined,
      sortBy:
        query.sortBy === 'createdAtGithub' ? 'latest' : query.sortBy,
      order:
        query.sortBy === 'createdAtGithub' ? 'desc' : query.order,
    };

    const viewQuery = applyViewQuery(baseQuery, nextView);
    const search = buildRepositoryListSearchParams(viewQuery);

    startTransition(() => {
      router.push(search ? `${pathname}?${search}` : pathname);
    });
  }

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Recommended Views
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            先决定你现在想看的工作集，而不是直接掉进所有筛选项。
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            视图切换代表当前浏览语境；普通筛选和快捷筛选仍然可以继续叠加。
          </p>
        </div>

        <p className="text-sm font-medium text-slate-500">
          当前视图：
          <span className="ml-2 rounded-full bg-slate-100 px-3 py-1 text-slate-900">
            {viewOptions.find((option) => option.value === query.view)?.label ?? '全部项目'}
          </span>
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-8">
        {viewOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSwitch(option.value)}
            className={`rounded-[24px] border px-5 py-4 text-left transition ${
              query.view === option.value
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300 hover:bg-white'
            }`}
          >
            <p className="text-sm font-semibold">{option.label}</p>
            <p
              className={`mt-2 text-xs leading-6 ${
                query.view === option.value ? 'text-slate-300' : 'text-slate-500'
              }`}
            >
              {option.helper}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function applyViewQuery(
  query: RepositoryListQueryState,
  view: RepositoryRecommendedView,
) {
  switch (view) {
    case 'highOpportunity':
      return {
        ...query,
        opportunityLevel: 'HIGH' as const,
      };
    case 'highOpportunityUnfavorited':
      return {
        ...query,
        opportunityLevel: 'HIGH' as const,
        isFavorited: false,
        sortBy: 'ideaFitScore' as const,
        order: 'desc' as const,
      };
    case 'extractedIdea':
      return {
        ...query,
        hasExtractedIdea: true,
      };
    case 'ideaExtractionPending':
      return {
        ...query,
        hasIdeaFitAnalysis: true,
        hasExtractedIdea: false,
        sortBy: 'ideaFitScore' as const,
        order: 'desc' as const,
      };
    case 'pendingAnalysis':
      return {
        ...query,
        hasIdeaFitAnalysis: false,
      };
    case 'favoritedPendingAnalysis':
      return {
        ...query,
        isFavorited: true,
        hasIdeaFitAnalysis: false,
      };
    case 'newRadar':
      return {
        ...query,
        createdAfterDays: 30,
        sortBy: 'createdAtGithub' as const,
        order: 'desc' as const,
      };
    case 'all':
    default:
      return query;
  }
}
