'use client';

import type { ReactNode } from 'react';
import { FormEvent, startTransition, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getRepositoryViewMeta } from '@/lib/repository-view-meta';
import {
  applyRepositoryViewQuery,
  buildRepositoryListSearchParams,
  getActiveRepositoryViewPresetKeys,
  RepositoryListQueryState,
  stripActiveRepositoryViewPresetFilters,
} from '@/lib/types/repository';
import { COMMON_CATEGORY_SUGGESTIONS } from '@/lib/repository-category-suggestions';

type RepositoryFiltersProps = {
  query: RepositoryListQueryState;
};

const PRIMARY_FILTER_KEYS = [
  'keyword',
  'finalVerdict',
  'recommendedAction',
  'moneyPriority',
] as const;

type ActiveFilterChip = {
  key: string;
  label: string;
  scope: 'view' | 'manual';
};

export function RepositoryFilters({ query }: RepositoryFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending] = useTransition();
  const [categoryDraft, setCategoryDraft] = useState(query.finalCategory ?? '');
  const activeViewPresetKeys = new Set(getActiveRepositoryViewPresetKeys(query));
  const advancedFilterCount = countAdvancedFilters(query, activeViewPresetKeys);
  const showAdvancedByDefault = advancedFilterCount > 0;
  const activeFilterChips = buildActiveFilterChips(query, activeViewPresetKeys);
  const viewPresetChips = activeFilterChips.filter(
    (chip) => chip.scope === 'view',
  ).length;
  const manualFilterChips = activeFilterChips.filter(
    (chip) => chip.scope === 'manual',
  ).length;

  useEffect(() => {
    setCategoryDraft(query.finalCategory ?? '');
  }, [query.finalCategory]);

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
    const hasGoodInsightValue = String(formData.get('hasGoodInsight') || '');
    const hasManualInsightValue = String(formData.get('hasManualInsight') || '');
    const finalVerdictValue = String(formData.get('finalVerdict') || '');
    const finalCategoryValue = String(formData.get('finalCategory') || '').trim();
    const moneyPriorityValue = String(formData.get('moneyPriority') || '');
    const decisionSourceValue = String(formData.get('decisionSource') || '');
    const hasConflictValue = String(formData.get('hasConflict') || '');
    const needsRecheckValue = String(formData.get('needsRecheck') || '');
    const hasTrainingHintsValue = String(formData.get('hasTrainingHints') || '');
    const recommendedActionValue = String(formData.get('recommendedAction') || '');
    const keepImplicitViewFilters = shouldKeepImplicitViewFilters(query.view);
    const search = buildRepositoryListSearchParams({
      page: 1,
      pageSize,
      view: query.view,
      displayMode: query.displayMode,
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
      hasPromisingIdeaSnapshot: keepImplicitViewFilters
        ? query.hasPromisingIdeaSnapshot
        : undefined,
      hasGoodInsight:
        hasGoodInsightValue === ''
          ? undefined
          : hasGoodInsightValue === 'true',
      hasManualInsight:
        hasManualInsightValue === ''
          ? undefined
          : hasManualInsightValue === 'true',
      finalVerdict:
        finalVerdictValue === ''
          ? undefined
          : (finalVerdictValue as RepositoryListQueryState['finalVerdict']),
      finalCategory: finalCategoryValue || undefined,
      moneyPriority:
        moneyPriorityValue === ''
          ? undefined
          : (moneyPriorityValue as RepositoryListQueryState['moneyPriority']),
      decisionSource:
        decisionSourceValue === ''
          ? undefined
          : (decisionSourceValue as RepositoryListQueryState['decisionSource']),
      hasConflict:
        hasConflictValue === ''
          ? undefined
          : hasConflictValue === 'true',
      needsRecheck:
        needsRecheckValue === ''
          ? undefined
          : needsRecheckValue === 'true',
      hasTrainingHints:
        hasTrainingHintsValue === ''
          ? undefined
          : hasTrainingHintsValue === 'true',
      recommendedAction:
        recommendedActionValue === ''
          ? undefined
          : (recommendedActionValue as RepositoryListQueryState['recommendedAction']),
      createdAfterDays: keepImplicitViewFilters ? query.createdAfterDays : undefined,
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

  function handleKeepOnlyCurrentView() {
    const search = buildRepositoryListSearchParams(
      applyRepositoryViewQuery(
        {
          page: 1,
          pageSize: query.pageSize,
          view: query.view,
          displayMode: query.displayMode,
          sortBy: 'moneyPriority',
          order: 'desc',
        },
        query.view,
      ),
    );

    startTransition(() => {
      router.push(search ? `${pathname}?${search}` : pathname);
    });
  }

  function handleSwitchToManualFilters() {
    const search = buildRepositoryListSearchParams({
      ...applyRepositoryViewQuery(
        stripActiveRepositoryViewPresetFilters({
          ...query,
          page: 1,
        }),
        'all',
      ),
    });

    startTransition(() => {
      router.push(search ? `${pathname}?${search}` : pathname);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            快速筛选
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            先缩小到你今天真正想判断的项目。
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            首页首屏只保留搜索、最终结论、建议动作和挣钱优先级。其他查询条件都放到高级筛选里，避免打断你的判断节奏。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? '更新中...' : '应用筛选'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            重置
          </button>
        </div>
      </div>

      {activeFilterChips.length ? (
        <section className="mt-5 rounded-[24px] border border-slate-200 bg-white px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">当前生效条件</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {viewPresetChips > 0
                  ? `当前视角自带 ${viewPresetChips} 项条件；你另外手动加了 ${manualFilterChips} 项。切换视角时只会替换“视角自带条件”。`
                  : '当前这些条件都来自你手动添加的筛选。'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {viewPresetChips > 0 ? (
                <button
                  type="button"
                  onClick={handleSwitchToManualFilters}
                  disabled={isPending}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  切到纯手动筛选
                </button>
              ) : null}
              {manualFilterChips > 0 ? (
                <button
                  type="button"
                  onClick={handleKeepOnlyCurrentView}
                  disabled={isPending}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  只保留当前视角条件
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleReset}
                disabled={isPending}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                清空全部条件
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                视角自带条件
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeFilterChips
                  .filter((chip) => chip.scope === 'view')
                  .map((chip) => (
                    <span
                      key={chip.key}
                      className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800"
                    >
                      {chip.label}
                    </span>
                  ))}
                {viewPresetChips === 0 ? (
                  <span className="text-sm text-slate-500">当前没有视角预设。</span>
                ) : null}
              </div>
            </div>

            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                你手动加的条件
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeFilterChips
                  .filter((chip) => chip.scope === 'manual')
                  .map((chip) => (
                    <span
                      key={chip.key}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      {chip.label}
                    </span>
                  ))}
                {manualFilterChips === 0 ? (
                  <span className="text-sm text-slate-500">
                    目前只在使用当前视角的默认条件。
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <FilterField label="搜索">
          <input
            name="keyword"
            defaultValue={query.keyword ?? ''}
            placeholder="仓库名、描述、owner"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
        </FilterField>

        <FilterField label="最终结论">
          <select
            name="finalVerdict"
            defaultValue={query.finalVerdict ?? ''}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
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
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
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
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          >
            <option value="">全部</option>
            <option value="P0">P0 · 能赚钱</option>
            <option value="P1">P1 · 值得做</option>
            <option value="P2">P2 · 值得借鉴</option>
            <option value="P3">P3 · 低优先</option>
          </select>
        </FilterField>
      </div>

      <details
        open={showAdvancedByDefault}
        className="mt-5 rounded-[24px] border border-slate-200 bg-white"
      >
        <summary className="cursor-pointer list-none px-5 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">高级筛选</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                只有在你想做精细查询、排查冲突或补看系统状态时，再展开这些条件。
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {advancedFilterCount > 0
                ? `已启用 ${advancedFilterCount} 项`
                : '默认折叠'}
            </span>
          </div>
        </summary>

        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FilterField label="语言">
              <input
                name="language"
                defaultValue={query.language ?? ''}
                placeholder="TypeScript / Python"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </FilterField>

            <FilterField label="创业等级">
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
            </FilterField>

            <FilterField label="收藏">
              <select
                name="isFavorited"
                defaultValue={
                  typeof query.isFavorited === 'boolean'
                    ? String(query.isFavorited)
                    : ''
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">全部</option>
                <option value="true">仅已收藏</option>
                <option value="false">仅未收藏</option>
              </select>
            </FilterField>

            <FilterField label="粗筛结果">
              <select
                name="roughPass"
                defaultValue={
                  typeof query.roughPass === 'boolean'
                    ? String(query.roughPass)
                    : ''
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">全部</option>
                <option value="true">仅已通过</option>
                <option value="false">仅未通过</option>
              </select>
            </FilterField>

            <FilterField label="最低 Stars">
              <input
                name="minStars"
                type="number"
                min={0}
                defaultValue={query.minStars ?? ''}
                placeholder="100"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </FilterField>

            <FilterField label="最低总分">
              <input
                name="minFinalScore"
                type="number"
                min={0}
                defaultValue={query.minFinalScore ?? ''}
                placeholder="70"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </FilterField>

            <FilterField label="完整性分析">
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
            </FilterField>

            <FilterField label="Idea Fit">
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
            </FilterField>

            <FilterField label="点子提取">
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
            </FilterField>

            <FilterField label="好点子结论">
              <select
                name="hasGoodInsight"
                defaultValue={
                  typeof query.hasGoodInsight === 'boolean'
                    ? String(query.hasGoodInsight)
                    : ''
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">全部</option>
                <option value="true">只看好点子</option>
                <option value="false">排除好点子</option>
              </select>
            </FilterField>

            <FilterField label="人工判断">
              <select
                name="hasManualInsight"
                defaultValue={
                  typeof query.hasManualInsight === 'boolean'
                    ? String(query.hasManualInsight)
                    : ''
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">全部</option>
                <option value="true">只看我判断过的</option>
                <option value="false">排除人工判断</option>
              </select>
            </FilterField>

            <FilterField label="最终分类">
              <>
                <input
                  list="repository-final-category-options"
                  name="finalCategory"
                  value={categoryDraft}
                  onChange={(event) => setCategoryDraft(event.target.value)}
                  placeholder="开发工具 / 安全工具"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
                <datalist id="repository-final-category-options">
                  {COMMON_CATEGORY_SUGGESTIONS.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
                <div className="mt-3 flex flex-wrap gap-2">
                  {COMMON_CATEGORY_SUGGESTIONS.map((category) => {
                    const isActive = categoryDraft === category;

                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() =>
                          setCategoryDraft((current) =>
                            current === category ? '' : category,
                          )
                        }
                        className={`inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold transition ${
                          isActive
                            ? 'border-slate-950 bg-slate-950 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  支持关键词匹配。可以直接点常见分类，也可以继续手输关键词，尽量减少分类口径不一致。
                </p>
              </>
            </FilterField>

            <FilterField label="判断来源">
              <select
                name="decisionSource"
                defaultValue={query.decisionSource ?? ''}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">全部</option>
                <option value="manual">人工</option>
                <option value="claude">历史复核</option>
                <option value="local">主分析</option>
                <option value="fallback">兜底</option>
              </select>
            </FilterField>

            <FilterField label="冲突状态">
              <select
                name="hasConflict"
                defaultValue={
                  typeof query.hasConflict === 'boolean'
                    ? String(query.hasConflict)
                    : ''
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">全部</option>
                <option value="true">只看有冲突</option>
                <option value="false">只看无冲突</option>
              </select>
            </FilterField>

            <FilterField label="需要复查">
              <select
                name="needsRecheck"
                defaultValue={
                  typeof query.needsRecheck === 'boolean'
                    ? String(query.needsRecheck)
                    : ''
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">全部</option>
                <option value="true">只看待复查</option>
                <option value="false">只看已收敛</option>
              </select>
            </FilterField>

            <FilterField label="训练提示">
              <select
                name="hasTrainingHints"
                defaultValue={
                  typeof query.hasTrainingHints === 'boolean'
                    ? String(query.hasTrainingHints)
                    : ''
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">全部</option>
                <option value="true">只看可教学样本</option>
                <option value="false">排除训练提示</option>
              </select>
            </FilterField>

            <FilterField label="每页数量">
              <select
                name="pageSize"
                defaultValue={String(query.pageSize)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </FilterField>

            <FilterField label="排序字段">
              <select
                name="sortBy"
                defaultValue={query.sortBy}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="latest">最近更新</option>
                <option value="moneyPriority">挣钱优先</option>
                <option value="insightPriority">创业判断优先</option>
                <option value="stars">Stars</option>
                <option value="finalScore">总分</option>
                <option value="ideaFitScore">创业匹配度</option>
                <option value="createdAt">创建时间</option>
                <option value="createdAtGithub">GitHub 创建时间</option>
              </select>
            </FilterField>

            <FilterField label="顺序">
              <select
                name="order"
                defaultValue={query.order}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </FilterField>
          </div>
        </div>
      </details>
    </form>
  );
}

function shouldKeepImplicitViewFilters(
  view: RepositoryListQueryState['view'],
) {
  return view === 'newRadar' || view === 'backfilledPromising';
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

function countAdvancedFilters(
  query: RepositoryListQueryState,
  activeViewPresetKeys: Set<keyof RepositoryListQueryState>,
) {
  return Object.entries(query).reduce((count, [key, value]) => {
    if (PRIMARY_FILTER_KEYS.includes(key as (typeof PRIMARY_FILTER_KEYS)[number])) {
      return count;
    }

    if (key === 'page' || key === 'view' || key === 'displayMode') {
      return count;
    }

    if (activeViewPresetKeys.has(key as keyof RepositoryListQueryState)) {
      return count;
    }

    if (key === 'pageSize') {
      return value !== 20 ? count + 1 : count;
    }

    if (key === 'sortBy') {
      return value !== 'moneyPriority' ? count + 1 : count;
    }

    if (key === 'order') {
      return value !== 'desc' ? count + 1 : count;
    }

    if (value === undefined || value === null || value === '') {
      return count;
    }

    return count + 1;
  }, 0);
}

function buildActiveFilterChips(
  query: RepositoryListQueryState,
  activeViewPresetKeys: Set<keyof RepositoryListQueryState>,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (query.view !== 'moneyFirst') {
    chips.push({
      key: `view:${query.view}`,
      label: `当前视角 · ${getRepositoryViewMeta(query.view).label}`,
      scope: 'view',
    });
  }

  if (query.keyword) {
    chips.push({
      key: 'keyword',
      label: `搜索 · ${query.keyword}`,
      scope: 'manual',
    });
  }

  if (query.finalVerdict) {
    chips.push({
      key: 'finalVerdict',
      label: `最终结论 · ${formatFinalVerdict(query.finalVerdict)}`,
      scope: activeViewPresetKeys.has('finalVerdict') ? 'view' : 'manual',
    });
  }

  if (query.recommendedAction) {
    chips.push({
      key: 'recommendedAction',
      label: `建议动作 · ${formatRecommendedAction(query.recommendedAction)}`,
      scope: 'manual',
    });
  }

  if (query.moneyPriority) {
    chips.push({
      key: 'moneyPriority',
      label: `挣钱优先级 · ${query.moneyPriority}`,
      scope: 'manual',
    });
  }

  if (query.language) {
    chips.push({
      key: 'language',
      label: `语言 · ${query.language}`,
      scope: 'manual',
    });
  }

  if (query.opportunityLevel) {
    chips.push({
      key: 'opportunityLevel',
      label: `创业等级 · ${formatOpportunityLevel(query.opportunityLevel)}`,
      scope: activeViewPresetKeys.has('opportunityLevel') ? 'view' : 'manual',
    });
  }

  if (typeof query.isFavorited === 'boolean') {
    chips.push({
      key: 'isFavorited',
      label: `收藏 · ${query.isFavorited ? '仅已收藏' : '仅未收藏'}`,
      scope: activeViewPresetKeys.has('isFavorited') ? 'view' : 'manual',
    });
  }

  if (typeof query.roughPass === 'boolean') {
    chips.push({
      key: 'roughPass',
      label: `粗筛结果 · ${query.roughPass ? '仅已通过' : '仅未通过'}`,
      scope: 'manual',
    });
  }

  if (typeof query.hasCompletenessAnalysis === 'boolean') {
    chips.push({
      key: 'hasCompletenessAnalysis',
      label: `完整性分析 · ${query.hasCompletenessAnalysis ? '已完成' : '未完成'}`,
      scope: 'manual',
    });
  }

  if (typeof query.hasIdeaFitAnalysis === 'boolean') {
    chips.push({
      key: 'hasIdeaFitAnalysis',
      label: `Idea Fit · ${query.hasIdeaFitAnalysis ? '已完成' : '未完成'}`,
      scope: activeViewPresetKeys.has('hasIdeaFitAnalysis') ? 'view' : 'manual',
    });
  }

  if (typeof query.hasExtractedIdea === 'boolean') {
    chips.push({
      key: 'hasExtractedIdea',
      label: `点子提取 · ${query.hasExtractedIdea ? '已完成' : '未完成'}`,
      scope: activeViewPresetKeys.has('hasExtractedIdea') ? 'view' : 'manual',
    });
  }

  if (typeof query.hasPromisingIdeaSnapshot === 'boolean') {
    chips.push({
      key: 'hasPromisingIdeaSnapshot',
      label: `候选快照 · ${query.hasPromisingIdeaSnapshot ? '仅保留 promising' : '排除 promising'}`,
      scope: 'view',
    });
  }

  if (typeof query.hasGoodInsight === 'boolean') {
    chips.push({
      key: 'hasGoodInsight',
      label: `好点子结论 · ${query.hasGoodInsight ? '只看好点子' : '排除好点子'}`,
      scope: activeViewPresetKeys.has('hasGoodInsight') ? 'view' : 'manual',
    });
  }

  if (typeof query.hasManualInsight === 'boolean') {
    chips.push({
      key: 'hasManualInsight',
      label: `人工判断 · ${query.hasManualInsight ? '只看我判断过的' : '排除人工判断'}`,
      scope: 'manual',
    });
  }

  if (query.finalCategory) {
    chips.push({
      key: 'finalCategory',
      label: `最终分类 · ${query.finalCategory}`,
      scope: 'manual',
    });
  }

  if (query.decisionSource) {
    chips.push({
      key: 'decisionSource',
      label: `判断来源 · ${formatDecisionSource(query.decisionSource)}`,
      scope: 'manual',
    });
  }

  if (typeof query.hasConflict === 'boolean') {
    chips.push({
      key: 'hasConflict',
      label: `冲突状态 · ${query.hasConflict ? '只看有冲突' : '只看无冲突'}`,
      scope: 'manual',
    });
  }

  if (typeof query.needsRecheck === 'boolean') {
    chips.push({
      key: 'needsRecheck',
      label: `复查状态 · ${query.needsRecheck ? '只看待复查' : '只看已收敛'}`,
      scope: 'manual',
    });
  }

  if (typeof query.hasTrainingHints === 'boolean') {
    chips.push({
      key: 'hasTrainingHints',
      label: `训练提示 · ${query.hasTrainingHints ? '只看可教学样本' : '排除训练提示'}`,
      scope: 'manual',
    });
  }

  if (typeof query.createdAfterDays === 'number') {
    chips.push({
      key: 'createdAfterDays',
      label: `创建时间 · 最近 ${query.createdAfterDays} 天`,
      scope: activeViewPresetKeys.has('createdAfterDays') ? 'view' : 'manual',
    });
  }

  if (typeof query.minStars === 'number') {
    chips.push({
      key: 'minStars',
      label: `Stars ≥ ${query.minStars}`,
      scope: 'manual',
    });
  }

  if (typeof query.minFinalScore === 'number') {
    chips.push({
      key: 'minFinalScore',
      label: `总分 ≥ ${query.minFinalScore}`,
      scope: 'manual',
    });
  }

  return chips;
}

function formatFinalVerdict(value: NonNullable<RepositoryListQueryState['finalVerdict']>) {
  if (value === 'GOOD') {
    return '只看值得做';
  }

  if (value === 'OK') {
    return '只看可继续看';
  }

  return '只看建议跳过';
}

function formatRecommendedAction(
  value: NonNullable<RepositoryListQueryState['recommendedAction']>,
) {
  if (value === 'BUILD') {
    return '只看值得做';
  }

  if (value === 'CLONE') {
    return '只看值得借鉴';
  }

  return '只看建议跳过';
}

function formatOpportunityLevel(
  value: NonNullable<RepositoryListQueryState['opportunityLevel']>,
) {
  if (value === 'HIGH') {
    return '高潜力';
  }

  if (value === 'MEDIUM') {
    return '中潜力';
  }

  return '低潜力';
}

function formatDecisionSource(
  value: NonNullable<RepositoryListQueryState['decisionSource']>,
) {
  if (value === 'manual') {
    return '人工';
  }

  if (value === 'claude') {
    return '历史复核';
  }

  if (value === 'local') {
    return '主分析';
  }

  return '兜底';
}
