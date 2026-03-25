import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type ReviewDiffVerdict = 'GOOD' | 'OK' | 'BAD';
type ReviewDiffAction = 'BUILD' | 'CLONE' | 'IGNORE';
type ReviewDiffProjectType = 'product' | 'tool' | 'model' | 'infra' | 'demo';
type ReviewDiffFinalSource =
  | 'manual_override'
  | 'claude_review'
  | 'local_fallback'
  | 'insight';
type ReviewDiffGeneratedBy = 'claude' | 'local_fallback';
type ReviewDiffPriority = 'P0' | 'P1' | 'P2' | 'P3';

type ReviewDiffRepositoryInput = {
  id: string;
  fullName: string;
  analysis?: {
    manualVerdict?: string | null;
    manualAction?: string | null;
  } | null;
};

type ReviewDiffLocalInsightInput = {
  oneLinerZh: string;
  verdict: ReviewDiffVerdict;
  action: ReviewDiffAction;
  projectType: ReviewDiffProjectType;
  confidence: number;
  anchorMatch: 'GOOD' | 'CLONE' | 'BAD';
};

type ReviewDiffReviewInput = {
  oneLinerZh: string;
  verdict: ReviewDiffVerdict;
  action: ReviewDiffAction;
  projectType: ReviewDiffProjectType;
  generatedBy: ReviewDiffGeneratedBy;
  priority: ReviewDiffPriority;
  reviewedAt: string;
};

export type ClaudeReviewDiffType =
  | 'local_good_claude_ok'
  | 'local_ignore_claude_clone'
  | 'one_liner_drift'
  | 'category_mismatch'
  | 'product_vs_model_mismatch';

export type ClaudeReviewDiffRecord = {
  localInsight: {
    verdict: ReviewDiffVerdict;
    action: ReviewDiffAction;
    oneLinerZh: string;
    projectType: ReviewDiffProjectType;
    confidence: number;
    anchorMatch: 'GOOD' | 'CLONE' | 'BAD';
  };
  claudeReview: {
    verdict: ReviewDiffVerdict;
    action: ReviewDiffAction;
    oneLinerZh: string;
    projectType: ReviewDiffProjectType;
    generatedBy: ReviewDiffGeneratedBy;
    priority: ReviewDiffPriority;
  };
  finalDecision: {
    verdict: ReviewDiffVerdict;
    action: ReviewDiffAction;
    source: ReviewDiffFinalSource;
  };
  diffTypes: ClaudeReviewDiffType[];
  reviewedAt: string;
};

export type ClaudeReviewDiffSummary = {
  generatedAt: string;
  sampleSize: number;
  reviewedCount: number;
  diffTypeCounts: Partial<Record<ClaudeReviewDiffType, number>>;
  topDiffTypes: Array<{
    type: ClaudeReviewDiffType;
    count: number;
    repositoryIds: string[];
    exampleFullNames: string[];
  }>;
  repositoriesWithLargestDiffs: Array<{
    repositoryId: string;
    fullName: string;
    diffTypes: ClaudeReviewDiffType[];
    generatedBy: ReviewDiffGeneratedBy;
    reviewedAt: string | null;
  }>;
};

@Injectable()
export class ClaudeReviewDiffService {
  constructor(private readonly prisma: PrismaService) {}

  buildReviewDiff(input: {
    repository: ReviewDiffRepositoryInput;
    localInsight: ReviewDiffLocalInsightInput;
    review: ReviewDiffReviewInput;
  }): ClaudeReviewDiffRecord {
    const finalDecision = this.resolveFinalDecision(
      input.repository,
      input.localInsight,
      input.review,
    );

    return {
      localInsight: {
        verdict: input.localInsight.verdict,
        action: input.localInsight.action,
        oneLinerZh: this.cleanText(input.localInsight.oneLinerZh, 160),
        projectType: input.localInsight.projectType,
        confidence: this.normalizeConfidence(input.localInsight.confidence),
        anchorMatch: input.localInsight.anchorMatch,
      },
      claudeReview: {
        verdict: input.review.verdict,
        action: input.review.action,
        oneLinerZh: this.cleanText(input.review.oneLinerZh, 160),
        projectType: input.review.projectType,
        generatedBy: input.review.generatedBy,
        priority: input.review.priority,
      },
      finalDecision,
      diffTypes: this.detectDiffTypes(input.localInsight, input.review),
      reviewedAt: this.cleanText(input.review.reviewedAt, 40) || new Date().toISOString(),
    };
  }

  async summarizeRecentDiffs(sampleSize = 120): Promise<ClaudeReviewDiffSummary> {
    const normalizedSampleSize = Math.max(20, Math.min(sampleSize, 200));
    const analyses = await this.prisma.repositoryAnalysis.findMany({
      where: {
        claudeReviewStatus: 'SUCCESS',
        claudeReviewReviewedAt: {
          not: null,
        },
      },
      select: {
        repositoryId: true,
        claudeReviewReviewedAt: true,
        claudeReviewJson: true,
        repository: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: {
        claudeReviewReviewedAt: 'desc',
      },
      take: Math.min(normalizedSampleSize * 3, 400),
    });

    const records = analyses
      .map((analysis) => this.readStoredDiff(analysis))
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, normalizedSampleSize);
    const diffTypeCounts: Partial<Record<ClaudeReviewDiffType, number>> = {};

    for (const record of records) {
      for (const diffType of record.diff.diffTypes) {
        diffTypeCounts[diffType] = (diffTypeCounts[diffType] ?? 0) + 1;
      }
    }

    const topDiffTypes = (Object.entries(diffTypeCounts) as Array<
      [ClaudeReviewDiffType, number]
    >)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([type, count]) => ({
        type,
        count,
        repositoryIds: this.takeUnique(
          records
            .filter((record) => record.diff.diffTypes.includes(type))
            .map((record) => record.repositoryId),
          6,
        ),
        exampleFullNames: this.takeUnique(
          records
            .filter((record) => record.diff.diffTypes.includes(type))
            .map((record) => record.fullName),
          4,
        ),
      }));

    return {
      generatedAt: new Date().toISOString(),
      sampleSize: normalizedSampleSize,
      reviewedCount: records.length,
      diffTypeCounts,
      topDiffTypes,
      repositoriesWithLargestDiffs: records
        .filter((record) => record.diff.diffTypes.length > 0)
        .sort((left, right) => {
          const diffDelta =
            right.diff.diffTypes.length - left.diff.diffTypes.length;
          if (diffDelta !== 0) {
            return diffDelta;
          }

          return (
            this.toTimestamp(right.diff.reviewedAt) -
            this.toTimestamp(left.diff.reviewedAt)
          );
        })
        .slice(0, 12)
        .map((record) => ({
          repositoryId: record.repositoryId,
          fullName: record.fullName,
          diffTypes: record.diff.diffTypes,
          generatedBy: record.diff.claudeReview.generatedBy,
          reviewedAt: record.diff.reviewedAt,
        })),
    };
  }

  private readStoredDiff(analysis: {
    repositoryId: string;
    claudeReviewReviewedAt: Date | null;
    claudeReviewJson: Prisma.JsonValue | null;
    repository: {
      fullName: string;
    };
  }) {
    const review = this.readJsonObject(analysis.claudeReviewJson);
    const diff = this.normalizeStoredDiff(review?.reviewDiff);
    if (!diff) {
      return null;
    }

    return {
      repositoryId: analysis.repositoryId,
      fullName: analysis.repository.fullName,
      reviewedAt: analysis.claudeReviewReviewedAt?.toISOString() ?? null,
      diff,
    };
  }

  private normalizeStoredDiff(
    value: unknown,
  ): ClaudeReviewDiffRecord | null {
    const record = this.readJsonObject(value);
    if (!record) {
      return null;
    }

    const localInsight = this.readJsonObject(record.localInsight);
    const claudeReview = this.readJsonObject(record.claudeReview);
    const finalDecision = this.readJsonObject(record.finalDecision);
    if (!localInsight || !claudeReview || !finalDecision) {
      return null;
    }

    return {
      localInsight: {
        verdict: this.normalizeVerdict(localInsight.verdict) ?? 'OK',
        action: this.normalizeAction(localInsight.action) ?? 'CLONE',
        oneLinerZh: this.cleanText(localInsight.oneLinerZh, 160),
        projectType: this.normalizeProjectType(localInsight.projectType),
        confidence: this.normalizeConfidence(localInsight.confidence),
        anchorMatch: this.normalizeAnchorMatch(localInsight.anchorMatch),
      },
      claudeReview: {
        verdict: this.normalizeVerdict(claudeReview.verdict) ?? 'OK',
        action: this.normalizeAction(claudeReview.action) ?? 'CLONE',
        oneLinerZh: this.cleanText(claudeReview.oneLinerZh, 160),
        projectType: this.normalizeProjectType(claudeReview.projectType),
        generatedBy: this.normalizeGeneratedBy(claudeReview.generatedBy),
        priority: this.normalizePriority(claudeReview.priority),
      },
      finalDecision: {
        verdict: this.normalizeVerdict(finalDecision.verdict) ?? 'OK',
        action: this.normalizeAction(finalDecision.action) ?? 'CLONE',
        source: this.normalizeFinalSource(finalDecision.source),
      },
      diffTypes: this.normalizeDiffTypes(record.diffTypes),
      reviewedAt: this.cleanText(record.reviewedAt, 40) || new Date().toISOString(),
    };
  }

  private resolveFinalDecision(
    repository: ReviewDiffRepositoryInput,
    localInsight: ReviewDiffLocalInsightInput,
    review: ReviewDiffReviewInput,
  ): ClaudeReviewDiffRecord['finalDecision'] {
    const manualVerdict = this.normalizeVerdict(
      repository.analysis?.manualVerdict,
    );
    const manualAction = this.normalizeAction(repository.analysis?.manualAction);
    if (manualVerdict || manualAction) {
      return {
        verdict: manualVerdict ?? review.verdict ?? localInsight.verdict,
        action: manualAction ?? review.action ?? localInsight.action,
        source: 'manual_override',
      };
    }

    return {
      verdict: review.verdict ?? localInsight.verdict,
      action: review.action ?? localInsight.action,
      source:
        review.generatedBy === 'local_fallback'
          ? 'local_fallback'
          : 'claude_review',
    };
  }

  private detectDiffTypes(
    localInsight: ReviewDiffLocalInsightInput,
    review: ReviewDiffReviewInput,
  ) {
    const diffTypes = new Set<ClaudeReviewDiffType>();

    if (localInsight.verdict === 'GOOD' && review.verdict === 'OK') {
      diffTypes.add('local_good_claude_ok');
    }

    if (
      (localInsight.action === 'IGNORE' || localInsight.verdict === 'BAD') &&
      review.action === 'CLONE'
    ) {
      diffTypes.add('local_ignore_claude_clone');
    }

    if (this.hasMeaningfulOneLinerDrift(localInsight.oneLinerZh, review.oneLinerZh)) {
      diffTypes.add('one_liner_drift');
    }

    if (localInsight.projectType !== review.projectType) {
      diffTypes.add('category_mismatch');
    }

    if (this.isProductVsModelMismatch(localInsight.projectType, review.projectType)) {
      diffTypes.add('product_vs_model_mismatch');
    }

    return Array.from(diffTypes);
  }

  private hasMeaningfulOneLinerDrift(localOneLiner: string, reviewOneLiner: string) {
    const normalizedLocal = this.normalizeOneLiner(localOneLiner);
    const normalizedReview = this.normalizeOneLiner(reviewOneLiner);
    if (!normalizedLocal || !normalizedReview || normalizedLocal === normalizedReview) {
      return false;
    }

    if (
      this.isGenericOneLiner(normalizedLocal) !==
      this.isGenericOneLiner(normalizedReview)
    ) {
      return true;
    }

    const localNgrams = this.toNgrams(normalizedLocal);
    const reviewNgrams = this.toNgrams(normalizedReview);
    if (!localNgrams.size || !reviewNgrams.size) {
      return false;
    }

    const overlap = Array.from(localNgrams).filter((token) =>
      reviewNgrams.has(token),
    ).length;
    const overlapRatio = overlap / Math.max(localNgrams.size, reviewNgrams.size);
    return overlapRatio < 0.42;
  }

  private isProductVsModelMismatch(
    localProjectType: ReviewDiffProjectType,
    reviewProjectType: ReviewDiffProjectType,
  ) {
    const productLike = new Set<ReviewDiffProjectType>(['product', 'tool']);
    const capabilityLike = new Set<ReviewDiffProjectType>(['model', 'infra', 'demo']);

    return (
      (productLike.has(localProjectType) && capabilityLike.has(reviewProjectType)) ||
      (capabilityLike.has(localProjectType) && productLike.has(reviewProjectType))
    );
  }

  private normalizeOneLiner(value: string) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[。！？!?,，]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private toNgrams(value: string) {
    const compact = value.replace(/\s+/g, '');
    if (!compact) {
      return new Set<string>();
    }

    if (compact.length <= 4) {
      return new Set([compact]);
    }

    const grams = new Set<string>();
    for (let index = 0; index <= compact.length - 3; index += 1) {
      grams.add(compact.slice(index, index + 3));
    }
    return grams;
  }

  private isGenericOneLiner(value: string) {
    const genericPhrases = [
      '一个工具',
      '一个项目',
      '工具项目',
      '开源工具',
      '提效工具',
      '效率工具',
      '帮助用户提效',
    ];

    return (
      value.length < 10 ||
      genericPhrases.some(
        (phrase) => value === phrase || value.includes(`${phrase} `),
      )
    );
  }

  private normalizeDiffTypes(value: unknown) {
    return this.normalizeStringArray(value).filter(
      (item): item is ClaudeReviewDiffType =>
        item === 'local_good_claude_ok' ||
        item === 'local_ignore_claude_clone' ||
        item === 'one_liner_drift' ||
        item === 'category_mismatch' ||
        item === 'product_vs_model_mismatch',
    );
  }

  private normalizeVerdict(value: unknown): ReviewDiffVerdict | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'GOOD' || normalized === 'OK' || normalized === 'BAD') {
      return normalized;
    }

    return null;
  }

  private normalizeAction(value: unknown): ReviewDiffAction | null {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'BUILD' || normalized === 'CLONE' || normalized === 'IGNORE') {
      return normalized;
    }

    return null;
  }

  private normalizeProjectType(value: unknown): ReviewDiffProjectType {
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

  private normalizeAnchorMatch(value: unknown): 'GOOD' | 'CLONE' | 'BAD' {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'GOOD' || normalized === 'BAD') {
      return normalized;
    }

    return 'CLONE';
  }

  private normalizeGeneratedBy(value: unknown): ReviewDiffGeneratedBy {
    return String(value ?? '').trim() === 'local_fallback'
      ? 'local_fallback'
      : 'claude';
  }

  private normalizePriority(value: unknown): ReviewDiffPriority {
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

  private normalizeFinalSource(value: unknown): ReviewDiffFinalSource {
    const normalized = String(value ?? '').trim();
    if (
      normalized === 'manual_override' ||
      normalized === 'claude_review' ||
      normalized === 'local_fallback' ||
      normalized === 'insight'
    ) {
      return normalized;
    }

    return 'claude_review';
  }

  private normalizeConfidence(value: unknown) {
    const parsed = this.toNumber(value);
    if (parsed == null) {
      return 0.5;
    }

    return Math.max(0, Math.min(1, Number(parsed.toFixed(3))));
  }

  private readJsonObject(value: unknown) {
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

  private takeUnique(values: string[], limit: number) {
    return Array.from(new Set(values.filter((item) => Boolean(item)))).slice(0, limit);
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

  private toNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toTimestamp(value: string | null | undefined) {
    if (!value) {
      return 0;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
