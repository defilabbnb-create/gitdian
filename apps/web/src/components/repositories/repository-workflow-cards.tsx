import {
  RepositoryOverviewSummary,
  buildRepositoryListSearchParams,
} from '@/lib/types/repository';
import { WorkflowCard } from './workflow-card';

type RepositoryWorkflowCardsProps = {
  summary: RepositoryOverviewSummary | null;
  errorMessage?: string | null;
};

export function RepositoryWorkflowCards({
  summary,
  errorMessage = null,
}: RepositoryWorkflowCardsProps) {
  if (!summary) {
    return (
      <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Workflow Suggestions Unavailable
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
            Workflow Suggestions
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
          label="待分析项目"
          title="先补核心创业评分"
          description="这些项目还没完成 Idea Fit，适合优先补上核心创业判断。"
          count={summary.pendingAnalysisRepositories}
          href={`/?${buildRepositoryListSearchParams({
            page: 1,
            pageSize: 20,
            view: 'pendingAnalysis',
            hasIdeaFitAnalysis: false,
            sortBy: 'latest',
            order: 'desc',
          })}`}
          actionLabel="查看待分析项目"
        />
        <WorkflowCard
          label="待补点子项目"
          title="评分有了，点子还没提"
          description="这些项目已经做过创业评分，但还没完成点子提取，适合继续补足产品化输出。"
          count={summary.needsIdeaExtractionRepositories}
          href={`/?${buildRepositoryListSearchParams({
            page: 1,
            pageSize: 20,
            view: 'ideaExtractionPending',
            hasIdeaFitAnalysis: true,
            hasExtractedIdea: false,
            sortBy: 'ideaFitScore',
            order: 'desc',
          })}`}
          actionLabel="查看待补点子项目"
        />
        <WorkflowCard
          label="待收藏高机会项目"
          title="别让高机会项目躺在列表里"
          description="这些项目已经是高机会，但还没进收藏库，适合尽快收口成明确跟进池。"
          count={summary.highOpportunityUnfavoritedRepositories}
          href={`/?${buildRepositoryListSearchParams({
            page: 1,
            pageSize: 20,
            view: 'highOpportunityUnfavorited',
            opportunityLevel: 'HIGH',
            isFavorited: false,
            sortBy: 'ideaFitScore',
            order: 'desc',
          })}`}
          actionLabel="查看待收藏高机会项目"
        />
      </div>
    </section>
  );
}
