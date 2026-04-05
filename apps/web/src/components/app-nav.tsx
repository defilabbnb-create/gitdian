'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    href: '/repositories',
    label: '项目列表',
    match: (pathname) => pathname.startsWith('/repositories'),
  },
  {
    href: '/favorites',
    label: '收藏页',
    match: (pathname) => pathname.startsWith('/favorites'),
  },
  {
    href: '/cold-tools',
    label: '冷门工具池',
    match: (pathname) => pathname.startsWith('/cold-tools'),
  },
  {
    href: '/jobs',
    label: '任务页',
    match: (pathname) => pathname.startsWith('/jobs'),
  },
  {
    href: '/settings',
    label: '配置页',
    match: (pathname) => pathname.startsWith('/settings'),
  },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-full border border-white/70 bg-white/70 p-1.5 shadow-sm backdrop-blur">
      {navItems.map((item) => {
        const isActive = item.match(pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              isActive
                ? 'bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_50%,#0f766e_100%)] text-white shadow-md shadow-slate-900/15'
                : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
