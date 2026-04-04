'use client';

import { useState } from 'react';
import {
  createExportFilename,
  downloadTextFile,
} from '@/lib/export-utils';
import { RepositoryDeepAnalysisState } from '@/lib/types/repository';

export function ExportColdToolsButton() {
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  async function handleExport(
    suffix: string,
    deepAnalysisState?: RepositoryDeepAnalysisState,
  ) {
    setExportingKey(suffix);

    try {
      const search = deepAnalysisState
        ? `?deepAnalysisState=${encodeURIComponent(deepAnalysisState)}`
        : '';
      const response = await fetch(`/api/export/cold-tools.csv${search}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`export_failed_${response.status}`);
      }

      const csv = await response.text();
      downloadTextFile(
        createExportFilename(`cold-tools-${suffix}`, 'csv'),
        csv,
        'text/csv;charset=utf-8',
      );
    } catch (error) {
      console.error('Failed to export cold tools csv:', error);
      window.alert('冷门工具导出失败，请稍后重试。');
    } finally {
      setExportingKey(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => handleExport('all')}
        disabled={exportingKey !== null}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {exportingKey === 'all' ? '导出全部冷门中...' : '导出全部冷门 CSV'}
      </button>
      <button
        type="button"
        onClick={() => handleExport('deep-completed', 'completed')}
        disabled={exportingKey !== null}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {exportingKey === 'deep-completed'
          ? '导出已完成中...'
          : '导出深度分析已完成 CSV'}
      </button>
      <button
        type="button"
        onClick={() => handleExport('deep-pending', 'pending')}
        disabled={exportingKey !== null}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {exportingKey === 'deep-pending'
          ? '导出未完成中...'
          : '导出深度分析未完成 CSV'}
      </button>
    </div>
  );
}
