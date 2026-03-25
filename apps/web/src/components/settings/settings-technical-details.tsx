'use client';

import { useState } from 'react';
import { SettingsHealthPanel } from '@/components/settings/settings-health-panel';
import { SettingsBehaviorNotes } from '@/components/settings/settings-behavior-notes';
import { SettingsHealthPayload } from '@/lib/types/settings';

type SettingsTechnicalDetailsProps = {
  health: SettingsHealthPayload | null;
  healthErrorMessage?: string | null;
};

export function SettingsTechnicalDetails({
  health,
  healthErrorMessage,
}: SettingsTechnicalDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            工程健康与技术细项
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            只有系统跑得不对时，再展开这一层。
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            这里放工程排查和技术细项，默认不打断你先判断系统当前会怎么跑。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {isExpanded ? '收起工程细项' : '展开工程细项'}
        </button>
      </div>

      {isExpanded ? (
        <div className="mt-6 space-y-6">
          <SettingsHealthPanel
            initialHealth={health}
            initialError={healthErrorMessage}
          />
          <SettingsBehaviorNotes />
        </div>
      ) : null}
    </section>
  );
}
