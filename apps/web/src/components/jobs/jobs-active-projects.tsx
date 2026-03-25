'use client';

import Link from 'next/link';
import { FAILURE_REASON_LABELS, SUCCESS_REASON_LABELS } from 'shared';
import { useEffect, useState } from 'react';
import {
  getActiveFollowUpEntries,
  getExecutionStatusLabel,
  getExecutionStatusTone,
  getFollowUpStageLabel,
  getFollowUpStageTone,
  getNextActionButtonLabel,
  type ActionLoopEntry,
  subscribeActionLoop,
} from '@/lib/action-loop';

export function JobsActiveProjects() {
  const [items, setItems] = useState<ActionLoopEntry[]>([]);

  useEffect(() => {
    const sync = () => setItems(getActiveFollowUpEntries(3));
    sync();
    return subscribeActionLoop(sync);
  }, []);

  if (!items.length) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          当前执行项目
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          这些项目已经进入跟进，先处理它们。
        </h2>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.repoId}
            className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-700">
                跟进任务
              </span>
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
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
              {item.headline}
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{item.reason}</p>
            {item.successReasons?.length ? (
              <p className="mt-3 text-sm leading-7 text-emerald-700">
                这是基于你最近做成的方向优先拉起来的：{item.successReasons
                  .slice(0, 2)
                  .map((reason) => SUCCESS_REASON_LABELS[reason])
                  .join('、')}
              </p>
            ) : item.failureReasons?.length ? (
              <p className="mt-3 text-sm leading-7 text-rose-700">
                最近这类方向容易卡住：{item.failureReasons
                  .slice(0, 2)
                  .map((reason) => FAILURE_REASON_LABELS[reason])
                  .join('、')}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`${item.detailPath}#next-steps`}
                className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {getNextActionButtonLabel(item)}
              </Link>
              <a
                href={item.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                去 GitHub
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
