import Link from 'next/link';
import { JobLogItem } from '@/lib/types/repository';
import { JobStatusBadge } from '@/components/jobs/job-status-badge';
import { getJobDisplayName } from '@/components/jobs/job-display';

type RepositoryRelatedJobItemProps = {
  job: JobLogItem;
};

export function RepositoryRelatedJobItem({
  job,
}: RepositoryRelatedJobItemProps) {
  const repositoryId =
    job.payload && typeof job.payload.repositoryId === 'string'
      ? job.payload.repositoryId
      : job.result && typeof job.result.repositoryId === 'string'
        ? job.result.repositoryId
        : null;
  const detailsHref = repositoryId
    ? `/jobs?repositoryId=${repositoryId}&focusJobId=${job.id}#job-${job.id}`
    : `/jobs?focusJobId=${job.id}#job-${job.id}`;

  return (
    <article className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            关联任务
        </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            {getJobDisplayName(job.jobName)}
          </h3>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
            <span>开始于：{formatDateTime(job.startedAt)}</span>
            <span>结束于：{formatDateTime(job.finishedAt)}</span>
          </div>
        </div>

        <JobStatusBadge status={job.jobStatus} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={detailsHref}
          className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          去任务页继续查
        </Link>
        <span className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
          最近更新：{formatDateTime(job.updatedAt)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <SummaryCard title="执行输入" text={summarizeObject(job.payload)} />
        <SummaryCard title="执行结果" text={summarizeObject(job.result)} />
      </div>

      {job.errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {job.errorMessage}
        </div>
      ) : null}

      <details className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          展开执行信息
        </summary>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <JsonPanel title="执行输入 JSON" value={job.payload ?? null} />
          <JsonPanel title="执行结果 JSON" value={job.result ?? null} />
        </div>
      </details>
    </article>
  );
}

function SummaryCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </p>
      <p className="mt-3 text-sm leading-7 text-slate-700">{text}</p>
    </section>
  );
}

function JsonPanel({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </p>
      <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '待记录';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function summarizeObject(value?: Record<string, unknown> | null) {
  if (!value || Object.keys(value).length === 0) {
    return '暂无关键信息';
  }

  return Object.entries(value)
    .slice(0, 4)
    .map(([key, currentValue]) => {
      if (Array.isArray(currentValue)) {
        return `${key}: ${currentValue.length} item(s)`;
      }

      if (
        currentValue &&
        typeof currentValue === 'object' &&
        !Array.isArray(currentValue)
      ) {
        return `${key}: {…}`;
      }

      return `${key}: ${String(currentValue)}`;
    })
    .join(' · ');
}
