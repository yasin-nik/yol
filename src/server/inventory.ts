import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { Hold, InventorySnapshot } from '../lib/inventory';
import type { SeatMapRow, SeatMapSeat } from '../lib/seat-map';
import { uuid } from './catalog';
import { transaction } from './db/transaction';
import { getPool } from './db/pool';
import { DomainError } from './errors';
import { audit, rateLimit, tokenHash } from './security';
import { requireAdmin } from './auth';

type Session = {
  id: string;
  title: string;
  venue: string;
  starts_at: Date;
  max_seats: number;
  hold_minutes: number;
  published: boolean;
  event_published: boolean;
};
const ownerSchema = z.string().regex(/^[a-f0-9]{64}$/);

async function lockSession(
  client: PoolClient,
  sessionId: string,
  includeDraft = false,
): Promise<Session> {
  uuid.parse(sessionId);
  const result = await client.query<Session>(
    `SELECT es.id,es.published,e.published event_published,es.starts_at,e.title,e.max_seats,e.hold_minutes,v.name venue
     FROM event_sessions es JOIN events e ON e.id=es.event_id JOIN venues v ON v.id=es.venue_id
     WHERE es.id=$1 FOR UPDATE OF es`,
    [sessionId],
  );
  const session = result.rows[0];
  if (
    !session ||
    (!includeDraft &&
      (!session.published || !session.event_published || session.starts_at.getTime() <= Date.now()))
  )
    throw new DomainError('سانس برای رزرو در دسترس نیست.', 404);
  return session;
}

async function expireLocked(client: PoolClient, sessionId: string) {
  const expired = await client.query(
    `UPDATE seat_holds SET status='EXPIRED' WHERE session_id=$1 AND status='ACTIVE'
     AND expires_at <= clock_timestamp() AND payment_state='NONE' RETURNING id`,
    [sessionId],
  );
  for (const hold of expired.rows) {
    await client.query(
      "UPDATE session_seats SET status='AVAILABLE',hold_id=NULL WHERE session_id=$1 AND hold_id=$2 AND status='HELD'",
      [sessionId, hold.id],
    );
    await audit(client, null, 'HOLD_EXPIRED', hold.id);
  }
  return expired.rowCount ?? 0;
}

async function ownedHold(
  client: PoolClient,
  sessionId: string,
  owner: string | undefined,
): Promise<Hold | null> {
  if (!ownerSchema.safeParse(owner).success) return null;
  const result = await client.query(
    `SELECT h.id,h.expires_at,h.payment_state,array_agg(ss.seat_id ORDER BY ss.seat_id) seat_ids,sum(ss.price_rial)::text total
     FROM seat_holds h JOIN session_seats ss ON ss.hold_id=h.id AND ss.session_id=h.session_id
     WHERE h.session_id=$1 AND h.owner_hash=$2 AND h.status='ACTIVE'
     GROUP BY h.id`,
    [sessionId, tokenHash(owner!)],
  );
  const hold = result.rows[0];
  return hold
    ? {
        id: hold.id,
        expiresAt: hold.expires_at.toISOString(),
        paymentState: hold.payment_state,
        seatIds: hold.seat_ids,
        totalRial: Number(hold.total),
      }
    : null;
}

export async function getInventory(
  sessionId: string,
  owner?: string,
  adminToken?: string,
): Promise<InventorySnapshot> {
  return transaction(async (client) => {
    if (adminToken !== undefined) await requireAdmin(adminToken, client);
    const session = await lockSession(client, sessionId, adminToken !== undefined);
    await expireLocked(client, sessionId);
    const result = await client.query<{
      id: string;
      section_name: string;
      section_id: string;
      row_position: number;
      number: number;
      price_rial: string;
      status: SeatMapSeat['status'];
      accessible: boolean;
    }>(
      `SELECT s.id,sec.name section_name,sec.id section_id,r.position row_position,s.number,ss.price_rial::text,ss.status,s.accessible
       FROM session_seats ss JOIN seats s ON s.id=ss.seat_id JOIN seat_rows r ON r.id=s.row_id JOIN sections sec ON sec.id=r.section_id
       WHERE ss.session_id=$1 ORDER BY sec.position,r.position,s.number`,
      [sessionId],
    );
    const rows: SeatMapRow[] = [];
    const keys = new Map<string, SeatMapRow>();
    for (const seat of result.rows) {
      const key = `${seat.section_id}:${seat.row_position}`;
      let row = keys.get(key);
      if (!row) {
        row = {
          index: rows.length + 1,
          label: `${seat.section_name} · ردیف ${seat.row_position.toLocaleString('fa-IR')}`,
          seats: [],
        };
        rows.push(row);
        keys.set(key, row);
      }
      row.seats.push({
        id: seat.id,
        label: `${seat.section_name}، ردیف ${seat.row_position.toLocaleString('fa-IR')} صندلی ${seat.number.toLocaleString('fa-IR')}`,
        row: seat.row_position,
        col: seat.number,
        priceRial: Number(seat.price_rial),
        status: seat.status,
        accessible: seat.accessible,
      });
    }
    const hold = await ownedHold(client, sessionId, owner);
    const time = await client.query('SELECT clock_timestamp() server_time');
    return {
      data: { sectionName: session.venue, rows },
      hold,
      maxSeats: session.max_seats,
      title: session.title,
      venue: session.venue,
      startsAt: session.starts_at.toISOString(),
      serverTime: time.rows[0].server_time.toISOString(),
    };
  });
}

export async function createHold(sessionId: string, owner: string, input: unknown): Promise<Hold> {
  ownerSchema.parse(owner);
  const seatIds = z
    .array(uuid)
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length)
    .parse(input)
    .sort();
  uuid.parse(sessionId);
  await rateLimit('hold:global', 300, 60);
  await rateLimit(`hold:${tokenHash(owner)}`, 15, 60);
  return transaction(async (client) => {
    const session = await lockSession(client, sessionId);
    await expireLocked(client, sessionId);
    if (seatIds.length > session.max_seats)
      throw new DomainError('تعداد صندلی بیشتر از سقف این رویداد است.');
    const existing = await ownedHold(client, sessionId, owner);
    if (existing) {
      if (existing.seatIds.join(',') === seatIds.join(',')) return existing;
      throw new DomainError('در این سانس رزرو فعال دارید؛ برای تغییر، ابتدا آن را لغو کنید.', 409);
    }
    const seats = await client.query(
      'SELECT seat_id,status FROM session_seats WHERE session_id=$1 AND seat_id=ANY($2::uuid[]) ORDER BY seat_id FOR UPDATE',
      [sessionId, seatIds],
    );
    if (seats.rowCount !== seatIds.length || seats.rows.some((seat) => seat.status !== 'AVAILABLE'))
      throw new DomainError('بعضی صندلی‌ها دیگر آزاد نیستند؛ نقشه به‌روز می‌شود.', 409);
    const hold = await client.query(
      `INSERT INTO seat_holds(session_id,owner_hash,expires_at) VALUES ($1,$2,clock_timestamp()+$3*interval '1 minute') RETURNING id`,
      [sessionId, tokenHash(owner), session.hold_minutes],
    );
    const updated = await client.query(
      "UPDATE session_seats SET status='HELD',hold_id=$3 WHERE session_id=$1 AND seat_id=ANY($2::uuid[]) AND status='AVAILABLE' RETURNING seat_id",
      [sessionId, seatIds, hold.rows[0].id],
    );
    if (updated.rowCount !== seatIds.length)
      throw new DomainError('رزرو هم‌زمان تغییر کرد؛ دوباره تلاش کنید.', 409);
    await audit(client, null, 'HOLD_CREATED', hold.rows[0].id, { count: seatIds.length });
    return (await ownedHold(client, sessionId, owner))!;
  });
}

export async function cancelHold(sessionId: string, owner: string, holdId: string) {
  ownerSchema.parse(owner);
  uuid.parse(holdId);
  await rateLimit(`cancel:${tokenHash(owner)}`, 20, 60);
  return transaction(async (client) => {
    await lockSession(client, sessionId, true);
    await expireLocked(client, sessionId);
    const hold = await client.query(
      'SELECT status,payment_state FROM seat_holds WHERE id=$1 AND session_id=$2 AND owner_hash=$3',
      [holdId, sessionId, tokenHash(owner)],
    );
    if (!hold.rowCount) throw new DomainError('رزرو متعلق به این مرورگر نیست.', 403);
    if (hold.rows[0].status !== 'ACTIVE') return;
    if (hold.rows[0].payment_state !== 'NONE')
      throw new DomainError('رزرو با پرداخت در انتظار یا نامشخص قابل آزادسازی نیست.', 409);
    await client.query(
      "UPDATE session_seats SET status='AVAILABLE',hold_id=NULL WHERE session_id=$1 AND hold_id=$2 AND status='HELD'",
      [sessionId, holdId],
    );
    await client.query("UPDATE seat_holds SET status='CANCELLED' WHERE id=$1", [holdId]);
    await audit(client, null, 'HOLD_CANCELLED', holdId);
  });
}

export async function setSeatBlocked(adminToken: string | undefined, input: unknown) {
  return transaction(async (client) => {
    const actor = await requireAdmin(adminToken, client);
    const data = z.object({ sessionId: uuid, seatId: uuid, blocked: z.boolean() }).parse(input);
    await lockSession(client, data.sessionId, true);
    await expireLocked(client, data.sessionId);
    const result = await client.query(
      'UPDATE session_seats SET status=$3 WHERE session_id=$1 AND seat_id=$2 AND status=$4 RETURNING seat_id',
      [
        data.sessionId,
        data.seatId,
        data.blocked ? 'BLOCKED' : 'AVAILABLE',
        data.blocked ? 'AVAILABLE' : 'BLOCKED',
      ],
    );
    if (!result.rowCount)
      throw new DomainError('صندلی رزروشده یا فروخته‌شده قابل تغییر نیست.', 409);
    await audit(client, actor, data.blocked ? 'SEAT_BLOCKED' : 'SEAT_UNBLOCKED', data.seatId, {
      sessionId: data.sessionId,
    });
  });
}

export async function expireHolds() {
  const sessions = await getPool().query(
    "SELECT DISTINCT session_id FROM seat_holds WHERE status='ACTIVE' AND payment_state='NONE' AND expires_at <= clock_timestamp()",
  );
  let count = 0;
  for (const session of sessions.rows)
    count += await transaction(async (client) => {
      await lockSession(client, session.session_id, true);
      return expireLocked(client, session.session_id);
    });
  return count;
}
