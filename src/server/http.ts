import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DomainError } from './errors';

export function sameOrigin(request: NextRequest) {
  const expected =
    process.env.APP_ORIGIN ??
    `${request.nextUrl.protocol}//${request.headers.get('host') ?? request.nextUrl.host}`;
  if (
    request.headers.get('origin') !== expected ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new DomainError('درخواست از مبدأ نامعتبر است.', 403);
}

export async function readJson(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError('بدنه درخواست لازم است.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new DomainError('درخواست بیش از اندازه بزرگ است.', 413);
    }
    chunks.push(chunk.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DomainError('قالب درخواست معتبر نیست.');
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

export function errorResponse(error: unknown) {
  if (error instanceof DomainError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: 'اطلاعات درخواست معتبر نیست.' }, 400);
  // Do not log raw exceptions: gateway/DB messages can contain credentials or PII.
  console.error(JSON.stringify({ event: 'HTTP_UNEXPECTED_ERROR', at: new Date().toISOString() }));
  return json({ error: 'ارتباط با سامانه برقرار نشد؛ دوباره تلاش کنید.' }, 500);
}
