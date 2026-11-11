import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shell';
import { Scanner } from '@/components/check-in';
import { operatorSessions } from '@/server/check-in';
import { adminToken } from '@/server/web-auth';
import { DomainError } from '@/server/errors';
import { formatJalaliDate, formatJalaliTime, toFaDigits } from '@/lib/format';
import { logoutAction } from '@/app/admin/actions';

export default async function CheckInPage() {
  let sessions;
  try {
    sessions = await operatorSessions(await adminToken());
  } catch (event) {
    if (event instanceof DomainError) redirect('/admin/login');
    throw event;
  }
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/admin" className="text-primary underline">
            مدیریت
          </Link>
          <form action={logoutAction}>
            <button className="mt-3 min-h-11 rounded-lg border border-line px-4">
              خروج از حساب
            </button>
          </form>
          <h1 className="mt-3 text-2xl font-extrabold">کنترل ورود</h1>
          <p className="mt-2 text-muted">
            سانس را انتخاب کنید و QR بلیت را بخوانید. تأیید ورود به اتصال اینترنت نیاز دارد.
          </p>
        </div>
        {sessions.length ? (
          <Scanner
            sessions={sessions.map((entry) => ({
              id: entry.id,
              label: `${entry.title} · ${formatJalaliDate(entry.starts_at)} · ${formatJalaliTime(entry.starts_at)} · ${entry.venue}`,
              admitted: toFaDigits(entry.admitted),
            }))}
          />
        ) : (
          <p role="status">هنوز سانسی به شما واگذار نشده است.</p>
        )}
      </div>
    </PageShell>
  );
}
