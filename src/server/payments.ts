import { z } from 'zod';
import { getPool } from './db/pool';
import { transaction } from './db/transaction';
import { requireCustomer } from './customer';
import { lockSession, expireLocked } from './inventory';
import {
  paymentGateway,
  verificationSchema,
  FakePaymentGateway,
  authoritySchema,
} from './payment-gateway';
import { audit, newToken, rateLimit } from './security';
import { DomainError } from './errors';

export async function startPayment(token: string | undefined, orderId: string) {
  z.uuid().parse(orderId);
  const user = await requireCustomer(token);
  await rateLimit(`payment:${user}`, 20, 60);
  const found = await getPool().query(
    'SELECT o.session_id,o.total_rial,h.expires_at FROM orders o JOIN seat_holds h ON h.id=o.hold_id WHERE o.id=$1 AND o.user_id=$2',
    [orderId, user],
  );
  if (!found.rowCount) throw new DomainError('سفارش یافت نشد.', 404);
  const prior = await getPool().query('SELECT authority FROM payments WHERE order_id=$1', [
    orderId,
  ]);
  if (prior.rowCount) return prior.rows[0].authority as string;
  if (found.rows[0].expires_at <= new Date())
    throw new DomainError('رزرو منقضی شده است؛ صندلی‌ها را دوباره انتخاب کنید.', 409);
  // Provider calls happen outside inventory locks and pooled DB transactions.
  // Revalidate the hold inside the lock before persisting or returning a redirect.
  const result = await paymentGateway().create({
    requestKey: orderId,
    amountRial: Number(found.rows[0].total_rial),
    expiresAt: found.rows[0].expires_at,
  });
  const authority = authoritySchema.parse(result.authority);
  return transaction(async (client) => {
    await lockSession(client, found.rows[0].session_id);
    await expireLocked(client, found.rows[0].session_id);
    const order = (
      await client.query(
        'SELECT o.*,h.status hold_status,h.expires_at FROM orders o JOIN seat_holds h ON h.id=o.hold_id WHERE o.id=$1',
        [orderId],
      )
    ).rows[0];
    const existing = await client.query('SELECT authority FROM payments WHERE order_id=$1', [
      orderId,
    ]);
    if (existing.rowCount) return existing.rows[0].authority as string;
    if (
      order.status !== 'PENDING' ||
      order.hold_status !== 'ACTIVE' ||
      order.expires_at <= new Date()
    )
      throw new DomainError('رزرو منقضی شده است؛ صندلی‌ها را دوباره انتخاب کنید.', 409);
    await client.query('INSERT INTO payments(order_id,authority,amount_rial) VALUES ($1,$2,$3)', [
      orderId,
      authority,
      order.total_rial,
    ]);
    await client.query("UPDATE seat_holds SET payment_state='PENDING' WHERE id=$1", [
      order.hold_id,
    ]);
    await audit(client, user, 'PAYMENT_STARTED', orderId);
    return authority;
  });
}

export async function verifyPayment(authority: string) {
  authoritySchema.parse(authority);
  const found = await getPool().query(
    'SELECT o.session_id FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.authority=$1',
    [authority],
  );
  if (!found.rowCount) throw new DomainError('پرداخت یافت نشد.', 404);
  // Never use browser success/status/amount fields as proof. Query the adapter server-side.
  let verification;
  try {
    verification = verificationSchema.parse(await paymentGateway().verify(authority));
  } catch {
    verification = { state: 'UNKNOWN' as const };
  }
  return transaction(async (client) => {
    const sessionId = found.rows[0].session_id;
    await lockSession(client, sessionId, true);
    const payment = (
      await client.query(
        `SELECT p.*,o.user_id,o.hold_id,o.status order_status FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.authority=$1 FOR UPDATE OF p,o`,
        [authority],
      )
    ).rows[0];
    if (payment.state === 'VERIFIED') return payment.order_status as string;
    if (payment.state === 'FAILED' && verification.state !== 'VERIFIED')
      return payment.order_status as string;
    const mismatch =
      verification.state === 'VERIFIED' && verification.amountRial !== Number(payment.amount_rial);
    if (verification.state === 'UNKNOWN' || verification.state === 'PENDING' || mismatch) {
      const state = mismatch ? 'UNKNOWN' : verification.state;
      await client.query('UPDATE payments SET state=$2,checked_at=now() WHERE id=$1', [
        payment.id,
        state,
      ]);
      await client.query("UPDATE seat_holds SET payment_state=$2 WHERE id=$1 AND status='ACTIVE'", [
        payment.hold_id,
        state,
      ]);
      if (state !== payment.state) await audit(client, null, 'PAYMENT_' + state, payment.id);
      return 'PENDING';
    }
    if (verification.state === 'FAILED') {
      await client.query("UPDATE payments SET state='FAILED',checked_at=now() WHERE id=$1", [
        payment.id,
      ]);
      await client.query("UPDATE orders SET status='FAILED' WHERE id=$1", [payment.order_id]);
      await client.query(
        "UPDATE session_seats SET status='AVAILABLE',hold_id=NULL WHERE session_id=$1 AND hold_id=$2 AND status='HELD'",
        [sessionId, payment.hold_id],
      );
      await client.query(
        "UPDATE seat_holds SET status='EXPIRED',payment_state='NONE' WHERE id=$1",
        [payment.hold_id],
      );
      await audit(client, null, 'PAYMENT_FAILED', payment.id);
      return 'FAILED';
    }
    if (verification.state !== 'VERIFIED') throw new Error('Unexpected verification');
    await expireLocked(client, sessionId);
    const items = (
      await client.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY seat_id', [
        payment.order_id,
      ])
    ).rows;
    const seats = (
      await client.query(
        'SELECT seat_id,status,hold_id FROM session_seats WHERE session_id=$1 AND seat_id=ANY($2::uuid[]) ORDER BY seat_id FOR UPDATE',
        [sessionId, items.map((i) => i.seat_id)],
      )
    ).rows;
    const assignable =
      items.length > 0 &&
      seats.length === items.length &&
      seats.every(
        (s) => s.status === 'AVAILABLE' || (s.status === 'HELD' && s.hold_id === payment.hold_id),
      );
    const status = assignable ? 'PAID' : 'REVIEW';
    await client.query(
      "UPDATE payments SET state='VERIFIED',reference=$2,checked_at=now() WHERE id=$1",
      [payment.id, verification.reference],
    );
    await client.query('UPDATE orders SET status=$2 WHERE id=$1', [payment.order_id, status]);
    await client.query(
      "UPDATE seat_holds SET status='CANCELLED',payment_state='VERIFIED' WHERE id=$1",
      [payment.hold_id],
    );
    if (assignable) {
      await client.query(
        "UPDATE session_seats SET status='SOLD',hold_id=NULL WHERE session_id=$1 AND seat_id=ANY($2::uuid[])",
        [sessionId, items.map((i) => i.seat_id)],
      );
      for (const item of items)
        await client.query(
          'INSERT INTO tickets(order_item_id,session_id,seat_id,token) VALUES ($1,$2,$3,$4)',
          [item.id, sessionId, item.seat_id, newToken()],
        );
    } else {
      await client.query(
        "UPDATE session_seats SET status='AVAILABLE',hold_id=NULL WHERE session_id=$1 AND hold_id=$2 AND status='HELD'",
        [sessionId, payment.hold_id],
      );
    }
    await audit(
      client,
      null,
      assignable ? 'PAYMENT_VERIFIED_TICKETS_ISSUED' : 'PAYMENT_REQUIRES_REVIEW',
      payment.order_id,
      { ticketCount: assignable ? items.length : 0 },
    );
    return status;
  });
}

export async function ownedPayment(token: string | undefined, authority: string) {
  authoritySchema.parse(authority);
  const user = await requireCustomer(token);
  const result = await getPool().query(
    'SELECT p.authority,p.amount_rial::text,p.state,o.id order_id FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.authority=$1 AND o.user_id=$2',
    [authority, user],
  );
  if (!result.rowCount) throw new DomainError('پرداخت یافت نشد.', 404);
  return result.rows[0];
}
export async function simulatePayment(token: string | undefined, input: unknown) {
  const data = z
    .object({
      authority: authoritySchema,
      outcome: z.enum(['SUCCESS', 'FAILED', 'UNKNOWN']),
    })
    .strict()
    .parse(input);
  await ownedPayment(token, data.authority);
  const gateway = paymentGateway();
  if (!(gateway instanceof FakePaymentGateway))
    throw new DomainError('شبیه‌ساز در دسترس نیست.', 404);
  await gateway.setOutcome(data.authority, data.outcome);
  return verifyPayment(data.authority);
}
export async function reconcilePayments() {
  const payments = await getPool().query(
    "SELECT authority FROM payments WHERE state IN ('PENDING','UNKNOWN') ORDER BY checked_at NULLS FIRST LIMIT 100",
  );
  let processed = 0;
  let errors = 0;
  for (const payment of payments.rows) {
    try {
      await verifyPayment(payment.authority);
      processed++;
    } catch {
      errors++;
    }
  }
  return { processed, errors };
}
