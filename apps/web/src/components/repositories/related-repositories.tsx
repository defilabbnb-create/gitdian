import Link from 'next/link';
import { RelatedRepositoryItem } from '@/lib/types/repository';
import { RelatedRepositoryItemCard } from './related-repository-item';

type RelatedRepositoriesProps = {
  items: RelatedRepositoryItem[];
  errorMessage?: string | null;
};

export function RelatedRepositories({
  items,
  errorMessage = null,
}: RelatedRepositoriesProps) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Related Opportunities
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            你可能还想顺手看看这些相邻项目
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            这里只做轻量同类浏览：优先看同语言、同机会等级，以及和当前仓库 topics 更接近的项目。
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          回到项目列表
        </Link>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm leading-7 text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {!errorMessage && !items.length ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
          当前还没有足够相近的项目可推荐。你可以先回到列表继续筛选，或者等系统采集更多仓库后再来看。
        </div>
      ) : null}

      {items.length ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <RelatedRepositoryItemCard key={item.id} repository={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
