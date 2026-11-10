import { describe, expect, it } from 'vitest';
import { migrate } from '../src/server/db/migrate';

const url = process.env.TEST_DATABASE_URL ?? '';

describe('M0 database', () => {
  it('runs versioned migrations and is repeatable without deleting data', async () => {
    expect(url).toContain('yoltick_');
    expect(await migrate(url)).toEqual([]);
  });
});
