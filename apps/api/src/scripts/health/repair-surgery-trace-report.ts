import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HistoricalRepairPriorityService } from '../../modules/analysis/historical-repair-priority.service';
import { IdeaSnapshotService } from '../../modules/analysis/idea-snapshot.service';
import { RepositoryInsightService } from '../../modules/analysis/repository-insight.service';
import {
  buildAfterContextFromPriorityItem,
  buildDecisionRecalcInputFingerprint,
  buildHistoricalRepairItemIndexes,
  buildRepairEffectivenessSurgeryReport,
  compareDecisionRecalcFingerprints,
  diffAfterContexts,
  renderRepairEffectivenessSurgeryMarkdown,
  resolveHistoricalAfterItem,
} from '../../modules/analysis/helpers/repair-effectiveness-surgery.helper';
import type {
  DeepWritebackTraceSample,
  DecisionRecalcTraceSample,
  EvidenceRepairControlSample,
  RepairEffectivenessSeedSource,
} from '../../modules/analysis/helpers/repair-effectiveness-surgery.types';
import type { AnalysisOutcomeLog } from '../../modules/analysis/helpers/analysis-outcome.types';

const SEED_REPORT_CONFIG_KEY = 'analysis.calibration_seed_batch.latest';

type CliOptions = {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  decisionCount?: number;
  deepCount?: number;
  evidenceCount?: number;
};

function parseBoolean(value: string | undefined, fallback = true) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    pretty: true,
    noWrite: false,
    outputDir: null,
    decisionCount: 5,
    deepCount: 5,
    evidenceCount: 2,
  };

  for (const rawArg of argv) {
    const arg = String(rawArg ?? '').trim();
    if (!arg.startsWith('--')) {
      continue;
    }

    const [flag, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=').trim();

    if (flag === 'json') {
      options.json = parseBoolean(value, true);
    }
    if (flag === 'pretty') {
      options.pretty = parseBoolean(value, true);
    }
    if (flag === 'no-write') {
      options.noWrite = parseBoolean(value, true);
    }
    if (flag === 'output-dir' && value) {
      options.outputDir = value;
    }
    if (flag === 'decision-count') {
      options.decisionCount = parsePositiveInt(value, options.decisionCount ?? 5);
    }
    if (flag === 'deep-count') {
      options.deepCount = parsePositiveInt(value, options.deepCount ?? 5);
    }
    if (flag === 'evidence-count') {
      options.evidenceCount = parsePositiveInt(value, options.evidenceCount ?? 2);
    }
  }

  return options;
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function readSeedReport(value: unknown): RepairEffectivenessSeedSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as RepairEffectivenessSeedSource;
}

function selectLogs(args: {
  logs: AnalysisOutcomeLog[];
  action: string;
  statuses?: string[];
  limit: number;
}) {
  return args.logs
    .filter((log) => log.before.historicalRepairAction === args.action)
    .filter((log) =>
      args.statuses?.length ? args.statuses.includes(log.execution.outcomeStatus) : true,
    )
    .slice(0, args.limit);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const priorityService = app.get(HistoricalRepairPriorityService);
    const repositoryInsightService = app.get(RepositoryInsightService);
    const ideaSnapshotService = app.get(IdeaSnapshotService);

    const seedRow = await prisma.systemConfig.findUnique({
      where: { configKey: SEED_REPORT_CONFIG_KEY },
    });
    const seedReport = readSeedReport(seedRow?.configValue);
    const seedLogs = Array.isArray(seedReport?.snapshot?.items)
      ? seedReport!.snapshot!.items!
      : [];

    const decisionLogs = selectLogs({
      logs: seedLogs,
      action: 'decision_recalc',
      statuses: ['no_change'],
      limit: options.decisionCount ?? 5,
    });
    const deepLogs = selectLogs({
      logs: seedLogs,
      action: 'deep_repair',
      statuses: ['no_change'],
      limit: options.deepCount ?? 5,
    });
    const evidenceLogs = selectLogs({
      logs: seedLogs,
      action: 'evidence_repair',
      statuses: ['no_change', 'partial'],
      limit: options.evidenceCount ?? 2,
    });

    const selectedRepoIds = [
      ...new Set(
        [...decisionLogs, ...deepLogs, ...evidenceLogs].map(
          (log) => log.before.repositoryId,
        ),
      ),
    ];

    const currentPriorityReport =
      await priorityService.runPriorityReport({ repositoryIds: selectedRepoIds });
    const currentIndexes = buildHistoricalRepairItemIndexes(currentPriorityReport.items);
    const repositoryMap = new Map(
      (
        await prisma.repository.findMany({
          where: {
            id: {
              in: selectedRepoIds,
            },
          },
          select: {
            id: true,
            fullName: true,
            analysis: {
              select: {
                ideaSnapshotJson: true,
                insightJson: true,
                completenessJson: true,
                ideaFitJson: true,
                extractedIdeaJson: true,
              },
            },
          },
        })
      ).map((repository) => [repository.id, repository]),
    );

    const deepSamples: DeepWritebackTraceSample[] = deepLogs.map((log) => {
      const resolution = resolveHistoricalAfterItem({
        beforeItem: {
          repoId: log.before.repositoryId,
          historicalRepairAction: log.before.historicalRepairAction,
        },
        indexes: currentIndexes,
      });
      const currentAfter = buildAfterContextFromPriorityItem(resolution.afterItem);
      const refreshedFields = diffAfterContexts({
        before: log.after,
        after: currentAfter,
      });
      const repository = repositoryMap.get(log.before.repositoryId);
      const writtenArtifacts = {
        hasSnapshot: Boolean(repository?.analysis?.ideaSnapshotJson),
        hasInsight: Boolean(repository?.analysis?.insightJson),
        hasCompleteness: Boolean(repository?.analysis?.completenessJson),
        hasIdeaFit: Boolean(repository?.analysis?.ideaFitJson),
        hasIdeaExtract: Boolean(repository?.analysis?.extractedIdeaJson),
      };
      const wasFalseNoChange =
        log.execution.outcomeStatus === 'no_change' &&
        (refreshedFields.length > 0 || resolution.actionChanged);
      const primaryWritebackBreak = wasFalseNoChange
        ? resolution.resolutionType === 'repo_fallback'
          ? 'after_state_lookup_stale'
          : 'after_state_refresh_missed'
        : writtenArtifacts.hasCompleteness ||
            writtenArtifacts.hasIdeaFit ||
            writtenArtifacts.hasIdeaExtract
          ? 'live_after_still_unchanged'
          : 'no_deep_output_written';

      return {
        repositoryId: log.before.repositoryId,
        fullName: repository?.fullName ?? log.before.repositoryId,
        originalOutcomeStatus: log.execution.outcomeStatus,
        originalOutcomeReason: log.execution.outcomeReason,
        originalAction: log.before.historicalRepairAction,
        currentAction: resolution.afterAction,
        afterResolutionType: resolution.resolutionType,
        refreshedFields,
        writtenArtifacts,
        wasFalseNoChange,
        primaryWritebackBreak,
        rootCauseShift: wasFalseNoChange
          ? 'writeback_missing -> after_state_lookup_stale'
          : primaryWritebackBreak === 'no_deep_output_written'
            ? 'writeback_missing persists'
            : 'writeback_missing -> live_after_still_unchanged',
        originalAfter: log.after,
        currentAfter,
      };
    });

    const evidenceSamples: EvidenceRepairControlSample[] = [];
    for (const log of evidenceLogs) {
      const beforePriorityItem =
        currentIndexes.byRepoId.get(log.before.repositoryId) ?? null;
      const beforeAfter =
        buildAfterContextFromPriorityItem(beforePriorityItem) ?? log.after;
      const result = await ideaSnapshotService.analyzeRepository(
        log.before.repositoryId,
        {
          onlyIfMissing: true,
        },
      );
      const afterPriorityReport = await priorityService.runPriorityReport({
        repositoryIds: [log.before.repositoryId],
      });
      const afterItem = afterPriorityReport.items[0] ?? null;
      const afterContext = buildAfterContextFromPriorityItem(afterItem);
      const refreshedFields = diffAfterContexts({
        before: beforeAfter,
        after: afterContext,
      });
      evidenceSamples.push({
        repositoryId: log.before.repositoryId,
        fullName:
          repositoryMap.get(log.before.repositoryId)?.fullName ??
          log.before.repositoryId,
        originalOutcomeStatus: log.execution.outcomeStatus,
        rerunOutcomeReason: `evidence_repair_snapshot_${result.action}`,
        refreshedFields,
        wasStillNoChange: refreshedFields.length === 0,
      });
    }

    const recalcSamples: DecisionRecalcTraceSample[] = [];
    for (const log of decisionLogs) {
      const beforePriorityReport = await priorityService.runPriorityReport({
        repositoryIds: [log.before.repositoryId],
      });
      const beforeItem = beforePriorityReport.items[0] ?? null;
      if (!beforeItem) {
        recalcSamples.push({
          repositoryId: log.before.repositoryId,
          fullName:
            repositoryMap.get(log.before.repositoryId)?.fullName ??
            log.before.repositoryId,
          beforeFingerprint: {
            repositoryId: log.before.repositoryId,
            keyEvidenceGaps: log.before.keyEvidenceGapsBefore,
            decisionRecalcGaps: [],
            trustedBlockingGaps: log.before.trustedBlockingGapsBefore,
            relevantConflictSignals: [],
            evidenceCoverageRate: log.before.evidenceCoverageRateBefore,
            freshnessDays: null,
            evidenceFreshnessDays: null,
            analysisQualityScore: log.before.analysisQualityScoreBefore,
            analysisQualityState: log.before.analysisQualityStateBefore,
            frontendDecisionState: log.before.decisionStateBefore,
            hasDeep: false,
            fallbackFlag: false,
            conflictFlag: false,
            incompleteFlag: false,
            recalcFingerprintHash: 'missing_before_item',
          },
          afterFingerprint: null,
          comparison: null,
          beforeDecisionState: log.before.decisionStateBefore,
          afterDecisionState: null,
          beforeQualityScore: log.before.analysisQualityScoreBefore,
          afterQualityScore: null,
          decisionChanged: false,
          qualityDelta: 0,
          gapCountDelta: 0,
          blockingGapDelta: 0,
          primaryRecalcFinding: 'recalc_failed',
        });
        continue;
      }

      const beforeFingerprint = buildDecisionRecalcInputFingerprint(beforeItem);
      const beforeDecisionState = beforeItem.frontendDecisionState;
      const beforeQualityScore = beforeItem.analysisQualityScore;
      const beforeGapCount = beforeItem.keyEvidenceGaps.length;
      const beforeBlockingGapCount = beforeItem.trustedBlockingGaps.length;

      await repositoryInsightService.refreshInsight(log.before.repositoryId);

      const afterPriorityReport = await priorityService.runPriorityReport({
        repositoryIds: [log.before.repositoryId],
      });
      const afterItem = afterPriorityReport.items[0] ?? null;
      const afterFingerprint = afterItem
        ? buildDecisionRecalcInputFingerprint(afterItem)
        : null;
      const comparison =
        afterFingerprint && beforeItem
          ? compareDecisionRecalcFingerprints({
              before: beforeFingerprint,
              after: afterFingerprint,
            })
          : null;
      const decisionChanged =
        Boolean(afterItem) &&
        afterItem.frontendDecisionState !== beforeDecisionState;
      const qualityDelta = afterItem
        ? afterItem.analysisQualityScore - beforeQualityScore
        : 0;
      const gapCountDelta = afterItem
        ? afterItem.keyEvidenceGaps.length - beforeGapCount
        : 0;
      const blockingGapDelta = afterItem
        ? afterItem.trustedBlockingGaps.length - beforeBlockingGapCount
        : 0;
      const primaryRecalcFinding = !afterItem || !comparison
        ? 'recalc_failed'
        : comparison.sameInputsReplayed
          ? 'same_inputs_replayed'
          : decisionChanged
            ? 'new_signal_decision_changed'
            : 'new_signal_no_decision_change';

      recalcSamples.push({
        repositoryId: log.before.repositoryId,
        fullName:
          repositoryMap.get(log.before.repositoryId)?.fullName ??
          log.before.repositoryId,
        beforeFingerprint,
        afterFingerprint,
        comparison,
        beforeDecisionState,
        afterDecisionState: afterItem?.frontendDecisionState ?? null,
        beforeQualityScore,
        afterQualityScore: afterItem?.analysisQualityScore ?? null,
        decisionChanged,
        qualityDelta,
        gapCountDelta,
        blockingGapDelta,
        primaryRecalcFinding,
      });
    }

    const report = buildRepairEffectivenessSurgeryReport({
      seedReport,
      deepSamples,
      recalcSamples,
      evidenceSamples,
    });
    const markdown = renderRepairEffectivenessSurgeryMarkdown(report);
    const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'repair-surgery-trace');
    const markdownPath = path.join(outputDir, `repair-surgery-trace-${stamp}.md`);
    const jsonPath = path.join(outputDir, `repair-surgery-trace-${stamp}.json`);

    if (!options.noWrite) {
      await mkdir(outputDir, { recursive: true });
      await Promise.all([
        writeFile(markdownPath, `${markdown}\n`, 'utf8'),
        writeFile(
          jsonPath,
          `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`,
          'utf8',
        ),
      ]);
    }

    const payload = options.json
      ? report
      : {
          generatedAt: report.generatedAt,
          markdownPath: options.noWrite ? null : markdownPath,
          jsonPath: options.noWrite ? null : jsonPath,
          summary: report.summary,
          deepWritebackTrace: report.deepWritebackTrace,
          recalcTrace: report.recalcTrace,
          evidenceControls: report.evidenceControls,
          surgeryRecommendations: report.surgeryRecommendations,
        };

    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

if (process.argv[1]?.endsWith('repair-surgery-trace-report.js')) {
  void main();
}
