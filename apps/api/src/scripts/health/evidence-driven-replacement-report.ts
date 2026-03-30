import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { HistoricalRepairPriorityReport } from '../../modules/analysis/helpers/historical-repair-priority.helper';
import { HistoricalRepairPriorityService } from '../../modules/analysis/historical-repair-priority.service';
import type { HistoricalRepairPriorityItem } from '../../modules/analysis/helpers/historical-repair-priority.helper';

type ReplacementImpactLevel = 'critical' | 'important' | 'low';
type ReplacementStatus = 'replaced' | 'remaining' | 'display_only';

type EvidenceDrivenReplacementFinding = {
  file: string;
  functionOrService: string;
  currentSummarySignal: string;
  evidenceDrivenReplacement: string;
  impactLevel: ReplacementImpactLevel;
  status: ReplacementStatus;
  notes: string;
};

type EvidenceDrivenReplacementReport = {
  generatedAt: string;
  summary: {
    totalFindings: number;
    criticalImportantCount: number;
    replacedCriticalImportantCount: number;
    remainingCriticalImportantCount: number;
    displayOnlySummaryCount: number;
    lowBacklogCount: number;
    evidenceDrivenRepairActionCount: number;
    decisionRecalcEvidenceConflictDrivenCount: number;
    downgradedOldTrustedByKeyEvidenceMissingCount: number;
    downgradedOldTrustedByEvidenceConflictCount: number;
    evidenceBackedQualitySignals: number;
  };
  inventory: {
    critical: EvidenceDrivenReplacementFinding[];
    important: EvidenceDrivenReplacementFinding[];
    low: EvidenceDrivenReplacementFinding[];
  };
  modules: {
    fullyEvidenceDriven: string[];
    summaryFallbackOnly: Array<{
      module: string;
      reason: string;
    }>;
    remainingCriticalOrImportant: EvidenceDrivenReplacementFinding[];
  };
  repairSummary: {
    repairActionsByAction: Record<string, number>;
    evidenceDrivenRepairActionBreakdown: Record<string, number>;
    decisionRecalcEvidenceConflictDrivenCount: number;
  };
  downgradeSummary: {
    oldTrustedButWeakCount: number;
    downgradedByKeyEvidenceMissingCount: number;
    downgradedByEvidenceConflictCount: number;
    samples: Array<{
      fullName: string;
      action: string;
      frontendDecisionState: string;
      reason: string;
    }>;
  };
  notes: {
    summaryUsedForDisplayOnly: string;
    remainingSummaryBasedBacklog: string;
  };
};

type CliOptions = {
  json: boolean;
  pretty: boolean;
  noWrite: boolean;
  outputDir: string | null;
};

const DEFAULT_OUTPUT_DIR = path.join(
  process.cwd(),
  'reports/evidence-driven-replacement',
);

const FINDINGS: EvidenceDrivenReplacementFinding[] = [
  {
    file: 'apps/api/src/modules/analysis/repository-decision.service.ts',
    functionOrService: 'RepositoryDecisionService.buildRepositoryAssets',
    currentSummarySignal:
      'oneLinerStrength + finalReason/reasonZh 直接参与 trusted/provisional/degraded 主分支',
    evidenceDrivenReplacement:
      '先生成 Evidence Map，再用 coverage / key missing / conflict / deep gap 回写最终 readiness 与 evidenceDecision',
    impactLevel: 'critical',
    status: 'replaced',
    notes: '当前 decision 主链不再因为 summary 写得完整就给 trusted。',
  },
  {
    file: 'apps/api/src/modules/analysis/helpers/repository-analysis-status.helper.ts',
    functionOrService: 'deriveRepositoryAnalysisState',
    currentSummarySignal:
      'targetUsersLabel / monetizationLabel / reasonZh / snapshotReason 兜底 trusted 与 nextStep',
    evidenceDrivenReplacement:
      'trusted/high confidence 现在读 key evidence missing / weak / conflict / coverage / deep gap；summary 只保留解释层兜底',
    impactLevel: 'critical',
    status: 'replaced',
    notes: 'currentAction / caution / why 也优先解释 evidence conflict 和 missing。',
  },
  {
    file: 'apps/api/src/modules/analysis/historical-data-inventory.service.ts',
    functionOrService: 'HistoricalDataInventoryService.toInventoryItem',
    currentSummarySignal:
      '重新用 targetUsersLabel / monetizationLabel / reasonZh / snapshotReason 再派生 analysis state',
    evidenceDrivenReplacement:
      '直接消费 attachDerivedAssets 后的 analysisState / evidenceMapSummary / evidenceDecision',
    impactLevel: 'critical',
    status: 'replaced',
    notes: 'inventory 已不再靠第二套 summary-based readiness 复算。',
  },
  {
    file: 'apps/api/src/scripts/helpers/task-analysis-completion-report.helper.ts',
    functionOrService: 'evaluateRepoAnalysisState',
    currentSummarySignal:
      'badOneliner / headline conflicts / monetizationOverclaim 直接决定 trustedListReady 与 homepageUnsafe',
    evidenceDrivenReplacement:
      '优先读 evidence coverage / key missing / key conflict / decision conflict，旧 summary 风险只做无 evidence 时的兜底',
    impactLevel: 'critical',
    status: 'replaced',
    notes: 'health / completion report 主安全口径已改成 evidence-first。',
  },
  {
    file: 'apps/api/src/scripts/report-task-analysis-completion.ts',
    functionOrService: 'runTaskAnalysisCompletionReport',
    currentSummarySignal:
      'noDeepButHasMonetization / noDeepButHasStrongWhy 直接由 monetizationLabel / reasonZh 推导',
    evidenceDrivenReplacement:
      '改为 evidenceSupportingDimensions + evidenceCurrentAction + keyEvidenceMissingCount',
    impactLevel: 'important',
    status: 'replaced',
    notes: '首页强表达风险不再由 narrative 文本直接推导。',
  },
  {
    file: 'apps/api/src/scripts/health/health-metrics.collector.ts',
    functionOrService: 'buildDailyHealthSnapshot.homepageSummary',
    currentSummarySignal:
      'homepageNoDeepButStrong 直接看 monetizationLabel / whyLabel',
    evidenceDrivenReplacement:
      '改为 evidenceCurrentAction=build 或 key missing=0 且存在核心 supportingEvidence',
    impactLevel: 'important',
    status: 'replaced',
    notes: 'scheduler 再读 health 时，看到的是 evidence-driven 强表达风险。',
  },
  {
    file: 'apps/api/src/modules/analysis/helpers/evidence-map-insight.helper.ts',
    functionOrService: 'scoreEvidenceBackedQuality / buildEvidenceDrivenDecisionSummary',
    currentSummarySignal:
      'qualityReasonSummary / decision summary 过去可被 summary 文本带偏',
    evidenceDrivenReplacement:
      'quality 和 decision 摘要现在由 evidence coverage / missing / conflict / freshness 反推，不再自由拼 narrative',
    impactLevel: 'important',
    status: 'replaced',
    notes: 'summary 仍然存在，但只是 evidence 的摘要表达。',
  },
  {
    file: 'apps/api/src/modules/analysis/helpers/repository-final-decision.helper.ts',
    functionOrService: 'buildRepositoryDecisionDisplaySummary',
    currentSummarySignal:
      'headlineZh / finalDecisionLabelZh / reasonZh 属于 summary-style 输出',
    evidenceDrivenReplacement:
      '保留为展示摘要；核心决策改读 finalDecision.evidenceDecision',
    impactLevel: 'important',
    status: 'display_only',
    notes: '这是展示层摘要，不再参与 repair/quality/guard 主分支。',
  },
  {
    file: 'apps/api/src/modules/analysis/helpers/historical-data-recovery.helper.ts',
    functionOrService: 'assessHistoricalRecoveryBatch / validateOneLiner',
    currentSummarySignal:
      'oneLinerZh / targetUsersLabel / monetizationLabel / whyLabel 仍驱动旧 dirty assessment',
    evidenceDrivenReplacement:
      '后续应迁移到 evidence conflict / missing / unsafe metrics；本轮未动，因为当前 historical repair 主 lane 已不依赖它做 action dispatch',
    impactLevel: 'low',
    status: 'remaining',
    notes: '保留为 legacy 审计/报表辅助，不再是 repair 主分支。',
  },
  {
    file: 'apps/api/src/modules/github/radar-daily-report.service.ts',
    functionOrService: 'daily report rendering',
    currentSummarySignal:
      '一句话/结论/原因 仍是 summary-style 输出',
    evidenceDrivenReplacement:
      '后续可改为引用 supportingEvidence / missingEvidence / conflictingEvidence',
    impactLevel: 'low',
    status: 'display_only',
    notes: '当前只是日报展示，不属于本次 critical path。',
  },
];

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
  };

  for (const rawArg of argv) {
    const arg = String(rawArg ?? '').trim();
    if (!arg.startsWith('--')) {
      continue;
    }

    const [flag, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=').trim();

    if (flag === 'json') {
      options.json = parseBoolean(value);
    }
    if (flag === 'pretty') {
      options.pretty = parseBoolean(value);
    }
    if (flag === 'no-write') {
      options.noWrite = parseBoolean(value);
    }
    if (flag === 'output-dir' && value) {
      options.outputDir = value;
    }
  }

  return options;
}

function countEvidenceDrivenRepairActions(items: HistoricalRepairPriorityItem[]) {
  const breakdown: Record<string, number> = {
    downgrade_only: 0,
    refresh_only: 0,
    evidence_repair: 0,
    deep_repair: 0,
    decision_recalc: 0,
  };

  for (const item of items) {
    if (item.historicalRepairAction === 'archive') {
      continue;
    }

    if (
      item.historicalRepairAction === 'decision_recalc' &&
      item.keyEvidenceConflictCount > 0
    ) {
      breakdown.decision_recalc += 1;
      continue;
    }

    if (
      item.historicalRepairAction === 'deep_repair' &&
      (item.hasFinalDecision && !item.hasDeep ||
        item.evidenceMissingDimensions.some((dimension) =>
          ['technical_maturity', 'execution', 'market', 'distribution'].includes(
            dimension,
          ),
        ))
    ) {
      breakdown.deep_repair += 1;
      continue;
    }

    if (
      item.historicalRepairAction === 'evidence_repair' &&
      (item.keyEvidenceMissingCount > 0 || item.evidenceWeakCount > 0)
    ) {
      breakdown.evidence_repair += 1;
      continue;
    }

    if (
      item.historicalRepairAction === 'refresh_only' &&
      item.needsFreshnessRefresh
    ) {
      breakdown.refresh_only += 1;
      continue;
    }

    if (
      item.historicalRepairAction === 'downgrade_only' &&
      (item.needsImmediateFrontendDowngrade ||
        item.evidenceConflictCount > 0 ||
        item.keyEvidenceMissingCount > 0)
    ) {
      breakdown.downgrade_only += 1;
    }
  }

  return breakdown;
}

export function buildEvidenceDrivenReplacementReport(args: {
  priorityReport: HistoricalRepairPriorityReport;
}): EvidenceDrivenReplacementReport {
  const findings = FINDINGS.slice().sort((left, right) => {
    const levelOrder: Record<ReplacementImpactLevel, number> = {
      critical: 0,
      important: 1,
      low: 2,
    };
    return levelOrder[left.impactLevel] - levelOrder[right.impactLevel];
  });
  const criticalImportant = findings.filter(
    (item) => item.impactLevel === 'critical' || item.impactLevel === 'important',
  );
  const replacedCriticalImportant = criticalImportant.filter(
    (item) => item.status === 'replaced',
  );
  const remainingCriticalImportant = criticalImportant.filter(
    (item) => item.status !== 'replaced',
  );
  const evidenceDrivenRepairActionBreakdown = countEvidenceDrivenRepairActions(
    args.priorityReport.items,
  );
  const evidenceDrivenRepairActionCount = Object.values(
    evidenceDrivenRepairActionBreakdown,
  ).reduce((sum, value) => sum + value, 0);
  const oldTrustedButWeak = args.priorityReport.items.filter(
    (item) => item.historicalTrustedButWeak,
  );
  const downgradedByKeyEvidenceMissing = oldTrustedButWeak.filter(
    (item) =>
      item.keyEvidenceMissingCount > 0 &&
      item.frontendDecisionState !== 'trusted',
  );
  const downgradedByEvidenceConflict = oldTrustedButWeak.filter(
    (item) =>
      item.keyEvidenceConflictCount > 0 &&
      item.frontendDecisionState !== 'trusted',
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFindings: findings.length,
      criticalImportantCount: criticalImportant.length,
      replacedCriticalImportantCount: replacedCriticalImportant.length,
      remainingCriticalImportantCount: remainingCriticalImportant.length,
      displayOnlySummaryCount: findings.filter((item) => item.status === 'display_only')
        .length,
      lowBacklogCount: findings.filter((item) => item.impactLevel === 'low').length,
      evidenceDrivenRepairActionCount,
      decisionRecalcEvidenceConflictDrivenCount:
        args.priorityReport.summary.conflictDrivenDecisionRecalcCount,
      downgradedOldTrustedByKeyEvidenceMissingCount:
        downgradedByKeyEvidenceMissing.length,
      downgradedOldTrustedByEvidenceConflictCount:
        downgradedByEvidenceConflict.length,
      evidenceBackedQualitySignals: 5,
    },
    inventory: {
      critical: findings.filter((item) => item.impactLevel === 'critical'),
      important: findings.filter((item) => item.impactLevel === 'important'),
      low: findings.filter((item) => item.impactLevel === 'low'),
    },
    modules: {
      fullyEvidenceDriven: [
        'repair action dispatch',
        'analysis quality scoring',
        'repository decision action / worth* judgement',
        'historical inventory downgrade signals',
        'health homepage strong-without-deep metric',
      ],
      summaryFallbackOnly: [
        {
          module: 'repository-final-decision display summary',
          reason: '仅保留 headline / label / reason 的展示摘要，不再参与 repair/quality/guard 主分支。',
        },
        {
          module: 'radar daily report rendering',
          reason: '仍使用 summary 组织人类可读日报，但不驱动修复动作。',
        },
      ],
      remainingCriticalOrImportant: remainingCriticalImportant,
    },
    repairSummary: {
      repairActionsByAction: {
        downgrade_only:
          args.priorityReport.summary.actionBreakdown.downgrade_only,
        refresh_only: args.priorityReport.summary.actionBreakdown.refresh_only,
        evidence_repair:
          args.priorityReport.summary.actionBreakdown.evidence_repair,
        deep_repair: args.priorityReport.summary.actionBreakdown.deep_repair,
        decision_recalc:
          args.priorityReport.summary.actionBreakdown.decision_recalc,
        archive: args.priorityReport.summary.actionBreakdown.archive,
      },
      evidenceDrivenRepairActionBreakdown,
      decisionRecalcEvidenceConflictDrivenCount:
        args.priorityReport.summary.conflictDrivenDecisionRecalcCount,
    },
    downgradeSummary: {
      oldTrustedButWeakCount:
        args.priorityReport.summary.historicalTrustedButWeakCount,
      downgradedByKeyEvidenceMissingCount: downgradedByKeyEvidenceMissing.length,
      downgradedByEvidenceConflictCount: downgradedByEvidenceConflict.length,
      samples: oldTrustedButWeak
        .slice()
        .sort(
          (left, right) =>
            right.historicalRepairPriorityScore - left.historicalRepairPriorityScore,
        )
        .slice(0, 8)
        .map((item) => ({
          fullName: item.fullName,
          action: item.historicalRepairAction,
          frontendDecisionState: item.frontendDecisionState,
          reason: item.qualityReasonSummary,
        })),
    },
    notes: {
      summaryUsedForDisplayOnly:
        'summary 仍保留在 display summary、日报文案、质量解释里，但这些文本现在只负责说明 evidence 结论，不再直接决定 repair/quality/guard 主分支。',
      remainingSummaryBasedBacklog:
        '剩余 summary-based backlog 主要在 legacy one-liner 审计和日报展示层；它们现在不再决定 historical repair action，也不再直接决定 trusted 资格。',
    },
  };
}

export function renderEvidenceDrivenReplacementMarkdown(
  report: EvidenceDrivenReplacementReport,
) {
  const lines: string[] = [
    '# Evidence-driven Replacement Report',
    '',
    `- generatedAt: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- totalFindings: ${report.summary.totalFindings}`,
    `- criticalImportantCount: ${report.summary.criticalImportantCount}`,
    `- replacedCriticalImportantCount: ${report.summary.replacedCriticalImportantCount}`,
    `- remainingCriticalImportantCount: ${report.summary.remainingCriticalImportantCount}`,
    `- displayOnlySummaryCount: ${report.summary.displayOnlySummaryCount}`,
    `- lowBacklogCount: ${report.summary.lowBacklogCount}`,
    `- evidenceDrivenRepairActionCount: ${report.summary.evidenceDrivenRepairActionCount}`,
    `- decisionRecalcEvidenceConflictDrivenCount: ${report.summary.decisionRecalcEvidenceConflictDrivenCount}`,
    `- downgradedOldTrustedByKeyEvidenceMissingCount: ${report.summary.downgradedOldTrustedByKeyEvidenceMissingCount}`,
    `- downgradedOldTrustedByEvidenceConflictCount: ${report.summary.downgradedOldTrustedByEvidenceConflictCount}`,
    `- evidenceBackedQualitySignals: ${report.summary.evidenceBackedQualitySignals}`,
    '',
    '## Critical',
    '',
    ...renderFindings(report.inventory.critical),
    '',
    '## Important',
    '',
    ...renderFindings(report.inventory.important),
    '',
    '## Low Backlog',
    '',
    ...renderFindings(report.inventory.low),
    '',
    '## Evidence-driven Repair Summary',
    '',
    ...Object.entries(report.repairSummary.evidenceDrivenRepairActionBreakdown).map(
      ([key, value]) => `- ${key}: ${value}`,
    ),
    `- decisionRecalcEvidenceConflictDrivenCount: ${report.repairSummary.decisionRecalcEvidenceConflictDrivenCount}`,
    '',
    '## Modules',
    '',
    ...report.modules.fullyEvidenceDriven.map(
      (item) => `- fullyEvidenceDriven: ${item}`,
    ),
    ...report.modules.summaryFallbackOnly.map(
      (item) => `- summaryFallbackOnly: ${item.module} | ${item.reason}`,
    ),
    '',
    '## Old Trusted Downgrade Samples',
    '',
    ...report.downgradeSummary.samples.map(
      (item) =>
        `- ${item.fullName} | action=${item.action} | state=${item.frontendDecisionState} | reason=${item.reason}`,
    ),
    '',
    '## Notes',
    '',
    `- ${report.notes.summaryUsedForDisplayOnly}`,
    `- ${report.notes.remainingSummaryBasedBacklog}`,
  ];

  return lines.join('\n');
}

function renderFindings(items: EvidenceDrivenReplacementFinding[]) {
  if (!items.length) {
    return ['- none'];
  }

  return items.map(
    (item) =>
      `- [${item.status}] ${item.file} :: ${item.functionOrService} | summary=${item.currentSummarySignal} | evidence=${item.evidenceDrivenReplacement} | notes=${item.notes}`,
  );
}

async function writeReportFiles(args: {
  report: EvidenceDrivenReplacementReport;
  markdown: string;
  outputDir?: string | null;
}) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const outputDir = args.outputDir || DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });
  const basename = `evidence-driven-replacement-${yyyy}${mm}${dd}`;
  const jsonPath = path.join(outputDir, `${basename}.json`);
  const markdownPath = path.join(outputDir, `${basename}.md`);
  await writeFile(jsonPath, JSON.stringify(args.report, null, 2), 'utf8');
  await writeFile(markdownPath, args.markdown, 'utf8');
  return {
    jsonPath,
    markdownPath,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const priorityService = app.get(HistoricalRepairPriorityService);
    const priorityReport = await priorityService.runPriorityReport();
    const report = buildEvidenceDrivenReplacementReport({
      priorityReport,
    });
    const markdown = renderEvidenceDrivenReplacementMarkdown(report);

    let paths:
      | {
          jsonPath: string;
          markdownPath: string;
        }
      | null = null;
    if (!options.noWrite) {
      paths = await writeReportFiles({
        report,
        markdown,
        outputDir: options.outputDir,
      });
    }

    const output = {
      generatedAt: report.generatedAt,
      criticalImportantCount: report.summary.criticalImportantCount,
      replacedCriticalImportantCount:
        report.summary.replacedCriticalImportantCount,
      remainingCriticalImportantCount:
        report.summary.remainingCriticalImportantCount,
      evidenceDrivenRepairActionCount:
        report.summary.evidenceDrivenRepairActionCount,
      decisionRecalcEvidenceConflictDrivenCount:
        report.summary.decisionRecalcEvidenceConflictDrivenCount,
      downgradedOldTrustedByKeyEvidenceMissingCount:
        report.summary.downgradedOldTrustedByKeyEvidenceMissingCount,
      jsonPath: paths?.jsonPath ?? null,
      markdownPath: paths?.markdownPath ?? null,
    };

    if (options.json) {
      process.stdout.write(
        JSON.stringify(output, null, options.pretty ? 2 : 0) + '\n',
      );
    } else {
      process.stdout.write(
        [
          `generatedAt: ${output.generatedAt}`,
          `criticalImportantCount: ${output.criticalImportantCount}`,
          `replacedCriticalImportantCount: ${output.replacedCriticalImportantCount}`,
          `remainingCriticalImportantCount: ${output.remainingCriticalImportantCount}`,
          `evidenceDrivenRepairActionCount: ${output.evidenceDrivenRepairActionCount}`,
          `decisionRecalcEvidenceConflictDrivenCount: ${output.decisionRecalcEvidenceConflictDrivenCount}`,
          `downgradedOldTrustedByKeyEvidenceMissingCount: ${output.downgradedOldTrustedByKeyEvidenceMissingCount}`,
          `jsonPath: ${output.jsonPath ?? 'not_written'}`,
          `markdownPath: ${output.markdownPath ?? 'not_written'}`,
        ].join('\n') + '\n',
      );
    }
  } finally {
    await app.close();
  }
}

if (
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('evidence-driven-replacement-report.js')
) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
