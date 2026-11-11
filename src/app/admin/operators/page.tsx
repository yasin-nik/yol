import Link from 'next/link';
import { PageShell } from '@/components/shell';
import { AdminForm } from '@/components/admin-forms';
import { requireAdminPage } from '@/server/web-auth';
import { operatorSessions } from '@/server/check-in';
import { operatorAction } from './actions';
import { formatJalaliDate, formatJalaliTime } from '@/lib/format';
export default async function OperatorsPage() {
  const token = await requireAdminPage();
  const sessions = await operatorSessions(token);
  return (
    <PageShell>
      <div className="mx-auto max-w-xl space-y-5">
        <Link href="/admin" className="text-primary underline">
          مدیریت
        </Link>
        <h1 className="text-2xl font-extrabold">مسئول کنترل ورود</h1>
        <p className="text-muted">
          هر حساب فقط به سانس انتخاب‌شده دسترسی دارد. ورود از صفحه ورود مدیر انجام می‌شود.
        </p>
        <AdminForm action={operatorAction} submit="ساخت حساب مسئول ورود">
          <label className="form-label">
            ایمیل
            <input
              className="form-input"
              name="email"
              type="email"
              dir="ltr"
              required
              maxLength={254}
              autoComplete="off"
            />
          </label>
          <label className="form-label">
            رمز عبور (حداقل ۱۲ نویسه)
            <input
              className="form-input"
              name="password"
              type="password"
              dir="ltr"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <label className="form-label">
            سانس
            <select className="form-input" name="sessionId" required>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {formatJalaliDate(s.starts_at)} · {formatJalaliTime(s.starts_at)}
                </option>
              ))}
            </select>
          </label>
        </AdminForm>
      </div>
    </PageShell>
  );
}
