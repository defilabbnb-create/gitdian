import Link from 'next/link';

type RuntimeFailurePanelProps = {
  title: string;
  message: string;
  recoveryLabel?: string;
  recoveryHref?: string;
  diagnosticsLabel?: string;
};

export function RuntimeFailurePanel({
  title,
  message,
  recoveryLabel = '回到首页继续看可用内容',
  recoveryHref = '/',
  diagnosticsLabel = '如果这是本地环境，先确认 `api` 进程和 `NEXT_PUBLIC_API_BASE_URL` 指向的后端服务可达。',
}: RuntimeFailurePanelProps) {
  return (
    <section className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
        加载失败
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-rose-950">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-7 text-rose-800">{message}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={recoveryHref}
          className="inline-flex h-11 items-center justify-center rounded-full bg-rose-950 px-5 text-sm font-semibold text-white transition hover:bg-rose-900"
        >
          {recoveryLabel}
        </Link>
        <Link
          href="/jobs"
          className="inline-flex h-11 items-center justify-center rounded-full border border-rose-200 bg-white px-5 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
        >
          去任务页看队列状态
        </Link>
        <Link
          href="/settings"
          className="inline-flex h-11 items-center justify-center rounded-full border border-rose-200 bg-white px-5 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
        >
          去设置页看运行配置
        </Link>
      </div>

      <p className="mt-5 text-sm leading-6 text-rose-700">{diagnosticsLabel}</p>
    </section>
  );
}
