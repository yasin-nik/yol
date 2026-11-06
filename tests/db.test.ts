import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { migrate } from '../src/server/db/migrate';

const url = process.env.TEST_DATABASE_URL ?? '';

describe('M0 database', () => {
  afterAll(() => undefined);
  it('runs migrations on a clean test database and is repeatable', async () => {
    expect(url).toContain('yoltick_');
    const pool = new Pool({ connectionString: url });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.end();
    expect((await migrate(url)).length).toBeGreaterThan(0);
    expect(await migrate(url)).toEqual([]);
  });
});
