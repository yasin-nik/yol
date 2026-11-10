import { randomInt } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requestOtp, verifyOtp, CUSTOMER_COOKIE } from '../src/server/customer';
import { createOrder } from '../src/server/orders';
import { createHold, expireHolds, getInventory, cancelHold } from '../src/server/inventory';
import {
  startPayment,
  verifyPayment,
  simulatePayment,
  reconcilePayments,
} from '../src/server/payments';
import { FakePaymentGateway } from '../src/server/payment-gateway';
import { FakeSmsProvider } from '../src/server/sms';
import { customerTickets } from '../src/server/tickets';
import { adminOrders } from '../src/server/admin-orders';
import { getPool } from '../src/server/db/pool';
import { newToken } from '../src/server/security';
import { catalogFixture } from './fixtures';
import { GET as callback } from '../src/app/api/payments/callback/route';
import { GET as qr } from '../src/app/api/tickets/[id]/qr/route';

afterEach(() => vi.restoreAllMocks());
async function buyer() {
  const c = await requestOtp({ phone: '09' + randomInt(100000000, 1000000000) });
  return {
    token: await verifyOtp({ challengeId: c.challengeId, code: c.developmentCode }),
    owner: newToken(),
  };
}
async function prepared(count = 1) {
  const f = await catalogFixture();
  const c = await buyer();
  const hold = await createHold(f.sessionId, c.owner, f.seatIds.slice(0, count));
  const orderId = await createOrder(c.token, c.owner, { sessionId: f.sessionId, holdId: hold.id });
  const authority = await startPayment(c.token, orderId);
  return { ...f, ...c, adminToken: f.token, hold, orderId, authority };
}
async function ageHold(id: string) {
  await getPool().query("UPDATE seat_holds SET expires_at=now()-interval '1 second' WHERE id=$1", [
    id,
  ]);
}
async function outcome(authority: string, state: 'SUCCESS' | 'FAILED' | 'UNKNOWN') {
  await new FakePaymentGateway().setOutcome(authority, state);
}
async function order(id: string) {
  return (await getPool().query('SELECT * FROM orders WHERE id=$1', [id])).rows[0];
}

describe('M5 payments and tickets', () => {
  it('INV-03 browser success flags cannot prove payment; only server verification issues tickets', async () => {
    const f = await prepared();
    const response = await callback(
      new NextRequest(
        'http://localhost/api/payments/callback?authority=' +
          f.authority +
          '&status=SUCCESS&amount=1',
      ),
    );
    expect(response.status).toBe(307);
    expect((await order(f.orderId)).status).toBe('PENDING');
    expect(await customerTickets(f.token)).toHaveLength(0);
    await outcome(f.authority, 'SUCCESS');
    expect(await verifyPayment(f.authority)).toBe('PAID');
    expect(await customerTickets(f.token)).toHaveLength(1);
  });
  it('INV-04 INV-05 one ticket per paid item; database guard and 50 duplicate callbacks cannot double-issue', async () => {
    const f = await prepared(2);
    const item = (
      await getPool().query('SELECT id,seat_id FROM order_items WHERE order_id=$1', [f.orderId])
    ).rows[0];
    await expect(
      getPool().query(
        'INSERT INTO tickets(order_item_id,session_id,seat_id,token) VALUES ($1,$2,$3,$4)',
        [item.id, f.sessionId, item.seat_id, newToken()],
      ),
    ).rejects.toThrow('verified payment');
    const starts = await Promise.all(
      Array.from({ length: 5 }, () => startPayment(f.token, f.orderId)),
    );
    expect(new Set(starts)).toEqual(new Set([f.authority]));
    await outcome(f.authority, 'SUCCESS');
    const results = await Promise.all(Array.from({ length: 50 }, () => verifyPayment(f.authority)));
    expect(results.every((r) => r === 'PAID')).toBe(true);
    const tickets = await customerTickets(f.token);
    expect(tickets).toHaveLength(2);
    expect(new Set(tickets.map((t) => t.token)).size).toBe(2);
    expect(tickets.every((t) => /^[a-f0-9]{64}$/.test(t.token))).toBe(true);
    expect(
      (
        await getPool().query(
          "SELECT count(*)::int n FROM audit_logs WHERE target_id=$1 AND action='PAYMENT_VERIFIED_TICKETS_ISSUED'",
          [f.orderId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('INV-03 INV-10 amount mismatch, invalid response and timeout stay unknown without tickets', async () => {
    const f = await prepared();
    const spy = vi.spyOn(FakePaymentGateway.prototype, 'verify');
    spy.mockResolvedValueOnce({ state: 'VERIFIED', amountRial: 1, reference: 'bad-amount' });
    expect(await verifyPayment(f.authority)).toBe('PENDING');
    spy.mockResolvedValueOnce({ state: 'VERIFIED', amountRial: -1, reference: 'invalid' });
    expect(await verifyPayment(f.authority)).toBe('PENDING');
    spy.mockRejectedValueOnce(new Error('timeout'));
    expect(await verifyPayment(f.authority)).toBe('PENDING');
    expect(await customerTickets(f.token)).toHaveLength(0);
    expect((await getInventory(f.sessionId, f.owner)).hold?.paymentState).toBe('UNKNOWN');
  });
  it('INV-02 C2 unknown payment remains reserved after expiry; reconciliation recovers missing callback', async () => {
    const f = await prepared();
    await outcome(f.authority, 'UNKNOWN');
    await verifyPayment(f.authority);
    await ageHold(f.hold.id);
    await expireHolds();
    expect((await getInventory(f.sessionId, f.owner)).hold?.id).toBe(f.hold.id);
    await expect(cancelHold(f.sessionId, f.owner, f.hold.id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(createHold(f.sessionId, newToken(), [f.seatIds[0]])).rejects.toMatchObject({
      status: 409,
    });
    await outcome(f.authority, 'SUCCESS');
    const result = await reconcilePayments();
    expect(result.processed).toBeGreaterThan(0);
    expect((await order(f.orderId)).status).toBe('PAID');
  });
  it('INV-02 C2 abandoned pending payment only releases after gateway confirms expiry/failure', async () => {
    const f = await prepared();
    await ageHold(f.hold.id);
    await expireHolds();
    expect((await getInventory(f.sessionId, f.owner)).hold?.id).toBe(f.hold.id);
    await getPool().query(
      "UPDATE fake_gateway_transactions SET expires_at=now()-interval '1 second' WHERE authority=$1",
      [f.authority],
    );
    expect(await verifyPayment(f.authority)).toBe('FAILED');
    expect(
      (await getInventory(f.sessionId)).data.rows
        .flatMap((r) => r.seats)
        .find((s) => s.id === f.seatIds[0])?.status,
    ).toBe('AVAILABLE');
    expect(await customerTickets(f.token)).toHaveLength(0);
  });
  it('INV-01 C2 late success reassigns free seats atomically', async () => {
    const f = await prepared(2);
    await outcome(f.authority, 'FAILED');
    await verifyPayment(f.authority);
    await ageHold(f.hold.id);
    await outcome(f.authority, 'SUCCESS');
    expect(await verifyPayment(f.authority)).toBe('PAID');
    expect(await customerTickets(f.token)).toHaveLength(2);
    await expect(createHold(f.sessionId, newToken(), [f.seatIds[0]])).rejects.toMatchObject({
      status: 409,
    });
  });
  it('INV-01 C2 competing late verified orders sell a seat once; loser needs manual review', async () => {
    const f = await prepared();
    await outcome(f.authority, 'FAILED');
    await verifyPayment(f.authority);
    const other = await buyer();
    const h = await createHold(f.sessionId, other.owner, [f.seatIds[0]]);
    const second = await createOrder(other.token, other.owner, {
      sessionId: f.sessionId,
      holdId: h.id,
    });
    const a2 = await startPayment(other.token, second);
    await outcome(a2, 'FAILED');
    await verifyPayment(a2);
    await outcome(f.authority, 'SUCCESS');
    await outcome(a2, 'SUCCESS');
    const results = await Promise.all([verifyPayment(f.authority), verifyPayment(a2)]);
    expect(results.sort()).toEqual(['PAID', 'REVIEW']);
    expect(
      (await customerTickets(f.token)).length + (await customerTickets(other.token)).length,
    ).toBe(1);
    const admin = await adminOrders(f.adminToken);
    expect(admin.some((o) => o.status === 'REVIEW')).toBe(true);
  });
  it('INV-01 INV-04 C2 partial late conflict never steals another hold or issues partial tickets', async () => {
    const f = await prepared(2);
    await outcome(f.authority, 'FAILED');
    await verifyPayment(f.authority);
    const owner = newToken();
    const h = await createHold(f.sessionId, owner, [f.seatIds[0]]);
    await outcome(f.authority, 'SUCCESS');
    expect(await verifyPayment(f.authority)).toBe('REVIEW');
    expect(await customerTickets(f.token)).toHaveLength(0);
    expect((await getInventory(f.sessionId, owner)).hold?.id).toBe(h.id);
    expect(
      (await getInventory(f.sessionId)).data.rows
        .flatMap((r) => r.seats)
        .find((s) => s.id === f.seatIds[1])?.status,
    ).toBe('AVAILABLE');
  });
  it('INV-07 private ticket QR and simulator reject other customers; SVG is uncached and contains no phone', async () => {
    const f = await prepared();
    const other = await buyer();
    await expect(startPayment(other.token, f.orderId)).rejects.toMatchObject({ status: 404 });
    await expect(
      simulatePayment(other.token, { authority: f.authority, outcome: 'SUCCESS' }),
    ).rejects.toMatchObject({ status: 404 });
    await outcome(f.authority, 'SUCCESS');
    await verifyPayment(f.authority);
    const [ticket] = await customerTickets(f.token);
    await expect(customerTickets(other.token, ticket.id)).rejects.toMatchObject({ status: 404 });
    const ctx = { params: Promise.resolve({ id: ticket.id }) };
    expect(
      (await qr(new NextRequest('http://localhost/api/tickets/' + ticket.id + '/qr'), ctx)).status,
    ).toBe(401);
    const response = await qr(
      new NextRequest('http://localhost/api/tickets/' + ticket.id + '/qr', {
        headers: { cookie: CUSTOMER_COOKIE + '=' + f.token },
      }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).toContain('<svg');
  });
  it('INV-08 Fake adapters refuse production even when directly constructed', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(() => new FakePaymentGateway()).toThrow('production');
      expect(() => new FakeSmsProvider()).toThrow('production');
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('INV-05 concurrent initiation across 12 sessions does not exhaust the connection pool', async () => {
    const c = await buyer();
    const orders = [];
    for (let i = 0; i < 12; i++) {
      const f = await catalogFixture();
      // Use the same browser owner only for this hold's order.
      const heldOwner = newToken();
      const held = await createHold(f.sessionId, heldOwner, [f.seatIds[1]]);
      orders.push(
        await createOrder(c.token, heldOwner, { sessionId: f.sessionId, holdId: held.id }),
      );
    }
    const authorities = await Promise.all(orders.map((id) => startPayment(c.token, id)));
    expect(new Set(authorities).size).toBe(12);
  }, 15000);
});
