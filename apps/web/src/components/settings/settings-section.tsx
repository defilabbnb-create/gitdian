import { ReactNode } from 'react';

type SettingsSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Settings Section
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}
