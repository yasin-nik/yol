import { NextRequest } from 'next/server';
import { CUSTOMER_COOKIE } from '@/server/customer';
import { createOrder } from '@/server/orders';
import { errorResponse, json, readJson, sameOrigin } from '@/server/http';
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    return json(
      {
        id: await createOrder(
          r.cookies.get(CUSTOMER_COOKIE)?.value,
          r.cookies.get('yoltick_buyer')?.value,
          await readJson(r),
        ),
      },
      201,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
