import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ClaudeAuditService } from '../analysis/claude-audit.service';
import { QueueService } from '../queue/queue.service';
import { BackfillCreatedRepositoriesDto } from './dto/backfill-created-repositories.dto';
import { FetchRepositoriesDto } from './dto/fetch-repositories.dto';
import { QueryRadarDailySummaryDto } from './dto/query-radar-daily-summary.dto';
import { GitHubRadarService } from './github-radar.service';
import { RadarDailyReportService } from './radar-daily-report.service';
import { RadarDailySummaryService } from './radar-daily-summary.service';
import { GitHubService } from './github.service';

type EnqueuedAnalysisJob = Awaited<ReturnType<QueueService['enqueueSingleAnalysis']>>;

@Controller('github')
export class GitHubController {
  constructor(
    private readonly githubService: GitHubService,
    private readonly queueService: QueueService,
    private readonly radarDailySummaryService: RadarDailySummaryService,
    private readonly radarDailyReportService: RadarDailyReportService,
    private readonly gitHubRadarService: GitHubRadarService,
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

    if (!summary || !repositoryIds.length) {
      return {
        success: true,
        data: {
          status: 'skipped',
          reason: 'no_summary_candidates',
          redirectedTo: 'primary_analysis',
          queuedCount: 0,
          jobs: [],
        },
        message: 'No latest summary candidates were available for rerun.',
      };
    }

    const jobs = await Promise.allSettled(
      repositoryIds.map((repositoryId) =>
        this.queueService.enqueueSingleAnalysis(
          repositoryId,
          {
            runFastFilter: true,
            runCompleteness: true,
            runIdeaFit: true,
            runIdeaExtract: true,
            forceRerun: true,
          },
          'legacy_claude_review_redirect',
          {
            metadata: {
              redirectedFrom: 'github/radar/claude-review/run-latest',
              legacyClaudeEntry: true,
              routerTaskIntent: 'review',
              routerReasonSummary:
                'Legacy radar Claude review endpoint now reruns the primary API analysis pipeline.',
            },
          },
        ),
      ),
    );

    const queuedJobs = jobs
      .filter(
        (result): result is PromiseFulfilledResult<EnqueuedAnalysisJob> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value);
    const failures = jobs
      .filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      )
      .map((result) =>
        result.reason instanceof Error ? result.reason.message : 'Unknown error',
      );

    if (queuedJobs.length) {
      await this.radarDailySummaryService.markSummaryForRecompute(summary.date);
    }

    const data = {
      status: 'redirected_to_primary_analysis' as const,
      runtime: 'api_primary_analysis' as const,
      summaryDate: summary.date,
      queuedCount: queuedJobs.length,
      failureCount: failures.length,
      repositoryIds,
      jobs: queuedJobs,
      failures,
    };

    return {
      success: true,
      data,
      message:
        'Legacy radar Claude review endpoint redirected to the primary analysis pipeline.',
    };
  }

  @Post('radar/claude-audit/run')
  async runClaudeAudit() {
    const data = {
      status: 'disabled',
      runtimeEnabled: false,
      redirectedTo: 'primary_analysis',
      reason:
        'Claude runtime has been retired. Use the primary API analysis pipeline and frontend-derived decision assets instead.',
    };

    return {
      success: true,
      data,
      message: 'Claude audit runtime is disabled.',
    };
  }

  @Get('radar/claude-audit/latest')
  async getLatestClaudeAudit() {
    const data = {
      runtimeEnabled: false,
      latestAudit: await this.claudeAuditService.getLatestAudit(),
    };

    return {
      success: true,
      data,
      message: 'Latest historical Claude audit fetched.',
    };
  }
}
