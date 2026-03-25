import Link from 'next/link';
import { AppNav } from '@/components/app-nav';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
              GD
            </span>
            <span className="space-y-0.5">
              <span className="block text-sm font-semibold tracking-[0.02em] text-slate-950">
                GitDian
              </span>
              <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                创业决策台
              </span>
            </span>
          </Link>

          <Link
            href="/settings"
            className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 lg:hidden"
          >
            配置页
          </Link>
        </div>

        <AppNav />

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/jobs"
            className="inline-flex items-center rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          >
            任务历史
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            系统配置
          </Link>
        </div>
      </div>
    </header>
  );
}
