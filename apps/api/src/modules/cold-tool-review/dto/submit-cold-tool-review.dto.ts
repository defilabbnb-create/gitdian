import {
  ColdToolReviewDecision,
  ColdToolReviewRound,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SubmitColdToolReviewDto {
  @IsString()
  taskId!: string;

  @IsString()
  reviewer!: string;

  @IsEnum(ColdToolReviewRound)
  round!: ColdToolReviewRound;

  @IsEnum(ColdToolReviewDecision)
  decision!: ColdToolReviewDecision;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  reasonTags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  disagreementTags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  isDisputed?: boolean;

  @IsOptional()
  @IsBoolean()
  overrideExisting?: boolean;
}
