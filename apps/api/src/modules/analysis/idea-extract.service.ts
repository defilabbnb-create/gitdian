import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiRouterService } from '../ai/ai.router.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BatchIdeaExtractAnalysisDto } from './dto/batch-idea-extract-analysis.dto';
import { buildIdeaExtractPromptInput } from './helpers/idea-extract-input.helper';
import {
  buildIdeaExtractPrompt,
  IDEA_EXTRACT_PROMPT_VERSION,
} from './prompts/idea-extract.prompt';

type RepositoryAnalysisTarget = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
  };
}>;

type ProductForm = 'SAAS' | 'PLUGIN' | 'API' | 'TOOL_SITE' | 'INTERNAL_TOOL';

type IdeaExtractOutput = {
  ideaSummary: string;
  problem: string;
  solution: string;
  targetUsers: string[];
  productForm: ProductForm;
  mvpPlan: string;
  differentiation: string;
  monetization: string;
  whyNow: string;
  risks: string[];
  confidence: number;
};

@Injectable()
export class IdeaExtractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouterService: AiRouterService,
  ) {}

  async analyzeRepository(repositoryId: string) {
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

    return this.analyzeRepositoryRecord(repository);
  }

  async analyzeBatch(dto: BatchIdeaExtractAnalysisDto) {
    const repositories = await this.prisma.repository.findMany({
      where: this.buildBatchWhere(dto),
      take: dto.limit,
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        content: true,
        analysis: true,
      },
    });

    let succeeded = 0;
    let failed = 0;

    const items: Array<{
      repositoryId: string;
      ideaSummary: string | null;
      productForm: ProductForm | null;
      action: 'created' | 'updated' | 'skipped' | 'failed';
      message: string;
    }> = [];

    for (const repository of repositories) {
      if (dto.onlyIfMissing && repository.analysis?.extractedIdeaJson) {
        const existing =
          repository.analysis.extractedIdeaJson &&
          typeof repository.analysis.extractedIdeaJson === 'object'
            ? (repository.analysis.extractedIdeaJson as Record<string, unknown>)
            : null;

        items.push({
          repositoryId: repository.id,
          ideaSummary:
            existing && typeof existing.ideaSummary === 'string'
              ? existing.ideaSummary
              : null,
          productForm:
            existing && typeof existing.productForm === 'string'
              ? (existing.productForm as ProductForm)
              : null,
          action: 'skipped',
          message: 'Idea extraction already exists.',
        });
        continue;
      }

      try {
        const result = await this.analyzeRepositoryRecord(repository);
        succeeded += 1;
        items.push({
          repositoryId: repository.id,
          ideaSummary: result.ideaSummary,
          productForm: result.productForm,
          action: result.action,
          message: 'Idea extraction completed successfully.',
        });
      } catch (error) {
        failed += 1;
        items.push({
          repositoryId: repository.id,
          ideaSummary: null,
          productForm: null,
          action: 'failed',
          message:
            error instanceof Error ? error.message : 'Unknown idea extraction error.',
        });
      }
    }

    return {
      processed: repositories.length,
      succeeded,
      failed,
      items,
    };
  }

  private async analyzeRepositoryRecord(repository: RepositoryAnalysisTarget) {
    const promptInput = buildIdeaExtractPromptInput(repository);
    const prompt = buildIdeaExtractPrompt(promptInput);

    const aiResult = await this.aiRouterService.generateJson<IdeaExtractOutput>({
      taskType: 'idea_extract',
      prompt: prompt.prompt,
      systemPrompt: prompt.systemPrompt,
      schemaHint: prompt.schemaHint,
      timeoutMs: 30000,
    });

    const normalized = this.normalizeIdeaExtractResult(aiResult.data);
    const analysisExists = Boolean(repository.analysis);

    await this.prisma.repositoryAnalysis.upsert({
      where: {
        repositoryId: repository.id,
      },
      update: {
        extractedIdeaJson: normalized as unknown as Prisma.InputJsonValue,
        provider: aiResult.provider,
        modelName: aiResult.model,
        confidence: aiResult.confidence ?? normalized.confidence,
        rawResponse: aiResult.rawResponse as Prisma.InputJsonValue,
        promptVersion: IDEA_EXTRACT_PROMPT_VERSION,
        analyzedAt: new Date(),
        fallbackUsed: aiResult.fallbackUsed,
      },
      create: {
        repositoryId: repository.id,
        extractedIdeaJson: normalized as unknown as Prisma.InputJsonValue,
        provider: aiResult.provider,
        modelName: aiResult.model,
        confidence: aiResult.confidence ?? normalized.confidence,
        rawResponse: aiResult.rawResponse as Prisma.InputJsonValue,
        promptVersion: IDEA_EXTRACT_PROMPT_VERSION,
        analyzedAt: new Date(),
        fallbackUsed: aiResult.fallbackUsed,
      },
    });

    return {
      repositoryId: repository.id,
      action: analysisExists ? ('updated' as const) : ('created' as const),
      ...normalized,
      provider: aiResult.provider,
      model: aiResult.model,
      latencyMs: aiResult.latencyMs,
      fallbackUsed: aiResult.fallbackUsed,
      confidence: aiResult.confidence ?? normalized.confidence,
    };
  }

  private buildBatchWhere(dto: BatchIdeaExtractAnalysisDto): Prisma.RepositoryWhereInput {
    const where: Prisma.RepositoryWhereInput = {};

    if (dto.repositoryIds?.length) {
      where.id = {
        in: dto.repositoryIds,
      };
    }

    return where;
  }

  private normalizeIdeaExtractResult(result: IdeaExtractOutput): IdeaExtractOutput {
    return {
      ideaSummary: this.cleanText(result.ideaSummary, 220),
      problem: this.cleanText(result.problem, 900),
      solution: this.cleanText(result.solution, 900),
      targetUsers: (result.targetUsers ?? [])
        .map((item) => this.cleanText(item, 80))
        .filter(Boolean)
        .slice(0, 5),
      productForm: this.normalizeProductForm(result.productForm),
      mvpPlan: this.cleanText(result.mvpPlan, 900),
      differentiation: this.cleanText(result.differentiation, 900),
      monetization: this.cleanText(result.monetization, 600),
      whyNow: this.cleanText(result.whyNow, 600),
      risks: (result.risks ?? [])
        .map((item) => this.cleanText(item, 120))
        .filter(Boolean)
        .slice(0, 5),
      confidence: this.clampScore(result.confidence),
    };
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return normalized.slice(0, maxLength);
  }

  private normalizeProductForm(value: string | undefined): ProductForm {
    switch (String(value ?? '').toUpperCase()) {
      case 'PLUGIN':
        return 'PLUGIN';
      case 'API':
        return 'API';
      case 'TOOL_SITE':
        return 'TOOL_SITE';
      case 'INTERNAL_TOOL':
        return 'INTERNAL_TOOL';
      case 'SAAS':
      default:
        return 'SAAS';
    }
  }

  private clampScore(value: number | undefined | null) {
    const normalized = Number(value ?? 0);
    return Math.max(0, Math.min(100, Math.round(normalized)));
  }
}
