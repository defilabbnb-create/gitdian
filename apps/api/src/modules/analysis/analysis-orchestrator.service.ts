import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RepositoryRoughLevel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FastFilterService } from '../fast-filter/fast-filter.service';
import { JobLogService } from '../job-log/job-log.service';
import { BatchRunAnalysisDto } from './dto/batch-run-analysis.dto';
import { RunAnalysisDto } from './dto/run-analysis.dto';
import { CompletenessService } from './completeness.service';
import { IdeaExtractService } from './idea-extract.service';
import { IdeaFitService } from './idea-fit.service';

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

@Injectable()
export class AnalysisOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fastFilterService: FastFilterService,
    private readonly jobLogService: JobLogService,
    private readonly completenessService: CompletenessService,
    private readonly ideaFitService: IdeaFitService,
    private readonly ideaExtractService: IdeaExtractService,
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
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        analysis: true,
      },
    });

    if (!repository) {
      throw new NotFoundException(`Repository with id "${repositoryId}" was not found.`);
    }

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
        : await this.executeCompleteness(repository.id, fastFilterDidNotPass);
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
        : await this.executeIdeaFit(repository.id, fastFilterDidNotPass);
    }

    const shouldSkipIdeaExtract =
      !dto.forceRerun && this.hasIdeaExtractResult(repository);
    if (dto.runIdeaExtract) {
      steps.ideaExtract = shouldSkipIdeaExtract
        ? {
            status: 'skipped',
            ideaSummary: this.readIdeaSummary(repository.analysis?.extractedIdeaJson),
            productForm: this.readIdeaProductForm(repository.analysis?.extractedIdeaJson),
            message: 'Idea extraction already exists.',
          }
        : await this.executeIdeaExtract(repository.id, fastFilterDidNotPass);
    }

    return {
      repositoryId: repository.id,
      steps,
    };
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

    let succeeded = 0;
    let failed = 0;

    const items: Array<{
      repositoryId: string;
      action: 'executed' | 'skipped' | 'failed';
      steps: AnalysisRunSteps;
      message: string;
    }> = [];

    for (const repository of repositories) {
      try {
        const result = await this.executeRepositoryAnalysis(repository.id, dto);
        const action = this.resolveOverallAction(result.steps);

        if (action === 'failed') {
          failed += 1;
        } else {
          succeeded += 1;
        }

        items.push({
          repositoryId: repository.id,
          action,
          steps: result.steps,
          message: this.buildOverallMessage(result.steps),
        });
      } catch (error) {
        failed += 1;
        items.push({
          repositoryId: repository.id,
          action: 'failed',
          steps: this.buildFailedSteps(
            error instanceof Error ? error.message : 'Unknown analysis orchestration error.',
          ),
          message: error instanceof Error ? error.message : 'Unknown analysis orchestration error.',
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

  private async executeCompleteness(
    repositoryId: string,
    fastFilterDidNotPass: boolean,
  ): Promise<CompletenessStepResult> {
    try {
      const result = await this.completenessService.analyzeRepository(repositoryId);

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
  ): Promise<IdeaFitStepResult> {
    try {
      const result = await this.ideaFitService.analyzeRepository(repositoryId);

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
  ): Promise<IdeaExtractStepResult> {
    try {
      const result = await this.ideaExtractService.analyzeRepository(repositoryId);

      return {
        status: 'executed',
        ideaSummary: result.ideaSummary,
        productForm: result.productForm,
        message: fastFilterDidNotPass
          ? 'Idea extraction executed after rough filter did not pass.'
          : 'Idea extraction executed successfully.',
      };
    } catch (error) {
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Idea extraction failed.',
      };
    }
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
      repository.completenessScore !== null ||
      repository.analysis?.completenessJson !== null
    );
  }

  private hasIdeaFitResult(repository: RepositoryWithAnalysisState) {
    return repository.ideaFitScore !== null || repository.analysis?.ideaFitJson !== null;
  }

  private hasIdeaExtractResult(repository: RepositoryWithAnalysisState) {
    return repository.analysis?.extractedIdeaJson !== null;
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

  private toNumber(value: Prisma.Decimal | null) {
    return typeof value?.toNumber === 'function' ? value.toNumber() : null;
  }
}
