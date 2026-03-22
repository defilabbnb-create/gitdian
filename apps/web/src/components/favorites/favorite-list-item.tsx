'use client';

import Link from 'next/link';
import { useState } from 'react';
import { updateFavorite } from '@/lib/api/favorites';
import {
  FavoritePriority,
  FavoriteWithRepositorySummary,
  RepositoryOpportunityLevel,
} from '@/lib/types/repository';
import { FavoriteEditForm } from './favorite-edit-form';
import { UnfavoriteButton } from './unfavorite-button';

type FavoriteListItemProps = {
  favorite: FavoriteWithRepositorySummary;
};

const priorityTone: Record<FavoritePriority, string> = {
  HIGH: 'border-rose-200 bg-rose-50 text-rose-700',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700',
  LOW: 'border-slate-200 bg-slate-100 text-slate-600',
};

const opportunityTone: Record<
  NonNullable<RepositoryOpportunityLevel>,
  { label: string; className: string }
> = {
  HIGH: {
    label: '高潜力',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  MEDIUM: {
    label: '观察中',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  LOW: {
    label: '低优先',
    className: 'border-slate-200 bg-slate-100 text-slate-600',
  },
};

export function FavoriteListItem({ favorite }: FavoriteListItemProps) {
  const [currentFavorite, setCurrentFavorite] =
    useState<FavoriteWithRepositorySummary>(favorite);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const opportunity = currentFavorite.repository.opportunityLevel
    ? opportunityTone[currentFavorite.repository.opportunityLevel]
    : null;

  async function handleSave(payload: {
    note: string;
    priority: FavoritePriority;
  }) {
    setIsSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);

    try {
      const updated = await updateFavorite(currentFavorite.repositoryId, {
        note: payload.note || undefined,
        priority: payload.priority,
      });

      setCurrentFavorite(updated as FavoriteWithRepositorySummary);
      setIsEditing(false);
      setSaveMessage('收藏信息已更新。');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '保存收藏信息失败，请稍后重试。',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/repositories/${currentFavorite.repository.id}`}
              className="text-xl font-semibold tracking-tight text-slate-950 transition hover:text-slate-700"
            >
              {currentFavorite.repository.name}
            </Link>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {currentFavorite.repository.fullName}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityTone[currentFavorite.priority]}`}
            >
              Priority · {currentFavorite.priority}
            </span>
          </div>

          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            {currentFavorite.repository.description || '这个收藏项当前还没有公开描述。'}
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
              ★ {currentFavorite.repository.stars.toLocaleString()} stars
            </span>
            {currentFavorite.repository.language ? (
              <span className="rounded-full border border-slate-200 px-3 py-1 text-slate-600">
                {currentFavorite.repository.language}
              </span>
            ) : null}
            {opportunity ? (
              <span className={`rounded-full border px-3 py-1 ${opportunity.className}`}>
                {opportunity.label}
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 px-3 py-1 text-slate-500">
                创业等级待补充
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <button
            type="button"
            onClick={() => {
              setIsEditing((value) => !value);
              setSaveMessage(null);
              setErrorMessage(null);
            }}
            className="inline-flex min-w-24 items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {isEditing ? '收起编辑' : '编辑收藏'}
          </button>
          <UnfavoriteButton repositoryId={currentFavorite.repositoryId} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_100%)] px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            收藏备注
          </p>
          <p className="mt-4 line-clamp-4 text-sm leading-7 text-slate-300">
            {currentFavorite.note || '暂时还没有备注。可以在这里补充为什么收藏、准备怎么跟进、后续要验证什么。'}
          </p>
          {saveMessage ? (
            <p className="mt-4 text-xs font-medium text-emerald-300">{saveMessage}</p>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            收藏信息
          </p>
          <div className="mt-4 grid gap-2 text-sm text-slate-700">
            <p>
              <span className="font-semibold text-slate-900">Final Score：</span>
              {typeof currentFavorite.repository.finalScore === 'number'
                ? Math.round(currentFavorite.repository.finalScore)
                : '--'}
            </p>
            <p>
              <span className="font-semibold text-slate-900">收藏时间：</span>
              {formatDate(currentFavorite.createdAt)}
            </p>
            <p>
              <span className="font-semibold text-slate-900">更新时间：</span>
              {formatDate(currentFavorite.updatedAt)}
            </p>
          </div>
        </section>
      </div>

      {isEditing ? (
        <FavoriteEditForm
          favorite={currentFavorite}
          isSaving={isSaving}
          errorMessage={errorMessage}
          onCancel={() => {
            setIsEditing(false);
            setErrorMessage(null);
          }}
          onSave={handleSave}
        />
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
        <p className="text-sm text-slate-500">
          当前 favorites 接口尚未返回 ideaSummary / completeness / decision，后续可在不改当前页结构的前提下补充。
        </p>
        <Link
          href={`/repositories/${currentFavorite.repository.id}`}
          className="inline-flex items-center rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          查看详情
        </Link>
      </div>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
