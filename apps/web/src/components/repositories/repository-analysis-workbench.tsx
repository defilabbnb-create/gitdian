import { AnalysisRunner } from '@/components/repositories/analysis-runner';
import { ExportRepositoryJsonButton } from '@/components/repositories/export-repository-json-button';
import { RepositoryDetailCompleteness } from '@/components/repositories/repository-detail-completeness';
import { RepositoryDetailContentSummary } from '@/components/repositories/repository-detail-content-summary';
import { RepositoryDetailFavorite } from '@/components/repositories/repository-detail-favorite';
import { RepositoryDetailIdeaExtract } from '@/components/repositories/repository-detail-idea-extract';
import { RepositoryDetailIdeaFit } from '@/components/repositories/repository-detail-idea-fit';
import { RepositoryDetailMetadata } from '@/components/repositories/repository-detail-metadata';
import { RepositoryDetailMetrics } from '@/components/repositories/repository-detail-metrics';
import { RepositoryManualInsightControls } from '@/components/repositories/repository-manual-insight-controls';
import { RepositoryWorkflowAdvice } from '@/components/repositories/repository-workflow-advice';
import {
  getRepositoryActionBehaviorContext,
  getRepositoryDecisionSummary,
} from '@/lib/repository-decision';
import { JobLogItem, RepositoryDetail } from '@/lib/types/repository';

type RepositoryAnalysisWorkbenchProps = {
  repository: RepositoryDetail;
  relatedJobs?: JobLogItem[] | null;
};

export function RepositoryAnalysisWorkbench({
  repository,
  relatedJobs,
}: RepositoryAnalysisWorkbenchProps) {
  const summary = getRepositoryDecisionSummary(repository);
  const behaviorContext = getRepositoryActionBehaviorContext(repository, summary);

  return (
    <details className="group rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              证据与补跑
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              只有当你要补证据、重跑判断或校准结果时，再展开这一层。
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              顶部先帮你做决定，这一层只在你需要继续核对时再打开。
            </p>
          </div>
          <span className="text-sm font-semibold text-slate-600 transition group-open:rotate-180">
            展开
          </span>
        </div>
      </summary>

      <div className="mt-6 space-y-6">
        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,0.94)_100%)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                判断对比
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <WorkbenchMetric
                  label="本地初判"
                  value={summary.comparison.localVerdict}
                />
                <WorkbenchMetric
                  label="Claude 复核"
                  value={summary.comparison.claudeVerdict}
                />
              </div>
              <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                <p>
                  <span className="font-semibold text-slate-900">本地一句话：</span>
                  {summary.comparison.localOneLiner}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Claude 一句话：</span>
                  {summary.comparison.claudeOneLiner}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">冲突原因：</span>
                  {summary.conflictReasons.length
                    ? summary.conflictReasons.join('、')
                    : '当前没有明显冲突'}
                </p>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,0.94)_100%)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                下次别再踩的坑
              </p>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600">
                <div>
                  <p className="font-semibold text-slate-900">错误类型</p>
                  <p>
                    {summary.trainingMistakes.length
                      ? summary.trainingMistakes.join('、')
                      : '当前还没有新的错误类型沉淀。'}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">建议</p>
                  <p>
                    {summary.trainingSuggestions.length
                      ? summary.trainingSuggestions.join('；')
                      : '当前还没有新的训练建议。'}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <ExportRepositoryJsonButton repository={repository} />
              </div>
              <div className="mt-5">
                <AnalysisRunner
                  repositoryId={repository.id}
                  categoryLabel={behaviorContext.categoryLabel}
                  projectType={behaviorContext.projectType}
                  targetUsersLabel={behaviorContext.targetUsersLabel}
                  useCaseLabel={behaviorContext.useCaseLabel}
                  patternKeys={behaviorContext.patternKeys}
                  hasRealUser={behaviorContext.hasRealUser}
                  hasClearUseCase={behaviorContext.hasClearUseCase}
                  isDirectlyMonetizable={behaviorContext.isDirectlyMonetizable}
                />
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <RepositoryManualInsightControls
              repositoryId={repository.id}
              manualOverride={repository.analysis?.manualOverride ?? null}
            />
            <RepositoryWorkflowAdvice repository={repository} />
            <RepositoryDetailMetrics repository={repository} />
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <RepositoryDetailIdeaFit
            repository={repository}
            relatedJobs={relatedJobs}
          />
          <RepositoryDetailIdeaExtract
            repository={repository}
            relatedJobs={relatedJobs}
          />
        </div>

        <RepositoryDetailCompleteness
          repository={repository}
          relatedJobs={relatedJobs}
        />

        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <RepositoryDetailMetadata repository={repository} />
          <div className="space-y-6">
            <RepositoryDetailFavorite repository={repository} />
            <RepositoryDetailContentSummary repository={repository} />
          </div>
        </div>
      </div>
    </details>
  );
}

function WorkbenchMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}
