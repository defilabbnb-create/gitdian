'use client';

import Link from 'next/link';
import { startTransition, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { enqueueGitHubRepositories } from '@/lib/api/github';
import {
  EnqueuedTaskResponse,
  FetchRepositoriesRequest,
} from '@/lib/types/repository';
import { SettingsPayload } from '@/lib/types/settings';
import { GitHubFetchConfig } from './github-fetch-config';

type GitHubFetchRunnerProps = {
  githubDefaults?: SettingsPayload['github'] | null;
};

const initialConfig: FetchRepositoriesRequest = {
  mode: undefined,
  sort: undefined,
  order: undefined,
  perPage: undefined,
  starMin: undefined,
  starMax: undefined,
  pushedAfter: undefined,
  language: undefined,
  runFastFilter: undefined,
  query: undefined,
  page: undefined,
};

export function GitHubFetchRunner({
  githubDefaults,
}: GitHubFetchRunnerProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<FetchRepositoriesRequest>(initialConfig);
  const [task, setTask] = useState<EnqueuedTaskResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const hasOverrides = useMemo(
    () =>
      Object.values(config).some(
        (value) => value !== undefined && value !== null && value !== '',
      ),
    [config],
  );

  function buildPayload() {
    const payload: FetchRepositoriesRequest = {};

    if (config.mode) payload.mode = config.mode;
    if (config.query) payload.query = config.query;
    if (config.sort) payload.sort = config.sort;
    if (config.order) payload.order = config.order;
    if (typeof config.perPage === 'number') payload.perPage = config.perPage;
    if (typeof config.page === 'number') payload.page = config.page;
    if (typeof config.starMin === 'number') payload.starMin = config.starMin;
    if (typeof config.starMax === 'number') payload.starMax = config.starMax;
    if (config.pushedAfter) payload.pushedAfter = config.pushedAfter;
    if (config.language) payload.language = config.language;
    if (typeof config.runFastFilter === 'boolean') {
      payload.runFastFilter = config.runFastFilter;
    }

    return payload;
  }

  async function handleRun() {
    setIsRunning(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const nextTask = await enqueueGitHubRepositories(buildPayload());
      setTask(nextTask);
      setSuccessMessage('GitHub 采集任务已创建，最近任务摘要正在刷新。');

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'GitHub 采集失败，请稍后重试。',
      );
    } finally {
      setIsRunning(false);
    }
  }

  function handleResetOverrides() {
    setConfig(initialConfig);
  }

  return (
    <section className="space-y-4 rounded-[32px] border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            GitHub Fetch
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            直接按系统默认配置采集一批 GitHub 仓库。
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            默认情况下会让后端自动使用 /settings 里保存的 GitHub 采集配置。只有你展开高级选项并填写覆盖值时，才会带上自定义参数。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {hasOverrides ? (
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
              使用高级覆盖参数
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              使用系统默认配置 · {githubDefaults?.search.defaultMode === 'created' ? '最近创建项目' : '最近更新项目'}
            </span>
          )}
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? '采集中...' : '一键采集 GitHub'}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {isExpanded ? '收起高级选项' : '高级选项'}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
          <GitHubFetchConfig
            value={config}
            defaults={githubDefaults}
            disabled={isRunning}
            onChange={setConfig}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleResetOverrides}
              disabled={isRunning}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              清空高级覆盖
            </button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      {task ? (
        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Task Created
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                GitHub 采集已进入后台队列
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                任务 ID：{task.jobId} · 本次模式：
                {buildPayload().mode === 'created'
                  ? ' 最近创建项目'
                  : ' 最近更新项目'}
              </p>
            </div>

            <Link
              href={`/jobs?focusJobId=${task.jobId}#job-${task.jobId}`}
              className="inline-flex items-center rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              去任务页查看
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
