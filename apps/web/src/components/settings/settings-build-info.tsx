import { getWebBuildInfo } from '@/lib/build-info';

type SettingsBuildInfoProps = {
  variant?: 'compact' | 'full';
};

export function SettingsBuildInfo({
  variant = 'full',
}: SettingsBuildInfoProps) {
  const buildInfo = getWebBuildInfo();
  const buildInfoLines = [
    `Git SHA: ${buildInfo.gitSha}`,
    `Environment: ${buildInfo.environment}`,
    `Build Time: ${buildInfo.buildTime}`,
  ];

  if (variant === 'compact') {
    return (
      <section className="rounded-[24px] border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              当前构建版本
            </p>
            <p className="mt-2 text-sm leading-6 text-emerald-950">
              先看这里，直接确认线上当前跑的是哪个前端构建。
            </p>
          </div>

          <a
            href="#build-info"
            className="inline-flex items-center justify-center rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100"
          >
            查看完整构建信息
          </a>
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Plain Text
          </p>
          <div className="mt-3 space-y-1 font-mono text-sm text-emerald-950">
            {buildInfoLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="build-info"
      className="rounded-[28px] border border-slate-200 bg-white/75 p-5 shadow-sm backdrop-blur"
    >
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

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Plain Text
        </p>
        <div className="mt-3 space-y-1 font-mono text-sm text-slate-950">
          {buildInfoLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
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
