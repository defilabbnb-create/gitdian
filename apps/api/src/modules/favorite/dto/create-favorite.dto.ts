import { FavoritePriority } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFavoriteDto {
  @IsString()
  @MinLength(1)
  repositoryId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(FavoritePriority)
  priority?: FavoritePriority;
}
