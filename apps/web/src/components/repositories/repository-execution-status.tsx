'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FAILURE_REASON_LABELS,
  SUCCESS_REASON_LABELS,
  explainBehaviorRecommendation,
  scoreBehaviorRecommendation,
  type BehaviorMemoryProfile,
} from 'shared';
import {
  createOrMergeActionLoopEntry,
  ExecutionStatus,
  getExecutionStatusLabel,
  getExecutionStatusTone,
  getFollowUpStageLabel,
  getFollowUpStageTone,
  type FollowUpStage,
  markValidationFailed,
  markValidationPassed,
  readActionLoopEntry,
  subscribeActionLoop,
  updateExecutionStatus,
} from '@/lib/action-loop';
import {
  getBehaviorMemoryProfile,
  subscribeBehaviorMemory,
} from '@/lib/behavior-memory';

type RepositoryExecutionStatusProps = {
  repoId: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  headline: string;
  reason: string;
  isFavorited: boolean;
  categoryLabel?: string | null;
  projectType?: string | null;
  targetUsersLabel?: string | null;
  useCaseLabel?: string | null;
  patternKeys?: string[];
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
};

export function RepositoryExecutionStatus({
  repoId,
  name,
  fullName,
  htmlUrl,
  headline,
  reason,
  isFavorited,
  categoryLabel,
  projectType,
  targetUsersLabel,
  useCaseLabel,
  patternKeys,
  hasRealUser,
  hasClearUseCase,
  isDirectlyMonetizable,
}: RepositoryExecutionStatusProps) {
  const [status, setStatus] = useState<ExecutionStatus>('NOT_STARTED');
  const [followUpStage, setFollowUpStage] = useState<FollowUpStage>('OBSERVE');
  const [entry, setEntry] = useState(() => readActionLoopEntry(repoId));
  const [memoryProfile, setMemoryProfile] = useState<BehaviorMemoryProfile>(() =>
    getBehaviorMemoryProfile(),
  );

  useEffect(() => {
    const sync = () => {
      const current = readActionLoopEntry(repoId);
      setEntry(current);
      if (current) {
        setStatus(current.actionStatus);
        setFollowUpStage(current.followUpStage);
        return;
      }

      setStatus(isFavorited ? 'NOT_STARTED' : 'NOT_STARTED');
      setFollowUpStage('OBSERVE');
    };

    sync();
    return subscribeActionLoop(sync);
  }, [isFavorited, repoId]);

  useEffect(() => {
    const sync = () => setMemoryProfile(getBehaviorMemoryProfile());
    sync();
    return subscribeBehaviorMemory(sync);
  }, []);

  const behaviorSummary = useMemo(() => {
    const score = scoreBehaviorRecommendation(
      {
        repoId,
        categoryLabel: categoryLabel ?? null,
        projectType: projectType ?? null,
        targetUsersLabel: targetUsersLabel ?? null,
        useCaseLabel: useCaseLabel ?? null,
        patternKeys: patternKeys ?? [],
        hasRealUser,
        hasClearUseCase,
        isDirectlyMonetizable,
        currentActionStatus: status,
      },
      memoryProfile,
    );

    return explainBehaviorRecommendation(
      {
        repoId,
        categoryLabel: categoryLabel ?? null,
        projectType: projectType ?? null,
        targetUsersLabel: targetUsersLabel ?? null,
        useCaseLabel: useCaseLabel ?? null,
        patternKeys: patternKeys ?? [],
        hasRealUser,
        hasClearUseCase,
        isDirectlyMonetizable,
        currentActionStatus: status,
      },
      memoryProfile,
      score,
    );
  }, [
    categoryLabel,
    hasClearUseCase,
    hasRealUser,
    isDirectlyMonetizable,
    memoryProfile,
    patternKeys,
    projectType,
    repoId,
    status,
    targetUsersLabel,
    useCaseLabel,
  ]);

  return (
    <div className="w-full rounded-[28px] border border-white/10 bg-white/5 p-4 xl:w-[320px]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        当前状态
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getExecutionStatusTone(
            status,
          )}`}
        >
          {getExecutionStatusLabel(status)}
        </span>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getFollowUpStageTone(
            followUpStage,
          )}`}
        >
          当前阶段 · {getFollowUpStageLabel(followUpStage)}
        </span>
        <StatusButton
          label={status === 'COMPLETED' ? '重新推进' : '验证通过'}
          onClick={() =>
            setStatusAndPersist(
              {
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
              },
              repoId,
              status === 'COMPLETED' ? 'IN_PROGRESS' : 'COMPLETED',
              setStatus,
              setFollowUpStage,
            )
          }
        />
        <StatusButton
          label={status === 'DROPPED' ? '重新推进' : '放弃'}
          onClick={() =>
            setStatusAndPersist(
              {
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
              },
              repoId,
              status === 'DROPPED' ? 'IN_PROGRESS' : 'DROPPED',
              setStatus,
              setFollowUpStage,
            )
          }
        />
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-200">
        {getStatusHint(status)}
      </p>
      {entry?.successReasons?.length ? (
        <p className="mt-3 text-sm leading-7 text-emerald-200">
          做成原因：{entry.successReasons.slice(0, 2).map((item) => SUCCESS_REASON_LABELS[item]).join('、')}
        </p>
      ) : null}
      {entry?.failureReasons?.length ? (
        <p className="mt-3 text-sm leading-7 text-rose-200">
          放弃原因：{entry.failureReasons.slice(0, 2).map((item) => FAILURE_REASON_LABELS[item]).join('、')}
        </p>
      ) : null}
      {behaviorSummary.influenced ? (
        <div className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
          <p>{behaviorSummary.summary}</p>
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              行为 {formatWeight(behaviorSummary.explainBreakdown.behaviorWeight)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              收费 {formatWeight(behaviorSummary.explainBreakdown.monetizationWeight)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              落地 {formatWeight(behaviorSummary.explainBreakdown.strengthWeight)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              时效 {formatWeight(behaviorSummary.explainBreakdown.freshnessWeight)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatWeight(value: number) {
  const normalized = Math.round(value * 10) / 10;
  return normalized > 0 ? `+${normalized}` : `${normalized}`;
}

function StatusButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
    >
      {label}
    </button>
  );
}

function setStatusAndPersist(
  entryBase: {
    repoId: string;
    repositoryName: string;
    repositoryFullName: string;
    htmlUrl: string;
    detailPath: string;
    headline: string;
    reason: string;
    categoryLabel?: string | null;
    projectType?: string | null;
    targetUsersLabel?: string | null;
    useCaseLabel?: string | null;
    patternKeys?: string[];
    hasRealUser?: boolean | null;
    hasClearUseCase?: boolean | null;
    isDirectlyMonetizable?: boolean | null;
  },
  repoId: string,
  status: ExecutionStatus,
  setStatus: (status: ExecutionStatus) => void,
  setFollowUpStage: (stage: FollowUpStage) => void,
) {
  if (!readActionLoopEntry(repoId)) {
    createOrMergeActionLoopEntry(entryBase, {
      actionStatus: 'NOT_STARTED',
      followUpStage: 'OBSERVE',
      isActiveFollowUp: false,
      source: 'manual_click',
    });
  }

  const updated =
    status === 'COMPLETED'
      ? markValidationPassed(repoId)
      : status === 'DROPPED'
        ? markValidationFailed(repoId)
        : updateExecutionStatus(repoId, status);
  if (updated) {
    setStatus(updated.actionStatus);
    setFollowUpStage(updated.followUpStage);
  } else {
    setStatus(status);
    setFollowUpStage(
      status === 'COMPLETED'
        ? 'DECIDE'
        : status === 'IN_PROGRESS'
          ? 'TRY'
          : 'OBSERVE',
    );
  }
}

function getStatusHint(status: ExecutionStatus) {
  if (status === 'IN_PROGRESS') {
    return '现在正在推进，优先保持节奏，不要让它回到观察池。';
  }

  if (status === 'VALIDATING') {
    return '现在正在验证，先看结果，再决定要不要继续做。';
  }

  if (status === 'COMPLETED') {
    return '这个项目已经验证过，下一步只需要决定继续做还是正式投入。';
  }

  if (status === 'DROPPED') {
    return '这个项目已经暂停推进，除非出现新的强信号，否则先别继续投入。';
  }

  return '现在还没开始，先决定要不要立刻做，还是先加入跟进。';
}
