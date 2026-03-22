'use client';

import { buildCsv, createExportFilename, downloadTextFile } from '@/lib/export-utils';
import { FavoriteWithRepositorySummary } from '@/lib/types/repository';

type ExportFavoritesButtonProps = {
  items: FavoriteWithRepositorySummary[];
};

export function ExportFavoritesButton({
  items,
}: ExportFavoritesButtonProps) {
  function handleExport() {
    const csv = buildCsv(
      items.map((favorite) => ({
        favoriteId: favorite.id,
        repositoryId: favorite.repositoryId,
        fullName: favorite.repository.fullName,
        name: favorite.repository.name,
        priority: favorite.priority,
        note: favorite.note ?? '',
        stars: favorite.repository.stars,
        opportunityLevel: favorite.repository.opportunityLevel ?? '',
        finalScore: favorite.repository.finalScore ?? '',
        language: favorite.repository.language ?? '',
        createdAt: favorite.createdAt,
        updatedAt: favorite.updatedAt,
      })),
    );

    downloadTextFile(
      createExportFilename('favorites', 'csv'),
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
      导出收藏 CSV
    </button>
  );
}
