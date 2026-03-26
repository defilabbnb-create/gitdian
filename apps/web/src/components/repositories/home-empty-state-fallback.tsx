import Link from 'next/link';
import { HomeSecondaryLinks } from '@/components/repositories/home-runtime-status';
import { buildHomeEmptyStateViewModel } from '@/lib/home-empty-state-view-model';

export function HomeNewOpportunitiesFallback() {
  const emptyState = buildHomeEmptyStateViewModel({
    trackedCandidates: [],
  });

  return (
    <>
      <section
        id="focus-board"
        className="rounded-[40px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur md:p-8"
      >
        <div className="space-y-4">
          <div className="h-4 w-24 rounded-full bg-slate-200" />
          <div className="h-10 w-80 rounded-full bg-slate-200" />
          <div className="h-6 w-56 rounded-full bg-slate-200" />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/90 px-5 py-5 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            新机会
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            已经自动避开你验证失败的方向，剩下这些值得新开一轮判断。
          </h2>
        </div>

        <section
          data-home-empty-state="true"
          data-home-empty-shell="true"
          className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-5"
        >
          <p className="text-sm font-semibold text-slate-900">
            {emptyState.statusLabel}
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            {emptyState.guidanceLabel}
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={emptyState.primaryAction.href}
              data-home-empty-primary-cta="true"
              className="inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {emptyState.primaryAction.label}
            </Link>
            <p className="max-w-xl text-sm leading-6 text-slate-500">
              {emptyState.primaryAction.description}
            </p>
          </div>
        </section>
      </section>
    </>
  );
}

export function HomeOpportunityPoolFallback() {
  return (
    <section
      id="all-projects"
      className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur"
      data-opportunity-pool-shell="true"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            全部项目池
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            只有在你准备继续深挖时，再打开这一层。
          </h2>
        </div>

        <span className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 px-5 text-sm font-semibold text-slate-500">
          完整机会池正在准备
        </span>
      </div>
    </section>
  );
}

export function HomePageShellFallback() {
  return (
    <>
      <HomeNewOpportunitiesFallback />
      <HomeSecondaryLinks />
      <HomeOpportunityPoolFallback />
    </>
  );
}
