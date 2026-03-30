const test = require('node:test');
const assert = require('node:assert/strict');

const { GitHubController } = require('../dist/modules/github/github.controller');

function buildController(overrides = {}) {
  return new GitHubController(
    overrides.githubService ?? {},
    overrides.queueService ?? {
      enqueueSingleAnalysesBulk: async () => [],
      enqueueSingleAnalysis: async () => ({}),
    },
    overrides.radarDailySummaryService ?? {
      getLatestSummary: async () => null,
      markSummaryForRecompute: async () => {},
    },
    overrides.radarDailyReportService ?? {},
    overrides.gitHubRadarService ?? {},
    overrides.claudeAuditService ?? {},
  );
}

test('runLatestClaudeReview uses bulk enqueue and marks summary for recompute', async () => {
  const bulkCalls = [];
  const recomputeCalls = [];
  const controller = buildController({
    queueService: {
      enqueueSingleAnalysesBulk: async (entries, triggeredBy) => {
        bulkCalls.push({ entries, triggeredBy });
        return entries.map((entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.single',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
          repositoryId: entry.repositoryId,
        }));
      },
      enqueueSingleAnalysis: async () => {
        throw new Error('single enqueue should not be used when bulk succeeds');
      },
    },
    radarDailySummaryService: {
      getLatestSummary: async () => ({
        date: '2026-03-30',
        topGoodRepositoryIds: ['repo-1', 'repo-2'],
        topCloneRepositoryIds: ['repo-2'],
        topRepositoryIds: ['repo-3'],
      }),
      markSummaryForRecompute: async (date) => {
        recomputeCalls.push(date);
      },
    },
  });

  const response = await controller.runLatestClaudeReview();

  assert.equal(response.success, true);
  assert.equal(response.data.status, 'redirected_to_primary_analysis');
  assert.equal(response.data.queuedCount, 3);
  assert.equal(response.data.failureCount, 0);
  assert.deepEqual(response.data.repositoryIds, ['repo-1', 'repo-2', 'repo-3']);
  assert.equal(bulkCalls.length, 1);
  assert.equal(bulkCalls[0].triggeredBy, 'legacy_claude_review_redirect');
  assert.equal(bulkCalls[0].entries.length, 3);
  assert.equal(bulkCalls[0].entries[0].repositoryId, 'repo-1');
  assert.equal(bulkCalls[0].entries[0].dto.forceRerun, true);
  assert.equal(
    bulkCalls[0].entries[0].metadata.redirectedFrom,
    'github/radar/claude-review/run-latest',
  );
  assert.deepEqual(recomputeCalls, ['2026-03-30']);
});

test('runLatestClaudeReview falls back to single enqueue and preserves partial failures', async () => {
  const singleCalls = [];
  const recomputeCalls = [];
  const controller = buildController({
    queueService: {
      enqueueSingleAnalysesBulk: async () => {
        throw new Error('bulk failed');
      },
      enqueueSingleAnalysis: async (repositoryId, dto, triggeredBy, options) => {
        singleCalls.push({ repositoryId, dto, triggeredBy, options });
        if (repositoryId === 'repo-2') {
          throw new Error('repo-2 failed');
        }
        return {
          jobId: `job-${repositoryId}`,
          queueName: 'analysis.single',
          queueJobId: `queue-job-${repositoryId}`,
          jobStatus: 'PENDING',
        };
      },
    },
    radarDailySummaryService: {
      getLatestSummary: async () => ({
        date: '2026-03-31',
        topGoodRepositoryIds: ['repo-1'],
        topCloneRepositoryIds: ['repo-2'],
        topRepositoryIds: [],
      }),
      markSummaryForRecompute: async (date) => {
        recomputeCalls.push(date);
      },
    },
  });

  const response = await controller.runLatestClaudeReview();

  assert.equal(response.success, true);
  assert.equal(response.data.queuedCount, 1);
  assert.equal(response.data.failureCount, 1);
  assert.deepEqual(response.data.failures, ['repo-2 failed']);
  assert.equal(singleCalls.length, 2);
  assert.equal(singleCalls[0].repositoryId, 'repo-1');
  assert.equal(singleCalls[0].dto.forceRerun, true);
  assert.equal(singleCalls[0].triggeredBy, 'legacy_claude_review_redirect');
  assert.equal(
    singleCalls[0].options.metadata.routerTaskIntent,
    'review',
  );
  assert.deepEqual(recomputeCalls, ['2026-03-31']);
});
