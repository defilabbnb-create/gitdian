import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HistoricalRepairPriorityService } from '../../modules/analysis/historical-repair-priority.service';
import {
  buildAfterContextFromOutcomeBefore,
  buildDeepRepairAnalysisSnapshot,
  buildDeepRepairWritebackTrace,
  buildDeepWritebackTraceReport,
  renderDeepWritebackTraceMarkdown,
  resolveDeepRepairAfterState,
} from '../../modules/analysis/helpers/deep-repair-writeback.helper';
import {
  buildAfterContextFromPriorityItem,
} from '../../modules/analysis/helpers/repair-effectiveness-surgery.helper';
import type { AnalysisOutcomeLog } from '../../modules/analysis/helpers/analysis-outcome.types';
import type {
  CalibrationSeedBatchReport,
  CalibrationSeedSelectionItem,
} from '../../modules/analysis/helpers/calibration-seed-batch.helper';

const SEED_REPORT_CONFIG_KEY = 'analysis.calibration_seed_batch.latest';

type CliOptions = {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  total?: number;
  highValue?: number;
  generalValue?: number;
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
    total: 10,
    highValue: 5,
    generalValue: 5,
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
    if (flag === 'total') {
      options.total = parsePositiveInt(value, options.total ?? 10);
    }
    if (flag === 'high-value') {
      options.highValue = parsePositiveInt(value, options.highValue ?? 5);
    }
    if (flag === 'general-value') {
      options.generalValue = parsePositiveInt(value, options.generalValue ?? 5);
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

function readSeedReport(value: unknown): CalibrationSeedBatchReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as CalibrationSeedBatchReport;
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
    const seedRow = await prisma.systemConfig.findUnique({
      where: { configKey: SEED_REPORT_CONFIG_KEY },
    });
    const seedReport = readSeedReport(seedRow?.configValue);
    const seedLogs = Array.isArray(seedReport?.snapshot?.items)
      ? seedReport!.snapshot!.items!
      : [];
    const deepLogs = seedLogs.filter(
      (log) => log.before.historicalRepairAction === 'deep_repair',
    );
    const selectionMap = new Map<string, CalibrationSeedSelectionItem>(
      (seedReport?.selection?.items ?? [])
        .filter((item) => item.seedGroup === 'deep_repair')
        .map((item) => [`${item.repositoryId}:deep_repair`, item]),
    );
    const selectedLogs = selectDeepValidationLogs({
      logs: deepLogs,
      selectionMap,
      total: options.total ?? 10,
      highValue: options.highValue ?? 5,
      generalValue: options.generalValue ?? 5,
    });
    const selectedRepoIds = [
      ...new Set(selectedLogs.map((log) => log.before.repositoryId)),
    ];
    const [priorityReport, repositories] = await Promise.all([
      priorityService.runPriorityReport({ repositoryIds: selectedRepoIds }),
      prisma.repository.findMany({
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
              completenessJson: true,
              ideaFitJson: true,
              extractedIdeaJson: true,
            },
          },
        },
      }),
    ]);
    const priorityItemMap = new Map(
      priorityReport.items.map((item) => [item.repoId, item]),
    );
    const repositoryMap = new Map(
      repositories.map((repository) => [repository.id, repository]),
    );

    const traces = selectedLogs.map((log) => {
      const selection = selectionMap.get(
        `${log.before.repositoryId}:deep_repair`,
      );
      const currentItem = priorityItemMap.get(log.before.repositoryId) ?? null;
      const currentRepository = repositoryMap.get(log.before.repositoryId);
      const beforeAfter = buildAfterContextFromOutcomeBefore(log.before);
      const resolution = resolveDeepRepairAfterState({
        beforeAfter,
        persistedAfter: buildAfterContextFromPriorityItem(currentItem),
      });
      const analysisAfter = buildDeepRepairAnalysisSnapshot(
        currentRepository?.analysis ?? null,
      );
      const analysisBefore = inferBeforeAnalysisSnapshot({
        outcomeReason: log.execution.outcomeReason,
        afterSnapshot: analysisAfter,
      });

      return buildDeepRepairWritebackTrace({
        repositoryId: log.before.repositoryId,
        fullName:
          selection?.fullName ??
          currentRepository?.fullName ??
          log.before.repositoryId,
        originalOutcomeStatus: log.execution.outcomeStatus,
        originalOutcomeReason: log.execution.outcomeReason,
        historicalRepairAction: log.before.historicalRepairAction,
        currentAction: currentItem?.historicalRepairAction ?? null,
        before: log.before,
        observedAfter: log.after,
        resolution,
        analysisBefore,
        analysisAfter,
      });
    });
    const report = buildDeepWritebackTraceReport({
      seedGeneratedAt: seedReport?.generatedAt ?? null,
      totalLoggedDeepRepairOutcomes: deepLogs.length,
      highValueSampleCount: selectedLogs.filter((log) =>
        isHighValueSelection(selectionMap.get(`${log.before.repositoryId}:deep_repair`)),
      ).length,
      generalValueSampleCount: selectedLogs.filter(
        (log) =>
          !isHighValueSelection(
            selectionMap.get(`${log.before.repositoryId}:deep_repair`),
          ),
      ).length,
      samples: traces,
    });
    const markdown = renderDeepWritebackTraceMarkdown(report);
    const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'deep-writeback-trace');
    const markdownPath = path.join(
      outputDir,
      `deep-writeback-trace-${stamp}.md`,
    );
    const jsonPath = path.join(outputDir, `deep-writeback-trace-${stamp}.json`);

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
          fieldLevel: report.fieldLevel,
          rootCauseBreakdown: report.rootCauseBreakdown,
        };

    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

function selectDeepValidationLogs(args: {
  logs: AnalysisOutcomeLog[];
  selectionMap: Map<string, CalibrationSeedSelectionItem>;
  total: number;
  highValue: number;
  generalValue: number;
}) {
  const used = new Set<string>();
  const ordered = args.logs.filter(
    (log) => log.execution.outcomeStatus === 'no_change',
  );
  const selected: AnalysisOutcomeLog[] = [];

  for (const log of ordered) {
    if (selected.length >= args.highValue) {
      break;
    }
    if (!isHighValueSelection(args.selectionMap.get(buildSelectionKey(log)))) {
      continue;
    }
    used.add(log.before.repositoryId);
    selected.push(log);
  }

  for (const log of ordered) {
    if (selected.length >= args.highValue + args.generalValue) {
      break;
    }
    if (used.has(log.before.repositoryId)) {
      continue;
    }
    if (isHighValueSelection(args.selectionMap.get(buildSelectionKey(log)))) {
      continue;
    }
    used.add(log.before.repositoryId);
    selected.push(log);
  }

  for (const log of ordered) {
    if (selected.length >= args.total) {
      break;
    }
    if (used.has(log.before.repositoryId)) {
      continue;
    }
    used.add(log.before.repositoryId);
    selected.push(log);
  }

  return selected.slice(0, args.total);
}

function buildSelectionKey(log: AnalysisOutcomeLog) {
  return `${log.before.repositoryId}:deep_repair`;
}

function isHighValueSelection(selection: CalibrationSeedSelectionItem | undefined) {
  if (!selection) {
    return false;
  }

  return (
    selection.historicalRepairBucket === 'high_value_weak' ||
    selection.repositoryValueTier === 'HIGH' ||
    selection.moneyPriority === 'P0' ||
    selection.moneyPriority === 'P1'
  );
}

function inferBeforeAnalysisSnapshot(args: {
  outcomeReason: string;
  afterSnapshot: ReturnType<typeof buildDeepRepairAnalysisSnapshot>;
}) {
  const after = args.afterSnapshot;
  if (
    args.outcomeReason === 'deep_targets_already_present' ||
    args.outcomeReason.includes('without_structural_output')
  ) {
    return after;
  }

  if (args.outcomeReason.includes('completeness')) {
    return {
      ...after,
      completenessHash: null,
    };
  }

  if (args.outcomeReason.includes('idea_fit')) {
    return {
      ...after,
      ideaFitHash: null,
    };
  }

  if (args.outcomeReason.includes('idea_extract')) {
    return {
      ...after,
      ideaExtractHash: null,
    };
  }

  return after;
}

void main();
