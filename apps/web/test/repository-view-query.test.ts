import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getActiveRepositoryViewPresetKeys,
  stripActiveRepositoryViewPresetFilters,
  type RepositoryListQueryState,
} from '../src/lib/types/repository';

function createQuery(
  overrides: Partial<RepositoryListQueryState> = {},
): RepositoryListQueryState {
  return {
    page: 1,
    pageSize: 20,
    view: 'moneyFirst',
    displayMode: 'insight',
    sortBy: 'moneyPriority',
    order: 'desc',
    ...overrides,
  };
}

test('stripActiveRepositoryViewPresetFilters removes only active view preset fields', () => {
  const query = createQuery({
    view: 'bestIdeas',
    sortBy: 'insightPriority',
    order: 'desc',
    hasGoodInsight: true,
    finalVerdict: 'GOOD',
    finalCategory: '开发工具',
    recommendedAction: 'BUILD',
  });

  const stripped = stripActiveRepositoryViewPresetFilters(query);

  assert.deepEqual(
    getActiveRepositoryViewPresetKeys(query).sort(),
    ['finalVerdict', 'hasGoodInsight', 'order', 'sortBy'].sort(),
  );
  assert.equal(stripped.finalVerdict, undefined);
  assert.equal(stripped.hasGoodInsight, undefined);
  assert.equal(stripped.sortBy, undefined);
  assert.equal(stripped.order, undefined);
  assert.equal(stripped.finalCategory, '开发工具');
  assert.equal(stripped.recommendedAction, 'BUILD');
});

test('stripActiveRepositoryViewPresetFilters preserves fields the user already overrode', () => {
  const query = createQuery({
    view: 'bestIdeas',
    sortBy: 'stars',
    order: 'asc',
    hasGoodInsight: true,
    finalVerdict: 'BAD',
    keyword: 'token',
  });

  const stripped = stripActiveRepositoryViewPresetFilters(query);

  assert.deepEqual(getActiveRepositoryViewPresetKeys(query), ['hasGoodInsight']);
  assert.equal(stripped.hasGoodInsight, undefined);
  assert.equal(stripped.finalVerdict, 'BAD');
  assert.equal(stripped.sortBy, 'stars');
  assert.equal(stripped.order, 'asc');
  assert.equal(stripped.keyword, 'token');
});

test('stripActiveRepositoryViewPresetFilters clears hidden radar presets but keeps manual filters', () => {
  const query = createQuery({
    view: 'backfilledPromising',
    sortBy: 'createdAtGithub',
    order: 'desc',
    createdAfterDays: 365,
    hasPromisingIdeaSnapshot: true,
    keyword: 'audio',
    finalCategory: '自动化工具',
  });

  const stripped = stripActiveRepositoryViewPresetFilters(query);

  assert.deepEqual(
    getActiveRepositoryViewPresetKeys(query).sort(),
    ['createdAfterDays', 'hasPromisingIdeaSnapshot', 'order', 'sortBy'].sort(),
  );
  assert.equal(stripped.createdAfterDays, undefined);
  assert.equal(stripped.hasPromisingIdeaSnapshot, undefined);
  assert.equal(stripped.sortBy, undefined);
  assert.equal(stripped.order, undefined);
  assert.equal(stripped.keyword, 'audio');
  assert.equal(stripped.finalCategory, '自动化工具');
});
