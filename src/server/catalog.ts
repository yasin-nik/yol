import { z } from 'zod';
import { requireAdmin } from './auth';
import { transaction } from './db/transaction';
import { getPool } from './db/pool';
import { DomainError } from './errors';
import { audit } from './security';

const text = z.string().trim().min(1).max(200);
export type PublicSession = {
  id: string;
  starts_at: string;
  venue: string;
  address: string;
  city: string;
};
export type PublicEvent = {
  id: string;
  title: string;
  description: string;
  category: string;
  max_seats: number;
  hold_minutes: number;
  sessions: PublicSession[];
};
export const uuid = z.uuid();
const sectionSchema = z.object({
  name: text,
  rows: z.coerce.number().int().min(1).max(50),
  seatsPerRow: z.coerce.number().int().min(1).max(50),
});
const venueSchema = z
  .object({
    name: text,
    city: text,
    address: z.string().trim().min(1).max(1000),
    sections: z.array(sectionSchema).min(1).max(20),
  })
  .superRefine((data, ctx) => {
    if (data.sections.reduce((sum, section) => sum + section.rows * section.seatsPerRow, 0) > 1000)
      ctx.addIssue({ code: 'custom', message: 'ظرفیت سالن حداکثر ۱۰۰۰ صندلی است.' });
    if (new Set(data.sections.map((section) => section.name)).size !== data.sections.length)
      ctx.addIssue({ code: 'custom', message: 'نام بخش‌ها باید متفاوت باشد.' });
  });
const eventSchema = z.object({
  title: text,
  description: z.string().trim().min(1).max(5000),
  category: text,
  maxSeats: z.coerce.number().int().min(1).max(20),
  holdMinutes: z.coerce.number().int().min(1).max(30),
});
const sessionSchema = z.object({
  eventId: uuid,
  venueId: uuid,
  startsAt: z.iso.datetime({ offset: true }),
  prices: z
    .array(
      z.object({ sectionId: uuid, priceRial: z.coerce.number().int().min(0).max(9000000000000) }),
    )
    .min(1)
    .max(20),
});

export async function createVenue(token: string | undefined, input: unknown) {
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    const data = venueSchema.parse(input);
    const city = await client.query(
      'INSERT INTO cities(name) VALUES ($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
      [data.city],
    );
    const venue = await client.query(
      'INSERT INTO venues(city_id,name,address) VALUES ($1,$2,$3) RETURNING id',
      [city.rows[0].id, data.name, data.address],
    );
    for (const [index, section] of data.sections.entries()) {
      const created = await client.query(
        'INSERT INTO sections(venue_id,name,position) VALUES ($1,$2,$3) RETURNING id',
        [venue.rows[0].id, section.name, index + 1],
      );
      await client.query(
        `WITH new_rows AS (INSERT INTO seat_rows(section_id,position) SELECT $1,generate_series(1,$2::int) RETURNING id)
         INSERT INTO seats(row_id,number) SELECT new_rows.id, number FROM new_rows CROSS JOIN generate_series(1,$3::int) number`,
        [created.rows[0].id, section.rows, section.seatsPerRow],
      );
    }
    await audit(client, actor, 'VENUE_CREATED', venue.rows[0].id, {
      capacity: data.sections.reduce((sum, section) => sum + section.rows * section.seatsPerRow, 0),
    });
    return venue.rows[0].id as string;
  });
}

export async function createEvent(token: string | undefined, input: unknown) {
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    const data = eventSchema.parse(input);
    const result = await client.query(
      'INSERT INTO events(title,description,category,max_seats,hold_minutes) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [data.title, data.description, data.category, data.maxSeats, data.holdMinutes],
    );
    await audit(client, actor, 'EVENT_CREATED', result.rows[0].id);
    return result.rows[0].id as string;
  });
}

export async function createSession(token: string | undefined, input: unknown) {
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    const data = sessionSchema.parse(input);
    if (new Date(data.startsAt).getTime() <= Date.now())
      throw new DomainError('زمان سانس باید در آینده باشد.');
    const sections = await client.query('SELECT id FROM sections WHERE venue_id=$1', [
      data.venueId,
    ]);
    const sectionIds = new Set(data.prices.map((price) => price.sectionId));
    if (
      !sections.rowCount ||
      sectionIds.size !== data.prices.length ||
      sectionIds.size !== sections.rowCount ||
      sections.rows.some((section) => !sectionIds.has(section.id))
    )
      throw new DomainError('قیمت همه بخش‌های همین سالن را مشخص کنید.');
    const result = await client.query(
      'INSERT INTO event_sessions(event_id,venue_id,starts_at) VALUES ($1,$2,$3) RETURNING id',
      [data.eventId, data.venueId, data.startsAt],
    );
    for (const price of data.prices) {
      await client.query(
        `INSERT INTO session_seats(session_id,seat_id,price_rial)
         SELECT $1,s.id,$2 FROM seats s JOIN seat_rows r ON r.id=s.row_id WHERE r.section_id=$3`,
        [result.rows[0].id, price.priceRial, price.sectionId],
      );
    }
    await audit(client, actor, 'SESSION_CREATED', result.rows[0].id);
    return result.rows[0].id as string;
  });
}

export async function setPublished(token: string | undefined, input: unknown) {
  return transaction(async (client) => {
    const actor = await requireAdmin(token, client);
    const data = z.object({ eventId: uuid, published: z.boolean() }).parse(input);
    await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE', [data.eventId]);
    const sessions = await client.query(
      'SELECT id FROM event_sessions WHERE event_id=$1 AND starts_at > now()',
      [data.eventId],
    );
    if (data.published && !sessions.rowCount)
      throw new DomainError('ابتدا دست‌کم یک سانس آینده بسازید.');
    const result = await client.query('UPDATE events SET published=$2 WHERE id=$1 RETURNING id', [
      data.eventId,
      data.published,
    ]);
    if (!result.rowCount) throw new DomainError('رویداد پیدا نشد.', 404);
    await client.query('UPDATE event_sessions SET published=$2 WHERE event_id=$1', [
      data.eventId,
      data.published,
    ]);
    await audit(
      client,
      actor,
      data.published ? 'EVENT_PUBLISHED' : 'EVENT_UNPUBLISHED',
      data.eventId,
    );
  });
}

export async function adminCatalog(token: string | undefined) {
  await requireAdmin(token);
  const [venues, sections, events, sessions, logs] = await Promise.all([
    getPool().query(
      'SELECT v.*,c.name city FROM venues v JOIN cities c ON c.id=v.city_id ORDER BY v.created_at DESC',
    ),
    getPool().query('SELECT * FROM sections ORDER BY venue_id,position'),
    getPool().query('SELECT * FROM events ORDER BY created_at DESC'),
    getPool().query(
      'SELECT es.*,e.title,v.name venue FROM event_sessions es JOIN events e ON e.id=es.event_id JOIN venues v ON v.id=es.venue_id ORDER BY es.starts_at',
    ),
    getPool().query('SELECT action,target_id,created_at FROM audit_logs ORDER BY id DESC LIMIT 30'),
  ]);
  return {
    venues: venues.rows,
    sections: sections.rows,
    events: events.rows,
    sessions: sessions.rows,
    logs: logs.rows,
  };
}

export async function publicEvents() {
  return (
    await getPool().query(
      `SELECT e.id,e.title,e.category, c.name city, min(es.starts_at) starts_at, min(ss.price_rial)::text min_price_rial
     FROM events e JOIN event_sessions es ON es.event_id=e.id JOIN venues v ON v.id=es.venue_id JOIN cities c ON c.id=v.city_id
     JOIN session_seats ss ON ss.session_id=es.id
     WHERE e.published AND es.published AND es.starts_at > now()
     GROUP BY e.id,c.name ORDER BY min(es.starts_at)`,
    )
  ).rows;
}

export async function publicEvent(id: string): Promise<PublicEvent | null> {
  if (!uuid.safeParse(id).success) return null;
  const event = await getPool().query(
    'SELECT id,title,description,category,max_seats,hold_minutes FROM events WHERE id=$1 AND published',
    [id],
  );
  if (!event.rowCount) return null;
  const sessions = await getPool().query(
    `SELECT es.id,es.starts_at,v.name venue,v.address,c.name city FROM event_sessions es
     JOIN venues v ON v.id=es.venue_id JOIN cities c ON c.id=v.city_id
     WHERE es.event_id=$1 AND es.published AND es.starts_at > now() ORDER BY es.starts_at`,
    [id],
  );
  return {
    ...event.rows[0],
    sessions: sessions.rows.map((session) => ({
      ...session,
      starts_at: session.starts_at.toISOString(),
    })),
  };
}
