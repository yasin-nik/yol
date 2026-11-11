import { mkdir, writeFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { expect, it } from 'vitest';
import { adminFixture } from './fixtures';
import { createEvent, createSession, createVenue, setPublished } from '../src/server/catalog';
import { createHold, getInventory } from '../src/server/inventory';
import { createOrder } from '../src/server/orders';
import { startPayment, simulatePayment, verifyPayment } from '../src/server/payments';
import { getPool } from '../src/server/db/pool';
import { newToken, tokenHash } from '../src/server/security';
import { configureTerms } from '../src/server/finance';

async function thousandSeats() {
  const admin = await adminFixture();
  const venueId = await createVenue(admin.token, {
    name: 'بار M8 — آزمایشی',
    city: 'آزمایش',
    address: 'بدون مخاطب واقعی',
    sections: [{ name: 'همکف', rows: 20, seatsPerRow: 50 }],
  });
  const eventId = await createEvent(admin.token, {
    title: 'بار M8 — بدون پول واقعی',
    category: 'آزمون',
    description: 'فقط Fake',
    maxSeats: 20,
    holdMinutes: 10,
  });
  const sections = await getPool().query('SELECT id FROM sections WHERE venue_id=$1', [venueId]);
  const sessionId = await createSession(admin.token, {
    eventId,
    venueId,
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    prices: [{ sectionId: sections.rows[0].id, priceRial: 1000000 }],
  });
  await setPublished(admin.token, { eventId, published: true });
  await configureTerms(admin.token, {
    eventId,
    commissionBps: 1000,
    fixedRial: 0,
    taxBps: 0,
    deductionRial: 0,
  });
  const seats = await getPool().query(
    'SELECT seat_id FROM session_seats WHERE session_id=$1 ORDER BY seat_id',
    [sessionId],
  );
  return { sessionId, eventId, seats: seats.rows.map((s) => s.seat_id as string) };
}

it('M8 INV-01/02/05: 50 concurrent buyers sell all 1000 seats once; 50 contenders have one winner', async () => {
  const fixture = await thousandSeats();
  const timings: Record<string, { p50: number; p95: number; max: number }> = {};
  async function wave<T>(label: string, operation: (index: number) => Promise<T>) {
    const durations: number[] = [];
    const output = await Promise.all(
      Array.from({ length: 50 }, async (_, i) => {
        const start = performance.now();
        const result = await operation(i);
        durations.push(performance.now() - start);
        return result;
      }),
    );
    durations.sort((a, b) => a - b);
    timings[label] = {
      p50: Math.round(durations[24]),
      p95: Math.round(durations[47]),
      max: Math.round(durations[49]),
    };
    expect(durations[49], `${label} local maximum latency`).toBeLessThan(15000);
    return output;
  }
  // Test identities only; inventory, order, payment and finance all use real services.
  const buyers = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const user = await getPool().query(
        "INSERT INTO users(phone,role) VALUES ($1,'CUSTOMER') RETURNING id",
        ['09' + randomInt(100000000, 1000000000)],
      );
      const token = newToken();
      await getPool().query(
        "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",
        [tokenHash(token), user.rows[0].id],
      );
      return { token, owner: newToken() };
    }),
  );
  const holds = await wave('hold', (i) =>
    createHold(fixture.sessionId, buyers[i].owner, fixture.seats.slice(i * 20, i * 20 + 20)),
  );
  const orders = await wave('order', (i) =>
    createOrder(buyers[i].token, buyers[i].owner, {
      sessionId: fixture.sessionId,
      holdId: holds[i].id,
    }),
  );
  const authorities = await wave('paymentStart', (i) => startPayment(buyers[i].token, orders[i]));
  const states = await wave('verifyAndIssue', (i) =>
    simulatePayment(buyers[i].token, { authority: authorities[i], outcome: 'SUCCESS' }),
  );
  expect(states).toHaveLength(50);
  await wave('callbackReplay', (i) => verifyPayment(authorities[i]));
  const counts = (
    await getPool().query(
      `SELECT
    (SELECT count(*)::int FROM session_seats WHERE session_id=$1 AND status='SOLD') sold,
    (SELECT count(*)::int FROM tickets WHERE session_id=$1) tickets,
    (SELECT count(DISTINCT seat_id)::int FROM tickets WHERE session_id=$1) unique_seats,
    (SELECT count(*)::int FROM orders WHERE session_id=$1 AND status='PAID') paid,
    (SELECT sum(total_rial)::text FROM orders WHERE session_id=$1 AND status='PAID') gross,
    (SELECT count(*)::int FROM order_financials f JOIN orders o ON o.id=f.order_id WHERE o.session_id=$1) snapshots`,
      [fixture.sessionId],
    )
  ).rows[0];
  expect(counts).toEqual({
    sold: 1000,
    tickets: 1000,
    unique_seats: 1000,
    paid: 50,
    gross: '1000000000',
    snapshots: 50,
  });
  const inventory = await wave('inventory1000', () => getInventory(fixture.sessionId));
  expect(inventory.every((s) => s.data.rows.flatMap((r) => r.seats).length === 1000)).toBe(true);
  const competition = await thousandSeats();
  const contested = await Promise.allSettled(
    Array.from({ length: 50 }, () =>
      createHold(competition.sessionId, newToken(), [competition.seats[0]]),
    ),
  );
  expect(contested.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const losers = contested.filter((r) => r.status === 'rejected');
  expect(losers).toHaveLength(49);
  expect(losers.every((r) => r.status === 'rejected' && r.reason.status === 409)).toBe(true);
  await mkdir('.local/qa', { recursive: true });
  const report = {
    date: new Date().toISOString(),
    surface: 'real PostgreSQL application services; Fake gateway; pool max=10',
    buyers: 50,
    capacity: 1000,
    counts,
    conflictWinners: 1,
    conflictLosers: 49,
    milliseconds: timings,
  };
  await writeFile('.local/qa/m8-load.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}, 120000);
