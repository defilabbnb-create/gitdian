'use client';

import {
  FAILURE_REASON_LABELS,
  SUCCESS_REASON_LABELS,
  scoreBehaviorRecommendation,
  type BehaviorEvidenceLevel,
  type ImpactLevel,
  inferBehaviorOutcomeFromStatus,
  inferBehaviorReasons,
  type ActionOutcome,
  type BehaviorOutcomeConfidence,
  type BehaviorOutcomeSource,
  type FailureReasonCode,
  type SuccessReasonCode,
} from 'shared';
import {
  backfillBehaviorMemoryFromActionLoop,
  getBehaviorMemorySnapshot,
  mergeBehaviorModelInput,
  recordBehaviorOutcomeFromActionLoop,
} from '@/lib/behavior-memory';

export type ExecutionStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'DROPPED';

export type FollowUpStage = 'OBSERVE' | 'TRY' | 'VALIDATE' | 'DECIDE';

type LegacyExecutionStatus = 'VALIDATED' | 'ABANDONED';

export type ActionLogType =
  | 'start_project_clicked'
  | 'quick_validate_clicked'
  | 'follow_up_added'
  | 'validation_passed'
  | 'validation_failed';

export type ActionDecisionSignals = {
  successPatterns: string[];
  failurePatterns: string[];
};

export type ActionLoopPatternContext = {
  categoryLabel?: string | null;
  projectType?: string | null;
  targetUsersLabel?: string | null;
  useCaseLabel?: string | null;
  patternKeys?: string[];
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
};

export type UserPreferenceProfile = {
  preferredCategories: string[];
  avoidedCategories: string[];
  topCategories: string[];
  topUserTypes: string[];
  successRateByCategory: Array<{
    category: string;
    completedCount: number;
    droppedCount: number;
    successRate: number;
  }>;
  successPatterns: string[];
  failurePatterns: string[];
  generatedAt: string;
};

export type ActionLoopRecommendationScore = {
  score: number;
  matchedSuccessPatterns: string[];
  matchedFailurePatterns: string[];
  matchedCategories: string[];
  blocked: boolean;
};

export type ActionLoopEntry = {
  repoId: string;
  repositoryName: string;
  repositoryFullName: string;
  htmlUrl: string;
  detailPath: string;
  headline: string;
  reason: string;
  actionStatus: ExecutionStatus;
  followUpStage: FollowUpStage;
  isActiveFollowUp: boolean;
  actionStartedAt: string | null;
  actionUpdatedAt: string;
  priorityBoosted: boolean;
  actionScore: number;
  actionImpactScore?: number;
  impactLevel?: ImpactLevel;
  evidenceLevel?: BehaviorEvidenceLevel;
  decisionSignals: ActionDecisionSignals;
  outcome: ActionOutcome;
  successReasons: SuccessReasonCode[];
  failureReasons: FailureReasonCode[];
  confidence: BehaviorOutcomeConfidence;
  source: BehaviorOutcomeSource;
  notes?: string | null;
  evidenceTags: string[];
  categoryLabel?: string | null;
  projectType?: string | null;
  targetUsersLabel?: string | null;
  useCaseLabel?: string | null;
  hasRealUser?: boolean | null;
  hasClearUseCase?: boolean | null;
  isDirectlyMonetizable?: boolean | null;
  patternKeys: string[];
  status?: ExecutionStatus | LegacyExecutionStatus;
  updatedAt?: string;
};

type ActionLogRecord = {
  type: ActionLogType;
  repoId: string;
  timestamp: string;
};

type ActionEntryBase = Pick<
  ActionLoopEntry,
  'repoId' | 'repositoryName' | 'repositoryFullName' | 'htmlUrl' | 'detailPath' | 'headline' | 'reason'
> &
  ActionLoopPatternContext;

const ACTION_LOOP_STORAGE_KEY = 'gitdian.action-loop.v2';
const LEGACY_ACTION_LOOP_STORAGE_KEY = 'gitdian.action-loop.v1';
const ACTION_LOG_STORAGE_KEY = 'gitdian.action-log.v1';
const ACTION_LOOP_EVENT = 'gitdian:action-loop-updated';

const ACTION_SCORE_BY_STATUS: Record<ExecutionStatus, number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  VALIDATING: 2,
  COMPLETED: 5,
  DROPPED: -5,
};

const ACTION_IMPACT_MULTIPLIER_BY_STATUS: Record<ExecutionStatus, number> = {
  NOT_STARTED: 0.25,
  IN_PROGRESS: 0.55,
  VALIDATING: 0.8,
  COMPLETED: 1,
  DROPPED: 1,
};

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  NOT_STARTED: '未开始',
  IN_PROGRESS: '进行中',
  VALIDATING: '验证中',
  COMPLETED: '已完成',
  DROPPED: '已放弃',
};

const STATUS_TONES: Record<ExecutionStatus, string> = {
  NOT_STARTED: 'border-slate-200 bg-slate-100 text-slate-700',
  IN_PROGRESS: 'border-sky-200 bg-sky-50 text-sky-700',
  VALIDATING: 'border-amber-200 bg-amber-50 text-amber-700',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  DROPPED: 'border-slate-200 bg-slate-100 text-slate-500',
};

const FOLLOW_UP_STAGE_LABELS: Record<FollowUpStage, string> = {
  OBSERVE: '观察',
  TRY: '尝试',
  VALIDATE: '验证',
  DECIDE: '决定',
};

const FOLLOW_UP_STAGE_TONES: Record<FollowUpStage, string> = {
  OBSERVE: 'border-slate-200 bg-slate-100 text-slate-700',
  TRY: 'border-sky-200 bg-sky-50 text-sky-700',
  VALIDATE: 'border-amber-200 bg-amber-50 text-amber-700',
  DECIDE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export function getExecutionStatusLabel(status: ExecutionStatus) {
  return STATUS_LABELS[status];
}

export function getExecutionStatusTone(status: ExecutionStatus) {
  return STATUS_TONES[status];
}

export function getFollowUpStageLabel(stage: FollowUpStage) {
  return FOLLOW_UP_STAGE_LABELS[stage];
}

export function getFollowUpStageTone(stage: FollowUpStage) {
  return FOLLOW_UP_STAGE_TONES[stage];
}

export function getNextActionButtonLabel(entry: ActionLoopEntry) {
  if (entry.actionStatus === 'VALIDATING') {
    return '查看验证结果';
  }

  if (entry.actionStatus === 'IN_PROGRESS') {
    return '继续推进';
  }

  if (entry.actionStatus === 'COMPLETED') {
    return '已完成';
  }

  if (entry.actionStatus === 'DROPPED') {
    return '已放弃';
  }

  return '开始做';
}

export function getActionScore(status: ExecutionStatus) {
  return ACTION_SCORE_BY_STATUS[status];
}

export function getEvidenceLevelForStatus(
  status: ExecutionStatus,
): BehaviorEvidenceLevel {
  if (status === 'COMPLETED' || status === 'DROPPED') {
    return 'HIGH';
  }

  if (status === 'VALIDATING') {
    return 'MEDIUM';
  }

  return 'LOW';
}

export function getActionImpactScore(
  status: ExecutionStatus,
  input: {
    hasRealUser?: boolean | null;
    hasClearUseCase?: boolean | null;
    isDirectlyMonetizable?: boolean | null;
  } = {},
) {
  const baseScore = getActionScore(status);
  const confidenceWeight = ACTION_IMPACT_MULTIPLIER_BY_STATUS[status];
  const monetizationWeight = input.isDirectlyMonetizable ? 1.15 : 0.85;
  const validationWeight =
    input.hasRealUser && input.hasClearUseCase
      ? 1.08
      : input.hasRealUser || input.hasClearUseCase
        ? 0.96
        : 0.84;
  const score = baseScore * confidenceWeight * monetizationWeight * validationWeight;
  const absoluteScore = Math.abs(score);
  const impactLevel: ImpactLevel =
    absoluteScore >= 4 ? 'HIGH' : absoluteScore >= 1.8 ? 'MEDIUM' : 'LOW';

  return {
    score,
    impactLevel,
  };
}

export function getNextFollowUpStage(stage: FollowUpStage) {
  if (stage === 'OBSERVE') {
    return 'TRY';
  }

  if (stage === 'TRY') {
    return 'VALIDATE';
  }

  return 'DECIDE';
}

export function readActionLoopEntries() {
  if (typeof window === 'undefined') {
    return [] as ActionLoopEntry[];
  }

  const raw = readStorage(ACTION_LOOP_STORAGE_KEY) ?? readStorage(LEGACY_ACTION_LOOP_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const entries = parsed
      .map((entry) => normalizeActionLoopEntry(entry))
      .filter((entry): entry is ActionLoopEntry => entry !== null);

    backfillBehaviorMemoryFromActionLoop(entries);
    return entries;
  } catch {
    return [];
  }
}

export function readActionLoopEntry(repoId: string) {
  return readActionLoopEntries().find((entry) => entry.repoId === repoId) ?? null;
}

export function upsertActionLoopEntry(entry: ActionLoopEntry) {
  const normalized = normalizeActionLoopEntry(entry);
  if (!normalized) {
    return null;
  }

  const entries = readActionLoopEntries();
  const nextEntries = [
    normalized,
    ...entries.filter((current) => current.repoId !== normalized.repoId),
  ]
    .sort(
      (left, right) =>
        new Date(right.actionUpdatedAt).getTime() -
        new Date(left.actionUpdatedAt).getTime(),
    )
    .slice(0, 50);

  writeActionLoopEntries(nextEntries);
  recordBehaviorOutcomeFromActionLoop(normalized);
  return normalized;
}

export function createOrMergeActionLoopEntry(
  base: ActionEntryBase,
  patch: Partial<ActionLoopEntry> = {},
) {
  const current = readActionLoopEntry(base.repoId);
  const now = patch.actionUpdatedAt ?? new Date().toISOString();
  const nextActionStatus =
    patch.actionStatus ??
    current?.actionStatus ??
    inferActionStatusFromStage(
      patch.followUpStage ?? current?.followUpStage ?? 'OBSERVE',
    );
  const nextFollowUpStage =
    patch.followUpStage ??
    current?.followUpStage ??
    inferFollowUpStageFromStatus(nextActionStatus);
  const nextOutcome = resolveActionOutcome(
    patch.outcome,
    current,
    nextActionStatus,
  );
  const inferredBehavior = inferBehaviorReasons({
    outcome: nextOutcome,
    projectType:
      patch.projectType ?? current?.projectType ?? base.projectType ?? null,
    hasRealUser:
      patch.hasRealUser ?? current?.hasRealUser ?? base.hasRealUser ?? null,
    hasClearUseCase:
      patch.hasClearUseCase ??
      current?.hasClearUseCase ??
      base.hasClearUseCase ??
      null,
    isDirectlyMonetizable:
      patch.isDirectlyMonetizable ??
      current?.isDirectlyMonetizable ??
      base.isDirectlyMonetizable ??
      null,
    targetUsersLabel:
      patch.targetUsersLabel ??
      current?.targetUsersLabel ??
      base.targetUsersLabel ??
      null,
    useCaseLabel:
      patch.useCaseLabel ?? current?.useCaseLabel ?? base.useCaseLabel ?? null,
    patternKeys:
      patch.patternKeys ?? current?.patternKeys ?? base.patternKeys ?? [],
    priorityBoosted:
      patch.priorityBoosted ?? current?.priorityBoosted ?? false,
  });
  const merged: ActionLoopEntry = {
    repoId: base.repoId,
    repositoryName: patch.repositoryName ?? current?.repositoryName ?? base.repositoryName,
    repositoryFullName:
      patch.repositoryFullName ?? current?.repositoryFullName ?? base.repositoryFullName,
    htmlUrl: patch.htmlUrl ?? current?.htmlUrl ?? base.htmlUrl,
    detailPath: patch.detailPath ?? current?.detailPath ?? base.detailPath,
    headline: patch.headline ?? current?.headline ?? base.headline,
    reason: patch.reason ?? current?.reason ?? base.reason,
    actionStatus: nextActionStatus,
    followUpStage: nextFollowUpStage,
    isActiveFollowUp:
      patch.isActiveFollowUp ?? current?.isActiveFollowUp ?? false,
    actionStartedAt:
      patch.actionStartedAt ??
      current?.actionStartedAt ??
      (patch.actionStatus &&
      patch.actionStatus !== 'NOT_STARTED' &&
      patch.actionStatus !== 'DROPPED'
        ? now
        : null),
    actionUpdatedAt: now,
    priorityBoosted: patch.priorityBoosted ?? current?.priorityBoosted ?? false,
    actionScore:
      patch.actionScore ?? current?.actionScore ?? getActionScore(nextActionStatus),
    actionImpactScore:
      patch.actionImpactScore ??
      current?.actionImpactScore ??
      getActionImpactScore(nextActionStatus, {
        hasRealUser:
          patch.hasRealUser ?? current?.hasRealUser ?? base.hasRealUser ?? null,
        hasClearUseCase:
          patch.hasClearUseCase ??
          current?.hasClearUseCase ??
          base.hasClearUseCase ??
          null,
        isDirectlyMonetizable:
          patch.isDirectlyMonetizable ??
          current?.isDirectlyMonetizable ??
          base.isDirectlyMonetizable ??
          null,
      }).score,
    impactLevel:
      patch.impactLevel ??
      current?.impactLevel ??
      getActionImpactScore(nextActionStatus, {
        hasRealUser:
          patch.hasRealUser ?? current?.hasRealUser ?? base.hasRealUser ?? null,
        hasClearUseCase:
          patch.hasClearUseCase ??
          current?.hasClearUseCase ??
          base.hasClearUseCase ??
          null,
        isDirectlyMonetizable:
          patch.isDirectlyMonetizable ??
          current?.isDirectlyMonetizable ??
          base.isDirectlyMonetizable ??
          null,
      }).impactLevel,
    evidenceLevel:
      patch.evidenceLevel ??
      current?.evidenceLevel ??
      getEvidenceLevelForStatus(nextActionStatus),
    decisionSignals:
      patch.decisionSignals ??
      current?.decisionSignals ??
      {
        successPatterns: [],
        failurePatterns: [],
      },
    outcome: nextOutcome,
    successReasons:
      patch.successReasons?.length
        ? patch.successReasons
        : current?.successReasons?.length
          ? current.successReasons
          : inferredBehavior.successReasons,
    failureReasons:
      patch.failureReasons?.length
        ? patch.failureReasons
        : current?.failureReasons?.length
          ? current.failureReasons
          : inferredBehavior.failureReasons,
    confidence: patch.confidence ?? current?.confidence ?? inferredBehavior.confidence,
    source: patch.source ?? current?.source ?? 'system_inferred',
    notes: patch.notes ?? current?.notes ?? null,
    evidenceTags:
      patch.evidenceTags?.length
        ? patch.evidenceTags
        : current?.evidenceTags?.length
          ? current.evidenceTags
          : inferredBehavior.evidenceTags,
    categoryLabel:
      patch.categoryLabel ?? current?.categoryLabel ?? base.categoryLabel ?? null,
    projectType:
      patch.projectType ?? current?.projectType ?? base.projectType ?? null,
    targetUsersLabel:
      patch.targetUsersLabel ??
      current?.targetUsersLabel ??
      base.targetUsersLabel ??
      null,
    useCaseLabel:
      patch.useCaseLabel ?? current?.useCaseLabel ?? base.useCaseLabel ?? null,
    hasRealUser:
      patch.hasRealUser ?? current?.hasRealUser ?? base.hasRealUser ?? null,
    hasClearUseCase:
      patch.hasClearUseCase ??
      current?.hasClearUseCase ??
      base.hasClearUseCase ??
      null,
    isDirectlyMonetizable:
      patch.isDirectlyMonetizable ??
      current?.isDirectlyMonetizable ??
      base.isDirectlyMonetizable ??
      null,
    patternKeys:
      normalizePatternKeys(
        patch.patternKeys ??
          current?.patternKeys ??
          base.patternKeys ??
          buildPatternKeys({
            categoryLabel:
              patch.categoryLabel ??
              current?.categoryLabel ??
              base.categoryLabel ??
              null,
            projectType:
              patch.projectType ?? current?.projectType ?? base.projectType ?? null,
            targetUsersLabel:
              patch.targetUsersLabel ??
              current?.targetUsersLabel ??
              base.targetUsersLabel ??
              null,
            useCaseLabel:
              patch.useCaseLabel ??
              current?.useCaseLabel ??
              base.useCaseLabel ??
              null,
          }),
      ),
    updatedAt: now,
  };

  return upsertActionLoopEntry(hydrateActionLoopEntry(merged));
}

export function updateExecutionStatus(
  repoId: string,
  status: ExecutionStatus,
  patch: Partial<ActionLoopEntry> = {},
) {
  const current = readActionLoopEntry(repoId);
  if (!current) {
    return null;
  }

  return upsertActionLoopEntry(
    hydrateActionLoopEntry({
      ...current,
      ...patch,
      actionStatus: status,
      followUpStage:
        patch.followUpStage ?? inferFollowUpStageFromStatus(status, current.followUpStage),
      actionStartedAt:
        patch.actionStartedAt ??
        current.actionStartedAt ??
        (status !== 'NOT_STARTED' && status !== 'DROPPED'
          ? new Date().toISOString()
          : null),
      actionUpdatedAt: patch.actionUpdatedAt ?? new Date().toISOString(),
      updatedAt: patch.actionUpdatedAt ?? new Date().toISOString(),
      outcome: resolveActionOutcome(patch.outcome, current, status),
    }),
  );
}

export function updateFollowUpStage(
  repoId: string,
  stage: FollowUpStage,
  patch: Partial<ActionLoopEntry> = {},
) {
  const current = readActionLoopEntry(repoId);
  if (!current) {
    return null;
  }

  return upsertActionLoopEntry(
    hydrateActionLoopEntry({
      ...current,
      ...patch,
      followUpStage: stage,
      actionStatus:
        patch.actionStatus ??
        inferActionStatusFromStage(stage, current.actionStatus),
      isActiveFollowUp:
        patch.isActiveFollowUp ?? (stage === 'OBSERVE' ? false : current.isActiveFollowUp),
      actionUpdatedAt: patch.actionUpdatedAt ?? new Date().toISOString(),
      updatedAt: patch.actionUpdatedAt ?? new Date().toISOString(),
      outcome: resolveActionOutcome(
        patch.outcome,
        current,
        patch.actionStatus ?? inferActionStatusFromStage(stage, current.actionStatus),
      ),
    }),
  );
}

export function advanceFollowUpStage(
  repoId: string,
  patch: Partial<ActionLoopEntry> = {},
) {
  const current = readActionLoopEntry(repoId);
  if (!current) {
    return null;
  }

  const nextStage = getNextFollowUpStage(current.followUpStage);
  return updateFollowUpStage(repoId, nextStage, {
    ...patch,
    isActiveFollowUp: nextStage !== 'DECIDE' ? true : patch.isActiveFollowUp ?? true,
    priorityBoosted:
      patch.priorityBoosted ?? current.priorityBoosted ?? nextStage === 'DECIDE',
  });
}

export function pauseFollowUp(repoId: string) {
  return updateExecutionStatus(repoId, 'NOT_STARTED', {
    isActiveFollowUp: false,
    followUpStage: 'OBSERVE',
    outcome: 'PAUSED',
    source: 'manual_click',
  });
}

export function markValidationPassed(repoId: string) {
  appendActionLog('validation_passed', repoId);
  return updateExecutionStatus(repoId, 'COMPLETED', {
    isActiveFollowUp: true,
    followUpStage: 'DECIDE',
    priorityBoosted: true,
    outcome: 'SUCCESS',
    source: 'validation_result',
    confidence: 'high',
  });
}

export function markValidationFailed(repoId: string) {
  appendActionLog('validation_failed', repoId);
  return updateExecutionStatus(repoId, 'DROPPED', {
    isActiveFollowUp: false,
    followUpStage: 'OBSERVE',
    priorityBoosted: false,
    outcome: 'DROPPED',
    source: 'validation_result',
    confidence: 'high',
  });
}

export function appendActionLog(type: ActionLogType, repoId: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  const record: ActionLogRecord = {
    type,
    repoId,
    timestamp: new Date().toISOString(),
  };

  try {
    const raw = window.localStorage.getItem(ACTION_LOG_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const nextLogs = Array.isArray(parsed)
      ? [record, ...parsed.filter(isActionLogRecord)].slice(0, 200)
      : [record];
    window.localStorage.setItem(ACTION_LOG_STORAGE_KEY, JSON.stringify(nextLogs));
  } catch {
    // ignore local log persistence errors
  }

  try {
    console.info(type, {
      repoId,
      timestamp: record.timestamp,
    });
  } catch {
    // ignore console errors
  }

  return record;
}

export function subscribeActionLoop(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const notify = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACTION_LOOP_STORAGE_KEY || event.key === LEGACY_ACTION_LOOP_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener(ACTION_LOOP_EVENT, notify);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(ACTION_LOOP_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
}

export function getActiveFollowUpEntries(limit = 3) {
  return readActionLoopEntries()
    .filter(
      (entry) =>
        entry.isActiveFollowUp &&
        entry.actionStatus !== 'DROPPED' &&
        entry.actionStatus !== 'COMPLETED',
    )
    .slice(0, limit);
}

export function getActiveExecutionEntries(limit = 3) {
  return readActionLoopEntries()
    .filter(
      (entry) =>
        entry.actionStatus === 'IN_PROGRESS' ||
        entry.actionStatus === 'VALIDATING',
    )
    .slice(0, limit);
}

export function getUserPreferenceProfile(
  entries: ActionLoopEntry[] = readActionLoopEntries(),
): UserPreferenceProfile {
  const categoryScores = new Map<string, number>();
  const userScores = new Map<string, number>();
  const patternScores = new Map<string, number>();
  const categoryCompleted = new Map<string, number>();
  const categoryDropped = new Map<string, number>();
  const successPatterns = new Set<string>();
  const failurePatterns = new Set<string>();

  for (const entry of entries) {
    const score = entry.actionScore ?? getActionScore(entry.actionStatus);
    const category = normalizeDisplayLabel(entry.categoryLabel);
    const userType = normalizeDisplayLabel(entry.targetUsersLabel);

    if (category) {
      categoryScores.set(category, (categoryScores.get(category) ?? 0) + score);

      if (entry.actionStatus === 'COMPLETED') {
        categoryCompleted.set(category, (categoryCompleted.get(category) ?? 0) + 1);
      }

      if (entry.actionStatus === 'DROPPED') {
        categoryDropped.set(category, (categoryDropped.get(category) ?? 0) + 1);
      }
    }

    if (userType) {
      userScores.set(userType, (userScores.get(userType) ?? 0) + score);
    }

    for (const pattern of entry.decisionSignals.successPatterns) {
      successPatterns.add(pattern);
      patternScores.set(pattern, (patternScores.get(pattern) ?? 0) + Math.max(score, 3));
    }

    for (const pattern of entry.decisionSignals.failurePatterns) {
      failurePatterns.add(pattern);
      patternScores.set(pattern, (patternScores.get(pattern) ?? 0) + Math.min(score, -3));
    }
  }

  const preferredCategories = Array.from(categoryScores.entries())
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([category]) => category)
    .slice(0, 4);
  const avoidedCategories = Array.from(categoryScores.entries())
    .filter(([, score]) => score < 0)
    .sort((left, right) => left[1] - right[1])
    .map(([category]) => category)
    .slice(0, 4);
  const topCategories = Array.from(categoryScores.entries())
    .filter(([, score]) => score !== 0)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .map(([category]) => category)
    .slice(0, 5);
  const topUserTypes = Array.from(userScores.entries())
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([user]) => user)
    .slice(0, 4);
  const successRateByCategory = topCategories
    .map((category) => {
      const completedCount = categoryCompleted.get(category) ?? 0;
      const droppedCount = categoryDropped.get(category) ?? 0;
      const total = completedCount + droppedCount;

      return {
        category,
        completedCount,
        droppedCount,
        successRate: total > 0 ? completedCount / total : 0,
      };
    })
    .filter((item) => item.completedCount > 0 || item.droppedCount > 0);

  return {
    preferredCategories,
    avoidedCategories,
    topCategories,
    topUserTypes,
    successRateByCategory,
    successPatterns: Array.from(successPatterns).slice(0, 12),
    failurePatterns: Array.from(failurePatterns).slice(0, 12),
    generatedAt: new Date().toISOString(),
  };
}

export function getUserBehaviorSignalPayload(
  context?: ActionLoopPatternContext & {
    currentActionStatus?: ExecutionStatus | null;
    strengthWeightHint?: number | null;
    monetizationWeightHint?: number | null;
    freshnessWeightHint?: number | null;
  },
  entries: ActionLoopEntry[] = readActionLoopEntries(),
) {
  const profile = getUserPreferenceProfile(entries);
  const memoryInput = mergeBehaviorModelInput();
  const memoryState = getBehaviorMemorySnapshot();
  const recommendationScore = context
    ? scoreBehaviorRecommendation(
        {
          categoryLabel: context.categoryLabel ?? null,
          projectType: context.projectType ?? null,
          targetUsersLabel: context.targetUsersLabel ?? null,
          useCaseLabel: context.useCaseLabel ?? null,
          patternKeys: context.patternKeys ?? [],
          hasRealUser: context.hasRealUser ?? null,
          hasClearUseCase: context.hasClearUseCase ?? null,
          isDirectlyMonetizable: context.isDirectlyMonetizable ?? null,
          currentActionStatus: context.currentActionStatus ?? null,
          strengthWeightHint: context.strengthWeightHint ?? null,
          monetizationWeightHint: context.monetizationWeightHint ?? null,
          freshnessWeightHint: context.freshnessWeightHint ?? null,
        },
        memoryState.profile,
      )
    : null;
  const priorityBoost = recommendationScore
    ? Math.max(-4, Math.min(8, Math.round(recommendationScore.score)))
    : 0;

  return {
    userSuccessPatterns:
      memoryInput.userSuccessPatterns.length > 0
        ? memoryInput.userSuccessPatterns.slice(0, 8)
        : profile.successPatterns.slice(0, 8),
    userFailurePatterns:
      memoryInput.userFailurePatterns.length > 0
        ? memoryInput.userFailurePatterns.slice(0, 8)
        : profile.failurePatterns.slice(0, 8),
    preferredCategories: memoryInput.preferredCategories.slice(0, 6),
    avoidedCategories: memoryInput.avoidedCategories.slice(0, 6),
    recentValidatedWins: memoryInput.recentValidatedWins.slice(0, 6),
    recentDroppedReasons: memoryInput.recentDroppedReasons.slice(0, 6),
    userPreferencePriorityBoost: priorityBoost,
    userPreferencePriorityReasons: recommendationScore
      ? [
          ...recommendationScore.matchedPreferredCategories.slice(0, 1).map(
            (item) => `preferred:${item}`,
          ),
          ...recommendationScore.matchedFailureReasons
            .slice(0, 1)
            .map((item) => `avoid:${item}`),
        ].slice(0, 3)
      : [],
  };
}

export function scoreRepositoryForActionLoop(
  patternKeys: string[],
  profile: UserPreferenceProfile,
): ActionLoopRecommendationScore {
  const normalized = normalizePatternKeys(patternKeys);
  const matchedSuccessPatterns = profile.successPatterns.filter((pattern) =>
    normalized.includes(pattern),
  );
  const matchedFailurePatterns = profile.failurePatterns.filter((pattern) =>
    normalized.includes(pattern),
  );
  const matchedCategories = profile.preferredCategories.filter((pattern) =>
    normalized.includes(`category:${pattern}`),
  );
  const matchedAvoidedCategories = profile.avoidedCategories.filter((pattern) =>
    normalized.includes(`category:${pattern}`),
  );

  let score = 0;
  score += matchedSuccessPatterns.length * 2;
  score += matchedCategories.length * 3;
  score -= matchedFailurePatterns.length * 4;
  score -= matchedAvoidedCategories.length * 5;

  return {
    score,
    matchedSuccessPatterns,
    matchedFailurePatterns,
    matchedCategories,
    blocked:
      (matchedFailurePatterns.length > 0 || matchedAvoidedCategories.length > 0) &&
      matchedSuccessPatterns.length === 0 &&
      matchedCategories.length === 0,
  };
}

function writeActionLoopEntries(entries: ActionLoopEntry[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ACTION_LOOP_STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(ACTION_LOOP_EVENT));
}

function resolveActionOutcome(
  explicitOutcome: ActionLoopEntry['outcome'] | undefined,
  current: Pick<ActionLoopEntry, 'actionStatus' | 'outcome'> | null,
  nextStatus: ExecutionStatus,
) {
  if (explicitOutcome) {
    return explicitOutcome;
  }

  if (!current || current.actionStatus !== nextStatus) {
    return inferBehaviorOutcomeFromStatus(nextStatus);
  }

  return current.outcome ?? inferBehaviorOutcomeFromStatus(nextStatus);
}

function normalizeActionLoopEntry(value: unknown): ActionLoopEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const repoId = asString(entry.repoId);
  const repositoryName = asString(entry.repositoryName);
  const repositoryFullName = asString(entry.repositoryFullName);
  const htmlUrl = asString(entry.htmlUrl);
  const detailPath = asString(entry.detailPath);
  const headline = asString(entry.headline);
  const reason = asString(entry.reason);

  if (!repoId || !repositoryName || !repositoryFullName || !htmlUrl || !detailPath) {
    return null;
  }

  const actionStatus = normalizeActionStatus(entry.actionStatus ?? entry.status);
  const followUpStage = normalizeFollowUpStage(
    entry.followUpStage,
    actionStatus,
  );
  const actionUpdatedAt =
    asString(entry.actionUpdatedAt) ||
    asString(entry.updatedAt) ||
    new Date().toISOString();
  const actionStartedAt =
    asString(entry.actionStartedAt) ||
    (actionStatus !== 'NOT_STARTED' && actionStatus !== 'DROPPED'
      ? actionUpdatedAt
      : null);
  const categoryLabel = asNullableString(entry.categoryLabel);
  const projectType = asNullableString(entry.projectType);
  const targetUsersLabel = asNullableString(entry.targetUsersLabel);
  const useCaseLabel = asNullableString(entry.useCaseLabel);
  const hasRealUser = asNullableBoolean(entry.hasRealUser);
  const hasClearUseCase = asNullableBoolean(entry.hasClearUseCase);
  const isDirectlyMonetizable = asNullableBoolean(entry.isDirectlyMonetizable);
  const patternKeys = normalizePatternKeys(
    Array.isArray(entry.patternKeys)
      ? entry.patternKeys
      : buildPatternKeys({
          categoryLabel,
          projectType,
          targetUsersLabel,
          useCaseLabel,
        }),
  );
  const inferredBehavior = inferBehaviorReasons({
    outcome:
      normalizeOutcome(entry.outcome) ?? inferBehaviorOutcomeFromStatus(actionStatus),
    projectType,
    hasRealUser,
    hasClearUseCase,
    isDirectlyMonetizable,
    targetUsersLabel,
    useCaseLabel,
    patternKeys,
    priorityBoosted: Boolean(entry.priorityBoosted),
  });

  return {
    repoId,
    repositoryName,
    repositoryFullName,
    htmlUrl,
    detailPath,
    headline: headline || repositoryName,
    reason: reason || '先回到这个项目，继续推进下一步。',
    actionStatus,
    followUpStage,
    isActiveFollowUp: Boolean(entry.isActiveFollowUp),
    actionStartedAt,
    actionUpdatedAt,
    priorityBoosted: Boolean(entry.priorityBoosted),
    actionScore:
      typeof entry.actionScore === 'number'
        ? entry.actionScore
        : getActionScore(actionStatus),
    actionImpactScore:
      typeof entry.actionImpactScore === 'number'
        ? entry.actionImpactScore
        : getActionImpactScore(actionStatus, {
            hasRealUser,
            hasClearUseCase,
            isDirectlyMonetizable,
          }).score,
    impactLevel:
      entry.impactLevel === 'HIGH' ||
      entry.impactLevel === 'MEDIUM' ||
      entry.impactLevel === 'LOW'
        ? entry.impactLevel
        : getActionImpactScore(actionStatus, {
            hasRealUser,
            hasClearUseCase,
            isDirectlyMonetizable,
          }).impactLevel,
    evidenceLevel:
      entry.evidenceLevel === 'HIGH' ||
      entry.evidenceLevel === 'MEDIUM' ||
      entry.evidenceLevel === 'LOW'
        ? entry.evidenceLevel
        : getEvidenceLevelForStatus(actionStatus),
    decisionSignals: normalizeDecisionSignals(entry.decisionSignals, actionStatus, patternKeys),
    outcome:
      normalizeOutcome(entry.outcome) ?? inferBehaviorOutcomeFromStatus(actionStatus),
    successReasons:
      normalizeSuccessReasons(entry.successReasons).length > 0
        ? normalizeSuccessReasons(entry.successReasons)
        : inferredBehavior.successReasons,
    failureReasons:
      normalizeFailureReasons(entry.failureReasons).length > 0
        ? normalizeFailureReasons(entry.failureReasons)
        : inferredBehavior.failureReasons,
    confidence: normalizeOutcomeConfidence(entry.confidence) ?? inferredBehavior.confidence,
    source: normalizeOutcomeSource(entry.source) ?? 'system_inferred',
    notes: asNullableString(entry.notes),
    evidenceTags:
      normalizeStringArray(entry.evidenceTags, 16).length > 0
        ? normalizeStringArray(entry.evidenceTags, 16)
        : inferredBehavior.evidenceTags,
    categoryLabel,
    projectType,
    targetUsersLabel,
    useCaseLabel,
    hasRealUser,
    hasClearUseCase,
    isDirectlyMonetizable,
    patternKeys,
    status: actionStatus,
    updatedAt: actionUpdatedAt,
  };
}

function normalizeActionStatus(value: unknown): ExecutionStatus {
  const normalized = asString(value);

  if (normalized === 'VALIDATED') {
    return 'COMPLETED';
  }

  if (normalized === 'ABANDONED') {
    return 'DROPPED';
  }

  if (
    normalized === 'NOT_STARTED' ||
    normalized === 'IN_PROGRESS' ||
    normalized === 'VALIDATING' ||
    normalized === 'COMPLETED' ||
    normalized === 'DROPPED'
  ) {
    return normalized;
  }

  return 'NOT_STARTED';
}

function normalizeFollowUpStage(
  value: unknown,
  status: ExecutionStatus,
): FollowUpStage {
  const normalized = asString(value);

  if (
    normalized === 'OBSERVE' ||
    normalized === 'TRY' ||
    normalized === 'VALIDATE' ||
    normalized === 'DECIDE'
  ) {
    return normalized;
  }

  return inferFollowUpStageFromStatus(status);
}

function inferFollowUpStageFromStatus(
  status: ExecutionStatus,
  current?: FollowUpStage,
): FollowUpStage {
  if (current) {
    return current;
  }

  if (status === 'VALIDATING') {
    return 'VALIDATE';
  }

  if (status === 'IN_PROGRESS') {
    return 'TRY';
  }

  if (status === 'COMPLETED') {
    return 'DECIDE';
  }

  return 'OBSERVE';
}

function inferActionStatusFromStage(
  stage: FollowUpStage,
  current?: ExecutionStatus,
): ExecutionStatus {
  if (current === 'DROPPED') {
    return 'DROPPED';
  }

  if (stage === 'VALIDATE') {
    return 'VALIDATING';
  }

  if (stage === 'TRY') {
    return 'IN_PROGRESS';
  }

  if (stage === 'DECIDE') {
    return 'COMPLETED';
  }

  return 'NOT_STARTED';
}

function readStorage(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value: unknown) {
  const normalized = asString(value);
  return normalized || null;
}

function asNullableBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  return null;
}

function normalizeOutcome(value: unknown): ActionOutcome | null {
  return value === 'SUCCESS' ||
    value === 'FAILED' ||
    value === 'DROPPED' ||
    value === 'PAUSED' ||
    value === 'IN_PROGRESS' ||
    value === 'VALIDATING'
    ? value
    : null;
}

function normalizeOutcomeConfidence(
  value: unknown,
): BehaviorOutcomeConfidence | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null;
}

function normalizeOutcomeSource(value: unknown): BehaviorOutcomeSource | null {
  return value === 'manual_click' ||
    value === 'repeated_progress' ||
    value === 'validation_result' ||
    value === 'system_inferred'
    ? value
    : null;
}

function normalizeSuccessReasons(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as SuccessReasonCode[];
  }

  return Array.from(
    new Set(
      value.filter((item): item is SuccessReasonCode =>
        typeof item === 'string' && item in SUCCESS_REASON_LABELS,
      ),
    ),
  );
}

function normalizeFailureReasons(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as FailureReasonCode[];
  }

  return Array.from(
    new Set(
      value.filter((item): item is FailureReasonCode =>
        typeof item === 'string' && item in FAILURE_REASON_LABELS,
      ),
    ),
  );
}

function isActionLogRecord(value: unknown): value is ActionLogRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return (
    typeof entry.type === 'string' &&
    typeof entry.repoId === 'string' &&
    typeof entry.timestamp === 'string'
  );
}

function hydrateActionLoopEntry(entry: ActionLoopEntry): ActionLoopEntry {
  const patternKeys = normalizePatternKeys(
    entry.patternKeys.length
      ? entry.patternKeys
      : buildPatternKeys({
          categoryLabel: entry.categoryLabel ?? null,
          projectType: entry.projectType ?? null,
          targetUsersLabel: entry.targetUsersLabel ?? null,
          useCaseLabel: entry.useCaseLabel ?? null,
        }),
  );
  const inferredBehavior = inferBehaviorReasons({
    outcome: entry.outcome ?? inferBehaviorOutcomeFromStatus(entry.actionStatus),
    projectType: entry.projectType ?? null,
    hasRealUser: entry.hasRealUser ?? null,
    hasClearUseCase: entry.hasClearUseCase ?? null,
    isDirectlyMonetizable: entry.isDirectlyMonetizable ?? null,
    targetUsersLabel: entry.targetUsersLabel ?? null,
    useCaseLabel: entry.useCaseLabel ?? null,
    patternKeys,
    priorityBoosted: entry.priorityBoosted,
  });

  return {
    ...entry,
    patternKeys,
    actionScore: getActionScore(entry.actionStatus),
    actionImpactScore: getActionImpactScore(entry.actionStatus, {
      hasRealUser: entry.hasRealUser ?? null,
      hasClearUseCase: entry.hasClearUseCase ?? null,
      isDirectlyMonetizable: entry.isDirectlyMonetizable ?? null,
    }).score,
    impactLevel: getActionImpactScore(entry.actionStatus, {
      hasRealUser: entry.hasRealUser ?? null,
      hasClearUseCase: entry.hasClearUseCase ?? null,
      isDirectlyMonetizable: entry.isDirectlyMonetizable ?? null,
    }).impactLevel,
    evidenceLevel: entry.evidenceLevel ?? getEvidenceLevelForStatus(entry.actionStatus),
    decisionSignals: normalizeDecisionSignals(
      entry.decisionSignals,
      entry.actionStatus,
      patternKeys,
    ),
    outcome: entry.outcome ?? inferBehaviorOutcomeFromStatus(entry.actionStatus),
    successReasons:
      entry.successReasons?.length ? entry.successReasons : inferredBehavior.successReasons,
    failureReasons:
      entry.failureReasons?.length ? entry.failureReasons : inferredBehavior.failureReasons,
    confidence: entry.confidence ?? inferredBehavior.confidence,
    source: entry.source ?? 'system_inferred',
    notes: entry.notes ?? null,
    evidenceTags:
      entry.evidenceTags?.length ? entry.evidenceTags : inferredBehavior.evidenceTags,
  };
}

function normalizeDecisionSignals(
  value: unknown,
  status: ExecutionStatus,
  patternKeys: unknown,
): ActionDecisionSignals {
  const normalizedPatternKeys = normalizePatternKeys(patternKeys);
  const signals =
    value && typeof value === 'object'
      ? (value as Partial<ActionDecisionSignals>)
      : null;
  const successPatterns = Array.isArray(signals?.successPatterns)
    ? normalizePatternKeys(signals?.successPatterns)
    : [];
  const failurePatterns = Array.isArray(signals?.failurePatterns)
    ? normalizePatternKeys(signals?.failurePatterns)
    : [];

  if (successPatterns.length || failurePatterns.length) {
    return {
      successPatterns,
      failurePatterns,
    };
  }

  if (status === 'COMPLETED') {
    return {
      successPatterns: normalizedPatternKeys,
      failurePatterns: [],
    };
  }

  if (status === 'DROPPED') {
    return {
      successPatterns: [],
      failurePatterns: normalizedPatternKeys,
    };
  }

  return {
    successPatterns: [],
    failurePatterns: [],
  };
}

function buildPatternKeys(input: ActionLoopPatternContext) {
  const keys = [
    buildPatternKey('category', input.categoryLabel),
    buildPatternKey('type', input.projectType),
    buildPatternKey('user', input.targetUsersLabel),
    buildPatternKey('usecase', input.useCaseLabel),
  ];

  return normalizePatternKeys(keys);
}

function buildPatternKey(prefix: string, value: string | null | undefined) {
  const normalized = normalizeDisplayLabel(value);
  return normalized ? `${prefix}:${normalized}` : null;
}

function normalizePatternKeys(values: unknown) {
  if (!Array.isArray(values)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeDisplayLabel(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 12);
}

function normalizeStringArray(values: unknown, max = 12) {
  if (!Array.isArray(values)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      values
        .map((value) => asString(value).replace(/\s+/g, ' ').trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, max);
}

function normalizeDisplayLabel(value: unknown) {
  const normalized = asString(value)
    .replace(/\s+/g, ' ')
    .replace(/^当前阶段 ·\s*/, '')
    .replace(/^当前状态 ·\s*/, '')
    .trim();

  if (
    !normalized ||
    normalized.length < 2 ||
    normalized.length > 80 ||
    /目标用户还需要继续确认|先确认谁会持续使用它|收费路径还不够清楚|更适合先验证价值|先确认真实用户和场景|先确认这个项目到底值不值得继续补分析/.test(
      normalized,
    )
  ) {
    return null;
  }

  return normalized;
}
