import { randomBytes, scryptSync } from 'node:crypto';
import { transaction } from '../src/server/db/transaction';
import { closePool } from '../src/server/db/pool';
import { audit } from '../src/server/security';

async function main() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      process.env.NODE_ENV === 'production' ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/yoltick_dev' ||
      url.username !== 'yoltick_app'
    )
      throw new Error('Local development only');
    const email = process.env.LOCAL_ADMIN_EMAIL;
    const password = process.env.LOCAL_ADMIN_PASSWORD;
    if (!email || !password || password.length > 128) throw new Error('Local credentials required');
    const salt = randomBytes(16).toString('hex');
    const hash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    await transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users(email,password_hash,role,local_only) VALUES ($1,$2,'ADMIN',true)
        ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash WHERE users.local_only AND users.role='ADMIN' RETURNING id`,
        [email, hash],
      );
      if (!result.rowCount) throw new Error('Existing non-local account cannot be changed');
      await audit(client, result.rows[0].id, 'LOCAL_ADMIN_CONFIGURED', result.rows[0].id);
    });
    console.log('Local administrator configured. Credentials were not logged.');
  } catch {
    console.error('Local account configuration failed.');
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
void main();
