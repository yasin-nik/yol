import { z } from 'zod';
import { requireCustomer } from './customer';
import { transaction } from './db/transaction';
import { audit, rateLimit } from './security';
import { DomainError } from './errors';
export async function customerSupport(token: string | undefined, input: unknown) {
  const data = z
    .object({ orderId: z.uuid(), message: z.string().trim().min(3).max(2000) })
    .strict()
    .parse(input);
  const user = await requireCustomer(token);
  await rateLimit(`support:${user}`, 5, 300);
  return transaction(async (client) => {
    await requireCustomer(token, client);
    if (
      !(
        await client.query('SELECT id FROM orders WHERE id=$1 AND user_id=$2', [data.orderId, user])
      ).rowCount
    )
      throw new DomainError('سفارش یافت نشد.', 404);
    const result = await client.query(
      'INSERT INTO support_requests(order_id,message,actor_id,customer_visible) VALUES ($1,$2,$3,true) RETURNING id',
      [data.orderId, data.message, user],
    );
    await audit(client, user, 'CUSTOMER_SUPPORT_REQUESTED', result.rows[0].id);
  });
}
