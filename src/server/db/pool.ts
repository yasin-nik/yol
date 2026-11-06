import { Pool } from 'pg';

let pool: Pool | undefined;

export function getPool(url = process.env.DATABASE_URL): Pool {
  if (!url) throw new Error('DATABASE_URL is not set');
  pool ??= new Pool({ connectionString: url, max: 10 });
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
