import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PoolClient } from 'pg';
import { getPool } from './db/pool';
import { DomainError } from './errors';

const scrypt = promisify(scryptCallback);
export const newToken = () => randomBytes(32).toString('hex');
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128)
    throw new DomainError('رمز باید ۱۲ تا ۱۲۸ نویسه باشد.');
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [salt, stored] = encoded.split(':');
  if (!salt || !stored || stored.length !== 128 || password.length > 128) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(stored, 'hex'));
}

export async function rateLimit(key: string, limit: number, seconds: number) {
  const result = await getPool().query(
    `INSERT INTO rate_limits(key, attempts, resets_at) VALUES ($1, 1, now() + $2 * interval '1 second')
     ON CONFLICT(key) DO UPDATE SET
       attempts = CASE WHEN rate_limits.resets_at <= now() THEN 1 ELSE rate_limits.attempts + 1 END,
       resets_at = CASE WHEN rate_limits.resets_at <= now() THEN EXCLUDED.resets_at ELSE rate_limits.resets_at END
     RETURNING attempts`,
    [key, seconds],
  );
  if (result.rows[0].attempts > limit)
    throw new DomainError('تعداد درخواست زیاد است؛ کمی بعد دوباره تلاش کنید.', 429);
}

export async function audit(
  client: PoolClient,
  actor: string | null,
  action: string,
  target: string,
  details = {},
) {
  await client.query(
    'INSERT INTO audit_logs(actor_id, action, target_id, details) VALUES ($1,$2,$3,$4)',
    [actor, action, target, details],
  );
}
