const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseHistoricalRepairTelemetryLine,
  renderHistoricalRepairTelemetryText,
  summarizeHistoricalRepairTelemetry,
} = require('../scripts/historical-repair-telemetry-summary.js');

test('historical repair telemetry summary recognizes fixed-schema lines from mixed logs', () => {
  const text = [
    'random log line',
    '[Nest] 1 LOG [Svc] historical_repair gate_config historicalRepairGlobalConcurrency=20',
    '[Nest] 1 LOG [Svc] historical_repair lane_summary lane=refresh_only planCount=3 totalDurationMs=120 partialCount=3 skippedCount=0 noChangeCount=0 downgradedCount=0',
    '[Nest] 1 LOG [Svc] historical_repair lane_telemetry lane=refresh_only gateWaitMs=12 gateAcquireCount=2 historicalRepairGlobalConcurrency=20 bulkBatches=1 bulkFallbackBatches=0 deepRepairLookupChunkSize=0 deepRepairLookupChunkCount=0 deepRepairLookupDurationMs=0',
    '[Nest] 1 LOG [Svc] historical_repair loop_telemetry selectedCount=3 loopQueuedCount=2 totalQueuedCount=2 totalDurationMs=200 loopQueuedPerSecond=10.00 queuedPerSecond=10.00 globalPendingCount=5 globalRunningCount=1 globalQueuedCount=6 historicalRepairGlobalConcurrency=20 refreshPartialCount=2 evidencePartialCount=0 deepPartialCount=0 decisionRecalcPartialCount=0 downgradeOnlyCount=0 archiveCount=0',
    'another random log line',
  ].join('\n');

  const summary = summarizeHistoricalRepairTelemetry(text);

  assert.equal(summary.overall.inputLines, 6);
  assert.equal(summary.overall.matchedLines, 4);
  assert.equal(summary.overall.loopCount, 1);
  assert.equal(summary.overall.laneTelemetryCount, 1);
  assert.equal(summary.overall.laneSummaryCount, 1);
  assert.deepEqual(summary.overall.observedGlobalConcurrency, [20]);
});

test('historical repair telemetry summary aggregates loop, gate, bulk, and deep lookup metrics', () => {
  const text = [
    'historical_repair gate_config historicalRepairGlobalConcurrency=20',
    'historical_repair loop_telemetry selectedCount=100 loopQueuedCount=80 totalQueuedCount=80 totalDurationMs=1000 loopQueuedPerSecond=0.80 queuedPerSecond=0.80 globalPendingCount=60 globalRunningCount=15 globalQueuedCount=75 historicalRepairGlobalConcurrency=20 refreshPartialCount=30 evidencePartialCount=20 deepPartialCount=10 decisionRecalcPartialCount=20 downgradeOnlyCount=5 archiveCount=1',
    'historical_repair loop_telemetry selectedCount=50 loopQueuedCount=25 totalQueuedCount=25 totalDurationMs=500 loopQueuedPerSecond=0.50 queuedPerSecond=0.50 globalPendingCount=20 globalRunningCount=5 globalQueuedCount=25 historicalRepairGlobalConcurrency=20 refreshPartialCount=10 evidencePartialCount=5 deepPartialCount=4 decisionRecalcPartialCount=6 downgradeOnlyCount=1 archiveCount=0',
    'historical_repair lane_telemetry lane=refresh_only gateWaitMs=250 gateAcquireCount=4 historicalRepairGlobalConcurrency=20 bulkBatches=10 bulkFallbackBatches=2 deepRepairLookupChunkSize=0 deepRepairLookupChunkCount=0 deepRepairLookupDurationMs=0',
    'historical_repair lane_telemetry lane=refresh_only gateWaitMs=300 gateAcquireCount=5 historicalRepairGlobalConcurrency=20 bulkBatches=4 bulkFallbackBatches=0 deepRepairLookupChunkSize=0 deepRepairLookupChunkCount=0 deepRepairLookupDurationMs=0',
    'historical_repair lane_telemetry lane=evidence_repair gateWaitMs=40 gateAcquireCount=2 historicalRepairGlobalConcurrency=20 bulkBatches=8 bulkFallbackBatches=0 deepRepairLookupChunkSize=0 deepRepairLookupChunkCount=0 deepRepairLookupDurationMs=0',
    'historical_repair lane_telemetry lane=deep_repair gateWaitMs=20 gateAcquireCount=3 historicalRepairGlobalConcurrency=20 bulkBatches=0 bulkFallbackBatches=0 deepRepairLookupChunkSize=100 deepRepairLookupChunkCount=2 deepRepairLookupDurationMs=120',
    'historical_repair lane_telemetry lane=deep_repair gateWaitMs=25 gateAcquireCount=3 historicalRepairGlobalConcurrency=20 bulkBatches=0 bulkFallbackBatches=0 deepRepairLookupChunkSize=100 deepRepairLookupChunkCount=5 deepRepairLookupDurationMs=420',
    'historical_repair lane_telemetry lane=decision_recalc gateWaitMs=15 gateAcquireCount=2 historicalRepairGlobalConcurrency=20 bulkBatches=0 bulkFallbackBatches=0 deepRepairLookupChunkSize=0 deepRepairLookupChunkCount=0 deepRepairLookupDurationMs=0',
  ].join('\n');

  const summary = summarizeHistoricalRepairTelemetry(text);

  assert.equal(summary.loop.selectedCount.sum, 150);
  assert.equal(summary.loop.selectedCount.max, 100);
  assert.equal(summary.loop.totalQueuedCount.sum, 105);
  assert.equal(summary.loop.totalDurationMs.p95, 1000);
  assert.equal(summary.loop.queuedPerSecond.min, 0.5);
  assert.equal(summary.loop.globalPendingCount.max, 60);
  assert.equal(summary.loop.globalRunningCount.max, 15);
  assert.equal(summary.loop.globalQueuedCount.p95, 75);
  assert.equal(summary.gateWaitByLane.refresh_only.samples, 2);
  assert.equal(summary.gateWaitByLane.refresh_only.p95, 300);
  assert.equal(summary.bulkQualityByLane.refresh_only.bulkBatchesSum, 14);
  assert.equal(summary.bulkQualityByLane.refresh_only.bulkFallbackBatchesSum, 2);
  assert.equal(summary.bulkQualityByLane.refresh_only.fallbackRate, 2 / 14);
  assert.deepEqual(summary.deepRepairLookup.chunkSizes, [100]);
  assert.equal(summary.deepRepairLookup.chunkCount.max, 5);
  assert.equal(summary.deepRepairLookup.durationMs.p95, 420);
});

test('historical repair telemetry summary tolerates bad lines and missing fields without crashing', () => {
  const text = [
    'historical_repair loop_telemetry selectedCount=10 totalQueuedCount=5',
    'historical_repair lane_telemetry lane=refresh_only gateWaitMs=oops bulkBatches=3',
    'historical_repair lane_telemetry lane=deep_repair deepRepairLookupChunkSize=100',
    'historical_repair unknown_kind foo=bar',
    'historical_repair lane_summary lane=evidence_repair',
  ].join('\n');

  const summary = summarizeHistoricalRepairTelemetry(text);
  const rendered = renderHistoricalRepairTelemetryText(summary);

  assert.equal(summary.overall.matchedLines, 4);
  assert.equal(summary.loop.totalDurationMs.avg, null);
  assert.equal(summary.gateWaitByLane.refresh_only.avg, null);
  assert.deepEqual(summary.deepRepairLookup.chunkSizes, [100]);
  assert.match(rendered, /\[Loop Throughput\]/);
  assert.match(rendered, /queuedPerSecond: avg=n\/a/);
});

test('historical repair telemetry summary emits first-action suggestions from thresholds', () => {
  const text = [
    'historical_repair gate_config historicalRepairGlobalConcurrency=20',
    'historical_repair loop_telemetry selectedCount=40 loopQueuedCount=10 totalQueuedCount=10 totalDurationMs=20000 loopQueuedPerSecond=0.20 queuedPerSecond=0.20 globalPendingCount=14 globalRunningCount=2 globalQueuedCount=16 historicalRepairGlobalConcurrency=20 refreshPartialCount=4 evidencePartialCount=2 deepPartialCount=2 decisionRecalcPartialCount=2 downgradeOnlyCount=0 archiveCount=0',
    'historical_repair lane_telemetry lane=refresh_only gateWaitMs=280 gateAcquireCount=4 historicalRepairGlobalConcurrency=20 bulkBatches=10 bulkFallbackBatches=2 deepRepairLookupChunkSize=0 deepRepairLookupChunkCount=0 deepRepairLookupDurationMs=0',
    'historical_repair lane_telemetry lane=refresh_only gateWaitMs=320 gateAcquireCount=4 historicalRepairGlobalConcurrency=20 bulkBatches=10 bulkFallbackBatches=3 deepRepairLookupChunkSize=0 deepRepairLookupChunkCount=0 deepRepairLookupDurationMs=0',
    'historical_repair lane_telemetry lane=deep_repair gateWaitMs=15 gateAcquireCount=2 historicalRepairGlobalConcurrency=20 bulkBatches=0 bulkFallbackBatches=0 deepRepairLookupChunkSize=100 deepRepairLookupChunkCount=4 deepRepairLookupDurationMs=180',
    'historical_repair lane_telemetry lane=deep_repair gateWaitMs=20 gateAcquireCount=2 historicalRepairGlobalConcurrency=20 bulkBatches=0 bulkFallbackBatches=0 deepRepairLookupChunkSize=100 deepRepairLookupChunkCount=6 deepRepairLookupDurationMs=520',
  ].join('\n');

  const summary = summarizeHistoricalRepairTelemetry(text);

  assert.ok(summary.suggestions.length >= 2);
  assert.match(summary.suggestions[0], /HISTORICAL_REPAIR_GLOBAL_CONCURRENCY/);
  assert.ok(
    summary.suggestions.some((entry) => entry.includes('snapshot bulk batch size')),
  );
  assert.ok(
    summary.suggestions.some((entry) => entry.includes('chunkSize from 100 to 80')),
  );
});

test('parseHistoricalRepairTelemetryLine honors lane filtering for lane-scoped records', () => {
  const line =
    'historical_repair lane_telemetry lane=decision_recalc gateWaitMs=12 gateAcquireCount=1 historicalRepairGlobalConcurrency=20 bulkBatches=0 bulkFallbackBatches=0 deepRepairLookupChunkSize=0 deepRepairLookupChunkCount=0 deepRepairLookupDurationMs=0';

  assert.equal(parseHistoricalRepairTelemetryLine(line, 'refresh_only'), null);
  assert.equal(
    parseHistoricalRepairTelemetryLine(line, 'decision_recalc').fields.lane,
    'decision_recalc',
  );
});
