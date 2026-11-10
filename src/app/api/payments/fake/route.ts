import { NextRequest } from 'next/server';
import { CUSTOMER_COOKIE } from '@/server/customer';
import { simulatePayment } from '@/server/payments';
import { errorResponse, json, readJson, sameOrigin } from '@/server/http';
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    return json({
      status: await simulatePayment(
        request.cookies.get(CUSTOMER_COOKIE)?.value,
        await readJson(request),
      ),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
