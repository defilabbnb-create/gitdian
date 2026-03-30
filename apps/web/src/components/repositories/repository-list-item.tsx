import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  getActionTone,
  getMoneyPriorityTone,
} from '@/lib/repository-decision';
import { buildRepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';
import { RepositoryListItem, RepositoryListQueryState } from '@/lib/types/repository';
import { FavoriteToggleButton } from './favorite-toggle-button';

type RepositoryListItemProps = {
  repository: RepositoryListItem;
  query: RepositoryListQueryState;
  variant?: 'default' | 'featured';
};

export function RepositoryListItemCard({
  repository,
  query,
  variant = 'default',
}: RepositoryListItemProps) {
  const decisionView = buildRepositoryDecisionViewModel(repository);
  const categoryLabel =
    decisionView.behaviorContext.categoryLabel ??
    repository.finalDecision?.decisionSummary?.categoryLabelZh ??
    repository.finalDecision?.categoryLabelZh ??
    '待分类';
  const showCreatedAtGithub =
    query.view === 'newRadar' ||
    query.view === 'backfilledPromising' ||
    query.sortBy === 'createdAtGithub';
  const isFeatured = variant === 'featured';
  const showSupportMeta = query.displayMode === 'detail' && !isFeatured;
  const wrapperClass = isFeatured
    ? 'rounded-[32px] border border-slate-300 bg-[linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,0.98)_100%)] p-7 shadow-md shadow-slate-900/5'
    : 'rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm';
  const confidenceTone = decisionView.confidence.isLow
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
            <Badge className={getMoneyPriorityTone(decisionView.priority.toneTier)}>
              挣钱优先级 · {decisionView.display.priorityLabel}
            </Badge>
            <Badge className={getActionTone(decisionView.action.toneKey)}>
              {decisionView.verdict.judgementLabel}
            </Badge>
            {!isFeatured && decisionView.badges.hasManualOverride ? (
              <Badge className="border-slate-300 bg-slate-100 text-slate-700">
                已人工判断
              </Badge>
            ) : null}
            {!isFeatured && decisionView.badges.hasConflict ? (
              <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                本地与 Claude 有冲突
              </Badge>
            ) : null}
            {!isFeatured && decisionView.badges.needsRecheck ? (
              <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                需要复查
              </Badge>
            ) : null}
            {!isFeatured && decisionView.confidence.isLow ? (
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
          {decisionView.display.headline}
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          <span className="font-semibold text-slate-900">
            {decisionView.flags.allowStrongClaims ? '为什么值得看：' : '当前判断：'}
          </span>
          {decisionView.display.reason}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DecisionCell
            label="最终结论"
            value={decisionView.display.finalDecisionLabel}
            tone={getMoneyPriorityTone(decisionView.priority.toneTier)}
          />
          <DecisionCell
            label="建议动作"
            value={decisionView.display.actionLabel}
            tone={getActionTone(decisionView.action.toneKey)}
          />
          <DecisionCell
            label="用户是谁"
            value={decisionView.display.targetUsersLabel}
            tone="border-slate-200 bg-white text-slate-700"
          />
          <DecisionCell
            label="能不能收费"
            value={decisionView.display.monetizationLabel}
            tone="border-slate-200 bg-white text-slate-700"
          />
          <DecisionCell
            label="属于什么"
            value={categoryLabel}
            tone="border-violet-200 bg-violet-50 text-violet-700"
          />
        </div>

        {!isFeatured || showCreatedAtGithub ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            {!isFeatured ? (
              <SupportChip className={confidenceTone}>
                分析状态：{decisionView.badges.analysisLayerLabel}
              </SupportChip>
            ) : null}
            {!isFeatured ? (
              <SupportChip>{decisionView.badges.claudeReviewLabel}</SupportChip>
            ) : null}
            {!isFeatured && decisionView.badges.hasTrainingHints ? (
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
