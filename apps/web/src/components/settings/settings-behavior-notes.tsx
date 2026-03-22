export function SettingsBehaviorNotes() {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Behavior Notes
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            配置影响的是默认行为，不会把系统变成硬编码流程机。
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          这里补的是三个最容易被误解的系统语义：GitHub 默认采集模式、AI fallback，以及 Fast Filter 的实际作用范围。
        </p>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <NoteCard
          label="GitHub Default Mode"
          title="默认采集模式决定入口语义"
          description="如果默认模式设为“最近创建项目”，首页的一键采集会优先去抓新项目；如果设为“最近更新项目”，则更偏向持续活跃仓库。高级选项仍然可以逐次覆盖。"
        />
        <NoteCard
          label="AI Fallback"
          title="默认先跑本地，Fallback 现在是可选兜底"
          description="当前系统默认使用本地 OMLX 处理 Completeness、Idea Fit 和 Idea Extract。只有你显式开启 fallback 时，AI Router 才会在主 provider 失败后尝试备用 provider，不会默认双跑。"
        />
        <NoteCard
          label="Fast Filter"
          title="粗筛是启发式信号，不是硬阻断"
          description="Fast Filter 主要用于快速降噪和标记优先级。即使 roughPass=false，也不代表项目一定没价值；分析编排层仍然可以继续跑后续 AI 分析。"
        />
      </div>
    </section>
  );
}

function NoteCard({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,0.92)_100%)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
    </article>
  );
}
