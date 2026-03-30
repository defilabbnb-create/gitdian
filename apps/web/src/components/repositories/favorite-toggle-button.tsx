'use client';

import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createFavorite, removeFavorite } from '@/lib/api/favorites';

type FavoriteToggleButtonProps = {
  repositoryId: string;
  isFavorited: boolean;
};

export function FavoriteToggleButton({
  repositoryId,
  isFavorited,
}: FavoriteToggleButtonProps) {
  const router = useOptionalRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleToggle() {
    setIsPending(true);
    setErrorMessage(null);

    try {
      if (isFavorited) {
        await removeFavorite(repositoryId);
      } else {
        await createFavorite({ repositoryId });
      }

      startTransition(() => {
        router?.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '跟进清单操作失败，请稍后重试。',
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={`inline-flex min-w-24 items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
          isFavorited
            ? 'border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100'
            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {isPending ? '处理中...' : isFavorited ? '已在跟进清单' : '加入跟进清单'}
      </button>
      {errorMessage ? (
        <p className="max-w-48 text-right text-xs text-rose-600">{errorMessage}</p>
      ) : (
        <p className="max-w-48 text-right text-[11px] text-slate-500">
          跟进清单就在收藏页，状态会自动同步。
        </p>
      )}
    </div>
  );
}

function useOptionalRouter() {
  try {
    return useRouter();
  } catch {
    return null;
  }
}
