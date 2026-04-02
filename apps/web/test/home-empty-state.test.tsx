import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomePageShellFallback } from '../src/components/repositories/home-empty-state-fallback';
import { HomeNewOpportunitiesStrip } from '../src/components/repositories/home-featured-repositories';
import { HomeSecondaryLinks } from '../src/components/repositories/home-runtime-status';
import { buildHomeEmptyStateViewModel } from '../src/lib/home-empty-state-view-model';
import type { RepositoryListItem } from '../src/lib/types/repository';
import { createRepositoryFixture } from './helpers/repository-fixture';

function createHomepageRepository(
  index: number,
  overrides: Partial<RepositoryListItem> = {},
) {
  const base = createRepositoryFixture({
    id: `repo-${index}`,
    name: `repo-${index}`,
    fullName: `acme/repo-${index}`,
    htmlUrl: `https://github.com/acme/repo-${index}`,
    stars: 200 - index,
    createdAtGithub: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    ...(overrides as Record<string, unknown>),
  });

  return base as unknown as RepositoryListItem;
}

test('home empty state renders exactly one primary CTA when no new opportunities remain', () => {
  const html = renderToStaticMarkup(
    <HomeNewOpportunitiesStrip
      items={[createHomepageRepository(1, { isFavorited: true })]}
    />,
  );
  const primaryMatches = html.match(/data-home-empty-primary-cta="true"/g) ?? [];

  assert.equal(primaryMatches.length, 1);
  assert.match(html, /当前没有新的高价值方向/);
  assert.match(html, /去收藏页继续收口/);
});

test('home empty state keeps secondary entry links visible without competing with the primary CTA', () => {
  const html = renderToStaticMarkup(
    <div>
      <HomeNewOpportunitiesStrip
        items={[createHomepageRepository(1, { isFavorited: true })]}
      />
      <HomeSecondaryLinks />
    </div>,
  );

  assert.match(html, /data-home-empty-primary-cta="true"/);
  assert.match(html, /收藏/);
  assert.match(html, /任务/);
  assert.match(html, /设置/);
  assert.match(html, /全部项目/);
});

test('homepage SSR shell keeps the empty-state CTA and secondary links crawlable', () => {
  const html = renderToStaticMarkup(<HomePageShellFallback />);
  const primaryMatches = html.match(/data-home-empty-primary-cta="true"/g) ?? [];

  assert.equal(primaryMatches.length, 1);
  assert.match(html, /data-home-empty-state="true"/);
  assert.match(html, /去完整机会池继续筛/);
  assert.doesNotMatch(html, /去收藏页继续收口/);
  assert.match(html, /其他入口/);
  assert.match(html, /全部项目/);
  assert.match(html, /收藏/);
  assert.match(html, /任务/);
  assert.match(html, /设置/);
  assert.match(html, /id="all-projects"/);
});

test('homepage with new opportunities does not fall back to the empty state card', () => {
  const items = [
    createHomepageRepository(1, { stars: 300 }),
    createHomepageRepository(2, { stars: 280 }),
    createHomepageRepository(3, { stars: 260 }),
    createHomepageRepository(4, { stars: 240 }),
    createHomepageRepository(5, { stars: 220 }),
  ];

  const html = renderToStaticMarkup(<HomeNewOpportunitiesStrip items={items} />);

  assert.doesNotMatch(html, /data-home-empty-state="true"/);
  assert.doesNotMatch(html, /data-home-empty-primary-cta="true"/);
  assert.match(html, /href="\/repositories\/repo-\d+"/);
});

test('home empty state primary CTA rule is centralized in one selector', () => {
  const tracked = buildHomeEmptyStateViewModel({
    trackedCandidates: [
      {
        isFavorited: true,
        actionStatus: 'NOT_STARTED',
      },
    ],
  });
  const noTrackedWork = buildHomeEmptyStateViewModel({
    trackedCandidates: [
      {
        isFavorited: false,
        actionStatus: 'NOT_STARTED',
      },
    ],
  });

  assert.equal(tracked.primaryAction.key, 'favorites');
  assert.equal(tracked.primaryAction.href, '/favorites');
  assert.equal(noTrackedWork.primaryAction.key, 'all_projects');
  assert.equal(noTrackedWork.primaryAction.href, '#all-projects');
});
