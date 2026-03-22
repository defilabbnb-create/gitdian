import { Body, Controller, Post } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';
import { FetchRepositoriesDto } from './dto/fetch-repositories.dto';
import { GitHubService } from './github.service';

@Controller('github')
export class GitHubController {
  constructor(
    private readonly githubService: GitHubService,
    private readonly queueService: QueueService,
  ) {}

  @Post('fetch-repositories')
  async fetchRepositories(@Body() fetchRepositoriesDto: FetchRepositoriesDto) {
    const data = await this.githubService.fetchRepositories(fetchRepositoriesDto);

    return {
      success: true,
      data,
      message: 'Fetch completed.',
    };
  }

  @Post('fetch-repositories/async')
  async fetchRepositoriesAsync(@Body() fetchRepositoriesDto: FetchRepositoriesDto) {
    const data = await this.queueService.enqueueGitHubFetch(fetchRepositoriesDto);

    return {
      success: true,
      data,
      message: 'Fetch task created.',
    };
  }
}
