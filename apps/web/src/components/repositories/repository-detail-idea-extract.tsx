import { AnalysisStepRunner } from '@/components/repositories/analysis-step-runner';
import { RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailIdeaExtractProps = {
  repository: RepositoryDetail;
};

export function RepositoryDetailIdeaExtract({
  repository,
}: RepositoryDetailIdeaExtractProps) {
  const extractedIdea = repository.analysis?.extractedIdeaJson;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Idea Extraction
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            可重新实现的产品点子
          </h2>
        </div>

        <div className="grid min-w-[220px] gap-4">
          <AnalysisStepRunner
            repositoryId={repository.id}
            step="ideaExtract"
          />
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              提取置信度
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {typeof extractedIdea?.confidence === 'number'
                ? Math.round(extractedIdea.confidence)
                : '--'}
            </p>
          </div>
        </div>
      </div>

      {extractedIdea ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-4">
            <HighlightCard
              title="一句话点子"
              content={extractedIdea.ideaSummary}
              tone="dark"
            />
            <HighlightCard title="问题" content={extractedIdea.problem} />
            <HighlightCard title="解决方案" content={extractedIdea.solution} />
            <HighlightCard title="MVP 计划" content={extractedIdea.mvpPlan} />
            <HighlightCard title="差异化" content={extractedIdea.differentiation} />
          </div>

          <div className="space-y-4">
            <KeyValueCard title="产品形态" value={extractedIdea.productForm ?? '--'} />
            <TagListCard
              title="目标用户"
              items={extractedIdea.targetUsers}
              emptyText="还没有明确目标用户。"
            />
            <HighlightCard title="商业化" content={extractedIdea.monetization} />
            <HighlightCard title="为什么是现在" content={extractedIdea.whyNow} />
            <TagListCard
              title="风险"
              items={extractedIdea.risks}
              emptyText="还没有给出风险提示。"
              tone="rose"
            />
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
          还没有生成点子提取结果。后续跑完 idea extraction 后，这里会展示产品语言的一句话点子、MVP
          路线、商业化方式和真实风险。
        </div>
      )}
    </section>
  );
}

function HighlightCard({
  title,
  content,
  tone = 'light',
}: {
  title: string;
  content?: string;
  tone?: 'light' | 'dark';
}) {
  const classes =
    tone === 'dark'
      ? 'border-slate-950 bg-slate-950 text-white'
      : 'border-slate-200 bg-slate-50 text-slate-900';
  const textClasses = tone === 'dark' ? 'text-slate-300' : 'text-slate-600';

  return (
    <div className={`rounded-[28px] border p-5 ${classes}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{title}</p>
      <p className={`mt-4 text-sm leading-7 ${textClasses}`}>
        {content || '当前还没有可展示内容。'}
      </p>
    </div>
  );
}

function KeyValueCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function TagListCard({
  title,
  items,
  emptyText,
  tone = 'slate',
}: {
  title: string;
  items?: string[];
  emptyText: string;
  tone?: 'slate' | 'rose';
}) {
  const itemClass =
    tone === 'rose'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-slate-200 bg-white text-slate-700';

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
