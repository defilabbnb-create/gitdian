import { RepositoryListItem, RepositoryListQueryState } from '@/lib/types/repository';
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
  if (items.length === 0) {
    return (
      <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Empty Result
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
      {items.map((repository) => (
        <RepositoryListItemCard key={repository.id} repository={repository} />
      ))}
      <RepositoryPagination pagination={pagination} query={query} />
    </div>
  );
}
