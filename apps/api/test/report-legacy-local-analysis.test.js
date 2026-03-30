const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createEnqueueSummary,
  enqueueCandidates,
} = require('../dist/scripts/report-legacy-local-analysis');

function buildCandidate(overrides = {}) {
  const repoId = overrides.repoId ?? 'repo-1';
  return {
    repoId,
    moneyPriority: overrides.moneyPriority ?? 'P1',
    provider: overrides.provider ?? 'local',
    modelName: overrides.modelName ?? 'model-a',
    remediationReason: overrides.remediationReason ?? 'legacy_local_provider',
    extraMetadata: overrides.extraMetadata,
  };
}

test('enqueueCandidates uses bulk single-analysis enqueue when available', async () => {
  const bulkCalls = [];
  const singleCalls = [];
  const enqueueResult = createEnqueueSummary();

  const result = await enqueueCandidates({
    candidates: [buildCandidate({ repoId: 'repo-1' }), buildCandidate({ repoId: 'repo-2' })],
    remediationMode: 'legacy_local_provider_full_rerun',
    queueService: {
      enqueueSingleAnalysesBulk: async (entries, triggeredBy) => {
        bulkCalls.push({ entries, triggeredBy });
        return entries.map((_entry, index) => ({
          jobId: `job-${index + 1}`,
          queueName: 'analysis.single',
          queueJobId: `queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
      enqueueSingleAnalysis: async (...args) => {
        singleCalls.push(args);
      },
    },
    frozenAnalysisPoolService: {
      includeRepositoryIdsInFrozenPoolSnapshot: async () => {
        throw new Error('should not promote frozen pool members during happy path');
      },
    },
    enqueueResult,
    frozenPoolPromotion: null,
  });

  assert.equal(bulkCalls.length, 1);
  assert.equal(bulkCalls[0].triggeredBy, 'legacy_local_provider_full_rerun');
  assert.equal(bulkCalls[0].entries.length, 2);
  assert.equal(bulkCalls[0].entries[0].repositoryId, 'repo-1');
  assert.equal(bulkCalls[0].entries[0].dto.forceRerun, true);
  assert.equal(
    bulkCalls[0].entries[0].jobOptionsOverride.priority,
    16,
  );
  assert.equal(singleCalls.length, 0);
  assert.equal(enqueueResult.queuedCount, 2);
  assert.equal(enqueueResult.skippedCount, 0);
  assert.deepEqual(enqueueResult.queuedByPriority, {
    P1: 2,
  });
  assert.equal(result.frozenPoolPromotion, null);
});

test('enqueueCandidates falls back to single enqueue and retries after frozen-pool promotion', async () => {
  const bulkCalls = [];
  const singleCalls = [];
  const promotionCalls = [];
  const enqueueResult = createEnqueueSummary();
  let bulkAttempt = 0;

  const result = await enqueueCandidates({
    candidates: [
      buildCandidate({ repoId: 'repo-ok', moneyPriority: 'P0' }),
      buildCandidate({ repoId: 'repo-frozen', moneyPriority: 'P2' }),
    ],
    remediationMode: 'legacy_local_complete_suspect_rerun',
    queueService: {
      enqueueSingleAnalysesBulk: async (entries, triggeredBy) => {
        bulkAttempt += 1;
        bulkCalls.push({ entries, triggeredBy });
        if (bulkAttempt === 1) {
          throw new Error(
            'analysis_pool_frozen_non_member:analysis_single blocked=repo-frozen',
          );
        }
        return entries.map((_entry, index) => ({
          jobId: `retry-job-${index + 1}`,
          queueName: 'analysis.single',
          queueJobId: `retry-queue-job-${index + 1}`,
          jobStatus: 'PENDING',
        }));
      },
      enqueueSingleAnalysis: async (repositoryId) => {
        singleCalls.push(repositoryId);
        if (repositoryId === 'repo-frozen') {
          throw new Error(
            'analysis_pool_frozen_non_member:analysis_single blocked=repo-frozen',
          );
        }
      },
    },
    frozenAnalysisPoolService: {
      includeRepositoryIdsInFrozenPoolSnapshot: async (payload) => {
        promotionCalls.push(payload);
        return {
          requestedRepositoryCount: payload.repositoryIds.length,
          addedRepositoryCount: payload.repositoryIds.length,
          alreadyMemberCount: 0,
          unresolvedRepositoryCount: 0,
          totalRepositoryCount: payload.repositoryIds.length,
        };
      },
    },
    enqueueResult,
    frozenPoolPromotion: null,
  });

  assert.equal(bulkCalls.length, 2);
  assert.equal(bulkCalls[0].entries.length, 2);
  assert.equal(bulkCalls[1].entries.length, 1);
  assert.equal(bulkCalls[1].entries[0].repositoryId, 'repo-frozen');
  assert.equal(
    bulkCalls[1].entries[0].metadata.frozenPoolPromotionApplied,
    true,
  );
  assert.deepEqual(singleCalls, ['repo-ok', 'repo-frozen']);
  assert.deepEqual(promotionCalls, [
    {
      repositoryIds: ['repo-frozen'],
      reason: 'legacy_local_complete_suspect_rerun',
    },
  ]);
  assert.equal(enqueueResult.queuedCount, 2);
  assert.equal(enqueueResult.skippedCount, 0);
  assert.deepEqual(enqueueResult.queuedByPriority, {
    P0: 1,
    P2: 1,
  });
  assert.deepEqual(result.frozenPoolPromotion, {
    requestedRepositoryCount: 1,
    addedRepositoryCount: 1,
    alreadyMemberCount: 0,
    unresolvedRepositoryCount: 0,
    totalRepositoryCount: 1,
  });
});
