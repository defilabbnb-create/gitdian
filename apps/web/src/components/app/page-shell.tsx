import type { ReactNode } from 'react';

type PageTone = 'slate' | 'emerald' | 'amber' | 'sky' | 'rose';

type AppPageShellProps = {
  tone?: PageTone;
  children: ReactNode;
};

type PageHeroStat = {
  label: string;
  value: string;
  helper?: string;
};

type AppPageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  tone?: PageTone;
  chips?: string[];
  stats?: PageHeroStat[];
  aside?: ReactNode;
};

const shellToneClasses: Record<PageTone, string> = {
  slate:
    'bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_22%),linear-gradient(180deg,_#f7fafc_0%,_#eef4ff_50%,_#f8fafc_100%)]',
  emerald:
    'bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.10),_transparent_20%),linear-gradient(180deg,_#f5fbf8_0%,_#ecfdf5_50%,_#f8fafc_100%)]',
  amber:
    'bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.16),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(234,88,12,0.10),_transparent_20%),linear-gradient(180deg,_#fffaf0_0%,_#fff7ed_48%,_#f8fafc_100%)]',
  sky:
    'bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.10),_transparent_20%),linear-gradient(180deg,_#f4fbff_0%,_#eff6ff_48%,_#f8fafc_100%)]',
  rose:
    'bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.16),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(251,146,60,0.10),_transparent_20%),linear-gradient(180deg,_#fff7f8_0%,_#fff1f2_48%,_#f8fafc_100%)]',
};

const heroToneClasses: Record<PageTone, string> = {
  slate: 'border-slate-200 bg-white/82 shadow-slate-900/8',
  emerald: 'border-emerald-200/70 bg-white/84 shadow-emerald-950/10',
  amber: 'border-amber-200/70 bg-white/84 shadow-amber-950/10',
  sky: 'border-sky-200/70 bg-white/84 shadow-sky-950/10',
  rose: 'border-rose-200/70 bg-white/84 shadow-rose-950/10',
};

const eyebrowToneClasses: Record<PageTone, string> = {
  slate: 'text-slate-600',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  sky: 'text-sky-700',
  rose: 'text-rose-700',
};

const chipToneClasses: Record<PageTone, string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
};

export function AppPageShell({
  tone = 'slate',
  children,
}: AppPageShellProps) {
  return (
    <main
      className={`min-h-screen px-4 py-6 text-slate-950 sm:px-6 sm:py-8 ${shellToneClasses[tone]}`}
    >
      <div className="mx-auto max-w-7xl space-y-6">{children}</div>
    </main>
  );
}

export function AppPageHero({
  eyebrow,
  title,
  description,
  tone = 'slate',
  chips = [],
  stats = [],
  aside,
}: AppPageHeroProps) {
  return (
    <section
      className={`relative overflow-hidden rounded-[32px] border p-6 shadow-[0_24px_80px_-32px] backdrop-blur xl:p-8 ${heroToneClasses[tone]}`}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(15,23,42,0.16),transparent)]" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <div>
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.26em] ${eyebrowToneClasses[tone]}`}
          >
            {eyebrow}
          </p>
          <h1 className="font-display mt-3 max-w-4xl text-4xl leading-tight tracking-[-0.04em] text-slate-950 sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-[15px]">
            {description}
          </p>

          {chips.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${chipToneClasses[tone]}`}
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          {aside ? (
            <div className="rounded-[28px] border border-white/70 bg-white/70 p-4 shadow-sm">
              {aside}
            </div>
          ) : null}

          {stats.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {stats.map((stat) => (
                <div
                  key={`${stat.label}-${stat.value}`}
                  className="rounded-[24px] border border-slate-200/80 bg-white/78 p-4 shadow-sm"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {stat.label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                    {stat.value}
                  </p>
                  {stat.helper ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {stat.helper}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
