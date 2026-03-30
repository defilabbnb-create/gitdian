import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiRouterService } from '../ai/ai.router.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BatchIdeaExtractAnalysisDto } from './dto/batch-idea-extract-analysis.dto';
import { buildIdeaExtractPromptInput } from './helpers/idea-extract-input.helper';
import {
  buildIdeaExtractPrompt,
} from './prompts/idea-extract.prompt';
import { RepositoryInsightService } from './repository-insight.service';
import { AnalysisTrainingKnowledgeService } from './analysis-training-knowledge.service';

type RepositoryAnalysisTarget = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
  };
}>;

type ProductForm = 'SAAS' | 'PLUGIN' | 'API' | 'TOOL_SITE' | 'INTERNAL_TOOL';
export type IdeaExtractMode = 'full' | 'light';

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
  extractMode?: IdeaExtractMode;
};

type IdeaExtractDeferredResult = {
  deferred: true;
  repositoryId: string;
  reason: string;
  inflight: number;
  maxInflight: number;
};

type IdeaExtractCompletedResult = {
  repositoryId: string;
  action: 'created' | 'updated';
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
  provider: string;
  model: string | null;
  latencyMs: number;
  fallbackUsed: boolean;
  extractMode: IdeaExtractMode;
};

@Injectable()
export class IdeaExtractService {
  private readonly logger = new Logger(IdeaExtractService.name);
  private ideaExtractInflight = 0;
  private readonly defaultIdeaExtractMaxInflight = this.readPositiveInt(
    'IDEA_EXTRACT_MAX_INFLIGHT',
    2,
  );
  private runtimeIdeaExtractMaxInflight: number | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouterService: AiRouterService,
    private readonly repositoryInsightService: RepositoryInsightService,
    private readonly analysisTrainingKnowledgeService: AnalysisTrainingKnowledgeService,
  ) {}

  async analyzeRepository(
    repositoryId: string,
    options: {
      deferIfBusy?: boolean;
      mode?: IdeaExtractMode;
      refreshInsight?: boolean;
    } = {},
  ): Promise<IdeaExtractCompletedResult | IdeaExtractDeferredResult> {
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

    return this.analyzeRepositoryRecord(repository, options);
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
        const result = await this.analyzeRepositoryRecord(repository, {
          deferIfBusy: false,
        });

        if ('deferred' in result && result.deferred) {
          items.push({
            repositoryId: repository.id,
            ideaSummary: null,
            productForm: null,
            action: 'skipped',
            message: result.reason,
          });
          continue;
        }

        const completedResult = result as Exclude<typeof result, { deferred: true }>;
        succeeded += 1;
        items.push({
          repositoryId: repository.id,
          ideaSummary: completedResult.ideaSummary,
          productForm: completedResult.productForm,
          action: completedResult.action,
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

  getIdeaExtractLimiterState() {
    return {
      inflight: this.ideaExtractInflight,
      maxInflight: this.getEffectiveIdeaExtractMaxInflight(),
    };
  }

  setRuntimeMaxInflight(maxInflight: number) {
    this.runtimeIdeaExtractMaxInflight = Math.max(1, Math.round(maxInflight));
  }

  private async analyzeRepositoryRecord(
    repository: RepositoryAnalysisTarget,
    options: {
      deferIfBusy?: boolean;
      mode?: IdeaExtractMode;
      refreshInsight?: boolean;
    } = {},
  ) {
    const deferIfBusy = options.deferIfBusy ?? false;
    const extractMode = options.mode ?? 'full';
    const slotAcquired = await this.acquireIdeaExtractSlot(deferIfBusy);

    if (!slotAcquired) {
      this.logger.warn(
        `idea_extract deferred repositoryId=${repository.id} inflight=${this.ideaExtractInflight} maxInflight=${this.getEffectiveIdeaExtractMaxInflight()}`,
      );

      return {
        deferred: true as const,
        repositoryId: repository.id,
        reason:
          'Idea extraction deferred because the extract inflight limit is saturated.',
        inflight: this.ideaExtractInflight,
        maxInflight: this.getEffectiveIdeaExtractMaxInflight(),
      };
    }

    try {
      const analysisExists = Boolean(repository.analysis);
      const runAt = new Date();
      let normalized: IdeaExtractOutput;
      let provider: string;
      let model: string | null;
      let latencyMs: number;
      let fallbackUsed: boolean;
      let confidence: number;
      let rawResponse: Prisma.InputJsonValue;
      let promptVersion: string;

      if (extractMode === 'light') {
        normalized = this.buildLightIdeaExtract(repository);
        provider = 'derived';
        model = null;
        latencyMs = 0;
        fallbackUsed = false;
        confidence = normalized.confidence;
        rawResponse = {
          strategy: 'light_extract_from_insight',
          extractMode: 'light',
          generatedAt: runAt.toISOString(),
        } as Prisma.InputJsonValue;
        promptVersion = 'idea_extract_light_v1';
      } else {
        const promptInput = buildIdeaExtractPromptInput(repository);
        const basePrompt = buildIdeaExtractPrompt(promptInput);
        const prompt = await this.analysisTrainingKnowledgeService.enhancePrompt(
          'idea_extract',
          basePrompt,
        );

        const aiResult = await this.aiRouterService.generateJson<IdeaExtractOutput>({
          taskType: 'idea_extract',
          prompt: prompt.prompt,
          systemPrompt: prompt.systemPrompt,
          schemaHint: prompt.schemaHint,
          timeoutMs: this.readPositiveInt('OMLX_TIMEOUT_MS_IDEA_EXTRACT', 240_000),
        });

        normalized = await this.analysisTrainingKnowledgeService.buildIdeaExtractEnhancement({
          repository,
          output: this.normalizeIdeaExtractResult(aiResult.data, 'full'),
        });
        provider = aiResult.provider;
        model = aiResult.model;
        latencyMs = aiResult.latencyMs;
        fallbackUsed = aiResult.fallbackUsed;
        confidence = aiResult.confidence ?? normalized.confidence;
        rawResponse = aiResult.rawResponse as Prisma.InputJsonValue;
        promptVersion = prompt.promptVersion;
      }

      await this.prisma.repositoryAnalysis.upsert({
        where: {
          repositoryId: repository.id,
        },
        update: {
          extractedIdeaJson: normalized as unknown as Prisma.InputJsonValue,
          provider,
          modelName: model,
          confidence,
          rawResponse,
          promptVersion,
          analyzedAt: runAt,
          fallbackUsed,
        },
        create: {
          repositoryId: repository.id,
          extractedIdeaJson: normalized as unknown as Prisma.InputJsonValue,
          provider,
          modelName: model,
          confidence,
          rawResponse,
          promptVersion,
          analyzedAt: runAt,
          fallbackUsed,
        },
      });

      if (options.refreshInsight !== false) {
        await this.repositoryInsightService.refreshInsight(repository.id);
      }

      return {
        repositoryId: repository.id,
        action: analysisExists ? ('updated' as const) : ('created' as const),
        ...normalized,
        provider,
        model,
        latencyMs,
        fallbackUsed,
        confidence,
        extractMode,
      };
    } finally {
      this.releaseIdeaExtractSlot();
    }
  }

  private async acquireIdeaExtractSlot(deferIfBusy: boolean) {
    if (this.ideaExtractInflight < this.getEffectiveIdeaExtractMaxInflight()) {
      this.ideaExtractInflight += 1;
      return true;
    }

    if (deferIfBusy) {
      return false;
    }

    while (this.ideaExtractInflight >= this.getEffectiveIdeaExtractMaxInflight()) {
      await this.sleep(250);
    }

    this.ideaExtractInflight += 1;
    return true;
  }

  private releaseIdeaExtractSlot() {
    this.ideaExtractInflight = Math.max(0, this.ideaExtractInflight - 1);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getEffectiveIdeaExtractMaxInflight() {
    return this.runtimeIdeaExtractMaxInflight ?? this.defaultIdeaExtractMaxInflight;
  }

  private readPositiveInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
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

  private normalizeIdeaExtractResult(
    result: IdeaExtractOutput,
    extractMode: IdeaExtractMode = 'full',
  ): IdeaExtractOutput {
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
      extractMode,
    };
  }

  private buildLightIdeaExtract(
    repository: RepositoryAnalysisTarget,
  ): IdeaExtractOutput {
    const insight = this.readObject(repository.analysis?.insightJson);
    const snapshot = this.readObject(repository.analysis?.ideaSnapshotJson);
    const projectReality =
      this.readObject(insight?.projectReality) ?? this.readObject(snapshot?.projectReality);
    const oneLiner =
      this.cleanText(insight?.oneLinerZh, 180) ||
      this.cleanText(snapshot?.oneLinerZh, 180) ||
      this.cleanText(repository.description, 180) ||
      this.cleanText(repository.fullName, 180);
    const verdictReason =
      this.cleanText(insight?.verdictReason, 420) ||
      this.cleanText(snapshot?.reason, 420) ||
      '这个项目已经显露出明确的使用场景，但还需要更轻量地补齐产品分析。';
    const targetUser = this.extractTargetUserFromOneLiner(oneLiner);
    const monetization = projectReality?.isDirectlyMonetizable
      ? '可以先按团队订阅、专业版或托管服务收费，重点验证谁会持续付费。'
      : '收费路径暂时不够清楚，先用访谈或试运行确认是否有人愿意为它付费。';
    const whyNow = this.cleanText(
      insight?.verdictReason,
      320,
    ) || '已经能看出具体场景和需求边界，适合先补一轮轻量验证。';
    const problem = this.cleanText(
      repository.description,
      320,
    ) || '当前仓库已经暴露出一个可复述的问题场景，但还缺少更明确的产品语言。';
    const solution = oneLiner
      ? `先围绕「${oneLiner}」做一个能验证用户是否真的会使用和付费的轻量版本。`
      : '先把它压缩成一个能验证用户、场景和收费方式的轻量产品版本。';

    return this.normalizeIdeaExtractResult(
      {
        ideaSummary: oneLiner || '这个项目可以先作为一个轻量可验证的产品机会来推进。',
        problem: problem || verdictReason,
        solution,
        targetUsers: targetUser ? [targetUser] : ['开发者和小团队'],
        productForm: this.inferProductForm(repository, projectReality),
        mvpPlan:
          '先明确目标用户、最小可用流程和首个收费或试用入口，再决定是否继续做深。',
        differentiation:
          verdictReason || '当前更重要的是先验证场景是否成立，而不是补齐所有分析字段。',
        monetization,
        whyNow,
        risks: this.buildLightRiskList(projectReality, insight, snapshot),
        confidence: this.estimateLightExtractConfidence(projectReality, insight),
        extractMode: 'light',
      },
      'light',
    );
  }

  private buildLightRiskList(
    projectReality: Record<string, unknown> | null,
    insight: Record<string, unknown> | null,
    snapshot: Record<string, unknown> | null,
  ) {
    const risks = [
      this.cleanText(projectReality?.whyNotProduct, 180),
      this.cleanText(insight?.verdictReason, 180),
      this.cleanText(snapshot?.reason, 180),
    ].filter(Boolean);

    return risks.length ? Array.from(new Set(risks)).slice(0, 3) : ['需要继续确认真实用户和收费路径。'];
  }

  private inferProductForm(
    repository: RepositoryAnalysisTarget,
    projectReality: Record<string, unknown> | null,
  ): ProductForm {
    const haystack = [
      repository.name,
      repository.fullName,
      repository.description,
      ...(repository.topics ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (haystack.includes('extension') || haystack.includes('plugin')) {
      return 'PLUGIN';
    }

    if (haystack.includes('api')) {
      return 'API';
    }

    if (String(projectReality?.type ?? '').toLowerCase() === 'tool') {
      return 'TOOL_SITE';
    }

    return 'SAAS';
  }

  private estimateLightExtractConfidence(
    projectReality: Record<string, unknown> | null,
    insight: Record<string, unknown> | null,
  ) {
    let score = 58;

    if (projectReality?.hasRealUser) {
      score += 10;
    }
    if (projectReality?.hasClearUseCase) {
      score += 10;
    }
    if (projectReality?.isDirectlyMonetizable) {
      score += 8;
    }
    if (typeof insight?.confidence === 'number') {
      score += Math.max(-8, Math.min(8, Math.round((Number(insight.confidence) - 0.6) * 20)));
    }

    return this.clampScore(score);
  }

  private extractTargetUserFromOneLiner(oneLiner: string) {
    const matched = oneLiner.match(/^一个帮(.+?)做.+的(?:工具|系统|平台|项目)/);
    return matched?.[1]?.trim() ?? null;
  }

  private readObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
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
