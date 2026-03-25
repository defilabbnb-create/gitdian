import { RepositoryListItem } from '@/lib/types/repository';
import { SettingsPayload } from '@/lib/types/settings';
import { BatchAnalysisRunner } from './batch-analysis-runner';
import { GitHubCreatedBackfillRunner } from './github-created-backfill-runner';
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
            快捷动作
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            先决定现在要做什么：采集仓库、启动工具机会雷达，还是直接切到重点工作集。
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          这里收口首页最常用的动作入口。你可以先抓最新仓库，也可以直接回溯过去一年的工具项目机会池，再回到推荐视图里做判断。
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <GitHubFetchRunner githubDefaults={githubDefaults} />
        <GitHubCreatedBackfillRunner />
        <BatchAnalysisRunner repositories={repositories} />
      </div>

      <RepositoryQuickFilters query={query} />
    </section>
  );
}
