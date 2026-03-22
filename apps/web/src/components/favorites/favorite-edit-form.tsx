'use client';

import { FormEvent, useState } from 'react';
import {
  FavoritePriority,
  FavoriteWithRepositorySummary,
} from '@/lib/types/repository';

type FavoriteEditFormProps = {
  favorite: FavoriteWithRepositorySummary;
  isSaving: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSave: (payload: { note: string; priority: FavoritePriority }) => Promise<void>;
};

export function FavoriteEditForm({
  favorite,
  isSaving,
  errorMessage = null,
  onCancel,
  onSave,
}: FavoriteEditFormProps) {
  const [note, setNote] = useState(favorite.note ?? '');
  const [priority, setPriority] = useState<FavoritePriority>(favorite.priority);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({
      note: note.trim(),
      priority,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4"
    >
      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Priority
        </span>
        <select
          value={priority}
          disabled={isSaving}
          onChange={(event) => setPriority(event.target.value as FavoritePriority)}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Note
        </span>
        <textarea
          rows={4}
          value={note}
          disabled={isSaving}
          onChange={(event) => setNote(event.target.value)}
          placeholder="补充为什么收藏、准备怎么跟进、后续验证什么..."
          className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      {errorMessage ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? '保存中...' : '保存修改'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          取消
        </button>
      </div>
    </form>
  );
}
