import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  MoneyPriorityInput,
  MoneyPriorityResult,
  MoneyPriorityService,
} from './money-priority.service';
import {
  buildRepositoryDecisionDisplaySummary,
  RepositoryDecisionDisplaySummary,
  resolveFinalDecisionSource,
  shouldUseClaudeReviewForFinalDecision,
} from './helpers/repository-final-decision.helper';
import {
  deriveRepositoryAnalysisState,
  type RepositoryDerivedAnalysisState,
} from './helpers/repository-analysis-status.helper';
import {
  buildRepositoryEvidenceMap,
  type EvidenceMapDimension,
} from './helpers/evidence-map.helper';
import {
  buildEvidenceDrivenDecisionSummary,
  summarizeEvidenceMap,
  type EvidenceDrivenDecisionSummary,
  type EvidenceMapInsightSummary,
} from './helpers/evidence-map-insight.helper';
import {
  evaluateOneLinerStrength,
  OneLinerStrength,
} from './helpers/one-liner-strength.helper';

const CLAUDE_AUDIT_LATEST_CONFIG_KEY = 'claude.audit.latest';
const HISTORICAL_REPAIR_FRONTEND_GUARD_CONFIG_KEY =
  'analysis.historical_repair.frontend_guard.latest';

type JsonObject = Record<string, unknown>;
type InsightVerdict = 'GOOD' | 'OK' | 'BAD';
type InsightAction = 'BUILD' | 'CLONE' | 'IGNORE';
type ProjectRealityType = 'product' | 'tool' | 'model' | 'infra' | 'demo';
type FinalDecisionSource = 'manual' | 'claude' | 'local' | 'fallback';
type FounderPriorityTier = 'P0' | 'P1' | 'P2' | 'P3';
type AnalysisLevel = 'snapshot' | 'deep_l1' | 'deep_l2';

export type RepositoryFinalDecision = {
  repoId: string;
  oneLinerZh: string;
  oneLinerStrength: OneLinerStrength;
  verdict: InsightVerdict;
  action: InsightAction;
  category: string;
  categoryLabelZh: string;
  categoryMain: string | null;
  categorySub: string | null;
  projectType: ProjectRealityType | null;
  moneyPriority: FounderPriorityTier;
  moneyPriorityLabelZh: string;
  reasonZh: string;
  source: FinalDecisionSource;
  sourceLabelZh: string;
  hasConflict: boolean;
  needsRecheck: boolean;
  hasTrainingHints: boolean;
  hasClaudeReview: boolean;
  hasManualOverride: boolean;
  comparison: {
    localVerdict: InsightVerdict | null;
    localAction: InsightAction | null;
    localOneLinerZh: string | null;
    claudeVerdict: InsightVerdict | null;
    claudeAction: InsightAction | null;
    claudeOneLinerZh: string | null;
    conflictReasons: string[];
  };
  moneyDecision: {
    labelZh: string;
    score: number;
    recommendedMoveZh: string;
    targetUsersZh: string;
    monetizationSummaryZh: string;
    reasonZh: string;
  };
  decisionSummary: RepositoryDecisionDisplaySummary;
  evidenceDecision: EvidenceDrivenDecisionSummary;
};

export type RepositoryCoreAsset = {
  repoId: string;
  repoFullName: string;
  repoUrl: string;
  oneLinerZh: string;
  oneLinerStrength: OneLinerStrength;
  finalVerdict: InsightVerdict;
  finalAction: InsightAction;
  finalCategory: string;
  moneyPriorityTier: FounderPriorityTier;
  decisionSource: FinalDecisionSource;
  lastReviewedAt: string | null;
};

export type RepositoryAnalysisAsset = {
  assetType:
    | 'idea_snapshot'
    | 'completeness'
    | 'idea_fit'
    | 'idea_extract'
    | 'insight';
  analysisLevel: AnalysisLevel;
  payload: JsonObject;
  updatedAt: string | null;
};

export type RepositoryTrainingAsset = {
  repoId: string;
  localVerdict: InsightVerdict | null;
  localAction: InsightAction | null;
  claudeVerdict: InsightVerdict | null;
  claudeAction: InsightAction | null;
  mistakeTypes: string[];
  suggestions: string[];
  shouldTrain: boolean;
  diffTypes: string[];
  auditProblemTypes: string[];
  auditSuggestions: string[];
  fallbackReplayDiff: string[];
};

export type RepositoryEvidenceSummaryAsset = EvidenceMapInsightSummary & {
  weakestDimensions: EvidenceMapDimension[];
};

export type RepositoryReadinessAsset = RepositoryDerivedAnalysisState;

type AuditProblemMatch = {
  type: string;
  reasons: string[];
};

type AuditSnapshot = {
  auditedAt: string | null;
  headline: string | null;
  repositoriesNeedingReview: Set<string>;
  needsRecompute: Set<string>;
  recommendedActions: string[];
  problemMatchesByRepositoryId: Map<string, AuditProblemMatch[]>;
  problemMatchesByFullName: Map<string, AuditProblemMatch[]>;
};

type HistoricalRepairGuardEntry = {
  repoId: string;
  bucket: string;
  action: string;
  cleanupState: string;
  reason: string;
  priorityScore: number;
  frontendDecisionState: 'trusted' | 'provisional' | 'degraded';
};

type HistoricalRepairGuardSnapshot = {
  updatedAt: string | null;
  itemsByRepoId: Map<string, HistoricalRepairGuardEntry>;
};

const MAIN_CATEGORY_LABELS: Record<string, string> = {
  tools: '工具类',
  platform: '平台类',
  ai: 'AI 应用',
  data: '数据类',
  infra: '基础设施',
  content: '内容类',
  game: '游戏类',
  other: '其他',
};

const SUB_CATEGORY_LABELS: Record<string, string> = {
  devtools: '开发工具',
  'ai-tools': 'AI工具',
  automation: '自动化工具',
  'data-tools': '数据工具',
  'browser-extension': '浏览器扩展',
  productivity: '效率工具',
  workflow: '工作流工具',
  cli: '命令行工具',
  'no-code': '无代码工具',
  'ops-tools': '运维工具',
  marketplace: '交易平台',
  'app-builder': '应用搭建',
  'workflow-platform': '工作流平台',
  'developer-platform': '开发者平台',
  'api-platform': 'API 平台',
  'ai-writing': 'AI写作',
  'ai-code': 'AI编程',
  'ai-agent': 'AI Agent',
  'ai-image': 'AI图像',
  'ai-search': 'AI搜索',
  'data-pipeline': '数据管道',
  analytics: '数据分析',
  scraping: '数据采集',
  etl: 'ETL 工具',
  dataset: '数据集',
  'data-observability': '数据可观测',
  deployment: '部署工具',
  observability: '可观测性',
  auth: '身份认证',
  storage: '存储服务',
  'api-gateway': 'API 网关',
  devops: 'DevOps',
  cloud: '云基础设施',
  monitoring: '监控告警',
  security: '安全工具',
  'content-creation': '内容创作',
  seo: 'SEO 工具',
  publishing: '发布分发',
  media: '媒体工具',
  'game-tooling': '游戏工具',
  'game-content': '游戏内容',
  'game-platform': '游戏平台',
  other: '其他',
};

const PROJECT_TYPE_LABELS: Record<ProjectRealityType, string> = {
  product: '产品机会',
  tool: '工具机会',
  model: '模型能力',
  infra: '基础设施',
  demo: '模板 / 演示',
};

const FOUNDER_PRIORITY_LABELS: Record<FounderPriorityTier, string> = {
  P0: 'P0 · 能赚钱',
  P1: 'P1 · 可以做产品',
  P2: 'P2 · 值得借鉴',
  P3: 'P3 · 噪音 / 跳过',
};

const SOURCE_LABELS: Record<FinalDecisionSource, string> = {
  manual: '人工判断',
  claude: '历史复核',
  local: '主分析',
  fallback: '本地 fallback',
};

@Injectable()
export class RepositoryDecisionService {
  private auditSnapshotCache: AuditSnapshot | null = null;
  private auditSnapshotLoadedAt = 0;
  private historicalRepairGuardSnapshotCache: HistoricalRepairGuardSnapshot | null =
    null;
  private historicalRepairGuardLoadedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moneyPriorityService: MoneyPriorityService,
  ) {}

  async attachDerivedAssets<T>(value: T): Promise<T> {
    const [auditSnapshot, historicalRepairGuardSnapshot] = await Promise.all([
      this.getLatestAuditSnapshot(),
      this.getLatestHistoricalRepairGuardSnapshot(),
    ]);
    return this.attachDerivedAssetsWithAudit(
      value,
      auditSnapshot,
      historicalRepairGuardSnapshot,
    );
  }

  attachDerivedAssetsWithAudit<T>(
    value: T,
    auditSnapshot: AuditSnapshot | null,
    historicalRepairGuardSnapshot: HistoricalRepairGuardSnapshot | null = null,
  ): T {
    if (Array.isArray(value)) {
      return value.map((item) =>
        this.attachDerivedAssetsWithAudit(
          item,
          auditSnapshot,
          historicalRepairGuardSnapshot,
        ),
      ) as T;
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const record = value as Record<string, unknown>;
    if (this.looksLikeRepositoryRecord(record)) {
      return this.buildRepositoryAssets(
        record,
        auditSnapshot,
        historicalRepairGuardSnapshot,
      ) as unknown as T;
    }

    for (const [key, currentValue] of Object.entries(record)) {
      if (currentValue && typeof currentValue === 'object') {
        record[key] = this.attachDerivedAssetsWithAudit(
          currentValue,
          auditSnapshot,
          historicalRepairGuardSnapshot,
        );
      }
    }

    return value;
  }

  buildRepositoryAssets(
    repository: Record<string, unknown>,
    auditSnapshot: AuditSnapshot | null,
    historicalRepairGuardSnapshot: HistoricalRepairGuardSnapshot | null,
  ): Record<string, unknown> {
    const analysis = this.readObject(repository.analysis);
    const insight = this.readObject(analysis?.insightJson);
    const snapshot = this.readObject(analysis?.ideaSnapshotJson);
    const extractedIdea = this.readObject(analysis?.extractedIdeaJson);
    const claudeReviewWrapper = this.readObject(analysis?.claudeReview);
    const rawClaudeReview =
      this.readObject(claudeReviewWrapper?.review) ??
      (this.cleanText(analysis?.claudeReviewStatus, 20) === 'SUCCESS'
        ? this.readObject(analysis?.claudeReviewJson)
        : null);
    const claudeReview = shouldUseClaudeReviewForFinalDecision({
      claudeReview: rawClaudeReview,
      insight,
    })
      ? rawClaudeReview
      : null;
    const manualOverride =
      this.readObject(analysis?.manualOverride) ??
      this.normalizeManualOverride(analysis);
    const moneyPriority =
      this.readMoneyPriority(analysis?.moneyPriority) ??
      this.moneyPriorityService.calculate({
        repository: {
          fullName: this.cleanText(repository.fullName, 160) || null,
          description: this.cleanText(repository.description, 260) || null,
          homepage: this.cleanText(repository.homepage, 200) || null,
          language: this.cleanText(repository.language, 40) || null,
          topics: this.normalizeStringArray(repository.topics).slice(0, 12),
          stars: this.toNumber(repository.stars),
          ideaFitScore: this.toNumber(repository.ideaFitScore),
          finalScore: this.toNumber(repository.finalScore),
          toolLikeScore: this.toNumber(repository.toolLikeScore),
          roughPass: this.toBoolean(repository.roughPass),
          categoryL1: this.cleanText(repository.categoryL1, 40) || null,
          categoryL2: this.cleanText(repository.categoryL2, 40) || null,
        },
        manualOverride,
        claudeReview,
        insight,
        snapshot,
        extractedIdea,
      } satisfies MoneyPriorityInput);
    const source = resolveFinalDecisionSource({
      manualOverride,
      claudeReview: rawClaudeReview,
      insight,
    });
    const localVerdict =
      this.normalizeVerdict(insight?.verdict) ??
      (snapshot?.isPromising === true ? 'OK' : null);
    const localAction =
      this.normalizeAction(insight?.action) ??
      (localVerdict === 'GOOD'
        ? 'BUILD'
        : localVerdict === 'OK'
          ? 'CLONE'
          : localVerdict === 'BAD'
            ? 'IGNORE'
            : null);
    const localOneLiner =
      this.cleanText(insight?.oneLinerZh, 180) ||
      this.cleanText(snapshot?.oneLinerZh, 180) ||
      this.cleanText(repository.description, 180) ||
      this.cleanText(repository.fullName, 180) ||
      null;
    const claudeVerdict = this.normalizeVerdict(rawClaudeReview?.verdict);
    const claudeAction = this.normalizeAction(rawClaudeReview?.action);
    const claudeOneLiner =
      this.cleanText(rawClaudeReview?.oneLinerZh, 180) || null;
    const effectiveClaudeVerdict = this.normalizeVerdict(claudeReview?.verdict);
    const effectiveClaudeAction = this.normalizeAction(claudeReview?.action);
    const effectiveClaudeOneLiner =
      this.cleanText(claudeReview?.oneLinerZh, 180) || null;
    const verdict =
      this.normalizeVerdict(manualOverride?.verdict) ??
      effectiveClaudeVerdict ??
      localVerdict ??
      'BAD';
    const action =
      this.normalizeAction(manualOverride?.action) ??
      effectiveClaudeAction ??
      localAction ??
      (verdict === 'GOOD' ? 'BUILD' : verdict === 'OK' ? 'CLONE' : 'IGNORE');
    const projectType =
      this.normalizeProjectType(claudeReview?.projectType) ??
      this.readProjectTypeFromInsight(insight, snapshot) ??
      null;
    const category = this.resolveCategory(repository, insight, snapshot, moneyPriority, projectType);
    const reviewDiff = this.readObject(rawClaudeReview?.reviewDiff);
    const trainingHints = this.readObject(rawClaudeReview?.trainingHints);
    const fallbackDiff = this.readObject(rawClaudeReview?.fallbackDiff);
    const diffTypes = this.normalizeStringArray(reviewDiff?.diffTypes);
    const mistakeTypes = this.normalizeStringArray(trainingHints?.localModelMistakes);
    const suggestionPool = this.takeUnique(
      [
        ...this.normalizeStringArray(trainingHints?.ruleSuggestions),
        ...this.normalizeStringArray(trainingHints?.promptSuggestions),
        ...this.normalizeStringArray(trainingHints?.anchorSuggestions),
      ],
      12,
    );
    const auditMatches = this.matchAudit(repository, auditSnapshot);
    const hasConflict = Boolean(
      diffTypes.length > 0 ||
        (localVerdict && claudeVerdict && localVerdict !== claudeVerdict) ||
        (localAction && claudeAction && localAction !== claudeAction),
    );
    const needsRecheck = Boolean(
      hasConflict ||
        Boolean(rawClaudeReview?.needsClaudeReview) ||
        this.cleanText(analysis?.claudeReviewStatus, 20) === 'FAILED' ||
        auditMatches.needsRecompute ||
        auditMatches.repositoriesNeedingReview,
    );
    const founderPriority = this.resolveFounderPriority(moneyPriority, projectType, action);
    const finalOneLiner =
      effectiveClaudeOneLiner ||
      localOneLiner ||
      this.cleanText(repository.fullName, 180);
    const localOneLinerRiskFlags = this.normalizeStringArray(
      this.readObject(insight?.oneLinerMeta)?.riskFlags,
    );
    const claudeOneLinerRiskFlags = this.normalizeStringArray(
      this.readObject(rawClaudeReview?.oneLinerMeta)?.riskFlags,
    );
    const oneLinerStrength = evaluateOneLinerStrength({
      oneLinerZh: finalOneLiner,
      projectReality: {
        type: projectType ?? 'demo',
        hasRealUser:
          this.toBoolean(claudeReview?.hasRealUser) ??
          this.toBoolean(this.readObject(insight?.projectReality)?.hasRealUser) ??
          this.toBoolean(this.readObject(snapshot?.projectReality)?.hasRealUser) ??
          false,
        hasClearUseCase:
          this.toBoolean(claudeReview?.hasClearUseCase) ??
          this.toBoolean(this.readObject(insight?.projectReality)?.hasClearUseCase) ??
          this.toBoolean(this.readObject(snapshot?.projectReality)?.hasClearUseCase) ??
          false,
        isDirectlyMonetizable:
          this.toBoolean(claudeReview?.isDirectlyMonetizable) ??
          this.toBoolean(this.readObject(insight?.projectReality)?.isDirectlyMonetizable) ??
          this.toBoolean(this.readObject(snapshot?.projectReality)?.isDirectlyMonetizable) ??
          false,
      },
      stars: this.toNumber(repository.stars) ?? undefined,
      categoryMain: category.main,
      categorySub: category.sub,
      riskFlags:
        claudeOneLinerRiskFlags.length > 0
          ? claudeOneLinerRiskFlags
          : localOneLinerRiskFlags,
      ideaFitScore: this.toNumber(repository.ideaFitScore ?? insight?.ideaFitScore),
      verdict,
      action,
    });
    const finalReason =
      this.cleanText(manualOverride?.note, 320) ||
      this.cleanText(claudeReview?.reason, 320) ||
      this.cleanText(insight?.verdictReason, 320) ||
      this.cleanText(snapshot?.reason, 320) ||
      moneyPriority.reasonZh;

    const moneyDecision = {
      labelZh: moneyPriority.labelZh,
      score: moneyPriority.score,
      recommendedMoveZh: moneyPriority.recommendedMoveZh,
      targetUsersZh: moneyPriority.targetUsersZh,
      monetizationSummaryZh: moneyPriority.monetizationSummaryZh,
      reasonZh: moneyPriority.reasonZh,
    };
    const repositoryReadmeSummary =
      this.cleanText(
        this.readObject(repository.content)?.readmeSummary,
        320,
      ) ||
      this.cleanText(this.readObject(repository.content)?.readmeText, 320) ||
      this.cleanText(repository.description, 320) ||
      null;
    const finalDecisionBase = {
      repoId: this.cleanText(repository.id, 80),
      oneLinerZh: finalOneLiner,
      oneLinerStrength,
      verdict,
      action,
      category: category.key,
      categoryLabelZh: category.labelZh,
      categoryMain: category.main,
      categorySub: category.sub,
      projectType,
      moneyPriority: founderPriority,
      moneyPriorityLabelZh: FOUNDER_PRIORITY_LABELS[founderPriority],
      reasonZh: finalReason,
      source,
      sourceLabelZh: SOURCE_LABELS[source],
      hasConflict,
      needsRecheck,
      hasTrainingHints: mistakeTypes.length > 0 || suggestionPool.length > 0,
      hasClaudeReview: Boolean(claudeReview),
      hasManualOverride: Boolean(
        manualOverride?.verdict || manualOverride?.action || manualOverride?.note,
      ),
      comparison: {
        localVerdict,
        localAction,
        localOneLinerZh: localOneLiner,
        claudeVerdict,
        claudeAction,
        claudeOneLinerZh: claudeOneLiner,
        conflictReasons: this.takeUnique(
          [...diffTypes, ...mistakeTypes, ...this.normalizeStringArray(fallbackDiff?.reasons)],
          8,
        ),
      },
      moneyDecision,
      decisionSummary: buildRepositoryDecisionDisplaySummary({
        oneLinerZh: finalOneLiner,
        verdict,
        action,
        categoryLabelZh: category.labelZh,
        moneyPriority: founderPriority,
        reasonZh: finalReason,
        sourceLabelZh: SOURCE_LABELS[source],
        moneyDecision,
      }),
    };
    const baseAnalysisStateInput = {
      source,
      verdict,
      action,
      moneyPriority: founderPriority,
      oneLinerStrength,
      projectType,
      hasSnapshot: Boolean(snapshot),
      hasInsight: Boolean(insight),
      hasFinalDecision: true,
      hasIdeaFit: Boolean(this.readObject(analysis?.ideaFitJson)),
      hasIdeaExtract: Boolean(extractedIdea),
      hasCompleteness: Boolean(this.readObject(analysis?.completenessJson)),
      hasClaudeReview: Boolean(claudeReview),
      hasConflict,
      needsRecheck,
      fallbackUsed: this.toBoolean(analysis?.fallbackUsed) ?? false,
      hasRealUser:
        this.toBoolean(claudeReview?.hasRealUser) ??
        this.toBoolean(this.readObject(insight?.projectReality)?.hasRealUser) ??
        this.toBoolean(this.readObject(snapshot?.projectReality)?.hasRealUser) ??
        false,
      hasClearUseCase:
        this.toBoolean(claudeReview?.hasClearUseCase) ??
        this.toBoolean(this.readObject(insight?.projectReality)?.hasClearUseCase) ??
        this.toBoolean(this.readObject(snapshot?.projectReality)?.hasClearUseCase) ??
        false,
      isDirectlyMonetizable:
        this.toBoolean(claudeReview?.isDirectlyMonetizable) ??
        this.toBoolean(this.readObject(insight?.projectReality)?.isDirectlyMonetizable) ??
        this.toBoolean(this.readObject(snapshot?.projectReality)?.isDirectlyMonetizable) ??
        false,
      targetUsersLabel: moneyPriority.targetUsersZh,
      monetizationLabel: moneyPriority.monetizationSummaryZh,
      reasonZh: finalReason,
      evidenceSummaryZh: null,
      snapshotReason: this.cleanText(snapshot?.reason, 320) || null,
      readmeSummary: repositoryReadmeSummary,
      evidenceCoverageRate: null,
      evidenceWeakCount: 0,
      evidenceConflictCount: 0,
      keyEvidenceMissingCount: 0,
      keyEvidenceWeakCount: 0,
      keyEvidenceConflictCount: 0,
      evidenceMissingDimensions: [],
      evidenceWeakDimensions: [],
      evidenceConflictDimensions: [],
      supportingEvidenceDimensions: [],
      deepRepairDimensions: [],
      decisionConflictDimensions: [],
      keyEvidenceGaps: [],
      keyEvidenceGapSeverity: 'NONE',
      conflictDrivenGaps: [],
      missingDrivenGaps: [],
      weakDrivenGaps: [],
      decisionRecalcGaps: [],
      deepRepairGaps: [],
      evidenceRepairGaps: [],
      trustedBlockingGaps: [],
      snapshotPromising: this.toBoolean(snapshot?.isPromising) ?? null,
      snapshotNextAction: this.cleanText(snapshot?.nextAction, 40) || null,
      deepAnalysisStatus:
        this.cleanText(analysis?.deepAnalysisStatus, 40) as
          | 'NOT_STARTED'
          | 'PENDING'
          | 'RUNNING'
          | 'COMPLETED'
          | 'SKIPPED_BY_GATE'
          | 'SKIPPED_BY_STRENGTH'
          | 'FAILED'
          | null,
      deepAnalysisStatusReason:
        this.cleanText(analysis?.deepAnalysisStatusReason, 120) || null,
      reviewRuntimeRetired: this.isClaudeReviewRuntimeRetired(),
    } as Parameters<typeof deriveRepositoryAnalysisState>[0];
    const preliminaryReadiness = deriveRepositoryAnalysisState(
      baseAnalysisStateInput,
    );
    const historicalRepairGuardEntry =
      historicalRepairGuardSnapshot?.itemsByRepoId.get(
        this.cleanText(repository.id, 80),
      ) ?? null;
    const evidenceMap = buildRepositoryEvidenceMap({
      repository: {
        ...repository,
        finalDecision: finalDecisionBase,
        analysisState: preliminaryReadiness,
      },
    });
    const evidenceSummary: RepositoryEvidenceSummaryAsset = {
      ...summarizeEvidenceMap(evidenceMap),
      weakestDimensions: evidenceMap.summary.weakestDimensions,
    };
    let derivedReadiness = deriveRepositoryAnalysisState({
      ...baseAnalysisStateInput,
      evidenceSummaryZh: evidenceSummary.summaryZh,
      evidenceCoverageRate: evidenceSummary.coverageRate,
      evidenceWeakCount: evidenceSummary.weakCount,
      evidenceConflictCount: evidenceSummary.conflictCount,
      keyEvidenceMissingCount: evidenceSummary.keyMissingDimensions.length,
      keyEvidenceWeakCount: evidenceSummary.keyWeakDimensions.length,
      keyEvidenceConflictCount: evidenceSummary.keyConflictDimensions.length,
      evidenceMissingDimensions: evidenceSummary.missingDimensions,
      evidenceWeakDimensions: evidenceSummary.weakDimensions,
      evidenceConflictDimensions: evidenceSummary.conflictDimensions,
      supportingEvidenceDimensions: evidenceSummary.supportingDimensions,
      deepRepairDimensions: evidenceSummary.deepRepairDimensions,
      decisionConflictDimensions: evidenceSummary.decisionConflictDimensions,
      keyEvidenceGaps: evidenceSummary.keyEvidenceGaps,
      keyEvidenceGapSeverity: evidenceSummary.keyEvidenceGapSeverity,
      conflictDrivenGaps: evidenceSummary.conflictDrivenGaps,
      missingDrivenGaps: evidenceSummary.missingDrivenGaps,
      weakDrivenGaps: evidenceSummary.weakDrivenGaps,
      decisionRecalcGaps: evidenceSummary.decisionRecalcGaps,
      deepRepairGaps: evidenceSummary.deepRepairGaps,
      evidenceRepairGaps: evidenceSummary.evidenceRepairGaps,
      trustedBlockingGaps: evidenceSummary.trustedBlockingGaps,
    });
    if (historicalRepairGuardEntry) {
      derivedReadiness = this.applyHistoricalRepairGuard(
        derivedReadiness,
        historicalRepairGuardEntry,
      );
    }
    const evidenceDecision = buildEvidenceDrivenDecisionSummary({
      evidenceMap,
      evidence: evidenceSummary,
      currentAction: action,
      frontendDecisionState: derivedReadiness.frontendDecisionState,
      hasDeep: derivedReadiness.deepReady,
    });
    const finalDecision: RepositoryFinalDecision = {
      ...finalDecisionBase,
      evidenceDecision,
    };

    const coreAsset: RepositoryCoreAsset = {
      repoId: this.cleanText(repository.id, 80),
      repoFullName: this.cleanText(repository.fullName, 160),
      repoUrl: this.cleanText(repository.htmlUrl, 240),
      oneLinerZh: finalDecision.oneLinerZh,
      oneLinerStrength: finalDecision.oneLinerStrength,
      finalVerdict: finalDecision.verdict,
      finalAction: finalDecision.action,
      finalCategory: finalDecision.categoryLabelZh,
      moneyPriorityTier: finalDecision.moneyPriority,
      decisionSource: finalDecision.source,
      lastReviewedAt:
        this.cleanText(analysis?.manualUpdatedAt, 40) ||
        this.cleanText(analysis?.claudeReviewReviewedAt, 40) ||
        this.cleanText(analysis?.analyzedAt, 40) ||
        null,
    };

    const analysisAssets = this.buildAnalysisAssets(analysis);
    const trainingAsset =
      rawClaudeReview ||
      mistakeTypes.length ||
      auditMatches.problemTypes.length ||
      diffTypes.length
        ? {
            repoId: coreAsset.repoId,
            localVerdict,
            localAction,
            claudeVerdict,
            claudeAction,
            mistakeTypes,
            suggestions: this.takeUnique(
              [...suggestionPool, ...auditMatches.recommendedActions],
              16,
            ),
            shouldTrain:
              hasConflict ||
              Boolean(trainingHints?.shouldUpdateLocalHeuristics) ||
              auditMatches.problemTypes.length > 0 ||
              this.normalizeStringArray(fallbackDiff?.reasons).length > 0,
            diffTypes,
            auditProblemTypes: auditMatches.problemTypes,
            auditSuggestions: auditMatches.recommendedActions,
            fallbackReplayDiff: this.normalizeStringArray(fallbackDiff?.reasons),
          }
        : null;

    return {
      ...repository,
      finalDecision,
      analysisState: derivedReadiness,
      evidenceMapSummary: evidenceSummary,
      coreAsset,
      analysisAssets,
      trainingAsset,
    };
  }

  async getLatestAuditSnapshot(forceRefresh = false): Promise<AuditSnapshot | null> {
    if (!forceRefresh && this.auditSnapshotCache && Date.now() - this.auditSnapshotLoadedAt < 60_000) {
      return this.auditSnapshotCache;
    }

    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: CLAUDE_AUDIT_LATEST_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    const snapshot = this.normalizeAuditSnapshot(row?.configValue);
    this.auditSnapshotCache = snapshot;
    this.auditSnapshotLoadedAt = Date.now();
    return snapshot;
  }

  async getLatestHistoricalRepairGuardSnapshot(
    forceRefresh = false,
  ): Promise<HistoricalRepairGuardSnapshot | null> {
    if (
      !forceRefresh &&
      this.historicalRepairGuardSnapshotCache &&
      Date.now() - this.historicalRepairGuardLoadedAt < 60_000
    ) {
      return this.historicalRepairGuardSnapshotCache;
    }

    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: HISTORICAL_REPAIR_FRONTEND_GUARD_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    const snapshot = this.normalizeHistoricalRepairGuardSnapshot(row?.configValue);
    this.historicalRepairGuardSnapshotCache = snapshot;
    this.historicalRepairGuardLoadedAt = Date.now();
    return snapshot;
  }

  private looksLikeRepositoryRecord(record: Record<string, unknown>) {
    return Boolean(
      this.cleanText(record.id, 80) &&
        this.cleanText(record.fullName, 160) &&
        ('analysis' in record || 'htmlUrl' in record),
    );
  }

  private buildAnalysisAssets(analysis: JsonObject | null) {
    if (!analysis) {
      return [] as RepositoryAnalysisAsset[];
    }

    const assets: RepositoryAnalysisAsset[] = [];
    const analyzedAt = this.cleanText(analysis.analyzedAt, 40) || null;
    const assetMap: Array<{
      key: keyof typeof analysis;
      assetType: RepositoryAnalysisAsset['assetType'];
      analysisLevel: AnalysisLevel;
    }> = [
      { key: 'ideaSnapshotJson', assetType: 'idea_snapshot', analysisLevel: 'snapshot' },
      { key: 'completenessJson', assetType: 'completeness', analysisLevel: 'deep_l1' },
      { key: 'ideaFitJson', assetType: 'idea_fit', analysisLevel: 'deep_l1' },
      { key: 'extractedIdeaJson', assetType: 'idea_extract', analysisLevel: 'deep_l2' },
      { key: 'insightJson', assetType: 'insight', analysisLevel: 'deep_l2' },
    ];

    for (const item of assetMap) {
      const payload = this.readObject(analysis[item.key]);
      if (!payload) {
        continue;
      }

      assets.push({
        assetType: item.assetType,
        analysisLevel: item.analysisLevel,
        payload,
        updatedAt: analyzedAt,
      });
    }

    return assets;
  }

  private resolveCategory(
    repository: Record<string, unknown>,
    insight: JsonObject | null,
    snapshot: JsonObject | null,
    moneyPriority: MoneyPriorityResult,
    projectType: ProjectRealityType | null,
  ) {
    const insightCategory = this.readObject(insight?.category);
    const insightCategoryDisplay = this.readObject(insight?.categoryDisplay);
    const snapshotCategory = this.readObject(snapshot?.category);
    const main =
      this.cleanText(insightCategory?.main, 40) ||
      this.cleanText(snapshotCategory?.main, 40) ||
      this.cleanText(repository.categoryL1, 40) ||
      null;
    const sub =
      this.cleanText(insightCategory?.sub, 40) ||
      this.cleanText(snapshotCategory?.sub, 40) ||
      this.cleanText(repository.categoryL2, 40) ||
      null;
    const labelFromInsight = this.cleanText(insightCategoryDisplay?.label, 80);
    const labelFromTaxonomy = this.buildCategoryLabel(main, sub);
    const labelFromProjectType = projectType ? PROJECT_TYPE_LABELS[projectType] : '';
    const labelZh =
      labelFromInsight || labelFromTaxonomy || labelFromProjectType || moneyPriority.projectTypeLabelZh;

    return {
      key: sub || main || projectType || 'other',
      labelZh,
      main,
      sub,
    };
  }

  private resolveFounderPriority(
    moneyPriority: MoneyPriorityResult,
    projectType: ProjectRealityType | null,
    action: InsightAction,
  ): FounderPriorityTier {
    const signals = moneyPriority.moneySignals;
    const moneyDecision = this.cleanText(moneyPriority.moneyDecision, 40);
    const canBeP0 =
      signals?.hasClearUser &&
      signals?.hasMonetizationPath &&
      !signals?.isInfraOrModel &&
      !signals?.isTemplateOrDemo;

    if (
      canBeP0 &&
      (moneyDecision === 'MUST_BUILD' || moneyPriority.tier === 'MUST_LOOK' || moneyPriority.score >= 80)
    ) {
      return 'P0';
    }

    if (
      action === 'BUILD' ||
      moneyDecision === 'HIGH_VALUE' ||
      moneyDecision === 'BUILDABLE' ||
      moneyPriority.tier === 'WORTH_BUILDING'
    ) {
      return projectType === 'infra' || projectType === 'model' ? 'P2' : 'P1';
    }

    if (
      action === 'CLONE' ||
      moneyDecision === 'CLONEABLE' ||
      moneyDecision === 'CLONE_ONLY' ||
      moneyPriority.tier === 'WORTH_CLONING'
    ) {
      return 'P2';
    }

    return 'P3';
  }

  private readMoneyPriority(value: unknown) {
    const record = this.readObject(value);
    if (!record) {
      return null;
    }

    return record as unknown as MoneyPriorityResult;
  }

  private readProjectTypeFromInsight(
    insight: JsonObject | null,
    snapshot: JsonObject | null,
  ) {
    const projectReality =
      this.readObject(insight?.projectReality) ?? this.readObject(snapshot?.projectReality);
    return this.normalizeProjectType(projectReality?.type ?? projectReality?.projectType);
  }

  private normalizeManualOverride(value: JsonObject | null) {
    if (!value) {
      return null;
    }

    const verdict = this.cleanText(value.manualVerdict, 20) || null;
    const action = this.cleanText(value.manualAction, 20) || null;
    const note = this.cleanText(value.manualNote, 280) || null;
    const updatedAt = this.cleanText(value.manualUpdatedAt, 40) || null;

    if (!verdict && !action && !note && !updatedAt) {
      return null;
    }

    return {
      verdict,
      action,
      note,
      updatedAt,
    };
  }

  private normalizeAuditSnapshot(value: unknown): AuditSnapshot | null {
    const record = this.readObject(value);
    if (!record) {
      return null;
    }

    const problemMatchesByRepositoryId = new Map<string, AuditProblemMatch[]>();
    const problemMatchesByFullName = new Map<string, AuditProblemMatch[]>();

    for (const problem of this.normalizeProblemTypes(record.problemTypes)) {
      for (const example of problem.examples) {
        const repositoryId = this.cleanText(example.repositoryId, 80);
        const fullName = this.cleanText(example.fullName, 180);
        const reason = this.cleanText(example.reason, 240);
        const match = {
          type: problem.type,
          reasons: reason ? [reason] : [],
        };
        if (repositoryId) {
          const current = problemMatchesByRepositoryId.get(repositoryId) ?? [];
          current.push(match);
          problemMatchesByRepositoryId.set(repositoryId, current);
        }
        if (fullName) {
          const current = problemMatchesByFullName.get(fullName) ?? [];
          current.push(match);
          problemMatchesByFullName.set(fullName, current);
        }
      }
    }

    return {
      auditedAt: this.cleanText(record.auditedAt, 40) || null,
      headline: this.cleanText(record.highPriorityHeadline, 220) || null,
      repositoriesNeedingReview: new Set(
        this.normalizeStringArray(record.repositoriesNeedingReview),
      ),
      needsRecompute: new Set(this.normalizeStringArray(record.needsRecompute)),
      recommendedActions: this.normalizeRecommendedActions(record.recommendedActions),
      problemMatchesByRepositoryId,
      problemMatchesByFullName,
    };
  }

  private normalizeHistoricalRepairGuardSnapshot(
    value: unknown,
  ): HistoricalRepairGuardSnapshot | null {
    const record = this.readObject(value);
    if (!record) {
      return null;
    }

    const itemsByRepoId = new Map<string, HistoricalRepairGuardEntry>();
    const items = this.readArray(record.items);

    for (const item of items) {
      const current = this.readObject(item);
      if (!current) {
        continue;
      }
      const repoId = this.cleanText(current.repoId, 80);
      if (!repoId) {
        continue;
      }

      const frontendDecisionState = this.cleanText(
        current.frontendDecisionState,
        20,
      ) as HistoricalRepairGuardEntry['frontendDecisionState'] | '';

      itemsByRepoId.set(repoId, {
        repoId,
        bucket: this.cleanText(current.bucket, 40),
        action: this.cleanText(current.action, 40),
        cleanupState: this.cleanText(current.cleanupState, 24),
        reason: this.cleanText(current.reason, 240),
        priorityScore: this.toNumber(current.priorityScore) ?? 0,
        frontendDecisionState:
          frontendDecisionState === 'trusted' ||
          frontendDecisionState === 'provisional' ||
          frontendDecisionState === 'degraded'
            ? frontendDecisionState
            : 'degraded',
      });
    }

    return {
      updatedAt: this.cleanText(record.updatedAt, 40) || null,
      itemsByRepoId,
    };
  }

  private applyHistoricalRepairGuard(
    state: RepositoryDerivedAnalysisState,
    guard: HistoricalRepairGuardEntry,
  ): RepositoryDerivedAnalysisState {
    const nextState: RepositoryDerivedAnalysisState = {
      ...state,
      frontendDecisionState: guard.frontendDecisionState,
      historicalRepairGuard: {
        bucket: guard.bucket,
        action: guard.action,
        cleanupState: guard.cleanupState,
        reason: guard.reason,
        priorityScore: guard.priorityScore,
        frontendDecisionState: guard.frontendDecisionState,
      },
    };

    if (guard.frontendDecisionState === 'degraded') {
      nextState.displayStatus = 'UNSAFE';
      nextState.displayStatusReason = `historical_repair_guard:${guard.action}`;
      nextState.trustedDisplayReady = false;
      nextState.highConfidenceReady = false;
      nextState.fullyAnalyzed = false;
      nextState.unsafe = true;
      return nextState;
    }

    if (guard.frontendDecisionState === 'provisional') {
      nextState.displayStatus = 'BASIC_READY';
      nextState.displayStatusReason = `historical_repair_guard:${guard.action}`;
      nextState.trustedDisplayReady = false;
      nextState.highConfidenceReady = false;
      nextState.fullyAnalyzed = false;
      return nextState;
    }

    return nextState;
  }

  private matchAudit(repository: Record<string, unknown>, auditSnapshot: AuditSnapshot | null) {
    if (!auditSnapshot) {
      return {
        repositoriesNeedingReview: false,
        needsRecompute: false,
        problemTypes: [] as string[],
        recommendedActions: [] as string[],
      };
    }

    const repositoryId = this.cleanText(repository.id, 80);
    const fullName = this.cleanText(repository.fullName, 160);
    const matches = [
      ...(repositoryId
        ? auditSnapshot.problemMatchesByRepositoryId.get(repositoryId) ?? []
        : []),
      ...(fullName ? auditSnapshot.problemMatchesByFullName.get(fullName) ?? [] : []),
    ];

    return {
      repositoriesNeedingReview:
        (repositoryId ? auditSnapshot.repositoriesNeedingReview.has(repositoryId) : false) ||
        (fullName ? auditSnapshot.repositoriesNeedingReview.has(fullName) : false),
      needsRecompute:
        (repositoryId ? auditSnapshot.needsRecompute.has(repositoryId) : false) ||
        (fullName ? auditSnapshot.needsRecompute.has(fullName) : false),
      problemTypes: this.takeUnique(matches.map((item) => item.type), 8),
      recommendedActions: auditSnapshot.recommendedActions.slice(0, 8),
    };
  }

  private normalizeProblemTypes(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as Array<{
        type: string;
        examples: JsonObject[];
      }>;
    }

    return value
      .map((item) => this.readObject(item))
      .filter((item): item is JsonObject => item !== null)
      .map((item) => ({
        type: this.cleanText(item.type, 80),
        examples: Array.isArray(item.examples)
          ? item.examples
              .map((example) => this.readObject(example))
              .filter((example): example is JsonObject => example !== null)
          : [],
      }))
      .filter((item) => Boolean(item.type));
  }

  private normalizeRecommendedActions(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.readObject(item))
      .filter((item): item is JsonObject => item !== null)
      .map(
        (item) =>
          this.cleanText(item.action, 160) ||
          this.cleanText(item.reason, 220),
      )
      .filter(Boolean)
      .slice(0, 8);
  }

  private buildCategoryLabel(main: string | null, sub: string | null) {
    const mainLabel = main ? MAIN_CATEGORY_LABELS[main] ?? '待分类' : '';
    const subLabel = sub ? SUB_CATEGORY_LABELS[sub] ?? sub : '';

    if (mainLabel && subLabel) {
      return `${mainLabel} / ${subLabel}`;
    }

    return mainLabel || subLabel || '';
  }

  private normalizeVerdict(value: unknown): InsightVerdict | null {
    const normalized = this.cleanText(value, 12).toUpperCase();
    if (normalized === 'GOOD' || normalized === 'OK' || normalized === 'BAD') {
      return normalized;
    }

    return null;
  }

  private normalizeAction(value: unknown): InsightAction | null {
    const normalized = this.cleanText(value, 12).toUpperCase();
    if (normalized === 'BUILD' || normalized === 'CLONE' || normalized === 'IGNORE') {
      return normalized;
    }

    return null;
  }

  private normalizeProjectType(value: unknown): ProjectRealityType | null {
    const normalized = this.cleanText(value, 20).toLowerCase();
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

  private readObject(value: unknown): JsonObject | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as JsonObject;
  }

  private readArray(value: unknown) {
    return Array.isArray(value) ? value : [];
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.cleanText(item, 280))
      .filter(Boolean);
  }

  private cleanText(value: unknown, maxLength: number) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value).trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  private toBoolean(value: unknown) {
    return typeof value === 'boolean' ? value : null;
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private isClaudeReviewRuntimeRetired() {
    return this.readBooleanEnv('CLAUDE_RUNTIME_RETIRED', true);
  }

  private readBooleanEnv(envName: string, fallback: boolean) {
    const rawValue = process.env[envName];
    if (typeof rawValue !== 'string') {
      return fallback;
    }

    const normalized = rawValue.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }

    return fallback;
  }

  private takeUnique<T>(
    values: T[],
    limit: number,
    keySelector?: (value: T) => string,
  ) {
    const result: T[] = [];
    const seen = new Set<string>();

    for (const value of values) {
      const key =
        keySelector?.(value) ??
        (typeof value === 'string' ? value : JSON.stringify(value));
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(value);
      if (result.length >= limit) {
        break;
      }
    }

    return result;
  }
}
