'use client';

import {
  compareRepositoriesByInsightPriority,
  getRepositoryDecisionSummary,
} from '@/lib/repository-decision';
import {
  buildCsv,
  createExportFilename,
  downloadTextFile,
} from '@/lib/export-utils';
import { RepositoryListItem } from '@/lib/types/repository';

type ExportRepositoriesButtonProps = {
  items: RepositoryListItem[];
};

export function ExportRepositoriesButton({
  items,
}: ExportRepositoriesButtonProps) {
  const exportRows = [...items].sort(compareRepositoriesByInsightPriority).map((item) => {
    const summary = getRepositoryDecisionSummary(item);

    return {
      id: item.id,
      name: item.name,
      fullName: item.fullName,
      oneLinerZh: summary.oneLiner,
      verdict: summary.verdict,
      verdictReason: summary.verdictReason,
      action: summary.action,
      actionLabel: summary.actionLabel,
      note: summary.manualNote,
      categoryMain: item.analysis?.insightJson?.category.main ?? '',
      categorySub: item.analysis?.insightJson?.category.sub ?? '',
      categoryDisplay: summary.category.label,
      categoryLabel: summary.category.label,
      summaryTags: (item.analysis?.insightJson?.summaryTags ?? summary.tags).join(' | '),
      description: item.description ?? '',
      language: item.language ?? '',
      stars: item.stars,
      opportunityLevel: item.opportunityLevel ?? '',
      ideaFitScore: item.ideaFitScore ?? '',
      completenessScore: item.completenessScore ?? '',
      decision: item.decision,
      isFavorited: item.isFavorited,
      htmlUrl: item.htmlUrl,
    };
  });

  function handleExportCsv() {
    const csv = buildCsv(
      exportRows,
    );

    downloadTextFile(
      createExportFilename('repositories', 'csv'),
      csv,
      'text/csv;charset=utf-8',
    );
  }

  function handleExportJson() {
    downloadTextFile(
      createExportFilename('repositories', 'json'),
      JSON.stringify(exportRows, null, 2),
      'application/json;charset=utf-8',
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={handleExportCsv}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        导出当前列表 CSV
      </button>
      <button
        type="button"
        onClick={handleExportJson}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        导出当前列表 JSON
      </button>
    </div>
  );
}
