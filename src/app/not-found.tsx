import Link from 'next/link';
import { PageShell } from '@/components/shell';

export default function NotFound() {
  return (
    <PageShell>
      <h1 className="text-2xl font-extrabold">صفحه پیدا نشد</h1>
      <Link href="/" className="mt-4 inline-block underline">
        بازگشت به رویدادها
      </Link>
    </PageShell>
  );
}
