import { RepositoryDecision, RepositoryOpportunityLevel } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateRepositoryScoresDto {
  @IsOptional()
  @Type(() => Number)
  completenessScore?: number;

  @IsOptional()
  @Type(() => Number)
  ideaFitScore?: number;

  @IsOptional()
  @Type(() => Number)
  finalScore?: number;

  @IsOptional()
  @Type(() => Number)
  projectReferenceScore?: number;

  @IsOptional()
  @IsEnum(RepositoryOpportunityLevel)
  opportunityLevel?: RepositoryOpportunityLevel;

  @IsOptional()
  @IsEnum(RepositoryDecision)
  decision?: RepositoryDecision;

  @IsOptional()
  @IsString()
  analysisProvider?: string;

  @IsOptional()
  @IsString()
  analysisModel?: string;

  @IsOptional()
  @Type(() => Number)
  analysisConfidence?: number;
}
