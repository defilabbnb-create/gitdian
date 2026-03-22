'use client';

import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { removeFavorite } from '@/lib/api/favorites';

type UnfavoriteButtonProps = {
  repositoryId: string;
};

export function UnfavoriteButton({ repositoryId }: UnfavoriteButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRemove() {
    setIsPending(true);
    setErrorMessage(null);

    try {
      await removeFavorite(repositoryId);
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '取消收藏失败，请稍后重试。',
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        className="inline-flex min-w-24 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? '处理中...' : '取消收藏'}
      </button>
      {errorMessage ? (
        <p className="max-w-52 text-right text-xs text-rose-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
