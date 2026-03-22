'use client';

import { FetchRepositoriesRequest } from '@/lib/types/repository';
import { SettingsPayload } from '@/lib/types/settings';

type GitHubFetchConfigProps = {
  value: FetchRepositoriesRequest;
  defaults?: SettingsPayload['github'] | null;
  disabled?: boolean;
  onChange: (value: FetchRepositoriesRequest) => void;
};

export function GitHubFetchConfig({
  value,
  defaults,
  disabled = false,
  onChange,
}: GitHubFetchConfigProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Field label="采集模式">
        <select
          value={value.mode ?? defaults?.search.defaultMode ?? 'updated'}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              mode: event.target.value as FetchRepositoriesRequest['mode'],
            })
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        >
          <option value="updated">最近更新项目</option>
          <option value="created">最近创建项目</option>
        </select>
      </Field>

      <Field label="关键词">
        <input
          value={value.query ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              query: event.target.value.trim() || undefined,
            })
          }
          placeholder="例如: productivity automation"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
      </Field>

      <Field label="排序">
        <select
          value={value.sort ?? defaults?.search.defaultSort ?? 'updated'}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              sort: event.target.value as FetchRepositoriesRequest['sort'],
            })
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        >
          <option value="updated">updated</option>
          <option value="stars">stars</option>
        </select>
      </Field>

      <Field label="顺序">
        <select
          value={value.order ?? defaults?.search.defaultOrder ?? 'desc'}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              order: event.target.value as FetchRepositoriesRequest['order'],
            })
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        >
          <option value="desc">desc</option>
          <option value="asc">asc</option>
        </select>
      </Field>

      <Field label="每页数量">
        <input
          type="number"
          min={1}
          max={50}
          value={value.perPage ?? defaults?.search.defaultPerPage ?? 10}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              perPage: toOptionalNumber(event.target.value),
            })
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
      </Field>

      <Field label="最低 Stars">
        <input
          type="number"
          min={0}
          value={value.starMin ?? defaults?.search.defaultStarMin ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              starMin: toOptionalNumber(event.target.value),
            })
          }
          placeholder="例如: 50"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
      </Field>

      <Field label="最高 Stars">
        <input
          type="number"
          min={0}
          value={value.starMax ?? defaults?.search.defaultStarMax ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              starMax: toOptionalNumber(event.target.value),
            })
          }
          placeholder="可留空"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
      </Field>

      <Field label="时间下限日期">
        <input
          type="date"
          value={value.pushedAfter ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              pushedAfter: event.target.value || undefined,
            })
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
        <p className="text-xs leading-6 text-slate-500">
          `updated` 模式按最近更新时间解释；`created` 模式会把它当作创建时间下限。
        </p>
      </Field>

      <Field label="语言">
        <input
          value={value.language ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              language: event.target.value.trim() || undefined,
            })
          }
          placeholder="TypeScript / Python"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
      </Field>

      <Field label="采集后粗筛">
        <select
          value={String(
            value.runFastFilter ?? defaults?.fetch.runFastFilterByDefault ?? false,
          )}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              runFastFilter: event.target.value === 'true',
            })
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        >
          <option value="true">开启</option>
          <option value="false">关闭</option>
        </select>
      </Field>
    </div>
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

function toOptionalNumber(value: string) {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) ? undefined : parsedValue;
}
