import { AnalysisStepRunner } from '@/components/repositories/analysis-step-runner';
import {
  getRepositoryActionBehaviorContext,
  getRepositoryFallbackIdeaAnalysis,
  getRepositoryIdeaExtractStatus,
} from '@/lib/repository-decision';
import { JobLogItem, RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailIdeaExtractProps = {
  repository: RepositoryDetail;
  relatedJobs?: JobLogItem[] | null;
};

export function RepositoryDetailIdeaExtract({
  repository,
  relatedJobs,
}: RepositoryDetailIdeaExtractProps) {
  const extractedIdea = repository.analysis?.extractedIdeaJson;
  const status = getRepositoryIdeaExtractStatus(repository, relatedJobs);
  const behaviorContext = getRepositoryActionBehaviorContext(repository);
  const fallback = getRepositoryFallbackIdeaAnalysis(repository);

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Idea Extraction
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            用户、场景和收费怎么说清楚
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {status.helperText}
          </p>
        </div>

        <div className="grid min-w-[240px] gap-4">
          <AnalysisStepRunner
            repositoryId={repository.id}
            step="ideaExtract"
            labelOverride="立即分析"
            runningLabelOverride="正在分析..."
            successLabelOverride="已经加入分析队列，稍后刷新就能看到新的产品分析。"
            categoryLabel={behaviorContext.categoryLabel}
            projectType={behaviorContext.projectType}
            targetUsersLabel={behaviorContext.targetUsersLabel}
            useCaseLabel={behaviorContext.useCaseLabel}
            patternKeys={behaviorContext.patternKeys}
            hasRealUser={behaviorContext.hasRealUser}
            hasClearUseCase={behaviorContext.hasClearUseCase}
            isDirectlyMonetizable={behaviorContext.isDirectlyMonetizable}
          />
          <StatusCard
            label="当前状态"
            value={getStatusLabel(status.status)}
            helper={getModeLabel(status.mode)}
          />
        </div>
      </div>

      {extractedIdea ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-4">
            <HighlightCard
              title="一句话点子"
              content={extractedIdea.ideaSummary}
              tone="dark"
            />
            <HighlightCard title="问题" content={extractedIdea.problem} />
            <HighlightCard title="解决方案" content={extractedIdea.solution} />
            <HighlightCard title="MVP 计划" content={extractedIdea.mvpPlan} />
            <HighlightCard title="差异化" content={extractedIdea.differentiation} />
          </div>

          <div className="space-y-4">
            <StatusCard
              label="分析模式"
              value={getModeLabel(status.mode)}
              helper={
                typeof extractedIdea.confidence === 'number'
                  ? `提炼置信度 ${Math.round(extractedIdea.confidence)}`
                  : '当前结果已可直接拿来判断'
              }
            />
            <TagListCard
              title="目标用户"
              items={extractedIdea.targetUsers}
              emptyText="还没有明确目标用户。"
            />
            <HighlightCard title="商业化" content={extractedIdea.monetization} />
            <HighlightCard title="为什么是现在" content={extractedIdea.whyNow} />
            <TagListCard
              title="风险"
              items={extractedIdea.risks}
              emptyText="还没有给出风险提示。"
              tone="rose"
            />
          </div>
        </div>
      ) : status.status === 'RUNNING' || status.status === 'PENDING' ? (
        <IdeaExtractSkeleton />
      ) : (
        <div className="mt-6 space-y-4">
          {status.status === 'SKIPPED_BY_STRENGTH' || status.status === 'SKIPPED_BY_GATE' ? (
            <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-7 text-amber-800">
              这层深分析当前没有继续跑，所以页面先用已有判断补一版基础分析，避免你看到空分析区。
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-4">
              <HighlightCard
                title="一句话点子"
                content={fallback.headline}
                tone="dark"
              />
              <HighlightCard title="用户场景" content={fallback.useCase} />
              <HighlightCard title="下一步" content={fallback.nextStep} />
            </div>

            <div className="space-y-4">
              <StatusCard
                label="当前状态"
                value={getStatusLabel(status.status)}
                helper={status.helperText}
              />
              <HighlightCard title="用户是谁" content={fallback.targetUsers} />
              <HighlightCard title="能不能收费" content={fallback.monetization} />
              <HighlightCard title="为什么值得看" content={fallback.whyItMatters} />
              {fallback.caution ? (
                <HighlightCard title="现在要注意" content={fallback.caution} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function getStatusLabel(status: ReturnType<typeof getRepositoryIdeaExtractStatus>['status']) {
  switch (status) {
    case 'COMPLETED':
      return '已完成';
    case 'RUNNING':
      return '正在分析';
    case 'PENDING':
      return '排队中';
    case 'FAILED':
      return '补分析失败';
    case 'SKIPPED_BY_GATE':
      return '未进入深分析';
    case 'SKIPPED_BY_STRENGTH':
      return '已跳过';
    case 'NOT_STARTED':
    default:
      return '未开始';
  }
}

function getModeLabel(mode: ReturnType<typeof getRepositoryIdeaExtractStatus>['mode']) {
  if (mode === 'full') {
    return '完整分析';
  }

  if (mode === 'light') {
    return '轻量分析';
  }

  if (mode === 'skip') {
    return '跳过深分析';
  }

  return '等待补分析';
}

function IdeaExtractSkeleton() {
  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-32 animate-pulse rounded-[28px] border border-slate-200 bg-slate-100"
        />
      ))}
    </div>
  );
}

function HighlightCard({
  title,
  content,
  tone = 'light',
}: {
  title: string;
  content?: string;
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
      <p className={`mt-4 text-sm leading-7 ${textClasses}`}>
        {content || '当前还没有可展示内容。'}
      </p>
    </div>
  );
}

function StatusCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-3 text-sm leading-7 text-slate-600">{helper}</p>
    </div>
  );
}

function TagListCard({
  title,
  items,
  emptyText,
  tone = 'slate',
}: {
  title: string;
  items?: string[];
  emptyText: string;
  tone?: 'slate' | 'rose';
}) {
  const itemClass =
    tone === 'rose'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-slate-200 bg-white text-slate-700';

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
              className={`rounded-full border px-3 py-1 text-xs font-medium ${itemClass}`}
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
