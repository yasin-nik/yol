import './globals.css';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';

export const metadata = {
  title: 'یول‌تیک',
  icons: { icon: { url: '/brand/yol-logo.png', type: 'image/png' } },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonces require dynamic HTML, including otherwise static public pages.
  await headers();
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
