import Link from 'next/link';
import { JobStatusBadge } from '@/components/jobs/job-status-badge';
import { getJobDisplayName } from '@/components/jobs/job-display';
import { JobLogItem } from '@/lib/types/repository';

type RecentJobItemProps = {
  job: JobLogItem;
};

export function RecentJobItem({ job }: RecentJobItemProps) {
  const href = `/jobs?focusJobId=${job.id}#job-${job.id}`;

  return (
    <Link
      href={href}
      className="block rounded-[24px] border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100/70"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {getJobDisplayName(job.jobName)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span>开始于：{formatDateTime(job.startedAt)}</span>
            <span>结束于：{formatDateTime(job.finishedAt)}</span>
          </div>
        </div>

        <JobStatusBadge status={job.jobStatus} />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <SummaryBlock
          title="执行信息"
          text={summarizeObject(job.result)}
        />
        <SummaryBlock
          title={job.errorMessage ? '失败原因' : '输入信息'}
          text={job.errorMessage ?? summarizeObject(job.payload)}
          tone={job.errorMessage ? 'rose' : 'slate'}
        />
      </div>
    </Link>
  );
}

function SummaryBlock({
  title,
  text,
  tone = 'slate',
}: {
  title: string;
  text: string;
  tone?: 'slate' | 'rose';
}) {
  return (
    <section
      className={`rounded-2xl border px-4 py-4 ${
        tone === 'rose'
          ? 'border-rose-200 bg-rose-50'
          : 'border-slate-200 bg-white'
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-[0.16em] ${
          tone === 'rose' ? 'text-rose-600' : 'text-slate-500'
        }`}
      >
        {title}
      </p>
      <p
        className={`mt-3 text-sm leading-7 ${
          tone === 'rose' ? 'text-rose-700' : 'text-slate-700'
        }`}
      >
        {text}
      </p>
    </section>
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
