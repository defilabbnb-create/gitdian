import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { IDEA_MAIN_CATEGORIES } from '../../analysis/idea-snapshot-taxonomy';

export class BackfillCreatedRepositoriesDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days: number = 365;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  perWindowLimit: number = 50;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  starMin?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runFastFilter: boolean = true;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runIdeaSnapshot: boolean = true;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runDeepAnalysis: boolean = true;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  deepAnalysisOnlyIfPromising: boolean = true;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(IDEA_MAIN_CATEGORIES as unknown as string[], { each: true })
  targetCategories: string[] = ['tools', 'ai', 'data', 'infra'];
}
