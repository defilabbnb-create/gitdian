import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  RepositoryCompletenessLevel,
  RepositoryRunabilityLevel,
} from '@prisma/client';
import { AiRouterService } from '../ai/ai.router.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BatchCompletenessAnalysisDto } from './dto/batch-completeness-analysis.dto';
import { buildCompletenessPromptInput } from './helpers/completeness-input.helper';
import {
  buildCompletenessPrompt,
} from './prompts/completeness.prompt';
import { RepositoryInsightService } from './repository-insight.service';
import { AnalysisTrainingKnowledgeService } from './analysis-training-knowledge.service';

type RepositoryAnalysisTarget = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
  };
}>;

type CompletenessAnalysisOutput = {
  completenessScore: number;
  completenessLevel: RepositoryCompletenessLevel;
  productionReady: boolean;
  runability: RepositoryRunabilityLevel;
  strengths: string[];
  weaknesses: string[];
  summary: string;
  dimensionScores: {
    documentation: number;
    structure: number;
    runability: number;
    engineering: number;
    maintenance: number;
    extensibility: number;
  };
};

@Injectable()
export class CompletenessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouterService: AiRouterService,
    private readonly repositoryInsightService: RepositoryInsightService,
    private readonly analysisTrainingKnowledgeService: AnalysisTrainingKnowledgeService,
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

  async analyzeBatch(dto: BatchCompletenessAnalysisDto) {
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
      completenessScore: number | null;
      completenessLevel: RepositoryCompletenessLevel | null;
      action: 'created' | 'updated' | 'skipped' | 'failed';
      message: string;
    }> = [];

    for (const repository of repositories) {
      if (dto.onlyIfMissing && repository.analysis?.completenessJson) {
        items.push({
          repositoryId: repository.id,
          completenessScore:
            typeof repository.completenessScore?.toNumber === 'function'
              ? repository.completenessScore.toNumber()
              : null,
          completenessLevel: repository.completenessLevel,
          action: 'skipped',
          message: 'Completeness analysis already exists.',
        });
        continue;
      }

      try {
        const result = await this.analyzeRepositoryRecord(repository);
        succeeded += 1;
        items.push({
          repositoryId: repository.id,
          completenessScore: result.completenessScore,
          completenessLevel: result.completenessLevel,
          action: result.action,
          message: 'Completeness analysis completed successfully.',
        });
      } catch (error) {
        failed += 1;
        items.push({
          repositoryId: repository.id,
          completenessScore: null,
          completenessLevel: null,
          action: 'failed',
          message:
            error instanceof Error ? error.message : 'Unknown completeness analysis error.',
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
    const promptInput = buildCompletenessPromptInput(repository);
    const basePrompt = buildCompletenessPrompt(promptInput);
    const prompt = await this.analysisTrainingKnowledgeService.enhancePrompt(
      'completeness',
      basePrompt,
    );

    const aiResult = await this.aiRouterService.generateJson<CompletenessAnalysisOutput>({
      taskType: 'completeness',
      prompt: prompt.prompt,
      systemPrompt: prompt.systemPrompt,
      schemaHint: prompt.schemaHint,
      timeoutMs: 30000,
    });

    const normalized = this.normalizeCompletenessResult(aiResult.data);
    const analysisExists = Boolean(repository.analysis);

    await this.prisma.repository.update({
      where: { id: repository.id },
      data: {
        completenessScore: normalized.completenessScore,
        completenessLevel: normalized.completenessLevel,
        productionReady: normalized.productionReady,
        runability: normalized.runability,
        analysisProvider: aiResult.provider,
        analysisModel: aiResult.model,
        analysisConfidence: aiResult.confidence,
      },
    });

    await this.prisma.repositoryAnalysis.upsert({
      where: {
        repositoryId: repository.id,
      },
      update: {
        completenessJson: normalized as unknown as Prisma.InputJsonValue,
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
        completenessJson: normalized as unknown as Prisma.InputJsonValue,
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

  private buildBatchWhere(
    dto: BatchCompletenessAnalysisDto,
  ): Prisma.RepositoryWhereInput {
    const where: Prisma.RepositoryWhereInput = {};

    if (dto.repositoryIds?.length) {
      where.id = {
        in: dto.repositoryIds,
      };
    }

    return where;
  }

  private normalizeCompletenessResult(
    result: CompletenessAnalysisOutput,
  ): CompletenessAnalysisOutput {
    return {
      completenessScore: this.clampScore(result.completenessScore),
      completenessLevel: this.normalizeCompletenessLevel(result.completenessLevel),
      productionReady: Boolean(result.productionReady),
      runability: this.normalizeRunability(result.runability),
      strengths: (result.strengths ?? []).slice(0, 5),
      weaknesses: (result.weaknesses ?? []).slice(0, 5),
      summary: String(result.summary ?? '').trim(),
      dimensionScores: {
        documentation: this.clampScore(result.dimensionScores?.documentation),
        structure: this.clampScore(result.dimensionScores?.structure),
        runability: this.clampScore(result.dimensionScores?.runability),
        engineering: this.clampScore(result.dimensionScores?.engineering),
        maintenance: this.clampScore(result.dimensionScores?.maintenance),
        extensibility: this.clampScore(result.dimensionScores?.extensibility),
      },
    };
  }

  private clampScore(value: number | undefined | null) {
    const normalized = Number(value ?? 0);
    return Math.max(0, Math.min(100, Math.round(normalized)));
  }

  private normalizeCompletenessLevel(value: RepositoryCompletenessLevel | string | undefined) {
    switch (String(value ?? '').toUpperCase()) {
      case 'HIGH':
        return RepositoryCompletenessLevel.HIGH;
      case 'MEDIUM':
        return RepositoryCompletenessLevel.MEDIUM;
      case 'LOW':
      default:
        return RepositoryCompletenessLevel.LOW;
    }
  }

  private normalizeRunability(value: RepositoryRunabilityLevel | string | undefined) {
    switch (String(value ?? '').toUpperCase()) {
      case 'EASY':
        return RepositoryRunabilityLevel.EASY;
      case 'MEDIUM':
        return RepositoryRunabilityLevel.MEDIUM;
      case 'HARD':
      default:
        return RepositoryRunabilityLevel.HARD;
    }
  }
}
