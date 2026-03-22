import Link from 'next/link';
import { AnalysisRunner } from '@/components/repositories/analysis-runner';
import { ExportRepositoryJsonButton } from '@/components/repositories/export-repository-json-button';
import { FavoriteToggleButton } from '@/components/repositories/favorite-toggle-button';
import {
  RepositoryDecision,
  RepositoryDetail,
  RepositoryOpportunityLevel,
  RepositoryRoughLevel,
} from '@/lib/types/repository';

type RepositoryDetailHeaderProps = {
  repository: RepositoryDetail;
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

export function RepositoryDetailHeader({
  repository,
}: RepositoryDetailHeaderProps) {
  const opportunity = repository.opportunityLevel
    ? opportunityTone[repository.opportunityLevel]
    : null;

  return (
    <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-[linear-gradient(140deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.97)_55%,_rgba(30,64,175,0.86)_100%)] px-8 py-8 text-white shadow-xl shadow-slate-900/10">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-5">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/10"
          >
            返回项目列表
          </Link>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Repository Intelligence
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              {repository.name}
            </h1>
            <p className="mt-2 text-sm text-slate-300">{repository.fullName}</p>
          </div>

          <p className="max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
            {repository.description ||
              '这个项目还没有公开描述，建议结合下方点子提取与创业评分一起判断。'}
          </p>

          <div className="flex flex-wrap gap-3 text-xs font-medium">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-slate-100">
              ★ {repository.stars.toLocaleString()} stars
            </span>
            {repository.language ? (
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-slate-100">
                {repository.language}
              </span>
            ) : null}
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

        <div className="flex flex-col items-start gap-4 xl:items-end">
          <div className="flex w-full justify-end">
            <FavoriteToggleButton
              repositoryId={repository.id}
              isFavorited={repository.isFavorited}
            />
          </div>
          <AnalysisRunner repositoryId={repository.id} />
          <div className="grid w-full gap-3 rounded-[28px] border border-white/10 bg-white/5 p-4 xl:w-[320px]">
            <HeaderMetric
              label="Decision"
              value={decisionCopy[repository.decision]}
            />
            <HeaderMetric
              label="Idea Fit"
              value={formatScore(repository.ideaFitScore)}
            />
            <HeaderMetric
              label="Completeness"
              value={formatScore(repository.completenessScore)}
            />
            <HeaderMetric
              label="Tool Score"
              value={formatScore(repository.toolLikeScore)}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-300">
        <a
          href={repository.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 font-semibold transition hover:bg-white/10"
        >
          查看 GitHub
        </a>
        {repository.homepage ? (
          <a
            href={repository.homepage}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 font-semibold transition hover:bg-white/10"
          >
            打开项目主页
          </a>
        ) : null}
        <ExportRepositoryJsonButton repository={repository} />
      </div>
    </section>
  );
}

function HeaderMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <span className="text-lg font-semibold tracking-tight text-white">{value}</span>
    </div>
  );
}
