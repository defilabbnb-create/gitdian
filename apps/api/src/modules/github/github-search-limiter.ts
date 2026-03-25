import { Injectable } from '@nestjs/common';
import { GitHubSearchConcurrencyService } from './github-search-concurrency.service';

@Injectable()
export class GitHubSearchLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(
    private readonly searchConcurrencyService: GitHubSearchConcurrencyService,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await task();
    } finally {
      this.release();
    }
  }

  getDiagnostics() {
    const concurrency = this.searchConcurrencyService.getDiagnostics();

    return {
      activeSearchRequests: this.active,
      queuedSearchRequests: this.queue.length,
      ...concurrency,
    };
  }

  private acquire() {
    if (this.active < this.searchConcurrencyService.getCurrentConcurrency()) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release() {
    this.active = Math.max(0, this.active - 1);

    while (this.queue.length > 0) {
      if (this.active >= this.searchConcurrencyService.getCurrentConcurrency()) {
        break;
      }

      const next = this.queue.shift();

      if (!next) {
        break;
      }

      next();
    }
  }
}
