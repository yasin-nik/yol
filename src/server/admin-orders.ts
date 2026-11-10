import { requireAdmin } from './auth';
import { getPool } from './db/pool';
export async function adminOrders(token: string | undefined) {
  await requireAdmin(token);
  return (
    await getPool()
      .query(`SELECT o.id,o.status,o.total_rial::text,e.title,p.state payment_state,p.reference,
    (SELECT count(*)::int FROM tickets t JOIN order_items i ON i.id=t.order_item_id WHERE i.order_id=o.id) ticket_count
    FROM orders o JOIN event_sessions es ON es.id=o.session_id JOIN events e ON e.id=es.event_id
    LEFT JOIN payments p ON p.order_id=o.id ORDER BY (o.status='REVIEW') DESC,o.created_at DESC LIMIT 100`)
  ).rows;
}
