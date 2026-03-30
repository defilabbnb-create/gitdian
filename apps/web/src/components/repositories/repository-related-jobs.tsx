import Link from 'next/link';
import { JobLogListResponse } from '@/lib/types/repository';
import { RepositoryRelatedJobItem } from '@/components/repositories/repository-related-job-item';

type RepositoryRelatedJobsProps = {
  repositoryId: string;
  jobs: JobLogListResponse | null;
  errorMessage?: string | null;
};

export function RepositoryRelatedJobs({
  repositoryId,
  jobs,
  errorMessage,
}: RepositoryRelatedJobsProps) {
  const signalSummary = summarizeJobSignals(jobs?.items ?? []);

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            关联任务
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            先看它到底停在哪，再决定要不要补跑。
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            这里先给一层任务信号摘要，再放最近执行记录，避免先看一大段 payload/result 才知道卡点。
          </p>
        </div>

        <Link
          href={`/jobs?repositoryId=${repositoryId}`}
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          去任务页继续查
        </Link>
      </div>

      {!errorMessage ? (
        <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            任务信号
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            {signalSummary.title}
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-700">
            {signalSummary.summary}
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-700">
            {signalSummary.nextStep}
          </p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-7 text-amber-800">
          <span className="font-semibold">关联任务暂不可用：</span>
          {errorMessage}
        </div>
      ) : null}

      {!errorMessage && !jobs?.items.length ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
          当前仓库还没有明确关联的任务记录。你可以先在详情页运行一次单仓库分析，或者去首页触发批量分析后再回来查看。
        </div>
      ) : null}

      {jobs?.items.length ? (
        <div className="mt-6 space-y-4">
          {jobs.items.slice(0, 5).map((job) => (
            <RepositoryRelatedJobItem key={job.id} job={job} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function summarizeJobSignals(items: JobLogListResponse['items']) {
  const failed = items.filter((job) => job.jobStatus === 'FAILED').length;
  const running = items.filter((job) => job.jobStatus === 'RUNNING').length;
  const pending = items.filter((job) => job.jobStatus === 'PENDING').length;
  const success = items.filter((job) => job.jobStatus === 'SUCCESS').length;
  const countSummary = `失败 ${failed} · 运行中 ${running} · 排队 ${pending} · 成功 ${success}`;

  if (failed > 0) {
    return {
      title: '当前有失败任务，先查失败原因。',
      summary: `最近关联任务里有失败记录。${countSummary}。`,
      nextStep: '先打开最近失败任务看错误信息，确认根因后再决定是否补跑。',
    };
  }

  if (running > 0) {
    return {
      title: '当前有任务在运行，先别重复补跑。',
      summary: `系统正在执行关联任务。${countSummary}。`,
      nextStep: '先等待当前运行结果，只有超时或失败时再进入补跑流程。',
    };
  }

  if (pending > 0) {
    return {
      title: '任务在排队，先观察队列是否推进。',
      summary: `当前有任务还在队列里等待。${countSummary}。`,
      nextStep: '如果长时间不推进，再去任务页查看队列和 worker 状态。',
    };
  }

  if (success > 0) {
    return {
      title: '最近执行成功，先核对结论是否已收敛。',
      summary: `最近关联任务都已完成。${countSummary}。`,
      nextStep: '如果结论仍不稳，再按缺失模块做定向补跑，不要整链路重跑。',
    };
  }

  return {
    title: '暂无执行信号。',
    summary: '当前仓库还没有可用的关联任务记录。',
    nextStep: '先在详情页执行一次分析，再回来判断是否需要补跑。',
  };
}
