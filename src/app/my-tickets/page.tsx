import { cookies } from 'next/headers';
import Link from 'next/link';
import { PageShell } from '@/components/shell';
import { CustomerLogin, CustomerLogout } from '@/components/customer-login';
import { PaymentButton, PrintTickets } from '@/components/payment-controls';
import { StateBox } from '@/components/ui';
import { customerOrders } from '@/server/orders';
import { customerTickets } from '@/server/tickets';
import { CUSTOMER_COOKIE } from '@/server/customer';
import { DomainError } from '@/server/errors';
import { formatToman, toFaDigits } from '@/lib/format';
export const dynamic = 'force-dynamic';
export default async function MyTicketsPage() {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  let orders;
  try {
    orders = await customerOrders(token);
  } catch (error) {
    if (error instanceof DomainError && error.status === 401)
      return (
        <PageShell>
          <h1 className="mb-6 text-2xl font-extrabold">بلیت‌های من</h1>
          <CustomerLogin />
        </PageShell>
      );
    throw error;
  }
  const tickets = await customerTickets(token);
  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold">بلیت‌های من</h1>
          <p className="text-muted">سفارش‌ها و بلیت‌های این حساب</p>
        </div>
        <CustomerLogout />
      </div>
      {!!tickets.length && (
        <section className="mb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">بلیت‌های صادرشده ({toFaDigits(tickets.length)})</h2>
            <PrintTickets />
          </div>
          <p className="mb-5 text-sm text-muted print:hidden">
            هر صندلی یک بلیت مستقل دارد. کد بلیت را فقط هنگام ورود ارائه کنید.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {tickets.map((ticket) => (
              <article
                key={ticket.id}
                className="ticket-card min-w-0 rounded-2xl border border-line bg-surface p-5"
              >
                <p className="mb-3 inline-block rounded-full bg-success/10 px-3 py-1 text-sm font-bold text-success">
                  بلیت صادر شد
                </p>
                {process.env.PAYMENT_GATEWAY === 'fake' && (
                  <p className="mb-2 text-sm text-warning">بلیت آزمایشی — بدون پرداخت واقعی</p>
                )}
                <h3 className="text-lg font-bold">{ticket.title}</h3>
                <p className="mt-2">{ticket.venue}</p>
                <p className="text-sm text-muted">
                  {new Date(ticket.starts_at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}
                </p>
                <p className="mt-3 font-bold">{toFaDigits(ticket.label)}</p>
                {/* Authenticated dynamic SVG; Next Image optimization would make this private QR cacheable. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="mx-auto my-4 h-48 w-48"
                  width={192}
                  height={192}
                  src={'/api/tickets/' + ticket.id + '/qr'}
                  alt={'کد ورود بلیت ' + toFaDigits(ticket.label)}
                />
                <p className="break-all text-center text-xs text-muted">شناسه بلیت: {ticket.id}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="print:hidden">
        <h2 className="mb-4 text-xl font-bold">سفارش‌های من</h2>
        {!orders.length && (
          <StateBox kind="empty" title="هنوز سفارشی ندارید">
            <p>پس از انتخاب صندلی و ثبت سفارش، آن را اینجا می‌بینید.</p>
            <Link
              className="mt-3 inline-flex min-h-11 items-center text-primary underline"
              href="/"
            >
              دیدن رویدادها
            </Link>
          </StateBox>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {orders.map((order) => (
            <article
              id={'order-' + order.id}
              key={order.id}
              className="min-w-0 scroll-mt-24 space-y-4 rounded-2xl border border-line bg-surface p-6"
            >
              <h3 className="text-lg font-bold">{order.title}</h3>
              <p className="text-sm text-muted">
                {order.venue} ·{' '}
                {new Date(order.starts_at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}
              </p>
              <p
                className={
                  order.status === 'PAID'
                    ? 'font-bold text-success'
                    : order.status === 'REVIEW'
                      ? 'font-bold text-warning'
                      : ''
                }
              >
                وضعیت:{' '}
                {order.status === 'PAID'
                  ? 'پرداخت موفق'
                  : order.status === 'REVIEW'
                    ? 'نیازمند رسیدگی مدیر'
                    : order.status === 'FAILED'
                      ? 'پرداخت ناموفق'
                      : order.expired
                        ? 'رزرو منقضی‌شده'
                        : order.payment_state === 'UNKNOWN'
                          ? 'نتیجه پرداخت نامشخص؛ در حال بررسی'
                          : 'در انتظار پرداخت'}
              </p>
              {order.status === 'REVIEW' && (
                <p className="text-sm text-warning">
                  پرداخت تأیید شده اما صندلی قابل تخصیص نیست. بلیتی صادر نشده و رسیدگی و استرداد
                  توسط مدیر انجام می‌شود.
                </p>
              )}
              {order.payment_state === 'UNKNOWN' && (
                <p className="text-sm text-muted">
                  صندلی برای بررسی نگه داشته شده است. دوباره پرداخت نکنید؛ استعلام را تکرار کنید.
                </p>
              )}
              <ul className="space-y-2">
                {order.items.map((item: { label: string }, i: number) => (
                  <li key={i}>{toFaDigits(item.label)}</li>
                ))}
              </ul>
              <p className="font-bold">{formatToman(Number(order.total_rial))}</p>
              {order.status === 'PENDING' && !order.expired && (
                <PaymentButton orderId={order.id} authority={order.authority ?? undefined} />
              )}
              {(order.expired || order.status === 'FAILED') && (
                <Link
                  className="inline-flex min-h-11 items-center text-primary underline"
                  href={'/sessions/' + order.session_id}
                >
                  انتخاب دوباره صندلی
                </Link>
              )}
              <p className="break-all text-xs text-muted">شناسه سفارش: {order.id}</p>
            </article>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
