'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  getFollowUpStageLabel,
  getFollowUpStageTone,
  getNextActionButtonLabel,
  getExecutionStatusLabel,
  getExecutionStatusTone,
  getActiveExecutionEntries,
  type ActionLoopEntry,
  subscribeActionLoop,
} from '@/lib/action-loop';

export function HomeActiveProjectsStrip() {
  const [items, setItems] = useState<ActionLoopEntry[]>([]);

  useEffect(() => {
    const sync = () => setItems(getActiveExecutionEntries(3));
    sync();
    return subscribeActionLoop(sync);
  }, []);

  if (!items.length) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/90 px-5 py-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            今天你正在推进
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            先回到已经开始推进的项目，不要丢节奏。
          </h2>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.repoId}
            className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span
                className={`rounded-full border px-3 py-1 ${getExecutionStatusTone(
                  item.actionStatus,
                )}`}
              >
                {getExecutionStatusLabel(item.actionStatus)}
              </span>
              <span
                className={`rounded-full border px-3 py-1 ${getFollowUpStageTone(
                  item.followUpStage,
                )}`}
              >
                当前阶段 · {getFollowUpStageLabel(item.followUpStage)}
              </span>
            </div>
            <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
              {item.headline}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`${item.detailPath}#next-steps`}
                className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {getNextActionButtonLabel(item)}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
