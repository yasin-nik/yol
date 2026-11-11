import { NextRequest } from 'next/server';
import { checkIn } from '@/server/check-in';
import { ADMIN_COOKIE } from '@/server/web-auth';
import { errorResponse, json, readJson, sameOrigin } from '@/server/http';

export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    return json(await checkIn(request.cookies.get(ADMIN_COOKIE)?.value, await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
