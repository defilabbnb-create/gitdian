import { AnalysisStepRunner } from '@/components/repositories/analysis-step-runner';
import {
  getRepositoryActionBehaviorContext,
  getRepositoryDecisionSummary,
  getRepositoryDeepAnalysisStatus,
  getRepositoryFallbackIdeaAnalysis,
} from '@/lib/repository-decision';
import { JobLogItem, RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailIdeaFitProps = {
  repository: RepositoryDetail;
  relatedJobs?: JobLogItem[] | null;
};

export function RepositoryDetailIdeaFit({
  repository,
  relatedJobs,
}: RepositoryDetailIdeaFitProps) {
  const ideaFit = repository.analysis?.ideaFitJson;
  const summary = getRepositoryDecisionSummary(repository);
  const behaviorContext = getRepositoryActionBehaviorContext(repository, summary);
  const fallback = getRepositoryFallbackIdeaAnalysis(repository, summary);
  const status = getRepositoryDeepAnalysisStatus(repository, relatedJobs);
  const actionLabel =
    summary.action === 'BUILD'
      ? '立即做'
      : summary.action === 'CLONE'
        ? '快速验证'
        : '暂不投入';

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Idea Fit
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            创业价值判断
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {ideaFit?.coreJudgement ?? status.helperText}
          </p>
        </div>

        <div className="grid min-w-[240px] gap-4">
          <AnalysisStepRunner
            repositoryId={repository.id}
            step="ideaFit"
            labelOverride="补创业评分"
            runningLabelOverride="创业评分补跑中..."
            successLabelOverride="创业评分已加入队列，稍后刷新就能看到新的判断。"
            categoryLabel={behaviorContext.categoryLabel}
            projectType={behaviorContext.projectType}
            targetUsersLabel={behaviorContext.targetUsersLabel}
            useCaseLabel={behaviorContext.useCaseLabel}
            patternKeys={behaviorContext.patternKeys}
            hasRealUser={behaviorContext.hasRealUser}
            hasClearUseCase={behaviorContext.hasClearUseCase}
            isDirectlyMonetizable={behaviorContext.isDirectlyMonetizable}
          />
          <div className="grid gap-3 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
            <IdeaFitStat
              label="当前状态"
              value={status.label}
            />
            <IdeaFitStat
              label="机会层级"
              value={ideaFit?.opportunityLevel ?? summary.moneyPriority.label}
            />
            <IdeaFitStat label="建议动作" value={actionLabel} />
          </div>
        </div>
      </div>

      {ideaFit ? (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DimensionChip label="真实需求" value={ideaFit.scores.realDemand} />
            <DimensionChip label="产品化" value={ideaFit.scores.toolProductization} />
            <DimensionChip label="付费空间" value={ideaFit.scores.monetization} />
            <DimensionChip
              label="竞争突破"
              value={ideaFit.scores.competitiveBreakthrough}
            />
            <DimensionChip label="趋势时机" value={ideaFit.scores.timingTailwind} />
            <DimensionChip
              label="执行可行性"
              value={ideaFit.scores.executionFeasibility}
            />
            <DimensionChip label="创业者匹配" value={ideaFit.scores.founderFit} />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <ListCard
              title="机会标签"
              items={ideaFit.opportunityTags}
              emptyText="模型还没有给出明确机会标签。"
              tone="emerald"
            />
            <ListCard
              title="风险提醒"
              items={ideaFit.negativeFlags}
              emptyText="当前没有明确风险标记。"
              tone="rose"
            />
          </div>
        </>
      ) : status.status === 'RUNNING' || status.status === 'PENDING' ? (
        <IdeaFitSkeleton />
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <FallbackCard title="当前判断" content={fallback.whyItMatters} tone="dark" />
          <FallbackCard title="下一步" content={fallback.nextStep} />
          <FallbackCard title="用户是谁" content={fallback.targetUsers} />
          <FallbackCard title="能不能收费" content={fallback.monetization} />
        </div>
      )}
    </section>
  );
}

function IdeaFitSkeleton() {
  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-28 animate-pulse rounded-[28px] border border-slate-200 bg-slate-100"
        />
      ))}
    </div>
  );
}

function IdeaFitStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <span className="text-lg font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function DimensionChip({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {Math.round(value)}
      </p>
    </div>
  );
}

function ListCard({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string;
  items?: string[];
  emptyText: string;
  tone: 'emerald' | 'rose';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-rose-200 bg-rose-50 text-rose-800';

  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      {items?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-7 text-slate-600">{emptyText}</p>
      )}
    </div>
  );
}

function FallbackCard({
  title,
  content,
  tone = 'light',
}: {
  title: string;
  content: string;
  tone?: 'light' | 'dark';
}) {
  const classes =
    tone === 'dark'
      ? 'border-slate-950 bg-slate-950 text-white'
      : 'border-slate-200 bg-slate-50 text-slate-900';
  const textClasses = tone === 'dark' ? 'text-slate-300' : 'text-slate-600';

  return (
    <div className={`rounded-[28px] border p-5 ${classes}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{title}</p>
      <p className={`mt-4 text-sm leading-7 ${textClasses}`}>{content}</p>
    </div>
  );
}
