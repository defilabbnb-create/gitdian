import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class BatchFastFilterDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  repositoryIds?: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyUnscreened?: boolean;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(200)
  limit?: number;
}
