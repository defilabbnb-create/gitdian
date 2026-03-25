import { RepositoryOverviewSummary } from '@/lib/types/repository';
import { StatsCard } from './stats-card';

type RepositoryOverviewStatsProps = {
  summary: RepositoryOverviewSummary | null;
  errorMessage?: string | null;
};

export function RepositoryOverviewStats({
  summary,
  errorMessage = null,
}: RepositoryOverviewStatsProps) {
  if (!summary) {
    return (
      <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/80 p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          概览暂不可用
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          首页概览暂时不可用
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {errorMessage ?? '当前无法获取系统统计信息，但你仍然可以继续浏览项目列表。'}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            系统概览
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            先看整体盘面，再决定往哪批项目继续钻。
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          这些统计优先回答 3 个问题：现在库里有多少项目、真正值得看的有多少、分析流程已经覆盖到了哪一步。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatsCard
          label="仓库总数"
          value={summary.totalRepositories}
          helper="当前系统里已经沉淀下来的项目总量。"
        />
        <StatsCard
          label="已收藏数量"
          value={summary.favoritedRepositories}
          helper="你已经明确标记为重点跟进的仓库。"
        />
        <StatsCard
          label="高机会项目"
          value={summary.highOpportunityRepositories}
          helper="按 HIGH opportunity 或 RECOMMENDED 决策统计。"
        />
        <StatsCard
          label="已完成完整性分析"
          value={summary.completenessAnalyzedRepositories}
          helper="已经有 Completeness 结论的仓库数量。"
        />
        <StatsCard
          label="已完成 Idea Fit"
          value={summary.ideaFitAnalyzedRepositories}
          helper="已经跑完创业机会评分的仓库数量。"
        />
        <StatsCard
          label="已提取点子"
          value={summary.extractedIdeaRepositories}
          helper="已经产出产品点子摘要的仓库数量。"
        />
      </div>
    </section>
  );
}
