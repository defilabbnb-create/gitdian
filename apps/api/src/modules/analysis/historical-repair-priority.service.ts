import { Injectable } from '@nestjs/common';
import {
  buildHistoricalRepairPriorityReport,
  defaultHistoricalRepairPriorityThresholds,
  evaluateHistoricalRepairPriority,
  type HistoricalRepairPriorityItem,
  type HistoricalRepairPriorityReport,
  type HistoricalRepairPriorityThresholds,
} from './helpers/historical-repair-priority.helper';
import {
  HistoricalRepairBucketingOptions,
  HistoricalRepairBucketingService,
} from './historical-repair-bucketing.service';

export type HistoricalRepairPriorityOptions = HistoricalRepairBucketingOptions & {
  weakQualityScore?: number;
  staleFreshnessDays?: number;
  staleEvidenceDays?: number;
};

@Injectable()
export class HistoricalRepairPriorityService {
  constructor(
    private readonly historicalRepairBucketingService: HistoricalRepairBucketingService,
  ) {}

  async runPriorityReport(
    options?: HistoricalRepairPriorityOptions,
  ): Promise<HistoricalRepairPriorityReport> {
    const bucketingReport =
      await this.historicalRepairBucketingService.runBucketing({
        limit: options?.limit,
        repositoryIds: options?.repositoryIds,
        staleFreshnessDays: options?.staleFreshnessDays,
        staleEvidenceDays: options?.staleEvidenceDays,
        weakQualityScore: options?.weakQualityScore,
        archiveFreshnessDays: options?.archiveFreshnessDays,
      });
    const thresholds: HistoricalRepairPriorityThresholds = {
      ...defaultHistoricalRepairPriorityThresholds(),
      ...(typeof options?.weakQualityScore === 'number'
        ? { weakQualityScore: options.weakQualityScore }
        : {}),
      ...(typeof options?.staleFreshnessDays === 'number'
        ? { staleFreshnessDays: options.staleFreshnessDays }
        : {}),
      ...(typeof options?.staleEvidenceDays === 'number'
        ? { staleEvidenceDays: options.staleEvidenceDays }
        : {}),
    };
    const items: HistoricalRepairPriorityItem[] = bucketingReport.items.map((item) =>
      evaluateHistoricalRepairPriority({
        item,
        thresholds,
      }),
    );

    return buildHistoricalRepairPriorityReport({
      bucketingReport,
      items,
      thresholds,
    });
  }
}
