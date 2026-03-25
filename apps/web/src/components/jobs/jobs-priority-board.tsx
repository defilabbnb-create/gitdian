'use client';

import { JobLogItem } from '@/lib/types/repository';
import { JobsActiveProjects } from './jobs-active-projects';
import { JobListItem } from './job-list-item';

type JobsPriorityBoardProps = {
  items: JobLogItem[];
  currentRepositoryId?: string;
  focusedJobId?: string;
};

const LONG_PENDING_MINUTES = 20;
const LONG_RUNNING_MINUTES = 25;

export function JobsPriorityBoard({
  items,
  currentRepositoryId,
  focusedJobId,
}: JobsPriorityBoardProps) {
  const now = Date.now();
  const anomalies = prioritizeVisibleJobs(items.filter((job) => isAnomaly(job, now))).slice(0, 6);
  const anomalyIds = new Set(anomalies.map((job) => job.id));
  const keyRunningJobs = prioritizeVisibleJobs(
    items
    .filter((job) => !anomalyIds.has(job.id))
    .filter((job) => isKeyRunningJob(job))
  ).slice(0, 6);

  return (
    <section className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_58%,_rgba(3,105,161,0.86)_100%)] px-7 py-8 text-white shadow-xl shadow-slate-900/10">
        <div className="flex flex-col gap-4">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/70">
              异常与执行台
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-[3rem]">
              先看现在有没有问题，再决定先处理哪个。
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-200 md:text-base">
              先看异常和关键运行中任务，完整任务流后置。
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            当前异常
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            先看失败、卡住或排队过久的任务。
          </h2>
        </div>

        {anomalies.length ? (
          <div className="space-y-4">
            {anomalies.map((job) => (
              <JobListItem
                key={job.id}
                job={job}
                currentRepositoryId={currentRepositoryId}
                isFocused={focusedJobId === job.id}
                variant="priority"
              />
            ))}
          </div>
        ) : (
          <QuietEmptyState
            title="现在没有需要立刻处理的异常任务"
            description="最近这批任务没有明显失败或卡住，先看关键运行中的任务就够了。"
          />
        )}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            关键运行中任务
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            这些任务正在占资源，值得优先盯住。
          </h2>
        </div>

        {keyRunningJobs.length ? (
          <div className="space-y-4">
            {keyRunningJobs.map((job) => (
              <JobListItem
                key={job.id}
                job={job}
                currentRepositoryId={currentRepositoryId}
                isFocused={focusedJobId === job.id}
                variant="priority"
              />
            ))}
          </div>
        ) : (
          <QuietEmptyState
            title="现在没有需要盯住的关键运行中任务"
            description="如果刚触发过分析，可以稍后再回来看；否则说明当前系统运行比较平稳。"
          />
        )}
      </section>

      <JobsActiveProjects />
    </section>
  );
}

function isAnomaly(job: JobLogItem, now: number) {
  if (job.jobStatus === 'FAILED') {
    return true;
  }

  const ageMinutes = getAgeMinutes(job.startedAt ?? job.createdAt, now);

  if (job.jobStatus === 'PENDING' && ageMinutes >= LONG_PENDING_MINUTES) {
    return true;
  }

  if (job.jobStatus === 'RUNNING' && ageMinutes >= LONG_RUNNING_MINUTES) {
    return true;
  }

  return false;
}

function isKeyRunningJob(job: JobLogItem) {
  if (!(job.jobStatus === 'RUNNING' || job.jobStatus === 'PENDING')) {
    return false;
  }

  if (!job.parentJobId) {
    return true;
  }

  const name = job.jobName.toLowerCase();
  const importantKeywords = ['backfill', 'deep', 'claude', 'analysis', 'radar'];

  return importantKeywords.some((keyword) => name.includes(keyword));
}

function prioritizeVisibleJobs(items: JobLogItem[]) {
  return [...items].sort((left, right) => {
    const parentDelta = Number(Boolean(left.parentJobId)) - Number(Boolean(right.parentJobId));

    if (parentDelta !== 0) {
      return parentDelta;
    }

    const leftWeight = getJobPriorityWeight(left.jobName);
    const rightWeight = getJobPriorityWeight(right.jobName);

    if (rightWeight !== leftWeight) {
      return rightWeight - leftWeight;
    }

    return (
      new Date(right.startedAt ?? right.createdAt).getTime() -
      new Date(left.startedAt ?? left.createdAt).getTime()
    );
  });
}

function getJobPriorityWeight(jobName: string) {
  const normalized = jobName.toLowerCase();

  if (normalized.includes('backfill') || normalized.includes('radar')) {
    return 4;
  }

  if (normalized.includes('claude') || normalized.includes('deep')) {
    return 3;
  }

  if (normalized.includes('idea_extract') || normalized.includes('idea_fit')) {
    return 2;
  }

  if (normalized.includes('idea_snapshot')) {
    return 1;
  }

  return 0;
}

function getAgeMinutes(value: string, now: number) {
  const time = new Date(value).getTime();

  if (Number.isNaN(time)) {
    return 0;
  }

  return Math.floor((now - time) / (60 * 1000));
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
