import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { paidFixture } from './milestone-fixtures';
import { adminFixture, catalogFixture } from './fixtures';
import { checkIn, createOperator, operatorSessions } from '../src/server/check-in';
import { getPool } from '../src/server/db/pool';
import { login, requireAdmin } from '../src/server/auth';
import { newToken } from '../src/server/security';
import { POST } from '../src/app/api/check-in/route';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

describe('M6 check-in', () => {
  it('INV-06 entrance stays available after session start and sales closure', async () => {
    const fixture = await paidFixture();
    await getPool().query(
      "UPDATE event_sessions SET starts_at=now()-interval '1 minute',published=false WHERE id=$1",
      [fixture.sessionId],
    );
    expect(
      (await checkIn(fixture.token, { sessionId: fixture.sessionId, code: fixture.ticket.token }))
        .status,
    ).toBe('ACCEPTED');
  });
  it('INV-07 owner local-only account and existing sessions are blocked in production', async () => {
    const fixture = await adminFixture();
    await getPool().query('UPDATE users SET local_only=true WHERE id=$1', [fixture.userId]);
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await expect(requireAdmin(fixture.token)).rejects.toThrow();
      await expect(operatorSessions(fixture.token)).rejects.toThrow();
      await expect(login({ email: fixture.email, password: fixture.password })).rejects.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('INV-06 INV-11 two concurrent scans admit once and retain actor and timestamp', async () => {
    const fixture = await paidFixture();
    const data = { sessionId: fixture.sessionId, code: fixture.ticket.token };
    const results = await Promise.all([checkIn(fixture.token, data), checkIn(fixture.token, data)]);
    expect(results.map((result) => result.status).sort()).toEqual(['ACCEPTED', 'USED']);
    const result = await getPool().query('SELECT * FROM check_ins WHERE ticket_id=$1', [
      fixture.ticket.id,
    ]);
    expect(result.rows[0].actor_id).toBe(fixture.userId);
    expect(result.rows[0].created_at).toBeInstanceOf(Date);
    expect(
      (
        await getPool().query(
          "SELECT count(*)::int n FROM audit_logs WHERE action='TICKET_CHECKED_IN' AND target_id=$1",
          [fixture.ticket.id],
        )
      ).rows[0].n,
    ).toBe(1);
    await expect(
      getPool().query('DELETE FROM check_ins WHERE ticket_id=$1', [fixture.ticket.id]),
    ).rejects.toThrow('append-only');
  });
  it('INV-07 INV-10 assigned operators see only assigned sessions, cannot administer or scan elsewhere', async () => {
    const fixture = await paidFixture();
    const other = await catalogFixture();
    const email = `${newToken()}@example.test`;
    const password = newToken();
    await createOperator(fixture.token, { email, password, sessionId: fixture.sessionId });
    const token = await login({ email, password });
    expect((await operatorSessions(token)).map((entry) => entry.id)).toEqual([fixture.sessionId]);
    await expect(requireAdmin(token)).rejects.toThrow();
    await expect(
      checkIn(token, { sessionId: other.sessionId, code: fixture.ticket.token }),
    ).rejects.toThrow('واگذار');
    await expect(
      checkIn(fixture.customer, { sessionId: fixture.sessionId, code: fixture.ticket.token }),
    ).rejects.toThrow();
    expect((await checkIn(token, { sessionId: fixture.sessionId, code: newToken() })).status).toBe(
      'INVALID',
    );
    expect(
      (await checkIn(other.token, { sessionId: other.sessionId, code: fixture.ticket.token }))
        .status,
    ).toBe('INVALID');
    await expect(
      checkIn(token, { sessionId: fixture.sessionId, code: '<script>' }),
    ).rejects.toThrow();
    expect(
      (await checkIn(token, { sessionId: fixture.sessionId, code: fixture.ticket.token })).status,
    ).toBe('ACCEPTED');
  });
  it('INV-07 request boundary rejects cross-origin and unauthenticated scans', async () => {
    const data = { sessionId: (await catalogFixture()).sessionId, code: newToken() };
    expect(
      (
        await POST(
          new NextRequest('http://localhost/api/check-in', {
            method: 'POST',
            headers: { origin: 'http://evil.test' },
            body: JSON.stringify(data),
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          new NextRequest('http://localhost/api/check-in', {
            method: 'POST',
            headers: { origin: 'http://localhost' },
            body: JSON.stringify(data),
          }),
        )
      ).status,
    ).toBe(401);
  });
  it('M6 camera decoder reads the actual ticket QR payload without an external service', () => {
    const token = newToken();
    const qr = QRCode.create(token);
    const scale = 8;
    const size = (qr.modules.size + 8) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let row = 0; row < qr.modules.size; row++)
      for (let column = 0; column < qr.modules.size; column++)
        if (qr.modules.get(row, column))
          for (let firstAmount = 0; firstAmount < scale; firstAmount++)
            for (let secondAmount = 0; secondAmount < scale; secondAmount++) {
              const offset =
                (((row + 4) * scale + firstAmount) * size + (column + 4) * scale + secondAmount) *
                4;
              pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
            }
    expect(jsQR(pixels, size, size)?.data).toBe(token);
  });
  it('INV-07 disabled operators lose access immediately', async () => {
    const fixture = await adminFixture('CHECK_IN');
    await getPool().query('UPDATE users SET active=false WHERE id=$1', [fixture.userId]);
    await expect(operatorSessions(fixture.token)).rejects.toThrow();
  });
});
