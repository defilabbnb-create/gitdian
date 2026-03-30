import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { JobStatus, Prisma, RepositoryRoughLevel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { FastFilterService } from '../fast-filter/fast-filter.service';
import { JobLogService } from '../job-log/job-log.service';
import { BatchRunAnalysisDto } from './dto/batch-run-analysis.dto';
import { RunAnalysisDto } from './dto/run-analysis.dto';
import { CompletenessService } from './completeness.service';
import { IdeaExtractService } from './idea-extract.service';
import { IdeaFitService } from './idea-fit.service';
import { IdeaSnapshotService } from './idea-snapshot.service';
import { RepositoryDecisionService } from './repository-decision.service';
import { RepositoryInsightService } from './repository-insight.service';
import { AnalysisTrainingKnowledgeService } from './analysis-training-knowledge.service';
import {
  evaluateIdeaExtractGate,
  IdeaExtractExecutionMode,
  IdeaExtractGateDecision,
  IdeaExtractGateReason,
} from './helpers/idea-extract-gate.helper';
import { resolveEffectiveOneLinerStrength } from './helpers/one-liner-strength.helper';
import { runWithConcurrency } from './helpers/run-with-concurrency.helper';
import { SelfTuningService } from './self-tuning.service';

type RepositoryWithAnalysisState = Prisma.RepositoryGetPayload<{
  include: {
    analysis: true;
  };
}>;

type StepStatus = 'executed' | 'skipped' | 'failed';

type FastFilterStepResult = {
  status: StepStatus;
  roughPass?: boolean;
  roughLevel?: RepositoryRoughLevel;
  toolLikeScore?: number;
  message: string;
};

type CompletenessStepResult = {
  status: StepStatus;
  completenessScore?: number | null;
  completenessLevel?: string | null;
  message: string;
};

type IdeaFitStepResult = {
  status: StepStatus;
  ideaFitScore?: number | null;
  opportunityLevel?: string | null;
  message: string;
};

type IdeaExtractStepResult = {
  status: StepStatus;
  ideaSummary?: string | null;
  productForm?: string | null;
  ideaExtractMode?: IdeaExtractExecutionMode | null;
  ideaExtractSkipped?: boolean;
  ideaExtractReason?: IdeaExtractGateReason | null;
  ideaExtractDeferred?: boolean;
  ideaExtractTrace?: string[];
  message: string;
};

type AnalysisRunSteps = {
  fastFilter: FastFilterStepResult;
  completeness: CompletenessStepResult;
  ideaFit: IdeaFitStepResult;
  ideaExtract: IdeaExtractStepResult;
};

type AnalysisRunResult = {
  repositoryId: string;
  steps: AnalysisRunSteps;
};

type DeepRuntimeStatsState = {
  date: string;
  deepEnteredCount: number;
  deepSkippedCount: number;
  ideaExtractExecutedCount: number;
  ideaExtractSkippedCount: number;
  ideaExtractSkippedByStrengthCount: number;
  ideaExtractDeferredCount: number;
  ideaExtractTimeoutCount: number;
  lastIdeaExtractInflight: number;
  ideaExtractMaxInflight: number;
  updatedAt: string | null;
};

type InsightRefreshBehaviorContext = {
  userSuccessPatterns?: string[];
  userFailurePatterns?: string[];
  preferredCategories?: string[];
  avoidedCategories?: string[];
  recentValidatedWins?: string[];
  recentDroppedReasons?: string[];
};

const DEEP_RUNTIME_STATS_CONFIG_KEY = 'analysis.deep.runtime_stats';

@Injectable()
export class AnalysisOrchestratorService {
  private readonly logger = new Logger(AnalysisOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fastFilterService: FastFilterService,
    private readonly jobLogService: JobLogService,
    private readonly completenessService: CompletenessService,
    private readonly ideaFitService: IdeaFitService,
    private readonly ideaExtractService: IdeaExtractService,
    private readonly ideaSnapshotService: IdeaSnapshotService,
    private readonly repositoryInsightService: RepositoryInsightService,
    private readonly repositoryDecisionService: RepositoryDecisionService,
    private readonly analysisTrainingKnowledgeService: AnalysisTrainingKnowledgeService,
    private readonly selfTuningService: SelfTuningService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async runRepositoryAnalysis(
    repositoryId: string,
    dto: RunAnalysisDto,
  ): Promise<AnalysisRunResult> {
    const job = await this.jobLogService.startJob({
      jobName: 'analysis.run_single',
      payload: {
        repositoryId,
        runFastFilter: dto.runFastFilter,
        runCompleteness: dto.runCompleteness,
        runIdeaFit: dto.runIdeaFit,
        runIdeaExtract: dto.runIdeaExtract,
        forceRerun: dto.forceRerun,
        userSuccessPatterns: dto.userSuccessPatterns?.slice(0, 8) ?? [],
        userFailurePatterns: dto.userFailurePatterns?.slice(0, 8) ?? [],
        preferredCategories: dto.preferredCategories?.slice(0, 6) ?? [],
        avoidedCategories: dto.avoidedCategories?.slice(0, 6) ?? [],
        recentValidatedWins: dto.recentValidatedWins?.slice(0, 6) ?? [],
        recentDroppedReasons: dto.recentDroppedReasons?.slice(0, 6) ?? [],
        userPreferencePriorityBoost: dto.userPreferencePriorityBoost ?? 0,
        userPreferencePriorityReasons:
          dto.userPreferencePriorityReasons?.slice(0, 4) ?? [],
      },
    });

    try {
      const data = await this.runRepositoryAnalysisDirect(repositoryId, dto);

      await this.jobLogService.completeJob({
        jobId: job.id,
        result: this.buildSingleJobResultSummary(data),
      });

      return data;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown single analysis orchestration error.';

      await this.jobLogService.failJob({
        jobId: job.id,
        errorMessage: message,
        result: {
          repositoryId,
        },
      });

      throw error;
    }
  }

  async runRepositoryAnalysisDirect(
    repositoryId: string,
    dto: RunAnalysisDto,
  ): Promise<AnalysisRunResult> {
    return this.executeRepositoryAnalysis(repositoryId, dto);
  }

  private async executeRepositoryAnalysis(
    repositoryId: string,
    dto: RunAnalysisDto,
  ): Promise<AnalysisRunResult> {
    const steps: AnalysisRunSteps = {
      fastFilter: {
        status: 'skipped',
        message: 'Fast filter disabled for this run.',
      },
      completeness: {
        status: 'skipped',
        message: 'Completeness analysis disabled for this run.',
      },
      ideaFit: {
        status: 'skipped',
        message: 'Idea fit analysis disabled for this run.',
      },
      ideaExtract: {
        status: 'skipped',
        message: 'Idea extraction disabled for this run.',
      },
    };

    const insightBehaviorContext = this.buildInsightBehaviorContext(dto);
    if (this.shouldUseInsightRefreshOnlyPath(dto)) {
      await this.repositoryInsightService.refreshInsight(
        repositoryId,
        insightBehaviorContext,
      );
      await this.recordDeepRuntimeStats({
        deepEnteredCount: 0,
        deepSkippedCount: 0,
        ideaExtractExecutedCount: 0,
        ideaExtractSkippedCount: 0,
        ideaExtractSkippedByStrengthCount: 0,
        ideaExtractDeferredCount: 0,
        ideaExtractTimeoutCount: 0,
        lastIdeaExtractInflight:
          this.ideaExtractService.getIdeaExtractLimiterState().inflight,
        ideaExtractMaxInflight:
          this.ideaExtractService.getIdeaExtractLimiterState().maxInflight,
      });

      return {
        repositoryId,
        steps,
      };
    }

    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        analysis: true,
        content: true,
      },
    });

    if (!repository) {
      throw new NotFoundException(`Repository with id "${repositoryId}" was not found.`);
    }

    if (dto.runFastFilter) {
      steps.fastFilter = await this.executeFastFilter(repository.id);
    }

    const fastFilterDidNotPass = steps.fastFilter.status === 'executed' && steps.fastFilter.roughPass === false;

    const shouldSkipCompleteness =
      !dto.forceRerun && this.hasCompletenessResult(repository);
    if (dto.runCompleteness) {
      steps.completeness = shouldSkipCompleteness
        ? {
            status: 'skipped',
            completenessScore: this.toNumber(repository.completenessScore),
            completenessLevel: repository.completenessLevel,
            message: 'Completeness analysis already exists.',
          }
        : await this.executeCompleteness(repository.id, fastFilterDidNotPass, {
            refreshInsight: false,
          });
    }

    const shouldSkipIdeaFit = !dto.forceRerun && this.hasIdeaFitResult(repository);
    if (dto.runIdeaFit) {
      steps.ideaFit = shouldSkipIdeaFit
        ? {
            status: 'skipped',
            ideaFitScore: this.toNumber(repository.ideaFitScore),
            opportunityLevel: this.readIdeaFitOpportunityLevel(repository.analysis?.ideaFitJson),
            message: 'Idea fit analysis already exists.',
          }
        : await this.executeIdeaFit(repository.id, fastFilterDidNotPass, {
            refreshInsight: false,
          });
    }

    const shouldSkipIdeaExtract =
      !dto.forceRerun && this.hasIdeaExtractResult(repository);
    if (dto.runIdeaExtract) {
      if (shouldSkipIdeaExtract) {
        steps.ideaExtract = {
          status: 'skipped',
          ideaSummary: this.readIdeaSummary(repository.analysis?.extractedIdeaJson),
          productForm: this.readIdeaProductForm(repository.analysis?.extractedIdeaJson),
          ideaExtractMode: this.readIdeaExtractMode(repository.analysis?.extractedIdeaJson),
          ideaExtractSkipped: true,
          ideaExtractReason: 'already_exists',
          ideaExtractTrace: ['already_exists'],
          message: 'Idea extraction already exists.',
        };
      } else {
        const deepInsightInputsUpdated =
          steps.completeness.status === 'executed' ||
          steps.ideaFit.status === 'executed';

        if (deepInsightInputsUpdated) {
          await this.repositoryInsightService.refreshInsight(repository.id);
        }

        const extractGate = await this.shouldRunIdeaExtract(repository.id);
        steps.ideaExtract = extractGate.shouldRun
          ? await this.executeIdeaExtract(
              repository.id,
              fastFilterDidNotPass,
              extractGate.mode,
              {
                refreshInsight: false,
              },
            )
          : {
              status: 'skipped',
              ideaExtractMode: extractGate.mode,
              ideaExtractSkipped: true,
              ideaExtractReason: extractGate.reason,
              ideaExtractTrace: extractGate.trace,
              message: `Idea extraction skipped: ${extractGate.reason}. trace=${extractGate.trace.join(',')}`,
            };

        if (
          steps.ideaExtract.ideaExtractReason === 'strength_not_strong'
        ) {
          this.logger.log(
            `idea_extract skipped repositoryId=${repository.id} strength=${extractGate.strength ?? 'unknown'} effectiveStrength=${extractGate.effectiveStrength ?? 'unknown'} reason=strength_not_strong trace=${(steps.ideaExtract.ideaExtractTrace ?? []).join(',')}`,
          );
        }
      }
    }

    await this.repositoryInsightService.refreshInsight(
      repository.id,
      insightBehaviorContext,
    );
    await this.recordDeepRuntimeStats({
      deepEnteredCount:
        dto.runCompleteness || dto.runIdeaFit || dto.runIdeaExtract ? 1 : 0,
      deepSkippedCount:
        dto.runIdeaExtract &&
        steps.ideaExtract.ideaExtractSkipped === true &&
        steps.ideaExtract.ideaExtractReason !== 'already_exists' &&
        steps.ideaExtract.ideaExtractReason !== 'deferred'
          ? 1
          : 0,
      ideaExtractExecutedCount: steps.ideaExtract.status === 'executed' ? 1 : 0,
      ideaExtractSkippedCount:
        steps.ideaExtract.ideaExtractSkipped === true ? 1 : 0,
      ideaExtractSkippedByStrengthCount:
        steps.ideaExtract.ideaExtractReason === 'strength_not_strong' ? 1 : 0,
      ideaExtractDeferredCount:
        steps.ideaExtract.ideaExtractDeferred === true ? 1 : 0,
      ideaExtractTimeoutCount:
        steps.ideaExtract.status === 'failed' &&
        this.isTimeoutMessage(steps.ideaExtract.message)
          ? 1
          : 0,
      lastIdeaExtractInflight:
        this.ideaExtractService.getIdeaExtractLimiterState().inflight,
      ideaExtractMaxInflight:
        this.ideaExtractService.getIdeaExtractLimiterState().maxInflight,
    });
    await this.ensureMissingDeepAnalysisQueued(repository.id);

    return {
      repositoryId: repository.id,
      steps,
    };
  }

  private shouldUseInsightRefreshOnlyPath(dto: RunAnalysisDto) {
    return (
      !dto.runFastFilter &&
      !dto.runCompleteness &&
      !dto.runIdeaFit &&
      !dto.runIdeaExtract
    );
  }

  async runBatchAnalysis(dto: BatchRunAnalysisDto) {
    const job = await this.jobLogService.startJob({
      jobName: 'analysis.run_batch',
      payload: {
        repositoryIds: dto.repositoryIds?.slice(0, 100) ?? null,
        onlyIfMissing: dto.onlyIfMissing,
        limit: dto.limit,
        runFastFilter: dto.runFastFilter,
        runCompleteness: dto.runCompleteness,
        runIdeaFit: dto.runIdeaFit,
        runIdeaExtract: dto.runIdeaExtract,
        forceRerun: dto.forceRerun,
      },
    });

    try {
      const data = await this.runBatchAnalysisDirect(dto);

      await this.jobLogService.completeJob({
        jobId: job.id,
        result: {
          processed: data.processed,
          succeeded: data.succeeded,
          failed: data.failed,
          items: data.items.slice(0, 20),
        },
      });

      return data;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown batch analysis orchestration error.';

      await this.jobLogService.failJob({
        jobId: job.id,
        errorMessage: message,
      });

      throw error;
    }
  }

  async runBatchAnalysisDirect(dto: BatchRunAnalysisDto) {
    return this.executeBatchAnalysis(dto);
  }

  private async executeBatchAnalysis(dto: BatchRunAnalysisDto) {
    const repositories = await this.selectBatchRepositories(dto);
    const concurrency = this.resolveBatchAnalysisConcurrency();

    let succeeded = 0;
    let failed = 0;

    const items: Array<{
      repositoryId: string;
      action: 'executed' | 'skipped' | 'failed';
      steps: AnalysisRunSteps;
      message: string;
    }> = [];

    const batchItems = await runWithConcurrency(
      repositories,
      concurrency,
      async (repository) => {
        try {
          const result = await this.executeRepositoryAnalysis(repository.id, dto);
          const action = this.resolveOverallAction(result.steps);

          return {
            repositoryId: repository.id,
            action,
            steps: result.steps,
            message: this.buildOverallMessage(result.steps),
          };
        } catch (error) {
          return {
            repositoryId: repository.id,
            action: 'failed' as const,
            steps: this.buildFailedSteps(
              error instanceof Error
                ? error.message
                : 'Unknown analysis orchestration error.',
            ),
            message:
              error instanceof Error
                ? error.message
                : 'Unknown analysis orchestration error.',
          };
        }
      },
    );

    for (const item of batchItems) {
      if (item.action === 'failed') {
        failed += 1;
      } else {
        succeeded += 1;
      }

      items.push(item);
    }

    return {
      processed: repositories.length,
      succeeded,
      failed,
      items,
    };
  }

  private async executeFastFilter(repositoryId: string): Promise<FastFilterStepResult> {
    try {
      const result = await this.fastFilterService.evaluateRepository(repositoryId);
      const message = result.roughPass
        ? 'Fast filter executed successfully.'
        : 'Fast filter executed, but rough filter did not pass. Downstream analysis continued.';

      return {
        status: 'executed',
        roughPass: result.roughPass,
        roughLevel: result.roughLevel,
        toolLikeScore: result.toolLikeScore,
        message,
      };
    } catch (error) {
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Fast filter execution failed.',
      };
    }
  }

  private async ensureMissingDeepAnalysisQueued(repositoryId: string) {
    try {
      const existingBackstopJob = await this.prisma.jobLog.findFirst({
        where: {
          jobName: 'analysis.run_single',
          queueName: 'analysis.single',
          triggeredBy: 'analysis_backstop',
          jobStatus: {
            in: [JobStatus.PENDING, JobStatus.RUNNING],
          },
          payload: {
            path: ['repositoryId'],
            equals: repositoryId,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingBackstopJob) {
        this.logger.log(
          `missing_deep_backstop already queued repositoryId=${repositoryId} jobId=${existingBackstopJob.id}`,
        );
        return;
      }

      const repository = await this.prisma.repository.findUnique({
        where: { id: repositoryId },
        include: {
          analysis: true,
          content: true,
        },
      });

      if (!repository) {
        return;
      }

      const derived =
        (await this.repositoryDecisionService.attachDerivedAssets(
          repository as unknown as Record<string, unknown>,
        )) as Record<string, unknown>;
      const finalDecision = this.readJsonObject(derived.finalDecision);
      const analysisState = this.readJsonObject(derived.analysisState);

      if (!finalDecision || !analysisState) {
        return;
      }

      const deepReady = this.readBoolean(analysisState.deepReady);
      const analysisStatus = this.readString(analysisState.analysisStatus);
      if (
        deepReady ||
        analysisStatus === 'DEEP_PENDING' ||
        analysisStatus === 'DEEP_DONE' ||
        analysisStatus === 'REVIEW_PENDING' ||
        analysisStatus === 'REVIEW_DONE' ||
        analysisStatus === 'SKIPPED_BY_GATE' ||
        analysisStatus === 'FAILED'
      ) {
        return;
      }

      const completenessMissingJson =
        repository.analysis?.completenessJson == null &&
        repository.completenessScore != null;
      const ideaFitMissingJson =
        repository.analysis?.ideaFitJson == null && repository.ideaFitScore != null;
      const runCompleteness =
        completenessMissingJson || !this.hasCompletenessResult(repository);
      const runIdeaFit = ideaFitMissingJson || !this.hasIdeaFitResult(repository);
      let runIdeaExtract = !repository.analysis?.extractedIdeaJson;
      const forceRerun = completenessMissingJson || ideaFitMissingJson;
      if (!runCompleteness && !runIdeaFit && !runIdeaExtract) {
        return;
      }

      if (runIdeaExtract) {
        const extractGate = await this.shouldRunIdeaExtract(repositoryId);
        if (!extractGate.shouldRun) {
          runIdeaExtract = false;
          this.logger.log(
            `missing_deep_backstop skipped idea_extract repositoryId=${repositoryId} reason=${extractGate.reason} trace=${extractGate.trace.join(',')}`,
          );
        }
      }

      if (!runCompleteness && !runIdeaFit && !runIdeaExtract) {
        return;
      }

      const queueService = this.moduleRef.get(QueueService, {
        strict: false,
      });
      if (!queueService) {
        return;
      }

      await queueService.enqueueSingleAnalysis(
        repositoryId,
        {
          runFastFilter: false,
          runCompleteness,
          runIdeaFit,
          runIdeaExtract,
          forceRerun,
        },
        'analysis_backstop',
        {
          metadata: {
            missingDeepAfterFinalDecision: true,
            recoveryMode: 'forced_missing_deep',
            forceBackfillMissingJson: forceRerun,
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `failed to enqueue missing deep backstop repositoryId=${repositoryId} error=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  private async executeCompleteness(
    repositoryId: string,
    fastFilterDidNotPass: boolean,
    options: {
      refreshInsight?: boolean;
    } = {},
  ): Promise<CompletenessStepResult> {
    try {
      const result = await this.completenessService.analyzeRepository(
        repositoryId,
        options,
      );

      return {
        status: 'executed',
        completenessScore: result.completenessScore,
        completenessLevel: result.completenessLevel,
        message: fastFilterDidNotPass
          ? 'Completeness analysis executed after rough filter did not pass.'
          : 'Completeness analysis executed successfully.',
      };
    } catch (error) {
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Completeness analysis failed.',
      };
    }
  }

  private async executeIdeaFit(
    repositoryId: string,
    fastFilterDidNotPass: boolean,
    options: {
      refreshInsight?: boolean;
    } = {},
  ): Promise<IdeaFitStepResult> {
    try {
      const result = await this.ideaFitService.analyzeRepository(
        repositoryId,
        options,
      );

      return {
        status: 'executed',
        ideaFitScore: result.ideaFitScore,
        opportunityLevel: result.opportunityLevel,
        message: fastFilterDidNotPass
          ? 'Idea fit analysis executed after rough filter did not pass.'
          : 'Idea fit analysis executed successfully.',
      };
    } catch (error) {
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Idea fit analysis failed.',
      };
    }
  }

  private async executeIdeaExtract(
    repositoryId: string,
    fastFilterDidNotPass: boolean,
    mode: IdeaExtractExecutionMode,
    options: {
      refreshInsight?: boolean;
    } = {},
  ): Promise<IdeaExtractStepResult> {
    try {
      const result = await this.ideaExtractService.analyzeRepository(repositoryId, {
        deferIfBusy: true,
        mode: mode === 'skip' ? 'light' : mode,
        refreshInsight: options.refreshInsight,
      });

      if ('deferred' in result && result.deferred) {
        return {
          status: 'skipped',
          ideaExtractMode: mode,
          ideaExtractSkipped: true,
          ideaExtractReason: 'deferred',
          ideaExtractDeferred: true,
          ideaExtractTrace: ['deferred'],
          message: `${result.reason} inflight=${result.inflight}/${result.maxInflight}`,
        };
      }

      const completedResult = result as Exclude<typeof result, { deferred: true }>;

      return {
        status: 'executed',
        ideaSummary: completedResult.ideaSummary,
        productForm: completedResult.productForm,
        ideaExtractMode: completedResult.extractMode ?? mode,
        ideaExtractSkipped: false,
        ideaExtractReason:
          completedResult.extractMode === 'light'
            ? 'eligible_light_value'
            : 'eligible_high_value',
        ideaExtractDeferred: false,
        ideaExtractTrace: [
          completedResult.extractMode === 'light'
            ? 'idea_extract_mode_light'
            : 'idea_extract_mode_full',
        ],
        message: fastFilterDidNotPass
          ? 'Idea extraction executed after rough filter did not pass.'
          : 'Idea extraction executed successfully.',
      };
    } catch (error) {
      return {
        status: 'failed',
        ideaExtractMode: mode,
        ideaExtractSkipped: false,
        ideaExtractReason: 'execution_failed',
        ideaExtractDeferred: false,
        ideaExtractTrace: ['execution_failed'],
        message: error instanceof Error ? error.message : 'Idea extraction failed.',
      };
    }
  }

  private async shouldRunIdeaExtract(
    repositoryId: string,
  ): Promise<IdeaExtractGateDecision> {
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

    const snapshot = this.ideaSnapshotService.readIdeaSnapshot(
      repository.analysis?.ideaSnapshotJson,
    );
    const verdict = this.readVerdict(repository.analysis?.insightJson);
    const categoryMain =
      this.readCategoryMain(repository.analysis?.insightJson) ??
      snapshot?.category?.main ??
      this.readString(repository.categoryL1);
    const toolLike =
      snapshot?.toolLike === true ||
      (this.toNumber(repository.toolLikeScore) ?? 0) >= 65;
    const ideaFitScore =
      this.toNumber(repository.ideaFitScore) ??
      this.readIdeaFitScore(repository.analysis?.ideaFitJson) ??
      0;
    const haystack = [
      repository.name,
      repository.fullName,
      repository.description,
      repository.language,
      ...(repository.topics ?? []),
      repository.content?.readmeText?.slice(0, 1600) ?? '',
    ]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();
    const readmeText = repository.content?.readmeText?.trim() ?? '';
    const insight = this.readJsonObject(repository.analysis?.insightJson);
    const claudeReview =
      repository.analysis?.claudeReviewStatus === 'SUCCESS'
        ? this.readJsonObject(repository.analysis?.claudeReviewJson)
        : null;
    const projectReality = this.readJsonObject(insight?.projectReality);
    const { strength: baseStrength } = resolveEffectiveOneLinerStrength({
      localStrength: this.readOneLinerStrength(insight?.oneLinerStrength),
      claudeStrength: this.readOneLinerStrength(claudeReview?.oneLinerStrength),
      updatedAt: repository.updatedAtGithub ?? repository.updatedAt,
      createdAt: repository.createdAtGithub ?? repository.createdAt,
    });
    const tuningPolicy = await this.selfTuningService.getCurrentPolicy();
    const trainingKnowledge =
      await this.analysisTrainingKnowledgeService.getLatestKnowledge();
    const forceLightAnalysis = this.shouldForceLightIdeaAnalysis({
      snapshot,
      insight,
      claudeReview,
      projectReality,
      baseStrength,
    });

    const gate = evaluateIdeaExtractGate({
      snapshotIsPromising: snapshot?.isPromising === true,
      toolLike,
      verdict,
      oneLinerStrength: baseStrength,
      forceLightAnalysis,
      loadLevel: tuningPolicy.systemLoadLevel,
      ideaFitScore,
      readmeLength: readmeText.length,
      categoryMain,
      haystack,
      projectRealityType: this.readProjectRealityType(projectReality?.type),
      heuristicAdjustments: trainingKnowledge?.heuristicAdjustments ?? null,
    });
    return {
      ...gate,
      strength: baseStrength,
      effectiveStrength: baseStrength,
    };
  }

  private shouldForceLightIdeaAnalysis(input: {
    snapshot: { isPromising: boolean; nextAction: string } | null;
    insight: Record<string, unknown> | null;
    claudeReview: Record<string, unknown> | null;
    projectReality: Record<string, unknown> | null;
    baseStrength: 'STRONG' | 'MEDIUM' | 'WEAK' | null;
  }) {
    const insightVerdict = this.readString(input.insight?.verdict);
    const insightAction = this.readString(input.insight?.action);
    const claudeVerdict = this.readString(input.claudeReview?.verdict);
    const claudeAction = this.readString(input.claudeReview?.action);
    const insightOneLiner = this.readString(input.insight?.oneLinerZh);
    const claudeOneLiner = this.readString(input.claudeReview?.oneLinerZh);
    const insightType = this.readProjectRealityType(
      this.readJsonObject(input.insight?.projectReality)?.type,
    );
    const claudeType = this.readProjectRealityType(input.claudeReview?.projectType);
    const confidence = this.readNumber(input.insight?.confidence);
    const strongBusinessSignals =
      this.readBoolean(input.projectReality?.hasRealUser) &&
      this.readBoolean(input.projectReality?.hasClearUseCase) &&
      this.readBoolean(input.projectReality?.isDirectlyMonetizable);
    const highLocalIntent =
      input.baseStrength === 'STRONG' ||
      insightVerdict === 'GOOD' ||
      (insightVerdict === 'OK' && insightAction === 'CLONE' && strongBusinessSignals);
    const hasConflict =
      Boolean(claudeVerdict && insightVerdict && claudeVerdict !== insightVerdict) ||
      Boolean(claudeAction && insightAction && claudeAction !== insightAction) ||
      Boolean(claudeType && insightType && claudeType !== insightType) ||
      Boolean(
        claudeOneLiner &&
          insightOneLiner &&
          claudeOneLiner.trim() !== insightOneLiner.trim(),
      );
    const needsRecheck =
      hasConflict || (confidence > 0 && confidence < 0.45) || input.baseStrength === 'STRONG';
    const snapshotSkipped =
      input.snapshot?.isPromising === false || input.snapshot?.nextAction === 'SKIP';

    return (
      highLocalIntent ||
      strongBusinessSignals ||
      hasConflict ||
      (snapshotSkipped && needsRecheck)
    );
  }

  private async selectBatchRepositories(dto: BatchRunAnalysisDto) {
    if (dto.repositoryIds?.length) {
      return this.prisma.repository.findMany({
        where: {
          id: {
            in: dto.repositoryIds,
          },
        },
        take: dto.limit,
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          analysis: true,
        },
      });
    }

    if (!dto.onlyIfMissing) {
      return this.prisma.repository.findMany({
        take: dto.limit,
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          analysis: true,
        },
      });
    }

    const candidates = await this.prisma.repository.findMany({
      take: Math.min(dto.limit * 5, 500),
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        analysis: true,
      },
    });

    return candidates
      .filter((repository) => this.isMissingAnyRequestedAnalysis(repository, dto))
      .slice(0, dto.limit);
  }

  private resolveBatchAnalysisConcurrency() {
    const requested = this.readPositiveInt(
      process.env.BATCH_ANALYSIS_CONCURRENCY,
      2,
    );
    const maxAllowed = this.readPositiveInt(
      process.env.DEEP_ANALYSIS_CONCURRENCY,
      6,
    );

    return Math.max(1, Math.min(requested, maxAllowed));
  }

  private buildInsightBehaviorContext(
    dto: RunAnalysisDto,
  ): InsightRefreshBehaviorContext {
    return {
      userSuccessPatterns: dto.userSuccessPatterns ?? [],
      userFailurePatterns: dto.userFailurePatterns ?? [],
      preferredCategories: dto.preferredCategories ?? [],
      avoidedCategories: dto.avoidedCategories ?? [],
      recentValidatedWins: dto.recentValidatedWins ?? [],
      recentDroppedReasons: dto.recentDroppedReasons ?? [],
    };
  }

  private isMissingAnyRequestedAnalysis(
    repository: RepositoryWithAnalysisState,
    dto: RunAnalysisDto,
  ) {
    if (dto.runCompleteness && !this.hasCompletenessResult(repository)) {
      return true;
    }

    if (dto.runIdeaFit && !this.hasIdeaFitResult(repository)) {
      return true;
    }

    if (dto.runIdeaExtract && !this.hasIdeaExtractResult(repository)) {
      return true;
    }

    return false;
  }

  private hasCompletenessResult(repository: RepositoryWithAnalysisState) {
    return (
      repository.completenessScore != null ||
      repository.analysis?.completenessJson != null
    );
  }

  private hasIdeaFitResult(repository: RepositoryWithAnalysisState) {
    return repository.ideaFitScore != null || repository.analysis?.ideaFitJson != null;
  }

  private hasIdeaExtractResult(repository: RepositoryWithAnalysisState) {
    return repository.analysis?.extractedIdeaJson != null;
  }

  private readIdeaFitOpportunityLevel(value: Prisma.JsonValue | null | undefined) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const normalized = value as Record<string, unknown>;
      return typeof normalized.opportunityLevel === 'string'
        ? normalized.opportunityLevel
        : null;
    }

    return null;
  }

  private readIdeaSummary(value: Prisma.JsonValue | null | undefined) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const normalized = value as Record<string, unknown>;
      return typeof normalized.ideaSummary === 'string' ? normalized.ideaSummary : null;
    }

    return null;
  }

  private readIdeaProductForm(value: Prisma.JsonValue | null | undefined) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const normalized = value as Record<string, unknown>;
      return typeof normalized.productForm === 'string' ? normalized.productForm : null;
    }

    return null;
  }

  private readIdeaExtractMode(
    value: Prisma.JsonValue | null | undefined,
  ): IdeaExtractExecutionMode | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const normalized = value as Record<string, unknown>;
      const mode = String(normalized.extractMode ?? '').toLowerCase();
      if (mode === 'full' || mode === 'light' || mode === 'skip') {
        return mode;
      }
    }

    return null;
  }

  private resolveOverallAction(steps: AnalysisRunSteps) {
    const statuses = Object.values(steps).map((step) => step.status);

    if (statuses.some((status) => status === 'failed')) {
      return 'failed' as const;
    }

    if (statuses.every((status) => status === 'skipped')) {
      return 'skipped' as const;
    }

    return 'executed' as const;
  }

  private buildOverallMessage(steps: AnalysisRunSteps) {
    const failedSteps = Object.entries(steps)
      .filter(([, step]) => step.status === 'failed')
      .map(([name]) => name);

    if (failedSteps.length > 0) {
      return `Analysis run completed with failed step(s): ${failedSteps.join(', ')}.`;
    }

    if (Object.values(steps).every((step) => step.status === 'skipped')) {
      return 'Analysis run skipped because all requested results already exist.';
    }

    return 'Analysis run completed.';
  }

  private buildFailedSteps(message: string): AnalysisRunSteps {
    return {
      fastFilter: { status: 'failed', message },
      completeness: { status: 'failed', message },
      ideaFit: { status: 'failed', message },
      ideaExtract: { status: 'failed', message },
    };
  }

  private buildSingleJobResultSummary(result: AnalysisRunResult) {
    return {
      repositoryId: result.repositoryId,
      action: this.resolveOverallAction(result.steps),
      steps: result.steps,
    };
  }

  private async recordDeepRuntimeStats(input: {
    deepEnteredCount: number;
    deepSkippedCount: number;
    ideaExtractExecutedCount: number;
    ideaExtractSkippedCount: number;
    ideaExtractSkippedByStrengthCount: number;
    ideaExtractDeferredCount: number;
    ideaExtractTimeoutCount: number;
    lastIdeaExtractInflight: number;
    ideaExtractMaxInflight: number;
  }) {
    if (
      input.deepEnteredCount === 0 &&
      input.deepSkippedCount === 0 &&
      input.ideaExtractExecutedCount === 0 &&
      input.ideaExtractSkippedCount === 0 &&
      input.ideaExtractSkippedByStrengthCount === 0 &&
      input.ideaExtractDeferredCount === 0 &&
      input.ideaExtractTimeoutCount === 0
    ) {
      return;
    }

    const today = this.toDateKey(new Date());
    const existing = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: DEEP_RUNTIME_STATS_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });
    const current = this.readDeepRuntimeStats(existing?.configValue, today);
    const nextState: DeepRuntimeStatsState = {
      date: today,
      deepEnteredCount: current.deepEnteredCount + input.deepEnteredCount,
      deepSkippedCount: current.deepSkippedCount + input.deepSkippedCount,
      ideaExtractExecutedCount:
        current.ideaExtractExecutedCount + input.ideaExtractExecutedCount,
      ideaExtractSkippedCount:
        current.ideaExtractSkippedCount + input.ideaExtractSkippedCount,
      ideaExtractSkippedByStrengthCount:
        current.ideaExtractSkippedByStrengthCount +
        input.ideaExtractSkippedByStrengthCount,
      ideaExtractDeferredCount:
        current.ideaExtractDeferredCount + input.ideaExtractDeferredCount,
      ideaExtractTimeoutCount:
        current.ideaExtractTimeoutCount + input.ideaExtractTimeoutCount,
      lastIdeaExtractInflight: input.lastIdeaExtractInflight,
      ideaExtractMaxInflight: input.ideaExtractMaxInflight,
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.systemConfig.upsert({
      where: {
        configKey: DEEP_RUNTIME_STATS_CONFIG_KEY,
      },
      update: {
        configValue: nextState as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: DEEP_RUNTIME_STATS_CONFIG_KEY,
        configValue: nextState as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private readDeepRuntimeStats(
    value: Prisma.JsonValue | null | undefined,
    today: string,
  ): DeepRuntimeStatsState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.emptyDeepRuntimeStats(today);
    }

    const normalized = value as Record<string, unknown>;
    const date = this.readString(normalized.date) ?? today;
    if (date !== today) {
      return this.emptyDeepRuntimeStats(today);
    }

    return {
      date,
      deepEnteredCount: this.readNumber(normalized.deepEnteredCount),
      deepSkippedCount: this.readNumber(normalized.deepSkippedCount),
      ideaExtractExecutedCount: this.readNumber(
        normalized.ideaExtractExecutedCount,
      ),
      ideaExtractSkippedCount: this.readNumber(
        normalized.ideaExtractSkippedCount,
      ),
      ideaExtractSkippedByStrengthCount: this.readNumber(
        normalized.ideaExtractSkippedByStrengthCount,
      ),
      ideaExtractDeferredCount: this.readNumber(
        normalized.ideaExtractDeferredCount,
      ),
      ideaExtractTimeoutCount: this.readNumber(
        normalized.ideaExtractTimeoutCount,
      ),
      lastIdeaExtractInflight: this.readNumber(
        normalized.lastIdeaExtractInflight,
      ),
      ideaExtractMaxInflight: this.readNumber(
        normalized.ideaExtractMaxInflight,
      ),
      updatedAt: this.readString(normalized.updatedAt),
    };
  }

  private emptyDeepRuntimeStats(today: string): DeepRuntimeStatsState {
    return {
      date: today,
      deepEnteredCount: 0,
      deepSkippedCount: 0,
      ideaExtractExecutedCount: 0,
      ideaExtractSkippedCount: 0,
      ideaExtractSkippedByStrengthCount: 0,
      ideaExtractDeferredCount: 0,
      ideaExtractTimeoutCount: 0,
      lastIdeaExtractInflight: 0,
      ideaExtractMaxInflight: this.ideaExtractService.getIdeaExtractLimiterState().maxInflight,
      updatedAt: null,
    };
  }

  private readVerdict(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const normalized = value as Record<string, unknown>;
    const verdict = this.readString(normalized.verdict);
    return verdict === 'GOOD' || verdict === 'OK' || verdict === 'BAD'
      ? verdict
      : null;
  }

  private readOneLinerStrength(value: unknown) {
    const normalized = this.readString(value);
    return normalized === 'STRONG' ||
      normalized === 'MEDIUM' ||
      normalized === 'WEAK'
      ? normalized
      : null;
  }

  private readCategoryMain(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const normalized = value as Record<string, unknown>;
    const category =
      normalized.category && typeof normalized.category === 'object'
        ? (normalized.category as Record<string, unknown>)
        : null;

    return this.readString(category?.main);
  }

  private readIdeaFitScore(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const normalized = value as Record<string, unknown>;
    return this.readNumber(normalized.ideaFitScore);
  }

  private readJsonObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readProjectRealityType(value: unknown) {
    const normalized = this.readString(value)?.toLowerCase();
    if (
      normalized === 'product' ||
      normalized === 'tool' ||
      normalized === 'model' ||
      normalized === 'infra' ||
      normalized === 'demo'
    ) {
      return normalized;
    }

    return null;
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private readBoolean(value: unknown) {
    return value === true;
  }

  private isTimeoutMessage(message: string) {
    const normalized = message.toLowerCase();
    return normalized.includes('timed out') || normalized.includes('timeout');
  }

  private readPositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private toNumber(value: Prisma.Decimal | null) {
    return typeof value?.toNumber === 'function' ? value.toNumber() : null;
  }
}
