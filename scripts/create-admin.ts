import { hashPassword } from '../src/server/security';
import { getPool, closePool } from '../src/server/db/pool';
import { z } from 'zod';

async function main() {
 try {
  const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
  const password = z.string().min(12).max(128).parse(process.env.ADMIN_PASSWORD);
  const hash = await hashPassword(password);
  await getPool().query("INSERT INTO users(email,password_hash,role) VALUES ($1,$2,'ADMIN')", [email, hash]);
  console.log('مدیر ساخته شد. ADMIN_PASSWORD را از .env حذف کنید.');
} catch {
  console.error('ساخت مدیر انجام نشد؛ ایمیل یکتا و رمز ۱۲ تا ۱۲۸ نویسه در متغیرهای ADMIN_EMAIL / ADMIN_PASSWORD لازم است.');
  process.exitCode = 1;
} finally {
  await closePool();
}
}
void main();
