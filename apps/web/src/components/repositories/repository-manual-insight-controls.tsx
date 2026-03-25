'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateRepositoryManualInsight } from '@/lib/api/repositories';
import {
  RepositoryInsightAction,
  RepositoryInsightVerdict,
  RepositoryManualOverrideRecord,
} from '@/lib/types/repository';

type RepositoryManualInsightControlsProps = {
  repositoryId: string;
  manualOverride?: RepositoryManualOverrideRecord | null;
};

const verdictOptions: Array<{
  value: RepositoryInsightVerdict;
  label: string;
}> = [
  { value: 'GOOD', label: '👍 好点子' },
  { value: 'OK', label: '🤔 一般' },
  { value: 'BAD', label: '👎 不建议' },
];

const actionOptions: Array<{
  value: RepositoryInsightAction;
  label: string;
}> = [
  { value: 'BUILD', label: '值得做' },
  { value: 'CLONE', label: '可以抄' },
  { value: 'IGNORE', label: '跳过' },
];

export function RepositoryManualInsightControls({
  repositoryId,
  manualOverride,
}: RepositoryManualInsightControlsProps) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<RepositoryInsightVerdict | ''>(
    manualOverride?.verdict ?? '',
  );
  const [action, setAction] = useState<RepositoryInsightAction | ''>(
    manualOverride?.action ?? '',
  );
  const [note, setNote] = useState(manualOverride?.note ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const trimmedNote = note.trim();

  async function handleSave() {
    if (!verdict && !action && !trimmedNote) {
      setErrorMessage('至少选择一个判断、动作，或写一句备注。');
      setSuccessMessage('');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await updateRepositoryManualInsight(repositoryId, {
        ...(verdict ? { verdict } : {}),
        ...(action ? { action } : {}),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });

      setSuccessMessage('已保存你的判断，正在刷新...');
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '保存人工判断失败，请稍后再试。',
      );
    } finally {
      setIsSaving(false);
    }
  }

  function toggleVerdict(nextVerdict: RepositoryInsightVerdict) {
    setVerdict((currentValue) => (currentValue === nextVerdict ? '' : nextVerdict));
  }

  function toggleAction(nextAction: RepositoryInsightAction) {
    setAction((currentValue) => (currentValue === nextAction ? '' : nextAction));
  }

  return (
    <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            校准判断
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            如果你不同意系统结论，可以在这里直接覆盖 verdict / action，并留一句备注。
          </p>
        </div>
        {manualOverride?.updatedAt ? (
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            最近保存：{formatManualDate(manualOverride.updatedAt)}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {verdictOptions.map((option) => (
          <ToggleChip
            key={option.value}
            active={verdict === option.value}
            label={option.label}
            onClick={() => toggleVerdict(option.value)}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {actionOptions.map((option) => (
          <ToggleChip
            key={option.value}
            active={action === option.value}
            label={option.label}
            onClick={() => toggleAction(option.value)}
          />
        ))}
      </div>

      <div className="mt-4">
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="你为什么不同意系统判断（可选）"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? '保存中...' : '保存我的判断'}
        </button>

        {manualOverride?.verdict || manualOverride?.action || manualOverride?.note ? (
          <span className="text-sm font-medium text-slate-600">🧠 已存在人工覆盖</span>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="mt-3 text-sm text-rose-700">{errorMessage}</p>
      ) : null}

      {successMessage ? (
        <p className="mt-3 text-sm text-emerald-700">{successMessage}</p>
      ) : null}
    </div>
  );
}

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'border-slate-950 bg-slate-950 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );
}

function formatManualDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
