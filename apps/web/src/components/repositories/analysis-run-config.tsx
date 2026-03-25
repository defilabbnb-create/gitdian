'use client';

import { RunAnalysisRequest } from '@/lib/types/repository';

type AnalysisRunConfigProps = {
  value: RunAnalysisRequest;
  disabled?: boolean;
  onChange: (nextValue: RunAnalysisRequest) => void;
};

type AnalysisRunBooleanKey =
  | 'runFastFilter'
  | 'runCompleteness'
  | 'runIdeaFit'
  | 'runIdeaExtract'
  | 'forceRerun';

const fields: Array<{
  key: AnalysisRunBooleanKey;
  label: string;
  hint: string;
}> = [
  {
    key: 'runFastFilter',
    label: '运行 Fast Filter',
    hint: '先跑规则粗筛，保留 roughLevel / toolLikeScore。',
  },
  {
    key: 'runCompleteness',
    label: '运行 Completeness',
    hint: '评估文档、结构、可运行性与工程化程度。',
  },
  {
    key: 'runIdeaFit',
    label: '运行 Idea Fit',
    hint: '评估创业价值、需求强度与产品化空间。',
  },
  {
    key: 'runIdeaExtract',
    label: '运行 Idea Extraction',
    hint: '提炼可重做、可商业化的产品点子。',
  },
  {
    key: 'forceRerun',
    label: '强制重跑',
    hint: '忽略已有结果，不走 skipped。',
  },
];

export function AnalysisRunConfig({
  value,
  disabled = false,
  onChange,
}: AnalysisRunConfigProps) {
  return (
    <div className="grid gap-3 rounded-[24px] border border-white/10 bg-black/10 p-4">
      {fields.map((field) => {
        const checked = value[field.key] ?? false;

        return (
          <label
            key={field.key}
            className={`flex items-start gap-3 rounded-2xl border border-white/10 px-4 py-3 transition ${
              disabled ? 'opacity-60' : 'hover:bg-white/5'
            }`}
          >
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-white/30 bg-slate-950 text-sky-500 focus:ring-sky-500"
              checked={checked}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  [field.key]: event.target.checked,
                })
              }
            />
            <span className="space-y-1">
              <span className="block text-sm font-semibold text-white">
                {field.label}
              </span>
              <span className="block text-xs leading-6 text-slate-300">
                {field.hint}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
