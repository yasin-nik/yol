import { NextRequest } from 'next/server';
import { customerSupport } from '@/server/support';
import { CUSTOMER_COOKIE } from '@/server/customer';
import { errorResponse, json, readJson, sameOrigin } from '@/server/http';
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    await customerSupport(request.cookies.get(CUSTOMER_COOKIE)?.value, await readJson(request));
    return json({ success: true });
  } catch (event) {
    return errorResponse(event);
  }
}
