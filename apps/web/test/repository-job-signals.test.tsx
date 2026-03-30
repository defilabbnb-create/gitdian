import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecentJobItem } from '../src/components/repositories/recent-job-item';
import { RepositoryRelatedJobItem } from '../src/components/repositories/repository-related-job-item';
import { RepositoryRelatedJobs } from '../src/components/repositories/repository-related-jobs';
import type { JobLogItem, JobLogListResponse } from '../src/lib/types/repository';

function createJobFixture(overrides: Partial<JobLogItem> = {}): JobLogItem {
  return {
    id: 'job-1',
    jobName: 'analysis.run_single',
    jobStatus: 'PENDING',
    payload: {
      repositoryId: 'repo-1',
    },
    result: null,
    errorMessage: null,
    createdAt: '2026-03-31T08:00:00.000Z',
    updatedAt: '2026-03-31T08:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function createJobsResponse(items: JobLogItem[]): JobLogListResponse {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 5,
      total: items.length,
      totalPages: 1,
    },
  };
}

test('related jobs panel surfaces failure-first triage signal before the task list', () => {
  const html = renderToStaticMarkup(
    <RepositoryRelatedJobs
      repositoryId="repo-1"
      jobs={createJobsResponse([
        createJobFixture({ id: 'failed-1', jobStatus: 'FAILED', errorMessage: 'timeout' }),
        createJobFixture({ id: 'pending-1', jobStatus: 'PENDING' }),
        createJobFixture({ id: 'success-1', jobStatus: 'SUCCESS' }),
      ])}
      errorMessage={null}
    />,
  );

  assert.match(html, /当前有失败任务，先查失败原因/);
  assert.match(html, /失败 1 · 运行中 0 · 排队 1 · 成功 1/);
  assert.match(html, /先打开最近失败任务看错误信息，确认根因后再决定是否补跑/);
});

test('recent job item uses localized array count wording', () => {
  const html = renderToStaticMarkup(
    <RecentJobItem
      job={createJobFixture({
        payload: {
          repositoryId: 'repo-1',
          steps: ['ideaFit', 'ideaExtract'],
        },
        result: {
          completed: ['ideaFit'],
        },
      })}
    />,
  );

  assert.match(html, /steps: 2 个条目/);
  assert.match(html, /completed: 1 个条目/);
  assert.doesNotMatch(html, /item\(s\)/);
});

test('repository related job item shows execution signal and localized array count wording', () => {
  const html = renderToStaticMarkup(
    <RepositoryRelatedJobItem
      job={createJobFixture({
        jobStatus: 'FAILED',
        payload: {
          repositoryId: 'repo-1',
          attempts: [1, 2, 3],
        },
      })}
    />,
  );

  assert.match(html, /执行信号：执行失败，需要先查错误原因/);
  assert.match(html, /attempts: 3 个条目/);
  assert.doesNotMatch(html, /item\(s\)/);
});
