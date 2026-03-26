'use client';

import { startTransition, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createFavorite, updateFavorite } from '@/lib/api/favorites';
import { enqueueRepositoryAnalysis } from '@/lib/api/repositories';
import {
  appendActionLog,
  createOrMergeActionLoopEntry,
  getExecutionStatusLabel,
  getUserBehaviorSignalPayload,
  readActionLoopEntry,
} from '@/lib/action-loop';
import type { RepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';

type RepositoryNextStepsProps = {
  repoId: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  headline: string;
  reason: string;
  decisionViewModel: RepositoryDecisionViewModel;
  isFavorited: boolean;
  favoriteNote?: string | null;
  categoryLabel?: string | null;
  projectType?: string | null;
  targetUsersLabel?: string | null;
  useCaseLabel?: string | null;
  patternKeys?: string[];
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
};

type RepositoryNextStepsPanelProps = {
  decisionViewModel: RepositoryDecisionViewModel;
  statusLabel: string;
  htmlUrl: string;
  isSubmitting: boolean;
  isActiveFollowUp: boolean;
  feedback: string | null;
  errorMessage: string | null;
  onPrimaryAction?: () => void;
  onAddFollowUp?: () => void;
};

export function RepositoryNextSteps({
  repoId,
  name,
  fullName,
  htmlUrl,
  headline,
  reason,
  decisionViewModel,
  isFavorited,
  favoriteNote,
  categoryLabel,
  projectType,
  targetUsersLabel,
  useCaseLabel,
  patternKeys,
  hasRealUser,
  hasClearUseCase,
  isDirectlyMonetizable,
}: RepositoryNextStepsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFavoritedState, setIsFavoritedState] = useState(isFavorited);
  const [isActiveFollowUp, setIsActiveFollowUp] = useState(
    () => readActionLoopEntry(repoId)?.isActiveFollowUp ?? false,
  );
  const [statusLabel, setStatusLabel] = useState(() => {
    const current = readActionLoopEntry(repoId);
    return current ? getExecutionStatusLabel(current.actionStatus) : '未开始';
  });

  const entryBase = useMemo(
    () => ({
      repoId,
      repositoryName: name,
      repositoryFullName: fullName,
      htmlUrl,
      detailPath: `/repositories/${repoId}`,
      headline,
      reason,
      categoryLabel,
      projectType,
      targetUsersLabel,
      useCaseLabel,
      patternKeys,
      hasRealUser,
      hasClearUseCase,
      isDirectlyMonetizable,
    }),
    [
      categoryLabel,
      fullName,
      headline,
      htmlUrl,
      name,
      patternKeys,
      projectType,
      reason,
      repoId,
      targetUsersLabel,
      useCaseLabel,
      hasRealUser,
      hasClearUseCase,
      isDirectlyMonetizable,
    ],
  );

  async function handleQuickValidate() {
    setErrorMessage(null);
    setFeedback(null);
    createOrMergeActionLoopEntry(entryBase, {
      actionStatus: 'VALIDATING',
      followUpStage: 'VALIDATE',
      isActiveFollowUp: readActionLoopEntry(repoId)?.isActiveFollowUp ?? false,
      source: 'manual_click',
      confidence: 'medium',
    });
    appendActionLog('quick_validate_clicked', repoId);
    setStatusLabel('验证中');
    setFeedback('已开始验证，先从 README 和关键路径确认最关键证据。');
    window.open(`${htmlUrl}#readme-ov-file`, '_blank', 'noopener,noreferrer');
  }

  async function handleAnalyze() {
    setIsSubmitting(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      await enqueueRepositoryAnalysis(repoId, {
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

      setFeedback('已加入 deep 补分析队列，稍后刷新就能看到更完整的判断。');
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '补分析失败，请稍后重试。',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddFollowUp() {
    setIsSubmitting(true);
    setErrorMessage(null);
    setFeedback(null);
    const currentEntry = readActionLoopEntry(repoId);
    const nextStatus = currentEntry?.actionStatus ?? 'NOT_STARTED';
    const nextNote = favoriteNote?.trim()
      ? favoriteNote
      : '正在推进，下一步先验证用户、场景和收费路径。';

    createOrMergeActionLoopEntry(entryBase, {
      actionStatus: nextStatus,
      followUpStage: currentEntry?.followUpStage ?? 'OBSERVE',
      isActiveFollowUp: true,
      source: 'manual_click',
      confidence: 'medium',
    });
    appendActionLog('follow_up_added', repoId);
    setIsActiveFollowUp(true);
    setStatusLabel(getExecutionStatusLabel(nextStatus));
    setFeedback('已加入跟进列表，现在可以去任务页继续推进。');

    try {
      if (!isFavoritedState) {
        await createFavorite({
          repositoryId: repoId,
          priority: 'HIGH',
          note: nextNote,
        });
      } else {
        await updateFavorite(repoId, {
          priority: 'HIGH',
          note: nextNote,
        });
      }
      setIsFavoritedState(true);

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `已加入跟进列表，但收藏同步失败：${error.message}`
          : '已加入跟进列表，但收藏同步失败，请稍后再试。',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReviewEvidence() {
    setErrorMessage(null);
    setFeedback('先看证据和复核口径，再决定是否继续投入。');
    const evidenceSection = document.getElementById(
      'repository-evidence',
    ) as HTMLDetailsElement | null;

    if (evidenceSection) {
      evidenceSection.open = true;
      evidenceSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }

    window.location.hash = 'repository-evidence';
  }

  async function handlePrimaryAction() {
    if (decisionViewModel.detail.primaryActionIntent === 'analyze') {
      return handleAnalyze();
    }

    if (decisionViewModel.detail.primaryActionIntent === 'review') {
      handleReviewEvidence();
      return;
    }

    return handleQuickValidate();
  }

  return (
    <RepositoryNextStepsPanel
      decisionViewModel={decisionViewModel}
      statusLabel={statusLabel}
      htmlUrl={htmlUrl}
      isSubmitting={isSubmitting}
      isActiveFollowUp={isActiveFollowUp}
      feedback={feedback}
      errorMessage={errorMessage}
      onPrimaryAction={() => {
        void handlePrimaryAction();
      }}
      onAddFollowUp={() => {
        void handleAddFollowUp();
      }}
    />
  );
}

export function RepositoryNextStepsPanel({
  decisionViewModel,
  statusLabel,
  htmlUrl,
  isSubmitting,
  isActiveFollowUp,
  feedback,
  errorMessage,
  onPrimaryAction,
  onAddFollowUp,
}: RepositoryNextStepsPanelProps) {
  return (
    <section
      id="next-steps"
      className="rounded-[30px] border border-slate-200 bg-slate-50 px-5 py-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            行动区
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            只保留一个主动作，避免 CTA 互相竞争。
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {decisionViewModel.detail.primaryActionDescription}
          </p>
        </div>
        <span className="text-sm font-medium text-slate-600">
          当前状态：{statusLabel}
        </span>
      </div>

      <div className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Primary CTA
        </p>
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={isSubmitting}
          data-detail-primary-cta="true"
          className="mt-4 inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {decisionViewModel.detail.primaryActionLabel}
        </button>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          {decisionViewModel.display.reason}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAddFollowUp}
          disabled={isSubmitting || isActiveFollowUp}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isActiveFollowUp ? '已加入跟进' : '加入跟进'}
        </button>
        <a
          href={htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          查看 GitHub
        </a>
      </div>

      {feedback ? (
        <p className="mt-4 text-sm font-medium text-emerald-700">{feedback}</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-4 text-sm font-medium text-rose-700">{errorMessage}</p>
      ) : null}
    </section>
  );
}
