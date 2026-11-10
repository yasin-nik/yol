import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../next.config.js');
afterEach(() => vi.unstubAllEnvs());

it('INV-08 refuses production startup with a Fake payment or SMS adapter', () => {
  vi.stubEnv('PAYMENT_GATEWAY', 'fake');
  vi.stubEnv('SMS_PROVIDER', 'fake');
  expect(() => config('phase-production-server')).toThrow('cannot start');
  expect(() => config('phase-production-build')).not.toThrow();
  vi.stubEnv('PAYMENT_GATEWAY', 'disabled');
  expect(() => config('phase-production-server')).toThrow('cannot start');
});
