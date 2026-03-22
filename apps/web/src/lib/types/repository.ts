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
  | 'createdAt'
  | 'createdAtGithub';
export type SortOrder = 'asc' | 'desc';
export type RepositoryRecommendedView =
  | 'all'
  | 'highOpportunity'
  | 'highOpportunityUnfavorited'
  | 'extractedIdea'
  | 'ideaExtractionPending'
  | 'pendingAnalysis'
  | 'favoritedPendingAnalysis'
  | 'newRadar';
export type FavoritePriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type FavoriteSortBy = 'createdAt' | 'updatedAt' | 'finalScore' | 'stars';
export type JobStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

const repositoryOpportunityLevels = ['LOW', 'MEDIUM', 'HIGH'] as const;
const repositorySortByValues = [
  'latest',
  'stars',
  'finalScore',
  'ideaFitScore',
  'createdAt',
  'createdAtGithub',
] as const;
const repositoryRecommendedViewValues = [
  'all',
  'highOpportunity',
  'highOpportunityUnfavorited',
  'extractedIdea',
  'ideaExtractionPending',
  'pendingAnalysis',
  'favoritedPendingAnalysis',
  'newRadar',
] as const;
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

export interface RepositoryAnalysisRecord {
  id: string;
  extractedIdeaJson?: RepositoryExtractedIdea | null;
  ideaFitJson?: RepositoryIdeaFitAnalysis | null;
  completenessJson?: RepositoryCompletenessAnalysis | null;
  negativeFlags?: string[] | null;
  provider?: string | null;
  modelName?: string | null;
  confidence?: number | null;
  analyzedAt?: string | null;
  promptVersion?: string | null;
  fallbackUsed?: boolean;
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
  decision: RepositoryDecision;
  isFavorited: boolean;
  createdAt: string;
  updatedAt: string;
  content?: RepositoryContentRecord | null;
  analysis?: RepositoryAnalysisRecord | null;
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
  keyword?: string;
  language?: string;
  opportunityLevel?: RepositoryOpportunityLevel;
  isFavorited?: boolean;
  roughPass?: boolean;
  hasCompletenessAnalysis?: boolean;
  hasIdeaFitAnalysis?: boolean;
  hasExtractedIdea?: boolean;
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
  const view = repositoryRecommendedViewValues.includes(
    viewRaw as RepositoryRecommendedView,
  )
    ? (viewRaw as RepositoryRecommendedView)
    : 'all';
  const opportunityLevel = repositoryOpportunityLevels.includes(
    opportunityLevelRaw as RepositoryOpportunityLevel,
  )
    ? (opportunityLevelRaw as RepositoryOpportunityLevel)
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

  return {
    page,
    pageSize,
    view,
    keyword: keyword || undefined,
    language: language || undefined,
    opportunityLevel,
    isFavorited: toBoolean(searchParams.isFavorited),
    roughPass: toBoolean(searchParams.roughPass),
    hasCompletenessAnalysis: toBoolean(searchParams.hasCompletenessAnalysis),
    hasIdeaFitAnalysis: toBoolean(searchParams.hasIdeaFitAnalysis),
    hasExtractedIdea: toBoolean(searchParams.hasExtractedIdea),
    createdAfterDays: toPositiveNumber(searchParams.createdAfterDays),
    minStars,
    minFinalScore,
    sortBy,
    order,
  };
}

export function buildRepositoryListSearchParams(
  query: Partial<RepositoryListQueryState>,
) {
  const params = new URLSearchParams();

  if (query.page && query.page > 1) {
    params.set('page', String(query.page));
  }

  if (query.pageSize && query.pageSize !== 20) {
    params.set('pageSize', String(query.pageSize));
  }

  if (query.view && query.view !== 'all') {
    params.set('view', query.view);
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
