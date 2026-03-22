import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Repository, RepositoryContent } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiRouterService } from '../ai/ai.router.service';
import { JobLogService } from '../job-log/job-log.service';
import { SettingsService } from '../settings/settings.service';
import { BatchFastFilterDto } from './dto/batch-fast-filter.dto';
import { evaluateFastFilterByRules } from './rules/fast-filter.rules';

type RepositoryWithContent = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
  };
}>;

type FastFilterResultItem = {
  repositoryId: string;
  roughPass: boolean;
  roughLevel: 'A' | 'B' | 'C';
  toolLikeScore: number;
  message: string;
};

@Injectable()
export class FastFilterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouterService: AiRouterService,
    private readonly jobLogService: JobLogService,
    private readonly settingsService: SettingsService,
  ) {}

  async evaluateRepository(repositoryId: string) {
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        content: true,
      },
    });

    if (!repository) {
      throw new NotFoundException(`Repository with id "${repositoryId}" was not found.`);
    }

    return this.evaluateRepositoryRecord(repository);
  }

  async evaluateBatch(dto: BatchFastFilterDto) {
    const settings = await this.settingsService.getSettings();
    const effectiveOnlyUnscreened =
      dto.onlyUnscreened ?? settings.fastFilter.onlyUnscreenedByDefault;
    const effectiveLimit = dto.limit ?? settings.fastFilter.batch.defaultLimit;
    const job = await this.jobLogService.startJob({
      jobName: 'fast_filter.batch',
      payload: {
        repositoryIds: dto.repositoryIds?.slice(0, 100) ?? null,
        onlyUnscreened: effectiveOnlyUnscreened,
        limit: effectiveLimit,
      },
    });

    try {
      const data = await this.evaluateBatchDirect(dto);

      await this.jobLogService.completeJob({
        jobId: job.id,
        result: {
          processed: data.processed,
          passed: data.passed,
          failed: data.failed,
          items: data.items.slice(0, 20),
        },
      });
  
      return data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown fast filter batch error.';

      await this.jobLogService.failJob({
        jobId: job.id,
        errorMessage: message,
      });

      throw error;
    }
  }

  async evaluateBatchDirect(dto: BatchFastFilterDto) {
    const settings = await this.settingsService.getSettings();
    const effectiveOnlyUnscreened =
      dto.onlyUnscreened ?? settings.fastFilter.onlyUnscreenedByDefault;
    const effectiveLimit = dto.limit ?? settings.fastFilter.batch.defaultLimit;
    const where = this.buildBatchWhere(dto, effectiveOnlyUnscreened);
    const repositories = await this.prisma.repository.findMany({
      where,
      take: effectiveLimit,
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        content: true,
      },
    });

    let passed = 0;
    let failed = 0;

    const items: FastFilterResultItem[] = [];

    for (const repository of repositories) {
      try {
        const result = await this.evaluateRepositoryRecord(repository);

        if (result.roughPass) {
          passed += 1;
        }

        items.push({
          repositoryId: repository.id,
          roughPass: result.roughPass,
          roughLevel: result.roughLevel,
          toolLikeScore: result.toolLikeScore,
          message: 'Fast filter completed successfully.',
        });
      } catch (error) {
        failed += 1;
        items.push({
          repositoryId: repository.id,
          roughPass: false,
          roughLevel: 'C',
          toolLikeScore: 0,
          message:
            error instanceof Error ? error.message : 'Unknown fast filter error.',
        });
      }
    }

    return {
      processed: repositories.length,
      passed,
      failed,
      items,
    };
  }

  private async evaluateRepositoryRecord(repository: RepositoryWithContent) {
    const result = await this.evaluateByRules(repository, repository.content);

    const updatedRepository = await this.prisma.repository.update({
      where: { id: repository.id },
      data: {
        roughPass: result.roughPass,
        roughLevel: result.roughLevel,
        roughReason: result.roughReason,
        toolLikeScore: result.toolLikeScore,
      },
    });

    return this.serialize({
      repositoryId: updatedRepository.id,
      roughPass: result.roughPass,
      roughLevel: result.roughLevel,
      roughReason: result.roughReason,
      toolLikeScore: result.toolLikeScore,
      reasons: result.reasons,
    });
  }

  private async evaluateByRules(
    repository: Repository,
    content: RepositoryContent | null,
  ) {
    const settings = await this.settingsService.getSettings();

    return evaluateFastFilterByRules({
      repository,
      content,
      now: new Date(),
      config: {
        staleDaysThreshold: settings.fastFilter.staleDaysThreshold,
        scoreThresholdA: settings.fastFilter.scoreThresholdA,
        scoreThresholdB: settings.fastFilter.scoreThresholdB,
      },
    });
  }

  // Reserved extension point for future OMLX / OpenAI fast-filter providers.
  private async evaluateByAi() {
    return this.aiRouterService.generateJson<{
      roughPass: boolean;
      roughLevel: 'A' | 'B' | 'C';
      roughReason: string;
      toolLikeScore: number;
    }>({
      taskType: 'rough_filter',
      systemPrompt:
        'You are a fast-filter scoring assistant. Return JSON only.',
      prompt:
        'This is a placeholder AI fast-filter call used only to verify the architecture wiring. Return JSON: {"roughPass": false, "roughLevel": "C", "roughReason": "AI fast filter is not enabled yet.", "toolLikeScore": 0}',
      schemaHint:
        '{"roughPass": boolean, "roughLevel": "A" | "B" | "C", "roughReason": string, "toolLikeScore": number}',
      timeoutMs: 10000,
    });
  }

  private buildBatchWhere(
    dto: BatchFastFilterDto,
    onlyUnscreened: boolean,
  ): Prisma.RepositoryWhereInput {
    const where: Prisma.RepositoryWhereInput = {};

    if (dto.repositoryIds?.length) {
      where.id = {
        in: dto.repositoryIds,
      };
    }

    if (onlyUnscreened) {
      where.roughLevel = null;
    }

    return where;
  }

  private serialize<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_, currentValue) => {
        if (typeof currentValue === 'bigint') {
          return currentValue.toString();
        }

        if (currentValue instanceof Prisma.Decimal) {
          return currentValue.toNumber();
        }

        return currentValue;
      }),
    ) as T;
  }
}
