import { JobsPriorityBoard } from '@/components/jobs/jobs-priority-board';
import { getJobLogs } from '@/lib/api/job-logs';
import { normalizeJobLogListQuery } from '@/lib/types/repository';

const loadingQuery = normalizeJobLogListQuery({});

export default async function JobsLoading() {
  try {
    const jobs = await getJobLogs(loadingQuery, {
      timeoutMs: 4000,
    });

    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="space-y-6">
            <JobsPriorityBoard items={jobs.items} query={loadingQuery} />
            <section
              id="jobs-expanded-flow"
              data-testid="jobs-expanded-flow"
              data-jobs-expanded-flow="collapsed"
              className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    完整任务流
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    只有在你要全量排查时，再展开完整任务流。
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                    首屏先告诉你现在要不要处理；筛选、仓库上下文和整批任务历史都放到这一层。
                  </p>
                </div>
                <div className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                  展开完整任务流
                </div>
              </div>
            </section>
          </section>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="space-y-6" data-testid="jobs-priority-board">
            <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_58%,_rgba(3,105,161,0.86)_100%)] px-7 py-8 text-white shadow-xl shadow-slate-900/10">
              <div className="max-w-4xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/70">
                  任务工作台
                </p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-[3rem]">
                  先看现在有没有异常，再决定先处理哪一类任务。
                </h1>
                <p className="mt-4 text-sm leading-7 text-slate-200 md:text-base">
                  正在加载聚合摘要，稍后会替换成当前异常和最值得立即关注的任务分组。
                </p>
                <div className="mt-5 rounded-2xl border border-white/15 bg-white/5 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200/80">
                    Plain Text
                  </p>
                  <div className="mt-2 space-y-1 font-mono text-xs text-sky-50">
                    <p>当前视图：聚合摘要</p>
                    <p>聚合组数：加载中</p>
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
            </section>

            <section
              id="jobs-expanded-flow"
              data-testid="jobs-expanded-flow"
              data-jobs-expanded-flow="collapsed"
              className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    完整任务流
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    只有在你要全量排查时，再展开完整任务流。
                  </h2>
                </div>
              </div>
            </section>
          </section>
        </div>
      </main>
    );
  }
}
