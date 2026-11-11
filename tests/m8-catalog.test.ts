import { expect, it } from 'vitest';
import { catalogFixture } from './fixtures';
import { getPool } from '../src/server/db/pool';
import { eventFiltersSchema, publicEvents } from '../src/server/catalog';

it('M8 product acceptance: search and city/category/time filters select matching published sessions', async () => {
  const fixture = await catalogFixture();
  const marker = `M8-${fixture.eventId}`;
  await getPool().query('UPDATE events SET title=$2 WHERE id=$1', [fixture.eventId, marker]);
  const initial = await publicEvents({ q: marker });
  expect(initial).toHaveLength(1);
  const city = initial[0].city;
  const category = initial[0].category;
  expect(await publicEvents({ q: marker, city, category, when: 'week' })).toHaveLength(1);
  expect(await publicEvents({ q: marker, city: 'هیچ شهر', category })).toHaveLength(0);
  expect(await publicEvents({ q: marker, category: 'هیچ دسته' })).toHaveLength(0);
  expect(await publicEvents({ q: marker, when: 'today' })).toHaveLength(0);
  await getPool().query(
    "UPDATE event_sessions SET starts_at=now()+interval '15 days' WHERE id=$1",
    [fixture.sessionId],
  );
  expect(await publicEvents({ q: marker, when: 'week' })).toHaveLength(0);
  expect(await publicEvents({ q: marker, when: 'month' })).toHaveLength(1);
  await getPool().query('UPDATE events SET published=false WHERE id=$1', [fixture.eventId]);
  expect(await publicEvents({ q: marker })).toHaveLength(0);
});

it('M8 INV-10: malformed filters rejected; SQL syntax/wildcards remain search text', async () => {
  expect(eventFiltersSchema.safeParse({ when: 'infinite' }).success).toBe(false);
  expect(eventFiltersSchema.safeParse({ city: ['دو مقدار'] }).success).toBe(false);
  expect(eventFiltersSchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(false);
  expect(await publicEvents({ q: "%' OR 1=1 --" })).toHaveLength(0);
});
