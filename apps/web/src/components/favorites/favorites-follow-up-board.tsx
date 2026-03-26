'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FAILURE_REASON_LABELS, SUCCESS_REASON_LABELS } from 'shared';
import {
  advanceFollowUpStage,
  createOrMergeActionLoopEntry,
  getFollowUpStageLabel,
  readActionLoopEntries,
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
  RepositoryOpportunityLevel,
} from '@/lib/types/repository';

type FavoritesFollowUpBoardProps = {
  items: FavoriteWithRepositorySummary[];
};

const priorityRank: Record<FavoritePriority, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const opportunityRank: Record<RepositoryOpportunityLevel, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function FavoritesFollowUpBoard({
  items,
}: FavoritesFollowUpBoardProps) {
  const [actionEntries, setActionEntries] = useState<ActionLoopEntry[]>([]);

  useEffect(() => {
    const sync = () => setActionEntries(readActionLoopEntries());
    sync();
    return subscribeActionLoop(sync);
  }, []);

  const actionMap = useMemo(
    () => new Map(actionEntries.map((entry) => [entry.repoId, entry])),
    [actionEntries],
  );

  const topFollowUps = [...items]
    .filter((item) => {
      const actionEntry = actionMap.get(item.repositoryId);
      return (
        !actionEntry ||
        (actionEntry.actionStatus !== 'COMPLETED' &&
          actionEntry.actionStatus !== 'DROPPED')
      );
    })
    .sort(
      (left, right) =>
        scoreFavorite(right, actionMap.get(right.repositoryId)) -
        scoreFavorite(left, actionMap.get(left.repositoryId)),
    )
    .slice(0, 3);

  const highlightedIds = new Set(topFollowUps.map((item) => item.id));
  const recentChanges = [...items]
    .filter((item) => !highlightedIds.has(item.id))
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .slice(0, 4);

  return (
    <section className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.95)_58%,_rgba(15,118,110,0.88)_100%)] px-7 py-8 text-white shadow-xl shadow-slate-900/10">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200/70">
            跟进面板
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-[3rem]">
            先决定现在继续跟哪几个项目。
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-200 md:text-base">
            先看还值不值得继续、最近有没有变化，再决定下一步做什么。
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              高优先跟进项
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              先看现在仍值得继续跟的项目。
            </h2>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {topFollowUps.map((favorite) => (
            <FollowUpCard
              key={favorite.id}
              favorite={favorite}
              actionEntry={actionMap.get(favorite.repositoryId) ?? null}
            />
          ))}
        </div>
      </section>

      {recentChanges.length ? (
        <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              最近有变化的项目
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              这些项目最近有变化，适合顺手复看一次判断。
            </h2>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {recentChanges.map((favorite) => (
              <RecentChangeCard
                key={favorite.id}
                favorite={favorite}
                actionEntry={actionMap.get(favorite.repositoryId) ?? null}
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function FollowUpCard({
  favorite,
  actionEntry,
}: {
  favorite: FavoriteWithRepositorySummary;
  actionEntry: ActionLoopEntry | null;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const cardView = buildFavoriteCardViewModel(favorite, actionEntry);
  const currentStatus = actionEntry?.actionStatus ?? 'NOT_STARTED';

  function ensureEntry() {
    const entryBase = buildFavoriteActionEntryBase(favorite);

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

  function handleAdvance() {
    const current = ensureEntry();
    if (!current) {
      return;
    }

    const updated = advanceFollowUpStage(current.repoId, {
      isActiveFollowUp: true,
    });

    if (updated) {
      setFeedback(`已推进到${getFollowUpStageLabel(updated.followUpStage)}阶段。`);
    }
  }

  function handlePause() {
    const current = ensureEntry();
    if (!current) {
      return;
    }

    const updated = updateExecutionStatus(current.repoId, 'NOT_STARTED', {
      followUpStage: 'OBSERVE',
      isActiveFollowUp: false,
    });

    if (updated) {
      setFeedback('已暂停观察，先放回收藏池里继续观察。');
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
      setFeedback('已标记为放弃，它会退出首页推荐和当前执行项目。');
    }
  }

  return (
    <article
      data-testid="favorites-follow-up-card"
      className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm"
    >
      <p
        data-favorite-status-summary="true"
        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityTone(favorite.priority)}`}
      >
        {cardView.statusSummary}
      </p>

      <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
        {favorite.repository.name}
      </h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        {cardView.summaryReason}
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <InfoCard
          label="现在值不值得继续跟"
          value={cardView.worthFollowingLabel}
        />
        <InfoCard label="最近有没有变化" value={cardView.recentChangeLabel} />
        <InfoCard
          label="下一步做什么"
          value={cardView.nextStepLabel}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        {cardView.primaryAction.kind === 'advance' ? (
          <button
            type="button"
            onClick={handleAdvance}
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
          onClick={() => setIsActionMenuOpen((value) => !value)}
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {isActionMenuOpen ? '收起更多操作' : '调整跟进状态与更多操作'}
        </button>
      </div>

      {isActionMenuOpen ? (
        <div
          data-favorite-secondary-actions="true"
          className="mt-4 space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"
        >
          <p className="text-sm leading-7 text-slate-600">
            这里再调整跟进状态、补收藏备注，或打开外部链接。
          </p>

          <div className="flex flex-wrap gap-3">
            {cardView.primaryAction.kind !== 'advance' ? (
              <button
                type="button"
                onClick={handleAdvance}
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
              onClick={handlePause}
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
            <a
              href={cardView.githubHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              去 GitHub
            </a>
          </div>

          {actionEntry?.successReasons?.length ? (
            <p className="text-sm leading-7 text-emerald-700">
              最近做成原因：{actionEntry.successReasons.slice(0, 2).map((item) => SUCCESS_REASON_LABELS[item]).join('、')}
            </p>
          ) : null}
          {actionEntry?.failureReasons?.length ? (
            <p className="text-sm leading-7 text-rose-700">
              最近暂停原因：{actionEntry.failureReasons.slice(0, 2).map((item) => FAILURE_REASON_LABELS[item]).join('、')}
            </p>
          ) : null}
        </div>
      ) : null}

      {feedback ? (
        <p className="mt-4 text-sm font-medium text-sky-700">{feedback}</p>
      ) : null}
    </article>
  );
}

function RecentChangeCard({
  favorite,
  actionEntry,
}: {
  favorite: FavoriteWithRepositorySummary;
  actionEntry: ActionLoopEntry | null;
}) {
  const cardView = buildFavoriteCardViewModel(favorite, actionEntry);

  return (
    <article
      data-testid="favorites-follow-up-card"
      className="rounded-[26px] border border-slate-200 bg-slate-50 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-950">
            {favorite.repository.name}
          </h3>
          <p className="mt-2 text-sm text-slate-500">{cardView.recentChangeLabel}</p>
        </div>
        <span
          data-favorite-status-summary="true"
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityTone(favorite.priority)}`}
        >
          {cardView.statusSummary}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        {cardView.nextStepLabel}
      </p>
      <Link
        href={cardView.detailHref}
        data-favorite-primary-cta="true"
        className="mt-4 inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
      >
        查看详情
      </Link>
    </article>
  );
}

function scoreFavorite(
  item: FavoriteWithRepositorySummary,
  actionEntry?: ActionLoopEntry,
) {
  return (
    (actionEntry?.isActiveFollowUp ? 120 : 0) +
    (actionEntry?.actionStatus === 'VALIDATING'
      ? 25
      : actionEntry?.actionStatus === 'IN_PROGRESS'
        ? 18
        : actionEntry?.followUpStage === 'DECIDE'
          ? 12
          : 0) +
    priorityRank[item.priority] * 100 +
    (item.repository.opportunityLevel
      ? opportunityRank[item.repository.opportunityLevel] * 20
      : 0) +
    (item.repository.finalScore ?? 0) +
    Math.min(item.repository.stars / 50, 20)
  );
}

function getPriorityTone(priority: FavoritePriority) {
  return {
    HIGH: 'border-rose-200 bg-rose-50 text-rose-700',
    MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700',
    LOW: 'border-slate-200 bg-slate-100 text-slate-600',
  }[priority];
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-sm font-medium leading-7 text-slate-700">{value}</p>
    </div>
  );
}
