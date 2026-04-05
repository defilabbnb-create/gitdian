'use client';

import { useEffect, useMemo, useReducer, useRef } from 'react';
import { AppPageHero } from '@/components/app/page-shell';
import { RuntimeFailurePanel } from '@/components/runtime-failure-panel';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';
import { getRepositories } from '@/lib/api/repositories';
import {
  createOpportunityPoolIdleState,
  reduceOpportunityPoolState,
  shouldLoadOpportunityPool,
  type OpportunityPoolState,
} from '@/lib/opportunity-pool-state';
import {
  RepositoryListResponse,
  type RepositoryListQueryState,
} from '@/lib/types/repository';
import { RepositoryFilters } from './repository-filters';
import { RepositoryList } from './repository-list';

const REPOSITORIES_PAGE_TIMEOUT_MS = 15_000;

type RepositoriesExplorerProps = {
  query: RepositoryListQueryState;
  initialResponse?: RepositoryListResponse | null;
};

export function RepositoriesExplorer({
  query,
  initialResponse,
}: RepositoriesExplorerProps) {
  const queryKey = JSON.stringify(query);
  const [loadState, dispatch] = useReducer(
    reduceOpportunityPoolState,
    initialResponse
      ? initialResponse.items.length
        ? { status: 'success', queryKey, response: initialResponse }
        : { status: 'empty', queryKey, response: initialResponse }
      : createOpportunityPoolIdleState(queryKey),
  );
  const loadStateRef = useRef<OpportunityPoolState>(loadState);

  useEffect(() => {
    loadStateRef.current = loadState;
  }, [loadState]);

  useEffect(() => {
    if (
      !shouldLoadOpportunityPool(loadStateRef.current, {
        isExpanded: true,
        queryKey,
      })
    ) {
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();

    dispatch({
      type: 'start',
      queryKey,
    });

    getRepositories(query, {
      signal: controller.signal,
      timeoutMs: REPOSITORIES_PAGE_TIMEOUT_MS,
    })
      .then((response) => {
        if (isCancelled) {
          return;
        }

        dispatch({
          type: 'resolve',
          queryKey,
          response,
        });
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        dispatch({
          type: 'fail',
          queryKey,
          errorMessage: getFriendlyRuntimeError(
            error,
            '项目列表暂时不可用，请稍后重试。',
          ),
        });
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [query, queryKey]);

  const countLabel = useMemo(() => {
    if (loadState.status !== 'success' && loadState.status !== 'empty') {
      return '正在加载当前筛选结果';
    }

    return `当前条件下共 ${loadState.response.pagination.total.toLocaleString()} 个项目`;
  }, [loadState]);
  const activeSummary = useMemo(() => buildActiveQuerySummary(query), [query]);

  return (
    <section className="space-y-5">
      <AppPageHero
        eyebrow="项目列表"
        title="真正的筛选工作台，不是信息堆叠页。"
        description="这里要同时服务两个动作：快速扫一遍当前值得看的项目，以及在需要时继续深入到单仓库详情。默认先给你清晰的筛选摘要、结果规模和排序口径。"
        tone="slate"
        chips={activeSummary}
        stats={[
          {
            label: '当前结果',
            value: countLabel,
            helper: '结果数随筛选条件实时变化。',
          },
          {
            label: '当前显示',
            value: '第一页 20 条',
            helper: '先保证首屏速度，再逐页展开。',
          },
        ]}
      />

      <RepositoryFilters query={query} />

      {loadState.status === 'loading' || loadState.status === 'idle' ? (
        <RepositoriesResultsSkeleton />
      ) : null}

      {loadState.status === 'error' ? (
        <RuntimeFailurePanel
          title="项目列表暂时加载失败"
          message={loadState.errorMessage}
          recoveryLabel="重新加载项目列表"
          recoveryHref="/repositories"
        />
      ) : null}

      {loadState.status === 'success' || loadState.status === 'empty' ? (
        <RepositoryList
          items={loadState.response.items}
          pagination={loadState.response.pagination}
          query={query}
          basePath="/repositories"
          showHeader={false}
        />
      ) : null}
    </section>
  );
}

function RepositoriesResultsSkeleton() {
  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="h-4 w-24 rounded-full bg-slate-200" />
        <div className="mt-4 h-8 w-72 rounded-full bg-slate-200" />
        <div className="mt-3 h-4 w-80 rounded-full bg-slate-200" />
      </section>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-64 rounded-[28px] border border-slate-200 bg-white"
        />
      ))}
    </div>
  );
}

function buildActiveQuerySummary(query: RepositoryListQueryState) {
  const summary = [
    query.keyword ? `搜索：${query.keyword}` : null,
    query.finalVerdict ? `最终结论：${getFinalVerdictLabel(query.finalVerdict)}` : null,
    query.recommendedAction
      ? `建议动作：${getRecommendedActionLabel(query.recommendedAction)}`
      : null,
    query.moneyPriority ? `挣钱优先级：${query.moneyPriority}` : null,
    `排序：${getSortLabel(query.sortBy)}`,
  ].filter((item): item is string => Boolean(item));

  return summary.length ? summary : ['当前先按默认条件筛第一页结果'];
}

function getFinalVerdictLabel(value: RepositoryListQueryState['finalVerdict']) {
  switch (value) {
    case 'GOOD':
      return '值得做';
    case 'OK':
      return '可继续看';
    case 'BAD':
      return '建议跳过';
    default:
      return '全部';
  }
}

function getRecommendedActionLabel(
  value: RepositoryListQueryState['recommendedAction'],
) {
  switch (value) {
    case 'BUILD':
      return '值得做';
    case 'CLONE':
      return '值得借鉴';
    case 'IGNORE':
      return '建议跳过';
    default:
      return '全部';
  }
}

function getSortLabel(value: RepositoryListQueryState['sortBy']) {
  switch (value) {
    case 'moneyPriority':
      return '挣钱优先';
    case 'insightPriority':
      return '创业判断优先';
    case 'latest':
      return '最近更新';
    case 'stars':
      return 'Stars';
    case 'finalScore':
      return '总分';
    case 'ideaFitScore':
      return '创业匹配度';
    case 'createdAtGithub':
      return 'GitHub 创建时间';
    case 'createdAt':
      return '入库时间';
    default:
      return value;
  }
}
