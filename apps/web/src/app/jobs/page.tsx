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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
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
    </main>
  );
}
