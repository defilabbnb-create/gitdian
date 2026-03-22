import type { ReactNode } from 'react';
import Link from 'next/link';
import { AnalysisStepRunner } from '@/components/repositories/analysis-step-runner';
import { FavoriteToggleButton } from '@/components/repositories/favorite-toggle-button';
import { RepositoryDetail } from '@/lib/types/repository';

type RepositoryWorkflowAdviceProps = {
  repository: RepositoryDetail;
};

type AdviceItem = {
  label: string;
  title: string;
  description: string;
  helper: string;
  action: ReactNode;
};

export function RepositoryWorkflowAdvice({
  repository,
}: RepositoryWorkflowAdviceProps) {
  const adviceItems = buildAdviceItems(repository);

  return (
    <section className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Workflow Advice
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            先做下一步最值钱的动作，而不是继续反复浏览同一份分析。
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          这里不做复杂推荐引擎，只把当前仓库最明显的收藏与分析工作流提示收口出来，方便你直接推进到下一步。
        </p>
      </div>

      {adviceItems.length ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {adviceItems.map((item) => (
            <article
              key={item.label}
              className="flex h-full flex-col rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,0.9)_100%)] p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {item.label}
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {item.description}
              </p>
              <p className="mt-4 text-xs leading-6 text-slate-500">{item.helper}</p>
              <div className="mt-5">{item.action}</div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
          当前这个项目的收藏与分析工作流已经比较完整。你可以继续查看相邻推荐项目，或者去
          <Link
            href={`/jobs?repositoryId=${repository.id}`}
            className="mx-1 font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4"
          >
            关联任务记录
          </Link>
          看最近一次执行情况。
        </div>
      )}
    </section>
  );
}

function buildAdviceItems(repository: RepositoryDetail): AdviceItem[] {
  const hasIdeaFitAnalysis =
    typeof repository.ideaFitScore === 'number' ||
    Boolean(repository.analysis?.ideaFitJson);
  const hasExtractedIdea = Boolean(repository.analysis?.extractedIdeaJson);
  const isHighOpportunity =
    repository.opportunityLevel === 'HIGH' ||
    repository.decision === 'RECOMMENDED';

  const items: AdviceItem[] = [];

  if (isHighOpportunity && !repository.isFavorited) {
    items.push({
      label: '建议收藏',
      title: '先把这个机会收进收藏库',
      description:
        '这个仓库已经表现出较高的创业价值，但还没进入你的跟进池。先收藏下来，后续补备注和优先级会更顺。',
      helper: '规则：高机会且当前未收藏。',
      action: (
        <FavoriteToggleButton
          repositoryId={repository.id}
          isFavorited={repository.isFavorited}
        />
      ),
    });
  }

  if (repository.isFavorited && !hasIdeaFitAnalysis) {
    items.push({
      label: '建议补分析',
      title: '收藏之后先补核心创业评分',
      description:
        '既然已经进入收藏库，最值钱的下一步通常不是继续读源码，而是尽快补上 Idea Fit，确认它到底值不值得继续投入。',
      helper: '规则：已收藏，但还没完成 Idea Fit。',
      action: (
        <AnalysisStepRunner
          repositoryId={repository.id}
          step="ideaFit"
        />
      ),
    });
  } else if (!hasIdeaFitAnalysis) {
    items.push({
      label: '建议补分析',
      title: '先把核心创业判断补出来',
      description:
        '当前仓库还没有完成 Idea Fit。先补这一步，后面的收藏、点子提取和继续跟进才会更有依据。',
      helper: '规则：当前还没完成 Idea Fit。',
      action: (
        <AnalysisStepRunner
          repositoryId={repository.id}
          step="ideaFit"
        />
      ),
    });
  }

  if (hasIdeaFitAnalysis && !hasExtractedIdea) {
    items.push({
      label: '建议提取点子',
      title: '创业判断已经有了，继续把点子提出来',
      description:
        '当前仓库已经有创业评分，但还缺少可直接复述给团队或用户的产品点子摘要。补上点子提取后，后续判断和沟通都会更快。',
      helper: '规则：已完成 Idea Fit，但还没完成点子提取。',
      action: (
        <AnalysisStepRunner
          repositoryId={repository.id}
          step="ideaExtract"
        />
      ),
    });
  }

  return items.slice(0, 3);
}
