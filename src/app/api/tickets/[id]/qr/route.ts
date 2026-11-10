import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { CUSTOMER_COOKIE } from '@/server/customer';
import { customerTickets } from '@/server/tickets';
import { errorResponse } from '@/server/http';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const [ticket] = await customerTickets(
      request.cookies.get(CUSTOMER_COOKIE)?.value,
      (await context.params).id,
    );
    const svg = await QRCode.toString(ticket.token, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 256,
    });
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
