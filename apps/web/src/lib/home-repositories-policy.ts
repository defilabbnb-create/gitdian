import { RepositoryListQueryState } from '@/lib/types/repository';

const HOME_FAST_DEFAULT_TIMEOUT_MS = 4_000;
const HOME_STANDARD_TIMEOUT_MS = 8_000;
const HOME_COMPLEX_QUERY_TIMEOUT_MS = 20_000;

export function shouldFallbackHomeRepositories(query: RepositoryListQueryState) {
  const hasExplicitFilter = Boolean(
    query.keyword ||
      query.language ||
      query.opportunityLevel ||
      query.isFavorited !== undefined ||
      query.roughPass !== undefined ||
      query.hasCompletenessAnalysis !== undefined ||
      query.hasIdeaFitAnalysis !== undefined ||
      query.hasExtractedIdea !== undefined ||
      query.hasPromisingIdeaSnapshot !== undefined ||
      query.hasGoodInsight !== undefined ||
      query.hasManualInsight !== undefined ||
      query.finalVerdict ||
      query.finalCategory ||
      query.moneyPriority ||
      query.decisionSource ||
      query.hasConflict !== undefined ||
      query.needsRecheck !== undefined ||
      query.hasTrainingHints !== undefined ||
      query.recommendedAction ||
      query.createdAfterDays !== undefined ||
      query.minStars !== undefined ||
      query.minFinalScore !== undefined ||
      query.page > 1
  );

  if (hasExplicitFilter) {
    return false;
  }

  return query.sortBy === 'moneyPriority' || query.sortBy === 'insightPriority';
}

export function buildHomeFallbackQuery(query: RepositoryListQueryState) {
  return {
    ...query,
    view: 'all' as const,
    sortBy: 'latest' as const,
    order: 'desc' as const,
  };
}

export function shouldUseFastHomeDefaultQuery(
  rawSearchParams: Record<string, string | string[] | undefined>,
) {
  const entries = Object.entries(rawSearchParams).filter(([, value]) => {
    if (Array.isArray(value)) {
      return value.some((item) => String(item ?? '').trim().length > 0);
    }

    return String(value ?? '').trim().length > 0;
  });

  return entries.length === 0;
}

export function buildHomeFastDefaultQuery(query: RepositoryListQueryState) {
  return {
    ...query,
    view: 'moneyFirst' as const,
    sortBy: 'moneyPriority' as const,
    order: 'desc' as const,
    pageSize: Math.max(Math.min(query.pageSize, 24), 24),
  };
}

export function resolveHomeRepositoriesTimeoutMs(args: {
  query: RepositoryListQueryState;
  rawSearchParams: Record<string, string | string[] | undefined>;
}) {
  if (shouldUseFastHomeDefaultQuery(args.rawSearchParams)) {
    return HOME_FAST_DEFAULT_TIMEOUT_MS;
  }

  const hasComplexUserQuery = Boolean(
    args.query.finalCategory ||
      args.query.recommendedAction ||
      args.query.keyword ||
      args.query.finalVerdict ||
      args.query.moneyPriority ||
      args.query.opportunityLevel ||
      args.query.minStars !== undefined ||
      args.query.minFinalScore !== undefined ||
      args.query.page > 1
  );

  return hasComplexUserQuery
    ? HOME_COMPLEX_QUERY_TIMEOUT_MS
    : HOME_STANDARD_TIMEOUT_MS;
}
