'use client';

import {
  JobLogItem,
  JobLogQueryState,
  PaginationMeta,
} from '@/lib/types/repository';
import { JobListItem } from './job-list-item';
import { JobPagination } from './job-pagination';

type JobListProps = {
  items: JobLogItem[];
  pagination: PaginationMeta;
  query: JobLogQueryState;
  currentRepositoryId?: string;
  focusedJobId?: string;
  showActions?: boolean;
};

export function JobList({
  items,
  pagination,
  query,
  currentRepositoryId,
  focusedJobId,
  showActions = true,
}: JobListProps) {
  if (items.length === 0) {
    return (
      <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          暂无结果
        </p>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
          现在没有需要处理的任务
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          如果你刚触发过采集或分析，可以稍后回来；否则说明当前运行比较平稳。
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {items.map((job) => (
        <JobListItem
          key={job.id}
          job={job}
          currentRepositoryId={currentRepositoryId}
          isFocused={focusedJobId === job.id}
          showActions={showActions}
        />
      ))}
      <JobPagination pagination={pagination} query={query} />
    </div>
  );
}
