'use client';

import { createExportFilename, downloadTextFile } from '@/lib/export-utils';
import { RepositoryDetail } from '@/lib/types/repository';

type ExportRepositoryJsonButtonProps = {
  repository: RepositoryDetail;
};

export function ExportRepositoryJsonButton({
  repository,
}: ExportRepositoryJsonButtonProps) {
  function handleExport() {
    downloadTextFile(
      createExportFilename(`repository-${repository.name}`, 'json'),
      JSON.stringify(repository, null, 2),
      'application/json;charset=utf-8',
    );
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 font-semibold transition hover:bg-white/10"
    >
      导出 JSON
    </button>
  );
}
