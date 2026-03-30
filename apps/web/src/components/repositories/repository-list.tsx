import { RepositoryListItem, RepositoryListQueryState } from '@/lib/types/repository';
import {
  getRepositoryDisplayModeMeta,
  getRepositoryViewMeta,
} from '@/lib/repository-view-meta';
import { RepositoryListItemCard } from './repository-list-item';
import { RepositoryPagination } from './repository-pagination';

type RepositoryListProps = {
  items: RepositoryListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  query: RepositoryListQueryState;
};

export function RepositoryList({
  items,
  pagination,
  query,
}: RepositoryListProps) {
  const viewMeta = getRepositoryViewMeta(query.view);
  const displayModeMeta = getRepositoryDisplayModeMeta(query.displayMode);

  if (items.length === 0) {
    return (
      <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          暂无结果
        </p>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
          当前筛选条件下没有可展示的创业项目
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          可以先放宽筛选条件，或者先去后端执行 GitHub 采集与分析流程，让列表里有更多可排序的数据。
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              完整机会池
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
              {viewMeta.label}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {viewMeta.helper}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-700">
              {displayModeMeta.label}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
              共 {pagination.total.toLocaleString()} 个项目
            </span>
          </div>
        </div>
      </section>

      {items.map((repository) => (
        <RepositoryListItemCard
          key={repository.id}
          repository={repository}
          query={query}
        />
      ))}
      <RepositoryPagination pagination={pagination} query={query} />
    </div>
  );
}
