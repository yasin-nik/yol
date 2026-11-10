import { cookies } from 'next/headers';
import Link from 'next/link';
import { PageShell } from '@/components/shell';
import { FakePaymentControls } from '@/components/payment-controls';
import { CUSTOMER_COOKIE } from '@/server/customer';
import { ownedPayment } from '@/server/payments';
import { paymentGateway, FakePaymentGateway } from '@/server/payment-gateway';
import { formatToman } from '@/lib/format';
import { notFound, redirect } from 'next/navigation';
import { DomainError } from '@/server/errors';

export default async function FakePaymentPage({
  params,
}: {
  params: Promise<{ authority: string }>;
}) {
  if (!(paymentGateway() instanceof FakePaymentGateway)) notFound();
  const { authority } = await params;
  let payment;
  try {
    payment = await ownedPayment((await cookies()).get(CUSTOMER_COOKIE)?.value, authority);
  } catch (e) {
    if (e instanceof DomainError && e.status === 401) redirect('/my-tickets');
    notFound();
  }
  return (
    <PageShell>
      <div className="mx-auto max-w-lg space-y-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
          درگاه آزمایشی · هیچ مبلغ واقعی دریافت نمی‌شود.
        </p>
        <h1 className="text-2xl font-extrabold">بررسی و پرداخت سفارش</h1>
        <p>مبلغ سفارش</p>
        <p className="text-3xl font-extrabold">{formatToman(Number(payment.amount_rial))}</p>
        <p className="text-sm text-muted">
          پس از بازگشت، نتیجه با استعلام سرور بررسی می‌شود. بلیت تنها پس از تأیید صادر می‌شود.
        </p>
        {payment.state === 'VERIFIED' ? (
          <p className="font-bold text-success">این پرداخت قبلاً تأیید شده است.</p>
        ) : (
          <FakePaymentControls authority={authority} />
        )}
        <Link
          href="/my-tickets"
          className="inline-flex min-h-11 items-center text-primary underline"
        >
          بازگشت به سفارش‌ها
        </Link>
      </div>
    </PageShell>
  );
}
