import { FetchRepositoriesResponse } from '@/lib/types/repository';

type GitHubFetchResultProps = {
  result: FetchRepositoriesResponse;
};

export function GitHubFetchResult({ result }: GitHubFetchResultProps) {
  return (
    <div className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
          本次模式：{result.mode === 'created' ? '最近创建项目' : '最近更新项目'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Requested" value={result.requested} />
        <Metric label="Processed" value={result.processed} />
        <Metric label="Created" value={result.created} />
        <Metric label="Updated" value={result.updated} />
        <Metric label="Failed" value={result.failed} />
      </div>

      {result.items.length ? (
        <div className="space-y-3">
          {result.items.slice(0, 6).map((item) => (
            <div
              key={`${item.githubRepoId}-${item.fullName}`}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {item.fullName}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {item.message}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                    item.action === 'created'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : item.action === 'updated'
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}
                >
                  {item.action}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}
