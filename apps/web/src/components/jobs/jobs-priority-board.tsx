'use client';

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

  return (
    <section className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_58%,_rgba(3,105,161,0.86)_100%)] px-7 py-8 text-white shadow-xl shadow-slate-900/10">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/70">
            任务工作台
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-[3rem]">
            先看现在有没有异常，再决定先处理哪一类任务。
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-200 md:text-base">
            {viewModel.summaryTitle} {viewModel.summaryDescription}
          </p>
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
          <div className="grid gap-4 xl:grid-cols-2">
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
          <div className="grid gap-4 xl:grid-cols-2">
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
          <QuietEmptyState
            title="现在没有需要首屏盯住的运行中任务"
            description="如果你只是想回看上下文，可以直接展开完整任务流；首屏不再重复平铺正常排队任务。"
          />
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
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
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
