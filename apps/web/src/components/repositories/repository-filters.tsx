'use client';

import type { ReactNode } from 'react';
import { FormEvent, startTransition, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  buildRepositoryListSearchParams,
  RepositoryListQueryState,
} from '@/lib/types/repository';

type RepositoryFiltersProps = {
  query: RepositoryListQueryState;
};

const PRIMARY_FILTER_KEYS = [
  'keyword',
  'finalVerdict',
  'recommendedAction',
  'moneyPriority',
] as const;

export function RepositoryFilters({ query }: RepositoryFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending] = useTransition();
  const advancedFilterCount = countAdvancedFilters(query);
  const showAdvancedByDefault = advancedFilterCount > 0;

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
    const finalVerdictValue = String(formData.get('finalVerdict') || '');
    const finalCategoryValue = String(formData.get('finalCategory') || '').trim();
    const moneyPriorityValue = String(formData.get('moneyPriority') || '');
    const decisionSourceValue = String(formData.get('decisionSource') || '');
    const hasConflictValue = String(formData.get('hasConflict') || '');
    const needsRecheckValue = String(formData.get('needsRecheck') || '');
    const hasTrainingHintsValue = String(formData.get('hasTrainingHints') || '');
    const recommendedActionValue = String(formData.get('recommendedAction') || '');

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
      hasPromisingIdeaSnapshot: query.hasPromisingIdeaSnapshot,
      hasGoodInsight:
        hasGoodInsightValue === ''
          ? undefined
          : hasGoodInsightValue === 'true',
      hasManualInsight: query.hasManualInsight,
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

            <FilterField label="最终分类">
              <input
                name="finalCategory"
                defaultValue={query.finalCategory ?? ''}
                placeholder="开发工具 / 安全工具"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </FilterField>

            <FilterField label="判断来源">
              <select
                name="decisionSource"
                defaultValue={query.decisionSource ?? ''}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">全部</option>
                <option value="manual">人工</option>
                <option value="claude">Claude</option>
                <option value="local">本地模型</option>
                <option value="fallback">Fallback</option>
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

function countAdvancedFilters(query: RepositoryListQueryState) {
  return Object.entries(query).reduce((count, [key, value]) => {
    if (PRIMARY_FILTER_KEYS.includes(key as (typeof PRIMARY_FILTER_KEYS)[number])) {
      return count;
    }

    if (key === 'page' || key === 'view' || key === 'displayMode') {
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
