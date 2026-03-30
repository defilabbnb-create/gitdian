import type { RepositoryDecisionAnalysisModuleViewModel } from '@/lib/repository-decision-view-model';
import { RepositoryOriginalAnalysisDisclosure } from '@/components/repositories/repository-original-analysis-disclosure';

type RepositoryDetailAnalysisCardProps = {
  module: RepositoryDecisionAnalysisModuleViewModel;
};

export function RepositoryDetailAnalysisCard({
  module,
}: RepositoryDetailAnalysisCardProps) {
  return (
    <details
      className="group rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
      data-detail-module={module.key}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {module.title}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                {module.subtitle}
              </h2>
            </div>
            <span className="text-sm font-semibold text-slate-500 transition group-open:rotate-180">
              展开
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <ModuleMetric label="当前状态" value={module.statusLabel} />
            <ModuleMetric label="核心差口" value={module.coreGapLabel} />
            <ModuleMetric label="补什么证据" value={module.evidenceNeededLabel} />
          </div>

          <p className="text-sm leading-7 text-slate-600">{module.detailSummary}</p>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
        <div className="grid gap-3 md:grid-cols-2">
          {module.detailMetrics.map((metric) => (
            <ModuleMetric
              key={`${module.key}-${metric.label}`}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </div>

        {module.originalAnalysis ? (
          <RepositoryOriginalAnalysisDisclosure content={module.originalAnalysis} />
        ) : null}
      </div>
    </details>
  );
}

function ModuleMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-sm font-semibold leading-7 text-slate-900">{value}</p>
    </div>
  );
}
