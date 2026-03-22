import Link from 'next/link';
import {
  JobLogQueryState,
  PaginationMeta,
  buildJobLogListSearchParams,
} from '@/lib/types/repository';

type JobPaginationProps = {
  pagination: PaginationMeta;
  query: JobLogQueryState;
};

export function JobPagination({ pagination, query }: JobPaginationProps) {
  if (pagination.totalPages <= 1) {
    return null;
  }

  const previousPage = pagination.page - 1;
  const nextPage = pagination.page + 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm text-slate-600">
        共 <span className="font-semibold text-slate-950">{pagination.total}</span>{' '}
        条任务日志，第{' '}
        <span className="font-semibold text-slate-950">{pagination.page}</span> /{' '}
        <span className="font-semibold text-slate-950">{pagination.totalPages}</span> 页
      </p>

      <div className="flex items-center gap-3">
        <PaginationLink
          disabled={pagination.page <= 1}
          query={{ ...query, page: previousPage }}
        >
          上一页
        </PaginationLink>
        <PaginationLink
          disabled={pagination.page >= pagination.totalPages}
          query={{ ...query, page: nextPage }}
        >
          下一页
        </PaginationLink>
      </div>
    </div>
  );
}

function PaginationLink({
  children,
  disabled,
  query,
}: {
  children: React.ReactNode;
  disabled: boolean;
  query: JobLogQueryState;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-400">
        {children}
      </span>
    );
  }

  const search = buildJobLogListSearchParams(query);

  return (
    <Link
      href={search ? `/jobs?${search}` : '/jobs'}
      className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}
