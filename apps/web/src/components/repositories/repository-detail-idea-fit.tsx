import { AnalysisStepRunner } from '@/components/repositories/analysis-step-runner';
import { RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailIdeaFitProps = {
  repository: RepositoryDetail;
};

export function RepositoryDetailIdeaFit({
  repository,
}: RepositoryDetailIdeaFitProps) {
  const ideaFit = repository.analysis?.ideaFitJson;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Idea Fit
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            创业价值判断
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {ideaFit?.coreJudgement ||
              '还没有生成创业机会评分。你现在仍然可以先看仓库元信息和点子提取区，后续再补跑 idea fit。'}
          </p>
        </div>

        <div className="grid min-w-[220px] gap-4">
          <AnalysisStepRunner
            repositoryId={repository.id}
            step="ideaFit"
          />
          <div className="grid gap-3 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
            <IdeaFitStat label="Idea Fit 分" value={toScore(repository.ideaFitScore)} />
            <IdeaFitStat
              label="Opportunity"
              value={ideaFit?.opportunityLevel ?? repository.opportunityLevel ?? '--'}
            />
            <IdeaFitStat label="Decision" value={ideaFit?.decision ?? repository.decision} />
          </div>
        </div>
      </div>

      {ideaFit ? (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DimensionChip label="真实需求" value={ideaFit.scores.realDemand} />
            <DimensionChip label="产品化" value={ideaFit.scores.toolProductization} />
            <DimensionChip label="付费空间" value={ideaFit.scores.monetization} />
            <DimensionChip
              label="竞争突破"
              value={ideaFit.scores.competitiveBreakthrough}
            />
            <DimensionChip label="趋势时机" value={ideaFit.scores.timingTailwind} />
            <DimensionChip
              label="执行可行性"
              value={ideaFit.scores.executionFeasibility}
            />
            <DimensionChip label="创业者匹配" value={ideaFit.scores.founderFit} />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <ListCard
              title="机会标签"
              items={ideaFit.opportunityTags}
              emptyText="模型还没有给出明确机会标签。"
              tone="emerald"
            />
            <ListCard
              title="风险提醒"
              items={ideaFit.negativeFlags}
              emptyText="当前没有明确风险标记。"
              tone="rose"
            />
          </div>
        </>
      ) : (
        <MissingAnalysisCard
          message="创业机会评分尚未生成，页面会先展示基础仓库信息和其他已有分析结果。"
        />
      )}
    </section>
  );
}

function toScore(value?: number | null) {
  return typeof value === 'number' ? Math.round(value) : '--';
}

function IdeaFitStat({
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

function DimensionChip({
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

function ListCard({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string;
  items?: string[];
  emptyText: string;
  tone: 'emerald' | 'rose';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-rose-200 bg-rose-50 text-rose-800';

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
              className={`rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}
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

function MissingAnalysisCard({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
      {message}
    </div>
  );
}
