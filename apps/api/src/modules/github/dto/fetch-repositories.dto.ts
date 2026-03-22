import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum GitHubSearchSort {
  UPDATED = 'updated',
  STARS = 'stars',
}

export enum GitHubSearchOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export enum GitHubFetchMode {
  UPDATED = 'updated',
  CREATED = 'created',
}

export class FetchRepositoriesDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsEnum(GitHubFetchMode)
  mode?: GitHubFetchMode;

  @IsOptional()
  @IsEnum(GitHubSearchSort)
  sort?: GitHubSearchSort;

  @IsOptional()
  @IsEnum(GitHubSearchOrder)
  order?: GitHubSearchOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  perPage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  starMin?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  starMax?: number;

  @IsOptional()
  @IsDateString()
  pushedAfter?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runFastFilter?: boolean;
}
