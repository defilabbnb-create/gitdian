'use client';

import Link from 'next/link';
import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserBehaviorSignalPayload } from '@/lib/action-loop';
import { enqueueRepositoryAnalysis } from '@/lib/api/repositories';
import {
  EnqueuedTaskResponse,
  RunAnalysisRequest,
} from '@/lib/types/repository';

type AnalysisStepRunnerProps = {
  repositoryId: string;
  step: 'completeness' | 'ideaFit' | 'ideaExtract' | 'fastFilter';
  labelOverride?: string;
  runningLabelOverride?: string;
  successLabelOverride?: string;
  categoryLabel?: string | null;
  projectType?: string | null;
  targetUsersLabel?: string | null;
  useCaseLabel?: string | null;
  patternKeys?: string[];
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
};

const stepConfigMap: Record<
  AnalysisStepRunnerProps['step'],
  {
    label: string;
    runningLabel: string;
    successLabel: string;
    payload: Required<RunAnalysisRequest>;
  }
> = {
  completeness: {
    label: '重新运行完整性分析',
    runningLabel: '完整性分析运行中...',
    successLabel: '完整性分析已刷新。',
    payload: {
      runFastFilter: false,
      runCompleteness: true,
      runIdeaFit: false,
      runIdeaExtract: false,
      forceRerun: true,
      userSuccessPatterns: [],
      userFailurePatterns: [],
      preferredCategories: [],
      avoidedCategories: [],
      recentValidatedWins: [],
      recentDroppedReasons: [],
      userPreferencePriorityBoost: 0,
      userPreferencePriorityReasons: [],
    },
  },
  ideaFit: {
    label: '重新运行创业评分',
    runningLabel: '创业评分运行中...',
    successLabel: '创业评分已刷新。',
    payload: {
      runFastFilter: false,
      runCompleteness: false,
      runIdeaFit: true,
      runIdeaExtract: false,
      forceRerun: true,
      userSuccessPatterns: [],
      userFailurePatterns: [],
      preferredCategories: [],
      avoidedCategories: [],
      recentValidatedWins: [],
      recentDroppedReasons: [],
      userPreferencePriorityBoost: 0,
      userPreferencePriorityReasons: [],
    },
  },
  ideaExtract: {
    label: '重新提取点子',
    runningLabel: '点子提取运行中...',
    successLabel: '点子提取已刷新。',
    payload: {
      runFastFilter: false,
      runCompleteness: false,
      runIdeaFit: false,
      runIdeaExtract: true,
      forceRerun: true,
      userSuccessPatterns: [],
      userFailurePatterns: [],
      preferredCategories: [],
      avoidedCategories: [],
      recentValidatedWins: [],
      recentDroppedReasons: [],
      userPreferencePriorityBoost: 0,
      userPreferencePriorityReasons: [],
    },
  },
  fastFilter: {
    label: '重新运行粗筛',
    runningLabel: '粗筛运行中...',
    successLabel: '粗筛结果已刷新。',
    payload: {
      runFastFilter: true,
      runCompleteness: false,
      runIdeaFit: false,
      runIdeaExtract: false,
      forceRerun: true,
      userSuccessPatterns: [],
      userFailurePatterns: [],
      preferredCategories: [],
      avoidedCategories: [],
      recentValidatedWins: [],
      recentDroppedReasons: [],
      userPreferencePriorityBoost: 0,
      userPreferencePriorityReasons: [],
    },
  },
};

export function AnalysisStepRunner({
  repositoryId,
  step,
  labelOverride,
  runningLabelOverride,
  successLabelOverride,
  categoryLabel,
  projectType,
  targetUsersLabel,
  useCaseLabel,
  patternKeys,
  hasRealUser,
  hasClearUseCase,
  isDirectlyMonetizable,
}: AnalysisStepRunnerProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [task, setTask] = useState<EnqueuedTaskResponse | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const config = stepConfigMap[step];

  async function handleRun() {
    setIsRunning(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const nextTask = await enqueueRepositoryAnalysis(repositoryId, {
        ...config.payload,
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
      setSuccessMessage(successLabelOverride ?? config.successLabel);

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '补跑这一步失败，请稍后重试。',
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        onClick={handleRun}
        disabled={isRunning}
        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning
          ? runningLabelOverride ?? config.runningLabel
          : labelOverride ?? config.label}
      </button>

      {successMessage ? (
        <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <p>{successMessage}</p>
          {task ? (
            <p className="mt-1 text-xs leading-6 text-emerald-700/90">
              已创建任务 {task.jobId}，当前区块和关联任务记录会随着刷新更新。
            </p>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {task ? (
        <Link
          href={`/jobs?repositoryId=${repositoryId}&focusJobId=${task.jobId}#job-${task.jobId}`}
          className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          查看执行记录
        </Link>
      ) : null}
    </div>
  );
}
