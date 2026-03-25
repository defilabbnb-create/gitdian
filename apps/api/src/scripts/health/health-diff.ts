import { DailyHealthSnapshot } from './health-metrics.collector';

export type HealthDiffEntry = {
  key: string;
  current: number;
  previous: number;
  delta: number;
  trend: 'improved' | 'degraded' | 'unchanged';
};

export type HealthDiffResult = {
  comparedAt: string;
  entries: HealthDiffEntry[];
};

export function diffDailyHealth(
  current: DailyHealthSnapshot,
  previous: DailyHealthSnapshot | null,
): HealthDiffResult | null {
  if (!previous) {
    return null;
  }

  const rows: Array<{
    key: string;
    current: number;
    previous: number;
    betterWhenLower?: boolean;
  }> = [
    {
      key: 'deepDoneRepos',
      current: current.summary.repoSummary.deepDoneRepos,
      previous: previous.summary.repoSummary.deepDoneRepos,
      betterWhenLower: false,
    },
    {
      key: 'fullyAnalyzedRepos',
      current: current.summary.repoSummary.fullyAnalyzedRepos,
      previous: previous.summary.repoSummary.fullyAnalyzedRepos,
      betterWhenLower: false,
    },
    {
      key: 'incompleteRepos',
      current: current.summary.repoSummary.incompleteRepos,
      previous: previous.summary.repoSummary.incompleteRepos,
      betterWhenLower: true,
    },
    {
      key: 'fallbackRepos',
      current: current.summary.repoSummary.fallbackRepos,
      previous: previous.summary.repoSummary.fallbackRepos,
      betterWhenLower: true,
    },
    {
      key: 'homepageUnsafe',
      current: current.summary.homepageSummary.homepageUnsafe,
      previous: previous.summary.homepageSummary.homepageUnsafe,
      betterWhenLower: true,
    },
    {
      key: 'badOneLinerCount',
      current: current.summary.qualitySummary.badOneLinerCount,
      previous: previous.summary.qualitySummary.badOneLinerCount,
      betterWhenLower: true,
    },
    {
      key: 'deepQueueSize',
      current: current.summary.queueSummary.deepQueueSize,
      previous: previous.summary.queueSummary.deepQueueSize,
      betterWhenLower: true,
    },
  ];

  return {
    comparedAt: new Date().toISOString(),
    entries: rows.map((item) => {
      const delta = item.current - item.previous;
      const trend =
        delta === 0
          ? 'unchanged'
          : item.betterWhenLower
            ? delta < 0
              ? 'improved'
              : 'degraded'
            : delta > 0
              ? 'improved'
              : 'degraded';

      return {
        key: item.key,
        current: item.current,
        previous: item.previous,
        delta,
        trend,
      };
    }),
  };
}
