'use client';

import Link from 'next/link';
import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { enqueueRepositoryAnalysis } from '@/lib/api/repositories';
import { getUserBehaviorSignalPayload } from '@/lib/action-loop';
import { EnqueuedTaskResponse } from '@/lib/types/repository';

type RepositoryDeepAnalysisActionsProps = {
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

export function RepositoryDeepAnalysisActions({
  repositoryId,
  categoryLabel,
  projectType,
  targetUsersLabel,
  useCaseLabel,
  patternKeys,
  hasRealUser,
  hasClearUseCase,
  isDirectlyMonetizable,
}: RepositoryDeepAnalysisActionsProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [task, setTask] = useState<EnqueuedTaskResponse | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRun() {
    setIsRunning(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const nextTask = await enqueueRepositoryAnalysis(repositoryId, {
        runFastFilter: false,
        runCompleteness: true,
        runIdeaFit: true,
        runIdeaExtract: true,
        forceRerun: true,
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
      setSuccessMessage('已经开始补分析，稍后刷新就能看到更完整的创业判断。');

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '立即补分析失败，请稍后重试。',
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleRun}
        disabled={isRunning}
        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? '补分析中...' : '立即补分析'}
      </button>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <p>{successMessage}</p>
          {task ? (
            <Link
              href={`/jobs?repositoryId=${repositoryId}&focusJobId=${task.jobId}#job-${task.jobId}`}
              className="mt-2 inline-flex text-sm font-semibold text-emerald-800 underline underline-offset-4"
            >
              查看执行记录
            </Link>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
