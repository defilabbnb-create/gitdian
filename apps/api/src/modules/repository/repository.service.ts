import {
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
  QueryRepositoriesDto,
  RepositorySortBy,
  SortOrder,
} from './dto/query-repositories.dto';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { UpdateRepositoryDto } from './dto/update-repository.dto';
import { UpdateRepositoryScoresDto } from './dto/update-repository-scores.dto';
import { UpdateRepositoryFavoriteDto } from './dto/update-repository-favorite.dto';

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
    content: true;
    analysis: true;
    favorite: true;
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
  constructor(private readonly prisma: PrismaService) {}

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

  async create(createRepositoryDto: CreateRepositoryDto) {
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

      return this.serialize(repository);
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

      return this.serialize(repository);
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

    return this.serialize<RepositoryDetail>(repository);
  }

  async findAll(query: QueryRepositoriesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = this.buildRepositoryWhere(query);
    const orderBy = this.buildOrderBy(query.sortBy, query.order);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.repository.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          content: true,
          analysis: true,
          favorite: true,
        },
      }),
      this.prisma.repository.count({ where }),
    ]);

    return {
      items: this.serialize<RepositoryListItem[]>(items),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
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
      analysisRows,
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
      this.prisma.repositoryAnalysis.findMany({
        select: {
          completenessJson: true,
          ideaFitJson: true,
          extractedIdeaJson: true,
        },
      }),
    ]);

    const completenessFromAnalysis = analysisRows.filter(
      (row) => row.completenessJson !== null,
    ).length;
    const ideaFitFromAnalysis = analysisRows.filter(
      (row) => row.ideaFitJson !== null,
    ).length;
    const extractedIdeaRepositories = analysisRows.filter(
      (row) => row.extractedIdeaJson !== null,
    ).length;

    return {
      totalRepositories,
      favoritedRepositories,
      highOpportunityRepositories,
      completenessAnalyzedRepositories: Math.max(
        completenessAnalyzedRepositories,
        completenessFromAnalysis,
      ),
      ideaFitAnalyzedRepositories: Math.max(
        ideaFitAnalyzedRepositories,
        ideaFitFromAnalysis,
      ),
      extractedIdeaRepositories,
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

    return this.serialize(repository);
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

    return this.serialize(repository);
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

  private buildRepositoryWhere(query: QueryRepositoriesDto): Prisma.RepositoryWhereInput {
    const where: Prisma.RepositoryWhereInput = {};
    const andConditions: Prisma.RepositoryWhereInput[] = [];
    const isFavorited = this.toOptionalBoolean(query.isFavorited);
    const roughPass = this.toOptionalBoolean(query.roughPass);
    const hasCompletenessAnalysis = this.toOptionalBoolean(
      query.hasCompletenessAnalysis,
    );
    const hasIdeaFitAnalysis = this.toOptionalBoolean(query.hasIdeaFitAnalysis);
    const hasExtractedIdea = this.toOptionalBoolean(query.hasExtractedIdea);

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
      case RepositorySortBy.CREATED_AT:
        return { createdAt: sortOrder };
      case RepositorySortBy.CREATED_AT_GITHUB:
        return { createdAtGithub: sortOrder };
      case RepositorySortBy.LATEST:
      default:
        return { updatedAt: sortOrder };
    }
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
