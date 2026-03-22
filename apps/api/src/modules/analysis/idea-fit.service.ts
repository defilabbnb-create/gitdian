import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  RepositoryDecision,
  RepositoryOpportunityLevel,
} from '@prisma/client';
import { AiRouterService } from '../ai/ai.router.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BatchIdeaFitAnalysisDto } from './dto/batch-idea-fit-analysis.dto';
import { buildIdeaFitPromptInput } from './helpers/idea-fit-input.helper';
import {
  buildIdeaFitPrompt,
  IDEA_FIT_PROMPT_VERSION,
} from './prompts/idea-fit.prompt';

type RepositoryAnalysisTarget = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
  };
}>;

type IdeaFitAnalysisOutput = {
  ideaFitScore: number;
  opportunityLevel: 'S' | 'A' | 'B' | 'C';
  decision: string;
  coreJudgement: string;
  scores: {
    realDemand: number;
    toolProductization: number;
    monetization: number;
    competitiveBreakthrough: number;
    timingTailwind: number;
    executionFeasibility: number;
    founderFit: number;
  };
  negativeFlags: string[];
  opportunityTags: string[];
};

@Injectable()
export class IdeaFitService {
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

  async analyzeBatch(dto: BatchIdeaFitAnalysisDto) {
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
      ideaFitScore: number | null;
      opportunityLevel: string | null;
      action: 'created' | 'updated' | 'skipped' | 'failed';
      message: string;
    }> = [];

    for (const repository of repositories) {
      if (dto.onlyIfMissing && repository.analysis?.ideaFitJson) {
        items.push({
          repositoryId: repository.id,
          ideaFitScore:
            typeof repository.ideaFitScore?.toNumber === 'function'
              ? repository.ideaFitScore.toNumber()
              : null,
          opportunityLevel: repository.opportunityLevel,
          action: 'skipped',
          message: 'Idea fit analysis already exists.',
        });
        continue;
      }

      try {
        const result = await this.analyzeRepositoryRecord(repository);
        succeeded += 1;
        items.push({
          repositoryId: repository.id,
          ideaFitScore: result.ideaFitScore,
          opportunityLevel: result.opportunityLevel,
          action: result.action,
          message: 'Idea fit analysis completed successfully.',
        });
      } catch (error) {
        failed += 1;
        items.push({
          repositoryId: repository.id,
          ideaFitScore: null,
          opportunityLevel: null,
          action: 'failed',
          message: error instanceof Error ? error.message : 'Unknown idea fit analysis error.',
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
    const promptInput = buildIdeaFitPromptInput(repository);
    const prompt = buildIdeaFitPrompt(promptInput);

    const aiResult = await this.aiRouterService.generateJson<IdeaFitAnalysisOutput>({
      taskType: 'idea_fit',
      prompt: prompt.prompt,
      systemPrompt: prompt.systemPrompt,
      schemaHint: prompt.schemaHint,
      timeoutMs: 30000,
    });

    const normalized = this.normalizeIdeaFitResult(aiResult.data);
    const analysisExists = Boolean(repository.analysis);

    await this.prisma.repository.update({
      where: { id: repository.id },
      data: {
        ideaFitScore: normalized.ideaFitScore,
        opportunityLevel: this.mapOpportunityLevel(normalized.opportunityLevel),
        decision: this.mapDecision(normalized.opportunityLevel, normalized.decision),
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
        ideaFitJson: normalized as unknown as Prisma.InputJsonValue,
        negativeFlags: normalized.negativeFlags as unknown as Prisma.InputJsonValue,
        provider: aiResult.provider,
        modelName: aiResult.model,
        confidence: aiResult.confidence,
        rawResponse: aiResult.rawResponse as Prisma.InputJsonValue,
        promptVersion: IDEA_FIT_PROMPT_VERSION,
        analyzedAt: new Date(),
        fallbackUsed: aiResult.fallbackUsed,
      },
      create: {
        repositoryId: repository.id,
        ideaFitJson: normalized as unknown as Prisma.InputJsonValue,
        negativeFlags: normalized.negativeFlags as unknown as Prisma.InputJsonValue,
        provider: aiResult.provider,
        modelName: aiResult.model,
        confidence: aiResult.confidence,
        rawResponse: aiResult.rawResponse as Prisma.InputJsonValue,
        promptVersion: IDEA_FIT_PROMPT_VERSION,
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
      confidence: aiResult.confidence,
    };
  }

  private buildBatchWhere(dto: BatchIdeaFitAnalysisDto): Prisma.RepositoryWhereInput {
    const where: Prisma.RepositoryWhereInput = {};

    if (dto.repositoryIds?.length) {
      where.id = {
        in: dto.repositoryIds,
      };
    }

    return where;
  }

  private normalizeIdeaFitResult(result: IdeaFitAnalysisOutput): IdeaFitAnalysisOutput {
    return {
      ideaFitScore: this.clampScore(result.ideaFitScore),
      opportunityLevel: this.normalizeOpportunityLevel(result.opportunityLevel),
      decision: String(result.decision ?? '').trim(),
      coreJudgement: String(result.coreJudgement ?? '').trim(),
      scores: {
        realDemand: this.clampScore(result.scores?.realDemand),
        toolProductization: this.clampScore(result.scores?.toolProductization),
        monetization: this.clampScore(result.scores?.monetization),
        competitiveBreakthrough: this.clampScore(result.scores?.competitiveBreakthrough),
        timingTailwind: this.clampScore(result.scores?.timingTailwind),
        executionFeasibility: this.clampScore(result.scores?.executionFeasibility),
        founderFit: this.clampScore(result.scores?.founderFit),
      },
      negativeFlags: (result.negativeFlags ?? [])
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 5),
      opportunityTags: (result.opportunityTags ?? [])
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 6),
    };
  }

  private clampScore(value: number | undefined | null) {
    const normalized = Number(value ?? 0);
    return Math.max(0, Math.min(100, Math.round(normalized)));
  }

  private normalizeOpportunityLevel(value: string | undefined) {
    const normalized = String(value ?? '').toUpperCase();
    if (normalized === 'S' || normalized === 'A' || normalized === 'B') {
      return normalized as 'S' | 'A' | 'B';
    }

    return 'C' as const;
  }

  private mapOpportunityLevel(level: 'S' | 'A' | 'B' | 'C') {
    switch (level) {
      case 'S':
      case 'A':
        return RepositoryOpportunityLevel.HIGH;
      case 'B':
        return RepositoryOpportunityLevel.MEDIUM;
      case 'C':
      default:
        return RepositoryOpportunityLevel.LOW;
    }
  }

  private mapDecision(level: 'S' | 'A' | 'B' | 'C', decision: string) {
    if (decision) {
      const normalized = decision.toLowerCase();
      if (normalized.includes('reject')) {
        return RepositoryDecision.REJECTED;
      }
      if (normalized.includes('watch')) {
        return RepositoryDecision.WATCHLIST;
      }
      if (normalized.includes('recommend') || normalized.includes('priority')) {
        return RepositoryDecision.RECOMMENDED;
      }
    }

    switch (level) {
      case 'S':
      case 'A':
        return RepositoryDecision.RECOMMENDED;
      case 'B':
        return RepositoryDecision.WATCHLIST;
      case 'C':
      default:
        return RepositoryDecision.REJECTED;
    }
  }
}
