const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseHistoricalDataRecoveryArgs,
} = require('../dist/scripts/run-historical-data-recovery.js');

test('parseHistoricalDataRecoveryArgs keeps legacy recovery flags working', () => {
  const options = parseHistoricalDataRecoveryArgs([
    '--mode=rerun_full_deep',
    '--dryRun=false',
    '--limit=80',
    '--priority=P0',
    '--onlyHomepage=true',
    '--onlyIncomplete=true',
  ]);

  assert.deepEqual(options, {
    mode: 'rerun_full_deep',
    dryRun: false,
    limit: 80,
    priority: 'P0',
    onlyHomepage: true,
    onlyFeatured: true,
    onlyIncomplete: true,
  });
});

test('parseHistoricalDataRecoveryArgs supports historical repair loop filters', () => {
  const options = parseHistoricalDataRecoveryArgs([
    '--mode=historical_repair_loop',
    '--dryRun=false',
    '--buckets=visible_broken,high_value_weak,unknown',
    '--minPriorityScore=110',
    '--limit=160',
    '--repositoryIds=repo-1, repo-2 ,,repo-3',
    '--repositoryIdsFile=./tmp/repo-ids.txt',
  ]);

  assert.deepEqual(options, {
    mode: 'historical_repair_loop',
    dryRun: false,
    buckets: ['visible_broken', 'high_value_weak'],
    minPriorityScore: 110,
    limit: 160,
    repositoryIds: ['repo-1', 'repo-2', 'repo-3'],
    repositoryIdsFile: './tmp/repo-ids.txt',
  });
});
