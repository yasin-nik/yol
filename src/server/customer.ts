import { randomInt, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { getPool } from './db/pool';
import { transaction } from './db/transaction';
import { DomainError } from './errors';
import { audit, hashPassword, newToken, rateLimit, tokenHash, verifyPassword } from './security';
import { smsProvider } from './sms';

export const CUSTOMER_COOKIE = 'yoltick_customer';
export const normalizeDigits = (value: string) =>
  value.replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) - (c <= '٩' ? 1632 : 1776)));
const phoneSchema = z
  .string()
  .max(20)
  .transform((v) => normalizeDigits(v.trim()))
  .pipe(z.string().regex(/^09\d{9}$/));

export async function requestOtp(input: unknown) {
  const { phone } = z.object({ phone: phoneSchema }).strict().parse(input);
  await rateLimit('otp:global', 100, 60);
  await rateLimit(`otp:phone:${tokenHash(phone)}`, 3, 300);
  const provider = smsProvider();
  const id = randomUUID();
  const code = String(randomInt(100000, 1000000));
  const codeHash = await hashPassword(code + id);
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);
    await client.query('UPDATE otp_challenges SET consumed=true WHERE phone=$1 AND NOT consumed', [
      phone,
    ]);
    await client.query(
      "INSERT INTO otp_challenges(id,phone,code_hash,expires_at) VALUES ($1,$2,$3,now()+interval '2 minutes')",
      [id, phone, codeHash],
    );
  });
  const sent = await provider.sendOtp(phone, code);
  return { challengeId: id, ...sent };
}

export async function verifyOtp(input: unknown) {
  const data = z
    .object({
      challengeId: z.uuid(),
      code: z
        .string()
        .max(6)
        .transform(normalizeDigits)
        .pipe(z.string().regex(/^\d{6}$/)),
    })
    .strict()
    .parse(input);
  await rateLimit('otp:verify:global', 300, 60);
  await rateLimit(`otp:verify:${data.challengeId}`, 5, 300);
  const token = newToken();
  const success = await transaction(async (client) => {
    const result = await client.query('SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE', [
      data.challengeId,
    ]);
    const challenge = result.rows[0];
    if (
      !challenge ||
      challenge.consumed ||
      challenge.attempts >= 5 ||
      challenge.expires_at <= new Date()
    )
      return false;
    await client.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1', [
      data.challengeId,
    ]);
    if (!(await verifyPassword(data.code + data.challengeId, challenge.code_hash))) return false;
    await client.query('UPDATE otp_challenges SET consumed=true WHERE id=$1', [data.challengeId]);
    const user = await client.query(
      "INSERT INTO users(phone,role) VALUES ($1,'CUSTOMER') ON CONFLICT(phone) DO UPDATE SET phone=EXCLUDED.phone RETURNING id,active,role",
      [challenge.phone],
    );
    if (!user.rows[0].active || user.rows[0].role !== 'CUSTOMER') return false;
    await client.query(
      "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '8 hours')",
      [tokenHash(token), user.rows[0].id],
    );
    await audit(client, user.rows[0].id, 'CUSTOMER_LOGIN', user.rows[0].id);
    return true;
  });
  if (!success) throw new DomainError('کد نادرست، مصرف‌شده یا منقضی است.', 401);
  return token;
}

export async function requireCustomer(
  token: string | undefined,
  client = getPool() as Pick<PoolClient, 'query'>,
): Promise<string> {
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new DomainError('ابتدا با شماره موبایل وارد شوید.', 401);
  const result = await client.query(
    "SELECT u.id FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND u.role='CUSTOMER'",
    [tokenHash(token)],
  );
  if (!result.rowCount) throw new DomainError('نشست ورود معتبر نیست؛ دوباره وارد شوید.', 401);
  return result.rows[0].id;
}
