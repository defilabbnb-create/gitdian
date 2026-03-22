import { AnalysisStepRunner } from '@/components/repositories/analysis-step-runner';
import { RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailCompletenessProps = {
  repository: RepositoryDetail;
};

export function RepositoryDetailCompleteness({
  repository,
}: RepositoryDetailCompletenessProps) {
  const completeness = repository.analysis?.completenessJson;
  const runabilityValue = completeness?.runability ?? '--';

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Completeness
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            完整性与可落地性
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {completeness?.summary ||
              '完整性分析尚未生成。当前会先展示主表上的完整性分和可运行性字段。'}
          </p>
        </div>

        <div className="grid min-w-[220px] gap-4">
          <AnalysisStepRunner
            repositoryId={repository.id}
            step="completeness"
          />
          <div className="grid gap-3 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
            <InfoMetric
              label="完整性分"
              value={
                typeof repository.completenessScore === 'number'
                  ? Math.round(repository.completenessScore)
                  : '--'
              }
            />
            <InfoMetric
              label="等级"
              value={repository.completenessLevel ?? '--'}
            />
            <InfoMetric
              label="可运行性"
              value={runabilityValue}
            />
            <InfoMetric
              label="接近可用"
              value={repository.productionReady ? '是' : '否'}
            />
          </div>
        </div>
      </div>

      {completeness ? (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <DimensionCard label="文档" value={completeness.dimensionScores.documentation} />
            <DimensionCard label="结构" value={completeness.dimensionScores.structure} />
            <DimensionCard label="可运行性" value={completeness.dimensionScores.runability} />
            <DimensionCard label="工程化" value={completeness.dimensionScores.engineering} />
            <DimensionCard label="维护性" value={completeness.dimensionScores.maintenance} />
            <DimensionCard label="扩展性" value={completeness.dimensionScores.extensibility} />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <SimpleListCard
              title="优势"
              items={completeness.strengths}
              emptyText="还没有总结出明确优势。"
              tone="emerald"
            />
            <SimpleListCard
              title="不足"
              items={completeness.weaknesses}
              emptyText="还没有总结出明显短板。"
              tone="amber"
            />
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
          这个仓库还没有跑完整性分析，所以这里只展示主表已有的基础字段。
        </div>
      )}
    </section>
  );
}

function InfoMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <span className="text-lg font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function DimensionCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {Math.round(value)}
      </p>
    </div>
  );
}

function SimpleListCard({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string;
  items?: string[];
  emptyText: string;
  tone: 'emerald' | 'amber';
}) {
  const itemClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      {items?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${itemClass}`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-7 text-slate-600">{emptyText}</p>
      )}
    </div>
  );
}
