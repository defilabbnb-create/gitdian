import { Module } from '@nestjs/common';
import { FastFilterModule } from '../fast-filter/fast-filter.module';
import { GitHubClient } from './github.client';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';

@Module({
  imports: [FastFilterModule],
  controllers: [GitHubController],
  providers: [GitHubClient, GitHubService],
  exports: [GitHubClient, GitHubService],
})
export class GitHubModule {}
