'use client';

import { buildCsv, createExportFilename, downloadTextFile } from '@/lib/export-utils';
import { RepositoryListItem } from '@/lib/types/repository';

type ExportRepositoriesButtonProps = {
  items: RepositoryListItem[];
};

export function ExportRepositoriesButton({
  items,
}: ExportRepositoriesButtonProps) {
  function handleExport() {
    const csv = buildCsv(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        fullName: item.fullName,
        description: item.description ?? '',
        language: item.language ?? '',
        stars: item.stars,
        opportunityLevel: item.opportunityLevel ?? '',
        ideaFitScore: item.ideaFitScore ?? '',
        completenessScore: item.completenessScore ?? '',
        decision: item.decision,
        isFavorited: item.isFavorited,
        ideaSummary: item.analysis?.extractedIdeaJson?.ideaSummary ?? '',
        htmlUrl: item.htmlUrl,
      })),
    );

    downloadTextFile(
      createExportFilename('repositories', 'csv'),
      csv,
      'text/csv;charset=utf-8',
    );
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
    >
      导出当前列表 CSV
    </button>
  );
}
