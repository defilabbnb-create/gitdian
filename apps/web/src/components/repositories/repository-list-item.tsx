import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  detectRepositoryConflicts,
  type RepositoryDataGuardResult,
} from '@/lib/repository-data-guard';
import {
  getActionTone,
  getRepositoryAnalysisLayerLabel,
  getRepositoryClaudeReviewLabel,
  getRepositoryHeadlineValidation,
  getRepositoryDisplayMonetizationLabel,
  getRepositoryDisplayTargetUsersLabel,
  getMoneyPriorityTone,
  getRepositoryDecisionSummary,
  isRepositoryDecisionLowConfidence,
  type RepositoryHeadlineValidation,
} from '@/lib/repository-decision';
import { RepositoryListItem, RepositoryListQueryState } from '@/lib/types/repository';
import { FavoriteToggleButton } from './favorite-toggle-button';

type RepositoryListItemProps = {
  repository: RepositoryListItem;
  query: RepositoryListQueryState;
  variant?: 'default' | 'featured';
  headlineValidation?: RepositoryHeadlineValidation;
  dataGuard?: RepositoryDataGuardResult;
};

export function RepositoryListItemCard({
  repository,
  query,
  variant = 'default',
  headlineValidation,
  dataGuard,
}: RepositoryListItemProps) {
  const decisionSummary = getRepositoryDecisionSummary(repository);
  const validation =
    headlineValidation ?? getRepositoryHeadlineValidation(repository, decisionSummary);
  const guard =
    dataGuard ??
    detectRepositoryConflicts(repository, {
      summary: decisionSummary,
    });
  const isLowConfidence = isRepositoryDecisionLowConfidence(
    repository,
    decisionSummary,
  ) || validation.changed || guard.degradeDisplay;
  const monetizationLabel = guard.hideMonetization
    ? '收费路径还不够清楚，建议先确认真实用户和场景。'
    : getRepositoryDisplayMonetizationLabel(repository, decisionSummary);
  const targetUsersLabel = getRepositoryDisplayTargetUsersLabel(
    repository,
    decisionSummary,
  );
  const displayDecisionLabel = guard.severeConflict
    ? '保守判断 · 先观察'
    : repository.analysisState?.displayStatus === 'TRUSTED_READY' &&
        repository.analysisState?.deepReady === false
      ? '基础判断 · 等补分析'
    : decisionSummary.finalDecisionLabel;
  const displayActionLabel = guard.severeConflict
    ? '先补分析'
    : repository.analysisState?.deepReady === false
      ? '先确认用户、场景和收费路径'
    : decisionSummary.recommendedMoveLabel;
  const decisionReason = guard.hideWhy
    ? guard.incompleteAnalysis
      ? repository.analysisState?.lightAnalysis?.whyItMatters ??
        '分析尚未完成，先看最终结论与详情，再决定要不要继续投入。'
      : '当前信号还不够稳定，先按更保守的动作处理。'
    : decisionSummary.moneyPriority.reason;
  const analysisLayerLabel = getRepositoryAnalysisLayerLabel(repository);
  const claudeReviewLabel = getRepositoryClaudeReviewLabel(repository);
  const showCreatedAtGithub =
    query.view === 'newRadar' ||
    query.view === 'backfilledPromising' ||
    query.sortBy === 'createdAtGithub';
  const isFeatured = variant === 'featured';
  const showSupportMeta = query.displayMode === 'detail' && !isFeatured;
  const wrapperClass = isFeatured
    ? 'rounded-[32px] border border-slate-300 bg-[linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,0.98)_100%)] p-7 shadow-md shadow-slate-900/5'
    : 'rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm';
  const confidenceTone = isLowConfidence
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <article className={wrapperClass}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/repositories/${repository.id}`}
              className={`${isFeatured ? 'text-2xl' : 'text-xl'} font-semibold tracking-tight text-slate-950 transition hover:text-slate-700`}
            >
              {repository.name}
            </Link>
            {!isFeatured ? (
              <span className="text-sm text-slate-500">{repository.fullName}</span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <Badge className={getMoneyPriorityTone(decisionSummary.moneyPriority.tier)}>
              挣钱优先级 · {decisionSummary.moneyPriority.label}
            </Badge>
            <Badge className={getActionTone(decisionSummary.action)}>
              {decisionSummary.judgementLabel}
            </Badge>
            {!isFeatured && decisionSummary.hasManualOverride ? (
              <Badge className="border-slate-300 bg-slate-100 text-slate-700">
                已人工判断
              </Badge>
            ) : null}
            {!isFeatured && decisionSummary.hasConflict ? (
              <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                本地与 Claude 有冲突
              </Badge>
            ) : null}
            {!isFeatured && decisionSummary.needsRecheck ? (
              <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                需要复查
              </Badge>
            ) : null}
            {!isFeatured && isLowConfidence ? (
              <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                摘要待校正
              </Badge>
            ) : null}
          </div>
        </div>

        <FavoriteToggleButton
          repositoryId={repository.id}
          isFavorited={repository.isFavorited}
        />
      </div>

      <section className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          今天该不该做
        </p>
        <h2
          className={`mt-3 ${isFeatured ? 'text-[2rem]' : 'text-2xl'} font-semibold tracking-tight text-slate-950`}
        >
          {validation.sanitized}
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          <span className="font-semibold text-slate-900">
            {guard.hideWhy ? '当前判断：' : '为什么值得看：'}
          </span>
          {decisionReason}
        </p>
        {decisionSummary.hasConflict && decisionSummary.conflictReasons.length ? (
          <p className="mt-3 text-sm leading-7 text-amber-700">
            <span className="font-semibold">冲突原因：</span>
            {decisionSummary.conflictReasons.join('、')}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DecisionCell
            label="最终结论"
            value={displayDecisionLabel}
            tone={getMoneyPriorityTone(decisionSummary.moneyPriority.tier)}
          />
          <DecisionCell
            label="建议动作"
            value={displayActionLabel}
            tone={getActionTone(decisionSummary.action)}
          />
          <DecisionCell
            label="用户是谁"
            value={targetUsersLabel}
            tone="border-slate-200 bg-white text-slate-700"
          />
          <DecisionCell
            label="能不能收费"
            value={monetizationLabel}
            tone="border-slate-200 bg-white text-slate-700"
          />
          <DecisionCell
            label="属于什么"
            value={decisionSummary.categoryLabel}
            tone="border-violet-200 bg-violet-50 text-violet-700"
          />
        </div>

        {!isFeatured || showCreatedAtGithub ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            {!isFeatured ? (
              <SupportChip className={confidenceTone}>
                分析状态：{guard.incompleteAnalysis ? '分析尚未完成' : analysisLayerLabel}
              </SupportChip>
            ) : null}
            {!isFeatured ? <SupportChip>{claudeReviewLabel}</SupportChip> : null}
            {!isFeatured && decisionSummary.hasTrainingHints ? (
              <SupportChip>可沉淀训练样本</SupportChip>
            ) : null}
            {showCreatedAtGithub && repository.createdAtGithub ? (
              <SupportChip>新建于 {formatShortDate(repository.createdAtGithub)}</SupportChip>
            ) : null}
          </div>
        ) : null}
      </section>

      {showSupportMeta ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
          <SupportChip>★ {repository.stars.toLocaleString()}</SupportChip>
          {repository.language ? <SupportChip>{repository.language}</SupportChip> : null}
          <SupportChip>
            Owner {repository.ownerLogin}
          </SupportChip>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={repository.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            查看 GitHub 仓库
          </a>
          <Link
            href={`/repositories/${repository.id}`}
            className="inline-flex items-center rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            查看详情
          </Link>
        </div>
      </div>
    </article>
  );
}

function Badge({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span className={`rounded-full border px-3 py-1 ${className}`}>{children}</span>
  );
}

function DecisionCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`rounded-[24px] border px-4 py-4 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
        {label}
      </p>
      <p className="mt-3 text-base font-semibold">{value}</p>
    </div>
  );
}

function SupportChip({
  children,
  className = 'border-slate-200 bg-slate-50 text-slate-700',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`rounded-full border px-3 py-1 ${className}`}>
      {children}
    </span>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
