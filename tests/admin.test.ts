import { describe, expect, it } from 'vitest';
import { getPool } from '../src/server/db/pool';
import { login, logout, requireAdmin } from '../src/server/auth';
import {
  createEvent,
  createVenue,
  createSession,
  setPublished,
  publicEvent,
} from '../src/server/catalog';
import { adminFixture, catalogFixture } from './fixtures';
import { tokenHash, newToken } from '../src/server/security';
import { execFileSync } from 'node:child_process';

describe('M2 admin and catalog', () => {
  it('INV-11 bootstraps an admin through the actual CLI without exposing its password', async () => {
    const email = `${newToken()}@example.test`;
    const password = newToken();
    const output = execFileSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/create-admin.ts'],
      {
        cwd: process.cwd(),
        env: { ...process.env, ADMIN_EMAIL: email, ADMIN_PASSWORD: password },
        encoding: 'utf8',
      },
    );
    expect(output).toContain('مدیر ساخته شد');
    expect(output).not.toContain(password);
    const token = await login({ email, password });
    const actor = await requireAdmin(token);
    const logs = await getPool().query(
      'SELECT action FROM audit_logs WHERE actor_id=$1 ORDER BY id',
      [actor],
    );
    expect(logs.rows.map((log) => log.action)).toEqual(['ADMIN_CREATED', 'ADMIN_LOGIN']);
    await logout(token);
  });
  it('INV-07 authenticates admin, expires and revokes sessions, and denies a different role', async () => {
    const admin = await adminFixture();
    const token = await login({ email: admin.email, password: admin.password });
    expect(await requireAdmin(token)).toBe(admin.userId);
    await logout(token);
    await expect(requireAdmin(token)).rejects.toThrow('دسترسی');
    await getPool().query(
      "UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [tokenHash(admin.token)],
    );
    await expect(requireAdmin(admin.token)).rejects.toThrow('دسترسی');
    const customer = await adminFixture('CUSTOMER');
    await expect(createVenue(customer.token, {})).rejects.toThrow('دسترسی');
    await expect(createEvent(undefined, {})).rejects.toThrow('وارد');
    await expect(requireAdmin(newToken())).rejects.toThrow('دسترسی');
  });

  it('INV-09 limits repeated incorrect logins persistently', async () => {
    const admin = await adminFixture();
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(login({ email: admin.email, password: 'incorrect' })).rejects.toThrow('صحیح');
    await expect(login({ email: admin.email, password: admin.password })).rejects.toMatchObject({
      status: 429,
    });
  });

  it('INV-10 rejects invalid input, too much capacity, duplicate sections and incomplete prices', async () => {
    const admin = await adminFixture();
    await expect(
      createVenue(admin.token, {
        name: 'سالن',
        city: 'تهران',
        address: 'نشانی',
        sections: [{ name: 'الف', rows: 50, seatsPerRow: 50 }],
      }),
    ).rejects.toThrow();
    await expect(
      createVenue(admin.token, {
        name: 'سالن',
        city: 'تهران',
        address: 'نشانی',
        sections: [
          { name: 'الف', rows: 1, seatsPerRow: 1 },
          { name: 'الف', rows: 1, seatsPerRow: 1 },
        ],
      }),
    ).rejects.toThrow();
    const fixture = await catalogFixture();
    await expect(
      createSession(admin.token, {
        eventId: fixture.eventId,
        venueId: fixture.venueId,
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        prices: [],
      }),
    ).rejects.toThrow();
    await expect(createEvent(admin.token, { title: "'; DROP TABLE events; --" })).rejects.toThrow();
  });

  it('INV-11 creates a complete event with per-section inventory and append-only audit in the same transaction', async () => {
    const fixture = await catalogFixture();
    expect(await publicEvent(fixture.eventId)).toMatchObject({ title: 'رویداد آزمایشی' });
    const inventory = await getPool().query(
      'SELECT price_rial::text,count(*)::int quantity FROM session_seats WHERE session_id=$1 GROUP BY price_rial ORDER BY price_rial',
      [fixture.sessionId],
    );
    expect(inventory.rows).toEqual([
      { price_rial: '1000000', quantity: 8 },
      { price_rial: '1100000', quantity: 2 },
    ]);
    const logs = await getPool().query(
      'SELECT action FROM audit_logs WHERE actor_id=$1 ORDER BY id',
      [fixture.userId],
    );
    expect(logs.rows.map((log) => log.action)).toEqual([
      'VENUE_CREATED',
      'EVENT_CREATED',
      'SESSION_CREATED',
      'EVENT_PUBLISHED',
    ]);
    await expect(
      getPool().query('UPDATE audit_logs SET action=$1 WHERE actor_id=$2', [
        'changed',
        fixture.userId,
      ]),
    ).rejects.toThrow('append-only');
    await expect(
      getPool().query('DELETE FROM audit_logs WHERE actor_id=$1', [fixture.userId]),
    ).rejects.toThrow('append-only');
    await setPublished(fixture.token, { eventId: fixture.eventId, published: false });
    expect(await publicEvent(fixture.eventId)).toBeNull();
  });

  it('INV-14 stores integer rial and timezone-aware session instants', async () => {
    const fixture = await catalogFixture();
    await expect(
      getPool().query('UPDATE session_seats SET price_rial=-1 WHERE session_id=$1', [
        fixture.sessionId,
      ]),
    ).rejects.toThrow();
    const event = await createEvent(fixture.token, {
      title: 'زمان',
      category: 'تست',
      description: 'تست',
      maxSeats: 6,
      holdMinutes: 10,
    });
    await expect(setPublished(fixture.token, { eventId: event, published: true })).rejects.toThrow(
      'سانس',
    );
    const result = await getPool().query(
      'SELECT pg_typeof(starts_at)::text type FROM event_sessions WHERE id=$1',
      [fixture.sessionId],
    );
    expect(result.rows[0].type).toBe('timestamp with time zone');
  });
});
