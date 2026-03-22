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
};

export function JobList({
  items,
  pagination,
  query,
  currentRepositoryId,
  focusedJobId,
}: JobListProps) {
  if (items.length === 0) {
    return (
      <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Empty Result
        </p>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
          当前筛选条件下没有任务日志
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          可以先去执行一次 GitHub 采集、批量粗筛或统一分析编排，然后再回到这里看历史记录。
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
        />
      ))}
      <JobPagination pagination={pagination} query={query} />
    </div>
  );
}
