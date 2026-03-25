'use client';

import {
  appendBehaviorMemoryEntry,
  buildBehaviorMemoryState,
  buildModelBehaviorMemoryInput,
  clearBehaviorMemoryState,
  createEmptyBehaviorMemoryState,
  explainBehaviorRecommendation,
  inferBehaviorOutcomeFromStatus,
  inferBehaviorReasons,
  mergeBehaviorMemoryStates,
  normalizeBehaviorMemoryState,
  scoreBehaviorRecommendation,
  type ActionOutcome,
  type BehaviorEvidenceLevel,
  type BehaviorMemoryEntry,
  type BehaviorMemoryState,
  type ImpactLevel,
  type BehaviorOutcomeConfidence,
  type BehaviorOutcomeSource,
  type BehaviorRecommendationContext,
} from 'shared';
import { clearBehaviorMemory, getBehaviorMemory, updateBehaviorMemory } from '@/lib/api/settings';
import type { ActionLoopEntry } from '@/lib/action-loop';

const BEHAVIOR_MEMORY_STORAGE_KEY = 'gitdian.behavior-memory.v1';
const BEHAVIOR_MEMORY_EVENT = 'gitdian:behavior-memory-updated';

type ActionLoopBehaviorInput = Pick<
  ActionLoopEntry,
  | 'repoId'
  | 'repositoryName'
  | 'repositoryFullName'
  | 'categoryLabel'
  | 'projectType'
  | 'targetUsersLabel'
  | 'useCaseLabel'
  | 'patternKeys'
  | 'actionStatus'
  | 'followUpStage'
  | 'actionStartedAt'
  | 'actionUpdatedAt'
  | 'actionImpactScore'
  | 'impactLevel'
  | 'evidenceLevel'
  | 'actionScore'
  | 'hasRealUser'
  | 'hasClearUseCase'
  | 'isDirectlyMonetizable'
  | 'outcome'
  | 'successReasons'
  | 'failureReasons'
  | 'confidence'
  | 'source'
  | 'notes'
  | 'evidenceTags'
>;

let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;
let syncTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

function canUseWindow() {
  return typeof window !== 'undefined';
}

function readStorage() {
  if (!canUseWindow()) {
    return null;
  }

  try {
    return window.localStorage.getItem(BEHAVIOR_MEMORY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(state: BehaviorMemoryState) {
  if (!canUseWindow()) {
    return;
  }

  window.localStorage.setItem(BEHAVIOR_MEMORY_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(BEHAVIOR_MEMORY_EVENT));
}

function buildEntryFromActionLoop(
  entry: ActionLoopBehaviorInput,
): BehaviorMemoryEntry | null {
  const hasExplicitOutcome = Boolean(entry.outcome);
  const outcome = entry.outcome ?? inferBehaviorOutcomeFromStatus(entry.actionStatus);

  if (entry.actionStatus === 'NOT_STARTED' && !hasExplicitOutcome) {
    return null;
  }

  const inferred = inferBehaviorReasons({
    outcome,
    projectType: entry.projectType,
    hasRealUser: entry.hasRealUser,
    hasClearUseCase: entry.hasClearUseCase,
    isDirectlyMonetizable: entry.isDirectlyMonetizable,
    targetUsersLabel: entry.targetUsersLabel,
    useCaseLabel: entry.useCaseLabel,
    patternKeys: entry.patternKeys,
    priorityBoosted: false,
  });

  return {
    repoId: entry.repoId,
    repositoryName: entry.repositoryName,
    repositoryFullName: entry.repositoryFullName,
    categoryLabel: entry.categoryLabel ?? null,
    projectType: entry.projectType ?? null,
    targetUsersLabel: entry.targetUsersLabel ?? null,
    useCaseLabel: entry.useCaseLabel ?? null,
    patternKeys: entry.patternKeys ?? [],
    actionStatus: entry.actionStatus,
    followUpStage: entry.followUpStage,
    actionStartedAt: entry.actionStartedAt,
    actionUpdatedAt: entry.actionUpdatedAt,
    outcome,
    successReasons: entry.successReasons?.length
      ? entry.successReasons
      : inferred.successReasons,
    failureReasons: entry.failureReasons?.length
      ? entry.failureReasons
      : inferred.failureReasons,
    confidence: entry.confidence ?? inferred.confidence,
    source: entry.source ?? 'system_inferred',
    notes: entry.notes ?? null,
    evidenceTags:
      entry.evidenceTags?.length ?? 0
        ? entry.evidenceTags
        : inferred.evidenceTags,
    evidenceLevel: (entry.evidenceLevel ?? null) as BehaviorEvidenceLevel | null,
    impactLevel: (entry.impactLevel ?? null) as ImpactLevel | null,
    actionImpactScore: entry.actionImpactScore ?? null,
    actionScore: entry.actionScore,
    hasRealUser: entry.hasRealUser ?? null,
    hasClearUseCase: entry.hasClearUseCase ?? null,
    isDirectlyMonetizable: entry.isDirectlyMonetizable ?? null,
  };
}

export function readBehaviorMemoryState() {
  const raw = readStorage();
  if (!raw) {
    return createEmptyBehaviorMemoryState();
  }

  try {
    return normalizeBehaviorMemoryState(JSON.parse(raw));
  } catch {
    return createEmptyBehaviorMemoryState();
  }
}

export function getBehaviorMemorySnapshot() {
  return readBehaviorMemoryState();
}

export function subscribeBehaviorMemory(listener: () => void) {
  if (!canUseWindow()) {
    return () => {};
  }

  void hydrateBehaviorMemoryFromServer();

  const notify = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key === BEHAVIOR_MEMORY_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener(BEHAVIOR_MEMORY_EVENT, notify);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(BEHAVIOR_MEMORY_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
}

export function getBehaviorMemoryProfile() {
  return readBehaviorMemoryState().profile;
}

export function getBehaviorMemoryMetrics() {
  return readBehaviorMemoryState().metrics;
}

export function getBehaviorMemoryModelInput() {
  return buildModelBehaviorMemoryInput(readBehaviorMemoryState().profile);
}

export function recordBehaviorOutcomeFromActionLoop(
  entry: ActionLoopBehaviorInput,
) {
  const memoryEntry = buildEntryFromActionLoop(entry);
  if (!memoryEntry) {
    return readBehaviorMemoryState();
  }

  const nextState = appendBehaviorMemoryEntry(readBehaviorMemoryState(), memoryEntry);
  writeStorage(nextState);
  queueBehaviorMemorySync(nextState);
  return nextState;
}

export function backfillBehaviorMemoryFromActionLoop(
  entries: ActionLoopBehaviorInput[],
) {
  const current = readBehaviorMemoryState();
  if (current.recentActionOutcomes.length > 0) {
    return current;
  }

  const memoryEntries = entries
    .map((entry) => buildEntryFromActionLoop(entry))
    .filter((entry): entry is BehaviorMemoryEntry => Boolean(entry));

  if (!memoryEntries.length) {
    return current;
  }

  const nextState = buildBehaviorMemoryState(memoryEntries, current.runtimeStats);
  writeStorage(nextState);
  queueBehaviorMemorySync(nextState);
  return nextState;
}

export function getBehaviorRecommendation(
  context: BehaviorRecommendationContext,
) {
  const current = readBehaviorMemoryState();
  const nextState = buildBehaviorMemoryState(current.recentActionOutcomes, {
    ...current.runtimeStats,
    memoryLookups: current.runtimeStats.memoryLookups + 1,
  });
  const score = scoreBehaviorRecommendation(context, nextState.profile);
  const updatedState = buildBehaviorMemoryState(nextState.recentActionOutcomes, {
    ...nextState.runtimeStats,
    memoryHits:
      nextState.runtimeStats.memoryHits + (score.score !== 0 || score.blocked ? 1 : 0),
    recommendationAdjustedByBehaviorCount:
      nextState.runtimeStats.recommendationAdjustedByBehaviorCount +
      (score.score !== 0 || score.blocked ? 1 : 0),
  });
  writeStorage(updatedState);
  queueBehaviorMemorySync(updatedState);

  return {
    score,
    profile: updatedState.profile,
  };
}

export function trackBehaviorMemoryUsage(input: {
  lookups?: number;
  hits?: number;
  adjusted?: number;
  explainRendered?: number;
  explainVisible?: number;
}) {
  const current = readBehaviorMemoryState();
  const nextState = buildBehaviorMemoryState(current.recentActionOutcomes, {
    ...current.runtimeStats,
    memoryLookups: current.runtimeStats.memoryLookups + (input.lookups ?? 0),
    memoryHits: current.runtimeStats.memoryHits + (input.hits ?? 0),
    recommendationAdjustedByBehaviorCount:
      current.runtimeStats.recommendationAdjustedByBehaviorCount +
      (input.adjusted ?? 0),
    explainRenderedCount:
      current.runtimeStats.explainRenderedCount + (input.explainRendered ?? 0),
    explainVisibleCount:
      current.runtimeStats.explainVisibleCount + (input.explainVisible ?? 0),
  });
  writeStorage(nextState);
  queueBehaviorMemorySync(nextState);
  return nextState.metrics;
}

export function getBehaviorRecommendationExplanation(
  context: BehaviorRecommendationContext,
) {
  const current = readBehaviorMemoryState();
  const score = scoreBehaviorRecommendation(context, current.profile);
  const explanation = explainBehaviorRecommendation(context, current.profile, score);
  const nextState = buildBehaviorMemoryState(current.recentActionOutcomes, {
    ...current.runtimeStats,
    explainRenderedCount: current.runtimeStats.explainRenderedCount + 1,
    explainVisibleCount:
      current.runtimeStats.explainVisibleCount + (explanation.influenced ? 1 : 0),
  });
  writeStorage(nextState);
  queueBehaviorMemorySync(nextState);

  return {
    explanation,
    score,
    profile: nextState.profile,
  };
}

export async function hydrateBehaviorMemoryFromServer() {
  if (!canUseWindow()) {
    return;
  }

  if (bootstrapped) {
    return;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    try {
      const remote = await getBehaviorMemory({ timeoutMs: 2500 });
      const local = readBehaviorMemoryState();
      const merged = mergeBehaviorMemoryStates(local, remote);
      writeStorage(merged);
    } catch {
      // ignore hydration failures and keep local cache as source of truth
    } finally {
      bootstrapped = true;
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}

export function clearBehaviorMemoryCache() {
  const next = createEmptyBehaviorMemoryState();
  writeStorage(next);
  queueBehaviorMemorySync(next);
  return next;
}

export async function resetBehaviorMemoryEverywhere() {
  const next = clearBehaviorMemoryCache();

  try {
    await clearBehaviorMemory();
  } catch {
    // ignore remote reset failures
  }

  return next;
}

export function clearBehaviorMemoryByCategory(category: string) {
  const next = clearBehaviorMemoryState(readBehaviorMemoryState(), {
    type: 'category',
    value: category,
  });
  writeStorage(next);
  queueBehaviorMemorySync(next);
  return next;
}

function queueBehaviorMemorySync(state: BehaviorMemoryState) {
  if (!canUseWindow()) {
    return;
  }

  if (syncTimer) {
    globalThis.clearTimeout(syncTimer);
  }

  syncTimer = globalThis.setTimeout(async () => {
    try {
      const synced = await updateBehaviorMemory(state);
      const merged = mergeBehaviorMemoryStates(state, synced);
      writeStorage(
        buildBehaviorMemoryState(merged.recentActionOutcomes, {
          ...merged.runtimeStats,
          syncedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // keep local cache if remote sync fails
    }
  }, 400);
}

export function mergeBehaviorModelInput() {
  return buildModelBehaviorMemoryInput(readBehaviorMemoryState().profile);
}

export type {
  ActionOutcome,
  BehaviorMemoryEntry,
  BehaviorMemoryState,
  BehaviorOutcomeConfidence,
  BehaviorOutcomeSource,
  BehaviorRecommendationContext,
};
