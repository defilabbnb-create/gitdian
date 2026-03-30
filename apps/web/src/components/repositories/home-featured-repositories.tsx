'use client';

import Link from 'next/link';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  explainBehaviorRecommendation,
  scoreBehaviorRecommendation,
  type BehaviorMemoryProfile,
  type BehaviorRecommendationExplanation,
  type BehaviorRecommendationScore,
} from 'shared';
import { createFavorite, updateFavorite } from '@/lib/api/favorites';
import {
  appendActionLog,
  createOrMergeActionLoopEntry,
  getExecutionStatusLabel,
  getExecutionStatusTone,
  getFollowUpStageLabel,
  getFollowUpStageTone,
  readActionLoopEntries,
  subscribeActionLoop,
  type ActionLoopEntry,
} from '@/lib/action-loop';
import {
  getBehaviorMemoryProfile,
  subscribeBehaviorMemory,
  trackBehaviorMemoryUsage,
} from '@/lib/behavior-memory';
import {
  detectRepositoryConflicts,
  detectRepositoryConflictsBatch,
  type RepositoryDataGuardResult,
} from '@/lib/repository-data-guard';
import {
  getActionTone,
  getRepositoryActionBehaviorContext,
  getRepositoryDecisionConflictAudit,
  getRepositoryDecisionSummary,
  getRepositoryHeadlineValidation,
  getRepositoryOneLinerStrength,
  hasStrongHomepageHeadline,
  isRepositoryDecisionLowConfidence,
  isStructurallyWeakHomepageCandidate,
  shouldDegradeHomepageHeadline,
  validateRepositoryHeadlineBatch,
} from '@/lib/repository-decision';
import {
  buildRepositoryDecisionViewModel,
  type RepositoryDecisionViewModel,
  type RepositoryDecisionCtaIntent,
} from '@/lib/repository-decision-view-model';
import { buildHomeEmptyStateViewModel } from '@/lib/home-empty-state-view-model';
import { RepositoryListItem } from '@/lib/types/repository';

type HomeFeaturedRepositoriesProps = {
  items: RepositoryListItem[];
};

type Candidate = {
  repository: RepositoryListItem;
  summary: ReturnType<typeof getRepositoryDecisionSummary>;
  decisionView: RepositoryDecisionViewModel;
  headline: string;
  isLowConfidence: boolean;
  isStructurallyWeak: boolean;
  hasUnclearUser: boolean;
  looksInfraLike: boolean;
  projectType: string | null;
  hasRealUser: boolean;
  hasClearUseCase: boolean;
  isDirectlyMonetizable: boolean;
  isStrongHeadline: boolean;
  oneLinerStrength: string | null;
  hasDisplayConflict: boolean;
  guard: RepositoryDataGuardResult;
  actionEntry: ActionLoopEntry | null;
  actionStatus: ActionLoopEntry['actionStatus'];
  followUpStage: ActionLoopEntry['followUpStage'];
  behaviorContext: ReturnType<typeof getRepositoryActionBehaviorContext>;
  behaviorRecommendation: BehaviorRecommendationScore;
  behaviorExplanation: BehaviorRecommendationExplanation;
};

type HomepageSelection = {
  top1: Candidate | null;
  top3: Candidate[];
  newOpportunities: Candidate[];
  profile: BehaviorMemoryProfile;
  selectionMode: 'trusted' | 'provisional' | 'empty';
};

export function HomeFeaturedRepositories({
  items,
}: HomeFeaturedRepositoriesProps) {
  const [actionEntries, setActionEntries] = useState<ActionLoopEntry[]>([]);
  const [memoryProfile, setMemoryProfile] = useState<BehaviorMemoryProfile>(() =>
    getBehaviorMemoryProfile(),
  );
  const trackedSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const sync = () => setActionEntries(readActionLoopEntries());
    sync();
    return subscribeActionLoop(sync);
  }, []);

  useEffect(() => {
    const sync = () => setMemoryProfile(getBehaviorMemoryProfile());
    sync();
    return subscribeBehaviorMemory(sync);
  }, []);

  const actionMap = useMemo(
    () => new Map(actionEntries.map((entry) => [entry.repoId, entry])),
    [actionEntries],
  );
  const selection = useMemo(
    () => selectHomepageDecisionTerminal(items, actionMap, memoryProfile),
    [items, actionMap, memoryProfile],
  );

  useEffect(() => {
    const renderedCount =
      (selection.top1 ? 1 : 0) +
      selection.top3.length +
      selection.newOpportunities.length;
    const influencedCount = [
      selection.top1,
      ...selection.top3,
      ...selection.newOpportunities,
    ]
      .filter((item): item is Candidate => Boolean(item))
      .filter((item) => item.behaviorExplanation.influenced).length;
    const signature = [
      selection.top1?.repository.id ?? 'none',
      selection.top3.map((item) => item.repository.id).join(','),
      selection.newOpportunities.map((item) => item.repository.id).join(','),
      influencedCount,
    ].join('|');

    if (trackedSignatureRef.current === signature) {
      return;
    }

    trackedSignatureRef.current = signature;

    trackBehaviorMemoryUsage({
      lookups: items.length,
      hits: influencedCount,
      adjusted: influencedCount,
      explainRendered: renderedCount,
      explainVisible: influencedCount,
    });
  }, [items.length, selection]);

  if (!selection.top1) {
    return null;
  }

  const top1 = selection.top1;
  const isProvisionalSelection = selection.selectionMode === 'provisional';
  const top1Reason = top1.decisionView.display.reason;
  const top1Users = sanitizeTopSignalValue(
    top1.decisionView.display.targetUsersLabel,
    '目标用户已经比较明确，进详情页确认细分人群。',
  );
  const top1Monetization = top1.decisionView.display.homepageMonetizationLabel;

  return (
    <section className="space-y-6 overflow-hidden rounded-[40px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(248,250,252,0.98)_100%)] p-6 shadow-lg shadow-slate-900/5 backdrop-blur md:p-8">
      <div className="max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          今天最该推进
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 md:text-[3.2rem]">
          {isProvisionalSelection ? '今天先补这一个。' : '今天先做这一个。'}
        </h1>
        {selection.profile.preferredCategories.length ||
        selection.profile.avoidedCategories.length ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            {selection.profile.preferredCategories.slice(0, 2).map((item) => (
              <span
                key={`preferred-${item}`}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700"
              >
                做成过 · {item}
              </span>
            ))}
            {selection.profile.avoidedCategories.slice(0, 2).map((item) => (
              <span
                key={`avoided-${item}`}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700"
              >
                先避开 · {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <article className="rounded-[36px] border border-slate-300 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_55%,_rgba(15,23,42,0.92)_100%)] p-7 text-white shadow-xl shadow-slate-900/10 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Top 1
        </p>
        <Link
          href={`/repositories/${top1.repository.id}`}
          className="mt-4 block text-4xl font-semibold leading-tight tracking-tight text-white transition hover:text-slate-100 md:text-[3.15rem]"
        >
          {top1.headline}
        </Link>
        <p className="mt-4 text-lg font-semibold text-amber-200">
          {isProvisionalSelection
            ? '这是今天最值得先补证据的候选'
            : '这是今天最值得先做的项目'}
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span
            className={`rounded-full border px-3 py-1 ${getExecutionStatusTone(
              top1.actionStatus,
            )}`}
          >
            当前状态 · {getExecutionStatusLabel(top1.actionStatus)}
          </span>
          <span
            className={`rounded-full border px-3 py-1 ${getFollowUpStageTone(
              top1.followUpStage,
            )}`}
          >
            当前阶段 · {getFollowUpStageLabel(top1.followUpStage)}
          </span>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <TopSignal label="用户是谁" value={top1Users} />
          <TopSignal
            label={isProvisionalSelection ? '为什么先看它' : '为什么值得做'}
            value={top1Reason}
          />
          <TopSignal label="能不能收费" value={top1Monetization} />
        </div>

        {top1.behaviorExplanation.influenced ? (
          <div className="mt-5 space-y-3 rounded-[24px] border border-slate-700 bg-white/5 px-4 py-3">
            <p className="text-sm leading-7 text-slate-200">
              {top1.behaviorExplanation.summary}
            </p>
            <RecommendationBreakdownChips
              breakdown={top1.behaviorExplanation.explainBreakdown}
              dark
            />
          </div>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={`/repositories/${top1.repository.id}`}
            className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            立即查看详情
          </Link>
          <a
            href={top1.repository.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-full border border-slate-500 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-300 hover:bg-white/5"
          >
            查看 GitHub
          </a>
        </div>

        <HomepageTopActionStrip candidate={top1} />
      </article>

      {selection.top3.length ? (
        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Top 2-4
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {isProvisionalSelection
                ? '接下来优先补证据的 3 个候选'
                : '接下来直接验证的 3 个机会'}
            </h2>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {selection.top3.map((item, index) => (
              <article
                key={item.repository.id}
                className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Top {index + 2}
                </p>
                <Link
                  href={`/repositories/${item.repository.id}`}
                  className="mt-3 block text-xl font-semibold leading-8 tracking-tight text-slate-950 transition hover:text-slate-700"
                >
                  {item.headline}
                </Link>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                  {item.decisionView.display.reason}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                  <span
                    className={`rounded-full border px-3 py-1 ${getActionTone(
                      item.decisionView.action.toneKey,
                    )}`}
                  >
                    {item.decisionView.display.actionLabel}
                  </span>
                </div>
                {item.behaviorExplanation.influenced ? (
                  <div className="mt-3 space-y-2">
                    <p className="line-clamp-2 text-xs leading-6 text-slate-500">
                      {item.behaviorExplanation.summary}
                    </p>
                    <RecommendationBreakdownChips
                      breakdown={item.behaviorExplanation.explainBreakdown}
                    />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function TopSignal({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-700 bg-white/5 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-base font-semibold leading-7 text-white">{value}</p>
    </div>
  );
}

function HomepageTopActionStrip({
  candidate,
}: {
  candidate: Candidate;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const status = candidate.actionStatus;
  const isActiveFollowUp = candidate.actionEntry?.isActiveFollowUp ?? false;

  const entryBase = useMemo(
    () => ({
      repoId: candidate.repository.id,
      repositoryName: candidate.repository.name,
      repositoryFullName: candidate.repository.fullName,
      htmlUrl: candidate.repository.htmlUrl,
      detailPath: `/repositories/${candidate.repository.id}`,
      headline: candidate.headline,
      reason: candidate.decisionView.display.reason,
      categoryLabel: candidate.behaviorContext.categoryLabel,
      projectType: candidate.behaviorContext.projectType,
      targetUsersLabel: candidate.behaviorContext.targetUsersLabel,
      useCaseLabel: candidate.behaviorContext.useCaseLabel,
      patternKeys: candidate.behaviorContext.patternKeys,
      hasRealUser: candidate.behaviorContext.hasRealUser,
      hasClearUseCase: candidate.behaviorContext.hasClearUseCase,
      isDirectlyMonetizable: candidate.behaviorContext.isDirectlyMonetizable,
    }),
    [candidate],
  );

  function handleKeepAsReference() {
    setErrorMessage(null);
    setFeedback(null);
    createOrMergeActionLoopEntry(entryBase, {
      actionStatus: 'NOT_STARTED',
      followUpStage: 'OBSERVE',
      isActiveFollowUp: false,
      source: 'manual_click',
      confidence: 'medium',
    });
    setFeedback('已按仅供参考处理，后面有新信号再回看。');
  }

  function handleIntent(intent: RepositoryDecisionCtaIntent) {
    if (intent === 'start') {
      return handleStart();
    }

    if (intent === 'follow_up') {
      return handleFollowUp();
    }

    if (intent === 'validate') {
      return handleValidate();
    }

    return handleKeepAsReference();
  }

  async function handleStart() {
    setErrorMessage(null);
    setFeedback(null);

    if (status === 'IN_PROGRESS' || status === 'VALIDATING') {
      router.push(`/repositories/${candidate.repository.id}#next-steps`);
      return;
    }

    createOrMergeActionLoopEntry(entryBase, {
      actionStatus: 'IN_PROGRESS',
      followUpStage: 'TRY',
      isActiveFollowUp,
      source: 'manual_click',
      confidence: 'medium',
    });
    appendActionLog('start_project_clicked', candidate.repository.id);
    setFeedback('已经切到进行中，现在去详情页继续推进。');
    startTransition(() => {
      router.push(`/repositories/${candidate.repository.id}#next-steps`);
    });
  }

  async function handleFollowUp() {
    setIsSubmitting(true);
    setErrorMessage(null);
    setFeedback(null);

    createOrMergeActionLoopEntry(entryBase, {
      actionStatus: status === 'DROPPED' ? 'NOT_STARTED' : status,
      followUpStage: candidate.actionEntry?.followUpStage ?? 'OBSERVE',
      isActiveFollowUp: true,
      source: 'manual_click',
      confidence: 'medium',
    });
    appendActionLog('follow_up_added', candidate.repository.id);

    try {
      if (!candidate.repository.isFavorited) {
        await createFavorite({
          repositoryId: candidate.repository.id,
          priority: 'HIGH',
          note: '正在推进，下一步先确认用户、场景和收费路径。',
        });
      } else {
        await updateFavorite(candidate.repository.id, {
          priority: 'HIGH',
        });
      }

      setFeedback('已加入跟进列表，现在可以去收藏页继续推进。');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `已加入跟进列表，但收藏同步失败：${error.message}`
          : '已加入跟进列表，但收藏同步失败，请稍后再试。',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleValidate() {
    setErrorMessage(null);
    setFeedback(null);
    createOrMergeActionLoopEntry(entryBase, {
      actionStatus: 'VALIDATING',
      followUpStage: 'VALIDATE',
      isActiveFollowUp,
      source: 'manual_click',
      confidence: 'medium',
    });
    appendActionLog('quick_validate_clicked', candidate.repository.id);
    setFeedback('已切到验证中，现在先去 README 看最关键的验证点。');
    window.open(
      `${candidate.repository.htmlUrl}#readme-ov-file`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <div className="mt-5 space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-300">现在就开始：</span>
        <button
          type="button"
          onClick={() => handleIntent(candidate.decisionView.cta.primary.intent)}
          className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 font-semibold text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/20"
        >
          {candidate.decisionView.cta.primary.title}
        </button>
        <button
          type="button"
          onClick={() => handleIntent(candidate.decisionView.cta.tertiary.intent)}
          disabled={isSubmitting || (isActiveFollowUp && candidate.decisionView.cta.tertiary.intent === 'follow_up')}
          className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-500/10 px-4 py-2 font-semibold text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {candidate.decisionView.cta.tertiary.intent === 'follow_up' && isActiveFollowUp
            ? '已加入跟进'
            : candidate.decisionView.cta.tertiary.title}
        </button>
        <button
          type="button"
          onClick={() => handleIntent(candidate.decisionView.cta.secondary.intent)}
          className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2 font-semibold text-amber-100 transition hover:border-amber-300 hover:bg-amber-500/20"
        >
          {candidate.decisionView.cta.secondary.title}
        </button>
      </div>
      {feedback ? (
        <p className="text-sm font-medium text-emerald-200">{feedback}</p>
      ) : null}
      {errorMessage ? (
        <p className="text-sm font-medium text-rose-200">{errorMessage}</p>
      ) : null}
    </div>
  );
}

function RecommendationBreakdownChips({
  breakdown,
  dark = false,
}: {
  breakdown: BehaviorRecommendationExplanation['explainBreakdown'];
  dark?: boolean;
}) {
  const chipClass = dark
    ? 'border-slate-700 bg-slate-900/40 text-slate-200'
    : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
      <span className={`rounded-full border px-3 py-1 ${chipClass}`}>
        行为 {formatBreakdownWeight(breakdown.behaviorWeight)}
      </span>
      <span className={`rounded-full border px-3 py-1 ${chipClass}`}>
        收费 {formatBreakdownWeight(breakdown.monetizationWeight)}
      </span>
      <span className={`rounded-full border px-3 py-1 ${chipClass}`}>
        落地 {formatBreakdownWeight(breakdown.strengthWeight)}
      </span>
      <span className={`rounded-full border px-3 py-1 ${chipClass}`}>
        时效 {formatBreakdownWeight(breakdown.freshnessWeight)}
      </span>
    </div>
  );
}

export function selectHomepageDecisionTerminal(
  items: RepositoryListItem[],
  actionMap: Map<string, ActionLoopEntry>,
  profile: BehaviorMemoryProfile,
): HomepageSelection {
  const headlineValidations = validateRepositoryHeadlineBatch(items);
  const guardResults = detectRepositoryConflictsBatch(items);
  const seededCandidates = items
    .map((repository) =>
      buildCandidate(
        repository,
        headlineValidations.get(repository.id) ?? null,
        guardResults.get(repository.id) ?? null,
        actionMap.get(repository.id) ?? null,
        profile,
      ),
    )
    .filter((candidate): candidate is Candidate => candidate !== null);

  const strictCandidates = seededCandidates
    .filter((candidate) => passesHomepageTerminalGuard(candidate))
    .sort((left, right) => compareCandidates(left, right));
  const provisionalCandidates = seededCandidates
    .filter((candidate) => passesHomepageProvisionalFallbackGuard(candidate))
    .sort((left, right) => compareCandidates(left, right));
  const strictSelection = buildHomepageSelection(strictCandidates, profile);
  if (strictSelection.top1) {
    return {
      ...strictSelection,
      selectionMode: 'trusted',
    };
  }

  const provisionalSelection = buildHomepageSelection(
    provisionalCandidates,
    profile,
  );
  if (provisionalSelection.top1) {
    return {
      ...provisionalSelection,
      selectionMode: 'provisional',
    };
  }

  return {
    ...strictSelection,
    profile,
    selectionMode: 'empty',
  };
}

function buildHomepageSelection(
  candidates: Candidate[],
  profile: BehaviorMemoryProfile,
) {
  const activeTop1 =
    candidates.find(
      (candidate) =>
        (candidate.actionStatus === 'IN_PROGRESS' ||
          candidate.actionStatus === 'VALIDATING') &&
        isSecondaryCandidate(candidate),
    ) ?? null;
  const strictTop1 = candidates.find((candidate) => isTop1Candidate(candidate)) ?? null;
  const top1 =
    activeTop1 ??
    strictTop1 ??
    candidates.find((candidate) => isSecondaryCandidate(candidate)) ??
    null;

  const secondaryPool = candidates.filter(
    (candidate) =>
      candidate.repository.id !== top1?.repository.id &&
      isSecondaryCandidate(candidate),
  );
  const newOpportunities = candidates.filter(
    (candidate) =>
      candidate.repository.id !== top1?.repository.id &&
      !secondaryPool
        .slice(0, 3)
        .some((secondary) => secondary.repository.id === candidate.repository.id) &&
      candidate.actionStatus === 'NOT_STARTED' &&
      !candidate.behaviorRecommendation.blocked,
  );

  return {
    top1,
    top3: secondaryPool.slice(0, 3),
    newOpportunities: newOpportunities.slice(0, 3),
    profile,
  };
}

function buildCandidate(
  repository: RepositoryListItem,
  validation: ReturnType<typeof getRepositoryHeadlineValidation> | null,
  guard: RepositoryDataGuardResult | null,
  actionEntry: ActionLoopEntry | null,
  profile: BehaviorMemoryProfile,
): Candidate | null {
  const summary = getRepositoryDecisionSummary(repository);
  const decisionView = buildRepositoryDecisionViewModel(repository, { summary });
  const headline = decisionView.display.homepageHeadline;
  const signals = repository.analysis?.moneyPriority?.signals;
  const projectType = repository.finalDecision?.projectType ?? signals?.projectType ?? null;
  const isLowConfidence = isRepositoryDecisionLowConfidence(repository, summary);
  const isStructurallyWeak = isStructurallyWeakHomepageCandidate(
    repository,
    summary,
  );
  const hasUnclearUser =
    summary.targetUsersLabel.includes('不够清楚') ||
    summary.targetUsersLabel.includes('待确认') ||
    summary.targetUsersLabel.includes('无法识别用户');
  const looksInfraLike =
    projectType === 'infra' ||
    summary.categoryLabel.includes('基础设施') ||
    summary.moneyPriority.projectTypeLabel.includes('基础设施');
  const oneLinerStrength = getRepositoryOneLinerStrength(repository);
  const isStrongHeadline = hasStrongHomepageHeadline(repository, summary);
  const conflictAudit = getRepositoryDecisionConflictAudit(repository, summary);
  const behaviorContext = getRepositoryActionBehaviorContext(repository, summary);
  const resolvedGuard =
    guard ??
    detectRepositoryConflicts(repository, { summary });
  const behaviorRecommendation = scoreBehaviorRecommendation(
    {
      repoId: repository.id,
      categoryLabel: behaviorContext.categoryLabel,
      projectType: behaviorContext.projectType,
      targetUsersLabel: behaviorContext.targetUsersLabel,
      useCaseLabel: behaviorContext.useCaseLabel,
      patternKeys: behaviorContext.patternKeys,
      hasRealUser: behaviorContext.hasRealUser,
      hasClearUseCase: behaviorContext.hasClearUseCase,
      isDirectlyMonetizable: behaviorContext.isDirectlyMonetizable,
      currentActionStatus: actionEntry?.actionStatus ?? 'NOT_STARTED',
      strengthWeightHint: getStrengthWeightHint(oneLinerStrength),
      monetizationWeightHint: getMonetizationWeightHint(
        summary.source,
        behaviorContext.isDirectlyMonetizable,
      ),
      freshnessWeightHint: getFreshnessWeightHint(repository.createdAtGithub),
    },
    profile,
  );
  const behaviorExplanation = explainBehaviorRecommendation(
    {
      repoId: repository.id,
      categoryLabel: behaviorContext.categoryLabel,
      projectType: behaviorContext.projectType,
      targetUsersLabel: behaviorContext.targetUsersLabel,
      useCaseLabel: behaviorContext.useCaseLabel,
      patternKeys: behaviorContext.patternKeys,
      hasRealUser: behaviorContext.hasRealUser,
      hasClearUseCase: behaviorContext.hasClearUseCase,
      isDirectlyMonetizable: behaviorContext.isDirectlyMonetizable,
      currentActionStatus: actionEntry?.actionStatus ?? 'NOT_STARTED',
      strengthWeightHint: getStrengthWeightHint(oneLinerStrength),
      monetizationWeightHint: getMonetizationWeightHint(
        summary.source,
        behaviorContext.isDirectlyMonetizable,
      ),
      freshnessWeightHint: getFreshnessWeightHint(repository.createdAtGithub),
    },
    profile,
    behaviorRecommendation,
  );

  return {
    repository,
    summary,
    decisionView,
    headline,
    isLowConfidence,
    isStructurallyWeak,
    hasUnclearUser,
    looksInfraLike,
    projectType,
    hasRealUser: Boolean(signals?.hasRealUser),
    hasClearUseCase: Boolean(signals?.hasClearUseCase),
    isDirectlyMonetizable: Boolean(signals?.isDirectlyMonetizable),
    isStrongHeadline,
    oneLinerStrength,
    hasDisplayConflict: conflictAudit.hasConflict || Boolean(validation?.changed),
    guard: resolvedGuard,
    actionEntry,
    actionStatus: actionEntry?.actionStatus ?? 'NOT_STARTED',
    followUpStage: actionEntry?.followUpStage ?? 'OBSERVE',
    behaviorContext,
    behaviorRecommendation,
    behaviorExplanation,
  };
}

function isTop1Candidate(candidate: Candidate) {
  return (
    (candidate.summary.moneyPriority.tier === 'P0' ||
      candidate.summary.moneyPriority.tier === 'P1') &&
    candidate.summary.verdict === 'GOOD' &&
    candidate.summary.action === 'BUILD' &&
    candidate.summary.source !== 'fallback' &&
    candidate.projectType !== 'demo' &&
    candidate.projectType !== 'model' &&
    candidate.projectType !== 'infra' &&
    !candidate.isLowConfidence &&
    !candidate.isStructurallyWeak &&
    !candidate.hasUnclearUser &&
    !candidate.looksInfraLike &&
    candidate.hasRealUser &&
    candidate.hasClearUseCase &&
    candidate.isDirectlyMonetizable &&
    candidate.oneLinerStrength === 'STRONG' &&
    candidate.isStrongHeadline
  );
}

function isSecondaryCandidate(candidate: Candidate) {
  const allowsInfraException =
    candidate.looksInfraLike &&
    candidate.summary.moneyPriority.tier !== 'P3' &&
    candidate.summary.verdict === 'GOOD' &&
    candidate.summary.action !== 'IGNORE' &&
    candidate.hasRealUser &&
    candidate.hasClearUseCase &&
    candidate.isDirectlyMonetizable &&
    candidate.oneLinerStrength === 'STRONG';

  return (
    (candidate.summary.moneyPriority.tier === 'P0' ||
      candidate.summary.moneyPriority.tier === 'P1' ||
      candidate.summary.moneyPriority.tier === 'P2') &&
    candidate.summary.source !== 'fallback' &&
    candidate.summary.action !== 'IGNORE' &&
    candidate.projectType !== 'demo' &&
    candidate.projectType !== 'model' &&
    !candidate.isLowConfidence &&
    !candidate.isStructurallyWeak &&
    !candidate.hasUnclearUser &&
    (!candidate.looksInfraLike || allowsInfraException) &&
    candidate.isStrongHeadline
  );
}

function passesHomepageTerminalGuard(candidate: Candidate) {
  if (
    candidate.actionStatus === 'COMPLETED' ||
    candidate.actionStatus === 'DROPPED'
  ) {
    return false;
  }

  if (candidate.decisionView.displayState !== 'trusted') {
    return false;
  }

  if (candidate.guard.hideFromHomepage) {
    return false;
  }

  if (
    candidate.behaviorRecommendation.blocked &&
    candidate.actionStatus !== 'IN_PROGRESS' &&
    candidate.actionStatus !== 'VALIDATING'
  ) {
    return false;
  }

  if (hasLowValueHomepageSignal(candidate.summary)) {
    return false;
  }

  if (
    candidate.summary.moneyPriority.tier === 'P3' ||
    candidate.summary.source === 'fallback' ||
    candidate.summary.action === 'IGNORE'
  ) {
    return false;
  }

  if (
    !candidate.hasRealUser ||
    !candidate.hasClearUseCase ||
    !candidate.isDirectlyMonetizable ||
    candidate.hasUnclearUser ||
    candidate.isLowConfidence ||
    candidate.isStructurallyWeak ||
    shouldDegradeHomepageHeadline(candidate.repository, candidate.summary)
  ) {
    return false;
  }

  if (candidate.hasDisplayConflict) {
    return false;
  }

  if (
    candidate.summary.categoryLabel === '待分类' ||
    candidate.projectType === 'demo' ||
    candidate.projectType === 'model' ||
    candidate.projectType === 'infra' ||
    candidate.headline.startsWith('这个项目')
  ) {
    return false;
  }

  if (candidate.looksInfraLike) {
    return false;
  }

  return true;
}

function passesHomepageProvisionalFallbackGuard(candidate: Candidate) {
  if (
    candidate.actionStatus === 'COMPLETED' ||
    candidate.actionStatus === 'DROPPED'
  ) {
    return false;
  }

  if (candidate.decisionView.displayState !== 'provisional') {
    return false;
  }

  if (
    candidate.behaviorRecommendation.blocked &&
    candidate.actionStatus !== 'IN_PROGRESS' &&
    candidate.actionStatus !== 'VALIDATING'
  ) {
    return false;
  }

  if (hasLowValueHomepageSignal(candidate.summary)) {
    return false;
  }

  if (
    (candidate.summary.moneyPriority.tier !== 'P0' &&
      candidate.summary.moneyPriority.tier !== 'P1') ||
    candidate.summary.source === 'fallback' ||
    candidate.summary.action === 'IGNORE'
  ) {
    return false;
  }

  if (
    !candidate.hasRealUser ||
    !candidate.hasClearUseCase ||
    !candidate.isDirectlyMonetizable ||
    candidate.hasUnclearUser ||
    candidate.isLowConfidence ||
    candidate.isStructurallyWeak
  ) {
    return false;
  }

  if (
    candidate.projectType === 'demo' ||
    candidate.projectType === 'model' ||
    candidate.projectType === 'infra' ||
    candidate.looksInfraLike
  ) {
    return false;
  }

  if (
    candidate.oneLinerStrength === 'WEAK' ||
    (!candidate.isStrongHeadline &&
      candidate.summary.moneyPriority.tier !== 'P0') ||
    candidate.hasDisplayConflict
  ) {
    return false;
  }

  if (
    candidate.guard.fallback ||
    candidate.guard.snapshotConflict ||
    candidate.guard.severeConflict ||
    candidate.guard.weakStrength
  ) {
    return false;
  }

  return true;
}

function compareCandidates(left: Candidate, right: Candidate) {
  const actionDelta =
    getActionPriorityWeight(right.actionStatus) -
    getActionPriorityWeight(left.actionStatus);

  if (actionDelta !== 0) {
    return actionDelta;
  }

  const behaviorDelta =
    right.behaviorRecommendation.score - left.behaviorRecommendation.score;

  if (behaviorDelta !== 0) {
    return behaviorDelta;
  }

  const moneyDelta = right.summary.moneyPriority.score - left.summary.moneyPriority.score;

  if (moneyDelta !== 0) {
    return moneyDelta;
  }

  const buildDelta =
    (right.summary.action === 'BUILD' ? 1 : 0) -
    (left.summary.action === 'BUILD' ? 1 : 0);

  if (buildDelta !== 0) {
    return buildDelta;
  }

  return right.repository.stars - left.repository.stars;
}

function getStrengthWeightHint(oneLinerStrength: string | null) {
  if (oneLinerStrength === 'STRONG') {
    return 1.6;
  }

  if (oneLinerStrength === 'MEDIUM') {
    return 0.6;
  }

  return -1.1;
}

function getMonetizationWeightHint(
  source: Candidate['summary']['source'],
  isDirectlyMonetizable: boolean,
) {
  if (source === 'fallback') {
    return -1.5;
  }

  return isDirectlyMonetizable ? 1.4 : -1.2;
}

function getFreshnessWeightHint(createdAtGithub?: string | null) {
  if (!createdAtGithub) {
    return 0;
  }

  const ageDays =
    (Date.now() - new Date(createdAtGithub).getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays <= 7) {
    return 1.2;
  }

  if (ageDays <= 30) {
    return 0.6;
  }

  return 0;
}

function formatBreakdownWeight(value: number) {
  const normalized = Math.round(value * 10) / 10;
  return normalized > 0 ? `+${normalized}` : `${normalized}`;
}

function sanitizeTopSignalValue(value: string, fallback: string) {
  const normalized = value.trim();

  if (!normalized) {
    return fallback;
  }

  const englishTokens = normalized.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [];
  const asciiLetters = (normalized.match(/[A-Za-z]/g) ?? []).length;
  const cjkChars = (normalized.match(/[\u4e00-\u9fff]/g) ?? []).length;

  if (
    englishTokens.length >= 2 ||
    (englishTokens.length >= 1 && asciiLetters >= 8 && asciiLetters >= cjkChars)
  ) {
    return fallback;
  }

  return normalized;
}

function hasLowValueHomepageSignal(summary: Candidate['summary']) {
  const combined = [
    summary.judgementLabel,
    summary.finalDecisionLabel,
    summary.recommendedMoveLabel,
    summary.worthDoingLabel,
  ]
    .filter(Boolean)
    .join(' ');

  return /现在直接跳过|值得借鉴.?忽略|忽略|先跳过|低优先|先观察|稍后再看/.test(
    combined,
  );
}

function getActionPriorityWeight(status: Candidate['actionStatus']) {
  if (status === 'VALIDATING') {
    return 3;
  }

  if (status === 'IN_PROGRESS') {
    return 2;
  }

  return 0;
}

export function HomeNewOpportunitiesStrip({
  items,
}: HomeFeaturedRepositoriesProps) {
  const [actionEntries, setActionEntries] = useState<ActionLoopEntry[]>([]);
  const [memoryProfile, setMemoryProfile] = useState<BehaviorMemoryProfile>(() =>
    getBehaviorMemoryProfile(),
  );

  useEffect(() => {
    const sync = () => setActionEntries(readActionLoopEntries());
    sync();
    return subscribeActionLoop(sync);
  }, []);

  useEffect(() => {
    const sync = () => setMemoryProfile(getBehaviorMemoryProfile());
    sync();
    return subscribeBehaviorMemory(sync);
  }, []);

  const actionMap = useMemo(
    () => new Map(actionEntries.map((entry) => [entry.repoId, entry])),
    [actionEntries],
  );
  const selection = useMemo(
    () => selectHomepageDecisionTerminal(items, actionMap, memoryProfile),
    [items, actionMap, memoryProfile],
  );
  const emptyStateView = useMemo(
    () =>
      buildHomeEmptyStateViewModel({
        trackedCandidates: [selection.top1, ...selection.top3]
          .filter((item): item is Candidate => Boolean(item))
          .map((item) => ({
            isFavorited: item.repository.isFavorited,
            actionStatus: item.actionStatus,
          })),
      }),
    [selection],
  );

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/90 px-5 py-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          新机会
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          {selection.selectionMode === 'provisional'
            ? '这些方向还没到高信任结论，但值得先补一轮证据。'
            : '已经自动避开你验证失败的方向，剩下这些值得新开一轮判断。'}
        </h2>
      </div>

      {selection.newOpportunities.length ? (
        <div className="mt-5 grid gap-3 xl:grid-cols-3">
          {selection.newOpportunities.map((item) => (
            <article
              key={item.repository.id}
              className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4"
            >
              <Link
                href={`/repositories/${item.repository.id}`}
                className="text-lg font-semibold tracking-tight text-slate-950 transition hover:text-slate-700"
              >
                {item.headline}
              </Link>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                {item.decisionView.display.reason}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span
                  className={`rounded-full border px-3 py-1 ${getActionTone(
                    item.decisionView.action.toneKey,
                  )}`}
                >
                  {item.decisionView.display.actionLabel}
                </span>
              </div>
              {item.behaviorExplanation.influenced ? (
                <div className="mt-3 space-y-2">
                  <p className="line-clamp-2 text-xs leading-6 text-slate-500">
                    {item.behaviorExplanation.summary}
                  </p>
                  <RecommendationBreakdownChips
                    breakdown={item.behaviorExplanation.explainBreakdown}
                  />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <section
          data-home-empty-state="true"
          className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-5"
        >
          <p className="text-sm font-semibold text-slate-900">
            {emptyStateView.statusLabel}
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            {emptyStateView.guidanceLabel}
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={emptyStateView.primaryAction.href}
              data-home-empty-primary-cta="true"
              className="inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {emptyStateView.primaryAction.label}
            </Link>
            <p className="max-w-xl text-sm leading-6 text-slate-500">
              {emptyStateView.primaryAction.description}
            </p>
          </div>
        </section>
      )}
    </section>
  );
}
