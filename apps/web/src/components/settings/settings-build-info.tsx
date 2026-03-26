import { getWebBuildInfo } from '@/lib/build-info';

export function SettingsBuildInfo() {
  const buildInfo = getWebBuildInfo();

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/75 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Build Info
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            当前前端构建标识
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            人工验收时只需要看这里，就能确认线上页面到底跑的是哪个构建版本。
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Git SHA
          </dt>
          <dd className="mt-2 font-mono text-sm text-slate-950">
            {buildInfo.gitSha}
          </dd>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Build Time
          </dt>
          <dd className="mt-2 font-mono text-sm text-slate-950">
            {buildInfo.buildTime}
          </dd>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Environment
          </dt>
          <dd className="mt-2 font-mono text-sm text-slate-950">
            {buildInfo.environment}
          </dd>
        </div>
      </dl>
    </section>
  );
}
