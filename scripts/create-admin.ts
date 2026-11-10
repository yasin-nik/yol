import { hashPassword } from '../src/server/security';
import { closePool } from '../src/server/db/pool';
import { transaction } from '../src/server/db/transaction';
import { audit } from '../src/server/security';
import { z } from 'zod';

async function main() {
  try {
    const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
    const password = z.string().min(12).max(128).parse(process.env.ADMIN_PASSWORD);
    const hash = await hashPassword(password);
    await transaction(async (client) => {
      const result = await client.query(
        "INSERT INTO users(email,password_hash,role) VALUES ($1,$2,'ADMIN') RETURNING id",
        [email, hash],
      );
      await audit(client, result.rows[0].id, 'ADMIN_CREATED', result.rows[0].id);
    });
    console.log('مدیر ساخته شد. ADMIN_PASSWORD را از .env حذف کنید.');
  } catch {
    console.error(
      'ساخت مدیر انجام نشد؛ ایمیل یکتا و رمز ۱۲ تا ۱۲۸ نویسه در متغیرهای ADMIN_EMAIL / ADMIN_PASSWORD لازم است.',
    );
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
void main();
