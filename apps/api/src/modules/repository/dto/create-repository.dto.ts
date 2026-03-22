import {
  RepositoryCompletenessLevel,
  RepositoryOpportunityLevel,
  RepositoryRoughLevel,
  RepositoryRunabilityLevel,
  RepositorySourceType,
  RepositoryStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class CreateRepositoryContentDto {
  @IsOptional()
  @IsString()
  readmeText?: string;

  @IsOptional()
  @IsObject()
  fileTree?: Record<string, unknown> | unknown[];

  @IsOptional()
  @IsObject()
  rootFiles?: Record<string, unknown> | unknown[];

  @IsOptional()
  @IsBoolean()
  hasDockerfile?: boolean;

  @IsOptional()
  @IsBoolean()
  hasCompose?: boolean;

  @IsOptional()
  @IsBoolean()
  hasCi?: boolean;

  @IsOptional()
  @IsBoolean()
  hasTests?: boolean;

  @IsOptional()
  @IsBoolean()
  hasDocs?: boolean;

  @IsOptional()
  @IsBoolean()
  hasEnvExample?: boolean;

  @IsOptional()
  @IsObject()
  packageManifests?: Record<string, unknown> | unknown[];

  @IsOptional()
  @IsDateString()
  fetchedAt?: string;
}

export class CreateRepositoryDto {
  @Transform(({ value }) => String(value))
  @IsNotEmpty()
  @IsString()
  githubRepoId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  ownerLogin!: string;

  @IsUrl()
  htmlUrl!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  homepage?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  license?: string;

  @IsOptional()
  @IsString()
  defaultBranch?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stars?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  forks?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  watchers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  openIssues?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topics?: string[];

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsBoolean()
  hasWiki?: boolean;

  @IsOptional()
  @IsBoolean()
  hasIssues?: boolean;

  @IsOptional()
  @IsDateString()
  createdAtGithub?: string;

  @IsOptional()
  @IsDateString()
  updatedAtGithub?: string;

  @IsOptional()
  @IsDateString()
  pushedAtGithub?: string;

  @IsOptional()
  @IsDateString()
  lastCommitAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  commitCount30d?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  contributorsCount?: number;

  @IsOptional()
  @Type(() => Number)
  issueActivityScore?: number;

  @IsOptional()
  @Type(() => Number)
  growth24h?: number;

  @IsOptional()
  @Type(() => Number)
  growth7d?: number;

  @IsOptional()
  @Type(() => Number)
  activityScore?: number;

  @IsOptional()
  @IsBoolean()
  roughPass?: boolean;

  @IsOptional()
  @IsEnum(RepositoryRoughLevel)
  roughLevel?: RepositoryRoughLevel;

  @IsOptional()
  @IsString()
  roughReason?: string;

  @IsOptional()
  @Type(() => Number)
  toolLikeScore?: number;

  @IsOptional()
  @Type(() => Number)
  completenessScore?: number;

  @IsOptional()
  @IsEnum(RepositoryCompletenessLevel)
  completenessLevel?: RepositoryCompletenessLevel;

  @IsOptional()
  @IsBoolean()
  productionReady?: boolean;

  @IsOptional()
  @IsEnum(RepositoryRunabilityLevel)
  runability?: RepositoryRunabilityLevel;

  @IsOptional()
  @Type(() => Number)
  projectReferenceScore?: number;

  @IsOptional()
  @Type(() => Number)
  ideaFitScore?: number;

  @IsOptional()
  @IsEnum(RepositoryOpportunityLevel)
  opportunityLevel?: RepositoryOpportunityLevel;

  @IsOptional()
  @Type(() => Number)
  finalScore?: number;

  @IsOptional()
  @IsString()
  categoryL1?: string;

  @IsOptional()
  @IsString()
  categoryL2?: string;

  @IsOptional()
  @IsEnum(RepositoryStatus)
  status?: RepositoryStatus;

  @IsOptional()
  @IsBoolean()
  isFavorited?: boolean;

  @IsOptional()
  @IsEnum(RepositorySourceType)
  sourceType?: RepositorySourceType;

  @IsOptional()
  @IsString()
  analysisProvider?: string;

  @IsOptional()
  @IsString()
  analysisModel?: string;

  @IsOptional()
  @Type(() => Number)
  analysisConfidence?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateRepositoryContentDto)
  content?: CreateRepositoryContentDto;
}

export { CreateRepositoryContentDto };
