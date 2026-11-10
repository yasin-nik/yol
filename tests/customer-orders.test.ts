import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { requestOtp, verifyOtp, requireCustomer } from '../src/server/customer';
import { createOrder, customerOrders } from '../src/server/orders';
import { createHold } from '../src/server/inventory';
import { getPool } from '../src/server/db/pool';
import { newToken } from '../src/server/security';
import { catalogFixture } from './fixtures';

export const phone = () => '09' + String(randomInt(100000000, 1000000000));
export async function customerFixture() {
  const challenge = await requestOtp({ phone: phone() });
  const token = await verifyOtp({
    challengeId: challenge.challengeId,
    code: challenge.developmentCode,
  });
  return { token, userId: await requireCustomer(token) };
}
describe('M4 customer and orders', () => {
  it('INV-09 OTP request and verification limits persist; code is hashed, one-use and expires', async () => {
    const number = phone();
    const c = await requestOtp({ phone: number });
    const stored = (
      await getPool().query('SELECT code_hash FROM otp_challenges WHERE id=$1', [c.challengeId])
    ).rows[0];
    expect(stored.code_hash).not.toContain(c.developmentCode);
    await expect(verifyOtp({ challengeId: c.challengeId, code: '000000' })).rejects.toMatchObject({
      status: 401,
    });
    const token = await verifyOtp({ challengeId: c.challengeId, code: c.developmentCode });
    expect(await requireCustomer(token)).toBeTruthy();
    await expect(
      verifyOtp({ challengeId: c.challengeId, code: c.developmentCode }),
    ).rejects.toMatchObject({ status: 401 });
    const expired = await requestOtp({ phone: number });
    await getPool().query(
      "UPDATE otp_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.challengeId],
    );
    await expect(
      verifyOtp({ challengeId: expired.challengeId, code: expired.developmentCode }),
    ).rejects.toMatchObject({ status: 401 });
    const last = await requestOtp({ phone: number });
    await expect(requestOtp({ phone: number })).rejects.toMatchObject({ status: 429 });
    for (let i = 0; i < 5; i++)
      await expect(
        verifyOtp({ challengeId: last.challengeId, code: '000000' }),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      verifyOtp({ challengeId: last.challengeId, code: last.developmentCode }),
    ).rejects.toMatchObject({ status: 429 });
  });
  it('INV-07 order requires customer and browser ownership, snapshots server money and replays once', async () => {
    const f = await catalogFixture();
    const c = await customerFixture();
    const stranger = await customerFixture();
    const owner = newToken();
    const hold = await createHold(f.sessionId, owner, f.seatIds.slice(0, 2));
    const input = { sessionId: f.sessionId, holdId: hold.id };
    await expect(createOrder(undefined, owner, input)).rejects.toMatchObject({ status: 401 });
    await expect(createOrder(c.token, newToken(), input)).rejects.toMatchObject({ status: 403 });
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => createOrder(c.token, owner, input)),
    );
    expect(new Set(ids).size).toBe(1);
    await expect(createOrder(stranger.token, owner, input)).rejects.toMatchObject({ status: 403 });
    const orders = await customerOrders(c.token);
    expect(orders).toHaveLength(1);
    expect(Number(orders[0].total_rial)).toBe(hold.totalRial);
    expect(await customerOrders(stranger.token)).toHaveLength(0);
  });
  it('INV-10 expired hold cannot become order; client price is rejected', async () => {
    const f = await catalogFixture();
    const c = await customerFixture();
    const owner = newToken();
    const h = await createHold(f.sessionId, owner, [f.seatIds[0]]);
    await expect(
      createOrder(c.token, owner, { sessionId: f.sessionId, holdId: h.id, totalRial: 1 }),
    ).rejects.toThrow();
    await getPool().query(
      "UPDATE seat_holds SET expires_at=now()-interval '1 second' WHERE id=$1",
      [h.id],
    );
    await expect(
      createOrder(c.token, owner, { sessionId: f.sessionId, holdId: h.id }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
