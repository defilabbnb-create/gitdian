import { Suspense } from 'react';
import { AppPageHero, AppPageShell } from '@/components/app/page-shell';
import { RuntimeFailurePanel } from '@/components/runtime-failure-panel';
import { SettingsBuildInfo } from '@/components/settings/settings-build-info';
import { SettingsForm } from '@/components/settings/settings-form';
import { SettingsHealthOverview } from '@/components/settings/settings-health-overview';
import { SettingsPrimaryConfigOverview } from '@/components/settings/settings-primary-config-overview';
import { SettingsRuntimeSummary } from '@/components/settings/settings-runtime-summary';
import { SettingsTechnicalDetails } from '@/components/settings/settings-technical-details';
import {
  getAiHealth,
  getSettings,
  getSettingsHealthWithOptions,
} from '@/lib/api/settings';
import { getFriendlyRuntimeError } from '@/lib/api/error-messages';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <AppPageShell tone="slate">
      <AppPageHero
        eyebrow="系统设置"
        title="配置页要先告诉你运行面貌，再允许你改真正会影响行为的参数。"
        description="这里把运行摘要、健康面板、关键配置和技术细节分层展开。先看当前状态，再决定改采集、分析还是 AI 路由，减少误操作。"
        tone="slate"
        chips={[
          '先看运行摘要',
          '再改关键配置',
          '技术细节独立折层',
        ]}
        stats={[
          {
            label: '修改原则',
            value: '先观察再落参',
            helper: '优先减少误改和相互影响。',
          },
          {
            label: '页面职责',
            value: '运行面 + 参数面',
            helper: '状态与配置分开展示，但同页决策。',
          },
        ]}
      />

      <div className="space-y-6">
        <Suspense fallback={<SettingsPageContentFallback />}>
          <SettingsPageContent />
        </Suspense>
      </div>
    </AppPageShell>
  );
}

async function SettingsPageContent() {
  const [settingsResult, healthResult, aiHealthResult] = await Promise.allSettled([
    getSettings({ timeoutMs: 6_000 }),
    getSettingsHealthWithOptions({ timeoutMs: 4_000 }),
    getAiHealth({ timeoutMs: 4_000 }),
  ]);

  const settings =
    settingsResult.status === 'fulfilled' ? settingsResult.value : null;
  const errorMessage =
    settingsResult.status === 'rejected'
      ? getFriendlyRuntimeError(
          settingsResult.reason,
          '配置读取失败，请稍后重试。',
        )
      : null;
  const health =
    healthResult.status === 'fulfilled' ? healthResult.value : null;
  const healthErrorMessage =
    healthResult.status === 'rejected'
      ? getFriendlyRuntimeError(
          healthResult.reason,
          '健康检查读取失败，请稍后重试。',
        )
      : null;
  const aiHealth =
    aiHealthResult.status === 'fulfilled' ? aiHealthResult.value : null;

  return (
    <>
      <SettingsRuntimeSummary
        settings={settings}
        health={health}
        aiHealth={aiHealth}
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SettingsHealthOverview
          health={health}
          aiHealth={aiHealth}
          healthErrorMessage={healthErrorMessage}
        />
        <SettingsPrimaryConfigOverview />
      </div>

      {settings ? (
        <section className="space-y-6">
          <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                配置修改
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                先按需展开，再改会直接影响系统行为的那一组。
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                GitHub 采集配置默认展开，因为它最常改变首页供给和采集节奏。Fast Filter 与 AI 路由默认折叠，只有当你需要改判断链路时再展开。
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
          <SettingsBuildInfo variant="compact" />
        </section>
      ) : (
        <RuntimeFailurePanel
          title="配置页暂时无法加载"
          message={errorMessage ?? '请检查后端 settings 模块是否正常运行。'}
          recoveryLabel="回到首页保留快捷入口"
          recoveryHref="/"
        />
      )}
    </>
  );
}

function SettingsPageContentFallback() {
  return (
    <>
      <div className="h-56 animate-pulse rounded-[32px] bg-white/80 shadow-sm" />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="h-72 animate-pulse rounded-[32px] bg-white/80 shadow-sm" />
        <div className="h-72 animate-pulse rounded-[32px] bg-white/80 shadow-sm" />
      </div>
      <div className="h-80 animate-pulse rounded-[32px] bg-white/80 shadow-sm" />
    </>
  );
}
