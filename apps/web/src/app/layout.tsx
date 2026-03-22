import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';

export const metadata: Metadata = {
  title: 'GitDian',
  description: 'GitHub 创业机会发现系统 - 工程骨架',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
