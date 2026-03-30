'use client';

import { createExportFilename, downloadTextFile } from '@/lib/export-utils';
import { getApiBaseUrl } from '@/lib/api/base-url';

async function downloadEndpoint(
  path: string,
  filename: string,
  mimeType: string,
) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'GET',
    headers: {
      Accept: mimeType,
    },
  });

  if (!response.ok) {
    throw new Error(`导出失败：${path}`);
  }

  const content = await response.text();
  downloadTextFile(filename, content, mimeType);
}

export function ExportAssetBundlesButton() {
  async function handleExportTopProjects() {
    await downloadEndpoint(
      '/api/export/top-projects?limit=50',
      createExportFilename('top-projects', 'json'),
      'application/json;charset=utf-8',
    );
  }

  async function handleExportTrainingData() {
    await downloadEndpoint(
      '/api/export/training-data?sampleSize=100',
      createExportFilename('training-data', 'jsonl'),
      'application/x-ndjson;charset=utf-8',
    );
  }

  async function handleExportAudit() {
    await downloadEndpoint(
      '/api/export/audit-report',
      createExportFilename('audit-report', 'json'),
      'application/json;charset=utf-8',
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => void handleExportTopProjects()}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        导出高价值项目
      </button>
      <button
        type="button"
        onClick={() => void handleExportTrainingData()}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        导出训练数据
      </button>
      <button
        type="button"
        onClick={() => void handleExportAudit()}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        导出审计报告
      </button>
    </div>
  );
}
