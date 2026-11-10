import { NextRequest } from 'next/server';
import { CUSTOMER_COOKIE, requestOtp, requireCustomer, verifyOtp } from '@/server/customer';
import { logout } from '@/server/auth';
import { cookieOptions } from '@/server/web-auth';
import { errorResponse, json, readJson, sameOrigin } from '@/server/http';
export async function GET(r: NextRequest) {
  try {
    await requireCustomer(r.cookies.get(CUSTOMER_COOKIE)?.value);
    return json({ authenticated: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    return json(await requestOtp(await readJson(r)));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(r: NextRequest) {
  try {
    sameOrigin(r);
    const token = await verifyOtp(await readJson(r));
    const response = json({ authenticated: true });
    response.cookies.set(CUSTOMER_COOKIE, token, cookieOptions);
    return response;
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(r: NextRequest) {
  try {
    sameOrigin(r);
    await logout(r.cookies.get(CUSTOMER_COOKIE)?.value);
    const response = json({ authenticated: false });
    response.cookies.set(CUSTOMER_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (e) {
    return errorResponse(e);
  }
}
