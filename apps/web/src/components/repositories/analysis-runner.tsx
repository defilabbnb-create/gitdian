'use client';

import Link from 'next/link';
import { startTransition, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnalysisRunConfig } from '@/components/repositories/analysis-run-config';
import { enqueueRepositoryAnalysis } from '@/lib/api/repositories';
import { EnqueuedTaskResponse, RunAnalysisRequest } from '@/lib/types/repository';

type AnalysisRunRunnerProps = {
  repositoryId: string;
};

const defaultConfig: Required<RunAnalysisRequest> = {
  runFastFilter: true,
  runCompleteness: true,
  runIdeaFit: true,
  runIdeaExtract: true,
  forceRerun: false,
};

export function AnalysisRunner({ repositoryId }: AnalysisRunRunnerProps) {
  const router = useRouter();
  const [config, setConfig] = useState<RunAnalysisRequest>(defaultConfig);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [task, setTask] = useState<EnqueuedTaskResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  async function handleRun() {
    setIsRunning(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const nextTask = await enqueueRepositoryAnalysis(repositoryId, config);
      setTask(nextTask);
      setSuccessMessage(
        config.forceRerun
          ? '分析任务已重新入队，详情页和关联任务记录正在刷新。'
          : '分析任务已创建，详情页和关联任务记录正在刷新。',
      );

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '运行分析失败，请稍后重试。',
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="w-full space-y-3 xl:w-[320px]">
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Analysis Runner
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              一键串行执行粗筛、完整性、创业机会评分和点子提取。
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
          <span className="rounded-full border border-white/10 bg-black/10 px-3 py-1">
            已选步骤 {selectedCount}/4
          </span>
          {config.forceRerun ? (
            <span className="rounded-full border border-amber-300/40 bg-amber-50/10 px-3 py-1 text-amber-100">
              Force rerun
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || selectedCount === 0}
            className="inline-flex min-w-28 items-center justify-center rounded-full border border-sky-300/40 bg-sky-400/15 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? '分析运行中...' : config.forceRerun ? '重新分析' : '运行分析'}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
          >
            {isExpanded ? '收起配置' : '展开配置'}
          </button>
        </div>

        {isExpanded ? (
          <div className="mt-4">
            <AnalysisRunConfig
              value={config}
              disabled={isRunning}
              onChange={setConfig}
            />
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {successMessage}
          </p>
        ) : null}

        {task ? (
          <Link
            href={`/jobs?repositoryId=${repositoryId}&focusJobId=${task.jobId}#job-${task.jobId}`}
            className="mt-4 inline-flex items-center rounded-full border border-white/10 bg-black/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
          >
            查看任务记录
          </Link>
        ) : null}
      </div>
    </div>
  );
}
