import type { ReactNode } from 'react';
import { SAMPLE_NOTICE } from '@/lib/sample-data';

export function SampleBadge() {
  return (
    <p role="note" className="inline-block rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
      {SAMPLE_NOTICE}
    </p>
  );
}

export function StateBox({
  kind,
  title,
  children,
}: {
  kind: 'loading' | 'empty' | 'error' | 'success';
  title: string;
  children?: ReactNode;
}) {
  const tone = {
    loading: 'text-muted',
    empty: 'text-muted',
    error: 'text-danger',
    success: 'text-success',
  }[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border border-dashed border-line bg-surface p-8 text-center ${tone}`}
    >
      <p className="font-bold">{title}</p>
      {children ? <div className="mt-2 text-sm">{children}</div> : null}
    </div>
  );
}

export function StatusPill({ status }: { status: 'ON_SALE' | 'SOLD_OUT' | 'UPCOMING' }) {
  const map = {
    ON_SALE: ['در حال فروش', 'bg-success/10 text-success'],
    SOLD_OUT: ['تمام شد', 'bg-danger/10 text-danger'],
    UPCOMING: ['به‌زودی', 'bg-primary/10 text-primary'],
  } as const;
  const [label, cls] = map[status];
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${cls}`}>
      {label}
    </span>
  );
}
