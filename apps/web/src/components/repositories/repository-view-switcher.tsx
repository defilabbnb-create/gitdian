'use client';

import { startTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  applyRepositoryViewQuery,
  buildRepositoryListSearchParams,
  getActiveRepositoryViewPresetKeys,
  RepositoryDisplayMode,
  RepositoryListQueryState,
  RepositoryRecommendedView,
  stripActiveRepositoryViewPresetFilters,
} from '@/lib/types/repository';
import {
  getRepositoryDisplayModeMeta,
  getRepositoryViewMeta,
  repositoryDisplayModeMeta,
  repositoryViewMeta,
} from '@/lib/repository-view-meta';

type RepositoryViewSwitcherProps = {
  query: RepositoryListQueryState;
};

const PRIMARY_VIEW_OPTIONS: RepositoryRecommendedView[] = [
  'moneyFirst',
  'bestIdeas',
  'all',
];

const secondaryViewOptions = (
  Object.entries(repositoryViewMeta) as Array<
    [RepositoryRecommendedView, ReturnType<typeof getRepositoryViewMeta>]
  >
)
  .filter(([value]) => !PRIMARY_VIEW_OPTIONS.includes(value))
  .map(([value, meta]) => ({
    value,
    ...meta,
  }));

const displayModeOptions = (
  Object.entries(repositoryDisplayModeMeta) as Array<
    [RepositoryDisplayMode, ReturnType<typeof getRepositoryDisplayModeMeta>]
  >
).map(([value, meta]) => ({
  value,
  ...meta,
}));

const VIEW_PRESET_LABELS: Partial<
  Record<keyof RepositoryListQueryState, string>
> = {
  opportunityLevel: '创业等级',
  isFavorited: '收藏状态',
  hasIdeaFitAnalysis: 'Idea Fit',
  hasExtractedIdea: '点子提取',
  hasPromisingIdeaSnapshot: '候选快照',
  hasGoodInsight: '好点子结论',
  finalVerdict: '最终结论',
  createdAfterDays: '时间范围',
  sortBy: '排序字段',
  order: '排序顺序',
};

function getViewPresetSummary(view: RepositoryRecommendedView) {
  const presetKeys = getActiveRepositoryViewPresetKeys(
    applyRepositoryViewQuery(
      {
        page: 1,
        pageSize: 20,
        view: 'moneyFirst',
        displayMode: 'insight',
        sortBy: 'latest',
        order: 'desc',
      },
      view,
    ),
  )
    .map((key) => VIEW_PRESET_LABELS[key])
    .filter((value): value is string => Boolean(value));

  if (presetKeys.length === 0) {
    return '不额外接管任何筛选条件';
  }

  return `切换后自动替换：${presetKeys.join(' / ')}`;
}

export function RepositoryViewSwitcher({
  query,
}: RepositoryViewSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isSecondaryView = !PRIMARY_VIEW_OPTIONS.includes(query.view);

  function handleSwitch(nextView: RepositoryRecommendedView) {
    const baseQuery = stripActiveRepositoryViewPresetFilters({
      ...query,
      page: 1,
    });

    const viewQuery = applyRepositoryViewQuery(baseQuery, nextView);
    const search = buildRepositoryListSearchParams(viewQuery);

    startTransition(() => {
      router.push(search ? `${pathname}?${search}` : pathname);
    });
  }

  function handleDisplayMode(nextDisplayMode: RepositoryDisplayMode) {
    const search = buildRepositoryListSearchParams({
      ...query,
      page: 1,
      displayMode: nextDisplayMode,
    });

    startTransition(() => {
      router.push(search ? `${pathname}?${search}` : pathname);
    });
  }

  return (
    <section className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            首页视角
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            先选你现在要用什么角度做决定。
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            默认推荐“挣钱优先”。切换视角时只会替换视角自带的预设条件，你已经手动加上的搜索、分类和动作筛选会继续保留。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>当前：</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-900">
            {getRepositoryViewMeta(query.view).label}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-900">
            {getRepositoryDisplayModeMeta(query.displayMode).label}
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {PRIMARY_VIEW_OPTIONS.map((value) => {
          const option = getRepositoryViewMeta(value);

          return (
            <button
              key={value}
              type="button"
              onClick={() => handleSwitch(value)}
              title={option.helper}
              className={`rounded-[24px] border px-5 py-4 text-left transition ${
                query.view === value
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300'
              }`}
            >
              <p className="text-sm font-semibold">{option.label}</p>
              <p
                className={`mt-2 text-xs leading-6 ${
                  query.view === value ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {option.helper}
              </p>
              <p
                className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                  query.view === value ? 'text-slate-400' : 'text-slate-400'
                }`}
              >
                {getViewPresetSummary(value)}
              </p>
            </button>
          );
        })}
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              展示方式
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              默认先看结论层；只有在你想补看 stars、语言和更多技术线索时，再切到详细模式。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {displayModeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.helper}
                onClick={() => handleDisplayMode(option.value)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  query.displayMode === option.value
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <details
        open={isSecondaryView}
        className="rounded-[24px] border border-slate-200 bg-white"
      >
        <summary className="cursor-pointer list-none px-4 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">更多视角</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                这些视角更适合补看待分析项目、回溯雷达和长尾机会池，不抢首页主判断入口；切换时同样会保留你手动加的筛选。
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {isSecondaryView ? '当前正在使用次级视角' : '默认折叠'}
            </span>
          </div>
        </summary>

        <div className="grid gap-3 border-t border-slate-100 px-4 pb-4 pt-4 md:grid-cols-2 xl:grid-cols-3">
          {secondaryViewOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSwitch(option.value)}
              title={option.helper}
              className={`rounded-[22px] border px-4 py-4 text-left transition ${
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
              <p
                className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                  query.view === option.value ? 'text-slate-400' : 'text-slate-400'
                }`}
              >
                {getViewPresetSummary(option.value)}
              </p>
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
