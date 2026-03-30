import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FavoriteToggleButton } from '../src/components/repositories/favorite-toggle-button';

test('favorite toggle button uses follow-up naming for non-favorited repositories', () => {
  const html = renderToStaticMarkup(
    <FavoriteToggleButton repositoryId="repo-1" isFavorited={false} />,
  );

  assert.match(html, /加入跟进清单/);
  assert.match(html, /跟进清单就在收藏页，状态会自动同步/);
  assert.doesNotMatch(html, /加入收藏/);
});

test('favorite toggle button uses follow-up naming for favorited repositories', () => {
  const html = renderToStaticMarkup(
    <FavoriteToggleButton repositoryId="repo-1" isFavorited={true} />,
  );

  assert.match(html, /已在跟进清单/);
  assert.doesNotMatch(html, /已收藏/);
});
