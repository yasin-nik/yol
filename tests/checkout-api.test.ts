import { randomInt } from 'node:crypto';
import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  POST as otp,
  PUT as login,
  DELETE as logout,
  GET as who,
} from '../src/app/api/customer/route';
import { POST as order } from '../src/app/api/orders/route';
import { POST as payment } from '../src/app/api/payments/route';
import { POST as simulate } from '../src/app/api/payments/fake/route';

function request(
  path: string,
  method: string,
  body: unknown,
  cookie?: string,
  origin = 'http://localhost',
) {
  return new NextRequest('http://localhost' + path, {
    method,
    headers: {
      origin,
      host: 'localhost',
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
it('INV-07 INV-10 checkout mutations reject cross-origin requests and unauthenticated calls', async () => {
  for (const [path, handler] of [
    ['/api/customer', otp],
    ['/api/orders', order],
    ['/api/payments', payment],
    ['/api/payments/fake', simulate],
  ] as const) {
    expect(
      (await handler(request(path, 'POST', {}, undefined, 'https://untrusted.test'))).status,
    ).toBe(403);
  }
  expect(
    (await payment(request('/api/payments', 'POST', { orderId: crypto.randomUUID() }))).status,
  ).toBe(401);
  expect(
    (
      await simulate(
        request('/api/payments/fake', 'POST', { authority: 'a'.repeat(64), outcome: 'SUCCESS' }),
      )
    ).status,
  ).toBe(401);
});
it('INV-07 INV-09 customer API issues an HttpOnly private session and logout invalidates it', async () => {
  const challengeResponse = await otp(
    request('/api/customer', 'POST', { phone: '09' + randomInt(100000000, 1000000000) }),
  );
  const challenge = await challengeResponse.json();
  expect(challengeResponse.headers.get('cache-control')).toContain('no-store');
  const result = await login(
    request('/api/customer', 'PUT', {
      challengeId: challenge.challengeId,
      code: challenge.developmentCode,
    }),
  );
  expect(result.status).toBe(200);
  const cookie = result.headers.get('set-cookie')!;
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=lax');
  const session = cookie.split(';')[0];
  expect(
    (await who(new NextRequest('http://localhost/api/customer', { headers: { cookie: session } })))
      .status,
  ).toBe(200);
  expect((await logout(request('/api/customer', 'DELETE', {}, session))).status).toBe(200);
  expect(
    (await who(new NextRequest('http://localhost/api/customer', { headers: { cookie: session } })))
      .status,
  ).toBe(401);
});
