import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '@/server/web-auth';
import { financeDashboard, type FinanceReport } from '@/server/finance';
import { errorResponse } from '@/server/http';
import { csvCell } from '@/lib/csv';
const reportLabels: Record<keyof FinanceReport, string> = {
  paid_orders: 'سفارش پرداخت‌شده',
  review_orders: 'سفارش نیازمند رسیدگی',
  unconfigured: 'سفارش فاقد محاسبه',
  gross: 'دریافت تأییدشده',
  refund_reserved: 'کنارگذاشته‌شده برای استرداد',
  refunded: 'بازگشت وجه ثبت‌شده',
  commission: 'کارمزد',
  tax: 'مالیات کارمزد',
  deduction: 'سایر کسورات',
  net: 'سهم برگزارکننده',
  settled: 'تسویه خالص ثبت‌شده',
  available: 'مانده قابل تسویه',
  tickets: 'بلیت صادرشده',
  admitted: 'ورود ثبت‌شده',
};
export async function GET(request: NextRequest) {
  try {
    const data = await financeDashboard(
      request.cookies.get(ADMIN_COOKIE)?.value,
      request.nextUrl.searchParams.get('eventId') ?? undefined,
      { exportAll: true },
    );
    const rows: unknown[][] = [
      ['گزارش مالی به ریال', 'مقدار'],
      ...Object.entries(data.report ?? {}).map(([key, value]) => [
        reportLabels[key as keyof FinanceReport],
        value,
      ]),
      [],
      ['سفارش', 'وضعیت', 'مبلغ ریال', 'مرجع پرداخت', 'استرداد', 'مرجع استرداد'],
      ...(data.orders ?? []).map((order) => [
        order.id,
        order.status,
        order.total_rial,
        order.reference,
        order.refund_id ? (order.completion_id ? 'تکمیل' : 'در انتظار') : 'ندارد',
        order.refund_reference,
      ]),
      [],
      ['تسویه', 'مبلغ ریال', 'دریافت‌کننده', 'مرجع', 'شرح', 'ثبت معکوس'],
      ...data.settlements.map((entry) => [
        entry.id,
        entry.amount_rial,
        entry.recipient,
        entry.reference,
        entry.note,
        entry.reversal_reason,
      ]),
    ];
    return new NextResponse(
      '\uFEFF' + rows.map((result) => result.map(csvCell).join(',')).join('\r\n'),
      {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="yoltick-finance.csv"',
          'Cache-Control': 'no-store, private',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch (event) {
    return errorResponse(event);
  }
}
