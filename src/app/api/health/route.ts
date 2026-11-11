import { getPool } from '@/server/db/pool';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await getPool().query('SELECT 1');
    return json({ status: 'ok' });
  } catch {
    return json({ status: 'unavailable' }, 503);
  }
}
