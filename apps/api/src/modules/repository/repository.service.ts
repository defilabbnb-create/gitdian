import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RepositoryDecision,
  RepositoryOpportunityLevel,
} from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  MoneyPriorityInput,
  MoneyPriorityResult,
  MoneyPriorityService,
} from '../analysis/money-priority.service';
import { RepositoryCachedRankingService } from '../analysis/repository-cached-ranking.service';
import { RepositoryDecisionService } from '../analysis/repository-decision.service';
import {
  ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY,
  FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY,
} from '../analysis/helpers/frozen-analysis-pool.types';
import {
  evaluateAnalysisPoolIntakeGate,
  readAnalysisPoolFreezeState,
  readFrozenAnalysisPoolBatchSnapshot,
} from '../analysis/helpers/frozen-analysis-pool.helper';
import { resolveEffectiveOneLinerStrength } from '../analysis/helpers/one-liner-strength.helper';
import { QueueService } from '../queue/queue.service';
import {
  QueryRepositoriesDto,
  RepositoryDeepAnalysisState,
  RepositoryRecommendedAction,
  RepositorySortBy,
  SortOrder,
} from './dto/query-repositories.dto';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { UpdateRepositoryDto } from './dto/update-repository.dto';
import { UpdateRepositoryScoresDto } from './dto/update-repository-scores.dto';
import { UpdateRepositoryFavoriteDto } from './dto/update-repository-favorite.dto';
import { UpdateManualInsightDto } from './dto/update-manual-insight.dto';

type RepositoryDetail = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
    favorite: true;
    snapshots: true;
  };
}>;

type RepositoryListItem = Prisma.RepositoryGetPayload<{
  include: {
    analysis: true;
    favorite: true;
  };
}>;

type RepositoryInsightOrderCandidate = Prisma.RepositoryGetPayload<{
  select: {
    id: true;
    createdAtGithub: true;
    ideaFitScore: true;
    updatedAt: true;
    analysis: {
      select: {
        insightJson: true;
        claudeReviewJson: true;
        claudeReviewStatus: true;
        manualVerdict: true;
        manualAction: true;
      };
    };
  };
}>;

type RepositoryMoneyPriorityOrderCandidate = Prisma.RepositoryGetPayload<{
  select: {
    id: true;
    fullName: true;
    description: true;
    homepage: true;
    language: true;
    topics: true;
    stars: true;
    ideaFitScore: true;
    finalScore: true;
    toolLikeScore: true;
    roughPass: true;
    categoryL1: true;
    categoryL2: true;
    createdAtGithub: true;
    createdAt: true;
    updatedAt: true;
    analysis: {
      select: {
        insightJson: true;
        ideaSnapshotJson: true;
        extractedIdeaJson: true;
        claudeReviewJson: true;
        claudeReviewStatus: true;
        manualVerdict: true;
        manualAction: true;
        manualNote: true;
      };
    };
  };
}>;

type RepositorySummary = {
  totalRepositories: number;
  favoritedRepositories: number;
  highOpportunityRepositories: number;
  completenessAnalyzedRepositories: number;
  ideaFitAnalyzedRepositories: number;
  extractedIdeaRepositories: number;
  pendingAnalysisRepositories: number;
  needsIdeaExtractionRepositories: number;
  highOpportunityUnfavoritedRepositories: number;
};

@Injectable()
export class RepositoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moneyPriorityService: MoneyPriorityService,
    private readonly repositoryCachedRankingService: RepositoryCachedRankingService,
    private readonly repositoryDecisionService: RepositoryDecisionService,
    private readonly queueService: QueueService,
  ) {}

  private maybeScheduleHomepageClaudeReview(
    items: Array<{ id: string }>,
    context: {
      page: number;
      sortBy: RepositorySortBy;
      order: SortOrder;
    },
  ) {
    void items;
    void context;
    // Homepage list reads stay read-only. Claude runtime was retired in favor of the
    // primary API analysis pipeline, so list pages no longer enqueue background review.
  }

  private toOptionalBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }

      if (normalized === 'false') {
        return false;
      }
    }

    return undefined;
  }

  private buildDeepAnalysisCompletedCondition(): Prisma.RepositoryWhereInput {
    return {
      analysis: {
        is: {
          completenessJson: {
            not: Prisma.DbNull,
          },
          ideaFitJson: {
            not: Prisma.DbNull,
          },
          extractedIdeaJson: {
            not: Prisma.DbNull,
          },
          insightJson: {
            not: Prisma.DbNull,
          },
        },
      },
    };
  }

  async create(createRepositoryDto: CreateRepositoryDto) {
    await this.assertAnalysisPoolRepositoryCreateAllowed();
    await this.ensureRepositoryDoesNotExist(createRepositoryDto);

    try {
      const repository = await this.prisma.repository.create({
        data: {
          ...this.toRepositoryCreateInput(createRepositoryDto),
          ...(createRepositoryDto.content
            ? {
                content: {
                  create: this.toRepositoryContentInput(createRepositoryDto.content),
                },
              }
            : {}),
        },
        include: {
          content: true,
        },
      });

      await this.repositoryCachedRankingService.refreshRepositoryRanking(repository.id);

      return this.serializeWithDerivedAssets(repository);
    } catch (error) {
      this.handleKnownPrismaError(error);
      throw error;
    }
  }

  async update(id: string, updateRepositoryDto: UpdateRepositoryDto) {
    await this.ensureRepositoryExists(id);

    try {
      const repository = await this.prisma.repository.update({
        where: { id },
        data: this.toRepositoryUpdateInput(updateRepositoryDto),
      });

      await this.repositoryCachedRankingService.refreshRepositoryRanking(repository.id);

      return this.serializeWithDerivedAssets(repository);
    } catch (error) {
      this.handleKnownPrismaError(error);
      throw error;
    }
  }

  async findOne(id: string) {
    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        content: true,
        analysis: true,
        favorite: true,
        snapshots: {
          orderBy: {
            snapshotAt: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!repository) {
      throw new NotFoundException(`Repository with id "${id}" was not found.`);
    }

    return this.serializeWithDerivedAssets<RepositoryDetail>(repository);
  }

  async findAll(query: QueryRepositoriesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = await this.buildRepositoryWhere(query);

    if (
      query.sortBy === RepositorySortBy.MONEY_PRIORITY &&
      this.canUseCachedMoneyPriorityQuery(query)
    ) {
      return this.findAllByCachedMoneyPriority({
        where,
        page,
        pageSize,
        skip,
        query,
      });
    }

    if (this.shouldUseDerivedDecisionQuery(query)) {
      return this.findAllByDerivedDecision({
        where,
        page,
        pageSize,
        skip,
        query,
      });
    }

    if (query.sortBy === RepositorySortBy.INSIGHT_PRIORITY) {
      return this.findAllByInsightPriority({
        where,
        page,
        pageSize,
        skip,
        order: query.order,
      });
    }

    if (query.sortBy === RepositorySortBy.MONEY_PRIORITY) {
      return this.findAllByMoneyPriority({
        where,
        page,
        pageSize,
        skip,
        order: query.order,
      });
    }

    const orderBy = this.buildOrderBy(query.sortBy, query.order);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.repository.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          analysis: true,
          favorite: true,
        },
      }),
      this.prisma.repository.count({ where }),
    ]);

    return {
      items: await this.serializeWithDerivedAssets<RepositoryListItem[]>(items),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  private async findAllByMoneyPriority({
    where,
    page,
    pageSize,
    skip,
    order,
  }: {
    where: Prisma.RepositoryWhereInput;
    page: number;
    pageSize: number;
    skip: number;
    order: SortOrder;
  }) {
    const [candidates, total] = await this.prisma.$transaction([
      this.prisma.repository.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          description: true,
          homepage: true,
          language: true,
          topics: true,
          stars: true,
          ideaFitScore: true,
          finalScore: true,
          toolLikeScore: true,
          roughPass: true,
          categoryL1: true,
          categoryL2: true,
          createdAtGithub: true,
          createdAt: true,
          updatedAt: true,
          analysis: {
            select: {
              insightJson: true,
              ideaSnapshotJson: true,
              extractedIdeaJson: true,
              claudeReviewJson: true,
              claudeReviewStatus: true,
              manualVerdict: true,
              manualAction: true,
              manualNote: true,
            },
          },
        },
      }),
      this.prisma.repository.count({ where }),
    ]);

    const orderedIds = candidates
      .sort((left, right) => this.compareMoneyPriority(left, right, order))
      .slice(skip, skip + pageSize)
      .map((item) => item.id);

    if (orderedIds.length === 0) {
      return {
        items: [],
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize) || 1,
        },
      };
    }

    const items = await this.prisma.repository.findMany({
      where: {
        id: {
          in: orderedIds,
        },
      },
      include: {
        analysis: true,
        favorite: true,
      },
    });

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const orderedItems = orderedIds
      .map((id) => itemMap.get(id))
      .filter((item): item is RepositoryListItem => Boolean(item));

    return {
      items: await this.serializeWithDerivedAssets<RepositoryListItem[]>(orderedItems),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  private async findAllByCachedMoneyPriority({
    where,
    page,
    pageSize,
    skip,
    query,
  }: {
    where: Prisma.RepositoryWhereInput;
    page: number;
    pageSize: number;
    skip: number;
    query: QueryRepositoriesDto;
  }) {
    const ranked = await this.repositoryCachedRankingService.getRankedRepositoryPage({
      repositoryWhere: where,
      filters: {
        finalVerdict: query.finalVerdict,
        recommendedAction: query.recommendedAction,
        moneyPriority: query.moneyPriority,
        decisionSource: query.decisionSource,
        hasConflict: query.hasConflict,
        needsRecheck: query.needsRecheck,
        hasTrainingHints: query.hasTrainingHints,
      },
      order: query.order ?? SortOrder.DESC,
      skip,
      take: pageSize,
    });

    if (ranked.total === 0 || ranked.repoIds.length === 0) {
      return this.findAllByLatestFallback({
        where,
        page,
        pageSize,
        skip,
      });
    }

    const items = await this.prisma.repository.findMany({
      where: {
        id: {
          in: ranked.repoIds,
        },
      },
      include: {
        analysis: true,
        favorite: true,
      },
    });

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const orderedItems = ranked.repoIds
      .map((id) => itemMap.get(id))
      .filter((item): item is RepositoryListItem => Boolean(item));
    this.maybeScheduleHomepageClaudeReview(orderedItems, {
      page,
      sortBy: query.sortBy,
      order: query.order,
    });

    return {
      items: await this.serializeWithDerivedAssets<RepositoryListItem[]>(orderedItems),
      pagination: {
        page,
        pageSize,
        total: ranked.total,
        totalPages: Math.ceil(ranked.total / pageSize) || 1,
      },
    };
  }

  private async findAllByLatestFallback({
    where,
    page,
    pageSize,
    skip,
  }: {
    where: Prisma.RepositoryWhereInput;
    page: number;
    pageSize: number;
    skip: number;
  }) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.repository.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          analysis: true,
          favorite: true,
        },
      }),
      this.prisma.repository.count({ where }),
    ]);

    return {
      items: await this.serializeWithDerivedAssets<RepositoryListItem[]>(items),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  private async findAllByInsightPriority({
    where,
    page,
    pageSize,
    skip,
    order,
  }: {
    where: Prisma.RepositoryWhereInput;
    page: number;
    pageSize: number;
    skip: number;
    order: SortOrder;
  }) {
    const [candidates, total] = await this.prisma.$transaction([
      this.prisma.repository.findMany({
        where,
        select: {
          id: true,
          createdAtGithub: true,
          ideaFitScore: true,
          updatedAt: true,
          analysis: {
            select: {
              insightJson: true,
              claudeReviewJson: true,
              claudeReviewStatus: true,
              manualVerdict: true,
              manualAction: true,
            },
          },
        },
      }),
      this.prisma.repository.count({ where }),
    ]);

    const orderedIds = candidates
      .sort((left, right) => this.compareInsightPriority(left, right, order))
      .slice(skip, skip + pageSize)
      .map((item) => item.id);

    if (orderedIds.length === 0) {
      return {
        items: [],
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize) || 1,
        },
      };
    }

    const items = await this.prisma.repository.findMany({
      where: {
        id: {
          in: orderedIds,
        },
      },
      include: {
        analysis: true,
        favorite: true,
      },
    });

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const orderedItems = orderedIds
      .map((id) => itemMap.get(id))
      .filter((item): item is RepositoryListItem => Boolean(item));
    this.maybeScheduleHomepageClaudeReview(orderedItems, {
      page,
      sortBy: RepositorySortBy.MONEY_PRIORITY,
      order,
    });

    return {
      items: await this.serializeWithDerivedAssets<RepositoryListItem[]>(orderedItems),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  private async findAllByDerivedDecision({
    where,
    page,
    pageSize,
    skip,
    query,
  }: {
    where: Prisma.RepositoryWhereInput;
    page: number;
      pageSize: number;
      skip: number;
      query: QueryRepositoriesDto;
  }) {
    let candidates: Array<Record<string, unknown>>;
    try {
      candidates = await this.prisma.repository.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          description: true,
          homepage: true,
          language: true,
          topics: true,
          stars: true,
          ideaFitScore: true,
          finalScore: true,
          toolLikeScore: true,
          roughPass: true,
          categoryL1: true,
          categoryL2: true,
          createdAtGithub: true,
          createdAt: true,
          updatedAt: true,
          analysis: {
            select: {
              insightJson: true,
              ideaSnapshotJson: true,
              extractedIdeaJson: true,
              claudeReviewJson: true,
              claudeReviewStatus: true,
              claudeReviewReviewedAt: true,
              manualVerdict: true,
              manualAction: true,
              manualNote: true,
              manualUpdatedAt: true,
              completenessJson: true,
              ideaFitJson: true,
            },
          },
        },
      });
    } catch (error) {
      console.warn(
        '[repository.findAllByDerivedDecision] falling back to windowed derived query:',
        error instanceof Error ? error.message : String(error),
      );
      return this.findAllByDerivedDecisionFallback({
        where,
        page,
        pageSize,
        skip,
        query,
      });
    }

    const auditSnapshot = await this.repositoryDecisionService.getLatestAuditSnapshot();
    const derivedCandidates = this.repositoryDecisionService.attachDerivedAssetsWithAudit(
      this.serialize(candidates),
      auditSnapshot,
    ) as Array<Record<string, unknown>>;

    const filteredCandidates = derivedCandidates.filter((candidate) =>
      this.matchesDerivedDecisionFilters(candidate, query),
    );
    const orderedIds = filteredCandidates
      .sort((left, right) => this.compareDerivedCandidate(left, right, query))
      .slice(skip, skip + pageSize)
      .map((item) => String(item.id));

    if (orderedIds.length === 0) {
      return {
        items: [],
        pagination: {
          page,
          pageSize,
          total: filteredCandidates.length,
          totalPages: Math.ceil(filteredCandidates.length / pageSize) || 1,
        },
      };
    }

    const items = await this.prisma.repository.findMany({
      where: {
        id: {
          in: orderedIds,
        },
      },
      include: {
        analysis: true,
        favorite: true,
      },
    });

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const orderedItems = orderedIds
      .map((id) => itemMap.get(id))
      .filter((item): item is RepositoryListItem => Boolean(item));

    return {
      items: this.repositoryDecisionService.attachDerivedAssetsWithAudit(
        this.serialize(orderedItems),
        auditSnapshot,
      ) as RepositoryListItem[],
      pagination: {
        page,
        pageSize,
        total: filteredCandidates.length,
        totalPages: Math.ceil(filteredCandidates.length / pageSize) || 1,
      },
    };
  }

  private async findAllByDerivedDecisionFallback({
    where,
    page,
    pageSize,
    skip,
    query,
  }: {
    where: Prisma.RepositoryWhereInput;
    page: number;
    pageSize: number;
    skip: number;
    query: QueryRepositoriesDto;
  }) {
    const windowSize = Math.min(Math.max(skip + pageSize * 8, 200), 1000);
    const auditSnapshot = await this.repositoryDecisionService.getLatestAuditSnapshot();
    const windowItems = await this.prisma.repository.findMany({
      where,
      take: windowSize,
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        analysis: true,
        favorite: true,
      },
    });

    const derivedWindow = this.repositoryDecisionService.attachDerivedAssetsWithAudit(
      this.serialize(windowItems),
      auditSnapshot,
    ) as RepositoryListItem[];

    const filteredCandidates = derivedWindow.filter((candidate) =>
      this.matchesDerivedDecisionFilters(candidate as unknown as Record<string, unknown>, query),
    );
    const orderedItems = filteredCandidates
      .sort((left, right) =>
        this.compareDerivedCandidate(
          left as unknown as Record<string, unknown>,
          right as unknown as Record<string, unknown>,
          query,
        ),
      )
      .slice(skip, skip + pageSize);

    return {
      items: orderedItems,
      pagination: {
        page,
        pageSize,
        total: filteredCandidates.length,
        totalPages: Math.ceil(filteredCandidates.length / pageSize) || 1,
      },
    };
  }

  async getSummary(): Promise<RepositorySummary> {
    const [
      totalRepositories,
      favoritedRepositories,
      highOpportunityRepositories,
      completenessAnalyzedRepositories,
      ideaFitAnalyzedRepositories,
      pendingAnalysisRepositories,
      needsIdeaExtractionRepositories,
      highOpportunityUnfavoritedRepositories,
      completenessAnalysisRows,
      ideaFitAnalysisRows,
      extractedIdeaAnalysisRows,
    ] = await this.prisma.$transaction([
      this.prisma.repository.count(),
      this.prisma.repository.count({
        where: {
          isFavorited: true,
        },
      }),
      this.prisma.repository.count({
        where: {
          OR: [
            { opportunityLevel: RepositoryOpportunityLevel.HIGH },
            { decision: RepositoryDecision.RECOMMENDED },
          ],
        },
      }),
      this.prisma.repository.count({
        where: {
          completenessScore: {
            not: null,
          },
        },
      }),
      this.prisma.repository.count({
        where: {
          ideaFitScore: {
            not: null,
          },
        },
      }),
      this.prisma.repository.count({
        where: {
          ideaFitScore: null,
          OR: [
            {
              analysis: {
                is: null,
              },
            },
            {
              analysis: {
                is: {
                  ideaFitJson: {
                    equals: Prisma.DbNull,
                  },
                },
              },
            },
          ],
        },
      }),
      this.prisma.repository.count({
        where: {
          AND: [
            {
              OR: [
                {
                  ideaFitScore: {
                    not: null,
                  },
                },
                {
                  analysis: {
                    is: {
                      ideaFitJson: {
                        not: Prisma.DbNull,
                      },
                    },
                  },
                },
              ],
            },
            {
              OR: [
                {
                  analysis: {
                    is: null,
                  },
                },
                {
                  analysis: {
                    is: {
                      extractedIdeaJson: {
                        equals: Prisma.DbNull,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
      this.prisma.repository.count({
        where: {
          isFavorited: false,
          OR: [
            { opportunityLevel: RepositoryOpportunityLevel.HIGH },
            { decision: RepositoryDecision.RECOMMENDED },
          ],
        },
      }),
      this.prisma.repositoryAnalysis.count({
        where: {
          completenessJson: {
            not: Prisma.DbNull,
          },
        },
      }),
      this.prisma.repositoryAnalysis.count({
        where: {
          ideaFitJson: {
            not: Prisma.DbNull,
          },
        },
      }),
      this.prisma.repositoryAnalysis.count({
        where: {
          extractedIdeaJson: {
            not: Prisma.DbNull,
          },
        },
      }),
    ]);

    return {
      totalRepositories,
      favoritedRepositories,
      highOpportunityRepositories,
      completenessAnalyzedRepositories: Math.max(
        completenessAnalyzedRepositories,
        completenessAnalysisRows,
      ),
      ideaFitAnalyzedRepositories: Math.max(
        ideaFitAnalyzedRepositories,
        ideaFitAnalysisRows,
      ),
      extractedIdeaRepositories: extractedIdeaAnalysisRows,
      pendingAnalysisRepositories,
      needsIdeaExtractionRepositories,
      highOpportunityUnfavoritedRepositories,
    };
  }

  async updateScores(id: string, updateRepositoryScoresDto: UpdateRepositoryScoresDto) {
    await this.ensureRepositoryExists(id);

    const repository = await this.prisma.repository.update({
      where: { id },
      data: this.toRepositoryScoresInput(updateRepositoryScoresDto),
    });

    await this.repositoryCachedRankingService.refreshRepositoryRanking(id);

    return this.serializeWithDerivedAssets(repository);
  }

  async updateFavorite(
    id: string,
    updateRepositoryFavoriteDto: UpdateRepositoryFavoriteDto,
  ) {
    await this.ensureRepositoryExists(id);

    const repository = await this.prisma.repository.update({
      where: { id },
      data: {
        isFavorited: updateRepositoryFavoriteDto.isFavorited,
      },
    });

    return this.serializeWithDerivedAssets(repository);
  }

  async updateManualInsight(
    id: string,
    updateManualInsightDto: UpdateManualInsightDto,
  ) {
    await this.ensureRepositoryExists(id);

    const verdict = updateManualInsightDto.verdict;
    const action = updateManualInsightDto.action;
    const note = updateManualInsightDto.note;

    if (verdict === undefined && action === undefined && note === undefined) {
      throw new BadRequestException(
        'At least one manual insight field must be provided.',
      );
    }

    const analysis = await this.prisma.repositoryAnalysis.upsert({
      where: {
        repositoryId: id,
      },
      update: {
        ...(verdict !== undefined ? { manualVerdict: verdict } : {}),
        ...(action !== undefined ? { manualAction: action } : {}),
        ...(note !== undefined ? { manualNote: note } : {}),
        manualUpdatedAt: new Date(),
      },
      create: {
        repositoryId: id,
        ...(verdict !== undefined ? { manualVerdict: verdict } : {}),
        ...(action !== undefined ? { manualAction: action } : {}),
        ...(note !== undefined ? { manualNote: note } : {}),
        manualUpdatedAt: new Date(),
      },
    });

    await this.repositoryCachedRankingService.refreshRepositoryRanking(id);

    return this.normalizeManualOverride(
      (await this.serializeWithDerivedAssets(analysis)) as Record<string, unknown>,
    );
  }

  async runClaudeReview(
    id: string,
    options?: {
      userSuccessPatterns?: string[];
      userFailurePatterns?: string[];
      preferredCategories?: string[];
      avoidedCategories?: string[];
      recentValidatedWins?: string[];
      recentDroppedReasons?: string[];
    },
  ) {
    await this.ensureRepositoryExists(id);

    const job = await this.queueService.enqueueSingleAnalysis(
      id,
      {
        runFastFilter: true,
        runCompleteness: true,
        runIdeaFit: true,
        runIdeaExtract: true,
        forceRerun: true,
        userSuccessPatterns: options?.userSuccessPatterns ?? [],
        userFailurePatterns: options?.userFailurePatterns ?? [],
        preferredCategories: options?.preferredCategories ?? [],
        avoidedCategories: options?.avoidedCategories ?? [],
        recentValidatedWins: options?.recentValidatedWins ?? [],
        recentDroppedReasons: options?.recentDroppedReasons ?? [],
      },
      'legacy_claude_review_redirect',
      {
        metadata: {
          redirectedFrom: 'repositories/:id/claude-review',
          legacyClaudeEntry: true,
          routerTaskIntent: 'review',
          routerReasonSummary:
            'Legacy Claude review endpoint now redirects into the primary API analysis pipeline.',
        },
      },
    );

    return {
      status: 'redirected_to_primary_analysis' as const,
      repositoryId: id,
      runtime: 'api_primary_analysis' as const,
      message:
        'Claude review runtime has been retired. The repository was queued for a full primary-analysis rerun.',
      job,
    };
  }

  private async ensureRepositoryDoesNotExist(createRepositoryDto: CreateRepositoryDto) {
    const existingRepository = await this.prisma.repository.findFirst({
      where: {
        OR: [
          { githubRepoId: BigInt(createRepositoryDto.githubRepoId) },
          { fullName: createRepositoryDto.fullName },
          { htmlUrl: createRepositoryDto.htmlUrl },
        ],
      },
      select: {
        githubRepoId: true,
        fullName: true,
        htmlUrl: true,
      },
    });

    if (!existingRepository) {
      return;
    }

    const duplicateFields: string[] = [];

    if (existingRepository.githubRepoId === BigInt(createRepositoryDto.githubRepoId)) {
      duplicateFields.push(`githubRepoId=${createRepositoryDto.githubRepoId}`);
    }
    if (existingRepository.fullName === createRepositoryDto.fullName) {
      duplicateFields.push(`fullName=${createRepositoryDto.fullName}`);
    }
    if (existingRepository.htmlUrl === createRepositoryDto.htmlUrl) {
      duplicateFields.push(`htmlUrl=${createRepositoryDto.htmlUrl}`);
    }

    throw new ConflictException(
      `Repository already exists with duplicate field(s): ${duplicateFields.join(', ')}.`,
    );
  }

  private async ensureRepositoryExists(id: string) {
    const existingRepository = await this.prisma.repository.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingRepository) {
      throw new NotFoundException(`Repository with id "${id}" was not found.`);
    }
  }

  private async buildRepositoryWhere(
    query: QueryRepositoriesDto,
  ): Promise<Prisma.RepositoryWhereInput> {
    const where: Prisma.RepositoryWhereInput = {};
    const andConditions: Prisma.RepositoryWhereInput[] = [];
    const isFavorited = this.toOptionalBoolean(query.isFavorited);
    const roughPass = this.toOptionalBoolean(query.roughPass);
    const hasCompletenessAnalysis = this.toOptionalBoolean(
      query.hasCompletenessAnalysis,
    );
    const hasIdeaFitAnalysis = this.toOptionalBoolean(query.hasIdeaFitAnalysis);
    const hasExtractedIdea = this.toOptionalBoolean(query.hasExtractedIdea);
    const hasPromisingIdeaSnapshot = this.toOptionalBoolean(
      query.hasPromisingIdeaSnapshot,
    );
    const hasManualInsight = this.toOptionalBoolean(query.hasManualInsight);
    const hasColdToolFit = this.toOptionalBoolean(query.hasColdToolFit);
    const deepAnalysisState = query.deepAnalysisState;

    if (query.keyword) {
      where.OR = [
        {
          name: {
            contains: query.keyword,
            mode: 'insensitive',
          },
        },
        {
          fullName: {
            contains: query.keyword,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: query.keyword,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.language) {
      where.language = query.language;
    }

    if (query.opportunityLevel) {
      where.opportunityLevel = query.opportunityLevel;
    }

    if (typeof isFavorited === 'boolean') {
      where.isFavorited = isFavorited;
    }

    if (typeof roughPass === 'boolean') {
      where.roughPass = roughPass;
    }

    if (typeof hasCompletenessAnalysis === 'boolean') {
      if (hasCompletenessAnalysis) {
        andConditions.push({
          OR: [
            {
              completenessScore: {
                not: null,
              },
            },
            {
              analysis: {
                is: {
                  completenessJson: {
                    not: Prisma.DbNull,
                  },
                },
              },
            },
          ],
        });
      } else {
        andConditions.push({
          completenessScore: null,
        });
        andConditions.push({
          OR: [
            {
              analysis: {
                is: null,
              },
            },
            {
              analysis: {
                is: {
                  completenessJson: {
                    equals: Prisma.DbNull,
                  },
                },
              },
            },
          ],
        });
      }
    }

    if (typeof hasIdeaFitAnalysis === 'boolean') {
      if (hasIdeaFitAnalysis) {
        andConditions.push({
          OR: [
            {
              ideaFitScore: {
                not: null,
              },
            },
            {
              analysis: {
                is: {
                  ideaFitJson: {
                    not: Prisma.DbNull,
                  },
                },
              },
            },
          ],
        });
      } else {
        andConditions.push({
          ideaFitScore: null,
        });
        andConditions.push({
          OR: [
            {
              analysis: {
                is: null,
              },
            },
            {
              analysis: {
                is: {
                  ideaFitJson: {
                    equals: Prisma.DbNull,
                  },
                },
              },
            },
          ],
        });
      }
    }

    if (typeof hasExtractedIdea === 'boolean') {
      if (hasExtractedIdea) {
        andConditions.push({
          analysis: {
            is: {
              extractedIdeaJson: {
                not: Prisma.DbNull,
              },
            },
          },
        });
      } else {
        andConditions.push({
          OR: [
            {
              analysis: {
                is: null,
              },
            },
            {
              analysis: {
                is: {
                  extractedIdeaJson: {
                    equals: Prisma.DbNull,
                  },
                },
              },
            },
          ],
        });
      }
    }

    if (hasPromisingIdeaSnapshot) {
      andConditions.push({
        OR: [
          {
            analysis: {
              is: {
                ideaSnapshotJson: {
                  path: ['isPromising'],
                  equals: true,
                },
              },
            },
          },
          {
            opportunityLevel: {
              in: [
                RepositoryOpportunityLevel.HIGH,
                RepositoryOpportunityLevel.MEDIUM,
              ],
            },
          },
          {
            decision: {
              in: [
                RepositoryDecision.WATCHLIST,
                RepositoryDecision.RECOMMENDED,
              ],
            },
          },
        ],
      });
    }

    if (typeof hasManualInsight === 'boolean') {
      if (hasManualInsight) {
        andConditions.push({
          analysis: {
            is: {
              manualUpdatedAt: {
                not: null,
              },
            },
          },
        });
      } else {
        andConditions.push({
          OR: [
            {
              analysis: {
                is: null,
              },
            },
            {
              analysis: {
                is: {
                  manualUpdatedAt: null,
                },
              },
            },
          ],
        });
      }
    }

    if (typeof hasColdToolFit === 'boolean') {
      if (hasColdToolFit) {
        andConditions.push({
          analysis: {
            is: {
              tags: {
                has: 'cold_tool_pool',
              },
            },
          },
        });
      } else {
        andConditions.push({
          NOT: {
            analysis: {
              is: {
                tags: {
                  has: 'cold_tool_pool',
                },
              },
            },
          },
        });
      }
    }

    if (deepAnalysisState === RepositoryDeepAnalysisState.COMPLETED) {
      andConditions.push(this.buildDeepAnalysisCompletedCondition());
    } else if (deepAnalysisState === RepositoryDeepAnalysisState.PENDING) {
      const queuedRepositoryIds = await this.findQueuedColdToolRepositoryIds();
      andConditions.push({
        AND: [
          {
            NOT: this.buildDeepAnalysisCompletedCondition(),
          },
          {
            NOT: this.buildDeepAnalysisSkippedCondition(),
          },
          ...(queuedRepositoryIds.length
            ? [
                {
                  id: {
                    notIn: queuedRepositoryIds,
                  },
                } satisfies Prisma.RepositoryWhereInput,
              ]
            : []),
        ],
      });
    } else if (deepAnalysisState === RepositoryDeepAnalysisState.SKIPPED) {
      const queuedRepositoryIds = await this.findQueuedColdToolRepositoryIds();
      andConditions.push({
        AND: [
          this.buildDeepAnalysisSkippedCondition(),
          ...(queuedRepositoryIds.length
            ? [
                {
                  id: {
                    notIn: queuedRepositoryIds,
                  },
                } satisfies Prisma.RepositoryWhereInput,
              ]
            : []),
        ],
      });
    } else if (deepAnalysisState === RepositoryDeepAnalysisState.QUEUED) {
      const queuedRepositoryIds = await this.findQueuedColdToolRepositoryIds();
      andConditions.push({
        id: {
          in: queuedRepositoryIds.length ? queuedRepositoryIds : ['__never__'],
        },
      });
    }

    if (typeof query.minStars === 'number' || typeof query.maxStars === 'number') {
      where.stars = {};

      if (typeof query.minStars === 'number') {
        where.stars.gte = query.minStars;
      }

      if (typeof query.maxStars === 'number') {
        where.stars.lte = query.maxStars;
      }
    }

    if (typeof query.minFinalScore === 'number') {
      where.finalScore = {
        gte: query.minFinalScore,
      };
    }

    if (typeof query.createdAfterDays === 'number') {
      const createdAfter = new Date();
      createdAfter.setDate(createdAfter.getDate() - query.createdAfterDays);

      andConditions.push({
        createdAtGithub: {
          not: null,
          gte: createdAfter,
        },
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    return where;
  }

  private buildDeepAnalysisSkippedCondition(): Prisma.RepositoryWhereInput {
    return {
      AND: [
        {
          NOT: this.buildDeepAnalysisCompletedCondition(),
        },
        {
          OR: [
            {
              analysis: {
                is: {
                  ideaSnapshotJson: {
                    path: ['isPromising'],
                    equals: false,
                  },
                },
              },
            },
            {
              analysis: {
                is: {
                  ideaSnapshotJson: {
                    path: ['nextAction'],
                    equals: 'SKIP',
                  },
                },
              },
            },
            {
              analysis: {
                is: {
                  insightJson: {
                    path: ['oneLinerStrength'],
                    equals: 'WEAK',
                  },
                },
              },
            },
          ],
        },
      ],
    };
  }

  async findQueuedColdToolRepositoryIds() {
    const rows = (await this.prisma.$queryRawUnsafe(`
      select distinct payload->>'repositoryId' as "repositoryId"
      from "JobLog"
      where "queueName" in ('analysis.single', 'analysis.single.cold')
        and "jobStatus" in ('PENDING', 'RUNNING')
        and (
          "triggeredBy" = 'cold_tool_collector'
          or "triggeredBy" = 'analysis_single_watchdog'
          or "payload"->'dto'->>'analysisLane' = 'cold_tool'
          or coalesce(("payload"->>'fromColdToolCollector')::boolean, false) = true
        )
    `)) as Array<{ repositoryId: string | null }>;

    return rows
      .map((row) => this.cleanOptionalString(row.repositoryId))
      .filter((value): value is string => Boolean(value));
  }

  private buildOrderBy(
    sortBy: RepositorySortBy = RepositorySortBy.LATEST,
    order: SortOrder = SortOrder.DESC,
  ): Prisma.RepositoryOrderByWithRelationInput {
    const sortOrder = order;

    switch (sortBy) {
      case RepositorySortBy.STARS:
        return { stars: sortOrder };
      case RepositorySortBy.FINAL_SCORE:
        return { finalScore: sortOrder };
      case RepositorySortBy.IDEA_FIT_SCORE:
        return { ideaFitScore: sortOrder };
      case RepositorySortBy.INSIGHT_PRIORITY:
      case RepositorySortBy.MONEY_PRIORITY:
        return { updatedAt: sortOrder };
      case RepositorySortBy.CREATED_AT:
        return { createdAt: sortOrder };
      case RepositorySortBy.CREATED_AT_GITHUB:
        return { createdAtGithub: sortOrder };
      case RepositorySortBy.LATEST:
      default:
        return { updatedAt: sortOrder };
    }
  }

  private shouldUseDerivedDecisionQuery(query: QueryRepositoriesDto) {
    return (
      query.sortBy === RepositorySortBy.MONEY_PRIORITY ||
      query.sortBy === RepositorySortBy.INSIGHT_PRIORITY ||
      typeof query.hasGoodInsight === 'boolean' ||
      Boolean(query.recommendedAction) ||
      Boolean(query.finalVerdict) ||
      Boolean(query.finalCategory) ||
      Boolean(query.moneyPriority) ||
      Boolean(query.decisionSource) ||
      typeof query.hasConflict === 'boolean' ||
      typeof query.needsRecheck === 'boolean' ||
      typeof query.hasTrainingHints === 'boolean'
    );
  }

  private canUseCachedMoneyPriorityQuery(query: QueryRepositoriesDto) {
    return !query.finalCategory && typeof query.hasGoodInsight !== 'boolean';
  }

  private matchesDerivedDecisionFilters(
    candidate: Record<string, unknown>,
    query: QueryRepositoriesDto,
  ) {
    const finalDecision =
      candidate.finalDecision && typeof candidate.finalDecision === 'object'
        ? (candidate.finalDecision as Record<string, unknown>)
        : null;
    const trainingAsset =
      candidate.trainingAsset && typeof candidate.trainingAsset === 'object'
        ? (candidate.trainingAsset as Record<string, unknown>)
        : null;

    if (!finalDecision) {
      return false;
    }

    if (query.finalVerdict && this.cleanOptionalString(finalDecision.verdict) !== query.finalVerdict) {
      return false;
    }

    if (
      typeof query.hasGoodInsight === 'boolean' &&
      (this.cleanOptionalString(finalDecision.verdict) === 'GOOD') !== query.hasGoodInsight
    ) {
      return false;
    }

    if (
      query.recommendedAction &&
      this.cleanOptionalString(finalDecision.action) !== query.recommendedAction
    ) {
      return false;
    }

    if (query.finalCategory) {
      const haystack = [
        this.cleanOptionalString(finalDecision.category),
        this.cleanOptionalString(finalDecision.categoryLabelZh),
        this.cleanOptionalString(finalDecision.categoryMain),
        this.cleanOptionalString(finalDecision.categorySub),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(query.finalCategory.trim().toLowerCase())) {
        return false;
      }
    }

    if (
      query.moneyPriority &&
      this.cleanOptionalString(finalDecision.moneyPriority) !== query.moneyPriority
    ) {
      return false;
    }

    if (
      query.decisionSource &&
      this.cleanOptionalString(finalDecision.source) !== query.decisionSource
    ) {
      return false;
    }

    if (
      typeof query.hasConflict === 'boolean' &&
      this.toOptionalBoolean(finalDecision.hasConflict) !== query.hasConflict
    ) {
      return false;
    }

    if (
      typeof query.needsRecheck === 'boolean' &&
      this.toOptionalBoolean(finalDecision.needsRecheck) !== query.needsRecheck
    ) {
      return false;
    }

    if (typeof query.hasTrainingHints === 'boolean') {
      const hasTrainingHints =
        this.toOptionalBoolean(finalDecision.hasTrainingHints) === true ||
        (Array.isArray(trainingAsset?.mistakeTypes) &&
          (trainingAsset?.mistakeTypes as unknown[]).length > 0);
      if (hasTrainingHints !== query.hasTrainingHints) {
        return false;
      }
    }

    return true;
  }

  private compareDerivedCandidate(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
    query: QueryRepositoriesDto,
  ) {
    const direction = query.order === SortOrder.ASC ? 1 : -1;
    const leftFinal = this.readJsonObject(left.finalDecision as Prisma.JsonValue | undefined);
    const rightFinal = this.readJsonObject(right.finalDecision as Prisma.JsonValue | undefined);
    const leftAnalysis =
      left.analysis && typeof left.analysis === 'object'
        ? (left.analysis as Record<string, unknown>)
        : null;
    const rightAnalysis =
      right.analysis && typeof right.analysis === 'object'
        ? (right.analysis as Record<string, unknown>)
        : null;
    const leftMoney = this.resolveMoneyPriorityFromDerivedCandidate(left, leftAnalysis);
    const rightMoney = this.resolveMoneyPriorityFromDerivedCandidate(right, rightAnalysis);

    switch (query.sortBy) {
      case RepositorySortBy.MONEY_PRIORITY: {
        const moneyDelta = this.moneyPriorityService.compare(
          leftMoney as unknown as MoneyPriorityResult,
          rightMoney as unknown as MoneyPriorityResult,
          {
            leftIdeaFitScore: this.toNullableNumber(left.ideaFitScore),
            rightIdeaFitScore: this.toNullableNumber(right.ideaFitScore),
            leftStars: this.toNullableNumber(left.stars) ?? 0,
            rightStars: this.toNullableNumber(right.stars) ?? 0,
            leftTimestamp:
              this.toTimestamp(left.createdAtGithub) || this.toTimestamp(left.updatedAt),
            rightTimestamp:
              this.toTimestamp(right.createdAtGithub) || this.toTimestamp(right.updatedAt),
          },
        );
        if (moneyDelta !== 0) {
          return moneyDelta * (query.order === SortOrder.ASC ? -1 : 1);
        }
        break;
      }
      case RepositorySortBy.INSIGHT_PRIORITY: {
        const verdictDelta =
          this.finalVerdictWeight(this.cleanOptionalString(rightFinal?.verdict)) -
          this.finalVerdictWeight(this.cleanOptionalString(leftFinal?.verdict));
        if (verdictDelta !== 0) {
          return verdictDelta;
        }

        const actionDelta =
          this.finalActionWeight(this.cleanOptionalString(rightFinal?.action)) -
          this.finalActionWeight(this.cleanOptionalString(leftFinal?.action));
        if (actionDelta !== 0) {
          return actionDelta;
        }
        break;
      }
      case RepositorySortBy.STARS:
        return ((this.toNullableNumber(left.stars) ?? 0) - (this.toNullableNumber(right.stars) ?? 0)) * direction;
      case RepositorySortBy.FINAL_SCORE:
        return (
          ((this.toNullableNumber(left.finalScore) ?? -1) -
            (this.toNullableNumber(right.finalScore) ?? -1)) * direction
        );
      case RepositorySortBy.IDEA_FIT_SCORE:
        return (
          ((this.toNullableNumber(left.ideaFitScore) ?? -1) -
            (this.toNullableNumber(right.ideaFitScore) ?? -1)) * direction
        );
      case RepositorySortBy.CREATED_AT:
        return (this.toTimestamp(left.createdAt) - this.toTimestamp(right.createdAt)) * direction;
      case RepositorySortBy.CREATED_AT_GITHUB:
        return (
          (this.toTimestamp(left.createdAtGithub) - this.toTimestamp(right.createdAtGithub)) *
          direction
        );
      case RepositorySortBy.LATEST:
      default:
        return (this.toTimestamp(left.updatedAt) - this.toTimestamp(right.updatedAt)) * direction;
    }

    return (this.toTimestamp(left.updatedAt) - this.toTimestamp(right.updatedAt)) * direction;
  }

  private finalVerdictWeight(value: string | null) {
    if (value === 'GOOD') {
      return 3;
    }

    if (value === 'OK') {
      return 2;
    }

    return 1;
  }

  private finalActionWeight(value: string | null) {
    if (value === 'BUILD') {
      return 3;
    }

    if (value === 'CLONE') {
      return 2;
    }

    return 1;
  }

  private compareInsightPriority(
    left: RepositoryInsightOrderCandidate,
    right: RepositoryInsightOrderCandidate,
    order: SortOrder,
  ) {
    const direction = order === SortOrder.ASC ? -1 : 1;
    const verdictDelta =
      this.toInsightVerdictWeight(left.analysis) -
      this.toInsightVerdictWeight(right.analysis);

    if (verdictDelta !== 0) {
      return verdictDelta * direction * -1;
    }

    const actionDelta =
      this.toInsightActionWeight(left.analysis) -
      this.toInsightActionWeight(right.analysis);

    if (actionDelta !== 0) {
      return actionDelta * direction * -1;
    }

    const createdAtGithubDelta =
      (right.createdAtGithub?.getTime() ?? 0) - (left.createdAtGithub?.getTime() ?? 0);

    if (createdAtGithubDelta !== 0) {
      return createdAtGithubDelta * direction;
    }

    const ideaFitDelta =
      (this.toNullableNumber(right.ideaFitScore) ?? 0) -
      (this.toNullableNumber(left.ideaFitScore) ?? 0);

    if (ideaFitDelta !== 0) {
      return ideaFitDelta * direction;
    }

    return (right.updatedAt.getTime() - left.updatedAt.getTime()) * direction;
  }

  private compareMoneyPriority(
    left: RepositoryMoneyPriorityOrderCandidate,
    right: RepositoryMoneyPriorityOrderCandidate,
    order: SortOrder,
  ) {
    const direction = order === SortOrder.ASC ? -1 : 1;
    const leftMoney = this.resolveMoneyPriority(left);
    const rightMoney = this.resolveMoneyPriority(right);
    const moneyDelta = this.moneyPriorityService.compare(leftMoney, rightMoney, {
      leftIdeaFitScore: this.toNullableNumber(left.ideaFitScore),
      rightIdeaFitScore: this.toNullableNumber(right.ideaFitScore),
      leftStars: left.stars,
      rightStars: right.stars,
      leftTimestamp: left.createdAtGithub?.getTime() ?? left.updatedAt.getTime(),
      rightTimestamp:
        right.createdAtGithub?.getTime() ?? right.updatedAt.getTime(),
    });

    if (moneyDelta !== 0) {
      return moneyDelta * direction;
    }

    return (right.updatedAt.getTime() - left.updatedAt.getTime()) * direction;
  }

  private resolveMoneyPriorityFromDerivedCandidate(
    candidate: Record<string, unknown>,
    analysis: Record<string, unknown> | null,
  ) {
    const existing =
      analysis && this.readJsonObject(analysis.moneyPriority as Prisma.JsonValue | undefined);

    if (existing) {
      return existing as unknown as MoneyPriorityResult;
    }

    return this.resolveMoneyPriority({
      fullName: this.cleanOptionalString(candidate.fullName),
      description: this.cleanOptionalString(candidate.description),
      homepage: this.cleanOptionalString(candidate.homepage),
      language: this.cleanOptionalString(candidate.language),
      topics: Array.isArray(candidate.topics) ? (candidate.topics as string[]) : [],
      stars: this.toNullableNumber(candidate.stars),
      ideaFitScore: this.toNullableNumber(candidate.ideaFitScore),
      finalScore: this.toNullableNumber(candidate.finalScore),
      toolLikeScore: this.toNullableNumber(candidate.toolLikeScore),
      roughPass: this.toOptionalBoolean(candidate.roughPass),
      categoryL1: this.cleanOptionalString(candidate.categoryL1),
      categoryL2: this.cleanOptionalString(candidate.categoryL2),
      analysis,
    });
  }

  private toInsightVerdictWeight(
    analysis:
      | {
          insightJson?: Prisma.JsonValue | null;
          claudeReviewJson?: Prisma.JsonValue | null;
          claudeReviewStatus?: string | null;
          manualVerdict?: string | null;
        }
      | null
      | undefined,
  ) {
    const insight = this.readJsonObject(analysis?.insightJson);
    const claudeReview =
      analysis?.claudeReviewStatus === 'SUCCESS'
        ? this.readJsonObject(analysis?.claudeReviewJson)
        : null;
    const verdict = String(
      analysis?.manualVerdict ?? claudeReview?.verdict ?? insight?.verdict ?? '',
    ).toUpperCase();

    switch (verdict) {
      case 'GOOD':
        return 3;
      case 'OK':
        return 2;
      case 'BAD':
        return 1;
      default:
        return 0;
    }
  }

  private toInsightActionWeight(
    analysis:
      | {
          insightJson?: Prisma.JsonValue | null;
          claudeReviewJson?: Prisma.JsonValue | null;
          claudeReviewStatus?: string | null;
          manualAction?: string | null;
        }
      | null
      | undefined,
  ) {
    const insight = this.readJsonObject(analysis?.insightJson);
    const claudeReview =
      analysis?.claudeReviewStatus === 'SUCCESS'
        ? this.readJsonObject(analysis?.claudeReviewJson)
        : null;
    const action = String(
      analysis?.manualAction ?? claudeReview?.action ?? insight?.action ?? '',
    ).toUpperCase();

    switch (action) {
      case RepositoryRecommendedAction.BUILD:
        return 3;
      case RepositoryRecommendedAction.CLONE:
        return 2;
      case RepositoryRecommendedAction.IGNORE:
        return 1;
      default:
        return 0;
    }
  }

  private buildEffectiveInsightVerdictWhere(verdict: 'GOOD' | 'OK' | 'BAD') {
    return {
      OR: [
        {
          analysis: {
            is: {
              manualVerdict: verdict,
            },
          },
        },
        {
          analysis: {
            is: {
              manualVerdict: null,
              claudeReviewStatus: 'SUCCESS',
              claudeReviewJson: {
                path: ['verdict'],
                equals: verdict,
              },
            },
          },
        },
        {
          analysis: {
            is: {
              manualVerdict: null,
              claudeReviewStatus: {
                not: 'SUCCESS',
              },
              insightJson: {
                path: ['verdict'],
                equals: verdict,
              },
            },
          },
        },
      ],
    } satisfies Prisma.RepositoryWhereInput;
  }

  private buildEffectiveRecommendedActionWhere(
    action: RepositoryRecommendedAction,
  ) {
    return {
      OR: [
        {
          analysis: {
            is: {
              manualAction: action,
            },
          },
        },
        {
          analysis: {
            is: {
              manualAction: null,
              claudeReviewStatus: 'SUCCESS',
              claudeReviewJson: {
                path: ['action'],
                equals: action,
              },
            },
          },
        },
        {
          analysis: {
            is: {
              manualAction: null,
              claudeReviewStatus: {
                not: 'SUCCESS',
              },
              insightJson: {
                path: ['action'],
                equals: action,
              },
            },
          },
        },
      ],
    } satisfies Prisma.RepositoryWhereInput;
  }

  private readJsonObject(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private toNullableNumber(value: unknown) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (value && typeof value === 'object' && 'toNumber' in value) {
      return (value as Prisma.Decimal).toNumber();
    }

    return null;
  }

  private toTimestamp(value: unknown) {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === 'string') {
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) ? timestamp : 0;
    }

    return 0;
  }

  private toRepositoryCreateInput(
    dto: CreateRepositoryDto,
  ): Prisma.RepositoryUncheckedCreateInput {
    return {
      githubRepoId: BigInt(dto.githubRepoId),
      fullName: dto.fullName,
      name: dto.name,
      ownerLogin: dto.ownerLogin,
      htmlUrl: dto.htmlUrl,
      description: dto.description,
      homepage: dto.homepage,
      language: dto.language,
      license: dto.license,
      defaultBranch: dto.defaultBranch,
      stars: dto.stars,
      forks: dto.forks,
      watchers: dto.watchers,
      openIssues: dto.openIssues,
      topics: dto.topics,
      archived: dto.archived,
      disabled: dto.disabled,
      hasWiki: dto.hasWiki,
      hasIssues: dto.hasIssues,
      createdAtGithub: this.toDate(dto.createdAtGithub),
      updatedAtGithub: this.toDate(dto.updatedAtGithub),
      pushedAtGithub: this.toDate(dto.pushedAtGithub),
      lastCommitAt: this.toDate(dto.lastCommitAt),
      commitCount30d: dto.commitCount30d,
      contributorsCount: dto.contributorsCount,
      issueActivityScore: dto.issueActivityScore,
      growth24h: dto.growth24h,
      growth7d: dto.growth7d,
      activityScore: dto.activityScore,
      roughPass: dto.roughPass,
      roughLevel: dto.roughLevel,
      roughReason: dto.roughReason,
      toolLikeScore: dto.toolLikeScore,
      completenessScore: dto.completenessScore,
      completenessLevel: dto.completenessLevel,
      productionReady: dto.productionReady,
      runability: dto.runability,
      projectReferenceScore: dto.projectReferenceScore,
      ideaFitScore: dto.ideaFitScore,
      opportunityLevel: dto.opportunityLevel,
      finalScore: dto.finalScore,
      categoryL1: dto.categoryL1,
      categoryL2: dto.categoryL2,
      status: dto.status,
      isFavorited: dto.isFavorited,
      sourceType: dto.sourceType,
      analysisProvider: dto.analysisProvider,
      analysisModel: dto.analysisModel,
      analysisConfidence: dto.analysisConfidence,
    };
  }

  private toRepositoryContentInput(
    content: CreateRepositoryDto['content'],
  ): Prisma.RepositoryContentUncheckedCreateWithoutRepositoryInput {
    if (!content) {
      return {};
    }

    return {
      readmeText: content.readmeText,
      fileTree: content.fileTree as Prisma.InputJsonValue | undefined,
      rootFiles: content.rootFiles as Prisma.InputJsonValue | undefined,
      hasDockerfile: content.hasDockerfile,
      hasCompose: content.hasCompose,
      hasCi: content.hasCi,
      hasTests: content.hasTests,
      hasDocs: content.hasDocs,
      hasEnvExample: content.hasEnvExample,
      packageManifests: content.packageManifests as Prisma.InputJsonValue | undefined,
      fetchedAt: this.toDate(content.fetchedAt),
    };
  }

  private toRepositoryUpdateInput(dto: UpdateRepositoryDto): Prisma.RepositoryUpdateInput {
    return {
      githubRepoId: dto.githubRepoId ? BigInt(dto.githubRepoId) : undefined,
      fullName: dto.fullName,
      name: dto.name,
      ownerLogin: dto.ownerLogin,
      htmlUrl: dto.htmlUrl,
      description: dto.description,
      homepage: dto.homepage,
      language: dto.language,
      license: dto.license,
      defaultBranch: dto.defaultBranch,
      stars: dto.stars,
      forks: dto.forks,
      watchers: dto.watchers,
      openIssues: dto.openIssues,
      topics: dto.topics,
      archived: dto.archived,
      disabled: dto.disabled,
      hasWiki: dto.hasWiki,
      hasIssues: dto.hasIssues,
      createdAtGithub: this.toDate(dto.createdAtGithub),
      updatedAtGithub: this.toDate(dto.updatedAtGithub),
      pushedAtGithub: this.toDate(dto.pushedAtGithub),
      lastCommitAt: this.toDate(dto.lastCommitAt),
      commitCount30d: dto.commitCount30d,
      contributorsCount: dto.contributorsCount,
      issueActivityScore: dto.issueActivityScore,
      growth24h: dto.growth24h,
      growth7d: dto.growth7d,
      activityScore: dto.activityScore,
      roughPass: dto.roughPass,
      roughLevel: dto.roughLevel,
      roughReason: dto.roughReason,
      toolLikeScore: dto.toolLikeScore,
      completenessScore: dto.completenessScore,
      completenessLevel: dto.completenessLevel,
      productionReady: dto.productionReady,
      runability: dto.runability,
      projectReferenceScore: dto.projectReferenceScore,
      ideaFitScore: dto.ideaFitScore,
      opportunityLevel: dto.opportunityLevel,
      finalScore: dto.finalScore,
      categoryL1: dto.categoryL1,
      categoryL2: dto.categoryL2,
      status: dto.status,
      isFavorited: dto.isFavorited,
      sourceType: dto.sourceType,
      analysisProvider: dto.analysisProvider,
      analysisModel: dto.analysisModel,
      analysisConfidence: dto.analysisConfidence,
    };
  }

  private toRepositoryScoresInput(
    dto: UpdateRepositoryScoresDto,
  ): Prisma.RepositoryUpdateInput {
    return {
      completenessScore: dto.completenessScore,
      ideaFitScore: dto.ideaFitScore,
      finalScore: dto.finalScore,
      projectReferenceScore: dto.projectReferenceScore,
      opportunityLevel: dto.opportunityLevel as RepositoryOpportunityLevel | undefined,
      decision: dto.decision as RepositoryDecision | undefined,
      analysisProvider: dto.analysisProvider,
      analysisModel: dto.analysisModel,
      analysisConfidence: dto.analysisConfidence,
    };
  }

  private toDate(value?: string) {
    return value ? new Date(value) : undefined;
  }

  private handleKnownPrismaError(error: unknown): never | void {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta?.target.join(', ')
        : String(error.meta?.target ?? 'unique field');

      throw new ConflictException(
        `Repository operation failed because the value for ${target} already exists.`,
      );
    }
  }

  private serialize<T>(value: T): T {
    const serialized = JSON.parse(
      JSON.stringify(value, (_, currentValue) => {
        if (typeof currentValue === 'bigint') {
          return currentValue.toString();
        }

        if (currentValue instanceof Prisma.Decimal) {
          return currentValue.toNumber();
        }

        return currentValue;
      }),
    ) as T;

    return this.attachManualOverride(serialized);
  }

  private async serializeWithDerivedAssets<T>(value: T): Promise<T> {
    const serialized = this.serialize(value);
    return this.repositoryDecisionService.attachDerivedAssets(serialized);
  }

  private attachManualOverride<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.attachManualOverride(item)) as T;
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const record = value as Record<string, unknown>;

    for (const [key, currentValue] of Object.entries(record)) {
      if (key === 'analysis' && currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
        record[key] = this.normalizeAnalysisRecord(
          currentValue as Record<string, unknown>,
          record,
        );
        continue;
      }

      if (currentValue && typeof currentValue === 'object') {
        record[key] = this.attachManualOverride(currentValue);
      }
    }

    return value;
  }

  private normalizeAnalysisRecord(
    analysis: Record<string, unknown>,
    repository?: Record<string, unknown>,
  ) {
    const analysisJson = this.readJsonObject(
      analysis.analysisJson as Prisma.JsonValue | undefined,
    );
    const normalized: Record<string, unknown> = {
      ...analysis,
      manualOverride: this.normalizeManualOverride(analysis),
      claudeReview: this.normalizeClaudeReview(analysis),
      coldToolPool: analysisJson
        ? this.readJsonObject(analysisJson.coldToolPool as Prisma.JsonValue | undefined)
        : null,
    };

    if (repository) {
      normalized.moneyPriority = this.resolveMoneyPriority({
        fullName: this.cleanOptionalString(repository.fullName),
        description: this.cleanOptionalString(repository.description),
        homepage: this.cleanOptionalString(repository.homepage),
        language: this.cleanOptionalString(repository.language),
        topics: Array.isArray(repository.topics)
          ? (repository.topics as string[])
          : [],
        stars: this.toNullableNumber(repository.stars as number | null | undefined) ?? 0,
        ideaFitScore: this.toNullableNumber(
          repository.ideaFitScore as number | null | undefined,
        ),
        finalScore: this.toNullableNumber(
          repository.finalScore as number | null | undefined,
        ),
        toolLikeScore: this.toNullableNumber(
          repository.toolLikeScore as number | null | undefined,
        ),
        roughPass: this.toOptionalBoolean(repository.roughPass),
        categoryL1: this.cleanOptionalString(repository.categoryL1),
        categoryL2: this.cleanOptionalString(repository.categoryL2),
        analysis: normalized,
      });
      Object.assign(
        normalized,
        this.resolveIdeaExtractRuntimeFields(normalized, repository),
      );
    }

    delete normalized.manualVerdict;
    delete normalized.manualAction;
    delete normalized.manualNote;
    delete normalized.manualUpdatedAt;
    delete normalized.analysisJson;

    return normalized;
  }

  private resolveIdeaExtractRuntimeFields(
    analysis: Record<string, unknown>,
    repository: Record<string, unknown>,
  ) {
    const insight = this.readJsonObject(analysis.insightJson as Prisma.JsonValue | undefined);
    const snapshot = this.readJsonObject(
      analysis.ideaSnapshotJson as Prisma.JsonValue | undefined,
    );
    const claudeReview =
      this.cleanOptionalString(analysis.claudeReviewStatus) === 'SUCCESS'
        ? this.readJsonObject(analysis.claudeReviewJson as Prisma.JsonValue | undefined)
        : null;
    const ideaFit = this.readJsonObject(
      analysis.ideaFitJson as Prisma.JsonValue | undefined,
    );
    const completeness = this.readJsonObject(
      analysis.completenessJson as Prisma.JsonValue | undefined,
    );
    const extractedIdea = this.readJsonObject(
      analysis.extractedIdeaJson as Prisma.JsonValue | undefined,
    );
    const { strength } = resolveEffectiveOneLinerStrength({
      localStrength: this.normalizeOneLinerStrength(insight?.oneLinerStrength),
      claudeStrength: this.normalizeOneLinerStrength(claudeReview?.oneLinerStrength),
      updatedAt:
        this.cleanOptionalString(repository.updatedAtGithub) ??
        this.cleanOptionalString(repository.updatedAt),
      createdAt:
        this.cleanOptionalString(repository.createdAtGithub) ??
        this.cleanOptionalString(repository.createdAt),
    });

    const ideaExtractMode =
      this.cleanOptionalString(extractedIdea?.extractMode) ??
      (strength === 'STRONG' ? 'full' : strength === 'WEAK' ? 'skip' : 'light');
    const snapshotPromising = snapshot?.isPromising === true;
    const snapshotNextAction = this.cleanOptionalString(snapshot?.nextAction);
    const shouldSkipByStrength = !extractedIdea && strength === 'WEAK';
    const shouldSkipByGate =
      !extractedIdea &&
      (snapshotPromising === false || snapshotNextAction === 'SKIP');
    const hasAnyDeepArtifacts = Boolean(
      extractedIdea || ideaFit || completeness || insight,
    );
    const hasFullDeepArtifacts = Boolean(
      extractedIdea && ideaFit && completeness && insight,
    );
    const deepAnalysisStatus = hasFullDeepArtifacts
      ? 'COMPLETED'
      : shouldSkipByStrength
        ? 'SKIPPED_BY_STRENGTH'
        : shouldSkipByGate
          ? 'SKIPPED_BY_GATE'
      : hasAnyDeepArtifacts
        ? 'PENDING'
        : 'NOT_STARTED';
    const deepAnalysisStatusReason =
      deepAnalysisStatus === 'PENDING'
        ? 'partial_deep_artifacts'
        : deepAnalysisStatus === 'SKIPPED_BY_STRENGTH'
        ? 'strength_weak'
        : deepAnalysisStatus === 'SKIPPED_BY_GATE'
          ? snapshotPromising === false
            ? 'snapshot_not_promising'
            : 'snapshot_next_action_skip'
          : null;
    const ideaExtractStatus = extractedIdea
      ? 'COMPLETED'
      : deepAnalysisStatus === 'SKIPPED_BY_STRENGTH'
        ? 'SKIPPED_BY_STRENGTH'
        : deepAnalysisStatus === 'SKIPPED_BY_GATE'
          ? 'SKIPPED_BY_GATE'
          : 'NOT_STARTED';

    return {
      ideaExtractMode,
      ideaExtractStatus,
      ideaExtractStatusReason: deepAnalysisStatusReason,
      deepAnalysisStatus,
      deepAnalysisStatusReason,
    };
  }

  private resolveMoneyPriority(
    value:
      | RepositoryMoneyPriorityOrderCandidate
      | {
          fullName?: string | null;
          description?: string | null;
          homepage?: string | null;
          language?: string | null;
          topics?: string[] | null;
          stars?: number | null;
          ideaFitScore?: number | null;
          finalScore?: number | null;
          toolLikeScore?: number | null;
          roughPass?: boolean | null;
          categoryL1?: string | null;
          categoryL2?: string | null;
          analysis?: Record<string, unknown> | null;
        },
  ): MoneyPriorityResult {
    const analysis =
      value && 'analysis' in value && value.analysis && typeof value.analysis === 'object'
        ? (value.analysis as Record<string, unknown>)
        : null;
    const claudeReview =
      analysis && this.cleanOptionalString(analysis.claudeReviewStatus) === 'SUCCESS'
        ? this.readJsonObject(analysis.claudeReviewJson as Prisma.JsonValue | undefined)
        : null;
    const insight = analysis
      ? this.readJsonObject(analysis.insightJson as Prisma.JsonValue | undefined)
      : null;
    const snapshot = analysis
      ? this.readJsonObject(analysis.ideaSnapshotJson as Prisma.JsonValue | undefined)
      : null;
    const extractedIdea = analysis
      ? this.readJsonObject(analysis.extractedIdeaJson as Prisma.JsonValue | undefined)
      : null;

    return this.moneyPriorityService.calculate({
      repository: {
        fullName: this.cleanOptionalString(value.fullName),
        description: this.cleanOptionalString(value.description),
        homepage: this.cleanOptionalString(value.homepage),
        language: this.cleanOptionalString(value.language),
        topics: Array.isArray(value.topics) ? value.topics : [],
        stars: this.toNullableNumber(value.stars),
        ideaFitScore: this.toNullableNumber(value.ideaFitScore),
        finalScore: this.toNullableNumber(value.finalScore),
        toolLikeScore: this.toNullableNumber(value.toolLikeScore),
        roughPass: typeof value.roughPass === 'boolean' ? value.roughPass : null,
        categoryL1: this.cleanOptionalString(value.categoryL1),
        categoryL2: this.cleanOptionalString(value.categoryL2),
      },
      manualOverride: analysis
        ? {
            verdict: this.cleanOptionalString(analysis.manualVerdict),
            action: this.cleanOptionalString(analysis.manualAction),
            note: this.cleanOptionalString(analysis.manualNote),
          }
        : null,
      claudeReview,
      insight,
      snapshot,
      extractedIdea,
    } satisfies MoneyPriorityInput);
  }

  private normalizeClaudeReview(
    value:
      | Record<string, unknown>
      | {
          claudeReviewJson?: Prisma.JsonValue | null;
          claudeReviewStatus?: string | null;
          claudeReviewProvider?: string | null;
          claudeReviewModel?: string | null;
          claudeReviewReviewedAt?: string | Date | null;
          claudeReviewError?: string | null;
        }
      | null
      | undefined,
  ) {
    const status = this.cleanOptionalString(value?.claudeReviewStatus);
    const review =
      status === 'SUCCESS'
        ? this.readJsonObject(value?.claudeReviewJson as Prisma.JsonValue | undefined)
        : null;

    if (!status && !review) {
      return null;
    }

    return {
      status,
      provider: this.cleanOptionalString(value?.claudeReviewProvider),
      model: this.cleanOptionalString(value?.claudeReviewModel),
      reviewedAt: this.cleanOptionalString(value?.claudeReviewReviewedAt),
      error: this.cleanOptionalString(value?.claudeReviewError),
      review,
    };
  }

  private normalizeManualOverride(
    value:
      | Record<string, unknown>
      | {
          manualVerdict?: string | null;
          manualAction?: string | null;
          manualNote?: string | null;
          manualUpdatedAt?: string | Date | null;
        }
      | null
      | undefined,
  ) {
    const verdict = this.cleanOptionalString(value?.manualVerdict);
    const action = this.cleanOptionalString(value?.manualAction);
    const note = this.cleanOptionalString(value?.manualNote);
    const updatedAt = this.cleanOptionalString(value?.manualUpdatedAt);

    if (!verdict && !action && !note && !updatedAt) {
      return null;
    }

    return {
      ...(verdict ? { verdict } : {}),
      ...(action ? { action } : {}),
      ...(note ? { note } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  }

  private cleanOptionalString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOneLinerStrength(value: unknown) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'STRONG' || normalized === 'MEDIUM' || normalized === 'WEAK') {
      return normalized;
    }

    return null;
  }

  private async assertAnalysisPoolRepositoryCreateAllowed() {
    if (typeof this.prisma.systemConfig?.findUnique !== 'function') {
      return;
    }
    const [freezeRow, snapshotRow] = await Promise.all([
      this.prisma.systemConfig.findUnique({
        where: {
          configKey: ANALYSIS_POOL_FREEZE_STATE_CONFIG_KEY,
        },
      }),
      this.prisma.systemConfig.findUnique({
        where: {
          configKey: FROZEN_ANALYSIS_POOL_BATCH_CONFIG_KEY,
        },
      }),
    ]);
    const gate = evaluateAnalysisPoolIntakeGate({
      freezeState: readAnalysisPoolFreezeState(freezeRow?.configValue),
      snapshot: readFrozenAnalysisPoolBatchSnapshot(snapshotRow?.configValue),
      source: 'repository_create',
    });

    if (gate.decision === 'suppress_new_entry') {
      throw new BadRequestException(gate.reason);
    }
  }
}
