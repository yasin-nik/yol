import { beforeAll, afterAll } from 'vitest';
import { migrate } from '../src/server/db/migrate';
import { closePool } from '../src/server/db/pool';

const url = process.env.TEST_DATABASE_URL ?? '';
const parsed = new URL(url);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/yoltick_test' || decodeURIComponent(parsed.username) !== 'yoltick_app') throw new Error('Only the isolated local yoltick_test database is allowed');
process.env.DATABASE_URL = url;
beforeAll(async () => { await migrate(url); });
afterAll(async () => { await closePool(); });
