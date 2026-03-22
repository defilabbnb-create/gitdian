function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

export function buildCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => escapeCsvValue(row[header]))
        .join(','),
    ),
  ];

  return lines.join('\n');
}

export function createExportFilename(prefix: string, extension: string) {
  return `${prefix}-${createTimestamp()}.${extension}`;
}

function escapeCsvValue(value: unknown) {
  const normalized =
    value === null || typeof value === 'undefined' ? '' : String(value);

  return `"${normalized.replace(/"/g, '""')}"`;
}
