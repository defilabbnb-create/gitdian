'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';
import { getRepositories } from '@/lib/api/repositories';
import {
  createOpportunityPoolIdleState,
  getOpportunityPoolViewState,
  OpportunityPoolState,
  reduceOpportunityPoolState,
  shouldLoadOpportunityPool,
} from '@/lib/opportunity-pool-state';
import { ExportAssetBundlesButton } from '@/components/repositories/export-asset-bundles-button';
import { ExportRepositoriesButton } from '@/components/repositories/export-repositories-button';
import { RepositoryFilters } from '@/components/repositories/repository-filters';
import { RepositoryList } from '@/components/repositories/repository-list';
import { RepositoryQuickFilters } from '@/components/repositories/repository-quick-filters';
import { RepositoryViewSwitcher } from '@/components/repositories/repository-view-switcher';
import {
  RepositoryListItem,
  RepositoryListQueryState,
  RepositoryListResponse,
} from '@/lib/types/repository';

type HomeOpportunityPoolProps = {
  query: RepositoryListQueryState;
  notice: string | null;
  collapsedByDefault: boolean;
  initialResponse?: RepositoryListResponse | null;
};

type OpportunityPoolPanelContentProps = {
  notice: string | null;
  query: RepositoryListQueryState;
  loadState: OpportunityPoolState;
  onRetry: () => void;
  showRefinementControls?: boolean;
  showInteractiveList?: boolean;
};

const OPPORTUNITY_POOL_TIMEOUT_MS = 9_000;

function logOpportunityPoolDebug(
  event: string,
  payload: Record<string, unknown>,
) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  console.info('[home-opportunity-pool]', event, payload);
}

function getOpportunityPoolErrorMessage(error: unknown, timedOut: boolean) {
  if (timedOut) {
    return '完整机会池加载超时了，请重试一次。';
  }

  return getFriendlyRuntimeError(
    error,
    '完整机会池暂时无法加载，你稍后再展开一次即可。',
  );
}

function createInitialOpportunityPoolState(
  queryKey: string,
  initialResponse?: RepositoryListResponse | null,
): OpportunityPoolState {
  if (!initialResponse) {
    return createOpportunityPoolIdleState(queryKey);
  }

  return initialResponse.items.length > 0
    ? {
        status: 'success',
        queryKey,
        response: initialResponse,
      }
    : {
        status: 'empty',
        queryKey,
        response: initialResponse,
      };
}

export function HomeOpportunityPool({
  query,
  notice,
  collapsedByDefault,
  initialResponse,
}: HomeOpportunityPoolProps) {
  const queryKey = JSON.stringify(query);
  const [isExpanded, setIsExpanded] = useState(!collapsedByDefault);
  const [requestEpoch, setRequestEpoch] = useState(0);
  const [loadState, dispatch] = useReducer(
    reduceOpportunityPoolState,
    createInitialOpportunityPoolState(queryKey, initialResponse),
  );
  const loadStateRef = useRef(loadState);
  const viewState = getOpportunityPoolViewState(loadState, {
    isExpanded,
  });

  useEffect(() => {
    loadStateRef.current = loadState;
  }, [loadState]);

  useEffect(() => {
    if (collapsedByDefault && window.location.hash === '#all-projects') {
      setIsExpanded(true);
    }
  }, [collapsedByDefault]);

  useEffect(() => {
    if (isExpanded) {
      return;
    }

    dispatch({
      type: 'collapse',
      queryKey,
    });
  }, [isExpanded, queryKey]);

  useEffect(() => {
    logOpportunityPoolDebug('state:changed', {
      queryKey,
      isExpanded,
      loadState: loadState.status,
      viewState,
    });
  }, [isExpanded, loadState.status, queryKey, viewState]);

  useEffect(() => {
    if (
      !shouldLoadOpportunityPool(loadStateRef.current, {
        isExpanded,
        queryKey,
      })
    ) {
      return;
    }

    let isCancelled = false;
    let didTimeout = false;
    const controller = new AbortController();

    dispatch({
      type: 'start',
      queryKey,
    });
    logOpportunityPoolDebug('request:start', {
      queryKey,
      query,
    });

    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, OPPORTUNITY_POOL_TIMEOUT_MS);

    getRepositories(query, {
      signal: controller.signal,
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
        logOpportunityPoolDebug('request:success', {
          queryKey,
          count: response.items.length,
        });
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        const errorMessage = getOpportunityPoolErrorMessage(error, didTimeout);
        dispatch({
          type: 'fail',
          queryKey,
          errorMessage,
        });
        logOpportunityPoolDebug('request:error', {
          queryKey,
          timedOut: didTimeout,
          message: errorMessage,
        });
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isExpanded, query, queryKey, requestEpoch]);

  if (!isExpanded) {
    return (
      <section
        id="all-projects"
        className="flex flex-col items-center gap-3 px-2 py-1 text-center"
        data-opportunity-pool-view={viewState}
      >
        <p className="text-sm text-slate-500">
          完整项目池已经支持直接筛选和查看中文分析，随时可以展开细查。
        </p>
        <button
          type="button"
          onClick={() => {
            logOpportunityPoolDebug('click:expand', {
              queryKey,
            });
            setIsExpanded(true);
          }}
          className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          aria-expanded={false}
          aria-controls="all-projects-panel"
        >
          展开完整机会池
        </button>
      </section>
    );
  }

  return (
    <section
      id="all-projects"
      className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur"
      data-opportunity-pool-view={viewState}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            全部项目池
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            直接在这里筛选、分类并查看完整中文分析，不再把大部分项目藏在折叠层后面。
          </h2>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsExpanded((current) => {
              const nextExpanded = !current;
              logOpportunityPoolDebug('click:toggle', {
                queryKey,
                nextExpanded,
              });
              return nextExpanded;
            });
          }}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          aria-expanded={isExpanded}
          aria-controls="all-projects-panel"
        >
          {isExpanded ? '收起全部项目池' : '展开全部项目池'}
        </button>
      </div>

      <OpportunityPoolPanelContent
        notice={notice}
        query={query}
        loadState={loadState}
        onRetry={() => {
          logOpportunityPoolDebug('click:retry', {
            queryKey,
          });
          dispatch({
            type: 'reset',
            queryKey,
          });
          setRequestEpoch((current) => current + 1);
        }}
      />
    </section>
  );
}

export function OpportunityPoolPanelContent({
  notice,
  query,
  loadState,
  onRetry,
  showRefinementControls = true,
  showInteractiveList = true,
}: OpportunityPoolPanelContentProps) {
  return (
    <div
      id="all-projects-panel"
      className="mt-5 space-y-5"
      data-opportunity-pool-state={loadState.status}
      data-opportunity-pool-view={loadState.status}
    >
      {notice ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900 shadow-sm">
          {notice}
        </section>
      ) : null}

      {loadState.status === 'loading' ? (
        <div className="space-y-4" data-opportunity-pool-skeleton="true">
          <OpportunityPoolSkeleton />
        </div>
      ) : null}

      {loadState.status === 'error' ? (
        <section
          className="rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-5 shadow-sm"
          data-opportunity-pool-error="true"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
            加载失败
          </p>
          <h3 className="mt-3 text-lg font-semibold tracking-tight text-rose-950">
            完整机会池暂时无法加载
          </h3>
          <p className="mt-2 text-sm leading-7 text-rose-800">
            {loadState.errorMessage}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl border border-rose-300 bg-white px-5 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-100"
          >
            重试
          </button>
        </section>
      ) : null}

      {loadState.status === 'empty' ? (
        <>
          {showRefinementControls ? (
            <OpportunityPoolRefinementControls query={query} />
          ) : null}
          <OpportunityPoolEmptyState />
        </>
      ) : null}

      {loadState.status === 'success' ? (
        <>
          {showRefinementControls ? (
            <OpportunityPoolRefinementControls query={query} />
          ) : null}

          {showInteractiveList ? (
            <>
              <div className="flex flex-wrap justify-end gap-3">
                <ExportAssetBundlesButton />
                <ExportRepositoriesButton items={loadState.response.items} />
              </div>

              <div data-opportunity-pool-list="true">
                <RepositoryList
                  items={loadState.response.items}
                  pagination={loadState.response.pagination}
                  query={query}
                />
              </div>
            </>
          ) : (
            <OpportunityPoolSuccessPreview items={loadState.response.items} />
          )}
        </>
      ) : null}
    </div>
  );
}

function OpportunityPoolRefinementControls({
  query,
}: {
  query: RepositoryListQueryState;
}) {
  return (
    <section className="space-y-4 rounded-[32px] border border-slate-200 bg-slate-50/70 p-5 shadow-sm backdrop-blur">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          细查模式
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
          先用快捷条件缩到可看范围，再切视角和展开高级筛选。
        </h3>
      </div>
      <RepositoryQuickFilters query={query} />
      <RepositoryViewSwitcher query={query} />
      <RepositoryFilters key={JSON.stringify(query)} query={query} />
    </section>
  );
}

function OpportunityPoolEmptyState() {
  return (
    <section
      className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm"
      data-opportunity-pool-empty="true"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
        暂无结果
      </p>
      <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
        完整机会池当前没有可展示项目
      </h3>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
        可以先放宽筛选条件，或者等待后端补完更多分析数据后再回来查看。
      </p>
    </section>
  );
}

function OpportunityPoolSuccessPreview({
  items,
}: {
  items: RepositoryListItem[];
}) {
  return (
    <section
      className="rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-sm"
      data-opportunity-pool-list="true"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        完整机会池
      </p>
      <div className="mt-4 space-y-3">
        {items.map((repository) => (
          <p key={repository.id} className="text-sm text-slate-700">
            {repository.fullName}
          </p>
        ))}
      </div>
    </section>
  );
}

function OpportunityPoolSkeleton() {
  return (
    <>
      <section className="space-y-4 rounded-[32px] border border-slate-200 bg-slate-50/70 p-5 shadow-sm backdrop-blur">
        <div className="h-3 w-24 rounded-full bg-slate-200" />
        <div className="h-8 w-72 rounded-full bg-slate-200" />
        <div className="grid gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-12 rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>
        <div className="h-32 rounded-[24px] border border-slate-200 bg-white" />
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <div className="h-11 w-32 rounded-2xl bg-slate-200" />
        <div className="h-11 w-32 rounded-2xl bg-slate-200" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-64 rounded-[28px] border border-slate-200 bg-white"
          />
        ))}
      </div>
    </>
  );
}
