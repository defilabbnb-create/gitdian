import { ReactNode } from 'react';

type SettingsSectionProps = {
  title: string;
  summary: string;
  description: string;
  anchorId?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function SettingsSection({
  title,
  summary,
  description,
  anchorId,
  defaultOpen = false,
  children,
}: SettingsSectionProps) {
  return (
    <details
      id={anchorId}
      open={defaultOpen}
      data-settings-section={title}
      className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              配置组
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{summary}</p>
          </div>

          <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {defaultOpen ? '默认展开' : '默认折叠，按需展开'}
          </span>
        </div>
      </summary>

      <div className="mt-6 border-t border-slate-100 pt-6">
        <p className="max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">{children}</div>
      </div>
    </details>
  );
}
