import { Injectable } from '@nestjs/common';
import {
  HistoricalDataInventoryOptions,
  HistoricalDataInventoryService,
} from './historical-data-inventory.service';
import {
  buildHistoricalRepairBucketingReport,
  defaultHistoricalRepairBucketingThresholds,
  evaluateHistoricalRepairBucket,
  type HistoricalRepairBucketingReport,
  type HistoricalRepairBucketingThresholds,
} from './helpers/historical-repair-bucketing.helper';

export type HistoricalRepairBucketingOptions = HistoricalDataInventoryOptions & {
  weakQualityScore?: number;
  archiveFreshnessDays?: number;
};

@Injectable()
export class HistoricalRepairBucketingService {
  constructor(
    private readonly historicalDataInventoryService: HistoricalDataInventoryService,
  ) {}

  async runBucketing(
    options?: HistoricalRepairBucketingOptions,
  ): Promise<HistoricalRepairBucketingReport> {
    const inventoryReport =
      await this.historicalDataInventoryService.runInventory({
        limit: options?.limit,
        repositoryIds: options?.repositoryIds,
        staleFreshnessDays: options?.staleFreshnessDays,
        staleEvidenceDays: options?.staleEvidenceDays,
      });
    const thresholds: HistoricalRepairBucketingThresholds = {
      ...defaultHistoricalRepairBucketingThresholds(),
      ...(typeof options?.weakQualityScore === 'number'
        ? { weakQualityScore: options.weakQualityScore }
        : {}),
      ...(typeof options?.archiveFreshnessDays === 'number'
        ? { archiveFreshnessDays: options.archiveFreshnessDays }
        : {}),
    };
    const items = inventoryReport.items.map((item) =>
      evaluateHistoricalRepairBucket({
        item,
        thresholds,
      }),
    );

    return buildHistoricalRepairBucketingReport({
      inventoryReport,
      items,
      thresholds,
    });
  }
}
