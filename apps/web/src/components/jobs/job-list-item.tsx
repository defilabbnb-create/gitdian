'use client';

import Link from 'next/link';
import { useEffect, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelJobLog, retryJobLog } from '@/lib/api/job-logs';
import { JobLogItem } from '@/lib/types/repository';
import { JobStatusBadge } from './job-status-badge';

type JobListItemProps = {
  job: JobLogItem;
  currentRepositoryId?: string;
  isFocused?: boolean;
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return '--';
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
    return '暂无摘要';
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

export function JobListItem({
  job,
  currentRepositoryId,
  isFocused = false,
}: JobListItemProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(isFocused);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const relatedRepositoryId = extractRepositoryId(job);
  const isCurrentRepositoryContext =
    currentRepositoryId && relatedRepositoryId === currentRepositoryId;
  const canRetry =
    typeof job.canRetry === 'boolean'
      ? job.canRetry
      : job.jobStatus === 'FAILED' || job.jobStatus === 'SUCCESS';
  const canCancel =
    typeof job.canCancel === 'boolean'
      ? job.canCancel
      : job.jobStatus === 'PENDING';

  useEffect(() => {
    if (isFocused) {
      setIsExpanded(true);
    }
  }, [isFocused]);

  async function handleRetry() {
    setIsSubmitting(true);
    setFeedback(null);
    setErrorMessage(null);

    try {
      const nextTask = await retryJobLog(job.id);
      setFeedback(`已创建重试任务：${nextTask.jobId}`);

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '重试任务创建失败。',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    setIsSubmitting(true);
    setFeedback(null);
    setErrorMessage(null);

    try {
      await cancelJobLog(job.id);
      setFeedback('任务已取消。');

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '取消任务失败。',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article
      id={`job-${job.id}`}
      className={`rounded-[28px] border bg-white p-6 shadow-sm ${
        isFocused
          ? 'border-sky-300 ring-2 ring-sky-100'
          : 'border-slate-200'
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Job
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            {job.jobName}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
            {isCurrentRepositoryContext ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
                当前仓库
              </span>
            ) : null}
            {!currentRepositoryId && relatedRepositoryId ? (
              <Link
                href={`/jobs?repositoryId=${relatedRepositoryId}`}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 transition hover:border-slate-300 hover:bg-white"
              >
                仓库任务 · {relatedRepositoryId}
              </Link>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span>开始：{formatDateTime(job.startedAt)}</span>
            <span>结束：{formatDateTime(job.finishedAt)}</span>
          </div>
        </div>

        <JobStatusBadge status={job.jobStatus} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {isExpanded ? '收起详情' : '查看详情'}
        </button>
        {canRetry ? (
          <button
            type="button"
            onClick={handleRetry}
            disabled={isSubmitting}
            className="inline-flex rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? '处理中...' : 'Retry'}
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="inline-flex rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? '处理中...' : 'Cancel'}
          </button>
        ) : null}
      </div>

      {feedback ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {feedback}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Payload 摘要
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            {summarizeObject(job.payload)}
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Result 摘要
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            {summarizeObject(job.result)}
          </p>
        </section>
      </div>

      {job.errorMessage ? (
        <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
            Error
          </p>
          <p className="mt-3 text-sm leading-7 text-rose-700">{job.errorMessage}</p>
        </div>
      ) : null}

      {isExpanded ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Payload JSON
              </p>
              <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                {JSON.stringify(job.payload ?? null, null, 2)}
              </pre>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Result JSON
              </p>
              <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                {JSON.stringify(job.result ?? null, null, 2)}
              </pre>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <DetailMetric label="进度" value={`${job.progress ?? 0}%`} />
            <DetailMetric label="尝试次数" value={job.attempts ?? 0} />
            <DetailMetric label="重试次数" value={job.retryCount ?? 0} />
            <DetailMetric
              label="耗时"
              value={
                typeof job.durationMs === 'number'
                  ? `${Math.round(job.durationMs)} ms`
                  : '--'
              }
            />
          </div>

          {job.errorMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {job.errorMessage}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function DetailMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function extractRepositoryId(job: JobLogItem) {
  const payloadRepositoryId =
    job.payload && typeof job.payload.repositoryId === 'string'
      ? job.payload.repositoryId
      : null;

  if (payloadRepositoryId) {
    return payloadRepositoryId;
  }

  const repositoryIds =
    job.payload && Array.isArray(job.payload.repositoryIds)
      ? job.payload.repositoryIds
      : null;

  if (repositoryIds?.length && typeof repositoryIds[0] === 'string') {
    return repositoryIds[0];
  }

  const resultRepositoryId =
    job.result && typeof job.result.repositoryId === 'string'
      ? job.result.repositoryId
      : null;

  return resultRepositoryId;
}
