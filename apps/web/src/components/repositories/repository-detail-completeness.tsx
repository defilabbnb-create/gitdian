import React from 'react';
import { RepositoryDetailAnalysisCard } from '@/components/repositories/repository-detail-analysis-card';
import type { RepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';

type RepositoryDetailCompletenessProps = {
  decisionViewModel: RepositoryDecisionViewModel;
};

export function RepositoryDetailCompleteness({
  decisionViewModel,
}: RepositoryDetailCompletenessProps) {
  const analysisModule = decisionViewModel.analysisModules.completeness;

  return <RepositoryDetailAnalysisCard module={analysisModule} />;
}
