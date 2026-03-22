import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { RunAnalysisDto } from './run-analysis.dto';

export class BatchRunAnalysisDto extends RunAnalysisDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  repositoryIds?: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyIfMissing: boolean = true;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit: number = 10;
}
