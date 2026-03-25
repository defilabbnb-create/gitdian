import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClaudeReviewService } from '../analysis/claude-review.service';
import { AdaptiveSchedulerService } from '../scheduler/adaptive-scheduler.service';
import { RadarDailySummaryService } from './radar-daily-summary.service';

@Injectable()
export class ClaudeReviewSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ClaudeReviewSchedulerService.name);
  private schedulerTimer: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(
    private readonly claudeReviewService: ClaudeReviewService,
    private readonly radarDailySummaryService: RadarDailySummaryService,
    private readonly adaptiveSchedulerService: AdaptiveSchedulerService,
  ) {}

  onModuleInit() {
    if (
      process.env.ENABLE_QUEUE_WORKERS !== 'true' ||
      !this.claudeReviewService.isEnabled()
    ) {
      return;
    }

    this.schedulerTimer = setInterval(() => {
      void this.maybeReviewLatestSummary();
    }, 60_000);

    void this.maybeReviewLatestSummary();
  }

  onModuleDestroy() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  async maybeReviewLatestSummary() {
    if (
      this.tickInFlight ||
      !this.claudeReviewService.isEnabled() ||
      !this.claudeReviewService.isConfigured()
    ) {
      return;
    }

    this.tickInFlight = true;

    try {
      const summary = await this.radarDailySummaryService.getLatestSummary();

      if (!summary) {
        return;
      }

      const onlyTopCandidates = this.readBoolean(
        'CLAUDE_REVIEW_ONLY_FOR_TOP_CANDIDATES',
        true,
      );
      const schedulerState = await this.adaptiveSchedulerService.getState();
      const mode = schedulerState?.currentMode ?? 'NORMAL';
      const baseMaxPerRun = this.readInt('CLAUDE_REVIEW_MAX_PER_RUN', 10);
      const maxPerRun =
        mode === 'CLAUDE_CATCHUP'
          ? Math.min(baseMaxPerRun * 2, 20)
          : mode === 'CRITICAL_BACKPRESSURE'
            ? Math.max(2, Math.floor(baseMaxPerRun / 2))
            : baseMaxPerRun;
      const candidateIds = Array.from(
        new Set(
          onlyTopCandidates
            ? [
                ...summary.topGoodRepositoryIds,
                ...summary.topCloneRepositoryIds,
                ...summary.topRepositoryIds,
              ]
            : [
                ...summary.topRepositoryIds,
                ...summary.topGoodRepositoryIds,
                ...summary.topCloneRepositoryIds,
                ...summary.topIgnoredRepositoryIds,
              ],
        ),
      ).slice(0, maxPerRun);

      const result = candidateIds.length
        ? await this.claudeReviewService.reviewRepositoryIds(candidateIds, {
            topCandidate: true,
            source: 'scheduler',
            maxPerRun,
          })
        : { processed: 0, results: [] };
      const replayResult = await this.claudeReviewService.replayFallbackReviews({
        maxPerRun:
          mode === 'CRITICAL_BACKPRESSURE'
            ? 1
            : this.readInt('CLAUDE_REPLAY_MAX_PER_RUN', 4),
        maxConcurrency: 2,
      });

      if (
        result.results.some((item) => item.status === 'reviewed') ||
        replayResult.results.some((item) => item.status === 'reviewed')
      ) {
        await this.radarDailySummaryService.markSummaryForRecompute(summary.date);
      }
    } catch (error) {
      this.logger.warn(
        `Claude review scheduler tick failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    } finally {
      this.tickInFlight = false;
    }
  }

  private readBoolean(envName: string, fallback: boolean) {
    const raw = process.env[envName]?.trim().toLowerCase();
    if (!raw) {
      return fallback;
    }

    if (['1', 'true', 'yes', 'on'].includes(raw)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(raw)) {
      return false;
    }

    return fallback;
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }
}
