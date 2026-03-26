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
      <section
        id="build-info"
        data-settings-build-info="true"
        className="rounded-[20px] border border-emerald-200 bg-emerald-50/90 px-4 py-3 shadow-sm backdrop-blur"
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            当前构建版本
          </p>
          <p className="text-xs leading-6 text-emerald-900">
            先确认线上当前跑的是哪个前端构建，再判断页面是不是已经切到新版本。
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-1 font-mono text-sm text-emerald-950 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
          {buildInfoLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
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
