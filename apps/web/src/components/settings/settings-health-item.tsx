'use client';

type SettingsHealthItemProps = {
  label: string;
  ok: boolean;
  latencyMs?: number | null;
  meta?: string | null;
  error?: string | null;
  tone?: 'required' | 'optional';
};

export function SettingsHealthItem({
  label,
  ok,
  latencyMs,
  meta,
  error,
  tone = 'required',
}: SettingsHealthItemProps) {
  const isOptionalWarning = tone === 'optional' && !ok;

  return (
    <div
      className={`rounded-[24px] border px-5 py-4 ${
        ok
          ? 'border-emerald-200 bg-emerald-50/80'
          : isOptionalWarning
            ? 'border-amber-200 bg-amber-50/80'
            : 'border-rose-200 bg-rose-50/80'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
            ok
              ? 'bg-emerald-100 text-emerald-700'
              : isOptionalWarning
                ? 'bg-amber-100 text-amber-700'
                : 'bg-rose-100 text-rose-700'
          }`}
        >
          {ok ? '正常' : isOptionalWarning ? '可选' : '异常'}
        </span>
      </div>
      <div className="mt-3 space-y-1 text-sm text-slate-700">
        <p>延迟：{typeof latencyMs === 'number' ? `${latencyMs} ms` : '--'}</p>
        {meta ? <p>{meta}</p> : null}
        {error ? (
          <p
            className={`line-clamp-2 text-xs leading-5 ${
              isOptionalWarning ? 'text-amber-700' : 'text-rose-700'
            }`}
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
