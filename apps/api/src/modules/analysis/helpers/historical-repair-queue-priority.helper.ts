export type HistoricalRepairRouterPriorityClass = 'P0' | 'P1' | 'P2' | 'P3';

export function normalizeHistoricalRepairRouterPriorityClass(
  value: string | null | undefined,
): HistoricalRepairRouterPriorityClass {
  switch (value) {
    case 'P0':
    case 'P1':
    case 'P2':
    case 'P3':
      return value;
    default:
      return 'P2';
  }
}

export function toHistoricalRepairQueuePriority(
  priorityScore: number | null | undefined,
  routerPriorityClass: HistoricalRepairRouterPriorityClass = 'P2',
) {
  const normalizedScore =
    typeof priorityScore === 'number' && Number.isFinite(priorityScore)
      ? priorityScore
      : 0;
  const base = Math.max(
    1,
    220 - Math.min(200, Math.max(0, Math.round(normalizedScore))),
  );
  const routerFloor =
    routerPriorityClass === 'P0'
      ? 5
      : routerPriorityClass === 'P1'
        ? 20
        : routerPriorityClass === 'P2'
          ? 60
          : 120;

  return Math.min(base, routerFloor);
}

export function toHistoricalSingleAnalysisQueuePriority(args: {
  historicalRepairAction: string | null | undefined;
  priorityScore: number | null | undefined;
  routerPriorityClass?: HistoricalRepairRouterPriorityClass | null | undefined;
}) {
  const base = toHistoricalRepairQueuePriority(
    args.priorityScore,
    normalizeHistoricalRepairRouterPriorityClass(args.routerPriorityClass),
  );

  switch (args.historicalRepairAction) {
    case 'deep_repair':
      return Math.max(1, Math.min(base, 40));
    case 'decision_recalc':
      return Math.min(200, Math.max(140, base + 80));
    default:
      return base;
  }
}
