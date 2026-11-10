import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/sessions/[id]/inventory/route';
import { POST, DELETE } from '../src/app/api/sessions/[id]/holds/route';
import { catalogFixture } from './fixtures';
import { sameOrigin } from '../src/server/http';

describe('M3 inventory HTTP boundary', () => {
  it('INV-10 handles Next localhost URL normalization using the actual Host while rejecting cross-site origins', () => {
    const request = (origin: string) =>
      new NextRequest('http://localhost:3100/api/test', {
        headers: { host: '127.0.0.1:3100', origin },
      });
    expect(() => sameOrigin(request('http://127.0.0.1:3100'))).not.toThrow();
    expect(() => sameOrigin(request('https://other.example'))).toThrow('مبدأ');
  });
  it('INV-07/INV-10 enforces origin, validates body, hides owner identity and restores a hold through an HttpOnly cookie', async () => {
    const fixture = await catalogFixture();
    const context = { params: Promise.resolve({ id: fixture.sessionId }) };
    const root = `http://localhost:3100/api/sessions/${fixture.sessionId}`;
    const init = await GET(new NextRequest(`${root}/inventory`), context);
    expect(init.status).toBe(200);
    expect(init.headers.get('cache-control')).toContain('no-store');
    const rawCookie = init.headers.get('set-cookie')!;
    expect(rawCookie).toContain('HttpOnly');
    expect(rawCookie).toContain('SameSite=lax');
    const cookie = rawCookie.split(';')[0];
    const request = (
      body: string,
      origin = 'http://localhost:3100',
      method = 'POST',
      cookieValue = cookie,
    ) =>
      new NextRequest(`${root}/holds`, {
        method,
        headers: { origin, cookie: cookieValue, 'content-type': 'application/json' },
        body,
      });
    const body = JSON.stringify({ seatIds: fixture.seatIds.slice(0, 2) });
    expect((await POST(request(body, 'https://other.example'), context)).status).toBe(403);
    expect((await POST(request('{'), context)).status).toBe(400);
    expect((await POST(request(JSON.stringify({ seatIds: ['not-a-uuid'] })), context)).status).toBe(
      400,
    );
    expect((await POST(request(' '.repeat(16385)), context)).status).toBe(413);
    const created = await POST(request(body), context);
    expect(created.status).toBe(201);
    const hold = (await created.json()).hold;
    const restored = await GET(
      new NextRequest(`${root}/inventory`, { headers: { cookie } }),
      context,
    );
    const data = await restored.json();
    expect(data.hold.id).toBe(hold.id);
    expect(JSON.stringify(data)).not.toContain('owner_hash');
    expect(JSON.stringify(data)).not.toContain('password');
    const stranger = await GET(new NextRequest(`${root}/inventory`), context);
    expect((await stranger.json()).hold).toBeNull();
    expect(
      (await DELETE(request(JSON.stringify({ holdId: hold.id }), undefined, 'DELETE', ''), context))
        .status,
    ).toBe(403);
    expect(
      (await DELETE(request(JSON.stringify({ holdId: hold.id }), undefined, 'DELETE'), context))
        .status,
    ).toBe(200);
    expect(
      (await DELETE(request(JSON.stringify({ holdId: hold.id }), undefined, 'DELETE'), context))
        .status,
    ).toBe(200);
  });
});
