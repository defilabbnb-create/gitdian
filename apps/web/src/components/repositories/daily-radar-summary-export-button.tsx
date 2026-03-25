'use client';

import {
  buildCsv,
  createExportFilename,
  downloadTextFile,
} from '@/lib/export-utils';
import { RadarDailySummaryRecord } from '@/lib/types/repository';

type DailyRadarSummaryExportButtonProps = {
  summary: RadarDailySummaryRecord;
};

export function DailyRadarSummaryExportButton({
  summary,
}: DailyRadarSummaryExportButtonProps) {
  function handleExportJson() {
    downloadTextFile(
      createExportFilename(`daily-radar-summary-${summary.date}`, 'json'),
      JSON.stringify(summary, null, 2),
      'application/json;charset=utf-8',
    );
  }

  function handleExportCsv() {
    const csv = buildCsv([
      {
        date: summary.date,
        fetchedRepositories: summary.fetchedRepositories,
        snapshotGenerated: summary.snapshotGenerated,
        deepAnalyzed: summary.deepAnalyzed,
        promisingCandidates: summary.promisingCandidates,
        goodIdeas: summary.goodIdeas,
        cloneCandidates: summary.cloneCandidates,
        ignoredIdeas: summary.ignoredIdeas,
        topCategories: summary.topCategories
          .map((item) => `${item.main}/${item.sub}:${item.count}`)
          .join(' | '),
        topGoodRepositoryIds: summary.topGoodRepositoryIds.join(' | '),
        topCloneRepositoryIds: summary.topCloneRepositoryIds.join(' | '),
        topIgnoredRepositoryIds: summary.topIgnoredRepositoryIds.join(' | '),
      },
    ]);

    downloadTextFile(
      createExportFilename(`daily-radar-summary-${summary.date}`, 'csv'),
      csv,
      'text/csv;charset=utf-8',
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={handleExportJson}
        className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        导出今日摘要 JSON
      </button>
      <button
        type="button"
        onClick={handleExportCsv}
        className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        导出今日摘要 CSV
      </button>
    </div>
  );
}
