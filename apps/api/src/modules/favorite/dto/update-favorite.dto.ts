import { FavoritePriority } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateFavoriteDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(FavoritePriority)
  priority?: FavoritePriority;
}
