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
    href: '/',
    label: '项目列表',
    match: (pathname) => pathname === '/' || pathname.startsWith('/repositories'),
  },
  {
    href: '/favorites',
    label: '收藏页',
    match: (pathname) => pathname.startsWith('/favorites'),
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
    <nav className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
      {navItems.map((item) => {
        const isActive = item.match(pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
              isActive
                ? 'bg-slate-950 text-white shadow-sm shadow-slate-900/10'
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
