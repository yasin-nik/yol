import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  calculateShares,
  configureTerms,
  financeDashboard,
  recordSettlement,
  reverseSettlement,
  requestRefund,
  completeRefund,
  supportNote,
  resolveSupport,
} from '../src/server/finance';
import { checkIn } from '../src/server/check-in';
import { customerTickets } from '../src/server/tickets';
import { customerOrders } from '../src/server/orders';
import { customerSupport } from '../src/server/support';
import { getPool } from '../src/server/db/pool';
import { paidFixture } from './milestone-fixtures';
import { adminFixture, catalogFixture } from './fixtures';
import { newToken } from '../src/server/security';
import { verifyPayment } from '../src/server/payments';
import { createOrder } from '../src/server/orders';
import { createHold } from '../src/server/inventory';
import { startPayment, simulatePayment } from '../src/server/payments';
import { requestOtp, verifyOtp } from '../src/server/customer';
import { randomInt } from 'node:crypto';
import { GET as exportReport } from '../src/app/api/admin/finance/export/route';
import { csvCell } from '../src/lib/csv';
import { POST as postSupport } from '../src/app/api/support/route';

const terms = (eventId: string) => ({
  eventId,
  commissionBps: 1234,
  fixedRial: 123,
  taxBps: 900,
  deductionRial: 77,
});
async function configured() {
  return paidFixture((fixture) => configureTerms(fixture.token, terms(fixture.eventId)));
}
async function ended(sessionId: string) {
  await getPool().query("UPDATE event_sessions SET starts_at=now()-interval '1 day' WHERE id=$1", [
    sessionId,
  ]);
}
function settlement(eventId: string, amountRial: number) {
  return {
    id: randomUUID(),
    eventId,
    amountRial,
    reference: `test-${randomUUID()}`,
    recipient: 'برگزارکننده آزمایشی',
    note: 'ثبت آزمایشی، بدون انتقال وجه',
    performed: true,
  };
}

describe('M7 finance', () => {
  it('INV-14 refunds after settlement show negative balance and prevent additional payout', async () => {
    const fixture = await configured();
    await ended(fixture.sessionId);
    const net = Number((await financeDashboard(fixture.token, fixture.eventId)).report!.net);
    await recordSettlement(fixture.token, settlement(fixture.eventId, net));
    await requestRefund(fixture.token, {
      orderId: fixture.orderId,
      reason: 'استرداد پس از تسویه آزمایشی',
    });
    expect((await financeDashboard(fixture.token, fixture.eventId)).report!.available).toBe(
      String(-net),
    );
    await expect(recordSettlement(fixture.token, settlement(fixture.eventId, 1))).rejects.toThrow(
      'مانده',
    );
  });
  it('INV-13 REVIEW payment can be manually refunded without issuing a ticket or including it in organizer share', async () => {
    const fixture = await catalogFixture();
    await configureTerms(fixture.token, terms(fixture.eventId));
    const challenge = await requestOtp({ phone: '09' + randomInt(100000000, 1000000000) });
    const customer = await verifyOtp({
      challengeId: challenge.challengeId,
      code: challenge.developmentCode,
    });
    const owner = newToken();
    const hold = await createHold(fixture.sessionId, owner, [fixture.seatIds[0]]);
    const orderId = await createOrder(customer, owner, {
      sessionId: fixture.sessionId,
      holdId: hold.id,
    });
    const authority = await startPayment(customer, orderId);
    await getPool().query(
      "UPDATE session_seats SET status='BLOCKED',hold_id=NULL WHERE session_id=$1 AND seat_id=$2",
      [fixture.sessionId, fixture.seatIds[0]],
    );
    expect(await simulatePayment(customer, { authority, outcome: 'SUCCESS' })).toBe('REVIEW');
    expect((await financeDashboard(fixture.token, fixture.eventId)).report!.review_orders).toBe(1);
    await requestRefund(fixture.token, { orderId, reason: 'تعارض صندلی در پرداخت آزمایشی' });
    const refund = (
      await getPool().query('SELECT id FROM refund_requests WHERE order_id=$1', [orderId])
    ).rows[0].id;
    await completeRefund(fixture.token, {
      refundId: refund,
      reference: `refund-${randomUUID()}`,
      performed: true,
    });
    const result = (await financeDashboard(fixture.token, fixture.eventId)).report!;
    expect(result.review_orders).toBe(0);
    expect(result.net).toBe('0');
    expect(result.refunded).toBe(result.gross);
    expect(await customerTickets(customer)).toHaveLength(0);
  });
  it('INV-14 exact integer shares, rounding, caps and large amounts match PostgreSQL snapshots', async () => {
    expect(calculateShares(101n, 1000, 0n, 900, 0n)).toEqual({
      gross: 101n,
      commission: 10n,
      tax: 0n,
      deduction: 0n,
      net: 91n,
    });
    expect(calculateShares(7n, 10000, 500n, 10000, 9n).net).toBe(0n);
    expect(calculateShares(180000000000000n, 9999, 0n, 1, 0n).gross).toBe(180000000000000n);
    expect(() => calculateShares(1n, 1.5, 0n, 0, 0n)).toThrow();
    const fixture = await configured();
    const row = (
      await getPool().query('SELECT * FROM order_financials WHERE order_id=$1', [fixture.orderId])
    ).rows[0];
    const expected = calculateShares(BigInt(row.gross_rial), 1234, 123n, 900, 77n);
    expect(row.commission_rial).toBe(String(expected.commission));
    expect(row.tax_rial).toBe(String(expected.tax));
    expect(row.net_rial).toBe(String(expected.net));
    expect(row.created_at).toBeInstanceOf(Date);
    const result = (await financeDashboard(fixture.token, fixture.eventId)).report!;
    expect(result.gross).toBe(row.gross_rial);
    expect(result.net).toBe(row.net_rial);
    expect(result.unconfigured).toBe(0);
  });
  it('INV-14 terms backfill only missing snapshots; later edits retain financial history', async () => {
    const fixture = await paidFixture();
    expect((await financeDashboard(fixture.token, fixture.eventId)).report!.unconfigured).toBe(1);
    await configureTerms(fixture.token, terms(fixture.eventId));
    const before = (
      await getPool().query('SELECT * FROM order_financials WHERE order_id=$1', [fixture.orderId])
    ).rows[0];
    await configureTerms(fixture.token, { ...terms(fixture.eventId), commissionBps: 9999 });
    const after = (
      await getPool().query('SELECT * FROM order_financials WHERE order_id=$1', [fixture.orderId])
    ).rows[0];
    expect(after).toEqual(before);
    expect(
      (
        await getPool().query('SELECT count(*)::int n FROM financial_terms WHERE event_id=$1', [
          fixture.eventId,
        ])
      ).rows[0].n,
    ).toBe(2);
  });
  it('INV-13 INV-14 concurrent settlements cannot exceed available share; replay and reversal are append-only', async () => {
    const fixture = await configured();
    const net = Number((await financeDashboard(fixture.token, fixture.eventId)).report!.net);
    const firstAmount = settlement(fixture.eventId, net);
    await expect(recordSettlement(fixture.token, firstAmount)).rejects.toThrow('برگزاری');
    await ended(fixture.sessionId);
    const results = await Promise.allSettled([
      recordSettlement(fixture.token, firstAmount),
      recordSettlement(fixture.token, settlement(fixture.eventId, net)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const saved = (
      await getPool().query('SELECT id FROM settlements WHERE event_id=$1', [fixture.eventId])
    ).rows[0].id;
    if (saved === firstAmount.id) {
      await recordSettlement(fixture.token, firstAmount);
      await expect(
        recordSettlement(fixture.token, { ...firstAmount, amountRial: 1 }),
      ).rejects.toThrow('شناسه');
    }
    expect((await financeDashboard(fixture.token, fixture.eventId)).report!.available).toBe('0');
    await reverseSettlement(fixture.token, { settlementId: saved, reason: 'اصلاح ثبت آزمایشی' });
    await reverseSettlement(fixture.token, { settlementId: saved, reason: 'تکرار ثبت' });
    expect((await financeDashboard(fixture.token, fixture.eventId)).report!.available).toBe(
      String(net),
    );
    expect(
      (
        await getPool().query('SELECT count(*)::int n FROM settlements WHERE event_id=$1', [
          fixture.eventId,
        ])
      ).rows[0].n,
    ).toBe(1);
    await expect(getPool().query('DELETE FROM settlements WHERE id=$1', [saved])).rejects.toThrow(
      'append-only',
    );
    await expect(
      getPool().query('UPDATE settlement_reversals SET reason=$2 WHERE settlement_id=$1', [
        saved,
        'overwrite',
      ]),
    ).rejects.toThrow('append-only');
  });
  it('INV-06 INV-13 manual refund voids QR atomically, retains inventory/history, and completes once', async () => {
    const fixture = await configured();
    await Promise.all([
      checkIn(fixture.token, { sessionId: fixture.sessionId, code: fixture.ticket.token }),
      requestRefund(fixture.token, { orderId: fixture.orderId, reason: 'لغو آزمایشی توسط مدیر' }),
    ]);
    await requestRefund(fixture.token, { orderId: fixture.orderId, reason: 'تکرار درخواست' });
    expect(
      (await checkIn(fixture.token, { sessionId: fixture.sessionId, code: fixture.ticket.token }))
        .status,
    ).toBe('INVALID');
    expect(await customerTickets(fixture.customer)).toHaveLength(0);
    const result = (await financeDashboard(fixture.token, fixture.eventId)).report!;
    expect(result.net).toBe('0');
    expect(result.refund_reserved).toBe(result.gross);
    expect(result.refunded).toBe('0');
    expect(
      (
        await getPool().query(
          'SELECT status FROM session_seats WHERE session_id=$1 AND seat_id=$2',
          [fixture.sessionId, fixture.seatIds[0]],
        )
      ).rows[0].status,
    ).toBe('SOLD');
    const refund = (
      await getPool().query('SELECT id FROM refund_requests WHERE order_id=$1', [fixture.orderId])
    ).rows[0].id;
    const completion = { refundId: refund, reference: `refund-${randomUUID()}`, performed: true };
    await Promise.all([
      completeRefund(fixture.token, completion),
      completeRefund(fixture.token, completion),
    ]);
    await expect(
      completeRefund(fixture.token, { ...completion, reference: 'different' }),
    ).rejects.toThrow('قبلاً');
    const order = (await customerOrders(fixture.customer))[0];
    expect(order.refund_requested).toBe(true);
    expect(order.refund_completed).toBe(true);
    const authority = (
      await getPool().query('SELECT authority FROM payments WHERE order_id=$1', [fixture.orderId])
    ).rows[0].authority;
    await verifyPayment(authority);
    expect(await customerTickets(fixture.customer)).toHaveLength(0);
    expect((await financeDashboard(fixture.token, fixture.eventId)).report!.refunded).toBe(
      result.gross,
    );
    expect(
      (
        await getPool().query(
          "SELECT count(*)::int n FROM audit_logs WHERE action='REFUND_REQUESTED_TICKETS_VOIDED' AND target_id=$1",
          [fixture.orderId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('INV-13 protects all financial records from DELETE, TRUNCATE and mutation of verified amounts', async () => {
    const fixture = await configured();
    for (const table of [
      'orders',
      'order_items',
      'payments',
      'tickets',
      'financial_terms',
      'order_financials',
      'refund_requests',
      'refund_completions',
      'settlements',
      'settlement_reversals',
    ])
      await expect(getPool().query(`DELETE FROM ${table} WHERE false`)).rejects.toThrow(
        'append-only',
      );
    await expect(getPool().query('TRUNCATE refund_completions')).rejects.toThrow('append-only');
    await expect(
      getPool().query('UPDATE payments SET amount_rial=amount_rial+1 WHERE order_id=$1', [
        fixture.orderId,
      ]),
    ).rejects.toThrow('immutable');
    await expect(
      getPool().query('UPDATE orders SET total_rial=total_rial+1 WHERE id=$1', [fixture.orderId]),
    ).rejects.toThrow('immutable');
    await expect(
      getPool().query('UPDATE order_items SET price_rial=price_rial+1 WHERE order_id=$1', [
        fixture.orderId,
      ]),
    ).rejects.toThrow('immutable');
    await expect(
      getPool().query('UPDATE order_financials SET net_rial=0 WHERE order_id=$1', [
        fixture.orderId,
      ]),
    ).rejects.toThrow('append-only');
  });
  it('INV-07 INV-10 finance writes and export require admin; invalid amounts and false attestations fail', async () => {
    const fixture = await configured();
    const operator = await adminFixture('CHECK_IN');
    await expect(configureTerms(operator.token, terms(fixture.eventId))).rejects.toThrow();
    await expect(financeDashboard(fixture.customer, fixture.eventId)).rejects.toThrow();
    await expect(
      requestRefund(operator.token, { orderId: fixture.orderId, reason: 'غیرمجاز' }),
    ).rejects.toThrow();
    await expect(
      recordSettlement(fixture.token, { ...settlement(fixture.eventId, 1), amountRial: 1.5 }),
    ).rejects.toThrow();
    await expect(
      recordSettlement(fixture.token, { ...settlement(fixture.eventId, 1), performed: false }),
    ).rejects.toThrow();
    await expect(
      configureTerms(fixture.token, { ...terms(fixture.eventId), commissionBps: 10001 }),
    ).rejects.toThrow();
    expect(
      (
        await exportReport(
          new NextRequest(`http://localhost/api/admin/finance/export?eventId=${fixture.eventId}`),
        )
      ).status,
    ).toBe(401);
    const out = await exportReport(
      new NextRequest(`http://localhost/api/admin/finance/export?eventId=${fixture.eventId}`, {
        headers: { cookie: `yoltick_admin=${fixture.token}` },
      }),
    );
    expect(out.status).toBe(200);
    expect(out.headers.get('cache-control')).toContain('no-store');
    expect(await out.text()).toContain(fixture.orderId);
    expect(csvCell(' \t=HYPERLINK("x")')).toBe('"\' \t=HYPERLINK(""x"")"');
  });
  it('INV-07 INV-11 support is owned by customer; internal notes stay private and responses are audited', async () => {
    const fixture = await configured();
    const other = await adminFixture('CUSTOMER');
    await expect(
      customerSupport(other.token, { orderId: fixture.orderId, message: 'سفارش دیگری' }),
    ).rejects.toThrow();
    await customerSupport(fixture.customer, {
      orderId: fixture.orderId,
      message: 'لطفاً سفارش را بررسی کنید',
    });
    await supportNote(fixture.token, { orderId: fixture.orderId, message: 'یادداشت داخلی مدیر' });
    const support = (await financeDashboard(fixture.token, fixture.eventId)).support;
    expect(support).toHaveLength(2);
    const visible = support.find((entry) => entry.customer_visible)!;
    await resolveSupport(fixture.token, { requestId: visible.id, response: 'درخواست بررسی شد' });
    const orders = await customerOrders(fixture.customer);
    expect(orders[0].support).toHaveLength(1);
    expect(orders[0].support[0].response).toBe('درخواست بررسی شد');
    expect(JSON.stringify(orders)).not.toContain('یادداشت داخلی');
    expect(
      (
        await postSupport(
          new NextRequest('http://localhost/api/support', {
            method: 'POST',
            headers: { origin: 'http://other.test' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(403);
  });
  it('INV-14 unconfigured confirmed sales prevent settlement rather than silently assuming zero fees', async () => {
    const fixture = await paidFixture();
    await ended(fixture.sessionId);
    await expect(recordSettlement(fixture.token, settlement(fixture.eventId, 1))).rejects.toThrow(
      'محاسبات',
    );
    const other = await catalogFixture();
    expect((await financeDashboard(other.token, other.eventId)).report!.gross).toBe('0');
    await expect(
      requestRefund(fixture.token, { orderId: randomUUID(), reason: newToken() }),
    ).rejects.toThrow('یافت نشد');
  });
});
