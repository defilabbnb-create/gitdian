import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ClaudeAuditService } from '../analysis/claude-audit.service';
import { ClaudeReviewService } from '../analysis/claude-review.service';
import { QueueService } from '../queue/queue.service';
import { BackfillCreatedRepositoriesDto } from './dto/backfill-created-repositories.dto';
import { FetchRepositoriesDto } from './dto/fetch-repositories.dto';
import { QueryRadarDailySummaryDto } from './dto/query-radar-daily-summary.dto';
import { GitHubRadarService } from './github-radar.service';
import { RadarDailyReportService } from './radar-daily-report.service';
import { RadarDailySummaryService } from './radar-daily-summary.service';
import { GitHubService } from './github.service';

@Controller('github')
export class GitHubController {
  constructor(
    private readonly githubService: GitHubService,
    private readonly queueService: QueueService,
    private readonly radarDailySummaryService: RadarDailySummaryService,
    private readonly radarDailyReportService: RadarDailyReportService,
    private readonly gitHubRadarService: GitHubRadarService,
    private readonly claudeReviewService: ClaudeReviewService,
    private readonly claudeAuditService: ClaudeAuditService,
  ) {}

  @Post('fetch-repositories')
  async fetchRepositories(@Body() fetchRepositoriesDto: FetchRepositoriesDto) {
    const data = await this.githubService.fetchRepositories(fetchRepositoriesDto);

    return {
      success: true,
      data,
      message: 'Fetch completed.',
    };
  }

  @Post('fetch-repositories/async')
  async fetchRepositoriesAsync(@Body() fetchRepositoriesDto: FetchRepositoriesDto) {
    const data = await this.queueService.enqueueGitHubFetch(fetchRepositoriesDto);

    return {
      success: true,
      data,
      message: 'Fetch task created.',
    };
  }

  @Post('backfill-created-repositories/async')
  async backfillCreatedRepositoriesAsync(
    @Body() backfillDto: BackfillCreatedRepositoriesDto,
  ) {
    const data = await this.queueService.enqueueGitHubCreatedBackfill(backfillDto);

    return {
      success: true,
      data,
      message: 'Created backfill task created.',
    };
  }

  @Post('radar/start')
  async startRadar() {
    const data = await this.gitHubRadarService.start();

    return {
      success: true,
      data,
      message: 'Daily autonomous radar started.',
    };
  }

  @Post('radar/pause')
  async pauseRadar() {
    const data = await this.gitHubRadarService.pause();

    return {
      success: true,
      data,
      message: 'Daily autonomous radar paused.',
    };
  }

  @Post('radar/resume')
  async resumeRadar() {
    const data = await this.gitHubRadarService.resume();

    return {
      success: true,
      data,
      message: 'Daily autonomous radar resumed.',
    };
  }

  @Get('radar/status')
  async getRadarStatus() {
    const data = await this.gitHubRadarService.getStatus();

    return {
      success: true,
      data,
      message: 'Daily autonomous radar status fetched.',
    };
  }

  @Get('radar/daily-summary')
  async getRadarDailySummary(@Query() query: QueryRadarDailySummaryDto) {
    const data = await this.radarDailySummaryService.getRecentSummaries(query.days);

    return {
      success: true,
      data,
      message: 'Daily radar summaries fetched.',
    };
  }

  @Get('radar/daily-summary/latest')
  async getLatestRadarDailySummary() {
    const data = await this.radarDailySummaryService.getLatestSummary();

    return {
      success: true,
      data,
      message: 'Latest daily radar summary fetched.',
    };
  }

  @Post('radar/daily-summary/send-latest')
  async sendLatestRadarDailySummary() {
    const data = await this.radarDailyReportService.sendLatestSummary({
      source: 'manual',
    });

    return {
      success: true,
      data,
      message: 'Latest daily radar summary send attempted.',
    };
  }

  @Post('radar/claude-review/run-latest')
  async runLatestClaudeReview() {
    const summary = await this.radarDailySummaryService.getLatestSummary();
    const repositoryIds = summary
      ? Array.from(
          new Set([
            ...summary.topGoodRepositoryIds,
            ...summary.topCloneRepositoryIds,
            ...summary.topRepositoryIds,
          ]),
        )
      : [];
    const data = summary
      ? await this.claudeReviewService.reviewRepositoryIds(repositoryIds, {
          topCandidate: true,
          source: 'manual',
        })
      : { processed: 0, results: [] };

    if (summary && data.results.some((result) => result.status === 'reviewed')) {
      await this.radarDailySummaryService.markSummaryForRecompute(summary.date);
    }

    return {
      success: true,
      data,
      message: 'Latest Claude review attempt completed.',
    };
  }

  @Post('radar/claude-audit/run')
  async runClaudeAudit() {
    const data = await this.claudeAuditService.runAudit({
      source: 'manual',
      force: true,
    });

    return {
      success: true,
      data,
      message: 'Claude quality audit completed.',
    };
  }

  @Get('radar/claude-audit/latest')
  async getLatestClaudeAudit() {
    const data = await this.claudeAuditService.getLatestAudit();

    return {
      success: true,
      data,
      message: 'Latest Claude quality audit fetched.',
    };
  }
}
