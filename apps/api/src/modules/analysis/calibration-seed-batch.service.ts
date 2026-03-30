import { Injectable } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { RepositoryAnalysis } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CompletenessService } from './completeness.service';
import { HistoricalRepairPriorityService } from './historical-repair-priority.service';
import { IdeaExtractService } from './idea-extract.service';
import { IdeaFitService } from './idea-fit.service';
import { IdeaSnapshotService } from './idea-snapshot.service';
import { RepositoryInsightService } from './repository-insight.service';
import {
  buildAnalysisOutcomeSnapshot,
  buildHistoricalRepairOutcomeLog,
} from './helpers/analysis-outcome.helper';
import type {
  AnalysisOutcomeAfterContext,
  AnalysisOutcomeLog,
  AnalysisOutcomeSnapshot,
  AnalysisOutcomeStatus,
} from './helpers/analysis-outcome.types';
import {
  buildCalibrationSeedBatchReport,
  buildCalibrationSeedSelectionReport,
  type CalibrationSeedBatchReport,
} from './helpers/calibration-seed-batch.helper';
import {
  buildCalibrationSeedRefreshReport,
  buildCalibrationSeedRefreshSelectionReport,
  type CalibrationSeedRefreshReport,
  type CalibrationSeedRefreshSelectionItem,
} from './helpers/calibration-seed-refresh.helper';
import { runWithConcurrency } from './helpers/run-with-concurrency.helper';
import {
  buildModelTaskRouterDecision,
  buildModelTaskRouterDecisionInputFromHistoricalItem,
  buildModelTaskRouterExecutionMetadata,
} from './helpers/model-task-router-decision.helper';
import {
  buildDecisionRecalcGateSnapshot,
  buildDecisionRecalcGateSnapshotMap,
  readDecisionRecalcGateSnapshot,
} from './helpers/decision-recalc-gate.helper';
import type { DecisionRecalcGateSnapshot } from './helpers/decision-recalc-gate.types';
import {
  buildHistoricalRepairItemIndexes,
  buildDecisionRecalcInputFingerprint,
  resolveHistoricalAfterItem,
  compareDecisionRecalcFingerprints,
} from './helpers/repair-effectiveness-surgery.helper';
import {
  buildAfterContextFromOutcomeBefore,
  buildDeepRepairAnalysisSnapshot,
  resolveDeepRepairAfterState,
} from './helpers/deep-repair-writeback.helper';
import type { HistoricalRepairPriorityItem } from './helpers/historical-repair-priority.helper';

const SEED_REPORT_CONFIG_KEY = 'analysis.calibration_seed_batch.latest';
const SEED_REFRESH_REPORT_CONFIG_KEY =
  'analysis.calibration_seed_batch_refresh.latest';
const SEED_OUTCOME_CONFIG_KEY = 'analysis.outcome.seed.latest';
const SEED_REFRESH_OUTCOME_CONFIG_KEY = 'analysis.outcome.seed_refresh.latest';
const OUTCOME_CONFIG_KEY = 'analysis.outcome.latest';
const DECISION_RECALC_GATE_CONFIG_KEY = 'analysis.decision_recalc_gate.latest';

type CalibrationSeedExecutionRecord = {
  item: HistoricalRepairPriorityItem;
  routerDecision: ReturnType<typeof buildModelTaskRouterDecision>;
  routerMetadata: ReturnType<typeof buildModelTaskRouterExecutionMetadata>;
  outcomeStatus: AnalysisOutcomeStatus | null;
  outcomeReason: string;
  executionDurationMs: number;
  executionUsedFallback: boolean;
  executionUsedReview: boolean;
  afterItemOverride?: HistoricalRepairPriorityItem | null;
  liveAfterItem?: HistoricalRepairPriorityItem | null;
};

export type CalibrationSeedBatchRunOptions = {
  perGroup?: number;
  concurrency?: number;
};

export type CalibrationSeedRefreshRunOptions = {
  decisionRecalcTarget?: number;
  deepRepairHighValueTarget?: number;
  deepRepairGeneralValueTarget?: number;
  evidenceRepairWeakOnlyTarget?: number;
  evidenceRepairNonWeakOnlyTarget?: number;
  concurrency?: number;
};

@Injectable()
export class CalibrationSeedBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historicalRepairPriorityService: HistoricalRepairPriorityService,
    private readonly repositoryInsightService: RepositoryInsightService,
    private readonly ideaSnapshotService: IdeaSnapshotService,
    private readonly completenessService: CompletenessService,
    private readonly ideaFitService: IdeaFitService,
    private readonly ideaExtractService: IdeaExtractService,
  ) {}

  async runSeedBatch(
    options?: CalibrationSeedBatchRunOptions,
  ): Promise<CalibrationSeedBatchReport> {
    const generatedAt = new Date().toISOString();
    const perGroup = Math.max(1, Math.round(options?.perGroup ?? 20));
    const concurrency = Math.max(1, Math.round(options?.concurrency ?? 2));
    const beforePriorityItems = await this.loadSelectionPriorityItems();
    const selection = buildCalibrationSeedSelectionReport({
      generatedAt,
      perGroupTarget: perGroup,
      items: beforePriorityItems,
    });
    const itemMap = new Map(
      beforePriorityItems.map((item) => [this.buildItemKey(item), item]),
    );
    const executedRecords: CalibrationSeedExecutionRecord[] = [];

    const records = await runWithConcurrency(
      selection.items,
      concurrency,
      async (seed) => {
        const item = itemMap.get(`${seed.repositoryId}:${seed.historicalRepairAction}`);
        if (!item) {
          return null;
        }
        return this.executeSeedItem(item);
      },
    );
    executedRecords.push(
      ...records.filter((record): record is CalibrationSeedExecutionRecord =>
        Boolean(record),
      ),
    );
    const selectedRepositoryIds = [
      ...new Set(selection.items.map((item) => item.repositoryId).filter(Boolean)),
    ];
    const afterPriorityReport =
      await this.historicalRepairPriorityService.runPriorityReport({
        repositoryIds: selectedRepositoryIds,
      });
    const afterIndexes = buildHistoricalRepairItemIndexes(afterPriorityReport.items);
    const outcomeLogs = executedRecords.map((record) => {
      const persistedAfterResolution = resolveHistoricalAfterItem({
        beforeItem: record.item,
        indexes: afterIndexes,
      });
      const beforeAfter = buildAfterContextFromOutcomeBefore({
        repositoryId: record.item.repoId,
        normalizedTaskType: record.routerMetadata.routerNormalizedTaskType,
        taskIntent: record.routerMetadata.routerTaskIntent,
        historicalRepairBucket: record.item.historicalRepairBucket,
        historicalRepairAction: record.item.historicalRepairAction,
        cleanupState: record.item.cleanupState,
        analysisQualityScoreBefore: record.item.analysisQualityScore,
        analysisQualityStateBefore: record.item.analysisQualityState,
        decisionStateBefore: record.item.frontendDecisionState,
        trustedEligibilityBefore:
          record.item.frontendDecisionState === 'trusted' &&
          record.item.trustedFlowEligible &&
          !record.item.cleanupBlocksTrusted,
        keyEvidenceGapsBefore: record.item.keyEvidenceGaps,
        trustedBlockingGapsBefore: record.item.trustedBlockingGaps,
        evidenceCoverageRateBefore: record.item.evidenceCoverageRate,
      });
      const deepAfterState =
        record.item.historicalRepairAction === 'deep_repair'
          ? resolveDeepRepairAfterState({
              beforeAfter,
              liveAfter: this.buildAfterContext(record.liveAfterItem ?? null),
              afterItemOverride: this.buildAfterContext(
                record.afterItemOverride ?? null,
              ),
              persistedAfter: this.buildAfterContext(
                persistedAfterResolution.afterItem,
              ),
            })
          : null;
      const afterItem =
        record.item.historicalRepairAction === 'deep_repair'
          ? record.liveAfterItem ??
            record.afterItemOverride ??
            persistedAfterResolution.afterItem ??
            record.item
          : record.afterItemOverride ??
            persistedAfterResolution.afterItem ??
            record.item;
      const afterContext =
        deepAfterState?.afterContext ?? this.buildAfterContext(afterItem);
      return buildHistoricalRepairOutcomeLog({
        item: record.item,
        routerDecision: record.routerDecision,
        routerMetadata: record.routerMetadata,
        outcomeStatus:
          record.outcomeStatus ??
          this.classifyOutcomeStatus({
            item: record.item,
            afterContext,
          }),
        outcomeReason: record.outcomeReason,
        executionDurationMs: record.executionDurationMs,
        executionUsedFallback: record.executionUsedFallback,
        executionUsedReview: record.executionUsedReview,
        after: afterContext,
      });
    });

    const report = buildCalibrationSeedBatchReport({
      generatedAt,
      selection,
      logs: outcomeLogs,
    });

    await Promise.all([
      this.saveSystemConfig(SEED_REPORT_CONFIG_KEY, report),
      this.saveSystemConfig(SEED_OUTCOME_CONFIG_KEY, report.snapshot),
      this.persistMergedOutcomeSnapshot(report.snapshot),
    ]);

    return report;
  }

  async runSeedBatchRefresh(
    options?: CalibrationSeedRefreshRunOptions,
  ): Promise<CalibrationSeedRefreshReport> {
    const generatedAt = new Date().toISOString();
    const concurrency = Math.max(1, Math.round(options?.concurrency ?? 2));
    const beforePriorityItems = await this.loadSelectionPriorityItems();
    const baselineReport = await this.readLatestCalibrationSeedBatchReport();
    const decisionGateSnapshot = await this.buildCurrentDecisionRecalcGateSnapshot(
      beforePriorityItems,
      generatedAt,
    );
    const selection = buildCalibrationSeedRefreshSelectionReport({
      generatedAt,
      items: beforePriorityItems,
      decisionGateSnapshot,
      decisionRecalcTarget: options?.decisionRecalcTarget ?? 20,
      deepRepairHighValueTarget: options?.deepRepairHighValueTarget ?? 10,
      deepRepairGeneralValueTarget: options?.deepRepairGeneralValueTarget ?? 10,
      evidenceRepairWeakOnlyTarget: options?.evidenceRepairWeakOnlyTarget ?? 10,
      evidenceRepairNonWeakOnlyTarget:
        options?.evidenceRepairNonWeakOnlyTarget ?? 10,
    });
    const outcomeLogs = await this.executeSelectionAndBuildOutcomeLogs({
      selectionItems: selection.items,
      beforePriorityItems,
      concurrency,
    });
    const report = buildCalibrationSeedRefreshReport({
      generatedAt,
      selection,
      logs: outcomeLogs,
      baseline: baselineReport,
    });

    await Promise.all([
      this.saveSystemConfig(SEED_REFRESH_REPORT_CONFIG_KEY, report),
      this.saveSystemConfig(SEED_REFRESH_OUTCOME_CONFIG_KEY, report.snapshot),
      this.persistMergedOutcomeSnapshot(report.snapshot),
    ]);

    return report;
  }

  private async loadSelectionPriorityItems() {
    const cachedItems = await this.readLatestPriorityReportItems();
    if (cachedItems.length > 0) {
      return cachedItems;
    }

    const report = await this.historicalRepairPriorityService.runPriorityReport();
    return report.items;
  }

  private async executeSeedItem(
    item: HistoricalRepairPriorityItem,
  ): Promise<CalibrationSeedExecutionRecord> {
    const startedAt = Date.now();
    const input = buildModelTaskRouterDecisionInputFromHistoricalItem(item);
    const routerDecision = buildModelTaskRouterDecision(input);
    const routerMetadata = buildModelTaskRouterExecutionMetadata({
      input,
      decision: routerDecision,
    });
    let outcomeStatus: AnalysisOutcomeStatus | null = null;
    let outcomeReason = 'seed_batch_completed';
    let executionUsedFallback =
      routerDecision.fallbackPolicy === 'LIGHT_DERIVATION' ||
      routerDecision.fallbackPolicy === 'DETERMINISTIC_ONLY' ||
      routerDecision.fallbackPolicy === 'DOWNGRADE_ONLY';
    const executionUsedReview = routerDecision.requiresReview;

    if (item.cleanupState !== 'active') {
      return {
        item,
        routerDecision,
        routerMetadata,
        outcomeStatus: 'skipped',
        outcomeReason: `cleanup_state_${item.cleanupState}_suppressed`,
        executionDurationMs: Date.now() - startedAt,
        executionUsedFallback: true,
        executionUsedReview: false,
        afterItemOverride: item,
      };
    }

    try {
      switch (item.historicalRepairAction) {
        case 'decision_recalc': {
          const beforePriorityReport =
            await this.historicalRepairPriorityService.runPriorityReport({
              repositoryIds: [item.repoId],
            });
          const beforeItem = beforePriorityReport.items[0] ?? item;
          const beforeFingerprint = buildDecisionRecalcInputFingerprint(beforeItem);
          await this.repositoryInsightService.refreshInsight(item.repoId);
          const afterPriorityReport =
            await this.historicalRepairPriorityService.runPriorityReport({
              repositoryIds: [item.repoId],
            });
          const afterItem = afterPriorityReport.items[0] ?? beforeItem;
          const afterFingerprint = buildDecisionRecalcInputFingerprint(afterItem);
          const comparison = compareDecisionRecalcFingerprints({
            before: beforeFingerprint,
            after: afterFingerprint,
          });

          if (comparison.sameInputsReplayed) {
            outcomeStatus = 'no_change';
            outcomeReason = 'decision_recalc_same_inputs_replayed';
          } else if (
            afterItem.frontendDecisionState === beforeItem.frontendDecisionState
          ) {
            outcomeReason = 'decision_recalc_new_signal_no_decision_change';
          } else {
            outcomeReason = 'decision_recalc_new_signal_decision_changed';
          }

          return {
            item,
            routerDecision,
            routerMetadata,
            outcomeStatus,
            outcomeReason,
            executionDurationMs: Date.now() - startedAt,
            executionUsedFallback,
            executionUsedReview,
            afterItemOverride: afterItem,
          };
        }
        case 'deep_repair': {
          const deepResult = await this.executeDeepRepair(item);
          return {
            item,
            routerDecision,
            routerMetadata,
            outcomeStatus: deepResult.outcomeStatus,
            outcomeReason: deepResult.reason,
            executionDurationMs: Date.now() - startedAt,
            executionUsedFallback:
              executionUsedFallback || deepResult.executionUsedFallback,
            executionUsedReview,
            afterItemOverride: deepResult.afterItemOverride,
            liveAfterItem: deepResult.liveAfterItem,
          };
        }
        case 'evidence_repair': {
          const result = await this.ideaSnapshotService.analyzeRepository(item.repoId, {
            onlyIfMissing: true,
          });
          outcomeReason = `evidence_repair_snapshot_${result.action}`;
          break;
        }
        case 'refresh_only': {
          const result = await this.ideaSnapshotService.analyzeRepository(item.repoId, {
            onlyIfMissing: true,
          });
          outcomeReason = `refresh_only_snapshot_${result.action}`;
          break;
        }
        case 'downgrade_only': {
          outcomeStatus = 'downgraded';
          outcomeReason = 'frontend_guard_downgrade_applied';
          executionUsedFallback = true;
          break;
        }
        default: {
          outcomeStatus = 'skipped';
          outcomeReason = `unsupported_seed_action_${item.historicalRepairAction}`;
        }
      }
    } catch (error) {
      outcomeStatus = 'failed';
      outcomeReason =
        error instanceof Error ? error.message : 'seed_batch_execution_failed';
    }

    return {
      item,
      routerDecision,
      routerMetadata,
      outcomeStatus,
      outcomeReason,
      executionDurationMs: Date.now() - startedAt,
      executionUsedFallback,
      executionUsedReview,
      afterItemOverride: undefined,
      liveAfterItem: undefined,
    };
  }

  private async executeDeepRepair(item: HistoricalRepairPriorityItem) {
    const repositoryId = item.repoId;
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      select: {
        analysis: {
          select: {
            completenessJson: true,
            ideaFitJson: true,
            extractedIdeaJson: true,
          },
        },
      },
    });

    if (!repository) {
      return {
        outcomeStatus: 'skipped' as const,
        reason: 'repository_missing_for_deep_repair',
        executionUsedFallback: false,
        liveAfterItem: null,
        afterItemOverride: null,
      };
    }

    const seedPlan = this.buildDeepRepairSeedPlan({
      item,
      analysis: repository.analysis,
    });

    if (!seedPlan.step) {
      return {
        outcomeStatus: 'no_change' as const,
        reason: 'deep_targets_already_present',
        executionUsedFallback: false,
        liveAfterItem: item,
        afterItemOverride: null,
      };
    }

    const beforeAnalysisSnapshot = buildDeepRepairAnalysisSnapshot(
      repository.analysis,
    );

    try {
      switch (seedPlan.step) {
        case 'completeness': {
          await this.completenessService.analyzeRepository(repositoryId);
          break;
        }
        case 'idea_fit': {
          await this.ideaFitService.analyzeRepository(repositoryId);
          break;
        }
        case 'idea_extract_light': {
          const extractResult = await this.ideaExtractService.analyzeRepository(
            repositoryId,
            {
              deferIfBusy: false,
              mode: 'light',
            },
          );

          if ('deferred' in extractResult && extractResult.deferred) {
            return {
              outcomeStatus: 'failed' as const,
              reason: 'deep_repair_seed_idea_extract_deferred',
              executionUsedFallback: false,
              liveAfterItem: null,
              afterItemOverride: null,
            };
          }
          break;
        }
      }
    } catch {
      return {
        outcomeStatus: 'failed' as const,
        reason: `deep_repair_seed_${seedPlan.step}_failed`,
        executionUsedFallback: false,
        liveAfterItem: null,
        afterItemOverride: null,
      };
    }

    const updatedRepository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      select: {
        analysis: {
          select: {
            completenessJson: true,
            ideaFitJson: true,
            extractedIdeaJson: true,
          },
        },
      },
    });
    const afterAnalysisSnapshot = buildDeepRepairAnalysisSnapshot(
      updatedRepository?.analysis ?? null,
    );
    const liveAfterReport =
      await this.historicalRepairPriorityService.runPriorityReport({
        repositoryIds: [repositoryId],
      });
    const liveAfterItem = liveAfterReport.items[0] ?? null;

    return {
      outcomeStatus: null,
      reason:
        JSON.stringify(beforeAnalysisSnapshot) ===
        JSON.stringify(afterAnalysisSnapshot)
          ? `deep_repair_seed_${seedPlan.step}_executed_without_structural_output`
          : `deep_repair_seed_${seedPlan.step}_executed`,
      executionUsedFallback: false,
      liveAfterItem,
      afterItemOverride: null,
    };
  }

  private buildMissingDeepAnalysisDto(
    analysis:
      | Pick<
          RepositoryAnalysis,
          'completenessJson' | 'ideaFitJson' | 'extractedIdeaJson'
        >
      | null,
  ) {
    return {
      runCompleteness: !analysis?.completenessJson,
      runIdeaFit: !analysis?.ideaFitJson,
      runIdeaExtract: !analysis?.extractedIdeaJson,
    };
  }

  private buildAfterContext(
    item: HistoricalRepairPriorityItem | null,
  ): Partial<AnalysisOutcomeAfterContext> | undefined {
    if (!item) {
      return undefined;
    }

    return {
      analysisQualityScoreAfter: item.analysisQualityScore,
      analysisQualityStateAfter: item.analysisQualityState,
      decisionStateAfter: item.frontendDecisionState,
      trustedEligibilityAfter:
        item.frontendDecisionState === 'trusted' &&
        item.trustedFlowEligible &&
        !item.cleanupBlocksTrusted,
      keyEvidenceGapsAfter: item.keyEvidenceGaps,
      trustedBlockingGapsAfter: item.trustedBlockingGaps,
      evidenceCoverageRateAfter: item.evidenceCoverageRate,
    };
  }

  private classifyOutcomeStatus(args: {
    item: HistoricalRepairPriorityItem;
    afterContext?: Partial<AnalysisOutcomeAfterContext>;
  }): AnalysisOutcomeStatus {
    if (!args.afterContext) {
      return 'failed';
    }

    const afterContext: AnalysisOutcomeAfterContext = {
      analysisQualityScoreAfter:
        args.afterContext.analysisQualityScoreAfter ?? args.item.analysisQualityScore,
      analysisQualityStateAfter:
        args.afterContext.analysisQualityStateAfter ?? args.item.analysisQualityState,
      decisionStateAfter:
        args.afterContext.decisionStateAfter ?? args.item.frontendDecisionState,
      trustedEligibilityAfter:
        args.afterContext.trustedEligibilityAfter ??
        (args.item.frontendDecisionState === 'trusted'),
      keyEvidenceGapsAfter:
        args.afterContext.keyEvidenceGapsAfter ?? args.item.keyEvidenceGaps,
      trustedBlockingGapsAfter:
        args.afterContext.trustedBlockingGapsAfter ??
        args.item.trustedBlockingGaps,
      evidenceCoverageRateAfter:
        args.afterContext.evidenceCoverageRateAfter ?? args.item.evidenceCoverageRate,
    };

    if (args.item.historicalRepairAction === 'downgrade_only') {
      return afterContext.decisionStateAfter === 'trusted'
        ? 'no_change'
        : 'downgraded';
    }

    const qualityDelta =
      afterContext.analysisQualityScoreAfter - args.item.analysisQualityScore;
    const gapCountDelta =
      afterContext.keyEvidenceGapsAfter.length - args.item.keyEvidenceGaps.length;
    const blockingGapDelta =
      afterContext.trustedBlockingGapsAfter.length -
      args.item.trustedBlockingGaps.length;
    const decisionChanged =
      afterContext.decisionStateAfter !== args.item.frontendDecisionState;
    const trustedChanged =
      Boolean(afterContext.trustedEligibilityAfter) !==
      (args.item.frontendDecisionState === 'trusted');
    const coverageDelta =
      afterContext.evidenceCoverageRateAfter - args.item.evidenceCoverageRate;
    const positiveSignals = [
      qualityDelta > 0,
      gapCountDelta < 0,
      blockingGapDelta < 0,
      decisionChanged,
      trustedChanged,
      coverageDelta > 0,
    ].filter(Boolean).length;

    if (positiveSignals === 0) {
      return 'no_change';
    }

    if (
      qualityDelta >= 8 ||
      gapCountDelta <= -2 ||
      blockingGapDelta <= -1 ||
      decisionChanged ||
      trustedChanged
    ) {
      return 'success';
    }

    return 'partial';
  }

  private async persistMergedOutcomeSnapshot(
    nextSnapshot: AnalysisOutcomeSnapshot,
  ) {
    const current = await this.prisma.systemConfig.findUnique({
      where: { configKey: OUTCOME_CONFIG_KEY },
    });
    const existing = this.readOutcomeSnapshot(current?.configValue);
    const mergedItems = [...(existing?.items ?? []), ...nextSnapshot.items];
    const deduped = new Map<string, AnalysisOutcomeLog>();

    for (const item of mergedItems) {
      deduped.set(
        `${item.before.repositoryId}:${item.before.historicalRepairAction ?? item.before.normalizedTaskType}`,
        item,
      );
    }

    const mergedSnapshot = buildAnalysisOutcomeSnapshot({
      source: 'analysis_outcome_combined',
      items: [...deduped.values()],
    });
    await this.saveSystemConfig(OUTCOME_CONFIG_KEY, mergedSnapshot);
  }

  private readOutcomeSnapshot(value: unknown): AnalysisOutcomeSnapshot | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const payload = value as Partial<AnalysisOutcomeSnapshot>;
    if (!Array.isArray(payload.items) || !payload.summary) {
      return null;
    }

    return payload as AnalysisOutcomeSnapshot;
  }

  private readCalibrationSeedBatchReport(
    value: unknown,
  ): CalibrationSeedBatchReport | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const payload = value as Partial<CalibrationSeedBatchReport>;
    if (!payload.selection || !payload.executionSummary || !payload.snapshot) {
      return null;
    }

    return payload as CalibrationSeedBatchReport;
  }

  private async readLatestCalibrationSeedBatchReport() {
    const row = await this.prisma.systemConfig.findUnique({
      where: { configKey: SEED_REPORT_CONFIG_KEY },
    });

    return this.readCalibrationSeedBatchReport(row?.configValue);
  }

  private async buildCurrentDecisionRecalcGateSnapshot(
    items: HistoricalRepairPriorityItem[],
    generatedAt: string,
  ): Promise<DecisionRecalcGateSnapshot> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { configKey: DECISION_RECALC_GATE_CONFIG_KEY },
    });
    const previousSnapshot = readDecisionRecalcGateSnapshot(row?.configValue);

    return buildDecisionRecalcGateSnapshot({
      items: items.filter(
        (item) => item.historicalRepairAction === 'decision_recalc',
      ),
      previousSnapshotMap: buildDecisionRecalcGateSnapshotMap(previousSnapshot),
      generatedAt,
    });
  }

  private async saveSystemConfig(configKey: string, configValue: unknown) {
    await this.prisma.systemConfig.upsert({
      where: { configKey },
      update: {
        configValue: configValue as never,
      },
      create: {
        configKey,
        configValue: configValue as never,
      },
    });
  }

  private buildItemKey(item: HistoricalRepairPriorityItem) {
    return `${item.repoId}:${item.historicalRepairAction}`;
  }

  private async executeSelectionAndBuildOutcomeLogs(args: {
    selectionItems: Array<
      | {
          repositoryId: string;
          historicalRepairAction: string;
        }
      | CalibrationSeedRefreshSelectionItem
    >;
    beforePriorityItems: HistoricalRepairPriorityItem[];
    concurrency: number;
  }) {
    const itemMap = new Map(
      args.beforePriorityItems.map((item) => [this.buildItemKey(item), item]),
    );
    const records = await runWithConcurrency(
      args.selectionItems,
      args.concurrency,
      async (seed) => {
        const item = itemMap.get(
          `${seed.repositoryId}:${seed.historicalRepairAction}`,
        );
        if (!item) {
          return null;
        }
        return this.executeSeedItem(item);
      },
    );
    const executedRecords = records.filter(
      (record): record is CalibrationSeedExecutionRecord => Boolean(record),
    );
    const selectedRepositoryIds = [
      ...new Set(
        args.selectionItems.map((item) => item.repositoryId).filter(Boolean),
      ),
    ];
    const afterPriorityReport =
      await this.historicalRepairPriorityService.runPriorityReport({
        repositoryIds: selectedRepositoryIds,
      });
    const afterIndexes = buildHistoricalRepairItemIndexes(afterPriorityReport.items);

    return executedRecords.map((record) => {
      const persistedAfterResolution = resolveHistoricalAfterItem({
        beforeItem: record.item,
        indexes: afterIndexes,
      });
      const beforeAfter = buildAfterContextFromOutcomeBefore({
        repositoryId: record.item.repoId,
        normalizedTaskType: record.routerMetadata.routerNormalizedTaskType,
        taskIntent: record.routerMetadata.routerTaskIntent,
        historicalRepairBucket: record.item.historicalRepairBucket,
        historicalRepairAction: record.item.historicalRepairAction,
        cleanupState: record.item.cleanupState,
        analysisQualityScoreBefore: record.item.analysisQualityScore,
        analysisQualityStateBefore: record.item.analysisQualityState,
        decisionStateBefore: record.item.frontendDecisionState,
        trustedEligibilityBefore:
          record.item.frontendDecisionState === 'trusted' &&
          record.item.trustedFlowEligible &&
          !record.item.cleanupBlocksTrusted,
        keyEvidenceGapsBefore: record.item.keyEvidenceGaps,
        trustedBlockingGapsBefore: record.item.trustedBlockingGaps,
        evidenceCoverageRateBefore: record.item.evidenceCoverageRate,
      });
      const deepAfterState =
        record.item.historicalRepairAction === 'deep_repair'
          ? resolveDeepRepairAfterState({
              beforeAfter,
              liveAfter: this.buildAfterContext(record.liveAfterItem ?? null),
              afterItemOverride: this.buildAfterContext(
                record.afterItemOverride ?? null,
              ),
              persistedAfter: this.buildAfterContext(
                persistedAfterResolution.afterItem,
              ),
            })
          : null;
      const afterItem =
        record.item.historicalRepairAction === 'deep_repair'
          ? record.liveAfterItem ??
            record.afterItemOverride ??
            persistedAfterResolution.afterItem ??
            record.item
          : record.afterItemOverride ??
            persistedAfterResolution.afterItem ??
            record.item;
      const afterContext =
        deepAfterState?.afterContext ?? this.buildAfterContext(afterItem);

      return buildHistoricalRepairOutcomeLog({
        item: record.item,
        routerDecision: record.routerDecision,
        routerMetadata: record.routerMetadata,
        outcomeStatus:
          record.outcomeStatus ??
          this.classifyOutcomeStatus({
            item: record.item,
            afterContext,
          }),
        outcomeReason: record.outcomeReason,
        executionDurationMs: record.executionDurationMs,
        executionUsedFallback: record.executionUsedFallback,
        executionUsedReview: record.executionUsedReview,
        after: afterContext,
      });
    });
  }

  private buildDeepRepairSeedPlan(args: {
    item: HistoricalRepairPriorityItem;
    analysis:
      | Pick<
          RepositoryAnalysis,
          'completenessJson' | 'ideaFitJson' | 'extractedIdeaJson'
        >
      | null;
  }) {
    const deepRepairGaps = new Set(args.item.deepRepairGaps);
    const missingTargets = this.buildMissingDeepAnalysisDto(args.analysis);

    if (
      deepRepairGaps.has('technical_maturity_missing') ||
      deepRepairGaps.has('execution_missing')
    ) {
      if (missingTargets.runCompleteness) {
        return { step: 'completeness' as const };
      }
    }

    if (deepRepairGaps.has('market_missing')) {
      if (missingTargets.runIdeaFit) {
        return { step: 'idea_fit' as const };
      }
    }

    if (deepRepairGaps.has('distribution_missing')) {
      if (missingTargets.runIdeaExtract) {
        return { step: 'idea_extract_light' as const };
      }
    }

    if (missingTargets.runCompleteness) {
      return { step: 'completeness' as const };
    }

    if (missingTargets.runIdeaFit) {
      return { step: 'idea_fit' as const };
    }

    if (missingTargets.runIdeaExtract) {
      return { step: 'idea_extract_light' as const };
    }

    return { step: null };
  }

  private async readLatestPriorityReportItems() {
    const reportsDir = path.join(
      process.cwd(),
      'reports',
      'historical-repair-priority',
    );

    try {
      const fileNames = await readdir(reportsDir);
      const latestJson = fileNames
        .filter((fileName) => fileName.startsWith('historical-repair-priority-'))
        .filter((fileName) => fileName.endsWith('.json'))
        .sort()
        .at(-1);

      if (!latestJson) {
        return [] as HistoricalRepairPriorityItem[];
      }

      const payload = JSON.parse(
        await readFile(path.join(reportsDir, latestJson), 'utf8'),
      ) as Partial<{ items: HistoricalRepairPriorityItem[] }>;
      if (!Array.isArray(payload.items) || payload.items.length === 0) {
        return [] as HistoricalRepairPriorityItem[];
      }

      const firstItem = payload.items[0] as Partial<HistoricalRepairPriorityItem>;
      if (
        typeof firstItem.cleanupState !== 'string' ||
        !Array.isArray(firstItem.keyEvidenceGaps) ||
        !Array.isArray(firstItem.decisionRecalcGaps) ||
        !Array.isArray(firstItem.deepRepairGaps) ||
        !Array.isArray(firstItem.evidenceRepairGaps)
      ) {
        return [] as HistoricalRepairPriorityItem[];
      }

      return payload.items;
    } catch {
      return [] as HistoricalRepairPriorityItem[];
    }
  }
}
