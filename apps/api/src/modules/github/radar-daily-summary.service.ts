import { Injectable, Logger } from '@nestjs/common';
import { DailyRadarSummary, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  IdeaSnapshotService,
} from '../analysis/idea-snapshot.service';
import {
  IdeaMainCategory,
  normalizeIdeaMainCategory,
} from '../analysis/idea-snapshot-taxonomy';
import {
  MoneyPriorityResult,
  MoneyPriorityService,
} from '../analysis/money-priority.service';
import {
  RepositoryDecisionService,
  RepositoryFinalDecision,
} from '../analysis/repository-decision.service';
import {
  buildRepositoryDecisionDisplaySummary,
  RepositoryDecisionDisplaySummary,
} from '../analysis/helpers/repository-final-decision.helper';
import {
  OneLinerStrength,
  resolveEffectiveOneLinerStrength,
} from '../analysis/helpers/one-liner-strength.helper';
import {
  computeEffectiveStrength,
  SelfTuningLoadLevel,
  SelfTuningService,
  TelegramSelectionMode,
} from '../analysis/self-tuning.service';

type DailyRadarSummaryMetadata = {
  repositoryIds: string[];
  backfillJobIds: string[];
  snapshotJobIds: string[];
  deepJobIds: string[];
  keywordGroups: Record<
    string,
    {
      repositoryIds: string[];
      fetchedRepositories: number;
      snapshotQueued: number;
      deepAnalyzed: number;
      promisingCandidates: number;
      goodIdeas: number;
      cloneCandidates: number;
      lastRunAt: string | null;
    }
  >;
  needsRecompute: boolean;
  lastActivityAt: string | null;
};

type InsightVerdict = 'GOOD' | 'OK' | 'BAD';
type InsightAction = 'BUILD' | 'CLONE' | 'IGNORE';

type ResolvedRepositoryDecision = {
  repositoryId: string;
  fullName: string;
  htmlUrl: string;
  stars: number;
  createdAtGithub: Date | null;
  ideaFitScore: number | null;
  oneLinerZh: string;
  verdict: InsightVerdict;
  action: InsightAction;
  category: {
    main: IdeaMainCategory;
    sub: string;
  };
  oneLinerStrength: OneLinerStrength | null;
  finalDecision: RepositoryFinalDecision;
  isPromising: boolean;
  hasInsight: boolean;
  hasManualOverride: boolean;
  hasClaudeReview: boolean;
  moneyPriority: MoneyPriorityResult;
};

type DailyRadarSummaryItem = {
  repositoryId: string;
  fullName: string;
  htmlUrl: string;
  stars: number;
  oneLinerZh: string;
  verdict: InsightVerdict;
  action: InsightAction;
  category: {
    main: IdeaMainCategory;
    sub: string;
  };
  moneyPriorityScore: number;
  moneyPriorityTier: string;
  moneyDecision: string;
  moneyDecisionLabelZh: string;
  moneyPriorityLabelZh: string;
  moneyPriorityReasonZh: string;
  recommendedMoveZh: string;
  targetUsersZh: string;
  monetizationSummaryZh: string;
  hasManualOverride: boolean;
  hasClaudeReview: boolean;
  decisionSummary: RepositoryDecisionDisplaySummary;
};

type DailyRadarKeywordGroupSummary = {
  group: string;
  fetchedRepositories: number;
  snapshotQueued: number;
  deepAnalyzed: number;
  promisingCandidates: number;
  goodIdeas: number;
  cloneCandidates: number;
  repositoryIds: string[];
  lastRunAt: string | null;
};

const MAX_TRACKED_REPOSITORY_IDS = 2_000;
const MAX_TRACKED_JOB_IDS = 500;
const CLAUDE_AUDIT_LATEST_CONFIG_KEY = 'claude.audit.latest';

@Injectable()
export class RadarDailySummaryService {
  private readonly logger = new Logger(RadarDailySummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ideaSnapshotService: IdeaSnapshotService,
    private readonly moneyPriorityService: MoneyPriorityService,
    private readonly repositoryDecisionService: RepositoryDecisionService,
    private readonly selfTuningService: SelfTuningService,
  ) {}

  async recordBackfillRun(args: {
    repositoryIds?: string[];
    fetchedRepositories?: number;
    jobId?: string | null;
  }) {
    const date = this.toDateKey(new Date());
    const summary = await this.ensureSummary(date);
    const metadata = this.normalizeMetadata(summary.metadata);
    const repositoryIds = this.mergeUniqueIds(
      metadata.repositoryIds,
      args.repositoryIds ?? [],
      MAX_TRACKED_REPOSITORY_IDS,
    );
    const backfillJobIds = this.mergeUniqueIds(
      metadata.backfillJobIds,
      args.jobId ? [args.jobId] : [],
      MAX_TRACKED_JOB_IDS,
    );

    await this.prisma.dailyRadarSummary.update({
      where: { date },
      data: {
        fetchedRepositories: {
          increment: Math.max(0, args.fetchedRepositories ?? 0),
        },
        metadata: this.toJsonValue({
          ...metadata,
          repositoryIds,
          backfillJobIds,
          needsRecompute: true,
          lastActivityAt: new Date().toISOString(),
        }),
      },
    });
  }

  async recordSnapshotCompletion(args: {
    repositoryId: string;
    jobId?: string | null;
  }) {
    const date = this.toDateKey(new Date());
    const summary = await this.ensureSummary(date);
    const metadata = this.normalizeMetadata(summary.metadata);

    await this.prisma.dailyRadarSummary.update({
      where: { date },
      data: {
        snapshotGenerated: { increment: 1 },
        metadata: this.toJsonValue({
          ...metadata,
          repositoryIds: this.mergeUniqueIds(
            metadata.repositoryIds,
            [args.repositoryId],
            MAX_TRACKED_REPOSITORY_IDS,
          ),
          snapshotJobIds: this.mergeUniqueIds(
            metadata.snapshotJobIds,
            args.jobId ? [args.jobId] : [],
            MAX_TRACKED_JOB_IDS,
          ),
          needsRecompute: true,
          lastActivityAt: new Date().toISOString(),
        }),
      },
    });
  }

  async recordDeepAnalysisCompletion(args: {
    repositoryId: string;
    jobId?: string | null;
  }) {
    const date = this.toDateKey(new Date());
    const summary = await this.ensureSummary(date);
    const metadata = this.normalizeMetadata(summary.metadata);

    await this.prisma.dailyRadarSummary.update({
      where: { date },
      data: {
        deepAnalyzed: { increment: 1 },
        metadata: this.toJsonValue({
          ...metadata,
          repositoryIds: this.mergeUniqueIds(
            metadata.repositoryIds,
            [args.repositoryId],
            MAX_TRACKED_REPOSITORY_IDS,
          ),
          deepJobIds: this.mergeUniqueIds(
            metadata.deepJobIds,
            args.jobId ? [args.jobId] : [],
            MAX_TRACKED_JOB_IDS,
          ),
          needsRecompute: true,
          lastActivityAt: new Date().toISOString(),
        }),
      },
    });
  }

  async recordKeywordSupplyRun(args: {
    group: string;
    repositoryIds?: string[];
    fetchedRepositories?: number;
    snapshotQueued?: number;
    deepAnalyzed?: number;
    promisingCandidates?: number;
    goodIdeas?: number;
    cloneCandidates?: number;
  }) {
    const date = this.toDateKey(new Date());
    const summary = await this.ensureSummary(date);
    const metadata = this.normalizeMetadata(summary.metadata);
    const currentGroup = metadata.keywordGroups[args.group] ?? {
      repositoryIds: [],
      fetchedRepositories: 0,
      snapshotQueued: 0,
      deepAnalyzed: 0,
      promisingCandidates: 0,
      goodIdeas: 0,
      cloneCandidates: 0,
      lastRunAt: null,
    };

    await this.prisma.dailyRadarSummary.update({
      where: { date },
      data: {
        fetchedRepositories: {
          increment: Math.max(0, args.fetchedRepositories ?? 0),
        },
        metadata: this.toJsonValue({
          ...metadata,
          repositoryIds: this.mergeUniqueIds(
            metadata.repositoryIds,
            args.repositoryIds ?? [],
            MAX_TRACKED_REPOSITORY_IDS,
          ),
          keywordGroups: {
            ...metadata.keywordGroups,
            [args.group]: {
              repositoryIds: this.mergeUniqueIds(
                currentGroup.repositoryIds,
                args.repositoryIds ?? [],
                MAX_TRACKED_REPOSITORY_IDS,
              ),
              fetchedRepositories:
                currentGroup.fetchedRepositories +
                Math.max(0, args.fetchedRepositories ?? 0),
              snapshotQueued:
                currentGroup.snapshotQueued +
                Math.max(0, args.snapshotQueued ?? 0),
              deepAnalyzed:
                currentGroup.deepAnalyzed +
                Math.max(0, args.deepAnalyzed ?? 0),
              promisingCandidates:
                currentGroup.promisingCandidates +
                Math.max(0, args.promisingCandidates ?? 0),
              goodIdeas:
                currentGroup.goodIdeas + Math.max(0, args.goodIdeas ?? 0),
              cloneCandidates:
                currentGroup.cloneCandidates +
                Math.max(0, args.cloneCandidates ?? 0),
              lastRunAt: new Date().toISOString(),
            },
          },
          needsRecompute: true,
          lastActivityAt: new Date().toISOString(),
        } satisfies DailyRadarSummaryMetadata),
      },
    });
  }

  async getRecentSummaries(days = 7) {
    const safeDays = Math.max(1, Math.min(days, 90));
    await this.syncRecentSummariesFromJobLogs(safeDays);

    const summaries = await this.prisma.dailyRadarSummary.findMany({
      where: {
        date: {
          gte: this.toDateKey(this.addDays(new Date(), -(safeDays - 1))),
        },
      },
      orderBy: {
        date: 'desc',
      },
      take: safeDays,
    });

    return Promise.all(
      summaries.map((summary: DailyRadarSummary) => this.hydrateSummary(summary)),
    );
  }

  async getLatestSummary() {
    await this.syncRecentSummariesFromJobLogs(14);

    const summary = await this.prisma.dailyRadarSummary.findFirst({
      orderBy: {
        date: 'desc',
      },
    });

    if (!summary) {
      return null;
    }

    return this.hydrateSummary(summary);
  }

  async getSummaryByDate(date: string) {
    const summary = await this.prisma.dailyRadarSummary.findUnique({
      where: {
        date,
      },
    });

    if (!summary) {
      return null;
    }

    return this.hydrateSummary(summary);
  }

  async markSummaryForRecompute(date: string) {
    await this.ensureSummary(date);

    await this.prisma.dailyRadarSummary.update({
      where: { date },
      data: {
        metadata: this.toJsonValue({
          ...this.normalizeMetadata(
            (
              await this.prisma.dailyRadarSummary.findUnique({
                where: { date },
                select: { metadata: true },
              })
            )?.metadata ?? null,
          ),
          needsRecompute: true,
          lastActivityAt: new Date().toISOString(),
        } satisfies DailyRadarSummaryMetadata),
      },
    });
  }

  async markTelegramSendSuccess(args: { date: string; messageId: string | null }) {
    await this.prisma.dailyRadarSummary.update({
      where: {
        date: args.date,
      },
      data: {
        telegramSentAt: new Date(),
        telegramMessageId: args.messageId,
        telegramSendStatus: 'SENT',
        telegramSendError: null,
      },
    });
  }

  async markTelegramSendFailure(args: {
    date: string;
    error: string;
    status?: 'FAILED' | 'SKIPPED';
  }) {
    await this.prisma.dailyRadarSummary.update({
      where: {
        date: args.date,
      },
      data: {
        telegramSendStatus: args.status ?? 'FAILED',
        telegramSendError: this.cleanText(args.error, 500),
      },
    });
  }

  private async syncRecentSummariesFromJobLogs(days: number) {
    const earliestDate = this.startOfDay(this.addDays(new Date(), -(days - 1)));
    const completedJobs = await this.prisma.jobLog.findMany({
      where: {
        jobStatus: JobStatus.SUCCESS,
        jobName: {
          in: [
            'github.backfill_created_repositories',
            'analysis.idea_snapshot',
            'analysis.run_single',
          ],
        },
        finishedAt: {
          gte: earliestDate,
        },
      },
      select: {
        id: true,
        jobName: true,
        payload: true,
        result: true,
        finishedAt: true,
      },
      orderBy: {
        finishedAt: 'asc',
      },
    });

    if (!completedJobs.length) {
      return;
    }

    const grouped = new Map<
      string,
      {
        fetchedRepositories: number;
        snapshotGenerated: number;
        deepAnalyzed: number;
        repositoryIds: Set<string>;
        backfillJobIds: Set<string>;
        snapshotJobIds: Set<string>;
        deepJobIds: Set<string>;
        lastActivityAt: string | null;
      }
    >();

    for (const job of completedJobs) {
      if (!job.finishedAt) {
        continue;
      }

      const date = this.toDateKey(job.finishedAt);
      const bucket =
        grouped.get(date) ??
        {
          fetchedRepositories: 0,
          snapshotGenerated: 0,
          deepAnalyzed: 0,
          repositoryIds: new Set<string>(),
          backfillJobIds: new Set<string>(),
          snapshotJobIds: new Set<string>(),
          deepJobIds: new Set<string>(),
          lastActivityAt: null,
        };
      const payload = this.readJsonRecord(job.payload);
      const result = this.readJsonRecord(job.result);

      bucket.lastActivityAt = job.finishedAt.toISOString();

      if (job.jobName === 'github.backfill_created_repositories') {
        bucket.fetchedRepositories += this.readNumericValue(result.fetchedLinks);
        this.readStringArray(result.topRepositoryIds).forEach((repositoryId) =>
          bucket.repositoryIds.add(repositoryId),
        );
        bucket.backfillJobIds.add(job.id);
      }

      if (job.jobName === 'analysis.idea_snapshot') {
        bucket.snapshotGenerated += 1;
        const repositoryId = this.readRepositoryIdFromPayload(payload);
        if (repositoryId) {
          bucket.repositoryIds.add(repositoryId);
        }
        bucket.snapshotJobIds.add(job.id);
      }

      if (job.jobName === 'analysis.run_single') {
        bucket.deepAnalyzed += 1;
        const repositoryId = this.readRepositoryIdFromPayload(payload);
        if (repositoryId) {
          bucket.repositoryIds.add(repositoryId);
        }
        bucket.deepJobIds.add(job.id);
      }

      grouped.set(date, bucket);
    }

    await Promise.all(
      Array.from(grouped.entries()).map(async ([date, bucket]) => {
        const existing = await this.prisma.dailyRadarSummary.findUnique({
          where: { date },
          select: {
            metadata: true,
          },
        });
        const existingMetadata = this.normalizeMetadata(existing?.metadata ?? null);
        const keywordFetchedRepositories = Object.values(
          existingMetadata.keywordGroups,
        ).reduce(
          (sum, group) => sum + this.readNumericValue(group.fetchedRepositories),
          0,
        );

        await this.prisma.dailyRadarSummary.upsert({
          where: { date },
          update: {
            fetchedRepositories:
              bucket.fetchedRepositories + keywordFetchedRepositories,
            snapshotGenerated: bucket.snapshotGenerated,
            deepAnalyzed: bucket.deepAnalyzed,
            metadata: this.toJsonValue({
              repositoryIds: this.mergeUniqueIds(
                existingMetadata.repositoryIds,
                Array.from(bucket.repositoryIds),
                MAX_TRACKED_REPOSITORY_IDS,
              ),
              backfillJobIds: this.mergeUniqueIds(
                existingMetadata.backfillJobIds,
                Array.from(bucket.backfillJobIds),
                MAX_TRACKED_JOB_IDS,
              ),
              snapshotJobIds: this.mergeUniqueIds(
                existingMetadata.snapshotJobIds,
                Array.from(bucket.snapshotJobIds),
                MAX_TRACKED_JOB_IDS,
              ),
              deepJobIds: this.mergeUniqueIds(
                existingMetadata.deepJobIds,
                Array.from(bucket.deepJobIds),
                MAX_TRACKED_JOB_IDS,
              ),
              keywordGroups: existingMetadata.keywordGroups,
              needsRecompute: true,
              lastActivityAt: bucket.lastActivityAt,
            } satisfies DailyRadarSummaryMetadata),
          },
          create: {
            date,
            fetchedRepositories:
              bucket.fetchedRepositories + keywordFetchedRepositories,
            snapshotGenerated: bucket.snapshotGenerated,
            deepAnalyzed: bucket.deepAnalyzed,
            metadata: this.toJsonValue({
              repositoryIds: this.mergeUniqueIds(
                existingMetadata.repositoryIds,
                Array.from(bucket.repositoryIds),
                MAX_TRACKED_REPOSITORY_IDS,
              ),
              backfillJobIds: this.mergeUniqueIds(
                existingMetadata.backfillJobIds,
                Array.from(bucket.backfillJobIds),
                MAX_TRACKED_JOB_IDS,
              ),
              snapshotJobIds: this.mergeUniqueIds(
                existingMetadata.snapshotJobIds,
                Array.from(bucket.snapshotJobIds),
                MAX_TRACKED_JOB_IDS,
              ),
              deepJobIds: this.mergeUniqueIds(
                existingMetadata.deepJobIds,
                Array.from(bucket.deepJobIds),
                MAX_TRACKED_JOB_IDS,
              ),
              keywordGroups: existingMetadata.keywordGroups,
              needsRecompute: true,
              lastActivityAt: bucket.lastActivityAt,
            } satisfies DailyRadarSummaryMetadata),
          },
        });
      }),
    );
  }

  private async ensureSummary(date: string) {
    const existing = await this.prisma.dailyRadarSummary.findUnique({
      where: { date },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.dailyRadarSummary.create({
      data: {
        date,
        metadata: this.toJsonValue(this.emptyMetadata()),
      },
    });
  }

  private async hydrateSummary(
    summary: DailyRadarSummary,
  ) {
    const metadata = this.normalizeMetadata(summary.metadata);

    if (this.shouldRefreshDerivedSummary(summary, metadata)) {
      return this.refreshDerivedSummary(summary.date, metadata);
    }

    return this.serializeSummary(summary);
  }

  private async refreshDerivedSummary(
    date: string,
    metadata: DailyRadarSummaryMetadata,
  ) {
    const repositoryIds = metadata.repositoryIds.slice(0, MAX_TRACKED_REPOSITORY_IDS);
    const repositories = repositoryIds.length
      ? await this.prisma.repository.findMany({
          where: {
            id: {
              in: repositoryIds,
            },
          },
          include: {
            analysis: true,
          },
        })
      : [];

    const tuningPolicy = await this.selfTuningService.getCurrentPolicy();
    const auditSnapshot = await this.repositoryDecisionService.getLatestAuditSnapshot();
    const decisions = repositories.map((repository) =>
      this.resolveRepositoryDecision(
        repository,
        auditSnapshot,
        tuningPolicy.systemLoadLevel,
      ),
    );
    const rankedDecisions = decisions
      .slice()
      .sort((left, right) => this.compareDecisions(left, right));
    const { topDecisions, strongCount, mediumCount, fallbackCount } =
      this.selectTopDecisionsByStrength(
        rankedDecisions,
        12,
        tuningPolicy.telegramSelectionMode,
      );
    const topItems = topDecisions.map((decision) => this.toSummaryItem(decision));
    this.logger.log(
      `daily_summary top_items strength strong_count=${strongCount} medium_count=${mediumCount} fallback_count=${fallbackCount} total=${topItems.length}`,
    );
    const topGoodRepositoryIds = rankedDecisions
      .filter((decision) => decision.verdict === 'GOOD' && decision.action === 'BUILD')
      .slice(0, 10)
      .map((decision) => decision.repositoryId);
    const topCloneRepositoryIds = rankedDecisions
      .filter((decision) => decision.verdict === 'OK' && decision.action === 'CLONE')
      .slice(0, 10)
      .map((decision) => decision.repositoryId);
    const topIgnoredRepositoryIds = rankedDecisions
      .filter((decision) => decision.verdict === 'BAD' && decision.action === 'IGNORE')
      .slice(0, 10)
      .map((decision) => decision.repositoryId);
    const categoryCounts = new Map<string, number>();

    decisions.forEach((decision) => {
      const key = `${decision.category.main}/${decision.category.sub}`;
      categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
    });

    const updated = await this.prisma.dailyRadarSummary.update({
      where: { date },
      data: {
        promisingCandidates: decisions.filter((decision) => decision.isPromising)
          .length,
        goodIdeas: decisions.filter((decision) => decision.verdict === 'GOOD')
          .length,
        cloneCandidates: decisions.filter(
          (decision) => decision.action === 'CLONE',
        ).length,
        ignoredIdeas: decisions.filter(
          (decision) => decision.action === 'IGNORE',
        ).length,
        topCategories: this.toJsonValue(
          Array.from(categoryCounts.entries())
            .map(([key, count]) => {
              const [main, sub] = key.split('/');
              return {
                main: normalizeIdeaMainCategory(main),
                sub: sub || 'other',
                count,
              };
            })
            .sort((left, right) => right.count - left.count)
            .slice(0, 8),
        ),
        topRepositoryIds: this.toJsonValue(
          topItems.map((item) => item.repositoryId),
        ),
        topGoodRepositoryIds: this.toJsonValue(topGoodRepositoryIds),
        topCloneRepositoryIds: this.toJsonValue(topCloneRepositoryIds),
        topIgnoredRepositoryIds: this.toJsonValue(topIgnoredRepositoryIds),
        topItems: this.toJsonValue(topItems),
        metadata: this.toJsonValue({
          ...metadata,
          needsRecompute: false,
          lastActivityAt: metadata.lastActivityAt ?? new Date().toISOString(),
        }),
      },
    });

    return this.serializeSummary(updated);
  }

  private resolveRepositoryDecision(
    repository: Prisma.RepositoryGetPayload<{
      include: {
        analysis: true;
      };
    }>,
    auditSnapshot: Awaited<
      ReturnType<RepositoryDecisionService['getLatestAuditSnapshot']>
    > | null = null,
    loadLevel: SelfTuningLoadLevel = 'NORMAL',
  ): ResolvedRepositoryDecision {
    const analysis = repository.analysis;
    const insight = this.readInsight(analysis?.insightJson);
    const rawInsight = this.readJsonRecord(analysis?.insightJson);
    const claudeReview =
      analysis?.claudeReviewStatus === 'SUCCESS'
        ? this.readClaudeReview(analysis?.claudeReviewJson)
        : null;
    const rawClaudeReview =
      analysis?.claudeReviewStatus === 'SUCCESS'
        ? this.readJsonRecord(analysis?.claudeReviewJson)
        : null;
    const snapshot = this.ideaSnapshotService.readIdeaSnapshot(
      analysis?.ideaSnapshotJson,
    );
    const rawSnapshot = this.readJsonRecord(analysis?.ideaSnapshotJson);
    const extractedIdea = this.readJsonRecord(analysis?.extractedIdeaJson);
    const derivedRepository = this.repositoryDecisionService.attachDerivedAssetsWithAudit(
      repository as unknown as Record<string, unknown>,
      auditSnapshot,
    ) as Record<string, unknown>;
    const finalDecision =
      derivedRepository.finalDecision &&
      typeof derivedRepository.finalDecision === 'object'
        ? (derivedRepository.finalDecision as RepositoryFinalDecision)
        : null;
    const verdict =
      finalDecision?.verdict ??
      claudeReview?.verdict ??
      insight?.verdict ??
      (snapshot?.isPromising ? 'OK' : 'BAD');
    const action =
      finalDecision?.action ??
      claudeReview?.action ??
      insight?.action ??
      (verdict === 'GOOD' ? 'BUILD' : verdict === 'OK' ? 'CLONE' : 'IGNORE');
    const category = finalDecision
      ? {
          main: finalDecision.categoryMain
            ? normalizeIdeaMainCategory(finalDecision.categoryMain)
            : insight?.category?.main ??
              snapshot?.category.main ??
              (repository.categoryL1
                ? normalizeIdeaMainCategory(repository.categoryL1)
                : 'other'),
          sub:
            finalDecision.categorySub ||
            insight?.category?.sub ||
            snapshot?.category.sub ||
            repository.categoryL2 ||
            'other',
        }
      : claudeReview?.category ??
        insight?.category ??
        (snapshot
          ? {
              main: snapshot.category.main,
              sub: snapshot.category.sub,
            }
          : {
              main: repository.categoryL1
                ? normalizeIdeaMainCategory(repository.categoryL1)
                : 'other',
              sub: repository.categoryL2 ?? 'other',
            });
    const oneLinerZh =
      finalDecision?.oneLinerZh ||
      claudeReview?.oneLinerZh ||
      insight?.oneLinerZh ||
      snapshot?.oneLinerZh ||
      repository.description ||
      repository.fullName;
    const { strength: effectiveOneLinerStrength } =
      resolveEffectiveOneLinerStrength({
        localStrength: this.readOneLinerStrength(rawInsight?.oneLinerStrength),
        claudeStrength: this.readOneLinerStrength(rawClaudeReview?.oneLinerStrength),
        updatedAt: repository.updatedAtGithub ?? repository.updatedAt,
        createdAt: repository.createdAtGithub ?? repository.createdAt,
      });
    const tunedOneLinerStrength = computeEffectiveStrength(
      effectiveOneLinerStrength,
      loadLevel,
    );
    const moneyPriority = this.moneyPriorityService.calculate({
      repository: {
        fullName: repository.fullName,
        description: repository.description,
        homepage: repository.homepage,
        language: repository.language,
        topics: repository.topics,
        stars: repository.stars,
        ideaFitScore:
          typeof repository.ideaFitScore === 'number'
            ? repository.ideaFitScore
            : null,
        finalScore:
          typeof repository.finalScore === 'number' ? repository.finalScore : null,
        toolLikeScore:
          typeof repository.toolLikeScore === 'number'
            ? repository.toolLikeScore
            : null,
        roughPass: repository.roughPass,
        categoryL1: repository.categoryL1,
        categoryL2: repository.categoryL2,
      },
      manualOverride: {
        verdict: analysis?.manualVerdict,
        action: analysis?.manualAction,
        note: analysis?.manualNote,
      },
      claudeReview: rawClaudeReview,
      insight: rawInsight,
      snapshot: rawSnapshot,
      extractedIdea,
    });
    const fallbackMoneyDecision = {
      labelZh: '低优先',
      score: 0,
      recommendedMoveZh: '现在先跳过',
      targetUsersZh: '用户还不够清楚',
      monetizationSummaryZh: '收费路径还不够清楚',
      reasonZh: repository.description ?? repository.fullName,
    };
    const resolvedFinalDecision =
      finalDecision ?? {
        repoId: repository.id,
        oneLinerZh,
        oneLinerStrength: 'WEAK' as const,
        verdict,
        action,
        category: category.sub || category.main,
        categoryLabelZh: category.sub || category.main,
        categoryMain: category.main,
        categorySub: category.sub,
        projectType: null,
        moneyPriority: 'P3' as const,
        moneyPriorityLabelZh: '低优先',
        reasonZh: repository.description ?? repository.fullName,
        source: 'fallback' as const,
        sourceLabelZh: '兜底判断',
        hasConflict: false,
        needsRecheck: false,
        hasTrainingHints: false,
        hasClaudeReview: Boolean(claudeReview),
        hasManualOverride: Boolean(analysis?.manualVerdict || analysis?.manualAction),
        comparison: {
          localVerdict: insight?.verdict ?? null,
          localAction: insight?.action ?? null,
          localOneLinerZh: insight?.oneLinerZh ?? snapshot?.oneLinerZh ?? null,
          claudeVerdict: claudeReview?.verdict ?? null,
          claudeAction: claudeReview?.action ?? null,
          claudeOneLinerZh: claudeReview?.oneLinerZh ?? null,
          conflictReasons: [],
        },
        moneyDecision: fallbackMoneyDecision,
        decisionSummary: buildRepositoryDecisionDisplaySummary({
          oneLinerZh,
          verdict,
          action,
          categoryLabelZh: category.sub || category.main || '待分类',
          moneyPriority: 'P3',
          reasonZh: repository.description ?? repository.fullName,
          sourceLabelZh: '兜底判断',
          moneyDecision: fallbackMoneyDecision,
        }),
      };

    return {
      repositoryId: repository.id,
      fullName: repository.fullName,
      htmlUrl: repository.htmlUrl,
      stars: repository.stars,
      createdAtGithub: repository.createdAtGithub ?? null,
      ideaFitScore:
        typeof repository.ideaFitScore === 'number'
          ? repository.ideaFitScore
          : null,
      oneLinerZh,
      verdict,
      action,
      category,
      oneLinerStrength:
        tunedOneLinerStrength ??
        this.readOneLinerStrength(finalDecision?.oneLinerStrength),
      finalDecision: resolvedFinalDecision,
      isPromising:
        snapshot?.isPromising === true ||
        verdict === 'GOOD' ||
        action !== 'IGNORE',
      hasInsight: Boolean(insight || claudeReview),
      hasManualOverride: Boolean(
        finalDecision?.hasManualOverride ||
          analysis?.manualVerdict ||
          analysis?.manualAction,
      ),
      hasClaudeReview: Boolean(claudeReview),
      moneyPriority,
    };
  }

  private selectTopDecisionsByStrength(
    rankedDecisions: ResolvedRepositoryDecision[],
    limit: number,
    selectionMode: TelegramSelectionMode = 'MIXED',
  ) {
    const strongDecisions = rankedDecisions.filter(
      (decision) => decision.oneLinerStrength === 'STRONG',
    );
    const mediumDecisions = rankedDecisions.filter(
      (decision) => decision.oneLinerStrength === 'MEDIUM',
    );
    const fallbackDecisions = rankedDecisions.filter((decision) => {
      const strength = decision.oneLinerStrength;
      return strength !== 'STRONG' && strength !== 'MEDIUM';
    });
    const strongSelection = strongDecisions.slice(0, limit);
    const mediumLimit =
      selectionMode === 'STRONG_ONLY'
        ? 0
        : selectionMode === 'STRONG_PREFERRED'
          ? Math.min(2, Math.max(0, limit - strongSelection.length))
          : Math.max(0, limit - strongSelection.length);
    const mediumSelection = mediumDecisions.slice(0, mediumLimit);
    const fallbackSelection =
      selectionMode === 'MIXED'
        ? fallbackDecisions.slice(
            0,
            Math.min(
              2,
              Math.max(0, limit - strongSelection.length - mediumSelection.length),
            ),
          )
        : [];
    const topDecisions = [
      ...strongSelection,
      ...mediumSelection,
      ...fallbackSelection,
    ].slice(0, limit);

    return {
      topDecisions,
      strongCount: strongSelection.length,
      mediumCount: mediumSelection.length,
      fallbackCount: fallbackSelection.length,
    };
  }

  private readInsight(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const current = value as Record<string, unknown>;
    const category =
      current.category && typeof current.category === 'object'
        ? (current.category as Record<string, unknown>)
        : {};

    return {
      oneLinerZh: this.cleanText(current.oneLinerZh, 160),
      verdict: this.normalizeVerdict(current.verdict),
      action: this.normalizeAction(current.action),
      category: {
        main: normalizeIdeaMainCategory(category.main),
        sub: String(category.sub ?? 'other').trim() || 'other',
      },
    };
  }

  private readClaudeReview(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const current = value as Record<string, unknown>;

    return {
      oneLinerZh: this.cleanText(current.oneLinerZh, 160),
      verdict: this.normalizeVerdict(current.verdict),
      action: this.normalizeAction(current.action),
      category: null as
        | {
            main: IdeaMainCategory;
            sub: string;
          }
        | null,
    };
  }

  private readOneLinerStrength(value: unknown): OneLinerStrength | null {
    return value === 'STRONG' || value === 'MEDIUM' || value === 'WEAK'
      ? value
      : null;
  }

  private compareDecisions(
    left: ResolvedRepositoryDecision,
    right: ResolvedRepositoryDecision,
  ) {
    const moneyDelta = this.moneyPriorityService.compare(
      left.moneyPriority,
      right.moneyPriority,
      {
        leftIdeaFitScore: left.ideaFitScore,
        rightIdeaFitScore: right.ideaFitScore,
        leftStars: left.stars,
        rightStars: right.stars,
        leftTimestamp: this.toTimestamp(left.createdAtGithub),
        rightTimestamp: this.toTimestamp(right.createdAtGithub),
      },
    );

    if (moneyDelta !== 0) {
      return moneyDelta;
    }

    const createdAtDiff =
      this.toTimestamp(right.createdAtGithub) -
      this.toTimestamp(left.createdAtGithub);

    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    const ideaFitDiff = (right.ideaFitScore ?? -1) - (left.ideaFitScore ?? -1);

    if (ideaFitDiff !== 0) {
      return ideaFitDiff;
    }

    return right.stars - left.stars;
  }

  private verdictWeight(value: InsightVerdict) {
    switch (value) {
      case 'GOOD':
        return 3;
      case 'OK':
        return 2;
      case 'BAD':
      default:
        return 1;
    }
  }

  private actionWeight(value: InsightAction) {
    switch (value) {
      case 'BUILD':
        return 3;
      case 'CLONE':
        return 2;
      case 'IGNORE':
      default:
        return 1;
    }
  }

  private shouldRefreshDerivedSummary(
    summary: DailyRadarSummary,
    metadata: DailyRadarSummaryMetadata,
  ) {
    const storedTopItems = this.normalizeStoredSummaryItems(summary.topItems);

    return (
      metadata.needsRecompute ||
      summary.topGoodRepositoryIds == null ||
      summary.topCloneRepositoryIds == null ||
      summary.topIgnoredRepositoryIds == null ||
      storedTopItems.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          !('moneyPriorityScore' in item) ||
          !('moneyPriorityTier' in item) ||
          !('moneyDecision' in item) ||
          !('decisionSummary' in item),
      )
    );
  }

  private toSummaryItem(decision: ResolvedRepositoryDecision): DailyRadarSummaryItem {
    const displaySummary = decision.finalDecision.decisionSummary;
    return {
      repositoryId: decision.repositoryId,
      fullName: decision.fullName,
      htmlUrl: decision.htmlUrl,
      stars: decision.stars,
      oneLinerZh: displaySummary.headlineZh,
      verdict: decision.finalDecision.verdict,
      action: decision.finalDecision.action,
      category: decision.category,
      moneyPriorityScore: decision.moneyPriority.score,
      moneyPriorityTier: decision.moneyPriority.tier,
      moneyDecision: decision.moneyPriority.moneyDecision,
      moneyDecisionLabelZh: displaySummary.judgementLabelZh,
      moneyPriorityLabelZh: displaySummary.moneyPriorityLabelZh,
      moneyPriorityReasonZh: displaySummary.reasonZh,
      recommendedMoveZh: displaySummary.recommendedMoveZh,
      targetUsersZh: displaySummary.targetUsersZh,
      monetizationSummaryZh: displaySummary.monetizationSummaryZh,
      hasManualOverride: decision.finalDecision.hasManualOverride,
      hasClaudeReview: decision.finalDecision.hasClaudeReview,
      decisionSummary: displaySummary,
    };
  }

  private async hydrateSummaryItems(repositoryIds: string[]) {
    const normalizedIds = this.normalizeStringArray(repositoryIds).slice(0, 10);

    if (!normalizedIds.length) {
      return [] as DailyRadarSummaryItem[];
    }

    const repositories = await this.prisma.repository.findMany({
      where: {
        id: {
          in: normalizedIds,
        },
      },
      include: {
        analysis: true,
      },
    });

    const auditSnapshot = await this.repositoryDecisionService.getLatestAuditSnapshot();
    const itemsById = new Map(
      repositories.map((repository) => {
        const decision = this.resolveRepositoryDecision(repository, auditSnapshot);
        return [decision.repositoryId, this.toSummaryItem(decision)] as const;
      }),
    );

    return normalizedIds
      .map((repositoryId) => itemsById.get(repositoryId))
      .filter((item): item is DailyRadarSummaryItem => Boolean(item));
  }

  private normalizeVerdict(value: unknown): InsightVerdict | null {
    const normalized = String(value ?? '').trim().toUpperCase();

    if (normalized === 'GOOD' || normalized === 'OK' || normalized === 'BAD') {
      return normalized;
    }

    return null;
  }

  private normalizeAction(value: unknown): InsightAction | null {
    const normalized = String(value ?? '').trim().toUpperCase();

    if (
      normalized === 'BUILD' ||
      normalized === 'CLONE' ||
      normalized === 'IGNORE'
    ) {
      return normalized;
    }

    return null;
  }

  private normalizeMoneyDecision(
    value: unknown,
    fallbackTier?: unknown,
  ): 'MUST_BUILD' | 'HIGH_VALUE' | 'CLONEABLE' | 'LOW_VALUE' | 'IGNORE' {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (
      normalized === 'MUST_BUILD' ||
      normalized === 'HIGH_VALUE' ||
      normalized === 'CLONEABLE' ||
      normalized === 'LOW_VALUE' ||
      normalized === 'IGNORE'
    ) {
      return normalized;
    }

    switch (String(fallbackTier ?? '').trim().toUpperCase()) {
      case 'MUST_LOOK':
        return 'MUST_BUILD';
      case 'WORTH_BUILDING':
        return 'HIGH_VALUE';
      case 'WORTH_CLONING':
        return 'CLONEABLE';
      case 'LOW_PRIORITY':
        return 'LOW_VALUE';
      case 'IGNORE':
      default:
        return 'IGNORE';
    }
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();

    if (!normalized) {
      return '';
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return normalized.slice(0, maxLength);
  }

  private normalizeMetadata(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.emptyMetadata();
    }

    const current = value as Record<string, unknown>;

    return {
      repositoryIds: this.normalizeStringArray(current.repositoryIds),
      backfillJobIds: this.normalizeStringArray(current.backfillJobIds),
      snapshotJobIds: this.normalizeStringArray(current.snapshotJobIds),
      deepJobIds: this.normalizeStringArray(current.deepJobIds),
      keywordGroups: this.normalizeKeywordGroups(current.keywordGroups),
      needsRecompute: current.needsRecompute !== false,
      lastActivityAt:
        typeof current.lastActivityAt === 'string' && current.lastActivityAt.trim()
          ? current.lastActivityAt
          : null,
    } satisfies DailyRadarSummaryMetadata;
  }

  private normalizeKeywordGroups(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {} as DailyRadarSummaryMetadata['keywordGroups'];
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([group, payload]) => {
        const current =
          payload && typeof payload === 'object' && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {};

        return [
          group,
          {
            repositoryIds: this.normalizeStringArray(current.repositoryIds),
            fetchedRepositories: this.readNumericValue(current.fetchedRepositories),
            snapshotQueued: this.readNumericValue(current.snapshotQueued),
            deepAnalyzed: this.readNumericValue(current.deepAnalyzed),
            promisingCandidates: this.readNumericValue(current.promisingCandidates),
            goodIdeas: this.readNumericValue(current.goodIdeas),
            cloneCandidates: this.readNumericValue(current.cloneCandidates),
            lastRunAt:
              typeof current.lastRunAt === 'string' && current.lastRunAt.trim()
                ? current.lastRunAt
                : null,
          },
        ] as const;
      }),
    );
  }

  private emptyMetadata(): DailyRadarSummaryMetadata {
    return {
      repositoryIds: [],
      backfillJobIds: [],
      snapshotJobIds: [],
      deepJobIds: [],
      keywordGroups: {},
      needsRecompute: false,
      lastActivityAt: null,
    };
  }

  private async hydrateKeywordGroupSummaries(
    keywordGroups: DailyRadarSummaryMetadata['keywordGroups'],
  ) {
    const groups = Object.entries(keywordGroups);

    if (!groups.length) {
      return [] as DailyRadarKeywordGroupSummary[];
    }

    const allRepositoryIds = Array.from(
      new Set(groups.flatMap(([, value]) => value.repositoryIds)),
    ).slice(0, MAX_TRACKED_REPOSITORY_IDS);
    const repositories = allRepositoryIds.length
      ? await this.prisma.repository.findMany({
          where: {
            id: {
              in: allRepositoryIds,
            },
          },
          include: {
            analysis: true,
          },
        })
      : [];
    const decisionsById = new Map(
      repositories.map((repository) => [
        repository.id,
        this.resolveRepositoryDecision(repository),
      ]),
    );

    return groups
      .map(([group, value]) => {
        const decisions = value.repositoryIds
          .map((repositoryId) => decisionsById.get(repositoryId))
          .filter((decision): decision is ResolvedRepositoryDecision =>
            Boolean(decision),
          );

        return {
          group,
          fetchedRepositories: value.fetchedRepositories,
          snapshotQueued: value.snapshotQueued,
          deepAnalyzed: value.deepAnalyzed,
          promisingCandidates:
            value.promisingCandidates ||
            decisions.filter((decision) => decision.isPromising).length,
          goodIdeas:
            decisions.filter(
              (decision) =>
                decision.verdict === 'GOOD' && decision.action === 'BUILD',
            ).length || value.goodIdeas,
          cloneCandidates:
            decisions.filter((decision) => decision.action === 'CLONE').length ||
            value.cloneCandidates,
          repositoryIds: value.repositoryIds.slice(0, 10),
          lastRunAt: value.lastRunAt,
        } satisfies DailyRadarKeywordGroupSummary;
      })
      .sort((left, right) => {
        const leftScore =
          left.goodIdeas * 20 +
          left.cloneCandidates * 10 +
          left.promisingCandidates * 4 +
          left.deepAnalyzed * 2 +
          left.fetchedRepositories;
        const rightScore =
          right.goodIdeas * 20 +
          right.cloneCandidates * 10 +
          right.promisingCandidates * 4 +
          right.deepAnalyzed * 2 +
          right.fetchedRepositories;

        return rightScore - leftScore;
      });
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return Array.from(
      new Set(
        value
          .map((item) => String(item ?? '').trim())
          .filter((item) => Boolean(item)),
      ),
    );
  }

  private mergeUniqueIds(
    existing: string[],
    incoming: string[],
    maxSize: number,
  ) {
    return Array.from(new Set([...incoming, ...existing])).slice(0, maxSize);
  }

  private async serializeSummary(
    summary: DailyRadarSummary,
  ) {
    const metadata = this.normalizeMetadata(summary.metadata);
    const topRepositoryIds = this.readStringArray(summary.topRepositoryIds);
    const topGoodRepositoryIds = this.readStringArray(summary.topGoodRepositoryIds);
    const topCloneRepositoryIds = this.readStringArray(summary.topCloneRepositoryIds);
    const topIgnoredRepositoryIds = this.readStringArray(
      summary.topIgnoredRepositoryIds,
    );
    const storedTopItems = this.normalizeStoredSummaryItems(summary.topItems);
    const keywordGroupStats = await this.hydrateKeywordGroupSummaries(
      metadata.keywordGroups,
    );
    const [topGoodItems, topCloneItems, topIgnoredItems, fallbackTopItems] =
      await Promise.all([
        this.hydrateSummaryItems(topGoodRepositoryIds),
        this.hydrateSummaryItems(topCloneRepositoryIds),
        this.hydrateSummaryItems(topIgnoredRepositoryIds),
        storedTopItems.length
          ? Promise.resolve([] as DailyRadarSummaryItem[])
          : this.hydrateSummaryItems(topRepositoryIds),
      ]);
    const effectiveTopItems = storedTopItems.length ? storedTopItems : fallbackTopItems;
    const topMustBuildItems = effectiveTopItems
      .filter((item) => this.normalizeMoneyDecision(item.moneyDecision, item.moneyPriorityTier) === 'MUST_BUILD')
      .slice(0, 3);
    const topHighValueItems = effectiveTopItems
      .filter((item) => this.normalizeMoneyDecision(item.moneyDecision, item.moneyPriorityTier) === 'HIGH_VALUE')
      .slice(0, 5);
    const topCloneableItems = effectiveTopItems
      .filter((item) => this.normalizeMoneyDecision(item.moneyDecision, item.moneyPriorityTier) === 'CLONEABLE')
      .slice(0, 5);
    const latestClaudeAudit = await this.readLatestClaudeAuditBrief();

    return {
      id: summary.id,
      date: summary.date,
      fetchedRepositories: summary.fetchedRepositories,
      snapshotGenerated: summary.snapshotGenerated,
      deepAnalyzed: summary.deepAnalyzed,
      promisingCandidates: summary.promisingCandidates,
      goodIdeas: summary.goodIdeas,
      cloneCandidates: summary.cloneCandidates,
      ignoredIdeas: summary.ignoredIdeas,
      topCategories: Array.isArray(summary.topCategories)
        ? summary.topCategories
        : [],
      topRepositoryIds,
      topGoodRepositoryIds,
      topCloneRepositoryIds,
      topIgnoredRepositoryIds,
      topItems: effectiveTopItems,
      topMustBuildItems,
      topHighValueItems,
      topCloneableItems,
      topGoodItems,
      topCloneItems,
      topIgnoredItems,
      keywordGroupStats,
      topKeywordGroups: keywordGroupStats.slice(0, 3),
      latestClaudeAudit,
      telegramSentAt: summary.telegramSentAt,
      telegramMessageId: summary.telegramMessageId,
      telegramSendStatus: summary.telegramSendStatus,
      telegramSendError: summary.telegramSendError,
      updatedAt: summary.updatedAt,
      createdAt: summary.createdAt,
    };
  }

  private async readLatestClaudeAuditBrief() {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: CLAUDE_AUDIT_LATEST_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object' || Array.isArray(row.configValue)) {
      return null;
    }

    const value = row.configValue as Record<string, unknown>;
    const severity = this.cleanText(value.severity, 20);
    const summary = this.cleanText(value.summary, 220);
    const headline = this.cleanText(value.highPriorityHeadline, 180);
    const overallBias = this.readJsonRecord(
      value.overallBias as Prisma.JsonValue | undefined,
    );

    if (!severity && !summary && !headline) {
      return null;
    }

    return {
      auditedAt: this.cleanText(value.auditedAt, 40) || null,
      severity: severity || 'LOW',
      summary: summary || null,
      headline: headline || null,
      overallBias: this.cleanText(overallBias?.direction, 40) || null,
    };
  }

  private normalizeStoredSummaryItems(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as DailyRadarSummaryItem[];
    }

    return value
      .map((item) => this.normalizeStoredSummaryItem(item))
      .filter((item): item is DailyRadarSummaryItem => Boolean(item));
  }

  private normalizeStoredSummaryItem(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const item = value as Record<string, unknown>;
    const category =
      item.category && typeof item.category === 'object' && !Array.isArray(item.category)
        ? (item.category as Record<string, unknown>)
        : {};

    const repositoryId = this.cleanText(item.repositoryId, 80);
    const fullName = this.cleanText(item.fullName, 200);
    if (!repositoryId || !fullName) {
      return null;
    }

    return {
      repositoryId,
      fullName,
      htmlUrl: this.cleanText(item.htmlUrl, 300),
      stars: this.readNumericValue(item.stars),
      oneLinerZh: this.cleanText(item.oneLinerZh, 220),
      verdict: this.normalizeVerdict(item.verdict) ?? 'BAD',
      action: this.normalizeAction(item.action) ?? 'IGNORE',
      category: {
        main: normalizeIdeaMainCategory(category.main),
        sub: this.cleanText(category.sub, 80) || 'other',
      },
      moneyPriorityScore: this.readNumericValue(item.moneyPriorityScore),
      moneyPriorityTier: this.cleanText(item.moneyPriorityTier, 40),
      moneyDecision: this.cleanText(item.moneyDecision, 40),
      moneyDecisionLabelZh: this.cleanText(item.moneyDecisionLabelZh, 40),
      moneyPriorityLabelZh: this.cleanText(item.moneyPriorityLabelZh, 40),
      moneyPriorityReasonZh: this.cleanText(item.moneyPriorityReasonZh, 260),
      recommendedMoveZh: this.cleanText(item.recommendedMoveZh, 120),
      targetUsersZh: this.cleanText(item.targetUsersZh, 120),
      monetizationSummaryZh: this.cleanText(item.monetizationSummaryZh, 200),
      hasManualOverride: Boolean(item.hasManualOverride),
      hasClaudeReview: Boolean(item.hasClaudeReview),
      decisionSummary: this.normalizeDecisionSummary(item.decisionSummary, {
        oneLinerZh: this.cleanText(item.oneLinerZh, 220),
        verdict: this.normalizeVerdict(item.verdict) ?? 'BAD',
        action: this.normalizeAction(item.action) ?? 'IGNORE',
        categoryLabelZh:
          this.cleanText((item as Record<string, unknown>).categoryLabelZh, 100) ||
          this.cleanText(category.sub, 80) ||
          '待分类',
        moneyPriority: this.normalizeFounderPriority(item.moneyPriorityTier),
        reasonZh: this.cleanText(item.moneyPriorityReasonZh, 260),
        sourceLabelZh:
          this.cleanText((item as Record<string, unknown>).sourceLabelZh, 40) ||
          '兜底判断',
        moneyDecision: {
          recommendedMoveZh: this.cleanText(item.recommendedMoveZh, 120),
          targetUsersZh: this.cleanText(item.targetUsersZh, 120),
          monetizationSummaryZh: this.cleanText(item.monetizationSummaryZh, 200),
        },
      }),
    } satisfies DailyRadarSummaryItem;
  }

  private normalizeDecisionSummary(
    value: unknown,
    fallback: {
      oneLinerZh: string;
      verdict: InsightVerdict;
      action: InsightAction;
      categoryLabelZh: string;
      moneyPriority: 'P0' | 'P1' | 'P2' | 'P3';
      reasonZh: string;
      sourceLabelZh: string;
      moneyDecision: {
        recommendedMoveZh: string;
        targetUsersZh: string;
        monetizationSummaryZh: string;
      };
    },
  ) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const current = value as Record<string, unknown>;
      const headlineZh = this.cleanText(current.headlineZh, 220);
      const judgementLabelZh = this.cleanText(current.judgementLabelZh, 40);
      if (headlineZh && judgementLabelZh) {
        return {
          headlineZh,
          judgementLabelZh,
          verdictLabelZh: this.cleanText(current.verdictLabelZh, 40),
          actionLabelZh: this.cleanText(current.actionLabelZh, 40),
          finalDecisionLabelZh: this.cleanText(current.finalDecisionLabelZh, 80),
          moneyPriorityLabelZh: this.cleanText(current.moneyPriorityLabelZh, 60),
          categoryLabelZh: this.cleanText(current.categoryLabelZh, 100),
          recommendedMoveZh: this.cleanText(current.recommendedMoveZh, 120),
          worthDoingLabelZh: this.cleanText(current.worthDoingLabelZh, 80),
          reasonZh: this.cleanText(current.reasonZh, 320),
          targetUsersZh: this.cleanText(current.targetUsersZh, 120),
          monetizationSummaryZh: this.cleanText(current.monetizationSummaryZh, 200),
          sourceLabelZh: this.cleanText(current.sourceLabelZh, 40),
        } satisfies RepositoryDecisionDisplaySummary;
      }
    }

    return buildRepositoryDecisionDisplaySummary(fallback);
  }

  private normalizeFounderPriority(value: unknown): 'P0' | 'P1' | 'P2' | 'P3' {
    const normalized = this.cleanText(value, 20).toUpperCase();
    if (normalized === 'P0' || normalized === 'P1' || normalized === 'P2') {
      return normalized;
    }

    return 'P3';
  }

  private toDateKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private addDays(value: Date, days: number) {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return next;
  }

  private startOfDay(value: Date) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      0,
      0,
      0,
      0,
    );
  }

  private readJsonRecord(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {} as Record<string, unknown>;
    }

    return value as Record<string, unknown>;
  }

  private readRepositoryIdFromPayload(payload: Record<string, unknown>) {
    const normalized = String(payload.repositoryId ?? '').trim();
    return normalized || null;
  }

  private readStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .map((item) => String(item ?? '').trim())
      .filter((item) => Boolean(item));
  }

  private readNumericValue(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return 0;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return (value ?? null) as Prisma.InputJsonValue;
  }

  private toTimestamp(value: Date | null) {
    return value instanceof Date ? value.getTime() : 0;
  }
}
