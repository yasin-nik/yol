import { NextRequest, NextResponse } from 'next/server';
import { verifyPayment } from '@/server/payments';
import { rateLimit } from '@/server/security';
import { errorResponse } from '@/server/http';
export async function GET(request: NextRequest) {
  try {
    await rateLimit('callback:global', 300, 60);
    await verifyPayment(request.nextUrl.searchParams.get('authority') ?? '');
    const response = NextResponse.redirect(
      new URL('/my-tickets', process.env.APP_ORIGIN ?? request.url),
    );
    response.headers.set('Cache-Control', 'no-store, private');
    return response;
  } catch (e) {
    return errorResponse(e);
  }
}
