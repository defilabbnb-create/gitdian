import assert from 'node:assert/strict';
import test from 'node:test';
import { getJobDisplayName } from '../src/components/jobs/job-display';

test('job display names cover the main analysis and intake tasks', () => {
  assert.equal(getJobDisplayName('analysis.run_single'), '单仓分析执行');
  assert.equal(getJobDisplayName('analysis.run_batch'), '批量分析调度');
  assert.equal(getJobDisplayName('github.fetch_repositories'), 'GitHub 抓取');
  assert.equal(getJobDisplayName('fast_filter.batch'), 'Fast Filter 批处理');
});
