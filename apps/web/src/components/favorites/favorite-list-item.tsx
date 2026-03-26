'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FAILURE_REASON_LABELS, SUCCESS_REASON_LABELS } from 'shared';
import { updateFavorite } from '@/lib/api/favorites';
import {
  advanceFollowUpStage,
  createOrMergeActionLoopEntry,
  getFollowUpStageLabel,
  readActionLoopEntry,
  subscribeActionLoop,
  updateExecutionStatus,
  type ActionLoopEntry,
} from '@/lib/action-loop';
import {
  buildFavoriteActionEntryBase,
  buildFavoriteCardViewModel,
} from '@/lib/favorite-card-view-model';
import {
  FavoritePriority,
  FavoriteWithRepositorySummary,
} from '@/lib/types/repository';
import { FavoriteEditForm } from './favorite-edit-form';
import { UnfavoriteButton } from './unfavorite-button';

type FavoriteListItemProps = {
  favorite: FavoriteWithRepositorySummary;
  showRemoveAction?: boolean;
};

export function FavoriteListItem({
  favorite,
  showRemoveAction = true,
}: FavoriteListItemProps) {
  const [currentFavorite, setCurrentFavorite] =
    useState<FavoriteWithRepositorySummary>(favorite);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionEntry, setActionEntry] = useState<ActionLoopEntry | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  const currentStatus = actionEntry?.actionStatus ?? 'NOT_STARTED';
  const cardView = buildFavoriteCardViewModel(currentFavorite, actionEntry);

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
      setIsActionMenuOpen(false);
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
      createOrMergeActionLoopEntry(buildFavoriteActionEntryBase(currentFavorite), {
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
      setActionFeedback('已标记为放弃，它会退出当前跟进工作台。');
    }
  }

  return (
    <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4">
        <span
          className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityTone(currentFavorite.priority)}`}
        >
          {cardView.statusSummary}
        </span>

        <div className="space-y-3">
          <h3 className="text-xl font-semibold tracking-tight text-slate-950">
            {currentFavorite.repository.name}
          </h3>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            {cardView.summaryReason}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <FavoriteSummaryCard
          label="现在值不值得继续跟"
          value={cardView.worthFollowingLabel}
        />
        <FavoriteSummaryCard
          label="最近有没有变化"
          value={cardView.recentChangeLabel}
        />
        <FavoriteSummaryCard label="下一步做什么" value={cardView.nextStepLabel} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        {cardView.primaryAction.kind === 'advance' ? (
          <button
            type="button"
            onClick={handleAdvanceStage}
            disabled={currentStatus === 'COMPLETED' || currentStatus === 'DROPPED'}
            data-favorite-primary-cta="true"
            className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cardView.primaryAction.label}
          </button>
        ) : (
          <Link
            href={cardView.detailHref}
            data-favorite-primary-cta="true"
            className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {cardView.primaryAction.label}
          </Link>
        )}
        <p className="text-sm text-slate-500">{cardView.primaryAction.description}</p>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            setIsActionMenuOpen((value) => !value);
            setSaveMessage(null);
            setErrorMessage(null);
          }}
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {isActionMenuOpen ? '收起更多操作' : '调整状态与更多操作'}
        </button>
      </div>

      {isActionMenuOpen ? (
        <div
          data-favorite-secondary-actions="true"
          className="mt-4 space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"
        >
          <p className="text-sm leading-7 text-slate-600">
            这里再调整状态、编辑收藏说明，或打开外部链接。
          </p>

          <div className="flex flex-wrap items-start gap-3">
            {cardView.primaryAction.kind !== 'advance' ? (
              <button
                type="button"
                onClick={handleAdvanceStage}
                disabled={currentStatus === 'COMPLETED' || currentStatus === 'DROPPED'}
                className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cardView.secondaryAdvanceLabel}
              </button>
            ) : null}
            {cardView.primaryAction.kind !== 'detail' ? (
              <Link
                href={cardView.detailHref}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                查看详情
              </Link>
            ) : null}
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
            <button
              type="button"
              onClick={() => {
                setIsEditing((value) => !value);
                setSaveMessage(null);
                setErrorMessage(null);
              }}
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              {isEditing ? '收起编辑收藏' : '编辑收藏'}
            </button>
            <a
              href={cardView.githubHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              去 GitHub
            </a>
            {showRemoveAction ? (
              <UnfavoriteButton repositoryId={currentFavorite.repositoryId} />
            ) : null}
          </div>

          {actionEntry?.successReasons?.length ? (
            <p className="text-sm leading-7 text-emerald-700">
              最近做成原因：
              {actionEntry.successReasons
                .slice(0, 2)
                .map((item) => SUCCESS_REASON_LABELS[item])
                .join('、')}
            </p>
          ) : null}
          {actionEntry?.failureReasons?.length ? (
            <p className="text-sm leading-7 text-rose-700">
              最近暂停原因：
              {actionEntry.failureReasons
                .slice(0, 2)
                .map((item) => FAILURE_REASON_LABELS[item])
                .join('、')}
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
        </div>
      ) : null}

      {saveMessage ? (
        <p className="mt-4 text-sm font-medium text-emerald-700">{saveMessage}</p>
      ) : null}
      {actionFeedback ? (
        <p className="mt-3 text-sm font-medium text-sky-700">{actionFeedback}</p>
      ) : null}
    </article>
  );
}

function FavoriteSummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      data-favorite-summary-card="true"
      className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-sm font-medium leading-7 text-slate-700">{value}</p>
    </div>
  );
}

function getPriorityTone(priority: FavoritePriority) {
  return {
    HIGH: 'border-rose-200 bg-rose-50 text-rose-700',
    MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700',
    LOW: 'border-slate-200 bg-slate-100 text-slate-600',
  }[priority];
}
