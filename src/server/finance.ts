import { z } from 'zod';
import type { PoolClient } from 'pg';
import { requireAdmin } from './auth';
import { getPool } from './db/pool';
import { transaction } from './db/transaction';
import { DomainError } from './errors';
import { audit } from './security';
import { lockSession } from './inventory';

const rial = z.coerce.number().int().min(0).max(180000000000000);
const text = z.string().trim().min(3).max(1000);
const reference = z.string().trim().min(3).max(200);

type FinanceEvent = { id: string; title: string };
export type FinanceReport = {
  paid_orders: number;
  review_orders: number;
  unconfigured: number;
  gross: string;
  refund_reserved: string;
  refunded: string;
  commission: string;
  tax: string;
  deduction: string;
  net: string;
  settled: string;
  available: string;
  tickets: number;
  admitted: number;
};
type Terms = {
  id: string;
  commission_bps: number;
  fixed_rial: string;
  tax_bps: number;
  deduction_rial: string;
};
type FinanceOrder = {
  id: string;
  status: string;
  total_rial: string;
  state: string | null;
  reference: string | null;
  refund_id: string | null;
  reason: string | null;
  completion_id: string | null;
  refund_reference: string | null;
  ticket_count: number;
  admitted: number;
};
type Settlement = {
  id: string;
  amount_rial: string;
  recipient: string;
  reference: string;
  note: string;
  created_at: string;
  reversal_reason: string | null;
};
type Support = {
  id: string;
  order_id: string;
  message: string;
  response: string | null;
  customer_visible: boolean;
};
type Dashboard = {
  events: FinanceEvent[];
  selected?: string;
  report?: FinanceReport;
  terms?: Terms;
  orders: FinanceOrder[];
  settlements: Settlement[];
  support: Support[];
  page: number;
  hasMore: boolean;
};

export function calculateShares(
  gross: bigint,
  bps: number,
  fixed: bigint,
  taxBps: number,
  deduction: bigint,
) {
  if (
    gross < 0n ||
    gross > 180000000000000n ||
    fixed < 0n ||
    deduction < 0n ||
    !Number.isInteger(bps) ||
    !Number.isInteger(taxBps) ||
    bps < 0 ||
    bps > 10000 ||
    taxBps < 0 ||
    taxBps > 10000
  )
    throw new DomainError('مقادیر مالی معتبر نیست.');
  const min = (firstAmount: bigint, secondAmount: bigint) =>
    firstAmount < secondAmount ? firstAmount : secondAmount;
  const commission = min(gross, (gross * BigInt(bps)) / 10000n + fixed);
  const tax = min(gross - commission, (commission * BigInt(taxBps)) / 10000n);
  const withheld = min(gross - commission - tax, deduction);
  return { gross, commission, tax, deduction: withheld, net: gross - commission - tax - withheld };
}

async function lockEvent(client: PoolClient, eventId: string) {
  const event = await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE', [eventId]);
  if (!event.rowCount) throw new DomainError('رویداد یافت نشد.', 404);
  const sessions = await client.query(
    'SELECT id FROM event_sessions WHERE event_id=$1 ORDER BY id',
    [eventId],
  );
  for (const entry of sessions.rows) await lockSession(client, entry.id, true);
}

export async function configureTerms(token: string | undefined, input: unknown) {
  const data = z
    .object({
      eventId: z.uuid(),
      commissionBps: z.coerce.number().int().min(0).max(10000),
      fixedRial: rial.max(9000000000000),
      taxBps: z.coerce.number().int().min(0).max(10000),
      deductionRial: rial.max(9000000000000),
    })
    .strict()
    .parse(input);
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    await lockEvent(client, data.eventId);
    const result = await client.query(
      `INSERT INTO financial_terms(event_id,commission_bps,fixed_rial,tax_bps,deduction_rial,actor_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [data.eventId, data.commissionBps, data.fixedRial, data.taxBps, data.deductionRial, actor],
    );
    await client.query(
      `SELECT snapshot_order_finance(o.id) FROM orders o JOIN event_sessions es ON es.id=o.session_id JOIN payments p ON p.order_id=o.id WHERE es.event_id=$1 AND p.state='VERIFIED' AND NOT EXISTS(SELECT 1 FROM order_financials f WHERE f.order_id=o.id)`,
      [data.eventId],
    );
    await audit(client, actor, 'FINANCIAL_TERMS_CONFIGURED', result.rows[0].id, {
      eventId: data.eventId,
    });
  });
}

async function eventReport(client: Pick<PoolClient, 'query'>, eventId: string) {
  const result = await client.query(
    `SELECT
    count(*) FILTER(WHERE p.state='VERIFIED')::int paid_orders,
    count(*) FILTER(WHERE o.status='REVIEW' AND rr.id IS NULL)::int review_orders,
    count(*) FILTER(WHERE p.state='VERIFIED' AND f.order_id IS NULL AND rr.id IS NULL)::int unconfigured,
    coalesce(sum(p.amount_rial) FILTER(WHERE p.state='VERIFIED'),0)::text gross,
    coalesce(sum(rr.amount_rial),0)::text refund_reserved,
    coalesce(sum(rr.amount_rial) FILTER(WHERE rc.id IS NOT NULL),0)::text refunded,
    coalesce(sum(f.commission_rial) FILTER(WHERE o.status='PAID' AND rr.id IS NULL),0)::text commission,
    coalesce(sum(f.tax_rial) FILTER(WHERE o.status='PAID' AND rr.id IS NULL),0)::text tax,
    coalesce(sum(f.deduction_rial) FILTER(WHERE o.status='PAID' AND rr.id IS NULL),0)::text deduction,
    coalesce(sum(f.net_rial) FILTER(WHERE o.status='PAID' AND rr.id IS NULL),0)::text net,
    (SELECT coalesce(sum(s.amount_rial),0)::text FROM settlements s WHERE s.event_id=$1 AND NOT EXISTS(SELECT 1 FROM settlement_reversals v WHERE v.settlement_id=s.id)) settled,
    (SELECT count(*)::int FROM tickets t JOIN event_sessions es ON es.id=t.session_id WHERE es.event_id=$1) tickets,
    (SELECT count(*)::int FROM check_ins ci JOIN tickets t ON t.id=ci.ticket_id JOIN event_sessions es ON es.id=t.session_id WHERE es.event_id=$1) admitted
    FROM orders o JOIN event_sessions es ON es.id=o.session_id LEFT JOIN payments p ON p.order_id=o.id
    LEFT JOIN order_financials f ON f.order_id=o.id LEFT JOIN refund_requests rr ON rr.order_id=o.id LEFT JOIN refund_completions rc ON rc.refund_id=rr.id
    WHERE es.event_id=$1`,
    [eventId],
  );
  const row = result.rows[0] as Omit<FinanceReport, 'available'>;
  return { ...row, available: (BigInt(row.net) - BigInt(row.settled)).toString() };
}

export async function recordSettlement(token: string | undefined, input: unknown) {
  const data = z
    .object({
      id: z.uuid(),
      eventId: z.uuid(),
      amountRial: rial.min(1),
      reference,
      recipient: reference,
      note: text,
      performed: z.literal(true),
    })
    .strict()
    .parse(input);
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    await lockEvent(client, data.eventId);
    const prior = await client.query('SELECT * FROM settlements WHERE id=$1', [data.id]);
    if (prior.rowCount) {
      const priorRecord = prior.rows[0];
      if (
        priorRecord.event_id !== data.eventId ||
        priorRecord.amount_rial !== String(data.amountRial) ||
        priorRecord.reference !== data.reference ||
        priorRecord.recipient !== data.recipient ||
        priorRecord.note !== data.note
      )
        throw new DomainError('شناسه ثبت قبلاً با اطلاعات دیگری استفاده شده است.', 409);
      return;
    }
    const ended = await client.query(
      'SELECT 1 FROM event_sessions WHERE event_id=$1 GROUP BY event_id HAVING max(starts_at)<now()',
      [data.eventId],
    );
    if (!ended.rowCount)
      throw new DomainError('ثبت تسویه پس از برگزاری همه سانس‌ها ممکن است.', 409);
    const report = await eventReport(client, data.eventId);
    if (report.unconfigured > 0 || report.review_orders > 0)
      throw new DomainError('ابتدا محاسبات و سفارش‌های نیازمند رسیدگی را کامل کنید.', 409);
    if (BigInt(data.amountRial) > BigInt(report.available))
      throw new DomainError('مبلغ از مانده قابل تسویه بیشتر است.', 409);
    await client.query(
      'INSERT INTO settlements(id,event_id,amount_rial,reference,recipient,note,actor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [data.id, data.eventId, data.amountRial, data.reference, data.recipient, data.note, actor],
    );
    await audit(client, actor, 'SETTLEMENT_RECORDED', data.id, {
      eventId: data.eventId,
      amountRial: data.amountRial,
    });
  });
}

export async function reverseSettlement(token: string | undefined, input: unknown) {
  const data = z.object({ settlementId: z.uuid(), reason: text }).strict().parse(input);
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    const result = await client.query('SELECT event_id FROM settlements WHERE id=$1', [
      data.settlementId,
    ]);
    if (!result.rowCount) throw new DomainError('ثبت تسویه یافت نشد.', 404);
    await lockEvent(client, result.rows[0].event_id);
    const inserted = await client.query(
      'INSERT INTO settlement_reversals(settlement_id,reason,actor_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING settlement_id',
      [data.settlementId, data.reason, actor],
    );
    if (inserted.rowCount) await audit(client, actor, 'SETTLEMENT_REVERSED', data.settlementId);
  });
}

export async function requestRefund(token: string | undefined, input: unknown) {
  const data = z.object({ orderId: z.uuid(), reason: text }).strict().parse(input);
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    const result = await client.query(
      `SELECT o.id,o.session_id,o.total_rial,o.status,es.event_id,p.state FROM orders o JOIN event_sessions es ON es.id=o.session_id JOIN payments p ON p.order_id=o.id WHERE o.id=$1`,
      [data.orderId],
    );
    const order = result.rows[0];
    if (!order) throw new DomainError('سفارش پرداخت‌شده یافت نشد.', 404);
    await lockEvent(client, order.event_id);
    if (order.state !== 'VERIFIED' || !['PAID', 'REVIEW'].includes(order.status))
      throw new DomainError('پرداخت تأییدشده لازم است.', 409);
    const inserted = await client.query(
      'INSERT INTO refund_requests(order_id,amount_rial,reason,actor_id) VALUES ($1,$2,$3,$4) ON CONFLICT(order_id) DO NOTHING RETURNING id',
      [data.orderId, order.total_rial, data.reason, actor],
    );
    if (inserted.rowCount)
      await audit(client, actor, 'REFUND_REQUESTED_TICKETS_VOIDED', data.orderId, {
        amountRial: order.total_rial,
      });
  });
}

export async function completeRefund(token: string | undefined, input: unknown) {
  const data = z
    .object({ refundId: z.uuid(), reference, performed: z.literal(true) })
    .strict()
    .parse(input);
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    const result = await client.query('SELECT id FROM refund_requests WHERE id=$1 FOR UPDATE', [
      data.refundId,
    ]);
    if (!result.rowCount) throw new DomainError('درخواست استرداد یافت نشد.', 404);
    const existing = await client.query(
      'SELECT reference FROM refund_completions WHERE refund_id=$1',
      [data.refundId],
    );
    if (existing.rowCount) {
      if (existing.rows[0].reference !== data.reference)
        throw new DomainError('این استرداد قبلاً با مرجع دیگری تکمیل شده است.', 409);
      return;
    }
    const inserted = await client.query(
      'INSERT INTO refund_completions(refund_id,reference,actor_id) VALUES ($1,$2,$3) RETURNING id',
      [data.refundId, data.reference, actor],
    );
    await audit(client, actor, 'MANUAL_REFUND_COMPLETED', inserted.rows[0].id);
  });
}

export async function financeDashboard(
  token: string | undefined,
  eventId?: string,
  options: { page?: number; exportAll?: boolean } = {},
): Promise<Dashboard> {
  await requireAdmin(token);
  const page = z
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(options.page ?? 1);
  if (eventId) z.uuid().parse(eventId);
  const events = (
    await getPool().query<FinanceEvent>(
      'SELECT id,title FROM events ORDER BY created_at DESC',
    )
  ).rows;
  const selected = eventId ?? events[0]?.id;
  if (!selected) return { events, orders: [], settlements: [], support: [], page, hasMore: false };
  if (!events.some((event) => event.id === selected))
    throw new DomainError('رویداد یافت نشد.', 404);
  return transaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const report = await eventReport(client, selected);
    const terms = (
      await client.query<Terms>(
        'SELECT * FROM financial_terms WHERE event_id=$1 ORDER BY sequence DESC LIMIT 1',
        [selected],
      )
    ).rows[0];
    const orders = (
      await client.query<FinanceOrder>(
        `SELECT o.id,o.status,o.total_rial::text,p.state,p.reference,rr.id refund_id,rr.reason,rc.id completion_id,rc.reference refund_reference,
      (SELECT count(*)::int FROM tickets t JOIN order_items i ON i.id=t.order_item_id WHERE i.order_id=o.id) ticket_count,
      (SELECT count(*)::int FROM check_ins c JOIN tickets t ON t.id=c.ticket_id JOIN order_items i ON i.id=t.order_item_id WHERE i.order_id=o.id) admitted
      FROM orders o JOIN event_sessions es ON es.id=o.session_id LEFT JOIN payments p ON p.order_id=o.id LEFT JOIN refund_requests rr ON rr.order_id=o.id LEFT JOIN refund_completions rc ON rc.refund_id=rr.id WHERE es.event_id=$1 ORDER BY o.created_at DESC,o.id LIMIT $2 OFFSET $3`,
        [selected, options.exportAll ? null : 201, options.exportAll ? 0 : (page - 1) * 200],
      )
    ).rows;
    const settlements = (
      await client.query<Settlement>(
        `SELECT s.*,v.reason reversal_reason FROM settlements s LEFT JOIN settlement_reversals v ON v.settlement_id=s.id WHERE event_id=$1 ORDER BY s.created_at DESC,s.id LIMIT $2 OFFSET $3`,
        [selected, options.exportAll ? null : 201, options.exportAll ? 0 : (page - 1) * 200],
      )
    ).rows;
    const support = (
      await client.query<Support>(
        `SELECT r.*,s.response FROM support_requests r JOIN orders o ON o.id=r.order_id JOIN event_sessions es ON es.id=o.session_id LEFT JOIN support_resolutions s ON s.request_id=r.id WHERE es.event_id=$1 ORDER BY r.created_at DESC,r.id LIMIT $2 OFFSET $3`,
        [selected, options.exportAll ? null : 201, options.exportAll ? 0 : (page - 1) * 200],
      )
    ).rows;
    return {
      events,
      selected,
      report,
      terms,
      orders: options.exportAll ? orders : orders.slice(0, 200),
      settlements: options.exportAll ? settlements : settlements.slice(0, 200),
      support: options.exportAll ? support : support.slice(0, 200),
      page,
      hasMore: [orders, settlements, support].some((rows) => rows.length > 200),
    };
  });
}

export async function supportNote(token: string | undefined, input: unknown) {
  const data = z
    .object({ orderId: z.uuid(), message: text.max(2000) })
    .strict()
    .parse(input);
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    const result = await client.query(
      'INSERT INTO support_requests(order_id,message,actor_id) VALUES ($1,$2,$3) RETURNING id',
      [data.orderId, data.message, actor],
    );
    await audit(client, actor, 'SUPPORT_REQUEST_RECORDED', result.rows[0].id);
  });
}

export async function resolveSupport(token: string | undefined, input: unknown) {
  const data = z
    .object({ requestId: z.uuid(), response: text.max(2000) })
    .strict()
    .parse(input);
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    const result = await client.query(
      'INSERT INTO support_resolutions(request_id,response,actor_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING request_id',
      [data.requestId, data.response, actor],
    );
    if (result.rowCount) await audit(client, actor, 'SUPPORT_REQUEST_RESOLVED', data.requestId);
  });
}
