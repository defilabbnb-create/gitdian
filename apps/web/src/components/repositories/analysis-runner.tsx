'use client';

import Link from 'next/link';
import { startTransition, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnalysisRunConfig } from '@/components/repositories/analysis-run-config';
import { getUserBehaviorSignalPayload } from '@/lib/action-loop';
import { enqueueRepositoryAnalysis } from '@/lib/api/repositories';
import { EnqueuedTaskResponse, RunAnalysisRequest } from '@/lib/types/repository';

type AnalysisRunRunnerProps = {
  repositoryId: string;
  categoryLabel?: string | null;
  projectType?: string | null;
  targetUsersLabel?: string | null;
  useCaseLabel?: string | null;
  patternKeys?: string[];
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
};

const defaultConfig: Required<RunAnalysisRequest> = {
  runFastFilter: true,
  runCompleteness: true,
  runIdeaFit: true,
  runIdeaExtract: true,
  forceRerun: false,
  userSuccessPatterns: [],
  userFailurePatterns: [],
  preferredCategories: [],
  avoidedCategories: [],
  recentValidatedWins: [],
  recentDroppedReasons: [],
  userPreferencePriorityBoost: 0,
  userPreferencePriorityReasons: [],
};

export function AnalysisRunner({
  repositoryId,
  categoryLabel,
  projectType,
  targetUsersLabel,
  useCaseLabel,
  patternKeys,
  hasRealUser,
  hasClearUseCase,
  isDirectlyMonetizable,
}: AnalysisRunRunnerProps) {
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
      const nextTask = await enqueueRepositoryAnalysis(repositoryId, {
        ...config,
        ...getUserBehaviorSignalPayload({
          categoryLabel,
          projectType,
          targetUsersLabel,
          useCaseLabel,
          patternKeys,
          hasRealUser,
          hasClearUseCase,
          isDirectlyMonetizable,
          currentActionStatus: 'NOT_STARTED',
        }),
      });
      setTask(nextTask);
      setSuccessMessage(
        config.forceRerun
          ? '这个项目已重新进入判断队列，稍后回来查看新结论。'
          : '这个项目已经进入判断队列，稍后回来查看新结论。',
      );

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '补跑判断失败，请稍后重试。',
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
              补跑判断
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              当你要重新核对这个项目时，用这里补跑主判断链路。
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
          <span className="rounded-full border border-white/10 bg-black/10 px-3 py-1">
            已选步骤 {selectedCount}/4
          </span>
          {config.forceRerun ? (
            <span className="rounded-full border border-amber-300/40 bg-amber-50/10 px-3 py-1 text-amber-100">
              强制重跑
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
            {isRunning ? '补跑中...' : config.forceRerun ? '重新补跑判断' : '立即补跑判断'}
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
            查看执行记录
          </Link>
        ) : null}
      </div>
    </div>
  );
}
