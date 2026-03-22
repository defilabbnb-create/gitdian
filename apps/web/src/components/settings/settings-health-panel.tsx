'use client';

import { useState } from 'react';
import { getSettingsHealth } from '@/lib/api/settings';
import { SettingsHealthPayload } from '@/lib/types/settings';
import { SettingsHealthItem } from './settings-health-item';

type SettingsHealthPanelProps = {
  initialHealth: SettingsHealthPayload | null;
  initialError?: string | null;
};

export function SettingsHealthPanel({
  initialHealth,
  initialError = null,
}: SettingsHealthPanelProps) {
  const [health, setHealth] = useState<SettingsHealthPayload | null>(initialHealth);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleRefresh() {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const nextHealth = await getSettingsHealth();
      setHealth(nextHealth);
      setSuccessMessage('健康状态已重新检测。');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '健康检查失败，请稍后重试。',
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            System Health
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            快速确认数据库、GitHub 和 AI provider 当前是否可用。
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            首次打开配置页时会自动加载一次。当前默认运行模式是本地 OMLX，所以只要本地模型就绪，系统主链路就可以工作；OpenAI 未配置会被视为可选增强，而不是整页阻塞。
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? '检测中...' : '重新检测'}
        </button>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      {health?.ai.omlx.ok ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          本地 AI 已就绪。当前系统默认会优先使用 OMLX 跑 Completeness、Idea Fit 和 Idea Extract。
        </p>
      ) : null}

      {health ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <SettingsHealthItem
            label="Database"
            ok={health.database.ok}
            latencyMs={health.database.latencyMs}
            error={health.database.error}
          />
          <SettingsHealthItem
            label="GitHub API"
            ok={health.github.ok}
            latencyMs={health.github.latencyMs}
            meta={`Token：${health.github.hasToken ? '已配置' : '未配置'}`}
            error={health.github.error}
          />
          <SettingsHealthItem
            label="AI / OMLX"
            ok={health.ai.omlx.ok}
            latencyMs={health.ai.omlx.latencyMs}
            meta={`Model：${health.ai.omlx.model ?? '--'}`}
            error={health.ai.omlx.error}
          />
          <SettingsHealthItem
            label="AI / OpenAI"
            ok={health.ai.openai.ok}
            latencyMs={health.ai.openai.latencyMs}
            meta={`Model：${health.ai.openai.model ?? '--'}`}
            error={health.ai.openai.error}
            tone="optional"
          />
        </div>
      ) : (
        <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600">
          当前还没有可展示的健康检查结果，请点击“重新检测”发起检查。
        </div>
      )}
    </section>
  );
}
