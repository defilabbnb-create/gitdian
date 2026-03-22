'use client';

import { useState } from 'react';
import { RunBatchAnalysisResponse } from '@/lib/types/repository';

type BatchAnalysisRunResultProps = {
  result: RunBatchAnalysisResponse;
};

function pickStepSummary(item: RunBatchAnalysisResponse['items'][number]) {
  const parts: string[] = [];

  if (item.steps.fastFilter.roughLevel) {
    parts.push(`粗筛 ${item.steps.fastFilter.roughLevel}`);
  }

  if (item.steps.completeness.completenessLevel) {
    parts.push(`完整性 ${item.steps.completeness.completenessLevel}`);
  }

  if (item.steps.ideaFit.opportunityLevel) {
    parts.push(`机会 ${item.steps.ideaFit.opportunityLevel}`);
  }

  if (item.steps.ideaExtract.ideaSummary) {
    parts.push(item.steps.ideaExtract.ideaSummary);
  }

  return parts.slice(0, 3).join(' · ');
}

export function BatchAnalysisRunResult({
  result,
}: BatchAnalysisRunResultProps) {
  const [expanded, setExpanded] = useState(false);
  const previewItems = expanded ? result.items : result.items.slice(0, 5);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Batch Analysis Result
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            这批仓库已经跑完，先看整体，再决定是否深入查看单条结果。
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {expanded ? '收起结果' : '展开结果'}
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <ResultMetric label="Processed" value={result.processed} />
        <ResultMetric label="Succeeded" value={result.succeeded} />
        <ResultMetric label="Failed" value={result.failed} />
      </div>

      <div className="mt-5 space-y-3">
        {previewItems.map((item) => (
          <div
            key={item.repositoryId}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {item.repositoryId}
                </p>
                <p className="mt-1 text-xs leading-6 text-slate-600">
                  {pickStepSummary(item) || item.message}
                </p>
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                  item.action === 'executed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : item.action === 'skipped'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                }`}
              >
                {item.action}
              </span>
            </div>
            <p className="mt-2 text-xs leading-6 text-slate-600">{item.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}
