import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { QueryFavoritesDto } from './dto/query-favorites.dto';
import { UpdateFavoriteDto } from './dto/update-favorite.dto';
import { FavoriteService } from './favorite.service';

@Controller('favorites')
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  @Post()
  async create(@Body() createFavoriteDto: CreateFavoriteDto) {
    const data = await this.favoriteService.create(createFavoriteDto);

    return {
      success: true,
      data,
      message: 'Favorite created successfully.',
    };
  }

  @Patch(':repositoryId')
  async update(
    @Param('repositoryId') repositoryId: string,
    @Body() updateFavoriteDto: UpdateFavoriteDto,
  ) {
    const data = await this.favoriteService.update(repositoryId, updateFavoriteDto);

    return {
      success: true,
      data,
      message: 'Favorite updated successfully.',
    };
  }

  @Delete(':repositoryId')
  async remove(@Param('repositoryId') repositoryId: string) {
    const data = await this.favoriteService.remove(repositoryId);

    return {
      success: true,
      data,
      message: 'Favorite removed successfully.',
    };
  }

  @Get()
  async findAll(@Query() query: QueryFavoritesDto) {
    const data = await this.favoriteService.findAll(query);

    return {
      success: true,
      data,
      message: 'Favorite list fetched successfully.',
    };
  }

  @Get(':repositoryId')
  async findOne(@Param('repositoryId') repositoryId: string) {
    const data = await this.favoriteService.findOne(repositoryId);

    return {
      success: true,
      data,
      message: 'Favorite detail fetched successfully.',
    };
  }
}
