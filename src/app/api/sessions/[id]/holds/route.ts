import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createHold, cancelHold } from '@/server/inventory';
import { errorResponse, json, readJson, sameOrigin } from '@/server/http';
import { newToken } from '@/server/security';
import { DomainError } from '@/server/errors';

export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const data = z
      .object({ seatIds: z.array(z.uuid()).min(1).max(20) })
      .strict()
      .parse(await readJson(request));
    const owner = request.cookies.get('yoltick_buyer')?.value ?? newToken();
    const hold = await createHold((await context.params).id, owner, data.seatIds);
    const response = json({ hold }, 201);
    response.cookies.set('yoltick_buyer', owner, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const owner = request.cookies.get('yoltick_buyer')?.value;
    if (!owner) throw new DomainError('مالکیت رزرو تأیید نشد.', 403);
    const data = z
      .object({ holdId: z.uuid() })
      .strict()
      .parse(await readJson(request));
    await cancelHold((await context.params).id, owner, data.holdId);
    return json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
