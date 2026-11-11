import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';
import { requireSalesEnabled } from '../src/server/deployment';
import { readJson, sameOrigin, errorResponse } from '../src/server/http';
import { GET as health } from '../src/app/api/health/route';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

afterEach(() => vi.unstubAllEnvs());

it('M8 INV-08/10: CSP nonce is fresh, attacker nonce overwritten, script injection and framing blocked', () => {
  vi.stubEnv('NODE_ENV', 'production');
  const request = new NextRequest('https://yoltick.example', {
    headers: { 'x-nonce': 'attacker', 'content-security-policy': "script-src 'unsafe-inline'" },
  });
  const one = middleware(request);
  const two = middleware(request);
  const csp = one.headers.get('content-security-policy')!;
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain('unsafe-eval');
  expect(csp.split(';').find((s) => s.trim().startsWith('script-src'))).not.toContain(
    'unsafe-inline',
  );
  expect(csp).not.toBe(two.headers.get('content-security-policy'));
  expect(one.headers.get('x-middleware-request-x-nonce')).not.toBe('attacker');
  expect(one.headers.get('x-content-type-options')).toBe('nosniff');
  expect(one.headers.get('referrer-policy')).toBe('no-referrer');
  expect(one.headers.get('permissions-policy')).toContain('camera=(self)');
  expect(one.headers.get('cache-control')).toContain('no-store');
});

it('M8: production cannot start with missing/Fake/invented providers or accept sales without G3 flag', () => {
  const config = createRequire(import.meta.url)('../next.config.js');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('REAL_SALES_ENABLED', 'false');
  expect(() => requireSalesEnabled()).toThrow('فروش');
  vi.stubEnv('REAL_SALES_ENABLED', 'true');
  expect(() => requireSalesEnabled()).not.toThrow();
  vi.stubEnv('PAYMENT_GATEWAY', 'fake');
  vi.stubEnv('SMS_PROVIDER', 'fake');
  expect(() => config('phase-production-server')).toThrow('Fake');
  vi.stubEnv('PAYMENT_GATEWAY', '');
  expect(() => config('phase-production-server')).toThrow();
  vi.stubEnv('PAYMENT_GATEWAY', 'invented');
  vi.stubEnv('SMS_PROVIDER', 'invented');
  vi.stubEnv('APP_ORIGIN', 'http://unsafe.example');
  expect(() => config('phase-production-server')).toThrow('HTTPS');
  vi.stubEnv('APP_ORIGIN', 'https://yoltick.example');
  expect(() => config('phase-production-server')).toThrow('not implemented');
});

it('M8 INV-08/10: canonical origin rejects forged Host and streaming body enforces 16KB cap without leaking errors', async () => {
  vi.stubEnv('APP_ORIGIN', 'https://yoltick.example');
  expect(() =>
    sameOrigin(
      new NextRequest('https://yoltick.example/api/orders', {
        headers: { host: 'attacker.example', origin: 'https://attacker.example' },
      }),
    ),
  ).toThrow();
  expect(() =>
    sameOrigin(
      new NextRequest('https://yoltick.example/api/orders', {
        headers: { origin: 'https://yoltick.example' },
      }),
    ),
  ).not.toThrow();
  const request = new NextRequest('https://yoltick.example/api/orders', {
    method: 'POST',
    body: 'x'.repeat(16385),
  });
  await expect(readJson(request)).rejects.toMatchObject({ status: 413 });
  const response = errorResponse(new Error('SECRET_DATABASE_PASSWORD'));
  expect(JSON.stringify(await response.json())).not.toContain('SECRET');
});

it('M8: health endpoint confirms database readiness without infrastructure details', async () => {
  const response = await health();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(response.headers.get('cache-control')).toContain('no-store');
});

it('M8 INV-08: tracked files and production client JS contain no configured long secrets', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  expect(tracked.includes('.env')).toBe(false);
  const secrets = [
    process.env.DATABASE_URL,
    process.env.TEST_DATABASE_URL,
    process.env.SESSION_SECRET,
    process.env.ADMIN_PASSWORD,
    process.env.LOCAL_ADMIN_PASSWORD,
  ].filter((s): s is string => !!s && s.length >= 12);
  for (const value of [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL]) {
    if (value) {
      const password = decodeURIComponent(new URL(value).password);
      if (password.length >= 12) secrets.push(password);
    }
  }
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  const clients = walk('.next/static').filter((p) => p.endsWith('.js'));
  expect(clients.length).toBeGreaterThan(0);
  const leaked = [...tracked, ...clients].some((path) =>
    secrets.some((secret) => readFileSync(path).includes(Buffer.from(secret))),
  );
  expect(leaked).toBe(false);
});
