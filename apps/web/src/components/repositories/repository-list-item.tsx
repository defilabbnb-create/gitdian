import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  getActionTone,
  getMoneyPriorityTone,
} from '@/lib/repository-decision';
import { buildRepositoryDecisionViewModel } from '@/lib/repository-decision-view-model';
import {
  buildRepositoryListSearchParams,
  RepositoryListItem,
  RepositoryListQueryState,
} from '@/lib/types/repository';
import {
  buildRepositoryAnchorId,
  buildRepositoryDetailHref,
  withHash,
} from '@/lib/repository-detail-navigation';
import { FavoriteToggleButton } from './favorite-toggle-button';

type RepositoryListItemProps = {
  repository: RepositoryListItem;
  query: RepositoryListQueryState;
  variant?: 'default' | 'featured';
  basePath?: string;
};

export function RepositoryListItemCard({
  repository,
  query,
  variant = 'default',
  basePath = '/repositories',
}: RepositoryListItemProps) {
  const decisionView = buildRepositoryDecisionViewModel(repository);
  const categoryLabel =
    decisionView.flags.historicalRepairHoldback
      ? '分类待复核'
      : decisionView.behaviorContext.categoryLabel ??
        repository.analysis?.insightJson?.categoryDisplay?.label ??
        repository.finalDecision?.decisionSummary?.categoryLabelZh ??
        repository.finalDecision?.categoryLabelZh ??
        '待分类';
  const showCreatedAtGithub =
    query.view === 'newRadar' ||
    query.view === 'backfilledPromising' ||
    query.view === 'coldTools' ||
    query.sortBy === 'createdAtGithub';
  const isFeatured = variant === 'featured';
  const showSupportMeta = query.displayMode === 'detail' && !isFeatured;
  const coldToolPool = repository.analysis?.coldToolPool ?? null;
  const anchorId = buildRepositoryAnchorId(repository.id);
  const detailHref = buildRepositoryDetailHref(
    repository.id,
    withHash(buildRepositoryReturnHref(query, basePath), anchorId),
  );
  const wrapperClass = isFeatured
    ? 'surface-card-strong rounded-[34px] border border-slate-300 p-7 transition hover:-translate-y-0.5 hover:shadow-2xl'
    : 'surface-card rounded-[30px] p-6 transition hover:-translate-y-0.5 hover:shadow-xl';
  const confidenceTone = decisionView.confidence.isLow
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : 'border-slate-200 bg-slate-50 text-slate-700';
  const tertiaryBadge = getTertiaryBadge(decisionView);

  return (
    <article
      id={anchorId}
      className={`${wrapperClass} relative overflow-hidden`}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#0f766e_0%,#0ea5e9_52%,#0f172a_100%)] opacity-80" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={detailHref}
              className={`${isFeatured ? 'text-3xl' : 'text-[1.45rem]'} font-display font-semibold leading-tight tracking-[-0.03em] text-slate-950 transition hover:text-slate-700`}
            >
              {repository.name}
            </Link>
            {!isFeatured ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                {repository.fullName}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <Badge className={getMoneyPriorityTone(decisionView.priority.toneTier)}>
              挣钱优先级 · {decisionView.display.priorityLabel}
            </Badge>
            <Badge className={getActionTone(decisionView.action.toneKey)}>
              建议动作 · {decisionView.display.actionLabel}
            </Badge>
            {tertiaryBadge ? (
              <Badge className={tertiaryBadge.tone}>{tertiaryBadge.label}</Badge>
            ) : null}
          </div>
        </div>

        <FavoriteToggleButton
          repositoryId={repository.id}
          isFavorited={repository.isFavorited}
        />
      </div>

      <section className="mt-5 rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.84)_0%,rgba(248,250,252,0.92)_100%)] px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          今天该不该做
        </p>
        <h2
          className={`font-display mt-3 ${isFeatured ? 'text-[2.2rem]' : 'text-[1.9rem]'} font-semibold leading-tight tracking-[-0.04em] text-slate-950`}
        >
          {decisionView.display.headline}
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          <span className="font-semibold text-slate-900">
            {decisionView.flags.allowStrongClaims ? '为什么值得看：' : '当前判断：'}
          </span>
          {decisionView.display.reason}
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <DecisionCell
            label="现在结论"
            value={decisionView.display.finalDecisionLabel}
            tone={getMoneyPriorityTone(decisionView.priority.toneTier)}
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
        </div>

        {!isFeatured || showCreatedAtGithub ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <SupportChip className="border-violet-200 bg-violet-50 text-violet-700">
              属于什么：{categoryLabel}
            </SupportChip>
            {!isFeatured ? (
              <SupportChip className={confidenceTone}>
                分析状态：{decisionView.badges.analysisLayerLabel}
              </SupportChip>
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

      {query.view === 'coldTools' && coldToolPool ? (
          <section className="mt-4 rounded-[30px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.92)_0%,rgba(240,253,250,0.84)_100%)] px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            冷门工具判断
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
            {coldToolPool.summaryZh}
          </h3>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <DecisionCell
              label="真实活跃用户"
              value={coldToolPool.globalActiveUsersBandZh}
              tone="border-emerald-200 bg-white text-emerald-700"
            />
            <DecisionCell
              label="潜在适用人群"
              value={coldToolPool.globalPotentialUsersBandZh}
              tone="border-emerald-200 bg-white text-emerald-700"
            />
            <DecisionCell
              label="是否有人买账"
              value={coldToolPool.hasPayingIntent ? '有人会买单' : '买单意愿偏弱'}
              tone="border-emerald-200 bg-white text-emerald-700"
            />
            <DecisionCell
              label="谁会买单"
              value={coldToolPool.buyerTypeZh}
              tone="border-emerald-200 bg-white text-emerald-700"
            />
            <DecisionCell
              label="判断置信度"
              value={`${coldToolPool.confidence}%`}
              tone="border-emerald-200 bg-white text-emerald-700"
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <DecisionCell
              label="主要用户"
              value={coldToolPool.targetUsersZh}
              tone="border-slate-200 bg-white text-slate-700"
            />
            <DecisionCell
              label="使用频率"
              value={coldToolPool.usageFrequencyLabelZh}
              tone="border-slate-200 bg-white text-slate-700"
            />
            <DecisionCell
              label="工作流嵌入"
              value={coldToolPool.workflowCriticalityLabelZh}
              tone="border-slate-200 bg-white text-slate-700"
            />
          </div>

          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
            <p>
              <span className="font-semibold text-slate-950">主要场景：</span>
              {coldToolPool.useCaseZh}
            </p>
            <p>
              <span className="font-semibold text-slate-950">为什么有人用：</span>
              {coldToolPool.whyUseZh}
            </p>
            <p>
              <span className="font-semibold text-slate-950">为什么有人付费：</span>
              {coldToolPool.whyPayZh}
            </p>
            <p>
              <span className="font-semibold text-slate-950">为什么可能不付费：</span>
              {coldToolPool.whyNotPayZh}
            </p>
          </div>
        </section>
      ) : null}

      {showSupportMeta ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
          <SupportChip>★ {repository.stars.toLocaleString()}</SupportChip>
          {repository.language ? <SupportChip>{repository.language}</SupportChip> : null}
          <SupportChip>
            Owner {repository.ownerLogin}
          </SupportChip>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/70 pt-5">
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
            href={detailHref}
            className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
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

function getTertiaryBadge(
  decisionView: ReturnType<typeof buildRepositoryDecisionViewModel>,
) {
  if (decisionView.badges.hasConflict) {
    return {
      label: '本地与 Claude 有冲突',
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (decisionView.badges.needsRecheck) {
    return {
      label: '需要复查',
      tone: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }

  if (decisionView.badges.hasManualOverride) {
    return {
      label: '已人工判断',
      tone: 'border-slate-300 bg-slate-100 text-slate-700',
    };
  }

  if (decisionView.confidence.isLow) {
    return {
      label: '摘要待校正',
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return null;
}

function buildRepositoryReturnHref(
  query: RepositoryListQueryState,
  basePath: string,
) {
  const search = buildRepositoryListSearchParams(query);
  return search ? `${basePath}?${search}` : basePath;
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
