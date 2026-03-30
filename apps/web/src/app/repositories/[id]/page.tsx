import { notFound } from 'next/navigation';
import { RepositoryAnalysisWorkbench } from '@/components/repositories/repository-analysis-workbench';
import { RepositoryDetailConclusion } from '@/components/repositories/repository-detail-conclusion';
import { RepositoryDetailHeader } from '@/components/repositories/repository-detail-header';
import { RepositoryDetailCompleteness } from '@/components/repositories/repository-detail-completeness';
import { RepositoryEvidenceDisclosure } from '@/components/repositories/repository-evidence-disclosure';
import { RepositoryDetailIdeaExtract } from '@/components/repositories/repository-detail-idea-extract';
import { RepositoryDetailIdeaFit } from '@/components/repositories/repository-detail-idea-fit';
import { RepositoryNextSteps } from '@/components/repositories/repository-next-steps';
import { RelatedRepositories } from '@/components/repositories/related-repositories';
import { RepositoryRelatedJobs } from '@/components/repositories/repository-related-jobs';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';
import { getJobLogsForRepository } from '@/lib/api/job-logs';
import { getRepositories, getRepositoryById } from '@/lib/api/repositories';
import { buildRepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';
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

  const relatedJobItems = relatedJobs?.items ?? [];
  const decisionView = repository
    ? buildRepositoryDecisionViewModel(repository, {
        relatedJobs: relatedJobItems,
      })
    : null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        {repository ? (
          <>
            {decisionView ? (
              <>
                <RepositoryDetailHeader
                  repository={repository}
                  decisionViewModel={decisionView}
                />
                <RepositoryDetailConclusion decisionViewModel={decisionView} />
              </>
            ) : null}

            {decisionView ? (
              <section className="grid gap-6 xl:grid-cols-3">
                <RepositoryDetailIdeaFit decisionViewModel={decisionView} />
                <RepositoryDetailIdeaExtract decisionViewModel={decisionView} />
                <RepositoryDetailCompleteness decisionViewModel={decisionView} />
              </section>
            ) : null}

            {decisionView ? (
              <RepositoryNextSteps
                repoId={repository.id}
                name={repository.name}
                fullName={repository.fullName}
                htmlUrl={repository.htmlUrl}
                headline={decisionView.display.headline}
                reason={decisionView.display.reason}
                decisionViewModel={decisionView}
                isFavorited={repository.isFavorited}
                favoriteNote={repository.favorite?.note ?? null}
                categoryLabel={decisionView.behaviorContext.categoryLabel}
                projectType={decisionView.behaviorContext.projectType}
                targetUsersLabel={decisionView.behaviorContext.targetUsersLabel}
                useCaseLabel={decisionView.behaviorContext.useCaseLabel}
                patternKeys={decisionView.behaviorContext.patternKeys}
                hasRealUser={decisionView.behaviorContext.hasRealUser}
                hasClearUseCase={decisionView.behaviorContext.hasClearUseCase}
                isDirectlyMonetizable={decisionView.behaviorContext.isDirectlyMonetizable}
              />
            ) : null}

            <RepositoryEvidenceDisclosure
              title="更深的判断对比、补跑入口和原始证据都放到这里，默认不打断主流程。"
              description="只有当你要复核结论、补跑判断或核对原始仓库证据时，再展开这一层。"
            >
                <RepositoryAnalysisWorkbench
                  repository={repository}
                  relatedJobs={relatedJobItems}
                  decisionViewModel={decisionView!}
                />

                <div className="grid gap-6 xl:grid-cols-2">
                  <details className="group rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            相邻机会
                          </p>
                          <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                            只有当你要横向比较时，再看这些相邻项目。
                          </h3>
                          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                            这里先回答它是不是同类里更值得继续看的候选。
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-slate-600 transition group-open:rotate-180">
                          展开
                        </span>
                      </div>
                    </summary>

                    <div className="mt-6 border-t border-slate-200 pt-6">
                      <RelatedRepositories
                        items={relatedRepositories}
                        errorMessage={relatedRepositoriesErrorMessage}
                      />
                    </div>
                  </details>

                  <details className="group rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            关联任务
                          </p>
                          <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                            只有当你要排查执行状态时，再看这些关联任务。
                          </h3>
                          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                            这里先回答它是不是卡在队列、失败重试，还是已经完成。
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-slate-600 transition group-open:rotate-180">
                          展开
                        </span>
                      </div>
                    </summary>

                    <div className="mt-6 border-t border-slate-200 pt-6">
                      <RepositoryRelatedJobs
                        repositoryId={repository.id}
                        jobs={relatedJobs}
                        errorMessage={relatedJobsErrorMessage}
                      />
                    </div>
                  </details>
                </div>
            </RepositoryEvidenceDisclosure>
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
