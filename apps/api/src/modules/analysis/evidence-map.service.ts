import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildEvidenceMapReport,
  buildRepositoryEvidenceMap,
  type EvidenceMapReport,
  type RepositoryEvidenceMap,
} from './helpers/evidence-map.helper';
import { RepositoryDecisionService } from './repository-decision.service';

type EvidenceMapRepositoryRecord = Prisma.RepositoryGetPayload<{
  select: {
    id: true;
    fullName: true;
    name: true;
    ownerLogin: true;
    htmlUrl: true;
    description: true;
    homepage: true;
    language: true;
    license: true;
    topics: true;
    stars: true;
    forks: true;
    watchers: true;
    openIssues: true;
    archived: true;
    disabled: true;
    updatedAt: true;
    updatedAtGithub: true;
    pushedAtGithub: true;
    lastCommitAt: true;
    commitCount30d: true;
    contributorsCount: true;
    issueActivityScore: true;
    growth7d: true;
    activityScore: true;
    completenessScore: true;
    completenessLevel: true;
    productionReady: true;
    runability: true;
    ideaFitScore: true;
    opportunityLevel: true;
    finalScore: true;
    decision: true;
    analysisProvider: true;
    analysisModel: true;
    analysisConfidence: true;
    isFavorited: true;
    content: {
      select: {
        readmeText: true;
        fetchedAt: true;
      };
    };
    analysis: {
      select: {
        ideaSnapshotJson: true;
        insightJson: true;
        claudeReviewJson: true;
        claudeReviewStatus: true;
        claudeReviewReviewedAt: true;
        manualVerdict: true;
        manualAction: true;
        manualNote: true;
        manualUpdatedAt: true;
        completenessJson: true;
        ideaFitJson: true;
        extractedIdeaJson: true;
        negativeFlags: true;
        tags: true;
        provider: true;
        modelName: true;
        promptVersion: true;
        confidence: true;
        fallbackUsed: true;
        analyzedAt: true;
      };
    };
    favorite: {
      select: {
        priority: true;
      };
    };
    cachedRanking: {
      select: {
        moneyScore: true;
        moneyPriority: true;
        updatedAt: true;
      };
    };
    snapshots: {
      take: 1;
      orderBy: {
        snapshotAt: 'desc';
      };
      select: {
        snapshotAt: true;
      };
    };
  };
}>;

export type EvidenceMapBuildOptions = {
  repositoryId?: string;
  repositoryIds?: string[];
  limit?: number;
};

@Injectable()
export class EvidenceMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repositoryDecisionService: RepositoryDecisionService,
  ) {}

  async buildForRepositoryId(repositoryId: string): Promise<RepositoryEvidenceMap> {
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      select: this.repositorySelect(),
    });

    if (!repository) {
      throw new NotFoundException(
        `Repository with id "${repositoryId}" was not found.`,
      );
    }

    const [derivedRepository] = await this.attachDerivedAssets([repository]);
    return buildRepositoryEvidenceMap({
      repository: derivedRepository,
    });
  }

  async buildBatch(
    options: Omit<EvidenceMapBuildOptions, 'repositoryId'> = {},
  ): Promise<RepositoryEvidenceMap[]> {
    const repositories = await this.loadRepositories(options);
    const derivedRepositories = await this.attachDerivedAssets(repositories);
    return derivedRepositories.map((repository) =>
      buildRepositoryEvidenceMap({ repository }),
    );
  }

  async runReport(options: EvidenceMapBuildOptions = {}): Promise<EvidenceMapReport> {
    const repositoryIds = options.repositoryId
      ? [options.repositoryId]
      : options.repositoryIds?.filter(Boolean) ?? [];
    const items = options.repositoryId
      ? [await this.buildForRepositoryId(options.repositoryId)]
      : await this.buildBatch({
          repositoryIds,
          limit: options.limit,
        });

    return buildEvidenceMapReport({
      items,
      repositoryIds:
        repositoryIds.length > 0 ? repositoryIds : items.map((item) => item.repoId),
      limit: options.repositoryId ? 1 : options.limit ?? null,
    });
  }

  private async loadRepositories(options: {
    repositoryIds?: string[];
    limit?: number;
  }): Promise<EvidenceMapRepositoryRecord[]> {
    if (options.repositoryIds?.length) {
      const repositories = await this.prisma.repository.findMany({
        where: {
          id: {
            in: options.repositoryIds,
          },
        },
        select: this.repositorySelect(),
      });
      const order = new Map(options.repositoryIds.map((id, index) => [id, index]));
      return repositories.sort(
        (left, right) =>
          (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }

    return this.prisma.repository.findMany({
      take: options.limit && options.limit > 0 ? options.limit : 50,
      orderBy: {
        updatedAt: 'desc',
      },
      select: this.repositorySelect(),
    });
  }

  private async attachDerivedAssets(
    repositories: EvidenceMapRepositoryRecord[],
  ): Promise<Array<Record<string, unknown>>> {
    const serialized = repositories.map((item) => this.serialize(item));
    const derived =
      await this.repositoryDecisionService.attachDerivedAssets(serialized);
    return derived as Array<Record<string, unknown>>;
  }

  private repositorySelect() {
    return {
      id: true,
      fullName: true,
      name: true,
      ownerLogin: true,
      htmlUrl: true,
      description: true,
      homepage: true,
      language: true,
      license: true,
      topics: true,
      stars: true,
      forks: true,
      watchers: true,
      openIssues: true,
      archived: true,
      disabled: true,
      updatedAt: true,
      updatedAtGithub: true,
      pushedAtGithub: true,
      lastCommitAt: true,
      commitCount30d: true,
      contributorsCount: true,
      issueActivityScore: true,
      growth7d: true,
      activityScore: true,
      completenessScore: true,
      completenessLevel: true,
      productionReady: true,
      runability: true,
      ideaFitScore: true,
      opportunityLevel: true,
      finalScore: true,
      decision: true,
      analysisProvider: true,
      analysisModel: true,
      analysisConfidence: true,
      isFavorited: true,
      content: {
        select: {
          readmeText: true,
          fetchedAt: true,
        },
      },
      analysis: {
        select: {
          ideaSnapshotJson: true,
          insightJson: true,
          claudeReviewJson: true,
          claudeReviewStatus: true,
          claudeReviewReviewedAt: true,
          manualVerdict: true,
          manualAction: true,
          manualNote: true,
          manualUpdatedAt: true,
          completenessJson: true,
          ideaFitJson: true,
          extractedIdeaJson: true,
          negativeFlags: true,
          tags: true,
          provider: true,
          modelName: true,
          promptVersion: true,
          confidence: true,
          fallbackUsed: true,
          analyzedAt: true,
        },
      },
      favorite: {
        select: {
          priority: true,
        },
      },
      cachedRanking: {
        select: {
          moneyScore: true,
          moneyPriority: true,
          updatedAt: true,
        },
      },
      snapshots: {
        take: 1,
        orderBy: {
          snapshotAt: 'desc' as const,
        },
        select: {
          snapshotAt: true,
        },
      },
    } satisfies Prisma.RepositorySelect;
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
}
