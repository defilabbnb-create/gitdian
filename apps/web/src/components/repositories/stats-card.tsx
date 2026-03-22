type StatsCardProps = {
  label: string;
  value?: number | null;
  helper: string;
};

export function StatsCard({ label, value, helper }: StatsCardProps) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {typeof value === 'number' ? value.toLocaleString() : '--'}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}
