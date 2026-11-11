import { Pool } from 'pg';

let pool: Pool | undefined;

export function getPool(url = process.env.DATABASE_URL): Pool {
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });
    pool.on('error', () =>
      console.error(
        JSON.stringify({ event: 'DB_IDLE_CONNECTION_ERROR', at: new Date().toISOString() }),
      ),
    );
  }
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
