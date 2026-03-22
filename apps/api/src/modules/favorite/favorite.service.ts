import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FavoritePriority,
  Prisma,
  RepositoryOpportunityLevel,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import {
  FavoriteSortBy,
  FavoriteSortOrder,
  QueryFavoritesDto,
} from './dto/query-favorites.dto';
import { UpdateFavoriteDto } from './dto/update-favorite.dto';

type FavoriteWithRepository = Prisma.FavoriteGetPayload<{
  include: {
    repository: {
      select: {
        id: true;
        name: true;
        fullName: true;
        description: true;
        stars: true;
        finalScore: true;
        opportunityLevel: true;
        language: true;
        isFavorited: true;
      };
    };
  };
}>;

@Injectable()
export class FavoriteService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createFavoriteDto: CreateFavoriteDto) {
    const repository = await this.prisma.repository.findUnique({
      where: { id: createFavoriteDto.repositoryId },
      select: { id: true },
    });

    if (!repository) {
      throw new NotFoundException(
        `Repository with id "${createFavoriteDto.repositoryId}" was not found.`,
      );
    }

    const existingFavorite = await this.prisma.favorite.findUnique({
      where: { repositoryId: createFavoriteDto.repositoryId },
      select: { id: true },
    });

    if (existingFavorite) {
      throw new ConflictException(
        `Repository "${createFavoriteDto.repositoryId}" is already favorited.`,
      );
    }

    const favorite = await this.prisma.$transaction(async (tx) => {
      const createdFavorite = await tx.favorite.create({
        data: {
          repositoryId: createFavoriteDto.repositoryId,
          note: createFavoriteDto.note,
          priority: createFavoriteDto.priority ?? FavoritePriority.MEDIUM,
        },
        include: {
          repository: {
            select: this.repositorySummarySelect,
          },
        },
      });

      await tx.repository.update({
        where: { id: createFavoriteDto.repositoryId },
        data: {
          isFavorited: true,
        },
      });

      return createdFavorite;
    });

    return this.serialize<FavoriteWithRepository>(favorite);
  }

  async update(repositoryId: string, updateFavoriteDto: UpdateFavoriteDto) {
    await this.ensureFavoriteExists(repositoryId);

    const favorite = await this.prisma.favorite.update({
      where: { repositoryId },
      data: {
        note: updateFavoriteDto.note,
        priority: updateFavoriteDto.priority,
      },
      include: {
        repository: {
          select: this.repositorySummarySelect,
        },
      },
    });

    return this.serialize<FavoriteWithRepository>(favorite);
  }

  async remove(repositoryId: string) {
    await this.ensureFavoriteExists(repositoryId);

    const deletedFavorite = await this.prisma.$transaction(async (tx) => {
      const favorite = await tx.favorite.delete({
        where: { repositoryId },
        include: {
          repository: {
            select: this.repositorySummarySelect,
          },
        },
      });

      await tx.repository.update({
        where: { id: repositoryId },
        data: {
          isFavorited: false,
        },
      });

      return favorite;
    });

    return this.serialize<FavoriteWithRepository>(deletedFavorite);
  }

  async findAll(query: QueryFavoritesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query.sortBy, query.order);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.favorite.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          repository: {
            select: this.repositorySummarySelect,
          },
        },
      }),
      this.prisma.favorite.count({ where }),
    ]);

    return {
      items: this.serialize<FavoriteWithRepository[]>(items),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async findOne(repositoryId: string) {
    const favorite = await this.prisma.favorite.findUnique({
      where: { repositoryId },
      include: {
        repository: {
          select: this.repositorySummarySelect,
        },
      },
    });

    if (!favorite) {
      throw new NotFoundException(
        `Favorite for repository "${repositoryId}" was not found.`,
      );
    }

    return this.serialize<FavoriteWithRepository>(favorite);
  }

  private get repositorySummarySelect() {
    return {
      id: true,
      name: true,
      fullName: true,
      description: true,
      stars: true,
      finalScore: true,
      opportunityLevel: true,
      language: true,
      isFavorited: true,
    } satisfies Prisma.RepositorySelect;
  }

  private async ensureFavoriteExists(repositoryId: string) {
    const favorite = await this.prisma.favorite.findUnique({
      where: { repositoryId },
      select: { id: true },
    });

    if (!favorite) {
      throw new NotFoundException(
        `Favorite for repository "${repositoryId}" was not found.`,
      );
    }
  }

  private buildWhere(query: QueryFavoritesDto): Prisma.FavoriteWhereInput {
    const where: Prisma.FavoriteWhereInput = {};

    if (query.keyword) {
      where.OR = [
        {
          note: {
            contains: query.keyword,
            mode: 'insensitive',
          },
        },
        {
          repository: {
            name: {
              contains: query.keyword,
              mode: 'insensitive',
            },
          },
        },
        {
          repository: {
            fullName: {
              contains: query.keyword,
              mode: 'insensitive',
            },
          },
        },
        {
          repository: {
            description: {
              contains: query.keyword,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.language || query.opportunityLevel || typeof query.minFinalScore === 'number') {
      where.repository = {};

      if (query.language) {
        where.repository.language = query.language;
      }

      if (query.opportunityLevel) {
        where.repository.opportunityLevel =
          query.opportunityLevel as RepositoryOpportunityLevel;
      }

      if (typeof query.minFinalScore === 'number') {
        where.repository.finalScore = {
          gte: query.minFinalScore,
        };
      }
    }

    return where;
  }

  private buildOrderBy(
    sortBy: FavoriteSortBy = FavoriteSortBy.CREATED_AT,
    order: FavoriteSortOrder = FavoriteSortOrder.DESC,
  ): Prisma.FavoriteOrderByWithRelationInput {
    switch (sortBy) {
      case FavoriteSortBy.UPDATED_AT:
        return { updatedAt: order };
      case FavoriteSortBy.FINAL_SCORE:
        return {
          repository: {
            finalScore: order,
          },
        };
      case FavoriteSortBy.STARS:
        return {
          repository: {
            stars: order,
          },
        };
      case FavoriteSortBy.CREATED_AT:
      default:
        return { createdAt: order };
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
