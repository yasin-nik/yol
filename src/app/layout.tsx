import './globals.css';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';

export const metadata = { title: 'یول‌تیک' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonces require dynamic HTML, including otherwise static public pages.
  await headers();
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
