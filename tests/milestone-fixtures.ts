import { randomInt } from 'node:crypto';
import { catalogFixture } from './fixtures';
import { requestOtp, verifyOtp } from '../src/server/customer';
import { createHold } from '../src/server/inventory';
import { createOrder } from '../src/server/orders';
import { startPayment, simulatePayment } from '../src/server/payments';
import { customerTickets } from '../src/server/tickets';
import { newToken } from '../src/server/security';
export async function paidFixture() {
  const f = await catalogFixture();
  const otp = await requestOtp({ phone: '09' + randomInt(100000000, 1000000000) });
  const customer = await verifyOtp({ challengeId: otp.challengeId, code: otp.developmentCode });
  const owner = newToken();
  const hold = await createHold(f.sessionId, owner, [f.seatIds[0]]);
  const orderId = await createOrder(customer, owner, { sessionId: f.sessionId, holdId: hold.id });
  const authority = await startPayment(customer, orderId);
  await simulatePayment(customer, { authority, outcome: 'SUCCESS' });
  const ticket = (await customerTickets(customer))[0];
  return { ...f, orderId, customer, ticket };
}
