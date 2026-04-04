import { RepositoryOpportunityLevel, RepositoryStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum RepositorySortBy {
  LATEST = 'latest',
  STARS = 'stars',
  FINAL_SCORE = 'finalScore',
  IDEA_FIT_SCORE = 'ideaFitScore',
  MONEY_PRIORITY = 'moneyPriority',
  INSIGHT_PRIORITY = 'insightPriority',
  CREATED_AT = 'createdAt',
  CREATED_AT_GITHUB = 'createdAtGithub',
}

export enum RepositoryRecommendedAction {
  BUILD = 'BUILD',
  CLONE = 'CLONE',
  IGNORE = 'IGNORE',
}

export enum RepositoryFinalVerdict {
  GOOD = 'GOOD',
  OK = 'OK',
  BAD = 'BAD',
}

export enum RepositoryDecisionSource {
  MANUAL = 'manual',
  CLAUDE = 'claude',
  LOCAL = 'local',
  FALLBACK = 'fallback',
}

export enum RepositoryFounderPriority {
  P0 = 'P0',
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export enum RepositoryDeepAnalysisState {
  COMPLETED = 'completed',
  PENDING = 'pending',
}

function toBoolean(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  return value;
}

function booleanQueryTransform({
  value,
  obj,
  key,
}: {
  value: unknown;
  obj: Record<string, unknown>;
  key: string;
}) {
  return toBoolean(obj?.[key] ?? value);
}

export class QueryRepositoriesDto {
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
  @IsEnum(RepositoryStatus)
  status?: RepositoryStatus;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(RepositoryOpportunityLevel)
  opportunityLevel?: RepositoryOpportunityLevel;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  isFavorited?: boolean;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  roughPass?: boolean;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  hasCompletenessAnalysis?: boolean;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  hasIdeaFitAnalysis?: boolean;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  hasExtractedIdea?: boolean;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  hasPromisingIdeaSnapshot?: boolean;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  hasGoodInsight?: boolean;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  hasManualInsight?: boolean;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  hasColdToolFit?: boolean;

  @IsOptional()
  @IsEnum(RepositoryDeepAnalysisState)
  deepAnalysisState?: RepositoryDeepAnalysisState;

  @IsOptional()
  @IsEnum(RepositoryRecommendedAction)
  recommendedAction?: RepositoryRecommendedAction;

  @IsOptional()
  @IsEnum(RepositoryFinalVerdict)
  finalVerdict?: RepositoryFinalVerdict;

  @IsOptional()
  @IsString()
  finalCategory?: string;

  @IsOptional()
  @IsEnum(RepositoryFounderPriority)
  moneyPriority?: RepositoryFounderPriority;

  @IsOptional()
  @IsEnum(RepositoryDecisionSource)
  decisionSource?: RepositoryDecisionSource;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  hasConflict?: boolean;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  needsRecheck?: boolean;

  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  hasTrainingHints?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStars?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxStars?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minFinalScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  createdAfterDays?: number;

  @IsOptional()
  @IsEnum(RepositorySortBy)
  sortBy: RepositorySortBy = RepositorySortBy.LATEST;

  @IsOptional()
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.DESC;
}
