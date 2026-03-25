export type RepositoryOpportunityLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type RepositoryDecision =
  | 'PENDING'
  | 'REJECTED'
  | 'WATCHLIST'
  | 'RECOMMENDED';
export type RepositoryRoughLevel = 'A' | 'B' | 'C';
export type RepositoryCompletenessLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type RepositorySortBy =
  | 'latest'
  | 'stars'
  | 'finalScore'
  | 'ideaFitScore'
  | 'moneyPriority'
  | 'insightPriority'
  | 'createdAt'
  | 'createdAtGithub';
export type SortOrder = 'asc' | 'desc';
export type RepositoryDisplayMode = 'insight' | 'detail';
export type RepositoryRecommendedView =
  | 'moneyFirst'
  | 'bestIdeas'
  | 'all'
  | 'highOpportunity'
  | 'highOpportunityUnfavorited'
  | 'extractedIdea'
  | 'ideaExtractionPending'
  | 'pendingAnalysis'
  | 'favoritedPendingAnalysis'
  | 'newRadar'
  | 'backfilledPromising';
export type FavoritePriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type FavoriteSortBy = 'createdAt' | 'updatedAt' | 'finalScore' | 'stars';
export type JobStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
export type RepositoryIdeaMainCategory =
  | 'tools'
  | 'platform'
  | 'ai'
  | 'data'
  | 'infra'
  | 'content'
  | 'game'
  | 'other';
export type RepositoryIdeaNextAction = 'KEEP' | 'SKIP' | 'DEEP_ANALYZE';
export type RepositoryInsightVerdict = 'GOOD' | 'OK' | 'BAD';
export type RepositoryInsightAction = 'BUILD' | 'CLONE' | 'IGNORE';
export type RepositoryDecisionSource = 'manual' | 'claude' | 'local' | 'fallback';
export type RepositoryFounderPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type RepositoryOneLinerStrength = 'STRONG' | 'MEDIUM' | 'WEAK';
export type RepositoryAnalysisStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'SKIPPED_BY_GATE'
  | 'SKIPPED_BY_STRENGTH'
  | 'FAILED';
export type RepositoryDerivedAnalysisStatus =
  | 'NOT_READY'
  | 'SNAPSHOT_ONLY'
  | 'INSIGHT_READY'
  | 'DISPLAY_READY'
  | 'DEEP_PENDING'
  | 'DEEP_DONE'
  | 'REVIEW_PENDING'
  | 'REVIEW_DONE'
  | 'SKIPPED_BY_GATE'
  | 'FAILED';
export type RepositoryDisplayStatus =
  | 'HIDDEN'
  | 'BASIC_READY'
  | 'TRUSTED_READY'
  | 'HIGH_CONFIDENCE_READY'
  | 'UNSAFE';
export type RepositoryIncompleteReason =
  | 'NO_SNAPSHOT'
  | 'NO_INSIGHT'
  | 'NO_FINAL_DECISION'
  | 'NO_DEEP_ANALYSIS'
  | 'NO_CLAUDE_REVIEW'
  | 'SKIPPED_BY_GATE'
  | 'SKIPPED_BY_STRENGTH'
  | 'SKIPPED_BY_SELF_TUNING'
  | 'FALLBACK_ONLY'
  | 'CONFLICT_HELD_BACK'
  | 'QUEUED_NOT_FINISHED'
  | 'FAILED_DURING_ANALYSIS'
  | 'UNKNOWN';
export type RepositoryIdeaExtractStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'SKIPPED_BY_GATE'
  | 'SKIPPED_BY_STRENGTH'
  | 'FAILED';
export type RepositoryIdeaExtractMode = 'full' | 'light' | 'skip';
export type MoneyPriorityTier =
  | 'MUST_LOOK'
  | 'WORTH_BUILDING'
  | 'WORTH_CLONING'
  | 'LOW_PRIORITY'
  | 'IGNORE';
export type MoneyDecision =
  | 'MUST_BUILD'
  | 'HIGH_VALUE'
  | 'CLONEABLE'
  | 'LOW_VALUE'
  | 'IGNORE'
  | 'BUILDABLE'
  | 'CLONE_ONLY'
  | 'NOT_WORTH';

const repositoryOpportunityLevels = ['LOW', 'MEDIUM', 'HIGH'] as const;
const repositoryFounderPriorityValues = ['P0', 'P1', 'P2', 'P3'] as const;
const repositoryDecisionSourceValues = [
  'manual',
  'claude',
  'local',
  'fallback',
] as const;
const repositorySortByValues = [
  'latest',
  'stars',
  'finalScore',
  'ideaFitScore',
  'moneyPriority',
  'insightPriority',
  'createdAt',
  'createdAtGithub',
] as const;
const repositoryRecommendedViewValues = [
  'moneyFirst',
  'bestIdeas',
  'all',
  'highOpportunity',
  'highOpportunityUnfavorited',
  'extractedIdea',
  'ideaExtractionPending',
  'pendingAnalysis',
  'favoritedPendingAnalysis',
  'newRadar',
  'backfilledPromising',
] as const;
const repositoryDisplayModeValues = ['insight', 'detail'] as const;
const sortOrderValues = ['asc', 'desc'] as const;
const favoritePriorityValues = ['LOW', 'MEDIUM', 'HIGH'] as const;
const favoriteSortByValues = [
  'createdAt',
  'updatedAt',
  'finalScore',
  'stars',
] as const;
const jobStatusValues = ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'] as const;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RepositoryExtractedIdea {
  ideaSummary?: string;
  productForm?: 'SAAS' | 'PLUGIN' | 'API' | 'TOOL_SITE' | 'INTERNAL_TOOL';
  confidence?: number;
  extractMode?: RepositoryIdeaExtractMode;
  problem?: string;
  solution?: string;
  targetUsers?: string[];
  mvpPlan?: string;
  differentiation?: string;
  monetization?: string;
  whyNow?: string;
  risks?: string[];
}

export interface RepositoryCompletenessAnalysis {
  completenessScore: number;
  completenessLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  productionReady: boolean;
  runability: 'EASY' | 'MEDIUM' | 'HARD';
  strengths: string[];
  weaknesses: string[];
  summary: string;
  dimensionScores: {
    documentation: number;
    structure: number;
    runability: number;
    engineering: number;
    maintenance: number;
    extensibility: number;
  };
}

export interface RepositoryIdeaFitAnalysis {
  ideaFitScore: number;
  opportunityLevel: 'S' | 'A' | 'B' | 'C';
  decision: string;
  coreJudgement: string;
  scores: {
    realDemand: number;
    toolProductization: number;
    monetization: number;
    competitiveBreakthrough: number;
    timingTailwind: number;
    executionFeasibility: number;
    founderFit: number;
  };
  negativeFlags: string[];
  opportunityTags: string[];
}

export interface RepositoryIdeaSnapshot {
  oneLinerZh: string;
  isPromising: boolean;
  reason: string;
  category: {
    main: RepositoryIdeaMainCategory;
    sub: string;
  };
  toolLike: boolean;
  nextAction: RepositoryIdeaNextAction;
}

export interface RepositoryInsightRecord {
  oneLinerZh: string;
  oneLinerMeta?: {
    confidence?: 'high' | 'medium' | 'low';
    reasoning?: string[];
    riskFlags?: string[];
  } | null;
  oneLinerStrength?: RepositoryOneLinerStrength;
  verdict: RepositoryInsightVerdict;
  verdictReason: string;
  action: RepositoryInsightAction;
  actionLabel?: string;
  completenessScore: number;
  completenessLevel: RepositoryCompletenessLevel;
  category: {
    main: RepositoryIdeaMainCategory;
    sub: string;
  };
  categoryDisplay?: {
    main: string;
    sub: string;
    label: string;
  };
  projectReality?: {
    type: 'product' | 'tool' | 'model' | 'infra' | 'demo';
    hasRealUser?: boolean;
    hasClearUseCase?: boolean;
    isDirectlyMonetizable?: boolean;
    whyNotProduct?: string | null;
  } | null;
  anchorMatch?: 'GOOD' | 'CLONE' | 'BAD';
  confidence?: number;
  whyNotProduct?: string | null;
  summaryTags: string[];
}

export interface RepositoryManualOverrideRecord {
  verdict?: RepositoryInsightVerdict | null;
  action?: RepositoryInsightAction | null;
  note?: string | null;
  updatedAt?: string | null;
}

export interface RepositoryClaudeReviewPayload {
  oneLinerZh: string;
  oneLinerMeta?: {
    confidence?: number;
    confidenceLevel?: 'high' | 'medium' | 'low';
    reasoning?: string[];
    riskFlags?: string[];
    strength?: RepositoryOneLinerStrength | null;
  } | null;
  projectType: 'product' | 'tool' | 'model' | 'infra' | 'demo';
  hasRealUser: boolean;
  hasClearUseCase: boolean;
  isDirectlyMonetizable: boolean;
  hasProductizationPath?: boolean;
  businessJudgement?: RepositoryClaudeBusinessJudgement | null;
  businessSignals?: RepositoryClaudeBusinessSignals | null;
  moneyDecision?: MoneyDecision | null;
  verdict: RepositoryInsightVerdict;
  action: RepositoryInsightAction;
  reason: string;
  confidence: number;
  whyNotProduct?: string | null;
  reviewNotes?: string[];
  reviewedAt?: string;
  provider?: string;
  model?: string | null;
  promptVersion?: string;
}

export interface RepositoryClaudeReviewRecord {
  status?: string | null;
  provider?: string | null;
  model?: string | null;
  reviewedAt?: string | null;
  error?: string | null;
  review?: RepositoryClaudeReviewPayload | null;
}

export interface RepositoryClaudeBusinessJudgement {
  isFounderFit: boolean;
  isSmallTeamFriendly: boolean;
  hasNearTermMonetizationPath: boolean;
  moneyPriorityHint: MoneyPriorityTier | MoneyDecision | null;
  moneyReasonZh: string;
}

export interface RepositoryClaudeBusinessSignals {
  targetUser: string;
  willingnessToPay: 'high' | 'medium' | 'low';
  monetizationModel: string;
  urgency: 'high' | 'medium' | 'low';
  founderFit: boolean;
  buildDifficulty: 'low' | 'medium' | 'high';
}

export interface RepositoryMoneyPriorityRecord {
  score: number;
  moneyScore?: number;
  tier: MoneyPriorityTier;
  moneyDecision?: MoneyDecision;
  moneyDecisionLabelZh?: string;
  labelZh: string;
  reasonZh: string;
  recommendedMoveZh: string;
  projectTypeLabelZh: string;
  targetUsersZh: string;
  monetizationSummaryZh: string;
  source: 'manual_override' | 'claude_review' | 'local_insight' | 'fallback';
  businessSignals?: RepositoryClaudeBusinessSignals | null;
  moneySignals?: {
    hasClearUser: boolean;
    hasClearUseCase: boolean;
    hasPainPoint: boolean;
    hasMonetizationPath: boolean;
    isRepeatUsage: boolean;
    isSmallTeamBuildable: boolean;
    isInfraOrModel: boolean;
    isTemplateOrDemo: boolean;
  } | null;
  signals: {
    projectType: 'product' | 'tool' | 'model' | 'infra' | 'demo';
    hasRealUser: boolean;
    hasClearUseCase: boolean;
    hasProductizationPath: boolean;
    isDirectlyMonetizable: boolean;
    isFounderFit: boolean;
    isSmallTeamFriendly: boolean;
    hasNearTermMonetizationPath: boolean;
    isDeveloperWorkflowTool: boolean;
    isSaasLike: boolean;
    looksTemplateOrDemo: boolean;
    looksInfraLayer: boolean;
    isSmallTeamExecutable: boolean;
  };
}

export interface RepositoryFinalDecisionRecord {
  repoId: string;
  oneLinerZh: string;
  oneLinerStrength?: RepositoryOneLinerStrength | null;
  verdict: RepositoryInsightVerdict;
  action: RepositoryInsightAction;
  category: string;
  categoryLabelZh: string;
  categoryMain?: string | null;
  categorySub?: string | null;
  projectType?: 'product' | 'tool' | 'model' | 'infra' | 'demo' | null;
  moneyPriority: RepositoryFounderPriority;
  moneyPriorityLabelZh: string;
  reasonZh: string;
  source: RepositoryDecisionSource;
  sourceLabelZh: string;
  hasConflict: boolean;
  needsRecheck: boolean;
  hasTrainingHints: boolean;
  hasClaudeReview: boolean;
  hasManualOverride: boolean;
  comparison: {
    localVerdict?: RepositoryInsightVerdict | null;
    localAction?: RepositoryInsightAction | null;
    localOneLinerZh?: string | null;
    claudeVerdict?: RepositoryInsightVerdict | null;
    claudeAction?: RepositoryInsightAction | null;
    claudeOneLinerZh?: string | null;
    conflictReasons?: string[];
  };
  moneyDecision: {
    labelZh: string;
    score: number;
    recommendedMoveZh: string;
    targetUsersZh: string;
    monetizationSummaryZh: string;
    reasonZh: string;
  };
  decisionSummary: RepositoryFinalDecisionDisplaySummaryRecord;
}

export interface RepositoryFinalDecisionDisplaySummaryRecord {
  headlineZh: string;
  judgementLabelZh: string;
  verdictLabelZh: string;
  actionLabelZh: string;
  finalDecisionLabelZh: string;
  moneyPriorityLabelZh: string;
  categoryLabelZh: string;
  recommendedMoveZh: string;
  worthDoingLabelZh: string;
  reasonZh: string;
  targetUsersZh: string;
  monetizationSummaryZh: string;
  sourceLabelZh: string;
}

export interface RepositoryLightAnalysisRecord {
  targetUsers: string;
  monetization: string;
  whyItMatters: string;
  nextStep: string;
  caution?: string | null;
  source: 'snapshot' | 'insight' | 'readme' | 'decision_fallback';
}

export interface RepositoryAnalysisStateRecord {
  analysisStatus: RepositoryDerivedAnalysisStatus;
  displayStatus: RepositoryDisplayStatus;
  analysisStatusReason?: string | null;
  displayStatusReason?: string | null;
  incompleteReason?: RepositoryIncompleteReason | null;
  incompleteReasons?: RepositoryIncompleteReason[];
  displayReady: boolean;
  trustedDisplayReady: boolean;
  highConfidenceReady: boolean;
  lightDeepReady: boolean;
  fullDeepReady: boolean;
  deepReady: boolean;
  reviewEligible: boolean;
  reviewReady: boolean;
  fullyAnalyzed: boolean;
  fallbackVisible: boolean;
  unsafe: boolean;
  lightAnalysis?: RepositoryLightAnalysisRecord | null;
}

export interface RepositoryCoreAssetRecord {
  repoId: string;
  repoFullName: string;
  repoUrl: string;
  oneLinerZh: string;
  oneLinerStrength?: RepositoryOneLinerStrength | null;
  finalVerdict: RepositoryInsightVerdict;
  finalAction: RepositoryInsightAction;
  finalCategory: string;
  moneyPriorityTier?: RepositoryFounderPriority | null;
  decisionSource: RepositoryDecisionSource;
  lastReviewedAt?: string | null;
}

export interface RepositoryAnalysisAssetRecord {
  assetType:
    | 'idea_snapshot'
    | 'completeness'
    | 'idea_fit'
    | 'idea_extract'
    | 'insight';
  analysisLevel: 'snapshot' | 'deep_l1' | 'deep_l2';
  payload: Record<string, unknown>;
  updatedAt?: string | null;
}

export interface RepositoryTrainingAssetRecord {
  repoId: string;
  localVerdict?: RepositoryInsightVerdict | null;
  localAction?: RepositoryInsightAction | null;
  claudeVerdict?: RepositoryInsightVerdict | null;
  claudeAction?: RepositoryInsightAction | null;
  mistakeTypes: string[];
  suggestions: string[];
  shouldTrain: boolean;
  diffTypes?: string[];
  auditProblemTypes?: string[];
  auditSuggestions?: string[];
  fallbackReplayDiff?: string[];
}

export interface RadarDailySummaryCategory {
  main: RepositoryIdeaMainCategory;
  sub: string;
  count: number;
}

export interface RadarDailySummaryItem {
  repositoryId: string;
  fullName: string;
  htmlUrl: string;
  stars: number;
  oneLinerZh: string;
  oneLinerStrength?: RepositoryOneLinerStrength | null;
  verdict: RepositoryInsightVerdict;
  action: RepositoryInsightAction;
  category: {
    main: RepositoryIdeaMainCategory;
    sub: string;
  };
  moneyPriorityScore: number;
  moneyPriorityTier: MoneyPriorityTier;
  moneyDecision?: MoneyDecision;
  moneyDecisionLabelZh?: string;
  moneyPriorityLabelZh: string;
  moneyPriorityReasonZh: string;
  recommendedMoveZh: string;
  targetUsersZh: string;
  monetizationSummaryZh: string;
  hasManualOverride: boolean;
  hasClaudeReview: boolean;
  decisionSummary?: RepositoryFinalDecisionDisplaySummaryRecord | null;
}

export interface RadarDailyKeywordGroupSummary {
  group: string;
  fetchedRepositories: number;
  snapshotQueued: number;
  deepAnalyzed: number;
  promisingCandidates: number;
  goodIdeas: number;
  cloneCandidates: number;
  repositoryIds: string[];
  lastRunAt?: string | null;
}

export interface RadarLatestClaudeAuditBrief {
  auditedAt?: string | null;
  severity: string;
  summary?: string | null;
  headline?: string | null;
  overallBias?: string | null;
}

export interface RadarDailySummaryRecord {
  id: string;
  date: string;
  fetchedRepositories: number;
  snapshotGenerated: number;
  deepAnalyzed: number;
  promisingCandidates: number;
  goodIdeas: number;
  cloneCandidates: number;
  ignoredIdeas: number;
  topCategories: RadarDailySummaryCategory[];
  topRepositoryIds: string[];
  topGoodRepositoryIds: string[];
  topCloneRepositoryIds: string[];
  topIgnoredRepositoryIds: string[];
  topItems: RadarDailySummaryItem[];
  topMustBuildItems?: RadarDailySummaryItem[];
  topHighValueItems?: RadarDailySummaryItem[];
  topCloneableItems?: RadarDailySummaryItem[];
  topGoodItems: RadarDailySummaryItem[];
  topCloneItems: RadarDailySummaryItem[];
  topIgnoredItems: RadarDailySummaryItem[];
  keywordGroupStats?: RadarDailyKeywordGroupSummary[];
  topKeywordGroups?: RadarDailyKeywordGroupSummary[];
  latestClaudeAudit?: RadarLatestClaudeAuditBrief | null;
  telegramSentAt?: string | null;
  telegramMessageId?: string | null;
  telegramSendStatus?: string | null;
  telegramSendError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RadarRuntimeStatusRecord {
  snapshotQueueSize: number;
  deepQueueSize: number;
  pendingBackfillJobs: number;
  schedulerReason?: string | null;
  runtimeUpdatedAt?: string | null;
  maintenance?: {
    timeoutStats?: {
      ideaExtractTimeouts?: number;
    } | null;
    deepRuntimeStats?: {
      ideaExtractMaxInflight?: number;
      updatedAt?: string | null;
    } | null;
  } | null;
}

export interface RepositoryAnalysisRecord {
  id: string;
  ideaSnapshotJson?: RepositoryIdeaSnapshot | null;
  insightJson?: RepositoryInsightRecord | null;
  manualOverride?: RepositoryManualOverrideRecord | null;
  claudeReview?: RepositoryClaudeReviewRecord | null;
  claudeReviewJson?: RepositoryClaudeReviewPayload | null;
  claudeReviewStatus?: string | null;
  claudeReviewProvider?: string | null;
  claudeReviewModel?: string | null;
  claudeReviewReviewedAt?: string | null;
  claudeReviewError?: string | null;
  extractedIdeaJson?: RepositoryExtractedIdea | null;
  ideaExtractStatus?: RepositoryIdeaExtractStatus | null;
  ideaExtractStatusReason?: string | null;
  ideaExtractMode?: RepositoryIdeaExtractMode | null;
  deepAnalysisStatus?: RepositoryAnalysisStatus | null;
  deepAnalysisStatusReason?: string | null;
  ideaFitJson?: RepositoryIdeaFitAnalysis | null;
  completenessJson?: RepositoryCompletenessAnalysis | null;
  negativeFlags?: string[] | null;
  provider?: string | null;
  modelName?: string | null;
  confidence?: number | null;
  analyzedAt?: string | null;
  promptVersion?: string | null;
  fallbackUsed?: boolean;
  moneyPriority?: RepositoryMoneyPriorityRecord | null;
}

export interface RepositoryContentRecord {
  id: string;
  readmeText?: string | null;
  fileTree?: unknown[] | Record<string, unknown> | null;
  rootFiles?: string[] | Record<string, unknown>[] | null;
  recentCommits?: Array<Record<string, unknown>> | null;
  recentIssues?: Array<Record<string, unknown>> | null;
  hasDockerfile: boolean;
  hasCompose: boolean;
  hasCi: boolean;
  hasTests: boolean;
  hasDocs: boolean;
  hasEnvExample: boolean;
  packageManifests?: Array<Record<string, unknown>> | Record<string, unknown> | null;
  fetchedAt?: string | null;
}

export interface RepositoryFavoriteRecord {
  id: string;
  note?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  createdAt?: string;
  updatedAt?: string;
}

export interface RepositorySnapshotRecord {
  id: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  commitCount30d: number;
  contributorsCount: number;
  snapshotAt: string;
}

export interface RepositoryListItem {
  id: string;
  fullName: string;
  name: string;
  ownerLogin: string;
  htmlUrl: string;
  description?: string | null;
  homepage?: string | null;
  language?: string | null;
  topics?: string[];
  stars: number;
  roughPass: boolean;
  roughLevel?: RepositoryRoughLevel | null;
  roughReason?: string | null;
  toolLikeScore?: number | null;
  completenessScore?: number | null;
  completenessLevel?: RepositoryCompletenessLevel | null;
  productionReady: boolean;
  runability?: 'EASY' | 'MEDIUM' | 'HARD' | null;
  ideaFitScore?: number | null;
  opportunityLevel?: RepositoryOpportunityLevel | null;
  finalScore?: number | null;
  categoryL1?: string | null;
  categoryL2?: string | null;
  decision: RepositoryDecision;
  isFavorited: boolean;
  createdAtGithub?: string | null;
  createdAt: string;
  updatedAt: string;
  content?: RepositoryContentRecord | null;
  analysis?: RepositoryAnalysisRecord | null;
  finalDecision?: RepositoryFinalDecisionRecord | null;
  analysisState?: RepositoryAnalysisStateRecord | null;
  coreAsset?: RepositoryCoreAssetRecord | null;
  analysisAssets?: RepositoryAnalysisAssetRecord[] | null;
  trainingAsset?: RepositoryTrainingAssetRecord | null;
  favorite?: RepositoryFavoriteRecord | null;
}

export interface RelatedRepositoryItem extends RepositoryListItem {
  relatedReasonLabels: string[];
}

export interface RepositoryDetail extends RepositoryListItem {
  license?: string | null;
  defaultBranch?: string | null;
  topics: string[];
  archived: boolean;
  disabled: boolean;
  hasWiki: boolean;
  hasIssues: boolean;
  createdAtGithub?: string | null;
  updatedAtGithub?: string | null;
  pushedAtGithub?: string | null;
  lastCommitAt?: string | null;
  watchers: number;
  forks: number;
  openIssues: number;
  homepage?: string | null;
  sourceType: string;
  analysisProvider?: string | null;
  analysisModel?: string | null;
  analysisConfidence?: number | null;
  snapshots: RepositorySnapshotRecord[];
}

export interface RepositoryListResponse {
  items: RepositoryListItem[];
  pagination: PaginationMeta;
}

export interface RepositoryOverviewSummary {
  totalRepositories: number;
  favoritedRepositories: number;
  highOpportunityRepositories: number;
  completenessAnalyzedRepositories: number;
  ideaFitAnalyzedRepositories: number;
  extractedIdeaRepositories: number;
  pendingAnalysisRepositories: number;
  needsIdeaExtractionRepositories: number;
  highOpportunityUnfavoritedRepositories: number;
}

export interface FetchRepositoriesRequest {
  mode?: 'updated' | 'created';
  query?: string;
  sort?: 'updated' | 'stars';
  order?: 'asc' | 'desc';
  perPage?: number;
  page?: number;
  starMin?: number;
  starMax?: number;
  pushedAfter?: string;
  language?: string;
  runFastFilter?: boolean;
}

export interface FetchRepositoriesItemResult {
  repositoryId?: string;
  githubRepoId: string;
  fullName: string;
  action: 'created' | 'updated' | 'failed';
  message: string;
}

export interface FetchRepositoriesResponse {
  mode: 'updated' | 'created';
  requested: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  items: FetchRepositoriesItemResult[];
}

export interface BackfillCreatedRepositoriesRequest {
  days?: number;
  perWindowLimit?: number;
  language?: string;
  starMin?: number;
  runFastFilter?: boolean;
  runIdeaSnapshot?: boolean;
  runDeepAnalysis?: boolean;
  deepAnalysisOnlyIfPromising?: boolean;
  targetCategories?: Array<
    'tools' | 'ai' | 'data' | 'infra' | 'platform' | 'content' | 'game' | 'other'
  >;
}

export interface EnqueuedTaskResponse {
  jobId: string;
  queueName: string;
  queueJobId: string;
  jobStatus: JobStatus;
}

export interface ApiSuccessResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface ApiErrorShape {
  success?: false;
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

export interface RunAnalysisRequest {
  runFastFilter?: boolean;
  runCompleteness?: boolean;
  runIdeaFit?: boolean;
  runIdeaExtract?: boolean;
  forceRerun?: boolean;
  userSuccessPatterns?: string[];
  userFailurePatterns?: string[];
  preferredCategories?: string[];
  avoidedCategories?: string[];
  recentValidatedWins?: string[];
  recentDroppedReasons?: string[];
  userPreferencePriorityBoost?: number;
  userPreferencePriorityReasons?: string[];
}

export type RunAnalysisStepStatus = 'executed' | 'skipped' | 'failed';

export interface FastFilterRunStepResult {
  status: RunAnalysisStepStatus;
  roughPass?: boolean;
  roughLevel?: RepositoryRoughLevel;
  toolLikeScore?: number;
  message: string;
}

export interface CompletenessRunStepResult {
  status: RunAnalysisStepStatus;
  completenessScore?: number | null;
  completenessLevel?: RepositoryCompletenessLevel | null;
  message: string;
}

export interface IdeaFitRunStepResult {
  status: RunAnalysisStepStatus;
  ideaFitScore?: number | null;
  opportunityLevel?: string | null;
  message: string;
}

export interface IdeaExtractRunStepResult {
  status: RunAnalysisStepStatus;
  ideaSummary?: string | null;
  productForm?: string | null;
  message: string;
}

export interface RunAnalysisStepResult {
  fastFilter: FastFilterRunStepResult;
  completeness: CompletenessRunStepResult;
  ideaFit: IdeaFitRunStepResult;
  ideaExtract: IdeaExtractRunStepResult;
}

export interface RunAnalysisResponse {
  repositoryId: string;
  steps: RunAnalysisStepResult;
}

export interface UpdateManualInsightPayload {
  verdict?: RepositoryInsightVerdict;
  action?: RepositoryInsightAction;
  note?: string;
}

export interface RunBatchAnalysisRequest extends RunAnalysisRequest {
  repositoryIds?: string[];
  onlyIfMissing?: boolean;
  limit?: number;
}

export interface RunBatchAnalysisItemResult {
  repositoryId: string;
  action: 'executed' | 'skipped' | 'failed';
  steps: RunAnalysisStepResult;
  message: string;
}

export interface RunBatchAnalysisResponse {
  processed: number;
  succeeded: number;
  failed: number;
  items: RunBatchAnalysisItemResult[];
}

export interface JobLogItem {
  id: string;
  jobName: string;
  jobStatus: JobStatus;
  queueName?: string | null;
  queueJobId?: string | null;
  triggeredBy?: string | null;
  attempts?: number;
  retryCount?: number;
  progress?: number;
  durationMs?: number | null;
  parentJobId?: string | null;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  queueState?: string | null;
  canRetry?: boolean;
  canCancel?: boolean;
}

export interface JobLogListResponse {
  items: JobLogItem[];
  pagination: PaginationMeta;
}

export interface FavoriteMutationPayload {
  repositoryId: string;
  note?: string;
  priority?: FavoritePriority;
}

export interface UpdateFavoritePayload {
  note?: string;
  priority?: FavoritePriority;
}

export interface RepositoryListQueryState {
  page: number;
  pageSize: number;
  view: RepositoryRecommendedView;
  displayMode: RepositoryDisplayMode;
  keyword?: string;
  language?: string;
  opportunityLevel?: RepositoryOpportunityLevel;
  isFavorited?: boolean;
  roughPass?: boolean;
  hasCompletenessAnalysis?: boolean;
  hasIdeaFitAnalysis?: boolean;
  hasExtractedIdea?: boolean;
  hasPromisingIdeaSnapshot?: boolean;
  hasGoodInsight?: boolean;
  hasManualInsight?: boolean;
  finalVerdict?: RepositoryInsightVerdict;
  finalCategory?: string;
  moneyPriority?: RepositoryFounderPriority;
  decisionSource?: RepositoryDecisionSource;
  hasConflict?: boolean;
  needsRecheck?: boolean;
  hasTrainingHints?: boolean;
  recommendedAction?: RepositoryInsightAction;
  createdAfterDays?: number;
  minStars?: number;
  minFinalScore?: number;
  sortBy: RepositorySortBy;
  order: SortOrder;
}

export interface FavoriteRepositorySummary {
  id: string;
  name: string;
  fullName: string;
  description?: string | null;
  stars: number;
  finalScore?: number | null;
  opportunityLevel?: RepositoryOpportunityLevel | null;
  language?: string | null;
  isFavorited: boolean;
}

export interface FavoriteWithRepositorySummary {
  id: string;
  repositoryId: string;
  note?: string | null;
  priority: FavoritePriority;
  createdAt: string;
  updatedAt: string;
  repository: FavoriteRepositorySummary;
}

export interface FavoriteListResponse {
  items: FavoriteWithRepositorySummary[];
  pagination: PaginationMeta;
}

export interface FavoriteListQueryState {
  page: number;
  pageSize: number;
  keyword?: string;
  priority?: FavoritePriority;
  language?: string;
  opportunityLevel?: RepositoryOpportunityLevel;
  minFinalScore?: number;
  sortBy: FavoriteSortBy;
  order: SortOrder;
}

export interface JobLogQueryState {
  page: number;
  pageSize: number;
  jobName?: string;
  jobStatus?: JobStatus;
  repositoryId?: string;
  focusJobId?: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type SearchParamValue = string | string[] | undefined;

function toSingle(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function toBoolean(value: SearchParamValue) {
  const singleValue = toSingle(value);

  if (singleValue === 'true') {
    return true;
  }

  if (singleValue === 'false') {
    return false;
  }

  return undefined;
}

function toPositiveNumber(value: SearchParamValue, fallback?: number) {
  const singleValue = toSingle(value);

  if (!singleValue) {
    return fallback;
  }

  const parsedValue = Number(singleValue);
  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

export function normalizeRepositoryListQuery(
  searchParams: Record<string, SearchParamValue>,
): RepositoryListQueryState {
  const page = toPositiveNumber(searchParams.page, 1) ?? 1;
  const pageSize = Math.min(toPositiveNumber(searchParams.pageSize, 20) ?? 20, 100);
  const keyword = toSingle(searchParams.keyword)?.trim();
  const language = toSingle(searchParams.language)?.trim();
  const viewRaw = toSingle(searchParams.view);
  const opportunityLevelRaw = toSingle(searchParams.opportunityLevel);
  const finalVerdictRaw = toSingle(searchParams.finalVerdict);
  const moneyPriorityRaw = toSingle(searchParams.moneyPriority);
  const decisionSourceRaw = toSingle(searchParams.decisionSource);
  const view = repositoryRecommendedViewValues.includes(
    ((viewRaw === 'goodIdeas' ? 'bestIdeas' : viewRaw) as RepositoryRecommendedView),
  )
    ? ((viewRaw === 'goodIdeas' ? 'bestIdeas' : viewRaw) as RepositoryRecommendedView)
    : 'moneyFirst';
  const displayModeRaw = toSingle(searchParams.displayMode);
  const displayMode = repositoryDisplayModeValues.includes(
    displayModeRaw as RepositoryDisplayMode,
  )
    ? (displayModeRaw as RepositoryDisplayMode)
    : 'insight';
  const opportunityLevel = repositoryOpportunityLevels.includes(
    opportunityLevelRaw as RepositoryOpportunityLevel,
  )
    ? (opportunityLevelRaw as RepositoryOpportunityLevel)
    : undefined;
  const finalVerdict = ['GOOD', 'OK', 'BAD'].includes(String(finalVerdictRaw))
    ? (String(finalVerdictRaw) as RepositoryInsightVerdict)
    : undefined;
  const moneyPriority = repositoryFounderPriorityValues.includes(
    moneyPriorityRaw as RepositoryFounderPriority,
  )
    ? (moneyPriorityRaw as RepositoryFounderPriority)
    : undefined;
  const decisionSource = repositoryDecisionSourceValues.includes(
    decisionSourceRaw as RepositoryDecisionSource,
  )
    ? (decisionSourceRaw as RepositoryDecisionSource)
    : undefined;
  const minStars = toPositiveNumber(searchParams.minStars);
  const minFinalScore = toPositiveNumber(searchParams.minFinalScore);
  const sortByRaw = toSingle(searchParams.sortBy);
  const orderRaw = toSingle(searchParams.order);
  const sortBy = repositorySortByValues.includes(sortByRaw as RepositorySortBy)
    ? (sortByRaw as RepositorySortBy)
    : 'latest';
  const order = sortOrderValues.includes(orderRaw as SortOrder)
    ? (orderRaw as SortOrder)
    : 'desc';

  const baseQuery: RepositoryListQueryState = {
    page,
    pageSize,
    view,
    displayMode,
    keyword: keyword || undefined,
    language: language || undefined,
    opportunityLevel,
    isFavorited: toBoolean(searchParams.isFavorited),
    roughPass: toBoolean(searchParams.roughPass),
    hasCompletenessAnalysis: toBoolean(searchParams.hasCompletenessAnalysis),
    hasIdeaFitAnalysis: toBoolean(searchParams.hasIdeaFitAnalysis),
    hasExtractedIdea: toBoolean(searchParams.hasExtractedIdea),
    hasPromisingIdeaSnapshot: toBoolean(searchParams.hasPromisingIdeaSnapshot),
    hasGoodInsight: toBoolean(searchParams.hasGoodInsight),
    hasManualInsight: toBoolean(searchParams.hasManualInsight),
    finalVerdict,
    finalCategory: toSingle(searchParams.finalCategory)?.trim() || undefined,
    moneyPriority,
    decisionSource,
    hasConflict: toBoolean(searchParams.hasConflict),
    needsRecheck: toBoolean(searchParams.needsRecheck),
    hasTrainingHints: toBoolean(searchParams.hasTrainingHints),
    recommendedAction:
      ['BUILD', 'CLONE', 'IGNORE'].includes(String(toSingle(searchParams.recommendedAction)))
        ? (String(toSingle(searchParams.recommendedAction)) as RepositoryInsightAction)
        : undefined,
    createdAfterDays: toPositiveNumber(searchParams.createdAfterDays),
    minStars,
    minFinalScore,
    sortBy,
    order,
  };

  const shouldApplyBestIdeasPreset =
    !viewRaw ||
    (viewRaw === 'moneyFirst' &&
      !searchParams.sortBy &&
      !searchParams.hasGoodInsight &&
      !searchParams.finalVerdict &&
      !searchParams.moneyPriority &&
      !searchParams.recommendedAction) ||
    ((viewRaw === 'bestIdeas' || viewRaw === 'goodIdeas') &&
      !searchParams.sortBy &&
      !searchParams.hasGoodInsight &&
      !searchParams.finalVerdict &&
      !searchParams.moneyPriority &&
      !searchParams.recommendedAction);

  if (shouldApplyBestIdeasPreset) {
    return applyRepositoryViewQuery(baseQuery, !viewRaw ? 'moneyFirst' : view);
  }

  return baseQuery;
}

export function buildRepositoryListSearchParams(
  query: Partial<RepositoryListQueryState>,
  options: {
    includeUiState?: boolean;
  } = {},
) {
  const includeUiState = options.includeUiState ?? true;
  const params = new URLSearchParams();

  if (query.page && query.page > 1) {
    params.set('page', String(query.page));
  }

  if (query.pageSize && query.pageSize !== 20) {
    params.set('pageSize', String(query.pageSize));
  }

  if (query.view && query.view !== 'moneyFirst') {
    params.set('view', query.view);
  }

  if (includeUiState && query.displayMode && query.displayMode !== 'insight') {
    params.set('displayMode', query.displayMode);
  }

  if (query.keyword) {
    params.set('keyword', query.keyword);
  }

  if (query.language) {
    params.set('language', query.language);
  }

  if (query.opportunityLevel) {
    params.set('opportunityLevel', query.opportunityLevel);
  }

  if (typeof query.isFavorited === 'boolean') {
    params.set('isFavorited', String(query.isFavorited));
  }

  if (typeof query.roughPass === 'boolean') {
    params.set('roughPass', String(query.roughPass));
  }

  if (typeof query.hasCompletenessAnalysis === 'boolean') {
    params.set('hasCompletenessAnalysis', String(query.hasCompletenessAnalysis));
  }

  if (typeof query.hasIdeaFitAnalysis === 'boolean') {
    params.set('hasIdeaFitAnalysis', String(query.hasIdeaFitAnalysis));
  }

  if (typeof query.hasExtractedIdea === 'boolean') {
    params.set('hasExtractedIdea', String(query.hasExtractedIdea));
  }

  if (typeof query.hasPromisingIdeaSnapshot === 'boolean') {
    params.set('hasPromisingIdeaSnapshot', String(query.hasPromisingIdeaSnapshot));
  }

  if (typeof query.hasGoodInsight === 'boolean') {
    params.set('hasGoodInsight', String(query.hasGoodInsight));
  }

  if (typeof query.hasManualInsight === 'boolean') {
    params.set('hasManualInsight', String(query.hasManualInsight));
  }

  if (query.finalVerdict) {
    params.set('finalVerdict', query.finalVerdict);
  }

  if (query.finalCategory) {
    params.set('finalCategory', query.finalCategory);
  }

  if (query.moneyPriority) {
    params.set('moneyPriority', query.moneyPriority);
  }

  if (query.decisionSource) {
    params.set('decisionSource', query.decisionSource);
  }

  if (typeof query.hasConflict === 'boolean') {
    params.set('hasConflict', String(query.hasConflict));
  }

  if (typeof query.needsRecheck === 'boolean') {
    params.set('needsRecheck', String(query.needsRecheck));
  }

  if (typeof query.hasTrainingHints === 'boolean') {
    params.set('hasTrainingHints', String(query.hasTrainingHints));
  }

  if (query.recommendedAction) {
    params.set('recommendedAction', query.recommendedAction);
  }

  if (typeof query.createdAfterDays === 'number') {
    params.set('createdAfterDays', String(query.createdAfterDays));
  }

  if (typeof query.minStars === 'number') {
    params.set('minStars', String(query.minStars));
  }

  if (typeof query.minFinalScore === 'number') {
    params.set('minFinalScore', String(query.minFinalScore));
  }

  if (query.sortBy && query.sortBy !== 'latest') {
    params.set('sortBy', query.sortBy);
  }

  if (query.order && query.order !== 'desc') {
    params.set('order', query.order);
  }

  return params.toString();
}

export function applyRepositoryViewQuery(
  query: RepositoryListQueryState,
  view: RepositoryRecommendedView,
) {
  switch (view) {
    case 'moneyFirst':
      return {
        ...query,
        view,
        sortBy: 'moneyPriority' as const,
        order: 'desc' as const,
      };
    case 'bestIdeas':
      return {
        ...query,
        view,
        hasGoodInsight: true,
        finalVerdict: 'GOOD' as const,
        sortBy: 'insightPriority' as const,
        order: 'desc' as const,
      };
    case 'all':
      return {
        ...query,
        view,
      };
    case 'highOpportunity':
      return {
        ...query,
        view,
        opportunityLevel: 'HIGH' as const,
      };
    case 'highOpportunityUnfavorited':
      return {
        ...query,
        view,
        opportunityLevel: 'HIGH' as const,
        isFavorited: false,
        sortBy: 'ideaFitScore' as const,
        order: 'desc' as const,
      };
    case 'extractedIdea':
      return {
        ...query,
        view,
        hasExtractedIdea: true,
      };
    case 'ideaExtractionPending':
      return {
        ...query,
        view,
        hasIdeaFitAnalysis: true,
        hasExtractedIdea: false,
        sortBy: 'ideaFitScore' as const,
        order: 'desc' as const,
      };
    case 'pendingAnalysis':
      return {
        ...query,
        view,
        hasIdeaFitAnalysis: false,
      };
    case 'favoritedPendingAnalysis':
      return {
        ...query,
        view,
        isFavorited: true,
        hasIdeaFitAnalysis: false,
      };
    case 'newRadar':
      return {
        ...query,
        view,
        createdAfterDays: 30,
        sortBy: 'createdAtGithub' as const,
        order: 'desc' as const,
      };
    case 'backfilledPromising':
      return {
        ...query,
        view,
        createdAfterDays: 365,
        hasPromisingIdeaSnapshot: true,
        sortBy: 'createdAtGithub' as const,
        order: 'desc' as const,
      };
    default:
      return {
        ...query,
        view,
      };
  }
}

export function normalizeFavoriteListQuery(
  searchParams: Record<string, SearchParamValue>,
): FavoriteListQueryState {
  const page = toPositiveNumber(searchParams.page, 1) ?? 1;
  const pageSize = Math.min(toPositiveNumber(searchParams.pageSize, 20) ?? 20, 100);
  const keyword = toSingle(searchParams.keyword)?.trim();
  const priorityRaw = toSingle(searchParams.priority);
  const language = toSingle(searchParams.language)?.trim();
  const opportunityLevelRaw = toSingle(searchParams.opportunityLevel);
  const minFinalScore = toPositiveNumber(searchParams.minFinalScore);
  const sortByRaw = toSingle(searchParams.sortBy);
  const orderRaw = toSingle(searchParams.order);

  return {
    page,
    pageSize,
    keyword: keyword || undefined,
    priority: favoritePriorityValues.includes(priorityRaw as FavoritePriority)
      ? (priorityRaw as FavoritePriority)
      : undefined,
    language: language || undefined,
    opportunityLevel: repositoryOpportunityLevels.includes(
      opportunityLevelRaw as RepositoryOpportunityLevel,
    )
      ? (opportunityLevelRaw as RepositoryOpportunityLevel)
      : undefined,
    minFinalScore,
    sortBy: favoriteSortByValues.includes(sortByRaw as FavoriteSortBy)
      ? (sortByRaw as FavoriteSortBy)
      : 'createdAt',
    order: sortOrderValues.includes(orderRaw as SortOrder)
      ? (orderRaw as SortOrder)
      : 'desc',
  };
}

export function buildFavoriteListSearchParams(
  query: Partial<FavoriteListQueryState>,
) {
  const params = new URLSearchParams();

  if (query.page && query.page > 1) {
    params.set('page', String(query.page));
  }

  if (query.pageSize && query.pageSize !== 20) {
    params.set('pageSize', String(query.pageSize));
  }

  if (query.keyword) {
    params.set('keyword', query.keyword);
  }

  if (query.priority) {
    params.set('priority', query.priority);
  }

  if (query.language) {
    params.set('language', query.language);
  }

  if (query.opportunityLevel) {
    params.set('opportunityLevel', query.opportunityLevel);
  }

  if (typeof query.minFinalScore === 'number') {
    params.set('minFinalScore', String(query.minFinalScore));
  }

  if (query.sortBy && query.sortBy !== 'createdAt') {
    params.set('sortBy', query.sortBy);
  }

  if (query.order && query.order !== 'desc') {
    params.set('order', query.order);
  }

  return params.toString();
}

export function normalizeJobLogListQuery(
  searchParams: Record<string, SearchParamValue>,
): JobLogQueryState {
  const page = toPositiveNumber(searchParams.page, 1) ?? 1;
  const pageSize = Math.min(toPositiveNumber(searchParams.pageSize, 20) ?? 20, 100);
  const jobName = toSingle(searchParams.jobName)?.trim();
  const jobStatusRaw = toSingle(searchParams.jobStatus);

  return {
    page,
    pageSize,
    jobName: jobName || undefined,
    repositoryId: toSingle(searchParams.repositoryId)?.trim() || undefined,
    focusJobId: toSingle(searchParams.focusJobId)?.trim() || undefined,
    jobStatus: jobStatusValues.includes(jobStatusRaw as JobStatus)
      ? (jobStatusRaw as JobStatus)
      : undefined,
  };
}

export function buildJobLogListSearchParams(
  query: Partial<JobLogQueryState>,
) {
  const params = new URLSearchParams();

  if (query.page && query.page > 1) {
    params.set('page', String(query.page));
  }

  if (query.pageSize && query.pageSize !== 20) {
    params.set('pageSize', String(query.pageSize));
  }

  if (query.jobName) {
    params.set('jobName', query.jobName);
  }

  if (query.repositoryId) {
    params.set('repositoryId', query.repositoryId);
  }

  if (query.focusJobId) {
    params.set('focusJobId', query.focusJobId);
  }

  if (query.jobStatus) {
    params.set('jobStatus', query.jobStatus);
  }

  return params.toString();
}
