import type { ReactNode } from 'react';
import { detectRepositoryConflicts } from '@/lib/repository-data-guard';
import {
  getActionTone,
  getRepositoryActionBehaviorContext,
  getRepositoryDeepAnalysisStatus,
  getRepositoryDecisionHeadline,
  getRepositoryDisplayMonetizationLabel,
  getRepositoryDisplayTargetUsersLabel,
  getRepositoryHomepageDecisionReason,
  getMoneyPriorityTone,
  getRepositoryDecisionSummary,
} from '@/lib/repository-decision';
import { RepositoryDeepAnalysisActions } from '@/components/repositories/repository-deep-analysis-actions';
import { RepositoryNextSteps } from '@/components/repositories/repository-next-steps';
import { JobLogItem, RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailConclusionProps = {
  repository: RepositoryDetail;
  relatedJobs?: JobLogItem[] | null;
};

export function RepositoryDetailConclusion({
  repository,
  relatedJobs,
}: RepositoryDetailConclusionProps) {
  const summary = getRepositoryDecisionSummary(repository);
  const guard = detectRepositoryConflicts(repository, {
    summary,
    relatedJobs: relatedJobs ?? [],
  });
  const behaviorContext = getRepositoryActionBehaviorContext(repository, summary);
  const headline = getRepositoryDecisionHeadline(repository, summary);
  const monetizationLabel = guard.hideMonetization
    ? '收费路径还不够清楚，建议先确认真实用户和场景。'
    : getRepositoryDisplayMonetizationLabel(repository, summary);
  const targetUsersLabel = getRepositoryDisplayTargetUsersLabel(
    repository,
    summary,
  );
  const actionReason = guard.hideWhy
    ? repository.analysisState?.lightAnalysis?.whyItMatters ||
      repository.analysis?.ideaSnapshotJson?.reason ||
      '当前先按更保守的判断处理，等补分析完成后再决定是否继续投入。'
    : getRepositoryHomepageDecisionReason(repository, summary);
  const strongActionLabel = guard.severeConflict
    ? '暂不投入'
    : repository.analysisState?.deepReady === false
      ? '先补分析'
    : toStrongActionLabel(summary.action);
  const deepStatus = getRepositoryDeepAnalysisStatus(repository, relatedJobs);
  const needsAdditionalAnalysis = deepStatus.status !== 'COMPLETED';
  const displayPriorityTier = guard.severeConflict ? 'P3' : summary.moneyPriority.tier;
  const displayPriorityLabel = guard.severeConflict
    ? 'P3 · 先观察'
    : summary.moneyPriority.label;
  const finalDecisionLabel = guard.severeConflict
    ? '保守判断 · 先观察'
    : repository.analysisState?.displayStatus === 'TRUSTED_READY' &&
        repository.analysisState?.deepReady === false
      ? '基础判断 · 当前先按保守结论处理'
    : summary.finalDecisionLabel;
  const nextStepLabel = guard.severeConflict
    ? '先补分析'
    : strongActionLabel;

  return (
    <section id="decision" className="rounded-[36px] border border-slate-200 bg-white/95 p-7 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            先看结论
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {headline}
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
            <span className="font-semibold text-slate-900">现在结论是：</span>
            {finalDecisionLabel}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Badge className={getMoneyPriorityTone(displayPriorityTier)}>
            挣钱优先级 · {displayPriorityLabel}
          </Badge>
          <Badge className={getActionTone(summary.action)}>
            {strongActionLabel}
          </Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ConclusionMetric
          label="最终结论"
          value={finalDecisionLabel}
          tone={getMoneyPriorityTone(displayPriorityTier)}
        />
        <ConclusionMetric
          label="挣钱优先级"
          value={displayPriorityLabel}
          tone={getMoneyPriorityTone(displayPriorityTier)}
        />
        <ConclusionMetric
          label="建议动作"
          value={nextStepLabel}
          tone={getActionTone(summary.action)}
        />
        <ConclusionMetric
          label="用户是谁"
          value={targetUsersLabel}
          tone="border-slate-200 bg-slate-50 text-slate-700"
        />
        <ConclusionMetric
          label="能不能收费"
          value={monetizationLabel}
          tone="border-slate-200 bg-slate-50 text-slate-700"
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            为什么值得看
          </p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
            <p>
              <span className="font-semibold text-slate-900">现在值得看的原因：</span>
              {actionReason}
            </p>
            <p>
              <span className="font-semibold text-slate-900">现在要注意：</span>
              {guard.severeConflict || summary.hasConflict || summary.needsRecheck
                ? '信号还带一点边界，先按更保守的动作执行，再去工作台补证据。'
                : '当前没有明显冲突，可以直接进入行动层。'}
            </p>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            分析状态
          </p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
            <p>
              <span className="font-semibold text-slate-900">当前进度：</span>
              {deepStatus.label}
            </p>
            <p>
              <span className="font-semibold text-slate-900">状态说明：</span>
              {deepStatus.helperText}
            </p>
            <p>
              <span className="font-semibold text-slate-900">缺少哪些分析：</span>
              {deepStatus.missingSteps.length
                ? deepStatus.missingSteps
                    .map((step) =>
                      step === 'ideaFit'
                        ? '创业评分'
                        : step === 'ideaExtract'
                          ? '点子提取'
                          : '完整性分析',
                    )
                    .join('、')
                : '关键分析已经补齐'}
            </p>
          </div>

          {needsAdditionalAnalysis ? (
            <div className="mt-5">
              <RepositoryDeepAnalysisActions
                repositoryId={repository.id}
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
          ) : null}
        </section>
      </div>

      <div className="mt-4 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          下一步建议
        </p>
        <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
          <p>
            <span className="font-semibold text-slate-900">现在该做什么：</span>
            {guard.severeConflict
              ? '先补分析，再判断要不要继续投入。'
              : toImmediateAction(summary.action)}
          </p>
          <p>
            <span className="font-semibold text-slate-900">下一步动作：</span>
            {nextStepLabel}
          </p>
          <p>
            <span className="font-semibold text-slate-900">风险提醒：</span>
            {summary.hasConflict || summary.needsRecheck
              ? '先按保守动作执行，之后再去分析工作台补证据。'
              : '当前没有明显阻碍，可以继续投入。'}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <RepositoryNextSteps
          repoId={repository.id}
          name={repository.name}
          fullName={repository.fullName}
          htmlUrl={repository.htmlUrl}
          headline={headline}
          reason={actionReason}
          isFavorited={repository.isFavorited}
          favoriteNote={repository.favorite?.note ?? null}
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
    </section>
  );
}

function toImmediateAction(action: string) {
  if (action === 'BUILD') {
    return '立即做，优先继续确认范围和落地方式。';
  }

  if (action === 'CLONE') {
    return '快速验证，重点借鉴结构、流程和收费路径。';
  }

  return '暂不投入，除非后面出现新的强信号。';
}

function toStrongActionLabel(action: string) {
  if (action === 'BUILD') {
    return '立即做';
  }

  if (action === 'CLONE') {
    return '快速验证';
  }

  return '暂不投入';
}

function Badge({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function ConclusionMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`rounded-[28px] border px-5 py-5 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
        {label}
      </p>
      <p className="mt-4 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
