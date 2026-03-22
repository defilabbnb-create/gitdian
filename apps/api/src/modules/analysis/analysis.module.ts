import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FastFilterModule } from '../fast-filter/fast-filter.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisOrchestratorService } from './analysis-orchestrator.service';
import { CompletenessService } from './completeness.service';
import { IdeaExtractController } from './idea-extract.controller';
import { IdeaExtractService } from './idea-extract.service';
import { IdeaFitController } from './idea-fit.controller';
import { IdeaFitService } from './idea-fit.service';

@Module({
  imports: [AiModule, FastFilterModule],
  controllers: [AnalysisController, IdeaFitController, IdeaExtractController],
  providers: [
    CompletenessService,
    IdeaFitService,
    IdeaExtractService,
    AnalysisOrchestratorService,
  ],
  exports: [AnalysisOrchestratorService],
})
export class AnalysisModule {}
