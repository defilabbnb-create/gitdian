'use client';

export function SettingsBehaviorNotes() {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            关键运行规则
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            这几条规则最容易直接改变系统今天会怎么跑。
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          先记住这三条，基本就能判断系统今天会先抓什么、异常时怎么兜底、粗筛会不会提前挡住项目。
        </p>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <NoteCard
          label="GitHub 默认模式"
          title="决定首页先看到新项目还是活跃项目"
          description="如果默认模式设为“最近创建项目”，首页的一键采集会优先去抓新项目；如果设为“最近更新项目”，则更偏向持续活跃仓库。高级选项仍然可以逐次覆盖。"
        />
        <NoteCard
          label="AI Fallback"
          title="决定异常时会不会自动降级"
          description="当前系统默认使用本地 OMLX 处理 Completeness、Idea Fit 和 Idea Extract。只有你显式开启 fallback 时，AI Router 才会在主 provider 失败后尝试备用 provider，不会默认双跑。"
        />
        <NoteCard
          label="Fast Filter"
          title="决定系统怎么先降噪再继续分析"
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
