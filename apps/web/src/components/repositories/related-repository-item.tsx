import Link from 'next/link';
import { RelatedRepositoryItem } from '@/lib/types/repository';

type RelatedRepositoryItemCardProps = {
  repository: RelatedRepositoryItem;
};

export function RelatedRepositoryItemCard({
  repository,
}: RelatedRepositoryItemCardProps) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        {repository.relatedReasonLabels.map((label) => (
          <span
            key={`${repository.id}-${label}`}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <Link
          href={`/repositories/${repository.id}`}
          className="text-lg font-semibold tracking-tight text-slate-950 transition hover:text-slate-700"
        >
          {repository.name}
        </Link>
        <p className="mt-2 text-sm font-medium text-slate-500">{repository.fullName}</p>
      </div>

      <p className="mt-4 text-sm leading-7 text-slate-600">
        {repository.description || '这个项目还没有公开描述，可以点进去看详情判断是否值得继续。'}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
        {repository.language ? (
          <span className="rounded-full border border-slate-200 px-3 py-1 text-slate-700">
            {repository.language}
          </span>
        ) : null}
        {repository.opportunityLevel ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            机会等级 · {repository.opportunityLevel}
          </span>
        ) : null}
        {typeof repository.ideaFitScore === 'number' ? (
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
            Idea Fit · {Math.round(repository.ideaFitScore)}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-sm text-slate-500">看看这个同类机会</span>
        <Link
          href={`/repositories/${repository.id}`}
          className="inline-flex items-center rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          查看详情
        </Link>
      </div>
    </article>
  );
}
