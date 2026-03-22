'use client';

import { RunAnalysisResponse, RunAnalysisStepStatus } from '@/lib/types/repository';

type AnalysisRunResultProps = {
  result: RunAnalysisResponse;
};

const stepTone: Record<
  RunAnalysisStepStatus,
  { badge: string; panel: string; text: string }
> = {
  executed: {
    badge: '已执行',
    panel: 'border-emerald-200/60 bg-emerald-50/10',
    text: 'text-emerald-200',
  },
  skipped: {
    badge: '已跳过',
    panel: 'border-amber-200/60 bg-amber-50/10',
    text: 'text-amber-100',
  },
  failed: {
    badge: '失败',
    panel: 'border-rose-200/70 bg-rose-50/10',
    text: 'text-rose-100',
  },
};

function formatValue(value?: string | number | null) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return '--';
  }

  return value;
}

export function AnalysisRunResult({ result }: AnalysisRunResultProps) {
  const entries = [
    {
      key: 'fastFilter',
      title: 'Fast Filter',
      values: [
        ['状态', stepTone[result.steps.fastFilter.status].badge],
        ['粗筛等级', formatValue(result.steps.fastFilter.roughLevel)],
        ['Tool Score', formatValue(result.steps.fastFilter.toolLikeScore)],
      ],
      message: result.steps.fastFilter.message,
    },
    {
      key: 'completeness',
      title: 'Completeness',
      values: [
        ['状态', stepTone[result.steps.completeness.status].badge],
        ['完整性分数', formatValue(result.steps.completeness.completenessScore)],
        ['完整性等级', formatValue(result.steps.completeness.completenessLevel)],
      ],
      message: result.steps.completeness.message,
    },
    {
      key: 'ideaFit',
      title: 'Idea Fit',
      values: [
        ['状态', stepTone[result.steps.ideaFit.status].badge],
        ['Idea Fit 分数', formatValue(result.steps.ideaFit.ideaFitScore)],
        ['机会等级', formatValue(result.steps.ideaFit.opportunityLevel)],
      ],
      message: result.steps.ideaFit.message,
    },
    {
      key: 'ideaExtract',
      title: 'Idea Extraction',
      values: [
        ['状态', stepTone[result.steps.ideaExtract.status].badge],
        ['产品形态', formatValue(result.steps.ideaExtract.productForm)],
        ['点子摘要', formatValue(result.steps.ideaExtract.ideaSummary)],
      ],
      message: result.steps.ideaExtract.message,
    },
  ] as const;

  return (
    <div className="grid gap-3">
      {entries.map((entry) => {
        const status = result.steps[entry.key].status;
        const tone = stepTone[status];

        return (
          <section
            key={entry.key}
            className={`rounded-[24px] border p-4 ${tone.panel}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold tracking-[0.02em] text-white">
                {entry.title}
              </h4>
              <span
                className={`rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.text}`}
              >
                {tone.badge}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {entry.values.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-6 text-white">
                    {String(value)}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-6 text-slate-200">{entry.message}</p>
          </section>
        );
      })}
    </div>
  );
}
