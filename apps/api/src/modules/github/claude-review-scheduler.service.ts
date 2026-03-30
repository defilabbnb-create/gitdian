import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

@Injectable()
export class ClaudeReviewSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  onModuleInit() {}

  onModuleDestroy() {}

  async maybeReviewLatestSummary() {
    return {
      status: 'disabled' as const,
      reason: 'claude_runtime_retired',
    };
  }
}
