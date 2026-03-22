import { Body, Controller, Param, Post } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';
import { BatchFastFilterDto } from './dto/batch-fast-filter.dto';
import { FastFilterService } from './fast-filter.service';

@Controller('fast-filter')
export class FastFilterController {
  constructor(
    private readonly fastFilterService: FastFilterService,
    private readonly queueService: QueueService,
  ) {}

  @Post('batch')
  async evaluateBatch(@Body() batchFastFilterDto: BatchFastFilterDto) {
    const data = await this.fastFilterService.evaluateBatch(batchFastFilterDto);

    return {
      success: true,
      data,
      message: 'Batch fast filter completed.',
    };
  }

  @Post(':repositoryId')
  async evaluateOne(@Param('repositoryId') repositoryId: string) {
    const data = await this.fastFilterService.evaluateRepository(repositoryId);

    return {
      success: true,
      data,
      message: 'Fast filter completed successfully.',
    };
  }

  @Post('batch/async')
  async evaluateBatchAsync(@Body() batchFastFilterDto: BatchFastFilterDto) {
    const data = await this.queueService.enqueueFastFilterBatch(
      batchFastFilterDto,
    );

    return {
      success: true,
      data,
      message: 'Batch fast filter task created.',
    };
  }
}
