import {
  RepositoryOverviewSummary,
  buildRepositoryListSearchParams,
} from '@/lib/types/repository';
import { getRepositoryViewMeta } from '@/lib/repository-view-meta';
import { WorkflowCard } from './workflow-card';

type RepositoryWorkflowCardsProps = {
  summary: RepositoryOverviewSummary | null;
  errorMessage?: string | null;
};

export function RepositoryWorkflowCards({
  summary,
  errorMessage = null,
}: RepositoryWorkflowCardsProps) {
  const pendingAnalysisView = getRepositoryViewMeta('pendingAnalysis');
  const ideaPendingView = getRepositoryViewMeta('ideaExtractionPending');
  const highOpportunityView = getRepositoryViewMeta('highOpportunityUnfavorited');

  if (!summary) {
    return (
      <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          工作流提示暂不可用
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          当前还拿不到待处理工作流提示
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {errorMessage ?? '首页概览暂时不可用，但你仍然可以继续浏览项目和手动筛选。'}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            工作流提示
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            先处理最值得推进的下一步，而不是继续在全量仓库里游泳。
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          这些提示卡不是复杂推荐系统，只是把当前最常见的待办工作集收口出来：先补分析、再补点子、最后把高机会项目收进收藏库。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <WorkflowCard
          label={pendingAnalysisView.label}
          title="先补核心判断，再决定值不值得继续看"
          description="这些项目还没形成完整的创业判断，进入后会优先看到一句话结论、分类和建议动作。"
          count={summary.pendingAnalysisRepositories}
          href={`/?${buildRepositoryListSearchParams({
            page: 1,
            pageSize: 20,
            view: 'pendingAnalysis',
            displayMode: 'insight',
            hasIdeaFitAnalysis: false,
            sortBy: 'latest',
            order: 'desc',
          })}`}
          actionLabel={`查看${pendingAnalysisView.label}`}
        />
        <WorkflowCard
          label={ideaPendingView.label}
          title="判断有了，再把点子收口成人能看懂的话"
          description="这些项目已经有基础评分，但还缺一句能直接说明机会价值的产品化结论。"
          count={summary.needsIdeaExtractionRepositories}
          href={`/?${buildRepositoryListSearchParams({
            page: 1,
            pageSize: 20,
            view: 'ideaExtractionPending',
            displayMode: 'insight',
            hasIdeaFitAnalysis: true,
            hasExtractedIdea: false,
            sortBy: 'ideaFitScore',
            order: 'desc',
          })}`}
          actionLabel={`查看${ideaPendingView.label}`}
        />
        <WorkflowCard
          label={highOpportunityView.label}
          title="别让已经值得看的项目继续躺在列表里"
          description="这些项目已经出现明显机会信号，但还没收进收藏池，适合尽快变成明确跟进列表。"
          count={summary.highOpportunityUnfavoritedRepositories}
          href={`/?${buildRepositoryListSearchParams({
            page: 1,
            pageSize: 20,
            view: 'highOpportunityUnfavorited',
            displayMode: 'insight',
            opportunityLevel: 'HIGH',
            isFavorited: false,
            sortBy: 'ideaFitScore',
            order: 'desc',
          })}`}
          actionLabel={`查看${highOpportunityView.label}`}
        />
      </div>
    </section>
  );
}
