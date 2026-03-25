import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class RunAnalysisDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runFastFilter: boolean = true;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runCompleteness: boolean = true;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runIdeaFit: boolean = true;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runIdeaExtract: boolean = true;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  forceRerun: boolean = false;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userSuccessPatterns?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userFailurePatterns?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredCategories?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidedCategories?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recentValidatedWins?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recentDroppedReasons?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  userPreferencePriorityBoost?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userPreferencePriorityReasons?: string[];
}
