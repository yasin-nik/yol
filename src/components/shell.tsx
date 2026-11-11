import Link from 'next/link';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/', label: 'رویدادها' },
  { href: '/my-tickets', label: 'بلیت‌های من' },
  { href: '/rules', label: 'قوانین' },
  { href: '/contact', label: 'تماس' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="text-xl font-extrabold text-primary">
          یول‌تیک
        </Link>
        <nav aria-label="منوی اصلی" className="flex flex-wrap gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2 text-sm font-medium hover:bg-background sm:px-3"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-4 px-4 py-6 text-sm text-muted">
        <span>یول‌تیک — فروش بلیت رویداد</span>
        <Link href="/rules" className="underline">
          قوانین
        </Link>
        <Link href="/privacy" className="underline">
          حریم خصوصی
        </Link>
        <Link href="/contact" className="underline">
          تماس و پشتیبانی
        </Link>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3"
      >
        رفتن به محتوا
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
