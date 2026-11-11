import { z } from 'zod';
import type { PoolClient } from 'pg';
import { getPool } from './db/pool';
import { transaction } from './db/transaction';
import { requireAdmin } from './auth';
import { DomainError } from './errors';
import { audit, hashPassword, rateLimit, tokenHash } from './security';
import { lockSession } from './inventory';

export async function requireOperator(
  token: string | undefined,
  client = getPool() as Pick<PoolClient, 'query'>,
) {
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new DomainError('ابتدا وارد حساب مسئول ورود شوید.', 401);
  const r = await client.query(
    `SELECT u.id,u.role FROM users u JOIN auth_sessions s ON s.user_id=u.id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND u.role IN ('ADMIN','CHECK_IN')
    AND (NOT u.local_only OR $2)`,
    [tokenHash(token), process.env.NODE_ENV !== 'production'],
  );
  if (!r.rowCount) throw new DomainError('دسترسی کنترل ورود لازم است.', 403);
  return r.rows[0] as { id: string; role: string };
}

export async function operatorSessions(token: string | undefined) {
  const user = await requireOperator(token);
  return (
    await getPool().query(
      `SELECT es.id,e.title,es.starts_at,v.name venue,
    (SELECT count(*)::int FROM check_ins c JOIN tickets t ON t.id=c.ticket_id WHERE t.session_id=es.id) admitted
    FROM event_sessions es JOIN events e ON e.id=es.event_id JOIN venues v ON v.id=es.venue_id
    WHERE $1='ADMIN' OR EXISTS(SELECT 1 FROM check_in_assignments a WHERE a.session_id=es.id AND a.user_id=$2)
    ORDER BY es.starts_at DESC LIMIT 200`,
      [user.role, user.id],
    )
  ).rows;
}

export async function createOperator(token: string | undefined, input: unknown) {
  const d = z
    .object({
      email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      password: z.string().min(12).max(128),
      sessionId: z.uuid(),
    })
    .strict()
    .parse(input);
  await requireAdmin(token);
  const hash = await hashPassword(d.password);
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    // Existing accounts are never silently reset or promoted.
    const u = await client.query(
      "INSERT INTO users(email,password_hash,role) VALUES ($1,$2,'CHECK_IN') RETURNING id",
      [d.email, hash],
    );
    await client.query('INSERT INTO check_in_assignments(user_id,session_id) VALUES ($1,$2)', [
      u.rows[0].id,
      d.sessionId,
    ]);
    await audit(client, actor, 'CHECK_IN_OPERATOR_CREATED', u.rows[0].id, {
      sessionId: d.sessionId,
    });
  });
}

export async function checkIn(token: string | undefined, input: unknown) {
  const d = z
    .object({ sessionId: z.uuid(), code: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(input);
  const user = await requireOperator(token);
  await rateLimit(`check-in:${user.id}`, 180, 60);
  return transaction(async (client) => {
    const actor = await requireOperator(token, client);
    await lockSession(client, d.sessionId);
    if (
      actor.role !== 'ADMIN' &&
      !(
        await client.query(
          'SELECT 1 FROM check_in_assignments WHERE user_id=$1 AND session_id=$2',
          [actor.id, d.sessionId],
        )
      ).rowCount
    )
      throw new DomainError('این سانس به شما واگذار نشده است.', 403);
    const r = await client.query(
      `SELECT t.id,i.label,c.created_at FROM tickets t JOIN order_items i ON i.id=t.order_item_id
      JOIN orders o ON o.id=i.order_id JOIN payments p ON p.order_id=o.id LEFT JOIN check_ins c ON c.ticket_id=t.id
      WHERE t.token=$1 AND t.session_id=$2 AND o.status='PAID' AND p.state='VERIFIED'`,
      [d.code, d.sessionId],
    );
    if (!r.rowCount) return { status: 'INVALID' as const };
    const ticket = r.rows[0];
    const inserted = await client.query(
      'INSERT INTO check_ins(ticket_id,actor_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING created_at',
      [ticket.id, actor.id],
    );
    if (!inserted.rowCount)
      return {
        status: 'USED' as const,
        label: ticket.label as string,
        at: ticket.created_at as Date,
      };
    await audit(client, actor.id, 'TICKET_CHECKED_IN', ticket.id);
    return {
      status: 'ACCEPTED' as const,
      label: ticket.label as string,
      at: inserted.rows[0].created_at as Date,
    };
  });
}
