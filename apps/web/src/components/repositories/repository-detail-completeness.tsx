import { AnalysisStepRunner } from '@/components/repositories/analysis-step-runner';
import {
  getRepositoryActionBehaviorContext,
  getRepositoryDeepAnalysisStatus,
  getRepositoryFallbackIdeaAnalysis,
} from '@/lib/repository-decision';
import { JobLogItem, RepositoryDetail } from '@/lib/types/repository';

type RepositoryDetailCompletenessProps = {
  repository: RepositoryDetail;
  relatedJobs?: JobLogItem[] | null;
};

export function RepositoryDetailCompleteness({
  repository,
  relatedJobs,
}: RepositoryDetailCompletenessProps) {
  const completeness = repository.analysis?.completenessJson;
  const status = getRepositoryDeepAnalysisStatus(repository, relatedJobs);
  const behaviorContext = getRepositoryActionBehaviorContext(repository);
  const fallback = getRepositoryFallbackIdeaAnalysis(repository);
  const runabilityValue =
    completeness?.runability ??
    repository.runability ??
    (repository.productionReady ? '接近可用' : '待补分析');
  const completenessLevel =
    repository.completenessLevel ?? (repository.productionReady ? 'MEDIUM' : '待补分析');

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Completeness
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            完整性与可落地性
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {completeness?.summary ??
              '这层工程完整性还没单独回填，页面先根据 README、目录和基础字段给你一版可落地判断。'}
          </p>
        </div>

        <div className="grid min-w-[240px] gap-4">
          <AnalysisStepRunner
            repositoryId={repository.id}
            step="completeness"
            labelOverride="补完整性分析"
            runningLabelOverride="完整性分析补跑中..."
            successLabelOverride="完整性分析已加入队列，稍后刷新就能看到新的结果。"
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
            <InfoMetric
              label="当前状态"
              value={status.label}
            />
            <InfoMetric
              label="等级"
              value={completeness?.completenessLevel ?? completenessLevel}
            />
            <InfoMetric label="可运行性" value={runabilityValue} />
            <InfoMetric
              label="接近可用"
              value={repository.productionReady ? '是' : '否'}
            />
          </div>
        </div>
      </div>

      {completeness ? (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <DimensionCard label="文档" value={completeness.dimensionScores.documentation} />
            <DimensionCard label="结构" value={completeness.dimensionScores.structure} />
            <DimensionCard label="可运行性" value={completeness.dimensionScores.runability} />
            <DimensionCard label="工程化" value={completeness.dimensionScores.engineering} />
            <DimensionCard label="维护性" value={completeness.dimensionScores.maintenance} />
            <DimensionCard label="扩展性" value={completeness.dimensionScores.extensibility} />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <SimpleListCard
              title="优势"
              items={completeness.strengths}
              emptyText="还没有总结出明确优势。"
              tone="emerald"
            />
            <SimpleListCard
              title="不足"
              items={completeness.weaknesses}
              emptyText="还没有总结出明显短板。"
              tone="amber"
            />
          </div>
        </>
      ) : status.status === 'RUNNING' || status.status === 'PENDING' ? (
        <CompletenessSkeleton />
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <FallbackCard
            title="当前可落地判断"
            content={
              repository.productionReady
                ? '仓库已经接近可用，可以先按产品原型或验证项目来推进。'
                : '当前更像早期能力仓库或验证材料，先不要按成熟产品来估计落地成本。'
            }
            tone="dark"
          />
          <FallbackCard title="下一步" content={fallback.nextStep} />
          <FallbackCard
            title="已有基础"
            content={buildStrengthSummary(repository)}
          />
          <FallbackCard
            title="还缺什么"
            content={buildWeaknessSummary(repository)}
          />
        </div>
      )}
    </section>
  );
}

function CompletenessSkeleton() {
  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-2">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-28 animate-pulse rounded-[28px] border border-slate-200 bg-slate-100"
        />
      ))}
    </div>
  );
}

function buildStrengthSummary(repository: RepositoryDetail) {
  const strengths = [
    repository.content?.readmeText ? 'README 已抓到' : null,
    repository.content?.hasDocs ? '有文档线索' : null,
    repository.content?.hasTests ? '有测试线索' : null,
    repository.content?.hasCi ? '有 CI 线索' : null,
    repository.language ? `主语言明确：${repository.language}` : null,
  ].filter(Boolean);

  return strengths.length
    ? strengths.join('、')
    : '当前只有基础仓库信息，工程成熟度还需要进一步补分析确认。';
}

function buildWeaknessSummary(repository: RepositoryDetail) {
  const weaknesses = [
    !repository.content?.hasDocs ? '文档还不够完整' : null,
    !repository.content?.hasTests ? '测试与可验证性线索不足' : null,
    !repository.productionReady ? '离直接可用还有明显距离' : null,
    repository.completenessLevel === 'LOW' ? '完整性仍偏早期' : null,
  ].filter(Boolean);

  return weaknesses.length
    ? weaknesses.join('、')
    : '目前没有明显短板暴露，但仍建议补一次完整性分析再决定投入深度。';
}

function InfoMetric({
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

function DimensionCard({
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

function SimpleListCard({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string;
  items?: string[];
  emptyText: string;
  tone: 'emerald' | 'amber';
}) {
  const itemClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';

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
