import { cookies } from 'next/headers';
import { PageShell } from '@/components/shell';
import { CustomerLogin, CustomerLogout } from '@/components/customer-login';
import { StateBox } from '@/components/ui';
import { customerOrders } from '@/server/orders';
import { CUSTOMER_COOKIE } from '@/server/customer';
import { DomainError } from '@/server/errors';
import { formatToman } from '@/lib/format';
export const dynamic = 'force-dynamic';
export default async function MyTicketsPage() {
  let orders;
  try {
    orders = await customerOrders((await cookies()).get(CUSTOMER_COOKIE)?.value);
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
  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">بلیت‌های من</h1>
          <p className="text-muted">سفارش‌ها و بلیت‌های این حساب</p>
        </div>
        <CustomerLogout />
      </div>
      {!orders.length && (
        <StateBox kind="empty" title="هنوز سفارشی ندارید">
          پس از انتخاب صندلی و ثبت سفارش، آن را اینجا می‌بینید.
        </StateBox>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {orders.map((order) => (
          <article
            id={'order-' + order.id}
            key={order.id}
            className="min-w-0 space-y-4 rounded-2xl border border-line bg-surface p-6"
          >
            <h2 className="text-lg font-bold">{order.title}</h2>
            <p className="text-sm text-muted">
              {order.venue} ·{' '}
              {new Date(order.starts_at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}
            </p>
            <p>
              وضعیت:{' '}
              {order.status === 'PENDING'
                ? 'در انتظار پرداخت'
                : order.status === 'PAID'
                  ? 'پرداخت موفق'
                  : order.status === 'REVIEW'
                    ? 'نیازمند رسیدگی مدیر'
                    : 'پرداخت ناموفق'}
            </p>
            <ul className="space-y-2">
              {order.items.map((item: { label: string }, i: number) => (
                <li key={i}>{item.label}</li>
              ))}
            </ul>
            <p className="font-bold">{formatToman(Number(order.total_rial))}</p>
            <p className="break-all text-xs text-muted">شناسه سفارش: {order.id}</p>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
