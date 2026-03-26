export function SettingsPrimaryConfigOverview() {
  return (
    <section
      data-settings-primary-entry="true"
      className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        最常改配置入口
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        默认先看 GitHub 采集配置。
      </h2>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        当你想改变首页先抓什么、抓多少，以及采集后要不要先做降噪，先改这一组。Fast
        Filter 和 AI 路由默认折叠，按需再展开。
      </p>

      <a
        href="#settings-github"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        先看 GitHub 采集配置
      </a>

      <div className="mt-5 space-y-3 text-sm">
        <SummaryRow
          label="GitHub 采集配置"
          helper="默认展开，最直接影响首页供给和采集节奏。"
        />
        <SummaryRow
          label="Fast Filter 配置"
          helper="默认折叠，只有当你要调整降噪力度时再展开。"
        />
        <SummaryRow
          label="AI 路由与模型配置"
          helper="默认折叠，只有当你要调整判断链路时再展开。"
        />
      </div>
    </section>
  );
}

function SummaryRow({
  label,
  helper,
}: {
  label: string;
  helper: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{helper}</p>
    </div>
  );
}
