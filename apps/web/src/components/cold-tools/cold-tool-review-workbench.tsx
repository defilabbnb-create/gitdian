'use client';

import Link from 'next/link';
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { ExportColdToolReviewsButton } from '@/components/cold-tools/export-cold-tool-reviews-button';
import {
  getColdToolReviewQueue,
  getColdToolReviewStats,
  getNextColdToolReviewItem,
  releaseColdToolReviewTimeouts,
  submitColdToolReview,
} from '@/lib/api/cold-tool-reviews';
import type {
  ColdToolReviewDecision,
  ColdToolReviewQueueScope,
  ColdToolReviewRound,
  ColdToolReviewStats,
  ColdToolReviewTaskItem,
} from '@/lib/types/cold-tool-review';

const REVIEWERS = ['审核员 A', '审核员 B'] as const;
const REVIEWER_STORAGE_KEY = 'gitdian:cold-tool-reviewer';

const ROUND_LABELS: Record<ColdToolReviewRound, string> = {
  ROUND_1: '第一轮初筛',
  ROUND_2: '第二轮复筛',
  ROUND_3: '第三轮仲裁',
};

const FLOW_LABELS: Record<string, string> = {
  PENDING_ROUND_1: '待第一轮',
  PENDING_ROUND_2: '待第二轮',
  FINAL_CANDIDATE: '已入候选',
  BACKUP_CANDIDATE: '已入备选',
  NEEDS_INFO: '待补充',
  ELIMINATED: '已淘汰',
  ARBITRATION_PENDING: '待仲裁',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  PENDING: '待审核',
  IN_PROGRESS: '审核中',
  SUBMITTED: '已提交',
  RELEASED: '已超时释放',
};

const DECISION_LABELS: Record<ColdToolReviewDecision, string> = {
  ROUND_1_KEEP: '留',
  ROUND_1_PENDING: '待定',
  ROUND_1_REJECT: '剔除',
  ROUND_2_STRONG_KEEP: '强留',
  ROUND_2_KEEP: '普通留',
  ROUND_2_NEEDS_INFO: '待补信息',
  ROUND_2_REJECT: '淘汰',
};

const ROUND_1_USAGE = [
  '只看 6 个核心字段',
  '每条只做一次粗判断',
  '不要纠结文案细节',
  '拿不准先放待定',
  '资源合集、安装仓库、tap、镜像、分发脚本可直接剔除',
];

const ROUND_2_USAGE = [
  '先看第一轮结论和备注',
  '再看核心字段',
  '重点判断总结、目标用户、使用场景、付费方是否成立',
  '不需要大改文案，只做去留判断',
  '如果和第一轮意见不同，必须写分歧原因',
];

const ROUND_1_REASON_TAGS = [
  '真实工具',
  '非独立工具',
  '场景明确',
  '信息不足',
  '付费方不清',
  '资源合集',
  '安装/分发仓库',
];

const ROUND_2_DISAGREEMENT_TAGS = [
  '总结不准',
  '目标用户过泛',
  '场景不成立',
  '付费方不真实',
  '需查仓库详情',
];

const ROUND_1_ACTIONS: Array<{
  decision: ColdToolReviewDecision;
  tone: string;
}> = [
  { decision: 'ROUND_1_KEEP', tone: 'emerald' },
  { decision: 'ROUND_1_PENDING', tone: 'amber' },
  { decision: 'ROUND_1_REJECT', tone: 'rose' },
];

const ROUND_2_ACTIONS: Array<{
  decision: ColdToolReviewDecision;
  tone: string;
}> = [
  { decision: 'ROUND_2_STRONG_KEEP', tone: 'emerald' },
  { decision: 'ROUND_2_KEEP', tone: 'sky' },
  { decision: 'ROUND_2_NEEDS_INFO', tone: 'amber' },
  { decision: 'ROUND_2_REJECT', tone: 'rose' },
];

const DECISION_FILTERS: Record<
  ColdToolReviewRound,
  Array<{ label: string; decision: ColdToolReviewDecision }>
> = {
  ROUND_1: [
    { label: '留下的', decision: 'ROUND_1_KEEP' },
    { label: '待定的', decision: 'ROUND_1_PENDING' },
    { label: '剔除的', decision: 'ROUND_1_REJECT' },
  ],
  ROUND_2: [
    { label: '强留的', decision: 'ROUND_2_STRONG_KEEP' },
    { label: '普通留', decision: 'ROUND_2_KEEP' },
    { label: '待补信息', decision: 'ROUND_2_NEEDS_INFO' },
    { label: '淘汰的', decision: 'ROUND_2_REJECT' },
  ],
  ROUND_3: [],
};

const ROUND_DISTRIBUTION_CONFIG: Record<
  ColdToolReviewRound,
  Array<{
    decision: ColdToolReviewDecision;
    label: string;
    tone: 'emerald' | 'amber' | 'rose' | 'sky';
  }>
> = {
  ROUND_1: [
    { decision: 'ROUND_1_KEEP', label: '留下', tone: 'emerald' },
    { decision: 'ROUND_1_PENDING', label: '待定', tone: 'amber' },
    { decision: 'ROUND_1_REJECT', label: '剔除', tone: 'rose' },
  ],
  ROUND_2: [
    { decision: 'ROUND_2_STRONG_KEEP', label: '强留', tone: 'emerald' },
    { decision: 'ROUND_2_KEEP', label: '普通留', tone: 'sky' },
    { decision: 'ROUND_2_NEEDS_INFO', label: '待补', tone: 'amber' },
    { decision: 'ROUND_2_REJECT', label: '淘汰', tone: 'rose' },
  ],
  ROUND_3: [],
};

const DISTRIBUTION_BAR_TONE_CLASSES = {
  emerald: 'bg-[linear-gradient(90deg,#10b981,#059669)]',
  amber: 'bg-[linear-gradient(90deg,#f59e0b,#d97706)]',
  rose: 'bg-[linear-gradient(90deg,#fb7185,#e11d48)]',
  sky: 'bg-[linear-gradient(90deg,#38bdf8,#0284c7)]',
} as const;

const DISTRIBUTION_DOT_TONE_CLASSES = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
} as const;

const PRIMARY_ARROW_DECISIONS: Record<
  ColdToolReviewRound,
  {
    left?: ColdToolReviewDecision;
    down?: ColdToolReviewDecision;
    right?: ColdToolReviewDecision;
  }
> = {
  ROUND_1: {
    left: 'ROUND_1_REJECT',
    down: 'ROUND_1_PENDING',
    right: 'ROUND_1_KEEP',
  },
  ROUND_2: {
    left: 'ROUND_2_REJECT',
    down: 'ROUND_2_NEEDS_INFO',
    right: 'ROUND_2_KEEP',
  },
  ROUND_3: {},
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '未记录';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildPercent(part: number, total: number) {
  if (!total) {
    return 0;
  }

  return Math.round((part / total) * 100);
}

function buildScopeLabel(scope: ColdToolReviewQueueScope | 'all') {
  switch (scope) {
    case 'myPending':
      return '我的待审';
    case 'myReviewed':
      return '我的已审';
    default:
      return '当前队列';
  }
}

function getPrimaryDecisionLabel(
  round: ColdToolReviewRound,
  direction: 'left' | 'down' | 'right',
) {
  const decision = PRIMARY_ARROW_DECISIONS[round][direction];
  return decision ? DECISION_LABELS[decision] : '';
}

function getDecisionBucket(decision?: ColdToolReviewDecision | null) {
  switch (decision) {
    case 'ROUND_1_KEEP':
    case 'ROUND_2_KEEP':
    case 'ROUND_2_STRONG_KEEP':
      return 'positive';
    case 'ROUND_1_PENDING':
    case 'ROUND_2_NEEDS_INFO':
      return 'neutral';
    case 'ROUND_1_REJECT':
    case 'ROUND_2_REJECT':
      return 'negative';
    default:
      return null;
  }
}

type PreviousSubmittedReviewState = {
  item: ColdToolReviewTaskItem;
  round: ColdToolReviewRound;
  decision: ColdToolReviewDecision;
  reasonTags: string[];
  disagreementTags: string[];
  isDisputed: boolean;
  note: string;
};

function findRoundRecord(
  item: ColdToolReviewTaskItem | null | undefined,
  round: ColdToolReviewRound,
) {
  return item?.history.find((record) => record.round === round) ?? null;
}

export function ColdToolReviewWorkbench() {
  const [reviewer, setReviewer] = useState<string>(REVIEWERS[0]);
  const [round, setRound] = useState<ColdToolReviewRound>('ROUND_1');
  const [scope, setScope] = useState<ColdToolReviewQueueScope | 'all'>('myPending');
  const [decisionFilter, setDecisionFilter] = useState<ColdToolReviewDecision | ''>('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [stats, setStats] = useState<ColdToolReviewStats | null>(null);
  const [reviewerStats, setReviewerStats] = useState<
    Array<{
      reviewer: string;
      completed: number;
      inProgress: number;
    }>
  >([]);
  const [queueItems, setQueueItems] = useState<ColdToolReviewTaskItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [currentItem, setCurrentItem] = useState<ColdToolReviewTaskItem | null>(null);
  const [pendingDecision, setPendingDecision] = useState<ColdToolReviewDecision | null>(null);
  const [reasonTags, setReasonTags] = useState<string[]>([]);
  const [disagreementTags, setDisagreementTags] = useState<string[]>([]);
  const [isDisputed, setIsDisputed] = useState(false);
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(false);
  const [isAllocatingNext, setIsAllocatingNext] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [previousSubmittedReview, setPreviousSubmittedReview] =
    useState<PreviousSubmittedReviewState | null>(null);
  const [isEditingPreviousSubmitted, setIsEditingPreviousSubmitted] =
    useState(false);
  const focusPanelRef = useRef<HTMLDivElement | null>(null);
  const currentItemRef = useRef<ColdToolReviewTaskItem | null>(null);
  const pendingDecisionRef = useRef<ColdToolReviewDecision | null>(null);
  const queueItemsRef = useRef<ColdToolReviewTaskItem[]>([]);
  const roundRef = useRef<ColdToolReviewRound>('ROUND_1');
  const reviewerRef = useRef<string>(REVIEWERS[0]);
  const focusModeRef = useRef(false);
  const previousSubmittedReviewRef = useRef<PreviousSubmittedReviewState | null>(null);
  const isEditingPreviousSubmittedRef = useRef(false);

  const actions = round === 'ROUND_2' ? ROUND_2_ACTIONS : ROUND_1_ACTIONS;
  const instructions = round === 'ROUND_2' ? ROUND_2_USAGE : ROUND_1_USAGE;
  const currentRoundRecord = findRoundRecord(currentItem, round);
  const canOverrideCurrentRound = Boolean(
    isEditingPreviousSubmitted &&
      previousSubmittedReview &&
      currentItem?.id === previousSubmittedReview.item.id &&
      currentRoundRecord &&
      currentRoundRecord.reviewer === reviewer,
  );
  const canSubmit = Boolean(
    currentItem &&
      pendingDecision &&
      ((currentItem.currentRound === round &&
        currentItem.taskStatus === 'IN_PROGRESS' &&
        currentItem.lockedBy === reviewer) ||
        canOverrideCurrentRound),
  );
  const requiresDisagreementReason = Boolean(
    round === 'ROUND_2' &&
      currentItem?.previousRound &&
      pendingDecision &&
      getDecisionBucket(currentItem.previousRound.decision) !==
        getDecisionBucket(pendingDecision),
  );
  const effectiveIsDisputed = isDisputed || requiresDisagreementReason;
  const submitRef = useRef<() => Promise<void>>(async () => {});
  submitRef.current = handleSubmit;
  currentItemRef.current = currentItem;
  pendingDecisionRef.current = pendingDecision;
  queueItemsRef.current = queueItems;
  roundRef.current = round;
  reviewerRef.current = reviewer;
  focusModeRef.current = isFocusMode;
  previousSubmittedReviewRef.current = previousSubmittedReview;
  isEditingPreviousSubmittedRef.current = isEditingPreviousSubmitted;

  useEffect(() => {
    const storedReviewer = window.localStorage.getItem(REVIEWER_STORAGE_KEY);
    if (storedReviewer && REVIEWERS.includes(storedReviewer as (typeof REVIEWERS)[number])) {
      setReviewer(storedReviewer);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(REVIEWER_STORAGE_KEY, reviewer);
  }, [reviewer]);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setIsLoadingStats(true);
      try {
        const [nextStats, allReviewerStats] = await Promise.all([
          getColdToolReviewStats({
            reviewer,
            round,
            timeoutMs: 10_000,
          }),
          Promise.all(
            REVIEWERS.map(async (item) => {
              const result = await getColdToolReviewStats({
                reviewer: item,
                round,
                timeoutMs: 10_000,
              });

              return {
                reviewer: item,
                completed: result.myProgress.completed,
                inProgress: result.myProgress.inProgress,
              };
            }),
          ),
        ]);
        if (!cancelled) {
          setStats(nextStats);
          setReviewerStats(allReviewerStats);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '统计信息加载失败。');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingStats(false);
        }
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [reviewer, round]);

  useEffect(() => {
    let cancelled = false;

    async function loadQueue() {
      setIsLoadingQueue(true);
      try {
        const nextQueue = await getColdToolReviewQueue({
          reviewer,
          round,
          scope: scope === 'all' ? undefined : scope,
          decision: decisionFilter || undefined,
          search: deferredSearch || undefined,
          page,
          pageSize: 12,
          includeReleased: true,
          timeoutMs: 10_000,
        });

        if (cancelled) {
          return;
        }

        setQueueItems(nextQueue.items);
        setPagination(nextQueue.pagination);

        setCurrentItem((previous) => {
          const matched = previous
            ? nextQueue.items.find((item) => item.id === previous.id) ?? null
            : null;

          if (matched) {
            return matched;
          }

          if (nextQueue.items.length > 0) {
            return nextQueue.items[0];
          }

          return null;
        });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '队列加载失败。');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingQueue(false);
        }
      }
    }

    void loadQueue();

    return () => {
      cancelled = true;
    };
  }, [reviewer, round, scope, decisionFilter, deferredSearch, page]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentItem() {
      setIsLoadingCurrent(true);
      try {
        const next = await getNextColdToolReviewItem({
          reviewer,
          round,
          allocate: false,
          timeoutMs: 12_000,
        });

        if (cancelled) {
          return;
        }

        setCurrentItem(next.item ?? null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '下一条领取失败。');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCurrent(false);
        }
      }
    }

    void loadCurrentItem();

    return () => {
      cancelled = true;
    };
  }, [reviewer, round]);

  useEffect(() => {
    setPage(1);
  }, [reviewer, round, scope, decisionFilter, deferredSearch]);

  useEffect(() => {
    pendingDecisionRef.current = null;
    setPendingDecision(null);
    setReasonTags([]);
    setDisagreementTags([]);
    setIsDisputed(false);
    setNote('');
  }, [currentItem?.id, round]);

  useEffect(() => {
    if (
      !isEditingPreviousSubmitted ||
      !previousSubmittedReview ||
      currentItem?.id !== previousSubmittedReview.item.id ||
      previousSubmittedReview.round !== round
    ) {
      return;
    }

    pendingDecisionRef.current = previousSubmittedReview.decision;
    setPendingDecision(previousSubmittedReview.decision);
    setReasonTags(previousSubmittedReview.reasonTags);
    setDisagreementTags(previousSubmittedReview.disagreementTags);
    setIsDisputed(previousSubmittedReview.isDisputed);
    setNote(previousSubmittedReview.note);
  }, [currentItem?.id, isEditingPreviousSubmitted, previousSubmittedReview, round]);

  useEffect(() => {
    if (!currentItem) {
      setIsFocusMode(false);
    }
  }, [currentItem]);

  function selectPendingDecision(decision: ColdToolReviewDecision) {
    pendingDecisionRef.current = decision;
    setPendingDecision(decision);
  }

  useEffect(() => {
    if (!isFocusMode || !currentItem) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      focusPanelRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isFocusMode, currentItem]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const latestQueueItems = queueItemsRef.current;
      const latestCurrentItem = currentItemRef.current;
      const latestRound = roundRef.current;
      const latestReviewer = reviewerRef.current;
      const latestPendingDecision = pendingDecisionRef.current;
      const latestCanSubmit = Boolean(
        latestCurrentItem &&
          latestPendingDecision &&
          ((latestCurrentItem.currentRound === latestRound &&
            latestCurrentItem.taskStatus === 'IN_PROGRESS' &&
            latestCurrentItem.lockedBy === latestReviewer) ||
            (isEditingPreviousSubmittedRef.current &&
              previousSubmittedReviewRef.current?.item.id === latestCurrentItem.id &&
              findRoundRecord(latestCurrentItem, latestRound)?.reviewer ===
                latestReviewer)),
      );

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const latestPreviousSubmitted = previousSubmittedReviewRef.current;
        if (
          latestPreviousSubmitted &&
          latestPreviousSubmitted.round === latestRound &&
          latestCurrentItem?.id !== latestPreviousSubmitted.item.id
        ) {
          setIsEditingPreviousSubmitted(true);
          setCurrentItem(latestPreviousSubmitted.item);
          return;
        }

        if (!latestQueueItems.length) {
          return;
        }

        const currentIndex = latestCurrentItem
          ? latestQueueItems.findIndex((item) => item.id === latestCurrentItem.id)
          : -1;
        const nextIndex = Math.max(currentIndex <= 0 ? 0 : currentIndex - 1, 0);
        setCurrentItem(latestQueueItems[nextIndex]);
        return;
      }

      if (
        latestRound === 'ROUND_2' &&
        event.key === 'ArrowRight' &&
        event.shiftKey
      ) {
        event.preventDefault();
        selectPendingDecision('ROUND_2_STRONG_KEEP');
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        const primaryDecision =
          event.key === 'ArrowLeft'
            ? PRIMARY_ARROW_DECISIONS[latestRound].left
            : event.key === 'ArrowRight'
            ? PRIMARY_ARROW_DECISIONS[latestRound].right
            : PRIMARY_ARROW_DECISIONS[latestRound].down;

        if (primaryDecision) {
          selectPendingDecision(primaryDecision);
        }
        return;
      }

      if (latestRound === 'ROUND_2' && key === 'd') {
        event.preventDefault();
        setIsDisputed((value) => !value);
        return;
      }

      if (key === 'escape' && focusModeRef.current) {
        event.preventDefault();
        setIsFocusMode(false);
        return;
      }

      if (event.key === 'Enter' && latestCanSubmit) {
        event.preventDefault();
        event.stopPropagation();
        void submitRef.current();
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  async function refreshBoard(options: { loadNextItem?: boolean } = {}) {
    const [nextStats, nextQueue, nextItem] = await Promise.all([
      getColdToolReviewStats({
        reviewer,
        round,
        timeoutMs: 10_000,
      }),
      getColdToolReviewQueue({
        reviewer,
        round,
        scope: scope === 'all' ? undefined : scope,
        decision: decisionFilter || undefined,
        search: deferredSearch || undefined,
        page,
        pageSize: 12,
        includeReleased: true,
        timeoutMs: 10_000,
      }),
      options.loadNextItem
        ? getNextColdToolReviewItem({
            reviewer,
            round,
            allocate: true,
            timeoutMs: 12_000,
          })
        : Promise.resolve(null),
    ]);

    setStats(nextStats);
    setQueueItems(nextQueue.items);
    setPagination(nextQueue.pagination);

    if (options.loadNextItem) {
      setCurrentItem(nextItem?.item ?? null);
      return;
    }

    if (currentItem) {
      const matched = nextQueue.items.find((item) => item.id === currentItem.id);
      if (matched) {
        setCurrentItem(matched);
      }
    }
  }

  async function handleSubmit() {
    if (!currentItem || !pendingDecision) {
      return;
    }

    if (requiresDisagreementReason && disagreementTags.length === 0 && !note.trim()) {
      setErrorMessage('第二轮和上一轮意见不同，必须填写分歧原因或备注。');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const submittedDraft: PreviousSubmittedReviewState = {
        item: currentItem,
        round,
        decision: pendingDecision,
        reasonTags,
        disagreementTags,
        isDisputed: effectiveIsDisputed,
        note,
      };
      const result = await submitColdToolReview({
        taskId: currentItem.id,
        reviewer,
        round,
        decision: pendingDecision,
        reasonTags: reasonTags.length ? reasonTags : undefined,
        disagreementTags: disagreementTags.length ? disagreementTags : undefined,
        note: note.trim() || undefined,
        isDisputed: effectiveIsDisputed,
        overrideExisting: canOverrideCurrentRound,
      });

      setSuccessMessage(
        `${canOverrideCurrentRound ? '已覆盖：' : '已提交：'}${DECISION_LABELS[pendingDecision]}`,
      );
      if (canOverrideCurrentRound) {
        setPreviousSubmittedReview(null);
        setIsEditingPreviousSubmitted(false);
      } else {
        setPreviousSubmittedReview({
          ...submittedDraft,
          item: result.submitted,
        });
        setIsEditingPreviousSubmitted(false);
      }
      setCurrentItem(result.next.item ?? null);
      pendingDecisionRef.current = null;
      setPendingDecision(null);
      setReasonTags([]);
      setDisagreementTags([]);
      setIsDisputed(false);
      setNote('');
      await refreshBoard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '提交失败。');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReleaseTimeouts() {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await releaseColdToolReviewTimeouts();
      setSuccessMessage(`已释放 ${result.releasedCount} 条超时锁定。`);
      await refreshBoard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '释放锁定失败。');
    }
  }

  async function handleAllocateNext() {
    setIsAllocatingNext(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const next = await getNextColdToolReviewItem({
        reviewer,
        round,
        allocate: true,
        timeoutMs: 12_000,
      });
      setCurrentItem(next.item ?? null);
      await refreshBoard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '领取下一条失败。');
    } finally {
      setIsAllocatingNext(false);
    }
  }

  async function handleCopyRepositoryUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => {
        setCopiedUrl((current) => (current === url ? null : current));
      }, 1500);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '复制仓库地址失败。');
    }
  }

  function toggleTag(tag: string, values: string[], setter: (value: string[]) => void) {
    if (values.includes(tag)) {
      setter(values.filter((item) => item !== tag));
      return;
    }

    setter([...values, tag]);
  }

  const teamPercent = buildPercent(
    stats?.teamProgress.completed ?? 0,
    stats?.teamProgress.total ?? 0,
  );
  const roundDistribution = ROUND_DISTRIBUTION_CONFIG[round].map((item) => {
    const count =
      stats?.decisions.find((decisionItem) => decisionItem.decision === item.decision)
        ?.count ?? 0;

    return {
      ...item,
      count,
      percent: buildPercent(count, stats?.teamProgress.completed ?? 0),
    };
  });
  const myCanEdit =
    Boolean(
      (currentItem?.currentRound === round &&
        currentItem?.taskStatus === 'IN_PROGRESS' &&
        currentItem?.lockedBy === reviewer) ||
        canOverrideCurrentRound,
    );
  const focusPrimaryLabel = `← ${getPrimaryDecisionLabel(round, 'left')} / ↓ ${getPrimaryDecisionLabel(round, 'down')} / → ${getPrimaryDecisionLabel(round, 'right')}`;

  return (
    <div
      className="space-y-6"
      data-cold-tool-review-workbench="true"
    >
      <section className="surface-card rounded-[28px] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                当前轮次
              </span>
              <div className="flex flex-wrap gap-2">
                {(['ROUND_1', 'ROUND_2'] as ColdToolReviewRound[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      startTransition(() => {
                        setRound(item);
                        setScope('myPending');
                        setDecisionFilter('');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      })
                    }
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      item === round
                        ? 'bg-slate-950 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                    }`}
                  >
                    {ROUND_LABELS[item]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                使用方法
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {instructions.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TopStatCard
                label="当前审核人"
                value={reviewer}
                helper="当前版本用页面内身份切换代替权限系统。"
              />
              <TopStatCard
                label="我的完成进度"
                value={
                  isLoadingStats
                    ? '加载中'
                    : `${stats?.myProgress.completed ?? 0} 条`
                }
                helper={`手上审核中 ${stats?.myProgress.inProgress ?? 0} 条`}
              />
              <TopStatCard
                label="团队完成进度"
                value={
                  isLoadingStats
                    ? '加载中'
                    : `${stats?.teamProgress.completed ?? 0}/${stats?.teamProgress.total ?? 0}`
                }
                helper={`完成率 ${teamPercent}%`}
              />
              <TopStatCard
                label="锁定释放"
                value={`${stats?.lockTimeoutMinutes ?? 10} 分钟`}
                helper="超时未提交会自动回到待审核池。"
              />
            </div>

            <div className="rounded-[28px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.92))] p-4 shadow-[0_24px_60px_-42px_rgba(180,83,9,0.42)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    审核控制台
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    先领取，再刷卡；备注、分歧和强留继续用鼠标补细节。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFocusMode(true)}
                  disabled={!currentItem}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-900/10 bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  放大审核台
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                审核导出
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!previousSubmittedReview || previousSubmittedReview.round !== round) {
                      return;
                    }
                    setIsEditingPreviousSubmitted(true);
                    setCurrentItem(previousSubmittedReview.item);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  disabled={
                    !previousSubmittedReview ||
                    previousSubmittedReview.round !== round ||
                    isSubmitting
                  }
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ↑ 回看上一条
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleAllocateNext();
                  }}
                  disabled={isAllocatingNext || isSubmitting}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAllocatingNext ? '领取中...' : '领取下一条'}
                </button>
                <ExportColdToolReviewsButton />
              </div>
            </div>
          </div>

          <div className="surface-card-strong min-w-[280px] rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,250,240,0.88))] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              快捷键
            </p>
            <div className="mt-3 grid gap-2 text-sm text-slate-700">
              <ShortcutRow label={focusPrimaryLabel} hotkey="方向键" />
              <ShortcutRow label="回看上一条" hotkey="↑" />
                <ShortcutRow label="提交并自动下一条" hotkey="Enter" />
                {round === 'ROUND_2' ? (
                  <ShortcutRow label="全键盘强留" hotkey="Shift + →" />
                ) : null}
                <ShortcutRow label="放大模式开关" hotkey="鼠标 / Esc" />
                {round === 'ROUND_2' ? (
                  <ShortcutRow label="强留与分歧备注" hotkey="鼠标 / D" />
              ) : (
                <ShortcutRow label="备注与原因标签" hotkey="鼠标" />
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="surface-card rounded-[28px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {buildScopeLabel(scope)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                共 {pagination.total} 条，↑ 回看上一条，Enter 提交后自动下一条。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void refreshBoard();
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
            >
              刷新
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-[24px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,250,240,0.96),rgba(255,255,255,0.9))] p-4 shadow-[0_24px_60px_-44px_rgba(180,83,9,0.36)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                开始审核
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                当前页面不会自动领号。点击后才会正式锁定一条记录给当前审核员。
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleAllocateNext();
                }}
                disabled={isAllocatingNext || isSubmitting}
                className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAllocatingNext ? '领取中...' : '领取下一条'}
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                审核人
              </span>
              <div className="mt-2 flex gap-2">
                {REVIEWERS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      startTransition(() => {
                        setReviewer(item);
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      })
                    }
                    className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                      reviewer === item
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </label>

            <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                审核进度
              </p>
              <div className="mt-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">团队合计</span>
                  <span className="text-sm text-slate-600">
                    已审 {stats?.teamProgress.completed ?? 0} / {stats?.teamProgress.total ?? 0}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#059669,#0f766e)] transition-all"
                    style={{
                      width: `${Math.min(100, teamPercent)}%`,
                    }}
                  />
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  团队完成率 {teamPercent}% · 当前审核中 {stats?.teamProgress.inProgress ?? 0} 条
                </p>
              </div>

              <div className="mt-3 rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">本轮结果分布</span>
                  <span className="text-sm text-slate-600">
                    已提交 {stats?.teamProgress.completed ?? 0} 条
                  </span>
                </div>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
                  {roundDistribution.map((item) => (
                    <div
                      key={`distribution-bar-${item.decision}`}
                      className={DISTRIBUTION_BAR_TONE_CLASSES[item.tone]}
                      style={{
                        width: `${item.percent}%`,
                        minWidth: item.count > 0 ? '10px' : '0px',
                      }}
                    />
                  ))}
                </div>
                <div className="mt-4 grid gap-3">
                  {roundDistribution.map((item) => (
                    <div
                      key={`distribution-card-${item.decision}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex size-2.5 rounded-full ${DISTRIBUTION_DOT_TONE_CLASSES[item.tone]}`}
                          />
                          <span className="text-sm font-semibold text-slate-900">
                            {item.label}
                          </span>
                        </div>
                        <span className="text-sm text-slate-600">{item.count} 条</span>
                      </div>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {item.percent}% of completed
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 space-y-3">
                {reviewerStats.map((item) => (
                  <div
                    key={item.reviewer}
                    className={`rounded-2xl border px-3 py-3 ${
                      reviewer === item.reviewer
                        ? 'border-emerald-200 bg-emerald-50/80'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">
                        {item.reviewer}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        已审 {item.completed}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm text-slate-600">
                      <span>手上审核中 {item.inProgress} 条</span>
                      <span>
                        {stats?.teamProgress.total
                          ? `${Math.round((item.completed / Math.max(1, stats.teamProgress.total)) * 100)}%`
                          : '0%'}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className={`h-full rounded-full transition-all ${
                          reviewer === item.reviewer
                            ? 'bg-[linear-gradient(90deg,#10b981,#059669)]'
                            : 'bg-[linear-gradient(90deg,#94a3b8,#64748b)]'
                        }`}
                        style={{
                          width: `${
                            stats?.teamProgress.total
                              ? Math.min(
                                  100,
                                  Math.round(
                                    (item.completed / Math.max(1, stats.teamProgress.total)) * 100,
                                  ),
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                搜索
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="项目名 / 仓库地址 / 分析ID"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </label>

            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                视图
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                <FilterChip
                  label="全部"
                  active={scope === 'all'}
                  onClick={() => setScope('all')}
                />
                <FilterChip
                  label="我的待审"
                  active={scope === 'myPending'}
                  onClick={() => setScope('myPending')}
                />
                <FilterChip
                  label="我的已审"
                  active={scope === 'myReviewed'}
                  onClick={() => setScope('myReviewed')}
                />
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                结论筛选
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                <FilterChip
                  label="全部结论"
                  active={!decisionFilter}
                  onClick={() => setDecisionFilter('')}
                />
                {DECISION_FILTERS[round].map((item) => (
                  <FilterChip
                    key={item.decision}
                    label={item.label}
                    active={decisionFilter === item.decision}
                    onClick={() => setDecisionFilter(item.decision)}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                void handleReleaseTimeouts();
              }}
              className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              释放超时锁定
            </button>
          </div>

          <div className="mt-5 grid gap-2">
            {isLoadingQueue ? (
              <QueueEmptyState text="队列加载中..." />
            ) : queueItems.length ? (
              queueItems.map((item, index) => {
                const isActive = currentItem?.id === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCurrentItem(item)}
                    className={`rounded-[22px] border p-3 text-left transition ${
                      isActive
                        ? 'border-slate-900 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                        isActive ? 'text-slate-300' : 'text-slate-500'
                      }`}>
                        #{index + 1}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {TASK_STATUS_LABELS[item.taskStatus]}
                      </span>
                    </div>
                    <p className={`mt-2 line-clamp-1 text-sm font-semibold ${
                      isActive ? 'text-white' : 'text-slate-900'
                    }`}>
                      {item.card.projectName}
                    </p>
                    <p className={`mt-1 line-clamp-2 text-xs leading-5 ${
                      isActive ? 'text-slate-300' : 'text-slate-600'
                    }`}>
                      {item.card.oneLiner}
                    </p>
                    <div className={`mt-3 flex items-center justify-between text-xs ${
                      isActive ? 'text-slate-300' : 'text-slate-500'
                    }`}>
                      <span>{item.repository.stars.toLocaleString()} Stars</span>
                      <span>{FLOW_LABELS[item.flowStatus] ?? item.flowStatus}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <QueueEmptyState text="当前筛选下没有记录。" />
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1 || isLoadingQueue}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              上一页
            </button>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              第 {pagination.page} / {pagination.totalPages} 页
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((value) => Math.min(pagination.totalPages || 1, value + 1))
              }
              disabled={page >= pagination.totalPages || isLoadingQueue}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </aside>

        <main className="surface-card-strong relative overflow-hidden rounded-[36px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_70%)]" />
          {errorMessage ? (
            <Banner tone="rose">{errorMessage}</Banner>
          ) : null}
          {successMessage ? (
            <Banner tone="emerald">{successMessage}</Banner>
          ) : null}

          {currentItem ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    主审核区
                  </p>
                  <h2 className="mt-2 max-w-4xl font-display text-4xl tracking-[-0.04em] text-slate-950">
                    {currentItem.card.projectName}
                  </h2>
                  <p className="mt-3 max-w-4xl text-lg leading-8 text-slate-700">
                    {currentItem.card.oneLiner}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <InfoBadge label={`${currentItem.repository.stars.toLocaleString()} Stars`} />
                    <InfoBadge label={FLOW_LABELS[currentItem.flowStatus] ?? currentItem.flowStatus} />
                    <InfoBadge label={TASK_STATUS_LABELS[currentItem.taskStatus]} />
                    <InfoBadge label={`当前审核人：${currentItem.lockedBy ?? '未锁定'}`} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href={currentItem.repository.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                  >
                    打开 GitHub
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyRepositoryUrl(currentItem.repository.htmlUrl);
                    }}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                  >
                    {copiedUrl === currentItem.repository.htmlUrl ? '已复制地址' : '复制仓库地址'}
                  </button>
                  <Link
                    href={`/repositories/${currentItem.repository.id}`}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                  >
                    查看项目详情
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldCard label="项目名" value={currentItem.card.projectName} />
                <FieldCard
                  label="仓库地址"
                  value={currentItem.card.repositoryUrl}
                  monospace
                />
                <FieldCard label="目标用户" value={currentItem.card.targetUsers} />
                <FieldCard label="使用场景" value={currentItem.card.useCase} />
                <FieldCard label="付费方" value={currentItem.card.payer} />
                <FieldCard
                  label="当前判断拨杆"
                  value={pendingDecision ? DECISION_LABELS[pendingDecision] : '还没选结论，先用 ← / ↓ / → 预选'}
                />
              </div>

              <details
                open
                className="rounded-[24px] border border-slate-200 bg-white px-4 py-4"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                  辅助字段
                </summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <AuxField label="付费意愿" value={currentItem.meta.willingnessToPay} />
                  <AuxField
                    label="是否有付费意图"
                    value={currentItem.meta.hasPayingIntent === null ? '未知' : currentItem.meta.hasPayingIntent ? '是' : '否'}
                  />
                  <AuxField
                    label="真实用户工具"
                    value={currentItem.meta.isRealUserTool === null ? '未知' : currentItem.meta.isRealUserTool ? '是' : '否'}
                  />
                  <AuxField
                    label="是否入冷门池"
                    value={currentItem.meta.fitsColdToolPool === null ? '未知' : currentItem.meta.fitsColdToolPool ? '是' : '否'}
                  />
                  <AuxField
                    label="分析ID"
                    value={currentItem.analysisId}
                    monospace
                  />
                  <AuxField label="仓库ID" value={currentItem.repositoryId} monospace />
                  <AuxField label="分类主类" value={currentItem.meta.categoryMain} />
                  <AuxField label="分类子类" value={currentItem.meta.categorySub} />
                  <AuxField
                    label="最近评估时间"
                    value={formatDateTime(currentItem.meta.evaluatedAt)}
                  />
                </div>
              </details>
            </div>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white/60 px-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                当前主审核区
              </p>
              <h2 className="mt-3 font-display text-3xl tracking-[-0.03em] text-slate-950">
                {isLoadingCurrent ? '正在领取下一条…' : '当前没有可审记录'}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
                {round === 'ROUND_1'
                  ? '第一轮公共池已经刷完，或者当前筛选范围内没有匹配数据。'
                  : '第二轮候选池已清空，或当前轮次尚未积累足够候选。'}
              </p>
            </div>
          )}
        </main>

        <aside className="surface-card rounded-[28px] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            侧边操作区
          </p>

          {currentItem ? (
            <div className="mt-4 space-y-4">
              {!myCanEdit && currentItem.lockedBy && currentItem.lockedBy !== reviewer ? (
                <Banner tone="amber">
                  该条正在由 {currentItem.lockedBy} 审核，当前为只读查看。
                </Banner>
              ) : null}
              {canOverrideCurrentRound ? (
                <Banner tone="amber">
                  正在回看上一条。当前提交会覆盖你本轮刚才的结论和备注。
                </Banner>
              ) : null}

              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  当前状态
                </p>
                <div className="mt-3 grid gap-3">
                  <StatusRow label="当前轮次" value={ROUND_LABELS[currentItem.currentRound]} />
                  <StatusRow label="锁定状态" value={TASK_STATUS_LABELS[currentItem.taskStatus]} />
                  <StatusRow label="锁定人" value={currentItem.lockedBy ?? '未锁定'} />
                  <StatusRow label="锁定时间" value={formatDateTime(currentItem.lockedAt)} />
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  上一轮结论
                </p>
                {currentItem.previousRound ? (
                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                    <StatusRow
                      label="结论"
                      value={DECISION_LABELS[currentItem.previousRound.decision]}
                    />
                    <StatusRow
                      label="审核员"
                      value={currentItem.previousRound.reviewer}
                    />
                    <StatusRow
                      label="时间"
                      value={formatDateTime(currentItem.previousRound.createdAt)}
                    />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        备注
                      </p>
                      <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
                        {currentItem.previousRound.note || '上一轮没有备注。'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    当前还没有上一轮结论。
                  </p>
                )}
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  当前轮操作
                </p>
                <div className="mt-3 grid gap-2">
                  {actions.map((action) => (
                    <button
                      key={action.decision}
                      type="button"
                      onClick={() => selectPendingDecision(action.decision)}
                      disabled={!myCanEdit}
                      className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                        pendingDecision === action.decision
                          ? action.tone === 'emerald'
                            ? 'bg-emerald-600 text-white'
                            : action.tone === 'amber'
                            ? 'bg-amber-500 text-white'
                            : action.tone === 'sky'
                            ? 'bg-sky-600 text-white'
                            : 'bg-rose-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50'
                      }`}
                    >
                      <span>{DECISION_LABELS[action.decision]}</span>
                      <span className="ml-2 text-xs opacity-70">
                        {round === 'ROUND_1' && action.decision === 'ROUND_1_REJECT'
                          ? '←'
                          : round === 'ROUND_1' && action.decision === 'ROUND_1_PENDING'
                          ? '↓'
                          : round === 'ROUND_1' && action.decision === 'ROUND_1_KEEP'
                          ? '→'
                          : round === 'ROUND_2' && action.decision === 'ROUND_2_REJECT'
                          ? '←'
                          : round === 'ROUND_2' && action.decision === 'ROUND_2_NEEDS_INFO'
                          ? '↓'
                          : round === 'ROUND_2' && action.decision === 'ROUND_2_KEEP'
                          ? '→'
                          : '鼠标'}
                      </span>
                    </button>
                  ))}
                </div>

                {round === 'ROUND_1' ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      快捷原因标签
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ROUND_1_REASON_TAGS.map((tag) => (
                        <TagButton
                          key={tag}
                          label={tag}
                          active={reasonTags.includes(tag)}
                          disabled={!myCanEdit}
                          onClick={() => toggleTag(tag, reasonTags, setReasonTags)}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => setIsDisputed((value) => !value)}
                      disabled={!myCanEdit}
                      className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        effectiveIsDisputed
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      标记分歧
                      <span className="ml-2 text-xs opacity-70">快捷键 D</span>
                    </button>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        分歧原因标签
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ROUND_2_DISAGREEMENT_TAGS.map((tag) => (
                          <TagButton
                            key={tag}
                            label={tag}
                            active={disagreementTags.includes(tag)}
                            disabled={!myCanEdit || !effectiveIsDisputed}
                            onClick={() =>
                              toggleTag(tag, disagreementTags, setDisagreementTags)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    备注输入框
                  </label>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={
                      round === 'ROUND_2'
                        ? '复筛备注；如果和第一轮意见不同，必须写明原因。'
                        : '可选备注；拿不准可简单说明。'
                    }
                    disabled={!myCanEdit}
                    className="mt-2 min-h-[132px] w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void handleSubmit();
                  }}
                  disabled={!canSubmit || isSubmitting}
                  className="mt-4 w-full rounded-[22px] bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting
                    ? canOverrideCurrentRound
                      ? '覆盖中...'
                      : '提交中...'
                    : canOverrideCurrentRound
                    ? '覆盖修改并下一条'
                    : '提交并下一条'}
                </button>
                {requiresDisagreementReason ? (
                  <p className="mt-3 text-sm leading-6 text-amber-700">
                    当前结论和上一轮不同，提交前必须补充分歧原因或备注。
                  </p>
                ) : null}
              </div>

              <details className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                  审核历史
                </summary>
                <div className="mt-4 space-y-3">
                  {currentItem.history.length ? (
                    currentItem.history.map((record) => (
                      <div
                        key={record.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-900">
                            {DECISION_LABELS[record.decision]}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatDateTime(record.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {record.reviewer} · {ROUND_LABELS[record.round]}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {record.note || '无备注'}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-600">当前还没有审核记录。</p>
                  )}
                </div>
              </details>
            </div>
          ) : (
            <div className="mt-4 rounded-[24px] border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-sm leading-7 text-slate-600">
              当前没有正在查看的条目。点击“领取下一条”开始审核，或从左侧队列里手动查看。
            </div>
          )}
        </aside>
      </section>

      {isFocusMode && currentItem ? (
        <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.56)] backdrop-blur-sm">
          <div
            ref={focusPanelRef}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') {
                return;
              }

              const latestCurrentItem = currentItemRef.current;
              const latestPendingDecision = pendingDecisionRef.current;
              const latestRound = roundRef.current;
              const latestReviewer = reviewerRef.current;
              const latestCanSubmit = Boolean(
                latestCurrentItem &&
                  latestPendingDecision &&
                  latestCurrentItem.currentRound === latestRound &&
                  latestCurrentItem.taskStatus === 'IN_PROGRESS' &&
                  latestCurrentItem.lockedBy === latestReviewer,
              );

              if (!latestCanSubmit) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              void submitRef.current();
            }}
            className="absolute inset-4 overflow-hidden rounded-[36px] border border-white/20 bg-[linear-gradient(180deg,#fffdf7_0%,#fff8eb_18%,#f8fafc_100%)] shadow-[0_48px_140px_-48px_rgba(15,23,42,0.72)] outline-none"
          >
            <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.22),transparent_68%)]" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                    Focus Review
                  </p>
                  <h3 className="mt-2 font-display text-3xl tracking-[-0.04em] text-slate-950">
                    {currentItem.card.projectName}
                  </h3>
                </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 md:block">
                      <div>{focusPrimaryLabel}</div>
                      <div className="mt-1">Enter 提交并自动下一条 · Esc 退出放大</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!previousSubmittedReview || previousSubmittedReview.round !== round) {
                          return;
                        }
                        setIsEditingPreviousSubmitted(true);
                        setCurrentItem(previousSubmittedReview.item);
                        setErrorMessage(null);
                        setSuccessMessage(null);
                        focusPanelRef.current?.focus();
                      }}
                      disabled={
                        !previousSubmittedReview ||
                        previousSubmittedReview.round !== round ||
                        isSubmitting
                      }
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      ↑ 回看上一条
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFocusMode(false)}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                    >
                    退出放大
                  </button>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-6 overflow-hidden p-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
                <div className="min-h-0 overflow-y-auto pr-1">
                  <div className="rounded-[32px] border border-amber-200/70 bg-white/86 p-6 shadow-[0_32px_80px_-44px_rgba(180,83,9,0.35)]">
                    <div className="flex flex-wrap gap-2">
                      <FocusPill label={`${currentItem.repository.stars.toLocaleString()} Stars`} />
                      <FocusPill label={FLOW_LABELS[currentItem.flowStatus] ?? currentItem.flowStatus} />
                      <FocusPill label={TASK_STATUS_LABELS[currentItem.taskStatus]} />
                      <FocusPill label={`审核人：${currentItem.lockedBy ?? '未锁定'}`} />
                    </div>
                    <p className="mt-6 font-display text-5xl leading-[1.05] tracking-[-0.05em] text-slate-950">
                      {currentItem.card.oneLiner}
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-2">
                    <FocusField label="目标用户" value={currentItem.card.targetUsers} />
                    <FocusField label="付费方" value={currentItem.card.payer} />
                    <FocusField label="使用场景" value={currentItem.card.useCase} span="xl:col-span-2" />
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-3">
                    <FocusMeta label="分析ID" value={currentItem.analysisId} monospace />
                    <FocusMeta label="仓库ID" value={currentItem.repositoryId} monospace />
                    <FocusMeta label="仓库地址" value={currentItem.repository.htmlUrl} monospace />
                    <FocusMeta
                      label="是否入冷门池"
                      value={currentItem.meta.fitsColdToolPool === null ? '未知' : currentItem.meta.fitsColdToolPool ? '是' : '否'}
                    />
                    <FocusMeta
                      label="真实用户工具"
                      value={currentItem.meta.isRealUserTool === null ? '未知' : currentItem.meta.isRealUserTool ? '是' : '否'}
                    />
                    <FocusMeta label="付费意愿" value={currentItem.meta.willingnessToPay} />
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto pr-1">
                  <div className="space-y-4">
                    <div className="rounded-[28px] border border-slate-200 bg-white/92 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        上一轮结论
                      </p>
                      {currentItem.previousRound ? (
                        <div className="mt-4 space-y-3">
                          <StatusRow
                            label="结论"
                            value={DECISION_LABELS[currentItem.previousRound.decision]}
                          />
                          <StatusRow
                            label="审核员"
                            value={currentItem.previousRound.reviewer}
                          />
                          <StatusRow
                            label="时间"
                            value={formatDateTime(currentItem.previousRound.createdAt)}
                          />
                          <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
                            {currentItem.previousRound.note || '上一轮没有备注。'}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm leading-6 text-slate-600">
                          当前还没有上一轮结论。
                        </p>
                      )}
                    </div>

                    <div className="rounded-[28px] border border-slate-200 bg-white/92 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        当前判断
                      </p>
                      {canOverrideCurrentRound ? (
                        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                          当前是回看修改模式。提交会覆盖你刚才这一轮的判断。
                        </p>
                      ) : null}
                      <div className="mt-4 grid gap-2">
                        {actions.map((action) => (
                          <button
                            key={`focus-${action.decision}`}
                            type="button"
                            onClick={() => {
                              selectPendingDecision(action.decision);
                              focusPanelRef.current?.focus();
                            }}
                            disabled={!myCanEdit}
                            className={`rounded-2xl px-4 py-4 text-left text-sm font-semibold transition ${
                              pendingDecision === action.decision
                                ? action.tone === 'emerald'
                                  ? 'bg-emerald-600 text-white'
                                  : action.tone === 'amber'
                                  ? 'bg-amber-500 text-white'
                                  : action.tone === 'sky'
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-rose-600 text-white'
                                : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50'
                            }`}
                          >
                            <span>{DECISION_LABELS[action.decision]}</span>
                            <span className="ml-2 text-xs opacity-70">
                              {round === 'ROUND_1' && action.decision === 'ROUND_1_REJECT'
                                ? '←'
                                : round === 'ROUND_1' && action.decision === 'ROUND_1_PENDING'
                                ? '↓'
                                : round === 'ROUND_1' && action.decision === 'ROUND_1_KEEP'
                                ? '→'
                                : round === 'ROUND_2' && action.decision === 'ROUND_2_REJECT'
                                ? '←'
                                : round === 'ROUND_2' && action.decision === 'ROUND_2_NEEDS_INFO'
                                ? '↓'
                                : round === 'ROUND_2' && action.decision === 'ROUND_2_KEEP'
                                ? '→'
                                : '鼠标'}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="mt-4">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          备注输入框
                        </label>
                        <textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder={
                            round === 'ROUND_2'
                              ? '复筛备注；如果和第一轮意见不同，必须写明原因。'
                              : '可选备注；拿不准可简单说明。'
                          }
                          disabled={!myCanEdit}
                          className="mt-2 min-h-[148px] w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
                        />
                      </div>

                      {requiresDisagreementReason ? (
                        <p className="mt-3 text-sm leading-6 text-amber-700">
                          当前结论和上一轮不同，提交前必须补充分歧原因或备注。
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200/80 bg-white/88 px-6 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <FocusPill label={focusPrimaryLabel} />
                    <FocusPill label="↑ 回看上一条" />
                    <FocusPill label="Enter 提交并自动下一条" />
                    {round === 'ROUND_2' ? <FocusPill label="Shift + → 强留" /> : null}
                    <FocusPill label="Esc 退出放大" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={currentItem.repository.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                    >
                      打开 GitHub
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCopyRepositoryUrl(currentItem.repository.htmlUrl);
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                    >
                      {copiedUrl === currentItem.repository.htmlUrl ? '已复制地址' : '复制仓库地址'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleSubmit();
                      }}
                      disabled={!canSubmit || isSubmitting}
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting
                        ? canOverrideCurrentRound
                          ? '覆盖中...'
                          : '提交中...'
                        : canOverrideCurrentRound
                        ? '覆盖修改并下一条'
                        : '提交并下一条'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TopStatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}

function QueueEmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-300 bg-white/70 px-4 py-5 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function FieldCard({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className={`mt-3 text-sm leading-7 text-slate-900 ${monospace ? 'font-mono text-[13px]' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function AuxField({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="rounded-[20px] bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-sm text-slate-800 ${monospace ? 'font-mono text-[13px]' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function InfoBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
      {label}
    </span>
  );
}

function FocusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-sm font-medium text-amber-900">
      {label}
    </span>
  );
}

function FocusField({
  label,
  value,
  span,
}: {
  label: string;
  value: string;
  span?: string;
}) {
  return (
    <div className={`rounded-[28px] border border-slate-200 bg-white/92 p-5 shadow-[0_24px_54px_-40px_rgba(15,23,42,0.24)] ${span ?? ''}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-4 text-base leading-8 text-slate-800">{value}</p>
    </div>
  );
}

function FocusMeta({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/80 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className={`mt-3 text-sm leading-7 text-slate-800 ${monospace ? 'font-mono text-[13px]' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-slate-950 text-white'
          : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
      }`}
    >
      {label}
    </button>
  );
}

function TagButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-emerald-600 text-white'
          : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

function ShortcutRow({ label, hotkey }: { label: string; hotkey: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <span>{label}</span>
      <kbd className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
        {hotkey}
      </kbd>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: 'emerald' | 'rose' | 'amber';
  children: ReactNode;
}) {
  const className =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'rose'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <div className={`rounded-[22px] border px-4 py-3 text-sm font-medium ${className}`}>
      {children}
    </div>
  );
}
