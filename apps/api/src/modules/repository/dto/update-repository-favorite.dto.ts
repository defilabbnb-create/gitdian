import { IsBoolean } from 'class-validator';

export class UpdateRepositoryFavoriteDto {
  @IsBoolean()
  isFavorited!: boolean;
}
