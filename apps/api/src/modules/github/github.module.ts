import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { FastFilterModule } from '../fast-filter/fast-filter.module';
import { ClaudeReviewSchedulerService } from './claude-review-scheduler.service';
import { GitHubClient } from './github.client';
import { GitHubController } from './github.controller';
import { GitHubKeywordSupplyService } from './github-keyword-supply.service';
import { RadarDailyReportService } from './radar-daily-report.service';
import { RadarDailySummaryService } from './radar-daily-summary.service';
import { RadarOperationsService } from './radar-operations.service';
import { TelegramNotifierService } from './telegram-notifier.service';
import { GitHubRadarService } from './github-radar.service';
import { GitHubSearchConcurrencyService } from './github-search-concurrency.service';
import { GitHubSearchLimiter } from './github-search-limiter';
import { GitHubService } from './github.service';
import { GitHubTokenPool } from './github-token-pool';

@Module({
  imports: [FastFilterModule, AnalysisModule],
  controllers: [GitHubController],
  providers: [
    GitHubTokenPool,
    GitHubSearchConcurrencyService,
    GitHubSearchLimiter,
    GitHubClient,
    GitHubService,
    GitHubKeywordSupplyService,
    ClaudeReviewSchedulerService,
    RadarDailySummaryService,
    TelegramNotifierService,
    RadarDailyReportService,
    RadarOperationsService,
    GitHubRadarService,
  ],
  exports: [
    GitHubClient,
    GitHubService,
    GitHubKeywordSupplyService,
    ClaudeReviewSchedulerService,
    RadarDailySummaryService,
    TelegramNotifierService,
    RadarDailyReportService,
    RadarOperationsService,
    GitHubRadarService,
  ],
})
export class GitHubModule {}
