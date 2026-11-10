import Link from 'next/link';
import { PageShell } from '@/components/shell';
import { AdminForm, SessionForm } from '@/components/admin-forms';
import { adminCatalog } from '@/server/catalog';
import { requireAdminPage } from '@/server/web-auth';
import { formatJalaliDate, formatJalaliTime } from '@/lib/format';
import { logoutAction } from './actions';
import { adminOrders } from '@/server/admin-orders';
import { formatToman, toFaDigits } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const token = await requireAdminPage();
  const catalog = await adminCatalog(token);
  const orders = await adminOrders(token);
  return (
    <PageShell>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">مدیریت رویدادها</h1>
        <form action={logoutAction}>
          <button className="min-h-11 rounded-lg border border-line px-4">خروج</button>
        </form>
      </div>
      <p className="mb-6 text-sm text-muted">
        ۱. سالن و بخش‌ها را تعریف کنید. ۲. رویداد بسازید. ۳. سانس و قیمت‌ها را ثبت کنید. ۴. رویداد
        را منتشر کنید.
      </p>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold">۱. سالن جدید</h2>
          <AdminForm>
            <input type="hidden" name="action" value="venue" />
            <label className="form-label">
              نام سالن
              <input className="form-input" name="name" required maxLength={200} />
            </label>
            <label className="form-label">
              شهر
              <input className="form-input" name="city" required maxLength={200} />
            </label>
            <label className="form-label">
              نشانی
              <textarea className="form-input" name="address" required maxLength={1000} />
            </label>
            <label className="form-label">
              بخش‌ها
              <textarea
                className="form-input"
                name="sections"
                required
                rows={3}
                placeholder={'همکف | ۱۰ | ۲۰\nبالکن | ۵ | ۱۵'}
              />
              <span className="text-xs text-muted">
                هر خط: نام بخش | تعداد ردیف | صندلی هر ردیف. اعداد فارسی یا انگلیسی؛ ظرفیت کل تا
                ۱۰۰۰.
              </span>
            </label>
          </AdminForm>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">۲. رویداد جدید</h2>
          <AdminForm>
            <input type="hidden" name="action" value="event" />
            <label className="form-label">
              عنوان
              <input className="form-input" name="title" required maxLength={200} />
            </label>
            <label className="form-label">
              دسته
              <input className="form-input" name="category" required maxLength={200} />
            </label>
            <label className="form-label">
              توضیحات
              <textarea className="form-input" name="description" required maxLength={5000} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="form-label">
                سقف صندلی هر رزرو
                <input
                  className="form-input"
                  type="number"
                  name="maxSeats"
                  defaultValue={6}
                  min="1"
                  max="20"
                  required
                />
              </label>
              <label className="form-label">
                زمان رزرو (دقیقه)
                <input
                  className="form-input"
                  type="number"
                  name="holdMinutes"
                  defaultValue={10}
                  min="1"
                  max="30"
                  required
                />
              </label>
            </div>
          </AdminForm>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">۳. سانس جدید</h2>
          <SessionForm
            venues={catalog.venues}
            sections={catalog.sections}
            events={catalog.events}
          />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">۴. انتشار</h2>
          <div className="space-y-3">
            {!catalog.events.length && <p className="text-muted">هنوز رویدادی ثبت نشده.</p>}
            {catalog.events.map((event) => (
              <AdminForm
                key={event.id}
                submit={event.published ? 'برداشتن از انتشار' : 'انتشار رویداد'}
              >
                <h3 className="font-bold">{event.title}</h3>
                <p className="text-sm text-muted">{event.published ? 'منتشرشده' : 'پیش‌نویس'}</p>
                <input type="hidden" name="action" value="publish" />
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="published" value={String(!event.published)} />
                {event.published && (
                  <Link className="block text-primary underline" href={`/events/${event.id}`}>
                    مشاهده صفحه رویداد
                  </Link>
                )}
              </AdminForm>
            ))}
          </div>
        </section>
      </div>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">سفارش‌ها و پرداخت‌ها</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {orders.map((order) => (
            <article
              key={order.id}
              className="min-w-0 space-y-2 rounded-xl border border-line bg-surface p-4"
            >
              <h3 className="font-bold">{order.title}</h3>
              <p>
                {formatToman(Number(order.total_rial))} · {toFaDigits(order.ticket_count)} بلیت
              </p>
              <p className={order.status === 'REVIEW' ? 'font-bold text-warning' : ''}>
                {order.status === 'REVIEW'
                  ? 'نیازمند رسیدگی و استرداد دستی'
                  : order.status === 'PAID'
                    ? 'پرداخت موفق'
                    : order.status === 'FAILED'
                      ? 'پرداخت ناموفق'
                      : 'در انتظار پرداخت'}
              </p>
              <p className="break-all text-xs text-muted">سفارش: {order.id}</p>
              {order.reference && (
                <p className="break-all text-xs text-muted">مرجع درگاه: {order.reference}</p>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">سانس‌ها</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {catalog.sessions.map((session) => (
            <li className="rounded-xl border border-line bg-surface p-4" key={session.id}>
              <h3 className="font-bold">{session.title}</h3>
              <p>
                {session.venue} · {formatJalaliDate(session.starts_at)} ·{' '}
                {formatJalaliTime(session.starts_at)}
              </p>
              <Link
                className="inline-flex min-h-11 items-center text-primary underline"
                href={`/admin/sessions/${session.id}`}
              >
                مدیریت صندلی‌های سانس
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">آخرین عملیات ثبت‌شده</h2>
        <ul className="space-y-2 text-sm" dir="ltr">
          {catalog.logs.map((log, index) => (
            <li key={index} className="break-words rounded-lg border border-line p-3">
              {log.action} · {formatJalaliDate(log.created_at)} · {formatJalaliTime(log.created_at)}
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
