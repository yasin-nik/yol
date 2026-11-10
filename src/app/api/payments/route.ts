import { NextRequest } from 'next/server';
import { z } from 'zod';
import { CUSTOMER_COOKIE } from '@/server/customer';
import { startPayment, ownedPayment, verifyPayment } from '@/server/payments';
import { errorResponse, json, readJson, sameOrigin } from '@/server/http';
import { rateLimit } from '@/server/security';
import { paymentGateway, authoritySchema } from '@/server/payment-gateway';
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const { orderId } = z
      .object({ orderId: z.uuid() })
      .strict()
      .parse(await readJson(request));
    const authority = await startPayment(request.cookies.get(CUSTOMER_COOKIE)?.value, orderId);
    return json({ url: paymentGateway().checkoutUrl(authority) });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: NextRequest) {
  try {
    sameOrigin(request);
    const { authority } = z
      .object({ authority: authoritySchema })
      .strict()
      .parse(await readJson(request));
    await ownedPayment(request.cookies.get(CUSTOMER_COOKIE)?.value, authority);
    await rateLimit('payment:recheck:' + authority, 10, 60);
    return json({ status: await verifyPayment(authority) });
  } catch (e) {
    return errorResponse(e);
  }
}
