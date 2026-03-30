import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JobsExpandedFlow } from '../src/components/jobs/jobs-expanded-flow';
import { JobsPriorityBoard } from '../src/components/jobs/jobs-priority-board';
import {
  buildJobsPriorityViewModel,
  LONG_PENDING_MINUTES,
} from '../src/lib/job-priority-view-model';
import type {
  JobLogItem,
  JobLogQueryState,
  PaginationMeta,
} from '../src/lib/types/repository';

const baseQuery: JobLogQueryState = {
  page: 1,
  pageSize: 20,
};

const basePagination: PaginationMeta = {
  page: 1,
  pageSize: 20,
  total: 3,
  totalPages: 1,
};

function createJobFixture(overrides: Partial<JobLogItem> = {}): JobLogItem {
  return {
    id: 'job-1',
    jobName: 'analysis.run_single',
    jobStatus: 'PENDING',
    parentJobId: 'parent-1',
    payload: {
      repositoryId: 'repo-1',
      repositoryName: 'acme/repo-1',
    },
    result: null,
    errorMessage: null,
    attempts: 0,
    retryCount: 0,
    progress: 0,
    durationMs: null,
    createdAt: '2026-03-26T08:00:00.000Z',
    updatedAt: '2026-03-26T08:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function renderPriorityBoard(items: JobLogItem[]) {
  return renderToStaticMarkup(
    <JobsPriorityBoard items={items} query={baseQuery} />,
  );
}

test('same job type pending and running tasks are aggregated on the first screen', () => {
  const viewModel = buildJobsPriorityViewModel(
    [
      createJobFixture({ id: 'pending-1' }),
      createJobFixture({ id: 'pending-2', createdAt: '2026-03-26T08:01:00.000Z' }),
      createJobFixture({
        id: 'running-1',
        jobStatus: 'RUNNING',
        startedAt: '2026-03-26T08:05:00.000Z',
        updatedAt: '2026-03-26T08:05:00.000Z',
      }),
      createJobFixture({
        id: 'running-2',
        jobStatus: 'RUNNING',
        startedAt: '2026-03-26T08:06:00.000Z',
        updatedAt: '2026-03-26T08:06:00.000Z',
      }),
    ],
    baseQuery,
    new Date('2026-03-26T08:10:00.000Z').getTime(),
  );

  assert.equal(viewModel.anomalyGroups.length, 0);
  assert.equal(viewModel.attentionGroups.length, 2);
  assert.equal(viewModel.attentionGroups[0]?.count, 2);
  assert.equal(viewModel.attentionGroups[1]?.count, 2);
});

test('long-pending groups surface in the anomaly section first', () => {
  const viewModel = buildJobsPriorityViewModel(
    [
      createJobFixture({
        id: 'long-pending',
        createdAt: '2026-03-26T08:00:00.000Z',
      }),
      createJobFixture({
        id: 'regular-pending',
        createdAt: '2026-03-26T08:25:00.000Z',
      }),
    ],
    baseQuery,
    new Date('2026-03-26T08:30:00.000Z').getTime(),
  );

  assert.equal(viewModel.anomalyGroups.length, 1);
  assert.equal(viewModel.anomalyGroups[0]?.state, 'LONG_PENDING');
  assert.equal(viewModel.attentionGroups.length, 1);
  assert.equal(viewModel.attentionGroups[0]?.state, 'PENDING');
});

test('the first screen no longer repeats 待记录 placeholders', () => {
  const html = renderPriorityBoard([
    createJobFixture({ id: 'pending-1' }),
    createJobFixture({
      id: 'failed-1',
      jobStatus: 'FAILED',
      errorMessage: 'queue timeout',
    }),
  ]);

  assert.doesNotMatch(html, /待记录/);
});

test('the first screen includes stable aggregate text and selectors in SSR html', () => {
  const html = renderPriorityBoard([
    createJobFixture({ id: 'pending-1' }),
    createJobFixture({
      id: 'running-1',
      jobStatus: 'RUNNING',
      startedAt: '2026-03-26T08:05:00.000Z',
    }),
  ]);

  assert.match(html, /data-testid="jobs-priority-board"/);
  assert.match(html, /当前视图：聚合摘要/);
  assert.match(html, /聚合组数：2/);
  assert.match(html, /data-testid="jobs-aggregated-group"/);
});

test('the first screen renders one aggregate card for repeated same-type pending tasks', () => {
  const html = renderPriorityBoard([
    createJobFixture({ id: 'pending-1', jobName: 'snapshot.collect_seed' }),
    createJobFixture({
      id: 'pending-2',
      jobName: 'snapshot.collect_seed',
      createdAt: '2026-03-26T08:01:00.000Z',
    }),
    createJobFixture({
      id: 'pending-3',
      jobName: 'snapshot.collect_seed',
      createdAt: '2026-03-26T08:02:00.000Z',
    }),
  ]);
  const aggregateCards = html.match(/data-testid="jobs-aggregated-group"/g) ?? [];

  assert.equal(aggregateCards.length, 1);
  assert.match(html, /3 个任务/);
  assert.doesNotMatch(html, /健康状态摘要/);
});

test('steady-state first screen still renders a health aggregate card', () => {
  const html = renderPriorityBoard([]);

  assert.match(html, /data-testid="jobs-aggregated-group"/);
  assert.match(html, /当前没有需要首屏盯住的任务/);
  assert.match(html, /健康状态摘要/);
});

test('cancel task is not a first-screen high-priority action', () => {
  const html = renderPriorityBoard([
    createJobFixture({ id: 'pending-1' }),
    createJobFixture({
      id: 'running-1',
      jobStatus: 'RUNNING',
      startedAt: '2026-03-26T08:05:00.000Z',
    }),
  ]);

  assert.match(html, /查看任务详情/);
  assert.doesNotMatch(html, /取消任务/);
});

test('expanded full task flow still renders raw task details after drill-in', () => {
  const focusedJob = createJobFixture({
    id: 'focused-job',
    jobStatus: 'FAILED',
    payload: {
      repositoryId: 'repo-1',
      attempt: 2,
    },
    result: {
      queueState: 'FAILED',
    },
    errorMessage: 'worker crashed',
  });

  const html = renderToStaticMarkup(
    <JobsExpandedFlow
      items={[focusedJob]}
      pagination={basePagination}
      query={baseQuery}
      focusedJobId="focused-job"
      showFilters={false}
      showActions={false}
    />,
  );

  assert.match(html, /data-jobs-expanded-flow="expanded"/);
  assert.match(html, /data-testid="jobs-expanded-flow"/);
  assert.match(html, /单仓分析执行/);
  assert.match(html, /执行输入/);
  assert.match(html, /repositoryId/);
});
