import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHomeFastDefaultQuery,
  resolveHomeRepositoriesTimeoutMs,
  shouldFallbackHomeRepositories,
  shouldUseFastHomeDefaultQuery,
} from '../src/lib/home-repositories-policy';
import { normalizeRepositoryListQuery } from '../src/lib/types/repository';

test('home repositories timeout stays fast for default homepage request', () => {
  const query = normalizeRepositoryListQuery({});

  assert.equal(
    resolveHomeRepositoriesTimeoutMs({
      query,
      rawSearchParams: {},
    }),
    4_000,
  );
  assert.equal(shouldUseFastHomeDefaultQuery({}), true);
});

test('home repositories timeout relaxes for explicit filtered queries', () => {
  const rawSearchParams = {
    pageSize: '24',
    finalCategory: '效率工具',
    recommendedAction: 'CLONE',
    sortBy: 'moneyPriority',
  };
  const query = normalizeRepositoryListQuery(rawSearchParams);

  assert.equal(
    resolveHomeRepositoriesTimeoutMs({
      query,
      rawSearchParams,
    }),
    20_000,
  );
  assert.equal(shouldFallbackHomeRepositories(query), false);
});

test('home fast default query normalizes to money-first preset', () => {
  const query = normalizeRepositoryListQuery({
    pageSize: '12',
  });
  const nextQuery = buildHomeFastDefaultQuery(query);

  assert.equal(nextQuery.view, 'moneyFirst');
  assert.equal(nextQuery.sortBy, 'moneyPriority');
  assert.equal(nextQuery.order, 'desc');
  assert.equal(nextQuery.pageSize, 24);
});
