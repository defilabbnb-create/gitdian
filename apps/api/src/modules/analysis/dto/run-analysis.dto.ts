import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

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
}
