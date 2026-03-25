'use client';

import { startTransition, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createFavorite, updateFavorite } from '@/lib/api/favorites';
import {
  appendActionLog,
  createOrMergeActionLoopEntry,
  getExecutionStatusLabel,
  markValidationFailed,
  markValidationPassed,
  readActionLoopEntry,
} from '@/lib/action-loop';

type RepositoryNextStepsProps = {
  repoId: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  headline: string;
  reason: string;
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

export function RepositoryNextSteps({
  repoId,
  name,
  fullName,
  htmlUrl,
  headline,
  reason,
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

  async function handleStartProject() {
    setErrorMessage(null);
    setFeedback(null);
    createOrMergeActionLoopEntry(entryBase, {
      actionStatus: 'IN_PROGRESS',
      followUpStage: 'TRY',
      isActiveFollowUp: readActionLoopEntry(repoId)?.isActiveFollowUp ?? false,
      source: 'manual_click',
      confidence: 'medium',
    });
    appendActionLog('start_project_clicked', repoId);
    setStatusLabel('进行中');
    setFeedback('现在开始推进，先去仓库确认范围和落地方式。');
    window.open(htmlUrl, '_blank', 'noopener,noreferrer');
  }

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
    setFeedback('现在用 1 小时验证这个想法，先从 README 和关键路径下手。');
    window.open(`${htmlUrl}#readme-ov-file`, '_blank', 'noopener,noreferrer');
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

  function handleValidationPassed() {
    setErrorMessage(null);
    setFeedback(null);
    if (!readActionLoopEntry(repoId)) {
      createOrMergeActionLoopEntry(entryBase, {
        actionStatus: 'VALIDATING',
        followUpStage: 'VALIDATE',
        isActiveFollowUp: isActiveFollowUp || isFavoritedState,
        source: 'manual_click',
      });
    }
    const updated = markValidationPassed(repoId);
    if (updated) {
      setStatusLabel(getExecutionStatusLabel(updated.actionStatus));
      setIsActiveFollowUp(true);
      setFeedback('验证通过，先把它当成已完成机会，接下来去收藏页做最终决定。');
    }
  }

  function handleValidationFailed() {
    setErrorMessage(null);
    setFeedback(null);
    if (!readActionLoopEntry(repoId)) {
      createOrMergeActionLoopEntry(entryBase, {
        actionStatus: 'VALIDATING',
        followUpStage: 'VALIDATE',
        isActiveFollowUp: isActiveFollowUp || isFavoritedState,
        source: 'manual_click',
      });
    }
    const updated = markValidationFailed(repoId);
    if (updated) {
      setStatusLabel(getExecutionStatusLabel(updated.actionStatus));
      setIsActiveFollowUp(false);
      setFeedback('验证失败，首页会停止推荐它，后续只在需要时再回看。');
    }
  }

  return (
    <section
      id="next-steps"
      className="rounded-[30px] border border-slate-200 bg-slate-50 px-5 py-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            下一步
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            现在就开始行动
          </h3>
        </div>
        <span className="text-sm font-medium text-slate-600">
          当前状态：{statusLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-3">
        <ActionButton
          title="开始做这个项目"
          description="立即打开 GitHub，开始确认范围和落地方式。"
          onClick={handleStartProject}
        />
        <ActionButton
          title="用 1 小时验证这个想法"
          description="现在先读 README，确认用户、场景和收费路径。"
          onClick={handleQuickValidate}
        />
        <ActionButton
          title={isActiveFollowUp ? '已加入跟进列表' : '加入跟进列表'}
          description="把它放进你的长期推进池，并同步到任务页。"
          onClick={handleAddFollowUp}
          disabled={isSubmitting || isActiveFollowUp}
        />
        <ActionButton
          title="验证通过（可做）"
          description="确认这个项目值得继续投入，并把它推进到已完成状态。"
          onClick={handleValidationPassed}
        />
        <ActionButton
          title="验证失败（不做）"
          description="明确停止投入，这个项目会从首页推荐区退出。"
          onClick={handleValidationFailed}
        />
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

function ActionButton({
  title,
  description,
  onClick,
  disabled = false,
}: {
  title: string;
  description: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <p className="text-base font-semibold tracking-tight text-slate-950">{title}</p>
      <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
    </button>
  );
}
