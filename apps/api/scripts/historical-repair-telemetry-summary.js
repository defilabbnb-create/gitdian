#!/usr/bin/env node

const fs = require('node:fs/promises');
const process = require('node:process');

const TELEMETRY_PREFIX = 'historical_repair ';
const TELEMETRY_KINDS = new Set([
  'gate_config',
  'lane_summary',
  'lane_telemetry',
  'loop_telemetry',
]);
const MAIN_LANES = [
  'refresh_only',
  'evidence_repair',
  'deep_repair',
  'decision_recalc',
];
const BULK_LANES = ['refresh_only', 'evidence_repair'];

function coerceValue(rawValue) {
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    return Number(rawValue);
  }

  return rawValue;
}

function normalizeInputLines(input, sinceLines) {
  const lines = input
    .split(/\r?\n/)
    .filter((line, index, values) => !(index === values.length - 1 && line === ''));

  if (Number.isInteger(sinceLines) && sinceLines > 0 && lines.length > sinceLines) {
    return lines.slice(-sinceLines);
  }

  return lines;
}

function parseHistoricalRepairTelemetryLine(line, laneFilter = null) {
  const prefixIndex = line.indexOf(TELEMETRY_PREFIX);

  if (prefixIndex < 0) {
    return null;
  }

  const fragment = line.slice(prefixIndex).trim();
  const tokens = fragment.split(/\s+/);

  if (tokens.length < 2 || tokens[0] !== 'historical_repair') {
    return null;
  }

  const kind = tokens[1];
  if (!TELEMETRY_KINDS.has(kind)) {
    return null;
  }

  const fields = {};
  for (const token of tokens.slice(2)) {
    const separatorIndex = token.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = token.slice(0, separatorIndex);
    const rawValue = token.slice(separatorIndex + 1);
    if (!key) {
      continue;
    }

    fields[key] = coerceValue(rawValue);
  }

  if (
    laneFilter &&
    (kind === 'lane_summary' || kind === 'lane_telemetry') &&
    fields.lane !== laneFilter
  ) {
    return null;
  }

  return {
    kind,
    fields,
    rawLine: line,
  };
}

function collectNumericValues(records, key) {
  return records
    .map((record) => record.fields[key])
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
}

function collectNumericValuesWithFallback(records, keys) {
  return records
    .map((record) => {
      for (const key of keys) {
        const value = record.fields[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }
      }
      return null;
    })
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
}

function uniqueSortedNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort(
    (left, right) => left - right,
  );
}

function percentile(values, ratio) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? null;
}

function buildStatBlock(values, options = {}) {
  const numericValues = values.filter(
    (value) => typeof value === 'number' && Number.isFinite(value),
  );

  if (!numericValues.length) {
    return {
      sum: options.includeSum ? null : undefined,
      avg: options.includeAvg ? null : undefined,
      p95: options.includeP95 ? null : undefined,
      max: options.includeMax ? null : undefined,
      min: options.includeMin ? null : undefined,
    };
  }

  const sum = numericValues.reduce((total, value) => total + value, 0);
  const avg = sum / numericValues.length;
  const max = Math.max(...numericValues);
  const min = Math.min(...numericValues);
  const p95 = percentile(numericValues, 0.95);

  return {
    sum: options.includeSum ? sum : undefined,
    avg: options.includeAvg ? avg : undefined,
    p95: options.includeP95 ? p95 : undefined,
    max: options.includeMax ? max : undefined,
    min: options.includeMin ? min : undefined,
  };
}

function buildGateWaitByLane(records) {
  const grouped = {};

  for (const lane of MAIN_LANES) {
    const laneRecords = records.filter((record) => record.fields.lane === lane);
    const gateWaitValues = collectNumericValues(laneRecords, 'gateWaitMs');

    grouped[lane] = {
      samples: laneRecords.length,
      avg: gateWaitValues.length ? buildStatBlock(gateWaitValues, { includeAvg: true }).avg : null,
      p95: gateWaitValues.length
        ? buildStatBlock(gateWaitValues, { includeP95: true }).p95
        : null,
      max: gateWaitValues.length ? buildStatBlock(gateWaitValues, { includeMax: true }).max : null,
    };
  }

  return grouped;
}

function buildBulkQualityByLane(records) {
  const grouped = {};

  for (const lane of BULK_LANES) {
    const laneRecords = records.filter((record) => record.fields.lane === lane);
    const bulkBatchValues = collectNumericValues(laneRecords, 'bulkBatches');
    const fallbackValues = collectNumericValues(laneRecords, 'bulkFallbackBatches');
    const bulkBatchesSum = bulkBatchValues.reduce((total, value) => total + value, 0);
    const bulkFallbackBatchesSum = fallbackValues.reduce(
      (total, value) => total + value,
      0,
    );

    grouped[lane] = {
      bulkBatchesSum,
      bulkBatchesAvg: bulkBatchValues.length ? bulkBatchesSum / bulkBatchValues.length : null,
      bulkFallbackBatchesSum,
      bulkFallbackBatchesAvg: fallbackValues.length
        ? bulkFallbackBatchesSum / fallbackValues.length
        : null,
      fallbackRate: bulkBatchesSum > 0 ? bulkFallbackBatchesSum / bulkBatchesSum : null,
    };
  }

  return grouped;
}

function buildDeepRepairLookupSummary(records) {
  const deepRecords = records.filter((record) => record.fields.lane === 'deep_repair');

  return {
    chunkSizes: uniqueSortedNumbers(
      collectNumericValues(deepRecords, 'deepRepairLookupChunkSize'),
    ),
    chunkCount: buildStatBlock(
      collectNumericValues(deepRecords, 'deepRepairLookupChunkCount'),
      {
        includeAvg: true,
        includeMax: true,
      },
    ),
    durationMs: buildStatBlock(
      collectNumericValues(deepRecords, 'deepRepairLookupDurationMs'),
      {
        includeAvg: true,
        includeP95: true,
        includeMax: true,
      },
    ),
  };
}

function buildSuggestions(summary) {
  const suggestions = [];
  const gateHotLanes = Object.entries(summary.gateWaitByLane)
    .filter(([, stats]) => typeof stats.p95 === 'number' && stats.p95 > 200)
    .map(([lane]) => lane);

  if (gateHotLanes.length > 0) {
    suggestions.push(
      `Gate wait is elevated on ${gateHotLanes.join('/')} (p95 > 200ms). If DB/Redis/worker are stable, consider raising HISTORICAL_REPAIR_GLOBAL_CONCURRENCY from 20 to 24.`,
    );
  }

  const bulkHotLanes = Object.entries(summary.bulkQualityByLane)
    .filter(([, stats]) => typeof stats.fallbackRate === 'number' && stats.fallbackRate > 0.1)
    .map(([lane]) => lane);

  if (bulkHotLanes.length > 0) {
    suggestions.push(
      `Bulk fallback rate is elevated on ${bulkHotLanes.join('/')} (> 10%). Consider lowering snapshot bulk batch size from 50 to 40.`,
    );
  }

  const deepDuration = summary.deepRepairLookup.durationMs;
  if (
    (typeof deepDuration.p95 === 'number' && deepDuration.p95 > 300) ||
    (typeof deepDuration.avg === 'number' &&
      typeof deepDuration.max === 'number' &&
      deepDuration.avg > 0 &&
      deepDuration.max >= 300 &&
      deepDuration.max >= deepDuration.avg * 3)
  ) {
    suggestions.push(
      'Deep repair lookup shows a long tail. Consider lowering deep repair chunkSize from 100 to 80 before changing lookup concurrency.',
    );
  }

  const queuedPerSecondAvg = summary.loop.queuedPerSecond.avg;
  const gateWaitHot = Object.values(summary.gateWaitByLane).some(
    (stats) => typeof stats.p95 === 'number' && stats.p95 >= 50,
  );
  if (typeof queuedPerSecondAvg === 'number' && queuedPerSecondAvg < 1 && !gateWaitHot) {
    suggestions.push(
      'queuedPerSecond is low while gate wait stays mild. The bottleneck may be outside the global gate; inspect deep lookup, queue enqueue cost, or worker-side throughput next.',
    );
  }

  if (!suggestions.length) {
    suggestions.push(
      'No obvious first tuning change stands out from telemetry alone. Keep the current settings and compare against DB/Redis/worker metrics before changing a knob.',
    );
  }

  return suggestions.slice(0, 3);
}

function summarizeHistoricalRepairTelemetry(input, options = {}) {
  const normalizedLines = normalizeInputLines(input, options.sinceLines);
  const records = normalizedLines
    .map((line) => parseHistoricalRepairTelemetryLine(line, options.lane ?? null))
    .filter(Boolean);
  const loopRecords = records.filter((record) => record.kind === 'loop_telemetry');
  const laneTelemetryRecords = records.filter(
    (record) => record.kind === 'lane_telemetry',
  );
  const laneSummaryRecords = records.filter((record) => record.kind === 'lane_summary');
  const observedGlobalConcurrency = uniqueSortedNumbers(
    records
      .map((record) => record.fields.historicalRepairGlobalConcurrency)
      .filter((value) => typeof value === 'number'),
  );

  const summary = {
    overall: {
      inputLines: normalizedLines.length,
      matchedLines: records.length,
      loopCount: loopRecords.length,
      laneTelemetryCount: laneTelemetryRecords.length,
      laneSummaryCount: laneSummaryRecords.length,
      observedGlobalConcurrency,
    },
    loop: {
      selectedCount: buildStatBlock(collectNumericValues(loopRecords, 'selectedCount'), {
        includeSum: true,
        includeAvg: true,
        includeMax: true,
      }),
      totalQueuedCount: buildStatBlock(
        collectNumericValuesWithFallback(loopRecords, [
          'loopQueuedCount',
          'totalQueuedCount',
        ]),
        {
          includeSum: true,
          includeAvg: true,
          includeMax: true,
        },
      ),
      totalDurationMs: buildStatBlock(
        collectNumericValues(loopRecords, 'totalDurationMs'),
        {
          includeAvg: true,
          includeP95: true,
          includeMax: true,
        },
      ),
      queuedPerSecond: buildStatBlock(
        collectNumericValuesWithFallback(loopRecords, [
          'loopQueuedPerSecond',
          'queuedPerSecond',
        ]),
        {
          includeAvg: true,
          includeP95: true,
          includeMin: true,
        },
      ),
      globalPendingCount: buildStatBlock(
        collectNumericValues(loopRecords, 'globalPendingCount'),
        {
          includeAvg: true,
          includeP95: true,
          includeMax: true,
        },
      ),
      globalRunningCount: buildStatBlock(
        collectNumericValues(loopRecords, 'globalRunningCount'),
        {
          includeAvg: true,
          includeP95: true,
          includeMax: true,
        },
      ),
      globalQueuedCount: buildStatBlock(
        collectNumericValues(loopRecords, 'globalQueuedCount'),
        {
          includeAvg: true,
          includeP95: true,
          includeMax: true,
        },
      ),
    },
    gateWaitByLane: buildGateWaitByLane(laneTelemetryRecords),
    bulkQualityByLane: buildBulkQualityByLane(laneTelemetryRecords),
    deepRepairLookup: buildDeepRepairLookupSummary(laneTelemetryRecords),
  };

  summary.suggestions = buildSuggestions(summary);
  return summary;
}

function formatNumber(value, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }

  return value.toFixed(digits);
}

function formatPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatObservedConcurrency(values) {
  return values.length ? values.join(', ') : 'n/a';
}

function renderHistoricalRepairTelemetryText(summary) {
  const lines = [
    'Historical Repair Telemetry Summary',
    '=================================',
    `Input lines: ${summary.overall.inputLines}`,
    `Matched telemetry lines: ${summary.overall.matchedLines}`,
    `Loop telemetry lines: ${summary.overall.loopCount}`,
    `Lane telemetry lines: ${summary.overall.laneTelemetryCount}`,
    `Lane summary lines: ${summary.overall.laneSummaryCount}`,
    `Observed global concurrency: ${formatObservedConcurrency(
      summary.overall.observedGlobalConcurrency,
    )}`,
    '',
    '[Loop Throughput]',
    `Loops: ${summary.overall.loopCount}`,
    `selectedCount: sum=${formatNumber(summary.loop.selectedCount.sum, 0)} avg=${formatNumber(
      summary.loop.selectedCount.avg,
      1,
    )} max=${formatNumber(summary.loop.selectedCount.max, 0)}`,
    `loopQueuedCount: sum=${formatNumber(
      summary.loop.totalQueuedCount.sum,
      0,
    )} avg=${formatNumber(summary.loop.totalQueuedCount.avg, 1)} max=${formatNumber(
      summary.loop.totalQueuedCount.max,
      0,
    )}`,
    `totalDurationMs: avg=${formatNumber(
      summary.loop.totalDurationMs.avg,
      1,
    )} p95=${formatNumber(summary.loop.totalDurationMs.p95, 1)} max=${formatNumber(
      summary.loop.totalDurationMs.max,
      1,
    )}`,
    `queuedPerSecond: avg=${formatNumber(
      summary.loop.queuedPerSecond.avg,
      2,
    )} p95=${formatNumber(summary.loop.queuedPerSecond.p95, 2)} min=${formatNumber(
      summary.loop.queuedPerSecond.min,
      2,
    )}`,
    '',
    '[Global Backlog Snapshot]',
    `globalPendingCount: avg=${formatNumber(
      summary.loop.globalPendingCount.avg,
      1,
    )} p95=${formatNumber(summary.loop.globalPendingCount.p95, 1)} max=${formatNumber(
      summary.loop.globalPendingCount.max,
      1,
    )}`,
    `globalRunningCount: avg=${formatNumber(
      summary.loop.globalRunningCount.avg,
      1,
    )} p95=${formatNumber(summary.loop.globalRunningCount.p95, 1)} max=${formatNumber(
      summary.loop.globalRunningCount.max,
      1,
    )}`,
    `globalQueuedCount: avg=${formatNumber(
      summary.loop.globalQueuedCount.avg,
      1,
    )} p95=${formatNumber(summary.loop.globalQueuedCount.p95, 1)} max=${formatNumber(
      summary.loop.globalQueuedCount.max,
      1,
    )}`,
    '',
    '[Gate Wait by Lane]',
  ];

  for (const lane of MAIN_LANES) {
    const stats = summary.gateWaitByLane[lane];
    lines.push(
      `${lane}: samples=${stats.samples} avg=${formatNumber(
        stats.avg,
        1,
      )} p95=${formatNumber(stats.p95, 1)} max=${formatNumber(stats.max, 1)}`,
    );
  }

  lines.push('', '[Bulk Batch Quality]');
  for (const lane of BULK_LANES) {
    const stats = summary.bulkQualityByLane[lane];
    lines.push(
      `${lane}: bulkBatches=sum=${formatNumber(
        stats.bulkBatchesSum,
        0,
      )} avg=${formatNumber(stats.bulkBatchesAvg, 2)} fallback=sum=${formatNumber(
        stats.bulkFallbackBatchesSum,
        0,
      )} avg=${formatNumber(stats.bulkFallbackBatchesAvg, 2)} rate=${formatPercent(
        stats.fallbackRate,
      )}`,
    );
  }

  lines.push(
    '',
    '[Deep Repair Lookup]',
    `chunkSize: ${
      summary.deepRepairLookup.chunkSizes.length
        ? summary.deepRepairLookup.chunkSizes.join(', ')
        : 'n/a'
    }`,
    `chunkCount: avg=${formatNumber(
      summary.deepRepairLookup.chunkCount.avg,
      1,
    )} max=${formatNumber(summary.deepRepairLookup.chunkCount.max, 1)}`,
    `lookupDurationMs: avg=${formatNumber(
      summary.deepRepairLookup.durationMs.avg,
      1,
    )} p95=${formatNumber(summary.deepRepairLookup.durationMs.p95, 1)} max=${formatNumber(
      summary.deepRepairLookup.durationMs.max,
      1,
    )}`,
    '',
    '[Suggested First Action]',
  );

  for (const suggestion of summary.suggestions) {
    lines.push(`- ${suggestion}`);
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const options = {
    format: 'text',
    file: null,
    lane: null,
    sinceLines: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--json') {
      options.format = 'json';
      continue;
    }
    if (current === '--text') {
      options.format = 'text';
      continue;
    }
    if (current === '--help' || current === '-h') {
      options.help = true;
      continue;
    }
    if (current === '--file') {
      options.file = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (current === '--lane') {
      options.lane = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (current === '--since-lines') {
      const parsed = Number.parseInt(argv[index + 1] ?? '', 10);
      options.sinceLines = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return options;
}

function renderUsage() {
  return [
    'Usage:',
    '  node scripts/historical-repair-telemetry-summary.js --file <path> [--json] [--lane <name>] [--since-lines <n>]',
    '  rg "historical_repair" app.log | node scripts/historical-repair-telemetry-summary.js [--json] [--lane <name>] [--since-lines <n>]',
  ].join('\n');
}

async function readFromStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function readInput(options) {
  if (options.file) {
    return fs.readFile(options.file, 'utf8');
  }

  if (process.stdin.isTTY) {
    throw new Error('Provide --file <path> or pipe historical_repair logs via stdin.');
  }

  return readFromStdin();
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    process.stdout.write(`${renderUsage()}\n`);
    return;
  }

  const input = await readInput(options);
  const summary = summarizeHistoricalRepairTelemetry(input, options);

  if (options.format === 'json') {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  process.stdout.write(renderHistoricalRepairTelemetryText(summary));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write(`${renderUsage()}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildSuggestions,
  parseHistoricalRepairTelemetryLine,
  parseArgs,
  renderHistoricalRepairTelemetryText,
  summarizeHistoricalRepairTelemetry,
};
