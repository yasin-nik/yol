import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'یول‌تیک' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
