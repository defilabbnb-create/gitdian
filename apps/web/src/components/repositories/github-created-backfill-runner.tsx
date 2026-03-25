'use client';

import Link from 'next/link';
import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { enqueueGitHubCreatedBackfill } from '@/lib/api/github';
import {
  BackfillCreatedRepositoriesRequest,
  EnqueuedTaskResponse,
} from '@/lib/types/repository';

const defaultConfig: BackfillCreatedRepositoriesRequest = {
  days: 365,
  runFastFilter: true,
  runIdeaSnapshot: true,
  runDeepAnalysis: true,
  deepAnalysisOnlyIfPromising: true,
  targetCategories: ['tools', 'ai', 'data', 'infra'],
};

export function GitHubCreatedBackfillRunner() {
  const router = useRouter();
  const [config, setConfig] =
    useState<BackfillCreatedRepositoriesRequest>(defaultConfig);
  const [isRunning, setIsRunning] = useState(false);
  const [task, setTask] = useState<EnqueuedTaskResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleRun() {
    setIsRunning(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const nextTask = await enqueueGitHubCreatedBackfill(config);
      setTask(nextTask);
      setSuccessMessage('365 天工具机会雷达任务已创建，正在后台逐天扫描并分层分析。');

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '雷达回溯任务创建失败，请稍后重试。',
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="space-y-4 rounded-[32px] border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Tool Opportunity Radar
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          扫描过去 365 天的新工具项目，先全量快照，再把大模型算力留给值得深读的候选。
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          这个入口会按天切片抓取 created 仓库，先全量生成中文点子快照，再把大模型深读集中在工具、AI、数据和基础设施方向里真正值得看的候选上。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="回溯天数">
          <input
            type="number"
            min={1}
            max={365}
            value={config.days ?? 365}
            disabled={isRunning}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                days: toOptionalNumber(event.target.value) ?? 365,
              }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
        </Field>

        <Field label="轻筛 + 深读策略">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600">
            默认覆盖 `tools / ai / data / infra`，并保持“全量 snapshot，只对 promising 候选深读”。
          </div>
        </Field>

        <ToggleField
          label="先跑 Fast Filter"
          checked={config.runFastFilter ?? true}
          disabled={isRunning}
          onChange={(checked) =>
            setConfig((current) => ({
              ...current,
              runFastFilter: checked,
            }))
          }
        />

        <ToggleField
          label="生成轻量点子快照"
          checked={config.runIdeaSnapshot ?? true}
          disabled={isRunning}
          onChange={(checked) =>
            setConfig((current) => ({
              ...current,
              runIdeaSnapshot: checked,
            }))
          }
        />

        <ToggleField
          label="对值得候选做深读"
          checked={config.runDeepAnalysis ?? true}
          disabled={isRunning}
          onChange={(checked) =>
            setConfig((current) => ({
              ...current,
              runDeepAnalysis: checked,
              deepAnalysisOnlyIfPromising: true,
            }))
          }
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning}
          className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? '雷达任务创建中...' : '启动 365 天工具机会雷达'}
        </button>
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
          创建后台任务，不阻塞首页
        </span>
      </div>

      {errorMessage ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      {task ? (
        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Radar Task Created
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                365 天工具机会雷达已进入后台队列
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                任务 ID：{task.jobId}。Worker 会按天滚动抓 created 仓库，先全量生成点子快照，再只对值得看的工具机会继续深读。
              </p>
            </div>

            <Link
              href={`/jobs?focusJobId=${task.jobId}#job-${task.jobId}`}
              className="inline-flex items-center rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              去任务页查看
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <select
        value={String(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === 'true')}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
      >
        <option value="true">开启</option>
        <option value="false">关闭</option>
      </select>
    </label>
  );
}

function toOptionalNumber(value: string) {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) ? undefined : parsedValue;
}
