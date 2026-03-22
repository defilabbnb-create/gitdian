'use client';

import Link from 'next/link';
import { startTransition, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { enqueueBatchRepositoryAnalysis } from '@/lib/api/repositories';
import {
  EnqueuedTaskResponse,
  RepositoryListItem,
  RunBatchAnalysisRequest,
} from '@/lib/types/repository';
import { BatchAnalysisRunConfig } from './batch-analysis-run-config';

type BatchAnalysisRunnerProps = {
  repositories: RepositoryListItem[];
};

type BatchAnalysisMode = 'currentPage' | 'missing';

export function BatchAnalysisRunner({
  repositories,
}: BatchAnalysisRunnerProps) {
  const router = useRouter();
  const currentPageLimit = Math.min(repositories.length || 10, 100);
  const [mode, setMode] = useState<BatchAnalysisMode>('missing');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [task, setTask] = useState<EnqueuedTaskResponse | null>(null);
  const [config, setConfig] = useState<RunBatchAnalysisRequest>({
    onlyIfMissing: true,
    limit: currentPageLimit || 10,
    runFastFilter: true,
    runCompleteness: true,
    runIdeaFit: true,
    runIdeaExtract: true,
    forceRerun: false,
  });

  const selectedCount = useMemo(
    () =>
      [
        config.runFastFilter,
        config.runCompleteness,
        config.runIdeaFit,
        config.runIdeaExtract,
      ].filter(Boolean).length,
    [config],
  );

  function buildPayload(): RunBatchAnalysisRequest {
    if (mode === 'currentPage') {
      return {
        repositoryIds: repositories.map((repository) => repository.id),
        limit: repositories.length,
        runFastFilter: config.runFastFilter,
        runCompleteness: config.runCompleteness,
        runIdeaFit: config.runIdeaFit,
        runIdeaExtract: config.runIdeaExtract,
        forceRerun: config.forceRerun,
      };
    }

    return {
      onlyIfMissing: config.onlyIfMissing ?? true,
      limit: config.limit ?? currentPageLimit,
      runFastFilter: config.runFastFilter,
      runCompleteness: config.runCompleteness,
      runIdeaFit: config.runIdeaFit,
      runIdeaExtract: config.runIdeaExtract,
      forceRerun: config.forceRerun,
    };
  }

  async function handleRun() {
    setIsRunning(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const nextTask = await enqueueBatchRepositoryAnalysis(buildPayload());
      setTask(nextTask);
      setSuccessMessage('批量分析任务已创建，首页摘要和任务页会继续更新。');

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '批量分析失败，请稍后重试。',
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="space-y-4 rounded-[32px] border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Batch Analysis
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            先用一个轻入口，把这一页或缺失结果的仓库批量补分析。
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            当前支持两种模式：直接对“当前页仓库”执行，或者让后端按
            `onlyIfMissing + limit` 自动挑选缺少分析结果的仓库。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
            已选步骤 {selectedCount}/4
          </span>
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || selectedCount === 0}
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? '批量运行中...' : '批量运行分析'}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {isExpanded ? '收起配置' : '展开配置'}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <BatchAnalysisRunConfig
          mode={mode}
          value={config}
          disabled={isRunning}
          defaultCurrentPageLimit={currentPageLimit || 10}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            setConfig((current) => ({
              ...current,
              limit:
                nextMode === 'currentPage'
                  ? Math.min(repositories.length || 10, 100)
                  : current.limit ?? currentPageLimit,
            }));
          }}
          onChange={setConfig}
        />
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
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Batch Analysis Task
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                批量分析已进入后台队列
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                任务 ID：{task.jobId}。这次不会阻塞首页等待整批跑完，你可以先继续浏览仓库，再去任务页看进度和重试结果。
              </p>
            </div>

            <Link
              href={`/jobs?focusJobId=${task.jobId}#job-${task.jobId}`}
              className="inline-flex rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              去任务页查看
            </Link>
          </div>
        </section>
      ) : null}
    </section>
  );
}
