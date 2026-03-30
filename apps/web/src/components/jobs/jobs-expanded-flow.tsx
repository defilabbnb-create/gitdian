'use client';

import { useEffect, useState } from 'react';
import { JobContextBanner } from '@/components/jobs/job-context-banner';
import { JobFilters } from '@/components/jobs/job-filters';
import { JobList } from '@/components/jobs/job-list';
import {
  JobLogItem,
  JobLogQueryState,
  PaginationMeta,
  RepositoryDetail,
} from '@/lib/types/repository';

type JobsExpandedFlowProps = {
  items: JobLogItem[];
  pagination: PaginationMeta;
  query: JobLogQueryState;
  currentRepositoryId?: string;
  focusedJobId?: string;
  repositoryContext?: Pick<RepositoryDetail, 'id' | 'name' | 'fullName'> | null;
  repositoryContextErrorMessage?: string | null;
  showFilters?: boolean;
  showActions?: boolean;
};

export function JobsExpandedFlow({
  items,
  pagination,
  query,
  currentRepositoryId,
  focusedJobId,
  repositoryContext,
  repositoryContextErrorMessage,
  showFilters = true,
  showActions = true,
}: JobsExpandedFlowProps) {
  const [isExpanded, setIsExpanded] = useState(Boolean(focusedJobId));
  const activeFilterBadges = buildExpandedFlowBadges({
    itemCount: items.length,
    pagination,
    query,
  });

  useEffect(() => {
    if (focusedJobId) {
      setIsExpanded(true);
      return;
    }

    if (
      typeof window !== 'undefined' &&
      (window.location.hash === '#jobs-expanded-flow' ||
        window.location.hash.startsWith('#job-'))
    ) {
      setIsExpanded(true);
    }
  }, [focusedJobId]);

  return (
    <section
      id="jobs-expanded-flow"
      className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur"
      data-jobs-expanded-flow={isExpanded ? 'expanded' : 'collapsed'}
      data-testid="jobs-expanded-flow"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            完整任务流
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            只有在你要全量排查时，再展开完整任务流。
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            首屏先告诉你现在要不要处理；筛选、仓库上下文和整批任务历史都放到这一层。
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            {activeFilterBadges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="inline-flex w-full items-center justify-center rounded-full border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
        >
          {isExpanded ? '收起完整任务流' : '展开完整任务流'}
        </button>
      </div>

      {isExpanded ? (
        <div className="mt-6 space-y-6">
          {showFilters ? <JobFilters query={query} /> : null}

          {query.repositoryId ? (
            <JobContextBanner
              query={query}
              repositoryId={query.repositoryId}
              repository={repositoryContext}
              repositoryError={repositoryContextErrorMessage}
            />
          ) : null}

          <JobList
            items={items}
            pagination={pagination}
            query={query}
            currentRepositoryId={currentRepositoryId}
            focusedJobId={focusedJobId}
            showActions={showActions}
          />
        </div>
      ) : null}
    </section>
  );
}

function buildExpandedFlowBadges(args: {
  itemCount: number;
  pagination: PaginationMeta;
  query: JobLogQueryState;
}) {
  const badges = [`当前页 ${args.itemCount} 条`, `总任务 ${args.pagination.total} 条`];

  if (args.query.jobName) {
    badges.push(`任务类型 · ${args.query.jobName}`);
  }

  if (args.query.jobStatus) {
    badges.push(`任务状态 · ${args.query.jobStatus}`);
  }

  if (args.query.pageSize !== 20) {
    badges.push(`每页 ${args.query.pageSize} 条`);
  }

  if (args.query.repositoryId) {
    badges.push('限定当前仓库');
  }

  if (args.query.focusJobId) {
    badges.push('已锁定单个任务');
  }

  return badges;
}
