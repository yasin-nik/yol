import { randomUUID } from 'node:crypto';
import { getPool } from '../src/server/db/pool';
import { hashPassword, newToken, tokenHash } from '../src/server/security';
import { createEvent, createSession, createVenue, setPublished } from '../src/server/catalog';

export async function adminFixture(role = 'ADMIN') {
  const email = `${randomUUID()}@example.test`;
  const password = `test-${randomUUID()}`;
  const user = await getPool().query(
    'INSERT INTO users(email,password_hash,role) VALUES ($1,$2,$3) RETURNING id',
    [email, await hashPassword(password), role],
  );
  const token = newToken();
  await getPool().query(
    "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",
    [tokenHash(token), user.rows[0].id],
  );
  return { token, userId: user.rows[0].id as string, email, password };
}

export async function catalogFixture() {
  const admin = await adminFixture();
  const venueId = await createVenue(admin.token, {
    name: 'سالن آزمایشی',
    city: `شهر-${randomUUID()}`,
    address: 'نشانی آزمایشی',
    sections: [
      { name: 'همکف', rows: 2, seatsPerRow: 4 },
      { name: 'بالکن', rows: 1, seatsPerRow: 2 },
    ],
  });
  const eventId = await createEvent(admin.token, {
    title: 'رویداد آزمایشی',
    category: 'کنسرت',
    description: 'فقط داده آزمایش',
    maxSeats: 6,
    holdMinutes: 10,
  });
  const sections = await getPool().query(
    'SELECT id FROM sections WHERE venue_id=$1 ORDER BY position',
    [venueId],
  );
  const sessionId = await createSession(admin.token, {
    eventId,
    venueId,
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    prices: sections.rows.map((section, index) => ({
      sectionId: section.id,
      priceRial: 1000000 + index * 100000,
    })),
  });
  await setPublished(admin.token, { eventId, published: true });
  const seats = await getPool().query(
    'SELECT seat_id FROM session_seats WHERE session_id=$1 ORDER BY seat_id',
    [sessionId],
  );
  return {
    ...admin,
    eventId,
    venueId,
    sessionId,
    seatIds: seats.rows.map((seat) => seat.seat_id as string),
  };
}
