import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';

export const metadata: Metadata = {
  title: 'GitDian',
  description: 'GitHub 项目创业决策台，支持中文分析、分类筛选和任务跟进。',
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
