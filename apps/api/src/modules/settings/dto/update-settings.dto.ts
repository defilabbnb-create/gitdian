import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  GitHubFetchMode,
  GitHubSearchOrder,
  GitHubSearchSort,
} from '../../github/dto/fetch-repositories.dto';
import { AiProviderName } from '../../ai/interfaces/ai.types';

class UpdateGitHubSearchSettingsDto {
  @IsOptional()
  @IsEnum(GitHubFetchMode)
  defaultMode?: GitHubFetchMode;

  @IsOptional()
  @IsEnum(GitHubSearchSort)
  defaultSort?: GitHubSearchSort;

  @IsOptional()
  @IsEnum(GitHubSearchOrder)
  defaultOrder?: GitHubSearchOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  defaultPerPage?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  defaultStarMin?: number | null;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  defaultStarMax?: number | null;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  defaultPushedAfterDays?: number | null;
}

class UpdateGitHubFetchSettingsDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runFastFilterByDefault?: boolean;
}

class UpdateGitHubSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGitHubSearchSettingsDto)
  search?: UpdateGitHubSearchSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGitHubFetchSettingsDto)
  fetch?: UpdateGitHubFetchSettingsDto;
}

class UpdateFastFilterBatchSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  defaultLimit?: number;
}

class UpdateFastFilterSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateFastFilterBatchSettingsDto)
  batch?: UpdateFastFilterBatchSettingsDto;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyUnscreenedByDefault?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  staleDaysThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  scoreThresholdA?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  scoreThresholdB?: number;
}

class UpdateAiTaskRoutingSettingsDto {
  @IsOptional()
  @IsIn(['omlx', 'openai'])
  rough_filter?: AiProviderName;

  @IsOptional()
  @IsIn(['omlx', 'openai'])
  completeness?: AiProviderName;

  @IsOptional()
  @IsIn(['omlx', 'openai'])
  idea_fit?: AiProviderName;

  @IsOptional()
  @IsIn(['omlx', 'openai'])
  idea_extract?: AiProviderName;

  @IsOptional()
  @IsIn(['omlx', 'openai'])
  idea_snapshot?: AiProviderName;
}

class UpdateAiModelsSettingsDto {
  @IsOptional()
  @IsString()
  omlx?: string | null;

  @IsOptional()
  @IsString()
  omlxLight?: string | null;

  @IsOptional()
  @IsString()
  omlxDeep?: string | null;

  @IsOptional()
  @IsString()
  openai?: string | null;
}

class UpdateAiSettingsDto {
  @IsOptional()
  @IsIn(['omlx', 'openai'])
  defaultProvider?: AiProviderName;

  @IsOptional()
  @IsIn(['omlx', 'openai'])
  fallbackProvider?: AiProviderName;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enableFallback?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAiTaskRoutingSettingsDto)
  taskRouting?: UpdateAiTaskRoutingSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAiModelsSettingsDto)
  models?: UpdateAiModelsSettingsDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120000)
  timeoutMs?: number;
}

export class UpdateSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGitHubSettingsDto)
  github?: UpdateGitHubSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateFastFilterSettingsDto)
  fastFilter?: UpdateFastFilterSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAiSettingsDto)
  ai?: UpdateAiSettingsDto;
}
