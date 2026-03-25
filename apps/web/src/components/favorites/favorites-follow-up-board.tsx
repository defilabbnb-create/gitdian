'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FAILURE_REASON_LABELS, SUCCESS_REASON_LABELS } from 'shared';
import {
  advanceFollowUpStage,
  createOrMergeActionLoopEntry,
  getExecutionStatusLabel,
  getExecutionStatusTone,
  getFollowUpStageLabel,
  getFollowUpStageTone,
  getNextFollowUpStage,
  readActionLoopEntries,
  subscribeActionLoop,
  updateExecutionStatus,
  type ActionLoopEntry,
} from '@/lib/action-loop';
import {
  getRepositoryActionBehaviorContext,
  getRepositoryDecisionSummary,
} from '@/lib/repository-decision';
import {
  FavoritePriority,
  FavoriteWithRepositorySummary,
  RepositoryOpportunityLevel,
  RepositoryListItem,
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
  const summary = getRepositoryDecisionSummary(
    favorite.repository as unknown as RepositoryListItem,
  );
  const currentStage = actionEntry?.followUpStage ?? 'OBSERVE';
  const currentStatus = actionEntry?.actionStatus ?? 'NOT_STARTED';

  function ensureEntry() {
    const behaviorContext = getRepositoryActionBehaviorContext(
      favorite.repository as unknown as RepositoryListItem,
      summary,
    );
    return (
      actionEntry ??
      createOrMergeActionLoopEntry(buildActionEntryBase(favorite, summary.worthDoingLabel), {
        actionStatus: 'NOT_STARTED',
        followUpStage: 'OBSERVE',
        isActiveFollowUp: true,
        categoryLabel: behaviorContext.categoryLabel,
        projectType: behaviorContext.projectType,
        targetUsersLabel: behaviorContext.targetUsersLabel,
        useCaseLabel: behaviorContext.useCaseLabel,
        patternKeys: behaviorContext.patternKeys,
        hasRealUser: behaviorContext.hasRealUser,
        hasClearUseCase: behaviorContext.hasClearUseCase,
        isDirectlyMonetizable: behaviorContext.isDirectlyMonetizable,
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
    <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span
          className={`rounded-full border px-3 py-1 ${getPriorityTone(favorite.priority)}`}
        >
          跟进优先级 · {favorite.priority}
        </span>
        <span
          className={`rounded-full border px-3 py-1 ${getOpportunityTone(
            favorite.repository.opportunityLevel,
          )}`}
        >
          {summary.finalDecisionLabel}
        </span>
        <span
          className={`rounded-full border px-3 py-1 ${getExecutionStatusTone(
            currentStatus,
          )}`}
        >
          当前状态 · {getExecutionStatusLabel(currentStatus)}
        </span>
        <span
          className={`rounded-full border px-3 py-1 ${getFollowUpStageTone(currentStage)}`}
        >
          当前阶段 · {getFollowUpStageLabel(currentStage)}
        </span>
      </div>

      <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
        {favorite.repository.name}
      </h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        {getFollowUpReason(favorite)}
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <InfoCard label="现在值不值得继续跟" value={summary.worthDoingLabel} />
        <InfoCard label="最近有没有变化" value={getChangeHint(favorite)} />
        <InfoCard label="下一步做什么" value={getNextStepLabel(favorite)} />
        <InfoCard
          label="备注"
          value={
            favorite.note?.trim() || '先补一句备注，写清楚下一步想验证什么。'
          }
        />
      </div>

      {actionEntry?.successReasons?.length ? (
        <p className="mt-4 text-sm leading-7 text-emerald-700">
          最近做成原因：{actionEntry.successReasons.slice(0, 2).map((item) => SUCCESS_REASON_LABELS[item]).join('、')}
        </p>
      ) : null}
      {actionEntry?.failureReasons?.length ? (
        <p className="mt-4 text-sm leading-7 text-rose-700">
          最近暂停原因：{actionEntry.failureReasons.slice(0, 2).map((item) => FAILURE_REASON_LABELS[item]).join('、')}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/repositories/${favorite.repository.id}`}
          className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          查看详情
        </Link>
        <a
          href={`https://github.com/${favorite.repository.fullName}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          去 GitHub
        </a>
        <span className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-500">
          编辑收藏
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={handleAdvance}
          disabled={currentStatus === 'COMPLETED' || currentStatus === 'DROPPED'}
          className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {currentStage === 'DECIDE'
            ? '保持决定状态'
            : `推进到${getFollowUpStageLabel(getNextFollowUpStage(currentStage))}`}
        </button>
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
      </div>

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
  const currentStage = actionEntry?.followUpStage ?? 'OBSERVE';

  return (
    <article className="rounded-[26px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/repositories/${favorite.repository.id}`}
            className="text-lg font-semibold tracking-tight text-slate-950 transition hover:text-slate-700"
          >
            {favorite.repository.name}
          </Link>
          <p className="mt-2 text-sm text-slate-500">{getChangeHint(favorite)}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityTone(favorite.priority)}`}
        >
          {favorite.priority}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <span
          className={`rounded-full border px-3 py-1 ${getFollowUpStageTone(currentStage)}`}
        >
          当前阶段 · {getFollowUpStageLabel(currentStage)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        {favorite.note?.trim() || getFollowUpReason(favorite)}
      </p>
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

function getFollowUpReason(item: FavoriteWithRepositorySummary) {
  if (item.priority === 'HIGH') {
    return '现在仍值得继续跟，优先确认到底是继续做、继续抄，还是降低优先级。';
  }

  if (item.repository.opportunityLevel === 'HIGH') {
    return '项目信号还在，适合继续确认用户、收费和最近变化。';
  }

  if (item.note?.trim()) {
    return '你已经留了跟进线索，现在适合沿着这条线继续补证据。';
  }

  return '先复看详情页，再决定要不要继续跟。';
}

function getNextStepLabel(item: FavoriteWithRepositorySummary) {
  if (item.priority === 'HIGH') {
    return '现在就打开详情页，决定继续做、继续抄，还是降级观察。';
  }

  if (!item.note?.trim()) {
    return '先补一句备注，写清楚为什么收藏以及下一步要验证什么。';
  }

  return '按备注继续跟进，再看最近有没有新变化。';
}

function getChangeHint(item: FavoriteWithRepositorySummary) {
  if (item.updatedAt !== item.createdAt) {
    return `最近有变化 · ${formatDate(item.updatedAt)}`;
  }

  if (item.priority === 'HIGH') {
    return '高优先收藏，现在就值得复看一次判断。';
  }

  return `最近没有明显变化 · ${formatDate(item.createdAt)}`;
}

function getPriorityTone(priority: FavoritePriority) {
  return {
    HIGH: 'border-rose-200 bg-rose-50 text-rose-700',
    MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700',
    LOW: 'border-slate-200 bg-slate-100 text-slate-600',
  }[priority];
}

function getOpportunityTone(opportunity?: RepositoryOpportunityLevel | null) {
  if (!opportunity) {
    return 'border-slate-200 bg-slate-100 text-slate-600';
  }

  return {
    HIGH: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700',
    LOW: 'border-slate-200 bg-slate-100 text-slate-600',
  }[opportunity];
}

function buildActionEntryBase(
  favorite: FavoriteWithRepositorySummary,
  reason: string,
) {
  const summary = getRepositoryDecisionSummary(
    favorite.repository as unknown as RepositoryListItem,
  );
  const behaviorContext = getRepositoryActionBehaviorContext(
    favorite.repository as unknown as RepositoryListItem,
    summary,
  );

  return {
    repoId: favorite.repositoryId,
    repositoryName: favorite.repository.name,
    repositoryFullName: favorite.repository.fullName,
    htmlUrl: `https://github.com/${favorite.repository.fullName}`,
    detailPath: `/repositories/${favorite.repository.id}`,
    headline: favorite.repository.name,
    reason,
    categoryLabel: behaviorContext.categoryLabel,
    projectType: behaviorContext.projectType,
    targetUsersLabel: behaviorContext.targetUsersLabel,
    useCaseLabel: behaviorContext.useCaseLabel,
    patternKeys: behaviorContext.patternKeys,
    hasRealUser: behaviorContext.hasRealUser,
    hasClearUseCase: behaviorContext.hasClearUseCase,
    isDirectlyMonetizable: behaviorContext.isDirectlyMonetizable,
  };
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
