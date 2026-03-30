'use client';

import { useState } from 'react';

type RepositoryOriginalAnalysisDisclosureProps = {
  content: string;
};

export function RepositoryOriginalAnalysisDisclosure({
  content,
}: RepositoryOriginalAnalysisDisclosureProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="text-sm font-semibold text-slate-700"
      >
        {isOpen ? '收起原始分析' : '查看原始分析'}
      </button>

      {isOpen ? (
        <pre className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
          {content}
        </pre>
      ) : null}
    </div>
  );
}
