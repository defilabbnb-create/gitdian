import Link from 'next/link';
import {
  buildJobsPriorityViewModel,
  JobPriorityGroup,
} from '@/lib/job-priority-view-model';
import { JobLogItem, JobLogQueryState } from '@/lib/types/repository';

type JobsPriorityBoardProps = {
  items: JobLogItem[];
  query: JobLogQueryState;
  currentRepositoryId?: string;
  focusedJobId?: string;
};

export function JobsPriorityBoard({
  items,
  query,
  currentRepositoryId,
  focusedJobId,
}: JobsPriorityBoardProps) {
  const viewModel = buildJobsPriorityViewModel(items, query);
  const showSteadyStateCard = viewModel.visibleGroupCount === 0;
  const anomalyJobCount = viewModel.anomalyGroups.reduce(
    (sum, group) => sum + group.count,
    0,
  );
  const visibleAttentionJobCount = viewModel.attentionGroups.reduce(
    (sum, group) => sum + group.count,
    0,
  );
  const anomalyGridClass =
    viewModel.anomalyGroups.length <= 1 ? 'grid gap-4' : 'grid gap-4 xl:grid-cols-2';
  const attentionGridClass =
    viewModel.attentionGroups.length <= 1 ? 'grid gap-4' : 'grid gap-4 xl:grid-cols-2';

  return (
    <section className="space-y-6" data-testid="jobs-priority-board">
      <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_58%,_rgba(3,105,161,0.86)_100%)] px-7 py-8 text-white shadow-xl shadow-slate-900/10">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,360px)] xl:items-end">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/70">
              任务工作台
            </p>
            <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-[3rem]">
              先看现在有没有异常，再决定先处理哪一类任务。
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
              {viewModel.summaryTitle} {viewModel.summaryDescription}
            </p>

            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sky-50">
                异常分组 {viewModel.anomalyGroups.length}
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sky-50">
                关注分组 {viewModel.attentionGroups.length}
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sky-50">
                下沉任务 {viewModel.hiddenJobCount}
              </span>
              {currentRepositoryId ? (
                <span className="rounded-full border border-sky-200/30 bg-sky-400/10 px-3 py-1 text-sky-100">
                  当前仓库上下文
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/15 bg-white/6 p-5 backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200/80">
              Plain Text
            </p>
            <div className="mt-3 space-y-1 font-mono text-xs text-sky-50">
              <p>当前视图：聚合摘要</p>
              <p>聚合组数：{viewModel.visibleGroupCount}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <HeroMetric
                label="异常任务"
                value={`${anomalyJobCount} 条`}
                helper="先处理失败、卡住和排队过久"
              />
              <HeroMetric
                label="重点关注"
                value={`${visibleAttentionJobCount} 条`}
                helper="正在占住链路或持续运行"
              />
              <HeroMetric
                label="已下沉"
                value={`${viewModel.hiddenJobCount} 条`}
                helper="完整任务流里继续展开"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            当前异常
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            失败、卡住和排队过久的任务先看这里。
          </h2>
        </div>

        {viewModel.anomalyGroups.length ? (
          <div className={anomalyGridClass}>
            {viewModel.anomalyGroups.map((group) => (
              <JobPriorityGroupCard
                key={group.key}
                group={group}
                isFocused={Boolean(focusedJobId && group.primaryJobId === focusedJobId)}
                isCurrentRepositoryContext={Boolean(currentRepositoryId)}
              />
            ))}
          </div>
        ) : (
          <QuietEmptyState
            title="当前无异常，仅有排队任务"
            description="首屏现在没有失败或卡住的任务，剩下的是排队中或正常运行中的任务，先看下面哪些会影响主链路。"
          />
        )}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            值得立即关注的任务
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            这些分组正在占住链路或积压得更明显。
          </h2>
        </div>

        {viewModel.attentionGroups.length ? (
          <div className={attentionGridClass}>
            {viewModel.attentionGroups.map((group) => (
              <JobPriorityGroupCard
                key={group.key}
                group={group}
                isFocused={Boolean(focusedJobId && group.primaryJobId === focusedJobId)}
                isCurrentRepositoryContext={Boolean(currentRepositoryId)}
              />
            ))}
          </div>
        ) : (
          showSteadyStateCard ? <SteadyStateAggregateCard /> : null
        )}

        {viewModel.hiddenGroupCount ? (
          <p className="text-sm leading-7 text-slate-500">
            另外还有 {viewModel.hiddenGroupCount} 组、共 {viewModel.hiddenJobCount} 条任务已经下沉到完整任务流里，只有全量排查时再展开。
          </p>
        ) : null}
      </section>
    </section>
  );
}

function JobPriorityGroupCard({
  group,
  isFocused,
  isCurrentRepositoryContext,
}: {
  group: JobPriorityGroup;
  isFocused: boolean;
  isCurrentRepositoryContext: boolean;
}) {
  return (
    <article
      data-job-aggregate-card="true"
      data-job-group-state={group.state}
      data-testid="jobs-aggregated-group"
      className={`rounded-[28px] border bg-white p-6 shadow-sm ${
        isFocused
          ? 'border-sky-300 ring-2 ring-sky-100'
          : group.state === 'FAILED'
            ? 'border-rose-200'
            : group.state === 'STALLED' || group.state === 'LONG_PENDING'
              ? 'border-amber-200'
              : 'border-slate-200'
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-700">
              {getStateLabel(group.state)}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
              {group.count} 个任务
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
              {group.impactLabel}
            </span>
            {isCurrentRepositoryContext ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
                当前仓库上下文
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {group.displayName}
          </h3>
          <p className="mt-3 max-w-3xl text-balance text-sm leading-7 text-slate-600">
            {group.summary}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            当前建议动作
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            {group.recommendation}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 md:grid-cols-3">
        <PriorityMetric label="任务类型" value={group.displayName} />
        <PriorityMetric label="最老等待" value={group.oldestAgeLabel} />
        <PriorityMetric label="主链路" value={group.impactLabel} />
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={group.detailHref}
          className="inline-flex items-center rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          查看任务详情
        </Link>
      </div>
    </article>
  );
}

function PriorityMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="rounded-[22px] border border-white/10 bg-white/8 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200/80">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{helper}</p>
    </article>
  );
}

function getStateLabel(state: JobPriorityGroup['state']) {
  switch (state) {
    case 'FAILED':
      return 'FAILED';
    case 'STALLED':
      return 'RUNNING · 超时';
    case 'LONG_PENDING':
      return 'PENDING · 等待过久';
    case 'RUNNING':
      return 'RUNNING';
    case 'PENDING':
      return 'PENDING';
    default:
      return state;
  }
}

function QuietEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-8 text-center shadow-sm">
      <h3 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h3>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
        {description}
      </p>
    </section>
  );
}

function SteadyStateAggregateCard() {
  return (
    <article
      data-job-aggregate-card="true"
      data-job-group-state="HEALTHY"
      data-testid="jobs-aggregated-group"
      className="rounded-[28px] border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-emerald-700">
              HEALTHY
            </span>
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-emerald-700">
              当前无异常
            </span>
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-emerald-700">
              主链路空闲
            </span>
          </div>

          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            当前没有需要首屏盯住的任务
          </h3>
          <p className="mt-3 max-w-3xl text-balance text-sm leading-7 text-slate-600">
            现在没有失败、卡住或排队过久的任务，刚刚清理过的陈旧记录也已经对账完成。首屏继续保留一张健康摘要卡，方便你确认系统现在确实在稳定状态，而不是页面没加载出来。
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
            当前建议动作
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-950">继续观察</p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 md:grid-cols-3">
        <PriorityMetric label="任务类型" value="健康状态摘要" />
        <PriorityMetric label="当前状态" value="没有异常或积压" />
        <PriorityMetric label="主链路" value="当前空闲" />
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/jobs"
          className="inline-flex items-center rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          查看完整任务流
        </Link>
      </div>
    </article>
  );
}
