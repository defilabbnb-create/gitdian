import type { ModelTaskRouterDecisionReport } from './model-task-router-decision.helper';
import type {
  ModelTaskRouterExecutionReport,
} from './model-task-router-execution.helper';
import type {
  ModelTaskRouterInventoryReport,
} from './model-task-router.helper';
import type {
  ModelTaskCapabilityTierName,
  ModelTaskFallbackPolicy,
  NormalizedModelTaskType,
} from './model-task-router.types';

type RouterTaskTypeSnapshot = {
  taskType: NormalizedModelTaskType;
  preferredCapabilityTier: ModelTaskCapabilityTierName | null;
  dynamicCapabilityBreakdown: Record<ModelTaskCapabilityTierName, number>;
};

type RouterExecutionSample = {
  fullName: string;
  taskType: NormalizedModelTaskType;
  capabilityTier: ModelTaskCapabilityTierName;
  reason: string;
  cleanupState?: string | null;
  action?: string | null;
};

export type ModelTaskRouterSummaryReport = {
  generatedAt: string;
  source: {
    inventoryGeneratedAt: string;
    decisionGeneratedAt: string;
    executionGeneratedAt: string;
    priorityGeneratedAt: string;
    latestRunGeneratedAt: string | null;
    healthGeneratedAt: string | null;
  };
  summary: {
    normalizedTaskTypeCount: number;
    observedRawTaskSourceCount: number;
    stillNotUnifiedCount: number;
    capabilityTierBreakdown: Record<ModelTaskCapabilityTierName, number>;
    fallbackPolicyBreakdown: Record<ModelTaskFallbackPolicy, number>;
    requiresReviewCount: number;
    deterministicOnlyTaskCount: number;
    deterministicOnlyQueuedCount: number;
    frozenOrArchivedTaskSuppressedCount: number;
    queueRouterMetadataCount: number;
  };
  taskOverview: {
    topHighCostTasks: RouterTaskTypeSnapshot[];
    topReviewRequiredTasks: RouterTaskTypeSnapshot[];
    topDowngradedTasks: RouterTaskTypeSnapshot[];
    stillNotUnified: ModelTaskRouterInventoryReport['summary']['stillNotUnified'];
  };
  execution: {
    schedulerLane: string | null;
    queueActionBreakdown: ModelTaskRouterExecutionReport['execution']['queueActionBreakdown'];
    routerCapabilityBreakdown: ModelTaskRouterExecutionReport['summary']['routerCapabilityBreakdown'];
    routerFallbackBreakdown: ModelTaskRouterExecutionReport['summary']['routerFallbackBreakdown'];
  };
  samples: {
    reviewRequired: RouterExecutionSample[];
    deterministicOnly: RouterExecutionSample[];
    highCostSuppressed: RouterExecutionSample[];
  };
  notes: {
    decisionVsQueueDistribution: string;
    deterministicOnlyMeaning: string;
    freezeArchiveSuppression: string;
  };
  audit: {
    commands: string[];
    focusFields: string[];
    sampleChecks: string[];
  };
};

export function buildModelTaskRouterSummaryReport(args: {
  inventoryReport: ModelTaskRouterInventoryReport;
  decisionReport: ModelTaskRouterDecisionReport;
  executionReport: ModelTaskRouterExecutionReport;
}): ModelTaskRouterSummaryReport {
  return {
    generatedAt: new Date().toISOString(),
    source: {
      inventoryGeneratedAt: args.inventoryReport.generatedAt,
      decisionGeneratedAt: args.decisionReport.generatedAt,
      executionGeneratedAt: args.executionReport.generatedAt,
      priorityGeneratedAt: args.executionReport.source.priorityGeneratedAt,
      latestRunGeneratedAt: args.executionReport.source.latestRunGeneratedAt,
      healthGeneratedAt: args.executionReport.source.healthGeneratedAt,
    },
    summary: {
      normalizedTaskTypeCount:
        args.inventoryReport.summary.normalizedTaskTypeCount,
      observedRawTaskSourceCount:
        args.inventoryReport.summary.observedRawTaskSourceCount,
      stillNotUnifiedCount:
        args.inventoryReport.summary.stillNotUnified.length,
      capabilityTierBreakdown:
        args.decisionReport.summary.capabilityTierBreakdown,
      fallbackPolicyBreakdown:
        args.executionReport.summary.routerFallbackBreakdown,
      requiresReviewCount:
        args.executionReport.summary.routerReviewRequiredCount,
      deterministicOnlyTaskCount:
        args.decisionReport.summary.deterministicOnlyCount,
      deterministicOnlyQueuedCount:
        args.executionReport.summary.routerDeterministicOnlyCount,
      frozenOrArchivedTaskSuppressedCount:
        args.executionReport.summary.frozenOrArchivedTaskSuppressedCount,
      queueRouterMetadataCount:
        args.executionReport.summary.queuedWithRouterMetadataCount,
    },
    taskOverview: {
      topHighCostTasks: buildTaskSnapshots(
        args.decisionReport.summary.highCostWorthKeeping,
        args.inventoryReport,
        args.decisionReport,
      ),
      topReviewRequiredTasks: buildTaskSnapshots(
        args.decisionReport.summary.reviewRequiredTasks,
        args.inventoryReport,
        args.decisionReport,
      ),
      topDowngradedTasks: buildTaskSnapshots(
        args.decisionReport.summary.deterministicOnlyTasks,
        args.inventoryReport,
        args.decisionReport,
      ),
      stillNotUnified: args.inventoryReport.summary.stillNotUnified,
    },
    execution: {
      schedulerLane: args.executionReport.execution.schedulerLane,
      queueActionBreakdown: args.executionReport.execution.queueActionBreakdown,
      routerCapabilityBreakdown:
        args.executionReport.summary.routerCapabilityBreakdown,
      routerFallbackBreakdown:
        args.executionReport.summary.routerFallbackBreakdown,
    },
    samples: {
      reviewRequired: toExecutionSamples(args.executionReport.samples.reviewRequired),
      deterministicOnly: toExecutionSamples(
        args.executionReport.samples.deterministicOnly,
      ),
      highCostSuppressed: toExecutionSamples(
        args.executionReport.samples.highCostSuppressed,
      ),
    },
    notes: {
      decisionVsQueueDistribution:
        'capabilityTierBreakdown reflects all dynamic router decisions; queue breakdown reflects tasks that are actually enqueued now, so the two distributions are related but not identical.',
      deterministicOnlyMeaning:
        'DETERMINISTIC_ONLY means the task should stay on rule-based or downgrade-safe execution and must not compete for high-cost model capacity.',
      freezeArchiveSuppression:
        'freeze/archive suppression counts repositories whose cleanup policy keeps them out of high-cost router lanes even if they still have repair signals.',
    },
    audit: {
      commands: [
        'pnpm --filter api report:model-task-router',
        'pnpm --filter api report:model-task-router-decision',
        'pnpm --filter api report:model-task-router-execution',
        'pnpm --filter api health:daily -- --json --pretty',
      ],
      focusFields: [
        'summary.capabilityTierBreakdown',
        'summary.fallbackPolicyBreakdown',
        'summary.requiresReviewCount',
        'summary.deterministicOnlyTaskCount',
        'summary.frozenOrArchivedTaskSuppressedCount',
        'execution.schedulerLane',
        'execution.queueActionBreakdown',
      ],
      sampleChecks: [
        'Inspect 3 reviewRequired samples and confirm decision_recalc conflict routes to REVIEW.',
        'Inspect 3 deterministicOnly samples and confirm downgrade_only / cleanup tasks never carry high-cost capability.',
        'Inspect 3 highCostSuppressed samples and confirm freeze/archive or low-ROI suppression is visible in the reason.',
      ],
    },
  };
}

export function renderModelTaskRouterSummaryMarkdown(
  report: ModelTaskRouterSummaryReport,
) {
  const lines = [
    '# GitDian Model Task Router Summary',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- inventoryGeneratedAt: ${report.source.inventoryGeneratedAt}`,
    `- decisionGeneratedAt: ${report.source.decisionGeneratedAt}`,
    `- executionGeneratedAt: ${report.source.executionGeneratedAt}`,
    `- priorityGeneratedAt: ${report.source.priorityGeneratedAt}`,
    `- latestRunGeneratedAt: ${report.source.latestRunGeneratedAt ?? 'none'}`,
    `- healthGeneratedAt: ${report.source.healthGeneratedAt ?? 'none'}`,
    '',
    '## Summary',
    '',
    `- normalizedTaskTypeCount: ${report.summary.normalizedTaskTypeCount}`,
    `- observedRawTaskSourceCount: ${report.summary.observedRawTaskSourceCount}`,
    `- stillNotUnifiedCount: ${report.summary.stillNotUnifiedCount}`,
    `- requiresReviewCount: ${report.summary.requiresReviewCount}`,
    `- deterministicOnlyTaskCount: ${report.summary.deterministicOnlyTaskCount}`,
    `- deterministicOnlyQueuedCount: ${report.summary.deterministicOnlyQueuedCount}`,
    `- frozenOrArchivedTaskSuppressedCount: ${report.summary.frozenOrArchivedTaskSuppressedCount}`,
    `- queueRouterMetadataCount: ${report.summary.queueRouterMetadataCount}`,
    '',
    '## Capability Tier Distribution',
    '',
    ...renderCountRecord(report.summary.capabilityTierBreakdown),
    '',
    '## Fallback Policy Distribution',
    '',
    ...renderCountRecord(report.summary.fallbackPolicyBreakdown),
    '',
    '## Task Type Overview',
    '',
    '### Top High-Cost Tasks',
    ...renderTaskSnapshots(report.taskOverview.topHighCostTasks),
    '',
    '### Top Review-Required Tasks',
    ...renderTaskSnapshots(report.taskOverview.topReviewRequiredTasks),
    '',
    '### Top Downgraded Tasks',
    ...renderTaskSnapshots(report.taskOverview.topDowngradedTasks),
    '',
    '### Still Not Unified',
    ...renderUnresolvedSources(report.taskOverview.stillNotUnified),
    '',
    '## Execution',
    '',
    `- schedulerLane: ${report.execution.schedulerLane ?? 'none'}`,
    `- queueActionBreakdown: downgrade=${report.execution.queueActionBreakdown.downgrade_only}, refresh=${report.execution.queueActionBreakdown.refresh_only}, evidence=${report.execution.queueActionBreakdown.evidence_repair}, deep=${report.execution.queueActionBreakdown.deep_repair}, recalc=${report.execution.queueActionBreakdown.decision_recalc}`,
    '',
    '### Queue Capability Breakdown',
    ...renderCountRecord(report.execution.routerCapabilityBreakdown),
    '',
    '### Queue Fallback Breakdown',
    ...renderCountRecord(report.execution.routerFallbackBreakdown),
    '',
    '## Samples',
    '',
    '### review_required',
    ...renderExecutionSamples(report.samples.reviewRequired),
    '',
    '### deterministic_only',
    ...renderExecutionSamples(report.samples.deterministicOnly),
    '',
    '### high_cost_suppressed',
    ...renderExecutionSamples(report.samples.highCostSuppressed),
    '',
    '## Notes',
    '',
    `- ${report.notes.decisionVsQueueDistribution}`,
    `- ${report.notes.deterministicOnlyMeaning}`,
    `- ${report.notes.freezeArchiveSuppression}`,
    '',
    '## Manual Audit',
    '',
    ...report.audit.commands.map((command) => `- command: ${command}`),
    ...report.audit.focusFields.map((field) => `- focusField: ${field}`),
    ...report.audit.sampleChecks.map((check) => `- sampleCheck: ${check}`),
  ];

  return lines.join('\n');
}

function buildTaskSnapshots(
  taskTypes: NormalizedModelTaskType[],
  inventoryReport: ModelTaskRouterInventoryReport,
  decisionReport: ModelTaskRouterDecisionReport,
): RouterTaskTypeSnapshot[] {
  return taskTypes.map((taskType) => ({
    taskType,
    preferredCapabilityTier:
      inventoryReport.tasks.find((task) => task.normalizedTaskType === taskType)
        ?.preferredCapabilityTier ?? null,
    dynamicCapabilityBreakdown:
      decisionReport.summary.taskTypeTierDistribution.find(
        (item) => item.normalizedTaskType === taskType,
      )?.capabilityTierBreakdown ?? emptyCapabilityBreakdown(),
  }));
}

function toExecutionSamples(
  samples: Array<{
    fullName: string;
    taskType: NormalizedModelTaskType;
    capabilityTier: ModelTaskCapabilityTierName;
    reason: string;
    cleanupState?: string | null;
    action?: string;
  }>,
): RouterExecutionSample[] {
  return samples.map((sample) => ({
    fullName: sample.fullName,
    taskType: sample.taskType,
    capabilityTier: sample.capabilityTier,
    reason: sample.reason,
    cleanupState: sample.cleanupState ?? null,
    action: sample.action ?? null,
  }));
}

function renderCountRecord(record: Record<string, number>) {
  return Object.entries(record).map(([key, count]) => `- ${key}: ${count}`);
}

function renderTaskSnapshots(items: RouterTaskTypeSnapshot[]) {
  if (!items.length) {
    return ['- none'];
  }

  return items.map(
    (item) =>
      `- ${item.taskType}: preferred=${item.preferredCapabilityTier ?? 'none'}, dynamic=${renderInlineBreakdown(item.dynamicCapabilityBreakdown)}`,
  );
}

function renderExecutionSamples(samples: RouterExecutionSample[]) {
  if (!samples.length) {
    return ['- none'];
  }

  return samples.map(
    (sample) =>
      `- ${sample.fullName}: task=${sample.taskType}, tier=${sample.capabilityTier}, cleanup=${sample.cleanupState ?? 'active'}, action=${sample.action ?? 'n/a'}, reason=${sample.reason}`,
  );
}

function renderUnresolvedSources(
  items: ModelTaskRouterInventoryReport['summary']['stillNotUnified'],
) {
  if (!items.length) {
    return ['- none'];
  }

  return items.map(
    (item) =>
      `- ${item.sourceKind}:${item.sourceValue} -> ${item.coverage} (${item.note})`,
  );
}

function renderInlineBreakdown(record: Record<string, number>) {
  return Object.entries(record)
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');
}

function emptyCapabilityBreakdown(): Record<ModelTaskCapabilityTierName, number> {
  return {
    LIGHT: 0,
    STANDARD: 0,
    HEAVY: 0,
    REVIEW: 0,
    DETERMINISTIC_ONLY: 0,
  };
}
