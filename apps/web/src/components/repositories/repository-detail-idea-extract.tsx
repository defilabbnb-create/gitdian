import React from 'react';
import { RepositoryDetailAnalysisCard } from '@/components/repositories/repository-detail-analysis-card';
import type { RepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';

type RepositoryDetailIdeaExtractProps = {
  decisionViewModel: RepositoryDecisionViewModel;
};

export function RepositoryDetailIdeaExtract({
  decisionViewModel,
}: RepositoryDetailIdeaExtractProps) {
  const analysisModule = decisionViewModel.analysisModules.ideaExtract;

  return <RepositoryDetailAnalysisCard module={analysisModule} />;
}
