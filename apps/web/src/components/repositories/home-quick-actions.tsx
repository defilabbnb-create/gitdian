import { RepositoryListItem } from '@/lib/types/repository';
import { SettingsPayload } from '@/lib/types/settings';
import { BatchAnalysisRunner } from './batch-analysis-runner';
import { GitHubFetchRunner } from './github-fetch-runner';
import { RepositoryQuickFilters } from './repository-quick-filters';
import { RepositoryListQueryState } from '@/lib/types/repository';

type HomeQuickActionsProps = {
  repositories: RepositoryListItem[];
  query: RepositoryListQueryState;
  githubDefaults?: SettingsPayload['github'] | null;
};

export function HomeQuickActions({
  repositories,
  query,
  githubDefaults,
}: HomeQuickActionsProps) {
  return (
    <section className="space-y-5 rounded-[32px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(248,250,252,0.98)_100%)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Quick Actions
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            先决定现在要做什么：采集新仓库、补分析，还是直接切到重点工作集。
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          这里收口首页最常用的动作入口。逻辑上仍然是独立功能，只是在视觉上统一归到一层，方便你先做动作，再回到推荐视图和列表判断结果。
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <GitHubFetchRunner githubDefaults={githubDefaults} />
        <BatchAnalysisRunner repositories={repositories} />
      </div>

      <RepositoryQuickFilters query={query} />
    </section>
  );
}
