import { AnalysisRunner } from '@/components/repositories/analysis-runner';
import { ExportRepositoryJsonButton } from '@/components/repositories/export-repository-json-button';
import { RepositoryDetailContentSummary } from '@/components/repositories/repository-detail-content-summary';
import { RepositoryDetailFavorite } from '@/components/repositories/repository-detail-favorite';
import { RepositoryDetailMetadata } from '@/components/repositories/repository-detail-metadata';
import { RepositoryDetailMetrics } from '@/components/repositories/repository-detail-metrics';
import { RepositoryManualInsightControls } from '@/components/repositories/repository-manual-insight-controls';
import type { RepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';
import { JobLogItem, RepositoryDetail } from '@/lib/types/repository';

type RepositoryAnalysisWorkbenchProps = {
  repository: RepositoryDetail;
  relatedJobs?: JobLogItem[] | null;
  decisionViewModel: RepositoryDecisionViewModel;
};

export function RepositoryAnalysisWorkbench({
  repository,
  decisionViewModel,
}: RepositoryAnalysisWorkbenchProps) {
  const behaviorContext = decisionViewModel.behaviorContext;
  const comparison = decisionViewModel.evidence.comparison;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,0.94)_100%)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              判断对比
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <WorkbenchMetric
                label="本地初判"
                value={comparison.localVerdict}
              />
              <WorkbenchMetric
                label="Claude 复核"
                value={comparison.claudeVerdict}
              />
            </div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
              <p>
                <span className="font-semibold text-slate-900">本地一句话：</span>
                {comparison.localOneLiner}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Claude 一句话：</span>
                {comparison.claudeOneLiner}
              </p>
              <p>
                <span className="font-semibold text-slate-900">冲突原因：</span>
                {comparison.conflictSummary}
              </p>
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
          <RepositoryDetailMetrics repository={repository} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <RepositoryDetailMetadata repository={repository} />
        <div className="space-y-6">
          <RepositoryDetailFavorite repository={repository} />
          <RepositoryDetailContentSummary repository={repository} />
        </div>
      </div>
    </div>
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
