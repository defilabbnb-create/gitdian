import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RepositoryDecisionService } from './repository-decision.service';

type RepositoryWithAnalysis = Prisma.RepositoryGetPayload<{
  include: {
    analysis: true;
  };
}>;

type MoneyPriorityQueryFilters = {
  finalVerdict?: string;
  recommendedAction?: string;
  moneyPriority?: string;
  decisionSource?: string;
  hasConflict?: boolean;
  needsRecheck?: boolean;
  hasTrainingHints?: boolean;
};

@Injectable()
export class RepositoryCachedRankingService {
  private readonly logger = new Logger(RepositoryCachedRankingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repositoryDecisionService: RepositoryDecisionService,
  ) {}

  async refreshRepositoryRanking(repositoryId: string) {
    const repository = await this.prisma.repository.findUnique({
      where: {
        id: repositoryId,
      },
      include: {
        analysis: true,
      },
    });

    if (!repository) {
      return null;
    }

    return this.refreshRepositoryRankingFromRepository(repository);
  }

  async refreshRepositoryRankingFromRepository(repository: RepositoryWithAnalysis) {
    const derived = (await this.repositoryDecisionService.attachDerivedAssets(
      this.serialize(repository),
    )) as Record<string, unknown>;
    const finalDecision = this.readObject(derived.finalDecision);
    const repoId = this.cleanText(repository.id, 80);

    if (!repoId || !finalDecision) {
      if (repoId) {
        await this.prisma.repositoryCachedRanking.deleteMany({
          where: {
            repoId,
          },
        });
      }
      return null;
    }

    const moneyDecision = this.readObject(finalDecision.moneyDecision);
    const ranking = await this.prisma.repositoryCachedRanking.upsert({
      where: {
        repoId,
      },
      update: {
        moneyScore: this.toRankingScore(moneyDecision?.score),
        moneyDecision: this.cleanText(moneyDecision?.labelZh, 80) || '低优先',
        moneyPriority: this.cleanText(finalDecision.moneyPriority, 20) || 'P3',
        finalVerdict: this.cleanText(finalDecision.verdict, 20) || 'BAD',
        finalAction: this.cleanText(finalDecision.action, 20) || 'IGNORE',
        decisionSource: this.cleanText(finalDecision.source, 20) || 'fallback',
        hasConflict: this.toBoolean(finalDecision.hasConflict),
        needsRecheck: this.toBoolean(finalDecision.needsRecheck),
        hasTrainingHints: this.toBoolean(finalDecision.hasTrainingHints),
      },
      create: {
        repoId,
        moneyScore: this.toRankingScore(moneyDecision?.score),
        moneyDecision: this.cleanText(moneyDecision?.labelZh, 80) || '低优先',
        moneyPriority: this.cleanText(finalDecision.moneyPriority, 20) || 'P3',
        finalVerdict: this.cleanText(finalDecision.verdict, 20) || 'BAD',
        finalAction: this.cleanText(finalDecision.action, 20) || 'IGNORE',
        decisionSource: this.cleanText(finalDecision.source, 20) || 'fallback',
        hasConflict: this.toBoolean(finalDecision.hasConflict),
        needsRecheck: this.toBoolean(finalDecision.needsRecheck),
        hasTrainingHints: this.toBoolean(finalDecision.hasTrainingHints),
      },
    });

    return ranking;
  }

  async getRankedRepositoryPage(options: {
    repositoryWhere: Prisma.RepositoryWhereInput;
    filters?: MoneyPriorityQueryFilters;
    order: 'asc' | 'desc';
    skip: number;
    take: number;
  }) {
    const where = this.buildRankingWhere(options.repositoryWhere, options.filters);
    const orderDirection: Prisma.SortOrder = options.order === 'asc' ? 'asc' : 'desc';

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.repositoryCachedRanking.findMany({
        where,
        select: {
          repoId: true,
        },
        orderBy: [
          {
            moneyScore: orderDirection,
          },
          {
            updatedAt: 'desc',
          },
        ],
        skip: options.skip,
        take: options.take,
      }),
      this.prisma.repositoryCachedRanking.count({
        where,
      }),
    ]);

    return {
      repoIds: rows.map((row) => row.repoId),
      total,
    };
  }

  async rebuildRankings(options?: {
    batchSize?: number;
    limit?: number;
  }) {
    const batchSize = Math.max(20, Math.min(options?.batchSize ?? 200, 500));
    const limit = options?.limit && options.limit > 0 ? options.limit : null;
    let cursor: string | null = null;
    let processed = 0;

    let hasMore = true;

    while (hasMore) {
      if (limit !== null && processed >= limit) {
        break;
      }

      const repositories: RepositoryWithAnalysis[] =
        await this.prisma.repository.findMany({
        include: {
          analysis: true,
        },
        orderBy: {
          id: 'asc',
        },
        ...(cursor
          ? {
              cursor: {
                id: cursor,
              },
              skip: 1,
            }
          : {}),
        take:
          limit === null
            ? batchSize
            : Math.max(1, Math.min(batchSize, limit - processed)),
        });

      if (repositories.length === 0) {
        hasMore = false;
        continue;
      }

      for (const repository of repositories) {
        await this.refreshRepositoryRankingFromRepository(repository);
        processed += 1;
      }

      cursor = repositories[repositories.length - 1]?.id ?? null;
      this.logger.log(
        `repository_cached_ranking rebuilt processed=${processed}`,
      );
    }

    return {
      processed,
    };
  }

  private buildRankingWhere(
    repositoryWhere: Prisma.RepositoryWhereInput,
    filters?: MoneyPriorityQueryFilters,
  ): Prisma.RepositoryCachedRankingWhereInput {
    const where: Prisma.RepositoryCachedRankingWhereInput = {
      repository: {
        is: repositoryWhere,
      },
    };

    if (filters?.finalVerdict) {
      where.finalVerdict = filters.finalVerdict;
    }

    if (filters?.recommendedAction) {
      where.finalAction = filters.recommendedAction;
    }

    if (filters?.moneyPriority) {
      where.moneyPriority = filters.moneyPriority;
    }

    if (filters?.decisionSource) {
      where.decisionSource = filters.decisionSource;
    }

    if (typeof filters?.hasConflict === 'boolean') {
      where.hasConflict = filters.hasConflict;
    }

    if (typeof filters?.needsRecheck === 'boolean') {
      where.needsRecheck = filters.needsRecheck;
    }

    if (typeof filters?.hasTrainingHints === 'boolean') {
      where.hasTrainingHints = filters.hasTrainingHints;
    }

    return where;
  }

  private toRankingScore(value: unknown) {
    const numeric =
      typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? '0'));

    if (!Number.isFinite(numeric)) {
      return 0;
    }

    return Math.max(0, Math.min(100, Number(numeric.toFixed(4))));
  }

  private serialize<T>(value: T): T {
    return JSON.parse(
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
  }

  private readObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private cleanText(value: unknown, maxLength: number) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value).trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  private toBoolean(value: unknown) {
    return value === true;
  }
}
