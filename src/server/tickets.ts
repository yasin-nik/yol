import { z } from 'zod';
import { requireCustomer } from './customer';
import { getPool } from './db/pool';
import { DomainError } from './errors';

export async function customerTickets(token: string | undefined, ticketId?: string) {
  if (ticketId) z.uuid().parse(ticketId);
  const user = await requireCustomer(token);
  const result = await getPool().query(
    `SELECT t.id,t.token,i.label,e.title,es.starts_at,v.name venue,o.id order_id
    FROM tickets t JOIN order_items i ON i.id=t.order_item_id JOIN orders o ON o.id=i.order_id
    JOIN payments p ON p.order_id=o.id JOIN event_sessions es ON es.id=o.session_id JOIN events e ON e.id=es.event_id JOIN venues v ON v.id=es.venue_id
    WHERE o.user_id=$1 AND o.status='PAID' AND p.state='VERIFIED'
    AND NOT EXISTS(SELECT 1 FROM refund_requests rr WHERE rr.order_id=o.id)
    AND ($2::uuid IS NULL OR t.id=$2) ORDER BY t.created_at DESC LIMIT 2000`,
    [user, ticketId ?? null],
  );
  if (ticketId && !result.rowCount) throw new DomainError('بلیت یافت نشد.', 404);
  return result.rows;
}
