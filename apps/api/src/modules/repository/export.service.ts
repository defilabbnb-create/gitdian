import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClaudeAuditService } from '../analysis/claude-audit.service';
import {
  QueryRepositoriesDto,
  RepositoryDeepAnalysisState,
  RepositorySortBy,
  SortOrder,
} from './dto/query-repositories.dto';
import { RepositoryService } from './repository.service';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repositoryService: RepositoryService,
    private readonly claudeAuditService: ClaudeAuditService,
  ) {}

  async exportTopProjects(limit = 50) {
    const pageSize = Math.max(1, Math.min(limit, 100));
    const result = await this.repositoryService.findAll({
      page: 1,
      pageSize,
      sortBy: RepositorySortBy.MONEY_PRIORITY,
      order: SortOrder.DESC,
    } as QueryRepositoriesDto);

    return result.items.map((repository) => {
      const record = repository as JsonRecord;
      const finalDecision = this.readRecord(record.finalDecision);
      const moneyDecision = this.readRecord(finalDecision?.moneyDecision);

      return {
        repoId: String(record.id ?? ''),
        repo: String(record.fullName ?? ''),
        repoUrl: String(record.htmlUrl ?? ''),
        oneLiner: String(finalDecision?.oneLinerZh ?? record.description ?? record.fullName ?? ''),
        verdict: String(finalDecision?.verdict ?? ''),
        action: String(finalDecision?.action ?? ''),
        category: String(finalDecision?.categoryLabelZh ?? finalDecision?.category ?? ''),
        moneyPriority: String(finalDecision?.moneyPriority ?? ''),
        moneyPriorityLabelZh: String(finalDecision?.moneyPriorityLabelZh ?? ''),
        source: String(finalDecision?.source ?? ''),
        reasonZh: String(finalDecision?.reasonZh ?? ''),
        recommendedMoveZh: String(moneyDecision?.recommendedMoveZh ?? ''),
      };
    });
  }

  async exportTrainingData(sampleSize = 120) {
    const pageSize = Math.max(20, Math.min(sampleSize, 100));
    const result = await this.repositoryService.findAll({
      page: 1,
      pageSize,
      sortBy: RepositorySortBy.MONEY_PRIORITY,
      order: SortOrder.DESC,
    } as QueryRepositoriesDto);

    const rows = result.items
      .map((repository) => {
        const record = repository as JsonRecord;
        const finalDecision = this.readRecord(record.finalDecision);
        const trainingAsset = this.readRecord(record.trainingAsset);
        const analysis = this.readRecord(record.analysis);
        const snapshot = this.readRecord(analysis?.ideaSnapshotJson);
        const insight = this.readRecord(analysis?.insightJson);
        const claudeReview = this.readRecord(analysis?.claudeReviewJson);

        if (!finalDecision) {
          return null;
        }

        return {
          repoId: String(record.id ?? ''),
          repoFullName: String(record.fullName ?? ''),
          input: {
            repoFullName: String(record.fullName ?? ''),
            description: String(record.description ?? ''),
            topics: Array.isArray(record.topics) ? record.topics : [],
            stars:
              typeof record.stars === 'number'
                ? record.stars
                : Number(record.stars ?? 0) || 0,
            snapshot,
            localInsight: insight,
          },
          output: {
            finalDecision,
            claudeDecision: claudeReview,
          },
          mistakes: Array.isArray(trainingAsset?.mistakeTypes)
            ? trainingAsset.mistakeTypes
            : [],
          suggestions: Array.isArray(trainingAsset?.suggestions)
            ? trainingAsset.suggestions
            : [],
          shouldTrain: Boolean(trainingAsset?.shouldTrain),
        };
      })
      .filter((row) => row && (row.shouldTrain || row.mistakes.length > 0));

    return rows
      .map((row) => JSON.stringify(row))
      .join('\n');
  }

  async exportAuditReport() {
    const latestAudit = await this.claudeAuditService.getLatestAudit();

    return {
      generatedAt: new Date().toISOString(),
      latestAudit,
    };
  }

  async exportProjectBriefCsv() {
    const lines = ['一句话,仓库地址,完整度等级,完整度分数'];
    let cursorId: string | undefined;
    const pageSize = 5000;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.prisma.repository.findMany({
        take: pageSize,
        ...(cursorId
          ? {
              skip: 1,
              cursor: {
                id: cursorId,
              },
            }
          : {}),
        orderBy: {
          id: 'asc',
        },
        select: {
          id: true,
          fullName: true,
          description: true,
          htmlUrl: true,
          completenessLevel: true,
          completenessScore: true,
          analysis: {
            select: {
              insightJson: true,
              ideaSnapshotJson: true,
              completenessJson: true,
            },
          },
        },
      });

      if (!batch.length) {
        hasMore = false;
        continue;
      }

      for (const repository of batch) {
        const insight = this.readRecord(repository.analysis?.insightJson);
        const snapshot = this.readRecord(repository.analysis?.ideaSnapshotJson);
        const completeness = this.readRecord(repository.analysis?.completenessJson);
        const oneLiner =
          this.cleanText(insight?.oneLinerZh) ||
          this.cleanText(snapshot?.oneLinerZh) ||
          this.cleanText(repository.description) ||
          repository.fullName;
        const completenessLevel =
          this.cleanText(completeness?.completenessLevel) ||
          repository.completenessLevel ||
          '';
        const completenessScore =
          this.toNullableNumber(completeness?.completenessScore) ??
          repository.completenessScore ??
          '';

        lines.push(
          [
            oneLiner,
            repository.htmlUrl,
            completenessLevel,
            completenessScore,
          ]
            .map((value) => this.escapeCsvValue(value))
            .join(','),
        );
      }

      cursorId = batch[batch.length - 1]?.id;
    }

    return lines.join('\n');
  }

  async exportColdToolsCsv(deepAnalysisState?: RepositoryDeepAnalysisState) {
    const lines = [
      [
        '分析ID',
        '仓库ID',
        '项目名',
        '仓库全名',
        '一句话总结',
        '是否入冷门池',
        '真实用户工具',
        '真实活跃用户段',
        '潜在人群段',
        '目标用户',
        '使用场景',
        '是否有付费意图',
        '付费方',
        '付费意愿',
        '语言',
        'Stars',
        '分类主类',
        '分类子类',
        '仓库地址',
        '采集来源数',
        '最近评估时间',
      ].join(','),
    ];
    const where = await this.buildColdToolExportWhere(deepAnalysisState);
    const repositories = await this.prisma.repository.findMany({
      where,
      select: {
        id: true,
        name: true,
        fullName: true,
        description: true,
        htmlUrl: true,
        language: true,
        stars: true,
        analysis: {
          select: {
            id: true,
            ideaSnapshotJson: true,
            insightJson: true,
            analysisJson: true,
            completenessJson: true,
            ideaFitJson: true,
            extractedIdeaJson: true,
          },
        },
      },
    });
    const sortedRepositories = repositories.sort((left, right) => {
      const leftAnalysisId = left.analysis?.id ?? '';
      const rightAnalysisId = right.analysis?.id ?? '';

      if (leftAnalysisId === rightAnalysisId) {
        return left.id.localeCompare(right.id);
      }

      return leftAnalysisId.localeCompare(rightAnalysisId);
    });

    for (const repository of sortedRepositories) {
        const analysisJson = this.readRecord(repository.analysis?.analysisJson);
        const coldToolPool = this.readRecord(analysisJson?.coldToolPool);
        const snapshot = this.readRecord(repository.analysis?.ideaSnapshotJson);
        const insight = this.readRecord(repository.analysis?.insightJson);
        const oneLiner =
          this.cleanText(coldToolPool?.summaryZh) ||
          this.cleanText(insight?.oneLinerZh) ||
          this.cleanText(snapshot?.oneLinerZh) ||
          this.cleanText(repository.description) ||
          repository.fullName;
        const category = this.readRecord(snapshot?.category);

        lines.push(
          [
            repository.analysis?.id ?? '',
            repository.id,
            repository.name,
            repository.fullName,
            oneLiner,
            this.toYesNo(coldToolPool?.fitsColdToolPool),
            this.toYesNo(coldToolPool?.isRealUserTool),
            this.cleanText(coldToolPool?.globalActiveUsersBandZh),
            this.cleanText(coldToolPool?.globalPotentialUsersBandZh),
            this.cleanText(coldToolPool?.targetUsersZh),
            this.cleanText(coldToolPool?.useCaseZh),
            this.toYesNo(coldToolPool?.hasPayingIntent),
            this.cleanText(coldToolPool?.buyerTypeZh),
            this.cleanText(coldToolPool?.willingnessToPayLabelZh),
            repository.language ?? '',
            repository.stars ?? '',
            this.cleanText(category?.main),
            this.cleanText(category?.sub),
            repository.htmlUrl,
            this.toNullableNumber(coldToolPool?.originCount) ?? '',
            this.cleanText(coldToolPool?.evaluatedAt),
          ]
            .map((value) => this.escapeCsvValue(value))
            .join(','),
        );
    }

    return lines.join('\n');
  }

  private async buildColdToolExportWhere(
    deepAnalysisState?: RepositoryDeepAnalysisState,
  ): Promise<Prisma.RepositoryWhereInput> {
    const baseWhere: Prisma.RepositoryWhereInput = {
      analysis: {
        is: {
          tags: {
            has: 'cold_tool_evaluated',
          },
        },
      },
    };

    const deepCompletedWhere: Prisma.RepositoryWhereInput = {
      analysis: {
        is: {
          tags: {
            has: 'cold_tool_evaluated',
          },
          completenessJson: {
            not: Prisma.DbNull,
          },
          ideaFitJson: {
            not: Prisma.DbNull,
          },
          extractedIdeaJson: {
            not: Prisma.DbNull,
          },
          insightJson: {
            not: Prisma.DbNull,
          },
        },
      },
    };

    if (deepAnalysisState === RepositoryDeepAnalysisState.COMPLETED) {
      return deepCompletedWhere;
    }

    if (deepAnalysisState === RepositoryDeepAnalysisState.PENDING) {
      const queuedRepositoryIds =
        await this.repositoryService.findQueuedColdToolRepositoryIds();
      return {
        AND: [
          baseWhere,
          {
            NOT: deepCompletedWhere,
          },
          {
            NOT: {
              OR: [
                {
                  analysis: {
                    is: {
                      ideaSnapshotJson: {
                        path: ['isPromising'],
                        equals: false,
                      },
                    },
                  },
                },
                {
                  analysis: {
                    is: {
                      ideaSnapshotJson: {
                        path: ['nextAction'],
                        equals: 'SKIP',
                      },
                    },
                  },
                },
                {
                  analysis: {
                    is: {
                      insightJson: {
                        path: ['oneLinerStrength'],
                        equals: 'WEAK',
                      },
                    },
                  },
                },
              ],
            },
          },
          ...(queuedRepositoryIds.length
            ? [
                {
                  id: {
                    notIn: queuedRepositoryIds,
                  },
                } satisfies Prisma.RepositoryWhereInput,
              ]
            : []),
        ],
      };
    }

    return baseWhere;
  }

  private readRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as JsonRecord;
  }

  private cleanText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private toNullableNumber(value: unknown) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private toYesNo(value: unknown) {
    if (value === true) {
      return '是';
    }
    if (value === false) {
      return '否';
    }

    return '';
  }

  private escapeCsvValue(value: unknown) {
    const normalized =
      value === null || typeof value === 'undefined' ? '' : String(value);

    return `"${normalized.replace(/"/g, '""')}"`;
  }
}
