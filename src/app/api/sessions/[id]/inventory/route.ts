import { NextRequest } from 'next/server';
import { getInventory } from '@/server/inventory';
import { errorResponse, json } from '@/server/http';
import { newToken } from '@/server/security';

export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const current = request.cookies.get('yoltick_buyer')?.value;
    const owner = current && /^[a-f0-9]{64}$/.test(current) ? current : newToken();
    const response = json(await getInventory((await context.params).id, owner));
    if (owner !== current)
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
