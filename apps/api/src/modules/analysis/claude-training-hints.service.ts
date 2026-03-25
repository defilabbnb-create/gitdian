import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ClaudeReviewDiffService,
  ClaudeReviewDiffSummary,
} from './claude-review-diff.service';

const CLAUDE_TRAINING_HINTS_LATEST_CONFIG_KEY = 'claude.training_hints.latest';

type CountedValue = {
  value: string;
  count: number;
};

export type ClaudeTrainingHintsAggregate = {
  generatedAt: string;
  reason: string | null;
  sampleSize: number;
  reviewedCount: number;
  shouldUpdateLocalHeuristicsRate: number;
  localModelMistakeCounts: Array<{
    mistake: string;
    count: number;
  }>;
  ruleSuggestions: CountedValue[];
  promptSuggestions: CountedValue[];
  anchorSuggestions: CountedValue[];
  diffSummary: ClaudeReviewDiffSummary | null;
  localModelOptimizationSuggestions: string[];
  repositoriesToInspect: Array<{
    repositoryId: string;
    fullName: string;
    generatedBy: string;
    diffTypes: string[];
    mistakes: string[];
    reviewedAt: string | null;
  }>;
};

@Injectable()
export class ClaudeTrainingHintsService {
  private readonly logger = new Logger(ClaudeTrainingHintsService.name);
  private refreshInFlight: Promise<ClaudeTrainingHintsAggregate> | null = null;
  private lastRefreshStartedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly claudeReviewDiffService: ClaudeReviewDiffService,
  ) {}

  async getLatestAggregate() {
    const row = await this.prisma.systemConfig.findUnique({
      where: {
        configKey: CLAUDE_TRAINING_HINTS_LATEST_CONFIG_KEY,
      },
      select: {
        configValue: true,
      },
    });

    if (!row?.configValue || typeof row.configValue !== 'object' || Array.isArray(row.configValue)) {
      return null;
    }

    return row.configValue as unknown as ClaudeTrainingHintsAggregate;
  }

  async getLatestAggregateBrief() {
    const latest = await this.getLatestAggregate();
    if (!latest) {
      return null;
    }

    return {
      generatedAt: latest.generatedAt,
      reviewedCount: latest.reviewedCount,
      topMistakes: latest.localModelMistakeCounts.slice(0, 3),
      topDiffTypes: latest.diffSummary?.topDiffTypes.slice(0, 3) ?? [],
      topSuggestions: latest.localModelOptimizationSuggestions.slice(0, 3),
    };
  }

  scheduleRefresh(reason = 'review_updated') {
    const minIntervalMs = this.readInt(
      'CLAUDE_TRAINING_HINTS_MIN_REFRESH_INTERVAL_MS',
      5 * 60 * 1_000,
    );

    if (Date.now() - this.lastRefreshStartedAt < minIntervalMs || this.refreshInFlight) {
      return;
    }

    void this.refreshLatestAggregate({
      reason,
    }).catch((error) => {
      this.logger.warn(
        `claude_training_hints refresh skipped reason=${reason} error=${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    });
  }

  async refreshLatestAggregate(options?: {
    sampleSize?: number;
    reason?: string;
    force?: boolean;
  }): Promise<ClaudeTrainingHintsAggregate> {
    if (this.refreshInFlight && !options?.force) {
      return this.refreshInFlight;
    }

    this.lastRefreshStartedAt = Date.now();
    const task = this.buildAggregate(options)
      .then(async (aggregate) => {
        await this.prisma.systemConfig.upsert({
          where: {
            configKey: CLAUDE_TRAINING_HINTS_LATEST_CONFIG_KEY,
          },
          update: {
            configValue: aggregate as unknown as Prisma.InputJsonValue,
          },
          create: {
            configKey: CLAUDE_TRAINING_HINTS_LATEST_CONFIG_KEY,
            configValue: aggregate as unknown as Prisma.InputJsonValue,
          },
        });

        return aggregate;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    this.refreshInFlight = task;
    return task;
  }

  private async buildAggregate(options?: {
    sampleSize?: number;
    reason?: string;
  }): Promise<ClaudeTrainingHintsAggregate> {
    const sampleSize = Math.max(
      20,
      Math.min(options?.sampleSize ?? this.readInt('CLAUDE_TRAINING_HINTS_SAMPLE_SIZE', 120), 200),
    );
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
      take: Math.min(sampleSize * 3, 400),
    });

    const records = analyses
      .map((analysis) => this.toReviewTrainingRecord(analysis))
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, sampleSize);
    const reviewedCount = records.length;
    const heuristicUpdateCount = records.filter((item) => item.shouldUpdateLocalHeuristics)
      .length;
    const diffSummary = reviewedCount
      ? await this.claudeReviewDiffService.summarizeRecentDiffs(sampleSize)
      : null;
    const localModelMistakeCounts = this.countStrings(
      records.flatMap((item) => item.localModelMistakes),
    ).map((item) => ({
      mistake: item.value,
      count: item.count,
    }));

    return {
      generatedAt: new Date().toISOString(),
      reason: this.cleanNullableText(options?.reason, 60),
      sampleSize,
      reviewedCount,
      shouldUpdateLocalHeuristicsRate: reviewedCount
        ? Number((heuristicUpdateCount / reviewedCount).toFixed(3))
        : 0,
      localModelMistakeCounts,
      ruleSuggestions: this.countStrings(records.flatMap((item) => item.ruleSuggestions)),
      promptSuggestions: this.countStrings(records.flatMap((item) => item.promptSuggestions)),
      anchorSuggestions: this.countStrings(records.flatMap((item) => item.anchorSuggestions)),
      diffSummary,
      localModelOptimizationSuggestions: this.buildOptimizationSuggestions(
        localModelMistakeCounts,
        diffSummary,
      ),
      repositoriesToInspect: records
        .sort((left, right) => {
          const scoreDelta =
            right.localModelMistakes.length +
            right.diffTypes.length -
            (left.localModelMistakes.length + left.diffTypes.length);
          if (scoreDelta !== 0) {
            return scoreDelta;
          }

          return this.toTimestamp(right.reviewedAt) - this.toTimestamp(left.reviewedAt);
        })
        .slice(0, 12)
        .map((item) => ({
          repositoryId: item.repositoryId,
          fullName: item.fullName,
          generatedBy: item.generatedBy,
          diffTypes: item.diffTypes,
          mistakes: item.localModelMistakes,
          reviewedAt: item.reviewedAt,
        })),
    };
  }

  private toReviewTrainingRecord(analysis: {
    repositoryId: string;
    claudeReviewReviewedAt: Date | null;
    claudeReviewJson: Prisma.JsonValue | null;
    repository: {
      fullName: string;
    };
  }) {
    const review = this.readJsonObject(analysis.claudeReviewJson);
    if (!review) {
      return null;
    }

    const trainingHints = this.readJsonObject(review.trainingHints);
    const reviewDiff = this.readJsonObject(review.reviewDiff);

    return {
      repositoryId: analysis.repositoryId,
      fullName: analysis.repository.fullName,
      reviewedAt: analysis.claudeReviewReviewedAt?.toISOString() ?? null,
      generatedBy: this.cleanText(review.generatedBy, 40) || 'claude',
      localModelMistakes: this.normalizeStringArray(
        trainingHints?.localModelMistakes,
      ).slice(0, 8),
      ruleSuggestions: this.normalizeStringArray(trainingHints?.ruleSuggestions).slice(
        0,
        8,
      ),
      promptSuggestions: this.normalizeStringArray(
        trainingHints?.promptSuggestions,
      ).slice(0, 8),
      anchorSuggestions: this.normalizeStringArray(
        trainingHints?.anchorSuggestions,
      ).slice(0, 8),
      shouldUpdateLocalHeuristics: Boolean(
        trainingHints?.shouldUpdateLocalHeuristics,
      ),
      diffTypes: this.normalizeStringArray(reviewDiff?.diffTypes).slice(0, 8),
    };
  }

  private buildOptimizationSuggestions(
    mistakeCounts: Array<{
      mistake: string;
      count: number;
    }>,
    diffSummary: ClaudeReviewDiffSummary | null,
  ) {
    const diffTypeCounts = diffSummary?.diffTypeCounts ?? {};
    const suggestions = new Set<string>();
    const topMistakes = new Set(mistakeCounts.slice(0, 6).map((item) => item.mistake));

    if (topMistakes.has('one_liner_drift')) {
      suggestions.add(
        '强化 one-liner grounding：要求目标用户、具体动作和仓库真实对象三者同时出现，避免泛化描述。',
      );
    }

    if (
      topMistakes.has('tool_as_framework') ||
      (diffTypeCounts.category_mismatch ?? 0) >= 3
    ) {
      suggestions.add(
        '补 developer tool vs framework 的边界规则与 anchors，尤其是 CLI、MCP、workflow 工具和 capability layer 的区分。',
      );
    }

    if (topMistakes.has('too_strict_on_early_monetization')) {
      suggestions.add(
        '放宽早期工具项目的商业化判断，不再把已验证收费闭环当成 GOOD 的必要条件。',
      );
    }

    if (
      topMistakes.has('model_or_infra_leakage') ||
      (diffTypeCounts.product_vs_model_mismatch ?? 0) >= 3
    ) {
      suggestions.add(
        '加强 product/tool 与 model/infra/demo 的边界识别，补更多正反 anchors 防止能力层漏网或误伤。',
      );
    }

    if (topMistakes.has('template_detection_missed')) {
      suggestions.add(
        '加强 starter/template/demo 检测，把 scaffold、boilerplate、reference implementation 语义前置到判断链前面。',
      );
    }

    if ((diffTypeCounts.local_good_claude_ok ?? 0) >= 3) {
      suggestions.add(
        '收紧模糊 GOOD：当用户、场景或产品边界不够清楚时，不要因为技术亮点提前拔高到 GOOD。',
      );
    }

    if ((diffTypeCounts.local_ignore_claude_clone ?? 0) >= 2) {
      suggestions.add(
        '避免把“还不值得做，但值得借鉴”的项目直接打成 IGNORE，给 CLONE 留出更多中间层空间。',
      );
    }

    if (!suggestions.size) {
      suggestions.add('当前本地模型误差分布比较分散，建议继续累积更多 review diff 后再做规则收敛。');
    }

    return Array.from(suggestions).slice(0, 8);
  }

  private countStrings(values: string[]) {
    const counts = new Map<string, number>();

    for (const value of values.map((item) => item.trim()).filter((item) => Boolean(item))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value: this.cleanText(value, 220),
        count,
      }))
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
      .slice(0, 12);
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

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }

    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength - 1)}…`
      : normalized;
  }

  private cleanNullableText(value: unknown, maxLength: number) {
    const normalized = this.cleanText(value, maxLength);
    return normalized || null;
  }

  private readInt(envName: string, fallback: number) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  }

  private toTimestamp(value: string | null | undefined) {
    if (!value) {
      return 0;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
