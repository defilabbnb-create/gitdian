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
      setSuccessMessage('运行检查已更新。');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '运行检查失败，请稍后重试。',
      );
    } finally {
      setIsLoading(false);
    }
  }

  const githubMeta = health
    ? [
        `Token：${health.github.hasToken ? '已配置' : '未配置'}`,
        `模式：${
          health.github.anonymousFallback
            ? '匿名'
            : health.github.usingMultiToken
              ? '多 Token'
              : '单 Token'
        }`,
        `池大小：${health.github.tokenPoolSize}`,
        health.github.lastKnownRateLimitStatus?.limited
          ? `最近限流：token #${
              health.github.lastKnownRateLimitStatus.tokenIndex ?? '--'
            }`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            运行检查
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            只有当你要排查为什么没跑起来时，再看这一层。
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            这里主要用来确认数据抓取、本地判断和可选增强是不是正常。默认先看系统行为，不需要一上来就盯工程健康。
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? '检查中...' : '刷新运行检查'}
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

      {health ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <SettingsHealthItem
            label="数据库"
            ok={health.database.ok}
            latencyMs={health.database.latencyMs}
            error={health.database.error}
          />
          <SettingsHealthItem
            label="GitHub 接口"
            ok={health.github.ok}
            latencyMs={health.github.latencyMs}
            meta={githubMeta ?? undefined}
            error={health.github.error}
          />
          <SettingsHealthItem
            label="本地判断"
            ok={health.ai.omlx.ok}
            latencyMs={health.ai.omlx.latencyMs}
            meta={`Model：${health.ai.omlx.model ?? '--'}`}
            error={health.ai.omlx.error}
          />
          <SettingsHealthItem
            label="可选增强"
            ok={health.ai.openai.ok}
            latencyMs={health.ai.openai.latencyMs}
            meta={`Model：${health.ai.openai.model ?? '--'}`}
            error={health.ai.openai.error}
            tone="optional"
          />
        </div>
      ) : (
        <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600">
          现在还没有可展示的运行检查结果，需要时再点“重新检查”。
        </div>
      )}
    </section>
  );
}
