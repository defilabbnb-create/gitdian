import Link from 'next/link';

export default function RepositoryNotFound() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Not Found
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          找不到这个仓库详情
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          这个仓库可能尚未入库，或者当前 ID 不存在。你可以先返回列表页重新选择项目。
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          回到机会首页
        </Link>
      </div>
    </main>
  );
}
