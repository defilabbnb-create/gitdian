import { Injectable } from '@nestjs/common';
import { ClaudeAuditService } from '../analysis/claude-audit.service';
import { QueryRepositoriesDto, RepositorySortBy, SortOrder } from './dto/query-repositories.dto';
import { RepositoryService } from './repository.service';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class ExportService {
  constructor(
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

  private readRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as JsonRecord;
  }
}
