import Link from 'next/link';

type WorkflowCardProps = {
  label: string;
  title: string;
  description: string;
  count?: number | null;
  href: string;
  actionLabel: string;
};

export function WorkflowCard({
  label,
  title,
  description,
  count,
  href,
  actionLabel,
}: WorkflowCardProps) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-950">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
        </div>
        <div className="rounded-2xl bg-slate-950 px-4 py-3 text-right text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
            Count
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {typeof count === 'number' ? count.toLocaleString() : '--'}
          </p>
        </div>
      </div>
      <div className="mt-5">
        <Link
          href={href}
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
