import { Body, Controller, Param, Post } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';
import { AnalysisOrchestratorService } from './analysis-orchestrator.service';
import { BatchRunAnalysisDto } from './dto/batch-run-analysis.dto';
import { BatchCompletenessAnalysisDto } from './dto/batch-completeness-analysis.dto';
import { RunAnalysisDto } from './dto/run-analysis.dto';
import { CompletenessService } from './completeness.service';

@Controller('analysis')
export class AnalysisController {
  constructor(
    private readonly completenessService: CompletenessService,
    private readonly analysisOrchestratorService: AnalysisOrchestratorService,
    private readonly queueService: QueueService,
  ) {}

  @Post('completeness/batch')
  async analyzeBatch(@Body() batchDto: BatchCompletenessAnalysisDto) {
    const data = await this.completenessService.analyzeBatch(batchDto);

    return {
      success: true,
      data,
      message: 'Batch completeness analysis completed.',
    };
  }

  @Post('completeness/:repositoryId')
  async analyzeOne(@Param('repositoryId') repositoryId: string) {
    const data = await this.completenessService.analyzeRepository(repositoryId);

    return {
      success: true,
      data,
      message: 'Completeness analysis completed successfully.',
    };
  }

  @Post('run/batch')
  async runBatch(@Body() batchRunAnalysisDto: BatchRunAnalysisDto) {
    const data = await this.analysisOrchestratorService.runBatchAnalysis(
      batchRunAnalysisDto,
    );

    return {
      success: true,
      data,
      message: 'Batch analysis run completed.',
    };
  }

  @Post('run/:repositoryId')
  async runOne(
    @Param('repositoryId') repositoryId: string,
    @Body() runAnalysisDto: RunAnalysisDto,
  ) {
    const data = await this.analysisOrchestratorService.runRepositoryAnalysis(
      repositoryId,
      runAnalysisDto,
    );

    return {
      success: true,
      data,
      message: 'Analysis run completed.',
    };
  }

  @Post('run/batch/async')
  async runBatchAsync(@Body() batchRunAnalysisDto: BatchRunAnalysisDto) {
    const data = await this.queueService.enqueueBatchAnalysis(batchRunAnalysisDto);

    return {
      success: true,
      data,
      message: 'Batch analysis task created.',
    };
  }

  @Post('run/:repositoryId/async')
  async runOneAsync(
    @Param('repositoryId') repositoryId: string,
    @Body() runAnalysisDto: RunAnalysisDto,
  ) {
    const data = await this.queueService.enqueueSingleAnalysis(
      repositoryId,
      runAnalysisDto,
    );

    return {
      success: true,
      data,
      message: 'Analysis task created.',
    };
  }
}
