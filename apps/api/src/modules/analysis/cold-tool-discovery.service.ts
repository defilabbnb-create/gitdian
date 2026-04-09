import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiRouterService } from '../ai/ai.router.service';
import { AiProviderName } from '../ai/interfaces/ai.types';
import {
  ExternalSiteEvidenceService,
  RepositoryExternalSiteSignals,
} from './external-site-evidence.service';
import { buildColdToolDiscoveryPromptInput } from './helpers/cold-tool-discovery-input.helper';
import {
  buildColdToolDiscoveryPrompt,
  buildColdToolDiscoveryBatchPrompt,
  COLD_TOOL_DISCOVERY_BATCH_PROMPT_VERSION,
} from './prompts/cold-tool-discovery.prompt';
import { buildColdToolOpenAiOptions } from './helpers/openai-provider-options.helper';

type RepositoryColdToolTarget = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
  };
}>;

export type ColdToolAudienceBand =
  | 'LT_10K'
  | 'ACTIVE_10K_50K'
  | 'ACTIVE_50K_100K'
  | 'ACTIVE_100K_500K'
  | 'ACTIVE_500K_1M'
  | 'ACTIVE_1M_PLUS'
  | 'UNKNOWN';

export type ColdToolSignalLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type ColdToolOrigin = {
  collector: string;
  domain: string;
  keyword: string;
  locale: string;
  codeLanguage: string | null;
  collectedAt: string;
};

export type ColdToolDiscoveryOutput = {
  isRealUserTool: boolean;
  targetUsersZh: string;
  useCaseZh: string;
  usageFrequency: ColdToolSignalLevel;
  workflowCriticality: ColdToolSignalLevel;
  globalActiveUsersBand: ColdToolAudienceBand;
  globalPotentialUsersBand: ColdToolAudienceBand;
  fitsColdToolPool: boolean;
  hasPayingIntent: boolean;
  buyerTypeZh: string;
  willingnessToPay: ColdToolSignalLevel;
  summaryZh: string;
  whyUseZh: string;
  whyPayZh: string;
  whyNotPayZh: string;
  confidence: number;
};

export type ColdToolPoolRecord = ColdToolDiscoveryOutput & {
  version: string;
  evaluatedAt: string;
  originCount: number;
  origins: ColdToolOrigin[];
  globalActiveUsersBandZh: string;
  globalPotentialUsersBandZh: string;
  usageFrequencyLabelZh: string;
  workflowCriticalityLabelZh: string;
  willingnessToPayLabelZh: string;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
};

type BatchColdToolDiscoveryOutputItem = {
  repoId: string;
} & ColdToolDiscoveryOutput;

type BatchColdToolDiscoveryResultItem = {
  repositoryId: string;
  action: 'skipped' | 'analyzed' | 'failed';
  output: ColdToolPoolRecord | null;
  message: string | null;
};

export type AnalyzeColdToolBatchResult = {
  requested: number;
  processed: number;
  skippedExisting: number;
  matchedColdTools: number;
  items: BatchColdToolDiscoveryResultItem[];
};

const COLD_TOOL_POOL_VERSION = 'cold-tool-pool-v1';
const COLD_TOOL_TAG_PREFIX = 'cold_tool_';
const COLD_TOOL_POOL_TAG = 'cold_tool_pool';

@Injectable()
export class ColdToolDiscoveryService {
  private readonly logger = new Logger(ColdToolDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouterService: AiRouterService,
    private readonly externalSiteEvidenceService: ExternalSiteEvidenceService,
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
      throw new NotFoundException(
        `Repository with id "${repositoryId}" was not found.`,
      );
    }

    const result = await this.analyzeRepositoriesBatch({
      repositoryIds: [repositoryId],
      persist: true,
      forceRefresh: true,
    });

    return result.items[0] ?? null;
  }

  async analyzeRepositoriesBatch(args: {
    repositoryIds: string[];
    originsByRepositoryId?: Record<string, ColdToolOrigin[]>;
    batchSize?: number;
    persist?: boolean;
    forceRefresh?: boolean;
    modelOverride?: string | null;
    onBatchProgress?: (progress: {
      completedBatches: number;
      totalBatches: number;
      processedRepositories: number;
      totalRepositories: number;
      currentBatchRepositoryIds: string[];
    }) => Promise<void> | void;
  }): Promise<AnalyzeColdToolBatchResult> {
    const uniqueRepositoryIds = [...new Set(args.repositoryIds.filter(Boolean))];
    const providerOverride = this.readColdToolDiscoveryProvider();
    const batchSize = this.resolveDiscoveryBatchSize(
      args.batchSize,
      providerOverride,
    );

    if (!uniqueRepositoryIds.length) {
      return {
        requested: 0,
        processed: 0,
        skippedExisting: 0,
        matchedColdTools: 0,
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
      .filter(Boolean) as RepositoryColdToolTarget[];

    const items: BatchColdToolDiscoveryResultItem[] = [];
    const repositoriesToAnalyze: RepositoryColdToolTarget[] = [];
    let skippedWeakSnapshot = 0;
    const desiredModel =
      args.modelOverride ??
      this.cleanText(process.env.COLD_TOOL_DISCOVERY_MODEL, 80) ??
      'gpt-5.4';

    for (const repository of orderedRepositories) {
      const existingRecord = this.readColdToolPoolRecord(
        repository.analysis?.analysisJson,
      );
      const origins = this.normalizeOrigins(
        args.originsByRepositoryId?.[repository.id] ?? [],
      );

      if (
        existingRecord &&
        !this.shouldRefresh(existingRecord, {
          forceRefresh: args.forceRefresh,
          desiredModel,
          desiredPromptVersion: COLD_TOOL_DISCOVERY_BATCH_PROMPT_VERSION,
        })
      ) {
        if (args.persist && origins.length) {
          await this.persistExistingOrigins(repository, existingRecord, origins);
        }

        items.push({
          repositoryId: repository.id,
          action: 'skipped',
          output: this.mergeRecordOrigins(existingRecord, origins),
          message: 'Cold tool pool record already exists.',
        });
        continue;
      }

      if (this.shouldSkipRepositoryBeforeDiscovery(repository)) {
        skippedWeakSnapshot += 1;
        items.push({
          repositoryId: repository.id,
          action: 'skipped',
          output: null,
          message:
            'Skipped before cold tool discovery because snapshot signals are too weak.',
        });
        continue;
      }

      repositoriesToAnalyze.push(repository);
    }

    if (skippedWeakSnapshot > 0) {
      this.logger.log(
        `cold_tool_discovery_prefilter skipped=${skippedWeakSnapshot} queued=${repositoriesToAnalyze.length} requested=${uniqueRepositoryIds.length} model=${desiredModel}`,
      );
    }

    const batches = this.chunkItems(repositoriesToAnalyze, batchSize);
    const batchConcurrency = this.readPositiveInt(
      'COLD_TOOL_BATCH_CONCURRENCY',
      2,
      1,
    );
    const batchResults: BatchColdToolDiscoveryResultItem[][] = [];
    const externalSiteSignalsMap =
      await this.externalSiteEvidenceService.fetchRepositorySignalsBatch(
        repositoriesToAnalyze,
      );
    let completedBatches = 0;

    await args.onBatchProgress?.({
      completedBatches,
      totalBatches: batches.length,
      processedRepositories: 0,
      totalRepositories: repositoriesToAnalyze.length,
      currentBatchRepositoryIds: [],
    });

    await this.runWithConcurrency(batches, batchConcurrency, async (batch) => {
      await args.onBatchProgress?.({
        completedBatches,
        totalBatches: batches.length,
        processedRepositories: Math.min(
          repositoriesToAnalyze.length,
          completedBatches * batchSize,
        ),
        totalRepositories: repositoriesToAnalyze.length,
        currentBatchRepositoryIds: batch.map((repository) => repository.id),
      });

      const promptInputs = batch.map((repository) => ({
        repoId: repository.id,
        input: buildColdToolDiscoveryPromptInput(
          repository,
          externalSiteSignalsMap.get(repository.id) ?? null,
        ),
      }));
      const currentBatchResults = await this.analyzeBatchWithFallback({
        batch,
        promptInputs,
        desiredModel,
        providerOverride,
        originsByRepositoryId: args.originsByRepositoryId,
        externalSiteSignalsMap,
        persist: args.persist === true,
      });

      batchResults.push(currentBatchResults);
      completedBatches += 1;
      await args.onBatchProgress?.({
        completedBatches,
        totalBatches: batches.length,
        processedRepositories: Math.min(
          repositoriesToAnalyze.length,
          completedBatches * batchSize,
        ),
        totalRepositories: repositoriesToAnalyze.length,
        currentBatchRepositoryIds: batch.map((repository) => repository.id),
      });
    });

    const analyzedItems = batchResults.flat();
    items.push(...analyzedItems);

    return {
      requested: uniqueRepositoryIds.length,
      processed: repositoriesToAnalyze.length,
      skippedExisting: items.filter((item) => item.action === 'skipped').length,
      matchedColdTools: items.filter(
        (item) => item.output?.fitsColdToolPool === true,
      ).length,
      items,
    };
  }

  private async analyzeBatchWithFallback(args: {
    batch: RepositoryColdToolTarget[];
    promptInputs: Array<{
      repoId: string;
      input: unknown;
    }>;
    desiredModel: string;
    providerOverride?: AiProviderName;
    originsByRepositoryId?: Record<string, ColdToolOrigin[]>;
    externalSiteSignalsMap: Map<string, RepositoryExternalSiteSignals | null>;
    persist: boolean;
  }) {
    const prompt = buildColdToolDiscoveryBatchPrompt(args.promptInputs);

    try {
      const startedAt = Date.now();
      const aiResult = await this.aiRouterService.generateJson<
        BatchColdToolDiscoveryOutputItem[]
      >({
        taskType: 'idea_fit',
        prompt: prompt.prompt,
        systemPrompt: prompt.systemPrompt,
        schemaHint: prompt.schemaHint,
        timeoutMs: Math.max(45_000, args.batch.length * 12_000),
        modelOverride: args.desiredModel,
        providerOverride: args.providerOverride,
        providerOptions: {
          openai: buildColdToolOpenAiOptions(),
        },
      });
      this.logger.log(
        `cold_tool_discovery_batch_completed repositoryCount=${args.batch.length} provider=${aiResult.provider ?? 'unknown'} model=${aiResult.model ?? args.desiredModel} wallMs=${Date.now() - startedAt} latencyMs=${aiResult.latencyMs}`,
      );

      return this.buildBatchResults({
        batch: args.batch,
        normalizedOutputs: this.normalizeBatchOutputs(
          aiResult.data,
          args.batch.map((repository) => repository.id),
        ),
        provider: aiResult.provider,
        model: aiResult.model,
        promptVersion: prompt.promptVersion,
        originsByRepositoryId: args.originsByRepositoryId,
        externalSiteSignalsMap: args.externalSiteSignalsMap,
        persist: args.persist,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown cold tool discovery batch error.';
      this.logger.warn(
        `Cold tool discovery batch failed; falling back to per-repository execution for ${args.batch.length} repositories. error=${message}`,
      );

      const results: BatchColdToolDiscoveryResultItem[] = [];

      for (const repository of args.batch) {
        const singlePromptInput = args.promptInputs.find(
          (item) => item.repoId === repository.id,
        );

        if (!singlePromptInput) {
          results.push({
            repositoryId: repository.id,
            action: 'failed',
            output: null,
            message: 'Cold tool discovery prompt input missing.',
          });
          continue;
        }

        const singlePrompt = buildColdToolDiscoveryPrompt(
          singlePromptInput.input,
        );

        try {
          const startedAt = Date.now();
          const aiResult = await this.aiRouterService.generateJson<
            ColdToolDiscoveryOutput
          >({
            taskType: 'idea_fit',
            prompt: singlePrompt.prompt,
            systemPrompt: singlePrompt.systemPrompt,
            schemaHint: singlePrompt.schemaHint,
            timeoutMs: 45_000,
            modelOverride: args.desiredModel,
            providerOverride: args.providerOverride,
            providerOptions: {
              openai: buildColdToolOpenAiOptions(),
            },
          });
          this.logger.log(
            `cold_tool_discovery_single_completed repositoryId=${repository.id} provider=${aiResult.provider ?? 'unknown'} model=${aiResult.model ?? args.desiredModel} wallMs=${Date.now() - startedAt} latencyMs=${aiResult.latencyMs}`,
          );

          const normalizedOutputs = new Map<string, ColdToolDiscoveryOutput>([
            [repository.id, this.normalizeOutput(aiResult.data)],
          ]);
          const [result] = await this.buildBatchResults({
            batch: [repository],
            normalizedOutputs,
            provider: aiResult.provider,
            model: aiResult.model,
            promptVersion: singlePrompt.promptVersion,
            originsByRepositoryId: args.originsByRepositoryId,
            externalSiteSignalsMap: args.externalSiteSignalsMap,
            persist: args.persist,
          });
          results.push(result);
        } catch (singleError) {
          results.push({
            repositoryId: repository.id,
            action: 'failed',
            output: null,
            message:
              singleError instanceof Error
                ? singleError.message
                : 'Cold tool discovery fallback failed.',
          });
        }
      }

      return results;
    }
  }

  private async buildBatchResults(args: {
    batch: RepositoryColdToolTarget[];
    normalizedOutputs: Map<string, ColdToolDiscoveryOutput>;
    provider: string | null;
    model: string | null;
    promptVersion: string;
    originsByRepositoryId?: Record<string, ColdToolOrigin[]>;
    externalSiteSignalsMap: Map<string, RepositoryExternalSiteSignals | null>;
    persist: boolean;
  }) {
    const results: BatchColdToolDiscoveryResultItem[] = [];

    for (const repository of args.batch) {
      const normalizedOutput = args.normalizedOutputs.get(repository.id) ?? null;
      const origins = this.normalizeOrigins(
        args.originsByRepositoryId?.[repository.id] ?? [],
      );

      if (!normalizedOutput) {
        results.push({
          repositoryId: repository.id,
          action: 'failed',
          output: null,
          message: 'Cold tool discovery output missing repositoryId.',
        });
        continue;
      }

      const record = this.buildColdToolPoolRecord({
        output: normalizedOutput,
        origins,
        provider: args.provider,
        model: args.model,
        promptVersion: args.promptVersion,
      });

      if (args.persist) {
        await this.persistColdToolPoolRecord(
          repository,
          record,
          args.externalSiteSignalsMap.get(repository.id) ?? null,
        );
      }

      results.push({
        repositoryId: repository.id,
        action: 'analyzed',
        output: record,
        message: null,
      });
    }

    return results;
  }

  private readColdToolDiscoveryProvider(): AiProviderName | undefined {
    const normalized = String(
      process.env.COLD_TOOL_DISCOVERY_PROVIDER ?? '',
    ).trim().toLowerCase();

    if (normalized === 'omlx' || normalized === 'openai') {
      return normalized;
    }

    return undefined;
  }

  private resolveDiscoveryBatchSize(
    requestedBatchSize: number | undefined,
    providerOverride?: AiProviderName,
  ) {
    const defaultBatchSize =
      providerOverride === 'omlx'
        ? this.readPositiveInt('COLD_TOOL_DISCOVERY_BATCH_SIZE_OMLX', 2, 1)
        : this.readPositiveInt('COLD_TOOL_DISCOVERY_BATCH_SIZE_OPENAI', 2, 1);
    const rawBatchSize = requestedBatchSize ?? defaultBatchSize;

    return Math.max(1, Math.min(rawBatchSize, 8));
  }

  readColdToolPoolRecord(value: Prisma.JsonValue | null | undefined) {
    const root = this.readJsonObject(value);
    const coldToolPool = this.readJsonObject(
      root?.coldToolPool as Prisma.JsonValue | undefined,
    );

    if (!coldToolPool) {
      return null;
    }

    return this.normalizeStoredRecord(coldToolPool);
  }

  private buildColdToolPoolRecord(args: {
    output: ColdToolDiscoveryOutput;
    origins: ColdToolOrigin[];
    provider: string | null;
    model: string | null;
    promptVersion: string;
  }): ColdToolPoolRecord {
    const normalized = this.normalizeOutput(args.output);
    const mergedOrigins = this.normalizeOrigins(args.origins);

    return {
      ...normalized,
      version: COLD_TOOL_POOL_VERSION,
      evaluatedAt: new Date().toISOString(),
      originCount: mergedOrigins.length,
      origins: mergedOrigins,
      globalActiveUsersBandZh: this.audienceBandLabel(
        normalized.globalActiveUsersBand,
      ),
      globalPotentialUsersBandZh: this.audienceBandLabel(
        normalized.globalPotentialUsersBand,
      ),
      usageFrequencyLabelZh: this.signalLevelLabel(
        normalized.usageFrequency,
        '使用频率',
      ),
      workflowCriticalityLabelZh: this.signalLevelLabel(
        normalized.workflowCriticality,
        '工作流嵌入',
      ),
      willingnessToPayLabelZh: this.signalLevelLabel(
        normalized.willingnessToPay,
        '付费意愿',
      ),
      provider: args.provider,
      model: args.model,
      promptVersion: args.promptVersion,
    };
  }

  private normalizeStoredRecord(
    record: Record<string, unknown>,
  ): ColdToolPoolRecord {
    const output = this.normalizeOutput(record);
    const origins = this.normalizeOrigins(record.origins);
    const evaluatedAt =
      this.cleanText(record.evaluatedAt, 80) ?? new Date(0).toISOString();

    return {
      ...output,
      version: this.cleanText(record.version, 40) ?? COLD_TOOL_POOL_VERSION,
      evaluatedAt,
      originCount: origins.length,
      origins,
      globalActiveUsersBandZh:
        this.cleanText(record.globalActiveUsersBandZh, 40) ??
        this.audienceBandLabel(output.globalActiveUsersBand),
      globalPotentialUsersBandZh:
        this.cleanText(record.globalPotentialUsersBandZh, 40) ??
        this.audienceBandLabel(output.globalPotentialUsersBand),
      usageFrequencyLabelZh:
        this.cleanText(record.usageFrequencyLabelZh, 40) ??
        this.signalLevelLabel(output.usageFrequency, '使用频率'),
      workflowCriticalityLabelZh:
        this.cleanText(record.workflowCriticalityLabelZh, 40) ??
        this.signalLevelLabel(output.workflowCriticality, '工作流嵌入'),
      willingnessToPayLabelZh:
        this.cleanText(record.willingnessToPayLabelZh, 40) ??
        this.signalLevelLabel(output.willingnessToPay, '付费意愿'),
      provider: this.cleanText(record.provider, 80),
      model: this.cleanText(record.model, 120),
      promptVersion: this.cleanText(record.promptVersion, 80),
    };
  }

  private normalizeOutput(
    value: Partial<ColdToolDiscoveryOutput> | Record<string, unknown>,
  ): ColdToolDiscoveryOutput {
    const activeBand = this.normalizeAudienceBand(value.globalActiveUsersBand);

    return {
      isRealUserTool: Boolean(value.isRealUserTool),
      targetUsersZh: this.cleanText(value.targetUsersZh, 160) ?? '用户待判断',
      useCaseZh: this.cleanText(value.useCaseZh, 220) ?? '场景待判断',
      usageFrequency: this.normalizeSignalLevel(value.usageFrequency),
      workflowCriticality: this.normalizeSignalLevel(value.workflowCriticality),
      globalActiveUsersBand: activeBand,
      globalPotentialUsersBand: this.normalizeAudienceBand(
        value.globalPotentialUsersBand,
      ),
      fitsColdToolPool:
        Boolean(value.isRealUserTool) &&
        this.isPoolAudienceBand(activeBand),
      hasPayingIntent: Boolean(value.hasPayingIntent),
      buyerTypeZh: this.cleanText(value.buyerTypeZh, 160) ?? '买单方待判断',
      willingnessToPay: this.normalizeSignalLevel(value.willingnessToPay),
      summaryZh:
        this.cleanText(value.summaryZh, 240) ??
        '当前还缺少足够证据来判断这个项目是否属于冷门工具池。',
      whyUseZh:
        this.cleanText(value.whyUseZh, 240) ??
        '使用原因待判断。',
      whyPayZh:
        this.cleanText(value.whyPayZh, 240) ??
        '付费原因待判断。',
      whyNotPayZh:
        this.cleanText(value.whyNotPayZh, 240) ??
        '付费阻力待判断。',
      confidence: this.clampScore(value.confidence),
    };
  }

  private async persistExistingOrigins(
    repository: RepositoryColdToolTarget,
    existingRecord: ColdToolPoolRecord,
    origins: ColdToolOrigin[],
  ) {
    const mergedRecord = this.mergeRecordOrigins(existingRecord, origins);
    if (mergedRecord.originCount === existingRecord.originCount) {
      return;
    }

    await this.persistColdToolPoolRecord(repository, mergedRecord);
  }

  private mergeRecordOrigins(
    record: ColdToolPoolRecord,
    origins: ColdToolOrigin[],
  ): ColdToolPoolRecord {
    const mergedOrigins = this.mergeOrigins(record.origins, origins);

    return {
      ...record,
      originCount: mergedOrigins.length,
      origins: mergedOrigins,
    };
  }

  private async persistColdToolPoolRecord(
    repository: RepositoryColdToolTarget,
    record: ColdToolPoolRecord,
    externalSiteSignals?: RepositoryExternalSiteSignals | null,
  ) {
    const existingAnalysisJson =
      this.readJsonObject(repository.analysis?.analysisJson) ?? {};
    const nextAnalysisJson = {
      ...existingAnalysisJson,
      ...(externalSiteSignals
        ? { externalSiteSignals }
        : {}),
      coldToolPool: record,
    };
    const sanitizedAnalysisJson = this.sanitizeJsonValue(
      nextAnalysisJson,
    ) as Prisma.InputJsonValue;
    const nextTags = this.mergeColdToolTags(
      repository.analysis?.tags ?? [],
      record,
    );

    await this.prisma.repositoryAnalysis.upsert({
      where: {
        repositoryId: repository.id,
      },
      update: {
        analysisJson: sanitizedAnalysisJson,
        tags: nextTags,
      },
      create: {
        repositoryId: repository.id,
        analysisJson: sanitizedAnalysisJson,
        tags: nextTags,
      },
    });
  }

  private mergeColdToolTags(existingTags: string[], record: ColdToolPoolRecord) {
    const keepInPool = existingTags.includes(COLD_TOOL_POOL_TAG);
    const nextTags = existingTags.filter(
      (tag) => !tag.startsWith(COLD_TOOL_TAG_PREFIX),
    );

    nextTags.push('cold_tool_evaluated');
    if (record.isRealUserTool) {
      nextTags.push('cold_tool_real_user');
    }
    if (record.fitsColdToolPool || keepInPool) {
      nextTags.push(COLD_TOOL_POOL_TAG);
    }
    if (record.hasPayingIntent) {
      nextTags.push('cold_tool_paying');
    }
    nextTags.push(
      `cold_tool_active_${record.globalActiveUsersBand.toLowerCase()}`,
    );

    return Array.from(new Set(nextTags));
  }

  private normalizeBatchOutputs(
    value: BatchColdToolDiscoveryOutputItem[],
    repositoryIds: string[],
  ) {
    const items = Array.isArray(value) ? value : [];
    const normalized = new Map<string, ColdToolDiscoveryOutput>();

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const repositoryId = String(item.repoId ?? '').trim();
      if (!repositoryId || !repositoryIds.includes(repositoryId)) {
        continue;
      }

      normalized.set(repositoryId, this.normalizeOutput(item));
    }

    return normalized;
  }

  private normalizeOrigins(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as ColdToolOrigin[];
    }

    return this.mergeOrigins(
      [],
      value
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return null;
          }

          const current = item as Record<string, unknown>;
          const collector = this.cleanText(current.collector, 80);
          const domain = this.cleanText(current.domain, 80);
          const keyword = this.cleanText(current.keyword, 160);
          const locale = this.cleanText(current.locale, 40);
          const collectedAt = this.cleanText(current.collectedAt, 80);

          if (!collector || !domain || !keyword || !locale || !collectedAt) {
            return null;
          }

          return {
            collector,
            domain,
            keyword,
            locale,
            codeLanguage: this.cleanText(current.codeLanguage, 80),
            collectedAt,
          } satisfies ColdToolOrigin;
        })
        .filter((item): item is ColdToolOrigin => Boolean(item)),
    );
  }

  private mergeOrigins(
    left: ColdToolOrigin[],
    right: ColdToolOrigin[],
  ): ColdToolOrigin[] {
    const map = new Map<string, ColdToolOrigin>();

    [...left, ...right].forEach((origin) => {
      const key = [
        origin.collector,
        origin.domain,
        origin.keyword,
        origin.locale,
        origin.codeLanguage ?? '<null>',
      ].join('|');
      map.set(key, origin);
    });

    return Array.from(map.values()).sort((a, b) =>
      b.collectedAt.localeCompare(a.collectedAt),
    );
  }

  private shouldRefresh(
    record: ColdToolPoolRecord,
    options: {
      forceRefresh?: boolean;
      desiredModel?: string | null;
      desiredPromptVersion?: string | null;
    } = {},
  ) {
    if (options.forceRefresh) {
      return true;
    }

    if (
      options.desiredModel &&
      this.cleanText(record.model, 120) !== options.desiredModel
    ) {
      return true;
    }

    if (
      options.desiredPromptVersion &&
      this.cleanText(record.promptVersion, 120) !== options.desiredPromptVersion
    ) {
      return true;
    }

    if (record.version !== COLD_TOOL_POOL_VERSION) {
      return true;
    }

    const refreshDays = this.readPositiveInt(
      'COLD_TOOL_DISCOVERY_REFRESH_DAYS',
      30,
      1,
    );
    const evaluatedAt = new Date(record.evaluatedAt);
    if (Number.isNaN(evaluatedAt.getTime())) {
      return true;
    }

    return Date.now() - evaluatedAt.getTime() >= refreshDays * 24 * 60 * 60 * 1000;
  }

  private chunkItems<T>(items: T[], chunkSize: number) {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }

    return chunks;
  }

  private shouldSkipRepositoryBeforeDiscovery(
    repository: RepositoryColdToolTarget,
  ) {
    if (!this.readBoolean('COLD_TOOL_DISCOVERY_SKIP_WEAK_SNAPSHOT', true)) {
      return false;
    }

    const snapshot = this.readSnapshot(repository.analysis?.ideaSnapshotJson);
    if (!snapshot) {
      return false;
    }

    if (snapshot.isPromising === true || snapshot.toolLike === true) {
      return false;
    }

    if (snapshot.nextAction === 'KEEP' || snapshot.nextAction === 'DEEP_ANALYZE') {
      return false;
    }

    const mainCategory = this.cleanText(snapshot.category?.main, 40);
    if (
      mainCategory === 'tools' ||
      mainCategory === 'platform' ||
      mainCategory === 'data' ||
      mainCategory === 'infra'
    ) {
      return false;
    }

    return true;
  }

  private readSnapshot(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as {
      isPromising?: boolean | null;
      toolLike?: boolean | null;
      nextAction?: string | null;
      category?: {
        main?: string | null;
      } | null;
    };
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ) {
    if (!items.length) {
      return;
    }

    let cursor = 0;
    const runnerCount = Math.max(1, Math.min(concurrency, items.length));

    await Promise.all(
      Array.from({ length: runnerCount }, async () => {
        while (cursor < items.length) {
          const currentIndex = cursor;
          cursor += 1;
          await worker(items[currentIndex]);
        }
      }),
    );
  }

  private readJsonObject(value: Prisma.JsonValue | null | undefined) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private normalizeSignalLevel(value: unknown): ColdToolSignalLevel {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'HIGH' || normalized === 'LOW') {
      return normalized;
    }

    return 'MEDIUM';
  }

  private normalizeAudienceBand(value: unknown): ColdToolAudienceBand {
    switch (String(value ?? '').trim().toUpperCase()) {
      case 'LT_10K':
        return 'LT_10K';
      case 'ACTIVE_10K_50K':
        return 'ACTIVE_10K_50K';
      case 'ACTIVE_50K_100K':
        return 'ACTIVE_50K_100K';
      case 'ACTIVE_100K_500K':
        return 'ACTIVE_100K_500K';
      case 'ACTIVE_500K_1M':
        return 'ACTIVE_500K_1M';
      case 'ACTIVE_1M_PLUS':
        return 'ACTIVE_1M_PLUS';
      default:
        return 'UNKNOWN';
    }
  }

  private isPoolAudienceBand(value: ColdToolAudienceBand) {
    return (
      value === 'LT_10K' ||
      value === 'ACTIVE_10K_50K' ||
      value === 'ACTIVE_50K_100K' ||
      value === 'ACTIVE_100K_500K' ||
      value === 'ACTIVE_500K_1M'
    );
  }

  private audienceBandLabel(value: ColdToolAudienceBand) {
    switch (value) {
      case 'LT_10K':
        return '1万以下';
      case 'ACTIVE_10K_50K':
        return '1万-5万';
      case 'ACTIVE_50K_100K':
        return '5万-10万';
      case 'ACTIVE_100K_500K':
        return '10万-50万';
      case 'ACTIVE_500K_1M':
        return '50万-100万';
      case 'ACTIVE_1M_PLUS':
        return '100万以上';
      case 'UNKNOWN':
      default:
        return '暂时无法判断';
    }
  }

  private signalLevelLabel(
    value: ColdToolSignalLevel,
    prefix: '使用频率' | '工作流嵌入' | '付费意愿',
  ) {
    const label =
      value === 'HIGH' ? '高' : value === 'LOW' ? '低' : '中';
    return `${prefix}${label}`;
  }

  private clampScore(value: unknown) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round(parsed)));
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '')
      .replace(/\u0000/g, '')
      .trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return normalized.slice(0, maxLength);
  }

  private sanitizeJsonValue(value: unknown): Prisma.JsonValue {
    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    ) {
      return value;
    }

    if (typeof value === 'string') {
      return value.replace(/\u0000/g, '');
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeJsonValue(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, current]) => [
          key,
          this.sanitizeJsonValue(current),
        ]),
      );
    }

    return String(value ?? '').replace(/\u0000/g, '');
  }

  private readPositiveInt(
    envName: string,
    fallback: number,
    min: number,
  ) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);

    if (!Number.isFinite(parsed) || parsed < min) {
      return fallback;
    }

    return parsed;
  }

  private readBoolean(envName: string, fallback: boolean) {
    const raw = process.env[envName]?.trim().toLowerCase();

    if (!raw) {
      return fallback;
    }

    if (['1', 'true', 'yes', 'on'].includes(raw)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(raw)) {
      return false;
    }

    return fallback;
  }
}
