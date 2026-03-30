import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ANALYSIS_OUTCOME_ACTIONS,
  ANALYSIS_OUTCOME_SCHEMA_VERSION,
  ANALYSIS_OUTCOME_STATUSES,
  ANALYSIS_REPAIR_VALUE_CLASSES,
} from '../../modules/analysis/helpers/analysis-outcome.helper';
import type {
  AnalysisOutcomeActionKey,
  AnalysisOutcomeLog,
  AnalysisOutcomeSnapshot,
  AnalysisOutcomeStatus,
  AnalysisRepairValueClass,
} from '../../modules/analysis/helpers/analysis-outcome.types';
import { HistoricalDataRecoveryService } from '../../modules/analysis/historical-data-recovery.service';
import type { HistoricalRepairRecommendedAction } from '../../modules/analysis/helpers/historical-repair-bucketing.helper';

const OUTCOME_CONFIG_KEY = 'analysis.outcome.latest';
const RUN_CONFIG_KEY = 'analysis.historical_recovery.run.latest';
const SUPPORTED_OUTCOME_ACTIONS: Array<
  HistoricalRepairRecommendedAction | 'skipped'
> = [
  'refresh_only',
  'evidence_repair',
  'deep_repair',
  'decision_recalc',
  'downgrade_only',
  'skipped',
];

type CliOptions = {
  json?: boolean;
  pretty?: boolean;
  noWrite?: boolean;
  outputDir?: string | null;
  refresh?: boolean;
  limit?: number;
};

type AnalysisOutcomeReport = {
  generatedAt: string;
  source: {
    outcomeGeneratedAt: string | null;
    latestRunGeneratedAt: string | null;
    seededFromDryRun: boolean;
  };
  schema: {
    schemaVersion: string;
    beforeFields: string[];
    routerFields: string[];
    executionFields: string[];
    afterFields: string[];
    deltaFields: string[];
  };
  taxonomy: {
    outcomeStatuses: Array<{
      status: AnalysisOutcomeStatus;
      meaning: string;
    }>;
    repairValueClasses: Array<{
      valueClass: AnalysisRepairValueClass;
      rule: string;
    }>;
  };
  summary: {
    totalLogged: number;
    coveredActions: Array<HistoricalRepairRecommendedAction | 'skipped'>;
    outcomeStatusBreakdown: Record<AnalysisOutcomeStatus, number>;
    repairValueClassBreakdown: Record<AnalysisRepairValueClass, number>;
    executionCostClassBreakdown: Record<'LOW' | 'MEDIUM' | 'HIGH' | 'NONE', number>;
    routerCapabilityBreakdown: Record<string, number>;
    qualityDeltaSummary: AnalysisOutcomeSnapshot['summary']['qualityDeltaSummary'];
    trustedChangedCount: number;
    decisionChangedCount: number;
    fallbackUsedCount: number;
    reviewUsedCount: number;
    skippedByCleanupCount: number;
  };
  writeEntryCoverage: {
    supportedActions: Array<HistoricalRepairRecommendedAction | 'skipped'>;
    coveredByLatestSnapshot: Array<HistoricalRepairRecommendedAction | 'skipped'>;
  };
  actionInsights: {
    mostNoChangeActions: Array<{ action: AnalysisOutcomeActionKey; count: number }>;
    highestQualityGainActions: Array<{
      action: AnalysisOutcomeActionKey;
      averageDelta: number;
      positiveCount: number;
    }>;
    mostDecisionChangedActions: Array<{ action: AnalysisOutcomeActionKey; count: number }>;
    lowestValueActions: Array<{
      action: AnalysisOutcomeActionKey;
      lowOrNegativeCount: number;
    }>;
  };
  notes: {
    qualityDeltaRule: string;
    gapCountDeltaRule: string;
    blockingGapDeltaRule: string;
    trustedChangedRule: string;
    decisionChangedRule: string;
    missingFieldFallback: string;
  };
  samples: Array<{
    repositoryId: string;
    taskType: string;
    action: string | null;
    outcomeStatus: AnalysisOutcomeStatus;
    repairValueClass: AnalysisRepairValueClass;
    qualityDelta: number;
    gapCountDelta: number;
    blockingGapDelta: number;
    trustedChanged: boolean;
    decisionChanged: boolean;
    reason: string;
  }>;
  audit: {
    commands: string[];
    focusFields: string[];
    sampleChecks: string[];
  };
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
    refresh: false,
    limit: 120,
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
    if (flag === 'refresh') {
      options.refresh = parseBoolean(value, true);
    }
    if (flag === 'output-dir' && value) {
      options.outputDir = value;
    }
    if (flag === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
  }

  return options;
}

export function buildAnalysisOutcomeReport(args: {
  snapshot: AnalysisOutcomeSnapshot | null;
  latestRun?: Record<string, unknown> | null;
  seededFromDryRun?: boolean;
}): AnalysisOutcomeReport {
  const snapshot = args.snapshot ?? buildEmptySnapshot();
  return {
    generatedAt: new Date().toISOString(),
    source: {
      outcomeGeneratedAt: readString(snapshot.generatedAt),
      latestRunGeneratedAt: readString(args.latestRun?.generatedAt),
      seededFromDryRun: Boolean(args.seededFromDryRun),
    },
    schema: {
      schemaVersion: ANALYSIS_OUTCOME_SCHEMA_VERSION,
      beforeFields: [
        'repositoryId',
        'normalizedTaskType',
        'taskIntent',
        'historicalRepairBucket',
        'historicalRepairAction',
        'cleanupState',
        'analysisQualityScoreBefore',
        'analysisQualityStateBefore',
        'decisionStateBefore',
        'trustedEligibilityBefore',
        'keyEvidenceGapsBefore',
        'trustedBlockingGapsBefore',
        'evidenceCoverageRateBefore',
      ],
      routerFields: [
        'routerCapabilityTier',
        'routerPriorityClass',
        'routerFallbackPolicy',
        'routerRequiresReview',
        'routerRetryClass',
        'routerReasonSummary',
        'routerCostSensitivity',
        'routerLatencySensitivity',
      ],
      executionFields: [
        'outcomeStatus',
        'outcomeReason',
        'executionDurationMs',
        'executionCostClass',
        'executionUsedFallback',
        'executionUsedReview',
      ],
      afterFields: [
        'analysisQualityScoreAfter',
        'analysisQualityStateAfter',
        'decisionStateAfter',
        'trustedEligibilityAfter',
        'keyEvidenceGapsAfter',
        'trustedBlockingGapsAfter',
        'evidenceCoverageRateAfter',
      ],
      deltaFields: [
        'qualityDelta',
        'trustedChanged',
        'decisionChanged',
        'gapCountDelta',
        'blockingGapDelta',
        'repairValueClass',
      ],
    },
    taxonomy: {
      outcomeStatuses: ANALYSIS_OUTCOME_STATUSES.map((status) => ({
        status,
        meaning: describeOutcomeStatus(status),
      })),
      repairValueClasses: ANALYSIS_REPAIR_VALUE_CLASSES.map((valueClass) => ({
        valueClass,
        rule: describeRepairValueClass(valueClass),
      })),
    },
    summary: {
      totalLogged: snapshot.summary.totalCount,
      coveredActions: snapshot.summary.coveredActions,
      outcomeStatusBreakdown: snapshot.summary.outcomeStatusBreakdown,
      repairValueClassBreakdown: snapshot.summary.repairValueClassBreakdown,
      executionCostClassBreakdown: snapshot.summary.executionCostClassBreakdown,
      routerCapabilityBreakdown: snapshot.summary.routerCapabilityBreakdown,
      qualityDeltaSummary: snapshot.summary.qualityDeltaSummary,
      trustedChangedCount: snapshot.summary.trustedChangedCount,
      decisionChangedCount: snapshot.summary.decisionChangedCount,
      fallbackUsedCount: snapshot.summary.fallbackUsedCount,
      reviewUsedCount: snapshot.summary.reviewUsedCount,
      skippedByCleanupCount: snapshot.summary.skippedByCleanupCount,
    },
    writeEntryCoverage: {
      supportedActions: SUPPORTED_OUTCOME_ACTIONS,
      coveredByLatestSnapshot: snapshot.summary.coveredActions,
    },
    actionInsights: {
      mostNoChangeActions: topActionCounts(
        snapshot.summary.actionOutcomeStatusBreakdown,
        'no_change',
      ),
      highestQualityGainActions: topActionQualityGain(
        snapshot.summary.actionQualityDeltaSummary,
      ),
      mostDecisionChangedActions: topDecisionChangedActions(snapshot.items),
      lowestValueActions: topLowValueActions(
        snapshot.summary.actionRepairValueClassBreakdown,
      ),
    },
    notes: {
      qualityDeltaRule:
        'qualityDelta = analysisQualityScoreAfter - analysisQualityScoreBefore',
      gapCountDeltaRule:
        'gapCountDelta = len(keyEvidenceGapsAfter) - len(keyEvidenceGapsBefore)',
      blockingGapDeltaRule:
        'blockingGapDelta = len(trustedBlockingGapsAfter) - len(trustedBlockingGapsBefore)',
      trustedChangedRule:
        'trustedChanged = trustedEligibilityBefore !== trustedEligibilityAfter',
      decisionChangedRule:
        'decisionChanged = decisionStateBefore !== decisionStateAfter',
      missingFieldFallback:
        'missing before/after/router fields are normalized with null-safe defaults so outcome logging does not crash on partial payloads',
    },
    samples: snapshot.items.slice(0, 12).map((item) => ({
      repositoryId: item.before.repositoryId,
      taskType: item.before.normalizedTaskType,
      action: item.before.historicalRepairAction,
      outcomeStatus: item.execution.outcomeStatus,
      repairValueClass: item.delta.repairValueClass,
      qualityDelta: item.delta.qualityDelta,
      gapCountDelta: item.delta.gapCountDelta,
      blockingGapDelta: item.delta.blockingGapDelta,
      trustedChanged: item.delta.trustedChanged,
      decisionChanged: item.delta.decisionChanged,
      reason: item.execution.outcomeReason,
    })),
    audit: {
      commands: [
        'pnpm --filter api report:analysis-outcome',
        'pnpm --filter api priority:historical-data',
        'pnpm --filter api health:daily -- --json --pretty',
      ],
      focusFields: [
        'schema.beforeFields',
        'summary.outcomeStatusBreakdown',
        'summary.repairValueClassBreakdown',
        'summary.routerCapabilityBreakdown',
        'writeEntryCoverage.supportedActions',
      ],
      sampleChecks: [
        'Inspect 3 outcome items and confirm before/router/execution/after/delta are all present.',
        'Confirm downgraded/skipped/no_change statuses remain explicit rather than hidden in free-text reason.',
        'Confirm qualityDelta, gapCountDelta, and blockingGapDelta match the before/after arrays.',
      ],
    },
  };
}

export function renderAnalysisOutcomeMarkdown(report: AnalysisOutcomeReport) {
  const lines = [
    '# GitDian Analysis Outcome Report',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- outcomeGeneratedAt: ${report.source.outcomeGeneratedAt ?? 'none'}`,
    `- latestRunGeneratedAt: ${report.source.latestRunGeneratedAt ?? 'none'}`,
    `- seededFromDryRun: ${report.source.seededFromDryRun ? 'yes' : 'no'}`,
    '',
    '## Schema',
    '',
    `- schemaVersion: ${report.schema.schemaVersion}`,
    `- beforeFields: ${report.schema.beforeFields.join(', ')}`,
    `- routerFields: ${report.schema.routerFields.join(', ')}`,
    `- executionFields: ${report.schema.executionFields.join(', ')}`,
    `- afterFields: ${report.schema.afterFields.join(', ')}`,
    `- deltaFields: ${report.schema.deltaFields.join(', ')}`,
    '',
    '## Outcome Status Taxonomy',
    '',
    ...report.taxonomy.outcomeStatuses.map(
      (item) => `- ${item.status}: ${item.meaning}`,
    ),
    '',
    '## Repair Value Class Rules',
    '',
    ...report.taxonomy.repairValueClasses.map(
      (item) => `- ${item.valueClass}: ${item.rule}`,
    ),
    '',
    '## Summary',
    '',
    `- totalLogged: ${report.summary.totalLogged}`,
    `- coveredActions: ${report.summary.coveredActions.join(', ') || 'none'}`,
    '',
    '### outcomeStatusBreakdown',
    ...renderCountRecord(report.summary.outcomeStatusBreakdown),
    '',
    '### repairValueClassBreakdown',
    ...renderCountRecord(report.summary.repairValueClassBreakdown),
    '',
    '### executionCostClassBreakdown',
    ...renderCountRecord(report.summary.executionCostClassBreakdown),
    '',
    '### routerCapabilityBreakdown',
    ...renderCountRecord(report.summary.routerCapabilityBreakdown),
    '',
    '### qualityDeltaSummary',
    `- totalDelta: ${report.summary.qualityDeltaSummary.totalDelta}`,
    `- averageDelta: ${report.summary.qualityDeltaSummary.averageDelta}`,
    `- positiveCount: ${report.summary.qualityDeltaSummary.positiveCount}`,
    `- negativeCount: ${report.summary.qualityDeltaSummary.negativeCount}`,
    `- zeroCount: ${report.summary.qualityDeltaSummary.zeroCount}`,
    `- minDelta: ${report.summary.qualityDeltaSummary.minDelta}`,
    `- maxDelta: ${report.summary.qualityDeltaSummary.maxDelta}`,
    `- trustedChangedCount: ${report.summary.trustedChangedCount}`,
    `- decisionChangedCount: ${report.summary.decisionChangedCount}`,
    `- fallbackUsedCount: ${report.summary.fallbackUsedCount}`,
    `- reviewUsedCount: ${report.summary.reviewUsedCount}`,
    `- skippedByCleanupCount: ${report.summary.skippedByCleanupCount}`,
    '',
    '## Write Entry Coverage',
    '',
    `- supportedActions: ${report.writeEntryCoverage.supportedActions.join(', ')}`,
    `- coveredByLatestSnapshot: ${report.writeEntryCoverage.coveredByLatestSnapshot.join(', ') || 'none'}`,
    '',
    '## Action Insights',
    '',
    '### most_no_change_actions',
    ...renderActionCountItems(report.actionInsights.mostNoChangeActions),
    '',
    '### highest_quality_gain_actions',
    ...renderQualityGainItems(report.actionInsights.highestQualityGainActions),
    '',
    '### most_decision_changed_actions',
    ...renderActionCountItems(report.actionInsights.mostDecisionChangedActions),
    '',
    '### lowest_value_actions',
    ...renderLowValueItems(report.actionInsights.lowestValueActions),
    '',
    '## Delta Rules',
    '',
    `- ${report.notes.qualityDeltaRule}`,
    `- ${report.notes.gapCountDeltaRule}`,
    `- ${report.notes.blockingGapDeltaRule}`,
    `- ${report.notes.trustedChangedRule}`,
    `- ${report.notes.decisionChangedRule}`,
    `- ${report.notes.missingFieldFallback}`,
    '',
    '## Samples',
    '',
    ...renderSamples(report.samples),
    '',
    '## Manual Audit',
    '',
    ...report.audit.commands.map((command) => `- command: ${command}`),
    ...report.audit.focusFields.map((field) => `- focus: ${field}`),
    ...report.audit.sampleChecks.map((check) => `- check: ${check}`),
  ];

  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const recoveryService = app.get(HistoricalDataRecoveryService);

    let seededFromDryRun = false;
    let outcomeRow = await prisma.systemConfig.findUnique({
      where: { configKey: OUTCOME_CONFIG_KEY },
    });

    if (!outcomeRow || options.refresh) {
      await recoveryService.runHistoricalRepairLoop({
        dryRun: true,
        limit: options.limit ?? 120,
      });
      seededFromDryRun = true;
      outcomeRow = await prisma.systemConfig.findUnique({
        where: { configKey: OUTCOME_CONFIG_KEY },
      });
    }

    const latestRunRow = await prisma.systemConfig.findUnique({
      where: { configKey: RUN_CONFIG_KEY },
    });
    const report = buildAnalysisOutcomeReport({
      snapshot: readOutcomeSnapshot(outcomeRow?.configValue),
      latestRun:
        latestRunRow?.configValue && typeof latestRunRow.configValue === 'object'
          ? (latestRunRow.configValue as Record<string, unknown>)
          : null,
      seededFromDryRun,
    });
    const markdown = renderAnalysisOutcomeMarkdown(report);
    const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '');
    const outputDir =
      options.outputDir ??
      path.join(process.cwd(), 'reports', 'analysis-outcome');
    const markdownPath = path.join(outputDir, `analysis-outcome-${stamp}.md`);
    const jsonPath = path.join(outputDir, `analysis-outcome-${stamp}.json`);

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
        };
    process.stdout.write(
      `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`,
    );
  } finally {
    await app.close();
  }
}

function buildEmptySnapshot(): AnalysisOutcomeSnapshot {
  return {
    schemaVersion: ANALYSIS_OUTCOME_SCHEMA_VERSION,
    generatedAt: '',
    source: 'analysis_outcome_missing',
    totalCount: 0,
    truncated: false,
    summary: {
      totalCount: 0,
      coveredActions: [],
      outcomeStatusBreakdown: ANALYSIS_OUTCOME_STATUSES.reduce(
        (acc, status) => {
          acc[status] = 0;
          return acc;
        },
        {
          success: 0,
          partial: 0,
          no_change: 0,
          failed: 0,
          downgraded: 0,
          skipped: 0,
        } as Record<AnalysisOutcomeStatus, number>,
      ),
      repairValueClassBreakdown: ANALYSIS_REPAIR_VALUE_CLASSES.reduce(
        (acc, value) => {
          acc[value] = 0;
          return acc;
        },
        {
          high: 0,
          medium: 0,
          low: 0,
          negative: 0,
        } as Record<AnalysisRepairValueClass, number>,
      ),
      executionCostClassBreakdown: {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        NONE: 0,
      },
      actionBreakdown: ANALYSIS_OUTCOME_ACTIONS.reduce(
        (acc, action) => {
          acc[action] = 0;
          return acc;
        },
        {
          downgrade_only: 0,
          refresh_only: 0,
          evidence_repair: 0,
          deep_repair: 0,
          decision_recalc: 0,
          archive: 0,
          skipped: 0,
        } as Record<AnalysisOutcomeActionKey, number>,
      ),
      actionOutcomeStatusBreakdown: ANALYSIS_OUTCOME_ACTIONS.reduce(
        (acc, action) => {
          acc[action] = {
            success: 0,
            partial: 0,
            no_change: 0,
            failed: 0,
            downgraded: 0,
            skipped: 0,
          };
          return acc;
        },
        {} as Record<
          AnalysisOutcomeActionKey,
          Record<AnalysisOutcomeStatus, number>
        >,
      ),
      actionRepairValueClassBreakdown: ANALYSIS_OUTCOME_ACTIONS.reduce(
        (acc, action) => {
          acc[action] = { high: 0, medium: 0, low: 0, negative: 0 };
          return acc;
        },
        {} as Record<
          AnalysisOutcomeActionKey,
          Record<AnalysisRepairValueClass, number>
        >,
      ),
      actionQualityDeltaSummary: ANALYSIS_OUTCOME_ACTIONS.reduce(
        (acc, action) => {
          acc[action] = {
            totalDelta: 0,
            averageDelta: 0,
            positiveCount: 0,
            negativeCount: 0,
            zeroCount: 0,
          };
          return acc;
        },
        {} as Record<
          AnalysisOutcomeActionKey,
          {
            totalDelta: number;
            averageDelta: number;
            positiveCount: number;
            negativeCount: number;
            zeroCount: number;
          }
        >,
      ),
      qualityDeltaSummary: {
        totalDelta: 0,
        averageDelta: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
        minDelta: 0,
        maxDelta: 0,
      },
      trustedChangedCount: 0,
      decisionChangedCount: 0,
      fallbackUsedCount: 0,
      reviewUsedCount: 0,
      skippedByCleanupCount: 0,
      routerCapabilityBreakdown: {},
    },
    items: [],
  };
}

function readOutcomeSnapshot(value: unknown): AnalysisOutcomeSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? (record.items.filter(
        (item): item is AnalysisOutcomeLog =>
          Boolean(item) && typeof item === 'object',
      ) as AnalysisOutcomeLog[])
    : [];
  const summary =
    record.summary && typeof record.summary === 'object'
      ? (record.summary as AnalysisOutcomeSnapshot['summary'])
      : buildEmptySnapshot().summary;

  return {
    schemaVersion: readString(record.schemaVersion) ?? ANALYSIS_OUTCOME_SCHEMA_VERSION,
    generatedAt: readString(record.generatedAt) ?? '',
    source: readString(record.source) ?? 'analysis_outcome_latest',
    totalCount: toNumber(record.totalCount, items.length),
    truncated: Boolean(record.truncated),
    summary: {
      totalCount: toNumber(summary.totalCount, items.length),
      coveredActions: Array.isArray(summary.coveredActions)
        ? (summary.coveredActions.filter(Boolean) as Array<
            HistoricalRepairRecommendedAction | 'skipped'
          >)
        : [],
      outcomeStatusBreakdown:
        summary.outcomeStatusBreakdown ?? buildEmptySnapshot().summary.outcomeStatusBreakdown,
      repairValueClassBreakdown:
        summary.repairValueClassBreakdown ??
        buildEmptySnapshot().summary.repairValueClassBreakdown,
      executionCostClassBreakdown:
        summary.executionCostClassBreakdown ??
        buildEmptySnapshot().summary.executionCostClassBreakdown,
      actionBreakdown:
        summary.actionBreakdown ?? buildEmptySnapshot().summary.actionBreakdown,
      actionOutcomeStatusBreakdown:
        summary.actionOutcomeStatusBreakdown ??
        buildEmptySnapshot().summary.actionOutcomeStatusBreakdown,
      actionRepairValueClassBreakdown:
        summary.actionRepairValueClassBreakdown ??
        buildEmptySnapshot().summary.actionRepairValueClassBreakdown,
      actionQualityDeltaSummary:
        summary.actionQualityDeltaSummary ??
        buildEmptySnapshot().summary.actionQualityDeltaSummary,
      qualityDeltaSummary:
        summary.qualityDeltaSummary ??
        buildEmptySnapshot().summary.qualityDeltaSummary,
      trustedChangedCount: toNumber(
        summary.trustedChangedCount,
        buildEmptySnapshot().summary.trustedChangedCount,
      ),
      decisionChangedCount: toNumber(
        summary.decisionChangedCount,
        buildEmptySnapshot().summary.decisionChangedCount,
      ),
      fallbackUsedCount: toNumber(
        summary.fallbackUsedCount,
        buildEmptySnapshot().summary.fallbackUsedCount,
      ),
      reviewUsedCount: toNumber(
        summary.reviewUsedCount,
        buildEmptySnapshot().summary.reviewUsedCount,
      ),
      skippedByCleanupCount: toNumber(
        summary.skippedByCleanupCount,
        buildEmptySnapshot().summary.skippedByCleanupCount,
      ),
      routerCapabilityBreakdown:
        summary.routerCapabilityBreakdown && typeof summary.routerCapabilityBreakdown === 'object'
          ? (summary.routerCapabilityBreakdown as Record<string, number>)
          : {},
    },
    items,
  };
}

function describeOutcomeStatus(status: AnalysisOutcomeStatus) {
  switch (status) {
    case 'success':
      return 'execution finished and materially completed the intended repair path';
    case 'partial':
      return 'execution progressed and queued or applied part of the intended work';
    case 'no_change':
      return 'execution ran but found nothing meaningful to change';
    case 'failed':
      return 'execution attempted the task but ended in failure';
    case 'downgraded':
      return 'execution explicitly lowered trust or display readiness instead of improving evidence';
    case 'skipped':
      return 'execution was intentionally suppressed, usually by cleanup or missing prerequisites';
    default:
      return 'unknown';
  }
}

function describeRepairValueClass(valueClass: AnalysisRepairValueClass) {
  switch (valueClass) {
    case 'high':
      return 'quality improved clearly and key/blocking gaps decreased in a meaningful way';
    case 'medium':
      return 'some improvement landed, but the gain was limited or partial';
    case 'low':
      return 'the run produced little or no meaningful change';
    case 'negative':
      return 'the run degraded quality/trust, increased gaps, failed, or only downgraded state';
    default:
      return 'unknown';
  }
}

function renderCountRecord(record: Record<string, number>) {
  return Object.entries(record)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => `- ${key}: ${count}`);
}

function renderSamples(samples: AnalysisOutcomeReport['samples']) {
  if (!samples.length) {
    return ['- none'];
  }

  return samples.map(
    (sample) =>
      `- ${sample.repositoryId} | task=${sample.taskType} | action=${sample.action ?? 'none'} | status=${sample.outcomeStatus} | value=${sample.repairValueClass} | qualityDelta=${sample.qualityDelta} | gapDelta=${sample.gapCountDelta} | blockingDelta=${sample.blockingGapDelta} | trustedChanged=${sample.trustedChanged} | decisionChanged=${sample.decisionChanged} | reason=${sample.reason}`,
  );
}

function renderActionCountItems(
  items: Array<{ action: AnalysisOutcomeActionKey; count: number }>,
) {
  if (!items.length) {
    return ['- none'];
  }

  return items.map((item) => `- ${item.action}: ${item.count}`);
}

function renderQualityGainItems(
  items: Array<{
    action: AnalysisOutcomeActionKey;
    averageDelta: number;
    positiveCount: number;
  }>,
) {
  if (!items.length) {
    return ['- none'];
  }

  return items.map(
    (item) =>
      `- ${item.action}: averageDelta=${item.averageDelta}, positiveCount=${item.positiveCount}`,
  );
}

function renderLowValueItems(
  items: Array<{
    action: AnalysisOutcomeActionKey;
    lowOrNegativeCount: number;
  }>,
) {
  if (!items.length) {
    return ['- none'];
  }

  return items.map(
    (item) => `- ${item.action}: lowOrNegativeCount=${item.lowOrNegativeCount}`,
  );
}

function topActionCounts(
  actionBreakdown: Record<
    AnalysisOutcomeActionKey,
    Record<AnalysisOutcomeStatus, number>
  >,
  status: AnalysisOutcomeStatus,
) {
  return Object.entries(actionBreakdown)
    .map(([action, counts]) => ({
      action: action as AnalysisOutcomeActionKey,
      count: counts?.[status] ?? 0,
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.action.localeCompare(right.action))
    .slice(0, 5);
}

function topActionQualityGain(
  actionSummary: AnalysisOutcomeSnapshot['summary']['actionQualityDeltaSummary'],
) {
  return Object.entries(actionSummary)
    .map(([action, summary]) => ({
      action: action as AnalysisOutcomeActionKey,
      averageDelta: summary.averageDelta,
      positiveCount: summary.positiveCount,
    }))
    .filter((item) => item.positiveCount > 0)
    .sort(
      (left, right) =>
        right.averageDelta - left.averageDelta ||
        right.positiveCount - left.positiveCount ||
        left.action.localeCompare(right.action),
    )
    .slice(0, 5);
}

function topDecisionChangedActions(items: AnalysisOutcomeLog[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (!item.delta.decisionChanged) {
      continue;
    }
    const action = item.before.historicalRepairAction ?? 'skipped';
    counts[action] = (counts[action] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([action, count]) => ({
      action: action as AnalysisOutcomeActionKey,
      count,
    }))
    .sort((left, right) => right.count - left.count || left.action.localeCompare(right.action))
    .slice(0, 5);
}

function topLowValueActions(
  actionBreakdown: AnalysisOutcomeSnapshot['summary']['actionRepairValueClassBreakdown'],
) {
  return Object.entries(actionBreakdown)
    .map(([action, counts]) => ({
      action: action as AnalysisOutcomeActionKey,
      lowOrNegativeCount: (counts?.low ?? 0) + (counts?.negative ?? 0),
    }))
    .filter((item) => item.lowOrNegativeCount > 0)
    .sort(
      (left, right) =>
        right.lowOrNegativeCount - left.lowOrNegativeCount ||
        left.action.localeCompare(right.action),
    )
    .slice(0, 5);
}

function readString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function toNumber(value: unknown, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

if (process.argv[1]?.endsWith('analysis-outcome-report.js')) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
      );
      process.exit(1);
    });
}
