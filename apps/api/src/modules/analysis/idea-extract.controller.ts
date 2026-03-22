import { Body, Controller, Param, Post } from '@nestjs/common';
import { BatchIdeaExtractAnalysisDto } from './dto/batch-idea-extract-analysis.dto';
import { IdeaExtractService } from './idea-extract.service';

@Controller('analysis/idea-extract')
export class IdeaExtractController {
  constructor(private readonly ideaExtractService: IdeaExtractService) {}

  @Post('batch')
  async analyzeBatch(@Body() batchDto: BatchIdeaExtractAnalysisDto) {
    const data = await this.ideaExtractService.analyzeBatch(batchDto);

    return {
      success: true,
      data,
      message: 'Idea extraction completed.',
    };
  }

  @Post(':repositoryId')
  async analyzeOne(@Param('repositoryId') repositoryId: string) {
    const data = await this.ideaExtractService.analyzeRepository(repositoryId);

    return {
      success: true,
      data,
      message: 'Idea extraction completed successfully.',
    };
  }
}
