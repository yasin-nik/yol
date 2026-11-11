import type { PoolClient } from 'pg';
import { z } from 'zod';
import { getPool } from './db/pool';
import { transaction } from './db/transaction';
import { DomainError } from './errors';
import { audit, newToken, rateLimit, tokenHash, verifyPassword } from './security';

const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(128)}`;

export async function requireAdmin(
  token: string | undefined,
  client = getPool() as Pick<PoolClient, 'query'>,
) {
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new DomainError('ابتدا وارد حساب مدیر شوید.', 401);
  const result = await client.query(
    `SELECT u.id FROM users u JOIN auth_sessions s ON s.user_id=u.id
     WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active AND u.role='ADMIN'
     AND (NOT u.local_only OR $2)`,
    [tokenHash(token), process.env.NODE_ENV !== 'production'],
  );
  if (!result.rowCount) throw new DomainError('دسترسی مدیر لازم است.', 403);
  return result.rows[0].id as string;
}

export async function login(input: unknown) {
  const data = loginSchema.parse(input);
  await rateLimit('login:global', 100, 60);
  await rateLimit(`login:${tokenHash(data.email)}`, 5, 900);
  const result = await getPool().query(
    'SELECT id, password_hash, role, active, local_only FROM users WHERE email=$1',
    [data.email],
  );
  const user = result.rows[0];
  const valid = await verifyPassword(data.password, user?.password_hash ?? dummyHash);
  if (
    !valid ||
    !user?.active ||
    !['ADMIN', 'CHECK_IN'].includes(user.role) ||
    (user.local_only && process.env.NODE_ENV === 'production')
  )
    throw new DomainError('اطلاعات ورود صحیح نیست.', 401);
  const token = newToken();
  await transaction(async (client) => {
    await client.query(
      "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '8 hours')",
      [tokenHash(token), user.id],
    );
    await audit(client, user.id, user.role === 'ADMIN' ? 'ADMIN_LOGIN' : 'CHECK_IN_LOGIN', user.id);
  });
  return token;
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await transaction(async (client) => {
    const result = await client.query(
      'DELETE FROM auth_sessions s USING users u WHERE s.user_id=u.id AND s.token_hash=$1 RETURNING s.user_id,u.role',
      [tokenHash(token)],
    );
    if (result.rowCount)
      await audit(
        client,
        result.rows[0].user_id,
        result.rows[0].role === 'CUSTOMER' ? 'CUSTOMER_LOGOUT' : 'ADMIN_LOGOUT',
        result.rows[0].user_id,
      );
  });
}
