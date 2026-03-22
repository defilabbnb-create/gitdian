import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JobLogService } from './job-log.service';
import { QueryJobLogsDto } from './dto/query-job-logs.dto';
import { QueueService } from '../queue/queue.service';

@Controller('job-logs')
export class JobLogController {
  constructor(
    private readonly jobLogService: JobLogService,
    private readonly queueService: QueueService,
  ) {}

  @Get()
  async findAll(@Query() query: QueryJobLogsDto) {
    const data = await this.jobLogService.queryJobs(query);

    return {
      success: true,
      data,
      message: 'Job logs fetched.',
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.queueService.getJobRuntimeInfo(id);

    return {
      success: true,
      data,
      message: 'Job log fetched.',
    };
  }

  @Post(':id/retry')
  async retry(@Param('id') id: string) {
    const data = await this.queueService.retryJob(id);

    return {
      success: true,
      data,
      message: 'Retry task created.',
    };
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    const data = await this.queueService.cancelJob(id);

    return {
      success: true,
      data,
      message: 'Task cancelled.',
    };
  }
}
