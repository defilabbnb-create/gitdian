import type { HistoricalRepairPriorityItem, HistoricalRepairPriorityReport } from './historical-repair-priority.helper';
import { buildModelTaskRouterDecisionFromHistoricalItem } from './model-task-router-decision.helper';
import { getModelTaskRouterDefinition } from './model-task-router.helper';
import type {
  ModelTaskCapabilityTierName,
  ModelTaskFallbackPolicy,
  ModelTaskRouterCapabilityBreakdown,
  ModelTaskRouterDecisionOutput,
  ModelTaskRouterExecutionMetadata,
  ModelTaskRouterFallbackBreakdown,
  NormalizedModelTaskType,
} from './model-task-router.types';

export type ModelTaskRouterExecutionQueueSummary = {
  totalQueued: number;
  actionCounts: Record<
    'downgrade_only' | 'refresh_only' | 'evidence_repair' | 'deep_repair' | 'decision_recalc',
    number
  >;
  routerCapabilityBreakdown: ModelTaskRouterCapabilityBreakdown;
  routerFallbackBreakdown: ModelTaskRouterFallbackBreakdown;
  routerReviewRequiredCount: number;
  routerDeterministicOnlyCount: number;
  queuedWithRouterMetadataCount: number;
  queuedSamples: Array<{
    repoId: string | null;
    action: string | null;
    capabilityTier: ModelTaskCapabilityTierName;
    fallbackPolicy: ModelTaskFallbackPolicy;
    requiresReview: boolean;
    queueName: string | null;
  }>;
};

export type ModelTaskRouterExecutionReport = {
  generatedAt: string;
  source: {
    priorityGeneratedAt: string;
    latestRunGeneratedAt: string | null;
    healthGeneratedAt: string | null;
  };
  summary: {
    queuedWithRouterMetadataCount: number;
    routerCapabilityBreakdown: ModelTaskRouterCapabilityBreakdown;
    routerFallbackBreakdown: ModelTaskRouterFallbackBreakdown;
    routerReviewRequiredCount: number;
    routerDeterministicOnlyCount: number;
    frozenOrArchivedTaskSuppressedCount: number;
    reviewRequiredTasks: NormalizedModelTaskType[];
    deterministicOnlyTasks: NormalizedModelTaskType[];
    highCostSuppressedTasks: NormalizedModelTaskType[];
  };
  execution: {
    schedulerLane: string | null;
    latestExecutionCounters: Record<string, number>;
    queueActionBreakdown: ModelTaskRouterExecutionQueueSummary['actionCounts'];
  };
  queuedWithRouterMetadata: ModelTaskRouterExecutionQueueSummary['queuedSamples'];
  samples: {
    highCostSuppressed: Array<ExecutionSample>;
    reviewRequired: Array<ExecutionSample>;
    deterministicOnly: Array<ExecutionSample>;
  };
};

type ExecutionSample = {
  fullName: string;
  taskType: NormalizedModelTaskType;
  capabilityTier: ModelTaskCapabilityTierName;
  preferredTier: ModelTaskCapabilityTierName;
  cleanupState: string;
  action: string;
  reason: string;
};

export function buildModelTaskRouterExecutionReport(args: {
  priorityReport: HistoricalRepairPriorityReport;
  queueSummary: ModelTaskRouterExecutionQueueSummary;
  latestRun?: Record<string, unknown> | null;
  healthReport?: Record<string, unknown> | null;
}): ModelTaskRouterExecutionReport {
  const decisions = args.priorityReport.items.map((item) => ({
    item,
    decision: buildModelTaskRouterDecisionFromHistoricalItem(item),
  }));
  const reviewRequired = decisions.filter(({ decision }) => decision.requiresReview);
  const deterministicOnly = decisions.filter(
    ({ decision }) => decision.capabilityTier === 'DETERMINISTIC_ONLY',
  );
  const highCostSuppressed = decisions.filter(({ item, decision }) => {
    const definition = getModelTaskRouterDefinition(decision.normalizedTaskType);
    if (!definition) {
      return false;
    }
    return (
      capabilityRank(decision.capabilityTier) < capabilityRank(definition.preferredCapabilityTier) ||
      item.cleanupState === 'freeze' ||
      item.cleanupState === 'archive' ||
      item.cleanupState === 'purge_ready'
    );
  });
  const healthAutoRepair = readObject(args.healthReport?.autoRepair);
  const latestExecution = (readObject(healthAutoRepair?.execution) ??
    readObject(args.latestRun?.execution)) as Record<string, unknown> | null;

  return {
    generatedAt: new Date().toISOString(),
    source: {
      priorityGeneratedAt: args.priorityReport.generatedAt,
      latestRunGeneratedAt: readString(args.latestRun?.generatedAt) ?? null,
      healthGeneratedAt: readString(args.healthReport?.generatedAt) ?? null,
    },
    summary: {
      queuedWithRouterMetadataCount: args.queueSummary.queuedWithRouterMetadataCount,
      routerCapabilityBreakdown: args.queueSummary.routerCapabilityBreakdown,
      routerFallbackBreakdown: args.queueSummary.routerFallbackBreakdown,
      routerReviewRequiredCount: args.queueSummary.routerReviewRequiredCount,
      routerDeterministicOnlyCount: args.queueSummary.routerDeterministicOnlyCount,
      frozenOrArchivedTaskSuppressedCount:
        args.priorityReport.summary.cleanupStateDistribution.freeze +
        args.priorityReport.summary.cleanupStateDistribution.archive +
        args.priorityReport.summary.cleanupStateDistribution.purge_ready,
      reviewRequiredTasks: uniqueTaskTypes(reviewRequired.map(({ decision }) => decision.normalizedTaskType)),
      deterministicOnlyTasks: uniqueTaskTypes(
        deterministicOnly.map(({ decision }) => decision.normalizedTaskType),
      ),
      highCostSuppressedTasks: uniqueTaskTypes(
        highCostSuppressed.map(({ decision }) => decision.normalizedTaskType),
      ),
    },
    execution: {
      schedulerLane: readString(healthAutoRepair?.schedulerLane) ?? null,
      latestExecutionCounters: toNumberRecord(latestExecution),
      queueActionBreakdown: args.queueSummary.actionCounts,
    },
    queuedWithRouterMetadata: args.queueSummary.queuedSamples,
    samples: {
      highCostSuppressed: toSamples(highCostSuppressed),
      reviewRequired: toSamples(reviewRequired),
      deterministicOnly: toSamples(deterministicOnly),
    },
  };
}

export function renderModelTaskRouterExecutionMarkdown(
  report: ModelTaskRouterExecutionReport,
) {
  const lines = [
    '# GitDian Model Task Router Execution Report',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- priorityGeneratedAt: ${report.source.priorityGeneratedAt}`,
    `- latestRunGeneratedAt: ${report.source.latestRunGeneratedAt ?? 'none'}`,
    `- healthGeneratedAt: ${report.source.healthGeneratedAt ?? 'none'}`,
    '',
    '## Summary',
    '',
    `- queuedWithRouterMetadataCount: ${report.summary.queuedWithRouterMetadataCount}`,
    `- routerReviewRequiredCount: ${report.summary.routerReviewRequiredCount}`,
    `- routerDeterministicOnlyCount: ${report.summary.routerDeterministicOnlyCount}`,
    `- frozenOrArchivedTaskSuppressedCount: ${report.summary.frozenOrArchivedTaskSuppressedCount}`,
    `- reviewRequiredTasks: ${renderList(report.summary.reviewRequiredTasks)}`,
    `- deterministicOnlyTasks: ${renderList(report.summary.deterministicOnlyTasks)}`,
    `- highCostSuppressedTasks: ${renderList(report.summary.highCostSuppressedTasks)}`,
    '',
    '## Queue Capability Breakdown',
    '',
    ...Object.entries(report.summary.routerCapabilityBreakdown).map(
      ([tier, count]) => `- ${tier}: ${count}`,
    ),
    '',
    '## Queue Fallback Breakdown',
    '',
    ...Object.entries(report.summary.routerFallbackBreakdown).map(
      ([policy, count]) => `- ${policy}: ${count}`,
    ),
    '',
    '## Execution',
    '',
    `- schedulerLane: ${report.execution.schedulerLane ?? 'none'}`,
    `- queueActionBreakdown: downgrade=${report.execution.queueActionBreakdown.downgrade_only}, refresh=${report.execution.queueActionBreakdown.refresh_only}, evidence=${report.execution.queueActionBreakdown.evidence_repair}, deep=${report.execution.queueActionBreakdown.deep_repair}, recalc=${report.execution.queueActionBreakdown.decision_recalc}`,
    '',
    '## Queued With Router Metadata',
    '',
    ...renderQueuedSamples(report.queuedWithRouterMetadata),
    '',
    '## Samples',
    '',
    '### high_cost_suppressed',
    ...renderSamples(report.samples.highCostSuppressed),
    '',
    '### review_required',
    ...renderSamples(report.samples.reviewRequired),
    '',
    '### deterministic_only',
    ...renderSamples(report.samples.deterministicOnly),
  ];

  return lines.join('\n');
}

function toSamples(
  decisions: Array<{ item: HistoricalRepairPriorityItem; decision: ModelTaskRouterDecisionOutput }>,
) {
  return decisions.slice(0, 8).map(({ item, decision }) => ({
    fullName: item.fullName,
    taskType: decision.normalizedTaskType,
    capabilityTier: decision.capabilityTier,
    preferredTier:
      getModelTaskRouterDefinition(decision.normalizedTaskType)?.preferredCapabilityTier ??
      decision.capabilityTier,
    cleanupState: item.cleanupState,
    action: item.historicalRepairAction,
    reason: decision.routerReasonSummary,
  }));
}

function capabilityRank(tier: ModelTaskCapabilityTierName) {
  switch (tier) {
    case 'DETERMINISTIC_ONLY':
      return 0;
    case 'LIGHT':
      return 1;
    case 'STANDARD':
      return 2;
    case 'HEAVY':
      return 3;
    case 'REVIEW':
      return 4;
    default:
      return 0;
  }
}

function uniqueTaskTypes(values: NormalizedModelTaskType[]) {
  return [...new Set(values)];
}

function readObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function toNumberRecord(value: Record<string, unknown> | null) {
  if (!value) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>(
    (accumulator, [key, current]) => {
      const normalized = Number(current ?? 0);
      accumulator[key] = Number.isFinite(normalized) ? normalized : 0;
      return accumulator;
    },
    {},
  );
}

function renderList(values: string[]) {
  return values.length ? values.join(' | ') : 'none';
}

function renderQueuedSamples(
  items: ModelTaskRouterExecutionQueueSummary['queuedSamples'],
) {
  if (!items.length) {
    return ['- none'];
  }

  return items.map(
    (item) =>
      `- repo=${item.repoId ?? 'unknown'} | action=${item.action ?? 'unknown'} | tier=${item.capabilityTier} | fallback=${item.fallbackPolicy} | review=${item.requiresReview} | queue=${item.queueName ?? 'unknown'}`,
  );
}

function renderSamples(samples: ExecutionSample[]) {
  if (!samples.length) {
    return ['- none'];
  }

  return samples.map(
    (sample) =>
      `- ${sample.fullName} | task=${sample.taskType} | tier=${sample.capabilityTier} | preferred=${sample.preferredTier} | cleanup=${sample.cleanupState} | action=${sample.action} | reason=${sample.reason}`,
  );
}
