import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FastFilterModule } from '../fast-filter/fast-filter.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisTrainingKnowledgeService } from './analysis-training-knowledge.service';
import { ClaudeAuditService } from './claude-audit.service';
import { ClaudeConcurrencyService } from './claude-concurrency.service';
import { ClaudeReviewDiffService } from './claude-review-diff.service';
import { AnalysisOrchestratorService } from './analysis-orchestrator.service';
import { ClaudeReviewService } from './claude-review.service';
import { ClaudeTrainingHintsService } from './claude-training-hints.service';
import { CompletenessService } from './completeness.service';
import { HistoricalDataRecoveryService } from './historical-data-recovery.service';
import { IdeaExtractController } from './idea-extract.controller';
import { IdeaExtractService } from './idea-extract.service';
import { IdeaFitController } from './idea-fit.controller';
import { IdeaFitService } from './idea-fit.service';
import { IdeaSnapshotService } from './idea-snapshot.service';
import { MoneyLearningService } from './money-learning.service';
import { MoneyPriorityService } from './money-priority.service';
import { RepositoryCachedRankingService } from './repository-cached-ranking.service';
import { RepositoryDecisionService } from './repository-decision.service';
import { RepositoryInsightService } from './repository-insight.service';
import { SelfTuningService } from './self-tuning.service';
import { TrainingKnowledgeExportService } from './training-knowledge-export.service';

@Module({
  imports: [AiModule, FastFilterModule],
  controllers: [AnalysisController, IdeaFitController, IdeaExtractController],
  providers: [
    CompletenessService,
    IdeaFitService,
    IdeaExtractService,
    IdeaSnapshotService,
    RepositoryInsightService,
    MoneyLearningService,
    MoneyPriorityService,
    RepositoryCachedRankingService,
    RepositoryDecisionService,
    AnalysisTrainingKnowledgeService,
    SelfTuningService,
    ClaudeAuditService,
    ClaudeConcurrencyService,
    ClaudeReviewDiffService,
    ClaudeTrainingHintsService,
    ClaudeReviewService,
    TrainingKnowledgeExportService,
    HistoricalDataRecoveryService,
    AnalysisOrchestratorService,
  ],
  exports: [
    AnalysisOrchestratorService,
    IdeaSnapshotService,
    RepositoryInsightService,
    MoneyLearningService,
    MoneyPriorityService,
    RepositoryCachedRankingService,
    RepositoryDecisionService,
    AnalysisTrainingKnowledgeService,
    SelfTuningService,
    ClaudeAuditService,
    ClaudeConcurrencyService,
    ClaudeReviewDiffService,
    ClaudeTrainingHintsService,
    ClaudeReviewService,
    TrainingKnowledgeExportService,
    HistoricalDataRecoveryService,
  ],
})
export class AnalysisModule {}
