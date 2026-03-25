import { SettingsForm } from '@/components/settings/settings-form';
import { SettingsRuntimeSummary } from '@/components/settings/settings-runtime-summary';
import { SettingsTechnicalDetails } from '@/components/settings/settings-technical-details';
import { getAiHealth, getSettings, getSettingsHealth } from '@/lib/api/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  let settings = null;
  let errorMessage: string | null = null;
  let health = null;
  let healthErrorMessage: string | null = null;
  let aiHealth = null;

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

  try {
    aiHealth = await getAiHealth({ timeoutMs: 4_000 });
  } catch {
    aiHealth = null;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <SettingsRuntimeSummary
          settings={settings}
          health={health}
          aiHealth={aiHealth}
        />

        {settings ? (
          <section className="space-y-6">
            <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  核心运行模式配置
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                  先调会直接改变系统行为的配置。
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  这里先放会直接影响采集入口、粗筛和 AI 路由的关键默认值。先决定系统接下来怎么跑，再决定要不要下钻排查。
                </p>
              </div>
              <div className="mt-6">
                <SettingsForm initialSettings={settings} />
              </div>
            </section>
            <SettingsTechnicalDetails
              health={health}
              healthErrorMessage={healthErrorMessage}
            />
          </section>
        ) : (
          <section className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
              加载失败
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
