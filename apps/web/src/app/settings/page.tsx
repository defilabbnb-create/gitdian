import Link from 'next/link';
import { SettingsBehaviorNotes } from '@/components/settings/settings-behavior-notes';
import { SettingsForm } from '@/components/settings/settings-form';
import { SettingsHealthPanel } from '@/components/settings/settings-health-panel';
import { getSettings, getSettingsHealth } from '@/lib/api/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  let settings = null;
  let errorMessage: string | null = null;
  let health = null;
  let healthErrorMessage: string | null = null;

  try {
    settings = await getSettings();
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : '配置读取失败，请稍后重试。';
  }

  try {
    health = await getSettingsHealth();
  } catch (error) {
    healthErrorMessage =
      error instanceof Error ? error.message : '健康检查读取失败，请稍后重试。';
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_58%,_rgba(8,47,73,0.88)_100%)] px-8 py-10 text-white shadow-xl shadow-slate-900/10">
          <div className="grid gap-10 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  System Settings
                </p>
                <Link
                  href="/"
                  className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  返回首页
                </Link>
              </div>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
                把采集、粗筛和本地 AI 路由的关键默认值收进一个地方。
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                这里优先管理 GitHub 采集参数、Fast Filter 阈值，以及 AI Router 的 provider、模型和 timeout。当前默认运行模式是本地 OMLX，数据库配置会覆盖默认值，但在配置表为空时系统仍然保持可用。
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <DashboardStat label="配置分组" value="3" helper="GitHub / Fast Filter / AI" />
              <DashboardStat label="默认 AI" value="OMLX" helper="本地模型优先，OpenAI 仅作可选增强" />
              <DashboardStat label="覆盖顺序" value="DB > ENV" helper="读不到时自动回退默认值" />
            </div>
          </div>
        </section>

        <SettingsHealthPanel
          initialHealth={health}
          initialError={healthErrorMessage}
        />

        <SettingsBehaviorNotes />

        {settings ? (
          <SettingsForm initialSettings={settings} />
        ) : (
          <section className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
              Load Failed
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-rose-950">
              配置页暂时无法加载
            </h2>
            <p className="mt-3 text-sm leading-7 text-rose-800">
              {errorMessage ?? '请检查后端 settings 模块是否正常运行。'}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function DashboardStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 px-5 py-5 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-300">{helper}</p>
    </div>
  );
}
