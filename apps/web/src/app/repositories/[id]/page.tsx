import { notFound } from 'next/navigation';
import { RepositoryAnalysisWorkbench } from '@/components/repositories/repository-analysis-workbench';
import { RepositoryDetailConclusion } from '@/components/repositories/repository-detail-conclusion';
import { RepositoryDetailHeader } from '@/components/repositories/repository-detail-header';
import { RelatedRepositories } from '@/components/repositories/related-repositories';
import { RepositoryRelatedJobs } from '@/components/repositories/repository-related-jobs';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';
import { getJobLogsForRepository } from '@/lib/api/job-logs';
import { getRepositories, getRepositoryById } from '@/lib/api/repositories';
import {
  ApiRequestError,
  RelatedRepositoryItem,
  RepositoryDetail,
  RepositoryListItem,
} from '@/lib/types/repository';

export const dynamic = 'force-dynamic';

type RepositoryDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function RepositoryDetailPage({
  params,
}: RepositoryDetailPageProps) {
  const { id } = await params;
  let repository = null;
  let errorMessage: string | null = null;
  let relatedJobs = null;
  let relatedJobsErrorMessage: string | null = null;
  let relatedRepositories: RelatedRepositoryItem[] = [];
  let relatedRepositoriesErrorMessage: string | null = null;

  try {
    repository = await getRepositoryById(id, { timeoutMs: 8_000 });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }

    errorMessage = getFriendlyRuntimeError(
      error,
      '仓库详情暂时无法加载，请稍后重试。',
    );
  }

  if (repository) {
    const [relatedJobsResult, relatedRepositoriesResult] =
      await Promise.allSettled([
        getJobLogsForRepository(repository.id, 5, {
          timeoutMs: 4_000,
        }),
        getRelatedRepositories(repository, {
          timeoutMs: 4_000,
        }),
      ]);

    if (relatedJobsResult.status === 'fulfilled') {
      relatedJobs = relatedJobsResult.value;
    } else {
      relatedJobsErrorMessage = getFriendlyRuntimeError(
        relatedJobsResult.reason,
        '关联任务记录暂时无法加载。',
      );
    }

    if (relatedRepositoriesResult.status === 'fulfilled') {
      relatedRepositories = relatedRepositoriesResult.value;
    } else {
      relatedRepositoriesErrorMessage = getFriendlyRuntimeError(
        relatedRepositoriesResult.reason,
        '相邻推荐项目暂时无法加载。',
      );
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        {repository ? (
          <>
            <RepositoryDetailHeader repository={repository} />
            <RepositoryDetailConclusion
              repository={repository}
              relatedJobs={relatedJobs?.items ?? []}
            />
            <RepositoryAnalysisWorkbench
              repository={repository}
              relatedJobs={relatedJobs?.items ?? []}
            />
            <details className="group rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      延伸参考
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      只有当你要继续横向比较时，再展开相关机会和关联任务。
                    </h2>
                  </div>
                  <span className="text-sm font-semibold text-slate-600 transition group-open:rotate-180">
                    展开
                  </span>
                </div>
              </summary>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <RelatedRepositories
                  items={relatedRepositories}
                  errorMessage={relatedRepositoriesErrorMessage}
                />
                <RepositoryRelatedJobs
                  repositoryId={repository.id}
                  jobs={relatedJobs}
                  errorMessage={relatedJobsErrorMessage}
                />
              </div>
            </details>
          </>
        ) : (
          <section className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
              加载失败
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-rose-950">
              仓库详情暂时加载失败
            </h1>
            <p className="mt-4 text-sm leading-7 text-rose-800">
              {errorMessage ?? '请检查后端 API 是否正常运行。'}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

async function getRelatedRepositories(
  repository: RepositoryDetail,
  options: {
    timeoutMs?: number;
  } = {},
) {
  const candidates = await getRepositories({
    page: 1,
    pageSize: 12,
    view: 'all',
    displayMode: 'insight',
    language: repository.language ?? undefined,
    opportunityLevel: repository.opportunityLevel ?? undefined,
    sortBy: repository.ideaFitScore ? 'ideaFitScore' : 'latest',
    order: 'desc',
  }, {
    timeoutMs: options.timeoutMs ?? 6_000,
  });

  const currentTopics = new Set((repository.topics ?? []).map(normalizeTopic));

  return candidates.items
    .filter((item) => item.id !== repository.id)
    .map((item) => rankRelatedRepository(item, repository, currentTopics))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (right.repository.ideaFitScore ?? 0) - (left.repository.ideaFitScore ?? 0);
    })
    .slice(0, 4)
    .map(({ repository: candidate, reasons }) => ({
      ...candidate,
      relatedReasonLabels: reasons,
    }));
}

function rankRelatedRepository(
  candidate: RepositoryListItem,
  currentRepository: RepositoryDetail,
  currentTopics: Set<string>,
) {
  let score = 0;
  const reasons: string[] = [];

  if (
    currentRepository.language &&
    candidate.language &&
    currentRepository.language === candidate.language
  ) {
    score += 3;
    reasons.push('同语言');
  }

  if (
    currentRepository.opportunityLevel &&
    candidate.opportunityLevel &&
    currentRepository.opportunityLevel === candidate.opportunityLevel
  ) {
    score += 2;
    reasons.push('同机会等级');
  }

  const candidateTopics = (candidate.topics ?? []).map(normalizeTopic);
  const topicOverlap = candidateTopics.filter((topic) => currentTopics.has(topic)).length;

  if (topicOverlap > 0) {
    score += Math.min(topicOverlap, 3);
    reasons.push('话题相近');
  }

  return {
    repository: candidate,
    reasons: reasons.slice(0, 3),
    score,
  };
}

function normalizeTopic(value: string) {
  return value.trim().toLowerCase();
}
