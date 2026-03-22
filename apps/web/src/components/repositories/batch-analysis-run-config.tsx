'use client';

import { RunBatchAnalysisRequest } from '@/lib/types/repository';

type BatchAnalysisMode = 'currentPage' | 'missing';

type BatchAnalysisRunConfigProps = {
  mode: BatchAnalysisMode;
  value: RunBatchAnalysisRequest;
  disabled?: boolean;
  defaultCurrentPageLimit: number;
  onModeChange: (mode: BatchAnalysisMode) => void;
  onChange: (nextValue: RunBatchAnalysisRequest) => void;
};

const stepFields: Array<{
  key:
    | 'runFastFilter'
    | 'runCompleteness'
    | 'runIdeaFit'
    | 'runIdeaExtract'
    | 'forceRerun';
  label: string;
  hint: string;
}> = [
  {
    key: 'runFastFilter',
    label: '运行 Fast Filter',
    hint: '补 roughLevel / toolLikeScore。',
  },
  {
    key: 'runCompleteness',
    label: '运行 Completeness',
    hint: '补完整性与可运行性分析。',
  },
  {
    key: 'runIdeaFit',
    label: '运行 Idea Fit',
    hint: '补创业机会评分。',
  },
  {
    key: 'runIdeaExtract',
    label: '运行 Idea Extraction',
    hint: '补产品点子提取。',
  },
  {
    key: 'forceRerun',
    label: '强制重跑',
    hint: '忽略已有结果，不走 skipped。',
  },
];

export function BatchAnalysisRunConfig({
  mode,
  value,
  disabled = false,
  defaultCurrentPageLimit,
  onModeChange,
  onChange,
}: BatchAnalysisRunConfigProps) {
  return (
    <div className="grid gap-4 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            执行范围
          </span>
          <select
            value={mode}
            disabled={disabled}
            onChange={(event) => onModeChange(event.target.value as BatchAnalysisMode)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          >
            <option value="currentPage">当前页仓库</option>
            <option value="missing">仅缺少分析结果</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Limit
          </span>
          <input
            type="number"
            min={1}
            max={100}
            disabled={disabled}
            value={value.limit ?? defaultCurrentPageLimit}
            onChange={(event) =>
              onChange({
                ...value,
                limit: Math.min(Math.max(Number(event.target.value || 1), 1), 100),
              })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
        </label>
      </div>

      {mode === 'missing' ? (
        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <input
            type="checkbox"
            checked={value.onlyIfMissing ?? true}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                onlyIfMissing: event.target.checked,
              })
            }
            className="mt-1 size-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          <span className="space-y-1">
            <span className="block text-sm font-semibold text-slate-900">
              仅挑选缺少分析结果的仓库
            </span>
            <span className="block text-xs leading-6 text-slate-600">
              关闭后会按最近更新的仓库顺序取 limit 条。
            </span>
          </span>
        </label>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
          当前页模式会直接使用列表中这一页仓库的 `repositoryIds` 发起批量分析。
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {stepFields.map((field) => {
          const checked = value[field.key] ?? false;

          return (
            <label
              key={field.key}
              className={`flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 ${
                disabled ? 'opacity-60' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    [field.key]: event.target.checked,
                  })
                }
                className="mt-1 size-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-slate-900">
                  {field.label}
                </span>
                <span className="block text-xs leading-6 text-slate-600">
                  {field.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
