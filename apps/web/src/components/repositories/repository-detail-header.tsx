import { RepositoryExecutionStatus } from '@/components/repositories/repository-execution-status';
import { detectRepositoryConflicts } from '@/lib/repository-data-guard';
import {
  getRepositoryActionBehaviorContext,
  getRepositoryDisplayMonetizationLabel,
  getRepositoryDisplayTargetUsersLabel,
  getMoneyPriorityTone,
  getRepositoryDecisionHeadline,
  getRepositoryDecisionSummary,
} from '@/lib/repository-decision';
import {
  RepositoryDetail,
} from '@/lib/types/repository';

type RepositoryDetailHeaderProps = {
  repository: RepositoryDetail;
};

export function RepositoryDetailHeader({
  repository,
}: RepositoryDetailHeaderProps) {
  const summary = getRepositoryDecisionSummary(repository);
  const guard = detectRepositoryConflicts(repository, { summary });
  const headline = getRepositoryDecisionHeadline(repository, summary);
  const monetizationLabel = guard.hideMonetization
    ? '收费路径还不够清楚，建议先确认真实用户和场景。'
    : getRepositoryDisplayMonetizationLabel(repository, summary);
  const targetUsersLabel = getRepositoryDisplayTargetUsersLabel(
    repository,
    summary,
  );
  const behaviorContext = getRepositoryActionBehaviorContext(repository, summary);
  const displayPriorityTier = guard.severeConflict ? 'P3' : summary.moneyPriority.tier;
  const displayPriorityLabel = guard.severeConflict
    ? 'P3 · 先观察'
    : summary.moneyPriority.label;
  const nextActionLabel = guard.severeConflict
    ? '暂不投入'
    : repository.analysisState?.deepReady === false
      ? '先补分析'
    : summary.action === 'BUILD'
      ? '立即做'
      : summary.action === 'CLONE'
        ? '快速验证'
        : '暂不投入';
  const finalDecisionLabel = guard.severeConflict
    ? '保守判断 · 先观察'
    : repository.analysisState?.displayStatus === 'TRUSTED_READY' &&
        repository.analysisState?.deepReady === false
      ? '基础判断 · 当前先按保守结论处理'
    : summary.finalDecisionLabel;

  return (
    <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-[linear-gradient(140deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.97)_55%,_rgba(30,64,175,0.86)_100%)] px-8 py-8 text-white shadow-xl shadow-slate-900/10">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              项目判断页
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              {headline}
            </h1>
          </div>

          <div className="flex flex-wrap gap-3 text-xs font-medium">
            <span
              className={`rounded-full border px-3 py-1 ${getMoneyPriorityTone(displayPriorityTier)}`}
            >
              挣钱优先级 · {displayPriorityLabel}
            </span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-slate-100">
              {finalDecisionLabel}
            </span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-slate-100">
              下一步 · {nextActionLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-4 xl:min-w-[260px] xl:items-end">
          <div className="w-full rounded-[28px] border border-white/10 bg-white/5 p-4 xl:w-[320px]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              现在先做什么
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-200">
              <p>
                <span className="font-semibold text-white">用户是谁：</span>
                {targetUsersLabel}
              </p>
              <p>
                <span className="font-semibold text-white">能不能收费：</span>
                {monetizationLabel}
              </p>
              <p>
                <span className="font-semibold text-white">下一步：</span>
                {nextActionLabel}
              </p>
            </div>
          </div>
          <RepositoryExecutionStatus
            repoId={repository.id}
            name={repository.name}
            fullName={repository.fullName}
            htmlUrl={repository.htmlUrl}
            headline={headline}
            reason={nextActionLabel}
            isFavorited={repository.isFavorited}
            categoryLabel={behaviorContext.categoryLabel}
            projectType={behaviorContext.projectType}
            targetUsersLabel={behaviorContext.targetUsersLabel}
            useCaseLabel={behaviorContext.useCaseLabel}
            patternKeys={behaviorContext.patternKeys}
            hasRealUser={behaviorContext.hasRealUser}
            hasClearUseCase={behaviorContext.hasClearUseCase}
            isDirectlyMonetizable={behaviorContext.isDirectlyMonetizable}
          />
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
      </div>
    </section>
  );
}
