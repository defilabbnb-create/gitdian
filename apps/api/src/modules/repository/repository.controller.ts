import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { QueryRepositoriesDto } from './dto/query-repositories.dto';
import { UpdateRepositoryFavoriteDto } from './dto/update-repository-favorite.dto';
import { UpdateRepositoryScoresDto } from './dto/update-repository-scores.dto';
import { UpdateRepositoryDto } from './dto/update-repository.dto';
import { RepositoryService } from './repository.service';

@Controller('repositories')
export class RepositoryController {
  constructor(private readonly repositoryService: RepositoryService) {}

  @Get('summary')
  async getSummary() {
    const data = await this.repositoryService.getSummary();

    return {
      success: true,
      data,
      message: 'Repository summary fetched successfully.',
    };
  }

  @Post()
  async create(@Body() createRepositoryDto: CreateRepositoryDto) {
    const data = await this.repositoryService.create(createRepositoryDto);

    return {
      success: true,
      data,
      message: 'Repository created successfully.',
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateRepositoryDto: UpdateRepositoryDto,
  ) {
    const data = await this.repositoryService.update(id, updateRepositoryDto);

    return {
      success: true,
      data,
      message: 'Repository updated successfully.',
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.repositoryService.findOne(id);

    return {
      success: true,
      data,
      message: 'Repository detail fetched successfully.',
    };
  }

  @Get()
  async findAll(@Query() query: QueryRepositoriesDto) {
    const data = await this.repositoryService.findAll(query);

    return {
      success: true,
      data,
      message: 'Repository list fetched successfully.',
    };
  }

  @Patch(':id/scores')
  async updateScores(
    @Param('id') id: string,
    @Body() updateRepositoryScoresDto: UpdateRepositoryScoresDto,
  ) {
    const data = await this.repositoryService.updateScores(
      id,
      updateRepositoryScoresDto,
    );

    return {
      success: true,
      data,
      message: 'Repository scores updated successfully.',
    };
  }

  @Patch(':id/favorite')
  async updateFavorite(
    @Param('id') id: string,
    @Body() updateRepositoryFavoriteDto: UpdateRepositoryFavoriteDto,
  ) {
    const data = await this.repositoryService.updateFavorite(
      id,
      updateRepositoryFavoriteDto,
    );

    return {
      success: true,
      data,
      message: 'Repository favorite status updated successfully.',
    };
  }
}
