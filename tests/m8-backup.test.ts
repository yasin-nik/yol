import { expect, it } from 'vitest';
import { restoreDrill, projectPath } from '../scripts/backup-lib';
import { paidFixture } from './milestone-fixtures';
import { checkIn } from '../src/server/check-in';
import { Pool } from 'pg';

it('INV-12: real pg_dump/pg_restore preserves every public table and a used ticket stays used', async () => {
  const fixture = await paidFixture();
  expect(
    (await checkIn(fixture.token, { sessionId: fixture.sessionId, code: fixture.ticket.token }))
      .status,
  ).toBe('ACCEPTED');
  const result = await restoreDrill(process.env.TEST_DATABASE_URL!, '.local/backups');
  expect(result.matched).toBe(true);
  expect(result.tables).toBeGreaterThan(15);
  expect(result.fingerprints.tickets.count).toBeGreaterThan(0);
  const target = new URL(process.env.TEST_DATABASE_URL!);
  target.pathname = '/' + result.targetName;
  const restored = new Pool({ connectionString: target.href });
  try {
    expect(
      (await restored.query('SELECT 1 FROM check_ins WHERE ticket_id=$1', [fixture.ticket.id]))
        .rowCount,
    ).toBe(1);
    await expect(
      restored.query('DELETE FROM check_ins WHERE ticket_id=$1', [fixture.ticket.id]),
    ).rejects.toThrow();
    await expect(
      restored.query('INSERT INTO check_ins(ticket_id,actor_id) VALUES ($1,$2)', [
        fixture.ticket.id,
        fixture.userId,
      ]),
    ).rejects.toThrow();
    expect(
      (
        await restored.query(
          "SELECT 1 FROM pg_constraint WHERE conname='tickets_session_id_seat_id_key'",
        )
      ).rowCount,
    ).toBe(1);
  } finally {
    await restored.end();
  }
  console.log(JSON.stringify({ ...result, fingerprints: undefined }));
}, 120000);

it('INV-12: restore refuses non-project destinations and backup paths outside workspace', async () => {
  expect(() => projectPath('../outside.dump')).toThrow();
  await expect(
    restoreDrill('postgres://yoltick_app:unused@remote.example/other', '.local/backups'),
  ).rejects.toThrow();
});
