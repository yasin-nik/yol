import { describe, expect, it } from 'vitest';
import { catalogFixture } from './fixtures';
import { getPool } from '../src/server/db/pool';
import {
  createHold,
  cancelHold,
  getInventory,
  expireHolds,
  setSeatBlocked,
} from '../src/server/inventory';
import { createSession, setPublished } from '../src/server/catalog';
import { newToken } from '../src/server/security';

describe('M3 real PostgreSQL inventory', () => {
  it('INV-01 fifty concurrent buyers can acquire the same seat only once', async () => {
    const fixture = await catalogFixture();
    const attempts = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        createHold(fixture.sessionId, newToken(), [fixture.seatIds[0]]),
      ),
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(49);
    const inventory = await getPool().query(
      'SELECT status,hold_id FROM session_seats WHERE session_id=$1 AND seat_id=$2',
      [fixture.sessionId, fixture.seatIds[0]],
    );
    expect(inventory.rows[0].status).toBe('HELD');
    expect(inventory.rows[0].hold_id).toBeTruthy();
  }, 20000);

  it('INV-02 overlapping multi-seat requests are all-or-nothing without partial leftovers', async () => {
    const fixture = await catalogFixture();
    const first = newToken();
    const second = newToken();
    const outcomes = await Promise.allSettled([
      createHold(fixture.sessionId, first, fixture.seatIds.slice(0, 2)),
      createHold(fixture.sessionId, second, fixture.seatIds.slice(1, 3).reverse()),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const states = await getPool().query(
      "SELECT count(*)::int count FROM session_seats WHERE session_id=$1 AND status='HELD'",
      [fixture.sessionId],
    );
    expect(states.rows[0].count).toBe(2);
    expect(
      (
        await getPool().query(
          "SELECT count(*)::int count FROM seat_holds WHERE session_id=$1 AND status='ACTIVE'",
          [fixture.sessionId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it('INV-02 parallel retries from the same browser return one hold and never extend the deadline', async () => {
    const fixture = await catalogFixture();
    const owner = newToken();
    const requests = await Promise.all(
      Array.from({ length: 4 }, () =>
        createHold(fixture.sessionId, owner, fixture.seatIds.slice(0, 2).reverse()),
      ),
    );
    expect(new Set(requests.map((hold) => hold.id)).size).toBe(1);
    expect(new Set(requests.map((hold) => hold.expiresAt)).size).toBe(1);
    await expect(createHold(fixture.sessionId, owner, [fixture.seatIds[4]])).rejects.toMatchObject({
      status: 409,
    });
    expect((await getInventory(fixture.sessionId, owner)).hold?.id).toBe(requests[0].id);
  });

  it('INV-02 expiration frees all seats and allows only one new winner under a concurrent expiry job', async () => {
    const fixture = await catalogFixture();
    const expired = await createHold(fixture.sessionId, newToken(), fixture.seatIds.slice(0, 2));
    await getPool().query(
      "UPDATE seat_holds SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    const results = await Promise.allSettled([
      createHold(fixture.sessionId, newToken(), fixture.seatIds.slice(0, 2)),
      createHold(fixture.sessionId, newToken(), fixture.seatIds.slice(0, 2)),
      expireHolds(),
    ]);
    expect(results.slice(0, 2).filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const state = await getPool().query('SELECT status FROM seat_holds WHERE id=$1', [expired.id]);
    expect(state.rows[0].status).toBe('EXPIRED');
    expect(
      (
        await getPool().query(
          "SELECT count(*)::int count FROM session_seats WHERE session_id=$1 AND status='HELD'",
          [fixture.sessionId],
        )
      ).rows[0].count,
    ).toBe(2);
  });

  it('INV-02 pending, unknown or verified payment never expires or cancels automatically', async () => {
    const fixture = await catalogFixture();
    for (const [index, paymentState] of ['PENDING', 'UNKNOWN', 'VERIFIED'].entries()) {
      const owner = newToken();
      const hold = await createHold(fixture.sessionId, owner, [fixture.seatIds[index]]);
      await getPool().query(
        "UPDATE seat_holds SET expires_at=clock_timestamp()-interval '1 second',payment_state=$2 WHERE id=$1",
        [hold.id, paymentState],
      );
      await expireHolds();
      await expect(cancelHold(fixture.sessionId, owner, hold.id)).rejects.toMatchObject({
        status: 409,
      });
      const snapshot = await getInventory(fixture.sessionId, owner);
      expect(snapshot.hold?.paymentState).toBe(paymentState);
      expect(
        snapshot.data.rows
          .flatMap((row) => row.seats)
          .find((seat) => seat.id === fixture.seatIds[index])?.status,
      ).toBe('HELD');
    }
  });

  it('INV-07 a different browser cannot read or cancel the hold; cancellation is repeatable', async () => {
    const fixture = await catalogFixture();
    const owner = newToken();
    const hold = await createHold(fixture.sessionId, owner, [fixture.seatIds[0]]);
    expect((await getInventory(fixture.sessionId, newToken())).hold).toBeNull();
    await expect(cancelHold(fixture.sessionId, newToken(), hold.id)).rejects.toMatchObject({
      status: 403,
    });
    await cancelHold(fixture.sessionId, owner, hold.id);
    await cancelHold(fixture.sessionId, owner, hold.id);
    expect((await getInventory(fixture.sessionId, owner)).hold).toBeNull();
  });

  it('INV-07/INV-11 only admin can block; held/sold seats remain protected and operations are audited', async () => {
    const fixture = await catalogFixture();
    await expect(
      setSeatBlocked(undefined, {
        sessionId: fixture.sessionId,
        seatId: fixture.seatIds[0],
        blocked: true,
      }),
    ).rejects.toMatchObject({ status: 401 });
    await setSeatBlocked(fixture.token, {
      sessionId: fixture.sessionId,
      seatId: fixture.seatIds[0],
      blocked: true,
    });
    await expect(
      createHold(fixture.sessionId, newToken(), fixture.seatIds.slice(0, 2)),
    ).rejects.toMatchObject({ status: 409 });
    await setSeatBlocked(fixture.token, {
      sessionId: fixture.sessionId,
      seatId: fixture.seatIds[0],
      blocked: false,
    });
    await createHold(fixture.sessionId, newToken(), [fixture.seatIds[0]]);
    await expect(
      setSeatBlocked(fixture.token, {
        sessionId: fixture.sessionId,
        seatId: fixture.seatIds[0],
        blocked: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await getPool().query(
      "UPDATE session_seats SET status='SOLD' WHERE session_id=$1 AND seat_id=$2",
      [fixture.sessionId, fixture.seatIds[1]],
    );
    await expect(
      createHold(fixture.sessionId, newToken(), [fixture.seatIds[1]]),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      setSeatBlocked(fixture.token, {
        sessionId: fixture.sessionId,
        seatId: fixture.seatIds[1],
        blocked: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const logs = await getPool().query(
      "SELECT action FROM audit_logs WHERE actor_id=$1 AND action LIKE 'SEAT_%' ORDER BY id",
      [fixture.userId],
    );
    expect(logs.rows.map((log) => log.action)).toEqual(['SEAT_BLOCKED', 'SEAT_UNBLOCKED']);
  });

  it('INV-10 rejects duplicates, foreign seats, excess quantity and unpublished or past sessions', async () => {
    const fixture = await catalogFixture();
    await expect(
      createHold(fixture.sessionId, newToken(), [fixture.seatIds[0], fixture.seatIds[0]]),
    ).rejects.toThrow();
    await expect(
      createHold(fixture.sessionId, newToken(), fixture.seatIds.slice(0, 7)),
    ).rejects.toThrow('سقف');
    const other = await catalogFixture();
    await expect(
      createHold(fixture.sessionId, newToken(), [other.seatIds[0], fixture.seatIds[0]]),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await getInventory(fixture.sessionId)).data.rows
        .flatMap((row) => row.seats)
        .every((seat) => seat.status === 'AVAILABLE'),
    ).toBe(true);
    await setPublished(fixture.token, { eventId: fixture.eventId, published: false });
    await expect(
      createHold(fixture.sessionId, newToken(), [fixture.seatIds[0]]),
    ).rejects.toMatchObject({ status: 404 });
    await setPublished(fixture.token, { eventId: fixture.eventId, published: true });
    await getPool().query(
      "UPDATE event_sessions SET starts_at=now()-interval '1 hour' WHERE id=$1",
      [fixture.sessionId],
    );
    await expect(
      createHold(fixture.sessionId, newToken(), [fixture.seatIds[0]]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('INV-09 rate-limits repeated hold requests including idempotent retries', async () => {
    const fixture = await catalogFixture();
    const owner = newToken();
    for (let attempt = 0; attempt < 15; attempt++)
      await createHold(fixture.sessionId, owner, [fixture.seatIds[0]]);
    await expect(createHold(fixture.sessionId, owner, [fixture.seatIds[0]])).rejects.toMatchObject({
      status: 429,
    });
  });

  it('INV-02 inventory and price are independent per session of the same physical venue', async () => {
    const fixture = await catalogFixture();
    const sections = await getPool().query('SELECT id FROM sections WHERE venue_id=$1', [
      fixture.venueId,
    ]);
    const otherSession = await createSession(fixture.token, {
      eventId: fixture.eventId,
      venueId: fixture.venueId,
      startsAt: new Date(Date.now() + 172800000).toISOString(),
      prices: sections.rows.map((section) => ({ sectionId: section.id, priceRial: 2000000 })),
    });
    await setPublished(fixture.token, { eventId: fixture.eventId, published: true });
    const first = await createHold(fixture.sessionId, newToken(), [fixture.seatIds[0]]);
    const second = await createHold(otherSession, newToken(), [fixture.seatIds[0]]);
    expect(first.id).not.toBe(second.id);
    expect(second.totalRial).toBe(2000000);
  });
});
