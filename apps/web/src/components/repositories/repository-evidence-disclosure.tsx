'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

type RepositoryEvidenceDisclosureProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function RepositoryEvidenceDisclosure({
  title,
  description,
  children,
}: RepositoryEvidenceDisclosureProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details
      id="repository-evidence"
      className="group rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur"
      open={isOpen}
      onToggle={(event) => {
        setIsOpen((event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              证据区
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              {description}
            </p>
          </div>
          <span className="text-sm font-semibold text-slate-600 transition group-open:rotate-180">
            展开
          </span>
        </div>
      </summary>

      {isOpen ? <div className="mt-6 space-y-6">{children}</div> : null}
    </details>
  );
}
