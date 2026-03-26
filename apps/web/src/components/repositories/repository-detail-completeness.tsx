import { AnalysisStepRunner } from '@/components/repositories/analysis-step-runner';
import { RepositoryDetailAnalysisCard } from '@/components/repositories/repository-detail-analysis-card';
import type { RepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';
import { RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailCompletenessProps = {
  repository: RepositoryDetail;
  decisionViewModel: RepositoryDecisionViewModel;
  showRunner?: boolean;
};

export function RepositoryDetailCompleteness({
  repository,
  decisionViewModel,
  showRunner = true,
}: RepositoryDetailCompletenessProps) {
  const analysisModule = decisionViewModel.analysisModules.completeness;
  const behaviorContext = decisionViewModel.behaviorContext;

  return (
    <RepositoryDetailAnalysisCard
      module={analysisModule}
      runner={
        showRunner ? (
          <AnalysisStepRunner
            repositoryId={repository.id}
            step={analysisModule.runner.step}
            labelOverride={analysisModule.runner.label}
            runningLabelOverride={analysisModule.runner.runningLabel}
            successLabelOverride={analysisModule.runner.successLabel}
            categoryLabel={behaviorContext.categoryLabel}
            projectType={behaviorContext.projectType}
            targetUsersLabel={behaviorContext.targetUsersLabel}
            useCaseLabel={behaviorContext.useCaseLabel}
            patternKeys={behaviorContext.patternKeys}
            hasRealUser={behaviorContext.hasRealUser}
            hasClearUseCase={behaviorContext.hasClearUseCase}
            isDirectlyMonetizable={behaviorContext.isDirectlyMonetizable}
          />
        ) : null
      }
    />
  );
}
