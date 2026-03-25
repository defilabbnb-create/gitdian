'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FAILURE_REASON_LABELS, SUCCESS_REASON_LABELS } from 'shared';
import { updateFavorite } from '@/lib/api/favorites';
import {
  advanceFollowUpStage,
  createOrMergeActionLoopEntry,
  getExecutionStatusLabel,
  getExecutionStatusTone,
  getFollowUpStageLabel,
  getFollowUpStageTone,
  getNextFollowUpStage,
  readActionLoopEntry,
  subscribeActionLoop,
  updateExecutionStatus,
  type ActionLoopEntry,
} from '@/lib/action-loop';
import { detectRepositoryConflicts } from '@/lib/repository-data-guard';
import {
  getRepositoryActionBehaviorContext,
  getRepositoryDecisionSummary,
  getRepositoryDisplayMonetizationLabel,
} from '@/lib/repository-decision';
import {
  FavoritePriority,
  FavoriteWithRepositorySummary,
  RepositoryOpportunityLevel,
  RepositoryListItem,
} from '@/lib/types/repository';
import { FavoriteEditForm } from './favorite-edit-form';
import { UnfavoriteButton } from './unfavorite-button';

type FavoriteListItemProps = {
  favorite: FavoriteWithRepositorySummary;
};

const priorityTone: Record<FavoritePriority, string> = {
  HIGH: 'border-rose-200 bg-rose-50 text-rose-700',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700',
  LOW: 'border-slate-200 bg-slate-100 text-slate-600',
};

const opportunityTone: Record<
  NonNullable<RepositoryOpportunityLevel>,
  { label: string; className: string }
> = {
  HIGH: {
    label: '高潜力',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  MEDIUM: {
    label: '观察中',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  LOW: {
    label: '低优先',
    className: 'border-slate-200 bg-slate-100 text-slate-600',
  },
};

export function FavoriteListItem({ favorite }: FavoriteListItemProps) {
  const [currentFavorite, setCurrentFavorite] =
    useState<FavoriteWithRepositorySummary>(favorite);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionEntry, setActionEntry] = useState<ActionLoopEntry | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const opportunity = currentFavorite.repository.opportunityLevel
    ? opportunityTone[currentFavorite.repository.opportunityLevel]
    : null;
  const summary = getRepositoryDecisionSummary(
    currentFavorite.repository as unknown as RepositoryListItem,
  );
  const guard = detectRepositoryConflicts(
    currentFavorite.repository as unknown as RepositoryListItem,
    { summary },
  );
  const monetizationLabel = guard.hideMonetization
    ? '收费路径还不够清楚，建议先确认真实用户和场景。'
    : getRepositoryDisplayMonetizationLabel(
        currentFavorite.repository as unknown as RepositoryListItem,
        summary,
      );
  const behaviorContext = getRepositoryActionBehaviorContext(
    currentFavorite.repository as unknown as RepositoryListItem,
    summary,
  );
  const currentStage = actionEntry?.followUpStage ?? 'OBSERVE';
  const currentStatus = actionEntry?.actionStatus ?? 'NOT_STARTED';
  const entryBase = useMemo(
    () => ({
      repoId: currentFavorite.repositoryId,
      repositoryName: currentFavorite.repository.name,
      repositoryFullName: currentFavorite.repository.fullName,
      htmlUrl: `https://github.com/${currentFavorite.repository.fullName}`,
      detailPath: `/repositories/${currentFavorite.repository.id}`,
      headline: currentFavorite.repository.name,
      reason: summary.worthDoingLabel,
      categoryLabel: behaviorContext.categoryLabel,
      projectType: behaviorContext.projectType,
      targetUsersLabel: behaviorContext.targetUsersLabel,
      useCaseLabel: behaviorContext.useCaseLabel,
      patternKeys: behaviorContext.patternKeys,
      hasRealUser: behaviorContext.hasRealUser,
      hasClearUseCase: behaviorContext.hasClearUseCase,
      isDirectlyMonetizable: behaviorContext.isDirectlyMonetizable,
    }),
    [
      behaviorContext.categoryLabel,
      behaviorContext.hasClearUseCase,
      behaviorContext.hasRealUser,
      behaviorContext.isDirectlyMonetizable,
      behaviorContext.patternKeys,
      behaviorContext.projectType,
      behaviorContext.targetUsersLabel,
      behaviorContext.useCaseLabel,
      currentFavorite.repository.fullName,
      currentFavorite.repository.id,
      currentFavorite.repository.name,
      currentFavorite.repositoryId,
      summary.worthDoingLabel,
    ],
  );

  useEffect(() => {
    const sync = () => setActionEntry(readActionLoopEntry(currentFavorite.repositoryId));
    sync();
    return subscribeActionLoop(sync);
  }, [currentFavorite.repositoryId]);

  async function handleSave(payload: {
    note: string;
    priority: FavoritePriority;
  }) {
    setIsSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);

    try {
      const updated = await updateFavorite(currentFavorite.repositoryId, {
        note: payload.note || undefined,
        priority: payload.priority,
      });

      setCurrentFavorite(updated as FavoriteWithRepositorySummary);
      setIsEditing(false);
      setSaveMessage('收藏信息已更新。');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '保存收藏信息失败，请稍后重试。',
      );
    } finally {
      setIsSaving(false);
    }
  }

  function ensureEntry() {
    return (
      actionEntry ??
      createOrMergeActionLoopEntry(entryBase, {
        actionStatus: 'NOT_STARTED',
        followUpStage: 'OBSERVE',
        isActiveFollowUp: true,
        source: 'manual_click',
      })
    );
  }

  function handleAdvanceStage() {
    const current = ensureEntry();
    if (!current) {
      return;
    }

    const updated = advanceFollowUpStage(current.repoId, {
      isActiveFollowUp: true,
    });

    if (updated) {
      setActionFeedback(`已推进到${getFollowUpStageLabel(updated.followUpStage)}阶段。`);
    }
  }

  function handlePauseObserve() {
    const current = ensureEntry();
    if (!current) {
      return;
    }

    const updated = updateExecutionStatus(current.repoId, 'NOT_STARTED', {
      followUpStage: 'OBSERVE',
      isActiveFollowUp: false,
    });

    if (updated) {
      setActionFeedback('已暂停观察，先保留在收藏池里继续观察。');
    }
  }

  function handleDrop() {
    const current = ensureEntry();
    if (!current) {
      return;
    }

    const updated = updateExecutionStatus(current.repoId, 'DROPPED', {
      followUpStage: 'OBSERVE',
      isActiveFollowUp: false,
      priorityBoosted: false,
    });

    if (updated) {
      setActionFeedback('已标记为放弃，它不会继续出现在首页推荐区。');
    }
  }

  return (
    <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/repositories/${currentFavorite.repository.id}`}
              className="text-xl font-semibold tracking-tight text-slate-950 transition hover:text-slate-700"
            >
              {currentFavorite.repository.name}
            </Link>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone[currentFavorite.priority]}`}
            >
              跟进优先级 · {currentFavorite.priority}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getExecutionStatusTone(currentStatus)}`}
            >
              当前状态 · {getExecutionStatusLabel(currentStatus)}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getFollowUpStageTone(currentStage)}`}
            >
              当前阶段 · {getFollowUpStageLabel(currentStage)}
            </span>
          </div>

          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            {summary.action === 'BUILD'
              ? '现在可以继续推进，重点确认范围、用户和收费路径。'
              : summary.action === 'CLONE'
                ? '现在适合继续验证哪里值得借鉴，哪里不该投入。'
                : '现在先别继续投入，除非出现新的强信号。'}
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
            {opportunity ? (
              <span className={`rounded-full border px-3 py-1 ${opportunity.className}`}>
                {guard.severeConflict ? '保守判断 · 先观察' : summary.finalDecisionLabel}
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 px-3 py-1 text-slate-500">
                继续观察
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <button
            type="button"
            onClick={() => {
              setIsEditing((value) => !value);
              setSaveMessage(null);
              setErrorMessage(null);
            }}
            className="inline-flex min-w-24 items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {isEditing ? '收起编辑' : '编辑收藏'}
          </button>
          <UnfavoriteButton repositoryId={currentFavorite.repositoryId} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_100%)] px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            收藏备注
          </p>
          <p className="mt-4 line-clamp-4 text-sm leading-7 text-slate-300">
            {currentFavorite.note || '还没有备注，建议先补一句你接下来想验证什么。'}
          </p>
          {saveMessage ? (
            <p className="mt-4 text-xs font-medium text-emerald-300">{saveMessage}</p>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            接下来做什么
          </p>
          <div className="mt-4 grid gap-2 text-sm text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">现在值不值得继续：</span>
              {guard.incompleteAnalysis
                ? '分析还没补齐，先继续观察，再决定要不要投入。'
                : summary.worthDoingLabel}
            </p>
            <p>
              <span className="font-semibold text-slate-900">下一步：</span>
              {currentFavorite.note?.trim()
                ? '按备注继续跟进'
                : '先补备注，再决定继续做还是继续观察'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">跟进阶段：</span>
              {getFollowUpStageLabel(currentStage)}
            </p>
            <p>
              <span className="font-semibold text-slate-900">最近变化：</span>
              {formatDate(currentFavorite.updatedAt)}
            </p>
            <p>
              <span className="font-semibold text-slate-900">收费判断：</span>
              {monetizationLabel}
            </p>
          </div>
        </section>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={handleAdvanceStage}
          disabled={currentStatus === 'COMPLETED' || currentStatus === 'DROPPED'}
          className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {currentStage === 'DECIDE'
            ? '保持决定状态'
            : `推进到${getFollowUpStageLabel(getNextFollowUpStage(currentStage))}`}
        </button>
        <button
          type="button"
          onClick={handlePauseObserve}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          暂停观察
        </button>
        <button
          type="button"
          onClick={handleDrop}
          className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          放弃
        </button>
      </div>

      {actionFeedback ? (
        <p className="mt-4 text-sm font-medium text-sky-700">{actionFeedback}</p>
      ) : null}
      {actionEntry?.successReasons?.length ? (
        <p className="mt-3 text-sm leading-7 text-emerald-700">
          最近做成原因：{actionEntry.successReasons.slice(0, 2).map((item) => SUCCESS_REASON_LABELS[item]).join('、')}
        </p>
      ) : null}
      {actionEntry?.failureReasons?.length ? (
        <p className="mt-3 text-sm leading-7 text-rose-700">
          最近暂停原因：{actionEntry.failureReasons.slice(0, 2).map((item) => FAILURE_REASON_LABELS[item]).join('、')}
        </p>
      ) : null}

      {isEditing ? (
        <FavoriteEditForm
          favorite={currentFavorite}
          isSaving={isSaving}
          errorMessage={errorMessage}
          onCancel={() => {
            setIsEditing(false);
            setErrorMessage(null);
          }}
          onSave={handleSave}
        />
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
        <p className="text-sm text-slate-500">
          先决定继续跟不跟，再去看完整信息。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`https://github.com/${currentFavorite.repository.fullName}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            去 GitHub
          </a>
          <Link
            href={`/repositories/${currentFavorite.repository.id}`}
            className="inline-flex items-center rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            查看详情
          </Link>
        </div>
      </div>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
