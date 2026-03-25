import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BehaviorMemoryService } from '../behavior-memory/behavior-memory.service';
import {
  AnthropicProvider,
  AnthropicProviderError,
} from '../ai/providers/anthropic.provider';
import { OmlxProvider } from '../ai/providers/omlx.provider';
import {
  ClaudeBenchmarkCalibrationReport,
  ClaudeBenchmarkLevelReport,
  ClaudeBenchmarkRequestRecord,
  ClaudeConcurrencyService,
  ClaudeReviewPriority,
} from './claude-concurrency.service';
import {
  buildClaudeProjectReviewBatchPrompt,
  buildClaudeProjectReviewPrompt,
  CLAUDE_PROJECT_REVIEW_PROMPT_VERSION,
} from './prompts/claude-project-review.prompt';
import {
  ClaudeReviewDiffRecord,
  ClaudeReviewDiffService,
} from './claude-review-diff.service';
import { ClaudeTrainingHintsService } from './claude-training-hints.service';
import {
  ClaudeBusinessSignals,
  ClaudeBusinessJudgement,
  MoneyDecision,
  MoneyPriorityService,
} from './money-priority.service';
import { AnalysisTrainingKnowledgeService } from './analysis-training-knowledge.service';
import { MoneyLearningService } from './money-learning.service';
import {
  RepositoryDecisionService,
  RepositoryFinalDecision,
  RepositoryTrainingAsset,
} from './repository-decision.service';
import { RepositoryCachedRankingService } from './repository-cached-ranking.service';
import {
  isBoundaryHighValueClaudeCandidate,
  isClaudePriorityAllowedForLoad,
  resolveClaudeReviewPriority,
  ClaudeReviewPrioritySource,
  shouldSkipClaudeReviewByStrength,
} from './helpers/claude-review-priority.helper';
import {
  condenseRepositoryOneLiner,
  OneLinerRiskFlag,
} from './helpers/one-liner-condenser.helper';
import {
  evaluateOneLinerStrength,
  OneLinerStrength,
  resolveEffectiveOneLinerStrength,
} from './helpers/one-liner-strength.helper';
import { SelfTuningService } from './self-tuning.service';

type RepositoryReviewTarget = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
  };
}>;

type ClaudeReviewProjectType = 'product' | 'tool' | 'model' | 'infra' | 'demo';
type ClaudeReviewVerdict = 'GOOD' | 'OK' | 'BAD';
type ClaudeReviewAction = 'BUILD' | 'CLONE' | 'IGNORE';
type InsightAnchorMatch = 'GOOD' | 'CLONE' | 'BAD';
type ClaudeReviewSource =
  | 'manual'
  | 'scheduler'
  | 'daily_summary'
  | 'telegram'
  | 'homepage_money_first'
  | 'replay';
type ClaudeReviewGeneratedBy = 'claude' | 'local_fallback';
type ReplayPriority = 'P0' | 'P1' | 'P2';
type ClaudeBatchReviewRecord = ClaudeReviewRecord & {
  repoId: string;
  changed?: boolean;
};

export type ClaudeTrainingHints = {
  localModelMistakes: string[];
  ruleSuggestions: string[];
  promptSuggestions: string[];
  anchorSuggestions: string[];
  shouldUpdateLocalHeuristics: boolean;
};

export type ClaudeOneLinerMeta = {
  confidence: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
  reasoning?: string[];
  riskFlags: OneLinerRiskFlag[];
  strength: OneLinerStrength;
};

export type ClaudeReviewBusinessJudgement = ClaudeBusinessJudgement;
export type ClaudeReviewBusinessSignals = ClaudeBusinessSignals;

type ClaudeFallbackDiff = {
  changed: boolean;
  reasons: string[];
  previousReviewedAt: string | null;
};

export type ClaudeReviewRecord = {
  oneLinerZh: string;
  oneLinerMeta?: ClaudeOneLinerMeta;
  oneLinerStrength?: OneLinerStrength;
  projectType: ClaudeReviewProjectType;
  hasRealUser: boolean;
  hasClearUseCase: boolean;
  hasProductizationPath: boolean;
  isDirectlyMonetizable: boolean;
  businessJudgement: ClaudeReviewBusinessJudgement;
  businessSignals: ClaudeReviewBusinessSignals;
  moneyDecision: MoneyDecision;
  verdict: ClaudeReviewVerdict;
  action: ClaudeReviewAction;
  reason: string;
  confidence: number;
  whyNotProduct: string | null;
  reviewNotes: string[];
  reviewedAt: string;
  provider: 'claude' | 'local_fallback';
  model: string | null;
  promptVersion: string;
  generatedBy: ClaudeReviewGeneratedBy;
  needsClaudeReview: boolean;
  fallbackAt: string | null;
  priority: ClaudeReviewPriority;
  trainingHints: ClaudeTrainingHints;
  reviewDiff: ClaudeReviewDiffRecord;
  fallbackDiff?: ClaudeFallbackDiff;
};

type LocalInsightMetadata = {
  oneLinerZh: string;
  oneLinerStrength: OneLinerStrength | null;
  verdict: ClaudeReviewVerdict;
  action: ClaudeReviewAction;
  reason: string;
  projectType: ClaudeReviewProjectType;
  hasRealUser: boolean;
  hasClearUseCase: boolean;
  hasProductizationPath: boolean;
  isDirectlyMonetizable: boolean;
  whyNotProduct: string | null;
  anchorMatch: 'GOOD' | 'CLONE' | 'BAD';
  confidence: number;
  ideaFitScore: number | null;
  completenessLevel: string | null;
  looksLikeTemplateOrDemo: boolean;
};

type NormalizeReviewContext = {
  fallbackOneLiner: string;
  repository: RepositoryReviewTarget;
  localInsight: LocalInsightMetadata;
  previousFallbackReview: Record<string, unknown> | null;
};

type NormalizeReviewOptions = {
  generatedBy: ClaudeReviewGeneratedBy;
  priority: ClaudeReviewPriority;
  fallbackAt?: string | null;
};

type LocalProductSignals = {
  hasProductizationPath: boolean;
  hasMonetizationPath: boolean;
  hasWorkflowBoundary: boolean;
};

type ClaudeReviewRuntimeState = {
  date: string;
  reviewedCount: number;
  reviewedRepositoryIds: string[];
  lastRunAt: string | null;
  lastError: string | null;
  batchCallCount: number;
  totalBatchItems: number;
  changedCount: number;
  downgradedCount: number;
  oneLinerRewriteCount: number;
  goodCorrectedCount: number;
};

type ReplayCandidate = {
  repositoryId: string;
  priority: ReplayPriority;
  reviewedAt: number;
};

type ReviewTriggerReason =
  | 'good_candidate'
  | 'low_confidence_ok'
  | 'reality_anchor_conflict'
  | 'boundary_model_or_infra'
  | 'one_liner_drift'
  | 'top_candidate'
  | 'forced';

type ReviewDecisionContext = {
  finalDecision: RepositoryFinalDecision | null;
  trainingAsset: RepositoryTrainingAsset | null;
  moneyPriority: {
    score: number;
    tier: 'P0' | 'P1' | 'P2' | 'P3';
    reasonZh: string;
    recommendedMoveZh: string;
    targetUsersZh: string;
    monetizationSummaryZh: string;
  } | null;
  hasConflict: boolean;
  needsClaudeReview: boolean;
};

type ReviewRepositoryResult =
  | {
      status: 'reviewed';
      repositoryId: string;
      reason: ReviewTriggerReason;
      review: ClaudeReviewRecord;
      latencyMs: number;
      changed: boolean;
    }
  | {
      status: 'skipped';
      repositoryId: string;
      reason:
        | 'not_enabled'
        | 'not_configured'
        | 'manual_override_present'
        | 'not_eligible'
        | 'already_reviewed'
        | 'daily_limit_reached'
        | 'strength_weak'
        | 'priority_shed'
        | 'backpressure_shed'
        | 'fallback_active';
    }
  | {
      status: 'failed';
      repositoryId: string;
      reason: ReviewTriggerReason;
      error: string;
    };

type PreparedReviewCandidate = {
  repository: RepositoryReviewTarget;
  localInsight: LocalInsightMetadata;
  decisionContext: ReviewDecisionContext;
  promptInput: Record<string, unknown>;
  requestHash: string;
  priority: ClaudeReviewPriority;
  triggerReason: ReviewTriggerReason;
};

type UserBehaviorPreferenceContext = {
  userSuccessPatterns?: string[];
  userFailurePatterns?: string[];
  userSuccessReasons?: string[];
  userFailureReasons?: string[];
  preferredCategories?: string[];
  avoidedCategories?: string[];
  recentValidatedWins?: string[];
  recentDroppedReasons?: string[];
  minEvidenceThreshold?: number;
  failureWeightDecay?: number;
};

const CLAUDE_REVIEW_RUNTIME_CONFIG_KEY = 'claude.review.runtime_state';
const CLAUDE_BENCHMARK_CONCURRENCY_LEVELS = [2, 4, 6, 8, 10, 12] as const;

@Injectable()
export class ClaudeReviewService {
  private readonly logger = new Logger(ClaudeReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly omlxProvider: OmlxProvider,
    private readonly claudeConcurrencyService: ClaudeConcurrencyService,
    private readonly claudeReviewDiffService: ClaudeReviewDiffService,
    private readonly claudeTrainingHintsService: ClaudeTrainingHintsService,
    private readonly moneyPriorityService: MoneyPriorityService,
    private readonly analysisTrainingKnowledgeService: AnalysisTrainingKnowledgeService,
    private readonly moneyLearningService: MoneyLearningService,
    private readonly repositoryDecisionService: RepositoryDecisionService,
    private readonly repositoryCachedRankingService: RepositoryCachedRankingService,
    private readonly selfTuningService: SelfTuningService,
    private readonly behaviorMemoryService: BehaviorMemoryService,
  ) {}

  isEnabled() {
    return this.anthropicProvider.isEnabled();
  }

  isConfigured() {
    return this.anthropicProvider.isConfigured();
  }

  async reviewRepository(
    repositoryId: string,
    options?: {
      force?: boolean;
      forceRefresh?: boolean;
      topCandidate?: boolean;
      source?: ClaudeReviewSource;
      priorityOverride?: ClaudeReviewPriority;
      userSuccessPatterns?: string[];
      userFailurePatterns?: string[];
      userSuccessReasons?: string[];
      userFailureReasons?: string[];
      preferredCategories?: string[];
      avoidedCategories?: string[];
      recentValidatedWins?: string[];
      recentDroppedReasons?: string[];
      minEvidenceThreshold?: number;
      failureWeightDecay?: number;
    },
  ): Promise<ReviewRepositoryResult> {
    if (!this.isEnabled()) {
      return {
        status: 'skipped',
        repositoryId,
        reason: 'not_enabled',
      };
    }

    if (!this.isConfigured()) {
      return {
        status: 'skipped',
        repositoryId,
        reason: 'not_configured',
      };
    }

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
    const preparedCandidate = await this.prepareReviewCandidateFromRepository(
      repository,
      options,
    );
    if ('status' in preparedCandidate) {
      return preparedCandidate;
    }

    const dailyBudgeted = await this.applyDailyBudget([preparedCandidate], {
      forceRefresh: options?.force === true || options?.forceRefresh === true,
    });
    if (!dailyBudgeted.allowed.length) {
      return dailyBudgeted.skipped[0] ?? {
        status: 'skipped',
        repositoryId,
        reason: 'daily_limit_reached',
      };
    }

    return this.executeSinglePreparedReview(dailyBudgeted.allowed[0], options);
  }

  async reviewRepositoryIds(
    repositoryIds: string[],
    options?: {
      force?: boolean;
      forceRefresh?: boolean;
      topCandidate?: boolean;
      source?: ClaudeReviewSource;
      priorityOverride?: ClaudeReviewPriority;
      maxPerRun?: number;
      userSuccessPatterns?: string[];
      userFailurePatterns?: string[];
      preferredCategories?: string[];
      avoidedCategories?: string[];
      recentValidatedWins?: string[];
      recentDroppedReasons?: string[];
    },
  ) {
    const uniqueIds = Array.from(
      new Set(
        repositoryIds
          .map((item) => String(item ?? '').trim())
          .filter((item) => Boolean(item)),
      ),
    );
    const maxPerRun = Math.max(
      1,
      Math.min(
        options?.maxPerRun ?? this.readInt('CLAUDE_REVIEW_MAX_PER_RUN', 10),
        uniqueIds.length || 1,
      ),
    );
    const candidateIds = uniqueIds.slice(0, maxPerRun * 3);
    const fallbackMode = await this.claudeConcurrencyService.shouldUseLocalFallback();

    if (fallbackMode) {
      const fallbackCandidates = candidateIds.slice(0, maxPerRun);
      const results = await Promise.all(
        fallbackCandidates.map((repositoryId) =>
          this.reviewRepository(repositoryId, {
            force: options?.force,
            forceRefresh: options?.forceRefresh,
            topCandidate: options?.topCandidate,
            source: options?.source,
            priorityOverride: options?.priorityOverride,
            userSuccessPatterns: options?.userSuccessPatterns,
            userFailurePatterns: options?.userFailurePatterns,
            preferredCategories: options?.preferredCategories,
            avoidedCategories: options?.avoidedCategories,
            recentValidatedWins: options?.recentValidatedWins,
            recentDroppedReasons: options?.recentDroppedReasons,
          }),
        ),
      );

      return {
        processed: fallbackCandidates.length,
        results,
      };
    }

    const repositories = await this.prisma.repository.findMany({
      where: {
        id: {
          in: candidateIds,
        },
      },
      include: {
        content: true,
        analysis: true,
      },
    });
    const repositoryMap = new Map(repositories.map((item) => [item.id, item]));
    const prepared: PreparedReviewCandidate[] = [];
    const skipped: ReviewRepositoryResult[] = [];

    for (const repositoryId of candidateIds) {
      const repository = repositoryMap.get(repositoryId);
      if (!repository) {
        continue;
      }

      const preparedCandidate = await this.prepareReviewCandidateFromRepository(
        repository,
        options,
      );

      if ('status' in preparedCandidate) {
        skipped.push(preparedCandidate);
        continue;
      }

      prepared.push(preparedCandidate);
    }

    const dailyBudgeted = await this.applyDailyBudget(prepared, {
      forceRefresh: options?.force === true || options?.forceRefresh === true,
    });
    skipped.push(...dailyBudgeted.skipped);

    const selected = dailyBudgeted.allowed.slice(0, maxPerRun);
    const batchedResults = await this.reviewPreparedCandidatesInBatches(
      selected,
      options,
    );
    const results = [...batchedResults, ...skipped];

    return {
      processed: results.length,
      results,
    };
  }

  private async prepareReviewCandidateFromRepository(
    repository: RepositoryReviewTarget,
    options?: {
      force?: boolean;
      forceRefresh?: boolean;
      topCandidate?: boolean;
      source?: ClaudeReviewSource;
      priorityOverride?: ClaudeReviewPriority;
      userSuccessPatterns?: string[];
      userFailurePatterns?: string[];
      preferredCategories?: string[];
      avoidedCategories?: string[];
      recentValidatedWins?: string[];
      recentDroppedReasons?: string[];
    },
  ): Promise<PreparedReviewCandidate | ReviewRepositoryResult> {
    const bypassManualOverride = options?.force === true;
    const forceRefresh = options?.force === true || options?.forceRefresh === true;

    if (
      !bypassManualOverride &&
      (repository.analysis?.manualVerdict ||
        repository.analysis?.manualAction ||
        repository.analysis?.manualNote)
    ) {
      return {
        status: 'skipped',
        repositoryId: repository.id,
        reason: 'manual_override_present',
      };
    }

    const localInsight = this.readLocalInsight(repository);
    const existingClaudeReview =
      repository.analysis?.claudeReviewStatus === 'SUCCESS'
        ? this.readJsonObject(repository.analysis?.claudeReviewJson)
        : null;
    const auditSnapshot =
      await this.repositoryDecisionService.getLatestAuditSnapshot();
    const derivedRepository =
      this.repositoryDecisionService.attachDerivedAssetsWithAudit(
        repository as unknown as Record<string, unknown>,
        auditSnapshot,
      ) as Record<string, unknown>;
    const decisionContext = this.readDecisionContext(derivedRepository);
    const tuningPolicy = await this.selfTuningService.getCurrentPolicy();
    const { strength: baseOneLinerStrength } =
      resolveEffectiveOneLinerStrength({
        localStrength: localInsight.oneLinerStrength,
        claudeStrength: this.normalizeOneLinerStrength(
          existingClaudeReview?.oneLinerStrength,
        ),
        updatedAt: repository.updatedAtGithub ?? repository.updatedAt,
        createdAt: repository.createdAtGithub ?? repository.createdAt,
      });
    const effectiveOneLinerStrength = baseOneLinerStrength;

    if (shouldSkipClaudeReviewByStrength(effectiveOneLinerStrength)) {
      this.logger.log(
        `claude_review skipped repositoryId=${repository.id} strength=${baseOneLinerStrength ?? 'unknown'} effectiveStrength=${effectiveOneLinerStrength ?? 'unknown'} skippedReason=strength_weak loadLevel=${tuningPolicy.systemLoadLevel}`,
      );
      return {
        status: 'skipped',
        repositoryId: repository.id,
        reason: 'strength_weak',
      };
    }

    const triggerReason = this.resolveTriggerReason(localInsight, {
      force: forceRefresh,
      topCandidate: options?.topCandidate === true,
      source: options?.source,
      decisionContext,
      oneLinerStrength: effectiveOneLinerStrength,
    });

    if (!triggerReason) {
      return {
        status: 'skipped',
        repositoryId: repository.id,
        reason: 'not_eligible',
      };
    }

    const mergedBehaviorContext = await this.mergeUserBehaviorContext(options);
    const promptInput = this.buildPromptInput(
      repository,
      localInsight,
      decisionContext,
      await this.moneyLearningService.getLatestLearningBrief(),
      mergedBehaviorContext,
    );
    const requestHash = this.hashRequest({
      promptVersion: CLAUDE_PROJECT_REVIEW_PROMPT_VERSION,
      promptInput,
    });

    if (
      !forceRefresh &&
      repository.analysis?.claudeReviewRequestHash === requestHash &&
      this.wasReviewedRecently(repository.analysis?.claudeReviewReviewedAt)
    ) {
      return {
        status: 'skipped',
        repositoryId: repository.id,
        reason: 'already_reviewed',
      };
    }

    const priority =
      options?.priorityOverride ??
      this.adjustPriorityForTriggerReason(
        this.resolveReviewPriority(localInsight, decisionContext, {
          source: options?.source,
          topCandidate: options?.topCandidate === true,
          oneLinerStrength: effectiveOneLinerStrength,
        }),
        triggerReason,
      );

    if (
      !isClaudePriorityAllowedForLoad(priority, tuningPolicy.systemLoadLevel)
    ) {
      this.logger.log(
        `claude_review skipped repositoryId=${repository.id} strength=${baseOneLinerStrength ?? 'unknown'} effectiveStrength=${effectiveOneLinerStrength ?? 'unknown'} skippedReason=priority_shed loadLevel=${tuningPolicy.systemLoadLevel} priority=${priority}`,
      );
      return {
        status: 'skipped',
        repositoryId: repository.id,
        reason: 'priority_shed',
      };
    }

    return {
      repository,
      localInsight,
      decisionContext,
      promptInput,
      requestHash,
      priority,
      triggerReason,
    };
  }

  private async applyDailyBudget(
    candidates: PreparedReviewCandidate[],
    options?: {
      forceRefresh?: boolean;
    },
  ) {
    const runtimeState = await this.getRuntimeState();
    const claudeRuntimeState = await this.claudeConcurrencyService.getRuntimeState();
    const dailyLimit = this.readInt('CLAUDE_REVIEW_DAILY_LIMIT', 50);

    if (options?.forceRefresh || claudeRuntimeState.mode === 'FALLBACK') {
      return {
        allowed: candidates,
        skipped: [] as ReviewRepositoryResult[],
      };
    }

    const remaining =
      dailyLimit - runtimeState.reviewedCount > 0
        ? dailyLimit - runtimeState.reviewedCount
        : 0;
    if (remaining >= candidates.length) {
      return {
        allowed: candidates,
        skipped: [] as ReviewRepositoryResult[],
      };
    }

    const allowed = candidates.slice(0, remaining);
    const skipped = candidates.slice(remaining).map(
      (candidate): ReviewRepositoryResult => ({
        status: 'skipped',
        repositoryId: candidate.repository.id,
        reason: 'daily_limit_reached',
      }),
    );

    return {
      allowed,
      skipped,
    };
  }

  private async reviewPreparedCandidatesInBatches(
    candidates: PreparedReviewCandidate[],
    options?: {
      force?: boolean;
      forceRefresh?: boolean;
      topCandidate?: boolean;
      source?: ClaudeReviewSource;
      priorityOverride?: ClaudeReviewPriority;
    },
  ) {
    if (!candidates.length) {
      return [] as ReviewRepositoryResult[];
    }

    const ordered = [...candidates].sort(
      (left, right) => this.priorityRank(left.priority) - this.priorityRank(right.priority),
    );
    const batches: PreparedReviewCandidate[][] = [];

    for (const priority of ['P0', 'P1', 'P2', 'P3'] as const) {
      const matching = ordered.filter((candidate) => candidate.priority === priority);
      const batchSize = this.resolveBatchSize(priority);
      for (let index = 0; index < matching.length; index += batchSize) {
        batches.push(matching.slice(index, index + batchSize));
      }
    }

    const batchResults = await Promise.all(
      batches.map((batch) => this.reviewPreparedBatch(batch, options)),
    );

    return batchResults.flat();
  }

  private async reviewPreparedBatch(
    batch: PreparedReviewCandidate[],
    options?: {
      force?: boolean;
      forceRefresh?: boolean;
      topCandidate?: boolean;
      source?: ClaudeReviewSource;
      priorityOverride?: ClaudeReviewPriority;
    },
  ): Promise<ReviewRepositoryResult[]> {
    if (!batch.length) {
      return [];
    }

    if (batch.length === 1) {
      return [await this.executeSinglePreparedReview(batch[0], options)];
    }

    const highestPriority = batch.reduce(
      (best, candidate) =>
        this.priorityRank(candidate.priority) < this.priorityRank(best)
          ? candidate.priority
          : best,
      batch[0].priority,
    );
    const prompt = buildClaudeProjectReviewBatchPrompt(
      batch.map((candidate) => ({
        repoId: candidate.repository.id,
        input: candidate.promptInput,
      })),
    );

    try {
      const execution =
        await this.claudeConcurrencyService.generateJson<ClaudeBatchReviewRecord[]>(
          {
            prompt: prompt.prompt,
            systemPrompt: prompt.systemPrompt,
            schemaHint: prompt.schemaHint,
          },
          {
            priority: highestPriority,
            batchSize: batch.length,
          },
        );

      if (execution.status === 'skipped') {
        if (execution.reason === 'fallback_active') {
          return Promise.all(
            batch.map((candidate) =>
              this.reviewRepository(candidate.repository.id, {
                force: options?.force,
                forceRefresh: true,
                topCandidate:
                  options?.topCandidate ||
                  candidate.priority === 'P0' ||
                  candidate.priority === 'P1',
                source: options?.source,
                priorityOverride: candidate.priority,
              }),
            ),
          );
        }

        return batch.map(
          (candidate): ReviewRepositoryResult => ({
            status: 'skipped',
            repositoryId: candidate.repository.id,
            reason: execution.reason,
          }),
        );
      }

      const rawReviews = Array.isArray(execution.result.data)
        ? execution.result.data
        : [];
      const reviewMap = new Map(
        rawReviews
          .map((item) => {
            const repoId = String(item?.repoId ?? '').trim();
            return repoId ? ([repoId, item] as const) : null;
          })
          .filter(
            (item): item is readonly [string, ClaudeBatchReviewRecord] => item !== null,
          ),
      );
      const results: ReviewRepositoryResult[] = [];
      const missing: PreparedReviewCandidate[] = [];

      for (const [index, candidate] of batch.entries()) {
        const rawReview = reviewMap.get(candidate.repository.id);
        if (!rawReview) {
          missing.push(candidate);
          continue;
        }

        results.push(
          await this.persistSuccessfulReview(candidate, rawReview, {
            provider: execution.result.provider,
            model: execution.result.model,
            latencyMs: execution.result.latencyMs,
            batchSize: batch.length,
            batchLead: index === 0,
            changedHint:
              typeof rawReview.changed === 'boolean' ? rawReview.changed : null,
            source: options?.source,
          }),
        );
      }

      if (missing.length) {
        results.push(
          ...(await Promise.all(
            missing.map((candidate) =>
              this.executeSinglePreparedReview(candidate, options),
            ),
          )),
        );
      }

      return results;
    } catch (error) {
      this.logger.warn(
        `claude_review batch_failed size=${batch.length} error=${
          error instanceof Error ? error.message : 'Unknown batch error'
        }`,
      );

      return Promise.all(
        batch.map((candidate) => this.executeSinglePreparedReview(candidate, options)),
      );
    }
  }

  private async executeSinglePreparedReview(
    candidate: PreparedReviewCandidate,
    options?: {
      source?: ClaudeReviewSource;
    },
  ): Promise<ReviewRepositoryResult> {
    const prompt = buildClaudeProjectReviewPrompt(candidate.promptInput);
    const claudeRuntimeState = await this.claudeConcurrencyService.getRuntimeState();

    if (claudeRuntimeState.mode === 'FALLBACK') {
      return this.reviewRepositoryWithLocalFallback(
        candidate.repository,
        prompt,
        candidate.localInsight,
        candidate.triggerReason,
        candidate.requestHash,
        candidate.priority,
        options?.source ?? 'manual',
      );
    }

    try {
      const execution =
        await this.claudeConcurrencyService.generateJson<ClaudeReviewRecord>(
          {
            prompt: prompt.prompt,
            systemPrompt: prompt.systemPrompt,
            schemaHint: prompt.schemaHint,
          },
          {
            priority: candidate.priority,
            batchSize: 1,
          },
        );

      if (execution.status === 'skipped') {
        if (execution.reason === 'fallback_active') {
          return this.reviewRepositoryWithLocalFallback(
            candidate.repository,
            prompt,
            candidate.localInsight,
            candidate.triggerReason,
            candidate.requestHash,
            candidate.priority,
            options?.source ?? 'manual',
          );
        }

        return {
          status: 'skipped',
          repositoryId: candidate.repository.id,
          reason: execution.reason,
        };
      }

      return this.persistSuccessfulReview(candidate, execution.result.data, {
        provider: execution.result.provider,
        model: execution.result.model,
        latencyMs: execution.result.latencyMs,
        batchSize: 1,
        batchLead: true,
        changedHint: null,
        source: options?.source,
      });
    } catch (error) {
      return this.persistFailedReview(candidate, error);
    }
  }

  private async persistSuccessfulReview(
    candidate: PreparedReviewCandidate,
    rawReview: ClaudeReviewRecord | ClaudeBatchReviewRecord,
    context: {
      provider: 'claude';
      model: string | null;
      latencyMs: number;
      batchSize: number;
      batchLead?: boolean;
      changedHint?: boolean | null;
      source?: ClaudeReviewSource;
    },
  ): Promise<ReviewRepositoryResult> {
    const normalized = this.normalizeReview(
      rawReview as ClaudeReviewRecord,
      context.model,
      {
        fallbackOneLiner: candidate.localInsight.oneLinerZh,
        repository: candidate.repository,
        localInsight: candidate.localInsight,
        previousFallbackReview: this.readPreviousFallbackReview(candidate.repository),
      },
      {
        generatedBy: 'claude',
        priority: candidate.priority,
      },
    );
    const changed =
      context.changedHint ??
      this.didReviewChangeLocal(candidate.localInsight, normalized);
    const downgraded = this.didDowngradeFromGood(candidate.localInsight, normalized);
    const oneLinerRewritten = this.didRewriteOneLiner(
      candidate.localInsight.oneLinerZh,
      normalized.oneLinerZh,
    );

    await this.prisma.repositoryAnalysis.upsert({
      where: {
        repositoryId: candidate.repository.id,
      },
      update: {
        claudeReviewJson: normalized as unknown as Prisma.InputJsonValue,
        claudeReviewStatus: 'SUCCESS',
        claudeReviewProvider: context.provider,
        claudeReviewModel: context.model,
        claudeReviewRequestHash: candidate.requestHash,
        claudeReviewReviewedAt: new Date(),
        claudeReviewError: null,
      },
      create: {
        repositoryId: candidate.repository.id,
        claudeReviewJson: normalized as unknown as Prisma.InputJsonValue,
        claudeReviewStatus: 'SUCCESS',
        claudeReviewProvider: context.provider,
        claudeReviewModel: context.model,
        claudeReviewRequestHash: candidate.requestHash,
        claudeReviewReviewedAt: new Date(),
        claudeReviewError: null,
      },
    });

    await this.bumpRuntimeState(candidate.repository.id, {
      batchCallCountDelta: context.batchLead === false ? 0 : 1,
      batchItemCountDelta: context.batchLead === false ? 0 : context.batchSize,
      changed,
      downgraded,
      oneLinerRewritten,
      goodCorrected:
        candidate.localInsight.verdict === 'GOOD' &&
        candidate.localInsight.action === 'BUILD' &&
        downgraded,
    });
    await this.repositoryCachedRankingService.refreshRepositoryRanking(
      candidate.repository.id,
    );
    this.claudeTrainingHintsService.scheduleRefresh('claude_review_saved');
    this.analysisTrainingKnowledgeService.scheduleRefresh('claude_review_saved');
    this.moneyLearningService.scheduleRefresh('claude_review_saved');
    this.logger.log(
      `claude_review reviewed repositoryId=${candidate.repository.id} source=${context.source ?? 'manual'} reason=${candidate.triggerReason} priority=${candidate.priority} verdict=${normalized.verdict} action=${normalized.action} changed=${changed} latencyMs=${context.latencyMs} batchSize=${context.batchSize}`,
    );

    return {
      status: 'reviewed',
      repositoryId: candidate.repository.id,
      reason: candidate.triggerReason,
      review: normalized,
      latencyMs: context.latencyMs,
      changed,
    };
  }

  private async persistFailedReview(
    candidate: PreparedReviewCandidate,
    error: unknown,
  ): Promise<ReviewRepositoryResult> {
    const message =
      error instanceof Error ? error.message : 'Unknown Claude review error.';

    await this.prisma.repositoryAnalysis.upsert({
      where: {
        repositoryId: candidate.repository.id,
      },
      update: {
        claudeReviewStatus: 'FAILED',
        claudeReviewProvider: 'claude',
        claudeReviewModel: process.env.CLAUDE_MODEL?.trim() || 'claude-opus-4-6',
        claudeReviewRequestHash: candidate.requestHash,
        claudeReviewReviewedAt: new Date(),
        claudeReviewError: this.cleanText(message, 500),
      },
      create: {
        repositoryId: candidate.repository.id,
        claudeReviewStatus: 'FAILED',
        claudeReviewProvider: 'claude',
        claudeReviewModel: process.env.CLAUDE_MODEL?.trim() || 'claude-opus-4-6',
        claudeReviewRequestHash: candidate.requestHash,
        claudeReviewReviewedAt: new Date(),
        claudeReviewError: this.cleanText(message, 500),
      },
    });

    await this.saveRuntimeState({
      ...(await this.getRuntimeState()),
      lastRunAt: new Date().toISOString(),
      lastError: this.cleanText(message, 300),
    });

    this.logger.warn(
      `claude_review failed repositoryId=${candidate.repository.id} reason=${candidate.triggerReason} error=${message}`,
    );

    return {
      status: 'failed',
      repositoryId: candidate.repository.id,
      reason: candidate.triggerReason,
      error: message,
    };
  }

  async replayFallbackReviews(options?: {
    maxPerRun?: number;
    maxConcurrency?: number;
  }) {
    if (await this.claudeConcurrencyService.shouldPauseReplay()) {
      return {
        processed: 0,
        results: [] as ReviewRepositoryResult[],
      };
    }

    const maxPerRun = Math.max(1, Math.min(options?.maxPerRun ?? 6, 20));
    const maxConcurrency = Math.max(1, Math.min(options?.maxConcurrency ?? 2, 2));
    const candidates = await this.selectReplayCandidates(maxPerRun);
    const results = new Array<ReviewRepositoryResult>(candidates.length);
    let cursor = 0;

    const workers = Array.from(
      { length: Math.min(maxConcurrency, candidates.length) },
      async () => {
        while (cursor < candidates.length) {
          const currentIndex = cursor;
          cursor += 1;
          const candidate = candidates[currentIndex];
          results[currentIndex] = await this.reviewRepository(
            candidate.repositoryId,
            {
              forceRefresh: true,
              source: 'replay',
              priorityOverride: candidate.priority,
              topCandidate: candidate.priority === 'P0' || candidate.priority === 'P1',
            },
          );
        }
      },
    );

    await Promise.all(workers);

    return {
      processed: candidates.length,
      results,
    };
  }

  async getRuntimeDiagnostics() {
    const runtimeState = await this.getRuntimeState();
    const claudeRuntimeState = await this.claudeConcurrencyService.getRuntimeState();
    const averageBatchSize =
      runtimeState.batchCallCount > 0
        ? Number((runtimeState.totalBatchItems / runtimeState.batchCallCount).toFixed(2))
        : 0;
    const changeRate =
      runtimeState.reviewedCount > 0
        ? Number((runtimeState.changedCount / runtimeState.reviewedCount).toFixed(3))
        : 0;
    const downgradeRate =
      runtimeState.reviewedCount > 0
        ? Number((runtimeState.downgradedCount / runtimeState.reviewedCount).toFixed(3))
        : 0;
    const oneLinerRewriteRate =
      runtimeState.reviewedCount > 0
        ? Number(
            (runtimeState.oneLinerRewriteCount / runtimeState.reviewedCount).toFixed(3),
          )
        : 0;
    const goodCorrectionRate =
      runtimeState.reviewedCount > 0
        ? Number((runtimeState.goodCorrectedCount / runtimeState.reviewedCount).toFixed(3))
        : 0;

    return {
      enabled: this.isEnabled(),
      configured: this.isConfigured(),
      runtimeState,
      claudeRuntimeState,
      model: process.env.CLAUDE_MODEL?.trim() || 'claude-opus-4-6',
      baseUrl:
        process.env.CLAUDE_API_BASE_URL?.trim() || 'https://api.anthropic.com',
      reviewTtlHours: this.readInt('CLAUDE_REVIEW_TTL_HOURS', 168),
      reviewDailyLimit: this.readInt('CLAUDE_REVIEW_DAILY_LIMIT', 50),
      reviewMaxPerRun: this.readInt('CLAUDE_REVIEW_MAX_PER_RUN', 10),
      reviewBatchSize: this.readInt('CLAUDE_REVIEW_BATCH_SIZE', 4),
      reviewOnlyForTopCandidates: this.readBoolean(
        'CLAUDE_REVIEW_ONLY_FOR_TOP_CANDIDATES',
        true,
      ),
      averageBatchSize,
      reviewsPerMinute:
        claudeRuntimeState.recentLatency && claudeRuntimeState.claudeQps
          ? Number((claudeRuntimeState.claudeQps * 60).toFixed(2))
          : 0,
      changeRate,
      downgradeRate,
      oneLinerRewriteRate,
      goodCorrectionRate,
      latestTrainingHints: await this.claudeTrainingHintsService.getLatestAggregateBrief(),
      latestTrainingKnowledge:
        await this.analysisTrainingKnowledgeService.getLatestKnowledgeBrief(),
      latestMoneyLearning: await this.moneyLearningService.getLatestLearningBrief(),
      concurrency: await this.claudeConcurrencyService.getDiagnostics(),
    };
  }

  async getRecentReviewDiffSummary(sampleSize?: number) {
    return this.claudeReviewDiffService.summarizeRecentDiffs(sampleSize ?? 80);
  }

  async getLatestTrainingHintsAggregate(options?: {
    forceRefresh?: boolean;
    sampleSize?: number;
  }) {
    if (options?.forceRefresh) {
      return this.claudeTrainingHintsService.refreshLatestAggregate({
        sampleSize: options.sampleSize,
        reason: 'manual_fetch',
        force: true,
      });
    }

    const latest = await this.claudeTrainingHintsService.getLatestAggregate();
    if (latest) {
      return latest;
    }

    return this.claudeTrainingHintsService.refreshLatestAggregate({
      sampleSize: options?.sampleSize,
      reason: 'cold_start_fetch',
      force: true,
    });
  }

  async runPressureBenchmark(): Promise<ClaudeBenchmarkCalibrationReport> {
    if (!this.isEnabled()) {
      throw new Error('Claude review is not enabled.');
    }

    if (!this.isConfigured()) {
      throw new Error('Claude review is not configured.');
    }

    const sampled = await this.selectBenchmarkRepositories();
    const levels: ClaudeBenchmarkLevelReport[] = [];

    for (const concurrency of CLAUDE_BENCHMARK_CONCURRENCY_LEVELS) {
      levels.push(
        await this.runBenchmarkLevel(concurrency, sampled.repositories),
      );
    }

    const stableConcurrency = this.computeStableConcurrency(levels);
    const report: ClaudeBenchmarkCalibrationReport = {
      model: process.env.CLAUDE_MODEL?.trim() || 'claude-opus-4-6',
      benchmarkedAt: new Date().toISOString(),
      sampleSize: sampled.repositories.length,
      sampledRepositoryIds: sampled.repositories.map((item) => item.id),
      sampleBreakdown: sampled.breakdown,
      levels,
      stableConcurrency,
      aggressive: this.clampConcurrencyStep(stableConcurrency + 2),
      safe: stableConcurrency,
      conservative: Math.max(2, stableConcurrency - 2),
      notRecommendedFrom: this.findNotRecommendedConcurrency(levels, stableConcurrency),
    };

    await this.claudeConcurrencyService.applyBenchmarkCalibration(report);
    return report;
  }

  private async reviewRepositoryWithLocalFallback(
    repository: RepositoryReviewTarget,
    prompt: ReturnType<typeof buildClaudeProjectReviewPrompt>,
    localInsight: LocalInsightMetadata,
    triggerReason: ReviewTriggerReason,
    requestHash: string,
    priority: ClaudeReviewPriority,
    source: ClaudeReviewSource,
  ): Promise<ReviewRepositoryResult> {
    try {
      const result = await this.omlxProvider.generateJson<ClaudeReviewRecord>({
        taskType: 'basic_analysis',
        prompt: prompt.prompt,
        systemPrompt: prompt.systemPrompt,
        schemaHint: prompt.schemaHint,
        timeoutMs: this.readInt('CLAUDE_LOCAL_FALLBACK_TIMEOUT_MS', 30_000),
      });
      const fallbackAt = new Date().toISOString();
      const normalized = this.normalizeReview(
        result.data,
        result.model,
        {
          fallbackOneLiner: localInsight.oneLinerZh,
          repository,
          localInsight,
          previousFallbackReview: this.readPreviousFallbackReview(repository),
        },
        {
          generatedBy: 'local_fallback',
          fallbackAt,
          priority,
        },
      );
      const changed = this.didReviewChangeLocal(localInsight, normalized);
      const downgraded = this.didDowngradeFromGood(localInsight, normalized);
      const oneLinerRewritten = this.didRewriteOneLiner(
        localInsight.oneLinerZh,
        normalized.oneLinerZh,
      );

      await this.prisma.repositoryAnalysis.upsert({
        where: {
          repositoryId: repository.id,
        },
        update: {
          claudeReviewJson: normalized as unknown as Prisma.InputJsonValue,
          claudeReviewStatus: 'SUCCESS',
          claudeReviewProvider: result.provider,
          claudeReviewModel: result.model,
          claudeReviewRequestHash: requestHash,
          claudeReviewReviewedAt: new Date(fallbackAt),
          claudeReviewError: null,
        },
        create: {
          repositoryId: repository.id,
          claudeReviewJson: normalized as unknown as Prisma.InputJsonValue,
          claudeReviewStatus: 'SUCCESS',
          claudeReviewProvider: result.provider,
          claudeReviewModel: result.model,
          claudeReviewRequestHash: requestHash,
          claudeReviewReviewedAt: new Date(fallbackAt),
          claudeReviewError: null,
        },
      });

      await this.bumpRuntimeState(repository.id, {
        batchCallCountDelta: 1,
        batchItemCountDelta: 1,
        changed,
        downgraded,
        oneLinerRewritten,
        goodCorrected:
          localInsight.verdict === 'GOOD' &&
          localInsight.action === 'BUILD' &&
          downgraded,
      });
      await this.repositoryCachedRankingService.refreshRepositoryRanking(repository.id);
      this.claudeTrainingHintsService.scheduleRefresh('local_fallback_review_saved');
      this.analysisTrainingKnowledgeService.scheduleRefresh(
        'local_fallback_review_saved',
      );
      this.moneyLearningService.scheduleRefresh('local_fallback_review_saved');
      this.logger.warn(
        `claude_review local_fallback repositoryId=${repository.id} source=${source} reason=${triggerReason} verdict=${normalized.verdict} action=${normalized.action} latencyMs=${result.latencyMs}`,
      );

      return {
        status: 'reviewed',
        repositoryId: repository.id,
        reason: triggerReason,
        review: normalized,
        latencyMs: result.latencyMs,
        changed,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown local fallback review error.';

      await this.prisma.repositoryAnalysis.upsert({
        where: {
          repositoryId: repository.id,
        },
        update: {
          claudeReviewStatus: 'FAILED',
          claudeReviewProvider: 'omlx',
          claudeReviewModel: process.env.OMLX_MODEL?.trim() || null,
          claudeReviewRequestHash: requestHash,
          claudeReviewReviewedAt: new Date(),
          claudeReviewError: this.cleanText(message, 500),
        },
        create: {
          repositoryId: repository.id,
          claudeReviewStatus: 'FAILED',
          claudeReviewProvider: 'omlx',
          claudeReviewModel: process.env.OMLX_MODEL?.trim() || null,
          claudeReviewRequestHash: requestHash,
          claudeReviewReviewedAt: new Date(),
          claudeReviewError: this.cleanText(message, 500),
        },
      });

      this.logger.warn(
        `claude_review local_fallback_failed repositoryId=${repository.id} source=${source} reason=${triggerReason} error=${message}`,
      );

      return {
        status: 'failed',
        repositoryId: repository.id,
        reason: triggerReason,
        error: message,
      };
    }
  }

  private async selectReplayCandidates(maxPerRun: number): Promise<ReplayCandidate[]> {
    const analyses = await this.prisma.repositoryAnalysis.findMany({
      where: {
        claudeReviewStatus: 'SUCCESS',
        claudeReviewReviewedAt: {
          not: null,
        },
      },
      select: {
        repositoryId: true,
        claudeReviewJson: true,
        claudeReviewReviewedAt: true,
      },
      orderBy: {
        claudeReviewReviewedAt: 'asc',
      },
      take: 200,
    });

    return analyses
      .map((analysis) => {
        const review = this.readJsonObject(analysis.claudeReviewJson);
        if (!review) {
          return null;
        }

        const generatedBy = this.cleanText(review.generatedBy, 40);
        const needsClaudeReview = Boolean(review.needsClaudeReview);
        const priority = this.normalizeReplayPriority(review.priority);

        if (
          generatedBy !== 'local_fallback' ||
          !needsClaudeReview ||
          !priority
        ) {
          return null;
        }

        return {
          repositoryId: analysis.repositoryId,
          priority,
          reviewedAt: analysis.claudeReviewReviewedAt?.getTime() ?? 0,
        };
      })
      .filter(
        (item): item is ReplayCandidate => item !== null,
      )
      .sort((left, right) => {
        const priorityDelta =
          this.priorityRank(left.priority) - this.priorityRank(right.priority);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return left.reviewedAt - right.reviewedAt;
      })
      .slice(0, maxPerRun);
  }

  private resolveTriggerReason(
    localInsight: LocalInsightMetadata,
    options: {
      force: boolean;
      topCandidate: boolean;
      source?: ClaudeReviewSource;
      decisionContext: ReviewDecisionContext;
      oneLinerStrength?: OneLinerStrength | null;
    },
  ): ReviewTriggerReason | null {
    if (options.force) {
      return 'forced';
    }

    if (localInsight.verdict === 'BAD' || localInsight.looksLikeTemplateOrDemo) {
      return null;
    }

    if (
      options.oneLinerStrength === 'STRONG' &&
      options.source !== 'replay'
    ) {
      return 'good_candidate';
    }

    if (
      localInsight.verdict === 'GOOD' &&
      (localInsight.ideaFitScore ?? 0) >= 70 &&
      localInsight.confidence < 0.8
    ) {
      return 'good_candidate';
    }

    if (
      (localInsight.projectType === 'model' ||
        localInsight.projectType === 'infra') &&
      localInsight.hasRealUser &&
      localInsight.hasClearUseCase
    ) {
      return 'boundary_model_or_infra';
    }

    if (this.isGenericOneLiner(localInsight.oneLinerZh)) {
      return 'one_liner_drift';
    }

    if (
      localInsight.verdict === 'GOOD' ||
      (options.decisionContext.finalDecision?.verdict === 'GOOD' &&
        options.decisionContext.finalDecision?.action === 'BUILD') ||
      options.decisionContext.moneyPriority?.tier === 'P0' ||
      options.decisionContext.moneyPriority?.tier === 'P1'
    ) {
      return 'good_candidate';
    }

    if (localInsight.verdict === 'OK' && localInsight.confidence < 0.72) {
      return 'low_confidence_ok';
    }

    if (
      (localInsight.projectType === 'model' ||
        localInsight.projectType === 'infra' ||
        localInsight.projectType === 'demo') &&
      localInsight.anchorMatch === 'GOOD'
    ) {
      return 'reality_anchor_conflict';
    }

    if (
      (localInsight.projectType === 'product' ||
        localInsight.projectType === 'tool') &&
      localInsight.anchorMatch !== 'GOOD'
    ) {
      return 'reality_anchor_conflict';
    }

    if (options.topCandidate || options.source === 'telegram') {
      return 'top_candidate';
    }

    return null;
  }

  private resolveReviewPriority(
    localInsight: LocalInsightMetadata,
    decisionContext: ReviewDecisionContext,
    options: {
      source?: ClaudeReviewPrioritySource;
      topCandidate: boolean;
      oneLinerStrength?: OneLinerStrength | null;
    },
  ): ClaudeReviewPriority {
    return resolveClaudeReviewPriority({
      source: options.source,
      oneLinerStrength: options.oneLinerStrength,
      topCandidate: options.topCandidate,
      localVerdict: localInsight.verdict,
      localAction: localInsight.action,
      localConfidence: localInsight.confidence,
      moneyPriority: decisionContext.moneyPriority?.tier ?? null,
      projectType: localInsight.projectType,
      hasRealUser: localInsight.hasRealUser,
      hasClearUseCase: localInsight.hasClearUseCase,
      hasProductizationPath: localInsight.hasProductizationPath,
      isDirectlyMonetizable: localInsight.isDirectlyMonetizable,
      isQualifiedDeveloperTool: isBoundaryHighValueClaudeCandidate({
        localVerdict: localInsight.verdict,
        localAction: localInsight.action,
        moneyPriority: decisionContext.moneyPriority?.tier ?? null,
        projectType: localInsight.projectType,
        hasRealUser: localInsight.hasRealUser,
        hasClearUseCase: localInsight.hasClearUseCase,
        hasProductizationPath: localInsight.hasProductizationPath,
        isDirectlyMonetizable: localInsight.isDirectlyMonetizable,
        isQualifiedDeveloperTool: true,
      }),
      needsClaudeReview: decisionContext.needsClaudeReview,
      hasConflict: decisionContext.hasConflict,
    });
  }

  private adjustPriorityForTriggerReason(
    priority: ClaudeReviewPriority,
    triggerReason: ReviewTriggerReason,
  ): ClaudeReviewPriority {
    if (
      triggerReason === 'boundary_model_or_infra' ||
      triggerReason === 'one_liner_drift'
    ) {
      return priority === 'P3' ? 'P2' : priority;
    }

    return priority;
  }

  private resolveBatchSize(priority: ClaudeReviewPriority) {
    const configured = this.readInt('CLAUDE_REVIEW_BATCH_SIZE', 4);
    const normalized = Math.max(3, Math.min(configured, 5));

    if (priority === 'P0' || priority === 'P1') {
      return normalized;
    }

    return Math.max(3, Math.min(normalized, 4));
  }

  private buildPromptInput(
    repository: RepositoryReviewTarget,
    localInsight: LocalInsightMetadata,
    decisionContext: ReviewDecisionContext,
    moneyLearningBrief?: Awaited<
      ReturnType<MoneyLearningService['getLatestLearningBrief']>
    > | null,
    userBehaviorContext?: UserBehaviorPreferenceContext | null,
  ) {
    const previousFallbackReview = this.readPreviousFallbackReview(repository);

    return {
      repository: {
        name: repository.name,
        fullName: repository.fullName,
        description: this.cleanText(repository.description, 220),
        topics: (repository.topics ?? []).slice(0, 8),
        language: repository.language,
        stars: repository.stars,
        homepage: repository.homepage,
      },
      finalDecision: decisionContext.finalDecision
        ? {
            oneLinerZh: this.cleanText(
              decisionContext.finalDecision.oneLinerZh,
              140,
            ),
            verdict: decisionContext.finalDecision.verdict,
            action: decisionContext.finalDecision.action,
            moneyPriority: decisionContext.finalDecision.moneyPriority,
            reasonZh: this.cleanText(decisionContext.finalDecision.reasonZh, 160),
            source: decisionContext.finalDecision.source,
            decisionSummary: {
              headlineZh: this.cleanText(
                decisionContext.finalDecision.decisionSummary?.headlineZh,
                140,
              ),
              judgementLabelZh: this.cleanText(
                decisionContext.finalDecision.decisionSummary?.judgementLabelZh,
                40,
              ),
              categoryLabelZh: this.cleanText(
                decisionContext.finalDecision.decisionSummary?.categoryLabelZh,
                80,
              ),
              moneyPriorityLabelZh: this.cleanText(
                decisionContext.finalDecision.decisionSummary?.moneyPriorityLabelZh,
                40,
              ),
              recommendedMoveZh: this.cleanText(
                decisionContext.finalDecision.decisionSummary?.recommendedMoveZh,
                80,
              ),
              reasonZh: this.cleanText(
                decisionContext.finalDecision.decisionSummary?.reasonZh,
                160,
              ),
              targetUsersZh: this.cleanText(
                decisionContext.finalDecision.decisionSummary?.targetUsersZh,
                90,
              ),
              monetizationSummaryZh: this.cleanText(
                decisionContext.finalDecision.decisionSummary
                  ?.monetizationSummaryZh,
                120,
              ),
            },
          }
        : null,
      moneyPriority: decisionContext.moneyPriority,
      localDecision: {
        oneLinerZh: localInsight.oneLinerZh,
        verdict: localInsight.verdict,
        action: localInsight.action,
        reason: this.cleanText(localInsight.reason, 160),
        projectType: localInsight.projectType,
        hasRealUser: localInsight.hasRealUser,
        hasClearUseCase: localInsight.hasClearUseCase,
        hasProductizationPath: localInsight.hasProductizationPath,
        isDirectlyMonetizable: localInsight.isDirectlyMonetizable,
        whyNotProduct: this.cleanNullableText(localInsight.whyNotProduct, 160),
        anchorMatch: localInsight.anchorMatch,
        confidence: localInsight.confidence,
        ideaFitScore: localInsight.ideaFitScore,
        completenessLevel: localInsight.completenessLevel,
      },
      projectReality: {
        projectType: localInsight.projectType,
        hasRealUser: localInsight.hasRealUser,
        hasClearUseCase: localInsight.hasClearUseCase,
        hasProductizationPath: localInsight.hasProductizationPath,
        isDirectlyMonetizable: localInsight.isDirectlyMonetizable,
        whyNotProduct: localInsight.whyNotProduct,
      },
      extractedIdea: this.extractIdeaSummary(repository.analysis?.extractedIdeaJson),
      readmeSummary: this.buildReadmeReviewBrief(repository),
      trainingContext: decisionContext.trainingAsset
        ? {
            mistakeTypes: decisionContext.trainingAsset.mistakeTypes.slice(0, 4),
            suggestions: decisionContext.trainingAsset.suggestions.slice(0, 4),
            shouldTrain: decisionContext.trainingAsset.shouldTrain,
          }
        : null,
      replayContext: previousFallbackReview
        ? {
            generatedBy: this.cleanText(previousFallbackReview.generatedBy, 40),
            verdict: this.normalizeVerdict(previousFallbackReview.verdict),
            action: this.normalizeAction(previousFallbackReview.action),
            oneLinerZh: this.cleanText(previousFallbackReview.oneLinerZh, 120),
            reviewedAt: this.cleanNullableText(
              previousFallbackReview.reviewedAt,
              40,
            ),
          }
        : null,
      userBehaviorContext:
        userBehaviorContext &&
        ((userBehaviorContext.userSuccessPatterns?.length ?? 0) > 0 ||
          (userBehaviorContext.userFailurePatterns?.length ?? 0) > 0 ||
          (userBehaviorContext.userSuccessReasons?.length ?? 0) > 0 ||
          (userBehaviorContext.userFailureReasons?.length ?? 0) > 0 ||
          (userBehaviorContext.preferredCategories?.length ?? 0) > 0 ||
          (userBehaviorContext.avoidedCategories?.length ?? 0) > 0 ||
          (userBehaviorContext.recentValidatedWins?.length ?? 0) > 0 ||
          (userBehaviorContext.recentDroppedReasons?.length ?? 0) > 0)
          ? {
              userSuccessPatterns:
                userBehaviorContext.userSuccessPatterns?.slice(0, 8) ?? [],
              userFailurePatterns:
                userBehaviorContext.userFailurePatterns?.slice(0, 8) ?? [],
              userSuccessReasons:
                userBehaviorContext.userSuccessReasons?.slice(0, 6) ?? [],
              userFailureReasons:
                userBehaviorContext.userFailureReasons?.slice(0, 6) ?? [],
              preferredCategories:
                userBehaviorContext.preferredCategories?.slice(0, 6) ?? [],
              avoidedCategories:
                userBehaviorContext.avoidedCategories?.slice(0, 6) ?? [],
              recentValidatedWins:
                userBehaviorContext.recentValidatedWins?.slice(0, 6) ?? [],
              recentDroppedReasons:
                userBehaviorContext.recentDroppedReasons?.slice(0, 6) ?? [],
            }
          : null,
      moneyLearning: moneyLearningBrief,
    };
  }

  private async mergeUserBehaviorContext(
    context?:
      | {
          userSuccessPatterns?: string[];
          userFailurePatterns?: string[];
          userSuccessReasons?: string[];
          userFailureReasons?: string[];
          preferredCategories?: string[];
          avoidedCategories?: string[];
          recentValidatedWins?: string[];
          recentDroppedReasons?: string[];
          minEvidenceThreshold?: number;
          failureWeightDecay?: number;
        }
      | null,
  ): Promise<UserBehaviorPreferenceContext> {
    const memoryInput = await this.behaviorMemoryService.getModelInput();

    return {
      userSuccessPatterns:
        context?.userSuccessPatterns?.length
          ? context.userSuccessPatterns
          : memoryInput.userSuccessPatterns,
      userFailurePatterns:
        context?.userFailurePatterns?.length
          ? context.userFailurePatterns
          : memoryInput.userFailurePatterns,
      userSuccessReasons:
        context?.userSuccessReasons?.length
          ? context.userSuccessReasons
          : memoryInput.userSuccessReasons,
      userFailureReasons:
        context?.userFailureReasons?.length
          ? context.userFailureReasons
          : memoryInput.userFailureReasons,
      preferredCategories:
        context?.preferredCategories?.length
          ? context.preferredCategories
          : memoryInput.preferredCategories,
      avoidedCategories:
        context?.avoidedCategories?.length
          ? context.avoidedCategories
          : memoryInput.avoidedCategories,
      recentValidatedWins:
        context?.recentValidatedWins?.length
          ? context.recentValidatedWins
          : memoryInput.recentValidatedWins,
      recentDroppedReasons:
        context?.recentDroppedReasons?.length
          ? context.recentDroppedReasons
          : memoryInput.recentDroppedReasons,
      minEvidenceThreshold:
        typeof context?.minEvidenceThreshold === 'number'
          ? context.minEvidenceThreshold
          : memoryInput.minEvidenceThreshold,
      failureWeightDecay:
        typeof context?.failureWeightDecay === 'number'
          ? context.failureWeightDecay
          : memoryInput.failureWeightDecay,
    };
  }

  private async selectBenchmarkRepositories() {
    const repositories = await this.prisma.repository.findMany({
      where: {
        analysis: {
          isNot: null,
        },
      },
      include: {
        content: true,
        analysis: true,
      },
      orderBy: [
        {
          updatedAtGithub: 'desc',
        },
        {
          updatedAt: 'desc',
        },
      ],
      take: 160,
    });

    const goodCandidates: RepositoryReviewTarget[] = [];
    const lowConfidenceOk: RepositoryReviewTarget[] = [];
    const nonProduct: RepositoryReviewTarget[] = [];
    const fallback: RepositoryReviewTarget[] = [];

    for (const repository of repositories) {
      const localInsight = this.readLocalInsight(repository);
      fallback.push(repository);

      if (localInsight.verdict === 'GOOD') {
        goodCandidates.push(repository);
        continue;
      }

      if (localInsight.verdict === 'OK' && localInsight.confidence < 0.72) {
        lowConfidenceOk.push(repository);
        continue;
      }

      if (
        localInsight.projectType === 'model' ||
        localInsight.projectType === 'infra' ||
        localInsight.projectType === 'demo' ||
        localInsight.looksLikeTemplateOrDemo
      ) {
        nonProduct.push(repository);
      }
    }

    const picked = this.pickUniqueRepositories([
      ...goodCandidates.slice(0, 8),
      ...lowConfidenceOk.slice(0, 8),
      ...nonProduct.slice(0, 8),
    ]);

    for (const repository of fallback) {
      if (picked.length >= 24) {
        break;
      }

      if (!picked.some((item) => item.id === repository.id)) {
        picked.push(repository);
      }
    }

    const sample = picked.slice(0, Math.min(20, picked.length));

    return {
      repositories: sample,
      breakdown: {
        goodCandidateCount: sample.filter(
          (repository) => this.readLocalInsight(repository).verdict === 'GOOD',
        ).length,
        lowConfidenceOkCount: sample.filter((repository) => {
          const localInsight = this.readLocalInsight(repository);
          return (
            localInsight.verdict === 'OK' && localInsight.confidence < 0.72
          );
        }).length,
        nonProductCount: sample.filter((repository) => {
          const localInsight = this.readLocalInsight(repository);
          return (
            localInsight.projectType === 'model' ||
            localInsight.projectType === 'infra' ||
            localInsight.projectType === 'demo' ||
            localInsight.looksLikeTemplateOrDemo
          );
        }).length,
      },
    };
  }

  private pickUniqueRepositories(repositories: RepositoryReviewTarget[]) {
    const seen = new Set<string>();
    const picked: RepositoryReviewTarget[] = [];

    for (const repository of repositories) {
      if (seen.has(repository.id)) {
        continue;
      }

      seen.add(repository.id);
      picked.push(repository);
    }

    return picked;
  }

  private async runBenchmarkLevel(
    concurrency: number,
    repositories: RepositoryReviewTarget[],
  ): Promise<ClaudeBenchmarkLevelReport> {
    const results = new Array<ClaudeBenchmarkRequestRecord>(repositories.length);
    let cursor = 0;
    const startedAt = Date.now();
    const workerCount = Math.max(1, Math.min(concurrency, repositories.length));

    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < repositories.length) {
        const currentIndex = cursor;
        cursor += 1;
        results[currentIndex] = await this.runIsolatedBenchmarkRequest(
          repositories[currentIndex],
        );
      }
    });

    await Promise.all(workers);
    const wallTimeMs = Math.max(1, Date.now() - startedAt);
    const latencies = results.map((item) => item.latencyMs);
    const successCount = results.filter((item) => item.success).length;
    const timeoutCount = results.filter((item) => item.timeout).length;
    const jsonErrorCount = results.filter((item) => !item.jsonParseSuccess).length;

    return {
      concurrency,
      sampleSize: results.length,
      successRate: results.length > 0 ? successCount / results.length : 0,
      avgLatencyMs: latencies.length > 0 ? Math.round(this.average(latencies)) : 0,
      p50LatencyMs: latencies.length > 0 ? this.percentile(latencies, 0.5) : 0,
      p90LatencyMs: latencies.length > 0 ? this.percentile(latencies, 0.9) : 0,
      p95LatencyMs: latencies.length > 0 ? this.percentile(latencies, 0.95) : 0,
      timeoutRate: results.length > 0 ? timeoutCount / results.length : 0,
      jsonErrorRate: results.length > 0 ? jsonErrorCount / results.length : 0,
      throughputPerMin: Math.round((results.length / wallTimeMs) * 60_000),
      errorRate:
        results.length > 0 ? (results.length - successCount) / results.length : 0,
      httpStatusCounts: this.countBy(results, (item) =>
        item.httpStatus === null ? null : String(item.httpStatus),
      ),
      errorTypeCounts: this.countBy(results, (item) => item.errorType),
      requests: results,
    };
  }

  private async runIsolatedBenchmarkRequest(
    repository: RepositoryReviewTarget,
  ): Promise<ClaudeBenchmarkRequestRecord> {
    const localInsight = this.readLocalInsight(repository);
    const auditSnapshot =
      await this.repositoryDecisionService.getLatestAuditSnapshot();
    const derivedRepository =
      this.repositoryDecisionService.attachDerivedAssetsWithAudit(
        repository as unknown as Record<string, unknown>,
        auditSnapshot,
      ) as Record<string, unknown>;
    const decisionContext = this.readDecisionContext(derivedRepository);
    const promptInput = this.buildPromptInput(
      repository,
      localInsight,
      decisionContext,
      await this.moneyLearningService.getLatestLearningBrief(),
    );
    const prompt = buildClaudeProjectReviewPrompt(promptInput);
    const priority = this.resolveReviewPriority(localInsight, decisionContext, {
      source: 'manual',
      topCandidate: false,
    });

    try {
      const result = await this.anthropicProvider.generateJson<ClaudeReviewRecord>({
        prompt: prompt.prompt,
        systemPrompt: prompt.systemPrompt,
        schemaHint: prompt.schemaHint,
      });

      return {
        repositoryId: repository.id,
        priority,
        startTime: result.startTime,
        latencyMs: result.latencyMs,
        batchSize: 1,
        success: true,
        httpStatus: result.httpStatus,
        errorType: null,
        timeout: result.timeout,
        jsonParseSuccess: result.jsonParseSuccess,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      const normalized =
        error instanceof AnthropicProviderError
          ? error
          : new AnthropicProviderError(
              error instanceof Error ? error.message : 'Unknown Claude error.',
              {
                model: process.env.CLAUDE_MODEL?.trim() || 'claude-opus-4-6',
                startTime: new Date().toISOString(),
                latencyMs: 0,
                httpStatus: null,
                errorType: 'unknown_error',
                timeout: false,
                jsonParseSuccess: true,
                tokensUsed: null,
              },
            );

      return {
        repositoryId: repository.id,
        priority,
        startTime: normalized.startTime,
        latencyMs: normalized.latencyMs,
        batchSize: 1,
        success: false,
        httpStatus: normalized.httpStatus,
        errorType: normalized.errorType,
        timeout: normalized.timeout,
        jsonParseSuccess: normalized.jsonParseSuccess,
        tokensUsed: normalized.tokensUsed,
      };
    }
  }

  private computeStableConcurrency(levels: ClaudeBenchmarkLevelReport[]) {
    const stableLevels = levels.filter(
      (level) =>
        level.successRate >= 0.95 &&
        level.timeoutRate <= 0.05 &&
        level.jsonErrorRate <= 0.02 &&
        level.p90LatencyMs < level.avgLatencyMs * 2,
    );

    if (!stableLevels.length) {
      return 2;
    }

    return stableLevels[stableLevels.length - 1].concurrency;
  }

  private findNotRecommendedConcurrency(
    levels: ClaudeBenchmarkLevelReport[],
    stableConcurrency: number,
  ) {
    const unstable = levels.find((level) => level.concurrency > stableConcurrency);
    return unstable?.concurrency ?? null;
  }

  private clampConcurrencyStep(value: number) {
    const steps = [...CLAUDE_BENCHMARK_CONCURRENCY_LEVELS];
    let closest = steps[0];
    let distance = Math.abs(value - closest);

    for (const step of steps) {
      const nextDistance = Math.abs(value - step);
      if (nextDistance < distance) {
        closest = step;
        distance = nextDistance;
      }
    }

    return closest;
  }

  private countBy<T>(items: T[], pickKey: (item: T) => string | null) {
    const counts: Record<string, number> = {};

    for (const item of items) {
      const key = pickKey(item);
      if (!key) {
        continue;
      }

      counts[key] = (counts[key] ?? 0) + 1;
    }

    return counts;
  }

  private average(values: number[]) {
    if (!values.length) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private percentile(values: number[], ratio: number) {
    if (!values.length) {
      return 0;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * ratio) - 1),
    );
    return sorted[index];
  }

  private readLocalInsight(repository: RepositoryReviewTarget): LocalInsightMetadata {
    const insight = this.readJsonObject(repository.analysis?.insightJson);
    const snapshot = this.readJsonObject(repository.analysis?.ideaSnapshotJson);
    const projectReality =
      this.readJsonObject(insight?.projectReality as Prisma.JsonValue | undefined) ??
      this.readJsonObject(snapshot?.projectReality as Prisma.JsonValue | undefined);
    const verdict = this.normalizeVerdict(
      repository.analysis?.manualVerdict ?? insight?.verdict,
    ) ?? (snapshot?.isPromising === true ? 'OK' : 'BAD');
    const action = this.normalizeAction(
      repository.analysis?.manualAction ?? insight?.action,
    ) ??
      (verdict === 'GOOD' ? 'BUILD' : verdict === 'OK' ? 'CLONE' : 'IGNORE');

    return {
      oneLinerZh:
        this.cleanText(insight?.oneLinerZh, 160) ||
        this.cleanText(snapshot?.oneLinerZh, 160) ||
        this.cleanText(repository.description, 160) ||
        repository.fullName,
      oneLinerStrength: this.normalizeOneLinerStrength(insight?.oneLinerStrength),
      verdict,
      action,
      reason:
        this.cleanText(repository.analysis?.manualNote, 220) ||
        this.cleanText(insight?.verdictReason, 220) ||
        this.cleanText(snapshot?.reason, 220) ||
        '本地模型给出的判断还需要人工复核。',
      projectType: this.normalizeProjectType(
        projectReality?.type ?? projectReality?.projectType,
      ),
      hasRealUser: Boolean(projectReality?.hasRealUser),
      hasClearUseCase: Boolean(projectReality?.hasClearUseCase),
      hasProductizationPath: Boolean(projectReality?.hasProductizationPath),
      isDirectlyMonetizable: Boolean(projectReality?.isDirectlyMonetizable),
      whyNotProduct: this.cleanNullableText(projectReality?.whyNotProduct, 220),
      anchorMatch:
        this.normalizeAnchorMatch(insight?.anchorMatch) ?? 'CLONE',
      confidence: this.normalizeConfidence(insight?.confidence),
      ideaFitScore: this.toNumber(repository.ideaFitScore ?? insight?.ideaFitScore),
      completenessLevel: this.cleanNullableText(
        repository.completenessLevel ?? insight?.completenessLevel,
        20,
      ),
      looksLikeTemplateOrDemo: this.looksLikeTemplateOrDemo(
        repository,
        projectReality,
      ),
    };
  }

  private normalizeReview(
    value: ClaudeReviewRecord,
    model: string | null,
    context: NormalizeReviewContext,
    options: NormalizeReviewOptions,
  ): ClaudeReviewRecord {
    const projectType = this.normalizeProjectType(value?.projectType);
    const confidence = this.normalizeConfidence(value?.confidence);
    const normalizedVerdict = this.normalizeVerdict(value?.verdict) ?? 'OK';
    const normalizedAction =
      this.normalizeAction(value?.action) ??
      (normalizedVerdict === 'GOOD'
        ? 'BUILD'
        : normalizedVerdict === 'BAD'
          ? 'IGNORE'
          : 'CLONE');
    const hasRealUser = Boolean(value?.hasRealUser);
    const hasClearUseCase = Boolean(value?.hasClearUseCase);
    const hasProductizationPath = Boolean(value?.hasProductizationPath);
    const hasPlausibleMonetization = Boolean(value?.isDirectlyMonetizable);
    const localProductSignals = this.readLocalProductSignals(context.repository);
    const strictNonGood =
      this.isStrictlyNonGoodProject(projectType, context.repository) ||
      context.localInsight.looksLikeTemplateOrDemo ||
      this.looksLikeRoutingInfraCapability(context.repository, value);
    const scamLike = this.looksScamLike(context.repository);
    const qualifiedDeveloperTool = this.isQualifiedDeveloperToolOpportunity(
      context.repository,
      value,
    );
    const hasStandaloneProductSignals =
      !strictNonGood &&
      confidence >= 0.72 &&
      (projectType === 'product' || projectType === 'tool') &&
      hasRealUser &&
      hasClearUseCase &&
      (hasProductizationPath || localProductSignals.hasProductizationPath) &&
      (hasPlausibleMonetization ||
        localProductSignals.hasMonetizationPath ||
        qualifiedDeveloperTool);
    const canKeepGood =
      normalizedVerdict === 'GOOD' &&
      hasStandaloneProductSignals;
    const canRecoverDeveloperToolGood =
      normalizedVerdict !== 'BAD' &&
      !strictNonGood &&
      confidence >= 0.72 &&
      context.localInsight.verdict === 'GOOD' &&
      qualifiedDeveloperTool &&
      localProductSignals.hasWorkflowBoundary &&
      (hasProductizationPath || localProductSignals.hasProductizationPath) &&
      (hasPlausibleMonetization || localProductSignals.hasMonetizationPath);
    const canRecoverProductGood =
      normalizedVerdict !== 'BAD' &&
      !strictNonGood &&
      confidence >= 0.72 &&
      projectType === 'product' &&
      hasStandaloneProductSignals &&
      (normalizedAction === 'BUILD' || context.localInsight.verdict === 'GOOD');
    const shouldPromoteToGood =
      !scamLike &&
      (canKeepGood || canRecoverDeveloperToolGood || canRecoverProductGood);
    const conservativeVerdict =
      scamLike || normalizedVerdict === 'BAD'
        ? 'BAD'
        : shouldPromoteToGood
          ? 'GOOD'
          : 'OK';
    const conservativeAction =
      conservativeVerdict === 'BAD'
        ? 'IGNORE'
        : conservativeVerdict === 'GOOD'
          ? 'BUILD'
          : 'CLONE';
    const reason =
      shouldPromoteToGood && normalizedVerdict !== 'GOOD'
        ? this.buildPromotedGoodReason(projectType, qualifiedDeveloperTool)
        : this.cleanText(value?.reason, 300);
    const reviewedAt = new Date().toISOString();
    const businessJudgement = this.moneyPriorityService.normalizeBusinessJudgement(
      value?.businessJudgement,
      {
        isFounderFit:
          conservativeAction === 'BUILD' &&
          conservativeVerdict !== 'BAD' &&
          (projectType === 'product' || projectType === 'tool') &&
          hasRealUser &&
          hasClearUseCase,
        isSmallTeamFriendly:
          (projectType === 'product' || projectType === 'tool') &&
          !strictNonGood &&
          (qualifiedDeveloperTool || localProductSignals.hasWorkflowBoundary),
        hasNearTermMonetizationPath:
        hasPlausibleMonetization ||
          localProductSignals.hasMonetizationPath ||
          qualifiedDeveloperTool,
      },
    );
    const extractedIdea = this.extractIdeaSummary(
      context.repository.analysis?.extractedIdeaJson,
    );
    const businessSignals = this.moneyPriorityService.normalizeBusinessSignals(
      value?.businessSignals,
      {
        targetUser: extractedIdea?.targetUsers.slice(0, 2).join('、') || '',
        willingnessToPay: businessJudgement.hasNearTermMonetizationPath
          ? hasPlausibleMonetization
            ? 'high'
            : 'medium'
          : 'low',
        monetizationModel: this.cleanText(extractedIdea?.monetization, 180),
        urgency:
          hasRealUser && hasClearUseCase
            ? qualifiedDeveloperTool
              ? 'high'
              : 'medium'
            : 'low',
        founderFit: businessJudgement.isFounderFit,
        buildDifficulty:
          projectType === 'model' || projectType === 'infra'
            ? 'high'
            : qualifiedDeveloperTool || localProductSignals.hasWorkflowBoundary
              ? 'low'
              : 'medium',
      },
    );
    const moneyDecision = this.normalizeMoneyDecision(
      value?.moneyDecision,
      businessJudgement,
      conservativeVerdict,
      conservativeAction,
    );
    const normalizedTrainingHints = this.normalizeTrainingHints(value?.trainingHints);
    const condensedOneLiner = this.normalizeOneLiner(
      value?.oneLinerZh,
      context.fallbackOneLiner,
      projectType,
      context.repository,
      {
        hasRealUser,
        hasClearUseCase,
        isDirectlyMonetizable: hasPlausibleMonetization,
        categoryMain: this.cleanNullableText(context.repository.categoryL1, 24),
        categorySub: this.cleanNullableText(context.repository.categoryL2, 24),
        monetizationSummaryZh: businessSignals.monetizationModel,
      },
    );
    const oneLinerStrength = evaluateOneLinerStrength({
      oneLinerZh: condensedOneLiner.oneLinerZh,
      projectReality: {
        type: projectType,
        hasRealUser,
        hasClearUseCase,
        isDirectlyMonetizable: hasPlausibleMonetization,
      },
      stars: context.repository.stars,
      categoryMain: this.cleanNullableText(context.repository.categoryL1, 24),
      categorySub: this.cleanNullableText(context.repository.categoryL2, 24),
      riskFlags: condensedOneLiner.oneLinerMeta.riskFlags,
      ideaFitScore: context.localInsight.ideaFitScore,
      verdict: conservativeVerdict,
      action: conservativeAction,
    });
    const normalizedReview: ClaudeReviewRecord = {
      oneLinerZh: condensedOneLiner.oneLinerZh,
      oneLinerMeta: {
        ...condensedOneLiner.oneLinerMeta,
        strength: oneLinerStrength,
      },
      oneLinerStrength,
      projectType,
      hasRealUser,
      hasClearUseCase,
      hasProductizationPath,
      isDirectlyMonetizable: hasPlausibleMonetization,
      businessJudgement,
      businessSignals,
      moneyDecision,
      verdict: conservativeVerdict,
      action: conservativeAction,
      reason,
      confidence,
      whyNotProduct:
        conservativeVerdict === 'GOOD'
          ? null
          : this.cleanNullableText(value?.whyNotProduct, 220),
      reviewNotes: this.normalizeStringArray(value?.reviewNotes).slice(0, 6),
      reviewedAt,
      provider:
        options.generatedBy === 'local_fallback' ? 'local_fallback' : 'claude',
      model,
      promptVersion: CLAUDE_PROJECT_REVIEW_PROMPT_VERSION,
      generatedBy: options.generatedBy,
      needsClaudeReview: options.generatedBy === 'local_fallback',
      fallbackAt:
        options.generatedBy === 'local_fallback'
          ? options.fallbackAt ?? new Date().toISOString()
          : null,
      priority: options.priority,
      trainingHints: normalizedTrainingHints,
      reviewDiff: {} as ClaudeReviewDiffRecord,
    };
    normalizedReview.reviewDiff = this.claudeReviewDiffService.buildReviewDiff({
      repository: context.repository,
      localInsight: {
        oneLinerZh: context.localInsight.oneLinerZh,
        verdict: context.localInsight.verdict,
        action: context.localInsight.action,
        projectType: context.localInsight.projectType,
        confidence: context.localInsight.confidence,
        anchorMatch: context.localInsight.anchorMatch,
      },
      review: {
        oneLinerZh: normalizedReview.oneLinerZh,
        verdict: normalizedReview.verdict,
        action: normalizedReview.action,
        projectType: normalizedReview.projectType,
        generatedBy: normalizedReview.generatedBy,
        priority: normalizedReview.priority,
        reviewedAt: normalizedReview.reviewedAt,
      },
    });

    const fallbackDiff = this.buildFallbackDiff(
      context.previousFallbackReview,
      normalizedReview,
    );
    normalizedReview.fallbackDiff = fallbackDiff;
    normalizedReview.trainingHints = this.mergeFallbackLearningIntoTrainingHints(
      normalizedReview.trainingHints,
      fallbackDiff,
    );

    return normalizedReview;
  }

  private extractIdeaSummary(value: Prisma.JsonValue | null | undefined) {
    const extracted = this.readJsonObject(value);
    if (!extracted) {
      return null;
    }

    return {
      ideaSummary: this.cleanText(extracted.ideaSummary, 240),
      problem: this.cleanText(extracted.problem, 240),
      solution: this.cleanText(extracted.solution, 240),
      monetization: this.cleanText(extracted.monetization, 200),
      productForm: this.cleanText(extracted.productForm, 40),
      targetUsers: this.normalizeStringArray(extracted.targetUsers).slice(0, 6),
    };
  }

  private hashRequest(value: unknown) {
    return createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex');
  }

  private wasReviewedRecently(value: Date | string | null | undefined) {
    if (!value) {
      return false;
    }

    const reviewedAt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(reviewedAt.getTime())) {
      return false;
    }

    const ttlHours = this.readInt('CLAUDE_REVIEW_TTL_HOURS', 168);
    const ttlMs = ttlHours * 60 * 60 * 1_000;
    return Date.now() - reviewedAt.getTime() < ttlMs;
  }

  private looksLikeTemplateOrDemo(
    repository: RepositoryReviewTarget,
    projectReality: Record<string, unknown> | null,
  ) {
    const explicitProjectType = String(
      projectReality?.type ?? projectReality?.projectType ?? '',
    )
      .trim()
      .toLowerCase();
    const metadataHaystack = this.buildRepositoryIdentityHaystack(repository);
    const readmeLead = this.cleanText(repository.content?.readmeText, 1_400).toLowerCase();
    const whyNotProduct = String(projectReality?.whyNotProduct ?? '').toLowerCase();

    const templateKeywords = [
      'template',
      'starter',
      'boilerplate',
      'scaffold',
      'starter kit',
    ];
    const explicitTemplatePhrases = [
      'this is a template',
      'starting scaffold',
      'starter scaffold',
      'project template',
      'template scaffolding',
      'not a tool',
      'not a library',
      'not an application',
      'not a product',
      'reference implementation',
      'tutorial project',
      'course project',
    ];

    return (
      explicitProjectType === 'demo' ||
      templateKeywords.some((keyword) => metadataHaystack.includes(keyword)) ||
      explicitTemplatePhrases.some(
        (keyword) =>
          readmeLead.includes(keyword) || whyNotProduct.includes(keyword),
      )
    );
  }

  private isStrictlyNonGoodProject(
    projectType: ClaudeReviewProjectType,
    repository: RepositoryReviewTarget,
  ) {
    if (projectType === 'model' || projectType === 'demo') {
      return true;
    }

    const metadataHaystack = this.buildRepositoryIdentityHaystack(repository);
    const readmeLead = this.cleanText(repository.content?.readmeText, 1_400).toLowerCase();
    const infraFrameworkKeywords = [
      'framework',
      'sdk',
      'library',
      'mcp server framework',
      'starter kit',
      'boilerplate',
      'scaffold',
      'template',
      'reference implementation',
    ];
    const explicitFrameworkPhrases = [
      'production-ready typescript framework',
      'framework for building',
      'software development kit',
      'sdk for',
      'library for',
      'reference implementation',
    ];

    if (projectType === 'infra') {
      return true;
    }

    return (
      infraFrameworkKeywords.some((keyword) => metadataHaystack.includes(keyword)) ||
      explicitFrameworkPhrases.some((keyword) => readmeLead.includes(keyword))
    );
  }

  private looksScamLike(repository: RepositoryReviewTarget) {
    const haystack = this.buildRepositoryHaystack(repository);
    const scamKeywords = [
      'arbitrage',
      'sniper',
      'pump',
      'passive income',
      'guaranteed profit',
      '稳赚',
      '暴利',
    ];

    return scamKeywords.some((keyword) => haystack.includes(keyword));
  }

  private isQualifiedDeveloperToolOpportunity(
    repository: RepositoryReviewTarget,
    review: ClaudeReviewRecord,
  ) {
    if (
      review?.projectType !== 'tool' &&
      review?.projectType !== 'product'
    ) {
      return false;
    }

    const haystack = [
      this.buildRepositoryHaystack(repository),
      review?.oneLinerZh,
      review?.reason,
      ...(Array.isArray(review?.reviewNotes) ? review.reviewNotes : []),
    ]
      .map((item) => String(item ?? '').toLowerCase())
      .join('\n');

    const developerUserKeywords = [
      'developer',
      'developers',
      'engineer',
      'engineering',
      'platform team',
      'devops',
      'ops',
      'reviewer',
      '开发者',
      '工程师',
      '团队',
    ];
    const workflowPainKeywords = [
      'workflow',
      'approval',
      'review',
      'diff',
      'monitor',
      'dashboard',
      'guardrail',
      'automation',
      'api',
      'sdk',
      'cli',
      'terminal',
      'pull request',
      'pr ',
      'code review',
      'routing',
      'orchestration',
      'audit',
      '工作流',
      '审查',
      '流程',
      '自动化',
      '接口',
    ];

    return (
      developerUserKeywords.some((keyword) => haystack.includes(keyword)) &&
      workflowPainKeywords.some((keyword) => haystack.includes(keyword))
    );
  }

  private looksLikeRoutingInfraCapability(
    repository: RepositoryReviewTarget,
    review: ClaudeReviewRecord,
  ) {
    const haystack = [
      this.buildRepositoryIdentityHaystack(repository),
      this.cleanText(repository.content?.readmeText, 1_600),
      review?.oneLinerZh,
      review?.reason,
      ...(Array.isArray(review?.reviewNotes) ? review.reviewNotes : []),
    ]
      .map((item) => String(item ?? '').toLowerCase())
      .join('\n');

    const routingKeywords = [
      'proxy',
      'gateway',
      'router',
      'routing',
      'orchestration',
    ];
    const providerKeywords = [
      'provider',
      'providers',
      'model provider',
      'multi-provider',
      'llm',
      'claude code',
      'fallback',
      'daemon',
      'hot-reload',
      '能力层',
      '基础设施',
      '编排代理',
    ];

    return (
      routingKeywords.some((keyword) => haystack.includes(keyword)) &&
      providerKeywords.some((keyword) => haystack.includes(keyword))
    );
  }

  private buildPromotedGoodReason(
    projectType: ClaudeReviewProjectType,
    qualifiedDeveloperTool: boolean,
  ) {
    if (projectType === 'product') {
      return '目标用户明确、使用场景明确、产品边界清晰，而且已经具备现实的产品化路径与合理付费可能性，适合直接按产品方向继续推进。';
    }

    if (qualifiedDeveloperTool) {
      return '这是一个面向明确开发者工作流的清晰工具切口，用户、场景和功能边界都足够明确；虽然仍处于早期，但已经具备现实的产品化路径与合理付费可能性，可以按 GOOD + BUILD 继续推进。';
    }

    return '目标用户、使用场景和产品边界已经足够清晰，并且存在现实的产品化路径与合理付费可能性，适合直接按产品机会继续推进。';
  }

  private readLocalProductSignals(
    repository: RepositoryReviewTarget,
  ): LocalProductSignals {
    const extractedIdea = this.readJsonObject(repository.analysis?.extractedIdeaJson);
    const ideaSnapshot = this.readJsonObject(repository.analysis?.ideaSnapshotJson);
    const targetUsers = this.normalizeStringArray(extractedIdea?.targetUsers);
    const productForm = this.cleanText(extractedIdea?.productForm, 40).toLowerCase();
    const monetization = this.cleanText(extractedIdea?.monetization, 220);
    const haystack = [
      extractedIdea?.ideaSummary,
      extractedIdea?.problem,
      extractedIdea?.solution,
      extractedIdea?.differentiation,
      extractedIdea?.mvpPlan,
      monetization,
      ideaSnapshot?.reason,
      ideaSnapshot?.oneLinerZh,
      repository.description,
      repository.content?.readmeText,
    ]
      .map((item) => String(item ?? '').toLowerCase())
      .join('\n');

    const productizationKeywords = [
      'saas',
      'subscription',
      'freemium',
      'enterprise',
      'seat',
      'per user',
      'per-seat',
      'dashboard',
      'console',
      'browser-based',
      'hosted',
      'cloud',
      'review history',
      'audit',
      'sso',
      'compliance',
      'on-prem',
      'workspace',
      'team',
      'collaboration',
    ];
    const workflowBoundaryKeywords = [
      'review',
      'approval',
      'diff',
      'workflow',
      'handoff',
      'monitor',
      'guardrail',
      'audit',
      'dashboard',
      'console',
      'task',
      'workspace',
      'mission control',
      'routing',
      'automation',
      'orchestration',
      'terminal',
      'cli',
      'pull request',
      'code review',
    ];
    const monetizationKeywords = [
      'pricing',
      'subscription',
      'freemium',
      'enterprise',
      'paid',
      'license',
      'seat',
      'per user',
      '$',
    ];

    const hasProductizationPath =
      ['saas', 'service', 'platform', 'app', 'web app'].includes(productForm) ||
      productizationKeywords.some((keyword) => haystack.includes(keyword)) ||
      monetization.length >= 20;
    const hasMonetizationPath =
      monetization.length >= 20 ||
      monetizationKeywords.some((keyword) => haystack.includes(keyword));
    const hasWorkflowBoundary =
      targetUsers.length > 0 &&
      workflowBoundaryKeywords.some((keyword) => haystack.includes(keyword));

    return {
      hasProductizationPath,
      hasMonetizationPath,
      hasWorkflowBoundary,
    };
  }

  private buildRepositoryHaystack(repository: RepositoryReviewTarget) {
    return [
      repository.name,
      repository.fullName,
      repository.description,
      repository.homepage,
      repository.language,
      ...(repository.topics ?? []),
      repository.content?.readmeText,
    ]
      .map((item) => String(item ?? '').toLowerCase())
      .join('\n');
  }

  private buildRepositoryIdentityHaystack(repository: RepositoryReviewTarget) {
    return [
      repository.name,
      repository.fullName,
      repository.description,
      ...(repository.topics ?? []),
    ]
      .map((item) => String(item ?? '').toLowerCase())
      .join('\n');
  }

  private normalizeOneLiner(
    value: unknown,
    fallback: string,
    projectType: ClaudeReviewProjectType,
    repository: RepositoryReviewTarget,
    signals?: {
      hasRealUser?: boolean;
      hasClearUseCase?: boolean;
      isDirectlyMonetizable?: boolean;
      categoryMain?: string | null;
      categorySub?: string | null;
      monetizationSummaryZh?: string | null;
    },
  ) {
    const result = condenseRepositoryOneLiner({
      repository: {
        name: repository.name,
        fullName: repository.fullName,
        description: repository.description,
        topics: repository.topics ?? [],
        readmeText: repository.content?.readmeText ?? null,
      },
      projectType,
      candidate: this.cleanText(value, 160) || null,
      fallback: this.cleanText(fallback, 160) || null,
      signals,
    });

    return {
      oneLinerZh: result.oneLinerZh,
      oneLinerMeta: {
        confidence: result.confidenceScore,
        confidenceLevel: result.confidence,
        reasoning: result.reasoning,
        riskFlags: result.riskFlags,
        strength: evaluateOneLinerStrength({
          oneLinerZh: result.oneLinerZh,
          projectReality: {
            type: projectType,
          },
          stars: repository.stars,
          categoryMain: this.cleanNullableText(repository.categoryL1, 24),
          categorySub: this.cleanNullableText(repository.categoryL2, 24),
          riskFlags: result.riskFlags,
        }),
      } satisfies ClaudeOneLinerMeta,
    };
  }

  private isGenericOneLiner(value: string) {
    const normalized = value.trim().toLowerCase();
    const genericPhrases = [
      '一个工具',
      '一个系统',
      '一个平台',
      '一个项目',
      '工具项目',
      '开源工具',
      '提效工具',
      '效率工具',
      '帮助用户提效',
      '自动化解决方案',
    ];

    return (
      normalized.length < 8 ||
      genericPhrases.some((phrase) => normalized === phrase || normalized.includes(`${phrase}。`))
    );
  }

  private async bumpRuntimeState(
    repositoryId: string,
    metrics?: {
      batchCallCountDelta?: number;
      batchItemCountDelta?: number;
      changed?: boolean;
      downgraded?: boolean;
      oneLinerRewritten?: boolean;
      goodCorrected?: boolean;
    },
  ) {
    const state = await this.getRuntimeState();
    const next = this.ensureRuntimeStateDate(state);
    next.reviewedCount += next.reviewedRepositoryIds.includes(repositoryId) ? 0 : 1;
    if (!next.reviewedRepositoryIds.includes(repositoryId)) {
      next.reviewedRepositoryIds = [...next.reviewedRepositoryIds, repositoryId].slice(-200);
    }
    next.batchCallCount += Math.max(0, metrics?.batchCallCountDelta ?? 1);
    next.totalBatchItems += Math.max(0, metrics?.batchItemCountDelta ?? 1);
    next.changedCount += metrics?.changed ? 1 : 0;
    next.downgradedCount += metrics?.downgraded ? 1 : 0;
    next.oneLinerRewriteCount += metrics?.oneLinerRewritten ? 1 : 0;
    next.goodCorrectedCount += metrics?.goodCorrected ? 1 : 0;
    next.lastRunAt = new Date().toISOString();
    next.lastError = null;
    await this.saveRuntimeState(next);
  }

  private async getRuntimeState(): Promise<ClaudeReviewRuntimeState> {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: CLAUDE_REVIEW_RUNTIME_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object' || Array.isArray(row.configValue)) {
      return this.emptyRuntimeState();
    }

    const value = row.configValue as Record<string, unknown>;
    return this.ensureRuntimeStateDate({
      date: this.cleanText(value.date, 20) || this.toDateKey(new Date()),
      reviewedCount: this.readIntLike(value.reviewedCount, 0),
      reviewedRepositoryIds: this.normalizeStringArray(value.reviewedRepositoryIds).slice(-200),
      lastRunAt: this.cleanNullableText(value.lastRunAt, 40),
      lastError: this.cleanNullableText(value.lastError, 300),
      batchCallCount: this.readIntLike(value.batchCallCount, 0),
      totalBatchItems: this.readIntLike(value.totalBatchItems, 0),
      changedCount: this.readIntLike(value.changedCount, 0),
      downgradedCount: this.readIntLike(value.downgradedCount, 0),
      oneLinerRewriteCount: this.readIntLike(value.oneLinerRewriteCount, 0),
      goodCorrectedCount: this.readIntLike(value.goodCorrectedCount, 0),
    });
  }

  private async saveRuntimeState(state: ClaudeReviewRuntimeState) {
    await this.prisma.systemConfig.upsert({
      where: {
        configKey: CLAUDE_REVIEW_RUNTIME_CONFIG_KEY,
      },
      update: {
        configValue: state as unknown as Prisma.InputJsonValue,
      },
      create: {
        configKey: CLAUDE_REVIEW_RUNTIME_CONFIG_KEY,
        configValue: state as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private ensureRuntimeStateDate(state: ClaudeReviewRuntimeState) {
    const today = this.toDateKey(new Date());
    if (state.date === today) {
      return state;
    }

    return {
      date: today,
      reviewedCount: 0,
      reviewedRepositoryIds: [],
      lastRunAt: state.lastRunAt,
      lastError: state.lastError,
      batchCallCount: 0,
      totalBatchItems: 0,
      changedCount: 0,
      downgradedCount: 0,
      oneLinerRewriteCount: 0,
      goodCorrectedCount: 0,
    };
  }

  private emptyRuntimeState(): ClaudeReviewRuntimeState {
    return {
      date: this.toDateKey(new Date()),
      reviewedCount: 0,
      reviewedRepositoryIds: [],
      lastRunAt: null,
      lastError: null,
      batchCallCount: 0,
      totalBatchItems: 0,
      changedCount: 0,
      downgradedCount: 0,
      oneLinerRewriteCount: 0,
      goodCorrectedCount: 0,
    };
  }

  private normalizeProjectType(value: unknown): ClaudeReviewProjectType {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (
      normalized === 'product' ||
      normalized === 'tool' ||
      normalized === 'model' ||
      normalized === 'infra' ||
      normalized === 'demo'
    ) {
      return normalized;
    }
    return 'demo';
  }

  private normalizeOneLinerStrength(value: unknown): OneLinerStrength | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    return normalized === 'STRONG' ||
      normalized === 'MEDIUM' ||
      normalized === 'WEAK'
      ? normalized
      : null;
  }

  private normalizeVerdict(value: unknown): ClaudeReviewVerdict | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'GOOD' || normalized === 'OK' || normalized === 'BAD') {
      return normalized;
    }
    return null;
  }

  private normalizeAction(value: unknown): ClaudeReviewAction | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'BUILD' || normalized === 'CLONE' || normalized === 'IGNORE') {
      return normalized;
    }
    return null;
  }

  private normalizeAnchorMatch(value: unknown): InsightAnchorMatch | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'GOOD' || normalized === 'CLONE' || normalized === 'BAD') {
      return normalized;
    }
    return null;
  }

  private normalizeReviewPriority(value: unknown): ClaudeReviewPriority {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (
      normalized === 'P0' ||
      normalized === 'P1' ||
      normalized === 'P2' ||
      normalized === 'P3'
    ) {
      return normalized;
    }

    return 'P2';
  }

  private normalizeReplayPriority(value: unknown): ReplayPriority | null {
    const normalized = this.normalizeReviewPriority(value);
    if (normalized === 'P0' || normalized === 'P1' || normalized === 'P2') {
      return normalized;
    }

    return null;
  }

  private priorityRank(priority: ClaudeReviewPriority) {
    if (priority === 'P0') {
      return 0;
    }

    if (priority === 'P1') {
      return 1;
    }

    if (priority === 'P2') {
      return 2;
    }

    return 3;
  }

  private normalizeConfidence(value: unknown) {
    const parsed = this.toNumber(value);
    if (parsed == null) {
      return 0.5;
    }
    return Math.max(0, Math.min(1, Number(parsed.toFixed(3))));
  }

  private readJsonObject(value: Prisma.JsonValue | Record<string, unknown> | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .map((item) => String(item ?? '').trim())
      .filter((item) => Boolean(item));
  }

  private normalizeMoneyDecision(
    value: unknown,
    businessJudgement: ClaudeReviewBusinessJudgement,
    verdict: ClaudeReviewVerdict,
    action: ClaudeReviewAction,
  ): MoneyDecision {
    const normalized = String(value ?? '').trim().toUpperCase();

    if (
      normalized === 'MUST_BUILD' ||
      normalized === 'HIGH_VALUE' ||
      normalized === 'CLONEABLE' ||
      normalized === 'LOW_VALUE' ||
      normalized === 'IGNORE'
    ) {
      return normalized as MoneyDecision;
    }

    if (normalized === 'BUILDABLE') {
      return 'HIGH_VALUE';
    }

    if (normalized === 'CLONE_ONLY') {
      return 'CLONEABLE';
    }

    if (normalized === 'NOT_WORTH') {
      return verdict === 'BAD' || action === 'IGNORE' ? 'IGNORE' : 'LOW_VALUE';
    }

    const hint = String(businessJudgement.moneyPriorityHint ?? '')
      .trim()
      .toUpperCase();
    if (hint === 'MUST_LOOK' || hint === 'MUST_BUILD') {
      return 'MUST_BUILD';
    }
    if (
      hint === 'WORTH_BUILDING' ||
      hint === 'HIGH_VALUE' ||
      hint === 'BUILDABLE'
    ) {
      return 'HIGH_VALUE';
    }
    if (
      hint === 'WORTH_CLONING' ||
      hint === 'CLONEABLE' ||
      hint === 'CLONE_ONLY'
    ) {
      return 'CLONEABLE';
    }
    if (hint === 'LOW_PRIORITY' || hint === 'LOW_VALUE') {
      return 'LOW_VALUE';
    }
    if (hint === 'IGNORE') {
      return 'IGNORE';
    }

    if (verdict === 'GOOD' && action === 'BUILD') {
      return businessJudgement.hasNearTermMonetizationPath
        ? 'HIGH_VALUE'
        : 'CLONEABLE';
    }

    if (verdict === 'OK' && action === 'CLONE') {
      return 'CLONEABLE';
    }

    if (verdict === 'BAD' || action === 'IGNORE') {
      return 'IGNORE';
    }

    return 'LOW_VALUE';
  }

  private normalizeTrainingHints(value: unknown): ClaudeTrainingHints {
    const record =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return {
      localModelMistakes: this.takeUniqueStrings(
        this.normalizeStringArray(record.localModelMistakes),
        8,
      ),
      ruleSuggestions: this.takeUniqueStrings(
        this.normalizeStringArray(record.ruleSuggestions),
        8,
      ),
      promptSuggestions: this.takeUniqueStrings(
        this.normalizeStringArray(record.promptSuggestions),
        8,
      ),
      anchorSuggestions: this.takeUniqueStrings(
        this.normalizeStringArray(record.anchorSuggestions),
        8,
      ),
      shouldUpdateLocalHeuristics: Boolean(record.shouldUpdateLocalHeuristics),
    };
  }

  private mergeFallbackLearningIntoTrainingHints(
    trainingHints: ClaudeTrainingHints,
    fallbackDiff: ClaudeFallbackDiff,
  ): ClaudeTrainingHints {
    if (!fallbackDiff.changed) {
      return trainingHints;
    }

    return {
      localModelMistakes: this.pushUniqueString(
        trainingHints.localModelMistakes,
        'fallback_gap',
        8,
      ),
      ruleSuggestions: this.pushUniqueString(
        trainingHints.ruleSuggestions,
        '对 fallback 与 Claude 差异明显的类型降低本地高置信判断，并优先走复核。',
        8,
      ),
      promptSuggestions: this.pushUniqueString(
        trainingHints.promptSuggestions,
        '当项目边界模糊时，必须明确写出用户、场景和收费路径，避免 fallback 过度自信。',
        8,
      ),
      anchorSuggestions: this.pushUniqueString(
        trainingHints.anchorSuggestions,
        '补一个 capability layer 被 fallback 误判成产品、但 Claude 改回 CLONE 的反例 anchor。',
        8,
      ),
      shouldUpdateLocalHeuristics: true,
    };
  }

  private buildFallbackDiff(
    previousFallbackReview: Record<string, unknown> | null,
    currentReview: ClaudeReviewRecord,
  ): ClaudeFallbackDiff {
    if (!previousFallbackReview) {
      return {
        changed: false,
        reasons: [],
        previousReviewedAt: null,
      };
    }

    const previousGeneratedBy = this.cleanText(previousFallbackReview.generatedBy, 40);
    if (previousGeneratedBy !== 'local_fallback' || currentReview.generatedBy !== 'claude') {
      return {
        changed: false,
        reasons: [],
        previousReviewedAt: this.cleanNullableText(
          previousFallbackReview.reviewedAt,
          40,
        ),
      };
    }

    const reasons: string[] = [];
    const previousVerdict = this.normalizeVerdict(previousFallbackReview.verdict);
    const previousAction = this.normalizeAction(previousFallbackReview.action);
    const previousProjectType = this.normalizeProjectType(previousFallbackReview.projectType);
    const previousOneLiner = this.cleanText(previousFallbackReview.oneLinerZh, 160);

    if (previousVerdict && previousVerdict !== currentReview.verdict) {
      reasons.push(`verdict:${previousVerdict}->${currentReview.verdict}`);
    }

    if (previousAction && previousAction !== currentReview.action) {
      reasons.push(`action:${previousAction}->${currentReview.action}`);
    }

    if (previousProjectType !== currentReview.projectType) {
      reasons.push(`projectType:${previousProjectType}->${currentReview.projectType}`);
    }

    if (
      previousOneLiner &&
      currentReview.oneLinerZh &&
      previousOneLiner !== currentReview.oneLinerZh &&
      this.isMeaningfulOneLinerDrift(previousOneLiner, currentReview.oneLinerZh)
    ) {
      reasons.push('one_liner_drift');
    }

    return {
      changed: reasons.length > 0,
      reasons: reasons.slice(0, 6),
      previousReviewedAt: this.cleanNullableText(previousFallbackReview.reviewedAt, 40),
    };
  }

  private isMeaningfulOneLinerDrift(left: string, right: string) {
    const normalize = (value: string) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[。！？!?,，]/g, ' ')
        .replace(/\s+/g, ' ');

    const leftNormalized = normalize(left);
    const rightNormalized = normalize(right);

    if (!leftNormalized || !rightNormalized || leftNormalized === rightNormalized) {
      return false;
    }

    if (
      this.isGenericOneLiner(leftNormalized) !==
      this.isGenericOneLiner(rightNormalized)
    ) {
      return true;
    }

    return !leftNormalized.includes(rightNormalized) && !rightNormalized.includes(leftNormalized);
  }

  private didReviewChangeLocal(
    localInsight: LocalInsightMetadata,
    review: ClaudeReviewRecord,
  ) {
    return Boolean(
      localInsight.verdict !== review.verdict ||
        localInsight.action !== review.action ||
        localInsight.projectType !== review.projectType ||
        this.didRewriteOneLiner(localInsight.oneLinerZh, review.oneLinerZh),
    );
  }

  private didDowngradeFromGood(
    localInsight: LocalInsightMetadata,
    review: ClaudeReviewRecord,
  ) {
    return Boolean(
      localInsight.verdict === 'GOOD' &&
        localInsight.action === 'BUILD' &&
        (review.verdict !== 'GOOD' || review.action !== 'BUILD'),
    );
  }

  private didRewriteOneLiner(left: string, right: string) {
    return this.isMeaningfulOneLinerDrift(left, right);
  }

  private readPreviousFallbackReview(repository: RepositoryReviewTarget) {
    if (repository.analysis?.claudeReviewStatus !== 'SUCCESS') {
      return null;
    }

    const review = this.readJsonObject(repository.analysis?.claudeReviewJson);
    if (!review) {
      return null;
    }

    return this.cleanText(review.generatedBy, 40) === 'local_fallback' ? review : null;
  }

  private readDecisionContext(value: Record<string, unknown>): ReviewDecisionContext {
    const finalDecision = this.readJsonObject(
      value.finalDecision as Prisma.JsonValue | Record<string, unknown> | null | undefined,
    );
    const trainingAsset = this.readJsonObject(
      value.trainingAsset as Prisma.JsonValue | Record<string, unknown> | null | undefined,
    );
    const moneyDecision =
      finalDecision &&
      typeof finalDecision.moneyDecision === 'object' &&
      finalDecision.moneyDecision &&
      !Array.isArray(finalDecision.moneyDecision)
        ? (finalDecision.moneyDecision as Record<string, unknown>)
        : null;

    return {
      finalDecision: finalDecision as RepositoryFinalDecision | null,
      trainingAsset: trainingAsset as RepositoryTrainingAsset | null,
      moneyPriority: finalDecision
        ? {
            score: this.toNumber(
              moneyDecision?.score,
            ) ?? 0,
            tier: this.normalizeReplayPriority(finalDecision.moneyPriority) ?? 'P3',
            reasonZh: this.cleanText(finalDecision.reasonZh, 240),
            recommendedMoveZh: this.cleanText(
              moneyDecision?.recommendedMoveZh,
              120,
            ),
            targetUsersZh: this.cleanText(
              moneyDecision?.targetUsersZh,
              160,
            ),
            monetizationSummaryZh: this.cleanText(
              moneyDecision?.monetizationSummaryZh,
              180,
            ),
          }
        : null,
      hasConflict: Boolean(finalDecision?.hasConflict),
      needsClaudeReview: Boolean(
        finalDecision?.needsRecheck ||
          trainingAsset?.shouldTrain,
      ),
    };
  }

  private buildReadmeReviewBrief(repository: RepositoryReviewTarget) {
    const raw = this.cleanText(repository.content?.readmeText, 1_600);
    if (!raw) {
      return '';
    }

    const lines = raw
      .split('\n')
      .map((line) =>
        line
          .replace(/^#+\s*/, '')
          .replace(/!\[[^\]]*]\([^)]*\)/g, '')
          .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
          .replace(/[`>*_-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((line) => line.length >= 20);

    const selected: string[] = [];
    const keywordPattern =
      /(for |helps |workflow|review|approval|audit|monitor|dashboard|api|team|developer|platform|template|boilerplate|scaffold|framework|demo|用户|团队|开发者|审查|审批|工作流|收费|订阅|平台)/i;

    for (const line of lines) {
      if (selected.length >= 6) {
        break;
      }

      if (keywordPattern.test(line) || selected.length < 4) {
        selected.push(line);
      }
    }

    return this.cleanText(selected.join('\n'), 520);
  }

  private takeUniqueStrings(values: string[], limit: number) {
    return Array.from(new Set(values)).slice(0, limit);
  }

  private pushUniqueString(values: string[], nextValue: string, limit: number) {
    const normalized = this.cleanText(nextValue, 220);
    if (!normalized) {
      return values.slice(0, limit);
    }

    const next = [...values];
    if (!next.includes(normalized)) {
      next.push(normalized);
    }

    return next.slice(0, limit);
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }
    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength - 1)}…`
      : normalized;
  }

  private cleanNullableText(value: unknown, maxLength: number) {
    const normalized = this.cleanText(value, maxLength);
    return normalized || null;
  }

  private toNumber(value: unknown) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
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

  private readIntLike(value: unknown, fallback: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
