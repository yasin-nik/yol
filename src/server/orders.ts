import { z } from 'zod';
import { transaction } from './db/transaction';
import { getPool } from './db/pool';
import { requireCustomer } from './customer';
import { DomainError } from './errors';
import { audit, tokenHash } from './security';
import { lockSession, expireLocked } from './inventory';

export async function createOrder(
  token: string | undefined,
  owner: string | undefined,
  input: unknown,
) {
  const { sessionId, holdId } = z
    .object({ sessionId: z.uuid(), holdId: z.uuid() })
    .strict()
    .parse(input);
  if (!owner || !/^[a-f0-9]{64}$/.test(owner))
    throw new DomainError('رزرو این مرورگر یافت نشد.', 403);
  return transaction(async (client) => {
    const user = await requireCustomer(token, client);
    await lockSession(client, sessionId);
    await expireLocked(client, sessionId);
    const holds = await client.query(
      'SELECT * FROM seat_holds WHERE id=$1 AND session_id=$2 AND owner_hash=$3',
      [holdId, sessionId, tokenHash(owner)],
    );
    const hold = holds.rows[0];
    if (!hold || (hold.user_id && hold.user_id !== user))
      throw new DomainError('این رزرو متعلق به شما نیست.', 403);
    const existing = await client.query('SELECT id FROM orders WHERE hold_id=$1 AND user_id=$2', [
      holdId,
      user,
    ]);
    if (existing.rowCount) return existing.rows[0].id as string;
    if (hold.status !== 'ACTIVE' || hold.expires_at <= new Date() || hold.payment_state !== 'NONE')
      throw new DomainError('زمان رزرو پایان یافته است؛ دوباره صندلی انتخاب کنید.', 409);
    const items = await client.query(
      `SELECT ss.seat_id,ss.price_rial,sec.name || '، ردیف ' || r.position || '، صندلی ' || s.number label
      FROM session_seats ss JOIN seats s ON s.id=ss.seat_id JOIN seat_rows r ON r.id=s.row_id JOIN sections sec ON sec.id=r.section_id
      WHERE ss.session_id=$1 AND ss.hold_id=$2 AND ss.status='HELD' ORDER BY ss.seat_id`,
      [sessionId, holdId],
    );
    if (!items.rowCount) throw new DomainError('رزرو معتبر نیست.', 409);
    const total = items.rows.reduce((sum, item) => sum + Number(item.price_rial), 0);
    const order = await client.query(
      'INSERT INTO orders(user_id,hold_id,session_id,total_rial) VALUES ($1,$2,$3,$4) RETURNING id',
      [user, holdId, sessionId, total],
    );
    const id = order.rows[0].id as string;
    for (const item of items.rows)
      await client.query(
        'INSERT INTO order_items(order_id,session_id,seat_id,label,price_rial) VALUES ($1,$2,$3,$4,$5)',
        [id, sessionId, item.seat_id, item.label, item.price_rial],
      );
    await client.query('UPDATE seat_holds SET user_id=$2 WHERE id=$1', [holdId, user]);
    await audit(client, user, 'ORDER_CREATED', id);
    return id;
  });
}

export async function customerOrders(token: string | undefined) {
  const user = await requireCustomer(token);
  return (
    await getPool().query(
      `SELECT o.id,o.status,o.session_id,o.total_rial::text,e.title,es.starts_at,v.name venue,p.authority,p.state payment_state,
    (h.status<>'ACTIVE' OR h.expires_at<=now()) AND p.id IS NULL expired,
    (SELECT json_agg(json_build_object('label',i.label,'priceRial',i.price_rial)) FROM order_items i WHERE i.order_id=o.id) items
    FROM orders o JOIN seat_holds h ON h.id=o.hold_id LEFT JOIN payments p ON p.order_id=o.id JOIN event_sessions es ON es.id=o.session_id JOIN events e ON e.id=es.event_id JOIN venues v ON v.id=es.venue_id
    WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 100`,
      [user],
    )
  ).rows;
}
