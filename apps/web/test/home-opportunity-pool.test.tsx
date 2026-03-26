import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OpportunityPoolPanelContent } from '../src/components/repositories/home-opportunity-pool';
import {
  createOpportunityPoolIdleState,
  getOpportunityPoolViewState,
  reduceOpportunityPoolState,
  shouldLoadOpportunityPool,
} from '../src/lib/opportunity-pool-state';
import type {
  RepositoryListQueryState,
  RepositoryListResponse,
} from '../src/lib/types/repository';
import { createRepositoryFixture } from './helpers/repository-fixture';

const baseQuery: RepositoryListQueryState = {
  page: 1,
  pageSize: 24,
  view: 'moneyFirst',
  displayMode: 'insight',
  sortBy: 'moneyPriority',
  order: 'desc',
};

function createResponse(
  overrides: Partial<RepositoryListResponse> = {},
): RepositoryListResponse {
  return {
    items: [createRepositoryFixture()],
    pagination: {
      page: 1,
      pageSize: 24,
      total: 1,
      totalPages: 1,
    },
    ...overrides,
  };
}

function renderPanelContent(htmlState: Parameters<typeof OpportunityPoolPanelContent>[0]) {
  return renderToStaticMarkup(<OpportunityPoolPanelContent {...htmlState} />);
}

test('expanded opportunity pool shows repository list after success', () => {
  const html = renderPanelContent({
    notice: null,
    query: baseQuery,
    loadState: {
      status: 'success',
      queryKey: 'query:success',
      response: createResponse(),
    },
    onRetry: () => {},
    showRefinementControls: false,
    showInteractiveList: false,
  });

  assert.match(html, /acme\/repo-1/);
  assert.match(html, /data-opportunity-pool-state="success"/);
  assert.match(html, /data-opportunity-pool-view="success"/);
  assert.match(html, /data-opportunity-pool-list="true"/);
  assert.doesNotMatch(html, /data-opportunity-pool-skeleton="true"/);
});

test('expanded opportunity pool shows empty state when request returns no items', () => {
  const html = renderPanelContent({
    notice: null,
    query: baseQuery,
    loadState: {
      status: 'empty',
      queryKey: 'query:empty',
      response: createResponse({
        items: [],
        pagination: {
          page: 1,
          pageSize: 24,
          total: 0,
          totalPages: 0,
        },
      }),
    },
    onRetry: () => {},
    showRefinementControls: false,
    showInteractiveList: false,
  });

  assert.match(html, /完整机会池当前没有可展示项目/);
  assert.match(html, /data-opportunity-pool-state="empty"/);
  assert.match(html, /data-opportunity-pool-empty="true"/);
  assert.doesNotMatch(html, /data-opportunity-pool-skeleton="true"/);
});

test('expanded opportunity pool shows error state and retry instead of permanent skeleton', () => {
  const html = renderPanelContent({
    notice: null,
    query: baseQuery,
    loadState: {
      status: 'error',
      queryKey: 'query:error',
      errorMessage: '完整机会池加载超时了，请重试一次。',
    },
    onRetry: () => {},
    showRefinementControls: false,
    showInteractiveList: false,
  });

  assert.match(html, /完整机会池暂时无法加载/);
  assert.match(html, /重试/);
  assert.match(html, /data-opportunity-pool-state="error"/);
  assert.match(html, /data-opportunity-pool-error="true"/);
  assert.doesNotMatch(html, /data-opportunity-pool-skeleton="true"/);
});

test('collapse and re-expand can re-enter loading instead of getting stuck', () => {
  const queryKey = 'query:retry';
  let state = createOpportunityPoolIdleState(queryKey);

  assert.equal(
    shouldLoadOpportunityPool(state, {
      isExpanded: true,
      queryKey,
    }),
    true,
  );

  state = reduceOpportunityPoolState(state, {
    type: 'start',
    queryKey,
  });
  assert.equal(state.status, 'loading');

  state = reduceOpportunityPoolState(state, {
    type: 'collapse',
    queryKey,
  });
  assert.equal(state.status, 'idle');

  assert.equal(
    shouldLoadOpportunityPool(state, {
      isExpanded: true,
      queryKey,
    }),
    true,
  );
});

test('collapsed view is explicit before the full opportunity pool is expanded', () => {
  const state = createOpportunityPoolIdleState('query:collapsed');

  assert.equal(
    getOpportunityPoolViewState(state, {
      isExpanded: false,
    }),
    'collapsed',
  );

  assert.equal(
    getOpportunityPoolViewState(state, {
      isExpanded: true,
    }),
    'loading',
  );
});

test('skeleton renders only while opportunity pool is loading', () => {
  const loadingHtml = renderPanelContent({
    notice: null,
    query: baseQuery,
    loadState: {
      status: 'loading',
      queryKey: 'query:loading',
    },
    onRetry: () => {},
    showRefinementControls: false,
    showInteractiveList: false,
  });
  const successHtml = renderPanelContent({
    notice: null,
    query: baseQuery,
    loadState: {
      status: 'success',
      queryKey: 'query:success',
      response: createResponse(),
    },
    onRetry: () => {},
    showRefinementControls: false,
    showInteractiveList: false,
  });

  assert.match(loadingHtml, /data-opportunity-pool-skeleton="true"/);
  assert.doesNotMatch(successHtml, /data-opportunity-pool-skeleton="true"/);
});
