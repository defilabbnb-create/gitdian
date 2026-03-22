import { Global, Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { FastFilterModule } from '../fast-filter/fast-filter.module';
import { GitHubModule } from '../github/github.module';
import { QueueService } from './queue.service';
import { QueueWorkerService } from './queue.worker.service';

@Global()
@Module({
  imports: [GitHubModule, AnalysisModule, FastFilterModule],
  providers: [QueueService, QueueWorkerService],
  exports: [QueueService],
})
export class QueueModule {}
