import Link from 'next/link';
import { getCategoryDisplay } from '@/lib/repository-decision';
import { RadarDailySummaryRecord } from '@/lib/types/repository';
import { DailyRadarSummaryExportButton } from './daily-radar-summary-export-button';

type DailyRadarSummaryProps = {
  summary: RadarDailySummaryRecord | null;
  errorMessage?: string | null;
};

export function DailyRadarSummary({
  summary,
  errorMessage,
}: DailyRadarSummaryProps) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            今日创业雷达
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            今日自动摘要
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            每日自动把 GitHub 抓取、snapshot、深读和最终结论收成一页中文摘要，方便你快速看今天系统到底产出了什么，以及今天最值得你看什么项目。
          </p>
        </div>

        {summary ? <DailyRadarSummaryExportButton summary={summary} /> : null}
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-7 text-amber-800">
          <span className="font-semibold">今日摘要正在汇总：</span>
          {errorMessage}
        </div>
      ) : null}

      {!errorMessage && !summary ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
          还没有可展示的每日自动摘要。等系统继续自动跑一会儿，今天的抓取、snapshot 和深读结果会在这里自动汇总。
        </div>
      ) : null}

      {summary ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <SummaryStat label="今日抓取" value={summary.fetchedRepositories} />
            <SummaryStat label="今日 Snapshot" value={summary.snapshotGenerated} />
            <SummaryStat label="今日深读" value={summary.deepAnalyzed} />
            <SummaryStat label="值得做" value={summary.goodIdeas} tone="emerald" />
            <SummaryStat label="可以抄" value={summary.cloneCandidates} tone="amber" />
            <SummaryStat label="建议跳过" value={summary.ignoredIdeas} tone="rose" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    今日赚钱清单
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                    今天最值得赚钱的项目
                  </h3>
                </div>
                <Link
                  href="/?view=moneyFirst"
                  className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                >
                  查看机会池
                </Link>
              </div>

              {summary.topItems.slice(0, 4).length ? (
                <div className="mt-5 space-y-5">
                  <SummaryGroup
                    title="必做项目"
                    items={summary.topMustBuildItems?.slice(0, 3) ?? []}
                  />
                  <SummaryGroup
                    title="值得做"
                    items={summary.topHighValueItems?.slice(0, 4) ?? []}
                  />
                  <SummaryGroup
                    title="值得抄"
                    items={summary.topCloneableItems?.slice(0, 4) ?? []}
                  />
                </div>
              ) : (
                <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-5 text-sm leading-7 text-slate-600">
                  今天还没有沉淀出明确的“值得赚钱”项目，系统会随着后续 snapshot 和深读继续自动补充。
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                结构快照
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                今日机会分布与系统偏差
              </h3>
              {summary.latestClaudeAudit?.severity === 'HIGH' ? (
                <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">
                  <span className="font-semibold">今日系统判断偏差：</span>
                  {summary.latestClaudeAudit.headline ||
                    summary.latestClaudeAudit.summary}
                </div>
              ) : null}
              {summary.topCategories.length ? (
                <div className="mt-5 space-y-3">
                  {summary.topCategories.slice(0, 6).map((category) => {
                    const display = getCategoryDisplay(category.main, category.sub);

                    return (
                      <div
                        key={`${category.main}-${category.sub}`}
                        className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm"
                      >
                        <span className="font-medium text-slate-700">
                          {display.label}
                        </span>
                        <span className="text-slate-500">{category.count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-5 text-sm leading-7 text-slate-600">
                  今日分类数据还在汇总中。
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryGroup({
  title,
  items,
}: {
  title: string;
  items: RadarDailySummaryRecord['topItems'];
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <span>{title}</span>
      </div>
      <div className="space-y-4">
        {items.map((item, index) => {
          const category = getCategoryDisplay(
            item.category.main,
            item.category.sub,
          );
          const displaySummary =
            item.decisionSummary ?? {
              headlineZh: item.oneLinerZh,
              judgementLabelZh: '继续判断',
              verdictLabelZh: '可继续看',
              actionLabelZh: '继续观察',
              finalDecisionLabelZh: '继续判断',
              moneyPriorityLabelZh: item.moneyPriorityLabelZh,
              categoryLabelZh: category.label,
              recommendedMoveZh: item.recommendedMoveZh,
              worthDoingLabelZh: '继续观察',
              reasonZh: item.moneyPriorityReasonZh,
              targetUsersZh: item.targetUsersZh ?? '用户还不够清楚',
              monetizationSummaryZh:
                item.monetizationSummaryZh ?? '收费路径还不够清楚',
              sourceLabelZh: item.hasClaudeReview ? 'Claude 复核' : '系统判断',
            };

          return (
            <Link
              key={item.repositoryId}
              href={`/repositories/${item.repositoryId}`}
              className="block rounded-[24px] border border-slate-200 bg-white px-5 py-4 transition hover:border-slate-300 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <span>#{index + 1}</span>
                <span>{displaySummary.judgementLabelZh}</span>
                <span>{displaySummary.categoryLabelZh || category.label}</span>
                {item.hasManualOverride ? <span>已人工判断</span> : null}
              </div>
              <h4 className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
                {item.fullName}
              </h4>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {displaySummary.headlineZh}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                {displaySummary.reasonZh}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span>{displaySummary.moneyPriorityLabelZh}</span>
                <span>{displaySummary.recommendedMoveZh}</span>
                <span>{displaySummary.monetizationSummaryZh}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClasses =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : tone === 'rose'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className={`rounded-[24px] border px-4 py-4 ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
