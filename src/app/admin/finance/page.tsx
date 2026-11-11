import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { PageShell } from '@/components/shell';
import { AdminForm } from '@/components/admin-forms';
import { requireAdminPage } from '@/server/web-auth';
import { financeDashboard } from '@/server/finance';
import { formatJalaliDate, formatJalaliTime, toFaDigits } from '@/lib/format';
import { financeAction } from './actions';

export const dynamic = 'force-dynamic';
const money = (value: string | number) => `${BigInt(value).toLocaleString('fa-IR')} ریال`;
function Operation({ name, eventId }: { name: string; eventId?: string }) {
  return (
    <>
      <input type="hidden" name="operation" value={name} />
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
    </>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; page?: string }>;
}) {
  const token = await requireAdminPage();
  const params = await searchParams;
  const data = await financeDashboard(token, params.eventId, {
    page: params.page ? Number(params.page) : 1,
  });
  return (
    <PageShell>
      <div className="mb-6 space-y-3">
        <Link href="/admin" className="text-primary underline">
          بازگشت به مدیریت
        </Link>
        <h1 className="text-2xl font-extrabold">مالی و گزارش فروش</h1>
        <p className="text-muted">
          مبالغ این صفحه به ریال است. استرداد و تسویه، ثبت عملیات دستی هستند و انتقال پول انجام
          نمی‌دهند.
        </p>
        {process.env.PAYMENT_GATEWAY === 'fake' && (
          <p role="note" className="rounded-xl bg-warning/10 p-3 text-warning">
            محیط آزمایشی — تمام پرداخت‌ها و گزارش‌های فعلی آزمایشی‌اند.
          </p>
        )}
      </div>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="form-label min-w-0 flex-1">
          رویداد
          <select className="form-input" name="eventId" defaultValue={data.selected}>
            {data.events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-12 rounded-xl bg-primary px-5 font-bold text-on-primary">
          نمایش گزارش
        </button>
      </form>
      {!data.report ? (
        <p role="status">برای مشاهده گزارش، ابتدا یک رویداد بسازید.</p>
      ) : (
        <>
          <h2 className="mb-4 break-words text-lg font-bold">
            {data.events.find((event) => event.id === data.selected)?.title}
          </h2>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['دریافت تأییدشده', money(data.report.gross)],
              ['کنارگذاشته‌شده برای استرداد', money(data.report.refund_reserved)],
              ['بازگشت وجه ثبت‌شده', money(data.report.refunded)],
              ['مانده قابل تسویه', money(data.report.available)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-line bg-surface p-5">
                <p className="text-sm text-muted">{label}</p>
                <p className="mt-3 break-words text-xl font-extrabold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          {(data.report.unconfigured > 0 || data.report.review_orders > 0) && (
            <p role="status" className="mb-6 rounded-xl border border-warning p-4 text-warning">
              {toFaDigits(data.report.unconfigured)} سفارش بدون محاسبه و{' '}
              {toFaDigits(data.report.review_orders)} سفارش نیازمند رسیدگی. تا تکمیل رسیدگی، ثبت
              تسویه مجاز نیست.
            </p>
          )}
          <section className="mb-8 rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-4 text-lg font-bold">جزئیات سهم‌ها</h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              {[
                ['کارمزد پلتفرم', money(data.report.commission)],
                ['مالیات روی کارمزد', money(data.report.tax)],
                ['سایر کسورات', money(data.report.deduction)],
                ['سهم برگزارکننده', money(data.report.net)],
                ['تسویه ثبت‌شده خالص', money(data.report.settled)],
                [
                  'ورود ثبت‌شده / بلیت صادرشده',
                  `${toFaDigits(data.report.admitted)} / ${toFaDigits(data.report.tickets)}`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="mt-1 font-bold">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-muted">
              سهم‌ها برای فروش معتبر و بدون درخواست استرداد است. تعداد بلیت‌ها و ورودها سابقه کل را
              نشان می‌دهد. مانده منفی یعنی بدهی ثبت‌شده پس از استرداد.
            </p>
            <Link
              className="mt-4 inline-flex min-h-11 items-center text-primary underline"
              href={`/api/admin/finance/export?eventId=${data.selected}`}
            >
              دریافت گزارش CSV
            </Link>
          </section>
          <div className="mb-8 grid items-start gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 text-lg font-bold">تنظیم محاسبات رویداد</h2>
              <p className="mb-3 text-sm text-muted">
                نسخه جدید برای فروش‌های آینده و فروش‌های فاقد محاسبه اعمال می‌شود. محاسبات قبلی
                محفوظ می‌ماند. درصد مالیات روی کارمزد است؛ نرخ قانونی پیش‌فرضی تعیین نشده.
              </p>
              <AdminForm action={financeAction} submit="ثبت نسخه محاسبات">
                <Operation name="terms" eventId={data.selected} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="form-label">
                    کارمزد درصدی
                    <input
                      className="form-input"
                      type="number"
                      name="commissionPercent"
                      min={0}
                      max={100}
                      step="0.01"
                      defaultValue={data.terms ? data.terms.commission_bps / 100 : undefined}
                      required
                    />
                  </label>
                  <label className="form-label">
                    کارمزد ثابت هر سفارش (ریال)
                    <input
                      className="form-input"
                      type="number"
                      name="fixedRial"
                      min={0}
                      max={9000000000000}
                      step={1}
                      defaultValue={data.terms?.fixed_rial}
                      required
                    />
                  </label>
                  <label className="form-label">
                    مالیات کارمزد (درصد)
                    <input
                      className="form-input"
                      type="number"
                      name="taxPercent"
                      min={0}
                      max={100}
                      step="0.01"
                      defaultValue={data.terms ? data.terms.tax_bps / 100 : undefined}
                      required
                    />
                  </label>
                  <label className="form-label">
                    سایر کسورات هر سفارش (ریال)
                    <input
                      className="form-input"
                      type="number"
                      name="deductionRial"
                      min={0}
                      max={9000000000000}
                      step={1}
                      defaultValue={data.terms?.deduction_rial}
                      required
                    />
                  </label>
                </div>
                <p className="text-sm text-muted">
                  اعشار ریال رو به پایین گرد می‌شود و مجموع کسورات از دریافتی بیشتر نمی‌شود. این فرم
                  قیمت بلیت مشتری را تغییر نمی‌دهد.
                </p>
              </AdminForm>
            </section>
            <section>
              <h2 className="mb-3 text-lg font-bold">ثبت تسویه دستی</h2>
              <p className="mb-3 text-sm text-muted">
                پس از برگزاری همه سانس‌ها، پرداخت انجام‌شده به برگزارکننده را با مرجع یکتا ثبت کنید.
              </p>
              <AdminForm action={financeAction} submit="ثبت سابقه تسویه">
                <Operation name="settlement" eventId={data.selected} />
                <input type="hidden" name="id" value={randomUUID()} />
                <label className="form-label">
                  مبلغ (ریال)
                  <input
                    className="form-input"
                    name="amountRial"
                    type="number"
                    min={1}
                    max={180000000000000}
                    step={1}
                    required
                  />
                </label>
                <label className="form-label">
                  نام دریافت‌کننده
                  <input
                    className="form-input"
                    name="recipient"
                    minLength={3}
                    maxLength={200}
                    required
                  />
                </label>
                <label className="form-label">
                  مرجع پرداخت
                  <input
                    className="form-input"
                    name="reference"
                    minLength={3}
                    maxLength={200}
                    required
                  />
                </label>
                <label className="form-label">
                  توضیح
                  <input
                    className="form-input"
                    name="note"
                    minLength={3}
                    maxLength={1000}
                    required
                  />
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="performed" required />
                  رویداد برگزار شده و پرداخت فوق را انجام داده‌ام.
                </label>
              </AdminForm>
            </section>
          </div>
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-bold">سفارش‌ها و استرداد</h2>
            <p className="mb-4 text-sm text-muted">
              ۲۰۰ سفارش در هر صفحه. استرداد کل سفارش، همه بلیت‌های آن را بلافاصله نامعتبر می‌کند؛
              صندلی برای فروش مجدد آزاد نمی‌شود. پس از بازگشت واقعی وجه، مرجع را ثبت کنید.
            </p>
            {!data.orders?.length && <p role="status">هنوز سفارشی ثبت نشده است.</p>}
            <div className="grid items-start gap-5 lg:grid-cols-2">
              {data.orders?.map((order) => (
                <article
                  key={order.id}
                  className="min-w-0 space-y-3 rounded-2xl border border-line bg-surface p-5"
                >
                  <h3 className="font-bold">
                    {money(order.total_rial)} · {toFaDigits(order.ticket_count)} بلیت
                  </h3>
                  <p className="break-all text-xs text-muted" dir="ltr">
                    {order.id}
                  </p>
                  <p className="font-bold">
                    {order.refund_id
                      ? order.completion_id
                        ? 'وجه بازگردانده شد'
                        : 'در انتظار بازگشت وجه؛ بلیت نامعتبر'
                      : order.status === 'PAID'
                        ? 'پرداخت تأییدشده'
                        : order.status === 'REVIEW'
                          ? 'نیازمند رسیدگی'
                          : order.status === 'FAILED'
                            ? 'پرداخت ناموفق'
                            : 'در انتظار پرداخت'}
                  </p>
                  {order.reference && (
                    <p className="break-all text-sm">مرجع درگاه: {order.reference}</p>
                  )}
                  {!!order.admitted && (
                    <p className="text-warning">
                      {toFaDigits(order.admitted)} ورود قبلاً ثبت شده است؛ پیش از استرداد بررسی
                      کنید.
                    </p>
                  )}
                  {order.refund_id ? (
                    <>
                      <p className="text-sm">علت: {order.reason}</p>
                      {order.completion_id ? (
                        <p className="break-all text-sm">
                          مرجع بازگشت وجه: {order.refund_reference}
                        </p>
                      ) : (
                        <AdminForm action={financeAction} submit="ثبت بازگشت وجه انجام‌شده">
                          <Operation name="complete" />
                          <input type="hidden" name="refundId" value={order.refund_id} />
                          <label className="form-label">
                            مرجع بازگشت وجه
                            <input
                              className="form-input"
                              name="reference"
                              minLength={3}
                              maxLength={200}
                              required
                            />
                          </label>
                          <label className="flex min-h-11 items-center gap-3 text-sm">
                            <input type="checkbox" name="performed" required />
                            کل مبلغ را به مشتری بازگردانده‌ام.
                          </label>
                        </AdminForm>
                      )}
                    </>
                  ) : (
                    order.state === 'VERIFIED' && (
                      <details className="rounded-xl border border-line p-3">
                        <summary className="min-h-11 cursor-pointer font-bold text-danger">
                          ثبت درخواست استرداد کل سفارش
                        </summary>
                        <AdminForm
                          action={financeAction}
                          submit="نامعتبر کردن بلیت‌ها و ثبت درخواست"
                        >
                          <Operation name="refund" />
                          <input type="hidden" name="orderId" value={order.id} />
                          <label className="form-label">
                            علت استرداد
                            <textarea
                              className="form-input"
                              name="reason"
                              minLength={3}
                              maxLength={1000}
                              required
                            />
                          </label>
                        </AdminForm>
                      </details>
                    )
                  )}
                  <details className="rounded-xl border border-line p-3">
                    <summary className="min-h-11 cursor-pointer">ثبت پیگیری پشتیبانی</summary>
                    <AdminForm action={financeAction} submit="ثبت پیگیری">
                      <Operation name="support" />
                      <input type="hidden" name="orderId" value={order.id} />
                      <label className="form-label">
                        شرح پیگیری
                        <textarea
                          className="form-input"
                          name="message"
                          minLength={3}
                          maxLength={1000}
                          required
                        />
                      </label>
                    </AdminForm>
                  </details>
                </article>
              ))}
            </div>
          </section>
          <section className="mb-8">
            <h2 className="mb-4 text-xl font-bold">سوابق تسویه</h2>
            {!data.settlements?.length && <p role="status">تسویه‌ای ثبت نشده است.</p>}
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {data.settlements?.map((entry) => (
                <article
                  key={entry.id}
                  className="min-w-0 space-y-3 rounded-xl border border-line bg-surface p-5"
                >
                  <h3 className="font-bold">
                    {money(entry.amount_rial)} · {entry.recipient}
                  </h3>
                  <p>
                    {formatJalaliDate(entry.created_at)} · {formatJalaliTime(entry.created_at)}
                  </p>
                  <p className="break-words">مرجع: {entry.reference}</p>
                  <p>{entry.note}</p>
                  {entry.reversal_reason ? (
                    <p className="text-danger">ثبت معکوس: {entry.reversal_reason}</p>
                  ) : (
                    <details>
                      <summary className="min-h-11 cursor-pointer text-danger">
                        اصلاح با ثبت معکوس
                      </summary>
                      <AdminForm action={financeAction} submit="ثبت معکوس حسابداری">
                        <Operation name="reverse" />
                        <input type="hidden" name="settlementId" value={entry.id} />
                        <label className="form-label">
                          علت اصلاح
                          <textarea
                            className="form-input"
                            name="reason"
                            minLength={3}
                            maxLength={1000}
                            required
                          />
                        </label>
                        <p className="text-sm text-muted">
                          فقط سابقه حسابداری اصلاح می‌شود؛ پول جابه‌جا نمی‌شود.
                        </p>
                      </AdminForm>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-4 text-xl font-bold">درخواست‌های پشتیبانی</h2>
            {!data.support?.length && <p role="status">درخواستی ثبت نشده است.</p>}
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {data.support?.map((entry) => (
                <article
                  key={entry.id}
                  className="min-w-0 space-y-3 rounded-xl border border-line bg-surface p-5"
                >
                  <p className="break-all text-xs text-muted">سفارش: {entry.order_id}</p>
                  <p className="whitespace-pre-wrap break-words">{entry.message}</p>
                  {entry.response ? (
                    <p className="whitespace-pre-wrap break-words text-success">
                      پاسخ: {entry.response}
                    </p>
                  ) : (
                    <AdminForm action={financeAction} submit="ثبت پاسخ و بستن پیگیری">
                      <Operation name="resolve" />
                      <input type="hidden" name="requestId" value={entry.id} />
                      <label className="form-label">
                        نتیجه پیگیری
                        <textarea
                          className="form-input"
                          name="response"
                          minLength={3}
                          maxLength={2000}
                          required
                        />
                      </label>
                    </AdminForm>
                  )}
                </article>
              ))}
            </div>
          </section>
          <nav aria-label="صفحه‌های سوابق مالی" className="mt-6 flex flex-wrap items-center gap-4">
            {data.page > 1 && (
              <Link
                className="inline-flex min-h-11 items-center text-primary underline"
                href={`/admin/finance?eventId=${data.selected}&page=${data.page - 1}`}
              >
                سوابق جدیدتر
              </Link>
            )}
            <span>صفحه {toFaDigits(data.page)}</span>
            {data.hasMore && (
              <Link
                className="inline-flex min-h-11 items-center text-primary underline"
                href={`/admin/finance?eventId=${data.selected}&page=${data.page + 1}`}
              >
                سوابق قدیمی‌تر
              </Link>
            )}
          </nav>
        </>
      )}
    </PageShell>
  );
}
