import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildHistoricalInventoryReport,
  defaultHistoricalInventoryThresholds,
  evaluateHistoricalInventoryItem,
  type HistoricalDataInventoryItem,
  type HistoricalDataInventoryReport,
  type HistoricalInventoryCollectionTier,
  type HistoricalInventoryThresholds,
  type HistoricalInventoryValueTier,
} from './helpers/historical-data-inventory.helper';
import { RepositoryDecisionService } from './repository-decision.service';
import type { EvidenceMapDimension } from './helpers/evidence-map.helper';
import {
  normalizeEvidenceGapSeverity,
  normalizeEvidenceGapTaxonomy,
} from './helpers/evidence-gap-taxonomy.helper';

type InventoryRepositoryRecord = Prisma.RepositoryGetPayload<{
  select: {
    id: true;
    fullName: true;
    name: true;
    ownerLogin: true;
    htmlUrl: true;
    description: true;
    homepage: true;
    language: true;
    license: true;
    defaultBranch: true;
    stars: true;
    forks: true;
    watchers: true;
    openIssues: true;
    topics: true;
    archived: true;
    disabled: true;
    createdAtGithub: true;
    updatedAtGithub: true;
    pushedAtGithub: true;
    lastCommitAt: true;
    commitCount30d: true;
    contributorsCount: true;
    issueActivityScore: true;
    growth24h: true;
    growth7d: true;
    activityScore: true;
    roughPass: true;
    roughLevel: true;
    roughReason: true;
    toolLikeScore: true;
    completenessScore: true;
    completenessLevel: true;
    productionReady: true;
    runability: true;
    projectReferenceScore: true;
    ideaFitScore: true;
    opportunityLevel: true;
    finalScore: true;
    decision: true;
    categoryL1: true;
    categoryL2: true;
    status: true;
    isFavorited: true;
    analysisProvider: true;
    analysisModel: true;
    analysisConfidence: true;
    updatedAt: true;
    analysis: {
      select: {
        ideaSnapshotJson: true;
        insightJson: true;
        claudeReviewJson: true;
        claudeReviewStatus: true;
        claudeReviewReviewedAt: true;
        manualVerdict: true;
        manualAction: true;
        manualNote: true;
        manualUpdatedAt: true;
        completenessJson: true;
        ideaFitJson: true;
        extractedIdeaJson: true;
        negativeFlags: true;
        tags: true;
        provider: true;
        modelName: true;
        promptVersion: true;
        confidence: true;
        fallbackUsed: true;
        analyzedAt: true;
      };
    };
    content: {
      select: {
        fetchedAt: true;
      };
    };
    favorite: {
      select: {
        priority: true;
      };
    };
    cachedRanking: {
      select: {
        moneyScore: true;
        moneyPriority: true;
        updatedAt: true;
      };
    };
    snapshots: {
      take: 1;
      orderBy: {
        snapshotAt: 'desc';
      };
      select: {
        snapshotAt: true;
      };
    };
  };
}>;

const INVENTORY_REPOSITORY_SELECT = {
  id: true,
  fullName: true,
  name: true,
  ownerLogin: true,
  htmlUrl: true,
  description: true,
  homepage: true,
  language: true,
  license: true,
  defaultBranch: true,
  stars: true,
  forks: true,
  watchers: true,
  openIssues: true,
  topics: true,
  archived: true,
  disabled: true,
  createdAtGithub: true,
  updatedAtGithub: true,
  pushedAtGithub: true,
  lastCommitAt: true,
  commitCount30d: true,
  contributorsCount: true,
  issueActivityScore: true,
  growth24h: true,
  growth7d: true,
  activityScore: true,
  roughPass: true,
  roughLevel: true,
  roughReason: true,
  toolLikeScore: true,
  completenessScore: true,
  completenessLevel: true,
  productionReady: true,
  runability: true,
  projectReferenceScore: true,
  ideaFitScore: true,
  opportunityLevel: true,
  finalScore: true,
  decision: true,
  categoryL1: true,
  categoryL2: true,
  status: true,
  isFavorited: true,
  analysisProvider: true,
  analysisModel: true,
  analysisConfidence: true,
  updatedAt: true,
  analysis: {
    select: {
      ideaSnapshotJson: true,
      insightJson: true,
      claudeReviewJson: true,
      claudeReviewStatus: true,
      claudeReviewReviewedAt: true,
      manualVerdict: true,
      manualAction: true,
      manualNote: true,
      manualUpdatedAt: true,
      completenessJson: true,
      ideaFitJson: true,
      extractedIdeaJson: true,
      negativeFlags: true,
      tags: true,
      provider: true,
      modelName: true,
      promptVersion: true,
      confidence: true,
      fallbackUsed: true,
      analyzedAt: true,
    },
  },
  content: {
    select: {
      fetchedAt: true,
    },
  },
  favorite: {
    select: {
      priority: true,
    },
  },
  cachedRanking: {
    select: {
      moneyScore: true,
      moneyPriority: true,
      updatedAt: true,
    },
  },
  snapshots: {
    take: 1,
    orderBy: {
      snapshotAt: 'desc',
    },
    select: {
      snapshotAt: true,
    },
  },
} satisfies Prisma.RepositorySelect;

export type HistoricalDataInventoryOptions = {
  limit?: number;
  repositoryIds?: string[];
  staleFreshnessDays?: number;
  staleEvidenceDays?: number;
};

@Injectable()
export class HistoricalDataInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repositoryDecisionService: RepositoryDecisionService,
  ) {}

  async runInventory(
    options?: HistoricalDataInventoryOptions,
  ): Promise<HistoricalDataInventoryReport> {
    const generatedAt = new Date().toISOString();
    const thresholds: HistoricalInventoryThresholds = {
      ...defaultHistoricalInventoryThresholds(),
      ...(typeof options?.staleFreshnessDays === 'number'
        ? { staleFreshnessDays: options.staleFreshnessDays }
        : {}),
      ...(typeof options?.staleEvidenceDays === 'number'
        ? { staleEvidenceDays: options.staleEvidenceDays }
        : {}),
    };
    const repositoryIds = [...new Set(options?.repositoryIds?.filter(Boolean) ?? [])];
    const [repositories, exposureSets] = await Promise.all([
      repositoryIds.length
        ? this.loadRepositoriesByIds(repositoryIds)
        : this.loadRepositories(options?.limit),
      this.loadExposureSets(),
    ]);
    const items = await this.buildInventoryItems({
      repositories,
      thresholds,
      generatedAt,
      exposureSets,
    });

    const orderedItems = repositoryIds.length
      ? repositoryIds
          .map((repositoryId) =>
            items.find((item) => item.repoId === repositoryId),
          )
          .filter((item): item is HistoricalDataInventoryItem => Boolean(item))
      : items;

    return buildHistoricalInventoryReport({
      generatedAt,
      thresholds,
      items: orderedItems,
    });
  }

  async runInventoryItemsForRepositoryIds(args: {
    repositoryIds: string[];
    staleFreshnessDays?: number;
    staleEvidenceDays?: number;
  }): Promise<HistoricalDataInventoryItem[]> {
    const repositoryIds = [...new Set(args.repositoryIds.filter(Boolean))];
    if (!repositoryIds.length) {
      return [];
    }

    const generatedAt = new Date().toISOString();
    const thresholds: HistoricalInventoryThresholds = {
      ...defaultHistoricalInventoryThresholds(),
      ...(typeof args.staleFreshnessDays === 'number'
        ? { staleFreshnessDays: args.staleFreshnessDays }
        : {}),
      ...(typeof args.staleEvidenceDays === 'number'
        ? { staleEvidenceDays: args.staleEvidenceDays }
        : {}),
    };
    const [repositories, exposureSets] = await Promise.all([
      this.loadRepositoriesByIds(repositoryIds),
      this.loadExposureSets(),
    ]);
    const items = await this.buildInventoryItems({
      repositories,
      thresholds,
      generatedAt,
      exposureSets,
    });
    const itemMap = new Map(items.map((item) => [item.repoId, item]));

    return repositoryIds
      .map((repositoryId) => itemMap.get(repositoryId))
      .filter((item): item is HistoricalDataInventoryItem => Boolean(item));
  }

  private async loadRepositories(limit?: number) {
    const batchSize = 200;
    const repositories: InventoryRepositoryRecord[] = [];
    let cursorId: string | null = null;

    while (true) {
      const remaining =
        typeof limit === 'number' && limit > 0 ? limit - repositories.length : null;
      if (remaining !== null && remaining <= 0) {
        break;
      }

      const batch: InventoryRepositoryRecord[] =
        await this.prisma.repository.findMany({
        ...(cursorId
          ? {
              cursor: { id: cursorId },
              skip: 1,
            }
          : {}),
        orderBy: {
          id: 'asc',
        },
        take:
          remaining === null
            ? batchSize
            : Math.max(1, Math.min(batchSize, remaining)),
        select: INVENTORY_REPOSITORY_SELECT,
      });

      if (!batch.length) {
        break;
      }

      repositories.push(...batch);
      cursorId = batch[batch.length - 1]?.id ?? null;
      if (!cursorId) {
        break;
      }
    }

    return repositories;
  }

  private async loadRepositoriesByIds(repositoryIds: string[]) {
    if (!repositoryIds.length) {
      return [] as InventoryRepositoryRecord[];
    }

    return this.prisma.repository.findMany({
      where: {
        id: {
          in: repositoryIds,
        },
      },
      orderBy: {
        id: 'asc',
      },
      select: INVENTORY_REPOSITORY_SELECT,
    });
  }

  private async buildInventoryItems(args: {
    repositories: InventoryRepositoryRecord[];
    thresholds: HistoricalInventoryThresholds;
    generatedAt: string;
    exposureSets: {
      homepageIds: Set<string>;
      dailySummaryIds: Set<string>;
      telegramIds: Set<string>;
    };
  }) {
    const auditSnapshot =
      await this.repositoryDecisionService.getLatestAuditSnapshot();
    const derivedRepositories =
      this.repositoryDecisionService.attachDerivedAssetsWithAudit(
        args.repositories.map((item) => this.serialize(item)) as Array<
          Record<string, unknown>
        >,
        auditSnapshot,
      ) as Array<Record<string, unknown>>;
    const now = new Date(args.generatedAt);

    return derivedRepositories.map((repository) =>
      this.toInventoryItem({
        repository,
        thresholds: args.thresholds,
        now,
        exposureSets: args.exposureSets,
      }),
    );
  }

  private async loadExposureSets() {
    const summaries = await this.prisma.dailyRadarSummary.findMany({
      orderBy: {
        date: 'desc',
      },
      take: 14,
      select: {
        topRepositoryIds: true,
        topGoodRepositoryIds: true,
        topCloneRepositoryIds: true,
        topIgnoredRepositoryIds: true,
        telegramSendStatus: true,
      },
    });

    const homepageIds = new Set<string>();
    const dailySummaryIds = new Set<string>();
    const telegramIds = new Set<string>();

    for (const summary of summaries) {
      const topIds = this.readStringArray(summary.topRepositoryIds);
      const goodIds = this.readStringArray(summary.topGoodRepositoryIds);
      const cloneIds = this.readStringArray(summary.topCloneRepositoryIds);
      const ignoredIds = this.readStringArray(summary.topIgnoredRepositoryIds);
      const allIds = [...topIds, ...goodIds, ...cloneIds, ...ignoredIds];

      for (const repositoryId of allIds) {
        dailySummaryIds.add(repositoryId);
      }
      for (const repositoryId of [...topIds, ...goodIds, ...cloneIds]) {
        homepageIds.add(repositoryId);
      }
      if (summary.telegramSendStatus === 'SENT') {
        for (const repositoryId of allIds) {
          telegramIds.add(repositoryId);
        }
      }
    }

    return {
      homepageIds,
      dailySummaryIds,
      telegramIds,
    };
  }

  private toInventoryItem(args: {
    repository: Record<string, unknown>;
    thresholds: HistoricalInventoryThresholds;
    now: Date;
    exposureSets: {
      homepageIds: Set<string>;
      dailySummaryIds: Set<string>;
      telegramIds: Set<string>;
    };
  }) {
    const repository = args.repository;
    const analysis = this.readObject(repository.analysis);
    const finalDecision = this.readObject(repository.finalDecision);
    const analysisStateRecord = this.readObject(repository.analysisState);
    const evidenceSummaryRecord = this.readObject(repository.evidenceMapSummary);
    const evidenceDecisionRecord = this.readObject(finalDecision?.evidenceDecision);
    const repositoryId = this.readString(repository.id);
    const priority = this.normalizePriority(
      this.readString(finalDecision?.moneyPriority) ||
        this.readString(this.readObject(repository.cachedRanking)?.moneyPriority),
    );
    const rawConfidence =
      this.readNumber(analysis?.confidence) ??
      this.readNumber(repository.analysisConfidence);
    const lastCollectedAt = this.resolveLastCollectedAt(repository);
    const lastAnalyzedAt = this.resolveLastAnalyzedAt(repository);
    const hasSnapshot = Boolean(analysis?.ideaSnapshotJson);
    const hasInsight = Boolean(analysis?.insightJson);
    const hasFinalDecision = Boolean(finalDecision);
    const hasDeep = Boolean(
      analysis?.ideaFitJson &&
        analysis?.extractedIdeaJson &&
        analysis?.completenessJson,
    );
    const isVisibleOnHome = args.exposureSets.homepageIds.has(repositoryId);
    const isVisibleOnFavorites = this.readBoolean(repository.isFavorited);
    const attachedAnalysisState = this.normalizeAttachedAnalysisState(
      analysisStateRecord,
      {
        hasSnapshot,
        hasInsight,
        hasFinalDecision,
        hasDeep,
      },
    );
    const hasDetailPageExposure = Boolean(
      attachedAnalysisState.displayReady ||
        isVisibleOnFavorites ||
        isVisibleOnHome ||
        args.exposureSets.dailySummaryIds.has(repositoryId) ||
        args.exposureSets.telegramIds.has(repositoryId),
    );
    const isUserReachable = Boolean(
      isVisibleOnHome ||
        isVisibleOnFavorites ||
        hasDetailPageExposure ||
        args.exposureSets.dailySummaryIds.has(repositoryId) ||
        args.exposureSets.telegramIds.has(repositoryId),
    );

    return evaluateHistoricalInventoryItem({
      now: args.now,
      thresholds: args.thresholds,
      signal: {
        repoId: repositoryId,
        fullName: this.readString(repository.fullName),
        htmlUrl: this.readString(repository.htmlUrl),
        hasSnapshot,
        hasInsight,
        hasFinalDecision,
        hasDeep,
        hasClaudeReview: Boolean(
          analysis?.claudeReviewJson &&
            this.readString(analysis?.claudeReviewStatus) === 'SUCCESS',
        ),
        fallbackFlag:
          attachedAnalysisState.fallbackVisible ||
          this.readBoolean(analysis?.fallbackUsed) ||
          this.readString(finalDecision?.source) === 'fallback',
        conflictFlag: Boolean(
          this.readBoolean(finalDecision?.hasConflict) ||
            this.readBoolean(finalDecision?.needsRecheck) ||
            this.normalizeEvidenceDimensions(
              evidenceSummaryRecord?.keyConflictDimensions,
            ).length > 0,
        ),
        incompleteFlag: !attachedAnalysisState.fullyAnalyzed,
        missingReasons: attachedAnalysisState.incompleteReasons,
        confidenceScore: rawConfidence,
        lastCollectedAt,
        lastAnalyzedAt,
        isVisibleOnHome,
        isVisibleOnFavorites,
        appearedInDailySummary: args.exposureSets.dailySummaryIds.has(repositoryId),
        appearedInTelegram: args.exposureSets.telegramIds.has(repositoryId),
        hasDetailPageExposure,
        isUserReachable,
        moneyPriority: priority,
        repositoryValueTier: this.deriveRepositoryValueTier({
          moneyPriority: priority,
          cachedMoneyScore: this.readNumber(
            this.readObject(repository.cachedRanking)?.moneyScore,
          ),
          finalScore: this.readNumber(repository.finalScore),
          isFavorited: isVisibleOnFavorites,
        }),
        collectionTier: this.deriveCollectionTier({
          isVisibleOnHome,
          isVisibleOnFavorites,
          favoritePriority: this.readString(this.readObject(repository.favorite)?.priority),
          moneyPriority: priority,
        }),
        analysisStatus: attachedAnalysisState.analysisStatus,
        displayStatus: attachedAnalysisState.displayStatus,
        homepageUnsafe: attachedAnalysisState.unsafe,
        badOneLiner: Boolean(
          this.readString(finalDecision?.oneLinerStrength) === 'WEAK' &&
            this.normalizeEvidenceDimensions(
              evidenceSummaryRecord?.keyMissingDimensions,
            ).length > 0,
        ),
        evidenceCoverageRate:
          this.readNumber(evidenceSummaryRecord?.coverageRate) ?? undefined,
        evidenceWeakCount:
          this.readNumber(evidenceSummaryRecord?.weakCount) ?? undefined,
        evidenceConflictCount:
          this.readNumber(evidenceSummaryRecord?.conflictCount) ?? undefined,
        keyEvidenceMissingCount: this.normalizeEvidenceDimensions(
          evidenceSummaryRecord?.keyMissingDimensions,
        ).length,
        keyEvidenceWeakCount: this.normalizeEvidenceDimensions(
          evidenceSummaryRecord?.keyWeakDimensions,
        ).length,
        keyEvidenceConflictCount: this.normalizeEvidenceDimensions(
          evidenceSummaryRecord?.keyConflictDimensions,
        ).length,
        evidenceMissingDimensions: this.normalizeEvidenceDimensions(
          evidenceSummaryRecord?.missingDimensions,
        ),
        evidenceWeakDimensions: this.normalizeEvidenceDimensions(
          evidenceSummaryRecord?.weakDimensions,
        ),
        evidenceConflictDimensions: this.normalizeEvidenceDimensions(
          evidenceSummaryRecord?.conflictDimensions,
        ),
        evidenceSupportingDimensions: this.normalizeEvidenceDimensions(
          evidenceSummaryRecord?.supportingDimensions,
        ),
        keyEvidenceGaps: normalizeEvidenceGapTaxonomy(
          evidenceSummaryRecord?.keyEvidenceGaps,
        ),
        keyEvidenceGapSeverity:
          normalizeEvidenceGapSeverity(
            this.readOptionalString(evidenceSummaryRecord?.keyEvidenceGapSeverity),
          ),
        conflictDrivenGaps: normalizeEvidenceGapTaxonomy(
          evidenceSummaryRecord?.conflictDrivenGaps,
        ),
        missingDrivenGaps: normalizeEvidenceGapTaxonomy(
          evidenceSummaryRecord?.missingDrivenGaps,
        ),
        weakDrivenGaps: normalizeEvidenceGapTaxonomy(
          evidenceSummaryRecord?.weakDrivenGaps,
        ),
        decisionRecalcGaps: normalizeEvidenceGapTaxonomy(
          evidenceSummaryRecord?.decisionRecalcGaps,
        ),
        deepRepairGaps: normalizeEvidenceGapTaxonomy(
          evidenceSummaryRecord?.deepRepairGaps,
        ),
        evidenceRepairGaps: normalizeEvidenceGapTaxonomy(
          evidenceSummaryRecord?.evidenceRepairGaps,
        ),
        trustedBlockingGaps: normalizeEvidenceGapTaxonomy(
          evidenceSummaryRecord?.trustedBlockingGaps,
        ),
        qualityReasonSummary: this.readOptionalString(
          evidenceSummaryRecord?.keyEvidenceGapSummary ??
            evidenceSummaryRecord?.summaryZh,
        ),
        conflictDrivenDecisionRecalc: Boolean(
          this.readString(evidenceDecisionRecord?.currentAction) ===
            'decision_recalc' &&
            this.normalizeEvidenceDimensions(
              evidenceSummaryRecord?.decisionConflictDimensions,
            ).length > 0
        ),
      },
    });
  }

  private resolveLastCollectedAt(repository: Record<string, unknown>) {
    const contentFetchedAt = this.readOptionalString(
      this.readObject(repository.content)?.fetchedAt,
    );
    const latestSnapshotAt = this.readOptionalString(
      this.readObjectArray(repository.snapshots)[0]?.snapshotAt,
    );
    const updatedAtGithub = this.readOptionalString(repository.updatedAtGithub);
    return this.pickLatestDate([contentFetchedAt, latestSnapshotAt, updatedAtGithub]);
  }

  private resolveLastAnalyzedAt(repository: Record<string, unknown>) {
    const analysis = this.readObject(repository.analysis);
    const cachedRanking = this.readObject(repository.cachedRanking);
    return this.pickLatestDate([
      this.readOptionalString(analysis?.manualUpdatedAt),
      this.readOptionalString(analysis?.claudeReviewReviewedAt),
      this.readOptionalString(analysis?.analyzedAt),
      this.readOptionalString(cachedRanking?.updatedAt),
    ]);
  }

  private pickLatestDate(values: Array<string | null>) {
    const dates = values
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((left, right) => right.getTime() - left.getTime());

    return dates[0]?.toISOString() ?? null;
  }

  private deriveRepositoryValueTier(input: {
    moneyPriority: 'P0' | 'P1' | 'P2' | 'P3' | null;
    cachedMoneyScore: number | null;
    finalScore: number | null;
    isFavorited: boolean;
  }): HistoricalInventoryValueTier {
    if (
      input.moneyPriority === 'P0' ||
      input.moneyPriority === 'P1' ||
      (input.cachedMoneyScore ?? 0) >= 75 ||
      (input.finalScore ?? 0) >= 75
    ) {
      return 'HIGH';
    }

    if (
      input.moneyPriority === 'P2' ||
      (input.cachedMoneyScore ?? 0) >= 50 ||
      (input.finalScore ?? 0) >= 50 ||
      input.isFavorited
    ) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private deriveCollectionTier(input: {
    isVisibleOnHome: boolean;
    isVisibleOnFavorites: boolean;
    favoritePriority: string | null;
    moneyPriority: 'P0' | 'P1' | 'P2' | 'P3' | null;
  }): HistoricalInventoryCollectionTier {
    if (
      input.isVisibleOnHome ||
      input.favoritePriority === 'HIGH' ||
      input.moneyPriority === 'P0'
    ) {
      return 'CORE';
    }

    if (
      input.isVisibleOnFavorites ||
      input.favoritePriority === 'MEDIUM' ||
      input.moneyPriority === 'P1' ||
      input.moneyPriority === 'P2'
    ) {
      return 'WATCH';
    }

    return 'LONG_TAIL';
  }

  private serialize<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_, currentValue) => {
        if (typeof currentValue === 'bigint') {
          return currentValue.toString();
        }
        if (currentValue instanceof Prisma.Decimal) {
          return currentValue.toNumber();
        }
        return currentValue;
      }),
    ) as T;
  }

  private readObject(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readObjectArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as Array<Record<string, unknown>>;
    }

    return value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
  }

  private readString(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value).trim();
  }

  private readOptionalString(value: unknown) {
    const normalized = this.readString(value);
    return normalized || null;
  }

  private readBoolean(value: unknown) {
    return value === true;
  }

  private readOptionalBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }
    return null;
  }

  private readNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const numeric = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(numeric) ? numeric : null;
  }

  private readStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .map((item) => this.readString(item))
      .filter(Boolean);
  }

  private normalizeEvidenceDimensions(value: unknown): EvidenceMapDimension[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is EvidenceMapDimension =>
      item === 'problem' ||
      item === 'user' ||
      item === 'distribution' ||
      item === 'monetization' ||
      item === 'execution' ||
      item === 'market' ||
      item === 'technical_maturity',
    );
  }

  private normalizePriority(value: string | null) {
    if (value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3') {
      return value;
    }
    return null;
  }

  private normalizeAttachedAnalysisState(
    value: Record<string, unknown> | null,
    fallback: {
      hasSnapshot: boolean;
      hasInsight: boolean;
      hasFinalDecision: boolean;
      hasDeep: boolean;
    },
  ) {
    const incompleteReasons = this.readStringArray(value?.incompleteReasons);
    const displayReady =
      this.readBoolean(value?.displayReady) ||
      fallback.hasSnapshot ||
      fallback.hasInsight ||
      fallback.hasFinalDecision;
    const deepReady =
      this.readBoolean(value?.deepReady) || fallback.hasDeep;
    const fullyAnalyzed =
      this.readBoolean(value?.fullyAnalyzed) ||
      (fallback.hasSnapshot &&
        fallback.hasInsight &&
        fallback.hasFinalDecision &&
        fallback.hasDeep &&
        incompleteReasons.length === 0);
    const unsafe =
      this.readBoolean(value?.unsafe) ||
      this.readString(value?.displayStatus) === 'UNSAFE';

    return {
      analysisStatus: this.readString(value?.analysisStatus),
      displayStatus: this.readString(value?.displayStatus),
      displayReady,
      deepReady,
      fullyAnalyzed,
      fallbackVisible: this.readBoolean(value?.fallbackVisible),
      unsafe,
      incompleteReason: this.readString(value?.incompleteReason),
      incompleteReasons,
      trustedDisplayReady: this.readBoolean(value?.trustedDisplayReady),
      frontendDecisionState: this.readString(value?.frontendDecisionState),
    };
  }

  private normalizeFavoritePriority(value: string | null) {
    if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH') {
      return value;
    }
    return null;
  }
}
