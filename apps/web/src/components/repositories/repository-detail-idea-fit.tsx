import { RepositoryDetailAnalysisCard } from '@/components/repositories/repository-detail-analysis-card';
import type { RepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';

type RepositoryDetailIdeaFitProps = {
  decisionViewModel: RepositoryDecisionViewModel;
};

export function RepositoryDetailIdeaFit({
  decisionViewModel,
}: RepositoryDetailIdeaFitProps) {
  const analysisModule = decisionViewModel.analysisModules.ideaFit;

  return <RepositoryDetailAnalysisCard module={analysisModule} />;
}
