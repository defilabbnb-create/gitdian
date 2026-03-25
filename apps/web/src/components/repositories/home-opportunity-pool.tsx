'use client';

import { useEffect, useState } from 'react';
import { getRepositories } from '@/lib/api/repositories';
import { ExportAssetBundlesButton } from '@/components/repositories/export-asset-bundles-button';
import { ExportRepositoriesButton } from '@/components/repositories/export-repositories-button';
import { RepositoryFilters } from '@/components/repositories/repository-filters';
import { RepositoryList } from '@/components/repositories/repository-list';
import { RepositoryViewSwitcher } from '@/components/repositories/repository-view-switcher';
import { RepositoryListQueryState, RepositoryListResponse } from '@/lib/types/repository';

type HomeOpportunityPoolProps = {
  query: RepositoryListQueryState;
  notice: string | null;
  collapsedByDefault: boolean;
};

export function HomeOpportunityPool({
  query,
  notice,
  collapsedByDefault,
}: HomeOpportunityPoolProps) {
  const [isReady, setIsReady] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!collapsedByDefault);
  const [repositories, setRepositories] = useState<RepositoryListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!collapsedByDefault) {
      setIsExpanded(true);
      return;
    }

    if (window.location.hash === '#all-projects') {
      setIsExpanded(true);
    }
  }, [collapsedByDefault, isReady]);

  useEffect(() => {
    if (!isReady || !isExpanded || repositories || isLoading) {
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setLoadError(null);

    getRepositories(query, { timeoutMs: 8_000 })
      .then((response) => {
        if (isCancelled) {
          return;
        }

        setRepositories(response);
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setLoadError('完整机会池暂时无法加载，你稍后再展开一次即可。');
      })
      .finally(() => {
        if (isCancelled) {
          return;
        }

        setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [isExpanded, isLoading, isReady, query, repositories]);

  if (!isReady) {
    return null;
  }

  if (!isExpanded) {
    return (
      <section
        id="all-projects"
        className="flex flex-col items-center gap-3 px-2 py-1 text-center"
      >
        <p className="text-sm text-slate-500">
          需要继续深挖时，再展开完整机会池。
        </p>
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
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
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            全部项目池
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            只有在你准备继续深挖时，再打开这一层。
          </h2>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          aria-expanded={isExpanded}
          aria-controls="all-projects-panel"
        >
          {isExpanded ? '收起全部项目池' : '展开全部项目池'}
        </button>
      </div>

      <div id="all-projects-panel" className="mt-5 space-y-5">
        {notice ? (
          <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900 shadow-sm">
            {notice}
          </section>
        ) : null}

        {isLoading ? (
          <div className="space-y-4">
            <OpportunityPoolSkeleton />
          </div>
        ) : loadError ? (
          <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900 shadow-sm">
            {loadError}
          </section>
        ) : repositories ? (
          <>
            <section className="space-y-4 rounded-[32px] border border-slate-200 bg-slate-50/70 p-5 shadow-sm backdrop-blur">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  细查模式
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  想继续缩小范围时，再切视角和展开高级筛选。
                </h3>
              </div>
              <RepositoryViewSwitcher query={query} />
              <RepositoryFilters key={JSON.stringify(query)} query={query} />
            </section>

            <div className="flex flex-wrap justify-end gap-3">
              <ExportAssetBundlesButton />
              <ExportRepositoriesButton items={repositories.items} />
            </div>

            <RepositoryList
              items={repositories.items}
              pagination={repositories.pagination}
              query={query}
            />
          </>
        ) : null}
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
