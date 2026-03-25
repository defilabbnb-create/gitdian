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
  buildIdeaSnapshotPrompt,
} from './prompts/idea-snapshot.prompt';
import { RepositoryInsightService } from './repository-insight.service';
import { AnalysisTrainingKnowledgeService } from './analysis-training-knowledge.service';

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
