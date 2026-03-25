export const ADAPTIVE_SCHEDULER_MODES = [
  'NORMAL',
  'HOMEPAGE_PROTECT',
  'DEEP_RECOVERY',
  'FALLBACK_CLEANUP',
  'CLAUDE_CATCHUP',
  'CRITICAL_BACKPRESSURE',
] as const;

export type AdaptiveSchedulerMode = (typeof ADAPTIVE_SCHEDULER_MODES)[number];

export type AdaptiveSchedulerHealthInput = {
  generatedAt: string;
  totalRepos: number;
  deepDoneRepos: number;
  fullyAnalyzedRepos: number;
  incompleteRepos: number;
  fallbackRepos: number;
  severeConflictRepos: number;
  finalDecisionButNoDeepCount: number;
  deepQueuedButNotDoneCount: number;
  claudeEligibleButNotReviewedCount: number;
  fallbackButStillVisibleCount: number;
  homepageTotal: number;
  homepageUnsafe: number;
  homepageIncomplete: number;
  homepageFallback: number;
  homepageConflict: number;
  homepageNoDeepButStrong: number;
  moneyPriorityHighButIncomplete: number;
  badTemplateCount: number;
  deepQueueSize: number;
  snapshotQueueSize: number;
  claudeQueueSize: number;
  pendingCount: number;
  runningCount: number;
  failedCount: number;
  stalledCount: number;
  mostCommonIncompleteReason: string | null;
};

export type AdaptiveSchedulerQueueWeights = {
  snapshot: number;
  deep: number;
  claude: number;
  recovery: number;
  homepageCandidate: number;
  highValueIncomplete: number;
  fallbackRepair: number;
  longTail: number;
};

export type AdaptiveSchedulerConcurrencyTargets = {
  snapshot: number;
  deep: number;
  claude: number;
  recovery: number;
};

export type AdaptiveSchedulerDecision = {
  currentMode: AdaptiveSchedulerMode;
  currentReasons: string[];
  queueWeights: AdaptiveSchedulerQueueWeights;
  concurrencyTargets: AdaptiveSchedulerConcurrencyTargets;
  updatedAt: string;
  nextReviewAt: string;
  queueWeightChanges: string[];
  priorityBoostedRepoCount: number;
  suppressedRepoCount: number;
  homepageProtectedCount: number;
  fallbackRecoveredCount: number;
  deepRecoveryCount: number;
  claudeCatchupCount: number;
  healthSnapshot: AdaptiveSchedulerHealthInput;
};

export type AdaptiveSchedulerState = AdaptiveSchedulerDecision & {
  version: number;
};

export type AdaptiveSchedulerRepoContext = {
  repoId: string;
  categoryLabel?: string | null;
  projectType?: string | null;
  moneyPriority?: string | null;
  decisionSource?: string | null;
  hasConflict: boolean;
  needsRecheck: boolean;
  fallbackVisible: boolean;
  incomplete: boolean;
  deepReady: boolean;
  reviewReady: boolean;
  displayUnsafe: boolean;
  homepageCandidate: boolean;
  highExposureCandidate: boolean;
  activeProject: boolean;
};

export type AdaptiveSchedulerPriorityAdjustment = {
  boost: number;
  reasons: string[];
  suppressed: boolean;
};
