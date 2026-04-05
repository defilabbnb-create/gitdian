import Link from 'next/link';
import { AppNav } from '@/components/app-nav';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-[rgba(250,250,252,0.82)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-[18px] border border-slate-900/10 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#0f766e_100%)] text-sm font-semibold text-white shadow-lg shadow-slate-900/15">
              GD
            </span>
            <span className="space-y-0.5">
              <span className="block text-sm font-semibold tracking-[0.08em] text-slate-950">
                GitDian
              </span>
              <span className="block text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Signal Desk
              </span>
            </span>
          </Link>

          <div className="hidden rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs text-slate-600 shadow-sm md:flex md:items-center md:gap-2">
            <span className="inline-flex size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
            采集、分析、决策同屏
          </div>
        </div>

        <AppNav />
      </div>
    </header>
  );
}
