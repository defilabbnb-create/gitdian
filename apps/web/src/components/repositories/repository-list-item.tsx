import Link from 'next/link';
import {
  RepositoryDecision,
  RepositoryListItem,
  RepositoryOpportunityLevel,
  RepositoryRoughLevel,
} from '@/lib/types/repository';
import { FavoriteToggleButton } from './favorite-toggle-button';

type RepositoryListItemProps = {
  repository: RepositoryListItem;
};

const opportunityTone: Record<
  NonNullable<RepositoryOpportunityLevel>,
  { label: string; className: string }
> = {
  HIGH: {
    label: '高潜力',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  MEDIUM: {
    label: '观察中',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  LOW: {
    label: '低优先',
    className: 'border-slate-200 bg-slate-100 text-slate-600',
  },
};

const roughTone: Record<NonNullable<RepositoryRoughLevel>, string> = {
  A: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  B: 'border-amber-200 bg-amber-50 text-amber-700',
  C: 'border-slate-200 bg-slate-100 text-slate-600',
};

const decisionCopy: Record<RepositoryDecision, string> = {
  PENDING: '待判断',
  REJECTED: '暂不建议投入',
  WATCHLIST: '建议继续观察',
  RECOMMENDED: '值得重点关注',
};

function formatScore(value?: number | null) {
  if (typeof value !== 'number') {
    return '--';
  }

  return Math.round(value);
}

export function RepositoryListItemCard({
  repository,
}: RepositoryListItemProps) {
  const extractedIdea = repository.analysis?.extractedIdeaJson;
  const opportunity = repository.opportunityLevel
    ? opportunityTone[repository.opportunityLevel]
    : null;
  const decision = decisionCopy[repository.decision];

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/repositories/${repository.id}`}
              className="text-xl font-semibold tracking-tight text-slate-950 transition hover:text-slate-700"
            >
              {repository.name}
            </Link>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {repository.fullName}
            </span>
            {repository.language ? (
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                {repository.language}
              </span>
            ) : null}
          </div>

          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            {repository.description || '这个项目还没有公开描述，建议结合点子摘要和评分进一步判断。'}
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
              ★ {repository.stars.toLocaleString()} stars
            </span>
            {opportunity ? (
              <span className={`rounded-full border px-3 py-1 ${opportunity.className}`}>
                创业等级 · {opportunity.label}
              </span>
            ) : null}
            {repository.roughLevel ? (
              <span
                className={`rounded-full border px-3 py-1 ${roughTone[repository.roughLevel]}`}
              >
                粗筛 {repository.roughLevel}
              </span>
            ) : null}
            {repository.completenessLevel ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
                完整性 {repository.completenessLevel}
              </span>
            ) : null}
          </div>
        </div>

        <FavoriteToggleButton
          repositoryId={repository.id}
          isFavorited={repository.isFavorited}
        />
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <MetricCard label="Idea Fit" value={formatScore(repository.ideaFitScore)} />
        <MetricCard
          label="Completeness"
          value={formatScore(repository.completenessScore)}
        />
        <MetricCard label="Tool Score" value={formatScore(repository.toolLikeScore)} />
        <MetricCard label="Final Score" value={formatScore(repository.finalScore)} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl bg-slate-950 px-5 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            创业判断
          </p>
          <p className="mt-3 text-base font-semibold">{decision}</p>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            {extractedIdea?.ideaSummary ||
              repository.roughReason ||
              '还没有点子摘要，建议继续查看详情或等待后续分析补全。'}
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            快速线索
          </p>
          <div className="mt-3 grid gap-2 text-sm text-slate-600">
            <p>
              <span className="font-semibold text-slate-900">Owner：</span>
              {repository.ownerLogin}
            </p>
            <p>
              <span className="font-semibold text-slate-900">收藏状态：</span>
              {repository.isFavorited ? '已收藏' : '未收藏'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">生产可用：</span>
              {repository.productionReady ? '是' : '待确认'}
            </p>
          </div>
        </section>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
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
    </article>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}
