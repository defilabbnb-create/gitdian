import { AppPageHero, AppPageShell } from '@/components/app/page-shell';
import { JobsExpandedFlow } from '@/components/jobs/jobs-expanded-flow';
import { JobsPriorityBoard } from '@/components/jobs/jobs-priority-board';
import { RuntimeFailurePanel } from '@/components/runtime-failure-panel';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';
import { getJobLogs } from '@/lib/api/job-logs';
import { getRepositoryById } from '@/lib/api/repositories';
import { normalizeJobLogListQuery } from '@/lib/types/repository';

export const dynamic = 'force-dynamic';

type JobsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const resolvedSearchParams = normalizeJobLogListQuery((await searchParams) ?? {});

  let jobs = null;
  let errorMessage: string | null = null;
  let repositoryContext = null;
  let repositoryContextErrorMessage: string | null = null;

  if (resolvedSearchParams.repositoryId) {
    try {
      const repository = await getRepositoryById(resolvedSearchParams.repositoryId);
      repositoryContext = {
        id: repository.id,
        name: repository.name,
        fullName: repository.fullName,
      };
    } catch (error) {
      repositoryContextErrorMessage =
        error instanceof Error ? error.message : '仓库上下文暂时无法加载。';
    }
  }

  try {
    jobs = await getJobLogs(resolvedSearchParams, {
      timeoutMs: 6_000,
    });
  } catch (error) {
    errorMessage = getFriendlyRuntimeError(
      error,
      '暂时无法从后端加载任务历史，请检查 API 服务。',
    );
  }

  return (
    <AppPageShell tone="amber">
      <AppPageHero
        eyebrow="执行队列"
        title="任务页应该一眼看出哪里在推进，哪里卡住，哪里需要补跑。"
        description="这里不是简单日志堆叠，而是执行面板。优先看优先级、仓库上下文、失败重试和当前焦点任务，再决定要不要回到项目池或冷门池。"
        tone="amber"
        chips={[
          repositoryContext ? `当前仓库：${repositoryContext.name}` : '全局任务视角',
          resolvedSearchParams.focusJobId ? '已定位焦点任务' : '未锁定单任务',
          '任务流与优先级同时看',
        ]}
        stats={[
          {
            label: '仓库上下文',
            value: repositoryContext ? repositoryContext.name : '全部仓库',
            helper: repositoryContext ? repositoryContext.fullName : '当前没有限定仓库。',
          },
          {
            label: '筛选模式',
            value: resolvedSearchParams.focusJobId ? '聚焦排障' : '总览巡检',
            helper: '带 `focusJobId` 时优先看单任务链路。',
          },
        ]}
      />

      <div className="space-y-6">
        {errorMessage ? (
          <RuntimeFailurePanel
            title="任务历史暂时加载失败"
            message={errorMessage}
            recoveryLabel="回到首页先看可用入口"
            recoveryHref="/"
          />
        ) : jobs ? (
          <section className="space-y-6">
            <JobsPriorityBoard
              items={jobs.items}
              query={resolvedSearchParams}
              currentRepositoryId={resolvedSearchParams.repositoryId}
              focusedJobId={resolvedSearchParams.focusJobId}
            />
            <JobsExpandedFlow
              items={jobs.items}
              pagination={jobs.pagination}
              query={resolvedSearchParams}
              currentRepositoryId={resolvedSearchParams.repositoryId}
              focusedJobId={resolvedSearchParams.focusJobId}
              repositoryContext={repositoryContext}
              repositoryContextErrorMessage={repositoryContextErrorMessage}
            />
          </section>
        ) : null}
      </div>
    </AppPageShell>
  );
}
