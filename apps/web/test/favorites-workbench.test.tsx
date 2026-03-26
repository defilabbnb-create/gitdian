import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FavoriteListItem } from '../src/components/favorites/favorite-list-item';
import { FavoritesFollowUpBoard } from '../src/components/favorites/favorites-follow-up-board';
import type { FavoriteWithRepositorySummary } from '../src/lib/types/repository';
import { createRepositoryFixture } from './helpers/repository-fixture';

function createFavoriteFixture(
  overrides: Partial<FavoriteWithRepositorySummary> = {},
) {
  const repository =
    (overrides.repository as FavoriteWithRepositorySummary['repository']) ??
    (createRepositoryFixture() as unknown as FavoriteWithRepositorySummary['repository']);

  return {
    id: 'favorite-1',
    repositoryId: repository.id,
    note: '继续看这个项目是否真的适合拿来做验证。',
    priority: 'HIGH',
    createdAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T04:00:00.000Z',
    repository,
    ...overrides,
  } satisfies FavoriteWithRepositorySummary;
}

function createProvisionalFavorite() {
  return createFavoriteFixture({
    repository: createRepositoryFixture({
      analysis: {
        deepAnalysisStatus: 'NOT_STARTED',
        ideaFitJson: null,
        extractedIdeaJson: null,
        completenessJson: null,
      },
      analysisState: {
        analysisStatus: 'DISPLAY_READY',
        displayStatus: 'BASIC_READY',
        deepReady: false,
        fullDeepReady: false,
        lightDeepReady: false,
        fullyAnalyzed: false,
        incompleteReason: 'NO_DEEP_ANALYSIS',
        incompleteReasons: ['NO_DEEP_ANALYSIS'],
      },
    }) as unknown as FavoriteWithRepositorySummary['repository'],
  });
}

test('each favorite follow-up card renders exactly one primary CTA', () => {
  const html = renderToStaticMarkup(
    <FavoritesFollowUpBoard items={[createFavoriteFixture()]} />,
  );
  const matches = html.match(/data-favorite-primary-cta="true"/g) ?? [];

  assert.equal(matches.length, 1);
});

test('follow-up board main card uses one merged status summary instead of separate badges', () => {
  const html = renderToStaticMarkup(
    <FavoritesFollowUpBoard items={[createProvisionalFavorite()]} />,
  );

  assert.match(html, /data-testid="favorites-follow-up-card"/);
  assert.match(html, /data-favorite-status-summary="true"/);
  assert.doesNotMatch(html, /跟进优先级/);
  assert.doesNotMatch(html, /当前状态 ·/);
  assert.doesNotMatch(html, /当前阶段 ·/);
  assert.doesNotMatch(html, /保守判断 · 仅供参考/);
});

test('follow-up board main card does not flatten edit, github, or state-change actions', () => {
  const html = renderToStaticMarkup(
    <FavoritesFollowUpBoard items={[createProvisionalFavorite()]} />,
  );

  assert.match(html, /data-testid="favorites-follow-up-card"/);
  assert.match(html, /调整跟进状态与更多操作/);
  assert.doesNotMatch(html, /编辑收藏/);
  assert.doesNotMatch(html, /去 GitHub/);
  assert.doesNotMatch(html, /推进到尝试/);
  assert.doesNotMatch(html, /暂停观察/);
  assert.doesNotMatch(html, /放弃/);
});

test('favorite cards no longer flatten state-change actions on the first screen', () => {
  const html = renderToStaticMarkup(
    <FavoriteListItem favorite={createProvisionalFavorite()} showRemoveAction={false} />,
  );

  assert.match(html, /调整状态与更多操作/);
  assert.doesNotMatch(html, /暂停观察/);
  assert.doesNotMatch(html, /放弃/);
  assert.doesNotMatch(html, /去 GitHub/);
});

test('edit favorite is downshifted behind the secondary actions entry', () => {
  const html = renderToStaticMarkup(
    <FavoriteListItem favorite={createFavoriteFixture()} showRemoveAction={false} />,
  );

  assert.match(html, /调整状态与更多操作/);
  assert.doesNotMatch(html, /编辑收藏/);
});

test('favorite cards keep the first screen compact while preserving the next step', () => {
  const html = renderToStaticMarkup(
    <FavoriteListItem favorite={createFavoriteFixture()} showRemoveAction={false} />,
  );
  const summaryCards = html.match(/data-favorite-summary-card="true"/g) ?? [];

  assert.equal(summaryCards.length, 3);
  assert.match(html, /现在值不值得继续跟/);
  assert.match(html, /最近有没有变化/);
  assert.match(html, /下一步做什么/);
  assert.doesNotMatch(html, /跟进优先级/);
  assert.doesNotMatch(html, /当前状态/);
  assert.doesNotMatch(html, /当前阶段/);
});
