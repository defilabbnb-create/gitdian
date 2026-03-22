import { Body, Controller, Param, Post } from '@nestjs/common';
import { BatchIdeaFitAnalysisDto } from './dto/batch-idea-fit-analysis.dto';
import { IdeaFitService } from './idea-fit.service';

@Controller('analysis/idea-fit')
export class IdeaFitController {
  constructor(private readonly ideaFitService: IdeaFitService) {}

  @Post('batch')
  async analyzeBatch(@Body() batchDto: BatchIdeaFitAnalysisDto) {
    const data = await this.ideaFitService.analyzeBatch(batchDto);

    return {
      success: true,
      data,
      message: 'Idea fit analysis completed.',
    };
  }

  @Post(':repositoryId')
  async analyzeOne(@Param('repositoryId') repositoryId: string) {
    const data = await this.ideaFitService.analyzeRepository(repositoryId);

    return {
      success: true,
      data,
      message: 'Idea fit analysis completed successfully.',
    };
  }
}
