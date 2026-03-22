import { FavoritePriority, RepositoryOpportunityLevel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum FavoriteSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  FINAL_SCORE = 'finalScore',
  STARS = 'stars',
}

export enum FavoriteSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class QueryFavoritesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(FavoritePriority)
  priority?: FavoritePriority;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(RepositoryOpportunityLevel)
  opportunityLevel?: RepositoryOpportunityLevel;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minFinalScore?: number;

  @IsOptional()
  @IsEnum(FavoriteSortBy)
  sortBy: FavoriteSortBy = FavoriteSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(FavoriteSortOrder)
  order: FavoriteSortOrder = FavoriteSortOrder.DESC;
}
