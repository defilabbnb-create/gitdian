export default function JobsLoading() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="space-y-6" data-testid="jobs-priority-board">
          <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_58%,_rgba(3,105,161,0.86)_100%)] px-7 py-8 text-white shadow-xl shadow-slate-900/10">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,360px)] xl:items-end">
              <div className="max-w-4xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200/70">
                  任务工作台
                </p>
                <div className="mt-3 h-10 w-full max-w-2xl animate-pulse rounded-2xl bg-white/10" />
                <div className="mt-4 h-16 w-full max-w-3xl animate-pulse rounded-3xl bg-white/10" />
              </div>
              <div className="rounded-[28px] border border-white/15 bg-white/6 p-5 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200/80">
                  Plain Text
                </p>
                <div className="mt-3 space-y-2 font-mono text-xs text-sky-50">
                  <p>当前视图：聚合摘要</p>
                  <p>聚合组数：加载中</p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <LoadingMetric />
                  <LoadingMetric />
                  <LoadingMetric />
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
            <div className="grid gap-4">
              <LoadingGroupCard />
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
            <div className="grid gap-4">
              <LoadingGroupCard />
            </div>
          </section>

          <section
            id="jobs-expanded-flow"
            data-testid="jobs-expanded-flow"
            data-jobs-expanded-flow="collapsed"
            className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  完整任务流
                </p>
                <div className="h-8 w-72 animate-pulse rounded-2xl bg-slate-100" />
                <div className="flex flex-wrap gap-2">
                  <div className="h-7 w-24 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-7 w-24 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-7 w-24 animate-pulse rounded-full bg-slate-100" />
                </div>
              </div>
              <div className="inline-flex w-full items-center justify-center rounded-full border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white sm:w-auto">
                展开完整任务流
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function LoadingMetric() {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/8 px-4 py-4">
      <div className="h-3 w-20 animate-pulse rounded-full bg-white/10" />
      <div className="mt-3 h-7 w-24 animate-pulse rounded-2xl bg-white/10" />
      <div className="mt-3 h-10 w-full animate-pulse rounded-2xl bg-white/10" />
    </div>
  );
}

function LoadingGroupCard() {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="w-full max-w-3xl space-y-3">
          <div className="h-6 w-52 animate-pulse rounded-full bg-slate-100" />
          <div className="h-8 w-64 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-16 w-full animate-pulse rounded-3xl bg-slate-100" />
        </div>
        <div className="h-20 w-full max-w-[200px] animate-pulse rounded-2xl bg-slate-100" />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </article>
  );
}
