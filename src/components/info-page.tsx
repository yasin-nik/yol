import type { ReactNode } from 'react';
import { PageShell } from '@/components/shell';

export function InfoPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PageShell>
      <article className="mx-auto max-w-3xl rounded-xl border border-line bg-surface p-5 sm:p-8">
        <h1 className="mb-6 text-2xl font-extrabold">{title}</h1>
        <div className="space-y-4 break-words text-base leading-8">{children}</div>
      </article>
    </PageShell>
  );
}
