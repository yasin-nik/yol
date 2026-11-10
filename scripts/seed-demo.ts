import { mkdirSync, writeFileSync } from 'node:fs';
import { getPool, closePool } from '../src/server/db/pool';
import { createEvent, createSession, createVenue, setPublished } from '../src/server/catalog';
import { hashPassword, newToken, tokenHash } from '../src/server/security';

async function main() {
  if (process.env.NODE_ENV !== 'development')
    throw new Error('Demo data is only allowed in development');
  try {
    const existing = await getPool().query("SELECT value FROM app_meta WHERE key='demo_event'");
    if (existing.rowCount) {
      console.log('داده نمایشی موجود است؛ دسترسی محلی در .local/demo-access.json');
    } else {
      const email = `demo-${newToken().slice(0, 12)}@example.test`;
      const password = newToken();
      const admin = await getPool().query(
        "INSERT INTO users(email,password_hash,role) VALUES ($1,$2,'ADMIN') RETURNING id",
        [email, await hashPassword(password)],
      );
      const token = newToken();
      await getPool().query(
        "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",
        [tokenHash(token), admin.rows[0].id],
      );
      const venueId = await createVenue(token, {
        name: 'سالن نمایشی یول‌تیک',
        city: 'تهران (نمایشی)',
        address: 'نشانی نمونه؛ فروش واقعی فعال نیست.',
        sections: [
          { name: 'همکف', rows: 5, seatsPerRow: 10 },
          { name: 'بالکن', rows: 2, seatsPerRow: 5 },
        ],
      });
      const eventId = await createEvent(token, {
        title: 'اجرای نمایشی — فقط برای آزمایش',
        description:
          'این رویداد واقعی نیست. رزروها در پایگاه داده محلی ذخیره می‌شوند؛ پرداخت و صدور بلیت فعال نیست.',
        category: 'کنسرت نمایشی',
        maxSeats: 6,
        holdMinutes: 10,
      });
      const sections = await getPool().query(
        'SELECT id FROM sections WHERE venue_id=$1 ORDER BY position',
        [venueId],
      );
      const sessionId = await createSession(token, {
        eventId,
        venueId,
        startsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        prices: sections.rows.map((section, index) => ({
          sectionId: section.id,
          priceRial: index ? 2500000 : 3500000,
        })),
      });
      await setPublished(token, { eventId, published: true });
      mkdirSync('.local', { recursive: true });
      writeFileSync(
        '.local/demo-access.json',
        JSON.stringify({ email, password, eventId, sessionId }, null, 2),
      );
      await getPool().query("INSERT INTO app_meta(key,value) VALUES ('demo_event',$1)", [eventId]);
      console.log(
        'داده نمایشی محلی ساخته شد؛ دسترسی در .local/demo-access.json (در Git ذخیره نمی‌شود).',
      );
    }
  } finally {
    await closePool();
  }
}
main().catch(() => {
  console.error('ساخت داده نمایشی انجام نشد.');
  process.exitCode = 1;
});
