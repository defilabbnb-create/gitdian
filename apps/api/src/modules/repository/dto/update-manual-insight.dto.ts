import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ManualInsightVerdict {
  GOOD = 'GOOD',
  OK = 'OK',
  BAD = 'BAD',
}

export enum ManualInsightAction {
  BUILD = 'BUILD',
  CLONE = 'CLONE',
  IGNORE = 'IGNORE',
}

function trimOptionalString({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export class UpdateManualInsightDto {
  @IsOptional()
  @Transform(trimOptionalString)
  @IsEnum(ManualInsightVerdict)
  verdict?: ManualInsightVerdict;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsEnum(ManualInsightAction)
  action?: ManualInsightAction;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MaxLength(1000)
  note?: string;
}
