import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RepositoryStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiRouterService } from '../ai/ai.router.service';
import {
  IdeaMainCategory,
  IdeaSubCategory,
  normalizeIdeaMainCategory,
  normalizeIdeaSubCategory,
} from './idea-snapshot-taxonomy';
import { buildIdeaSnapshotPromptInput } from './helpers/idea-snapshot-input.helper';
import {
  buildIdeaSnapshotBatchPrompt,
  buildIdeaSnapshotPrompt,
} from './prompts/idea-snapshot.prompt';
import { RepositoryInsightService } from './repository-insight.service';
import { AnalysisTrainingKnowledgeService } from './analysis-training-knowledge.service';
import { buildColdToolOpenAiOptions } from './helpers/openai-provider-options.helper';
import { AiProviderName } from '../ai/interfaces/ai.types';

type RepositoryIdeaSnapshotTarget = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
  };
}>;

export type IdeaSnapshotNextAction = 'KEEP' | 'SKIP' | 'DEEP_ANALYZE';

export type IdeaSnapshotOutput = {
  oneLinerZh: string;
  isPromising: boolean;
  reason: string;
  category: {
    main: IdeaMainCategory;
    sub: IdeaSubCategory;
  };
  toolLike: boolean;
  nextAction: IdeaSnapshotNextAction;
};

export type BatchIdeaSnapshotOutputItem = {
  repoId: string;
} & IdeaSnapshotOutput;

export type BatchIdeaSnapshotResultItem = {
  repositoryId: string;
  action: 'skipped' | 'analyzed' | 'failed';
  output: IdeaSnapshotOutput | null;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  fallbackUsed: boolean;
  message: string | null;
};

export type AnalyzeRepositoriesBatchResult = {
  requested: number;
  processed: number;
  skippedExisting: number;
  batchCount: number;
  batchSize: number;
  totalLatencyMs: number;
  reposPerSecond: number;
  items: BatchIdeaSnapshotResultItem[];
};

@Injectable()
export class IdeaSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouterService: AiRouterService,
    private readonly repositoryInsightService: RepositoryInsightService,
    private readonly analysisTrainingKnowledgeService: AnalysisTrainingKnowledgeService,
  ) {}

  async analyzeRepository(
    repositoryId: string,
    options: { onlyIfMissing?: boolean } = {},
  ) {
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        content: true,
        analysis: true,
      },
    });

    if (!repository) {
      throw new NotFoundException(`Repository with id "${repositoryId}" was not found.`);
    }

    if (options.onlyIfMissing && repository.analysis?.ideaSnapshotJson) {
      const existing = this.readIdeaSnapshot(repository.analysis.ideaSnapshotJson);

      if (existing) {
        await this.repositoryInsightService.refreshInsight(repository.id);

        return {
          repositoryId: repository.id,
          action: 'skipped' as const,
          ...existing,
        };
      }
    }

    return this.analyzeRepositoryRecord(repository);
  }

  async analyzeRepositoriesBatch(args: {
    repositoryIds: string[];
    batchSize?: number;
    modelOverride?: string;
    onlyIfMissing?: boolean;
    persist?: boolean;
    analysisLane?: string;
  }): Promise<AnalyzeRepositoriesBatchResult> {
    const uniqueRepositoryIds = [...new Set(args.repositoryIds.filter(Boolean))];
    const batchSize = Math.max(1, Math.min(args.batchSize ?? 8, 12));

    if (!uniqueRepositoryIds.length) {
      return {
        requested: 0,
        processed: 0,
        skippedExisting: 0,
        batchCount: 0,
        batchSize,
        totalLatencyMs: 0,
        reposPerSecond: 0,
        items: [],
      };
    }

    const repositories = await this.prisma.repository.findMany({
      where: {
        id: {
          in: uniqueRepositoryIds,
        },
      },
      include: {
        content: true,
        analysis: true,
      },
    });

    const repositoryById = new Map(
      repositories.map((repository) => [repository.id, repository]),
    );
    const orderedRepositories = uniqueRepositoryIds
      .map((repositoryId) => repositoryById.get(repositoryId) ?? null)
      .filter(Boolean) as RepositoryIdeaSnapshotTarget[];

    const items: BatchIdeaSnapshotResultItem[] = [];
    const repositoriesToAnalyze: RepositoryIdeaSnapshotTarget[] = [];

    for (const repository of orderedRepositories) {
      if (args.onlyIfMissing !== false && repository.analysis?.ideaSnapshotJson) {
        const existing = this.readIdeaSnapshot(repository.analysis.ideaSnapshotJson);
        if (existing) {
          items.push({
            repositoryId: repository.id,
            action: 'skipped',
            output: existing,
            provider: null,
            model: null,
            latencyMs: null,
            fallbackUsed: false,
            message: 'Idea snapshot already exists.',
          });
          continue;
        }
      }

      repositoriesToAnalyze.push(repository);
    }

    let totalLatencyMs = 0;
    const repositoryBatches = this.chunkItems(repositoriesToAnalyze, batchSize);

    for (const batch of repositoryBatches) {
      const promptInputs = batch.map((repository) => ({
        repoId: repository.id,
        input: buildIdeaSnapshotPromptInput(repository),
      }));
      const basePrompt = buildIdeaSnapshotBatchPrompt(promptInputs);
      const prompt = await this.analysisTrainingKnowledgeService.enhancePrompt(
        'idea_snapshot',
        basePrompt,
      );
      const aiResult = await this.aiRouterService.generateJson<
        BatchIdeaSnapshotOutputItem[]
      >({
        taskType: 'idea_snapshot',
        prompt: prompt.prompt,
        systemPrompt: prompt.systemPrompt,
        schemaHint: prompt.schemaHint,
        timeoutMs: Math.max(30_000, batch.length * 7_500),
        providerOverride:
          args.analysisLane === 'cold_tool'
            ? this.readColdToolSnapshotProvider()
            : undefined,
        modelOverride:
          args.modelOverride ??
          (args.analysisLane === 'cold_tool'
            ? this.readColdToolSnapshotModel()
            : undefined),
        providerOptions:
          args.analysisLane === 'cold_tool'
            ? {
                openai: buildColdToolOpenAiOptions(),
              }
            : undefined,
      });
      totalLatencyMs += aiResult.latencyMs;

      const normalizedOutputs = this.normalizeBatchIdeaSnapshots(
        aiResult.data,
        batch.map((repository) => repository.id),
      );

      for (const repository of batch) {
        const normalizedOutput = normalizedOutputs.get(repository.id) ?? null;
        if (normalizedOutput && args.persist) {
          await this.persistIdeaSnapshotResult({
            repository,
            output: normalizedOutput,
            provider: aiResult.provider,
            model: aiResult.model,
            confidence: aiResult.confidence,
            rawResponse: aiResult.rawResponse,
            promptVersion: prompt.promptVersion,
            fallbackUsed: aiResult.fallbackUsed,
          });
        }
        items.push({
          repositoryId: repository.id,
          action: normalizedOutput ? 'analyzed' : 'failed',
          output: normalizedOutput,
          provider: aiResult.provider,
          model: aiResult.model,
          latencyMs: aiResult.latencyMs,
          fallbackUsed: aiResult.fallbackUsed,
          message: normalizedOutput
            ? null
            : 'Batch idea snapshot output missing repositoryId.',
        });
      }
    }

    return {
      requested: uniqueRepositoryIds.length,
      processed: repositoriesToAnalyze.length,
      skippedExisting: items.filter((item) => item.action === 'skipped').length,
      batchCount: repositoryBatches.length,
      batchSize,
      totalLatencyMs,
      reposPerSecond:
        totalLatencyMs > 0
          ? Number(
              ((repositoriesToAnalyze.length * 1000) / totalLatencyMs).toFixed(2),
            )
          : 0,
      items,
    };
  }

  private readColdToolSnapshotProvider(): AiProviderName | undefined {
    const normalized = String(
      process.env.COLD_TOOL_SNAPSHOT_PROVIDER ?? '',
    ).trim().toLowerCase();

    if (normalized === 'omlx' || normalized === 'openai') {
      return normalized;
    }

    return undefined;
  }

  private readColdToolSnapshotModel() {
    return (
      process.env.COLD_TOOL_SNAPSHOT_MODEL?.trim() ||
      process.env.COLD_TOOL_OPENAI_LIGHT_MODEL?.trim() ||
      process.env.COLD_TOOL_OPENAI_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      null
    );
  }

  readIdeaSnapshot(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const currentValue = value as Record<string, unknown>;
    const mainCategory = normalizeIdeaMainCategory(currentValue.category && typeof currentValue.category === 'object'
      ? (currentValue.category as Record<string, unknown>).main
      : undefined);
    const subCategory = normalizeIdeaSubCategory(
      mainCategory,
      currentValue.category && typeof currentValue.category === 'object'
        ? (currentValue.category as Record<string, unknown>).sub
        : undefined,
    );

    return {
      oneLinerZh: this.cleanText(currentValue.oneLinerZh, 120),
      isPromising: Boolean(currentValue.isPromising),
      reason: this.cleanText(currentValue.reason, 220),
      category: {
        main: mainCategory,
        sub: subCategory,
      },
      toolLike: Boolean(currentValue.toolLike),
      nextAction: this.normalizeNextAction(currentValue.nextAction),
    } satisfies IdeaSnapshotOutput;
  }

  private async analyzeRepositoryRecord(repository: RepositoryIdeaSnapshotTarget) {
    const promptInput = buildIdeaSnapshotPromptInput(repository);
    const basePrompt = buildIdeaSnapshotPrompt(promptInput);
    const prompt = await this.analysisTrainingKnowledgeService.enhancePrompt(
      'idea_snapshot',
      basePrompt,
    );
    const aiResult = await this.aiRouterService.generateJson<IdeaSnapshotOutput>({
      taskType: 'idea_snapshot',
      prompt: prompt.prompt,
      systemPrompt: prompt.systemPrompt,
      schemaHint: prompt.schemaHint,
      timeoutMs: 20000,
    });

    const normalized = await this.analysisTrainingKnowledgeService.buildSnapshotEnhancement({
      repository,
      output: this.normalizeIdeaSnapshot(aiResult.data),
    });
    const analysisExists = Boolean(repository.analysis);

    await this.prisma.repository.update({
      where: { id: repository.id },
      data: {
        categoryL1: normalized.category.main,
        categoryL2: normalized.category.sub,
        status:
          repository.status === RepositoryStatus.DISCOVERED
            ? RepositoryStatus.SNAPSHOTTED
            : repository.status,
      },
    });

    await this.prisma.repositoryAnalysis.upsert({
      where: {
        repositoryId: repository.id,
      },
      update: {
        ideaSnapshotJson: normalized as unknown as Prisma.InputJsonValue,
        provider: aiResult.provider,
        modelName: aiResult.model,
        confidence: aiResult.confidence,
        rawResponse: aiResult.rawResponse as Prisma.InputJsonValue,
        promptVersion: prompt.promptVersion,
        analyzedAt: new Date(),
        fallbackUsed: aiResult.fallbackUsed,
      },
      create: {
        repositoryId: repository.id,
        ideaSnapshotJson: normalized as unknown as Prisma.InputJsonValue,
        provider: aiResult.provider,
        modelName: aiResult.model,
        confidence: aiResult.confidence,
        rawResponse: aiResult.rawResponse as Prisma.InputJsonValue,
        promptVersion: prompt.promptVersion,
        analyzedAt: new Date(),
        fallbackUsed: aiResult.fallbackUsed,
      },
    });

    await this.repositoryInsightService.refreshInsight(repository.id);

    return {
      repositoryId: repository.id,
      action: analysisExists ? ('updated' as const) : ('created' as const),
      ...normalized,
      provider: aiResult.provider,
      model: aiResult.model,
      latencyMs: aiResult.latencyMs,
      fallbackUsed: aiResult.fallbackUsed,
      confidence: aiResult.confidence,
    };
  }

  private normalizeIdeaSnapshot(value: IdeaSnapshotOutput): IdeaSnapshotOutput {
    const mainCategory = normalizeIdeaMainCategory(value?.category?.main);

    return {
      oneLinerZh: this.cleanText(value?.oneLinerZh, 120),
      isPromising: Boolean(value?.isPromising),
      reason: this.cleanText(value?.reason, 220),
      category: {
        main: mainCategory,
        sub: normalizeIdeaSubCategory(mainCategory, value?.category?.sub),
      },
      toolLike: Boolean(value?.toolLike),
      nextAction: this.normalizeNextAction(value?.nextAction),
    };
  }

  private normalizeBatchIdeaSnapshots(
    value: BatchIdeaSnapshotOutputItem[],
    repositoryIds: string[],
  ) {
    const items = Array.isArray(value) ? value : [];
    const normalized = new Map<string, IdeaSnapshotOutput>();

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const repositoryId = String(item.repoId ?? '').trim();
      if (!repositoryId || !repositoryIds.includes(repositoryId)) {
        continue;
      }

      normalized.set(
        repositoryId,
        this.normalizeIdeaSnapshot(item),
      );
    }

    return normalized;
  }

  private async persistIdeaSnapshotResult(args: {
    repository: RepositoryIdeaSnapshotTarget;
    output: IdeaSnapshotOutput;
    provider: string;
    model: string | null;
    confidence: number | null;
    rawResponse: unknown;
    promptVersion: string;
    fallbackUsed: boolean;
  }) {
    const normalized = await this.analysisTrainingKnowledgeService.buildSnapshotEnhancement({
      repository: args.repository,
      output: args.output,
    });

    await this.prisma.repository.update({
      where: { id: args.repository.id },
      data: {
        categoryL1: normalized.category.main,
        categoryL2: normalized.category.sub,
        status:
          args.repository.status === RepositoryStatus.DISCOVERED
            ? RepositoryStatus.SNAPSHOTTED
            : args.repository.status,
      },
    });

    await this.prisma.repositoryAnalysis.upsert({
      where: {
        repositoryId: args.repository.id,
      },
      update: {
        ideaSnapshotJson: normalized as unknown as Prisma.InputJsonValue,
        provider: args.provider,
        modelName: args.model,
        confidence: args.confidence,
        rawResponse: args.rawResponse as Prisma.InputJsonValue,
        promptVersion: args.promptVersion,
        analyzedAt: new Date(),
        fallbackUsed: args.fallbackUsed,
      },
      create: {
        repositoryId: args.repository.id,
        ideaSnapshotJson: normalized as unknown as Prisma.InputJsonValue,
        provider: args.provider,
        modelName: args.model,
        confidence: args.confidence,
        rawResponse: args.rawResponse as Prisma.InputJsonValue,
        promptVersion: args.promptVersion,
        analyzedAt: new Date(),
        fallbackUsed: args.fallbackUsed,
      },
    });

    await this.repositoryInsightService.refreshInsight(args.repository.id);
  }

  private chunkItems<T>(items: T[], chunkSize: number) {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }

    return chunks;
  }

  private normalizeNextAction(value: unknown): IdeaSnapshotNextAction {
    const normalized = String(value ?? '').trim().toUpperCase();

    if (normalized === 'DEEP_ANALYZE') {
      return 'DEEP_ANALYZE';
    }

    if (normalized === 'SKIP') {
      return 'SKIP';
    }

    return 'KEEP';
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();

    if (!normalized) {
      return '';
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return normalized.slice(0, maxLength);
  }
}
